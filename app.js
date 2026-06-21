(function () {
  'use strict';

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
    // 式の先頭に出す数（負の数でも括弧なしでよい）
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
    { id: 'maxof4',    label: '大小関係',                 gen: genMaxOf4 },
  ];

  /* ---------- 問題生成関数（各カテゴリ） ---------- */

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

  function genMixedParen() {
    const a = randNonZero(-6, 6);
    const b = randNonZero(-9, 9);
    const c = randNonZero(-9, 9);
    const useMinus = Math.random() < 0.5;
    const inner = useMinus ? b - c : b + c;
    const answer = a * inner;
    const displayInner = useMinus ? `${b} − ${c}` : `${b} + ${c}`;
    const displayExpr = `${fmtLead(a)} × (${displayInner})`;
    const wrongs = [-answer, a * b, a + inner, Math.abs(a) * inner];
    return { category: 'mixed', question: `${displayExpr} = ?`, answer, choices: buildChoices(answer, wrongs) };
  }

  // 四則混合計算：加減と乗除が1つの式に混ざるパターン。
  // 「乗除を先に計算する」ルールがそのまま正答・誤答の分かれ目になるよう設計する。
  function genAllOps() {
    const patterns = [3, 4];
    const pattern = patterns[randInt(0, patterns.length - 1)];

    if (pattern === 3) {
      // a ± b×c  または  a ± b÷c
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

      // ありがちな誤り：左から順に計算してしまう（加減を先にやる）
      const leftToRight = useMul
        ? (useMinus ? (a - b) * c : (a + b) * c)
        : (useMinus ? (a - b) / c : (a + b) / c);
      const wrongs = [-answer, useMinus ? a + term2 : a - term2, Math.round(leftToRight)];
      return { category: 'allops', question: `${expr} = ?`, answer, choices: buildChoices(answer, wrongs) };
    } else {
      // a×b ± c×d  （乗法どうしの加減混合）
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

  // 累乗の計算：(-n)^2 と -n^2 の違い（符号がどこにかかるか）が中1の最重要ポイント。
  function genPower() {
    const useParen = Math.random() < 0.5; // true: (-n)^2 形式 / false: -n^2 形式
    const base = randInt(2, 9);
    const exp = randInt(2, 3);

    if (useParen) {
      // (-n)^2 → 符号ごと累乗されるので必ず正（expが奇数なら負のまま）
      const answer = Math.pow(-base, exp);
      const expStr = exp === 2 ? '²' : '³';
      const question = `(−${base})${expStr} = ?`;
      const wrongs = [-answer, Math.pow(base, exp - 1) * base * (exp === 2 ? -1 : 1), -Math.pow(base, exp)];
      return { category: 'power', question: `${question}`, answer, choices: buildChoices(answer, wrongs) };
    } else {
      // -n^2 → 累乗が先、符号は最後にかかるので常に負（expが偶数のとき特に間違えやすい）
      const answer = -Math.pow(base, exp);
      const expStr = exp === 2 ? '²' : '³';
      const question = `−${base}${expStr} = ?`;
      const wrongs = [Math.pow(base, exp), Math.pow(-base, exp), -Math.pow(base, exp - 1)];
      return { category: 'power', question: `${question}`, answer, choices: buildChoices(answer, wrongs) };
    }
  }

  // 中かっこを含む計算：( ) の中に ( ) がある二重構造。内側から計算する順序がポイント。
  function genBrace() {
    const a = randNonZero(-9, 9);
    const b = randNonZero(-9, 9);
    const c = randNonZero(-9, 9);
    const innerMinus = Math.random() < 0.5;
    const outerMinus = Math.random() < 0.5;

    const inner = innerMinus ? b - c : b + c; // ( b ± c )
    const answer = outerMinus ? a - inner : a + inner; // a ± { inner }

    const innerStr = innerMinus ? `${b} − (${c})` : `${b} + (${c})`;
    const question = `${fmtLead(a)} ${outerMinus ? '−' : '+'} {${innerStr}} = ?`;

    // ありがちな誤り：中かっこを無視して符号を取り違える／内側だけ先に符号反転し忘れる
    const wrongMisreadInner = outerMinus ? a - (b + c) : a + (b - c);
    const wrongs = [-answer, wrongMisreadInner, outerMinus ? a + inner : a - inner];
    return { category: 'brace', question, answer, choices: buildChoices(answer, wrongs) };
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

  /* ---------- 初期化 ---------- */

  drawNumberline();
  renderSettings();
  updateStats();
  nextQuestion();
  initInstallBanner();

  /* ---------- PWAインストール案内 ---------- */

  function initInstallBanner() {
    const banner = document.getElementById('installBanner');
    const text = document.getElementById('installText');
    const installBtn = document.getElementById('installBtn');
    const dismissBtn = document.getElementById('installDismiss');
    if (!banner) return;

    const STORAGE_KEY = 'seifukazu-quiz-install-dismissed';
    let dismissed = false;
    try { dismissed = localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { /* ignore */ }

    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;

    if (dismissed || isStandalone) return;

    const ua = window.navigator.userAgent;
    const isIos = /iPhone|iPad|iPod/i.test(ua);
    const isAndroid = /Android/i.test(ua);

    let deferredPrompt = null;

    function showBanner() {
      banner.hidden = false;
    }

    function hideBanner() {
      banner.hidden = true;
      try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) { /* ignore */ }
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
