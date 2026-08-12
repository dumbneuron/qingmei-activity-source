/* QQ 农场「青酿换万金 / 青梅」活动 UI 源码片段 */

export const QINGMEI_GROUP_ID = 2026081200;
export const QINGMEI_FRUIT_ITEM_ID = 41221;

export function isQingmeiEntry(entry) {
  return Number(entry?.activityId || entry?.groupId || 0) === QINGMEI_GROUP_ID
    || /青酿|青梅/.test(String(entry?.title || entry?.desc || entry?.name || ''));
}

export function activityEntryIcon(entry) {
  const raw = String(entry?.icon || '').trim();
  const image = String(entry?.image || '').trim();
  if (isQingmeiEntry(entry) || raw === '?' || image === '?') return '梅';
  if (image) return `<img src="${escapeHtml(image)}" loading="lazy" alt="">`;
  return escapeHtml(raw || '活');
}

export function renderQingmeiDaily(child) {
  if (child?.bodyType !== 'daily_signin') return '';
  const d = child.displayData || {};
  const items = Array.isArray(d.previewItems) ? d.previewItems : [];
  const rewardId = Number(d.claimRewardId || 0);
  const disabled = !d.claimable || !rewardId;
  const buttonText = disabled ? '已领取' : '领取今日种子';

  return `
<section class="qingmei-panel">
  <div class="qingmei-head">
    <div>
      <b>今日青梅种子</b>
      <div class="muted">每天 0 点后后端会自动领取；已领或活动状态不允许时按钮会自动变灰。</div>
    </div>
    <button class="btn primary"
      data-action="daily_signin.claim"
      data-activity-id="${escapeHtml(child.id)}"
      data-mutating="1"
      data-spend="0"
      data-reward-id="${escapeHtml(rewardId)}"
      data-label="领取今日青梅种子"
      ${disabled ? 'disabled' : ''}>${buttonText}</button>
  </div>
  <div class="qingmei-items">
    ${items.length ? items.map(renderRewardItem).join('') : `<span class="tag">${disabled ? '今日已领取' : '奖励读取中'}</span>`}
  </div>
</section>`;
}

export function renderQingmeiDouble(child) {
  if (child?.bodyType !== 'double_rewards') return '';
  const d = child.displayData || {};
  const allowed = Array.isArray(d.allowedItems) ? d.allowedItems : [];
  const selected = Array.isArray(d.selectedItems) ? d.selectedItems : [];
  const canClaim = !!d.canClaim;
  const step = Number(d.step || 0);
  const stepCount = Number(d.stepCount || 0);
  const canStart = !canClaim && step <= 0;
  const canStep = step > 0 && step < stepCount && !canClaim;
  const selectedCount = selected.reduce((sum, item) => sum + Number(item.count || 0), 0);
  const selectedStacks = selected.length || allowed.length || 1;
  const selectedText = selectedCount > 0 ? `1/${selectedStacks}` : '1/1';
  const cards = selected.length
    ? selected.map(item => ({ itemId: item.itemId || QINGMEI_FRUIT_ITEM_ID, count: item.count, image: item.image, name: item.name || item.itemName }))
    : allowed.map(item => ({ ...item, count: item.count || '' }));

  return `
<section class="qingmei-panel">
  <div class="qingmei-head">
    <div>
      <b>青梅酿造 / 金币翻倍</b>
      <div class="muted">打开即默认全选背包普通青梅，点击酿造并出售即可。</div>
    </div>
    <button class="btn" type="button" disabled>取消全选</button>
  </div>

  <div class="qingmei-metrics">
    <div class="qingmei-metric"><span>当前选中</span><b>${escapeHtml(selectedText)}</b></div>
    <div class="qingmei-metric"><span>预计可卖</span><b>${escapeHtml(d.totalValueText || d.totalValue || 0)}</b></div>
    <div class="qingmei-metric"><span>进度</span><b>${escapeHtml(step)}/${escapeHtml(stepCount)}</b></div>
    <div class="qingmei-metric"><span>基础倍率</span><b>${escapeHtml(d.baseMultiplierText || '1x')}</b></div>
  </div>

  <div class="qingmei-items">
    ${cards.length ? cards.map(renderQingmeiSelectedItem).join('') : '<span class="tag">打开活动后会自动读取背包青梅</span>'}
  </div>

  <div class="qingmei-note">
    ${selectedCount > 0
      ? `当前已选中青梅 ×${escapeHtml(selectedCount)}，继续精酿后可出售领奖。`
      : escapeHtml(d.statusText || '点击酿造并出售时，后端会自动从背包找到普通青梅堆叠并提交。')}
  </div>

  <div class="actions">
    <button class="btn primary" data-action="double_rewards.start" data-activity-id="${escapeHtml(child.id)}" data-mutating="1" data-spend="0" data-label="酿造并出售青梅" ${canStart ? '' : 'disabled'}>酿造并出售</button>
    <button class="btn blue" data-action="double_rewards.step" data-activity-id="${escapeHtml(child.id)}" data-mutating="1" data-spend="0" data-label="继续精酿" ${canStep ? '' : 'disabled'}>继续精酿</button>
    <button class="btn amber" data-action="double_rewards.claim" data-activity-id="${escapeHtml(child.id)}" data-mutating="1" data-spend="0" data-claim-type="1" data-label="售出领奖" ${canClaim ? '' : 'disabled'}>售出领奖</button>
  </div>
</section>`;
}

export function paramsForQingmeiAction(action, buttonDataset = {}) {
  if (action === 'daily_signin.claim') return { rewardId: Number(buttonDataset.rewardId || 0) };
  if (action === 'double_rewards.start') return {}; // 后端自动从背包选择普通青梅
  if (action === 'double_rewards.claim') return { claimType: Number(buttonDataset.claimType || 1) || 1 };
  return {};
}

function renderRewardItem(item) {
  return `<div class="qingmei-item">
    ${item.image ? `<img src="${escapeHtml(item.image)}" loading="lazy" alt="">` : ''}
    <div><b>${escapeHtml(itemDisplayName(item))}</b><div class="muted">#${escapeHtml(item.itemId)} ×${escapeHtml(item.count || 0)}</div></div>
  </div>`;
}

function renderQingmeiSelectedItem(item) {
  return `<div class="qingmei-item qingmei-selected">
    ${item.image ? `<img src="${escapeHtml(item.image)}" loading="lazy" alt="">` : '<b>梅</b>'}
    <div><b>${escapeHtml(itemDisplayName(item) || '青梅')}</b><div class="muted">${item.count ? `×${escapeHtml(item.count)} · ` : ''}自动全选</div></div>
    <span class="tag">✓</span>
  </div>`;
}

function itemDisplayName(item) {
  return item?.itemName || item?.name || item?.title || `物品${item?.itemId || item?.id || ''}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
}
