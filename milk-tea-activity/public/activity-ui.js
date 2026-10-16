(function (root, factory) {
  const ui = factory();
  if (typeof module === 'object' && module.exports) module.exports = ui;
  else root.MilkTeaUI = ui;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const base = '/official-assets/s4/';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const money = value => num(value).toLocaleString('zh-CN');
  const shifts = [{ id: 1, hours: 4, cost: 40 }, { id: 2, hours: 12, cost: 130 }, { id: 3, hours: 24, cost: 270 }];
  const shiftOptions = catalog => catalog.rules?.shifts?.length ? catalog.rules.shifts.map(row => ({
    id: row.id, hours: row.hours, cost: num(row.cost?.find(item => Number(item.id) === 1041)?.count),
  })) : shifts;
  const allowedFruitIds = catalog => (catalog?.rules?.recipes || []).map(recipe => Number(recipe.fruitItemId)).filter(id => id > 0);
  const filters = ['全部', '金牌销售', '金牌宣传', '金牌服务'];
  const sections = Object.freeze({ shopView: ['milk_tea.shop_view', 'view', '店铺状态'],
    recipes: ['milk_tea.recipes', 'recipes', '奶茶配方'], hireList: ['milk_tea.hire_list', 'hireList', '雇佣好友'],
    ranking: ['milk_tea.ranking', 'ranking', '排行榜'], revenueRecord: ['milk_tea.revenue_record', 'revenueRecord', '营业记录'] });
  const dialogSections = { hire: 'hireList', records: 'revenueRecord', ranking: 'ranking', upgrade: 'shopView' };
  const safeImage = value => {
    const url = String(value || '');
    if (/^\/(?!\/)/.test(url)) return url;
    if (/^https?:\/\//i.test(url)) return url.replace(/^http:\/\/(.*(?:qlogo|qpic)\.[^/]+)/i, 'https://$1');
    return '';
  };
  const img = (src, alt = '', cls = '') => safeImage(src)
    ? `<img src="${esc(safeImage(src))}" alt="${esc(alt)}" class="${cls}" decoding="async">` : '';
  const art = (name, alt = '', cls = '') => img(base + name + '.png', alt, cls);
  const itemImage = (id, catalog) => catalog.items?.[Number(id)]?.image || '';
  const itemName = (item, catalog) => item.name || item.itemName || catalog.items?.[Number(item.itemId ?? item.id)]?.name || `物品 ${item.itemId ?? item.id}`;

  function applySectionResult(main, result) {
    const spec = sections[result?.section];
    if (!spec || !result.state || !['fresh', 'stale', 'error'].includes(result.state.status)) throw new Error('活动读取回包结构异常');
    if (result.data !== null && result.data !== undefined) {
      if (result.section === 'recipes' ? !Array.isArray(result.data) : typeof result.data !== 'object' || Array.isArray(result.data)) throw new Error('活动读取数据结构异常');
    }
    const data = main.displayData || (main.displayData = {});
    data.readState = { ...(data.readState || {}), [result.section]: result.state };
    if (result.data !== null && result.data !== undefined) data[spec[1]] = result.data;
    if (result.section === 'shopView') {
      if (result.data) {
        data.level = num(result.data.level ?? data.level);
        data.totalRevenue = num(result.data.total_revenue ?? data.totalRevenue);
        data.pendingRewards = result.data.pending_rewards || [];
        data.pendingTokenCount = data.pendingRewards.filter(item => Number(item.id) === 1041).reduce((sum, item) => sum + num(item.count), 0);
      }
      for (const cap of main.capabilities || []) for (const action of cap.actions || []) {
        if (action.key === 'milk_tea.claim') action.available = result.state.status === 'fresh' && (data.pendingRewards || []).some(item => num(item.count) > 0);
        if (action.key === 'milk_tea.hire') action.available = result.state.status === 'fresh' && num(data.view?.level) > 0;
      }
    }
  }

  function createSectionRefresher(options) {
    const running = new WeakMap();
    const render = () => options.document ? renderPreservingView(options.document, options.render) : options.render();
    return async function refreshSection(section, quiet = false) {
      const spec = sections[section];
      if (!spec) throw new Error('未知奶茶读取分区');
      const group = options.state.group;
      const owner = String(options.accountId());
      const durationId = section === 'hireList' ? (shifts.find(s => s.hours === getState(options.state, owner).shift) || shifts[0]).id : null;
      const main = group?.children?.find(child => Number(child.id) === 2026110101);
      if (!main || Number(group.id) !== 2026110100) return { ok: false, ignored: true };
      let jobs = running.get(group);
      if (!jobs) running.set(group, jobs = new Map());
      const key = `${owner}:${section}:${durationId || ''}`;
      if (jobs.has(key)) return jobs.get(key);
      main.displayData = main.displayData || {};
      const previous = main.displayData.readState?.[section] || {};
      main.displayData.readState = { ...(main.displayData.readState || {}), [section]: { ...previous, status: 'loading', error: '' } };
      render();
      const active = () => options.state.group === group && String(options.accountId()) === owner
        && (section !== 'hireList' || (shifts.find(s => s.hours === getState(options.state, owner).shift) || shifts[0]).id === durationId);
      const job = (async () => {
        await Promise.resolve();
        try {
          const response = await options.api('/api/activity/operate', { method: 'POST', body: JSON.stringify({
            groupId: 2026110100, activityId: 2026110101, action: spec[0], params: durationId ? { durationId } : {}, confirmAction: false, confirmSpend: false,
          }) });
          if (!active()) return { ok: false, ignored: true };
          if (response.result?.section !== section) throw new Error('活动读取回包分区不匹配');
          applySectionResult(main, response.result);
          const fresh = response.result.state.status === 'fresh';
          if (!quiet) options.setStatus(fresh ? `${spec[2]}已更新` : `${spec[2]}读取失败：${response.result.state.error || '请稍后重试'}`, fresh ? 'ok' : 'error');
          return { ok: fresh, result: response.result };
        } catch (error) {
          if (!active()) return { ok: false, ignored: true };
          applySectionResult(main, { section, data: null, state: { ...previous, status: 'error', stale: true, error: String(error.message || error) } });
          if (!quiet) options.setStatus(`${spec[2]}读取失败：${error.message || error}`, 'error');
          return { ok: false, error: String(error.message || error) };
        } finally { jobs.delete(key); if (active()) render(); }
      })();
      jobs.set(key, job);
      return job;
    };
  }

  function readStatus(data, section) {
    const state = data.readState?.[section];
    if (!state) return '';
    if (state.status === 'loading') return '<p class="mt-read-state" role="status">正在读取官方数据…</p>';
    if (state.status === 'error' || state.status === 'stale') return `<p class="mt-read-state is-error" role="status">${state.status === 'stale' ? '显示上次成功的数据；' : ''}本次读取失败：${esc(state.error || '请稍后重试')}</p>`;
    return '<p class="mt-read-state">已读取官方数据</p>';
  }

  function getState(state, account = '') {
    if (!state.milkTeaUi || state.milkTeaUi.account !== String(account)) {
      if (state.milkTeaUi && state.milkTeaUi.account !== String(account)) {
        state.milkTeaFruits = [];
        state.milkTeaSelectedUids = [];
        state.milkTeaBagLoaded = false;
        state.milkTeaLastReceipt = null;
        state.milkTeaLastHireReceipt = null;
      }
      state.milkTeaUi = { account: String(account), page: 'shop', category: 'all', dialog: '', shift: 4, filter: '全部', selected: [] };
    }
    return state.milkTeaUi;
  }

  function goodsFor(shop, category, catalog) {
    return (shop.displayData?.goods || []).map(good => {
      const known = catalog.goods?.[Number(good.id)] || {};
      return { ...good, image: known.image || good.image || '', category: known.category || good.category || 'other' };
    }).filter(good => category === 'all' || good.category === category);
  }

  function reward(item, catalog) {
    const id = Number(item.itemId ?? item.id);
    return `<span class="mt-reward">${img(itemImage(id, catalog) || item.image)}<span>${esc(itemName(item, catalog))}<b>×${money(item.count)}</b></span></span>`;
  }

  function shopGoods(shop, ui, catalog) {
    const all = goodsFor(shop, 'all', catalog);
    const visible = goodsFor(shop, ui.category, catalog);
    const tabs = [['all', '全部'], ['seed', '种子'], ['decor', '装扮']];
    return `<section class="mt-exchange mt-paper" aria-label="兑换商店">
      <div class="mt-section-heading"><div><span class="mt-eyebrow">EXCHANGE STORE</span><h3>兑换商店</h3></div><span>${all.length} 件官方商品</span></div>
      <div class="mt-category-tabs" role="tablist" aria-label="商品类别">${tabs.map(([key, title]) => `<button type="button" role="tab" aria-selected="${ui.category === key}" aria-controls="mt-goods" data-mt-category="${key}" class="${ui.category === key ? 'is-active' : ''}">${title}<small>${goodsFor(shop, key, catalog).length}</small></button>`).join('')}</div>
      <div class="mt-goods" id="mt-goods" role="tabpanel">${visible.length ? visible.map(good => {
        const required = num(good.requiredShopLevel ?? good.unlockLevel);
        const locked = good.locked === true;
        const soldOut = num(good.limitCount) > 0 && num(good.remainingCount) <= 0;
        const enabled = good.purchasable !== false && !locked && !soldOut;
        const free = num(good.price) <= 0;
        const limit = num(good.limitCount) > 0 ? `${({ 1: '每日', 2: '每日', 3: '每周', 4: '活动' })[good.restrictionType] || '活动'}限购 ${money(good.purchasedCount)}/${money(good.limitCount)}` : '不限购';
        const currency = itemImage(good.currencyId, catalog) || good.currencyImage;
        return `<article class="mt-good ${good.category} ${locked ? 'is-locked' : ''}" data-mt-good="${esc(good.id)}">
          <div class="mt-good-image">${img(good.image, good.name || good.itemName)}${locked ? `<span class="mt-lock">店铺 ${required || '指定'} 级解锁</span>` : ''}</div>
          <div class="mt-good-info"><h4>${esc(good.name || good.itemName)}</h4><p>${limit}</p>${(good.awards || []).length > 1 ? `<small>包含 ${(good.awards || []).length} 件装扮</small>` : ''}</div>
          <button type="button" class="mt-price" data-action="shop.buy" data-activity-id="${esc(shop.id)}" data-mutating="1" data-spend="${free ? 0 : 1}" data-goods-id="${esc(good.id)}" data-count="1" data-label="${esc('兑换 ' + (good.name || good.itemName))}" ${enabled ? '' : 'disabled'}>
          ${img(currency)}<b>${free ? '免费领取' : money(good.price)}</b><span>${soldOut ? '已售罄' : locked ? '待解锁' : esc(good.currencyName || '')}</span></button>
        </article>`;
      }).join('') : '<div class="mt-empty">当前类别暂无商品。<button type="button" data-mt-refresh>重新读取活动</button></div>'}</div>
    </section>`;
  }

  function workshop(data, state, catalog) {
    const recipes = Array.isArray(data.recipes) ? data.recipes : [];
    const selected = new Set((state.milkTeaSelectedUids || []).map(Number));
    const fruits = state.milkTeaFruits || [];
    const receipt = state.milkTeaLastReceipt?.accountId === state.milkTeaUi?.account ? state.milkTeaLastReceipt : null;
    const receiptHtml = receipt ? `<div class="mt-make-receipt" role="status"><b>${receipt.verified ? '上次制作结果' : '上次制作结果待核对'}</b><p>${esc(receipt.message || '')}</p><div class="mt-rewards">${(receipt.madeCups || []).map(cup => `<span class="mt-reward">${img(cup.image)}<span>${esc(cup.name)}<b>×${money(cup.count)} 杯</b></span></span>`).join('')}</div></div>` : '';
    return `<section class="mt-paper mt-workshop"><div class="mt-section-heading"><div><span class="mt-eyebrow">MILK TEA WORKSHOP</span><h3>奶茶工坊</h3></div><button type="button" data-mt-read-section="recipes" ${data.readState?.recipes?.status === 'loading' ? 'disabled' : ''}>读取配方</button></div>${readStatus(data, 'recipes')}
      <div class="mt-recipes">${recipes.length ? recipes.map(recipe => `<article class="mt-recipe ${recipe.unlocked ? '' : 'is-locked'}">${art('icon_s4_milktea_' + Number(recipe.recipe_id), recipe.recipe_name)}<div><b>${esc(recipe.recipe_name)}</b><span>${recipe.unlocked ? '已解锁' : '待解锁'} · ${money(recipe.token_price)} 奶茶券／杯</span><small>${num(recipe.stock_cups) < 0 ? '普通奶茶 · 不限量' : `库存 ${money(recipe.stock_cups)} 杯`}</small></div></article>`).join('') : '<p class="mt-empty">配方数据待同步，请读取在线账号活动。</p>'}</div>
      ${receiptHtml}<section class="mt-fruit-selector"><h4>选择制作材料</h4><p>勾选果实批次后制作。所选果实会被消耗，制作完成自动上架；仅列出已解锁配方对应的活动果实。</p>
      <div class="mt-fruit-tools"><button type="button" data-milk-tea-load-fruits>读取可制作果实</button>${fruits.length ? `<button type="button" data-milk-tea-select-all>全选 ${Math.min(fruits.length, 200)} 组</button><button type="button" data-mt-clear-fruits>清空选择</button>` : ''}</div>
      <div class="mt-fruits">${fruits.slice(0, 200).map(fruit => `<label><input type="checkbox" data-milk-tea-uid="${esc(fruit.uid)}" ${selected.has(Number(fruit.uid)) ? 'checked' : ''}>${img(fruit.image)}<span>${esc(fruit.name)}<small>×${money(fruit.count)}</small></span></label>`).join('') || (state.milkTeaBagLoaded ? '<p class="mt-empty">当前背包没有可制作的未锁定果实。</p>' : '')}</div>
      <div class="mt-workshop-footer"><span>已选 <b data-mt-fruit-count>${selected.size}</b> 组果实</span><button type="button" class="mt-gold-button" data-milk-tea-make ${selected.size && num(data.shopOpenAt) > 0 ? '' : 'disabled'}>制作已选 ${selected.size} 组</button></div></section></section>`;
  }

  function home(main, data, catalog, ui) {
    const view = data.view || {};
    const recipes = data.recipes || [];
    const pending = data.pendingRewards || [];
    const level = num(view.level ?? data.level);
    const total = num(view.total_revenue ?? data.totalRevenue);
    const next = num(view.next_level_revenue);
    const claim = main.capabilities?.flatMap(cap => cap.actions || []).find(action => action.key === 'milk_tea.claim');
    const rate = view.effective_cups_per_hour;
    const cashierFresh = !['loading', 'stale', 'error'].includes(data.readState?.shopView?.status);
    return `<section class="mt-storefront"><div class="mt-shop-banner"><div><span class="mt-shop-level">${level || '—'}<small>店铺等级</small></span><div><h3>${esc(data.shopName || '尚未开店')}</h3><p>营业额 ${money(total)}${next > 0 ? ` / ${money(next)}` : ''}</p></div></div><button type="button" data-mt-popup="upgrade">${art('img_s4TeaUI_myShop')}店铺升级</button></div>
      <div class="mt-shelf">${recipes.slice(0, 5).map(recipe => `<div class="${recipe.unlocked ? '' : 'is-locked'}">${art('icon_s4_milktea_' + Number(recipe.recipe_id), recipe.recipe_name)}<b>${num(recipe.stock_cups) < 0 ? '不限量' : money(recipe.stock_cups)}</b></div>`).join('')}<p>${rate !== undefined ? `正在热卖 · 每小时 ${money(rate)} 杯` : '经营状态待同步'}</p></div>
      <div class="mt-store-actions">${[['hire', 'img_s4EmpolyFriend_icon', '好友雇佣'], ['records', 'img_s4TeaUI_recordBtn', '营业记录'], ['ranking', 'img_s4TeaUI_rankBtn', '排行榜'], ['happy', 'img_s4TeaUI_shareBtn', '快乐不独享']].map(([key, icon, title]) => `<button type="button" data-mt-popup="${key}">${art(icon)}<span>${title}</span></button>`).join('')}</div>
      <section class="mt-cashier mt-paper"><div>${art('img_s4TeaUI_rewardBtn')}<div><h3>收银台收益</h3><p>${pending.length ? pending.map(item => `${esc(itemName(item, catalog))} ×${money(item.count)}`).join('、') : data.view ? '当前收银台暂无待领收益' : '收益数据待同步'}</p></div></div><button type="button" class="mt-gold-button" data-action="milk_tea.claim" data-activity-id="${esc(main.id || 2026110101)}" data-mutating="1" data-spend="0" data-label="领取收银台收益" ${cashierFresh && claim?.available !== false && pending.length ? '' : 'disabled'}>${pending.length ? '领取收益' : '暂无收益'}</button></section><div class="mt-inline-read">${readStatus(data, 'shopView')}<button type="button" data-mt-read-section="shopView">读取经营状态</button></div>
      <button type="button" class="mt-make-entry" data-mt-page="workshop">${art('img_s4Main_tab1')}<span>制作奶茶<small>选择果实 · 加工上架</small></span><b>›</b></button>
      ${!num(data.shopOpenAt) ? '<p class="mt-info">开业状态待确认。请先在官方游戏确认店名并领取开业礼，再读取活动。</p>' : ''}
    </section>`;
  }

  function candidateRole(friend, catalog) { return String(friend.specialty_name || catalog.rules?.talents?.find(row => Number(row.id) === Number(friend.specialty_id))?.name || '好友'); }
  function hireDialog(main, data, ui, catalog) {
    const hire = data.hireList;
    const friends = hire?.friends || [];
    const filtered = friends.filter(friend => ui.filter === '全部' || candidateRole(friend, catalog) === ui.filter);
    const validGids = new Set(friends.map(friend => String(friend.user?.gid || '')));
    const selected = new Set(ui.selected.filter(gid => validGids.has(String(gid))));
    const options = shiftOptions(catalog);
    const shift = options.find(item => item.hours === ui.shift) || options[0];
    const effects = Object.fromEntries((catalog.rules?.talents || []).map(row => [row.name, row.description]));
    const fresh = data.readState?.hireList?.status === 'fresh' && data.readState?.shopView?.status === 'fresh'
      && Number(hire?.shift_index) === shift.id;
    const employed = (data.view?.employees || []).filter(e => Number(e.end_at) * 1000 > Date.now());
    const capacity = Number(catalog.rules?.levels?.find(l => l.level === Number(data.view?.level))?.employeeSlots) || 0;
    const canHire = fresh && selected.size === 1 && employed.length < capacity
      && main.capabilities?.some(cap => cap.actions?.some(action => action.key === 'milk_tea.hire' && action.available !== false));
    return `<div class="mt-shifts" role="group" aria-label="雇佣时长">${options.map(item => `<button type="button" data-mt-shift="${item.hours}" data-duration-id="${item.id || ''}" aria-pressed="${ui.shift === item.hours}" class="${ui.shift === item.hours ? 'is-active' : ''}">${art('img_s4EmpolyFriend_icon')}<span class="mt-clock-time" aria-hidden="true">${String(item.hours).padStart(2, '0')}:00</span><b>${item.hours}小时</b><small>需支付 ${img(itemImage(1041, catalog))}<strong>${item.cost}</strong></small></button>`).join('')}</div>
      <div class="mt-hire-filters" role="group" aria-label="好友特长">${filters.map(name => `<button type="button" data-mt-filter="${name}" aria-pressed="${ui.filter === name}" class="${ui.filter === name ? 'is-active' : ''}">${name}</button>`).join('')}</div>
      <div class="mt-hire-list" data-mt-scroll>${filtered.map(friend => {
        const gid = String(friend.user?.gid || '');
        const role = candidateRole(friend, catalog);
        const checked = selected.has(gid);
        const avatar = safeImage(friend.user?.avatar || friend.user?.avatar_url);
        return `<button type="button" class="mt-hire-person ${checked ? 'is-selected' : ''}" data-mt-friend="${esc(gid)}" aria-pressed="${checked}" ${gid && gid !== '0' ? '' : 'disabled'}><span class="mt-avatar">${avatar ? img(avatar, friend.user?.nickname) : '<span>友</span>'}</span><span class="mt-person-copy"><span><em>${esc(role)}</em><b>${esc(friend.user?.nickname || '未命名好友')}</b></span><small>${esc(effects[role] || ('等级 ' + (friend.user?.level || '—')))}</small></span><i aria-hidden="true">${checked ? '✓' : ''}</i></button>`;
      }).join('') || `<div class="mt-empty">${hire ? '该分类暂无可雇佣好友' : '本次活动快照未包含雇佣名单'}<button type="button" data-mt-refresh>重新读取</button></div>`}</div>
      <div class="mt-hire-total">已选 <strong>${selected.size}</strong> 位 ${img(itemImage(1041, catalog))}<b>${money(selected.size * shift.cost)}</b></div>
      <button type="button" class="mt-gold-button mt-hire-confirm" data-mt-hire ${canHire ? '' : 'disabled'}>立即雇佣</button>
      ${employed.length ? `<p class="mt-info">在岗员工：${employed.map(e => esc(e.user?.nickname || e.user?.gid || '好友')).join('、')}</p>` : ''}
      <p class="mt-protocol-note">每次提交雇佣 1 位好友；确认后消耗 ${money(shift.cost)} 奶茶券。${fresh ? '' : '请先读取当前时长的好友名单与店铺状态。'}</p>`;
  }

  function modal(main, data, ui, catalog) {
    if (!ui.dialog) return '';
    const titles = { hire: '好友雇佣', records: '营业记录', ranking: '排行榜', upgrade: '店铺升级', happy: '快乐不独享' };
    let content = '';
    if (ui.dialog === 'hire') content = hireDialog(main, data, ui, catalog);
    if (ui.dialog === 'records') {
      const record = data.revenueRecord;
      const day = num(record?.record_day);
      const date = day > 946684800 ? new Date(day * 1000).toLocaleDateString('zh-CN') : '';
      content = record ? `<p class="mt-record-date">${esc(date || '营业记录')}</p><div class="mt-record-cups">${(record.cups_by_recipe || []).map(cup => { const recipe = (data.recipes || []).find(item => Number(item.recipe_id) === Number(cup.recipe_id)); return `<div>${art('icon_s4_milktea_' + Number(cup.recipe_id))}<b>${esc(recipe?.recipe_name || '配方 ' + cup.recipe_id)} ${money(cup.count)} 杯</b></div>`; }).join('')}</div><h4 class="mt-center-title">营业收益</h4><div class="mt-rewards">${(record.rewards || []).map(item => reward(item, catalog)).join('') || '<p>暂无奖励记录</p>'}</div>` : '<div class="mt-empty">本次活动快照未包含营业记录<button type="button" data-mt-refresh>重新读取</button></div>';
    }
    if (ui.dialog === 'ranking') {
      const entries = data.ranking?.entries || [];
      content = `<div class="mt-ranking-heading"><span>排名</span><span>玩家／店铺</span><span>营业额</span></div><div class="mt-ranking" data-mt-scroll>${entries.map((person, index) => `<div><strong>${esc(person.rank || index + 1)}</strong><span class="mt-avatar">${img(person.user?.avatar) || '友'}</span><span><b>${esc(person.user?.nickname || '未命名')}</b><small>${esc(person.shop_name || '店铺')} · Lv.${esc(person.shop_level || '—')}</small></span><b>${money(person.total_revenue)}</b></div>`).join('') || '<div class="mt-empty">本次活动快照未包含榜单<button type="button" data-mt-refresh>重新读取</button></div>'}</div>`;
    }
    if (ui.dialog === 'upgrade') {
      const view = data.view || {};
      const level = num(view.level ?? data.level);
      const current = catalog.rules?.levels?.find(row => row.level === level);
      const nextLevel = catalog.rules?.levels?.find(row => row.level === level + 1);
      const total = num(view.total_revenue ?? data.totalRevenue), next = num(view.next_level_revenue || nextLevel?.revenueRequired);
      const newRecipes = nextLevel?.recipeIds?.filter(id => !current?.recipeIds.includes(id)).map(id => catalog.rules.recipes.find(recipe => recipe.id === id)?.name).filter(Boolean) || [];
      content = `${art('img_s4TeaUI_myShop', '', 'mt-upgrade-art')}<p class="mt-record-date">Lv.${level || '—'}${nextLevel ? ' → Lv.' + nextLevel.level : ''}</p><div class="mt-progress-label"><b>营业额</b><span>${money(total)} / ${next ? money(next) : '待读取'}</span></div><progress max="${next || 1}" value="${Math.min(next, total)}"></progress>${current && nextLevel ? `<h4 class="mt-center-title">升级效果</h4><div class="mt-upgrade-effects"><p><span>热卖值</span><b>${current.baseCupsPerHour} → ${nextLevel.baseCupsPerHour} 杯／小时</b></p><p><span>员工席位</span><b>${current.employeeSlots} → ${nextLevel.employeeSlots} 位</b></p>${nextLevel.unlockDescription ? `<p><span>商品解锁</span><b>${esc(nextLevel.unlockDescription)}</b></p>` : ''}${newRecipes.length ? `<p><span>配方解锁</span><b>${esc(newRecipes.join('、'))}</b></p>` : ''}</div><h4 class="mt-center-title">升级奖励</h4><div class="mt-rewards">${nextLevel.rewards.map(item => reward(item, catalog)).join('')}</div>` : ''}<p class="mt-info">升级效果和奖励来自官方等级配置。升级提交请求与回包尚待核实，当前仅展示预览。</p><button type="button" class="mt-gold-button mt-hire-confirm" disabled>${level === 13 ? '已满级' : '立即升级'}</button>`;
    }
    if (ui.dialog === 'happy') {
      const snapshot = data.happyChild?.displayData;
      const actions = data.happyChild?.capabilities?.flatMap(cap => cap.actions || []) || [];
      const actionButton = (key, label, cls = '') => `<button type="button" class="${cls}" data-action="${key}" data-activity-id="2026110104" data-mutating="1" data-spend="0" data-label="${label}" ${actions.some(a => a.key === key && a.available !== false) ? '' : 'disabled'}>${label}</button>`;
      content = `<div class="mt-happy-poster">${art('img_s4HappyShare_title', '快乐不独享')}<div class="mt-happy-score">我的快乐值：<b>${snapshot?.happyValue != null ? money(snapshot.happyValue) : '待同步'}</b></div></div>
        <div class="mt-happy-milestones">${(snapshot?.milestones || []).map(step => `<div><b>${money(step.required_value)}</b><small>${Number(step.status) === 3 ? '已领取' : Number(step.status) === 2 ? '可领取' : '待达成'}</small><div class="mt-rewards">${(step.awards || []).map(item => reward(item, catalog)).join('')}</div></div>`).join('') || '<p>档位数据待同步，请刷新活动</p>'}</div>
        <div class="mt-happy-buttons">${actionButton('happy_share.prepare_share', '生成每日快乐包')}${actionButton('happy_share.daily_claim', '领取今日快乐', 'mt-gold-button')}${actionButton('happy_share.claim_rewards', '领取已达成档位奖励', 'mt-gold-button')}</div>
        <p class="mt-info">领取结果以实际回包为准；生成快乐包后，向好友分享仍需在官方游戏完成。</p><button type="button" data-mt-refresh>刷新快乐状态</button>`;
    }
    const section = dialogSections[ui.dialog];
    const controls = section ? `<div class="mt-panel-reload">${readStatus(data, section)}<button type="button" data-mt-read-section="${section}" ${data.readState?.[section]?.status === 'loading' ? 'disabled' : ''}>重新读取</button></div>` : '';
    return `<div class="mt-modal-backdrop" data-mt-backdrop><section class="mt-modal ${ui.dialog === 'happy' ? 'mt-happy-modal' : ''}" role="dialog" aria-modal="true" aria-labelledby="mt-dialog-title"><header><h3 id="mt-dialog-title">${titles[ui.dialog] || '活动详情'}</h3><button type="button" class="mt-modal-close" data-mt-close aria-label="关闭">${art('img_s4_closeBtn')}</button></header><div class="mt-modal-content">${controls}${content}</div></section></div>`;
  }

  function render(children, entry, state, options = {}) {
    const catalog = options.catalog || (typeof window !== 'undefined' ? window.MilkTeaCatalog : {}) || {};
    const ui = getState(state, options.accountId || '');
    const main = (children || []).find(child => Number(child.id) === 2026110101) || {};
    const shop = (children || []).find(child => Number(child.id) === 2026110102) || {};
    const data = { ...(main.displayData || {}), happyChild: (children || []).find(child => Number(child.id) === 2026110104) };
    const page = ui.page === 'exchange' ? shopGoods(shop, ui, catalog) : ui.page === 'workshop' ? workshop(data, state, catalog) : home(main, data, catalog, ui);
    const nav = [['shop', 'img_s4Main_tab0', '我的店铺'], ['workshop', 'img_s4Main_tab1', '奶茶工坊'], ['exchange', 'img_s4Main_tab2', '兑换商店']];
    return `<section class="milk-tea-event mt-event" data-mt-event><header class="mt-event-header"><div>${art('img_s4Main_logo', '奶茶热销中', 'mt-logo')}<span class="mt-time">${esc(entry?.timeLeftText || '活动进行中')}</span></div><button type="button" class="mt-refresh" data-mt-refresh>↻ 刷新活动</button></header><div class="mt-event-content">${page}</div><nav class="mt-bottom-nav" aria-label="奶茶活动导航">${nav.map(([key, icon, title]) => `<button type="button" data-mt-page="${key}" aria-label="${title}" aria-current="${ui.page === key ? 'page' : 'false'}" class="${ui.page === key ? 'is-active' : ''}">${art(icon, title)}</button>`).join('')}</nav>${modal(main, data, ui, catalog)}</section>`;
  }

  const mounted = new WeakSet();
  function renderPreservingView(document, render) {
    const y = document.querySelector('[data-mt-scroll]')?.scrollTop || 0;
    const active = document.activeElement;
    const attr = active?.getAttributeNames?.().find(name => name.startsWith('data-mt-'));
    const focusSelector = attr ? `[${attr}="${CSS.escape(active.getAttribute(attr))}"]` : '';
    render();
    const list = document.querySelector('[data-mt-scroll]');
    if (list) list.scrollTop = y;
    if (focusSelector) document.querySelector(focusSelector)?.focus({ preventScroll: true });
    const dialog = document.querySelector('.mt-modal');
    if (dialog && !dialog.contains(document.activeElement)) dialog.querySelector('button')?.focus({ preventScroll: true });
  }
  function bind(document, options) {
    if (mounted.has(document)) return;
    mounted.add(document);
    const redraw = () => renderPreservingView(document, options.render);
    const current = () => getState(options.state, options.accountId?.() || '');
    document.addEventListener('click', event => {
      const button = event.target.closest('[data-mt-page],[data-mt-category],[data-mt-popup],[data-mt-close],[data-mt-shift],[data-mt-filter],[data-mt-friend],[data-mt-refresh],[data-mt-clear-fruits],[data-mt-hire],[data-mt-read-section]');
      if (!button || !button.closest('[data-mt-event]')) {
        if (event.target.matches('[data-mt-backdrop]')) { current().dialog = ''; redraw(); }
        return;
      }
      event.preventDefault();
      const ui = current();
      if (button.dataset.mtPage) { ui.page = button.dataset.mtPage; ui.dialog = ''; }
      if (button.dataset.mtCategory) ui.category = button.dataset.mtCategory;
      if (button.dataset.mtPopup) { ui.dialog = button.dataset.mtPopup; ui.selected = []; }
      if (button.hasAttribute('data-mt-close')) ui.dialog = '';
      if (button.dataset.mtShift) ui.shift = Number(button.dataset.mtShift);
      if (button.dataset.mtFilter) ui.filter = button.dataset.mtFilter;
      if (button.dataset.mtFriend) {
        const id = button.dataset.mtFriend;
        ui.selected = ui.selected.includes(id) ? [] : [id];
      }
      if (button.hasAttribute('data-mt-clear-fruits')) options.state.milkTeaSelectedUids = [];
      if (button.hasAttribute('data-mt-refresh')) { options.refresh(); return; }
      if (button.dataset.mtReadSection) { options.readSection?.(button.dataset.mtReadSection); return; }
      if (button.hasAttribute('data-mt-hire')) {
        if (button.disabled || ui.selected.length !== 1) return;
        const shift = shifts.find(s => s.hours === ui.shift) || shifts[0];
        options.operate?.(2026110101, 'milk_tea.hire', true, true,
          { friendGid: Number(ui.selected[0]), durationId: shift.id, expectedCost: shift.cost },
          `雇佣好友 ${shift.hours} 小时（${shift.cost} 奶茶券）`, button);
        return;
      }
      redraw();
      const section = button.dataset.mtShift ? 'hireList' : button.dataset.mtPopup ? dialogSections[button.dataset.mtPopup] : button.dataset.mtPage === 'workshop' ? 'recipes' : '';
      if (section) {
        const data = options.state.group?.children?.find(child => Number(child.id) === 2026110101)?.displayData;
        const last = data?.readState?.[section];
        const wrongDuration = section === 'hireList' && last?.durationId !== (shifts.find(s => s.hours === ui.shift) || shifts[0]).id;
        if (button.dataset.mtShift || wrongDuration || last?.status !== 'fresh' || Date.now() - Date.parse(last.fetchedAt) > 5000) options.readSection?.(section, true);
      }
      if (button.dataset.mtPopup) document.querySelector('[data-mt-close]')?.focus();
    });
    document.addEventListener('keydown', event => {
      const dialog = document.querySelector('.mt-modal');
      if (!dialog) return;
      if (event.key === 'Escape') { current().dialog = ''; redraw(); }
      if (event.key === 'Tab') {
        const controls = [...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex="0"]')];
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    });
  }
  return { render, bind, getState, goodsFor, safeImage, shifts, shiftOptions, allowedFruitIds, sections, applySectionResult, createSectionRefresher };
});

