'use strict';

// QQ 农场「青酿换万金 / 青梅」活动后端源码片段。
// 这里只保留活动相关纯逻辑；实际 RPC、账号、日志、调度由主工程接入。

const QINGMEI_ACTIVITY_GROUP_ID = 2026081200;
const QINGMEI_DAILY_SIGNIN_ACTIVITY_ID = 2026081201;
const QINGMEI_DOUBLE_REWARDS_ACTIVITY_ID = 2026081202;
const QINGMEI_SEED_ITEM_ID = 21221;
const QINGMEI_FRUIT_ITEM_ID = 41221;

function toPositiveInt(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : fallback;
}

function selectDoubleRewardsStartItemsFromBagItems(items, options = {}) {
  const fruitId = toPositiveInt(options.fruitItemId, QINGMEI_FRUIT_ITEM_ID);
  const maxStacks = Math.max(1, toPositiveInt(options.maxStacks, 30));
  const result = [];
  for (const raw of Array.isArray(items) ? items : []) {
    const id = toPositiveInt(raw && raw.id);
    const count = toPositiveInt(raw && raw.count);
    const uid = toPositiveInt(raw && raw.uid);
    if (id !== fruitId || count <= 0 || uid <= 0) continue;
    result.push({ id, uid, count });
    if (result.length >= maxStacks) break;
  }
  return result;
}

async function resolveDoubleRewardsStartParams(params = {}, context = {}) {
  const inputItems = Array.isArray(params.items) ? params.items : [];
  const normalized = selectDoubleRewardsStartItemsFromBagItems(inputItems);
  if (normalized.length > 0) return { ...params, items: normalized };

  if (typeof context.getBagItems !== 'function') {
    throw new Error('未传入青梅果实，且缺少背包读取函数');
  }
  const bagItems = await context.getBagItems();
  const selected = selectDoubleRewardsStartItemsFromBagItems(bagItems);
  if (selected.length <= 0) {
    throw new Error('当前未持有青梅果实，无法酿造并出售');
  }
  return { ...params, items: selected };
}

function normalizeDailySigninDisplay(raw = {}) {
  const rewards = Array.isArray(raw.rewards) ? raw.rewards : [];
  const explicitClaimed = raw.claimed_today === true || raw.claimedToday === true;
  const inferredClaimed = rewards.length > 0 && rewards.every(item => item.claimed === true || item.status === 'claimed');
  const claimedToday = explicitClaimed || inferredClaimed;
  const nextReward = rewards.find(item => !(item.claimed === true || item.status === 'claimed')) || null;
  const claimRewardId = claimedToday ? 0 : toPositiveInt(raw.claimRewardId || raw.claim_reward_id || nextReward?.id);
  return {
    claimedToday,
    claimRewardId,
    claimable: !claimedToday && claimRewardId > 0,
    previewItems: rewards.flatMap(item => Array.isArray(item.items) ? item.items : []),
  };
}

function computeDailySigninClaimAvailable(displayData = {}) {
  return !!displayData.claimable && toPositiveInt(displayData.claimRewardId) > 0;
}

function buildDailySigninClaimParams(displayData = {}) {
  const rewardId = toPositiveInt(displayData.claimRewardId);
  if (rewardId <= 0) throw new Error('今日青梅种子已领取或当前不可领取');
  return { rewardId };
}

function shouldAutoClaimDailySignin(child = {}) {
  if (Number(child.groupId || child.group_id || QINGMEI_ACTIVITY_GROUP_ID) !== QINGMEI_ACTIVITY_GROUP_ID) return false;
  if (child.bodyType !== 'daily_signin') return false;
  return computeDailySigninClaimAvailable(child.displayData || {});
}

function isActivitySellOnlyItemId(itemId) {
  return Number(itemId) === QINGMEI_FRUIT_ITEM_ID;
}

function getActivitySellOnlyHint(itemId) {
  if (Number(itemId) === QINGMEI_FRUIT_ITEM_ID) {
    return '青梅是活动专属果实，已跳过普通出售，请到「青酿换万金」里酿造并出售';
  }
  return '活动专属物品已跳过普通出售，请到对应活动里处理';
}

module.exports = {
  QINGMEI_ACTIVITY_GROUP_ID,
  QINGMEI_DAILY_SIGNIN_ACTIVITY_ID,
  QINGMEI_DOUBLE_REWARDS_ACTIVITY_ID,
  QINGMEI_SEED_ITEM_ID,
  QINGMEI_FRUIT_ITEM_ID,
  selectDoubleRewardsStartItemsFromBagItems,
  resolveDoubleRewardsStartParams,
  normalizeDailySigninDisplay,
  computeDailySigninClaimAvailable,
  buildDailySigninClaimParams,
  shouldAutoClaimDailySignin,
  isActivitySellOnlyItemId,
  getActivitySellOnlyHint,
};

