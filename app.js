// app.js — routing, rendering, events for CookCook PWA
'use strict';

const $app = document.getElementById('app');
const $title = document.getElementById('view-title');
const $more = document.getElementById('more-btn');

// ---------- small helpers ----------
function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
function imgURL(blob) { return blob ? URL.createObjectURL(blob) : ''; }
// 复制文本到剪贴板（带 execCommand 兜底，iOS Safari 兼容）
function copyLink(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => { toast('已复制链接，去小红书粘贴'); }).catch(() => { fallbackCopy(text); });
  } else { fallbackCopy(text); }
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast('已复制链接，去小红书粘贴'); }
  catch (e) { toast('复制失败，请长按链接框手动复制'); }
  document.body.removeChild(ta);
}
function toast(msg) {
  const t = el(`<div style="position:fixed;left:50%;bottom:120px;transform:translateX(-50%);background:rgba(0,0,0,.8);color:#fff;padding:10px 18px;border-radius:20px;font-size:14px;z-index:999">${esc(msg)}</div>`);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1800);
}
// 给标签按名字生成稳定的柔和配色（HSL），同标签永远同色
const TAG_PALETTE = [
  ['#fde4e0','#c0392b'], ['#ffe9d6','#d35400'], ['#fff3cf','#b8860b'],
  ['#e8f5e1','#4a7d3a'], ['#e1f0ee','#2e8b8b'], ['#e6eefc','#3a6fb5'],
  ['#efe8f7','#7d4ba0'], ['#fce4f3','#b83280'], ['#eafaf2','#1e8449'],
  ['#fde9f3','#a04668'], ['#eef3f8','#5d6d7e'], ['#fff0e6','#a85a1a'],
];
// 固定配色：某些标签强制指定颜色（优先于哈希）
const FIXED_TAG_COLORS = {
  '辣口': ['#fde4e0', '#c0392b'],   // 红色
};
function tagColor(name) {
  if (name && FIXED_TAG_COLORS[name]) return FIXED_TAG_COLORS[name];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TAG_PALETTE[h % TAG_PALETTE.length];
}
// 只读 chip（用于详情页/列表展示）
function tagChipRO(t) {
  const [bg, fg] = tagColor(t);
  return `<span class="tag" style="background:${bg};color:${fg}">${esc(t)}</span>`;
}
function fmtDate(d) { const x = new Date(d); return `${x.getMonth() + 1}月${x.getDate()}日`; }
function ymd(d) { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; }

// calCursor (周历光标) 在 CALENDAR 区声明并初始化

// ---------- router ----------
function route() {
  const hash = location.hash.slice(1) || '/calendar';
  const [path, ...rest] = hash.split('/');
  closeMoreMenu();
  if (hash.startsWith('/calendar')) { setTitle('日历'); renderCalendar(); }
  else if (hash.startsWith('/day/')) { setTitle('餐单'); renderDay(hash.slice('/day/'.length)); }
  else if (hash.startsWith('/recipes')) { setTitle('菜谱'); renderRecipes(); }
  else if (hash.startsWith('/recipe/new')) { setTitle('新建菜谱'); renderRecipeEdit(null); }
  else if (hash.startsWith('/recipe/')) { setTitle('菜谱详情'); renderRecipeDetail(hash.slice('/recipe/'.length)); }
  else if (hash.startsWith('/import')) { setTitle('导入菜谱'); renderImport(); }
  else if (hash.startsWith('/pantry')) { setTitle('食材库'); renderPantry(); }
  else if (hash.startsWith('/shopping')) { setTitle('购物清单'); renderShopping(); }
  else if (hash.startsWith('/more')) { setTitle('更多'); renderMore(); }
  else { location.hash = '/calendar'; }
  syncTabs();
}
window.addEventListener('hashchange', route);

function setTitle(t) { $title.textContent = t; }
function syncTabs() {
  const h = location.hash.slice(1) || '/calendar';
  document.querySelectorAll('.tab').forEach(a => {
    a.classList.toggle('active', h.startsWith(a.dataset.tab));
  });
}

// ---------- more menu ----------
function closeMoreMenu() { const m = document.getElementById('more-menu'); if (m) m.remove(); }
$more.addEventListener('click', (e) => {
  e.stopPropagation();
  if (document.getElementById('more-menu')) { closeMoreMenu(); return; }
  const m = el(`<div id="more-menu" class="card" style="position:fixed;top:52px;right:8px;z-index:30;width:180px;padding:6px">
    <a href="#/more" style="display:block;padding:10px;border-radius:8px;color:var(--text);text-decoration:none">数据备份 / 关于</a>
    <a href="#/import" style="display:block;padding:10px;border-radius:8px;color:var(--text);text-decoration:none">从小红书导入</a>
  </div>`);
  document.body.appendChild(m);
});
document.addEventListener('click', closeMoreMenu);

// =====================================================================
// CALENDAR (周视图)
// =====================================================================
let calCursor = ymd(new Date()); // 光标：当前周的某一天(YYYY-MM-DD)

function weekDays(anchor) {
  const d = new Date(anchor + 'T00:00:00');
  const dow = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - dow);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const x = new Date(d); x.setDate(d.getDate() + i);
    out.push(ymd(x));
  }
  return out;
}
function shiftWeek(days) {
  const d = new Date(calCursor + 'T00:00:00');
  d.setDate(d.getDate() + days);
  calCursor = ymd(d);
  renderCalendar();
}

async function renderCalendar() {
  const plans = await listPlans();
  const recipes = await listRecipes();
  const recipeMap = new Map(recipes.map(r => [r.id, r]));
  const planByDate = new Map(plans.map(p => [p.date, p]));
  const today = ymd(new Date());
  const days = weekDays(calCursor);
  const first = days[0], last = days[6];
  const rangeLabel = first.slice(0, 7) === last.slice(0, 7)
    ? `${first.slice(5).replace('-', '/')} ~ ${last.slice(8)}`
    : `${first.slice(5).replace('-', '/')} ~ ${last.slice(5).replace('-', '/')}`;

  function dayRow(ds) {
    const d = new Date(ds + 'T00:00:00');
    const dow = d.getDay();
    const dowCN = ['日', '一', '二', '三', '四', '五', '六'][dow];
    const isToday = ds === today;
    const p = planByDate.get(ds);
    let meals = '';
    if (p) {
      for (const [key, label, color] of MEAL_SLOTS) {
        const entries = p[key] || (key === 'afternoon_snack' && p.snacks ? p.snacks : []);
        if (!entries.length) continue;
        const txts = entries.map(e => e.type === 'recipe'
          ? (recipeMap.get(e.recipeId)?.title || '（已删除）')
          : e.text).join('、');
        meals += `<div class="wk-meal" style="--mc:${color}"><span class="wk-bar"></span><span class="wk-l">${label}</span><span class="wk-t">${esc(txts)}</span></div>`;
      }
    }
    const cls = ['wk-row', isToday ? 'today' : '', p ? 'has-plan' : ''].filter(Boolean).join(' ');
    return `<div class="${cls}" onclick="location.hash='/day/${ds}'">
      <div class="wk-date"><span class="wk-dow ${dow===0||dow===6?'wknd':''}">${dowCN}</span><span class="wk-num">${d.getDate()}</span>${isToday?'<span class="wk-today">今</span>':''}</div>
      <div class="wk-meals">${meals || '<span class="wk-empty">还没安排，点这里加餐</span>'}</div>
    </div>`;
  }

  $app.innerHTML = `
    <div class="cal-nav">
      <button class="cal-arrow" onclick="shiftWeek(-7)">‹</button>
      <div class="cal-month">${rangeLabel}</div>
      <button class="cal-arrow" onclick="shiftWeek(7)">›</button>
    </div>
    <div class="wk-list">${days.map(dayRow).join('')}</div>
    <button class="btn ghost" onclick="calGoToday()" style="margin-top:12px">回到今天</button>
  `;
}
function calGoToday() { calCursor = ymd(new Date()); renderCalendar(); }

// =====================================================================
// DAY (meal plan)
// =====================================================================
const MEAL_SLOTS = [
  ['breakfast', '早餐', '#f4b860'],       ['morning_snack', '早加餐', '#e89b6f'],
  ['lunch', '午餐', '#6fa8d6'],           ['afternoon_snack', '午加餐', '#8dbf6f'],
  ['dinner', '晚餐', '#a07cd6'],          ['evening_snack', '晚加餐', '#d68f9b'],
];

// 兼容旧数据：旧 plan 里只有 snacks 一个槽位，读出来后合并到新的三个加餐槽
async function getPlanCompat(date) {
  const plan = await getPlan(date);
  for (const k of ['breakfast','morning_snack','lunch','afternoon_snack','dinner','evening_snack']) {
    if (!plan[k]) plan[k] = [];
  }
  if (plan.snacks && plan.snacks.length) {
    // 旧的 snacks 内容平摊到三个加餐（默认放午加餐）
    plan.afternoon_snack = plan.afternoon_snack.concat(plan.snacks);
    delete plan.snacks;
  }
  return plan;
}

async function renderDay(date) {
  const plan = await getPlanCompat(date);
  const recipes = await listRecipes();
  const recipeMap = new Map(recipes.map(r => [r.id, r]));
  let slots = '';
  for (const [key, label, color] of MEAL_SLOTS) {
    const entries = plan[key] || [];
    let rows = '';
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const isRecipe = e.type === 'recipe';
      const txt = isRecipe ? (recipeMap.get(e.recipeId)?.title || '（菜谱已删除）') : e.text;
      const kcal = isRecipe ? recipeKcal(recipeMap.get(e.recipeId)?.ingredients || []) : null;
      const kcalTxt = (isRecipe && kcal && kcal.matched) ? ` <span class="meal-kcal">${kcal.total}kcal</span>` : '';
      rows += `<div class="meal-row">
        <span class="meal-dot" style="background:${color}"></span>
        <span class="meal-name ${isRecipe?'':''}">${isRecipe?'🍳 ':''}${esc(txt)}${kcalTxt}</span>
        <button class="meal-x" onclick="dayRemove('${date}','${key}',${i})">✕</button>
      </div>`;
    }
    const empty = !entries.length ? `<div class="meal-empty">还没安排</div>` : '';
    slots += `<div class="meal-slot" style="border-left:4px solid ${color}">
      <div class="meal-head"><span class="meal-label" style="color:${color}">${label}</span>
        <span class="meal-count">${entries.length?entries.length+'项':''}</span></div>
      <div class="meal-list">${rows}${empty}</div>
      <div class="meal-actions">
        <button class="meal-add" onclick="dayAddRecipe('${date}','${key}')">+ 选菜谱</button>
        <button class="meal-add" onclick="dayAddFree('${date}','${key}')">+ 自定义</button>
      </div>
    </div>`;
  }
  const totalKcal = await (async () => { const agg = await aggregateIngredients([plan]); return agg; })();
  $app.innerHTML = `
    <div class="day-banner">
      <div class="day-banner-d">${fmtDate(date)}</div>
      <div class="day-banner-s">点下方各餐添加 · 颜色与日历一致</div>
    </div>
    ${slots}
    <button class="btn" onclick="dayGenList('${date}')">🛒 生成这天的备菜清单</button>
    <button class="btn ghost" onclick="history.back()" style="margin-top:8px">返回日历</button>
  `;
}

async function dayAddRecipe(date, key) {
  const plan = await getPlanCompat(date);
  const recipes = await listRecipes();
  if (!recipes.length) { alert('还没有菜谱，先去"菜谱"tab新建或导入一个吧'); return; }
  const opts = recipes.map(r => `<option value="${r.id}">${esc(r.title)}</option>`).join('');
  const m = el(`<div class="modal-bg" onclick="if(event.target===this)this.remove()">
    <div class="modal"><h2>选一个菜谱<button class="modal-close" onclick="this.closest('.modal-bg').remove()">✕</button></h2>
    <select id="pick-sel">${opts}</select>
    <button class="btn" style="margin-top:12px" id="pick-ok">加入${({breakfast:'早餐',morning_snack:'早加餐',lunch:'午餐',afternoon_snack:'午加餐',dinner:'晚餐',evening_snack:'晚加餐'}[key])}</button>
    </div></div>`);
  document.body.appendChild(m);
  m.querySelector('#pick-ok').onclick = async () => {
    plan[key].push({ type: 'recipe', recipeId: m.querySelector('#pick-sel').value });
    await savePlan(plan); m.remove(); renderDay(date);
  };
}
async function dayAddFree(date, key) {
  const plan = await getPlanCompat(date);
  const m = el(`<div class="modal-bg" onclick="if(event.target===this)this.remove()">
    <div class="modal"><h2>加自定义菜品<button class="modal-close" onclick="this.closest('.modal-bg').remove()">✕</button></h2>
    <input id="free-txt" placeholder="如：剩饭 / 水果一份">
    <button class="btn" style="margin-top:12px" id="free-ok">加入</button></div></div>`);
  document.body.appendChild(m);
  m.querySelector('#free-ok').onclick = async () => {
    const t = m.querySelector('#free-txt').value.trim();
    if (!t) return; plan[key].push({ type: 'free', text: t });
    await savePlan(plan); m.remove(); renderDay(date);
  };
}
async function dayRemove(date, key, idx) {
  const plan = await getPlanCompat(date);
  plan[key].splice(idx, 1);
  await savePlan(plan); renderDay(date);
}
async function dayGenList(date) {
  const plan = await getPlanCompat(date);
  const agg = await aggregateIngredients([plan]);
  const pantry = await listPantry();
  const pantryMap = new Map(pantry.map(p => [p.name.trim(), p]));
  const need = agg.filter(a => !pantryMap.has(a.name.trim()));
  const have = agg.filter(a => pantryMap.has(a.name.trim()));

  const needRows = need.map(a => `<div class="prep-row need">
    <span class="prep-name">${esc(a.name)}</span>
    <span class="prep-amount">${esc(a.amount)}${esc(a.unit||'')}</span>
  </div>`).join('');
  const haveRows = have.map(a => {
    const p = pantryMap.get(a.name.trim());
    const stock = p ? `${esc(p.quantity||'')}${esc(p.unit||'')}` : '';
    const st = p ? expiryState(p.expiryDate) : 'none';
    return `<div class="prep-row have">
      <span class="prep-dot ${st}"></span>
      <span class="prep-name">${esc(a.name)}</span>
      <span class="prep-stock">家有 ${stock || '—'}</span>
      <span class="prep-amount">需 ${esc(a.amount)}${esc(a.unit||'')}</span>
    </div>`;
  }).join('');

  const empty = !agg.length ? `<div class="empty"><div class="big">🥗</div>这一天还没排菜谱<br>先回餐单页加几道菜</div>` : '';
  const needBlock = need.length ? `<div class="prep-section"><div class="prep-h"><span>需准备</span><b class="c-red">${need.length}</b></div><div class="prep-card">${needRows}</div></div>` : '';
  const haveBlock = have.length ? `<div class="prep-section"><div class="prep-h"><span>家里已有</span><b class="c-green">${have.length}</b></div><div class="prep-card muted">${haveRows}</div></div>` : '';

  let html = `<div class="modal-bg prep-modal" onclick="if(event.target===this)this.remove()">
    <div class="modal prep-modal-inner">
      <div class="prep-top"><div><div class="prep-title">${fmtDate(date)} 备菜清单</div>
      <div class="prep-sub">${agg.length} 种食材 · 需买 ${need.length} · 已有 ${have.length}</div></div>
      <button class="modal-close" onclick="this.closest('.modal-bg').remove()">✕</button></div>
      ${empty}
      ${needBlock}
      ${haveBlock}`;
  if (need.length) html += `<button class="btn prep-fab" id="gen-shop">把 ${need.length} 项缺的加入购物清单 🛒</button>`;
  html += `</div></div>`;
  const m = el(html); document.body.appendChild(m);
  if (need.length) m.querySelector('#gen-shop').onclick = async () => {
    for (const a of need) await saveShopping({ name: a.name, amount: a.amount, unit: a.unit, checked: false, note: `${fmtDate(date)} 备菜` });
    m.remove();
    location.hash = '/shopping';
  };
}

// =====================================================================
// RECIPES
// =====================================================================
// 菜谱列表：搜索 / 收藏 / 做过 / 置顶
let recipeSearch = '';
let recipeFilterMode = 'all'; // all | fav | cooked
let _searchTimer = null;
// 搜索：防抖 + 只刷新列表区（不重画搜索框，避免中文输入法组词被打断）
function setRecipeSearch(v) {
  recipeSearch = v;
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => refreshRecipeList(), 200);
}
function setRecipeFilterMode(m) { recipeFilterMode = (recipeFilterMode === m) ? 'all' : m; refreshRecipeList(); }
async function toggleFav(id, ev) { if (ev) ev.stopPropagation(); const r = await getRecipe(id); await patchRecipe(id, { fav: !r.fav }); refreshRecipeList(); }
async function togglePinned(id, ev) { if (ev) ev.stopPropagation(); const r = await getRecipe(id); await patchRecipe(id, { pinned: !r.pinned }); refreshRecipeList(); }
// 详情页用的：改完只刷新详情
async function toggleFavDetail(id) { const r = await getRecipe(id); await patchRecipe(id, { fav: !r.fav }); renderRecipeDetail(id); }
async function togglePinnedDetail(id) { const r = await getRecipe(id); await patchRecipe(id, { pinned: !r.pinned }); renderRecipeDetail(id); }
async function toggleCookedDetail(id) {
  const r = await getRecipe(id);
  await patchRecipe(id, { cooked: !r.cooked, rating: !r.cooked ? (r.rating || 0) : 0 });
  renderRecipeDetail(id);
}
async function setRatingDetail(id, star) {
  const r = await getRecipe(id);
  const newRating = (r.rating === star) ? 0 : star;
  await patchRecipe(id, { cooked: true, rating: newRating });
  renderRecipeDetail(id);
}
async function toggleCooked(id, ev) {
  if (ev) ev.stopPropagation();
  const r = await getRecipe(id);
  // 第一次标记为做过 → 默认 0 星（邀请打分）；再次点击取消做过+清分
  await patchRecipe(id, { cooked: !r.cooked, rating: !r.cooked ? (r.rating || 0) : 0 });
  renderRecipes();
}
async function setRating(id, star, ev) {
  if (ev) ev.stopPropagation();
  const r = await getRecipe(id);
  // 同一星再点一次 → 取消打分
  const newRating = (r.rating === star) ? 0 : star;
  await patchRecipe(id, { cooked: true, rating: newRating });
  renderRecipes();
}
// 星级 HTML（只读展示）
function starsRO(rating) {
  let s = '';
  for (let i = 1; i <= 5; i++) s += `<span class="star ${i <= rating ? 'on' : ''}">★</span>`;
  return `<span class="stars">${s}</span>`;
}
// 星级 HTML（可点打分）
function starsPick(id, rating) {
  let s = '';
  for (let i = 1; i <= 5; i++) s += `<span class="star pick ${i <= rating ? 'on' : ''}" onclick="setRating('${id}',${i},event)">★</span>`;
  return `<span class="stars">${s}</span>`;
}

async function renderRecipes() {
  const recipes = await listRecipes();
  const allTags = [...new Set(recipes.flatMap(r => r.tags || []))];
  const modeBtn = (m, label, icon) => {
    const on = recipeFilterMode === m;
    return `<button class="add-mini" style="background:${on?'var(--accent)':'var(--card)'};color:${on?'#fff':'var(--accent)'};border:1px solid var(--accent)" onclick="setRecipeFilterMode('${m}')">${icon} ${label}</button>`;
  };
  if (!recipes.length) {
    $app.innerHTML = `
      <div class="row" style="margin-bottom:12px">
        <button class="btn secondary" onclick="location.hash='/import'">从链接/文本导入</button>
        <button class="btn" onclick="location.hash='/recipe/new'">手动新建</button>
      </div>
      <div class="card"><div class="empty"><div class="big">🍳</div>还没有菜谱<br>点下面导入或新建</div></div>`;
    return;
  }
  // 框架：搜索框 + 筛选条 + 列表容器（列表容器单独刷新，搜索框不被重画）
  $app.innerHTML = `
    <div class="row" style="margin-bottom:12px">
      <button class="btn secondary" onclick="location.hash='/import'">从链接/文本导入</button>
      <button class="btn" onclick="location.hash='/recipe/new'">手动新建</button>
    </div>
    <div class="card">
      <div class="search-bar"><input id="rec-search" placeholder="🔍 搜菜谱名或食材" value="${esc(recipeSearch)}" oninput="setRecipeSearch(this.value)"></div>
      <div style="margin-bottom:10px;display:flex;flex-wrap:wrap;gap:4px">
        <button class="add-mini" style="background:${recipeFilterMode==='all'?'var(--accent)':'var(--card)'};color:${recipeFilterMode==='all'?'#fff':'var(--accent)'};border:1px solid var(--accent)" onclick="setRecipeFilterMode('all')">全部</button>
        ${modeBtn('fav','收藏','★')}
        ${modeBtn('cooked','做过','✓')}
      </div>
      ${allTags.length ? `<div style="margin-bottom:10px;display:flex;flex-wrap:wrap;gap:4px">
        <button class="add-mini" style="background:${(window._recipeFilter||'')===''?'var(--accent)':'var(--card)'};color:${(window._recipeFilter||'')===''?'#fff':'var(--accent)'};border:1px solid var(--accent)" onclick="window._recipeFilter='';refreshRecipeList()">全部标签</button>
        ${allTags.map(t => {
          const [bg, fg] = tagColor(t);
          const on = (window._recipeFilter||'') === t;
          return `<button class="add-mini" style="background:${on?fg:bg};color:${on?'#fff':fg};border:1px solid ${fg}" onclick="window._recipeFilter='${esc(t)}';refreshRecipeList()">${esc(t)}</button>`;
        }).join('')}
      </div>` : ''}
      <div id="rec-list"></div>
    </div>`;
  refreshRecipeList();
}

// 只刷新列表区（搜索/筛选时调用，不碰搜索框）
async function refreshRecipeList() {
  const box = document.getElementById('rec-list');
  if (!box) return;
  const recipes = await listRecipes();
  const q = recipeSearch.trim();
  const activeTag = window._recipeFilter || '';
  let filtered = recipes;
  if (q) {
    // 模糊匹配：标题或任一食材名包含搜索词（大小写不敏感，中文同样适用）
    const ql = q.toLowerCase();
    filtered = filtered.filter(r => {
      if ((r.title || '').toLowerCase().includes(ql)) return true;
      return (r.ingredients || []).some(i => (i.name || '').toLowerCase().includes(ql));
    });
  }
  if (activeTag) filtered = filtered.filter(r => (r.tags || []).includes(activeTag));
  if (recipeFilterMode === 'fav') filtered = filtered.filter(r => r.fav);
  if (recipeFilterMode === 'cooked') filtered = filtered.filter(r => r.cooked);
  // 排序：置顶 → 做过 → 收藏 → 新建倒序
  filtered.sort((a, b) => {
    if ((!!b.pinned) - (!!a.pinned)) return (!!b.pinned) - (!!a.pinned);
    if ((b.cooked?1:0) - (a.cooked?1:0)) return (b.cooked?1:0) - (a.cooked?1:0);
    if ((b.fav?1:0) - (a.fav?1:0)) return (b.fav?1:0) - (a.fav?1:0);
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
  if (!filtered.length) { box.innerHTML = `<div class="empty">没有匹配的菜谱</div>`; return; }
  box.innerHTML = filtered.map(r => {
    const thumb = r.images && r.images[0] ? `<img class="recipe-thumb" src="${imgURL(r.images[0])}">` : `<div class="recipe-thumb"></div>`;
    const ings = (r.ingredients || []).map(i => i.name).join('、');
    const kcal = recipeKcal(r.ingredients || []);
    const kcalTag = kcal.matched ? `<span class="tag" style="background:#fbe7d2;color:#a85a1a">${kcal.total}kcal</span>` : '';
    const tagTags = (r.tags || []).map(tagChipRO).join('');
    const pinIcon = r.pinned ? `<span class="pin-mark" title="置顶">📌</span>` : '';
    const favBtn = `<span class="rec-fav ${r.fav?'on':''}" onclick="toggleFav('${r.id}',event)">${r.fav?'★':'☆'}</span>`;
    const cookedMark = r.cooked ? `<span class="cooked-mark">✓ 做过</span>` : '';
    const ratingStars = r.cooked && r.rating ? starsRO(r.rating) : '';
    return `<div class="recipe-item ${r.pinned?'pinned':''} ${r.cooked?'cooked':''}" onclick="location.hash='/recipe/${r.id}'">
      ${thumb}<div class="meta"><div class="t">${pinIcon}${esc(r.title)} ${favBtn}</div>
      <div class="s">${cookedMark}${ratingStars}${tagTags}${kcalTag}<br>${esc(ings.slice(0, 40))}</div></div></div>`;
  }).join('');
}

async function renderRecipeDetail(id) {
  const r = await getRecipe(id);
  if (!r) { $app.innerHTML = `<div class="empty">菜谱不存在</div><button class="btn ghost" onclick="history.back()">返回</button>`; return; }
  let imgs = (r.images || []).map(b => `<img src="${imgURL(b)}" style="width:100%;border-radius:12px;margin-bottom:8px">`).join('');
  // 食材 + 每项卡路里
  const kcal = recipeKcal(r.ingredients || []);
  let ings = (r.ingredients || []).map(i => {
    const k = estimateIngredientKcal(i);
    const kcalTxt = k.matched && k.kcal != null ? `<span class="qty">${k.kcal} kcal${k.approx ? '~' : ''}</span>` : `<span class="qty" style="color:var(--muted)">—</span>`;
    return `<div class="meal-entry"><span>${esc(i.name)} <span class="qty">${esc(i.amount||'')}${esc(i.unit||'')}</span></span>${kcalTxt}</div>`;
  }).join('');
  let steps = (r.steps || []).map((s, i) => `<div style="margin-bottom:6px"><b>${i + 1}.</b> ${esc(s.text || s)}</div>`).join('');
  const linkBlock = r.link ? `<div class="link-box"><div class="link-label">小红书链接 · 点复制去 app 里看</div><div class="link-row"><input class="link-text" value="${esc(r.link)}" readonly onclick="this.select()"><button class="link-copy" onclick="copyLink('${esc(r.link)}')">复制</button></div></div>` : '';
  const tagRow = (r.tags && r.tags.length) ? `<div style="margin:8px 0">${r.tags.map(tagChipRO).join('')}</div>` : '';
  const unmatchedHint = kcal.unmatched.length ? `<div style="font-size:12px;color:var(--muted);margin-top:4px">未估算：${kcal.unmatched.map(esc).join('、')}</div>` : '';
  const kcalBlock = kcal.matched ? `<div class="section-title">估算热量</div><div class="card"><b style="font-size:20px;color:var(--accent)">${kcal.total}</b> kcal（整份，约 ${(kcal.total/230).toFixed(1)} 碗米饭）${unmatchedHint}</div>` : '';
  // 标题栏：标题 + 收藏/置顶按钮
  const titleBar = `<div class="rd-title-bar">
    <div class="rd-title">${esc(r.title)}</div>
    <div class="rd-actions">
      <button class="rd-act ${r.fav?'on':''}" onclick="toggleFavDetail('${id}')" title="收藏">${r.fav?'★':'☆'}</button>
      <button class="rd-act ${r.pinned?'on':''}" onclick="togglePinnedDetail('${id}')" title="置顶">📌</button>
    </div>
  </div>`;
  // 做过区：成功标签 + 打分
  const cookedSection = `<div class="rd-cooked-bar">
    <button class="cooked-tag ${r.cooked?'done':''}" onclick="toggleCookedDetail('${id}')">${r.cooked?'✓ 制作成功':'标记为已做过'}</button>
    ${r.cooked ? `<div class="rd-rate"><span class="rd-rate-l">我的评分</span><span class="stars">${[1,2,3,4,5].map(i=>`<span class="star pick ${i<=r.rating?'on':''}" onclick="setRatingDetail('${id}',${i})">★</span>`).join('')}</span></div>` : ''}
  </div>`;
  $app.innerHTML = `
    ${titleBar}
    ${cookedSection}
    ${tagRow}
    ${linkBlock}
    ${imgs}
    <div class="section-title">食材</div><div class="card">${ings || '<div class="empty">无</div>'}</div>
    ${kcalBlock}
    ${steps ? `<div class="section-title">步骤</div><div class="card">${steps}</div>` : ''}
    <div class="row" style="margin-top:12px">
      <button class="btn secondary" onclick="editRecipe('${id}')">编辑</button>
      <button class="btn danger" onclick="delRecipe('${id}')">删除</button>
    </div>
    <button class="btn ghost" onclick="history.back()" style="margin-top:8px">返回</button>
  `;
}
async function editRecipe(id) { renderRecipeEdit(id); }
async function delRecipe(id) {
  if (!confirm('确定删除这个菜谱？')) return;
  await deleteRecipe(id); location.hash = '/recipes';
}

// shared editor for new + edit (also used by import after parsing)
let editState = null; // {id?, title, link, ingredients:[], steps:[], images:[], tags:[]}

async function renderRecipeEdit(id) {
  if (id) {
    const r = await getRecipe(id);
    editState = { id: r.id, title: r.title || '', link: r.link || '', ingredients: r.ingredients || [], steps: r.steps || [], images: r.images || [], tags: r.tags || [] };
  } else {
    editState = { title: '', link: '', ingredients: [], steps: [], images: [], tags: [] };
  }
  drawRecipeEditor();
}
function drawRecipeEditor() {
  const s = editState;
  let ingRows = s.ingredients.map((i, idx) => `
    <div class="ing-edit-row"><input class="n" placeholder="食材" value="${esc(i.name)}" oninput="editState.ingredients[${idx}].name=this.value">
    <input class="a" placeholder="量" value="${esc(i.amount)}" oninput="editState.ingredients[${idx}].amount=this.value">
    <input class="u" placeholder="单位" value="${esc(i.unit)}" oninput="editState.ingredients[${idx}].unit=this.value">
    <button class="x" onclick="editState.ingredients.splice(${idx},1);drawRecipeEditor()">✕</button></div>`).join('');
  let stepRows = s.steps.map((st, idx) => `
    <div class="ing-edit-row"><input class="n" placeholder="第${idx + 1}步" value="${esc(st.text || st)}" oninput="editState.steps[${idx}].text=this.value">
    <button class="x" onclick="editState.steps.splice(${idx},1);drawRecipeEditor()">✕</button></div>`).join('');
  let imgs = s.images.map((b, idx) => `<img src="${imgURL(b)}"><button class="x" onclick="editState.images.splice(${idx},1);drawRecipeEditor()" style="position:relative">✕</button>`).join('');
  const tagChips = (s.tags || []).map((t, idx) => {
    const [bg, fg] = tagColor(t);
    return `<span class="tag" style="background:${bg};color:${fg}">${esc(t)}<button class="x" style="font-size:13px;margin-left:4px;color:${fg}" onclick="editState.tags.splice(${idx},1);drawRecipeEditor()">✕</button></span>`;
  }).join('');
  const PRESET_TAGS = ['轻食','减脂','辣口','清淡','高蛋白','低碳水','快手菜','早餐','午餐','晚餐','加餐','汤','主食','甜品'];
  const presetBtns = PRESET_TAGS.map(t => `<button type="button" class="add-mini" style="margin:2px" onclick="if(!editState.tags.includes('${t}')){editState.tags.push('${t}');drawRecipeEditor();}">${t}</button>`).join(' ');
  const parseHint = (s._parsed && (s.ingredients.length || s.steps.length)) ? `<div class="banner" style="background:#e8f5e1;color:#3a7d2a;border-color:#c5e3b6">✓ 已识别：${s.ingredients.length} 样食材${s.steps.length ? `、${s.steps.length} 步做法` : ''}，下面可继续改</div>` : '';
  $app.innerHTML = `
    <label>菜谱标题</label><input id="ed-title" value="${esc(s.title)}" oninput="editState.title=this.value">
    <label>链接（可选，跳转看做法）</label><input id="ed-link" value="${esc(s.link)}" oninput="editState.link=this.value" placeholder="https://www.xiaohongshu.com/...">
    <label>标签（轻食/减脂/辣口…，可自定义）</label>
    <div style="margin-bottom:6px">${tagChips || '<span style="color:var(--muted);font-size:13px">还没有标签</span>'}</div>
    <input id="ed-tag-input" placeholder="输入标签后回车添加" onkeydown="if(event.key==='Enter'){event.preventDefault();const v=this.value.trim();if(v&&!editState.tags.includes(v)){editState.tags.push(v);drawRecipeEditor();}}">
    <div style="margin:6px 0">${presetBtns}</div>
    <label>配图（从相册选）</label>
    <div class="img-pick">${imgs}<label class="add" for="ed-img">＋<input type="file" id="ed-img" accept="image/*" multiple style="display:none" onchange="addEditImgs(this.files)"></label></div>
    <div class="section-title">⚡ 粘贴文本自动识别（可选）</div>
    <textarea id="ed-text" placeholder="粘贴小红书截图实况文本，自动拆分填入下面&#10;支持食材 + 做法"></textarea>
    <button class="btn secondary" style="margin-top:8px" onclick="editParse()">🔍 识别并填入</button>
    ${parseHint}
    <div class="section-title">食材</div>
    ${ingRows || '<div style="font-size:13px;color:var(--muted);margin-bottom:6px">点下面加，或上面粘贴文本识别</div>'}
    <button class="btn ghost" onclick="editState.ingredients.push({name:'',amount:'',unit:''});drawRecipeEditor()" style="margin-top:6px">+ 加一行食材</button>
    <div class="section-title">步骤（可选 · 视频菜谱可留空去小红书看）</div>
    ${stepRows}
    <button class="btn ghost" onclick="editState.steps.push({text:''});drawRecipeEditor()" style="margin-top:6px">+ 加一步</button>
    <button class="btn" style="margin-top:14px" onclick="saveRecipeEdit()">保存菜谱</button>
    <button class="btn ghost" onclick="history.back()" style="margin-top:8px">取消</button>
  `;
}
// 重画前同步回写编辑页输入框
function flushEditInputs() {
  const s = editState; if (!s) return;
  let ingI = 0, stepI = 0;
  document.querySelectorAll('#app .ing-edit-row').forEach(row => {
    const inputs = row.querySelectorAll('input');
    const placeholder = inputs[0] ? inputs[0].placeholder : '';
    if (inputs.length === 3) {
      if (s.ingredients[ingI]) {
        if (inputs[0]) s.ingredients[ingI].name = inputs[0].value;
        if (inputs[1]) s.ingredients[ingI].amount = inputs[1].value;
        if (inputs[2]) s.ingredients[ingI].unit = inputs[2].value;
      }
      ingI++;
    } else if (inputs.length === 1) {
      if (s.steps[stepI] && inputs[0]) s.steps[stepI].text = inputs[0].value;
      stepI++;
    }
  });
  const t = document.getElementById('ed-title'); if (t) s.title = t.value;
  const l = document.getElementById('ed-link'); if (l) s.link = l.value;
}
function editParse() {
  flushEditInputs();
  const text = document.getElementById('ed-text').value;
  if (!text.trim()) { alert('先粘贴点菜谱文字'); return; }
  const p = parseRecipeText(text);
  if (!editState.title && p.title) editState.title = p.title;
  for (const i of p.ingredients) editState.ingredients.push({ ...i });
  if (p.steps.length) {
    if (editState.steps.length) for (const s of p.steps) editState.steps.push(s);
    else editState.steps = p.steps.slice();
  }
  editState._parsed = true;
  drawRecipeEditor();
}
async function addEditImgs(files) {
  for (const f of files) editState.images.push(f);
  drawRecipeEditor();
}
async function saveRecipeEdit() {
  flushEditInputs();
  const s = editState;
  if (!s.title.trim()) { alert('请填菜谱标题'); return; }
  s.ingredients = s.ingredients.filter(i => (i.name || '').trim());
  s.steps = s.steps.map((x, i) => ({ n: i + 1, text: (x.text || x || '').trim() })).filter(x => x.text);
  await saveRecipe(s);
  location.hash = '/recipes';
}

// =====================================================================
// IMPORT (小红书: link + manual ingredients + optional paste-parse)
// =====================================================================
let importState = null;
function renderImport() {
  importState = { link: '', title: '', ingredients: [], steps: [], images: [], tags: [] };
  drawImport();
}
function drawImport() {
  const s = importState;
  const ingRows = s.ingredients.map((i, idx) => `
    <div class="ing-edit-row"><input class="n" placeholder="食材名" value="${esc(i.name)}" oninput="importState.ingredients[${idx}].name=this.value">
    <input class="a" placeholder="量" value="${esc(i.amount)}" oninput="importState.ingredients[${idx}].amount=this.value">
    <input class="u" placeholder="单位" value="${esc(i.unit)}" oninput="importState.ingredients[${idx}].unit=this.value">
    <button class="x" onclick="importState.ingredients.splice(${idx},1);drawImport()">✕</button></div>`).join('');
  const stepRows = (s.steps || []).map((st, idx) => `
    <div class="ing-edit-row"><input class="n" placeholder="第${idx + 1}步" value="${esc(st.text || st)}" oninput="importState.steps[${idx}].text=this.value">
    <button class="x" onclick="importState.steps.splice(${idx},1);drawImport()">✕</button></div>`).join('');
  const imgs = s.images.map((b, idx) => `<img src="${imgURL(b)}"><button class="x" onclick="importState.images.splice(${idx},1);drawImport()">✕</button>`).join('');
  const tagChips = (s.tags || []).map((t, idx) => {
    const [bg, fg] = tagColor(t);
    return `<span class="tag" style="background:${bg};color:${fg}">${esc(t)}<button class="x" style="font-size:13px;margin-left:4px;color:${fg}" onclick="importState.tags.splice(${idx},1);drawImport()">✕</button></span>`;
  }).join('');
  const PRESET_TAGS = ['轻食','减脂','辣口','清淡','高蛋白','低碳水','快手菜','早餐','午餐','晚餐','加餐','汤','主食','甜品'];
  const presetBtns = PRESET_TAGS.map(t => `<button type="button" class="add-mini" style="margin:2px" onclick="if(!importState.tags.includes('${t}')){importState.tags.push('${t}');drawImport();}">${t}</button>`).join(' ');
  const parseHint = (s._parsed && (s.ingredients.length || s.steps.length)) ? `<div class="banner" style="background:#e8f5e1;color:#3a7d2a;border-color:#c5e3b6">✓ 已识别：${s.ingredients.length} 样食材${s.steps.length ? `、${s.steps.length} 步做法` : ''}，下面可继续改</div>` : '';
  $app.innerHTML = `
    <div class="banner">小红书导入：贴链接方便跳转看做法，食材/步骤可粘贴文本自动识别，也可手动改。视频菜谱步骤可留空，做法去小红书看。</div>
    <div class="section-title">⚡ 粘贴文本自动识别（可选）</div>
    <textarea id="imp-text" placeholder="把小红书截图用「实况文本」复制的文字粘这里&#10;支持食材 + 做法，自动拆分填入下面&#10;例：&#10;食材：&#10;番茄 2个&#10;鸡蛋 3个&#10;盐 适量&#10;做法：&#10;1. 番茄切块&#10;2. 鸡蛋打散炒熟"></textarea>
    <button class="btn secondary" style="margin-top:8px" onclick="impParse()">🔍 识别并填入</button>
    ${parseHint}
    <label>小红书链接（可选，方便跳转看视频/图文）</label>
    <input id="imp-link" placeholder="https://www.xiaohongshu.com/discovery/item/..." value="${esc(s.link)}" oninput="importState.link=this.value">
    <label>菜谱标题</label>
    <input id="imp-title" placeholder="给这道菜起个名" value="${esc(s.title)}" oninput="importState.title=this.value">
    <label>标签（轻食/减脂/辣口…，可自定义）</label>
    <div style="margin-bottom:6px">${tagChips || '<span style="color:var(--muted);font-size:13px">还没有标签</span>'}</div>
    <input id="imp-tag-input" placeholder="输入标签后回车添加" onkeydown="if(event.key==='Enter'){event.preventDefault();const v=this.value.trim();if(v&&!importState.tags.includes(v)){importState.tags.push(v);drawImport();}}">
    <div style="margin:6px 0">${presetBtns}</div>
    <div class="section-title">食材（用来生成备菜清单）</div>
    ${ingRows || '<div style="font-size:13px;color:var(--muted);margin-bottom:6px">点下面加，或上面粘贴文本识别</div>'}
    <button class="btn ghost" onclick="importState.ingredients.push({name:'',amount:'',unit:''});drawImport()" style="margin-top:6px">+ 加一行食材</button>
    <div class="section-title">步骤（可选 · 视频菜谱可留空去小红书看）</div>
    ${stepRows}
    <button class="btn ghost" onclick="importState.steps.push({text:''});drawImport()" style="margin-top:6px">+ 加一步</button>
    <label>配图（从相册选，可选，方便认菜）</label>
    <div class="img-pick">${imgs}<label class="add" for="imp-img">＋<input type="file" id="imp-img" accept="image/*" multiple style="display:none" onchange="addImpImgs(this.files)"></label></div>
    <button class="btn" style="margin-top:12px" onclick="impSave()">保存到菜谱</button>
    <button class="btn ghost" onclick="history.back()" style="margin-top:8px">取消</button>
  `;
}
// 重画前同步回写当前输入框（防止焦点框未失焦的文字被重渲染冲掉）
function flushImportInputs() {
  const s = importState; if (!s) return;
  const rows = document.querySelectorAll('#app .ing-edit-row');
  // 食材行 + 步骤行共用 .ing-edit-row 结构：第一个input是 name/text
  let ingI = 0, stepI = 0;
  rows.forEach(row => {
    const inputs = row.querySelectorAll('input');
    const placeholder = inputs[0] ? inputs[0].placeholder : '';
    if (placeholder.includes('食材') || inputs.length === 3) {
      if (s.ingredients[ingI]) {
        if (inputs[0]) s.ingredients[ingI].name = inputs[0].value;
        if (inputs[1]) s.ingredients[ingI].amount = inputs[1].value;
        if (inputs[2]) s.ingredients[ingI].unit = inputs[2].value;
      }
      ingI++;
    } else if (placeholder.includes('步') || inputs.length === 1) {
      if (s.steps[stepI] && inputs[0]) s.steps[stepI].text = inputs[0].value;
      stepI++;
    }
  });
  // 标题/链接
  const t = document.getElementById('imp-title'); if (t) s.title = t.value;
  const l = document.getElementById('imp-link'); if (l) s.link = l.value;
}
function impParse() {
  flushImportInputs();
  const text = document.getElementById('imp-text').value;
  if (!text.trim()) { alert('先粘贴点菜谱文字'); return; }
  const p = parseRecipeText(text);
  // 标题：仅当当前为空时填入，避免覆盖手填的
  if (!importState.title && p.title) importState.title = p.title;
  // 食材：追加到已有（避免清掉手动加的）
  for (const i of p.ingredients) importState.ingredients.push({ ...i });
  // 步骤：解析到就替换（识别前通常没手填步骤）；若已有手填步骤则追加
  if (p.steps.length) {
    if (importState.steps.length) for (const s of p.steps) importState.steps.push(s);
    else importState.steps = p.steps.slice();
  }
  importState._parsed = true;
  drawImport();
}
async function addImpImgs(files) { for (const f of files) importState.images.push(f); drawImport(); }
async function impSave() {
  flushImportInputs();
  const s = importState;
  if (!s.ingredients.length) { alert('至少加一个食材\n（手动加，或上面粘贴文本识别）'); return; }
  const recipe = {
    title: s.title.trim() || '未命名菜谱',
    link: s.link.trim(),
    ingredients: s.ingredients.filter(i => (i.name || '').trim()),
    steps: (s.steps || []).map((x, i) => ({ n: i + 1, text: (x.text || x || '').trim() })).filter(x => x.text),
    images: s.images,
    tags: s.tags || [],
  };
  await saveRecipe(recipe);
  alert('已保存到菜谱'); location.hash = '/recipes';
}

// =====================================================================
// PANTRY
// =====================================================================
let pantryTagFilter = null;
function pantrySetTagFilter(t) { pantryTagFilter = (pantryTagFilter === t) ? null : t; renderPantry(); }
async function renderPantry() {
  const items = await listPantry();
  // expiry reminder banner
  const soon = items.filter(i => { const s = expiryState(i.expiryDate); return s === 'red' || s === 'yellow'; })
    .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
  let banner = '';
  if (soon.length) {
    banner = `<div class="banner">⚠️ ${soon.length}样食材快过期：${soon.slice(0, 4).map(i => esc(i.name)).join('、')}${soon.length > 4 ? '…' : ''}</div>`;
  }
  // tag filter bar (colored chips)
  const allTags = [...new Set(items.flatMap(i => i.tags || []))];
  let filterBar = '';
  if (allTags.length) {
    const chips = allTags.map(t => {
      const [bg, fg] = tagColor(t);
      const on = pantryTagFilter === t;
      const style = on ? `background:${bg};color:${fg};border-color:${fg}` : '';
      return `<button class="tag-filter ${on?'on':''}" style="${style}" onclick="pantrySetTagFilter('${esc(t)}')">${esc(t)}</button>`;
    }).join('');
    filterBar = `<div class="tag-bar"><button class="tag-filter ${pantryTagFilter?'':'on'}" onclick="pantryTagFilter=null;renderPantry()">全部</button>${chips}</div>`;
  }
  const filtered = pantryTagFilter ? items.filter(i => (i.tags || []).includes(pantryTagFilter)) : items;
  // group by expiry state, most urgent first
  const groups = { red: [], yellow: [], green: [], none: [] };
  filtered.forEach(i => groups[expiryState(i.expiryDate)].push(i));
  const GROUPS = [
    { key:'red', label:'已过期 / 今天到期' },
    { key:'yellow', label:'即将过期' },
    { key:'green', label:'新鲜' },
    { key:'none', label:'无保质期' },
  ];
  let list = '';
  if (!filtered.length) {
    list = `<div class="empty"><div class="big">🥫</div>${items.length ? '该分类下没有食材' : '食材库是空的'}<br>点下面添加</div>`;
  } else {
    list = GROUPS.map(g => {
      if (!groups[g.key].length) return '';
      groups[g.key].sort((a, b) => (a.expiryDate || '9999').localeCompare(b.expiryDate || '9999'));
      const rows = groups[g.key].map(i => {
        const st = expiryState(i.expiryDate);
        const tags = (i.tags || []).map(tagChipRO).join('');
        let expLine;
        if (i.expiryDate) {
          const days = Math.ceil((new Date(i.expiryDate).getTime() - Date.now()) / 86400000);
          let dlabel;
          if (days < 0) dlabel = `已过期${-days}天`;
          else if (days === 0) dlabel = '今天到期';
          else dlabel = `剩${days}天`;
          expLine = `保质 ${fmtDate(i.expiryDate)} · <span class="dl ${st}">${dlabel}</span>`;
        } else {
          expLine = '<span class="dl none">无保质期</span>';
        }
        const pd = i.purchaseDate ? `购 ${fmtDate(i.purchaseDate)}` : '';
        return `<div class="pantry-card ${st}" onclick="editPantry('${i.id}')">
          <div class="pc-bar"></div>
          <div class="pc-body">
            <div class="pc-top"><span class="pc-name">${esc(i.name)}</span><span class="pc-qty">${esc(i.quantity || '')}${esc(i.unit || '')}</span></div>
            ${tags ? `<div class="pc-tags">${tags}</div>` : ''}
            <div class="pc-meta">${pd ? `<span>${pd}</span><span class="sep">·</span>` : ''}<span>${expLine}</span></div>
          </div>
        </div>`;
      }).join('');
      return `<div class="pantry-group"><div class="pantry-group-h"><span class="pg-dot ${g.key}"></span>${g.label}<span class="pg-count">${groups[g.key].length}</span></div>${rows}</div>`;
    }).join('');
  }
  $app.innerHTML = `${banner}
    <button class="btn secondary" onclick="editPantry()" style="margin-bottom:12px">+ 添加食材</button>
    ${filterBar}
    <div>${list}</div>`;
}
async function editPantry(id) {
  let item = id ? await dbGet('pantry', id) : { name: '', quantity: '', unit: '', expiryDate: '', purchaseDate: '', tags: [], image: null };
  if (!item.tags) item.tags = [];
  const tagChips = (item.tags || []).map((t, idx) => {
    const [bg, fg] = tagColor(t);
    return `<span class="tag" style="background:${bg};color:${fg}">${esc(t)}<button class="x" style="font-size:13px;margin-left:4px;color:${fg}" onclick="event.stopPropagation();_ptItem.tags.splice(${idx},1);drawPantryTags()">✕</button></span>`;
  }).join('');
  const PRESET = ['蔬菜','肉类','蛋奶','水产','主食','调味','水果','零食','冷冻','饮料'];
  const presetBtns = PRESET.map(t => `<button type="button" class="add-mini" style="margin:2px" onclick="if(!_ptItem.tags.includes('${t}')){_ptItem.tags.push('${t}');drawPantryTags();}">${t}</button>`).join(' ');
  window._ptItem = item;
  function drawPantryTags() {
    const its = window._ptItem;
    const tc = (its.tags || []).map((t, idx) => {
      const [bg, fg] = tagColor(t);
      return `<span class="tag" style="background:${bg};color:${fg}">${esc(t)}<button class="x" style="font-size:13px;margin-left:4px;color:${fg}" onclick="event.stopPropagation();_ptItem.tags.splice(${idx},1);drawPantryTags()">✕</button></span>`;
    }).join('');
    const ps = PRESET.map(t => `<button type="button" class="add-mini" style="margin:2px" onclick="if(!_ptItem.tags.includes('${t}')){_ptItem.tags.push('${t}');drawPantryTags();}">${t}</button>`).join(' ');
    m.querySelector('#pt-tags-wrap').innerHTML = `<div style="margin-bottom:6px">${tc || '<span style="color:var(--muted);font-size:13px">无</span>'}</div><div>${ps}</div>`;
  }
  window.drawPantryTags = drawPantryTags;
  const m = el(`<div class="modal-bg" onclick="if(event.target===this)this.remove()">
    <div class="modal"><h2>${id ? '编辑' : '添加'}食材<button class="modal-close" onclick="this.closest('.modal-bg').remove()">✕</button></h2>
    <label>名称</label><input id="pt-name" value="${esc(item.name)}">
    <div class="row">
      <div><label>数量</label><input id="pt-qty" value="${esc(item.quantity)}"></div>
      <div><label>单位</label><input id="pt-unit" value="${esc(item.unit)}" placeholder="个/克/瓶…"></div>
    </div>
    <div class="row">
      <div><label>购买日期</label><input type="date" id="pt-pd" value="${item.purchaseDate ? item.purchaseDate.slice(0,10) : ''}"></div>
      <div><label>保质期</label><input type="date" id="pt-exp" value="${item.expiryDate ? item.expiryDate.slice(0,10) : ''}"></div>
    </div>
    <label>分类标签（可自定义）</label>
    <div id="pt-tags-wrap"><div style="margin-bottom:6px">${tagChips || '<span style="color:var(--muted);font-size:13px">无</span>'}</div><div>${presetBtns}</div></div>
    <input id="pt-tag-in" placeholder="输入分类后回车添加" onkeydown="if(event.key==='Enter'){event.preventDefault();const v=this.value.trim();if(v&&!_ptItem.tags.includes(v)){_ptItem.tags.push(v);drawPantryTags();}this.value='';}">
    <button class="btn" style="margin-top:12px" id="pt-save">保存</button>
  </div></div>`);
  document.body.appendChild(m);
  m._drawTags = drawPantryTags;
  m.querySelector('#pt-save').onclick = async () => {
    const v = { ...window._ptItem,
      name: m.querySelector('#pt-name').value.trim(),
      quantity: m.querySelector('#pt-qty').value.trim(),
      unit: m.querySelector('#pt-unit').value.trim(),
      purchaseDate: m.querySelector('#pt-pd').value ? new Date(m.querySelector('#pt-pd').value).toISOString() : '',
      expiryDate: m.querySelector('#pt-exp').value ? new Date(m.querySelector('#pt-exp').value).toISOString() : '',
    };
    if (!v.name) { alert('请填名称'); return; }
    await savePantry(v); m.remove(); renderPantry();
  };
  if (id) {
    const del = el(`<button class="btn danger" style="margin-top:8px" id="pt-del">删除</button>`);
    m.querySelector('.modal').appendChild(del);
    del.onclick = async () => { if (confirm('删除这个食材？')) { await deletePantry(id); m.remove(); renderPantry(); } };
  }
}

// =====================================================================
// SHOPPING
// =====================================================================
async function renderShopping() {
  const items = await listShopping();
  const bought = items.filter(i => i.checked);
  const todo = items.filter(i => !i.checked);
  let progress = '';
  if (items.length) {
    const pct = Math.round(bought.length / items.length * 100);
    progress = `<div class="shop-prog"><div class="shop-prog-fill" style="width:${pct}%"></div></div><div class="shop-prog-t">${bought.length}/${items.length} 已购 · ${pct}%</div>`;
  }
  let list = '';
  if (!items.length) {
    list = `<div class="empty"><div class="big">🛒</div>购物清单是空的<br>去日历某天点"生成备菜清单"自动加入</div>`;
  } else {
    const renderRow = i => `
      <div class="shop-card ${i.checked ? 'bought' : ''}" onclick="shopToggle('${i.id}')">
        <div class="sc-check">${i.checked ? '✓' : ''}</div>
        <div class="sc-body">
          <div class="sc-name">${esc(i.name)}</div>
          ${(i.amount || i.unit || i.note) ? `<div class="sc-sub">${esc(i.amount || '')}${esc(i.unit || '')}${i.note ? ' · ' + esc(i.note) : ''}</div>` : ''}
        </div>
        <button class="sc-del" onclick="event.stopPropagation();shopDel('${i.id}')">✕</button>
      </div>`;
    list = `
      ${todo.length ? `<div class="shop-sec">待购买<span class="ss-c">${todo.length}</span></div>${todo.map(renderRow).join('')}` : ''}
      ${bought.length ? `<div class="shop-sec done">已购<span class="ss-c">${bought.length}</span></div>${bought.map(renderRow).join('')}` : ''}
    `;
  }
  $app.innerHTML = `
    ${progress}
    <div class="row" style="margin:12px 0">
      <button class="btn secondary" onclick="shopAddManual()">+ 手动加一项</button>
      <button class="btn ghost" onclick="shopClearChecked()" ${bought.length ? '' : 'disabled'}>清理已购(${bought.length})</button>
    </div>
    <div>${list}</div>
  `;
}
async function shopToggle(id) { const i = await dbGet('shopping', id); i.checked = !i.checked; await saveShopping(i); renderShopping(); }
async function shopDel(id) { await deleteShopping(id); renderShopping(); }
async function shopClearChecked() {
  const items = await listShopping();
  const checked = items.filter(i => i.checked);
  if (!checked.length) return;
  // move checked into pantry (no expiry by default, tag today's purchase)
  const today = new Date().toISOString();
  for (const i of checked) {
    await savePantry({ name: i.name, quantity: i.amount, unit: i.unit, expiryDate: '', purchaseDate: today, tags: ['新购'] });
    await deleteShopping(i.id);
  }
  alert(`${checked.length}项已转入食材库`); renderShopping();
}
async function shopAddManual() {
  const m = el(`<div class="modal-bg" onclick="if(event.target===this)this.remove()">
    <div class="modal"><h2>添加购物项<button class="modal-close" onclick="this.closest('.modal-bg').remove()">✕</button></h2>
    <label>名称</label><input id="sh-name">
    <div class="row"><div><label>数量</label><input id="sh-qty"></div><div><label>单位</label><input id="sh-unit"></div></div>
    <button class="btn" style="margin-top:12px" id="sh-ok">加入</button></div></div>`);
  document.body.appendChild(m);
  m.querySelector('#sh-ok').onclick = async () => {
    const n = m.querySelector('#sh-name').value.trim();
    if (!n) return;
    await saveShopping({ name: n, amount: m.querySelector('#sh-qty').value.trim(), unit: m.querySelector('#sh-unit').value.trim(), checked: false, note: '手动' });
    m.remove(); renderShopping();
  };
}

// =====================================================================
// MORE (backup / about)
// =====================================================================
async function renderMore() {
  $app.innerHTML = `
    <div class="card">
      <div class="section-title">数据备份</div>
      <p style="font-size:13px;color:var(--muted)">数据只存在这台手机本地。换手机前请导出备份（不含图片，仅文字）。</p>
      <button class="btn secondary" onclick="moreExport()">导出备份(JSON)</button>
    </div>
    <div class="card">
      <div class="section-title">关于</div>
      <p style="font-size:13px;color:var(--muted)">CookCook — 离线可用的菜谱与餐单 PWA。<br>小红书导入为半自动（截图+实况文本复制+粘贴），非自动抓取。</p>
    </div>`;
}
async function moreExport() {
  const data = await exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cookcook-backup-${ymd(new Date())}.json`;
  a.click();
}

// ---------- service worker ----------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ---------- boot ----------
route();
