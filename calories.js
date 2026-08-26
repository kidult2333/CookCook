// calories.js — 精简中文常见食材热量表 (kcal / 100g 或 每"个/份"标注)
// 离线、零依赖。命中靠名称模糊匹配（包含子串）。
// 数据来源：参考中国食物成分表常见值，仅供估算，不替代专业营养数据。

// 每个: { name, kcal, per }  per=100 表示每100g的热量；否则为每该单位(如"个""根")的热量
const CALORIE_DB = [
  // 肉类
  { name:'鸡胸肉', kcal:133, per:100 },{ name:'鸡腿', kcal:181, per:100 },{ name:'鸡翅', kcal:194, per:100 },
  { name:'牛肉', kcal:125, per:100 },{ name:'牛排', kcal:217, per:100 },{ name:'猪肉', kcal:143, per:100 },
  { name:'里脊', kcal:155, per:100 },{ name:'排骨', kcal:278, per:100 },{ name:'五花肉', kcal:508, per:100 },
  { name:'火腿', kcal:330, per:100 },{ name:'培根', kcal:541, per:100 },{ name:'香肠', kcal:508, per:100 },
  { name:'羊肉', kcal:203, per:100 },{ name:'鸭肉', kcal:240, per:100 },
  // 水产
  { name:'虾', kcal:87, per:100 },{ name:'虾仁', kcal:48, per:100 },{ name:'三文鱼', kcal:139, per:100 },
  { name:'龙利鱼', kcal:83, per:100 },{ name:'鳕鱼', kcal:88, per:100 },{ name:'鱿鱼', kcal:92, per:100 },
  { name:'蟹', kcal:95, per:100 },{ name:'蛤蜊', kcal:62, per:100 },{ name:'带鱼', kcal:127, per:100 },
  // 蛋奶
  { name:'鸡蛋', kcal:144, per:'个' },{ name:'蛋', kcal:144, per:'个' },{ name:'蛋黄', kcal:322, per:100 },
  { name:'蛋白', kcal:48, per:100 },{ name:'鹌鹑蛋', kcal:16, per:'个' },{ name:'牛奶', kcal:54, per:100 },
  { name:'酸奶', kcal:72, per:100 },{ name:'奶油', kcal:345, per:100 },{ name:'奶酪', kcal:328, per:100 },
  // 蔬菜
  { name:'西兰花', kcal:36, per:100 },{ name:'番茄', kcal:18, per:100 },{ name:'西红柿', kcal:18, per:100 },
  { name:'黄瓜', kcal:15, per:100 },{ name:'生菜', kcal:13, per:100 },{ name:'白菜', kcal:20, per:100 },
  { name:'菠菜', kcal:24, per:100 },{ name:'芹菜', kcal:16, per:100 },{ name:'胡萝卜', kcal:37, per:100 },
  { name:'土豆', kcal:77, per:100 },{ name:'洋葱', kcal:40, per:100 },{ name:'黄洋葱', kcal:40, per:100 },
  { name:'青椒', kcal:22, per:100 },{ name:'彩椒', kcal:26, per:100 },{ name:'茄子', kcal:21, per:100 },
  { name:'豆角', kcal:31, per:100 },{ name:'花菜', kcal:24, per:100 },{ name:'蘑菇', kcal:24, per:100 },
  { name:'香菇', kcal:26, per:100 },{ name:'金针菇', kcal:32, per:100 },{ name:'木耳', kcal:21, per:100 },
  { name:'冬瓜', kcal:11, per:100 },{ name:'南瓜', kcal:22, per:100 },{ name:'丝瓜', kcal:20, per:100 },
  { name:'莲藕', kcal:47, per:100 },{ name:'莴笋', kcal:14, per:100 },{ name:'韭菜', kcal:26, per:100 },
  { name:'卷心菜', kcal:24, per:100 },{ name:'包菜', kcal:24, per:100 },{ name:'豆芽', kcal:18, per:100 },
  // 豆制品/豆类
  { name:'豆腐', kcal:81, per:100 },{ name:'北豆腐', kcal:98, per:100 },{ name:'嫩豆腐', kcal:57, per:100 },
  { name:'豆干', kcal:140, per:100 },{ name:'腐竹', kcal:459, per:100 },{ name:'黄豆', kcal:390, per:100 },
  { name:'绿豆', kcal:316, per:100 },{ name:'红豆', kcal:324, per:100 },{ name:'毛豆', kcal:131, per:100 },
  // 主食/碳水
  { name:'米饭', kcal:116, per:100 },{ name:'大米', kcal:346, per:100 },{ name:'糙米', kcal:348, per:100 },
  { name:'面条', kcal:280, per:100 },{ name:'挂面', kcal:344, per:100 },{ name:'馒头', kcal:223, per:100 },
  { name:'面包', kcal:313, per:100 },{ name:'全麦面包', kcal:247, per:100 },{ name:'燕麦', kcal:377, per:100 },
  { name:'红薯', kcal:86, per:100 },{ name:'紫薯', kcal:82, per:100 },{ name:'玉米', kcal:86, per:100 },
  { name:'年糕', kcal:154, per:100 },{ name:'饺子', kcal:240, per:'个' },{ name:'包子', kcal:180, per:'个' },
  // 水果
  { name:'苹果', kcal:54, per:100 },{ name:'香蕉', kcal:93, per:'根' },{ name:'橙子', kcal:48, per:100 },
  { name:'葡萄', kcal:44, per:100 },{ name:'西瓜', kcal:26, per:100 },{ name:'草莓', kcal:32, per:100 },
  { name:'蓝莓', kcal:57, per:100 },{ name:'猕猴桃', kcal:61, per:100 },{ name:'柠檬', kcal:35, per:100 },
  { name:'牛油果', kcal:171, per:100 },
  // 调料/油
  { name:'食用油', kcal:899, per:100 },{ name:'橄榄油', kcal:899, per:100 },{ name:'黄油', kcal:717, per:100 },
  { name:'白糖', kcal:400, per:100 },{ name:'盐', kcal:0, per:100 },{ name:'酱油', kcal:63, per:100 },
  { name:'生抽', kcal:63, per:100 },{ name:'老抽', kcal:74, per:100 },{ name:'醋', kcal:31, per:100 },
  { name:'蚝油', kcal:51, per:100 },{ name:'料酒', kcal:80, per:100 },{ name:'蜂蜜', kcal:321, per:100 },
  { name:'番茄酱', kcal:104, per:100 },{ name:'芝麻酱', kcal:630, per:100 },{ name:'咖喱块', kcal:520, per:100 },
  { name:'咖喱', kcal:215, per:100 },{ name:'辣椒', kcal:32, per:100 },{ name:'姜', kcal:46, per:100 },
  { name:'蒜', kcal:149, per:100 },{ name:'葱', kcal:26, per:100 },
  // 坚果
  { name:'花生', kcal:567, per:100 },{ name:'核桃', kcal:654, per:100 },{ name:'杏仁', kcal:579, per:100 },
  { name:'芝麻', kcal:573, per:100 },{ name:'腰果', kcal:553, per:100 },
  // 其他
  { name:'清水', kcal:0, per:100 },{ name:'水', kcal:0, per:100 },{ name:'粉丝', kcal:338, per:100 },
  { name:'粉条', kcal:338, per:100 },{ name:'魔芋', kcal:7, per:100 },{ name:'果冻', kcal:58, per:100 },
];

// 模糊匹配：返回第一个 name 包含在查询里、或查询包含 name 的条目
function findCalorie(query) {
  const q = (query || '').trim();
  if (!q) return null;
  // 精确优先
  let hit = CALORIE_DB.find(e => e.name === q);
  if (hit) return hit;
  // 包含子串（双向），优先长 name
  const sorted = [...CALORIE_DB].sort((a, b) => b.name.length - a.name.length);
  hit = sorted.find(e => q.includes(e.name) || e.name.includes(q));
  return hit || null;
}

// 估算单个食材的卡路里
// 策略：优先看用户填的 unit；其次看 amount 数字大小推断克数
function estimateIngredientKcal(ing) {
  const db = findCalorie(ing.name);
  if (!db) return { kcal: null, matched: false };
  const amt = parseFloat(ing.amount);
  const u = (ing.unit || '').trim();

  // 热量条目 per 是个数单位("个"/"根") → 直接按个数×每份热量
  if (typeof db.per !== 'number') {
    if (isNaN(amt)) return { kcal: db.kcal, matched: true, approx: true }; // "适量"→按1份
    return { kcal: Math.round(db.kcal * amt), matched: true };
  }

  // 热量条目 per=100g → 需要把 amount 换算成克
  let grams;
  if (u === 'g' || u === '克') grams = isNaN(amt) ? 100 : amt;
  else if (u === 'kg' || u === '千克') grams = isNaN(amt) ? 1000 : amt * 1000;
  else if (['个','只','根','块','片','瓣','条','颗','粒'].includes(u)) {
    // 按常见一份估算克数
    const perPiece = guessGramsPerPiece(ing.name) || 100;
    grams = (isNaN(amt) ? 1 : amt) * perPiece;
  } else if (['勺','汤匙','茶匙'].includes(u)) {
    grams = (isNaN(amt) ? 1 : amt) * (u === '茶匙' ? 5 : 15);
  } else if (u === '适量' || u === '少许' || u === '若干') {
    grams = 50;
  } else if (!isNaN(amt)) {
    // 有数字但没单位：数字大(>20)当作克，数字小当作"份"(按100g)
    grams = amt > 20 ? amt : amt * 100;
  } else {
    grams = 100; // 无数字无单位 → 默认100g
  }
  const kcal = Math.round(db.kcal * grams / 100);
  return { kcal, matched: true, approx: (u === '适量' || u === '少许' || isNaN(amt)) };
}

// 常见"一份"的克数估算
function guessGramsPerPiece(name) {
  const n = name || '';
  const tbl = [
    [/鸡胸肉|鸡腿|猪肉|牛排|里脊|鱼|带鱼|三文鱼/, 150],
    [/鸡翅/, 60],[/虾|虾仁|蟹|蛤蜊/, 20],
    [/土豆|红薯|紫薯|苹果|橙子|洋葱/, 150],
    [/番茄|西红柿|柠檬|猕猴桃/, 100],
    [/鸡蛋|蛋|鹌鹑蛋/, 50],[/香蕉/, 120],
    [/胡萝卜|黄瓜|茄子|丝瓜/, 100],[/姜/, 10],[/蒜/, 5],[/辣椒/, 15],
    [/咖喱块|培根|香肠|火腿|芝士片|奶酪片/, 20],
    [/豆腐/, 120],[/面包|吐司/, 35],[/饺子|包子|汤圆/, 25],
  ];
  for (const [re, g] of tbl) if (re.test(n)) return g;
  return null;
}

// 计算整份菜谱总卡路里（汇总各食材）
function recipeKcal(ingredients) {
  let total = 0, matched = 0, unmatched = [];
  for (const ing of (ingredients || [])) {
    const r = estimateIngredientKcal(ing);
    if (r.matched && r.kcal != null) { total += r.kcal; matched++; }
    else unmatched.push(ing.name);
  }
  return { total, matched, unmatched };
}
