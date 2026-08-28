// app.js — routing, rendering, events for CookCook PWA
'use strict';

const $app = document.getElementById('app');
const $title = document.getElementById('view-title');
const $more = document.getElementById('more-btn');

// ---------- small helpers ----------
function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

// ---------- 图片诊断日志(排查"编辑/置顶后图片丢失") ----------
// 记录每次图片相关操作的 images 真实状态,丢图时可导出发给我看
window._imgLog = [];
function imgLog(op, id, images) {
  const arr = Array.isArray(images) ? images : [];
  const desc = arr.map(b => {
    if (b == null) return 'null';
    if (typeof b === 'string') return `str(${b.length})`;
    if (b instanceof Blob) return `Blob(${b.size})`;
    return `${typeof b}?`;
  });
  window._imgLog.push({ t: new Date().toISOString().slice(11, 23), op, id: id || '-', n: arr.length, imgs: desc });
  if (window._imgLog.length > 200) window._imgLog.shift();
}
// 生成图片 object URL；记下来,渲染前统一 revoke,避免 iOS Safari 内存压力回收 Blob 导致图片丢失
let _objURLs = [];
function imgURL(blob) {
  if (!blob) return '';
  if (typeof blob === 'string') return blob; // base64 data URL 直接用,不创建 object URL
  const u = URL.createObjectURL(blob);
  _objURLs.push(u);
  if (window._imgLog) imgLog('imgURL(create)', u.slice(-12), [blob]);
  return u;
}
function revokeObjURLs() {
  _objURLs.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} }); _objURLs = [];
}
// 延后释放上一页的 object URL:等旧页图片加载完+新页渲染完再释放,避免提前释放导致图不显示
function revokeObjURLsDelayed() {
  const old = _objURLs; _objURLs = [];
  setTimeout(() => { old.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} }); }, 2000);
}
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
// 卡路里显隐开关：默认隐藏（不准+超标），眼睛图标切换，存 meta 跨重开持久
let showKcal = false;
(async () => { try { showKcal = !!(await getMeta('showKcal')); } catch (e) {} })();
async function toggleKcal() {
  showKcal = !showKcal;
  try { await setMeta('showKcal', showKcal); } catch (e) {}
  const ico = document.getElementById('kcal-eye');
  if (ico) ico.textContent = showKcal ? '👁' : '🙈';
  // 重画当前页让卡路里显隐生效
  route();
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
  revokeObjURLsDelayed(); // 切页时延后2秒释放上一页图片URL(等加载完),避免提前释放导致图不显示
  // 离开选菜模式:清加购态 + 移除底部篮条(篮子数据保留,只是不显示)
  if (!hash.startsWith('/pick')) { pickLeave(); cartBarRemove(); }
  // 离开餐单页:重置编辑态,避免"点了编辑没完成就返回"后,再点日历任何一天都进编辑态
  if (!hash.startsWith('/day/')) { window._dayEditMode = false; }
  if (hash.startsWith('/calendar')) { setTitle('日历'); renderCalendar(); }
  else if (hash.startsWith('/day/')) { setTitle('餐单'); renderDay(hash.slice('/day/'.length)); }
  else if (hash.startsWith('/recipes')) { setTitle('菜谱'); renderRecipes(); }
  else if (hash.startsWith('/pick')) { setTitle('选菜加购'); renderPick(); }
  else if (hash.startsWith('/recipe/new')) { setTitle('新建菜谱'); renderRecipeEdit(null); }
  else if (hash.startsWith('/recipe/') && hash.endsWith('/edit')) { setTitle('编辑菜谱'); renderRecipeEdit(hash.slice('/recipe/'.length, -'/edit'.length)); }
  else if (hash.startsWith('/recipe/')) { setTitle('菜谱详情'); renderRecipeDetail(hash.slice('/recipe/'.length)); }
  else if (hash.startsWith('/import')) { location.hash = '/recipe/new'; return; } // 已合并进新建菜谱页
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
    const tab = a.dataset.tab;
    let on = h === '/' + tab || h.startsWith('/' + tab + '/');
    if (tab === 'calendar' && (h === '/day' || h.startsWith('/day/'))) on = true; // 餐单页是日历子页，日历tab保持高亮
    a.classList.toggle('active', on);
  });
}

// ---------- more menu ----------
function closeMoreMenu() { const m = document.getElementById('more-menu'); if (m) m.remove(); }
$more.addEventListener('click', (e) => {
  e.stopPropagation();
  if (document.getElementById('more-menu')) { closeMoreMenu(); return; }
  const m = el(`<div id="more-menu" class="card" style="position:fixed;top:52px;right:8px;z-index:30;width:180px;padding:6px">
    <a href="#/more" style="display:block;padding:10px;border-radius:8px;color:var(--text);text-decoration:none">数据备份 / 恢复</a>
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
  const offset = (d.getDay() + 6) % 7; // 周一为周首:周一=0...周日=6(原getDay 0=周日)
  d.setDate(d.getDate() - offset);
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
  const f = first.slice(5).replace('-', '/'); // MM/DD
  const l = last.slice(5).replace('-', '/');  // MM/DD
  const rangeLabel = `${f}~${l}`;
  const m1 = +first.slice(5, 7), m2 = +last.slice(5, 7);
  const y1 = +first.slice(0, 4), y2 = +last.slice(0, 4);
  const yearLabel = y1 === y2 ? `${y1}年` : `${y1}→${y2}年`;
  const monthLabel = m1 === m2 ? `${m1}月` : `${m1}-${m2}月`;

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
        const chips = entries.map(e => esc(e.type === 'recipe'
          ? (recipeMap.get(e.recipeId)?.title || '（已删除）')
          : e.text)).map(t => `<span class="wk-chip">${t}</span>`).join('');
        meals += `<div class="wk-meal" style="--mc:${color}"><span class="wk-bar"></span><span class="wk-l">${label}</span><span class="wk-chips">${chips}</span></div>`;
      }
    }
    const cls = ['wk-row', isToday ? 'today' : '', meals ? 'has-plan' : '', (dow===0||dow===6) ? 'wknd' : ''].filter(Boolean).join(' ');
    return `<div class="${cls}" onclick="location.hash='/day/${ds}'">
      <div class="wk-date"><span class="wk-dow ${dow===0||dow===6?'wknd':''}">${dowCN}</span><span class="wk-num">${d.getDate()}</span>${isToday?'<span class="wk-today">今</span>':''}</div>
      <div class="wk-meals">${meals || '<span class="wk-empty">还没安排，点这里加餐</span>'}</div>
    </div>`;
  }

  $app.innerHTML = `
    <div class="cal-nav">
      <button class="cal-arrow" onclick="shiftWeek(-7)">‹</button>
      <div class="cal-month">
        <div class="cal-year">${yearLabel}</div>
        <div class="cal-range">${rangeLabel} <span class="cal-mo">· ${monthLabel}</span></div>
      </div>
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
  const editing = window._dayEditMode;
  // 单选展开(仅编辑态用)：换天重置；默认展开第一个有内容的餐次
  if (window._dayExpDate !== date) {
    window._dayExpDate = date;
    window._dayExpKey = null;
    for (const [key] of MEAL_SLOTS) { if ((plan[key] || []).length) { window._dayExpKey = key; break; } }
  }
  let slots = '';
  for (const [key, label, color] of MEAL_SLOTS) {
    const entries = plan[key] || [];
    if (editing) {
      // ===== 编辑态:单选折叠 + ✕ + 加菜按钮(原样) =====
      const expanded = window._dayExpKey === key;
      let rows = '';
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const isRecipe = e.type === 'recipe';
        const txt = isRecipe ? (recipeMap.get(e.recipeId)?.title || '（菜谱已删除）') : e.text;
        const kcal = isRecipe ? recipeKcal(recipeMap.get(e.recipeId)?.ingredients || []) : null;
        const kcalTxt = (showKcal && isRecipe && kcal && kcal.matched) ? ` <span class="meal-kcal">${kcal.total}kcal</span>` : '';
        rows += `<div class="meal-row">
          <span class="meal-dot" style="background:${color}"></span>
          <span class="meal-name">${isRecipe?'🍳 ':''}${esc(txt)}${kcalTxt}</span>
          <button class="meal-x" onclick="dayRemove('${date}','${key}',${i})">✕</button>
        </div>`;
      }
      const empty = !entries.length ? `<div class="meal-empty">还没安排</div>` : '';
      const body = `<div class="meal-list">${rows}${empty}</div>
        <div class="meal-actions">
          <button class="meal-add" onclick="dayAddRecipe('${date}','${key}')">+ 选菜谱</button>
          <button class="meal-add" onclick="dayAddFree('${date}','${key}')">+ 自定义</button>
        </div>`;
      slots += `<div class="meal-slot ${expanded?'open':'closed'}" style="border-left:4px solid ${color}">
        <div class="meal-head" onclick="toggleMealSlot('${key}')">
          <span class="meal-label" style="color:${color}">${label}</span>
          ${entries.length ? `<span class="meal-count">${entries.length}项</span>` : ''}
          <span class="meal-caret">${expanded?'▾':'▸'}</span>
        </div>
        ${expanded ? body : ''}
      </div>`;
    } else {
      // ===== 查看态:只显示有内容的餐次,只读,菜谱带大缩略图,无✕无加菜按钮 =====
      if (!entries.length) continue; // 没加菜的餐次不显示,省地方
      const rows = entries.map(e => {
        const isRecipe = e.type === 'recipe';
        if (isRecipe) {
          const r = recipeMap.get(e.recipeId);
          const title = r?.title || '（菜谱已删除）';
          const thumb = r?.images?.[0] ? `<img class="dv-thumb" src="${imgURL(r.images[0])}">` : `<div class="dv-thumb dv-thumb-empty">🍳</div>`;
          const ingCount = (r?.ingredients || []).length;
          const sub = ingCount ? `<span class="dv-sub">${ingCount} 样食材</span>` : '';
          return `<div class="dv-row" onclick="location.hash='/recipe/${e.recipeId}'">${thumb}<div class="dv-info"><span class="dv-name">${esc(title)}</span>${sub}</div></div>`;
        }
        return `<div class="dv-row"><div class="dv-thumb dv-thumb-empty">🍽️</div><div class="dv-info"><span class="dv-name">${esc(e.text)}</span><span class="dv-sub">自定义</span></div></div>`;
      }).join('');
      slots += `<div class="dv-slot" style="border-left:4px solid ${color}">
        <div class="dv-head"><span class="dv-label" style="color:${color}">${label}</span><span class="dv-count">${entries.length}</span></div>
        <div class="dv-list">${rows}</div>
      </div>`;
    }
  }
  // 全天没菜:给个空状态,不然页面只有顶部日期干巴巴
  if (!editing && !slots) { slots = `<div class="dv-none"><div class="big">🍽️</div>这一天还没安排菜单<br>点右上 ✏️ 加几道</div>`; }
  // 编辑/完成按钮放顶部 banner 右侧,永远可见,不跟内容长度走
  const editBtn = editing
    ? `<button class="day-edit" onclick="dayDoneEdit()">✓</button>`
    : `<button class="day-edit" onclick="dayStartEdit()">✏️</button>`;
  // 生成备菜清单:仅查看态显示(编辑态忙着加菜,不需要)
  const genBtn = editing ? '' : `<div class="day-foot"><button class="btn" onclick="dayGenList('${date}')">🛒 生成备菜清单</button></div>`;
  $app.innerHTML = `
    <div class="day-banner">
      <button class="day-back" onclick="history.back()">‹ 返回</button>
      <div class="day-banner-d">${fmtDate(date)}</div>
      ${editBtn}
    </div>
    ${slots}
    ${genBtn}
  `;
}
function dayStartEdit() { window._dayEditMode = true; renderDayKeepScroll(location.hash.slice(1).slice('/day/'.length)); }
function dayDoneEdit() { window._dayEditMode = false; renderDayKeepScroll(location.hash.slice(1).slice('/day/'.length)); }
function toggleMealSlot(key) {
  // 单选展开：点已展开的→收起；点别的→展开它、收起原来的
  window._dayExpKey = (window._dayExpKey === key) ? null : key;
  // 注意 location.hash 带前导 #，要先 slice(1) 去掉再取 date，否则 date 会带 / 变成 NaN
  renderDayKeepScroll(location.hash.slice(1).slice('/day/'.length));
}
let _dayScrollY = 0;
function renderDayKeepScroll(date) {
  _dayScrollY = window.scrollY;
  renderDay(date).then(() => { window.scrollTo(0, _dayScrollY); });
}

async function dayAddRecipe(date, key) {
  const recipes = await listRecipes();
  if (!recipes.length) { alert('还没有菜谱，先去"菜谱"tab新建一个吧'); return; }
  // 记住从哪顿进来,作为篮内新加菜谱的默认日期+餐次预填
  window._pickDefault = { date, meal: key };
  location.hash = '/pick';
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
    await savePlan(plan); m.remove();
    window._dayExpKey = key;
    renderDayKeepScroll(date);
  };
}
async function dayRemove(date, key, idx) {
  const plan = await getPlanCompat(date);
  plan[key].splice(idx, 1);
  await savePlan(plan); renderDayKeepScroll(date);
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
  window._knownTags = allTags; // 缓存已用标签,供编辑/导入页的标签按钮用
  const modeBtn = (m, label, icon) => {
    const on = recipeFilterMode === m;
    return `<button class="add-mini" style="background:${on?'var(--accent)':'var(--card)'};color:${on?'#fff':'var(--accent)'};border:1px solid var(--accent)" onclick="setRecipeFilterMode('${m}')">${icon} ${label}</button>`;
  };
  if (!recipes.length) {
    $app.innerHTML = `
      <div class="card"><div class="empty"><div class="big">🍳</div>还没有菜谱<br>点下面 ＋ 新建一道</div></div>
      <button class="fab" onclick="location.hash='/recipe/new'">＋</button>`;
    return;
  }
  if (!window._recipeTags) window._recipeTags = [];
  const selTags = window._recipeTags;
  const tagBtnLabel = selTags.length ? `标签 ${selTags.length} 选 ▾` : '标签 ▾';
  const tagBtnOn = selTags.length > 0;
  // 框架：搜索框 + 筛选条 + 切换浮层 + 列表容器（列表容器单独刷新，搜索框不被重画）
  $app.innerHTML = `
    <div class="card">
      <div class="search-bar"><input id="rec-search" placeholder="🔍 搜菜谱名或食材" value="${esc(recipeSearch)}" oninput="setRecipeSearch(this.value)"></div>
      <div class="rec-filter-row">
        <button class="add-mini" style="background:${recipeFilterMode==='all'?'var(--accent)':'var(--card)'};color:${recipeFilterMode==='all'?'#fff':'var(--accent)'};border:1px solid var(--accent)" onclick="setRecipeFilterMode('all')">全部</button>
        ${modeBtn('fav','收藏','★')}
        ${modeBtn('cooked','做过','✓')}
        ${allTags.length ? `<button class="add-mini tag-toggle ${tagBtnOn?'on':''}" onclick="toggleTagPicker()">${tagBtnLabel}</button>` : ''}
        <button class="add-mini kcal-toggle ${showKcal?'on':''}" onclick="toggleKcal();refreshRecipeList()" title="显示/隐藏卡路里">${showKcal?'👁 热量':'🙈 热量'}</button>
      </div>
      <div id="tag-picker" class="tag-picker" style="display:none"></div>
      <div id="rec-list"></div>
    </div>
    <div class="fab-bar">
      <button class="fab-pill pick-enter" onclick="enterPickFromRecipes()">🛒 选购</button>
      <button class="fab-pill add" onclick="location.hash='/recipe/new'">＋ 新建</button>
    </div>`;
  refreshRecipeList();
  drawTagPicker();
}

// ---------- 选菜加购模式 (/pick) ----------
// 从菜谱主界面进选购:不预填日期餐次,纯多选,分配时再选
function enterPickFromRecipes() {
  window._pickDefault = null;
  location.hash = '/pick';
}
// 进入时记下来源 date+meal(预填用),设 _pickMode 让菜谱卡显示加购按钮
async function pickAdd(rid) {
  const r = await getRecipe(rid);
  const title = r ? (r.title || '') : '（菜谱已删除）';
  const d = window._pickDefault || {};
  cartAdd(rid, title, d.date, d.meal);
  toast(`已加入待分配篮`);
  drawCartBar();
}
async function renderPick() {
  window._pickMode = true;
  const recipes = await listRecipes();
  if (!recipes.length) {
    window._pickMode = false;
    $app.innerHTML = `<div class="card"><div class="empty"><div class="big">🍳</div>还没有菜谱<br>先去新建一道</div></div><button class="btn ghost" onclick="history.back()">返回</button>`;
    return;
  }
  const d = window._pickDefault || {};
  const hint = (d.date && d.meal) ? `正在为 ${fmtDate(d.date)} 的 ${({breakfast:'早餐',morning_snack:'早加餐',lunch:'午餐',afternoon_snack:'午加餐',dinner:'晚餐',evening_snack:'晚加餐'}[d.meal])} 选菜` : '选菜加购,稍后统一分配到餐';
  const allTags = [...new Set(recipes.flatMap(r => r.tags || []))];
  window._knownTags = allTags; // 缓存已用标签,供编辑/导入页的标签按钮用
  if (!window._recipeTags) window._recipeTags = [];
  const selTags = window._recipeTags;
  const tagBtnLabel = selTags.length ? `标签 ${selTags.length} 选 ▾` : '标签 ▾';
  const tagBtnOn = selTags.length > 0;
  const modeBtn = (m, label, icon) => {
    const on = recipeFilterMode === m;
    return `<button class="add-mini" style="background:${on?'var(--accent)':'var(--card)'};color:${on?'#fff':'var(--accent)'};border:1px solid var(--accent)" onclick="setRecipeFilterMode('${m}')">${icon} ${label}</button>`;
  };
  $app.innerHTML = `
    <div class="pick-hint"><span>${esc(hint)} · 点菜谱卡或＋加购,可多选,底部统一分配</span><button class="pick-exit" onclick="location.hash='/recipes'">退出选购</button></div>
    <div class="card">
      <div class="search-bar"><input id="rec-search" placeholder="🔍 搜菜谱名或食材" value="${esc(recipeSearch)}" oninput="setRecipeSearch(this.value)"></div>
      <div class="rec-filter-row">
        <button class="add-mini" style="background:${recipeFilterMode==='all'?'var(--accent)':'var(--card)'};color:${recipeFilterMode==='all'?'#fff':'var(--accent)'};border:1px solid var(--accent)" onclick="setRecipeFilterMode('all')">全部</button>
        ${modeBtn('fav','收藏','★')}
        ${modeBtn('cooked','做过','✓')}
        ${allTags.length ? `<button class="add-mini tag-toggle ${tagBtnOn?'on':''}" onclick="toggleTagPicker()">${tagBtnLabel}</button>` : ''}
        <button class="add-mini kcal-toggle ${showKcal?'on':''}" onclick="toggleKcal();refreshRecipeList()" title="显示/隐藏卡路里">${showKcal?'👁 热量':'🙈 热量'}</button>
      </div>
      <div id="tag-picker" class="tag-picker" style="display:none"></div>
      <div id="rec-list"></div>
    </div>`;
  refreshRecipeList();
  drawTagPicker();
  drawCartBar();
}
// 离开选菜模式(route 切到别的页时)清 _pickMode
function pickLeave() { window._pickMode = false; }
// 底部 sticky 篮条
function drawCartBar() {
  const old = document.getElementById('cart-bar');
  if (old) old.remove();
  const cart = getCart();
  if (!cart.length) return;
  const bar = el(`<div id="cart-bar" class="cart-bar" onclick="openCartSheet()">
    <span class="cb-icon">🛒</span>
    <span class="cb-text">待分配 <b>${cart.length}</b> 道</span>
    <span class="cb-btn">分配到餐</span>
  </div>`);
  document.body.appendChild(bar);
}
function cartBarRemove() { const b = document.getElementById('cart-bar'); if (b) b.remove(); }

// 分配 sheet:每道菜用 chip 选日期(带星期+今天/周末)+餐次(带配色),所见即所得
const MEAL_OPTS = [
  ['breakfast','早餐','#f4b860'], ['morning_snack','早加餐','#e89b6f'], ['lunch','午餐','#6fa8d6'],
  ['afternoon_snack','午加餐','#8dbf6f'], ['dinner','晚餐','#a07cd6'], ['evening_snack','晚加餐','#d68f9b'],
];
const DOW_CN = ['日','一','二','三','四','五','六'];
function openCartSheet() {
  const cart = getCart();
  if (!cart.length) return;
  const today = ymd(new Date());
  const days = [0,1,2,3,4,5,6].map(o => { const d = new Date(); d.setDate(d.getDate()+o); const s = ymd(d); return { s, label: fmtDate(s), dow: d.getDay(), isToday: s===today }; });
  const dflt = window._pickDefault || {};
  const rows = cart.map((it, idx) => {
    const date = it.date || dflt.date || today;
    const meal = it.meal || dflt.meal || 'dinner';
    const dateChips = days.map(dd => {
      const wknd = (dd.dow === 0 || dd.dow === 6);
      const on = dd.s === date;
      const tag = dd.isToday ? '今天' : `周${DOW_CN[dd.dow]}`;
      return `<button class="cs-chip cs-d ${on?'on':''} ${wknd?'wknd':''}" data-k="${dd.s}">${dd.label}<em>${tag}</em></button>`;
    }).join('');
    const mealChips = MEAL_OPTS.map(([k,l,c]) => {
      const on = k === meal;
      return `<button class="cs-chip cs-m ${on?'on':''}" style="--mc:${c}" data-k="${k}">${l}</button>`;
    }).join('');
    return `<div class="cs-row">
      <div class="cs-head"><span class="cs-name">${esc(it.title || '（菜谱已删除）')}</span><button class="cs-del" onclick="event.stopPropagation();cartDelFromSheet(${idx},this)">✕</button></div>
      <div class="cs-chips cs-dates" data-idx="${idx}">${dateChips}</div>
      <div class="cs-chips cs-meals" data-idx="${idx}">${mealChips}</div>
    </div>`;
  }).join('');
  const m = el(`<div class="modal-bg" onclick="if(event.target===this)this.remove()">
    <div class="modal cart-sheet">
      <div class="cs-top"><h2>分配到餐 <button class="modal-close" onclick="this.closest('.modal-bg').remove()">✕</button></h2>
      <p class="cs-sub">每道菜选哪天 + 哪顿,选好点底部一键加入餐单</p></div>
      <div class="cs-list">${rows}</div>
      <div class="cs-foot">
        <button class="btn ghost" onclick="cartClear();this.closest('.modal-bg').remove();cartBarRemove();toast('已清空篮子')">清空</button>
        <button class="btn" id="cs-commit">全部加入餐单</button>
      </div>
    </div></div>`);
  document.body.appendChild(m);
  // chip 点选后局部高亮更新(不整页重画,避免滚动跳)
  m.querySelectorAll('.cs-chips').forEach(grp => {
    grp.addEventListener('click', (e) => {
      const chip = e.target.closest('.cs-chip'); if (!chip) return;
      grp.querySelectorAll('.cs-chip').forEach(c => c.classList.remove('on'));
      chip.classList.add('on');
    });
  });
  m.querySelector('#cs-commit').onclick = async () => {
    // 读 sheet 里每行 chip 的实际选中态(而非依赖 cartSetDM,因为点选只改了 DOM 高亮)
    const cartNow = getCart();
    for (let idx = 0; idx < cartNow.length; idx++) {
      const row = m.querySelectorAll('.cs-row')[idx];
      if (!row) continue;
      const dOn = row.querySelector('.cs-dates .cs-chip.on');
      const mOn = row.querySelector('.cs-meals .cs-chip.on');
      if (dOn && mOn) cartSetDM(idx, dOn.dataset.k || dOn.textContent, mOn.dataset.k);
    }
    const btn = m.querySelector('#cs-commit'); btn.disabled = true; btn.textContent = '分配中…';
    let n = 0;
    for (let idx = getCart().length - 1; idx >= 0; idx--) {
      const item = getCart()[idx];
      if (item && item.date && item.meal) { await cartCommit(idx); cartRemove(idx); n++; }
    }
    m.remove();
    cartBarRemove();
    toast(`已把 ${n} 鬥菜加入餐单`);
    const d = window._pickDefault || {};
    location.hash = d.date ? `/day/${d.date}` : '/calendar';
  };
}
// 分配sheet里删一条:先关当前modal(避免叠加多个),删数据,篮还有货就重开sheet,没了就清篮条
function cartDelFromSheet(idx, btnEl) {
  const modal = btnEl.closest('.modal-bg');
  cartRemove(idx);
  const left = getCart().length;
  if (modal) modal.remove();
  if (left) { openCartSheet(); }
  else { cartBarRemove(); }
  drawCartBar();
}

// 标签多选浮层：展开/收起 + 渲染 checkbox 列表
function toggleTagPicker() {
  const p = document.getElementById('tag-picker');
  if (!p) return;
  p.style.display = (p.style.display === 'none') ? 'block' : 'none';
  if (p.style.display === 'block') drawTagPicker();
}
function drawTagPicker() {
  const p = document.getElementById('tag-picker');
  if (!p) return;
  // 重新取最新标签（菜谱可能增删过）
  listRecipes().then(rs => {
    const all = [...new Set(rs.flatMap(r => r.tags || []))];
    const sel = window._recipeTags || [];
    p.innerHTML = `
      <div class="tp-head">
        <span>勾选标签筛选（可多选，含任一即显示）</span>
        <button class="tp-clear" onclick="clearRecipeTags()">${sel.length?'清空':''}</button>
      </div>
      <div class="tp-list">
        ${all.length ? all.map(t => {
          const [bg, fg] = tagColor(t);
          const on = sel.includes(t);
          return `<label class="tp-item ${on?'on':''}" style="--bg:${bg};--fg:${fg}">
            <input type="checkbox" ${on?'checked':''} onchange="toggleRecipeTag('${esc(t)}')">
            <span class="tp-chip">${esc(t)}</span>
          </label>`;
        }).join('') : '<div class="tp-empty">还没有标签，编辑菜谱时可加</div>'}
      </div>
      <div class="tp-foot">${sel.length?`已选 ${sel.length} 个`:'未选（不过滤）'}</div>`;
  });
}
function toggleRecipeTag(t) {
  if (!window._recipeTags) window._recipeTags = [];
  const i = window._recipeTags.indexOf(t);
  if (i >= 0) window._recipeTags.splice(i, 1);
  else window._recipeTags.push(t);
  // 只更新该 checkbox 项的选中态，不重画整个浮层（避免闪烁）
  const items = document.querySelectorAll('#tag-picker .tp-item');
  items.forEach(item => {
    const chip = item.querySelector('.tp-chip');
    if (chip && chip.textContent === t) {
      const on = window._recipeTags.includes(t);
      item.classList.toggle('on', on);
      const cb = item.querySelector('input'); if (cb) cb.checked = on;
    }
  });
  // 更新底部计数 + 顶部按钮
  const foot = document.querySelector('#tag-picker .tp-foot');
  if (foot) foot.textContent = window._recipeTags.length ? `已选 ${window._recipeTags.length} 个` : '未选（不过滤）';
  const head = document.querySelector('#tag-picker .tp-head');
  if (head) { const clear = head.querySelector('.tp-clear'); if (clear) clear.textContent = window._recipeTags.length ? '清空' : ''; }
  updateTagToggleBtn();
  refreshRecipeList();
}
function updateTagToggleBtn() {
  const btn = document.querySelector('.tag-toggle');
  if (!btn) return;
  const n = (window._recipeTags || []).length;
  btn.textContent = n ? `标签 ${n} 选 ▾` : '标签 ▾';
  btn.classList.toggle('on', n > 0);
}
function clearRecipeTags() {
  window._recipeTags = [];
  document.querySelectorAll('#tag-picker .tp-item').forEach(item => {
    item.classList.remove('on');
    const cb = item.querySelector('input'); if (cb) cb.checked = false;
  });
  const foot = document.querySelector('#tag-picker .tp-foot');
  if (foot) foot.textContent = '未选（不过滤）';
  const clear = document.querySelector('#tag-picker .tp-clear');
  if (clear) clear.textContent = '';
  updateTagToggleBtn();
  refreshRecipeList();
}

// 只刷新列表区（搜索/筛选时调用，不碰搜索框）
async function refreshRecipeList() {
  const box = document.getElementById('rec-list');
  if (!box) return;
  const recipes = await listRecipes();
  const q = recipeSearch.trim();
  const activeTags = window._recipeTags || [];
  let filtered = recipes;
  if (q) {
    // 模糊匹配：标题或任一食材名包含搜索词（大小写不敏感，中文同样适用）
    const ql = q.toLowerCase();
    filtered = filtered.filter(r => {
      if ((r.title || '').toLowerCase().includes(ql)) return true;
      return (r.ingredients || []).some(i => (i.name || '').toLowerCase().includes(ql));
    });
  }
  if (activeTags.length) filtered = filtered.filter(r => (r.tags || []).some(t => activeTags.includes(t)));
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
    const kcalTag = (showKcal && kcal.matched) ? `<span class="tag" style="background:#fbe7d2;color:#a85a1a">${kcal.total} 热量</span>` : '';
    const tagTags = (r.tags || []).map(tagChipRO).join('');
    const pinIcon = r.pinned ? `<span class="pin-mark" title="置顶">📌</span>` : '';
    const favBtn = `<span class="rec-fav ${r.fav?'on':''}" onclick="toggleFav('${r.id}',event)">${r.fav?'★':'☆'}</span>`;
    const cookedMark = r.cooked ? `<span class="tag" style="background:#e8f5e1;color:#3a7d2a">✓ 做过</span>` : '';
    const ratingStars = r.cooked && r.rating ? starsRO(r.rating) : '';
    const pickMode = window._pickMode;
    const addBtn = pickMode ? `<button class="add-cart" onclick="event.stopPropagation();pickAdd('${r.id}')">＋ 加购</button>` : '';
    const cardClick = pickMode ? `pickAdd('${r.id}')` : `location.hash='/recipe/${r.id}'`;
    return `<div class="recipe-item ${r.pinned?'pinned':''} ${r.cooked?'cooked':''} ${pickMode?'pick':''}" onclick="${cardClick}">
      ${thumb}<div class="meta"><div class="t">${pinIcon}${esc(r.title)} ${favBtn}</div>
      <div class="s">${cookedMark}${ratingStars}${tagTags}${kcalTag}<br>${esc(ings.slice(0, 40))}</div>${addBtn}</div></div>`;
  }).join('');
}

async function renderRecipeDetail(id) {
  const r = await getRecipe(id);
  if (!r) { $app.innerHTML = `<div class="empty">菜谱不存在</div><button class="btn ghost" onclick="history.back()">返回</button>`; return; }
  imgLog('renderDetail', id, r.images);
  let imgs = (r.images || []).map(b => `<img src="${imgURL(b)}" style="width:100%;border-radius:12px;margin-bottom:8px">`).join('');
  // 食材 + 每项卡路里（受全局 showKcal 开关控制）— 两列对齐清单
  const kcal = recipeKcal(r.ingredients || []);
  let ings = (r.ingredients || []).map((i, idx) => {
    const k = estimateIngredientKcal(i);
    const kcalTxt = (showKcal && k.matched && k.kcal != null) ? `<span class="ing-kcal">${k.kcal} kcal${k.approx ? '~' : ''}</span>` : (showKcal ? `<span class="ing-kcal ing-kcal-na">—</span>` : '');
    return `<div class="ing-row">
      <span class="ing-idx">${idx + 1}</span>
      <span class="ing-name">${esc(i.name)}</span>
      <span class="ing-amount">${esc(i.amount || '')}${esc(i.unit || '')}</span>
      ${kcalTxt}
    </div>`;
  }).join('');
  const linkBlock = r.link ? `<div class="link-box"><div class="link-label">小红书链接 · 点复制去 app 里看</div><div class="link-row"><input class="link-text" value="${esc(r.link)}" readonly onclick="this.select()"><button class="link-copy" onclick="copyLink('${esc(r.link)}')">复制</button></div></div>` : '';
  const tagRow = (r.tags && r.tags.length) ? `<div style="margin:8px 0">${r.tags.map(tagChipRO).join('')}</div>` : '';
  const unmatchedHint = kcal.unmatched.length ? `<div style="font-size:12px;color:var(--muted);margin-top:4px">未估算：${kcal.unmatched.map(esc).join('、')}</div>` : '';
  const kcalBlock = (showKcal && kcal.matched) ? `<div class="section-title">估算热量</div><div class="card"><b style="font-size:20px;color:var(--accent)">${kcal.total}</b> kcal（整份，约 ${(kcal.total/230).toFixed(1)} 碗米饭）${unmatchedHint}</div>` : '';
  // 标题栏：标题 + 收藏/置顶按钮（卡路里开关已挪到菜单主界面，统一控制）
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
    <div class="row" style="margin-top:12px">
      <button class="btn" onclick="planRecipeDirect('${id}')">📅 安排到某天某顿</button>
    </div>
    <div class="row" style="margin-top:8px">
      <button class="btn secondary" onclick="editRecipe('${id}')">编辑</button>
      <button class="btn danger" onclick="delRecipe('${id}')">删除</button>
    </div>
    <button class="btn ghost" onclick="history.back()" style="margin-top:8px">返回</button>
  `;
}
// 详情页"直接安排到某天某顿"快车道:不走篮子,弹sheet选完直接写入plan
function planRecipeDirect(id) {
  const today = ymd(new Date());
  const days = [0,1,2,3,4,5,6].map(o => { const d = new Date(); d.setDate(d.getDate()+o); return ymd(d); });
  const m = el(`<div class="modal-bg" onclick="if(event.target===this)this.remove()">
    <div class="modal">
      <h2>安排到餐单<button class="modal-close" onclick="this.closest('.modal-bg').remove()">✕</button></h2>
      <label>哪天</label>
      <select id="pd-date">${days.map(d => `<option value="${d}">${fmtDate(d)}${d===today?' (今天)':''}</option>`).join('')}</select>
      <label style="margin-top:8px">哪顿</label>
      <select id="pd-meal">${MEAL_OPTS.map(([k,l]) => `<option value="${k}">${l}</option>`).join('')}</select>
      <button class="btn" style="margin-top:12px" id="pd-ok">加入餐单</button>
    </div></div>`);
  document.body.appendChild(m);
  m.querySelector('#pd-ok').onclick = async () => {
    const date = m.querySelector('#pd-date').value, meal = m.querySelector('#pd-meal').value;
    const plan = await getPlanCompat(date);
    plan[meal] = plan[meal] || [];
    plan[meal].push({ type: 'recipe', recipeId: id });
    await savePlan(plan);
    m.remove();
    toast(`已加入 ${fmtDate(date)} 的 ${({breakfast:'早餐',morning_snack:'早加餐',lunch:'午餐',afternoon_snack:'午加餐',dinner:'晚餐',evening_snack:'晚加餐'}[meal])}`);
    location.hash = `/day/${date}`;
  };
}
async function editRecipe(id) { location.hash = `/recipe/${id}/edit`; }
async function delRecipe(id) {
  if (!confirm('确定删除这个菜谱？')) return;
  await deleteRecipe(id); location.hash = '/recipes';
}

// shared editor for new + edit (also used by import after parsing)
let editState = null; // {id?, title, link, ingredients:[], steps:[], images:[], tags:[]}

async function renderRecipeEdit(id) {
  if (id) {
    const r = await getRecipe(id);
    imgLog('renderEdit(init)', id, r.images);
    // images 断开引用拷贝,避免 editState 与 DB 对象共享数组引用导致意外修改原记录
    editState = { id: r.id, title: r.title || '', link: r.link || '', ingredients: (r.ingredients || []).map(i => ({ ...i })), steps: (r.steps || []).map(s => ({ ...s })), images: (r.images || []).slice(), tags: (r.tags || []).slice() };
  } else {
    editState = { title: '', link: '', ingredients: [], steps: [], images: [], tags: [] };
  }
  drawRecipeEditor();
}
function drawRecipeEditor() {
  // revokeObjURLs(); // 暂停主动释放,验证图不显示根因
  const s = editState;
  let ingRows = s.ingredients.map((i, idx) => `
    <div class="ing-edit-row"><input class="n" placeholder="食材" value="${esc(i.name)}" oninput="editState.ingredients[${idx}].name=this.value">
    <input class="a" placeholder="量" value="${esc(i.amount)}" oninput="editState.ingredients[${idx}].amount=this.value">
    <input class="u" placeholder="单位" value="${esc(i.unit)}" oninput="editState.ingredients[${idx}].unit=this.value">
    <button class="x" onclick="editState.ingredients.splice(${idx},1);drawRecipeEditor()">✕</button></div>`).join('');
  let stepRows = s.steps.map((st, idx) => `
    <div class="ing-edit-row"><input class="n" placeholder="第${idx + 1}步" value="${esc(st.text || st)}" oninput="editState.steps[${idx}].text=this.value">
    <button class="x" onclick="editState.steps.splice(${idx},1);drawRecipeEditor()">✕</button></div>`).join('');
  let imgs = s.images.map((b, idx) => `<div class="img-tile"><img src="${imgURL(b)}"><button class="img-del" onclick="editState.images.splice(${idx},1);drawRecipeEditor()">✕</button></div>`).join('');
  const tagChips = (s.tags || []).map((t, idx) => {
    const [bg, fg] = tagColor(t);
    return `<span class="tag" style="background:${bg};color:${fg}">${esc(t)}<button class="x" style="font-size:13px;margin-left:4px;color:${fg}" onclick="editState.tags.splice(${idx},1);drawRecipeEditor()">✕</button></span>`;
  }).join('');
  const PRESET_TAGS = ['轻食','减脂','辣口','清淡','重口','高蛋白','低碳水','快手菜','汤','主食','甜品'];
  // 已用标签(从所有菜谱收集,去掉已在预设里的,去重) — 让自定义标签下次能直接点选,不用重输
  const knownTags = (window._knownTags || []).filter(t => !PRESET_TAGS.includes(t));
  const tagBtns = [...PRESET_TAGS, ...knownTags];
  const presetBtns = tagBtns.map(t => `<button type="button" class="add-mini ${PRESET_TAGS.includes(t)?'':'tag-used'}" style="margin:2px" onclick="if(!editState.tags.includes('${esc(t)}')){editState.tags.push('${esc(t)}');drawRecipeEditor();}">${esc(t)}</button>`).join(' ');
  const parseHint = (s._parsed && (s.ingredients.length || s.steps.length)) ? `<div class="banner" style="background:#e8f5e1;color:#3a7d2a;border-color:#c5e3b6">✓ 已识别：${s.ingredients.length} 样食材${s.steps.length ? `、${s.steps.length} 步做法` : ''}，下面可继续改</div>` : '';
  $app.innerHTML = `
    <div class="banner">新建菜谱：粘贴小红书文本可自动识别填入，也可直接手动填。视频菜谱步骤可留空。</div>
    <div class="section-title">⚡ 粘贴文本自动识别（可选）</div>
    <textarea id="ed-text" placeholder="把小红书截图用「实况文本」复制的文字粘这里&#10;支持食材 + 做法，自动拆分填入下面&#10;例：&#10;食材：&#10;番茄 2个&#10;鸡蛋 3个&#10;做法：&#10;1. 番茄切块&#10;2. 鸡蛋打散炒熟"></textarea>
    <button class="btn secondary" style="margin-top:8px" onclick="editParse()">🔍 识别并填入</button>
    ${parseHint}
    <label>菜谱标题</label><input id="ed-title" value="${esc(s.title)}" oninput="editState.title=this.value">
    <label>链接（可选，跳转看做法）</label><input id="ed-link" value="${esc(s.link)}" oninput="editState.link=this.value" placeholder="https://www.xiaohongshu.com/...">
    <label>标签（轻食/减脂/辣口…，可自定义）</label>
    <div style="margin-bottom:6px">${tagChips || '<span style="color:var(--muted);font-size:13px">还没有标签</span>'}</div>
    <input id="ed-tag-input" placeholder="输入标签后回车添加" onkeydown="if(event.key==='Enter'){event.preventDefault();const v=this.value.trim();if(v&&!editState.tags.includes(v)){editState.tags.push(v);drawRecipeEditor();}}">
    <div style="margin:6px 0">${presetBtns}</div>
    <label>配图（从相册选）</label>
    <div class="img-pick">${imgs}<label class="add" for="ed-img">＋<input type="file" id="ed-img" accept="image/*" multiple style="display:none" onchange="addEditImgs(this.files)"></label></div>
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
  // 过滤无效图片项(null/undefined/0),避免脏数据进 DB
  s.images = (s.images || []).filter(b => b && (b.size || b.byteLength || b instanceof Blob));
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
  // revokeObjURLs(); // 暂停主动释放,验证图不显示根因(已确认是revoke提前释放导致)
  const s = importState;
  const ingRows = s.ingredients.map((i, idx) => `
    <div class="ing-edit-row"><input class="n" placeholder="食材名" value="${esc(i.name)}" oninput="importState.ingredients[${idx}].name=this.value">
    <input class="a" placeholder="量" value="${esc(i.amount)}" oninput="importState.ingredients[${idx}].amount=this.value">
    <input class="u" placeholder="单位" value="${esc(i.unit)}" oninput="importState.ingredients[${idx}].unit=this.value">
    <button class="x" onclick="importState.ingredients.splice(${idx},1);drawImport()">✕</button></div>`).join('');
  const stepRows = (s.steps || []).map((st, idx) => `
    <div class="ing-edit-row"><input class="n" placeholder="第${idx + 1}步" value="${esc(st.text || st)}" oninput="importState.steps[${idx}].text=this.value">
    <button class="x" onclick="importState.steps.splice(${idx},1);drawImport()">✕</button></div>`).join('');
  const imgs = s.images.map((b, idx) => `<div class="img-tile"><img src="${imgURL(b)}"><button class="img-del" onclick="importState.images.splice(${idx},1);drawImport()">✕</button></div>`).join('');
  const tagChips = (s.tags || []).map((t, idx) => {
    const [bg, fg] = tagColor(t);
    return `<span class="tag" style="background:${bg};color:${fg}">${esc(t)}<button class="x" style="font-size:13px;margin-left:4px;color:${fg}" onclick="importState.tags.splice(${idx},1);drawImport()">✕</button></span>`;
  }).join('');
  const PRESET_TAGS = ['轻食','减脂','辣口','清淡','重口','高蛋白','低碳水','快手菜','汤','主食','甜品'];
  const knownTags = (window._knownTags || []).filter(t => !PRESET_TAGS.includes(t));
  const tagBtns = [...PRESET_TAGS, ...knownTags];
  const presetBtns = tagBtns.map(t => `<button type="button" class="add-mini ${PRESET_TAGS.includes(t)?'':'tag-used'}" style="margin:2px" onclick="if(!importState.tags.includes('${esc(t)}')){importState.tags.push('${esc(t)}');drawImport();}">${esc(t)}</button>`).join(' ');
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
let pantryStateFilter = null;
function pantrySetTagFilter(t) { pantryTagFilter = (pantryTagFilter === t) ? null : t; renderPantry(); }
function pantrySetStateFilter(s) { pantryStateFilter = (pantryStateFilter === s) ? null : s; renderPantry(); }
async function renderPantry() {
  const items = await listPantry();
  // expiry reminder banner
  const soon = items.filter(i => { const s = expiryState(i.expiryDate); return s === 'red' || s === 'yellow'; })
    .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
  let banner = '';
  if (soon.length) {
    banner = `<div class="banner">⚠️ ${soon.length}样食材快过期：${soon.slice(0, 4).map(i => esc(i.name)).join('、')}${soon.length > 4 ? '…' : ''}</div>`;
  }
  // expiry-state filter bar (colored by state)
  const STATES = [
    { key:'red', label:'已过期' },
    { key:'yellow', label:'即将过期' },
    { key:'green', label:'新鲜' },
    { key:'none', label:'无保质期' },
  ];
  const stateBar = `<div class="tag-bar">
    <button class="tag-filter ${pantryStateFilter?'':'on'}" onclick="pantryStateFilter=null;renderPantry()">全部</button>
    ${STATES.map(s => {
      const n = items.filter(i => expiryState(i.expiryDate) === s.key).length;
      const on = pantryStateFilter === s.key;
      const badge = n ? ' <b>' + n + '</b>' : '';
      return `<button class="tag-filter state-${s.key} ${on?'on':''}" onclick="pantrySetStateFilter('${s.key}')">${s.label}${badge}</button>`;
    }).join('')}
  </div>`;
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
  let filtered = items;
  if (pantryStateFilter) filtered = filtered.filter(i => expiryState(i.expiryDate) === pantryStateFilter);
  if (pantryTagFilter) filtered = filtered.filter(i => (i.tags || []).includes(pantryTagFilter));
  // 单个食材卡片渲染
  function pantryCard(i) {
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
  }
  // 按标签分组（无标签归"未分类"），每组可折叠。组内按保质期紧迫度排序。
  if (!window._pantryOpen) window._pantryOpen = new Set();
  let list = '';
  if (!filtered.length) {
    list = `<div class="empty"><div class="big">🥫</div>${items.length ? '该分类下没有食材' : '食材库是空的'}<br>点下面添加</div>`;
  } else {
    // 收集所有标签（保持 pantryTagFilter 选中优先置顶），无标签的食材单独一组
    const tagGroups = new Map(); // tag -> [items]
    const noTag = [];
    for (const it of filtered) {
      const ts = it.tags || [];
      if (ts.length) ts.forEach(t => { if (!tagGroups.has(t)) tagGroups.set(t, []); tagGroups.get(t).push(it); });
      else noTag.push(it);
    }
    // 组排序：当前筛选标签最前，其余按标签字母/笔划原序
    const tagOrder = [...tagGroups.keys()].sort((a, b) => {
      if (a === pantryTagFilter) return -1; if (b === pantryTagFilter) return 1;
      return 0;
    });
    const sections = [];
    for (const t of tagOrder) sections.push({ key: t, label: t, items: tagGroups.get(t), colored: true });
    if (noTag.length) sections.push({ key: '__none', label: '未分类', items: noTag, colored: false });
    list = sections.map(sec => {
      sec.items.sort((a, b) => (a.expiryDate || '9999').localeCompare(b.expiryDate || '9999'));
      // 有筛选(标签或状态)时自动展开所有有内容的分组,避免选完下面空荡荡;无筛选时按手动 _pantryOpen
      const filtering = pantryTagFilter || pantryStateFilter;
      const open = filtering ? true : window._pantryOpen.has(sec.key);
      // 组内快过期数：用于角标提示
      const urgent = sec.items.filter(i => { const s = expiryState(i.expiryDate); return s === 'red' || s === 'yellow'; }).length;
      const [bg, fg] = sec.colored ? tagColor(sec.label) : ['#f0f0f0', '#888'];
      const head = `<div class="pantry-group-h ${open?'open':''}" onclick="togglePantryGroup('${esc(sec.key)}')">
        <span class="pg-caret">${open?'▾':'▸'}</span>
        <span class="pg-chip" style="background:${bg};color:${fg}">${esc(sec.label)}</span>
        <span class="pg-count">${sec.items.length}${urgent ? ` · <em style="color:var(--red);font-style:normal">${urgent}急</em>` : ''}</span>
      </div>`;
      const rows = open ? sec.items.map(pantryCard).join('') : '';
      return `<div class="pantry-group">${head}${rows}</div>`;
    }).join('');
  }
  $app.innerHTML = `${banner}
    ${stateBar}
    ${filterBar}
    <div>${list}</div>
    <button class="fab" onclick="editPantry()">＋</button>`;
}
function togglePantryGroup(key) {
  const s = window._pantryOpen;
  if (s.has(key)) s.delete(key); else s.add(key);
  renderPantry();
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
    progress = `<div class="shop-summary">
      <div class="shop-sum-head"><span class="shop-sum-label">已购</span><span class="shop-sum-num">${bought.length}/${items.length}</span></div>
      <div class="shop-prog"><div class="shop-prog-fill" style="width:${pct}%"></div></div>
      <div class="shop-prog-t">${pct}% 完成 · 还差 ${todo.length} 项</div>
    </div>`;
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
    <div>${list}</div>
    <div class="fab-bar">
      <button class="fab-pill add" onclick="shopAddManual()">添加</button>
      <button class="fab-pill clear" onclick="shopClearChecked()" ${bought.length ? '' : 'disabled'}>清理</button>
    </div>
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
      <div class="section-title">数据备份 / 恢复</div>
      <p style="font-size:13px;color:var(--muted);line-height:1.7">数据只存在这台手机本地，不会自动上云。<br><b>导出</b>：把全部数据（含图片）存成一个 JSON 文件，建议存到 iCloud 云盘，换机或丢手机时能恢复。<br><b>导入</b>：选一个备份 JSON 恢复。按 id 合并——同 id 会被覆盖，不会删除你现有的其他记录，也不会重复。</p>
      <button class="btn secondary" onclick="moreExport()">导出备份（含图片）</button>
      <button class="btn ghost" onclick="moreImportPick()" style="margin-top:8px">导入备份</button>
      <input type="file" id="import-file" accept="application/json,.json" style="display:none" onchange="moreImport(this)">
    </div>
    <div class="card">
      <div class="section-title">关于</div>
      <p style="font-size:13px;color:var(--muted);line-height:1.7">CookCook — 离线可用的菜谱与餐单 PWA。<br>新建菜谱支持粘贴小红书文本自动识别（截图+实况文本复制+粘贴），非自动抓取。</p>
    </div>
    <div class="card">
      <div class="section-title">📋 图片诊断日志</div>
      <p style="font-size:13px;color:var(--muted);line-height:1.7">记录每次打开/编辑/置顶菜谱时图片的真实状态。如果遇到"图片丢失"，先复现一次（点置顶/编辑让图消失），然后回来点下面按钮，把日志发给我看，就能定位根因。</p>
      <button class="btn secondary" onclick="moreImgLog()">查看 / 复制图片日志</button>
    </div>`;
}
function moreImgLog() {
  const log = window._imgLog || [];
  const txt = log.length
    ? log.map(e => `${e.t} ${e.op} id=${(e.id||'').slice(0,8)} n=${e.n} [${e.imgs.join(', ')}]`).join('\n')
    : '（还没有日志记录。去点一下菜谱的置顶/编辑再回来看。）';
  const m = el(`<div class="modal-bg" onclick="if(event.target===this)this.remove()">
    <div class="modal" style="max-height:80vh;display:flex;flex-direction:column">
      <h2>图片诊断日志（最近${log.length}条）<button class="modal-close" onclick="this.closest('.modal-bg').remove()">✕</button></h2>
      <textarea id="imglog-txt" readonly style="flex:1;min-height:300px;font-size:11px;font-family:monospace;white-space:pre;line-height:1.5">${esc(txt)}</textarea>
      <button class="btn" id="imglog-copy" style="margin-top:10px">📋 一键复制日志</button>
    </div></div>`);
  document.body.appendChild(m);
  m.querySelector('#imglog-copy').onclick = () => {
    const t = m.querySelector('#imglog-txt');
    t.select();
    try { document.execCommand('copy'); toast('已复制,粘贴发给我'); }
    catch (e) { toast('复制失败,请手动选中上面的文本复制'); }
  };
}
async function moreExport() {
  const data = await exportAllFull();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cookcook-backup-${ymd(new Date())}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function moreImportPick() { document.getElementById('import-file').click(); }
async function moreImport(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  if (!confirm('确认导入这个备份？同 id 的记录会被覆盖，不会删除你现有的其他记录。')) { input.value = ''; return; }
  try {
    const text = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => rej(fr.error);
      fr.readAsText(f);
    });
    const data = JSON.parse(text);
    const counts = await importAll(data);
    alert(`导入完成\n菜谱 ${counts.recipes} 条\n餐单 ${counts.plans} 天\n食材 ${counts.pantry} 项\n购物 ${counts.shopping} 项`);
    route();
  } catch (err) {
    alert('导入失败：不是有效的 CookCook 备份文件' + (err && err.message ? '\n' + err.message : ''));
  } finally {
    input.value = '';
  }
}

// ---------- service worker ----------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ---------- boot ----------
route();
