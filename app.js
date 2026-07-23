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
    const parts = s.split(/([\w]+\/[\w]+)/);
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
    const pat = randInt(0, 2);
    let q, answer, steps, wrongs;
    if (pat === 0) {
      const a = randNonZero(-7, 7), b = randNonZero(-7, 7);
      const xC = a + b, con = a * b;
      const aS = a<0?`− ${Math.abs(a)}`:`+ ${a}`;
      const bS = b<0?`− ${Math.abs(b)}`:`+ ${b}`;
      const askX = Math.random() < 0.5;
      answer = askX ? xC : con;
      const part = askX ? 'x の係数' : '定数項';
      q = `(x ${aS})(x ${bS}) を展開したとき、${part}は？`;
      steps = [
        `(x + a)(x + b) = x² + (a+b)x + ab`,
        `a = ${a}、b = ${b}`,
        askX ? `x の係数 = ${a} + ${fmtNum(b)} = ${xC}` : `定数項 = ${a} × ${fmtNum(b)} = ${con}`
      ];
      wrongs = askX ? [con, xC+1, xC-1] : [xC, con+a, con-b];
    } else if (pat === 1) {
      const a = randNonZero(-7, 7);
      const xC = 2*a, con = a*a;
      const aS = a<0?`− ${Math.abs(a)}`:`+ ${a}`;
      const askX = Math.random() < 0.5;
      answer = askX ? xC : con;
      const part = askX ? 'x の係数' : '定数項';
      q = `(x ${aS})² を展開したとき、${part}は？`;
      steps = [
        `(x + a)² = x² + 2ax + a²`,
        `a = ${a}`,
        askX ? `x の係数 = 2×${a} = ${xC}` : `定数項 = ${a}² = ${con}`
      ];
      wrongs = askX ? [a, con, xC+2] : [xC, con+1, 2*con];
    } else {
      const a = randInt(2, 9);
      answer = -(a*a);
      q = `(x + ${a})(x − ${a}) を展開したとき、定数項は？`;
      steps = [`(x + a)(x − a) = x² − a²`, `a = ${a}`, `定数項 = −${a}² = ${answer}`];
      wrongs = [a*a, -a, answer+1];
    }
    return { category:'expand2', question:q, answer, choices:buildChoices(answer,wrongs), steps };
  }

  function genSimul() {
    const x = randNonZero(-5, 5), y = randNonZero(-5, 5);
    const askX = Math.random() < 0.5;
    const pat = randInt(0, 2);
    let q, answer, steps;
    if (pat === 0) {
      const c1 = x+y, c2 = x-y;
      q = `x + y = ${c1}、x − y = ${c2} のとき ${askX?'x':'y'} = ?`;
      steps = askX
        ? [`①＋②: 2x = ${c1+c2}`, `x = ${(c1+c2)/2}`]
        : [`①−②: 2y = ${c1-c2}`, `y = ${(c1-c2)/2}`];
      answer = askX ? x : y;
    } else if (pat === 1) {
      const a = randInt(2, 4);
      const c1 = a*x+y, c2 = x+y, diff = c1-c2;
      q = `${a}x + y = ${c1}、x + y = ${c2} のとき ${askX?'x':'y'} = ?`;
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
      q = `x + ${a}y = ${c1}、x + y = ${c2} のとき ${askX?'x':'y'} = ?`;
      if (!askX) {
        steps = [`①−②: (${a}−1)y = ${diff}`, `${a-1}y = ${diff}`, `y = ${diff}÷${a-1} = ${y}`];
        answer = y;
      } else {
        steps = [`①−②: ${a-1}y = ${diff} → y = ${y}`, `②に代入: x + ${y} = ${c2}`, `x = ${c2-y} = ${x}`];
        answer = x;
      }
    }
    const wrongs = [-answer, answer+1, answer-1].filter((v,i,arr)=>arr.indexOf(v)===i&&v!==answer);
    return { category:'simul', question:q, answer, choices:buildChoices(answer,wrongs), steps };
  }

  function genExpand3() {
    const pat = randInt(0, 2);
    let q, answer, steps, wrongs;
    if (pat === 0) {
      // (ax+b)(cx+d) = x2Cx² + □x + con  穴埋め
      const a = randInt(2, 3), b = randNonZero(-5, 5);
      const c = randInt(1, 3), d = randNonZero(-5, 5);
      const x2C = a*c, xC = a*d+b*c, con = b*d;
      const aD = a===1?'':a, bS = b<0?`− ${Math.abs(b)}`:`+ ${b}`;
      const cD = c===1?'':c, dS = d<0?`− ${Math.abs(d)}`:`+ ${d}`;
      const conS = con<0?`− ${Math.abs(con)}`:`+ ${con}`;
      q = `(${aD}x ${bS})(${cD}x ${dS}) = ${x2C}x² + □x ${conS}。□ は？`;
      steps = [
        `(ax+b)(cx+d) = acx² + (ad+bc)x + bd`,
        `ad+bc = ${a}×${fmtNum(d)} + ${fmtNum(b)}×${c} = ${a*d}+${b*c} = ${xC}`,
      ];
      answer = xC;
      wrongs = [a*d, b*c, -xC].filter(v => v !== xC);
    } else if (pat === 1) {
      // (ax+b)² = a²x² + □x + b²  穴埋め
      const a = randInt(2, 4), b = randNonZero(-6, 6);
      const x2C = a*a, xC = 2*a*b, con = b*b;
      const aD = a===1?'':a, bS = b<0?`− ${Math.abs(b)}`:`+ ${b}`;
      q = `(${aD}x ${bS})² = ${x2C}x² + □x + ${con}。□ は？`;
      steps = [
        `(ax+b)² = a²x² + 2abx + b²`,
        `2ab = 2×${a}×${fmtNum(b)} = ${xC}`,
      ];
      answer = xC;
      wrongs = [a*b, -xC, xC+2*a].filter(v => v !== xC);
    } else {
      // (ax+b)(ax−b) = a²x² + □  穴埋め
      const a = randInt(2, 4), b = randInt(1, 7);
      const x2C = a*a, con = -(b*b);
      const aD = a===1?'':a;
      q = `(${aD}x + ${b})(${aD}x − ${b}) = ${x2C}x² + □。□ は？`;
      steps = [
        `(ax+b)(ax−b) = a²x² − b²`,
        `a = ${a}、b = ${b}`,
        `= ${x2C}x² − ${b*b} → □ = ${con}`,
      ];
      answer = con;
      wrongs = [b*b, -x2C, con+1];
    }
    return { category:'expand3', question:q, answer, choices:buildChoices(answer,wrongs), steps };
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
      q = `${n}√${a} + ${m}√${a} = □√${a}。□ は？`;
      steps = [`√${a} を文字のように扱う`, `(${n} + ${m})√${a} = ${result}√${a}`, `□ = ${result}`];
      answer = result; wrongs = [n-m, n*m, result+1];
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
      q = `${n}√${a} − ${m}√${a} = □√${a}。□ は？`;
      steps = [`√${a} を文字のように扱う`, `(${n} − ${m})√${a} = ${result}√${a}`, `□ = ${result}`];
      answer = result; wrongs = [n+m, Math.max(n*m, result+2), result-1].filter(v => v !== result);
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
        [2,12,2,6],[3,21,3,7],
      ];
      const [fa, fb, k, n] = cases[randInt(0, cases.length-1)];
      q = `√${fa} × √${fb} = □√${n}。□ は？`;
      steps = [
        `√${fa} × √${fb} = √${fa*fb}`,
        `${fa*fb} = ${k*k} × ${n} と分解`,
        `= ${k}√${n} → □ = ${k}`,
      ];
      answer = k; wrongs = [fa*fb, n, k+1];
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
      q = `${a}/√${b} を有理化すると □√${b}。□ は？`;
      steps = [
        `分母に √${b} をかける: ${a}/√${b} × √${b}/√${b}`,
        `= ${a}√${b} / ${b} = ${k}√${b}`,
        `□ = ${k}`,
      ];
      answer = k; wrongs = [a, b, k+1];
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
    { id: 'proportion', label: '比例・反比例',             gen: genProportion },
    { id: 'expand2',    label: '式の展開（中2）',          gen: genExpand2 },
    { id: 'simul',      label: '連立方程式',               gen: genSimul },
    { id: 'linear',     label: '一次関数',                 gen: genLinear },
    { id: 'angle',      label: '角度の計算（中2）',        gen: genAngle },
    { id: 'congruence', label: '三角形の合同（中2）',      gen: genCongruence },
    { id: 'expand3',    label: '式の展開（中3）',          gen: genExpand3 },
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
      question = `${n}角形の内角の和は？`;
      steps = [`(n − 2) × 180° = (${n} − 2) × 180 = ${s}°`];
      answer = s; wrongs = [s - 180, s + 180, n * 180];
      questionHtml = mkPolySvg(n, false) + `<span style="display:block">${question}</span>`;
    } else if (pat === 3) {
      const n = randInt(4, 9);
      question = `${n}角形の外角の和は？`;
      steps = [`多角形の外角の和はつねに 360°`];
      answer = 360; wrongs = [180, 540, 720];
      questionHtml = mkPolySvg(n, true) + `<span style="display:block">${question}</span>`;
    } else if (pat === 4) {
      const ns = [4, 5, 6, 8, 9, 10, 12];
      const n = ns[randInt(0, ns.length - 1)];
      const s = (n - 2) * 180, interior = s / n;
      question = `正${n}角形の1つの内角は？`;
      steps = [`内角の和 = (${n}−2)×180 = ${s}°`, `1つの内角 = ${s} ÷ ${n} = ${interior}°`];
      answer = interior; wrongs = [s, 360 / n, interior + 10];
      questionHtml = mkPolySvg(n, false) + `<span style="display:block">${question}</span>`;
    } else if (pat === 5) {
      const ns2 = [4, 5, 6, 7, 8, 9, 10];
      const n = ns2[randInt(0, ns2.length - 1)];
      const s = (n - 2) * 180;
      question = `内角の和が ${s}° の多角形は何角形？`;
      steps = [`(n − 2) × 180 = ${s}`, `n − 2 = ${s / 180}`, `n = ${n}（${n}角形）`];
      answer = n; wrongs = [n - 1, n + 1, n + 2];
    } else if (pat === 6) {
      const validExt = [20, 24, 30, 36, 40, 45, 60, 72];
      const ext = validExt[randInt(0, validExt.length - 1)];
      const n = 360 / ext;
      question = `1つの外角が ${ext}° の正多角形は何角形？`;
      steps = [`外角の和 = 360°`, `辺の数 = 360 ÷ ${ext} = ${n}（${n}角形）`];
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
      question = `△ABCと△DEFで${cond.c[0]}、${cond.c[1]}が分かっている。合同条件${cond.num}を使うのにあと1つは？`;
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
          q: '△ABD ≡ △CBD の証明。AB=CB、AD=CDが仮定から分かる。③に入るのは？',
          a: 'BD は共通',
          w: ['∠ABD=∠CBD', 'AB=CD', 'BD=AC'],
          s: ['①AB=CB（仮定）', '②AD=CD（仮定）', '③BD は共通', '①②③より3組の辺がそれぞれ等しいから △ABD≡△CBD'],
          svg: '<svg width="118" height="108" viewBox="0 0 118 108" style="display:block;margin:0 auto 8px"><path d="M55,16 L100,55 L55,94 L10,55 Z" fill="none" stroke="#1c2127" stroke-width="1.5"/><line x1="55" y1="16" x2="55" y2="94" stroke="#1c2127" stroke-width="1.5" stroke-dasharray="5,3"/><text x="49" y="14" font-size="11" font-weight="bold" fill="#1c2127">B</text><text x="103" y="59" font-size="11" font-weight="bold" fill="#1c2127">A</text><text x="49" y="105" font-size="11" font-weight="bold" fill="#1c2127">D</text><text x="1" y="59" font-size="11" font-weight="bold" fill="#1c2127">C</text></svg>',
        },
        {
          q: '△ABC ≡ △DCB の証明。AB=DC、∠ABC=∠DCBが仮定から分かる。③に入るのは？',
          a: 'BC は共通',
          w: ['AC=DB', '∠BAC=∠CDB', 'AB=BC'],
          s: ['①AB=DC（仮定）', '②∠ABC=∠DCB（仮定）', '③BC は共通', '①②③より2組の辺とその間の角がそれぞれ等しいから △ABC≡△DCB'],
          svg: '<svg width="118" height="90" viewBox="0 0 118 90" style="display:block;margin:0 auto 8px"><rect x="8" y="12" width="96" height="64" fill="none" stroke="#1c2127" stroke-width="1.5"/><line x1="8" y1="76" x2="104" y2="12" stroke="#1c2127" stroke-width="1.5"/><text x="1" y="12" font-size="11" font-weight="bold" fill="#1c2127">A</text><text x="1" y="86" font-size="11" font-weight="bold" fill="#1c2127">B</text><text x="106" y="86" font-size="11" font-weight="bold" fill="#1c2127">C</text><text x="106" y="12" font-size="11" font-weight="bold" fill="#1c2127">D</text></svg>',
        },
        {
          q: '△ABM ≡ △DCM の証明。AM=DM、BM=CMが仮定から分かる。③に入るのは？',
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
    const pat = randInt(0, 5);
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
    } else if (pat === 2) {
      const base = randInt(2, 6)*10;
      const x = 90 - base;
      question = `AB が直径。∠CAB = ${base}° のとき、∠ABC の大きさ x は？（∠ACB = 90°）`;
      answer = x;
      choices = buildChoices(x, [90, base, 180-base]);
      steps = [`∠ACB = 90°（半円の弧に対する円周角）`, `∠ABC = 180 − 90 − ${base} = ${x}°`];
    } else if (pat === 3) {
      const a = randInt(6, 12)*10;
      const b = 180 - a;
      question = `円に内接する四角形で ∠A = ${a}°。対角 ∠C = x は？`;
      answer = b;
      choices = buildChoices(b, [a, 360-a, b+10]);
      steps = [`円に内接する四角形の対角の和 = 180°`, `∠C = 180 − ${a} = ${b}°`];
    } else if (pat === 4) {
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
    } else {
      // pat === 5: 接弦定理
      const c5 = [30, 35, 40, 45, 50][randInt(0, 4)];
      const svg5 = `<svg width="100" height="100" viewBox="0 0 100 100" style="display:block;margin:0 auto 8px"><circle cx="50" cy="50" r="40" fill="none" stroke="#1c2127" stroke-width="1.5"/><line x1="5" y1="90" x2="95" y2="90" stroke="#888" stroke-width="1.5"/><circle cx="50" cy="90" r="2.5" fill="#1c2127"/><circle cx="15" cy="30" r="2.5" fill="#1c2127"/><circle cx="85" cy="30" r="2.5" fill="#1c2127"/><line x1="50" y1="90" x2="15" y2="30" stroke="#1c2127" stroke-width="1.5"/><line x1="85" y1="30" x2="50" y2="90" stroke="#1c2127" stroke-width="1.2"/><line x1="85" y1="30" x2="15" y2="30" stroke="#1c2127" stroke-width="1.2"/><text x="50" y="86" font-size="10" fill="#1c2127" text-anchor="middle">A</text><text x="10" y="27" font-size="10" fill="#1c2127">B</text><text x="87" y="27" font-size="10" fill="#1c2127">C</text></svg>`;
      question = `A における接線と弦 AB のなす角が ${c5}°。C が弧 AB 上にあるとき、∠ACB = x は？`;
      answer = c5;
      choices = shuffle([c5, 2*c5, 180-c5, c5+20]);
      steps = [`接弦定理: 接線と弦のなす角 = 同じ弧に対する円周角`, `∠ACB = ${c5}°`];
      questionHtml = svg5 + `<span style="display:block">${question}</span>`;
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

  const state = {
    total: 0,
    correct: 0,
    streak: 0,
    catStats: {},
    current: null,
    answered: false,
    enabled: new Set(CATEGORIES.filter(c => !c.defaultOff).map(c => c.id)),
    points: 0,
    level: 1,
    exp: 0,
    enemyIdx: 0,
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
    q.choices.forEach(choiceStr => {
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
    els.statLevel.textContent = state.level;
    els.expBarInner.style.width = `${state.exp}%`;
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
      state.points += 10;
      state.exp += 10;
      const leveledUp = state.exp >= 100;
      if (leveledUp) { state.level++; state.exp -= 100; }
      state.streak = 0;
      state.enemyIdx = (state.enemyIdx + 1) % ENEMIES.length;
      const nextEnemy = ENEMIES[state.enemyIdx];
      const lvlMsg = leveledUp ? `<span class="level-up-badge">LEVEL UP! Lv.${state.level}</span>` : '';
      const prevEnemy = ENEMIES[(state.enemyIdx - 1 + ENEMIES.length) % ENEMIES.length];
      const eIcon = (e) => e.img ? `<img src="${e.img}" class="enemy-char-img-sm" alt="">` : e.emoji;
      winHtml = `<div class="win-banner">${lvlMsg}${eIcon(prevEnemy)} 倒した！ +10pt +10exp<br>次の敵: ${eIcon(nextEnemy)} ${nextEnemy.name}</div>`;
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
    state.points = 0;
    state.level = 1;
    state.exp = 0;
    state.enemyIdx = 0;
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
        else if (res.error === 'wrong_password') msg = 'パスワードが違います。';
        showFieldError(els.loginError, msg);
        return;
      }
      saveSession({ id: id, name: res.name });
      showApp(res.name, false);
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
  els.guestStartBtn.addEventListener('click', handleGuestStart);
  els.logoutBtn.addEventListener('click', handleLogout);
  els.historyToggle.addEventListener('click', toggleHistory);

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
