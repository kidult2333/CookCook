// store.js — business data operations on top of db.js
// All async. Returns plain objects.

// ---- recipes ----
async function listRecipes() { return dbAll('recipes'); }
async function getRecipe(id) {
  const r = await dbGet('recipes', id);
  if (r && window._imgLog) imgLog('getRecipe', id, r.images);
  return r;
}
async function saveRecipe(r) {
  if (!r.id) r.id = uid();
  if (!r.createdAt) r.createdAt = new Date().toISOString();
  r.updatedAt = new Date().toISOString();
  if (window._imgLog) imgLog('saveRecipe(pre)', r.id, r.images);
  const res = await dbPut('recipes', r);
  if (window._imgLog) imgLog('saveRecipe(post)', r.id, r.images);
  return res;
}
async function deleteRecipe(id) { return dbDel('recipes', id); }
// 部分更新菜谱（合并到已有记录，更新 updatedAt）
async function patchRecipe(id, patch) {
  const r = await getRecipe(id);
  if (!r) return null;
  Object.assign(r, patch);
  r.updatedAt = new Date().toISOString();
  if (window._imgLog) imgLog('patchRecipe(pre)', id, r.images);
  const res = await dbPut('recipes', r);
  if (window._imgLog) imgLog('patchRecipe(post)', id, r.images);
  return res;
}

// ---- meal plans (keyed by date 'YYYY-MM-DD') ----
async function getPlan(date) {
  const p = await dbGet('mealPlans', date);
  return p || { date, breakfast: [], lunch: [], dinner: [], snacks: [] };
}
async function savePlan(plan) { return dbPut('mealPlans', plan); }
async function listPlans() { return dbAll('mealPlans'); }

// ---- pantry ----
async function listPantry() { return dbAll('pantry'); }
async function savePantry(item) {
  if (!item.id) item.id = uid();
  if (!item.addedDate) item.addedDate = new Date().toISOString();
  return dbPut('pantry', item);
}
async function deletePantry(id) { return dbDel('pantry', id); }

// ---- shopping ----
async function listShopping() { return dbAll('shopping'); }
async function saveShopping(item) {
  if (!item.id) item.id = uid();
  return dbPut('shopping', item);
}
async function deleteShopping(id) { return dbDel('shopping', id); }
async function clearShopping() { return dbClear('shopping'); }

// ---- meta ----
async function getMeta(key) { return (await dbGet('meta', key))?.value; }
async function setMeta(key, value) { return dbPut('meta', { key, value }); }

// ---- backup: export / import all data as JSON (WITH images as base64 data URLs) ----
// data URL -> Blob (for import). Sync; returns null if not a valid data URL.
function dataUrlToBlob(dataUrl) {
  const m = /^data:([^;]+)?(;base64)?,(.*)$/.exec(dataUrl || '');
  if (!m) return null;
  const mime = m[1] || 'application/octet-stream';
  if (m[2]) {
    const bin = atob(m[3]);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }
  return new Blob([decodeURIComponent(m[3])], { type: mime });
}

// Full export: images kept as base64 data URLs so backup can be fully restored.
async function exportAllFull() {
  const [recipes, plans, pantry, shopping] = await Promise.all([
    dbAll('recipes'), dbAll('mealPlans'), dbAll('pantry'), dbAll('shopping'),
  ]);
  const recipesFull = await Promise.all(recipes.map(async r => ({
    ...r,
    images: r.images ? await Promise.all(r.images.map(b => b ? blobToDataUrl(b) : null)) : [],
  })));
  const pantryFull = await Promise.all(pantry.map(async p => ({
    ...p,
    image: p.image ? await blobToDataUrl(p.image) : null,
  })));
  return { exportedAt: new Date().toISOString(), app: 'cookcook', version: 1, recipes: recipesFull, plans, pantry: pantryFull, shopping };
}

// Import: merge by key (dbPut = upsert). Same id/date overwrites; different id/date coexists (no dup). Images restored from data URLs.
async function importAll(data) {
  const counts = { recipes: 0, plans: 0, pantry: 0, shopping: 0 };
  if (Array.isArray(data.recipes)) {
    for (const r of data.recipes) {
      const rec = { ...r };
      // 兼容旧版导出:images 可能是数字(旧版剥成数量)或缺失,只有数组里的 dataURL 才转 Blob
      if (Array.isArray(rec.images)) rec.images = rec.images.map(u => (typeof u === 'string' && u.indexOf('data:') === 0) ? dataUrlToBlob(u) : null);
      else rec.images = [];
      await dbPut('recipes', rec); counts.recipes++;
    }
  }
  if (Array.isArray(data.plans)) { for (const p of data.plans) { await dbPut('mealPlans', p); counts.plans++; } }
  if (Array.isArray(data.pantry)) {
    for (const p of data.pantry) {
      const it = { ...p };
      if (it.image && typeof it.image === 'string' && it.image.indexOf('data:') === 0) it.image = dataUrlToBlob(it.image);
      else if (it.image && typeof it.image !== 'string') it.image = null;
      await dbPut('pantry', it); counts.pantry++;
    }
  }
  if (Array.isArray(data.shopping)) { for (const s of data.shopping) { await dbPut('shopping', s); counts.shopping++; } }
  return counts;
}

// ---- meal cart (待分配篮子): localStorage 持久化,刷新不丢,可攒一篮子回头排 ----
// 每条: { rid(菜谱id), title(冗余便于篮内显示,菜谱删了也不致空), date(预填日期,可空), meal(预填餐次key,可空), at }
const CART_KEY = 'cookcook-mealcart';
function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch (e) { return []; }
}
function saveCart(arr) { localStorage.setItem(CART_KEY, JSON.stringify(arr || [])); }
function cartAdd(rid, title, date, meal) {
  const cart = getCart();
  cart.push({ rid, title: title || '', date: date || null, meal: meal || null, at: Date.now() });
  saveCart(cart);
  return cart;
}
function cartRemove(idx) { const c = getCart(); c.splice(idx, 1); saveCart(c); return c; }
function cartSetDM(idx, date, meal) { const c = getCart(); if (c[idx]) { c[idx].date = date || null; c[idx].meal = meal || null; } saveCart(c); return c; }
function cartClear() { saveCart([]); return []; }
// 把篮内某条写入 plan 的对应餐次,返回该条(调用方据 idx 删篮)
async function cartCommit(idx) {
  const c = getCart();
  const item = c[idx]; if (!item) return null;
  if (!item.date || !item.meal) return null;
  const plan = await getPlanCompat(item.date);
  plan[item.meal] = plan[item.meal] || [];
  plan[item.meal].push({ type: 'recipe', recipeId: item.rid });
  await savePlan(plan);
  return item;
}

// Convert a File/Blob to a data URL for storing images (works in IndexedDB as Blob too; we keep Blob)
function blobToDataUrl(blob) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });
}

// ---- aggregation: collect ingredients across a set of plans, compare to pantry ----
async function aggregateIngredients(plans) {
  const map = new Map(); // key: name+unit → {name, amount, unit, recipes:[]}
  for (const p of plans) {
    for (const slot of ['breakfast','morning_snack','lunch','afternoon_snack','dinner','evening_snack','snacks']) {
      for (const entry of (p[slot] || [])) {
        if (entry.type !== 'recipe' || !entry.recipeId) continue;
        const r = await getRecipe(entry.recipeId);
        if (!r || !r.ingredients) continue;
        for (const ing of r.ingredients) {
          const key = (ing.name || '').trim() + '|' + (ing.unit || '').trim();
          const num = parseFloat(ing.amount);
          if (!map.has(key)) map.set(key, { name: ing.name, amount: 0, unit: ing.unit, numeric: 0, recipes: [] });
          const e = map.get(key);
          if (!isNaN(num)) e.numeric += num;
          e.amount = e.numeric ? String(e.numeric) : (e.amount || ing.amount || '');
          e.recipes.push(r.title);
        }
      }
    }
  }
  return Array.from(map.values());
}

function expiryState(expiryIso) {
  if (!expiryIso) return 'none';
  const days = (new Date(expiryIso).getTime() - Date.now()) / 86400000;
  if (days < 1) return 'red';
  if (days <= 5) return 'yellow';
  return 'green';
}
