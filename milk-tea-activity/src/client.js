'use strict';
const rules = require('../config/rules.json');
const catalog = require('../config/catalog.json');
const { IDS, ACTIONS, buildRequest } = require('./protocol');
const { createMilkTeaReader, createMilkTeaHireExecutor, createHappyShareExecutor,
  validateMilkTeaMaterials, buildMilkTeaMakeReceipt } = require('./runtime');

function createClient(adapter, options = {}) {
  for (const key of ['operate', 'readGroup', 'readBag']) if (typeof adapter[key] !== 'function') throw new Error(`Adapter needs ${key}`);
  const scope = options.scope || (() => 'offline-demo');
  const resolveItem = id => catalog.items[id] || {};
  const send = async (payload, params, action) => {
    const reply = await adapter.operate(payload, params, action);
    if (Number(reply?.id) !== payload.id || Number(reply?.cmd) !== payload.cmd) throw new Error('Activity reply scope mismatch');
    return reply;
  };
  const reader = createMilkTeaReader(send, { scope });
  const hire = createMilkTeaHireExecutor({ reader, send, getBag: () => adapter.readBag(), scope, rules });
  const happy = createHappyShareExecutor({ send, scope, resolveItem });
  let pendingMutation = false;
  return {
    readGroup: () => adapter.readGroup(IDS.group),
    readBag: () => adapter.readBag(),
    async operate(input) {
      if (Number(input.groupId) !== IDS.group) throw new Error('Activity group mismatch');
      const spec = ACTIONS[input.action];
      if (!spec || Number(input.activityId) !== spec.id) throw new Error('Activity action scope mismatch');
      const params = input.params || {};
      const payload = buildRequest(input.action, params, input);
      if (!spec.mutating) return reader.read(spec.section, params);
      if (pendingMutation) throw new Error('An activity mutation is already pending');
      pendingMutation = true;
      try {
        if (input.action === 'milk_tea.hire') {
          const result = await hire(params);
          return { verified: result.verified, employee: result.employee, message: result.message };
        }
        if (spec.id === IDS.happy) return await happy(payload, input.action);
        if (input.action === 'milk_tea.make') {
          const [bag, recipes] = await Promise.all([adapter.readBag(), reader.read('recipes')]);
          if (recipes.state.status !== 'fresh') throw new Error('Fresh recipes required');
          validateMilkTeaMaterials(bag, params.itemUids, rules, recipes.data);
        }
        const result = await send(payload, params, input.action);
        if (input.action === 'milk_tea.make') return buildMilkTeaMakeReceipt(result, rules, resolveItem);
        const body = result[spec.field];
        if (!body) throw new Error('Missing activity receipt');
        return { verified: true, awards: body.awards || [], costs: body.costs || [], message: '操作已返回，请核对最新活动状态' };
      } finally { pendingMutation = false; reader.invalidate(); }
    },
  };
}
module.exports = { createClient };
