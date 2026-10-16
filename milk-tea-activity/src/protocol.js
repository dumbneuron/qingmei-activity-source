'use strict';

const { READ_SECTIONS, normalizeMilkTeaHireParams } = require('./runtime');
const IDS = Object.freeze({ group: 2026110100, main: 2026110101, shop: 2026110102, happy: 2026110104 });
const ACTIONS = Object.freeze({
  ...Object.fromEntries(Object.entries(READ_SECTIONS).map(([section, spec]) => [spec.action,
    { id: IDS.main, cmd: spec.cmd, field: spec.field, section, mutating: false, spend: false }])),
  'milk_tea.claim': { id: IDS.main, cmd: 59, field: 'milk_tea_claim', mutating: true, spend: false },
  'milk_tea.make': { id: IDS.main, cmd: 62, field: 'milk_tea_make', mutating: true, spend: true },
  'milk_tea.hire': { id: IDS.main, cmd: 57, field: 'milk_tea_hire', mutating: true, spend: true },
  'shop.buy': { id: IDS.shop, cmd: 1, field: 'shop_buy', mutating: true, spend: true },
  'happy_share.daily_claim': { id: IDS.happy, cmd: 74, mutating: true, spend: false },
  'happy_share.prepare_share': { id: IDS.happy, cmd: 70, mutating: true, spend: false },
  'happy_share.claim_rewards': { id: IDS.happy, cmd: 71, mutating: true, spend: false },
});
function positive(value, name) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`${name} must be a positive safe integer`);
  return n;
}
function buildRequest(action, params = {}, flags = {}) {
  const spec = ACTIONS[action];
  if (!spec) throw new Error('Unknown or unverified activity action');
  if (spec.mutating && flags.confirm !== true) throw new Error('Explicit confirmation required');
  if (spec.spend && flags.confirmSpend !== true) throw new Error('Resource spending confirmation required');
  let body = {};
  if (action === 'milk_tea.hire') body.selection = normalizeMilkTeaHireParams(params);
  if (action === 'milk_tea.hire_list') {
    const duration = positive(params.durationId ?? 1, 'durationId');
    if (duration > 3) throw new Error('Invalid shift');
    body.duration_id = duration;
  }
  if (action === 'milk_tea.make') {
    if (!Array.isArray(params.itemUids) || !params.itemUids.length || params.itemUids.length > 200) throw new Error('Choose 1-200 bag stack UIDs');
    body.item_uids = params.itemUids.map(value => positive(value, 'item UID'));
    if (new Set(body.item_uids).size !== body.item_uids.length) throw new Error('Duplicate bag stack UID');
  }
  if (action === 'shop.buy') body = { goods_id: positive(params.goodsId, 'goodsId'), count: positive(params.count ?? 1, 'count') };
  return { id: spec.id, cmd: spec.cmd, ...(spec.field ? { [spec.field]: body } : {}) };
}
module.exports = { IDS, ACTIONS, buildRequest };
