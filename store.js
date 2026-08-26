// store.js — business data operations on top of db.js
// All async. Returns plain objects.

// ---- recipes ----
async function listRecipes() { return dbAll('recipes'); }
async function getRecipe(id) { return dbGet('recipes', id); }
async function saveRecipe(r) {
  if (!r.id) r.id = uid();
  if (!r.createdAt) r.createdAt = new Date().toISOString();
  r.updatedAt = new Date().toISOString();
  return dbPut('recipes', r);
}
async function deleteRecipe(id) { return dbDel('recipes', id); }
// 部分更新菜谱（合并到已有记录，更新 updatedAt）
async function patchRecipe(id, patch) {
  const r = await getRecipe(id);
  if (!r) return null;
  Object.assign(r, patch);
  r.updatedAt = new Date().toISOString();
  return dbPut('recipes', r);
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

// ---- backup: export / import all data as JSON (no images for portability) ----
async function exportAll() {
  const [recipes, plans, pantry, shopping] = await Promise.all([
    dbAll('recipes'), dbAll('mealPlans'), dbAll('pantry'), dbAll('shopping'),
  ]);
  // strip image blobs from recipes for a lightweight JSON backup
  const recipesLite = recipes.map(r => ({ ...r, images: r.images ? r.images.length : 0 }));
  return { exportedAt: new Date().toISOString(), recipes: recipesLite, plans, pantry, shopping };
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
