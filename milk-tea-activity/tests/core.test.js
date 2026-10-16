'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { IDS, ACTIONS, buildRequest } = require('../src/protocol');
const { encode, decode } = require('../src/codec');
const { createClient } = require('../src/client');
const { createMilkTeaReader, validateMilkTeaMaterials } = require('../src/runtime');
const ui = require('../public/activity-ui');
const rules = require('../config/rules.json');
const catalog = require('../config/catalog.json');
const flags = { confirm: true, confirmSpend: true };
const call = (client, action, params = {}) => client.operate({ groupId: IDS.group, activityId: ACTIONS[action].id, action, params, ...flags });

test('happy requests have id and cmd only, responses have distinct oneof fields', () => {
  for (const action of ['happy_share.daily_claim', 'happy_share.prepare_share', 'happy_share.claim_rewards']) {
    const request = buildRequest(action, {}, flags);
    assert.deepEqual(Object.keys(request), ['id', 'cmd']);
    const wire = encode('OperateRequest', request);
    assert.equal(wire.length, 8);
    assert.equal(Number(decode('OperateRequest', wire).cmd), request.cmd);
  }
  const reply = decode('OperateReply', encode('OperateReply', { id: IDS.happy, cmd: 74, happy_share_daily: { happy_value_added: 5 } }));
  assert.equal(Number(reply.happy_share_daily.happy_value_added), 5);
});
test('hire protobuf field layout and bag-stack UID validation', () => {
  const request = buildRequest('milk_tea.hire', { friendGid: 700101, durationId: 2 }, flags);
  assert.deepEqual(request.milk_tea_hire.selection, { candidate_type: 0, duration_id: 2, friend_gid: 700101 });
  const wire = encode('OperateRequest', request);
  assert.ok(wire.includes(Buffer.from([0x92, 0x0a])));
  assert.equal(Number(decode('OperateRequest', wire).milk_tea_hire.selection.friend_gid), 700101);
  const bag = { items: [{ id: 40525, category: 'fruit' }], originalItems: [{ id: 40525, uid: 800001, count: 12 }] };
  assert.equal(validateMilkTeaMaterials(bag, [800001], rules).length, 1);
  assert.throws(() => validateMilkTeaMaterials(bag, [40525], rules));
  assert.throws(() => validateMilkTeaMaterials(bag, [800001, 800001], rules));
});
test('read deduplication, shift isolation and scoped fallback', async () => {
  let owner = 'demo-a', calls = 0, fail = false;
  const reader = createMilkTeaReader(async payload => {
    calls++; await new Promise(resolve => setTimeout(resolve, 5));
    if (fail) throw new Error('read failed');
    return { milk_tea_hire_list: { shift_index: payload.milk_tea_hire_list.duration_id, friends: [] } };
  }, { scope: () => owner });
  await Promise.all([reader.read('hireList'), reader.read('hireList')]);
  assert.equal(calls, 1);
  fail = true;
  assert.equal((await reader.read('hireList')).state.status, 'stale');
  assert.equal((await reader.read('hireList', { durationId: 2 })).data, null);
  owner = 'demo-b';
  assert.equal((await reader.read('hireList')).data, null);
});

test('actions require confirmation and share receipts strip native material',()=>{
  assert.throws(()=>buildRequest('milk_tea.upgrade',{},flags));
  assert.throws(()=>buildRequest('milk_tea.claim'));
  assert.throws(()=>buildRequest('milk_tea.hire',{friendGid:700101},{confirm:true}));
  const {buildHappyShareReceipt}=require('../src/runtime');
  const receipt=buildHappyShareReceipt({happy_share_prepare:{share_data:Buffer.from('synthetic-only'),happy_value_added:5}},'happy_share.prepare_share');
  assert.equal(receipt.verified,true);assert.equal('share_data' in receipt,false);assert.equal(JSON.stringify(receipt).includes('synthetic-only'),false);
});
