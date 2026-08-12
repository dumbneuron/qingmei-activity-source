'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const qingmei = require('../backend/qingmei-activity-service');

test('酿造并出售会自动从背包选择普通青梅堆叠', () => {
  const selected = qingmei.selectDoubleRewardsStartItemsFromBagItems([
    { id: 1001, uid: 1, count: 99 },
    { id: 41221, uid: 11, count: 323 },
    { id: 41221, uid: 12, count: 8 },
  ]);
  assert.deepEqual(selected, [
    { id: 41221, uid: 11, count: 323 },
    { id: 41221, uid: 12, count: 8 },
  ]);
});

test('今日已领取后每日领取按钮置灰', () => {
  const display = qingmei.normalizeDailySigninDisplay({ claimed_today: true, rewards: [{ id: 7, items: [{ id: 21221, count: 24 }] }] });
  assert.equal(display.claimedToday, true);
  assert.equal(display.claimRewardId, 0);
  assert.equal(qingmei.computeDailySigninClaimAvailable(display), false);
});

test('普通青梅跳过仓库普通出售', () => {
  assert.equal(qingmei.isActivitySellOnlyItemId(41221), true);
  assert.match(qingmei.getActivitySellOnlyHint(41221), /青酿换万金/);
});
