// import.js — parse pasted recipe text (from 小红书 screenshot via iOS Live Text)
// 支持两种主流格式：
//   1) 一行多食材、逗号分隔：  "准备食材：鸡腿肉，青线椒，小米辣，大蒜，生抽"
//   2) 一行一个食材带量：      "番茄 2个" / "盐 适量"
// 步骤：以 1. / - / • / 步骤1 / 第1步 开头
// 标题：第一行若为 "今日菜单：xxx" / "xxx 食谱" 等短行

const UNITS = ['克','g','G','千克','kg','KG','斤','两','毫升','ml','ML','升','L',
  '个','只','根','块','片','瓣','勺','汤匙','茶匙','把','束','条','颗','粒',
  '适量','少许','若干','撮','滴','杯','碗','盘','袋','包','盒','罐','份'];

const STEP_MARKERS = /^(\d+[\.、:：]\s*|步骤\s*\d+|第\s*\d+\s*步|step\s*\d+|[-•·–—]\s*)/i;

// 段头：食材/做法 等。支持 "头：" 或 "头： 内容" 内联。
// 含小红书常见写法：准备食材 / 食材清单 / 需要食材 / 用到的食材 等
const ING_HEADER = /^(今日菜单|菜名|标题|准备食材|食材清单|需要食材|用到.*食材|食材|用料|原料|配料|主料|辅料|ingredients)\s*[:：]\s*(.*)$/i;
const STEP_HEADER = /^(做法|步骤|烹饪步骤|directions|步骤说明|制作过程)\s*[:：]\s*(.*)$/i;

// 强分隔符：一定切开食材的符号
const STRONG_SEP = /[，,、；;\/|｜\*×]/; // 注意：空格不在此列（见下）

// 把一行文本拆成食材。
// 支持分隔符：中文/英文逗号、顿号、分号、斜线、竖线、星号、乘号、空格(有条件)
function splitIngredientLine(line) {
  // 1) 先按强分隔符切
  let parts = line.split(STRONG_SEP).map(s => s.trim()).filter(Boolean);
  // 2) 若强分隔符没切出多段，且原文含空格 → 按"名 量 名 量..."配对切
  //    先按空格分词，再把紧跟的"量段(数字+单位 / 适量等)"并入前一个名段
  if (parts.length <= 1 && /\s/.test(line)) {
    const toks = line.split(/\s+/).map(s => s.trim()).filter(Boolean);
    if (toks.length >= 2) {
      const qtyRe = /^(\d+(?:\.\d+)?|半|一两|两三|几|适量|少许|若干)(g|克|kg|千克|ml|毫升|升|L|个|只|根|块|片|瓣|勺|汤匙|茶匙|把|束|条|颗|粒|份|杯|碗|盘|袋|包|盒|罐|斤|两)?$/i;
      const paired = [];
      let i = 0;
      while (i < toks.length) {
        if (qtyRe.test(toks[i])) {
          // 量段单独出现：并入前一个食材
          if (paired.length) {
            const prev = paired[paired.length - 1];
            const qm = toks[i].match(qtyRe);
            if (qm) { if (qm[1] && !prev.amount) prev.amount = qm[1]; if (qm[2] && !prev.unit) prev.unit = qm[2]; }
          }
          i++;
        } else {
          // 名段：看下一个是否量段，是则配对
          const name = toks[i];
          const nextIsQty = (i + 1 < toks.length) && qtyRe.test(toks[i + 1]);
          if (nextIsQty) {
            const qm = toks[i + 1].match(qtyRe);
            paired.push({ name, amount: qm ? qm[1] : '', unit: qm && qm[2] ? qm[2] : '' });
            i += 2;
          } else {
            paired.push({ name, amount: '', unit: '' });
            i++;
          }
        }
      }
      // 还原成 "name amountunit" 字符串走下面统一解析（保证单位归一）
      if (paired.length) parts = paired.map(p => p.name + (p.amount ? ' ' + p.amount + (p.unit || '') : ''));
    }
  }
  const out = [];
  const unitAlt = UNITS.map(u => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  // 单个食材：name [amount] [unit]，或纯 name
  const ingRe = new RegExp('^(.+?)\\s*(\\d+(?:\\.\\d+)?|半|一两|两三|几)?\\s*(' + unitAlt + ')?\\s*$');
  for (const p of parts) {
    // 去掉行尾标点
    let cleaned = p.replace(/[。.！!？?、，,；;]+$/, '').trim();
    if (!cleaned) continue;
    // 若 part 里还残留 "xxx：yyy"（段头没被单独剥掉的情况），取冒号后的 yyy
    const colonCut = cleaned.match(/[:：]\s*(.+)$/);
    if (colonCut && /^(准备食材|食材|用料|原料|配料|主料|辅料|需要|用到)/.test(cleaned)) {
      cleaned = colonCut[1].trim();
      if (!cleaned) continue;
    }
    const m = cleaned.match(ingRe);
    if (m && (m[2] || (m[3] && m[3] !== ''))) {
      const name = m[1].replace(/[:：]\s*$/, '').trim();
      const hasQtyUnit = m[3] && ['适量','少许','若干'].includes(m[3]);
      const amount = m[2] ? m[2] : (hasQtyUnit ? m[3] : '');
      const unit = m[3] && !['适量','少许','若干'].includes(m[3]) ? m[3] : '';
      if (name) out.push({ name, amount, unit });
    } else {
      // 纯食材名（无数量单位），如 "鸡腿肉"、"大蒜"、"白胡椒粉"
      if (cleaned.length <= 12 && !/[.,;!?。，；！？:：]/.test(cleaned)) {
        out.push({ name: cleaned, amount: '', unit: '' });
      }
    }
  }
  return out;
}

function parseRecipeText(text) {
  const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const ingredients = [];
  const steps = [];
  let title = '';

  let section = 'auto'; // auto | ingredients | steps
  const stepNumRe = /^(\d+)[\.、:：]\s*(.+)$/;
  const dashRe = /^[-•·–—]\s*(.+)$/;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];

    // 食材段头（含内联："准备食材：A，B，C"）
    const ih = line.match(ING_HEADER);
    if (ih) {
      // "今日菜单：小炒鸡" → 当标题，不当食材头
      if (/今日菜单|菜名|标题/i.test(ih[1]) && ih[2]) {
        if (!title) title = ih[2].trim();
        section = 'auto';
        continue;
      }
      section = 'ingredients';
      if (ih[2] && ih[2].trim()) {
        // 内联食材：紧跟在冒号后面
        for (const ing of splitIngredientLine(ih[2])) ingredients.push(ing);
      }
      continue;
    }
    // 做法段头（含内联）
    const sh = line.match(STEP_HEADER);
    if (sh) {
      section = 'steps';
      if (sh[2] && sh[2].trim()) {
        // 内联做法第一句
        steps.push({ n: steps.length + 1, text: sh[2].trim() });
      }
      continue;
    }
    // 单独成行的段头（"食材：" 后面无内容）
    if (/^(食材|用料|原料|配料|主料|辅料|ingredients)\s*[:：]?$/i.test(line)) { section = 'ingredients'; continue; }
    if (/^(做法|步骤|烹饪步骤|directions)\s*[:：]?$/i.test(line)) { section = 'steps'; continue; }

    // 步骤行？
    if (STEP_MARKERS.test(line)) {
      const m = line.match(stepNumRe);
      if (m) {
        steps.push({ n: parseInt(m[1], 10), text: m[2] });
      } else {
        const d = line.match(dashRe);
        const t = d ? d[1] : '';
        if (t.trim()) steps.push({ n: steps.length + 1, text: t.trim() });
      }
      if (section === 'auto') section = 'steps';
      continue;
    }

    // 做法段中：每行都是步骤
    if (section === 'steps') {
      steps.push({ n: steps.length + 1, text: line });
      continue;
    }

    // 食材段中（或 auto）：尝试拆分
    // 一行里若含逗号/顿号 → 当多食材行拆分；否则当单个食材行
    if (section === 'ingredients' || section === 'auto') {
      const hasMultiSep = /[，,、；;]/.test(line);
      const ings = splitIngredientLine(line);
      if (ings.length) {
        for (const ing of ings) ingredients.push(ing);
        if (section === 'auto') section = 'ingredients';
        // 多食材行若拆出多个，或拆出一个带量的，都算食材
        continue;
      }
      // 短行无标点 → 可能纯食材名
      if (line.length <= 12 && !/[.,;!?。，；！？:：]/.test(line) && !STEP_MARKERS.test(line)) {
        ingredients.push({ name: line, amount: '', unit: '' });
        if (section === 'auto') section = 'ingredients';
        continue;
      }
    }

    // 首行短文本 → 标题
    if (!title && i === 0 && line.length <= 24) {
      title = line.replace(/[:：]\s*$/, '').trim();
      continue;
    }
  }

  // 清理：去空步骤、重编号；去重食材（同名保留首个带量的）
  const cleanSteps = steps.filter(s => (s.text || '').trim()).map((s, i) => ({ n: i + 1, text: s.text.trim() }));
  const seen = new Set();
  const cleanIngs = [];
  for (const ing of ingredients) {
    const key = ing.name.trim();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    cleanIngs.push(ing);
  }
  return { title, ingredients: cleanIngs, steps: cleanSteps };
}
