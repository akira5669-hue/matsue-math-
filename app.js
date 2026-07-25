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

  /* ---------- ゲーム状態（ポイント・レベル・EXP）の永続化 ---------- */

  var GAME_KEY = 'matsue-math-game';
  var POINTS_DAILY_CAP = 100;
  var EXP_PER_LEVEL = 10;
  var MAX_LEVEL = 9999;

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function loadGameState() {
    try {
      var raw = localStorage.getItem(GAME_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function saveGameState(s) {
    try {
      localStorage.setItem(GAME_KEY, JSON.stringify({
        points: s.points, level: s.level, exp: s.exp,
        pointsToday: s.pointsToday, pointsDate: s.pointsDate, enemyIdx: s.enemyIdx,
      }));
    } catch (e) { }
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
  function fmtCx(n) {
    if (n === 1)  return 'x';
    if (n === -1) return '−x';
    if (n < 0)    return `−${Math.abs(n)}x`;
    return `${n}x`;
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

  /* ---------- 途中式ヘルパー ---------- */

  function addSteps(a, b) {
    const res = a + b;
    const absA = Math.abs(a), absB = Math.abs(b);
    if (a >= 0 && b >= 0) {
      return [`${a} + ${b} = ${res}`];
    }
    if (a <= 0 && b <= 0) {
      return [
        '同符号（−）→ 絶対値の和、符号は −',
        `= −(${absA} + ${absB}) = ${res}`
      ];
    }
    if (absA === absB) {
      return ['異符号・絶対値が等しい → = 0'];
    }
    const larger = Math.max(absA, absB), smaller = Math.min(absA, absB);
    const dominant = absA > absB ? a : b;
    const signStr = dominant < 0 ? '−' : '';
    return [
      `異符号 → 絶対値の差、符号は絶対値大（${dominant < 0 ? '−' : '＋'}）の方`,
      `= ${signStr}(${larger} − ${smaller}) = ${res}`
    ];
  }

  function mulSteps(a, b) {
    const res = a * b;
    const same = (a > 0) === (b > 0);
    return [
      `符号: ${same ? '同符号 → ＋（プラス）' : '異符号 → −（マイナス）'}`,
      `絶対値: ${Math.abs(a)} × ${Math.abs(b)} = ${Math.abs(res)}`,
      `= ${res}`
    ];
  }

  function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function stepToHtml(s) {
    const parts = String(s).split(/([\w]+\/[\w]+)/);
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        const slash = part.indexOf('/');
        const num = escHtml(part.slice(0, slash));
        const den = escHtml(part.slice(slash + 1));
        return `<span class="frac"><span class="num">${num}</span><span class="den">${den}</span></span>`;
      }
      return escHtml(part);
    }).join('');
  }

  /* ---------- 追加ジェネレータ ---------- */

  function genEquation() {
    const ans = randNonZero(-9, 9);
    const pat = randInt(0, 2);
    let q, steps;
    if (pat === 0) {
      const a = randNonZero(-5, 5);
      const b = a * ans;
      const aD = a===1?'':a===-1?'−':`${a}`;
      q = `${aD}x = ${b} を解け。x = ?`;
      steps = [`両辺を ${fmtNum(a)} で割る`, `x = ${b} ÷ ${fmtNum(a)} = ${ans}`];
    } else if (pat === 1) {
      const a = randNonZero(-4, 4);
      const b = randNonZero(-9, 9);
      const c = a * ans + b;
      const aD = a===1?'':a===-1?'−':`${a}`;
      const bS = b<0?` − ${Math.abs(b)}`:`+ ${b}`;
      q = `${aD}x ${bS} = ${c} を解け。x = ?`;
      const rhs = c - b;
      steps = [`移項: ${fmtCx(a)} = ${c} − ${fmtNum(b)} = ${rhs}`, `両辺を ${fmtNum(a)} で割る`, `x = ${rhs} ÷ ${fmtNum(a)} = ${ans}`];
    } else {
      const a = randNonZero(-4, 4);
      let c; do { c = randNonZero(-4, 4); } while (c === a);
      const b = randNonZero(-9, 9);
      const d = (a - c) * ans + b;
      const aD = a===1?'':a===-1?'−':`${a}`;
      const cD = c===1?'':c===-1?'−':`${c}`;
      const bS = b<0?` − ${Math.abs(b)}`:`+ ${b}`;
      const dS = d<0?` − ${Math.abs(d)}`:`+ ${d}`;
      q = `${aD}x ${bS} = ${cD}x ${dS} を解け。x = ?`;
      const lc = a - c, rhs = d - b;
      steps = [`移項: ${fmtCx(a)} − ${fmtNum(c)}x = ${fmtNum(d)} − ${fmtNum(b)}`, `${fmtCx(lc)} = ${rhs}`, `x = ${rhs} ÷ ${fmtNum(lc)} = ${ans}`];
    }
    const wrongs = [-ans, ans+1, ans-1].filter((v,i,arr)=>arr.indexOf(v)===i&&v!==ans);
    return { category:'equation', question:q, answer:ans, choices:buildChoices(ans,wrongs), steps };
  }

  function genExpand2() {
    const pat = randInt(0, 1);
    let q, answer, steps, wrongs;
    if (pat === 0) {
      const a = randNonZero(-7, 7), b = randNonZero(-7, 7);
      const xC = a + b;
      const aS = a<0?`− ${Math.abs(a)}`:`+ ${a}`;
      const bS = b<0?`− ${Math.abs(b)}`:`+ ${b}`;
      answer = xC;
      q = `(x ${aS})(x ${bS}) を展開したとき、x の係数は？`;
      steps = [
        `(x + a)(x + b) = x² + (a+b)x + ab`,
        `a = ${a}、b = ${b}`,
        `x の係数 = ${a} + ${fmtNum(b)} = ${xC}`
      ];
      wrongs = [a*b, xC+1, xC-1];
    } else {
      const a = randNonZero(-7, 7);
      const xC = 2*a;
      const aS = a<0?`− ${Math.abs(a)}`:`+ ${a}`;
      answer = xC;
      q = `(x ${aS})² を展開したとき、x の係数は？`;
      steps = [
        `(x + a)² = x² + 2ax + a²`,
        `a = ${a}`,
        `x の係数 = 2×${a} = ${xC}`
      ];
      wrongs = [a, a*a, xC+2];
    }
    return { category:'expand2', question:q, answer, choices:buildChoices(answer,wrongs), steps };
  }

  function stackLines(...lines) {
    return lines.map(l => `<span style="display:block">${l}</span>`).join('');
  }

  function genSimul() {
    const x = randNonZero(-5, 5), y = randNonZero(-5, 5);
    const askX = Math.random() < 0.5;
    const pat = randInt(0, 2);
    let q, eq1, eq2, answer, steps;
    if (pat === 0) {
      const c1 = x+y, c2 = x-y;
      eq1 = `x + y = ${c1}`; eq2 = `x − y = ${c2}`;
      q = `${eq1}、${eq2} のとき ${askX?'x':'y'} = ?`;
      steps = askX
        ? [`①＋②: 2x = ${c1+c2}`, `x = ${(c1+c2)/2}`]
        : [`①−②: 2y = ${c1-c2}`, `y = ${(c1-c2)/2}`];
      answer = askX ? x : y;
    } else if (pat === 1) {
      const a = randInt(2, 4);
      const c1 = a*x+y, c2 = x+y, diff = c1-c2;
      eq1 = `${a}x + y = ${c1}`; eq2 = `x + y = ${c2}`;
      q = `${eq1}、${eq2} のとき ${askX?'x':'y'} = ?`;
      if (askX) {
        steps = [`①−②: (${a}−1)x = ${diff}`, `${fmtCx(a-1)} = ${diff}`, `x = ${diff}÷${a-1} = ${x}`];
        answer = x;
      } else {
        steps = [`①−②: ${fmtCx(a-1)} = ${diff} → x = ${x}`, `②に代入: ${x} + y = ${c2}`, `y = ${c2-x} = ${y}`];
        answer = y;
      }
    } else {
      const a = randInt(2, 4);
      const c1 = x+a*y, c2 = x+y, diff = c1-c2;
      eq1 = `x + ${a}y = ${c1}`; eq2 = `x + y = ${c2}`;
      q = `${eq1}、${eq2} のとき ${askX?'x':'y'} = ?`;
      if (!askX) {
        steps = [`①−②: (${a}−1)y = ${diff}`, `${a-1}y = ${diff}`, `y = ${diff}÷${a-1} = ${y}`];
        answer = y;
      } else {
        steps = [`①−②: ${a-1}y = ${diff} → y = ${y}`, `②に代入: x + ${y} = ${c2}`, `x = ${c2-y} = ${x}`];
        answer = x;
      }
    }
    const wrongs = [-answer, answer+1, answer-1].filter((v,i,arr)=>arr.indexOf(v)===i&&v!==answer);
    const questionHtml = stackLines(eq1, eq2, `のとき ${askX?'x':'y'} = ?`);
    return { category:'simul', question:q, questionHtml, answer, choices:buildChoices(answer,wrongs), steps };
  }

  function quadPolyStr(x2C, xC, con) {
    let s = x2C === 1 ? 'x²' : x2C === -1 ? '−x²' : `${x2C}x²`;
    if (xC !== 0) {
      const sign = xC < 0 ? '−' : '+';
      const abs = Math.abs(xC);
      s += ` ${sign} ${abs === 1 ? 'x' : abs + 'x'}`;
    }
    if (con !== 0) {
      const sign = con < 0 ? '−' : '+';
      s += ` ${sign} ${Math.abs(con)}`;
    }
    return s;
  }

  function genExpand3() {
    const pat = randInt(0, 2);
    let q, answer, steps, candidates;
    if (pat === 0) {
      // (ax+b)(cx+d) を展開
      const a = randInt(2, 3), b = randNonZero(-5, 5);
      const c = randInt(1, 3), d = randNonZero(-5, 5);
      const x2C = a*c, xC = a*d+b*c, con = b*d;
      const aD = a===1?'':a, bS = b<0?`− ${Math.abs(b)}`:`+ ${b}`;
      const cD = c===1?'':c, dS = d<0?`− ${Math.abs(d)}`:`+ ${d}`;
      q = `(${aD}x ${bS})(${cD}x ${dS}) を展開すると？`;
      answer = quadPolyStr(x2C, xC, con);
      steps = [
        `(ax+b)(cx+d) = acx² + (ad+bc)x + bd`,
        `ad+bc = ${a}×${fmtNum(d)} + ${fmtNum(b)}×${c} = ${a*d}+${b*c} = ${xC}`,
        `= ${answer}`,
      ];
      candidates = [
        quadPolyStr(x2C, a*d, con),
        quadPolyStr(x2C, b*c, con),
        quadPolyStr(x2C, xC, -con),
        quadPolyStr(x2C, xC+1, con),
      ];
    } else if (pat === 1) {
      // (ax+b)² を展開
      const a = randInt(2, 4), b = randNonZero(-6, 6);
      const x2C = a*a, xC = 2*a*b, con = b*b;
      const aD = a===1?'':a, bS = b<0?`− ${Math.abs(b)}`:`+ ${b}`;
      q = `(${aD}x ${bS})² を展開すると？`;
      answer = quadPolyStr(x2C, xC, con);
      steps = [
        `(ax+b)² = a²x² + 2abx + b²`,
        `2ab = 2×${a}×${fmtNum(b)} = ${xC}`,
        `= ${answer}`,
      ];
      candidates = [
        quadPolyStr(x2C, 0, con),
        quadPolyStr(x2C, -xC, con),
        quadPolyStr(x2C, a*b, con),
        quadPolyStr(x2C, xC+2*a, con),
      ];
    } else {
      // (ax+b)(ax−b) を展開
      const a = randInt(2, 4), b = randInt(1, 7);
      const x2C = a*a, con = -(b*b);
      const aD = a===1?'':a;
      q = `(${aD}x + ${b})(${aD}x − ${b}) を展開すると？`;
      answer = quadPolyStr(x2C, 0, con);
      steps = [
        `(ax+b)(ax−b) = a²x² − b²`,
        `a = ${a}、b = ${b}`,
        `= ${answer}`,
      ];
      candidates = [
        quadPolyStr(x2C, 0, -con),
        quadPolyStr(x2C, 2*a*b, con),
        quadPolyStr(x2C, 0, con+1),
        quadPolyStr(x2C, 0, con-1),
      ];
    }
    return { category:'expand3', question:q, answer, choices: buildChoicesFromList(answer, candidates), steps };
  }

  function genFactor() {
    function ff(n) { return n >= 0 ? `(x+${n})` : `(x${n})`; }

    const pat = randInt(0, 2);
    let question, answer, choices, steps;

    if (pat === 0) {
      const a = randNonZero(-7, 7);
      let b; do { b = randNonZero(-7, 7); } while (b === a || a+b === 0);
      const p = a+b, qc = a*b;
      const pTerm = Math.abs(p)===1 ? (p>0?'+ x':'− x') : (p>0?`+ ${p}x`:`− ${Math.abs(p)}x`);
      const qS = qc<0?`− ${Math.abs(qc)}`:`+ ${qc}`;
      question = `x² ${pTerm} ${qS} を因数分解せよ。`;
      answer = `${ff(a)}${ff(b)}`;
      steps = [
        `積 = ${qc}、和 = ${p} となる整数の組を探す`,
        `(${a}, ${b}): ${a}×${b}=${qc}、${a}${b>=0?'+':''}${b}=${p} ✓`,
        `= ${answer}`,
      ];
      choices = shuffle([answer, `${ff(-a)}${ff(b)}`, `${ff(a)}${ff(-b)}`, `${ff(-a)}${ff(-b)}`]);
    } else if (pat === 1) {
      const a = randInt(2, 9);
      question = `x² − ${a*a} を因数分解せよ。`;
      answer = `(x+${a})(x-${a})`;
      steps = [
        `x² − a² = (x+a)(x−a) の公式を使う`,
        `a² = ${a*a} → a = ${a}`,
        `= ${answer}`,
      ];
      choices = shuffle([answer, `(x+${a})(x+${a})`, `(x-${a})(x-${a})`, `(x+${a+1})(x-${a+1})`]);
    } else {
      const a = randInt(1, 8);
      const p = 2*a, qc = a*a;
      const pTerm2 = p===1?'x':`${p}x`;
      question = `x² + ${pTerm2} + ${qc} を因数分解せよ。`;
      answer = `(x+${a})²`;
      steps = [
        `x² + 2ax + a² = (x+a)² の公式を使う`,
        `a² = ${qc} → a = ${a}、2a = ${p} ✓`,
        `= ${answer}`,
      ];
      choices = shuffle([answer, `(x-${a})²`, `(x+${a})(x-${a})`, `(x+${a+1})²`]);
    }

    return { category:'factor', question, answer, choices, steps };
  }

  function sqrtStr(coef, radicand) {
    if (coef === 0) return '0';
    return coef === 1 ? `√${radicand}` : `${coef}√${radicand}`;
  }

  function genSqrt() {
    const pat = randInt(0, 5);
    let q, answer, steps, wrongs;
    if (pat === 0) {
      // √m × √n = k
      const k = randInt(2, 9), k2 = k*k;
      const cands = [];
      for (let m = 2; m < k2; m++) {
        if (k2 % m === 0) {
          const n = k2 / m;
          if (n > m && !Number.isInteger(Math.sqrt(m)) && !Number.isInteger(Math.sqrt(n))) cands.push([m, n]);
        }
      }
      if (cands.length === 0) return genSqrt();
      const [m, n] = cands[randInt(0, cands.length-1)];
      q = `√${m} × √${n} = ?`;
      steps = [`√m × √n = √(m×n)`, `= √(${m}×${n}) = √${k2}`, `= ${k}`];
      answer = k; wrongs = [-k, k+1, k-1];
    } else if (pat === 1) {
      // n√a + m√a
      const nonPerf = [2,3,5,6,7];
      const a = nonPerf[randInt(0, nonPerf.length-1)];
      const n = randInt(1, 7), m = randInt(1, 7);
      const result = n + m;
      const otherA = a === 2 ? 3 : 2;
      q = `${n}√${a} + ${m}√${a} = ?`;
      const answerStr = sqrtStr(result, a);
      steps = [`√${a} を文字のように扱う`, `(${n} + ${m})√${a} = ${answerStr}`];
      return { category:'sqrt', question:q, answer: answerStr, choices: buildChoicesFromList(answerStr, [sqrtStr(n*m, a), sqrtStr(result+1, a), sqrtStr(Math.max(1,result-1), a), sqrtStr(result, otherA)]), steps };
    } else if (pat === 2) {
      // (√a)²
      const a = randInt(2, 12);
      q = `(√${a})² = ?`;
      steps = [`(√a)² = a の定義`, `(√${a})² = ${a}`];
      answer = a; wrongs = [-a, a+1, 2*a];
    } else if (pat === 3) {
      // √(n²)
      const a = randInt(2, 9);
      q = `√${a*a} = ?`;
      steps = [`${a}² = ${a*a} なので`, `√${a*a} = ${a}`];
      answer = a; wrongs = [a*a, a+1, a-1];
    } else if (pat === 4) {
      // √(a²·k) = a√k
      const nonPerf = [2,3,5,6,7];
      const k = nonPerf[randInt(0, nonPerf.length-1)];
      const a = randInt(2, 5), n = a*a*k;
      q = `√${n} = a√${k} のとき、a = ?`;
      steps = [`${n} = ${a*a} × ${k} と分解`, `√${n} = √${a*a} × √${k} = ${a}√${k}`, `a = ${a}`];
      answer = a; wrongs = [-a, a+1, a*k];
    } else {
      // n√a − m√a (引き算)
      const nonPerf = [2,3,5,6,7];
      const a = nonPerf[randInt(0, nonPerf.length-1)];
      const m = randInt(1, 5), n = randInt(m+1, m+6);
      const result = n - m;
      const otherA = a === 2 ? 3 : 2;
      q = `${n}√${a} − ${m}√${a} = ?`;
      const answerStr = sqrtStr(result, a);
      steps = [`√${a} を文字のように扱う`, `(${n} − ${m})√${a} = ${answerStr}`];
      return { category:'sqrt', question:q, answer: answerStr, choices: buildChoicesFromList(answerStr, [sqrtStr(n+m, a), sqrtStr(result+1, a), sqrtStr(Math.max(1,result-1), a), sqrtStr(result, otherA)]), steps };
    }
    return { category:'sqrt', question:q, answer, choices:buildChoices(answer,wrongs), steps };
  }

  function genQuadratic() {
    const pat = randInt(0, 2);
    let q, answer, choices, steps;
    function fr(n) { return n < 0 ? `−${Math.abs(n)}` : `${n}`; }
    function roots(r1, r2) { return `x = ${fr(r1)}, ${fr(r2)}`; }

    if (pat === 0) {
      // (x − a)(x − b) = 0
      const a = randNonZero(-7, 7);
      let b; do { b = randNonZero(-7, 7); } while (b === a);
      const r1 = Math.min(a, b), r2 = Math.max(a, b);
      const aS = a<0?`+ ${Math.abs(a)}`:`− ${a}`;
      const bS = b<0?`+ ${Math.abs(b)}`:`− ${b}`;
      q = `(x ${aS})(x ${bS}) = 0 を解け。`;
      answer = roots(r1, r2);
      steps = [`x ${aS} = 0 → x = ${fr(a)}`, `x ${bS} = 0 → x = ${fr(b)}`, answer];
      choices = shuffle([answer, roots(-r1, -r2), roots(r1-1, r2), roots(r1, r2+1)]);
    } else if (pat === 1) {
      // x² = n
      const a = randInt(1, 9);
      q = `x² = ${a*a} を解け。`;
      answer = `x = ±${a}`;
      steps = [`x = ±√${a*a} = ±${a}`];
      choices = shuffle([`x = ±${a}`, `x = ${a}`, `x = ±${a+1}`, `x = ±${a > 1 ? a-1 : a+2}`]);
    } else {
      // x² + px + q = 0
      const a = randNonZero(-7, 7);
      let b; do { b = randNonZero(-7, 7); } while (b === a || a+b === 0);
      const pC = -(a+b), qC = a*b;
      const r1 = Math.min(a, b), r2 = Math.max(a, b);
      const pTerm = Math.abs(pC)===1 ? (pC>0?'+ x':'− x') : (pC>0?`+ ${pC}x`:`− ${Math.abs(pC)}x`);
      const qS = qC<0?`− ${Math.abs(qC)}`:`+ ${qC}`;
      q = `x² ${pTerm} ${qS} = 0 を解け。`;
      answer = roots(r1, r2);
      steps = [`因数分解: (x − ${fr(a)})(x − ${fr(b)}) = 0`, `x = ${fr(a)} または x = ${fr(b)}`, answer];
      choices = shuffle([answer, roots(-r1, -r2), roots(r1-1, r2), roots(r1, r2+1)]);
    }
    return { category: 'quadratic', question: q, answer, choices, steps };
  }

  /* ---------- 比例・反比例 ---------- */

  function makeTbl(xs, ys) {
    const row = (label, vals) =>
      `<tr><th>${label}</th>${vals.map(v=>`<td>${v}</td>`).join('')}</tr>`;
    return `<table class="q-table"><tbody>${row('x',xs)}${row('y',ys)}</tbody></table>`;
  }

  function genProportion() {
    const pat = randInt(0, 7);
    let question, answer, steps, wrongs;
    if (pat === 0) {
      const a = randNonZero(-7, 7), x = randNonZero(-7, 7), y = a*x;
      const aD = a===1?'':a===-1?'−':`${a}`;
      question = `y = ${aD}x で x = ${x} のとき y = ?`;
      steps = [`y = ${a} × ${fmtNum(x)} = ${y}`];
      answer = y; wrongs = [-y, a+x, y+a];
    } else if (pat === 1) {
      const a = randNonZero(-7, 7), x = randNonZero(-7, 7), y = a*x;
      const aD = a===1?'':a===-1?'−':`${a}`;
      question = `y = ${aD}x で y = ${y} のとき x = ?`;
      steps = [`${fmtCx(a)} = ${y}`, `x = ${y} ÷ ${fmtNum(a)} = ${x}`];
      answer = x; wrongs = [-x, y, x+1];
    } else if (pat === 2) {
      const x = randNonZero(-6, 6), y = randNonZero(-6, 6), a = x*y;
      question = `y = ${a}/x で x = ${x} のとき y = ?`;
      steps = [`y = ${a} ÷ ${fmtNum(x)} = ${y}`];
      answer = y; wrongs = [-y, a, y+1];
    } else if (pat === 3) {
      const a = randNonZero(-7, 7), x = randNonZero(-7, 7), y = a*x;
      question = `y は x に比例し、x = ${x} のとき y = ${y}。比例定数は？`;
      steps = [`y = ax より: ${y} = a × ${fmtNum(x)}`, `a = ${y} ÷ ${fmtNum(x)} = ${a}`];
      answer = a; wrongs = [-a, x, y];
    } else if (pat === 4) {
      // 比例の表から a を求める
      const a = randNonZero(-6, 6);
      const xs = [1, 2, 3, 4], ys = xs.map(x => a*x);
      question = `比例の表から a を求めよ。`;
      const questionHtml = `${makeTbl(xs, ys)}<span>y = ax のとき、a は？</span>`;
      steps = [`x = 1, y = ${a} → a = ${a} ÷ 1 = ${a}`];
      answer = a; wrongs = [-a, a+1, a*2];
      return { category:'proportion', question, questionHtml, answer, choices:buildChoices(answer, wrongs), steps };
    } else if (pat === 5) {
      // 反比例の表から a を求める
      const baseVals = [6, 8, 10, 12, 15];
      const base = baseVals[randInt(0, baseVals.length-1)];
      const a = Math.random() < 0.5 ? base : -base;
      const divs = [];
      for (let i = 1; i <= Math.abs(a); i++) { if (Math.abs(a) % i === 0) divs.push(i); }
      const xs4 = shuffle(divs).slice(0, 4).sort((p, q) => p - q);
      const ys4 = xs4.map(x => a / x);
      question = `反比例の表から a を求めよ。`;
      const questionHtml = `${makeTbl(xs4, ys4)}<span>y = <span class="frac"><span class="num">a</span><span class="den">x</span></span> のとき、a は？</span>`;
      steps = [`x = ${xs4[0]}, y = ${ys4[0]} → a = x×y = ${xs4[0]}×${ys4[0]} = ${a}`];
      answer = a; wrongs = [-a, ys4[0], a+1];
      return { category:'proportion', question, questionHtml, answer, choices:buildChoices(answer, wrongs), steps };
    } else if (pat === 6) {
      // 比例グラフから a を求める（座標指定）
      const a = randNonZero(-7, 7), x = randNonZero(-6, 6), y = a*x;
      question = `比例のグラフが点 (${x}, ${y}) を通る。y = ax の a は？`;
      steps = [`y = ax に代入: ${y} = a × ${fmtNum(x)}`, `a = ${y} ÷ ${fmtNum(x)} = ${a}`];
      answer = a; wrongs = [-a, x, y];
    } else {
      // 反比例グラフから a を求める（座標指定）
      const x = randNonZero(-6, 6), y = randNonZero(-6, 6), a = x*y;
      question = `反比例のグラフが点 (${x}, ${y}) を通る。y = a/x の a は？`;
      steps = [`y = a/x に代入: ${y} = a ÷ ${fmtNum(x)}`, `a = ${x} × ${y} = ${a}`];
      answer = a; wrongs = [-a, x+y, a+1];
    }
    return { category:'proportion', question, answer, choices:buildChoices(answer, wrongs), steps };
  }

  /* ---------- 一次関数 ---------- */

  function genLinear() {
    const a = randNonZero(-5, 5);
    const aD = a===1?'':a===-1?'−':`${a}`;
    const pat = randInt(0, 5);
    let question, answer, steps, wrongs;
    if (pat === 0) {
      const b = randNonZero(-8, 8), x = randNonZero(-6, 6), y = a*x+b;
      const bS = b<0?`− ${Math.abs(b)}`:`+ ${b}`;
      const axVal = a*x, axStr = a===1?`${x}`:`${a}×${fmtNum(x)}`;
      question = `y = ${aD}x ${bS} で x = ${x} のとき y = ?`;
      steps = [`x = ${x} を代入: y = ${axStr} ${bS}`, `= ${axVal} ${bS} = ${y}`];
      answer = y; wrongs = [-y, axVal, y+a];
    } else if (pat === 1) {
      const b = randNonZero(-8, 8), bS = b<0?`− ${Math.abs(b)}`:`+ ${b}`;
      question = `y = ${aD}x ${bS} の傾きは？`;
      steps = [`y = ax + b の形 → a が傾き`, `傾き = ${a}`];
      answer = a; wrongs = [-a, b, a+1];
    } else if (pat === 2) {
      const b = randNonZero(-8, 8), bS = b<0?`− ${Math.abs(b)}`:`+ ${b}`;
      question = `y = ${aD}x ${bS} の y 切片は？`;
      steps = [`y = ax + b の形 → b が y 切片`, `y 切片 = ${b}`];
      answer = b; wrongs = [-b, a, b+1];
    } else if (pat === 3) {
      const x1 = randInt(-5, 4), y1 = randInt(-8, 7);
      const dx = randNonZero(-4, 4), x2 = x1+dx;
      const dy = a*dx, y2 = y1+dy;
      const yStep = y1<0?`${y2} − (${y1})`:`${y2} − ${y1}`;
      const xStep = x1<0?`${x2} − (${x1})`:`${x2} − ${x1}`;
      question = `2点 (${x1}, ${y1})、(${x2}, ${y2}) を通る一次関数の傾きは？`;
      steps = [`傾き = Δy ÷ Δx`, `= (${yStep}) ÷ (${xStep}) = ${dy} ÷ ${dx} = ${a}`];
      answer = a; wrongs = [-a, dy, a+1];
    } else if (pat === 4) {
      // グラフから：傾きと1点が与えられ y 切片を求める
      const b = randNonZero(-8, 8), x1 = randNonZero(-5, 5), y1 = a*x1+b;
      const bS = b<0?`− ${Math.abs(b)}`:`+ ${b}`;
      question = `傾き ${a} で点 (${x1}, ${y1}) を通る一次関数の y 切片は？`;
      steps = [
        `y = ${aD}x + b に代入: ${y1} = ${a===1?x1:a===-1?`-${x1}`:`${a}×${x1}`} + b`,
        `${y1} = ${a*x1} + b`,
        `b = ${y1} − ${fmtNum(a*x1)} = ${b}`,
      ];
      answer = b; wrongs = [-b, a, b+1];
    } else {
      // グラフから：2点が与えられ y 切片を求める
      const b = randNonZero(-6, 6);
      const x1 = randInt(-4, -1), y1 = a*x1+b;
      const x2 = randInt(1, 4),   y2 = a*x2+b;
      const bS = b<0?`− ${Math.abs(b)}`:`+ ${b}`;
      question = `2点 (${x1}, ${y1})、(${x2}, ${y2}) を通る一次関数の y 切片は？`;
      steps = [
        `傾き = (${y2} − ${fmtNum(y1)}) ÷ (${x2} − ${fmtNum(x1)}) = ${a}`,
        `y = ${aD}x + b に (${x2}, ${y2}) を代入`,
        `${y2} = ${a*x2} + b → b = ${b}`,
      ];
      answer = b; wrongs = [-b, a, b+1];
    }
    return { category:'linear', question, answer, choices:buildChoices(answer, wrongs), steps };
  }

  /* ---------- 二次関数 ---------- */

  function genQuadFunc() {
    const a = randNonZero(-3, 3);
    const aD = a===1?'':a===-1?'−':`${a}`;
    const pat = randInt(0, 3);
    let question, answer, steps, wrongs;
    if (pat === 0) {
      const x = randNonZero(-5, 5), y = a*x*x;
      question = `y = ${aD}x² で x = ${x} のとき y = ?`;
      steps = [`y = ${a} × ${fmtNum(x)}²`, `= ${a} × ${x*x} = ${y}`];
      answer = y; wrongs = [-y, a*x, y+a];
    } else if (pat === 1) {
      const x = randNonZero(-5, 5), posX = Math.abs(x), y = a*x*x;
      const aStr = Math.abs(a)===1?(a>0?'':'−'):`${a}`;
      question = `y = ${aD}x² で y = ${y} のとき、正の x の値は？`;
      steps = [`${aStr}x² = ${y} → x² = ${x*x}`, `x = ±${posX} → 正の値は ${posX}`];
      answer = posX; wrongs = [-posX, y, posX+1];
    } else if (pat === 2) {
      // 変化の割合
      const p = randInt(-4, 3), q = p + randInt(1, 4);
      const yp = a*p*p, yq = a*q*q;
      const rate = a*(p+q);
      question = `y = ${aD}x² で x が ${p} から ${q} に増加するとき、変化の割合は？`;
      steps = [
        `変化の割合 = Δy ÷ Δx`,
        `Δy = ${yq} − ${fmtNum(yp)} = ${yq-yp}`,
        `Δx = ${q} − ${fmtNum(p)} = ${q-p}`,
        `= ${yq-yp} ÷ ${q-p} = ${rate}`,
      ];
      answer = rate;
      wrongs = [a*(p+q+1), a*(p+q-1), -rate];
    } else {
      // 変域（下に凸・上に凸どちらも）
      const aAbs = randInt(1, 3);
      const aSign = Math.random() < 0.5 ? 1 : -1;
      const aVal = aAbs * aSign;
      const aDom = aAbs===1 ? (aSign>0?'':'−') : (aSign>0?String(aAbs):`−${aAbs}`);
      const dc = randInt(0, 2);
      let p, q;
      if (dc === 0) { p = randInt(1, 3); q = p + randInt(1, 3); }
      else if (dc === 1) { p = -randInt(1, 4); q = randInt(1, 4); }
      else { q = -randInt(1, 2); p = q - randInt(1, 3); }
      const yAtP = aVal*p*p, yAtQ = aVal*q*q;
      const crosses0 = p < 0 && q > 0;
      let yMin, yMax;
      if (crosses0) {
        yMin = aVal > 0 ? 0 : Math.min(yAtP, yAtQ);
        yMax = aVal > 0 ? Math.max(yAtP, yAtQ) : 0;
      } else {
        yMin = Math.min(yAtP, yAtQ);
        yMax = Math.max(yAtP, yAtQ);
      }
      const askMax = Math.random() < 0.5;
      const target = askMax ? yMax : yMin;
      const shape = aVal > 0 ? '下に凸' : '上に凸';
      const bigX = Math.abs(p) >= Math.abs(q) ? p : q;
      const smlX = Math.abs(p) <= Math.abs(q) ? p : q;
      question = `y = ${aDom}x² で ${p} ≤ x ≤ ${q} のとき y の${askMax ? '最大値' : '最小値'}は？`;
      if (askMax) {
        if (crosses0 && aVal < 0) {
          steps = [`${shape} → 頂点 (0, 0) が最大`, `変域に x = 0 が含まれる → 最大値 = 0`];
        } else {
          const argX = aVal > 0 ? bigX : smlX;
          steps = [`${shape} → ${aVal>0?'|x| 大で y 最大':'|x| 小で y 最大'}`, `x = ${argX} → y = ${yMax}`];
        }
      } else {
        if (crosses0 && aVal > 0) {
          steps = [`${shape} → 頂点 (0, 0) が最小`, `変域に x = 0 が含まれる → 最小値 = 0`];
        } else {
          const argX = aVal > 0 ? smlX : bigX;
          steps = [`${shape} → ${aVal>0?'|x| 小で y 最小':'|x| 大で y 最小'}`, `x = ${argX} → y = ${yMin}`];
        }
      }
      answer = target;
      wrongs = [askMax ? yMin : yMax, target + aAbs, target + 2*aAbs];
    }
    return { category:'quadfunc', question, answer, choices:buildChoices(answer, wrongs), steps };
  }

  /* ---------- 平方根のかけ算・割り算 ---------- */

  function genSqrtMulDiv() {
    const pat = randInt(0, 3);
    const nonPerf = [2,3,5,6,7];
    let q, answer, steps, wrongs;
    if (pat === 0) {
      const m = nonPerf[randInt(0, nonPerf.length-1)];
      const a = randInt(1, 5), b = randInt(1, 5), result = a*b*m;
      q = `${a}√${m} × ${b}√${m} = ?`;
      steps = [
        `係数: ${a} × ${b} = ${a*b}`,
        `根号: √${m} × √${m} = ${m}`,
        `= ${a*b} × ${m} = ${result}`,
      ];
      answer = result; wrongs = [a*b, result+m, a*m];
    } else if (pat === 1) {
      const cases = [
        [2,6,2,3],[3,6,3,2],[2,10,2,5],[5,10,5,2],
        [3,15,3,5],[5,15,5,3],[2,14,2,7],[7,14,7,2],
        [3,21,3,7],
      ];
      const [fa, fb, k, n] = cases[randInt(0, cases.length-1)];
      q = `√${fa} × √${fb} = ?`;
      const answerStr1 = sqrtStr(k, n);
      steps = [
        `√${fa} × √${fb} = √${fa*fb}`,
        `${fa*fb} = ${k*k} × ${n} と分解`,
        `= ${answerStr1}`,
      ];
      return { category:'sqrtmd', question:q, answer: answerStr1, choices: buildChoicesFromList(answerStr1, [`√${fa*fb}`, sqrtStr(k+1, n), sqrtStr(Math.max(1,k-1), n), sqrtStr(k, fa)]), steps };
    } else if (pat === 2) {
      const result = randInt(2, 6);
      const b = nonPerf[randInt(0, nonPerf.length-1)], a = result*result*b;
      q = `√${a} ÷ √${b} = ?`;
      steps = [
        `√a ÷ √b = √(a÷b)`,
        `= √(${a}÷${b}) = √${result*result} = ${result}`,
      ];
      answer = result; wrongs = [-result, result+1, result*b];
    } else {
      const b = nonPerf[randInt(0, nonPerf.length-1)];
      const k = randInt(1, 5), a = k*b;
      q = `${a}/√${b} を有理化すると？`;
      const answerStr2 = sqrtStr(k, b);
      steps = [
        `分母に √${b} をかける: ${a}/√${b} × √${b}/√${b}`,
        `= ${a}√${b} / ${b} = ${answerStr2}`,
      ];
      return { category:'sqrtmd', question:q, answer: answerStr2, choices: buildChoicesFromList(answerStr2, [`${a}√${b}`, sqrtStr(k+1, b), sqrtStr(Math.max(1,k-1), b), sqrtStr(k, b===2?3:2)]), steps };
    }
    return { category:'sqrtmd', question:q, answer, choices:buildChoices(answer, wrongs), steps };
  }

  /* ---------- 出題範囲の定義 ---------- */

  const CATEGORIES = [
    { id: 'add2',       label: '加法（たし算）',           gen: genAdd2 },
    { id: 'sub2',       label: '減法（ひき算）',           gen: genSub2 },
    { id: 'chain3',     label: '加減混合',                 gen: genChain3 },
    { id: 'mul2',       label: '乗法（かけ算）',           gen: genMul2 },
    { id: 'div2',       label: '除法（わり算）',           gen: genDiv2 },
    { id: 'mixed',      label: 'かっこを含む四則',         gen: genMixedParen },
    { id: 'allops',     label: '四則混合計算',             gen: genAllOps },
    { id: 'power',      label: '累乗の計算',               gen: genPower },
    { id: 'brace',      label: '中かっこを含む計算',       gen: genBrace },
    { id: 'literal',    label: '文字式の計算',             gen: genLiteral },
    { id: 'notation',   label: '文字式の表し方',           gen: genNotation },
    { id: 'subst',      label: '代入の計算',               gen: genSubst },
    { id: 'maxof4',     label: '大小関係',                 gen: genMaxOf4 },
    { id: 'equation',   label: '一次方程式',               gen: genEquation },
    { id: 'proportion', label: '比例・反比例（中1）',       gen: genProportion },
    { id: 'expand2',    label: '式の展開・基本（中3）',    gen: genExpand2 },
    { id: 'simul',      label: '連立方程式',               gen: genSimul },
    { id: 'linear',     label: '一次関数',                 gen: genLinear },
    { id: 'angle',      label: '角度の計算（中2）',        gen: genAngle },
    { id: 'congruence', label: '三角形の合同（中2）',      gen: genCongruence },
    { id: 'expand3',    label: '式の展開・発展（中3）',    gen: genExpand3 },
    { id: 'factor',     label: '因数分解',                 gen: genFactor },
    { id: 'sqrt',       label: '平方根の計算',             gen: genSqrt },
    { id: 'sqrtmd',     label: '√のかけ算・割り算',       gen: genSqrtMulDiv },
    { id: 'quadratic',  label: '二次方程式',               gen: genQuadratic },
    { id: 'quadfunc',   label: '二次関数',                 gen: genQuadFunc },
    { id: 'similarity',   label: '三角形の相似（中3）',      gen: genSimilarity },
    { id: 'planeFigure', label: '平面図形（中1）',           gen: genPlaneFigure },
    { id: 'solidFigure', label: '空間図形（中1）',           gen: genSolidFigure },
    { id: 'probability', label: '確率（中2）',               gen: genProbability },
    { id: 'circleAngle', label: '円周角（中3）',             gen: genCircleAngle },
    { id: 'pythagoras',    label: '三平方の定理（中3）',       gen: genPythagoras },
    { id: 'linearMul',   label: '1次式×÷数（中1）',          gen: genLinearMul },
    { id: 'polyMul',     label: '多項式×÷数（中1）',          gen: genPolyMul },
    { id: 'linearAddSub',label: '1次式の加減（中1）',         gen: genLinearAddSub },

    { id: 'round4',      label: '四捨五入（小4）',                     gen: genRound4,      defaultOff: true },
    { id: 'fourOps4',    label: '四則計算（小4）',                     gen: genFourOps4,    defaultOff: true },
    { id: 'fracAddSub5', label: '分数のたし算・ひき算（小5）',         gen: genFracAddSub5, defaultOff: true },
    { id: 'decDiv5',     label: '小数のわり算（小5）',                 gen: genDecDiv5,     defaultOff: true },
    { id: 'fracMulDiv6', label: '分数のかけ算・わり算（小6）',         gen: genFracMulDiv6, defaultOff: true },
    { id: 'ratio6',       label: '比（小6）',                           gen: genRatio6,       defaultOff: true },
    { id: 'scale6',       label: '拡大図と縮図（小6）',                 gen: genScale6,       defaultOff: true },
    { id: 'dataValues6',  label: 'データの調べ方（小6）',               gen: genDataValues6,  defaultOff: true },
    { id: 'arrangeCombine6', label: '並べ方と組み合わせ方（小6）',      gen: genArrangeCombine6, defaultOff: true },
    { id: 'decMul4',        label: '小数のかけ算（小4）',                 gen: genDecMul4,        defaultOff: true },
    { id: 'divRemainder4',  label: 'あまりのあるわり算（小4）',           gen: genDivRemainder4,  defaultOff: true },
    { id: 'rectArea4',      label: '長方形・正方形の面積（小4）',        gen: genRectArea4,      defaultOff: true },
    { id: 'speedRate5',     label: '単位量あたりの大きさ・速さ（小5）',   gen: genSpeedRate5,     defaultOff: true },
    { id: 'percent5',       label: '割合・百分率（小5）',                 gen: genPercent5,       defaultOff: true },
    { id: 'multiples5',     label: '倍数と約数（小5）',                   gen: genMultiples5,     defaultOff: true },
    { id: 'polygonAngle5',  label: '図形の角（小5）',                     gen: genPolygonAngle5,  defaultOff: true },
    { id: 'fracDecConvert5', label: '分数と小数、整数の関係（小5）',      gen: genFracDecConvert5, defaultOff: true },
    { id: 'average5',       label: '平均（小5）',                         gen: genAverage5,       defaultOff: true },
    { id: 'circumference5', label: '円周（小5）',                         gen: genCircumference5, defaultOff: true },
    { id: 'circleArea6',    label: '円の面積（小6）',                     gen: genCircleArea6,    defaultOff: true },
    { id: 'prismVolume6',   label: '角柱と円柱の体積（小6）',             gen: genPrismVolume6,   defaultOff: true },
  ];

  /* ---------- 小学校範囲の分数ユーティリティ ---------- */

  function gcdFrac(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { const t = b; b = a % b; a = t; }
    return a || 1;
  }
  function lcmFrac(a, b) {
    return Math.abs(a * b) / gcdFrac(a, b);
  }
  function reduceFrac(n, d) {
    if (d < 0) { n = -n; d = -d; }
    const g = gcdFrac(n, d);
    return [n / g, d / g];
  }
  function fracToStr(n, d) {
    const [rn, rd] = reduceFrac(n, d);
    return rd === 1 ? `${rn}` : `${rn}/${rd}`;
  }
  function randFrac(maxDen) {
    let d, n;
    do {
      d = randInt(2, maxDen);
      n = randInt(1, d - 1);
    } while (gcdFrac(n, d) !== 1);
    return [n, d];
  }
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

  // 四捨五入（小4）：十の位／百の位／千の位で概数にする
  function genRound4() {
    const placeOptions = [
      { name: '十', pow: 1, checkName: '一' },
      { name: '百', pow: 2, checkName: '十' },
      { name: '千', pow: 3, checkName: '百' },
    ];
    const p = placeOptions[randInt(0, placeOptions.length - 1)];
    const digits = p.pow + randInt(1, 2);
    const min = Math.pow(10, digits - 1);
    const max = Math.pow(10, digits) - 1;
    const num = randInt(min, max);
    const unit = Math.pow(10, p.pow);
    const answer = Math.round(num / unit) * unit;
    const question = `${num} を${p.name}の位までの概数にすると？`;
    const wrongs = [
      Math.floor(num / unit) * unit,
      Math.ceil(num / unit) * unit,
      answer + unit,
      answer - unit,
    ];
    const checkUnit = unit / 10;
    const checkDigit = Math.floor(num / checkUnit) % 10;
    const steps = [
      `${p.name}の位までの概数にするので、${p.checkName}の位を四捨五入する`,
      `${p.checkName}の位の数字は ${checkDigit}`,
      checkDigit >= 5 ? `5以上 → 切り上げる` : `4以下 → 切り捨てる`,
      `= ${answer}`,
    ];
    return { category: 'round4', question, answer, choices: buildChoices(answer, wrongs), steps };
  }

  // 四則計算（小4）：かっこ・×÷の優先順位（負の数は使わない）
  function genFourOps4() {
    const pattern = randInt(0, 3);
    let question, answer, wrongs, steps;

    if (pattern === 0) {
      const b = randInt(2, 9), c = randInt(2, 9), a = randInt(1, 50);
      const bc = b * c;
      answer = a + bc;
      question = `${a} + ${b} × ${c} = ?`;
      wrongs = [(a + b) * c, a + b + c, a * b + c];
      steps = [`× を先に計算: ${b} × ${c} = ${bc}`, `= ${a} + ${bc} = ${answer}`];
    } else if (pattern === 1) {
      const b = randInt(2, 9), c = randInt(2, 9);
      const bc = b * c;
      const a = bc + randInt(1, 30);
      answer = a - bc;
      question = `${a} − ${b} × ${c} = ?`;
      wrongs = [(a - b) * c, a - b - c, a - (b + c)];
      steps = [`× を先に計算: ${b} × ${c} = ${bc}`, `= ${a} − ${bc} = ${answer}`];
    } else if (pattern === 2) {
      const c = randInt(2, 9), q = randInt(2, 9), b = c * q;
      const a = randInt(1, 50);
      answer = a + q;
      question = `${a} + ${b} ÷ ${c} = ?`;
      wrongs = [(a + b) / c, a + b - c, a * q];
      steps = [`÷ を先に計算: ${b} ÷ ${c} = ${q}`, `= ${a} + ${q} = ${answer}`];
    } else {
      const a = randInt(2, 20), b = randInt(2, 20), c = randInt(2, 9);
      const useMinus = a > b && Math.random() < 0.5;
      const inner = useMinus ? a - b : a + b;
      answer = inner * c;
      question = `(${a} ${useMinus ? '−' : '+'} ${b}) × ${c} = ?`;
      const wrongMisreadNoParen = useMinus ? a - b * c : a + b * c;
      wrongs = [wrongMisreadNoParen, inner + c, a * c + (useMinus ? -b : b)];
      steps = [`かっこの中を先に計算: ${a} ${useMinus ? '−' : '+'} ${b} = ${inner}`, `= ${inner} × ${c} = ${answer}`];
    }

    wrongs = wrongs.map(Math.round);
    return { category: 'fourOps4', question, answer, choices: buildChoices(answer, wrongs), steps };
  }

  // 分数のたし算・ひき算（通分・約分あり、小5）
  function genFracAddSub5() {
    let [n1, d1] = randFrac(9);
    let [n2, d2] = randFrac(9);
    while (d2 === d1) { [n2, d2] = randFrac(9); }

    const isAdd = Math.random() < 0.5;
    const L = lcmFrac(d1, d2);
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

    const steps = [
      `通分する: 分母を最小公倍数 ${L} にそろえる`,
      `${n1}/${d1} = ${N1}/${L}、${n2}/${d2} = ${N2}/${L}`,
      `${N1}/${L} ${opSym} ${N2}/${L} = ${numAns}/${denAns}`,
      `= ${answer}`,
    ];
    return { category: 'fracAddSub5', question, questionHtml: stepToHtml(question), answer, choices: buildChoicesFromSet(answer, candidates), steps };
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
    const dividendX10 = divisorTenths * quotient;
    const steps = [
      `わる数・わられる数の小数点を右に1つずつ移して整数にする`,
      `${dividend} ÷ ${divisor} = ${dividendX10} ÷ ${divisorTenths}`,
      `= ${answer}`,
    ];
    return { category: 'decDiv5', question, answer, choices: buildChoices(answer, wrongs), steps };
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

    const steps = isMul
      ? [
          `分子どうし・分母どうしをかける`,
          `${n1}/${d1} × ${n2}/${d2} = ${numAns}/${denAns}`,
          `= ${answer}`,
        ]
      : [
          `÷ は、わる数の分数をひっくり返してかけ算にする`,
          `${n1}/${d1} × ${d2}/${n2} = ${numAns}/${denAns}`,
          `= ${answer}`,
        ];
    return { category: 'fracMulDiv6', question, questionHtml: stepToHtml(question), answer, choices: buildChoicesFromSet(answer, candidates), steps };
  }

  function buildChoicesFromList(answerStr, wrongCandidates) {
    const set = new Set([answerStr]);
    const choices = [answerStr];
    for (const w of wrongCandidates) {
      if (choices.length >= 4) break;
      if (w && !set.has(w)) { set.add(w); choices.push(w); }
    }
    // Fallback in case the supplied candidates weren't distinct enough (e.g. collided
    // with the answer or each other): perturb the leading number of the answer string.
    let guard = 0;
    while (choices.length < 4 && guard < 30) {
      guard++;
      const m = answerStr.match(/^(-?\d+)([\s\S]*)$/);
      const lead = m ? parseInt(m[1], 10) : 1;
      const rest = m ? m[2] : answerStr;
      const cand = `${lead + randNonZero(-3, 3)}${rest}`;
      if (cand && !set.has(cand)) { set.add(cand); choices.push(cand); }
    }
    return shuffle(choices);
  }

  // 比（小6）：比を簡単にする・等しい比・比例配分
  function genRatio6() {
    const pat = randInt(0, 2);
    let question, answer, choices, steps;
    if (pat === 0) {
      const g = randInt(2, 6);
      let b1, b2;
      do { b1 = randInt(1, 9); b2 = randInt(1, 9); } while (gcdFrac(b1, b2) !== 1 || b1 === b2);
      const a = g * b1, b = g * b2;
      question = `${a} : ${b} を最も簡単な整数の比にすると？`;
      answer = `${b1}:${b2}`;
      const candidates = [`${a}:${b}`, `${b2}:${b1}`, `${b1 + 1}:${b2}`, `${b1}:${b2 + 1}`];
      choices = buildChoicesFromList(answer, candidates);
      steps = [`最大公約数 ${g} で両方を割る`, `${a} ÷ ${g} : ${b} ÷ ${g} = ${answer}`];
    } else if (pat === 1) {
      const a = randInt(2, 9);
      let b; do { b = randInt(2, 9); } while (gcdFrac(a, b) !== 1);
      const k = randInt(2, 6);
      const c = a * k;
      const x = b * k;
      question = `${a} : ${b} = ${c} : x のとき、x の値は？`;
      answer = x;
      const wrongs = [a * k, x + k, Math.max(1, x - k), c];
      choices = buildChoices(answer, wrongs);
      steps = [`${a}:${b} を ${k} 倍する`, `x = ${b} × ${k} = ${x}`];
    } else {
      let p, q;
      do { p = randInt(1, 9); q = randInt(1, 9); } while (gcdFrac(p, q) !== 1 || p === q);
      if (p > q) { [p, q] = [q, p]; }
      const k = randInt(2, 9);
      const total = k * (p + q);
      const bigger = k * q;
      const smaller = k * p;
      question = `${total} を ${p} : ${q} に分けるとき、大きい方の数は？`;
      answer = bigger;
      const wrongs = [smaller, total - bigger + 1, bigger + k, Math.max(1, bigger - k)];
      choices = buildChoices(answer, wrongs);
      steps = [`${p} + ${q} = ${p + q} 等分にする`, `1あたり ${total} ÷ ${p + q} = ${k}`, `大きい方 = ${k} × ${q} = ${bigger}`];
    }
    return { category: 'ratio6', question, answer, choices, steps };
  }

  // 拡大図と縮図（小6）：拡大・縮小・縮尺の利用
  function genScale6() {
    const pat = randInt(0, 2);
    let question, answer, wrongs, steps;
    if (pat === 0) {
      const L = randInt(2, 12);
      const n = randInt(2, 3);
      answer = L * n;
      question = `${L} cm の辺を ${n} 倍に拡大すると、何 cm になる？`;
      wrongs = [L + n, L * n + 1, Math.max(1, L * n - n), L];
      steps = [`拡大図の辺の長さ = もとの長さ × 拡大率`, `${L} × ${n} = ${answer}`];
    } else if (pat === 1) {
      const n = randInt(2, 3);
      const base = randInt(2, 10);
      const L = base * n;
      answer = base;
      question = `${L} cm の辺を 1/${n} に縮小すると、何 cm になる？`;
      wrongs = [L - base, base + n, Math.max(1, base - n), L];
      steps = [`縮図の辺の長さ = もとの長さ × 縮小率`, `${L} × 1/${n} = ${L} ÷ ${n} = ${answer}`];
    } else {
      const scales = [
        { den: 10000, metersPerCm: 100 },
        { den: 20000, metersPerCm: 200 },
        { den: 25000, metersPerCm: 250 },
        { den: 50000, metersPerCm: 500 },
        { den: 100000, metersPerCm: 1000 },
      ];
      const sc = scales[randInt(0, scales.length - 1)];
      const mapCm = randInt(2, 9);
      const actualMeters = mapCm * sc.metersPerCm;
      let unit = 'm', displayVal = actualMeters;
      if (actualMeters >= 1000 && actualMeters % 1000 === 0) {
        unit = 'km';
        displayVal = actualMeters / 1000;
      }
      answer = displayVal;
      question = `縮尺 1:${sc.den} の地図で ${mapCm} cm の道のりは、実際には何 ${unit}？`;
      wrongs = [displayVal * 2, Math.max(1, Math.round(displayVal / 2)), displayVal + mapCm, Math.max(1, displayVal - 1)];
      steps = [`実際の道のり = 地図上の長さ × 縮尺の分母`, `${mapCm} × ${sc.den} = ${mapCm * sc.den} cm = ${actualMeters} m`].concat(unit === 'km' ? [`= ${displayVal} km`] : []);
    }
    const choices = buildChoices(answer, wrongs);
    return { category: 'scale6', question, questionHtml: stepToHtml(question), answer, choices, steps };
  }

  // データの調べ方（小6）：平均値・中央値・最頻値・範囲
  function genDataValues6() {
    const statTypes = ['mean', 'median', 'mode', 'range'];
    const statType = statTypes[randInt(0, statTypes.length - 1)];
    let arr, answer, steps;

    if (statType === 'mode') {
      const repeated = randInt(1, 20);
      const others = [];
      while (others.length < 3) {
        const v = randInt(1, 20);
        if (v !== repeated && !others.includes(v)) others.push(v);
      }
      arr = shuffle([repeated, repeated, ...others]);
      answer = repeated;
      steps = [`最も多く現れる値を探す`, `${repeated} が2回で最多 → 最頻値は ${answer}`];
    } else if (statType === 'mean') {
      const base = [];
      while (base.length < 4) { base.push(randInt(1, 20)); }
      const sum4 = base.reduce((s, v) => s + v, 0);
      const rem = sum4 % 5;
      const needMod = (5 - rem) % 5;
      let last = needMod === 0 ? 5 : needMod;
      last += 5 * randInt(0, 2);
      arr = shuffle([...base, last]);
      const sum = sum4 + last;
      answer = sum / 5;
      steps = [`合計 = ${arr.join(' + ')} = ${sum}`, `平均 = ${sum} ÷ 5 = ${answer}`];
    } else {
      const vals = [];
      while (vals.length < 5) {
        const v = randInt(1, 20);
        if (!vals.includes(v)) vals.push(v);
      }
      arr = shuffle(vals.slice());
      const sorted = vals.slice().sort((x, y) => x - y);
      if (statType === 'median') {
        answer = sorted[2];
        steps = [`小さい順に並べる: ${sorted.join(', ')}`, `真ん中の値 → 中央値は ${answer}`];
      } else {
        answer = sorted[4] - sorted[0];
        steps = [`範囲 = 最大値 − 最小値`, `= ${sorted[4]} − ${sorted[0]} = ${answer}`];
      }
    }

    const label = { mean: '平均値', median: '中央値', mode: '最頻値', range: '範囲' }[statType];
    const question = `次の5つの数値の${label}を求めよ： ${arr.join('、')}`;
    const wrongs = [answer + 1, answer - 1, answer + 2, Math.max(0, answer - 2)];
    const choices = buildChoices(answer, wrongs);
    return { category: 'dataValues6', question, answer, choices, steps };
  }

  // 並べ方と組み合わせ方（小6）
  function genArrangeCombine6() {
    const pat = randInt(0, 1);
    let question, answer, wrongs, steps;
    if (pat === 0) {
      const n = randInt(3, 5);
      let answerVal = 1;
      const parts = [];
      for (let i = n; i >= 1; i--) { answerVal *= i; parts.push(i); }
      question = `1〜${n}の数字が1つずつ書かれた${n}枚のカードを1列に並べる並べ方は何通り？`;
      answer = answerVal;
      wrongs = [n * n, Math.max(1, Math.round(answerVal / n)), answerVal + n, Math.max(1, answerVal - n)];
      steps = [`${parts.join(' × ')} = ${answerVal}通り`];
    } else {
      const n = randInt(4, 6);
      const r = (n >= 5 && Math.random() < 0.5) ? 3 : 2;
      let numerator = 1, denom = 1;
      for (let i = 0; i < r; i++) { numerator *= (n - i); denom *= (i + 1); }
      const answerVal = numerator / denom;
      question = `${n}人の中から ${r}人を選ぶ組み合わせは何通り？`;
      answer = answerVal;
      wrongs = [numerator, answerVal + 1, Math.max(1, answerVal - 1), n * r];
      steps = r === 2
        ? [`${n} × ${n - 1} ÷ 2 = ${answerVal}通り`]
        : [`${n} × ${n - 1} × ${n - 2} ÷ (3 × 2 × 1) = ${answerVal}通り`];
    }
    const choices = buildChoices(answer, wrongs);
    return { category: 'arrangeCombine6', question, answer, choices, steps };
  }

  // 小数のかけ算（小4）：小数×整数
  function genDecMul4() {
    let dTenths;
    do { dTenths = randInt(11, 99); } while (dTenths % 10 === 0);
    const n = randInt(2, 9);
    const productTenths = dTenths * n;
    const d = (dTenths / 10).toFixed(1);
    const answer = (productTenths / 10).toFixed(1);
    const question = `${d} × ${n} = ?`;
    const candidates = [
      ((productTenths + 10) / 10).toFixed(1),
      (Math.max(1, productTenths - 10) / 10).toFixed(1),
      (dTenths * (n + 1) / 10).toFixed(1),
      `${Math.round(dTenths / 10 * n)}`,
    ];
    const steps = [`${dTenths} × ${n} = ${productTenths}（0.1のまとまりが${productTenths}個）`, `= ${answer}`];
    return { category: 'decMul4', question, answer, choices: buildChoicesFromList(answer, candidates), steps };
  }

  // わり算の筆算・あまりのあるわり算（小4）
  function genDivRemainder4() {
    const divisor = randInt(2, 9);
    const quotient = randInt(3, 30);
    const remainder = randInt(1, divisor - 1);
    const dividend = divisor * quotient + remainder;
    const askQuotient = Math.random() < 0.5;
    let question, answer, wrongs, steps;
    if (askQuotient) {
      question = `${dividend} ÷ ${divisor} の商は？（あまりも出る）`;
      answer = quotient;
      wrongs = [quotient + 1, Math.max(1, quotient - 1), dividend];
    } else {
      question = `${dividend} ÷ ${divisor} のあまりは？`;
      answer = remainder;
      wrongs = [divisor, remainder + 1, Math.max(0, remainder - 1)];
    }
    steps = [`${divisor} × ${quotient} = ${divisor * quotient}`, `${dividend} − ${divisor * quotient} = ${remainder}`, `商 ${quotient}、あまり ${remainder}`];
    return { category: 'divRemainder4', question, answer, choices: buildChoices(answer, wrongs), steps };
  }

  // 長方形・正方形の面積（小4）
  function genRectArea4() {
    const isSquare = Math.random() < 0.4;
    let question, answer, wrongs, steps;
    if (isSquare) {
      const s = randInt(2, 15);
      answer = s * s;
      question = `1辺が ${s} cm の正方形の面積は？`;
      wrongs = [s * 4, s + s, Math.max(1, answer - s)];
      steps = [`正方形の面積 = 1辺 × 1辺 = ${s} × ${s} = ${answer} cm²`];
    } else {
      const w = randInt(2, 15), h = randInt(2, 15);
      answer = w * h;
      question = `縦 ${h} cm、横 ${w} cm の長方形の面積は？`;
      wrongs = [2 * (w + h), w + h, Math.max(1, answer - h)];
      steps = [`長方形の面積 = 縦 × 横 = ${h} × ${w} = ${answer} cm²`];
    }
    return { category: 'rectArea4', question, answer, choices: buildChoices(answer, wrongs), steps };
  }

  // 単位量あたりの大きさ・速さ（小5）
  function genSpeedRate5() {
    const pat = randInt(0, 2);
    const v = randInt(2, 9) * 10;
    const t = randInt(2, 8);
    const d = v * t;
    let question, answer, wrongs, steps;
    if (pat === 0) {
      question = `${d} km の道のりを ${t} 時間で進んだ。速さは時速何 km？`;
      answer = v;
      wrongs = [d, t, Math.max(1, v - 10), v + 10];
      steps = [`速さ = 道のり ÷ 時間 = ${d} ÷ ${t} = ${v} km/時`];
    } else if (pat === 1) {
      question = `時速 ${v} km で ${t} 時間進むと、道のりは何 km？`;
      answer = d;
      wrongs = [v + t, Math.max(1, d - v), d + v];
      steps = [`道のり = 速さ × 時間 = ${v} × ${t} = ${d} km`];
    } else {
      question = `時速 ${v} km で ${d} km 進むには何時間かかる？`;
      answer = t;
      wrongs = [t + 1, Math.max(1, t - 1), v];
      steps = [`時間 = 道のり ÷ 速さ = ${d} ÷ ${v} = ${t} 時間`];
    }
    return { category: 'speedRate5', question, answer, choices: buildChoices(answer, wrongs), steps };
  }

  // 割合・百分率（小5）
  function genPercent5() {
    const pat = randInt(0, 2);
    const pct = randInt(1, 19) * 5;
    const base = randInt(2, 40) * 20;
    const part = base * pct / 100;
    let question, answer, wrongs, steps;
    if (pat === 0) {
      question = `${base} の ${pct}% は？`;
      answer = part;
      wrongs = [base - part, part + pct, Math.max(1, part - 10)];
      steps = [`${pct}% = ${pct}/100`, `${base} × ${pct}/100 = ${part}`];
    } else if (pat === 1) {
      question = `${part} は ${base} の何 % ？`;
      answer = pct;
      wrongs = [pct + 5, Math.max(5, pct - 5), part];
      steps = [`割合 = ${part} ÷ ${base} = ${(part / base).toFixed(2)}`, `= ${pct} %`];
    } else {
      question = `ある数の ${pct}% が ${part} のとき、もとの数は？`;
      answer = base;
      wrongs = [part, base + pct, Math.max(1, base - 20)];
      steps = [`もとの数 = ${part} ÷ (${pct}/100) = ${part} ÷ ${pct / 100} = ${base}`];
    }
    return { category: 'percent5', question, answer, choices: buildChoices(answer, wrongs), steps };
  }

  // 倍数と約数（小5）
  function genMultiples5() {
    const pat = randInt(0, 2);
    const a = randInt(2, 12), b = randInt(2, 12);
    let question, answer, wrongs, steps;
    if (pat === 0) {
      const l = lcmFrac(a, b);
      question = `${a} と ${b} の最小公倍数は？`;
      answer = l;
      wrongs = [a * b, Math.max(a, b), l + Math.min(a, b)].filter(v => v !== l);
      steps = [`${a} の倍数、${b} の倍数を並べて共通のものを探す`, `最小公倍数 = ${l}`];
    } else if (pat === 1) {
      const g = gcdFrac(a, b);
      question = `${a} と ${b} の最大公約数は？`;
      answer = g;
      wrongs = [Math.min(a, b), a * b, g + 1].filter(v => v !== g);
      steps = [`${a}、${b} をともに割り切れる数を探す`, `最大公約数 = ${g}`];
    } else {
      const g = gcdFrac(a, b);
      let cnt = 0;
      for (let i = 1; i <= g; i++) { if (g % i === 0) cnt++; }
      question = `${a} と ${b} の公約数は何個ある？`;
      answer = cnt;
      wrongs = [cnt + 1, Math.max(1, cnt - 1), g];
      steps = [`最大公約数 = ${g}`, `${g} の約数の個数を数える → ${cnt} 個`];
    }
    return { category: 'multiples5', question, answer, choices: buildChoices(answer, wrongs), steps };
  }

  // 図形の角：内角の和（小5）
  function genPolygonAngle5() {
    const pat = randInt(0, 2);
    let question, answer, wrongs, steps;
    if (pat === 0) {
      const aa = randInt(20, 80), bb = randInt(20, 80);
      const x = 180 - aa - bb;
      question = `三角形の3つの角のうち2つが ${aa}° と ${bb}°。残りの角 x は？`;
      answer = x;
      wrongs = [aa, bb, 180 - aa];
      steps = [`三角形の内角の和は180°`, `x = 180 − ${aa} − ${bb} = ${x}`];
    } else if (pat === 1) {
      const aa = randInt(30, 100), bb = randInt(30, 100), cc = randInt(30, 100);
      const x = 360 - aa - bb - cc;
      question = `四角形の4つの角のうち3つが ${aa}°、${bb}°、${cc}°。残りの角 x は？`;
      answer = x;
      wrongs = [aa, 360 - aa - bb, x + 10];
      steps = [`四角形の内角の和は360°`, `x = 360 − ${aa} − ${bb} − ${cc} = ${x}`];
    } else {
      const ns = [5, 6, 7, 8, 9, 10, 12];
      const n = ns[randInt(0, ns.length - 1)];
      const sum = 180 * (n - 2);
      question = `${kanjiDigit(n)}角形の内角の和は？`;
      answer = sum;
      wrongs = [180 * n, sum + 180, Math.max(180, sum - 180)];
      steps = [`多角形の内角の和 = 180° × (n−2)`, `= 180 × (${n}−2) = ${sum}°`];
    }
    return { category: 'polygonAngle5', question, answer, choices: buildChoices(answer, wrongs), steps };
  }

  // 分数と小数、整数の関係（小5）
  function genFracDecConvert5() {
    const denomInfo = [{ d: 2, p: 1 }, { d: 4, p: 2 }, { d: 5, p: 1 }, { d: 8, p: 3 }, { d: 10, p: 1 }, { d: 20, p: 2 }, { d: 25, p: 2 }, { d: 50, p: 2 }];
    const info = denomInfo[randInt(0, denomInfo.length - 1)];
    const d = info.d, p = info.p;
    let n;
    do { n = randInt(1, d - 1); } while (gcdFrac(n, d) !== 1);
    const decStr = (n / d).toFixed(p);
    const toDecimal = Math.random() < 0.5;
    let question, answer, candidates, steps;
    if (toDecimal) {
      question = `${n}/${d} を小数で表すと？`;
      answer = decStr;
      candidates = [
        ((n + 1) / d).toFixed(p),
        (Math.max(1, n - 1) / d).toFixed(p),
        (d / n).toFixed(p),
        `${n}.${d}`,
      ];
      steps = [`${n} ÷ ${d} を計算する`, `= ${decStr}`];
    } else {
      question = `${decStr} を分数で表すと？`;
      answer = fracToStr(n, d);
      candidates = [
        fracToStr(n + 1, d),
        fracToStr(Math.max(1, n - 1), d),
        `${d}/${n}`,
        fracToStr(n, d + 1),
      ];
      steps = [`${decStr} = ${n}/${d}`];
    }
    return { category: 'fracDecConvert5', question, questionHtml: stepToHtml(question), answer, choices: buildChoicesFromList(answer, candidates), steps };
  }

  // 平均（小5）
  function genAverage5() {
    const count = randInt(3, 5);
    const vals = [];
    let sum = 0;
    for (let i = 0; i < count - 1; i++) { const v = randInt(1, 30); vals.push(v); sum += v; }
    const rem = sum % count;
    let last = (count - rem) % count;
    if (last === 0) last = count;
    last += count * randInt(0, 2);
    vals.push(last);
    sum += last;
    const answer = sum / count;
    const question = `次の${count}つの数値の平均を求めよ： ${vals.join('、')}`;
    const wrongs = [answer + 1, answer - 1, sum, Math.max(0, answer - 2)];
    const steps = [`合計 = ${vals.join(' + ')} = ${sum}`, `平均 = ${sum} ÷ ${count} = ${answer}`];
    return { category: 'average5', question, answer, choices: buildChoices(answer, wrongs), steps };
  }

  // 円周（小5、円周率は3.14）
  function genCircumference5() {
    const pat = randInt(0, 2);
    let question, answer, candidates, steps;
    if (pat === 0) {
      const r = randInt(2, 20);
      const d = r * 2;
      const cX100 = d * 314;
      const c = (cX100 / 100).toFixed(2);
      question = `半径 ${r} cm の円の円周は？（円周率は3.14）`;
      answer = c;
      candidates = [
        ((r * 314) / 100).toFixed(2),
        (((d + 1) * 314) / 100).toFixed(2),
        (d * 3).toFixed(2),
        ((cX100 + 100) / 100).toFixed(2),
      ];
      steps = [`円周 = 直径 × 3.14`, `直径 = ${r} × 2 = ${d}`, `円周 = ${d} × 3.14 = ${c} cm`];
      return { category: 'circumference5', question, answer, choices: buildChoicesFromList(answer, candidates), steps };
    } else if (pat === 1) {
      const d = randInt(2, 30);
      const cX100 = d * 314;
      const c = (cX100 / 100).toFixed(2);
      question = `直径 ${d} cm の円の円周は？（円周率は3.14）`;
      answer = c;
      candidates = [
        (((d / 2) * 314) / 100).toFixed(2),
        (((d + 1) * 314) / 100).toFixed(2),
        (d * 3).toFixed(2),
        ((cX100 - 100) / 100).toFixed(2),
      ];
      steps = [`円周 = 直径 × 3.14`, `= ${d} × 3.14 = ${c} cm`];
      return { category: 'circumference5', question, answer, choices: buildChoicesFromList(answer, candidates), steps };
    } else {
      const d = randInt(2, 20);
      const cX100 = d * 314;
      const c = (cX100 / 100).toFixed(2);
      question = `円周が ${c} cm のとき、直径は何 cm？`;
      answer = d;
      const wrongs = [d + 1, Math.max(1, d - 1), d * 2];
      steps = [`直径 = 円周 ÷ 3.14`, `= ${c} ÷ 3.14 = ${d} cm`];
      return { category: 'circumference5', question, answer, choices: buildChoices(answer, wrongs), steps };
    }
  }

  // 円の面積（小6、円周率は3.14）
  function genCircleArea6() {
    const givenDiameter = Math.random() < 0.5;
    const r = randInt(2, 15);
    const areaX100 = r * r * 314;
    const a = (areaX100 / 100).toFixed(2);
    let question;
    if (givenDiameter) {
      question = `直径 ${r * 2} cm の円の面積は？（円周率は3.14）`;
    } else {
      question = `半径 ${r} cm の円の面積は？（円周率は3.14）`;
    }
    const answer = a;
    const candidates = [
      ((r * 2 * 314) / 100).toFixed(2),
      (r * r * 3).toFixed(2),
      (((r + 1) * (r + 1) * 314) / 100).toFixed(2),
      ((areaX100 + 100) / 100).toFixed(2),
    ];
    const steps = givenDiameter
      ? [`半径 = 直径 ÷ 2 = ${r * 2} ÷ 2 = ${r}`, `面積 = ${r} × ${r} × 3.14 = ${a} cm²`]
      : [`面積 = 半径 × 半径 × 3.14`, `= ${r} × ${r} × 3.14 = ${a} cm²`];
    return { category: 'circleArea6', question, answer, choices: buildChoicesFromList(answer, candidates), steps };
  }

  // 角柱と円柱の体積（小6、円周率は3.14）
  function genPrismVolume6() {
    const pat = randInt(0, 2);
    if (pat === 0) {
      const baseArea = randInt(5, 40);
      const h = randInt(3, 12);
      const v = baseArea * h;
      const question = `底面積 ${baseArea} cm²、高さ ${h} cm の角柱の体積は？`;
      const answer = v;
      const wrongs = [baseArea + h, Math.max(1, v - h), v + baseArea];
      const steps = [`角柱の体積 = 底面積 × 高さ`, `= ${baseArea} × ${h} = ${v} cm³`];
      return { category: 'prismVolume6', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 1) {
      const b = randInt(2, 10) * 2, hTri = randInt(2, 10);
      const baseArea = b * hTri / 2;
      const hPrism = randInt(3, 12);
      const v = baseArea * hPrism;
      const question = `底面が底辺 ${b} cm・高さ ${hTri} cm の三角形で、柱の高さが ${hPrism} cm の三角柱の体積は？`;
      const answer = v;
      const wrongs = [b * hTri * hPrism, Math.max(1, v - hPrism), v + baseArea];
      const steps = [`底面積 = ${b} × ${hTri} ÷ 2 = ${baseArea} cm²`, `体積 = ${baseArea} × ${hPrism} = ${v} cm³`];
      return { category: 'prismVolume6', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else {
      const r = randInt(2, 10);
      const h = randInt(3, 12);
      const baseAreaX100 = r * r * 314;
      const baseAreaStr = (baseAreaX100 / 100).toFixed(2);
      const vX100 = baseAreaX100 * h;
      const v = (vX100 / 100).toFixed(2);
      const question = `底面の半径 ${r} cm、高さ ${h} cm の円柱の体積は？（円周率は3.14）`;
      const answer = v;
      const candidates = [
        (((r * 2 * 314) * h) / 100).toFixed(2),
        ((r * r * 3) * h).toFixed(2),
        ((vX100 + 100) / 100).toFixed(2),
        ((r * r * 314 * (h + 1)) / 100).toFixed(2),
      ];
      const steps = [`底面積 = ${r} × ${r} × 3.14 = ${baseAreaStr} cm²`, `体積 = ${baseAreaStr} × ${h} = ${v} cm³`];
      return { category: 'prismVolume6', question, answer, choices: buildChoicesFromList(answer, candidates), steps };
    }
  }

  /* ---------- 問題生成関数 ---------- */

  function genAdd2() {
    const a = randNonZero(-9, 9);
    const b = randNonZero(-9, 9);
    const answer = a + b;
    const expr = `${fmtLead(a)} + ${fmtNum(b)}`;
    const wrongs = [-answer, a - b, a + Math.abs(b), Math.abs(a) + Math.abs(b)];
    const steps = addSteps(a, b);
    return { category: 'add2', question: `${expr} = ?`, answer, choices: buildChoices(answer, wrongs), steps };
  }

  function genSub2() {
    const a = randNonZero(-9, 9);
    const b = randNonZero(-9, 9);
    const answer = a - b;
    const expr = `${fmtLead(a)} − ${fmtNum(b)}`;
    const wrongs = [-answer, a + b, a - Math.abs(b), Math.abs(a) - Math.abs(b)];
    const neg_b = -b;
    const steps = [
      `引く → 負を足す: ${fmtLead(a)} − ${fmtNum(b)} = ${fmtLead(a)} + ${fmtNum(neg_b)}`,
      ...addSteps(a, neg_b)
    ];
    return { category: 'sub2', question: `${expr} = ?`, answer, choices: buildChoices(answer, wrongs), steps };
  }

  function genChain3() {
    const t = [randNonZero(-9, 9), randNonZero(-9, 9), randNonZero(-9, 9)];
    const answer = t[0] + t[1] + t[2];
    let expr = fmtLead(t[0]);
    for (let i = 1; i < t.length; i++) {
      expr += t[i] < 0 ? ` − ${Math.abs(t[i])}` : ` + ${t[i]}`;
    }
    const wrongs = [-answer, t[0] + t[1] - t[2], t[0] - t[1] + t[2], answer + (t[2] >= 0 ? -2 * t[2] : 2 * Math.abs(t[2]))];
    const mid = t[0] + t[1];
    const op1 = t[1] < 0 ? `− ${Math.abs(t[1])}` : `+ ${t[1]}`;
    const op2 = t[2] < 0 ? `− ${Math.abs(t[2])}` : `+ ${t[2]}`;
    const steps = [
      `左から順に計算: (${t[0]} ${op1}) ${op2}`,
      `= ${mid} ${op2}`,
      `= ${answer}`
    ];
    return { category: 'chain3', question: `${expr} = ?`, answer, choices: buildChoices(answer, wrongs), steps };
  }

  function genMul2() {
    const a = randNonZero(-9, 9);
    const b = randNonZero(-9, 9);
    const answer = a * b;
    const expr = `${fmtLead(a)} × ${fmtNum(b)}`;
    const wrongs = [-answer, Math.abs(a) * Math.abs(b), a * Math.abs(b), Math.abs(a) * b];
    const steps = mulSteps(a, b);
    return { category: 'mul2', question: `${expr} = ?`, answer, choices: buildChoices(answer, wrongs), steps };
  }

  function genDiv2() {
    const b = randNonZero(-9, 9);
    const k = randNonZero(-9, 9);
    const a = b * k;
    const answer = k;
    const expr = `${fmtLead(a)} ÷ ${fmtNum(b)}`;
    const wrongs = [-answer, Math.abs(answer), answer + 2, answer - 2];
    const same = (a > 0) === (b > 0);
    const steps = [
      `符号: ${same ? '同符号 → ＋（プラス）' : '異符号 → −（マイナス）'}`,
      `絶対値: ${Math.abs(a)} ÷ ${Math.abs(b)} = ${Math.abs(answer)}`,
      `= ${answer}`
    ];
    return { category: 'div2', question: `${expr} = ?`, answer, choices: buildChoices(answer, wrongs), steps };
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
    const steps = [
      `かっこ内を先に計算: ${displayInner} = ${inner}`,
      ...mulSteps(a, inner)
    ];
    return { category: 'mixed', question: `${displayExpr} = ?`, answer, choices: buildChoices(answer, wrongs), steps };
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
      const steps = [
        `乗除を先に（計算の順序）: ${fmtNum(b)} ${opSym2} ${fmtNum(c)} = ${term2}`,
        `= ${fmtLead(a)} ${useMinus ? '−' : '+'} ${fmtNum(term2)}`,
        `= ${answer}`
      ];
      return { category: 'allops', question: `${expr} = ?`, answer, choices: buildChoices(answer, wrongs), steps };
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
      const steps = [
        `乗算を先に: ${fmtLead(a)} × ${fmtNum(b)} = ${t1}、${fmtNum(c)} × ${fmtNum(d)} = ${t2}`,
        `= ${fmtNum(t1)} ${useMinus ? '−' : '+'} ${fmtNum(t2)}`,
        `= ${answer}`
      ];
      return { category: 'allops', question: `${expr} = ?`, answer, choices: buildChoices(answer, wrongs), steps };
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
      let steps;
      if (exp === 2) {
        steps = [
          `(−${base})² = (−${base}) × (−${base})`,
          `同符号 → ＋: = ${base * base}`,
          `= ${answer}`
        ];
      } else {
        steps = [
          `(−${base})³ = (−${base}) × (−${base}) × (−${base})`,
          `前2項 同符号 → ＋: ${base * base} × (−${base})`,
          `異符号 → −: = −${base * base * base}`,
          `= ${answer}`
        ];
      }
      return { category: 'power', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else {
      const answer = -Math.pow(base, exp);
      const expStr = exp === 2 ? '²' : '³';
      const question = `−${base}${expStr} = ?`;
      const wrongs = [Math.pow(base, exp), Math.pow(-base, exp), -Math.pow(base, exp - 1)];
      const innerVal = Math.pow(base, exp);
      const steps = exp === 2
        ? [
            `−${base}² はマイナスの外: −(${base}²)`,
            `= −(${base} × ${base}) = −${innerVal}`,
            `= ${answer}`
          ]
        : [
            `−${base}³ はマイナスの外: −(${base}³)`,
            `= −(${base} × ${base} × ${base}) = −${innerVal}`,
            `= ${answer}`
          ];
      return { category: 'power', question, answer, choices: buildChoices(answer, wrongs), steps };
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
    const steps = [
      `中かっこ内を先に計算: {${innerStr}} = ${inner}`,
      `= ${fmtLead(a)} ${outerMinus ? '−' : '+'} ${fmtNum(inner)}`,
      `= ${answer}`
    ];
    return { category: 'brace', question, answer, choices: buildChoices(answer, wrongs), steps };
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

    // 途中式
    const ca1Str = ca1 < 0 ? `(${ca1})` : `${ca1}`;
    const ca2Str = ca2 < 0 ? `(${ca2})` : `${ca2}`;
    const n1Str  = n1 < 0  ? `(${n1})`  : `${n1}`;
    const n2Str  = n2 < 0  ? `(${n2})`  : `${n2}`;
    const litResult = caSum === 0 ? '0' : `${caSum}${letter}`;
    const steps = [
      `文字の項をまとめる: ${ca1Str}${letter} + ${ca2Str}${letter} = (${ca1}+${ca2})${letter} = ${litResult}`,
      `数の項をまとめる: ${n1Str} + ${n2Str} = ${nSum}`,
      `= ${answer}`
    ];

    return { category: 'literal', question, answer, choices: shuffle(choices), steps };
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
        const steps = [
          `文字式は × を省略し、数を文字の前に書く`,
          `${letter} × ${k} = ${k}${letter}`
        ];
        return { q, ans, w, steps };
      },
      // 係数×文字² → 係数文字²
      () => {
        const k = randInt(2, 9);
        const q = `${k} × ${letter} × ${letter} を文字式で表すと？`;
        const ans = `${k}${letter}²`;
        const w = [`${letter}² × ${k}`, `${k}${letter}`, `${k}²${letter}`];
        const steps = [
          `同じ文字の積は累乗: ${letter} × ${letter} = ${letter}²`,
          `数を前に: ${k} × ${letter}² = ${k}${letter}²`
        ];
        return { q, ans, w, steps };
      },
      // 文字÷係数 → 文字/係数
      () => {
        const k = randInt(2, 9);
        const q = `${letter} ÷ ${k} を文字式で表すと？`;
        const ans = `${letter}/${k}`;
        const w = [`${k}/${letter}`, `${k}${letter}`, `${letter} × ${k}`];
        const steps = [
          `÷ k は分母に k を書く（分数で表す）`,
          `${letter} ÷ ${k} = ${letter}/${k}`
        ];
        return { q, ans, w, steps };
      },
      // 数÷文字 → 数/文字
      () => {
        const k = randInt(2, 9);
        const q = `${k} ÷ ${letter} を文字式で表すと？`;
        const ans = `${k}/${letter}`;
        const w = [`${letter}/${k}`, `${k}${letter}`, `${k} × ${letter}`];
        const steps = [
          `÷ ${letter} は分母に ${letter} を書く`,
          `${k} ÷ ${letter} = ${k}/${letter}`
        ];
        return { q, ans, w, steps };
      },
      // (文字+数)×係数 → 係数(文字+数)
      () => {
        const k = randInt(2, 6);
        const n = randInt(1, 9);
        const q = `(${letter} + ${n}) × ${k} を文字式で表すと？`;
        const ans = `${k}(${letter} + ${n})`;
        const w = [`(${letter} + ${n})${k}`, `${k}${letter} + ${n}`, `${k}${letter} + ${k}${n}`];
        const steps = [
          `かっこの前に数を書き、× を省略`,
          `(${letter} + ${n}) × ${k} = ${k}(${letter} + ${n})`
        ];
        return { q, ans, w, steps };
      },
      // 係数×文字+定数（×の省略のみ）
      () => {
        const a = randInt(2, 5);
        const b = randInt(1, 9);
        const q = `${a} × ${letter} + ${b} を文字式で表すと？`;
        const ans = `${a}${letter} + ${b}`;
        const w = [`${letter}${a} + ${b}`, `${a}${letter}${b}`, `${a}(${letter} + ${b})`];
        const steps = [
          `× を省略し、数を文字の前に: ${a} × ${letter} = ${a}${letter}`,
          `= ${a}${letter} + ${b}`
        ];
        return { q, ans, w, steps };
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
    return { category: 'notation', question: p.q, answer: p.ans, choices: shuffle(choices), steps: p.steps };
  }

  // 代入の計算：a または x に値を代入して式の値を求める
  function genSubst() {
    const letter = Math.random() < 0.5 ? 'a' : 'x';
    const val = randNonZero(-5, 5);
    const valFmt = val < 0 ? `(${val})` : `${val}`;

    const patterns = [
      // 係数×文字+定数
      () => {
        const a = randNonZero(-4, 4);
        const b = randNonZero(-9, 9);
        const answer = a * val + b;
        const bStr = b < 0 ? ` − ${Math.abs(b)}` : ` + ${b}`;
        const q = `${letter} = ${val} のとき、${a === 1 ? '' : a === -1 ? '−' : a}${letter}${bStr} の値を求めよ。`;
        const aMul = a === 1 ? valFmt : a === -1 ? `−${valFmt}` : `${a}×${valFmt}`;
        const steps = [
          `${letter} = ${val} を代入`,
          `= ${aMul}${bStr}`,
          `= ${a * val}${bStr}`,
          `= ${answer}`
        ];
        return { q, answer, steps };
      },
      // 係数×文字²+定数
      () => {
        const a = randNonZero(-3, 3);
        const b = randNonZero(-9, 9);
        const answer = a * val * val + b;
        const bStr = b < 0 ? ` − ${Math.abs(b)}` : ` + ${b}`;
        const aStr = a === 1 ? '' : a === -1 ? '−' : `${a}`;
        const q = `${letter} = ${val} のとき、${aStr}${letter}² ${bStr.trim()} の値を求めよ。`;
        const valSq = val * val;
        const aMul = a === 1 ? `${valFmt}²` : a === -1 ? `−${valFmt}²` : `${a}×${valFmt}²`;
        const aMulNum = a === 1 ? `${valSq}` : a === -1 ? `−${valSq}` : `${a}×${valSq}`;
        const steps = [
          `${letter} = ${val} を代入`,
          `= ${aMul}${bStr}`,
          `= ${aMulNum}${bStr}`,
          `= ${answer}`
        ];
        return { q, answer, steps };
      },
      // 2つの文字式の計算（同じ文字）
      () => {
        const a = randNonZero(-4, 4);
        const b = randNonZero(-4, 4);
        const answer = a * val + b * val;
        const bStr = b < 0 ? ` − ${Math.abs(b)}${letter}` : ` + ${b}${letter}`;
        const aStr = a === 1 ? letter : a === -1 ? `−${letter}` : `${a}${letter}`;
        const q = `${letter} = ${val} のとき、${aStr}${bStr} の値を求めよ。`;
        const bFmt = b < 0 ? `(${b})` : `${b}`;
        const steps = [
          `${letter} = ${val} を代入`,
          `= ${a}×${valFmt} + ${bFmt}×${valFmt}`,
          `= ${a * val} + ${b * val}`,
          `= ${answer}`
        ];
        return { q, answer, steps };
      },
    ];

    const p = patterns[randInt(0, patterns.length - 1)]();
    const answer = p.answer;
    const wrongs = [-answer, answer + val, answer - val, answer * 2].filter((v, i, arr) => arr.indexOf(v) === i && v !== answer);
    return { category: 'subst', question: p.q, answer, choices: buildChoices(answer, wrongs), steps: p.steps };
  }

  function genMaxOf4() {
    const nums = new Set();
    while (nums.size < 4) nums.add(randNonZero(-12, 12));
    const arr = Array.from(nums);
    const askMax = Math.random() < 0.5;
    const answer = askMax ? Math.max(...arr) : Math.min(...arr);
    const label = askMax ? '次の4つの数のうち、最も大きい数はどれか。' : '次の4つの数のうち、最も小さい数はどれか。';
    const sorted = arr.slice().sort((x, y) => x - y);
    const steps = [
      `小さい順に並べると: ${sorted.join(' < ')}`,
      `${askMax ? '最も大きい数' : '最も小さい数'}は ${answer}`
    ];
    return { category: 'maxof4', question: label, answer, choices: shuffle(arr).map(String), isOrdering: true, steps };
  }

  /* ---------- 角度の計算 ---------- */

  function kanjiDigit(n) {
    const digits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    if (n <= 9) return digits[n];
    if (n === 10) return '十';
    if (n < 20) return '十' + digits[n - 10];
    if (n % 10 === 0) return digits[Math.floor(n / 10)] + '十';
    return digits[Math.floor(n / 10)] + '十' + digits[n % 10];
  }

  function mkPolySvg(n, showExt) {
    const cx = 57, cy = 50, r = 40;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 2 * Math.PI - Math.PI / 2;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    const d = 'M' + pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L') + ' Z';
    let extra = '';
    if (showExt) {
      const p0 = pts[0], p1 = pts[1];
      const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
      const l = Math.hypot(dx, dy);
      const ex = p1[0] + dx / l * 22, ey = p1[1] + dy / l * 22;
      extra = `<line x1="${p1[0].toFixed(1)}" y1="${p1[1].toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="#888" stroke-width="1.5" stroke-dasharray="4,2"/>`;
    }
    return `<svg width="118" height="105" viewBox="0 0 118 105" style="display:block;margin:0 auto 8px"><path d="${d}" fill="none" stroke="#1c2127" stroke-width="1.5"/>${extra}</svg>`;
  }

  function genAngle() {
    const pat = randInt(0, 7);
    let question, questionHtml, answer, steps, wrongs;
    if (pat === 0) {
      const a = randInt(30, 80), b = randInt(20, Math.min(80, 170 - a));
      const x = 180 - a - b;
      question = `三角形の2つの角が ${a}°、${b}° のとき、残りの内角 x は？`;
      steps = [`内角の和 = 180°`, `x = 180 − ${a} − ${b} = ${x}°`];
      answer = x; wrongs = [a + b, x + 10, x - 10];
      questionHtml = `<svg width="115" height="100" viewBox="0 0 115 100" style="display:block;margin:0 auto 8px"><path d="M57,10 L8,88 L106,88 Z" fill="none" stroke="#1c2127" stroke-width="1.5"/><text x="50" y="30" font-size="13" font-weight="bold" fill="#1c2127" text-anchor="middle">${a}°</text><text x="22" y="80" font-size="13" font-weight="bold" fill="#1c2127">${b}°</text><text x="80" y="80" font-size="13" font-weight="bold" fill="#c23b2e">x</text></svg><span style="display:block">${question}</span>`;
    } else if (pat === 1) {
      const a = randInt(25, 65), b = randInt(25, 65);
      const ext = a + b;
      question = `三角形の外角が ${ext}° で、隣り合わない内角の一方が ${a}°。もう一方 x は？`;
      steps = [`外角 = 他の2内角の和`, `x = ${ext} − ${a} = ${b}°`];
      answer = b; wrongs = [180 - b, a, ext];
      questionHtml = `<svg width="130" height="100" viewBox="0 0 130 100" style="display:block;margin:0 auto 8px"><path d="M52,10 L5,85 L90,85 Z" fill="none" stroke="#1c2127" stroke-width="1.5"/><line x1="90" y1="85" x2="122" y2="85" stroke="#1c2127" stroke-width="1.5"/><text x="47" y="28" font-size="13" font-weight="bold" fill="#1c2127" text-anchor="middle">${a}°</text><text x="20" y="77" font-size="13" font-weight="bold" fill="#c23b2e">x</text><text x="94" y="77" font-size="13" font-weight="bold" fill="#1c2127">${ext}°</text></svg><span style="display:block">${question}</span>`;
    } else if (pat === 2) {
      const n = randInt(4, 8);
      const s = (n - 2) * 180;
      question = `${kanjiDigit(n)}角形の内角の和は？`;
      steps = [`(n − 2) × 180° = (${n} − 2) × 180 = ${s}°`];
      answer = s; wrongs = [s - 180, s + 180, n * 180];
      questionHtml = mkPolySvg(n, false) + `<span style="display:block">${question}</span>`;
    } else if (pat === 3) {
      const n = randInt(4, 9);
      question = `${kanjiDigit(n)}角形の外角の和は？`;
      steps = [`多角形の外角の和はつねに 360°`];
      answer = 360; wrongs = [180, 540, 720];
      questionHtml = mkPolySvg(n, true) + `<span style="display:block">${question}</span>`;
    } else if (pat === 4) {
      const ns = [4, 5, 6, 8, 9, 10, 12];
      const n = ns[randInt(0, ns.length - 1)];
      const s = (n - 2) * 180, interior = s / n;
      question = `正${kanjiDigit(n)}角形の1つの内角は？`;
      steps = [`内角の和 = (${n}−2)×180 = ${s}°`, `1つの内角 = ${s} ÷ ${n} = ${interior}°`];
      answer = interior; wrongs = [s, 360 / n, interior + 10];
      questionHtml = mkPolySvg(n, false) + `<span style="display:block">${question}</span>`;
    } else if (pat === 5) {
      const ns2 = [4, 5, 6, 7, 8, 9, 10];
      const n = ns2[randInt(0, ns2.length - 1)];
      const s = (n - 2) * 180;
      question = `内角の和が ${s}° の多角形は何角形？`;
      steps = [`(n − 2) × 180 = ${s}`, `n − 2 = ${s / 180}`, `n = ${n}（${kanjiDigit(n)}角形）`];
      answer = n; wrongs = [n - 1, n + 1, n + 2];
    } else if (pat === 6) {
      const validExt = [20, 24, 30, 36, 40, 45, 60, 72];
      const ext = validExt[randInt(0, validExt.length - 1)];
      const n = 360 / ext;
      question = `1つの外角が ${ext}° の正多角形は何角形？`;
      steps = [`外角の和 = 360°`, `辺の数 = 360 ÷ ${ext} = ${n}（${kanjiDigit(n)}角形）`];
      answer = n; wrongs = [n - 1, n + 1, n + 2];
      questionHtml = mkPolySvg(n, true) + `<span style="display:block">${question}</span>`;
    } else {
      const base = randInt(20, 79), top = 180 - 2 * base;
      const askTop = Math.random() < 0.5;
      if (askTop) {
        question = `二等辺三角形の底角が ${base}° のとき、頂角 x は？`;
        steps = [`頂角 = 180° − 底角 × 2 = 180 − ${2 * base} = ${top}°`];
        answer = top; wrongs = [base, 180 - base, top + 10];
        questionHtml = `<svg width="115" height="100" viewBox="0 0 115 100" style="display:block;margin:0 auto 8px"><path d="M57,10 L8,86 L106,86 Z" fill="none" stroke="#1c2127" stroke-width="1.5"/><line x1="29.1" y1="45.8" x2="35.9" y2="50.2" stroke="#1c2127" stroke-width="1.5"/><line x1="78.1" y1="50.2" x2="84.9" y2="45.8" stroke="#1c2127" stroke-width="1.5"/><text x="50" y="32" font-size="13" font-weight="bold" fill="#c23b2e" text-anchor="middle">x</text><text x="20" y="78" font-size="13" font-weight="bold" fill="#1c2127">${base}°</text><text x="76" y="78" font-size="13" font-weight="bold" fill="#1c2127">${base}°</text></svg><span style="display:block">${question}</span>`;
      } else {
        question = `二等辺三角形の頂角が ${top}° のとき、底角 x は？`;
        steps = [`底角 = (180° − 頂角) ÷ 2 = (180 − ${top}) ÷ 2 = ${base}°`];
        answer = base; wrongs = [top, 180 - base, base + 10];
        questionHtml = `<svg width="115" height="100" viewBox="0 0 115 100" style="display:block;margin:0 auto 8px"><path d="M57,10 L8,86 L106,86 Z" fill="none" stroke="#1c2127" stroke-width="1.5"/><line x1="29.1" y1="45.8" x2="35.9" y2="50.2" stroke="#1c2127" stroke-width="1.5"/><line x1="78.1" y1="50.2" x2="84.9" y2="45.8" stroke="#1c2127" stroke-width="1.5"/><text x="50" y="32" font-size="13" font-weight="bold" fill="#1c2127" text-anchor="middle">${top}°</text><text x="20" y="78" font-size="13" font-weight="bold" fill="#c23b2e">x</text><text x="76" y="78" font-size="13" font-weight="bold" fill="#c23b2e">x</text></svg><span style="display:block">${question}</span>`;
      }
    }
    return { category: 'angle', question, questionHtml, answer, choices: buildChoices(answer, wrongs), steps };
  }

  function mkTriSvg(tri1, tri2, sym) {
    const [a,b,c] = tri1, [d,e,f] = tri2;
    if (sym === '∽') {
      // 相似: 左は小さめ、右は大きめ
      return `<svg width="205" height="90" viewBox="0 0 205 90" style="display:block;margin:0 auto 8px"><path d="M32,24 L10,62 L54,62 Z" fill="none" stroke="#1c2127" stroke-width="1.5"/><text x="25" y="22" font-size="11" font-weight="bold" fill="#1c2127">${a}</text><text x="2" y="73" font-size="11" font-weight="bold" fill="#1c2127">${b}</text><text x="47" y="73" font-size="11" font-weight="bold" fill="#1c2127">${c}</text><text x="68" y="46" font-size="15" fill="#555">∽</text><path d="M152,14 L112,74 L192,74 Z" fill="none" stroke="#1c2127" stroke-width="1.5"/><text x="145" y="12" font-size="11" font-weight="bold" fill="#1c2127">${d}</text><text x="103" y="85" font-size="11" font-weight="bold" fill="#1c2127">${e}</text><text x="183" y="85" font-size="11" font-weight="bold" fill="#1c2127">${f}</text></svg>`;
    }
    // 合同: 同じ大きさ
    return `<svg width="185" height="80" viewBox="0 0 185 80" style="display:block;margin:0 auto 8px"><path d="M38,14 L8,64 L68,64 Z" fill="none" stroke="#1c2127" stroke-width="1.5"/><text x="31" y="12" font-size="11" font-weight="bold" fill="#1c2127">${a}</text><text x="1" y="75" font-size="11" font-weight="bold" fill="#1c2127">${b}</text><text x="61" y="75" font-size="11" font-weight="bold" fill="#1c2127">${c}</text><text x="82" y="44" font-size="15" fill="#555">≡</text><path d="M138,14 L108,64 L168,64 Z" fill="none" stroke="#1c2127" stroke-width="1.5"/><text x="131" y="12" font-size="11" font-weight="bold" fill="#1c2127">${d}</text><text x="101" y="75" font-size="11" font-weight="bold" fill="#1c2127">${e}</text><text x="161" y="75" font-size="11" font-weight="bold" fill="#1c2127">${f}</text></svg>`;
  }

  /* ---------- 三角形の合同（穴埋め） ---------- */

  function genCongruence() {
    const CONDS = [
      { name: '3組の辺がそれぞれ等しい',               num: '①', c: ['AB=DE', 'BC=EF', 'CA=FD'] },
      { name: '2組の辺とその間の角がそれぞれ等しい',   num: '②', c: ['AB=DE', '∠B=∠E', 'BC=EF'] },
      { name: '1組の辺とその両端の角がそれぞれ等しい', num: '③', c: ['∠A=∠D', 'AB=DE', '∠B=∠E'] },
    ];
    const FAKE = '3組の角がそれぞれ等しい';
    const pat = randInt(0, 3);
    let question, questionHtml, answer, choices, steps;

    if (pat === 0) {
      const idx = randInt(0, 2);
      const cond = CONDS[idx];
      question = `△ABCと△DEFで ${cond.c.join('、')} が成り立つ。使える合同条件は？`;
      answer = cond.name;
      choices = shuffle([...CONDS.map(c => c.name), FAKE]);
      steps = cond.c.map(c => `${c}  ✓`).concat([`→ ${cond.name}`]);
      questionHtml = mkTriSvg(['A','B','C'], ['D','E','F'], '≡') + `<span style="display:block">${question}</span>`;
    } else if (pat === 1) {
      const idx = randInt(0, 2);
      const cond = CONDS[idx];
      const missing = cond.c[2];
      question = `△ABCと△DEFで${cond.c[0]}、${cond.c[1]}が分かっている。「${cond.name}」を使うのにあと1つは？`;
      answer = missing;
      const pool = ['AB=DE', 'BC=EF', 'CA=FD', '∠A=∠D', '∠B=∠E', '∠C=∠F'];
      const wrongs = pool.filter(c => c !== missing && c !== cond.c[0] && c !== cond.c[1]).slice(0, 3);
      choices = shuffle([answer, ...wrongs]);
      steps = [`${cond.name}: ${cond.c.join('、')}`, `既知: ${cond.c[0]}、${cond.c[1]}`, `不足: ${missing}`];
      questionHtml = mkTriSvg(['A','B','C'], ['D','E','F'], '≡') + `<span style="display:block">${question}</span>`;
    } else if (pat === 2) {
      question = `次のうち、かならず合同であるとは言えない場合は？`;
      answer = FAKE;
      choices = shuffle([...CONDS.map(c => c.name), FAKE]);
      steps = [
        '① 3組の辺がそれぞれ等しい → 合同 ✓',
        '② 2組の辺とその間の角がそれぞれ等しい → 合同 ✓',
        '③ 1組の辺とその両端の角がそれぞれ等しい → 合同 ✓',
        '3組の角がそれぞれ等しいだけ → 相似だが合同とは限らない ✗',
      ];
    } else {
      const scenarios = [
        {
          q: '△ABD ≡ △CBD の証明。AB=CB、AD=CDが仮定から分かる。図から分かるのは何か？',
          a: 'BD は共通',
          w: ['∠ABD=∠CBD', 'AB=CD', 'BD=AC'],
          s: ['①AB=CB（仮定）', '②AD=CD（仮定）', '③BD は共通', '①②③より3組の辺がそれぞれ等しいから △ABD≡△CBD'],
          svg: '<svg width="118" height="108" viewBox="0 0 118 108" style="display:block;margin:0 auto 8px"><path d="M55,16 L100,55 L55,94 L10,55 Z" fill="none" stroke="#1c2127" stroke-width="1.5"/><line x1="55" y1="16" x2="55" y2="94" stroke="#1c2127" stroke-width="1.5" stroke-dasharray="5,3"/><text x="49" y="14" font-size="11" font-weight="bold" fill="#1c2127">B</text><text x="103" y="59" font-size="11" font-weight="bold" fill="#1c2127">A</text><text x="49" y="105" font-size="11" font-weight="bold" fill="#1c2127">D</text><text x="1" y="59" font-size="11" font-weight="bold" fill="#1c2127">C</text></svg>',
        },
        {
          q: '△ABC ≡ △DCB の証明。AB=DC、∠ABC=∠DCBが仮定から分かる。図から分かるのは何か？',
          a: 'BC は共通',
          w: ['AC=DB', '∠BAC=∠CDB', 'AB=BC'],
          s: ['①AB=DC（仮定）', '②∠ABC=∠DCB（仮定）', '③BC は共通', '①②③より2組の辺とその間の角がそれぞれ等しいから △ABC≡△DCB'],
          svg: '<svg width="118" height="90" viewBox="0 0 118 90" style="display:block;margin:0 auto 8px"><rect x="8" y="12" width="96" height="64" fill="none" stroke="#1c2127" stroke-width="1.5"/><line x1="8" y1="76" x2="104" y2="12" stroke="#1c2127" stroke-width="1.5"/><text x="1" y="12" font-size="11" font-weight="bold" fill="#1c2127">A</text><text x="1" y="86" font-size="11" font-weight="bold" fill="#1c2127">B</text><text x="106" y="86" font-size="11" font-weight="bold" fill="#1c2127">C</text><text x="106" y="12" font-size="11" font-weight="bold" fill="#1c2127">D</text></svg>',
        },
        {
          q: '△ABM ≡ △DCM の証明。AM=DM、BM=CMが仮定から分かる。図から分かるのは何か？',
          a: '∠AMB=∠DMC（対頂角）',
          w: ['∠ABM=∠DCM', 'AM=CM', 'AB=DC'],
          s: ['①AM=DM（仮定）', '②BM=CM（仮定）', '③∠AMB=∠DMC（対頂角）', '①②③より2組の辺とその間の角がそれぞれ等しいから △ABM≡△DCM'],
          svg: '<svg width="118" height="94" viewBox="0 0 118 94" style="display:block;margin:0 auto 8px"><path d="M12,12 L82,12 L102,80 L32,80 Z" fill="none" stroke="#1c2127" stroke-width="1.5"/><line x1="12" y1="12" x2="102" y2="80" stroke="#1c2127" stroke-width="1.5"/><line x1="82" y1="12" x2="32" y2="80" stroke="#1c2127" stroke-width="1.5"/><circle cx="57" cy="46" r="2.5" fill="#1c2127"/><text x="3" y="11" font-size="11" font-weight="bold" fill="#1c2127">A</text><text x="84" y="11" font-size="11" font-weight="bold" fill="#1c2127">B</text><text x="104" y="91" font-size="11" font-weight="bold" fill="#1c2127">D</text><text x="22" y="91" font-size="11" font-weight="bold" fill="#1c2127">C</text><text x="60" y="43" font-size="10" font-weight="bold" fill="#1c2127">M</text></svg>',
        },
      ];
      const sc = scenarios[randInt(0, 2)];
      question = sc.q; answer = sc.a;
      choices = shuffle([answer, ...sc.w]);
      steps = sc.s;
      questionHtml = sc.svg + `<span style="display:block">${question}</span>`;
    }
    return { category: 'congruence', question, questionHtml, answer, choices, steps };
  }

  /* ---------- 三角形の相似（穴埋め） ---------- */

  function genSimilarity() {
    const COND_NAMES = [
      '3組の辺の比がすべて等しい',
      '2組の辺の比とその間の角がそれぞれ等しい',
      '2組の角がそれぞれ等しい',
    ];
    const pat = randInt(0, 3);
    let question, questionHtml, answer, choices, steps;

    if (pat === 0) {
      const condData = [
        { cs: ['AB:DE=BC:EF=CA:FD'], name: COND_NAMES[0] },
        { cs: ['AB:DE=BC:EF', '∠B=∠E'], name: COND_NAMES[1] },
        { cs: ['∠A=∠D', '∠B=∠E'], name: COND_NAMES[2] },
      ];
      const cd = condData[randInt(0, 2)];
      question = `△ABCと△DEFで ${cd.cs.join('、')} が成り立つ。相似条件は？`;
      answer = cd.name;
      choices = shuffle([...COND_NAMES, '3組の辺がそれぞれ等しい（合同条件）']);
      steps = cd.cs.map(c => `${c}  ✓`).concat([`→ ${cd.name}`]);
      questionHtml = mkTriSvg(['A','B','C'], ['D','E','F'], '∽') + `<span style="display:block">${question}</span>`;
    } else if (pat === 1) {
      const angles = ['∠A=∠D', '∠B=∠E', '∠C=∠F'];
      const ki = randInt(0, 2);
      const known = angles[ki];
      const rest = angles.filter((_, i) => i !== ki);
      const missing = rest[randInt(0, 1)];
      const other = rest.find(a => a !== missing);
      question = `△ABCと△DEFで${known}が分かっている。2組の角がそれぞれ等しいことを示すのにあと1つは？`;
      answer = missing;
      choices = shuffle([missing, other, 'AB:DE=BC:EF', 'AB=DE']);
      steps = [`2組の角がそれぞれ等しい: 2つの角が必要`, `既知: ${known}`, `不足: ${missing}`];
      questionHtml = mkTriSvg(['A','B','C'], ['D','E','F'], '∽') + `<span style="display:block">${question}</span>`;
    } else if (pat === 2) {
      const k = randInt(2, 4);
      const a = randInt(2, 5), b = randInt(2, 5), c = randInt(2, 5);
      question = `△ABCの3辺が ${a}, ${b}, ${c}、△DEFの3辺が ${a * k}, ${b * k}, ${c * k}。相似条件は？`;
      answer = '3組の辺の比がすべて等しい';
      choices = shuffle([answer, '2組の辺の比とその間の角がそれぞれ等しい', '2組の角がそれぞれ等しい', '3組の辺がそれぞれ等しい（合同）']);
      steps = [
        `${a}:${a * k} = ${b}:${b * k} = ${c}:${c * k} = 1:${k}`,
        `3組の辺の比がすべて等しい`,
      ];
      questionHtml = mkTriSvg(['A','B','C'], ['D','E','F'], '∽') + `<span style="display:block">${question}</span>`;
    } else {
      const scenarios = [
        {
          q: '△ABC ∽ △ACD の証明。∠Aは共通①。②に入るものは？',
          a: '∠ABC=∠ACD（仮定）',
          w: ['∠ACB=∠ADC', '∠BAC=∠CAD', 'AB:AC=AC:AD'],
          s: ['①∠Aは共通', '②∠ABC=∠ACD（仮定）', '①②より2組の角がそれぞれ等しいから △ABC∽△ACD'],
          svg: '<svg width="124" height="96" viewBox="0 0 124 96" style="display:block;margin:0 auto 8px"><path d="M46,12 L5,84 L82,84 Z" fill="none" stroke="#1c2127" stroke-width="1.5"/><path d="M46,12 L82,84 L108,44 Z" fill="none" stroke="#888" stroke-width="1.5"/><text x="39" y="10" font-size="11" font-weight="bold" fill="#1c2127">A</text><text x="0" y="93" font-size="11" font-weight="bold" fill="#1c2127">B</text><text x="78" y="93" font-size="11" font-weight="bold" fill="#1c2127">C</text><text x="110" y="47" font-size="11" font-weight="bold" fill="#1c2127">D</text></svg>',
        },
        {
          q: '△ABC ∽ △AED の証明。BC∥DEより∠ABC=∠AED①。②に入るものは？',
          a: '∠Aは共通',
          w: ['∠BCA=∠EDA', 'AB:AE=BC:DE', 'AB=AE'],
          s: ['①∠ABC=∠AED（BC∥DE、同位角）', '②∠Aは共通', '①②より2組の角がそれぞれ等しいから △ABC∽△AED'],
          svg: '<svg width="130" height="98" viewBox="0 0 130 98" style="display:block;margin:0 auto 8px"><path d="M60,14 L5,86 L115,86 Z" fill="none" stroke="#1c2127" stroke-width="1.5"/><line x1="34" y1="48" x2="86" y2="48" stroke="#888" stroke-width="1.5"/><text x="54" y="12" font-size="11" font-weight="bold" fill="#1c2127">A</text><text x="0" y="96" font-size="11" font-weight="bold" fill="#1c2127">B</text><text x="107" y="96" font-size="11" font-weight="bold" fill="#1c2127">C</text><text x="22" y="48" font-size="11" font-weight="bold" fill="#1c2127">E</text><text x="88" y="48" font-size="11" font-weight="bold" fill="#1c2127">D</text></svg>',
        },
        {
          q: '△ABC ∽ △ADE の証明。AB:AD=AC:AE①。②に入るものは？',
          a: '∠Aは共通（2辺の間の角）',
          w: ['∠B=∠D', '∠C=∠E', 'BC:DE=AB:AD'],
          s: ['①AB:AD=AC:AE（2辺の比が等しい）', '②∠Aは共通（2辺の間の角）', '①②より2組の辺の比とその間の角がそれぞれ等しいから △ABC∽△ADE'],
          svg: '<svg width="130" height="98" viewBox="0 0 130 98" style="display:block;margin:0 auto 8px"><path d="M60,14 L5,86 L115,86 Z" fill="none" stroke="#1c2127" stroke-width="1.5"/><line x1="34" y1="48" x2="86" y2="48" stroke="#888" stroke-width="1.5"/><text x="54" y="12" font-size="11" font-weight="bold" fill="#1c2127">A</text><text x="0" y="96" font-size="11" font-weight="bold" fill="#1c2127">B</text><text x="107" y="96" font-size="11" font-weight="bold" fill="#1c2127">C</text><text x="22" y="48" font-size="11" font-weight="bold" fill="#1c2127">D</text><text x="88" y="48" font-size="11" font-weight="bold" fill="#1c2127">E</text></svg>',
        },
      ];
      const sc = scenarios[randInt(0, 2)];
      question = sc.q; answer = sc.a;
      choices = shuffle([answer, ...sc.w]);
      steps = sc.s;
      questionHtml = sc.svg + `<span style="display:block">${question}</span>`;
    }
    return { category: 'similarity', question, questionHtml, answer, choices, steps };
  }

  /* ---------- 文字式ヘルパー ---------- */

  function fmtMono(c, v) {
    if (c === 1) return v;
    if (c === -1) return `−${v}`;
    if (c < 0) return `−${Math.abs(c)}${v}`;
    return `${c}${v}`;
  }

  function fmtPoly(xc, v, cn) {
    if (xc === 0 && cn === 0) return '0';
    let s = xc !== 0 ? fmtMono(xc, v) : '';
    if (cn !== 0) {
      if (!s) s = cn < 0 ? `−${Math.abs(cn)}` : `${cn}`;
      else s += cn < 0 ? ` − ${Math.abs(cn)}` : ` + ${cn}`;
    }
    return s;
  }

  function monoChoices(c, v) {
    const correct = fmtMono(c, v);
    const seen = new Set([correct]);
    const out = [correct];
    for (const nc of [-c, c + 1, c - 1, c + 2, c - 2, c + 3]) {
      if (nc !== 0) {
        const cand = fmtMono(nc, v);
        if (!seen.has(cand)) { seen.add(cand); out.push(cand); }
      }
      if (out.length >= 4) break;
    }
    return shuffle(out);
  }

  function polyChoices(xc, v, cn) {
    const correct = fmtPoly(xc, v, cn);
    const seen = new Set([correct]);
    const out = [correct];
    for (const cand of [
      fmtPoly(-xc, v, cn), fmtPoly(xc, v, -cn),
      fmtPoly(xc + 1, v, cn), fmtPoly(xc - 1, v, cn),
      fmtPoly(xc, v, cn + 1), fmtPoly(xc, v, cn - 1),
    ]) {
      if (cand && !seen.has(cand)) { seen.add(cand); out.push(cand); }
      if (out.length >= 4) break;
    }
    return shuffle(out);
  }

  /* ---------- 1次式と数の乗法・除法（中1） ---------- */

  function genLinearMul() {
    const pat = randInt(0, 2);
    const v = ['a', 'x', 'n', 'm'][randInt(0, 3)];
    let question, answer, choices, steps;

    if (pat === 0) {
      const a = randNonZero(-8, 8), k = randNonZero(-6, 6);
      const ans = a * k;
      question = `${fmtMono(a, v)} × ${fmtNum(k)} = ?`;
      answer = fmtMono(ans, v);
      choices = monoChoices(ans, v);
      steps = [`係数どうしをかける: ${a} × ${fmtNum(k)} = ${ans}`, `= ${answer}`];
    } else if (pat === 1) {
      const kabs = [2, 3, 4, 6, 8][randInt(0, 4)];
      const k = kabs * (Math.random() < 0.5 ? 1 : -1);
      const q = randNonZero(-8, 8);
      const a = kabs * q;
      const ans = a / k;
      question = `${fmtMono(a, v)} ÷ ${fmtNum(k)} = ?`;
      answer = fmtMono(ans, v);
      choices = monoChoices(ans, v);
      steps = [`係数を割る: ${a} ÷ ${fmtNum(k)} = ${ans}`, `= ${answer}`];
    } else {
      const cs = [
        {a:6,num:2,den:3,neg:false,ans:9},{a:-6,num:2,den:3,neg:false,ans:-9},
        {a:18,num:2,den:3,neg:false,ans:27},{a:18,num:2,den:3,neg:true,ans:-27},
        {a:-18,num:2,den:3,neg:true,ans:27},{a:10,num:2,den:5,neg:false,ans:25},
        {a:9,num:3,den:2,neg:false,ans:6},{a:-9,num:3,den:2,neg:false,ans:-6},
        {a:12,num:3,den:4,neg:false,ans:16},{a:8,num:4,den:3,neg:false,ans:6},
      ];
      const c = cs[randInt(0, cs.length - 1)];
      const fracStr = `(${c.neg ? '−' : ''}${c.num}/${c.den})`;
      question = `${fmtMono(c.a, v)} ÷ ${fracStr} = ?`;
      const fracHtml = `<span class="frac"><span class="num">${c.neg ? '−' : ''}${c.num}</span><span class="den">${c.den}</span></span>`;
      const questionHtml = `${escHtml(fmtMono(c.a, v))} ÷ ${fracHtml} = ?`;
      answer = fmtMono(c.ans, v);
      choices = monoChoices(c.ans, v);
      steps = [
        `割り算 → 逆数をかける`,
        `${c.a} × ${c.neg ? '−' : ''}${c.den}/${c.num} = ${c.ans}`,
        `= ${answer}`,
      ];
      return { category: 'linearMul', question, questionHtml, answer, choices, steps };
    }
    return { category: 'linearMul', question, answer, choices, steps };
  }

  /* ---------- 多項式と数の乗法・除法（中1） ---------- */

  function genPolyMul() {
    const pat = randInt(0, 3);
    const v = ['a', 'x', 'n', 'm'][randInt(0, 3)];
    let question, answer, choices, steps;

    if (pat === 0) {
      // k(ax+b) 正のk
      const k = randInt(2, 8);
      const a = randNonZero(-6, 6), b = randNonZero(-9, 9);
      const rx = a * k, rc = b * k;
      question = `${k}(${fmtPoly(a, v, b)}) = ?`;
      answer = fmtPoly(rx, v, rc);
      choices = polyChoices(rx, v, rc);
      steps = [`分配則: k(a${v}+b) = ka${v} + kb`, `${k} × (${fmtPoly(a,v,b)}) = ${answer}`];
    } else if (pat === 1) {
      // (ax+b) × 負のk
      const k = -randInt(2, 8);
      const a = randNonZero(-6, 6), b = randNonZero(-9, 9);
      const rx = a * k, rc = b * k;
      question = `(${fmtPoly(a, v, b)}) × (${k}) = ?`;
      answer = fmtPoly(rx, v, rc);
      choices = polyChoices(rx, v, rc);
      steps = [`各項に${k}をかける`, `${a}${v} × (${k}) = ${a*k}${v}、${b} × (${k}) = ${b*k}`, `= ${answer}`];
    } else if (pat === 2) {
      // (ax+b) ÷ k 正のk、aとbともkの倍数
      const k = [2, 3, 4][randInt(0, 2)];
      const a = randNonZero(-6, 6) * k, b = randNonZero(-6, 6) * k;
      const rx = a / k, rc = b / k;
      question = `(${fmtPoly(a, v, b)}) ÷ ${k} = ?`;
      answer = fmtPoly(rx, v, rc);
      choices = polyChoices(rx, v, rc);
      steps = [`各項を${k}で割る`, `${a}${v} ÷ ${k} = ${rx}${v}、${b} ÷ ${k} = ${rc}`, `= ${answer}`];
    } else {
      // (ax+b) ÷ 負のk
      const kabs = [2, 3, 4][randInt(0, 2)];
      const a = randNonZero(-6, 6) * kabs, b = randNonZero(-6, 6) * kabs;
      const rx = a / -kabs, rc = b / -kabs;
      question = `(${fmtPoly(a, v, b)}) ÷ (${-kabs}) = ?`;
      answer = fmtPoly(rx, v, rc);
      choices = polyChoices(rx, v, rc);
      steps = [`各項を${-kabs}で割る`, `${a}${v} ÷ (${-kabs}) = ${rx}${v}、${b} ÷ (${-kabs}) = ${rc}`, `= ${answer}`];
    }
    return { category: 'polyMul', question, answer, choices, steps };
  }

  /* ---------- 1次式の加法と減法（中1） ---------- */

  function genLinearAddSub() {
    const pat = randInt(0, 1);
    const v = ['a', 'x', 'n', 'm'][randInt(0, 3)];
    const a = randNonZero(-5, 5), b = randNonZero(-9, 9);
    const c = randNonZero(-5, 5), d = randNonZero(-9, 9);
    let question, answer, choices, steps;

    if (pat === 0) {
      const rx = a + c, rc = b + d;
      question = `(${fmtPoly(a, v, b)}) + (${fmtPoly(c, v, d)}) = ?`;
      answer = fmtPoly(rx, v, rc);
      choices = polyChoices(rx, v, rc);
      steps = [
        `文字の項: ${fmtMono(a,v)} + ${fmtMono(c,v)} = ${fmtMono(rx,v)}`,
        `数の項: ${b} + (${d}) = ${rc}`,
        `= ${answer}`,
      ];
    } else {
      const rx = a - c, rc = b - d;
      question = `(${fmtPoly(a, v, b)}) − (${fmtPoly(c, v, d)}) = ?`;
      answer = fmtPoly(rx, v, rc);
      choices = polyChoices(rx, v, rc);
      steps = [
        `符号を変えて加える: − (${fmtPoly(c, v, d)}) = ${fmtPoly(-c, v, -d)}`,
        `文字の項: ${fmtMono(a,v)} + ${fmtMono(-c,v)} = ${fmtMono(rx,v)}`,
        `数の項: ${b} + (${-d}) = ${rc}`,
        `= ${answer}`,
      ];
    }
    return { category: 'linearAddSub', question, answer, choices, steps };
  }

  /* ---------- π選択肢ヘルパー ---------- */

  function piCh(n) {
    const s = new Set([n]);
    const out = [n];
    for (const d of [n+1, n-1, n*2, n+2, n-2, n+3, n+4]) {
      if (d > 0 && !s.has(d)) { s.add(d); out.push(d); }
      if (out.length === 4) break;
    }
    return shuffle(out).map(v => `${v}π`);
  }

  function gcdFn(a, b) { return b === 0 ? a : gcdFn(b, a % b); }
  function frac(n, d) { const g = gcdFn(n, d); return `${n/g}/${d/g}`; }

  /* ---------- 平面図形（中1） ---------- */

  function genPlaneFigure() {
    const pat = randInt(0, 6);
    let question, questionHtml, answer, choices, steps;
    if (pat === 0) {
      const r = randInt(2, 8);
      question = `半径 ${r} cm の円の面積は？（π を含む式で）`;
      answer = `${r*r}π`;
      choices = piCh(r*r);
      steps = [`面積 = πr² = π × ${r}² = ${r*r}π cm²`];
      questionHtml = `<svg width="112" height="100" viewBox="0 0 112 100" style="display:block;margin:0 auto 8px"><circle cx="56" cy="50" r="40" fill="none" stroke="#1c2127" stroke-width="1.5"/><line x1="56" y1="50" x2="96" y2="50" stroke="#1c2127" stroke-width="1.2" stroke-dasharray="4,2"/><text x="76" y="46" font-size="12" fill="#1c2127" text-anchor="middle">${r}</text></svg><span style="display:block">${question}</span>`;
    } else if (pat === 1) {
      const r = randInt(2, 8);
      question = `半径 ${r} cm の円の周の長さは？（π を含む式で）`;
      answer = `${2*r}π`;
      choices = piCh(2*r);
      steps = [`円周 = 2πr = 2 × π × ${r} = ${2*r}π cm`];
      questionHtml = `<svg width="112" height="100" viewBox="0 0 112 100" style="display:block;margin:0 auto 8px"><circle cx="56" cy="50" r="40" fill="none" stroke="#c23b2e" stroke-width="2.5"/><line x1="56" y1="50" x2="96" y2="50" stroke="#1c2127" stroke-width="1.2" stroke-dasharray="4,2"/><text x="76" y="46" font-size="12" fill="#1c2127" text-anchor="middle">${r}</text></svg><span style="display:block">${question}</span>`;
    } else if (pat === 2) {
      const scs = [{r:3,deg:120,v:2},{r:6,deg:60,v:2},{r:6,deg:90,v:3},{r:6,deg:120,v:4},{r:4,deg:90,v:2},{r:4,deg:180,v:4},{r:6,deg:180,v:6},{r:9,deg:40,v:2}];
      const sc = scs[randInt(0, scs.length-1)];
      question = `半径 ${sc.r} cm、中心角 ${sc.deg}° の扇形の弧の長さは？`;
      answer = `${sc.v}π`;
      choices = piCh(sc.v);
      steps = [`弧の長さ = 2πr × θ/360 = 2π × ${sc.r} × ${sc.deg}/360 = ${sc.v}π cm`];
      const ea = -Math.PI/2 + sc.deg*Math.PI/180, x2 = (56+40*Math.cos(ea)).toFixed(1), y2 = (50+40*Math.sin(ea)).toFixed(1), la = sc.deg > 180 ? 1 : 0;
      questionHtml = `<svg width="112" height="108" viewBox="0 0 112 108" style="display:block;margin:0 auto 8px"><path d="M56,50 L56,10 A40,40,0,${la},1,${x2},${y2} Z" fill="#e8f4f8" stroke="#1c2127" stroke-width="1.5"/><text x="56" y="66" font-size="11" fill="#555" text-anchor="middle">${sc.deg}°</text></svg><span style="display:block">${question}</span>`;
    } else if (pat === 3) {
      const scs = [{r:3,deg:120,v:3},{r:6,deg:60,v:6},{r:6,deg:90,v:9},{r:6,deg:120,v:12},{r:4,deg:90,v:4},{r:4,deg:180,v:8},{r:6,deg:180,v:18},{r:9,deg:40,v:9}];
      const sc = scs[randInt(0, scs.length-1)];
      question = `半径 ${sc.r} cm、中心角 ${sc.deg}° の扇形の面積は？`;
      answer = `${sc.v}π`;
      choices = piCh(sc.v);
      steps = [`扇形の面積 = πr² × θ/360 = π × ${sc.r}² × ${sc.deg}/360 = ${sc.v}π cm²`];
      const ea = -Math.PI/2 + sc.deg*Math.PI/180, x2 = (56+40*Math.cos(ea)).toFixed(1), y2 = (50+40*Math.sin(ea)).toFixed(1), la = sc.deg > 180 ? 1 : 0;
      questionHtml = `<svg width="112" height="108" viewBox="0 0 112 108" style="display:block;margin:0 auto 8px"><path d="M56,50 L56,10 A40,40,0,${la},1,${x2},${y2} Z" fill="#e8f4f8" stroke="#1c2127" stroke-width="1.5"/><text x="56" y="66" font-size="11" fill="#555" text-anchor="middle">${sc.deg}°</text></svg><span style="display:block">${question}</span>`;
    } else if (pat === 4) {
      const b = randInt(2, 8)*2, h = randInt(2, 10);
      const a = b*h/2;
      question = `底辺 ${b} cm、高さ ${h} cm の三角形の面積は？`;
      answer = a;
      choices = buildChoices(a, [b*h, a+b, Math.max(1, a-h)]);
      steps = [`三角形の面積 = 底辺 × 高さ ÷ 2 = ${b} × ${h} ÷ 2 = ${a} cm²`];
    } else if (pat === 5) {
      const b = randInt(3, 12), h = randInt(3, 12);
      const a = b*h;
      question = `底辺 ${b} cm、高さ ${h} cm の平行四辺形の面積は？`;
      answer = a;
      choices = buildChoices(a, [a/2, a+b, Math.max(1, a-h)]);
      steps = [`平行四辺形の面積 = 底辺 × 高さ = ${b} × ${h} = ${a} cm²`];
    } else {
      const a = randInt(2, 8), b = randInt(2, 8), h = randInt(1, 6)*2;
      const ans = (a+b)*h/2;
      question = `上底 ${a} cm、下底 ${b} cm、高さ ${h} cm の台形の面積は？`;
      answer = ans;
      choices = buildChoices(ans, [(a+b)*h, ans+h, Math.max(1, ans-a)]);
      steps = [`台形の面積 = (上底+下底) × 高さ ÷ 2 = (${a}+${b}) × ${h} ÷ 2 = ${ans} cm²`];
    }
    return { category: 'planeFigure', question, questionHtml, answer, choices, steps };
  }

  /* ---------- 空間図形（中1） ---------- */

  function genSolidFigure() {
    const pat = randInt(0, 5);
    let question, answer, choices, steps;
    if (pat === 0) {
      const l = randInt(2, 8), w = randInt(2, 8), h = randInt(2, 8);
      const v = l*w*h;
      question = `縦 ${l} cm、横 ${w} cm、高さ ${h} cm の直方体の体積は？`;
      answer = v;
      choices = buildChoices(v, [l*w+h, v+l*w, v-w*h]);
      steps = [`体積 = 縦 × 横 × 高さ = ${l} × ${w} × ${h} = ${v} cm³`];
    } else if (pat === 1) {
      const l = randInt(2, 7), w = randInt(2, 7), h = randInt(2, 7);
      const s = 2*(l*w + w*h + l*h);
      question = `縦 ${l} cm、横 ${w} cm、高さ ${h} cm の直方体の表面積は？`;
      answer = s;
      choices = buildChoices(s, [l*w*h, s+l*2, s-w*2]);
      steps = [`表面積 = 2(縦×横+横×高さ+縦×高さ) = 2(${l*w}+${w*h}+${l*h}) = ${s} cm²`];
    } else if (pat === 2) {
      const cs = [{r:2,h:3,v:12},{r:3,h:4,v:36},{r:2,h:5,v:20},{r:3,h:5,v:45},{r:4,h:3,v:48},{r:2,h:7,v:28},{r:5,h:2,v:50},{r:3,h:3,v:27}];
      const c = cs[randInt(0, cs.length-1)];
      question = `底面の半径 ${c.r} cm、高さ ${c.h} cm の円柱の体積は？`;
      answer = `${c.v}π`;
      choices = piCh(c.v);
      steps = [`体積 = πr²h = π × ${c.r}² × ${c.h} = ${c.v}π cm³`];
    } else if (pat === 3) {
      const cs = [{r:3,h:4,v:12},{r:3,h:7,v:21},{r:3,h:1,v:3},{r:6,h:2,v:24},{r:6,h:5,v:60}];
      const c = cs[randInt(0, cs.length-1)];
      question = `底面の半径 ${c.r} cm、高さ ${c.h} cm の円錐の体積は？`;
      answer = `${c.v}π`;
      choices = piCh(c.v);
      steps = [`体積 = (1/3)πr²h = (1/3) × π × ${c.r}² × ${c.h} = ${c.v}π cm³`];
    } else if (pat === 4) {
      const cs = [{r:3,v:36},{r:6,v:288}];
      const c = cs[randInt(0, cs.length-1)];
      question = `半径 ${c.r} cm の球の体積は？`;
      answer = `${c.v}π`;
      choices = piCh(c.v);
      steps = [`体積 = (4/3)πr³ = (4/3) × π × ${c.r}³ = ${c.v}π cm³`];
    } else {
      const a = randInt(2, 6)*2, b = randInt(2, 8), h = randInt(3, 9);
      const base = a*b/2, v = base*h;
      question = `底面が直角三角形（底辺 ${a} cm・高さ ${b} cm）で高さ ${h} cm の三角柱の体積は？`;
      answer = v;
      choices = buildChoices(v, [a*b*h, v+b, v-a]);
      steps = [`底面積 = ${a}×${b}÷2 = ${base} cm²`, `体積 = ${base} × ${h} = ${v} cm³`];
    }
    return { category: 'solidFigure', question, answer, choices, steps };
  }

  /* ---------- 確率（中2） ---------- */

  function genProbability() {
    const pat = randInt(0, 5);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = `1個のさいころを投げるとき、3の目が出る確率は？`;
      answer = '1/6';
      choices = shuffle(['1/6', '1/3', '1/2', '1/4']);
      steps = [`全体 = 6通り、3の目は1通り`, `確率 = 1/6`];
    } else if (pat === 1) {
      const even = Math.random() < 0.5;
      question = `1個のさいころを投げるとき、${even ? '偶数' : '奇数'}の目が出る確率は？`;
      answer = '1/2';
      choices = shuffle(['1/2', '1/3', '2/3', '1/6']);
      steps = [`${even ? '偶数: 2,4,6' : '奇数: 1,3,5'} → 3通り`, `確率 = 3/6 = 1/2`];
    } else if (pat === 2) {
      const n = randInt(2, 4);
      const fr = frac(n, 6);
      question = `1個のさいころを投げるとき、${n} 以下の目が出る確率は？`;
      answer = fr;
      const pool = ['1/6', '1/3', '1/2', '2/3', '5/6', '1/4'].filter(f => f !== fr);
      choices = shuffle([fr, pool[0], pool[1], pool[2]]);
      steps = [`1以上${n}以下 → ${n}通り / 全体6通り = ${n}/6 = ${fr}`];
    } else if (pat === 3) {
      question = `コインを2枚同時に投げるとき、2枚とも表が出る確率は？`;
      answer = '1/4';
      choices = shuffle(['1/4', '1/2', '1/3', '3/4']);
      steps = [`全体: {表表,表裏,裏表,裏裏} = 4通り`, `2枚とも表 → 1通り`, `確率 = 1/4`];
    } else if (pat === 4) {
      question = `2個のさいころを同時に投げるとき、目の和が 7 になる確率は？`;
      answer = '1/6';
      choices = shuffle(['1/6', '1/12', '1/9', '7/36']);
      steps = [`全体 = 36通り`, `和が7: (1,6)(2,5)(3,4)(4,3)(5,2)(6,1) → 6通り`, `確率 = 6/36 = 1/6`];
    } else {
      const combos = [{N:4,k:2,cnt:2,fr:'1/2'},{N:5,k:2,cnt:2,fr:'2/5'},{N:6,k:3,cnt:2,fr:'1/3'},{N:8,k:4,cnt:2,fr:'1/4'},{N:9,k:3,cnt:3,fr:'1/3'},{N:10,k:5,cnt:2,fr:'1/5'}];
      const c = combos[randInt(0, combos.length-1)];
      question = `1から ${c.N} のカードから1枚引くとき、${c.k} の倍数が出る確率は？`;
      answer = c.fr;
      const pool = ['1/6', '1/2', '2/3', '3/4', '3/5', '2/5'].filter(f => f !== c.fr);
      choices = shuffle([c.fr, pool[0], pool[1], pool[2]]);
      steps = [`全体 = ${c.N}通り、${c.k}の倍数 → ${c.cnt}通り`, `確率 = ${c.cnt}/${c.N} = ${c.fr}`];
    }
    return { category: 'probability', question, answer, choices, steps };
  }

  /* ---------- 円周角（中3） ---------- */

  function genCircleAngle() {
    const pat = randInt(0, 3);
    let question, questionHtml, answer, choices, steps;
    const circSvg = `<svg width="100" height="100" viewBox="0 0 100 100" style="display:block;margin:0 auto 8px"><circle cx="50" cy="50" r="40" fill="none" stroke="#1c2127" stroke-width="1.5"/><circle cx="50" cy="10" r="2.5" fill="#1c2127"/><circle cx="18" cy="72" r="2.5" fill="#1c2127"/><circle cx="82" cy="72" r="2.5" fill="#1c2127"/><line x1="18" y1="72" x2="50" y2="10" stroke="#1c2127" stroke-width="1.2"/><line x1="82" y1="72" x2="50" y2="10" stroke="#1c2127" stroke-width="1.2"/><line x1="18" y1="72" x2="82" y2="72" stroke="#888" stroke-width="1" stroke-dasharray="3,2"/></svg>`;
    if (pat === 0) {
      const ins = randInt(2, 7)*10;
      const cen = 2*ins;
      if (Math.random() < 0.5) {
        question = `中心角が ${cen}° のとき、同じ弧に対する円周角 x は？`;
        answer = ins;
        choices = buildChoices(ins, [cen, ins*2, ins+10]);
        steps = [`円周角 = 中心角 ÷ 2 = ${cen} ÷ 2 = ${ins}°`];
      } else {
        question = `円周角が ${ins}° のとき、同じ弧に対する中心角 x は？`;
        answer = cen;
        choices = buildChoices(cen, [ins, ins/2, cen+10]);
        steps = [`中心角 = 円周角 × 2 = ${ins} × 2 = ${cen}°`];
      }
    } else if (pat === 1) {
      const a = randInt(2, 7)*10;
      question = `同じ弧に対する円周角はすべて等しい。円周角 A が ${a}° のとき、同じ弧に対する円周角 B は？`;
      answer = a;
      choices = buildChoices(a, [2*a, a/2, a+15]);
      steps = [`同じ弧に対する円周角は等しい`, `円周角 B = ${a}°`];
      const svgSameArc = `<svg width="100" height="100" viewBox="0 0 100 100" style="display:block;margin:0 auto 8px"><circle cx="50" cy="50" r="40" fill="none" stroke="#1c2127" stroke-width="1.5"/><circle cx="18" cy="72" r="2.5" fill="#1c2127"/><circle cx="82" cy="72" r="2.5" fill="#1c2127"/><circle cx="50" cy="10" r="2.5" fill="#1c2127"/><circle cx="85" cy="35" r="2.5" fill="#1c2127"/><line x1="18" y1="72" x2="82" y2="72" stroke="#888" stroke-width="1" stroke-dasharray="3,2"/><line x1="18" y1="72" x2="50" y2="10" stroke="#1c2127" stroke-width="1.2"/><line x1="82" y1="72" x2="50" y2="10" stroke="#1c2127" stroke-width="1.2"/><line x1="18" y1="72" x2="85" y2="35" stroke="#1c2127" stroke-width="1.2"/><line x1="82" y1="72" x2="85" y2="35" stroke="#1c2127" stroke-width="1.2"/><text x="50" y="7" font-size="10" fill="#1c2127" text-anchor="middle">A</text><text x="90" y="33" font-size="10" fill="#1c2127" text-anchor="start">B</text></svg>`;
      questionHtml = svgSameArc + `<span style="display:block">${question}</span>`;
    } else if (pat === 2) {
      const base = randInt(2, 6)*10;
      const x = 90 - base;
      question = `AB が直径。∠CAB = ${base}° のとき、∠ABC の大きさ x は？（∠ACB = 90°）`;
      answer = x;
      choices = buildChoices(x, [90, base, 180-base]);
      steps = [`∠ACB = 90°（半円の弧に対する円周角）`, `∠ABC = 180 − 90 − ${base} = ${x}°`];
      const svgDiameter = `<svg width="100" height="100" viewBox="0 0 100 100" style="display:block;margin:0 auto 8px"><circle cx="50" cy="50" r="40" fill="none" stroke="#1c2127" stroke-width="1.5"/><line x1="10" y1="50" x2="90" y2="50" stroke="#888" stroke-width="1.2" stroke-dasharray="3,2"/><circle cx="10" cy="50" r="2.5" fill="#1c2127"/><circle cx="90" cy="50" r="2.5" fill="#1c2127"/><circle cx="72" cy="18" r="2.5" fill="#1c2127"/><line x1="10" y1="50" x2="72" y2="18" stroke="#1c2127" stroke-width="1.2"/><line x1="90" y1="50" x2="72" y2="18" stroke="#1c2127" stroke-width="1.2"/><text x="4" y="47" font-size="10" fill="#1c2127" text-anchor="end">A</text><text x="95" y="47" font-size="10" fill="#1c2127" text-anchor="start">B</text><text x="72" y="12" font-size="10" fill="#1c2127" text-anchor="middle">C</text></svg>`;
      questionHtml = svgDiameter + `<span style="display:block">${question}</span>`;
    } else if (pat === 3) {
      // OA=OB=半径 → 二等辺三角形 → 中心角 → 円周角
      const cases4 = [
        {a:20,cen:140,ins:70,wrongs:[20,80,90]},
        {a:25,cen:130,ins:65,wrongs:[25,75,55]},
        {a:30,cen:120,ins:60,wrongs:[30,70,50]},
        {a:35,cen:110,ins:55,wrongs:[35,65,45]},
        {a:40,cen:100,ins:50,wrongs:[40,60,35]},
      ];
      const c4 = cases4[randInt(0, 4)];
      const svg4 = `<svg width="100" height="100" viewBox="0 0 100 100" style="display:block;margin:0 auto 8px"><circle cx="50" cy="50" r="40" fill="none" stroke="#1c2127" stroke-width="1.5"/><circle cx="50" cy="50" r="2.5" fill="#1c2127"/><circle cx="50" cy="10" r="2.5" fill="#1c2127"/><circle cx="82" cy="72" r="2.5" fill="#1c2127"/><circle cx="18" cy="72" r="2.5" fill="#1c2127"/><line x1="50" y1="50" x2="50" y2="10" stroke="#888" stroke-width="1.2" stroke-dasharray="3,2"/><line x1="50" y1="50" x2="82" y2="72" stroke="#888" stroke-width="1.2" stroke-dasharray="3,2"/><line x1="50" y1="10" x2="82" y2="72" stroke="#1c2127" stroke-width="1.5"/><line x1="18" y1="72" x2="50" y2="10" stroke="#1c2127" stroke-width="1.2"/><line x1="18" y1="72" x2="82" y2="72" stroke="#1c2127" stroke-width="1.2"/><text x="50" y="47" font-size="10" fill="#888" text-anchor="middle">O</text><text x="50" y="7" font-size="10" fill="#1c2127" text-anchor="middle">A</text><text x="87" y="77" font-size="10" fill="#1c2127">B</text><text x="10" y="77" font-size="10" fill="#1c2127">C</text></svg>`;
      question = `OA = OB = 半径。∠OAB = ${c4.a}° のとき、円周角 ∠ACB = x は？`;
      answer = c4.ins;
      choices = buildChoices(c4.ins, c4.wrongs);
      steps = [`OA = OB（半径）より △OAB は二等辺三角形`, `∠OBA = ${c4.a}°`, `∠AOB = 180 − ${c4.a} × 2 = ${c4.cen}°`, `∠ACB = ${c4.cen} ÷ 2 = ${c4.ins}°`];
      questionHtml = svg4 + `<span style="display:block">${question}</span>`;
    }
    if (!questionHtml) questionHtml = circSvg + `<span style="display:block">${question}</span>`;
    return { category: 'circleAngle', question, questionHtml, answer, choices, steps };
  }

  /* ---------- 三平方の定理（中3） ---------- */

  function genPythagoras() {
    const pat = randInt(0, 3);
    let question, questionHtml, answer, choices, steps;
    function triSvg(bot, left, hyp, xpos) {
      const bc = xpos==='bot'?'#c23b2e':'#1c2127', lc = xpos==='left'?'#c23b2e':'#1c2127', hc = xpos==='hyp'?'#c23b2e':'#1c2127';
      return `<svg width="108" height="100" viewBox="0 0 108 100" style="display:block;margin:0 auto 8px"><path d="M14,86 L94,86 L14,14 Z" fill="none" stroke="#1c2127" stroke-width="1.5"/><path d="M14,76 L24,76 L24,86" fill="none" stroke="#1c2127" stroke-width="1.2"/><text x="54" y="96" font-size="12" fill="${bc}" text-anchor="middle">${bot}</text><text x="6" y="52" font-size="12" fill="${lc}" text-anchor="middle">${left}</text><text x="63" y="42" font-size="12" fill="${hc}" text-anchor="middle">${hyp}</text></svg>`;
    }
    if (pat === 0) {
      const ts = [[3,4,5],[5,12,13],[8,15,17],[6,8,10],[9,12,15]];
      const [a,b,c] = ts[randInt(0, ts.length-1)];
      question = `直角三角形の2辺が ${a} cm と ${b} cm。斜辺 x は？`;
      answer = c;
      choices = buildChoices(c, [a+b, c+1, c-1]);
      steps = [`x² = ${a}² + ${b}² = ${a*a+b*b}`, `x = ${c} cm`];
      questionHtml = triSvg(`${a}`, `${b}`, 'x', 'hyp') + `<span style="display:block">${question}</span>`;
    } else if (pat === 1) {
      const ts = [[3,4,5],[5,12,13],[6,8,10],[9,12,15]];
      const [a,b,c] = ts[randInt(0, ts.length-1)];
      if (Math.random() < 0.5) {
        question = `斜辺 ${c} cm、1辺 ${b} cm の直角三角形。残りの辺 x は？`;
        answer = a;
        choices = buildChoices(a, [c-b, c+b, a+1]);
        steps = [`x² = ${c}² − ${b}² = ${c*c-b*b}`, `x = ${a} cm`];
        questionHtml = triSvg(`${b}`, 'x', `${c}`, 'left') + `<span style="display:block">${question}</span>`;
      } else {
        question = `斜辺 ${c} cm、1辺 ${a} cm の直角三角形。残りの辺 x は？`;
        answer = b;
        choices = buildChoices(b, [c-a, c+a, b+1]);
        steps = [`x² = ${c}² − ${a}² = ${c*c-a*a}`, `x = ${b} cm`];
        questionHtml = triSvg('x', `${a}`, `${c}`, 'bot') + `<span style="display:block">${question}</span>`;
      }
    } else if (pat === 2) {
      const a = [2,3,4,5,6][randInt(0, 4)];
      question = `1辺が ${a} cm の正方形の対角線の長さは？`;
      answer = `${a}√2`;
      choices = shuffle([`${a}√2`, `${a+1}√2`, `${a}√3`, `${2*a}`]);
      steps = [`対角線² = ${a}² + ${a}² = ${2*a*a}`, `対角線 = √${2*a*a} = ${a}√2 cm`];
      questionHtml = `<svg width="100" height="100" viewBox="0 0 100 100" style="display:block;margin:0 auto 8px"><path d="M10,10 L90,10 L90,90 L10,90 Z" fill="none" stroke="#1c2127" stroke-width="1.5"/><line x1="10" y1="10" x2="90" y2="90" stroke="#888" stroke-width="1.5" stroke-dasharray="4,2"/><text x="46" y="58" font-size="13" fill="#c23b2e" text-anchor="middle">x</text></svg><span style="display:block">${question}</span>`;
    } else {
      const ts = [[3,4,5],[5,12,13],[6,8,10]];
      const [dx,dy,dist] = ts[randInt(0, ts.length-1)];
      question = `2点 A(0,0)、B(${dx},${dy}) 間の距離は？`;
      answer = dist;
      choices = buildChoices(dist, [dx+dy, dist+1, dist-1]);
      steps = [`距離 = √(${dx}²+${dy}²) = √${dx*dx+dy*dy} = ${dist}`];
    }
    return { category: 'pythagoras', question, questionHtml, answer, choices, steps };
  }

  /* ---------- 敵データ ---------- */

  const ENEMIES = [
    { name: 'マチガール',      emoji: '😤', img: 'images/machigairu.png' },
    { name: 'マチガイオ',      emoji: '👺' },
    { name: 'ケアレスミス',    emoji: '😅' },
    { name: 'ボンミスコ',      emoji: '💥', img: 'images/bonmisuko.png' },
    { name: 'チンカイトウ',    emoji: '❌' },
    { name: 'ウッカリミスコ',  emoji: '😱' },
    { name: 'アキラメタル',    emoji: '🤘' },
    { name: 'ゴーマジンガー',  emoji: '🤖' },
    { name: 'キラキラアキラ',  emoji: '⭐' },
    { name: 'ナットウスライム', emoji: '🟫' },
    { name: 'ハナマルオ',      emoji: '⭕' },
  ];

  /* ---------- アプリ状態 ---------- */

  const savedGame = loadGameState();
  const state = {
    total: 0,
    correct: 0,
    streak: 0,
    catStats: {},
    current: null,
    answered: false,
    enabled: new Set(CATEGORIES.filter(c => !c.defaultOff).map(c => c.id)),
    points: (savedGame && savedGame.points) || 0,
    level: (savedGame && savedGame.level) || 1,
    exp: (savedGame && savedGame.exp) || 0,
    pointsToday: (savedGame && savedGame.pointsToday) || 0,
    pointsDate: (savedGame && savedGame.pointsDate) || null,
    enemyIdx: (savedGame && savedGame.enemyIdx) || 0,
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
    statPoints: document.getElementById('statPoints'),
    statExpSub: document.getElementById('statExpSub'),
    statLevel: document.getElementById('statLevel'),
    expBarInner: document.getElementById('expBarInner'),
    enemyEmoji: document.getElementById('enemyEmoji'),
    enemyName: document.getElementById('enemyName'),
    hpBarInner: document.getElementById('hpBarInner'),
    hpText: document.getElementById('hpText'),
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
    registerName: document.getElementById('registerName'),
    registerGrade: document.getElementById('registerGrade'),
    registerGuardian: document.getElementById('registerGuardian'),
    registerPassword: document.getElementById('registerPassword'),
    registerPasswordConfirm: document.getElementById('registerPasswordConfirm'),
    registerError: document.getElementById('registerError'),
    registerSubmit: document.getElementById('registerSubmit'),
    guestStartBtn: document.getElementById('guestStartBtn'),
    resetLinkBtn: document.getElementById('resetLinkBtn'),
    resetCard: document.getElementById('resetCard'),
    resetForm: document.getElementById('resetForm'),
    resetId: document.getElementById('resetId'),
    resetPassword: document.getElementById('resetPassword'),
    resetPasswordConfirm: document.getElementById('resetPasswordConfirm'),
    resetError: document.getElementById('resetError'),
    resetSuccess: document.getElementById('resetSuccess'),
    resetSubmit: document.getElementById('resetSubmit'),
    resetBackBtn: document.getElementById('resetBackBtn'),
    guardianLinkBtn: document.getElementById('guardianLinkBtn'),
    guardianCard: document.getElementById('guardianCard'),
    guardianForm: document.getElementById('guardianForm'),
    guardianName: document.getElementById('guardianName'),
    guardianError: document.getElementById('guardianError'),
    guardianSubmit: document.getElementById('guardianSubmit'),
    guardianBackBtn: document.getElementById('guardianBackBtn'),
    addChildBtn: document.getElementById('addChildBtn'),
    appMain: document.getElementById('appMain'),
    userName: document.getElementById('userName'),
    logoutBtn: document.getElementById('logoutBtn'),
    historyToggle: document.getElementById('historyToggle'),
    historyPanel: document.getElementById('historyPanel'),
    historySummary: document.getElementById('historySummary'),
    historyStreak: document.getElementById('historyStreak'),
    historyCalendar: document.getElementById('historyCalendar'),
    historyCats: document.getElementById('historyCats'),
    historyRecent: document.getElementById('historyRecent'),
    rankingToggle: document.getElementById('rankingToggle'),
    rankingPanel: document.getElementById('rankingPanel'),
    rankingTabExp: document.getElementById('rankingTabExp'),
    rankingTabToday: document.getElementById('rankingTabToday'),
    rankingSummary: document.getElementById('rankingSummary'),
    rankingList: document.getElementById('rankingList'),
    giftToggle: document.getElementById('giftToggle'),
    giftPanel: document.getElementById('giftPanel'),
    giftSummary: document.getElementById('giftSummary'),
    giftList: document.getElementById('giftList'),
    giftCodeResult: document.getElementById('giftCodeResult'),
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
    els.settingsGrid.innerHTML = CATEGORIES.map(c => {
      const cs = state.catStats[c.id];
      const acc = cs && cs.total >= 3
        ? `<span class="cat-acc">${Math.round(cs.correct / cs.total * 100)}%</span>`
        : '';
      return `
        <label class="settings-item">
          <input type="checkbox" data-cat="${c.id}" ${state.enabled.has(c.id) ? 'checked' : ''} />
          <span class="cat-label">${c.label}</span>${acc}
        </label>
      `;
    }).join('');
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
    const src = pool.length > 0 ? pool : CATEGORIES;
    return src[randInt(0, src.length - 1)];
  }

  function nextQuestion() {
    const cat = pickGenerator();
    const q = cat.gen();
    state.current = q;
    state.answered = false;

    els.categoryTag.textContent = categoryLabel[q.category];
    if (q.questionHtml) {
      els.questionText.innerHTML = q.questionHtml;
    } else {
      els.questionText.textContent = q.question;
    }
    els.feedback.innerHTML = '';
    els.feedback.className = 'feedback';
    els.nextBtn.disabled = true;

    els.choices.innerHTML = '';
    q.choices.forEach(choiceRaw => {
      const choiceStr = String(choiceRaw);
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.type = 'button';
      btn.dataset.value = choiceStr;
      btn.innerHTML = stepToHtml(choiceStr);
      btn.addEventListener('click', () => handleAnswer(btn, choiceStr));
      els.choices.appendChild(btn);
    });
  }

  function updateGameHud() {
    const hp = Math.max(0, 10 - state.streak);
    const enemy = ENEMIES[state.enemyIdx];
    if (enemy.img) {
      els.enemyEmoji.innerHTML = `<img src="${enemy.img}" alt="${enemy.name}" class="enemy-char-img">`;
    } else {
      els.enemyEmoji.textContent = enemy.emoji;
    }
    els.enemyName.textContent = enemy.name;
    const hpPct = hp * 10;
    els.hpBarInner.style.width = `${hpPct}%`;
    els.hpBarInner.style.background = hp <= 3 ? '#ef4444' : hp <= 6 ? '#f59e0b' : '#22c55e';
    els.hpText.textContent = `${hp}/10`;
    els.statPoints.textContent = state.points;
    els.statExpSub.textContent = `経験値 ${state.exp}（Lv.${state.level}）`;
    els.statLevel.textContent = state.level;
    els.expBarInner.style.width = `${((state.exp % EXP_PER_LEVEL) / EXP_PER_LEVEL) * 100}%`;
  }

  function handleAnswer(btn, choiceStr) {
    if (state.answered) return;
    state.answered = true;
    state.total++;

    const correctStr = String(state.current.answer);
    const isCorrect = choiceStr === correctStr;
    if (isCorrect) { state.correct++; state.streak++; }
    else { state.streak = 0; }

    const catId = state.current.category;
    if (!state.catStats[catId]) state.catStats[catId] = { total: 0, correct: 0 };
    state.catStats[catId].total++;
    if (isCorrect) state.catStats[catId].correct++;

    Array.from(els.choices.children).forEach(b => {
      b.disabled = true;
      if (b.dataset.value === correctStr) b.classList.add('is-correct');
      else if (b === btn) b.classList.add('is-incorrect');
    });

    const session = loadSession();
    if (session && session.id) {
      apiPost('log', { id: session.id, category: catId, correct: isCorrect }).catch(function () { });
    }

    const q = state.current;
    const stepsHtml = q.steps && q.steps.length > 0
      ? `<div class="steps-box"><div class="steps-label">途中式</div>${q.steps.map(s => `<span class="step-line">${stepToHtml(s)}</span>`).join('')}</div>`
      : '';

    let winHtml = '';
    if (isCorrect && state.streak >= 10) {
      const today = todayKey();
      if (state.pointsDate !== today) { state.pointsDate = today; state.pointsToday = 0; }
      const pointsToAdd = Math.max(0, Math.min(10, POINTS_DAILY_CAP - state.pointsToday));
      state.points += pointsToAdd;
      state.pointsToday += pointsToAdd;
      state.exp += 10;
      const newLevel = Math.min(MAX_LEVEL, Math.floor(state.exp / EXP_PER_LEVEL) + 1);
      const leveledUp = newLevel > state.level;
      state.level = newLevel;
      state.streak = 0;
      state.enemyIdx = (state.enemyIdx + 1) % ENEMIES.length;
      saveGameState(state);
      if (session && session.id) {
        apiPost('syncPoints', { id: session.id, points: state.points, level: state.level, exp: state.exp }).catch(function () { });
      }
      const nextEnemy = ENEMIES[state.enemyIdx];
      const lvlMsg = leveledUp ? `<span class="level-up-badge">LEVEL UP! Lv.${state.level}</span>` : '';
      const prevEnemy = ENEMIES[(state.enemyIdx - 1 + ENEMIES.length) % ENEMIES.length];
      const eIcon = (e) => e.img ? `<img src="${e.img}" class="enemy-char-img-sm" alt="">` : e.emoji;
      const ptText = pointsToAdd > 0 ? `+${pointsToAdd}MP ` : '(本日のMP上限に到達) ';
      winHtml = `<div class="win-banner">${lvlMsg}${eIcon(prevEnemy)} 倒した！ ${ptText}+10exp<br>次の敵: ${eIcon(nextEnemy)} ${nextEnemy.name}</div>`;
    }

    const streakHtml = state.streak >= 3
      ? `<span class="streak-badge">${state.streak}問連続正解</span>`
      : '';

    els.feedback.innerHTML =
      (isCorrect
        ? `<span class="fb-result">正解！${streakHtml}</span>`
        : `<span class="fb-result">不正解。正解は <strong>${stepToHtml(correctStr)}</strong> です。</span>`)
      + winHtml + stepsHtml;
    els.feedback.classList.add(isCorrect ? 'correct' : 'incorrect');

    els.nextBtn.disabled = false;
    updateStats();
    updateGameHud();
    if (!els.settingsPanel.hasAttribute('hidden')) renderSettings();
  }

  function resetStats() {
    state.total = 0;
    state.correct = 0;
    state.streak = 0;
    state.catStats = {};
    updateStats();
    updateGameHud();
  }

  /* ---------- イベント登録 ---------- */

  document.addEventListener('keydown', (e) => {
    if (state.answered) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!els.nextBtn.disabled) nextQuestion();
      }
      return;
    }
    const idx = { '1': 0, '2': 1, '3': 2, '4': 3 }[e.key];
    if (idx !== undefined) {
      const btns = Array.from(els.choices.children);
      if (btns[idx] && !btns[idx].disabled) btns[idx].click();
    }
  });

  document.getElementById('selectAllBtn').addEventListener('click', () => {
    CATEGORIES.forEach(c => state.enabled.add(c.id));
    renderSettings();
  });
  document.getElementById('deselectAllBtn').addEventListener('click', () => {
    state.enabled.clear();
    renderSettings();
  });

  els.nextBtn.addEventListener('click', nextQuestion);
  els.resetBtn.addEventListener('click', resetStats);
  els.settingsToggle.addEventListener('click', () => {
    const isHidden = els.settingsPanel.hasAttribute('hidden');
    if (isHidden) els.settingsPanel.removeAttribute('hidden');
    else els.settingsPanel.setAttribute('hidden', '');
    els.settingsToggle.setAttribute('aria-expanded', String(isHidden));
  });

  /* ---------- ログイン画面 ---------- */

  function alphanumericOnly(input) {
    input.addEventListener('input', function () {
      input.value = input.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 4);
    });
  }
  alphanumericOnly(els.loginPassword);
  alphanumericOnly(els.registerPassword);
  alphanumericOnly(els.registerPasswordConfirm);
  alphanumericOnly(els.resetPassword);
  alphanumericOnly(els.resetPasswordConfirm);
  for (let ci = 0; ci < 4; ci++) {
    const pwEl = document.getElementById('childPassword' + ci);
    if (pwEl) alphanumericOnly(pwEl);
  }

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
    els.rankingToggle.hidden = !!isGuest;
    els.rankingPanel.hidden = true;
    els.giftToggle.hidden = !!isGuest;
    els.giftPanel.hidden = true;
    drawNumberline();
    renderSettings();
    updateStats();
    updateGameHud();
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
        else if (res.error === 'wrong_password') {
          msg = 'パスワードが違います。';
          if (res.attemptsRemaining !== undefined) msg += `（あと${res.attemptsRemaining}回間違えるとロックされます）`;
        } else if (res.error === 'locked') {
          msg = `パスワードを何度も間違えたため、${res.retryAfterMinutes}分ほどログインできません。しばらくしてから再度お試しください。`;
        }
        showFieldError(els.loginError, msg);
        return;
      }
      saveSession({ id: id, name: res.name });
      reconcilePoints(id, res.points, res.level, res.exp);
      showApp(res.name, false);
      if (res.pointsReset) {
        window.alert('5日以上ログインが無かったため、MPが0にリセットされました。レベル・EXPはそのまま残っています。');
      }
    }).catch(function () {
      els.loginSubmit.disabled = false;
      showFieldError(els.loginError, '通信に失敗しました。もう一度お試しください。');
    });
  }

  // レベル・EXPは (level, exp) のペアで「進み具合」を比較する
  function isProgressGreater(level1, exp1, level2, exp2) {
    if (level1 !== level2) return level1 > level2;
    return exp1 > exp2;
  }

  // ログイン・再開時に、端末側とサーバー側のMP・レベル・EXPのうち
  // 進んでいる方に揃える（サーバー側での付与や別端末での進捗を
  // 取りこぼさない一方、同期し損ねた分の進捗も失わないようにする）。
  function reconcilePoints(id, serverPoints, serverLevel, serverExp) {
    var sp = Number(serverPoints) || 0;
    var sl = Number(serverLevel) || 1;
    var se = Number(serverExp) || 0;
    var changed = false;

    if (sp > state.points) { state.points = sp; changed = true; }
    if (isProgressGreater(sl, se, state.level, state.exp)) {
      state.level = sl; state.exp = se; changed = true;
    }

    if (changed) {
      saveGameState(state);
      updateGameHud();
    }
    if (sp < state.points || isProgressGreater(state.level, state.exp, sl, se)) {
      apiPost('syncPoints', { id: id, points: state.points, level: state.level, exp: state.exp }).catch(function () { });
    }
  }

  function handleRegisterSubmit(ev) {
    ev.preventDefault();
    hideFieldError(els.registerError);
    var name = els.registerName.value.trim();
    var grade = els.registerGrade.value;
    var guardian = els.registerGuardian.value.trim();
    var pw = els.registerPassword.value;
    var pwConfirm = els.registerPasswordConfirm.value;
    if (!name) { showFieldError(els.registerError, 'お名前を入力してください。'); return; }
    if (!grade) { showFieldError(els.registerError, '在籍学年を選択してください。'); return; }
    if (!/^[A-Za-z0-9]{4}$/.test(pw)) { showFieldError(els.registerError, 'パスワードは英数字4桁で入力してください。'); return; }
    if (pw !== pwConfirm) { showFieldError(els.registerError, 'パスワードが一致しません。'); return; }

    els.registerSubmit.disabled = true;
    apiPost('register', { name: name, grade: grade, guardian: guardian, password: pw }).then(function (res) {
      els.registerSubmit.disabled = false;
      if (!res.ok) {
        var msg = '登録に失敗しました。もう一度お試しください。';
        if (res.error === 'missing_fields') msg = 'お名前とパスワードを入力してください。';
        else if (res.error === 'invalid_password') msg = 'パスワードは英数字4桁で入力してください。';
        showFieldError(els.registerError, msg);
        return;
      }
      saveSession({ id: res.id, name: res.name });
      window.alert('登録が完了しました！\n\nあなたのID: ' + res.id + '\n\n次回からは、このIDとパスワードでログインします。忘れずに控えておいてください。');
      showApp(res.name, false);
    }).catch(function () {
      els.registerSubmit.disabled = false;
      showFieldError(els.registerError, '通信に失敗しました。もう一度お試しください。');
    });
  }

  function handleGuestStart() {
    saveSession({ id: null, name: 'ゲスト', guest: true });
    showApp('ゲスト', true);
  }

  /* ---------- パスワード再設定 ---------- */

  function showResetCard() {
    els.loginCard.hidden = true;
    els.resetCard.hidden = false;
  }
  function hideResetCard() {
    els.resetCard.hidden = true;
    els.loginCard.hidden = false;
    resetResetForm();
  }
  function resetResetForm() {
    els.resetForm.reset();
    hideFieldError(els.resetError);
    els.resetSuccess.hidden = true;
    els.resetSubmit.disabled = false;
  }

  function handleResetSubmit(ev) {
    ev.preventDefault();
    hideFieldError(els.resetError);
    els.resetSuccess.hidden = true;
    var id = els.resetId.value.trim();
    var pw = els.resetPassword.value;
    var pwConfirm = els.resetPasswordConfirm.value;
    if (!id) { showFieldError(els.resetError, '生徒IDを入力してください。'); return; }
    if (!/^[A-Za-z0-9]{4}$/.test(pw)) { showFieldError(els.resetError, 'パスワードは英数字4桁で入力してください。'); return; }
    if (pw !== pwConfirm) { showFieldError(els.resetError, 'パスワードが一致しません。'); return; }

    els.resetSubmit.disabled = true;
    apiPost('resetPassword', { id: id, password: pw }).then(function (res) {
      els.resetSubmit.disabled = false;
      if (!res.ok) {
        var msg = '再設定に失敗しました。もう一度お試しください。';
        if (res.error === 'not_found') msg = 'そのIDは見つかりませんでした。ご確認ください。';
        else if (res.error === 'password_already_set') msg = 'まだ先生による確認が済んでいません。教室の先生に「パスワードを忘れた」とお伝えください。';
        else if (res.error === 'invalid_password') msg = 'パスワードは英数字4桁で入力してください。';
        else if (res.error === 'missing_fields') msg = '入力に不足があります。ご確認ください。';
        showFieldError(els.resetError, msg);
        return;
      }
      els.resetForm.reset();
      els.resetSuccess.textContent = '新しいパスワードを設定しました。このパスワードでログインしてください。';
      els.resetSuccess.hidden = false;
    }).catch(function () {
      els.resetSubmit.disabled = false;
      showFieldError(els.resetError, '通信に失敗しました。もう一度お試しください。');
    });
  }

  /* ---------- 保護者登録 ---------- */

  var visibleChildCount = 1;

  function showGuardianCard() {
    els.loginCard.hidden = true;
    els.guardianCard.hidden = false;
  }
  function hideGuardianCard() {
    els.guardianCard.hidden = true;
    els.loginCard.hidden = false;
    resetGuardianForm();
  }
  function resetGuardianForm() {
    els.guardianForm.reset();
    hideFieldError(els.guardianError);
    document.querySelectorAll('.guardian-child').forEach(function (el, idx) {
      el.hidden = idx !== 0;
    });
    visibleChildCount = 1;
    els.addChildBtn.hidden = false;
    els.addChildBtn.textContent = '＋ お子様を追加（最大4人まで）';
  }

  function handleAddChild() {
    if (visibleChildCount >= 4) return;
    var block = document.querySelector('.guardian-child[data-child-index="' + visibleChildCount + '"]');
    if (block) block.hidden = false;
    visibleChildCount++;
    if (visibleChildCount >= 4) els.addChildBtn.hidden = true;
  }

  function handleGuardianSubmit(ev) {
    ev.preventDefault();
    hideFieldError(els.guardianError);
    var guardianName = els.guardianName.value.trim();
    if (!guardianName) { showFieldError(els.guardianError, '保護者名を入力してください。'); return; }

    var children = [];
    for (var i = 0; i < visibleChildCount; i++) {
      var name = document.getElementById('childName' + i).value.trim();
      var id = document.getElementById('childId' + i).value.trim();
      var password = document.getElementById('childPassword' + i).value;
      if (!name || !id || !password) {
        showFieldError(els.guardianError, `お子様${i + 1}人目のお名前・ID・パスワードをすべて入力してください。`);
        return;
      }
      if (!/^[A-Za-z0-9]{4}$/.test(password)) {
        showFieldError(els.guardianError, `お子様${i + 1}人目のパスワードは英数字4桁で入力してください。`);
        return;
      }
      children.push({ name: name, id: id, password: password });
    }

    els.guardianSubmit.disabled = true;
    apiPost('registerGuardian', { guardianName: guardianName, children: children }).then(function (res) {
      els.guardianSubmit.disabled = false;
      if (!res.ok) {
        var msg = '登録に失敗しました。もう一度お試しください。';
        if (res.error === 'child_mismatch') {
          msg = `お子様${res.index + 1}人目のIDまたはパスワードが違います。ご確認ください。`;
        } else if (res.error === 'child_locked') {
          msg = `お子様${res.index + 1}人目のパスワードを何度も間違えたため、${res.retryAfterMinutes}分ほど確認できません。しばらくしてから再度お試しください。`;
        } else if (res.error === 'missing_fields') {
          msg = '入力に不足があります。ご確認ください。';
        }
        showFieldError(els.guardianError, msg);
        return;
      }
      window.alert('保護者としての登録が完了しました。\n\nログインは今まで通り、お子様のIDとパスワードで行ってください。');
      hideGuardianCard();
    }).catch(function () {
      els.guardianSubmit.disabled = false;
      showFieldError(els.guardianError, '通信に失敗しました。もう一度お試しください。');
    });
  }

  function handleLogout() {
    clearSession();
    els.appMain.hidden = true;
    els.historyPanel.hidden = true;
    els.rankingPanel.hidden = true;
    els.giftPanel.hidden = true;
    els.loginCard.hidden = false;
    resetLoginForms();
    els.loginId.focus();
  }

  /* ---------- 学習記録 ---------- */

  function buildCalendarHtml(byDateList) {
    const byDateMap = {};
    (byDateList || []).forEach(function (d) { byDateMap[d.date] = d; });

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    let html = `<div class="cal-header"><span class="cal-header-bar"></span>カレンダー</div><div class="cal-grid">`;
    for (let i = 0; i < startWeekday; i++) html += `<div class="cal-cell cal-empty"></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const info = byDateMap[dateStr];
      let cls = 'cal-cell';
      if (info) cls += ' cal-active';
      if (dateStr === todayStr) cls += ' cal-today';
      html += `<div class="${cls}"><span class="cal-day">${d}</span>${info ? `<span class="cal-badge">📐${info.total}</span>` : ''}</div>`;
    }
    html += '</div>';
    return html;
  }

  function renderHistory(data) {
    els.historySummary.textContent = data.total === 0
      ? 'まだ記録がありません。問題を解いてみましょう。'
      : `のべ ${data.total} 問中 ${data.correct} 問正解（正答率 ${Math.round((data.correct / data.total) * 100)}%）`;

    els.historyStreak.textContent = data.streak > 0 ? `🔥 ${data.streak}日連続で学習中！` : '';
    els.historyCalendar.innerHTML = buildCalendarHtml(data.byDate);

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
    els.rankingPanel.setAttribute('hidden', '');
    els.giftPanel.setAttribute('hidden', '');

    els.historyPanel.removeAttribute('hidden');
    els.historySummary.textContent = '読み込み中…';
    els.historyStreak.textContent = '';
    els.historyCalendar.innerHTML = '';
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

  /* ---------- ランキング ---------- */

  var rankingMode = 'exp';

  function renderRanking(res, mode) {
    if (res.ranking.length === 0) {
      els.rankingSummary.textContent = mode === 'today' ? 'まだ本日のランキングデータがありません。' : 'まだランキングデータがありません。';
      els.rankingList.innerHTML = '';
      return;
    }
    els.rankingSummary.textContent = mode === 'today' ? `本日の正解数上位 ${res.ranking.length} 名` : `経験値上位 ${res.ranking.length} 名`;
    els.rankingList.innerHTML = res.ranking.map(function (r) {
      var cls = 'ranking-row' + (r.isYou ? ' ranking-you' : '');
      var youTag = r.isYou ? '<span class="ranking-you-tag">あなた</span>' : '';
      var detail = mode === 'today' ? `正解 ${r.correct}問（挑戦 ${r.total}問）` : `Lv.${r.level}（経験値 ${r.exp}）`;
      return `<div class="${cls}"><span class="ranking-rank">${r.rank}</span><span class="ranking-name">${r.nickname}${youTag}</span><span class="ranking-points">${detail}</span></div>`;
    }).join('');
  }

  function setRankingTabActive(mode) {
    els.rankingTabExp.classList.toggle('is-active', mode === 'exp');
    els.rankingTabExp.setAttribute('aria-selected', String(mode === 'exp'));
    els.rankingTabToday.classList.toggle('is-active', mode === 'today');
    els.rankingTabToday.setAttribute('aria-selected', String(mode === 'today'));
  }

  function loadRanking(mode) {
    els.rankingSummary.textContent = '読み込み中…';
    els.rankingList.innerHTML = '';

    var session = loadSession();
    if (!session || !session.id) return;
    var action = mode === 'today' ? 'rankingToday' : 'ranking';
    apiPost(action, { id: session.id }).then(function (res) {
      if (!res.ok) { els.rankingSummary.textContent = '読み込みに失敗しました。'; return; }
      renderRanking(res, mode);
    }).catch(function () {
      els.rankingSummary.textContent = '読み込みに失敗しました。';
    });
  }

  function selectRankingMode(mode) {
    rankingMode = mode;
    setRankingTabActive(mode);
    loadRanking(mode);
  }

  function toggleRanking() {
    var isHidden = els.rankingPanel.hasAttribute('hidden');
    if (!isHidden) { els.rankingPanel.setAttribute('hidden', ''); return; }
    els.historyPanel.setAttribute('hidden', '');
    els.giftPanel.setAttribute('hidden', '');

    els.rankingPanel.removeAttribute('hidden');
    selectRankingMode('exp');
  }

  /* ---------- MPギフト交換 ---------- */

  var giftCatalogCache = [];
  var giftIsOpenCache = false;
  var giftWindowTextCache = '';

  function renderGiftList(catalog, isOpen, windowText) {
    els.giftSummary.textContent = isOpen
      ? `現在のMP: ${state.points}（交換受付期間中）`
      : `現在のMP: ${state.points}（交換受付期間外です。受付期間: ${windowText}）`;
    els.giftList.innerHTML = catalog.map(function (item) {
      var canAfford = state.points >= item.mp;
      var actionHtml = !isOpen
        ? `<span class="gift-insufficient">受付期間外</span>`
        : canAfford
          ? `<button type="button" class="gift-redeem-btn" data-item="${item.itemId}">交換する</button>`
          : `<span class="gift-insufficient">MP不足</span>`;
      return `<div class="gift-row"><div class="gift-info"><span class="gift-label">${item.label}</span><span class="gift-cost">${item.mp}MP</span></div>${actionHtml}</div>`;
    }).join('');
    els.giftList.querySelectorAll('.gift-redeem-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { handleRedeemGiftClick(btn.dataset.item, btn); });
    });
  }

  function handleRedeemGiftClick(itemId, btn) {
    var session = loadSession();
    if (!session || !session.id) return;
    var item = giftCatalogCache.find(function (c) { return c.itemId === itemId; });
    if (!item) return;
    if (!window.confirm(`${item.label}（${item.mp}MP）と交換します。よろしいですか？`)) return;

    btn.disabled = true;
    apiPost('redeemGift', { id: session.id, itemId: itemId }).then(function (res) {
      if (!res.ok) {
        var msg = '交換に失敗しました。もう一度お試しください。';
        if (res.error === 'insufficient_points') msg = 'MPが不足しています。';
        else if (res.error === 'out_of_period') msg = `交換受付期間外です。受付期間: ${res.windowText || giftWindowTextCache}`;
        else if (res.error === 'out_of_stock') msg = '現在この商品の在庫がありません。先生に確認するか、しばらくしてからもう一度お試しください。';
        window.alert(msg);
        btn.disabled = false;
        return;
      }
      state.points = res.remainingPoints;
      saveGameState(state);
      updateGameHud();
      els.giftCodeResult.hidden = false;
      els.giftCodeResult.innerHTML = `<p class="gift-code-title">🎉 交換完了！</p><p class="gift-code-item">${res.itemLabel}</p><p class="gift-code-value">${res.code}</p><p class="gift-code-note">このコードは忘れないよう控えておいてください。</p>`;
      els.giftCodeResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      renderGiftList(giftCatalogCache, giftIsOpenCache, giftWindowTextCache);
    }).catch(function () {
      window.alert('通信に失敗しました。もう一度お試しください。');
      btn.disabled = false;
    });
  }

  function toggleGift() {
    var isHidden = els.giftPanel.hasAttribute('hidden');
    if (!isHidden) { els.giftPanel.setAttribute('hidden', ''); return; }
    els.historyPanel.setAttribute('hidden', '');
    els.rankingPanel.setAttribute('hidden', '');

    els.giftPanel.removeAttribute('hidden');
    els.giftSummary.textContent = '読み込み中…';
    els.giftList.innerHTML = '';
    els.giftCodeResult.hidden = true;
    els.giftCodeResult.innerHTML = '';

    var session = loadSession();
    if (!session || !session.id) return;
    apiPost('giftCatalog', {}).then(function (res) {
      if (!res.ok) { els.giftSummary.textContent = '読み込みに失敗しました。'; return; }
      giftCatalogCache = res.catalog;
      giftIsOpenCache = !!res.isOpen;
      giftWindowTextCache = res.windowText || '';
      renderGiftList(giftCatalogCache, giftIsOpenCache, giftWindowTextCache);
    }).catch(function () {
      els.giftSummary.textContent = '読み込みに失敗しました。';
    });
  }

  /* ---------- 初期化 ---------- */

  els.loginForm.addEventListener('submit', handleLoginSubmit);
  els.registerForm.addEventListener('submit', handleRegisterSubmit);
  els.tabLogin.addEventListener('click', () => switchTab('login'));
  els.tabRegister.addEventListener('click', () => switchTab('register'));
  els.guestStartBtn.addEventListener('click', handleGuestStart);
  els.resetLinkBtn.addEventListener('click', showResetCard);
  els.resetBackBtn.addEventListener('click', hideResetCard);
  els.resetForm.addEventListener('submit', handleResetSubmit);
  els.guardianLinkBtn.addEventListener('click', showGuardianCard);
  els.guardianBackBtn.addEventListener('click', hideGuardianCard);
  els.addChildBtn.addEventListener('click', handleAddChild);
  els.guardianForm.addEventListener('submit', handleGuardianSubmit);
  els.logoutBtn.addEventListener('click', handleLogout);
  els.historyToggle.addEventListener('click', toggleHistory);
  els.rankingToggle.addEventListener('click', toggleRanking);
  els.rankingTabExp.addEventListener('click', function () { selectRankingMode('exp'); });
  els.rankingTabToday.addEventListener('click', function () { selectRankingMode('today'); });
  els.giftToggle.addEventListener('click', toggleGift);

  var existingSession = loadSession();
  if (existingSession) {
    showApp(existingSession.name, !!existingSession.guest);
    if (existingSession.id) {
      apiPost('getPoints', { id: existingSession.id }).then(function (res) {
        if (res.ok) reconcilePoints(existingSession.id, res.points, res.level, res.exp);
      }).catch(function () { });
    }
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
