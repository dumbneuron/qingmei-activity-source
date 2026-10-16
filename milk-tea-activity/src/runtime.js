'use strict';

const READ_SECTIONS = Object.freeze({
  shopView: { action: 'milk_tea.shop_view', cmd: 55, field: 'milk_tea_shop_view', camel: 'milkTeaShopView', property: 'view', label: '店铺状态' },
  recipes: { action: 'milk_tea.recipes', cmd: 58, field: 'milk_tea_recipes', camel: 'milkTeaRecipes', property: 'recipes', label: '奶茶配方' },
  hireList: { action: 'milk_tea.hire_list', cmd: 56, field: 'milk_tea_hire_list', camel: 'milkTeaHireList', label: '雇佣好友' },
  ranking: { action: 'milk_tea.ranking', cmd: 66, field: 'milk_tea_ranking', camel: 'milkTeaRanking', label: '排行榜' },
  revenueRecord: { action: 'milk_tea.revenue_record', cmd: 67, field: 'milk_tea_revenue_record', camel: 'milkTeaRevenueRecord', label: '营业记录' },
});
const clone = value => JSON.parse(JSON.stringify(value));
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;

function hireDuration(params = {}) {
  const id = Number(params.durationId ?? params.duration_id ?? 1);
  if (!Number.isSafeInteger(id) || ![1, 2, 3].includes(id)) throw new Error('请选择有效雇佣时长');
  return id;
}

function normalizeMilkTeaHireParams(params = {}) {
  const durationId = hireDuration(params);
  const friendGid = Number(params.friendGid ?? params.friend_gid);
  if (!Number.isSafeInteger(friendGid) || friendGid <= 0) throw new Error('请选择一位有效好友');
  if (params.candidateType != null && Number(params.candidateType) !== 0) throw new Error('当前仅接入普通好友雇佣');
  if (params.friendGids != null || params.selections != null) throw new Error('每次提交仅雇佣一位好友');
  return { candidate_type: 0, duration_id: durationId, friend_gid: friendGid };
}

function createMilkTeaReader(send, options = {}) {
  const cache = new Map();
  const pending = new Map();
  const revisions = new Map();
  const now = options.now || Date.now;
  const scope = options.scope || (() => '');
  const ttl = options.ttlMs ?? 300000;
  const retryable = error => /timeout|timed out|超时|ECONNRESET|EPIPE|temporarily/i.test(String(error?.message || error));
  const invalidate = () => {
    const owner = String(scope() || '');
    revisions.set(owner, (revisions.get(owner) || 0) + 1);
    const prefix = owner + ':';
    for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
    for (const key of pending.keys()) if (key.startsWith(prefix)) pending.delete(key);
  };
  async function read(section, params = {}) {
    const spec = READ_SECTIONS[section];
    if (!spec) throw new Error('未知奶茶读取分区');
    const owner = String(scope() || '');
    const request = section === 'hireList' ? { duration_id: hireDuration(params) } : {};
    const key = `${owner}:${section}:${section === 'hireList' ? request.duration_id : ''}`;
    const revision = revisions.get(owner) || 0;
    if (owner && pending.has(key)) return clone(await pending.get(key));
    const run = async () => {
      let failure;
      let attempts = 0;
      for (; attempts < 2;) {
        attempts += 1;
        try {
          const reply = await send({ id: 2026110101, cmd: spec.cmd, [spec.field]: request }, params, spec.action);
          const body = reply?.[spec.field] ?? reply?.[spec.camel];
          if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(`${spec.label}回包缺少 ${spec.field}`);
          let data = spec.property ? body[spec.property] : body;
          if (section === 'recipes') data = Array.isArray(data) ? data : [];
          else if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${spec.label}回包缺少有效数据`);
          if ((revisions.get(owner) || 0) !== revision) return { section, data: null,
            state: { status: 'error', stale: true, fetchedAt: null, attempts, error: '活动状态已变化，请重新读取' } };
          const state = { status: 'fresh', stale: false, fetchedAt: new Date(now()).toISOString(), attempts, error: '',
            ...(section === 'hireList' ? { durationId: request.duration_id } : {}) };
          const result = { section, data: clone(data), state };
          if (owner) {
            cache.delete(key);
            cache.set(key, result);
            while (cache.size > 250) cache.delete(cache.keys().next().value);
          }
          return clone(result);
        } catch (error) {
          failure = error;
          if (attempts >= 2 || !retryable(error)) break;
        }
      }
      const previous = owner ? cache.get(key) : null;
      const usable = previous && now() - Date.parse(previous.state.fetchedAt) <= ttl;
      return {
        section,
        data: usable ? clone(previous.data) : null,
        state: { status: usable ? 'stale' : 'error', stale: true,
          fetchedAt: usable ? previous.state.fetchedAt : null, attempts,
          ...(section === 'hireList' ? { durationId: request.duration_id } : {}),
          error: String(failure?.message || '活动数据读取失败') },
      };
    };
    const promise = run();
    if (owner) pending.set(key, promise);
    try { return await promise; } finally { if (pending.get(key) === promise) pending.delete(key); }
  }
  return { read, invalidate };
}

function buildMilkTeaHireReceipt(reply, selection) {
  const result = (reply?.milk_tea_hire ?? reply?.milkTeaHire)?.result;
  const employee = result?.employee;
  const verified = Number(result?.status) === 1
    && Number(result.friend_gid) === selection.friend_gid
    && Number(result.duration_id) === selection.duration_id
    && Number(employee?.user?.gid) === selection.friend_gid
    && Number(employee.end_at) > Number(employee.start_at);
  return {
    verified, hiredFriendGid: selection.friend_gid, durationId: selection.duration_id,
    resultStatus: result?.status ?? null, employee: employee || null,
    message: verified
      ? `好友雇佣成功：${employee.user.nickname || selection.friend_gid}；实际消耗奶茶券 ×${number(employee.cost)}；任期 ${Math.round((number(employee.end_at) - number(employee.start_at)) / 3600)} 小时`
      : '雇佣请求已返回，但未确认成功任期；请刷新店铺核对，勿重复提交',
  };
}

const HAPPY_REPLIES = Object.freeze({
  'happy_share.daily_claim': ['happy_share_daily', 74],
  'happy_share.prepare_share': ['happy_share_prepare', 70],
  'happy_share.claim_rewards': ['happy_share_claim', 71],
});

function buildHappyShareReceipt(reply, action, resolveItem = () => ({})) {
  const spec = HAPPY_REPLIES[action];
  if (!spec) throw new Error('未知快乐操作');
  const body = reply?.[spec[0]];
  if (!body || typeof body !== 'object') throw new Error('快乐操作回包缺少已核实字段，请刷新核对');
  const pointsAdded = number(body.happy_value_added);
  const rewards = (body.awards || []).map(item => ({ itemId: number(item.id), count: number(item.count),
    name: resolveItem(number(item.id))?.name || `物品 ${item.id}` })).filter(item => item.itemId > 0 && item.count > 0);
  const claimedStepIds = (body.claimed_step_ids || []).map(Number).filter(id => Number.isSafeInteger(id) && id > 0);
  const verified = action === 'happy_share.claim_rewards' ? rewards.length > 0 && claimedStepIds.length > 0
    : action === 'happy_share.prepare_share' ? (body.share_data?.length || 0) > 0 : pointsAdded > 0;
  const message = action === 'happy_share.claim_rewards'
    ? rewards.length ? `快乐档位奖励：${rewards.map(item => `${item.name} ×${item.count}`).join('、')}` : '本次回包未列出档位奖励，请刷新核对'
    : action === 'happy_share.prepare_share'
      ? `快乐包生成请求已返回；本次新增快乐值 ${pointsAdded}。向好友分享仍需在官方游戏完成。`
      : pointsAdded > 0 ? `今日快乐领取成功：快乐值 +${pointsAdded}` : '本次未新增快乐值，可能已领取，请刷新核对';
  return { verified, pointsAdded, rewards, claimedStepIds, message };
}

function createHappyShareExecutor({ send, scope, resolveItem, now = Date.now }) {
  const pending = new Set(), uncertainUntil = new Map();
  return async (payload, action) => {
    const owner = String(scope() || ''), spec = HAPPY_REPLIES[action];
    if (!owner || !spec || payload.id !== 2026110104 || payload.cmd !== spec[1]) throw new Error('快乐操作账号或协议范围错误');
    if (pending.has(owner)) throw new Error('已有快乐操作处理中，请稍候');
    if ((uncertainUntil.get(owner) || 0) > now()) throw new Error('上次快乐操作结果待核对，请先刷新，30 秒后再操作');
    pending.add(owner);
    try { return buildHappyShareReceipt(await send(payload, {}, action), action, resolveItem); }
    catch (error) { uncertainUntil.set(owner, now() + 30000); throw error; }
    finally { pending.delete(owner); }
  };
}

function createMilkTeaHireExecutor({ reader, send, getBag, scope, rules, now = Date.now }) {
  const pending = new Set(), uncertainUntil = new Map();
  return async function execute(params) {
    const owner = String(scope() || '');
    if (!owner) throw new Error('账号身份尚未就绪');
    if (pending.has(owner)) throw new Error('已有雇佣操作处理中，请稍候');
    if ((uncertainUntil.get(owner) || 0) > now()) throw new Error('上次雇佣结果尚待核对，请先刷新店铺，30 秒后再操作');
    const selection = normalizeMilkTeaHireParams(params);
    pending.add(owner);
    let sent = false;
    try {
      const [shop, list] = await Promise.all([
        reader.read('shopView'), reader.read('hireList', { durationId: selection.duration_id }),
      ]);
      if (String(scope() || '') !== owner) throw new Error('账号已切换，本次未提交');
      if (shop.state.status !== 'fresh' || list.state.status !== 'fresh') throw new Error('店铺或好友名单读取失败，本次未雇佣');
      const shift = rules.shifts.find(s => s.id === selection.duration_id);
      const quotedCost = Number(list.data.shift_cost);
      const configuredCost = Number(shift?.cost?.find(item => item.id === 1041)?.count);
      if (Number(list.data.shift_index) !== selection.duration_id || quotedCost !== configuredCost
        || !Number.isSafeInteger(quotedCost) || quotedCost <= 0 || Number(params.expectedCost) !== quotedCost)
        throw new Error('雇佣费用或时长已变化，请重新读取并确认');
      const friend = (list.data.friends || []).find(f => Number(f.user?.gid) === selection.friend_gid);
      if (!friend || Number(friend.candidate_type || 0) !== 0) throw new Error('该好友已不在可雇佣名单中');
      const active = (shop.data.employees || []).filter(e => Number(e.end_at) * 1000 > now());
      const capacity = Number(rules.levels.find(l => l.level === Number(shop.data.level))?.employeeSlots);
      if (!capacity || active.length >= capacity) throw new Error('当前店铺没有空闲员工席位');
      if (active.some(e => Number(e.user?.gid) === selection.friend_gid)) throw new Error('该好友正在店铺任职');
      const bag = await getBag();
      const balance = (bag.items || []).filter(i => Number(i.id) === 1041).reduce((sum, i) => sum + number(i.count), 0);
      if (balance < quotedCost) throw new Error('奶茶券不足，本次未雇佣');
      if (String(scope() || '') !== owner) throw new Error('账号已切换，本次未提交');
      sent = true;
      const reply = await send({ id: 2026110101, cmd: 57, milk_tea_hire: { selection } }, params, 'milk_tea.hire');
      reader.invalidate();
      const receipt = buildMilkTeaHireReceipt(reply, selection);
      if (!receipt.verified) uncertainUntil.set(owner, now() + 30000);
      return { ...reply, ...receipt };
    } catch (error) {
      if (sent) {
        reader.invalidate(); uncertainUntil.set(owner, now() + 30000);
        error.message = `雇佣已提交，结果待核对；请先刷新店铺，勿立即重试。${error.message}`;
      }
      throw error;
    } finally { pending.delete(owner); }
  };
}

function validateMilkTeaMaterials(bag, selected, rules, recipes = null) {
  if (!Array.isArray(selected) || !selected.length || selected.length > 200
    || selected.some(uid => !Number.isSafeInteger(Number(uid)) || Number(uid) <= 0)
    || new Set(selected.map(Number)).size !== selected.length) throw new Error('请选择 1 至 200 组有效果实批次');
  const supported = new Map(rules.recipes.filter(recipe => recipe.fruitItemId > 0).map(recipe => [recipe.fruitItemId, recipe.id]));
  const fruitIds = new Set((bag.items || []).filter(item => item.category === 'fruit' && supported.has(Number(item.id))).map(item => Number(item.id)));
  const stacks = new Map((bag.originalItems || []).filter(item => fruitIds.has(Number(item.id)) && !item.locked && number(item.count) > 0).map(item => [Number(item.uid), item]));
  const unlocked = Array.isArray(recipes) ? new Set(recipes.filter(recipe => recipe.unlocked === true).map(recipe => Number(recipe.recipe_id ?? recipe.recipeId))) : null;
  return selected.map(uid => {
    const stack = stacks.get(Number(uid));
    if (!stack) throw new Error('所选果实批次已变化或不属于可制作果实，请重新读取背包');
    if (unlocked && !unlocked.has(supported.get(Number(stack.id)))) throw new Error('所选果实对应的奶茶配方尚未解锁，请重新选择材料');
    return { uid: Number(uid), itemId: Number(stack.id), count: number(stack.count) };
  });
}

function buildMilkTeaMakeReceipt(result, rules, resolveItem = () => ({})) {
  const reply = result?.milk_tea_make ?? result?.milkTeaMake ?? {};
  const cupList = cups => (cups || []).map(cup => {
    const recipeId = number(cup.recipe_id ?? cup.recipeId);
    const recipe = rules.recipes.find(row => row.id === recipeId);
    return { recipeId, name: recipe?.name || `配方 ${recipeId}`, count: number(cup.count),
      image: recipe ? `/official-assets/s4/icon_s4_milktea_${recipeId}.png` : '' };
  }).filter(cup => cup.count > 0);
  const madeCups = cupList(reply.made_cups ?? reply.madeCups);
  const listedCups = cupList(reply.listed_cups ?? reply.listedCups);
  const usedFruits = (reply.used_fruits ?? reply.usedFruits ?? []).map(item => {
    const id = number(item.id), info = resolveItem(id) || {};
    return { itemId: id, name: info.name || `果实 ${id}`, count: number(item.count), image: info.image || '' };
  }).filter(item => item.itemId > 0 && item.count > 0);
  const madeCount = madeCups.reduce((sum, cup) => sum + cup.count, 0);
  const listedCount = listedCups.reduce((sum, cup) => sum + cup.count, 0);
  const message = madeCount > 0
    ? `奶茶制作成功：${madeCups.map(cup => `${cup.name} ×${cup.count} 杯`).join('、')}；已上架 ${listedCount} 杯${usedFruits.length ? '；消耗：' + usedFruits.map(item => `${item.name} ×${item.count}`).join('、') : '；回包未列出材料消耗明细'}`
    : '制作请求已返回，但本次回包未列出制作明细，请刷新配方库存核对';
  return { madeCups, listedCups, usedFruits, madeCount, listedCount, verified: madeCount > 0, message };
}

module.exports = { READ_SECTIONS, createMilkTeaReader, validateMilkTeaMaterials, buildMilkTeaMakeReceipt,
  hireDuration, normalizeMilkTeaHireParams, buildMilkTeaHireReceipt, createMilkTeaHireExecutor,
  HAPPY_REPLIES, buildHappyShareReceipt, createHappyShareExecutor };

