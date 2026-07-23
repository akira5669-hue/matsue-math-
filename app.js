(function () {
  'use strict';

  /* ---------- ログインAPI ---------- */

  var API_URL = 'https://script.google.com/macros/s/AKfycbwqg5Dt1ZjD7FxTlQeVCEKcHf2jg6QHwr0cWPCTC0VAtDjiOVL1spjm1EjmTe5gh3rf9w/exec';
  var SESSION_KEY = 'matsue-math-session';

  function apiPost(action, payload) {
    var body = Object.assign({ action: action }, payload || {});
    return fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
    }).then(function (res) { return res.json(); });
  }

  function loadSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function saveSession(session) {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) { }
  }
  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) { }
  }

  /* ---------- 基本ユーティリティ ---------- */

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  function randNonZero(min, max) {
    let n;
    do { n = randInt(min, max); } while (n === 0);
    return n;
  }
  function fmtNum(n) {
    return n < 0 ? `(${n})` : `${n}`;
  }
  function fmtLead(n) {
    return `${n}`;
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildChoices(correct, naturalWrongs) {
    const set = new Set([correct]);
    const choices = [correct];
    for (const w of naturalWrongs) {
      if (choices.length >= 4) break;
      if (!set.has(w)) { set.add(w); choices.push(w); }
    }
    let guard = 0;
    while (choices.length < 4 && guard < 60) {
      guard++;
      const cand = correct + randNonZero(-5, 5);
      if (!set.has(cand)) { set.add(cand); choices.push(cand); }
    }
    return shuffle(choices).map(String);
  }

  // 文字列（分数など）の選択肢を組み立てる版
  function buildChoicesFromSet(answerStr, wrongCandidates) {
    const set = new Set([answerStr]);
    const choices = [answerStr];
    for (const w of wrongCandidates) {
      if (choices.length >= 4) break;
      if (w && !set.has(w)) { set.add(w); choices.push(w); }
    }
    let guard = 0;
    while (choices.length < 4 && guard < 30) {
      guard++;
      const m = answerStr.match(/^(-?\d+)\/(\d+)$/);
      let cand;
      if (m) {
        const dn = parseInt(m[2], 10);
        const nn = parseInt(m[1], 10) + randNonZero(-2, 2);
        cand = dn === 0 ? null : `${nn}/${dn}`;
      } else {
        const val = parseInt(answerStr, 10) + randNonZero(-3, 3);
        cand = `${val}`;
      }
      if (cand && !set.has(cand)) { set.add(cand); choices.push(cand); }
    }
    return shuffle(choices);
  }

  /* ---------- 分数ユーティリティ ---------- */

  function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { const t = b; b = a % b; a = t; }
    return a || 1;
  }
  function lcm(a, b) {
    return Math.abs(a * b) / gcd(a, b);
  }
  function reduceFrac(n, d) {
    if (d < 0) { n = -n; d = -d; }
    const g = gcd(n, d);
    return [n / g, d / g];
  }
  function fracToStr(n, d) {
    const [rn, rd] = reduceFrac(n, d);
    return rd === 1 ? `${rn}` : `${rn}/${rd}`;
  }
  // 分母>=2、0より大きい既約な真分数を作る
  function randFrac(maxDen) {
    let d, n;
    do {
      d = randInt(2, maxDen);
      n = randInt(1, d - 1);
    } while (gcd(n, d) !== 1);
    return [n, d];
  }

  /* ---------- 出題範囲の定義 ---------- */

  const CATEGORIES = [
    { id: 'add2',      label: '加法（たし算）',           gen: genAdd2 },
    { id: 'sub2',      label: '減法（ひき算）',           gen: genSub2 },
    { id: 'chain3',    label: '加減混合',                 gen: genChain3 },
    { id: 'mul2',      label: '乗法（かけ算）',           gen: genMul2 },
    { id: 'div2',      label: '除法（わり算）',           gen: genDiv2 },
    { id: 'mixed',     label: 'かっこを含む四則',         gen: genMixedParen },
    { id: 'allops',    label: '四則混合計算',             gen: genAllOps },
    { id: 'power',     label: '累乗の計算',               gen: genPower },
    { id: 'brace',     label: '中かっこを含む計算',       gen: genBrace },
    { id: 'literal',   label: '文字式の計算',             gen: genLiteral },
    { id: 'notation',  label: '文字式の表し方',           gen: genNotation },
    { id: 'subst',     label: '代入の計算',               gen: genSubst },
    { id: 'maxof4',    label: '大小関係',                 gen: genMaxOf4 },

    { id: 'round4',      label: '四捨五入（小4）',                     gen: genRound4,      defaultOff: true },
    { id: 'fourOps4',    label: '四則計算（小4）',                     gen: genFourOps4,    defaultOff: true },
    { id: 'fracAddSub5', label: '分数のたし算・ひき算（小5）',         gen: genFracAddSub5, defaultOff: true },
    { id: 'decDiv5',     label: '小数のわり算（小5）',                 gen: genDecDiv5,     defaultOff: true },
    { id: 'fracMulDiv6', label: '分数のかけ算・わり算（小6）',         gen: genFracMulDiv6, defaultOff: true },
  ];

  /* ---------- 問題生成関数 ---------- */

  function genAdd2() {
    const a = randNonZero(-9, 9);
    const b = randNonZero(-9, 9);
    const answer = a + b;
    const expr = `${fmtLead(a)} + ${fmtNum(b)}`;
    const wrongs = [-answer, a - b, a + Math.abs(b), Math.abs(a) + Math.abs(b)];
    return { category: 'add2', question: `${expr} = ?`, answer, choices: buildChoices(answer, wrongs) };
  }

  function genSub2() {
    const a = randNonZero(-9, 9);
    const b = randNonZero(-9, 9);
    const answer = a - b;
    const expr = `${fmtLead(a)} − ${fmtNum(b)}`;
    const wrongs = [-answer, a + b, a - Math.abs(b), Math.abs(a) - Math.abs(b)];
    return { category: 'sub2', question: `${expr} = ?`, answer, choices: buildChoices(answer, wrongs) };
  }

  function genChain3() {
    const t = [randNonZero(-9, 9), randNonZero(-9, 9), randNonZero(-9, 9)];
    const answer = t[0] + t[1] + t[2];
    let expr = fmtLead(t[0]);
    for (let i = 1; i < t.length; i++) {
      expr += t[i] < 0 ? ` − ${Math.abs(t[i])}` : ` + ${t[i]}`;
    }
    const wrongs = [-answer, t[0] + t[1] - t[2], t[0] - t[1] + t[2], answer + (t[2] >= 0 ? -2 * t[2] : 2 * Math.abs(t[2]))];
    return { category: 'chain3', question: `${expr} = ?`, answer, choices: buildChoices(answer, wrongs) };
  }

  function genMul2() {
    const a = randNonZero(-9, 9);
    const b = randNonZero(-9, 9);
    const answer = a * b;
    const expr = `${fmtLead(a)} × ${fmtNum(b)}`;
    const wrongs = [-answer, Math.abs(a) * Math.abs(b), a * Math.abs(b), Math.abs(a) * b];
    return { category: 'mul2', question: `${expr} = ?`, answer, choices: buildChoices(answer, wrongs) };
  }

  function genDiv2() {
    const b = randNonZero(-9, 9);
    const k = randNonZero(-9, 9);
    const a = b * k;
    const answer = k;
    const expr = `${fmtLead(a)} ÷ ${fmtNum(b)}`;
    const wrongs = [-answer, Math.abs(answer), answer + 2, answer - 2];
    return { category: 'div2', question: `${expr} = ?`, answer, choices: buildChoices(answer, wrongs) };
  }

  // カッコ内：演算子の直後の数（c）が正の数のみ → ++／+−／−+／−− を除外
  // b（最初の数）は負でもOK。例：(-7 + 8) ✅、(7 + -8) ❌
  function genMixedParen() {
    const a = randNonZero(-6, 6);
    const b = randNonZero(-9, 9);
    const c = randInt(1, 9);       // cは正の数のみ
    const useMinus = Math.random() < 0.5;
    const inner = useMinus ? b - c : b + c;
    const answer = a * inner;
    const displayInner = useMinus ? `${b} − ${c}` : `${b} + ${c}`;
    const displayExpr = `${fmtLead(a)} × (${displayInner})`;
    const wrongs = [-answer, a * b, a + inner, Math.abs(a) * inner];
    return { category: 'mixed', question: `${displayExpr} = ?`, answer, choices: buildChoices(answer, wrongs) };
  }

  function genAllOps() {
    const patterns = [3, 4];
    const pattern = patterns[randInt(0, patterns.length - 1)];

    if (pattern === 3) {
      const a = randNonZero(-9, 9);
      const useMul = Math.random() < 0.5;
      let b, c, term2, opSym2;
      if (useMul) {
        b = randNonZero(-7, 7);
        c = randNonZero(-7, 7);
        term2 = b * c;
        opSym2 = '×';
      } else {
        c = randNonZero(-7, 7);
        const k = randNonZero(-7, 7);
        b = c * k;
        term2 = k;
        opSym2 = '÷';
      }
      const useMinus = Math.random() < 0.5;
      const answer = useMinus ? a - term2 : a + term2;
      const expr = `${fmtLead(a)} ${useMinus ? '−' : '+'} ${fmtNum(b)} ${opSym2} ${fmtNum(c)}`;
      const leftToRight = useMul
        ? (useMinus ? (a - b) * c : (a + b) * c)
        : (useMinus ? (a - b) / c : (a + b) / c);
      const wrongs = [-answer, useMinus ? a + term2 : a - term2, Math.round(leftToRight)];
      return { category: 'allops', question: `${expr} = ?`, answer, choices: buildChoices(answer, wrongs) };
    } else {
      const a = randNonZero(-6, 6);
      const b = randNonZero(-6, 6);
      const c = randNonZero(-6, 6);
      const d = randNonZero(-6, 6);
      const t1 = a * b;
      const t2 = c * d;
      const useMinus = Math.random() < 0.5;
      const answer = useMinus ? t1 - t2 : t1 + t2;
      const expr = `${fmtLead(a)} × ${fmtNum(b)} ${useMinus ? '−' : '+'} ${fmtNum(c)} × ${fmtNum(d)}`;
      const wrongs = [-answer, useMinus ? t1 + t2 : t1 - t2, a * (useMinus ? b - c * d : b + c * d)];
      return { category: 'allops', question: `${expr} = ?`, answer, choices: buildChoices(answer, wrongs) };
    }
  }

  function genPower() {
    const useParen = Math.random() < 0.5;
    const base = randInt(2, 9);
    const exp = randInt(2, 3);

    if (useParen) {
      const answer = Math.pow(-base, exp);
      const expStr = exp === 2 ? '²' : '³';
      const question = `(−${base})${expStr} = ?`;
      const wrongs = [-answer, Math.pow(base, exp - 1) * base * (exp === 2 ? -1 : 1), -Math.pow(base, exp)];
      return { category: 'power', question, answer, choices: buildChoices(answer, wrongs) };
    } else {
      const answer = -Math.pow(base, exp);
      const expStr = exp === 2 ? '²' : '³';
      const question = `−${base}${expStr} = ?`;
      const wrongs = [Math.pow(base, exp), Math.pow(-base, exp), -Math.pow(base, exp - 1)];
      return { category: 'power', question, answer, choices: buildChoices(answer, wrongs) };
    }
  }

  function genBrace() {
    const a = randNonZero(-9, 9);
    const b = randNonZero(-9, 9);
    const c = randNonZero(-9, 9);
    const innerMinus = Math.random() < 0.5;
    const outerMinus = Math.random() < 0.5;

    const inner = innerMinus ? b - c : b + c;
    const answer = outerMinus ? a - inner : a + inner;

    // カッコ内の数には符号を明示する：(+5) または (−5)
    const cStr = c < 0 ? `(−${Math.abs(c)})` : `(+${c})`;
    const innerStr = innerMinus ? `${b} − ${cStr}` : `${b} + ${cStr}`;
    const question = `${fmtLead(a)} ${outerMinus ? '−' : '+'} {${innerStr}} = ?`;

    const wrongMisreadInner = outerMinus ? a - (b + c) : a + (b - c);
    const wrongs = [-answer, wrongMisreadInner, outerMinus ? a + inner : a - inner];
    return { category: 'brace', question, answer, choices: buildChoices(answer, wrongs) };
  }

  // 文字式の計算：同類項をまとめる（文字と数の項が混ざったもの）
  function genLiteral() {
    const letter = Math.random() < 0.5 ? 'a' : 'x';

    // 文字の係数を2〜4項生成
    const ca1 = randNonZero(-5, 5);
    const ca2 = randNonZero(-5, 5);
    const n1  = randNonZero(-9, 9);
    const n2  = randNonZero(-9, 9);

    const caSum = ca1 + ca2;   // 文字の係数の和
    const nSum  = n1 + n2;     // 数の和

    // 答えの文字式を生成（係数が0・1・-1の場合を考慮）
    function fmtLiteral(coef, num) {
      let str = '';
      if (coef === 0 && num === 0) return '0';
      if (coef !== 0) {
        if (coef === 1) str += letter;
        else if (coef === -1) str += `−${letter}`;
        else if (coef < 0) str += `−${Math.abs(coef)}${letter}`;
        else str += `${coef}${letter}`;
      }
      if (num !== 0) {
        if (str === '') str += num < 0 ? `−${Math.abs(num)}` : `${num}`;
        else str += num < 0 ? ` − ${Math.abs(num)}` : ` + ${num}`;
      }
      return str;
    }

    // 問題の式を生成
    function termStr(coef, isFirst) {
      if (coef === 0) return '';
      if (isFirst) {
        if (coef === 1) return letter;
        if (coef === -1) return `−${letter}`;
        if (coef < 0) return `−${Math.abs(coef)}${letter}`;
        return `${coef}${letter}`;
      }
      if (coef === 1) return `+ ${letter}`;
      if (coef === -1) return `− ${letter}`;
      if (coef < 0) return `− ${Math.abs(coef)}${letter}`;
      return `+ ${coef}${letter}`;
    }
    function numStr(num, isFirst) {
      if (num === 0) return '';
      if (isFirst) return num < 0 ? `−${Math.abs(num)}` : `${num}`;
      return num < 0 ? `− ${Math.abs(num)}` : `+ ${num}`;
    }

    // 式の順番をランダムに並べ替え（文字→数→文字→数 または 文字→文字→数→数 など）
    const terms = [
      { type: 'lit', val: ca1 },
      { type: 'lit', val: ca2 },
      { type: 'num', val: n1 },
      { type: 'num', val: n2 },
    ];
    // シャッフル
    for (let i = terms.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [terms[i], terms[j]] = [terms[j], terms[i]];
    }

    let question = '';
    terms.forEach((t, i) => {
      const isFirst = i === 0;
      if (t.type === 'lit') question += (question ? ' ' : '') + termStr(t.val, isFirst);
      else question += (question ? ' ' : '') + numStr(t.val, isFirst);
    });
    question += ' を計算せよ。';

    const answer = fmtLiteral(caSum, nSum);

    // ありがちな誤答を生成
    const wrong1 = fmtLiteral(caSum, -nSum);         // 数の符号を間違える
    const wrong2 = fmtLiteral(-caSum, nSum);          // 文字の符号を間違える
    const wrong3 = fmtLiteral(ca1 + ca2 + 1, nSum);  // 係数を1つ多く足す

    const choiceSet = new Set([answer]);
    const choices = [answer];
    for (const w of [wrong1, wrong2, wrong3]) {
      if (!choiceSet.has(w) && w !== '') { choiceSet.add(w); choices.push(w); }
    }
    // 足りない場合は係数を±1した選択肢を追加
    let guard = 0;
    while (choices.length < 4 && guard < 30) {
      guard++;
      const dc = randNonZero(-2, 2);
      const dn = randNonZero(-2, 2);
      const cand = fmtLiteral(caSum + dc, nSum + dn);
      if (!choiceSet.has(cand) && cand !== '') { choiceSet.add(cand); choices.push(cand); }
    }

    return { category: 'literal', question, answer, choices: shuffle(choices) };
  }

  // 文字式の表し方：×や÷の省略ルールを問う
  function genNotation() {
    const letter = Math.random() < 0.5 ? 'a' : 'x';
    const patterns = [
      // 係数×文字 → 係数文字
      () => {
        const k = randInt(2, 9);
        const q = `${letter} × ${k} を文字式で表すと？`;
        const ans = `${k}${letter}`;
        const w = [`${letter}${k}`, `${k} × ${letter}`, `${letter}+${k}`];
        return { q, ans, w };
      },
      // 係数×文字² → 係数文字²
      () => {
        const k = randInt(2, 9);
        const q = `${k} × ${letter} × ${letter} を文字式で表すと？`;
        const ans = `${k}${letter}²`;
        const w = [`${letter}² × ${k}`, `${k}${letter}`, `${k}²${letter}`];
        return { q, ans, w };
      },
      // 文字÷係数 → 文字/係数
      () => {
        const k = randInt(2, 9);
        const q = `${letter} ÷ ${k} を文字式で表すと？`;
        const ans = `${letter}/${k}`;
        const w = [`${k}/${letter}`, `${k}${letter}`, `${letter} × ${k}`];
        return { q, ans, w };
      },
      // 数÷文字 → 数/文字
      () => {
        const k = randInt(2, 9);
        const q = `${k} ÷ ${letter} を文字式で表すと？`;
        const ans = `${k}/${letter}`;
        const w = [`${letter}/${k}`, `${k}${letter}`, `${k} × ${letter}`];
        return { q, ans, w };
      },
      // (文字+数)×係数 → 係数(文字+数)
      () => {
        const k = randInt(2, 6);
        const n = randInt(1, 9);
        const q = `(${letter} + ${n}) × ${k} を文字式で表すと？`;
        const ans = `${k}(${letter} + ${n})`;
        const w = [`(${letter} + ${n})${k}`, `${k}${letter} + ${n}`, `${k}${letter} + ${k}${n}`];
        return { q, ans, w };
      },
      // 係数×文字+定数（×の省略のみ）
      () => {
        const a = randInt(2, 5);
        const b = randInt(1, 9);
        const q = `${a} × ${letter} + ${b} を文字式で表すと？`;
        const ans = `${a}${letter} + ${b}`;
        const w = [`${letter}${a} + ${b}`, `${a}${letter}${b}`, `${a}(${letter} + ${b})`];
        return { q, ans, w };
      },
    ];

    const p = patterns[randInt(0, patterns.length - 1)]();
    const choiceSet = new Set([p.ans]);
    const choices = [p.ans];
    for (const w of p.w) {
      if (!choiceSet.has(w)) { choiceSet.add(w); choices.push(w); }
    }
    while (choices.length < 4) {
      const cand = `${randInt(2,9)}${letter}`;
      if (!choiceSet.has(cand)) { choiceSet.add(cand); choices.push(cand); }
    }
    return { category: 'notation', question: p.q, answer: p.ans, choices: shuffle(choices) };
  }

  // 代入の計算：a または x に値を代入して式の値を求める
  function genSubst() {
    const letter = Math.random() < 0.5 ? 'a' : 'x';
    const val = randNonZero(-5, 5);

    const patterns = [
      // 係数×文字+定数
      () => {
        const a = randNonZero(-4, 4);
        const b = randNonZero(-9, 9);
        const answer = a * val + b;
        const bStr = b < 0 ? ` − ${Math.abs(b)}` : ` + ${b}`;
        const q = `${letter} = ${val} のとき、${a === 1 ? '' : a === -1 ? '−' : a}${letter}${bStr} の値を求めよ。`;
        return { q, answer };
      },
      // 係数×文字²+定数
      () => {
        const a = randNonZero(-3, 3);
        const b = randNonZero(-9, 9);
        const answer = a * val * val + b;
        const bStr = b < 0 ? ` − ${Math.abs(b)}` : ` + ${b}`;
        const aStr = a === 1 ? '' : a === -1 ? '−' : `${a}`;
        const q = `${letter} = ${val} のとき、${aStr}${letter}² ${bStr.trim()} の値を求めよ。`;
        return { q, answer };
      },
      // 2つの文字式の計算（同じ文字）
      () => {
        const a = randNonZero(-4, 4);
        const b = randNonZero(-4, 4);
        const answer = a * val + b * val;
        const bStr = b < 0 ? ` − ${Math.abs(b)}${letter}` : ` + ${b}${letter}`;
        const aStr = a === 1 ? letter : a === -1 ? `−${letter}` : `${a}${letter}`;
        const q = `${letter} = ${val} のとき、${aStr}${bStr} の値を求めよ。`;
        return { q, answer };
      },
    ];

    const p = patterns[randInt(0, patterns.length - 1)]();
    const answer = p.answer;
    const wrongs = [-answer, answer + val, answer - val, answer * 2].filter((v, i, arr) => arr.indexOf(v) === i && v !== answer);
    return { category: 'subst', question: p.q, answer, choices: buildChoices(answer, wrongs) };
  }

  function genMaxOf4() {
    const nums = new Set();
    while (nums.size < 4) nums.add(randNonZero(-12, 12));
    const arr = Array.from(nums);
    const askMax = Math.random() < 0.5;
    const answer = askMax ? Math.max(...arr) : Math.min(...arr);
    const label = askMax ? '次の4つの数のうち、最も大きい数はどれか。' : '次の4つの数のうち、最も小さい数はどれか。';
    return { category: 'maxof4', question: label, answer, choices: shuffle(arr).map(String), isOrdering: true };
  }

  // 四捨五入（小4）：十の位／百の位／千の位で概数にする
  function genRound4() {
    const placeOptions = [
      { name: '十', pow: 1 },
      { name: '百', pow: 2 },
      { name: '千', pow: 3 },
    ];
    const p = placeOptions[randInt(0, placeOptions.length - 1)];
    const digits = p.pow + randInt(1, 2);
    const min = Math.pow(10, digits - 1);
    const max = Math.pow(10, digits) - 1;
    const num = randInt(min, max);
    const unit = Math.pow(10, p.pow);
    const answer = Math.round(num / unit) * unit;
    const question = `${num} を${p.name}の位で四捨五入すると？`;
    const wrongs = [
      Math.floor(num / unit) * unit,
      Math.ceil(num / unit) * unit,
      answer + unit,
      answer - unit,
    ];
    return { category: 'round4', question, answer, choices: buildChoices(answer, wrongs) };
  }

  // 四則計算（小4）：かっこ・×÷の優先順位（負の数は使わない）
  function genFourOps4() {
    const pattern = randInt(0, 3);
    let question, answer, wrongs;

    if (pattern === 0) {
      const b = randInt(2, 9), c = randInt(2, 9), a = randInt(1, 50);
      answer = a + b * c;
      question = `${a} + ${b} × ${c} = ?`;
      wrongs = [(a + b) * c, a + b + c, a * b + c];
    } else if (pattern === 1) {
      const b = randInt(2, 9), c = randInt(2, 9);
      const bc = b * c;
      const a = bc + randInt(1, 30);
      answer = a - bc;
      question = `${a} − ${b} × ${c} = ?`;
      wrongs = [(a - b) * c, a - b - c, a - (b + c)];
    } else if (pattern === 2) {
      const c = randInt(2, 9), q = randInt(2, 9), b = c * q;
      const a = randInt(1, 50);
      answer = a + q;
      question = `${a} + ${b} ÷ ${c} = ?`;
      wrongs = [(a + b) / c, a + b - c, a * q];
    } else {
      const a = randInt(2, 20), b = randInt(2, 20), c = randInt(2, 9);
      const useMinus = a > b && Math.random() < 0.5;
      const inner = useMinus ? a - b : a + b;
      answer = inner * c;
      question = `(${a} ${useMinus ? '−' : '+'} ${b}) × ${c} = ?`;
      const wrongMisreadNoParen = useMinus ? a - b * c : a + b * c;
      wrongs = [wrongMisreadNoParen, inner + c, a * c + (useMinus ? -b : b)];
    }

    wrongs = wrongs.map(Math.round);
    return { category: 'fourOps4', question, answer, choices: buildChoices(answer, wrongs) };
  }

  // 分数のたし算・ひき算（通分・約分あり、小5）
  function genFracAddSub5() {
    let [n1, d1] = randFrac(9);
    let [n2, d2] = randFrac(9);
    while (d2 === d1) { [n2, d2] = randFrac(9); }

    const isAdd = Math.random() < 0.5;
    const L = lcm(d1, d2);
    let N1 = n1 * (L / d1);
    let N2 = n2 * (L / d2);

    if (!isAdd && N1 < N2) {
      [n1, d1, n2, d2] = [n2, d2, n1, d1];
      N1 = n1 * (L / d1);
      N2 = n2 * (L / d2);
    }

    const numAns = isAdd ? N1 + N2 : N1 - N2;
    const denAns = L;
    const answer = fracToStr(numAns, denAns);
    const opSym = isAdd ? '+' : '−';
    const question = `${n1}/${d1} ${opSym} ${n2}/${d2} = ?`;

    const [, rd] = reduceFrac(numAns, denAns);
    const wrongUnreduced = denAns === rd ? null : `${numAns}/${denAns}`;
    const wrongAddDenom = `${n1 + n2}/${d1 + d2}`;
    const wrongNumOnly = `${n1 + n2}/${L}`;
    const candidates = [wrongUnreduced, wrongAddDenom, wrongNumOnly].filter(Boolean);

    return { category: 'fracAddSub5', question, answer, choices: buildChoicesFromSet(answer, candidates) };
  }

  // 小数のわり算（小5、商は整数になる）
  function genDecDiv5() {
    let divisorTenths;
    do { divisorTenths = randInt(2, 98); } while (divisorTenths % 10 === 0);
    const divisor = (divisorTenths / 10).toFixed(1);
    const quotient = randInt(2, 12);
    const dividend = ((divisorTenths * quotient) / 10).toFixed(1);
    const answer = quotient;
    const question = `${dividend} ÷ ${divisor} = ?`;
    const wrongs = [quotient + 1, quotient - 1, quotient * 10, Math.max(1, quotient - 2)];
    return { category: 'decDiv5', question, answer, choices: buildChoices(answer, wrongs) };
  }

  // 分数のかけ算・わり算（小6）
  function genFracMulDiv6() {
    const [n1, d1] = randFrac(9);
    const [n2, d2] = randFrac(9);
    const isMul = Math.random() < 0.5;

    const numAns = isMul ? n1 * n2 : n1 * d2;
    const denAns = isMul ? d1 * d2 : d1 * n2;
    const answer = fracToStr(numAns, denAns);
    const opSym = isMul ? '×' : '÷';
    const question = `${n1}/${d1} ${opSym} ${n2}/${d2} = ?`;

    const [, rd] = reduceFrac(numAns, denAns);
    const wrongUnreduced = denAns === rd ? null : `${numAns}/${denAns}`;
    const wrongFlippedOp = isMul ? `${n1 * d2}/${d1 * n2}` : `${n1 * n2}/${d1 * d2}`;
    const wrongAddInstead = `${n1 * d2 + n2 * d1}/${d1 * d2}`;
    const candidates = [wrongUnreduced, wrongFlippedOp, wrongAddInstead].filter(Boolean);

    return { category: 'fracMulDiv6', question, answer, choices: buildChoicesFromSet(answer, candidates) };
  }

  /* ---------- アプリ状態 ---------- */

  const state = {
    total: 0,
    correct: 0,
    current: null,
    answered: false,
    enabled: new Set(CATEGORIES.filter(c => !c.defaultOff).map(c => c.id)),
  };

  const els = {
    questionText: document.getElementById('questionText'),
    categoryTag: document.getElementById('categoryTag'),
    choices: document.getElementById('choices'),
    feedback: document.getElementById('feedback'),
    nextBtn: document.getElementById('nextBtn'),
    statTotal: document.getElementById('statTotal'),
    statCorrect: document.getElementById('statCorrect'),
    statRate: document.getElementById('statRate'),
    resetBtn: document.getElementById('resetBtn'),
    settingsToggle: document.getElementById('settingsToggle'),
    settingsPanel: document.getElementById('settingsPanel'),
    settingsGrid: document.getElementById('settingsGrid'),
    numberlineTicks: document.querySelector('.nl-ticks'),

    loginCard: document.getElementById('loginCard'),
    tabLogin: document.getElementById('tabLogin'),
    tabRegister: document.getElementById('tabRegister'),
    loginForm: document.getElementById('loginForm'),
    loginId: document.getElementById('loginId'),
    loginPassword: document.getElementById('loginPassword'),
    loginError: document.getElementById('loginError'),
    loginSubmit: document.getElementById('loginSubmit'),
    registerForm: document.getElementById('registerForm'),
    registerId: document.getElementById('registerId'),
    registerPassword: document.getElementById('registerPassword'),
    registerPasswordConfirm: document.getElementById('registerPasswordConfirm'),
    registerError: document.getElementById('registerError'),
    registerSubmit: document.getElementById('registerSubmit'),
    guestStartBtn: document.getElementById('guestStartBtn'),
    appMain: document.getElementById('appMain'),
    userName: document.getElementById('userName'),
    logoutBtn: document.getElementById('logoutBtn'),
    historyToggle: document.getElementById('historyToggle'),
    historyPanel: document.getElementById('historyPanel'),
    historySummary: document.getElementById('historySummary'),
    historyCats: document.getElementById('historyCats'),
    historyRecent: document.getElementById('historyRecent'),
  };

  const categoryLabel = Object.fromEntries(CATEGORIES.map(c => [c.id, c.label]));

  /* ---------- 描画 ---------- */

  function drawNumberline() {
    const ticks = [];
    for (let v = -6; v <= 6; v++) {
      if (v === 0) continue;
      const x = 240 + v * 35;
      const cls = v < 0 ? 'nl-tick nl-tick-neg' : 'nl-tick nl-tick-pos';
      ticks.push(`<line x1="${x}" y1="12" x2="${x}" y2="24" class="${cls}" />`);
    }
    els.numberlineTicks.innerHTML = ticks.join('');
  }

  function renderSettings() {
    els.settingsGrid.innerHTML = CATEGORIES.map(c => `
      <label class="settings-item">
        <input type="checkbox" data-cat="${c.id}" ${state.enabled.has(c.id) ? 'checked' : ''} />
        ${c.label}
      </label>
    `).join('');
    els.settingsGrid.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.cat;
        if (cb.checked) state.enabled.add(id);
        else state.enabled.delete(id);
        if (state.enabled.size === 0) {
          state.enabled.add(id);
          cb.checked = true;
        }
      });
    });
  }

  function updateStats() {
    els.statTotal.textContent = state.total;
    els.statCorrect.textContent = state.correct;
    els.statRate.textContent = state.total === 0 ? '—' : `${Math.round((state.correct / state.total) * 100)}%`;
  }

  function pickGenerator() {
    const pool = CATEGORIES.filter(c => state.enabled.has(c.id));
    const c = pool[randInt(0, pool.length - 1)];
    return c;
  }

  function nextQuestion() {
    const cat = pickGenerator();
    const q = cat.gen();
    state.current = q;
    state.answered = false;

    els.categoryTag.textContent = categoryLabel[q.category];
    els.questionText.textContent = q.question;
    els.feedback.textContent = '';
    els.feedback.className = 'feedback';
    els.nextBtn.disabled = true;

    els.choices.innerHTML = '';
    q.choices.forEach(choiceStr => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.type = 'button';
      btn.textContent = choiceStr;
      btn.addEventListener('click', () => handleAnswer(btn, choiceStr));
      els.choices.appendChild(btn);
    });
  }

  function handleAnswer(btn, choiceStr) {
    if (state.answered) return;
    state.answered = true;
    state.total++;

    const correctStr = String(state.current.answer);
    const isCorrect = choiceStr === correctStr;
    if (isCorrect) state.correct++;

    Array.from(els.choices.children).forEach(b => {
      b.disabled = true;
      if (b.textContent === correctStr) b.classList.add('is-correct');
      else if (b === btn) b.classList.add('is-incorrect');
    });

    els.feedback.textContent = isCorrect ? '正解！' : `不正解。正解は ${correctStr} です。`;
    els.feedback.classList.add(isCorrect ? 'correct' : 'incorrect');

    els.nextBtn.disabled = false;
    updateStats();

    var session = loadSession();
    if (session && session.id) {
      apiPost('log', { id: session.id, category: state.current.category, correct: isCorrect }).catch(function () { });
    }
  }

  function resetStats() {
    state.total = 0;
    state.correct = 0;
    updateStats();
  }

  /* ---------- イベント登録 ---------- */

  els.nextBtn.addEventListener('click', nextQuestion);
  els.resetBtn.addEventListener('click', resetStats);
  els.settingsToggle.addEventListener('click', () => {
    const isHidden = els.settingsPanel.hasAttribute('hidden');
    if (isHidden) els.settingsPanel.removeAttribute('hidden');
    else els.settingsPanel.setAttribute('hidden', '');
    els.settingsToggle.setAttribute('aria-expanded', String(isHidden));
  });

  /* ---------- ログイン画面 ---------- */

  function digitsOnly(input) {
    input.addEventListener('input', function () {
      input.value = input.value.replace(/[^0-9]/g, '').slice(0, 4);
    });
  }
  digitsOnly(els.loginPassword);
  digitsOnly(els.registerPassword);
  digitsOnly(els.registerPasswordConfirm);

  function showFieldError(el, msg) {
    el.textContent = msg;
    el.hidden = false;
  }
  function hideFieldError(el) {
    el.hidden = true;
    el.textContent = '';
  }

  function switchTab(tab) {
    var toLogin = tab === 'login';
    els.tabLogin.classList.toggle('is-active', toLogin);
    els.tabRegister.classList.toggle('is-active', !toLogin);
    els.tabLogin.setAttribute('aria-selected', String(toLogin));
    els.tabRegister.setAttribute('aria-selected', String(!toLogin));
    els.loginForm.hidden = !toLogin;
    els.registerForm.hidden = toLogin;
    hideFieldError(els.loginError);
    hideFieldError(els.registerError);
  }

  function resetLoginForms() {
    els.loginForm.reset();
    els.registerForm.reset();
    hideFieldError(els.loginError);
    hideFieldError(els.registerError);
    switchTab('login');
  }

  function showApp(name, isGuest) {
    els.loginCard.hidden = true;
    els.appMain.hidden = false;
    els.userName.textContent = name;
    els.historyToggle.hidden = !!isGuest;
    els.historyPanel.hidden = true;
    drawNumberline();
    renderSettings();
    updateStats();
    nextQuestion();
    initInstallBanner();
  }

  function handleLoginSubmit(ev) {
    ev.preventDefault();
    hideFieldError(els.loginError);
    var id = els.loginId.value.trim();
    var password = els.loginPassword.value;
    if (!id || !password) return;

    els.loginSubmit.disabled = true;
    apiPost('login', { id: id, password: password }).then(function (res) {
      els.loginSubmit.disabled = false;
      if (!res.ok) {
        var msg = '通信に失敗しました。もう一度お試しください。';
        if (res.error === 'not_found') msg = 'そのIDは登録されていません。先生に確認してください。';
        else if (res.error === 'no_password') msg = 'まだパスワードが設定されていません。「新規登録」から設定してください。';
        else if (res.error === 'wrong_password') msg = 'パスワードが違います。';
        showFieldError(els.loginError, msg);
        return;
      }
      saveSession({ id: id, name: res.name });
      showApp(res.name);
    }).catch(function () {
      els.loginSubmit.disabled = false;
      showFieldError(els.loginError, '通信に失敗しました。もう一度お試しください。');
    });
  }

  function handleRegisterSubmit(ev) {
    ev.preventDefault();
    hideFieldError(els.registerError);
    var id = els.registerId.value.trim();
    var pw = els.registerPassword.value;
    var pwConfirm = els.registerPasswordConfirm.value;
    if (!id) return;
    if (!/^\d{4}$/.test(pw)) { showFieldError(els.registerError, 'パスワードは数字4桁で入力してください。'); return; }
    if (pw !== pwConfirm) { showFieldError(els.registerError, 'パスワードが一致しません。'); return; }

    els.registerSubmit.disabled = true;
    apiPost('register', { id: id, password: pw }).then(function (res) {
      els.registerSubmit.disabled = false;
      if (!res.ok) {
        var msg = '登録に失敗しました。もう一度お試しください。';
        if (res.error === 'not_found') msg = 'そのIDは登録されていません。先生に確認してください。';
        else if (res.error === 'already_registered') msg = 'そのIDはすでに登録済みです。「ログイン」から入ってください。';
        else if (res.error === 'invalid_password') msg = 'パスワードは数字4桁で入力してください。';
        showFieldError(els.registerError, msg);
        return;
      }
      saveSession({ id: id, name: res.name });
      showApp(res.name);
    }).catch(function () {
      els.registerSubmit.disabled = false;
      showFieldError(els.registerError, '通信に失敗しました。もう一度お試しください。');
    });
  }

  function handleGuestStart() {
    saveSession({ id: null, name: 'ゲスト', guest: true });
    showApp('ゲスト', true);
  }

  function handleLogout() {
    clearSession();
    els.appMain.hidden = true;
    els.historyPanel.hidden = true;
    els.loginCard.hidden = false;
    resetLoginForms();
    els.loginId.focus();
  }

  /* ---------- 学習記録 ---------- */

  function renderHistory(data) {
    els.historySummary.textContent = data.total === 0
      ? 'まだ記録がありません。問題を解いてみましょう。'
      : `のべ ${data.total} 問中 ${data.correct} 問正解（正答率 ${Math.round((data.correct / data.total) * 100)}%）`;

    els.historyCats.innerHTML = data.byCategory
      .sort(function (a, b) { return b.total - a.total; })
      .map(function (c) {
        var rate = Math.round((c.correct / c.total) * 100);
        var label = categoryLabel[c.category] || c.category;
        return `<div class="history-cat-row"><span>${label}</span><span class="rate">${c.correct}/${c.total}（${rate}%）</span></div>`;
      }).join('');

    els.historyRecent.innerHTML = data.recent.map(function (r) {
      var d = new Date(r.timestamp);
      var dateStr = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      var label = categoryLabel[r.category] || r.category;
      var markCls = r.correct ? 'ok' : 'ng';
      var markTxt = r.correct ? '○' : '✕';
      return `<div class="history-recent-item"><span>${dateStr}　${label}</span><span class="mark ${markCls}">${markTxt}</span></div>`;
    }).join('');
  }

  function toggleHistory() {
    var isHidden = els.historyPanel.hasAttribute('hidden');
    if (!isHidden) { els.historyPanel.setAttribute('hidden', ''); return; }

    els.historyPanel.removeAttribute('hidden');
    els.historySummary.textContent = '読み込み中…';
    els.historyCats.innerHTML = '';
    els.historyRecent.innerHTML = '';

    var session = loadSession();
    if (!session || !session.id) return;
    apiPost('history', { id: session.id }).then(function (res) {
      if (!res.ok) { els.historySummary.textContent = '読み込みに失敗しました。'; return; }
      renderHistory(res);
    }).catch(function () {
      els.historySummary.textContent = '読み込みに失敗しました。';
    });
  }

  /* ---------- 初期化 ---------- */

  els.loginForm.addEventListener('submit', handleLoginSubmit);
  els.registerForm.addEventListener('submit', handleRegisterSubmit);
  els.tabLogin.addEventListener('click', () => switchTab('login'));
  els.tabRegister.addEventListener('click', () => switchTab('register'));
  els.logoutBtn.addEventListener('click', handleLogout);
  els.historyToggle.addEventListener('click', toggleHistory);
  els.guestStartBtn.addEventListener('click', handleGuestStart);

  var existingSession = loadSession();
  if (existingSession) {
    showApp(existingSession.name, !!existingSession.guest);
  } else {
    resetLoginForms();
  }

  /* ---------- PWAインストール案内 ---------- */

  function initInstallBanner() {
    const banner = document.getElementById('installBanner');
    const text = document.getElementById('installText');
    const installBtn = document.getElementById('installBtn');
    const dismissBtn = document.getElementById('installDismiss');
    if (!banner) return;

    const STORAGE_KEY = 'seifukazu-quiz-install-dismissed';
    let dismissed = false;
    try { dismissed = localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { }

    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;

    if (dismissed || isStandalone) return;

    const ua = window.navigator.userAgent;
    const isIos = /iPhone|iPad|iPod/i.test(ua);
    const isAndroid = /Android/i.test(ua);

    let deferredPrompt = null;

    function showBanner() { banner.hidden = false; }
    function hideBanner() {
      banner.hidden = true;
      try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) { }
    }

    if (isAndroid) {
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        text.textContent = 'アプリとしてホーム画面に追加できます。';
        installBtn.hidden = false;
        showBanner();
      });
      installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        hideBanner();
      });
    } else if (isIos) {
      text.textContent = '画面下の共有ボタンから「ホーム画面に追加」を選ぶと、アイコンから起動できます。';
      showBanner();
    }

    dismissBtn.addEventListener('click', hideBanner);
  }

})();
