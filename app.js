(function () {
  'use strict';

  /* ---------- ログインAPI ---------- */

  var API_URL = '/api';
  var SESSION_KEY = 'matsue-math-session';

  // 47都道府県制覇データ（japan-map-data.js）が何らかの理由で読み込めなくても
  // 本体のゲーム進行（連続正解の勝利処理）が壊れないようフォールバックする。
  var PREFECTURE_DATA = (typeof PREFECTURE_INFO !== 'undefined') ? PREFECTURE_INFO : [];
  var PREFECTURE_MAP_SVG_SAFE = (typeof JAPAN_MAP_SVG !== 'undefined') ? JAPAN_MAP_SVG : '';

  // アバター作成データ（avatar-data.js）が読み込めなくてもアプリ全体が
  // 壊れないようフォールバックする。
  var AVATAR_HAIR_SAFE = (typeof AVATAR_HAIR !== 'undefined') ? AVATAR_HAIR : [];
  var AVATAR_FACE_SAFE = (typeof AVATAR_FACE !== 'undefined') ? AVATAR_FACE : [];
  var AVATAR_SKIN_COLORS_SAFE = (typeof AVATAR_SKIN_COLORS !== 'undefined') ? AVATAR_SKIN_COLORS : [];
  var AVATAR_HAIR_COLORS_SAFE = (typeof AVATAR_HAIR_COLORS !== 'undefined') ? AVATAR_HAIR_COLORS : [];
  var AVATAR_OUTFIT_COLORS_SAFE = (typeof AVATAR_OUTFIT_COLORS !== 'undefined') ? AVATAR_OUTFIT_COLORS : [];
  var buildAvatarSvgSafe = (typeof buildAvatarSvg !== 'undefined') ? buildAvatarSvg : function () { return ''; };

  // 世界一周データ(world-data.js/world-data-2.js)。1周目はWORLD_DATA_LAP1、
  // 2周目以降は別の100ヵ国(WORLD_DATA_LAP2)を使う。WORLD_DATA/WORLD_STAGESは
  // 可変で、applyWorldDataForLap_を周が変わるたびに呼んで切り替える(これ以降の
  // コードは全てWORLD_DATA/WORLD_STAGESという名前をそのまま参照する)。
  var WORLD_DATA = (typeof WORLD_DATA_LAP1 !== 'undefined') ? WORLD_DATA_LAP1 : [];
  var WORLD_STAGES = (typeof WORLD_STAGES_LAP1 !== 'undefined') ? WORLD_STAGES_LAP1 : [];
  function applyWorldDataForLap_(lap) {
    if (Number(lap) >= 2 && typeof WORLD_DATA_LAP2 !== 'undefined' && typeof WORLD_STAGES_LAP2 !== 'undefined') {
      WORLD_DATA = WORLD_DATA_LAP2;
      WORLD_STAGES = WORLD_STAGES_LAP2;
    } else {
      WORLD_DATA = (typeof WORLD_DATA_LAP1 !== 'undefined') ? WORLD_DATA_LAP1 : [];
      WORLD_STAGES = (typeof WORLD_STAGES_LAP1 !== 'undefined') ? WORLD_STAGES_LAP1 : [];
    }
  }
  var AVATAR_LEVEL_THRESHOLD = 300;
  var AVATAR_MP_THRESHOLD = 10000;
  var AVATAR_DEFAULT_SELECTION = { hair: 'short', face: 'smile', skin: 'skin1', hairColor: 'hc1', outfitColor: 'oc2' };
  // イラストプリセット方式(2026-08〜、00001限定プレビュー)：組み合わせ式パーツの
  // 代わりに、完成イラストの一覧から1つ選ぶだけの形式。画像ファイルが用意でき次第
  // 順次追加していく(現時点ではプレースホルダー)。
  var AVATAR_PRESETS = [
    { id: 'boy1', img: 'images/avatar_preset_boy1.png', label: '男の子1' },
    { id: 'boy2', img: 'images/avatar_preset_boy2.png', label: '男の子2' },
    { id: 'boy3', img: 'images/avatar_preset_boy3.png', label: '男の子3' },
    { id: 'boy4', img: 'images/avatar_preset_boy4.png', label: '男の子4' },
    { id: 'boy5', img: 'images/avatar_preset_boy5.png', label: '男の子5' },
    { id: 'boy6', img: 'images/avatar_preset_boy6.png', label: '男の子6' },
    { id: 'girl1', img: 'images/avatar_preset_girl1.png', label: '女の子1' },
    { id: 'girl2', img: 'images/avatar_preset_girl2.png', label: '女の子2' },
    { id: 'girl3', img: 'images/avatar_preset_girl3.png', label: '女の子3' },
    { id: 'girl4', img: 'images/avatar_preset_girl4.png', label: '女の子4' },
    { id: 'girl5', img: 'images/avatar_preset_girl5.png', label: '女の子5' },
    { id: 'girl6', img: 'images/avatar_preset_girl6.png', label: '女の子6' },
  ];
  // 00001でログイン中のときだけ、JavaScriptエラーを画面上部に表示する開発用バナー。
  // 端末側でしか再現しない不具合(実際にボス戦のVS表示で発生した)の原因を、
  // スクリーンショットだけで特定できるようにするためのもの。
  function reportAdminError_(where, err) {
    try {
      if (!isAdminSession_()) return;
      var box = document.getElementById('adminErrorBox');
      if (!box) {
        box = document.createElement('div');
        box.id = 'adminErrorBox';
        box.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#7f1d1d;color:#fff;font-size:12px;padding:8px 10px;white-space:pre-wrap;word-break:break-all;max-height:45vh;overflow:auto;';
        box.addEventListener('click', function () { box.remove(); });
        document.body.appendChild(box);
      }
      var msg = (err && (err.stack || err.message)) ? (err.stack || err.message) : String(err);
      box.textContent = '⚠️ ' + where + ': ' + msg + '\n（タップで閉じる）';
    } catch (ignored) { /* エラー表示自体で落ちないように */ }
  }
  window.addEventListener('error', function (ev) {
    reportAdminError_('JSエラー', ev.error || ev.message);
  });

  // アバター表示の共通ヘルパー。preset方式ならイラスト画像、従来方式ならSVGパーツを返す。
  function avatarDisplayHtml_(sel) {
    if (sel && sel.preset) {
      var preset = AVATAR_PRESETS.find(function (p) { return p.id === sel.preset; });
      if (preset) return `<img src="${preset.img}" alt="${preset.label}">`;
    }
    return buildAvatarSvgSafe(sel);
  }
  function parseAvatarJson(raw) {
    if (!raw) return null;
    // サーバーのavatar列はJSONB。APIからは既にオブジェクトとして返ってくるので、
    // それをJSON.parseに通すと必ず失敗してnullになってしまっていた(ログインの
    // たびにアバター設定が消える原因だった)。オブジェクトはそのまま採用する。
    if (typeof raw === 'object') return raw;
    try {
      var obj = JSON.parse(raw);
      return (obj && typeof obj === 'object') ? obj : null;
    } catch (e) { return null; }
  }

  function apiPost(action, payload) {
    var body = Object.assign({ action: action }, payload || {});
    return fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
    }).then(function (res) { return res.json(); });
  }

  // 「log」送信(正解数の記録)を1問ごとに個別送信すると、たくさん解く生徒ほど
  // Apps Scriptの実行回数(同時実行枠)を消費し、他の生徒のログイン・通信まで
  // 詰まらせてしまう(実際に放課後の混雑時間帯にログインが極端に遅くなる問題が発生)。
  // 1問ごとの即時送信をやめ、localStorageにキューイングしてから数秒分まとめて
  // 1回のlogBatchリクエストで送信することで、実行回数を大幅に減らす。通信が
  // 失敗してもキューに残ったままになるので、再送も兼ねる。
  var LOG_QUEUE_KEY_ = 'pendingLogQueue';
  var LOG_QUEUE_MAX_ = 500;
  var LOG_BATCH_SIZE_ = 20;
  var LOG_FLUSH_DEBOUNCE_MS_ = 4000;
  var logQueueFlushing = false;
  var logFlushTimer_ = null;

  function loadLogQueue_() {
    try {
      var raw = localStorage.getItem(LOG_QUEUE_KEY_);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }
  function saveLogQueue_(queue) {
    try { localStorage.setItem(LOG_QUEUE_KEY_, JSON.stringify(queue)); } catch (e) { }
  }
  function enqueueLog_(entry) {
    var queue = loadLogQueue_();
    queue.push(entry);
    if (queue.length > LOG_QUEUE_MAX_) queue = queue.slice(queue.length - LOG_QUEUE_MAX_);
    saveLogQueue_(queue);
  }
  // キュー先頭からLOG_BATCH_SIZE_件(同じIDの分だけ、別の生徒の取りこぼし分が
  // 混ざっていた場合はそこで区切る)をまとめて1回のlogBatchで送信する。成功した分だけ
  // キューから取り除き、失敗したら打ち切って次回の呼び出しに委ねる。
  function flushLogQueue_() {
    if (logQueueFlushing) return;
    var queue = loadLogQueue_();
    if (queue.length === 0) return;
    var targetId = queue[0].id;
    var batch = [];
    for (var i = 0; i < queue.length && batch.length < LOG_BATCH_SIZE_; i++) {
      if (queue[i].id !== targetId) break;
      batch.push(queue[i]);
    }
    if (batch.length === 0) return;
    logQueueFlushing = true;
    var entries = batch.map(function (e) { return { category: e.category, correct: e.correct }; });
    apiPost('logBatch', { id: targetId, entries: entries }).then(function (res) {
      logQueueFlushing = false;
      if (res && res.ok) {
        var remaining = loadLogQueue_();
        remaining.splice(0, batch.length);
        saveLogQueue_(remaining);
        if (remaining.length > 0) scheduleLogFlush_();
      }
    }).catch(function () {
      logQueueFlushing = false;
    });
  }
  function scheduleLogFlush_() {
    if (logFlushTimer_) return;
    logFlushTimer_ = window.setTimeout(function () {
      logFlushTimer_ = null;
      flushLogQueue_();
    }, LOG_FLUSH_DEBOUNCE_MS_);
  }
  function logAnswer_(entry) {
    enqueueLog_(entry);
    var queueLength = loadLogQueue_().length;
    if (queueLength >= LOG_BATCH_SIZE_) {
      if (logFlushTimer_) { window.clearTimeout(logFlushTimer_); logFlushTimer_ = null; }
      flushLogQueue_();
    } else {
      scheduleLogFlush_();
    }
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
  // 1日のMP上限を「計算問題(理科含む)」と「文章題」で別々の50MPずつに分ける
  // (合計は今までと同じ100MPのまま)。計算問題は10問正解あたりのMPも
  // 10→5MPに変更(学年より上の単元に挑戦したボーナスは20→10MPで、2倍の比率は維持)。
  var POINTS_DAILY_CAP_CALC = 50;
  var POINTS_DAILY_CAP_WORD = 50;
  var EXP_PER_LEVEL = 10;
  var MAX_LEVEL = 9999;

  // 同じ単元ばかり周回してポイント・経験値を稼ぐのを防ぐため、単元ごとに1日の出題数へ
  // 上限を設ける。COMPLETE_AT問解いた時点でその日は「コンプリート」扱いとしてチェックを
  // 外し、選択できないようにする（HARD_CAPは誤動作時の安全上限）。翌日になると自動的に
  // 解禁される。2026-08-01に90問(安全上限100問)で開始し、2026-08-08から40問
  // (安全上限50問)へ変更。
  var DAILY_CATEGORY_LIMIT_START = '2026-08-01';
  var DAILY_CATEGORY_COMPLETE_AT_V1_ = 90;
  var DAILY_CATEGORY_HARD_CAP_V1_ = 100;
  var DAILY_CATEGORY_LIMIT_V2_START = '2026-08-08';
  var DAILY_CATEGORY_COMPLETE_AT_V2_ = 40;
  var DAILY_CATEGORY_HARD_CAP_V2_ = 50;
  function isDailyCategoryLimitActive() {
    return todayKey() >= DAILY_CATEGORY_LIMIT_START;
  }
  function dailyCategoryCompleteAt_() {
    return todayKey() >= DAILY_CATEGORY_LIMIT_V2_START ? DAILY_CATEGORY_COMPLETE_AT_V2_ : DAILY_CATEGORY_COMPLETE_AT_V1_;
  }
  function dailyCategoryHardCap_() {
    return todayKey() >= DAILY_CATEGORY_LIMIT_V2_START ? DAILY_CATEGORY_HARD_CAP_V2_ : DAILY_CATEGORY_HARD_CAP_V1_;
  }
  function ensureCategoryDailyReset(s) {
    var today = todayKey();
    if (s.categoryDailyDate !== today) {
      s.categoryDailyDate = today;
      s.categoryDailyCounts = {};
    }
  }
  function isCategoryCompleteToday(s, catId) {
    if (!isDailyCategoryLimitActive()) return false;
    ensureCategoryDailyReset(s);
    return (s.categoryDailyCounts[catId] || 0) >= dailyCategoryCompleteAt_();
  }

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // 追加してから何日以内かどうか(NEW🌟バッジの表示判定用)。dateStrは'YYYY-MM-DD'。
  var NEW_BADGE_DAYS_ = 10;
  function isRecentlyAdded(dateStr) {
    if (!dateStr) return false;
    var added = new Date(dateStr + 'T00:00:00');
    if (isNaN(added.getTime())) return false;
    var diffDays = (new Date(todayKey() + 'T00:00:00') - added) / (24 * 60 * 60 * 1000);
    return diffDays >= 0 && diffDays < NEW_BADGE_DAYS_;
  }

  // メニューのボタン・カード見出しにNEW🌟バッジを付ける。追加日から1週間経つと
  // 自動的に表示されなくなる。
  var NEW_MENU_ITEMS_ = [
    { el: 'weeklyQuizToggle', addedDate: '2026-08-06' },
    { el: 'hyakuMasuCardTitle', addedDate: '2026-08-06' },
    { el: 'challengeTestCardTitle', addedDate: '2026-08-06' },
    { el: 'rankingTabChallenge', addedDate: '2026-08-06' },
  ];
  function applyMenuNewBadges() {
    NEW_MENU_ITEMS_.forEach(function (item) {
      var node = els[item.el];
      if (!node || !isRecentlyAdded(item.addedDate)) return;
      var badge = document.createElement('span');
      badge.className = 'menu-new-badge';
      badge.textContent = 'NEW🌟';
      node.appendChild(document.createTextNode(' '));
      node.appendChild(badge);
    });
  }

  // 本日の獲得MP上限(pointsToday/pointsDate)・アイテム・レアキャラ図鑑(rareDefeats/
  // rareCollected)・考えるAKRの出現状態(thinkerMilestone)は、ログアウト時にmatsue-math-game
  // ごと消去されると「ログアウトしてまたログインするだけで今日の上限がリセットされてMPが
  // 無限に増やせてしまう」「アイテムやレアキャラ図鑑が消えてしまう」という不具合になる。
  // これを防ぐため、これらの値はアカウント(ID)ごとの別キーに保存し、ログアウト操作では
  // 消さないようにする（アカウント切り替え時の汚染防止のためのclearGameStateとは独立させている）。
  function accountProgressKey_(id) {
    return 'matsue-math-progress-' + (id || 'guest');
  }
  function loadAccountProgress_(id) {
    try {
      var raw = localStorage.getItem(accountProgressKey_(id));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function saveAccountProgress_(id, data) {
    try { localStorage.setItem(accountProgressKey_(id), JSON.stringify(data)); } catch (e) { }
  }

  function loadGameState() {
    try {
      var raw = localStorage.getItem(GAME_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function clearGameState() {
    try { localStorage.removeItem(GAME_KEY); } catch (e) { }
  }
  function saveGameState(s) {
    try {
      localStorage.setItem(GAME_KEY, JSON.stringify({
        points: s.points, level: s.level, exp: s.exp,
        pointsToday: s.pointsToday, pointsDate: s.pointsDate,
        pointsTodayCalc: s.pointsTodayCalc, pointsTodayWord: s.pointsTodayWord, enemyIdx: s.enemyIdx,
        rareType: s.rareType, items: s.items, prefectureCount: s.prefectureCount, avatar: s.avatar,
        missionDate: s.missionDate, missionGrade: s.missionGrade, missionCategoryId: s.missionCategoryId,
        missionCorrect: s.missionCorrect, missionClaimed: s.missionClaimed,
        rareDefeats: s.rareDefeats, rareCollected: s.rareCollected, thinkerMilestone: s.thinkerMilestone,
        wrongBank: s.wrongBank, enabled: Array.from(s.enabled), doubleOrHalfSnapshot: s.doubleOrHalfSnapshot,
        categoryDailyCounts: s.categoryDailyCounts, categoryDailyDate: s.categoryDailyDate, hp: s.hp,
        worldLap: s.worldLap, worldLapStartLevel: s.worldLapStartLevel, worldCountry: s.worldCountry,
        worldBossDefeated: s.worldBossDefeated, worldAllies: s.worldAllies, treasureItems: s.treasureItems,
        mathGodTitleEarned: s.mathGodTitleEarned, cursed: s.cursed,
        enabledScience: Array.from(s.enabledScience), subject: s.subject, scienceExp: s.scienceExp,
        bakuretsuSolved: Array.from(s.bakuretsuSolved), speedSeedCount: s.speedSeedCount, ironWallCharges: s.ironWallCharges, steelArmorCharges: s.steelArmorCharges,
      }));
    } catch (e) { }
    var sess = loadSession();
    if (sess && sess.id) {
      saveAccountProgress_(sess.id, {
        pointsToday: s.pointsToday, pointsDate: s.pointsDate,
        pointsTodayCalc: s.pointsTodayCalc, pointsTodayWord: s.pointsTodayWord,
        items: s.items, rareDefeats: s.rareDefeats, rareCollected: s.rareCollected,
        thinkerMilestone: s.thinkerMilestone,
        missionDate: s.missionDate, missionGrade: s.missionGrade, missionCategoryId: s.missionCategoryId,
        missionCorrect: s.missionCorrect, missionClaimed: s.missionClaimed,
        wrongBank: s.wrongBank, enabled: Array.from(s.enabled),
        categoryDailyCounts: s.categoryDailyCounts, categoryDailyDate: s.categoryDailyDate, hp: s.hp,
        worldLap: s.worldLap, worldLapStartLevel: s.worldLapStartLevel, worldCountry: s.worldCountry,
        worldBossDefeated: s.worldBossDefeated, worldAllies: s.worldAllies, treasureItems: s.treasureItems,
        mathGodTitleEarned: s.mathGodTitleEarned, cursed: s.cursed,
        enabledScience: Array.from(s.enabledScience), subject: s.subject, scienceExp: s.scienceExp,
        bakuretsuSolved: Array.from(s.bakuretsuSolved), speedSeedCount: s.speedSeedCount, ironWallCharges: s.ironWallCharges, steelArmorCharges: s.steelArmorCharges,
      });
    }
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

  // 負の分数は、分子に「−」を付けるのではなく、（分数）の外側に「−」を
  // 横並びで付けて表す（例: 2分の3の負の数 → −(3/2)）。正の分数には
  // 不要なかっこを付けない。
  function negFracHtml(num, den, neg) {
    const inner = `<span class="frac"><span class="num">${num}</span><span class="den">${den}</span></span>`;
    return neg ? `−(${inner})` : inner;
  }
  function negFracStr(num, den, neg) {
    return neg ? `−(${num}/${den})` : `${num}/${den}`;
  }

  // 30分刻みの分数を「H時間M分」表記に変換する（峠越え往復問題などで使用）。
  function fmtHM_(totalMinutes) {
    const h = Math.floor(totalMinutes / 60), m = totalMinutes % 60;
    if (h === 0) return `${m}分`;
    if (m === 0) return `${h}時間`;
    return `${h}時間${m}分`;
  }

  function stepToHtml(s) {
    const parts = String(s).split(/(√?[\w]+\/√?[\w]+)/);
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
    let ans = randNonZero(-9, 9);
    const pat = randInt(0, 7);
    let q, questionHtml, steps;
    if (pat === 6) {
      // 分数係数の方程式（両辺に分数）: (n1/d1)x + b1 = (n2/d2)x + b2
      const fracs = [[1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [1, 5], [2, 5], [1, 6], [5, 6]];
      let f1, f2;
      do { f1 = fracs[randInt(0, fracs.length - 1)]; f2 = fracs[randInt(0, fracs.length - 1)]; } while (f1[0] / f1[1] === f2[0] / f2[1]);
      const [n1, d1] = f1, [n2, d2] = f2;
      const L = lcmFrac(d1, d2);
      ans = randNonZero(-3, 3) * L; // Lの倍数にして、係数×xが必ず整数になるようにする
      const b1 = randNonZero(-9, 9);
      const b2 = (n1 * ans) / d1 + b1 - (n2 * ans) / d2;
      const b1S = b1 < 0 ? `− ${Math.abs(b1)}` : `+ ${b1}`;
      const b2S = b2 < 0 ? `− ${Math.abs(b2)}` : `+ ${b2}`;
      q = `${n1}/${d1}x ${b1S} = ${n2}/${d2}x ${b2S} を解け。x = ?`;
      questionHtml = `<span class="frac"><span class="num">${n1}</span><span class="den">${d1}</span></span>x ${b1S} = <span class="frac"><span class="num">${n2}</span><span class="den">${d2}</span></span>x ${b2S} を解け。x = ?`;
      steps = [`両辺に分母の最小公倍数 ${L} をかけて分数を消す`, `移項して整理する`, `x = ${ans}`];
    } else if (pat === 7) {
      // 分配のある方程式: ax = b(x+c) の形（速さ・追いつきの文章題によく出る形）
      const bOptions = [10, 15, 20, 30, 40, 50, 60, 70, 90, 100, 150];
      const b = bOptions[randInt(0, bOptions.length - 1)];
      const m = randNonZero(-6, 6);
      ans = b * m;
      let a;
      do { a = bOptions[randInt(0, bOptions.length - 1)]; } while (a === b);
      const c = (a - b) * m;
      const cS = c < 0 ? `− ${Math.abs(c)}` : `+ ${c}`;
      q = `${a}x = ${b}(x ${cS}) を解け。x = ?`;
      steps = [`右辺を展開する: ${a}x = ${b}x ${c >= 0 ? '+' : '−'} ${Math.abs(b * c)}`, `移項: ${a - b}x = ${b * c}`, `x = ${b * c} ÷ ${a - b} = ${ans}`];
    } else if (pat === 0) {
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
    } else if (pat === 2) {
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
    } else if (pat === 3) {
      // 小数を含む方程式: ax + b = c (a, b は小数)
      const aOptions = [0.2, 0.3, 0.4, 0.6, 0.7, 0.8, 0.9, 1.2, 1.5];
      const a = aOptions[randInt(0, aOptions.length - 1)];
      const b = randNonZero(-90, 90) / 10;
      ans = randNonZero(-6, 6);
      const c = Math.round((a * ans + b) * 10) / 10;
      const bS = b < 0 ? ` − ${Math.abs(b)}` : `+ ${b}`;
      q = `${a}x ${bS} = ${c} を解け。x = ?`;
      const rhs = Math.round((c - b) * 10) / 10;
      steps = [`移項: ${a}x = ${c} − ${fmtNum(b)} = ${fmtNum(rhs)}`, `両辺を ${a} で割る`, `x = ${fmtNum(rhs)} ÷ ${a} = ${ans}`];
    } else if (pat === 4) {
      // 分数を含む方程式: x/a + b = c
      const a = [2, 3, 4, 5][randInt(0, 3)];
      const q2 = randNonZero(-6, 6);
      ans = a * q2;
      const b = randNonZero(-9, 9);
      const c = q2 + b;
      const bS = b < 0 ? ` − ${Math.abs(b)}` : `+ ${b}`;
      q = `x/${a} ${bS} = ${c} を解け。x = ?`;
      questionHtml = `<span class="frac"><span class="num">x</span><span class="den">${a}</span></span> ${bS} = ${c} を解け。x = ?`;
      steps = [`移項: x/${a} = ${c} − ${fmtNum(b)} = ${q2}`, `両辺に ${a} をかける`, `x = ${q2} × ${a} = ${ans}`];
    } else {
      // （　　）を含む方程式: a(x + b) = c
      const a = randInt(2, 5);
      const b = randNonZero(-9, 9);
      ans = randNonZero(-6, 6);
      const inner = ans + b;
      const c = a * inner;
      const bS = b < 0 ? ` − ${Math.abs(b)}` : `+ ${b}`;
      q = `${a}(x ${bS}) = ${c} を解け。x = ?`;
      steps = [`両辺を ${a} で割る: x ${bS} = ${c} ÷ ${a} = ${inner}`, `移項: x = ${inner} − ${fmtNum(b)} = ${ans}`];
    }
    const wrongs = [-ans, ans+1, ans-1].filter((v,i,arr)=>arr.indexOf(v)===i&&v!==ans);
    return { category:'equation', question:q, questionHtml, answer:ans, choices:buildChoices(ans,wrongs), steps };
  }

  // 方程式の文章題（中1）。答えとなる整数を先に決め、そこから問題文の数値を
  // 逆算して作ることで、常に綺麗な整数解になるようにしている。
  function genEqWordProblem1() {
    const pat = randInt(0, 6);
    let question, answer, wrongs, steps;
    if (pat === 0) {
      // ある数のa倍にbを足す(引く)とresultになる
      answer = randInt(2, 20);
      const a = randInt(2, 9);
      const b = randInt(1, 20);
      const isAdd = Math.random() < 0.5;
      const result = isAdd ? a * answer + b : a * answer - b;
      question = isAdd
        ? `ある数の${a}倍に${b}を足すと${result}になりました。ある数を求めなさい。`
        : `ある数の${a}倍から${b}を引くと${result}になりました。ある数を求めなさい。`;
      steps = isAdd
        ? [`ある数をxとすると、${a}x + ${b} = ${result}`, `${a}x = ${result} − ${b} = ${a * answer}`, `x = ${a * answer} ÷ ${a} = ${answer}`]
        : [`ある数をxとすると、${a}x − ${b} = ${result}`, `${a}x = ${result} + ${b} = ${a * answer}`, `x = ${a * answer} ÷ ${a} = ${answer}`];
      wrongs = [answer + 1, answer - 1, a * answer];
    } else if (pat === 1) {
      // 個数と代金の文章題
      answer = randInt(2, 15);
      const price = [50, 80, 100, 120, 150, 200][randInt(0, 5)];
      const fee = randInt(1, 4) * 50;
      const total = price * answer + fee;
      question = `1個${price}円のお菓子を何個か買って、${fee}円の箱代を払ったところ、合計金額は${total}円になりました。お菓子を何個買いましたか。`;
      steps = [
        `買った個数をx個とすると、${price}x + ${fee} = ${total}`,
        `${price}x = ${total} − ${fee} = ${price * answer}`,
        `x = ${price * answer} ÷ ${price} = ${answer}`,
      ];
      wrongs = [answer + 1, answer - 1, Math.round(total / price)].filter((v) => v !== answer);
    } else if (pat === 2) {
      // 過不足算: a個ずつ配るとb個余り、c個ずつ配るとd個不足する
      answer = randInt(5, 20); // 人数
      const a = randInt(2, 5);
      const diff = randInt(1, 3);
      const c = a + diff;
      const totalDiff = diff * answer;
      const b = randInt(1, totalDiff - 1);
      const d = totalDiff - b;
      question = `生徒にあめを${a}個ずつ配ると${b}個余り、${c}個ずつ配ると${d}個不足します。生徒の人数を求めなさい。`;
      steps = [
        `生徒の人数をx人とすると、あめの個数は ${a}x + ${b} でも ${c}x − ${d} でも表せる`,
        `${a}x + ${b} = ${c}x − ${d}`,
        `${b} + ${d} = ${c}x − ${a}x = ${diff}x`,
        `x = ${totalDiff} ÷ ${diff} = ${answer}`,
      ];
      wrongs = [answer + 1, answer - 1, a + c];
    } else if (pat === 3) {
      // 追いつく問題: 弟が先に出発し、後から出発した兄が追いつく
      const v1 = [50, 60, 80, 100, 120, 150, 200][randInt(0, 6)];
      const diffCands = [10, 20, 25, 30, 40, 50, 60, 100];
      const diff = diffCands[randInt(0, diffCands.length - 1)];
      const v2 = v1 + diff;
      const headCands = [];
      for (let h = 2; h <= 30; h++) {
        const x = (v1 * h) / diff;
        if (Number.isInteger(x) && x >= 2 && x <= 60) headCands.push([h, x]);
      }
      if (headCands.length === 0) return genEqWordProblem1();
      const [head, x] = headCands[randInt(0, headCands.length - 1)];
      answer = x;
      question = `弟が家を出発してから${head}分後に、兄が自転車で弟を追いかけました。弟の速さを分速${v1}m、兄の速さを分速${v2}mとするとき、兄が出発してから何分後に弟に追いつきますか。`;
      steps = [
        `兄が出発してからx分後に追いつくとすると`,
        `弟が進んだ道のり: ${v1}(${head} + x)、兄が進んだ道のり: ${v2}x`,
        `${v1}(${head} + x) = ${v2}x`,
        `${v1 * head} = ${diff}x`,
        `x = ${v1 * head} ÷ ${diff} = ${answer}`,
      ];
      wrongs = [head, answer + 1, answer - 1].filter((v) => v !== answer && v > 0);
    } else if (pat === 4) {
      // 二種類の商品の代金(1次方程式版): 合計本数が決まっていて、一方をxで表す
      const priceOptions = [50, 60, 80, 100, 120, 150];
      const priceA = priceOptions[randInt(0, priceOptions.length - 1)];
      const priceBCands = priceOptions.filter((v) => v !== priceA);
      const priceB = priceBCands[randInt(0, priceBCands.length - 1)];
      const [priceHi, priceLo] = priceA > priceB ? [priceA, priceB] : [priceB, priceA];
      const total = randInt(10, 25);
      answer = randInt(1, total - 1);
      const cost = priceHi * answer + priceLo * (total - answer);
      question = `1本${priceHi}円のボールペンと1本${priceLo}円の鉛筆を合わせて${total}本買ったところ、代金の合計は${cost}円でした。ボールペンを何本買いましたか。`;
      steps = [
        `ボールペンの本数をx本とすると、鉛筆の本数は (${total} − x)本`,
        `${priceHi}x + ${priceLo}(${total} − x) = ${cost}`,
        `${priceHi - priceLo}x + ${priceLo * total} = ${cost}`,
        `x = ${cost - priceLo * total} ÷ ${priceHi - priceLo} = ${answer}`,
      ];
      wrongs = [total - answer, answer + 1, answer - 1].filter((v) => v !== answer && v > 0);
    } else if (pat === 5) {
      // 比で分ける問題
      const ratioPairs = [[2, 3], [3, 4], [3, 5], [4, 5], [5, 7], [2, 5], [5, 8], [8, 9]];
      const [a, b] = ratioPairs[randInt(0, ratioPairs.length - 1)]; // a < b
      const k = randInt(3, 40);
      const total = (a + b) * k;
      const askOlder = Math.random() < 0.5;
      answer = askOlder ? b * k : a * k;
      question = askOlder
        ? `${total}枚のカードを兄と弟の2人で分けるのに、兄と弟の枚数の比が${b}：${a}になるようにします。兄のカードは何枚ですか。`
        : `${total}枚のカードを兄と弟の2人で分けるのに、兄と弟の枚数の比が${b}：${a}になるようにします。弟のカードは何枚ですか。`;
      steps = [
        `比の1にあたる枚数をx枚とすると、兄は${b}x枚、弟は${a}x枚`,
        `${b}x + ${a}x = ${total}`,
        `${a + b}x = ${total}`,
        `x = ${total} ÷ ${a + b} = ${k}`,
        askOlder ? `兄の枚数 = ${b} × ${k} = ${answer}` : `弟の枚数 = ${a} × ${k} = ${answer}`,
      ];
      wrongs = [askOlder ? a * k : b * k, answer + 1, answer - 1].filter((v) => v !== answer && v > 0);
    } else {
      // 比例式の利用: 2人がそれぞれ違う金額を持っていて、同じ金額を使ったら残金の比がp:qになった
      const ratioPairs2 = [[2, 1], [3, 2], [4, 3], [5, 3], [5, 4], [3, 1], [7, 5]];
      const [p, q] = ratioPairs2[randInt(0, ratioPairs2.length - 1)]; // p > q
      answer = [50, 100, 150, 200, 250, 300, 400, 500][randInt(0, 7)]; // 買った品物の値段
      const k = randInt(2, 12);
      const m2 = answer + k * q; // 少ない方の残金
      const m1 = answer + k * p; // 多い方の残金
      const items = ['サインペン', 'ノート', 'ペン', '消しゴム', '色鉛筆'];
      const item = items[randInt(0, items.length - 1)];
      const namePairs = [['姉', '妹'], ['兄', '弟'], ['Aさん', 'Bさん']];
      const [nameA, nameB] = namePairs[randInt(0, namePairs.length - 1)];
      question = `${nameA}は${m1}円、${nameB}は${m2}円持っていました。2人とも同じ金額の${item}を買ったので、2人の残金の比は${p}：${q}になりました。2人が買った${item}の値段はいくらですか。`;
      steps = [
        `買った値段をx円とすると、(${m1} − x)：(${m2} − x) = ${p}：${q}`,
        `${q}(${m1} − x) = ${p}(${m2} − x)`,
        `${q * m1} − ${q}x = ${p * m2} − ${p}x`,
        `${p}x − ${q}x = ${p * m2} − ${q * m1}`,
        `${p - q}x = ${p * m2 - q * m1}`,
        `x = ${p * m2 - q * m1} ÷ ${p - q} = ${answer}`,
      ];
      wrongs = [m1 - m2, answer + 50, answer - 50].filter((v) => v !== answer && v > 0);
    }
    return { category: 'eqWordProblem1', question, questionHtml: stepToHtml(question), answer, choices: buildChoices(answer, wrongs), steps };
  }

  // 方程式の文章題の応用（中1）。genEqWordProblem1と同様、答えを先に決めてから
  // 問題文の数値を逆算する。
  function genEqWordProblemAdv1() {
    const pat = randInt(0, 9);
    let question, answer, wrongs, steps;
    if (pat === 0) {
      // 年齢問題: x年後に父の年齢が子のn倍になる
      let childNow, n, x, fatherNow;
      for (let tries = 0; tries < 30; tries++) {
        childNow = randInt(6, 12); n = randInt(2, 4); x = randInt(1, 15);
        fatherNow = n * (childNow + x) - x;
        if (fatherNow >= 25 && fatherNow <= 55 && fatherNow > childNow) break;
      }
      if (!(fatherNow >= 25 && fatherNow <= 55)) return genEqWordProblemAdv1();
      answer = x;
      question = `現在、父の年齢は${fatherNow}歳、子の年齢は${childNow}歳です。父の年齢が子の年齢の${n}倍になるのは、今から何年後ですか。`;
      steps = [
        `x年後、父は(${fatherNow}+x)歳、子は(${childNow}+x)歳`,
        `${fatherNow}+x = ${n}×(${childNow}+x)`,
        `${fatherNow}+x = ${n * childNow}+${n}x`,
        `x − ${n}x = ${n * childNow} − ${fatherNow}`,
        `${1 - n}x = ${n * childNow - fatherNow}`,
        `x = ${n * childNow - fatherNow} ÷ ${1 - n} = ${answer}`,
      ];
      wrongs = [answer + 1, answer - 1, n].filter((v) => v !== answer && v > 0);
    } else if (pat === 1) {
      // 割合の増減問題: 去年からr%増減して今年の人数になった
      answer = randInt(2, 15) * 20;
      const r = [5, 10, 15, 20, 25, 30, 40, 50][randInt(0, 7)];
      const isIncrease = Math.random() < 0.5;
      const rate = isIncrease ? 100 + r : 100 - r;
      const result = (answer * rate) / 100;
      question = `ある美術部の部員数は、去年から${r}%${isIncrease ? '増えて' : '減って'}、今年は${result}人になりました。去年の部員数を求めなさい。`;
      steps = [
        `去年の部員数をx人とすると、今年の部員数は ${rate}/100 x`,
        `${rate}/100 x = ${result}`,
        `x = ${result} × 100 ÷ ${rate} = ${answer}`,
      ];
      wrongs = [result, answer + 10, answer - 10].filter((v) => v !== answer && v > 0);
    } else if (pat === 2) {
      // 食塩水の混合(重さを求める): 濃度の異なる2つの食塩水を混ぜて目標濃度にする
      const ratioPairs = [[1, 1], [2, 1], [1, 2], [3, 1], [1, 3], [2, 3], [3, 2], [3, 4], [4, 3]];
      const [p, q] = ratioPairs[randInt(0, ratioPairs.length - 1)];
      const s = p + q;
      const m = randInt(1, 5);
      const diff = s * m;
      const c1 = randInt(3, 15);
      const c2 = c1 + diff;
      if (c2 > 35) return genEqWordProblemAdv1();
      const ct = c1 + q * m;
      const unit = [20, 50, 100][randInt(0, 2)];
      const w1 = p * unit, w2 = q * unit;
      const total = w1 + w2;
      const askW1 = Math.random() < 0.5;
      answer = askW1 ? w1 : w2;
      question = `${c1}%の食塩水と${c2}%の食塩水を混ぜて、${ct}%の食塩水を${total}g作ります。${askW1 ? c1 : c2}%の食塩水は何g混ぜればよいですか。`;
      if (askW1) {
        steps = [
          `${c1}%の食塩水をxgとすると、${c2}%の食塩水は(${total}−x)g`,
          `${c1}x + ${c2}(${total}−x) = ${ct}×${total}`,
          `${c1}x + ${c2 * total} − ${c2}x = ${ct * total}`,
          `${c1 - c2}x = ${ct * total} − ${c2 * total}`,
          `x = ${ct * total - c2 * total} ÷ ${c1 - c2} = ${answer}`,
        ];
      } else {
        steps = [
          `${c2}%の食塩水をxgとすると、${c1}%の食塩水は(${total}−x)g`,
          `${c1}(${total}−x) + ${c2}x = ${ct}×${total}`,
          `${c1 * total} − ${c1}x + ${c2}x = ${ct * total}`,
          `${c2 - c1}x = ${ct * total} − ${c1 * total}`,
          `x = ${ct * total - c1 * total} ÷ ${c2 - c1} = ${answer}`,
        ];
      }
      wrongs = [total - answer, answer + 10, answer - 10].filter((v) => v !== answer && v > 0);
    } else if (pat === 3) {
      // 食塩を追加して濃度を上げる問題
      const d = [4, 5, 8, 10, 20, 25, 40, 50][randInt(0, 7)];
      const c2 = 100 - d;
      const c1 = randInt(2, c2 - 3);
      const k = randInt(2, 15);
      const W = d * k;
      answer = k * (c2 - c1);
      if (W < 50 || W > 2000 || answer < 5 || answer > 500) return genEqWordProblemAdv1();
      question = `${c1}%の食塩水が${W}gあります。これに食塩を何gか加えて、${c2}%の食塩水にしたい。食塩を何g加えればよいですか。`;
      steps = [
        `加える食塩の重さをxgとすると`,
        `${W}×${c1}/100 + x = (${W}+x)×${c2}/100`,
        `両辺に100をかけて: ${W * c1} + 100x = ${c2}(${W}+x)`,
        `${W * c1} + 100x = ${c2 * W} + ${c2}x`,
        `100x − ${c2}x = ${c2 * W} − ${W * c1}`,
        `${100 - c2}x = ${c2 * W - W * c1}`,
        `x = ${c2 * W - W * c1} ÷ ${100 - c2} = ${answer}`,
      ];
      wrongs = [answer + 10, answer - 10, W - answer].filter((v) => v !== answer && v > 0);
    } else if (pat === 4) {
      // 池のまわりを反対方向に進んで出会う問題
      const a = [40, 50, 60, 70, 80, 90, 100, 120][randInt(0, 7)];
      const b = [30, 40, 50, 60, 70, 80][randInt(0, 5)];
      answer = randInt(3, 20);
      const C = (a + b) * answer;
      question = `1周${C}mの池のまわりを、Aさんは分速${a}m、Bさんは分速${b}mで、同じ地点から反対方向に同時に出発しました。2人が出会うのは、出発してから何分後ですか。`;
      steps = [
        `x分後に出会うとすると、2人が進んだ道のりの和が1周分になる`,
        `${a}x + ${b}x = ${C}`,
        `${a + b}x = ${C}`,
        `x = ${C} ÷ ${a + b} = ${answer}`,
      ];
      wrongs = [answer + 1, answer - 1, Math.round(C / a)].filter((v) => v !== answer && v > 0);
    } else if (pat === 5) {
      // 池のまわりを同じ方向に進んで追いつく問題
      const b = [30, 40, 50, 60, 70][randInt(0, 4)];
      const diff = [10, 20, 30, 40, 50][randInt(0, 4)];
      const a = b + diff;
      answer = randInt(4, 25);
      const C = diff * answer;
      question = `1周${C}mの池のまわりを、Aさんは分速${a}m、Bさんは分速${b}mで、同じ地点から同じ方向に同時に出発しました。AさんがBさんに1周差をつけて追いつくのは、出発してから何分後ですか。`;
      steps = [
        `x分後に追いつくとすると、2人が進んだ道のりの差が1周分になる`,
        `${a}x − ${b}x = ${C}`,
        `${diff}x = ${C}`,
        `x = ${C} ÷ ${diff} = ${answer}`,
      ];
      wrongs = [answer + 1, answer - 1, Math.round(C / a)].filter((v) => v !== answer && v > 0);
    } else if (pat === 6) {
      // ケーキと箱の値段問題
      const box = randInt(50, 300);
      const c = randInt(20, 200);
      const cake = box + c;
      const n = randInt(2, 8);
      const total = n * cake + box;
      answer = cake;
      question = `ケーキの値段は、箱の値段より${c}円高く、ケーキ${n}個と箱1個を買うと、代金の合計は${total}円になりました。ケーキ1個の値段を求めなさい。`;
      steps = [
        `箱の値段をx円とすると、ケーキ1個の値段は(x+${c})円`,
        `${n}(x+${c}) + x = ${total}`,
        `${n}x + ${n * c} + x = ${total}`,
        `${n + 1}x = ${total} − ${n * c} = ${total - n * c}`,
        `x = ${total - n * c} ÷ ${n + 1} = ${box}`,
        `ケーキ1個の値段 = ${box} + ${c} = ${answer}`,
      ];
      wrongs = [box, answer + 10, answer - 10].filter((v) => v !== answer && v > 0);
    } else if (pat === 7) {
      // 往復問題: 行きと帰りで速さが異なり、往復の合計時間が分かっている
      const speeds = [3, 4, 5, 6, 8];
      let a, b; do { a = speeds[randInt(0, speeds.length - 1)]; b = speeds[randInt(0, speeds.length - 1)]; } while (a === b);
      const k = randInt(1, 3);
      answer = a * b * k;
      const t = (a + b) * k;
      if (answer > 80 || t > 10) return genEqWordProblemAdv1();
      question = `Pさんの家から公園までの道のりを、行きは時速${a}km、帰りは時速${b}kmで往復したところ、往復で合計${t}時間かかりました。家から公園までの道のりを求めなさい。`;
      steps = [
        `家から公園までの道のりをxkmとすると`,
        `x/${a} + x/${b} = ${t}`,
        `両辺に${a * b}をかけて: ${b}x + ${a}x = ${t * a * b}`,
        `${a + b}x = ${t * a * b}`,
        `x = ${t * a * b} ÷ ${a + b} = ${answer}`,
      ];
      wrongs = [answer + a, answer - a, a * b].filter((v) => v !== answer && v > 0);
    } else if (pat === 8) {
      // 連続する3つの奇数の和
      const base = randInt(6, 100);
      const mid = 2 * base + 1;
      const n = mid - 2, l = mid + 2;
      const sum = n + mid + l;
      const ask = randInt(0, 2);
      answer = ask === 0 ? n : ask === 2 ? l : mid;
      const askLabel = ask === 0 ? '小さい方' : ask === 2 ? '大きい方' : '真ん中';
      question = `連続する3つの奇数があります。この3つの数の和が${sum}であるとき、${askLabel}の数を求めなさい。`;
      steps = [
        `真ん中の奇数をxとすると、3つの奇数は (x−2)、x、(x+2)`,
        `(x−2) + x + (x+2) = ${sum}`,
        `3x = ${sum}`,
        `x = ${sum} ÷ 3 = ${mid}`,
      ];
      if (ask === 0) steps.push(`小さい方の数 = ${mid} − 2 = ${answer}`);
      if (ask === 2) steps.push(`大きい方の数 = ${mid} + 2 = ${answer}`);
      wrongs = [n, mid, l].filter((v) => v !== answer);
    } else {
      // 二時点の年齢比問題: 現在k1倍、y年後にk2倍になる
      const k1 = randInt(3, 6);
      const k2 = randInt(2, k1 - 1);
      const base = k2 - 1;
      const mult = randInt(2, 10);
      const x = base * mult;
      const y = mult * (k1 - k2);
      const fatherNow = k1 * x;
      if (x < 4 || x > 25 || y < 2 || y > 40 || fatherNow > 70) return genEqWordProblemAdv1();
      answer = x;
      question = `現在、母の年齢は子の年齢の${k1}倍です。${y}年後には、母の年齢は子の年齢の${k2}倍になります。現在の子の年齢を求めなさい。`;
      steps = [
        `現在の子の年齢をx歳とすると、母の年齢は${k1}x歳`,
        `${y}年後、子は(x+${y})歳、母は(${k1}x+${y})歳`,
        `${k1}x + ${y} = ${k2}(x + ${y})`,
        `${k1}x + ${y} = ${k2}x + ${k2 * y}`,
        `${k1}x − ${k2}x = ${k2 * y} − ${y}`,
        `${k1 - k2}x = ${k2 * y - y}`,
        `x = ${k2 * y - y} ÷ ${k1 - k2} = ${answer}`,
      ];
      wrongs = [answer + 2, answer - 2, y].filter((v) => v !== answer && v > 0);
    }
    return { category: 'eqWordProblemAdv1', question, questionHtml: stepToHtml(question), answer, choices: buildChoices(answer, wrongs), steps };
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
    let x = randNonZero(-5, 5), y = randNonZero(-5, 5);
    const askX = Math.random() < 0.5;
    const pat = randInt(0, 5);
    let q, eq1, eq2, eq1Html, answer, steps;
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
    } else if (pat === 2) {
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
    } else if (pat === 3) {
      // かっこを含む連立方程式: a(x+y) = c1, x − y = c2
      const a = randInt(2, 4);
      const c1 = a * (x + y), c2 = x - y;
      const sum = x + y;
      eq1 = `${a}(x + y) = ${c1}`; eq2 = `x − y = ${c2}`;
      q = `${eq1}、${eq2} のとき ${askX?'x':'y'} = ?`;
      steps = askX
        ? [`①を展開して${a}で割る: x + y = ${sum}`, `①＋②: 2x = ${sum + c2}`, `x = ${x}`]
        : [`①を展開して${a}で割る: x + y = ${sum}`, `①−②: 2y = ${sum - c2}`, `y = ${y}`];
      answer = askX ? x : y;
    } else if (pat === 4) {
      // 小数の係数を含む連立方程式: ax + y = c1（aは小数）, x + y = c2
      const aOptions = [0.5, 1.5, 2.5, 0.2, 0.4, 0.6, 0.8];
      const a = aOptions[randInt(0, aOptions.length - 1)];
      const c1 = Math.round((a * x + y) * 10) / 10, c2 = x + y;
      const diff = Math.round((c1 - c2) * 10) / 10;
      const denom = Math.round((a - 1) * 10) / 10;
      eq1 = `${a}x + y = ${c1}`; eq2 = `x + y = ${c2}`;
      q = `${eq1}、${eq2} のとき ${askX?'x':'y'} = ?`;
      if (askX) {
        steps = [`①−②: (${a}−1)x = ${diff}`, `${fmtNum(denom)}x = ${diff}`, `x = ${diff}÷${fmtNum(denom)} = ${x}`];
        answer = x;
      } else {
        steps = [`①−②: ${fmtNum(denom)}x = ${diff} → x = ${x}`, `②に代入: ${x} + y = ${c2}`, `y = ${c2-x} = ${y}`];
        answer = y;
      }
    } else {
      // 分数を含む連立方程式: x/a = y（つまり x = ay）, x + y = c2
      const a = [2, 3, 4, 5][randInt(0, 3)];
      y = randNonZero(-5, 5);
      x = a * y;
      const c2 = x + y;
      eq1 = `x/${a} = y`;
      eq1Html = `<span class="frac"><span class="num">x</span><span class="den">${a}</span></span> = y`;
      eq2 = `x + y = ${c2}`;
      q = `${eq1}、${eq2} のとき ${askX?'x':'y'} = ?`;
      steps = askX
        ? [`①より x = ${a}y`, `②に代入: ${a}y + y = ${c2}`, `${a+1}y = ${c2} → y = ${y}`, `x = ${a}×${y} = ${x}`]
        : [`①より x = ${a}y`, `②に代入: ${a}y + y = ${c2}`, `${a+1}y = ${c2}`, `y = ${y}`];
      answer = askX ? x : y;
    }
    const wrongs = [-answer, answer+1, answer-1].filter((v,i,arr)=>arr.indexOf(v)===i&&v!==answer);
    const questionHtml = stackLines(eq1Html || eq1, eq2, `のとき ${askX?'x':'y'} = ?`);
    return { category:'simul', question:q, questionHtml, answer, choices:buildChoices(answer,wrongs), steps };
  }

  // 連立方程式の文章題（中2）。2つの答え(x,y)を先に決めて、そこから問題文の
  // 数値を逆算して作ることで、常に綺麗な整数解になるようにしている。
  function genSimulEqWordProblem2() {
    const pat = randInt(0, 5);
    let question, answer, wrongs, steps;
    if (pat === 0) {
      // 個数と代金: りんごx個・みかんy個、合計n個・合計m円
      const x = randInt(2, 15), y = randInt(2, 15);
      const priceApple = [80, 100, 120, 150, 180][randInt(0, 4)];
      const priceMikan = [40, 50, 60, 80][randInt(0, 3)];
      const n = x + y;
      const m = priceApple * x + priceMikan * y;
      const askApple = Math.random() < 0.5;
      answer = askApple ? x : y;
      question = `1個${priceApple}円のりんごと1個${priceMikan}円のみかんを合わせて${n}個買ったところ、代金の合計は${m}円でした。${askApple ? 'りんご' : 'みかん'}は何個買いましたか。`;
      steps = [
        `りんごの個数をx個、みかんの個数をy個とすると`,
        `x + y = ${n} …①`,
        `${priceApple}x + ${priceMikan}y = ${m} …②`,
        `①より y = ${n} − x を②に代入して解くと、x = ${x}、y = ${y}`,
        `${askApple ? 'りんご' : 'みかん'}は ${answer} 個`,
      ];
      wrongs = [askApple ? y : x, answer + 1, answer - 1].filter((v, i, arr) => arr.indexOf(v) === i && v !== answer);
    } else if (pat === 1) {
      // 和差算: 2つの正の整数の和と差
      const x = randInt(10, 40), y = randInt(1, x - 1); // x > y、どちらも正の整数
      const p = x + y, q = x - y;
      const askLarger = Math.random() < 0.5;
      answer = askLarger ? x : y;
      question = `2つの正の整数があります。この2つの数の和は${p}、差は${q}です。${askLarger ? '大きい方' : '小さい方'}の数を求めなさい。`;
      steps = [
        `大きい方をx、小さい方をyとすると`,
        `x + y = ${p} …①`,
        `x − y = ${q} …②`,
        `①+②: 2x = ${p + q} → x = ${x}`,
        `①より y = ${p} − ${x} = ${y}`,
      ];
      wrongs = [askLarger ? y : x, answer + 1, answer - 1].filter((v, i, arr) => arr.indexOf(v) === i && v !== answer);
    } else if (pat === 2) {
      // 割合の問題: 2つの学年の人数のうち、それぞれ異なる割合の合計人数が分かっている
      const pctList = [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70];
      const r1 = pctList[randInt(0, pctList.length - 1)];
      const r2Cands = pctList.filter((v) => v !== r1);
      const r2 = r2Cands[randInt(0, r2Cands.length - 1)];
      const x = randInt(3, 15) * 20;
      const y = randInt(3, 15) * 20;
      const total = x + y;
      const sub = Math.round((r1 * x) / 100 + (r2 * y) / 100);
      const askX = Math.random() < 0.5;
      answer = askX ? x : y;
      question = `ある中学校の1, 2年生${total}人のうち、1年生の${r1}%と2年生の${r2}%が自転車通学していて、その人数の合計は${sub}人です。1年生の人数をx人、2年生の人数をy人として、${askX ? '1' : '2'}年生の人数を求めなさい。`;
      steps = [
        `x + y = ${total} …①`,
        `${r1}/100 x + ${r2}/100 y = ${sub} …②`,
        `①、②を連立方程式として解くと、x = ${x}、y = ${y}`,
        `${askX ? '1' : '2'}年生の人数は ${answer} 人`,
      ];
      wrongs = [askX ? y : x, answer + 20, answer - 20].filter((v, i, arr) => arr.indexOf(v) === i && v !== answer && v > 0);
    } else if (pat === 3) {
      // 割合の増減の問題: 定価から割り引いた代金の合計と、定価の合計からx, yを求める
      const discList = [10, 20, 30, 40, 50];
      const d1 = discList[randInt(0, discList.length - 1)];
      const d2Cands = discList.filter((v) => v !== d1);
      const d2 = d2Cands[randInt(0, d2Cands.length - 1)];
      const x = randInt(20, 100) * 10;
      const y = randInt(20, 100) * 10;
      const totalList = x + y;
      const keep1 = 100 - d1, keep2 = 100 - d2;
      const discountedTotal = Math.round((keep1 * x) / 100 + (keep2 * y) / 100);
      const askX = Math.random() < 0.5;
      answer = askX ? x : y;
      question = `ある店で、シャツとかばんを1つずつ買いました。シャツは定価の${d1}%引き、かばんは定価の${d2}%引きだったので、実際に払った代金の合計は${discountedTotal}円でした。シャツとかばんの定価の合計は${totalList}円だったとき、シャツの定価をx円、かばんの定価をy円として、${askX ? 'シャツ' : 'かばん'}の定価を求めなさい。`;
      steps = [
        `x + y = ${totalList} …①`,
        `${keep1}/100 x + ${keep2}/100 y = ${discountedTotal} …②`,
        `①、②を連立方程式として解くと、x = ${x}、y = ${y}`,
        `${askX ? 'シャツ' : 'かばん'}の定価は ${answer} 円`,
      ];
      wrongs = [askX ? y : x, answer + 100, answer - 100].filter((v, i, arr) => arr.indexOf(v) === i && v !== answer && v > 0);
    } else if (pat === 4) {
      // 食塩水の問題: 濃度の異なる2種類の食塩水を混ぜる
      const c1 = randInt(2, 15);
      const c2Cands = [];
      for (let v = 2; v <= 20; v++) if (v !== c1) c2Cands.push(v);
      const c2 = c2Cands[randInt(0, c2Cands.length - 1)];
      const x = randInt(1, 8) * 100;
      const y = randInt(1, 8) * 100;
      const totalWeight = x + y;
      const saltTotal = Math.round((c1 * x) / 100 + (c2 * y) / 100);
      const askX = Math.random() < 0.5;
      answer = askX ? x : y;
      question = `${c1}%の食塩水と${c2}%の食塩水を混ぜて、${totalWeight}gの食塩水を作ります。${c1}%の食塩水をxg、${c2}%の食塩水をyg混ぜるとして、含まれる食塩の重さの合計が${saltTotal}gになるとき、${c1}%の食塩水と${c2}%の食塩水を、xとyを使った連立方程式を解いて、${askX ? c1 + '%' : c2 + '%'}の食塩水は何g混ぜたか求めなさい。`;
      steps = [
        `x + y = ${totalWeight} …①`,
        `${c1}/100 x + ${c2}/100 y = ${saltTotal} …②`,
        `①、②を連立方程式として解くと、x = ${x}、y = ${y}`,
        `${askX ? c1 + '%' : c2 + '%'}の食塩水は ${answer} g`,
      ];
      wrongs = [askX ? y : x, answer + 100, answer - 100].filter((v, i, arr) => arr.indexOf(v) === i && v !== answer && v > 0);
    } else {
      // 速さの問題: 速さが異なる2区間の道のりを、合計の道のりとかかった時間から求める
      const speedList = [8, 10, 12, 15, 16, 20];
      const speed1 = speedList[randInt(0, speedList.length - 1)];
      const speed2Cands = speedList.filter((v) => v !== speed1);
      const speed2 = speed2Cands[randInt(0, speed2Cands.length - 1)];
      const k1 = randInt(1, 4), k2 = randInt(1, 4);
      const x = speed1 * k1, y = speed2 * k2;
      const totalDistance = x + y, totalTime = k1 + k2;
      const askX = Math.random() < 0.5;
      answer = askX ? x : y;
      question = `全長${totalDistance}kmの道のりをサイクリングします。前半は時速${speed1}km、後半は時速${speed2}kmで進み、全体で${totalTime}時間かかりました。前半の道のりをxkm、後半の道のりをykmとして連立方程式をつくり、${askX ? '前半' : '後半'}の道のりを求めなさい。`;
      steps = [
        `x + y = ${totalDistance} …①`,
        `x/${speed1} + y/${speed2} = ${totalTime} …②`,
        `①、②を連立方程式として解くと、x = ${x}、y = ${y}`,
        `${askX ? '前半' : '後半'}の道のりは ${answer} km`,
      ];
      wrongs = [askX ? y : x, answer + speed1, answer - speed1].filter((v, i, arr) => arr.indexOf(v) === i && v !== answer && v > 0);
    }
    return { category: 'simulEqWordProblem2', question, questionHtml: stepToHtml(question), answer, choices: buildChoices(answer, wrongs), steps };
  }

  // 連立方程式の文章題の応用（中2）。genSimulEqWordProblem2と同様、答え(x,y)を
  // 先に決めてから問題文の数値を逆算する。
  function genSimulEqWordProblemAdv2() {
    const pat = randInt(0, 6);
    let question, answer, wrongs, steps;
    if (pat === 0) {
      // 峠越えの往復問題: 上り・下りの速さが決まっていて、往復それぞれの所要時間から道のりを求める
      const PAIRS = [[3, 6], [4, 8], [2, 6], [2, 4], [5, 10], [4, 12], [6, 12], [2, 8], [3, 12]];
      const [su, sd] = PAIRS[randInt(0, PAIRS.length - 1)];
      const k = sd / su, g = sd / 2;
      let a, b, x, y, t1h, t2h;
      for (let tries = 0; tries < 30; tries++) {
        a = randInt(1, 6); b = randInt(1, 6);
        x = g * a; y = g * b;
        t1h = k * a + b; t2h = k * b + a;
        if (x >= 1 && x <= 60 && y >= 1 && y <= 60 && t1h >= 2 && t1h <= 20 && t2h >= 2 && t2h <= 20) break;
      }
      if (!(x >= 1 && x <= 60 && y >= 1 && y <= 60)) return genSimulEqWordProblemAdv2();
      const askWhich = randInt(0, 2);
      answer = askWhich === 0 ? x : askWhich === 1 ? y : x + y;
      const t1Label = fmtHM_(t1h * 30), t2Label = fmtHM_(t2h * 30);
      const askLabel = askWhich === 0 ? 'A町から峠の頂上までの道のり' : askWhich === 1 ? '峠の頂上からB町までの道のり' : 'A町からB町までの道のり';
      question = `A町から峠を越えてB町まで往復します。行きも帰りも上りは時速${su}km、下りは時速${sd}kmで歩くと、行きは${t1Label}、帰りは${t2Label}かかりました。${askLabel}を求めなさい。`;
      steps = [
        `A町から峠の頂上までの道のりをxkm、頂上からB町までの道のりをykmとすると`,
        `行き(上りx・下りy): x/${su} + y/${sd} = ${t1h}/2 …①`,
        `帰り(上りy・下りx): y/${su} + x/${sd} = ${t2h}/2 …②`,
        `①、②を解くと、x=${x}、y=${y}`,
        askWhich === 2 ? `A町からB町までの道のり = ${x}+${y} = ${answer}km` : `答え: ${answer}km`,
      ];
      wrongs = [askWhich === 0 ? y : x, x + y, answer + g].filter((v, i, arr) => arr.indexOf(v) === i && v !== answer && v > 0);
    } else if (pat === 1) {
      // 2桁の自然数の入れ替え問題
      let x, y;
      do { x = randInt(1, 9); y = randInt(0, 9); } while (x === y);
      const S = x + y;
      const diff = 9 * (y - x);
      answer = 10 * x + y;
      question = `十の位の数と一の位の数の和が${S}である2桁の自然数があります。この数の十の位の数と一の位の数を入れかえると、もとの数より${Math.abs(diff)}${diff > 0 ? '大きく' : '小さく'}なります。もとの自然数を求めなさい。`;
      steps = [
        `もとの数の十の位の数をx、一の位の数をyとすると`,
        `x + y = ${S} …①`,
        `(10y+x) − (10x+y) = ${diff} → 9y − 9x = ${diff} → y − x = ${diff / 9} …②`,
        `①、②を解くと、x=${x}、y=${y}`,
        `もとの自然数 = 10×${x} + ${y} = ${answer}`,
      ];
      wrongs = [10 * y + x, answer + 9, answer - 9].filter((v) => v !== answer && v > 0);
    } else if (pat === 2) {
      // 割合の増減で全体数が変わらない問題(アルミ缶・スチール缶)
      const m = randInt(2, 15);
      const x = 20 * m, y = 25 * m; // 先月のアルミ缶・スチール缶
      const total = x + y;
      const nowAlum = 21 * m, nowSteel = 24 * m; // 今月(アルミ+5%、スチール-4%)
      const askWhich = randInt(0, 1);
      answer = askWhich === 0 ? nowAlum : nowSteel;
      question = `A中学校の生徒が拾ったアルミ缶とスチール缶の個数は、先月合わせて${total}個でした。今月は、アルミ缶の個数が5%増え、スチール缶の個数は4%減りましたが、全体の個数は変わりませんでした。先月拾ったアルミ缶の個数をx個、スチール缶の個数をy個として、今月拾った${askWhich === 0 ? 'アルミ缶' : 'スチール缶'}の個数を求めなさい。`;
      steps = [
        `x + y = ${total} …①`,
        `1.05x + 0.96y = ${total} …②(全体の個数は変わらない)`,
        `①、②を解くと、x=${x}、y=${y}`,
        `今月のアルミ缶 = 1.05×${x} = ${nowAlum}個、今月のスチール缶 = 0.96×${y} = ${nowSteel}個`,
      ];
      wrongs = [askWhich === 0 ? nowSteel : nowAlum, answer + m, answer - m].filter((v) => v !== answer && v > 0);
    } else if (pat === 3) {
      // 列車が鉄橋・トンネルを通過する問題
      let x, y, t1, t2, L1, L2;
      for (let tries = 0; tries < 30; tries++) {
        x = randInt(80, 300); y = randInt(15, 30);
        t1 = randInt(10, 25); t2 = randInt(t1 + 15, t1 + 60);
        L1 = y * t1 - x; L2 = y * t2 - x;
        if (L1 >= 80 && L1 <= 3000 && L2 > L1 && L2 <= 6000) break;
      }
      if (!(L1 >= 80 && L2 > L1)) return genSimulEqWordProblemAdv2();
      const askWhich = randInt(0, 1);
      answer = askWhich === 0 ? x : y;
      question = `ある列車が、長さ${L1}mの鉄橋を渡り始めてから渡り終わるまでに${t1}秒かかり、長さ${L2}mのトンネルに入り始めてから出てしまうまでに${t2}秒かかりました。列車の長さをxm、速さを秒速ymとして、${askWhich === 0 ? '列車の長さ' : '列車の速さ(秒速)'}を求めなさい。`;
      steps = [
        `鉄橋: x + ${L1} = ${t1}y …①`,
        `トンネル: x + ${L2} = ${t2}y …②`,
        `②−①: ${L2 - L1} = ${t2 - t1}y`,
        `y = ${L2 - L1} ÷ ${t2 - t1} = ${y}`,
        `①に代入: x = ${t1}×${y} − ${L1} = ${x}`,
      ];
      wrongs = [askWhich === 0 ? y : x, answer + 5, answer - 5].filter((v) => v !== answer && v > 0);
    } else if (pat === 4) {
      // 池のまわりを回る出会い・追いつき問題(兄・妹両方の速さを連立方程式で求める)
      let a, b, diff, k, t1, t2, C;
      for (let tries = 0; tries < 30; tries++) {
        a = randInt(80, 180); diff = randInt(20, 80); b = a - diff;
        if (b < 20) continue;
        k = randInt(1, 3);
        t1 = k * diff; t2 = k * (a + b); C = k * (a * a - b * b);
        if (C >= 500 && C <= 6000 && t1 >= 3 && t1 <= 40 && t2 > t1 && t2 <= 90) break;
      }
      if (!(C >= 500 && C <= 6000)) return genSimulEqWordProblemAdv2();
      const askWhich = randInt(0, 1);
      answer = askWhich === 0 ? a : b;
      question = `周囲${C}mの池があります。このまわりを兄は走って、妹は歩いて、同じ地点を同時に出発します。反対方向にまわると、${t1}分後に出会います。また、同じ方向にまわると、${t2}分後に兄は妹に追いつきます。${askWhich === 0 ? '兄' : '妹'}の速さ(分速)を求めなさい。`;
      steps = [
        `兄の分速をxm、妹の分速をymとすると`,
        `反対方向: (x+y)×${t1} = ${C} → x+y = ${a + b} …①`,
        `同じ方向: (x−y)×${t2} = ${C} → x−y = ${diff} …②`,
        `①、②を解くと、x=${a}、y=${b}`,
      ];
      wrongs = [askWhich === 0 ? b : a, answer + 10, answer - 10].filter((v) => v !== answer && v > 0);
    } else if (pat === 5) {
      // 濃度の異なる2種類の砂糖水A・Bの濃さを求める問題
      const RATIOS = [[5, 3], [3, 1], [1, 1], [2, 1], [3, 2], [4, 1], [1, 3], [2, 3], [1, 2], [4, 3]];
      let idx1, idx2;
      do { idx1 = randInt(0, RATIOS.length - 1); idx2 = randInt(0, RATIOS.length - 1); } while (idx1 === idx2 || RATIOS[idx1][0] * RATIOS[idx2][1] === RATIOS[idx1][1] * RATIOS[idx2][0]);
      const [p1, q1] = RATIOS[idx1], [p2, q2] = RATIOS[idx2];
      const s1 = p1 + q1, s2 = p2 + q2;
      const L = lcmFrac(s1, s2);
      const m1 = L / s1, m2 = L / s2;
      let a, b, u, conc1, conc2;
      for (let tries = 0; tries < 30; tries++) {
        u = randInt(1, 3);
        a = randInt(5, 30);
        b = a + L * u;
        conc1 = a + q1 * u * m1;
        conc2 = a + q2 * u * m2;
        if (b >= 3 && b <= 65 && conc1 >= 1 && conc1 <= 90 && conc2 >= 1 && conc2 <= 90) break;
      }
      if (!(b >= 3 && b <= 65)) return genSimulEqWordProblemAdv2();
      const unit1 = [50, 100, 150, 200][randInt(0, 3)];
      const unit2 = [50, 100, 150, 200][randInt(0, 3)];
      const w1A = p1 * unit1, w1B = q1 * unit1, total1 = w1A + w1B;
      const w2A = p2 * unit2, w2B = q2 * unit2, total2 = w2A + w2B;
      const askWhich = randInt(0, 1);
      answer = askWhich === 0 ? a : b;
      question = `2種類の砂糖水A、Bがあります。砂糖水A ${w1A}gと砂糖水B ${w1B}gを混ぜ合わせると${conc1}%の砂糖水ができ、砂糖水A ${w2A}gと砂糖水B ${w2B}gを混ぜ合わせると${conc2}%の砂糖水ができます。このとき、砂糖水${askWhich === 0 ? 'A' : 'B'}の濃さを求めなさい。`;
      steps = [
        `砂糖水Aの濃さをx%、砂糖水Bの濃さをy%とすると`,
        `${w1A}x + ${w1B}y = ${total1}×${conc1} …①`,
        `${w2A}x + ${w2B}y = ${total2}×${conc2} …②`,
        `①、②を解くと、x=${a}、y=${b}`,
      ];
      wrongs = [askWhich === 0 ? b : a, answer + 5, answer - 5].filter((v) => v !== answer && v > 0);
    } else {
      // 兄弟でお金を出し合って本を買う割合の問題
      let x, y, r1, r2, price, keep1, keep2, diff;
      const RATE_LIST = [10, 15, 20, 25, 30, 35, 40, 45, 50];
      for (let tries = 0; tries < 30; tries++) {
        x = randInt(15, 50) * 100; y = randInt(15, 50) * 100;
        r1 = RATE_LIST[randInt(0, RATE_LIST.length - 1)];
        do { r2 = RATE_LIST[randInt(0, RATE_LIST.length - 1)]; } while (r2 === r1);
        price = (r1 * x) / 100 + (r2 * y) / 100;
        keep1 = 100 - r1; keep2 = 100 - r2;
        diff = (keep2 * y) / 100 - (keep1 * x) / 100;
        if (price >= 500 && price <= 6000 && Math.abs(diff) >= 50 && Math.abs(diff) <= 2000) break;
      }
      if (!(price >= 500 && price <= 6000)) return genSimulEqWordProblemAdv2();
      const askWhich = randInt(0, 1);
      answer = askWhich === 0 ? x : y;
      const bigger = diff >= 0 ? '弟' : '兄', smaller = diff >= 0 ? '兄' : '弟';
      question = `兄と弟でお金を出し合って、${price}円の本を1冊買います。兄は自分の所持金の${r1}%、弟は自分の所持金の${r2}%を出して、代金をちょうど払いました。本を買った後、2人の残金を比べたところ、${bigger}の所持金が${smaller}より${Math.abs(diff)}円多くなりました。本を買う前の${askWhich === 0 ? '兄' : '弟'}の所持金を求めなさい。`;
      steps = [
        `兄の所持金をx円、弟の所持金をy円とすると`,
        `${r1}/100 x + ${r2}/100 y = ${price} …①`,
        `${keep2}/100 y − ${keep1}/100 x = ${diff} …②`,
        `①、②を解くと、x=${x}、y=${y}`,
      ];
      wrongs = [askWhich === 0 ? y : x, answer + 500, answer - 500].filter((v) => v !== answer && v > 0);
    }
    return { category: 'simulEqWordProblemAdv2', question, questionHtml: stepToHtml(question), answer, choices: buildChoices(answer, wrongs), steps };
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

    const pat = randInt(0, 6);
    let question, answer, choices, steps;

    if (pat === 3) {
      // 共通因数をくくり出す：cax² + cbx の形
      // (a, bは互いに素でなければならない。そうでないと、cが本当の最大公約数に
      // ならず「答えの選択肢に正しい共通因数が出てこない」不具合になる)
      const c = randInt(2, 9);
      const a = randNonZero(1, 8);
      let b; do { b = randNonZero(-8, 8); } while (b === 0 || gcdFrac(a, Math.abs(b)) !== 1);
      const coefA = c * a, coefB = c * b;
      const bTerm = b > 0 ? `+ ${coefB}x` : `− ${Math.abs(coefB)}x`;
      question = `${coefA}x² ${bTerm} を因数分解せよ。`;
      const inner = a === 1 ? 'x' : `${a}x`;
      const innerB = b > 0 ? `+${b}` : `${b}`;
      answer = `${c}x(${inner}${innerB})`;
      steps = [`共通因数 ${c}x をくくり出す`, `${coefA}x² ${bTerm} = ${c}x × (${inner}${innerB})`, `= ${answer}`];
      choices = shuffle([answer, `${c}(${inner}${innerB})`, `x(${a}x${innerB})`, `${c}x(${a + 1}x${innerB})`]);
    } else if (pat === 4) {
      // 2変数の完全平方：x² + 2axy + a²y²
      const a = randInt(1, 8);
      const p = 2 * a, qc = a * a;
      const qcTerm = qc === 1 ? 'y²' : `${qc}y²`;
      question = `x² + ${p}xy + ${qcTerm} を因数分解せよ。`;
      answer = `(x+${a}y)²`;
      steps = [`x² + 2axy + a²y² = (x+ay)² の公式を使う`, `a² = ${qc} → a = ${a}、2a = ${p} ✓`, `= ${answer}`];
      choices = shuffle([answer, `(x-${a}y)²`, `(x+${a}y)(x-${a}y)`, `(x+${a + 1}y)²`]);
    } else if (pat === 5) {
      // 置き換え型：(x+k)² + p(x+k) + q の形
      const k = randNonZero(-6, 6);
      let r1, r2; do { r1 = randNonZero(-7, 7); r2 = randNonZero(-7, 7); } while (r1 === r2);
      const coefMid = -(r1 + r2), coefConst = r1 * r2;
      const kStr = k >= 0 ? `+${k}` : `${k}`;
      const midSign = coefMid >= 0 ? '+' : '−';
      const midAbs = Math.abs(coefMid);
      const midTermStr = midAbs === 1 ? `(x${kStr})` : `${midAbs}(x${kStr})`;
      const constTermStr = coefConst >= 0 ? `+ ${coefConst}` : `− ${Math.abs(coefConst)}`;
      question = `(x${kStr})² ${midSign} ${midTermStr} ${constTermStr} を因数分解せよ。`;
      const f1 = k - r1, f2 = k - r2;
      answer = `${ff(f1)}${ff(f2)}`;
      steps = [`x${kStr} をXとおくと、X² ${midSign} ${midAbs}X ${constTermStr} の形`, `X = ${r1}、${r2} で因数分解できる`, `Xをx${kStr}にもどす`, `= ${answer}`];
      choices = shuffle([answer, `${ff(-f1)}${ff(f2)}`, `${ff(f1)}${ff(-f2)}`, `${ff(r1)}${ff(r2)}`].filter((v, i, arr) => arr.indexOf(v) === i));
      if (choices.length < 4) choices.push(`${ff(f1 + 1)}${ff(f2)}`);
    } else if (pat === 6) {
      // (x+y)² − n² の形
      const n = randInt(2, 9);
      question = `(x+y)² − ${n * n} を因数分解せよ。`;
      answer = `(x+y+${n})(x+y-${n})`;
      steps = [`(x+y)² − n² = {(x+y)+n}{(x+y)−n} の公式を使う`, `n² = ${n * n} → n = ${n}`, `= ${answer}`];
      choices = shuffle([answer, `(x+y+${n})(x+y+${n})`, `(x+y-${n})(x+y-${n})`, `(x+y+${n + 1})(x+y-${n + 1})`]);
    } else if (pat === 0) {
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
      q = `${sqrtStr(n, a)} + ${sqrtStr(m, a)} = ?`;
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
      q = `${sqrtStr(n, a)} − ${sqrtStr(m, a)} = ?`;
      const answerStr = sqrtStr(result, a);
      steps = [`√${a} を文字のように扱う`, `(${n} − ${m})√${a} = ${answerStr}`];
      return { category:'sqrt', question:q, answer: answerStr, choices: buildChoicesFromList(answerStr, [sqrtStr(n+m, a), sqrtStr(result+1, a), sqrtStr(Math.max(1,result-1), a), sqrtStr(result, otherA)]), steps };
    }
    return { category:'sqrt', question:q, answer, choices:buildChoices(answer,wrongs), steps };
  }

  function genQuadratic() {
    const pat = randInt(0, 5);
    let q, answer, choices, steps;
    function fr(n) { return n < 0 ? `−${Math.abs(n)}` : `${n}`; }
    function roots(r1, r2) { return `x = ${fr(r1)}, ${fr(r2)}`; }

    if (pat === 3) {
      // ax² = b の形（平方根を使う）
      const x0 = randInt(2, 9);
      const a = randInt(2, 6);
      const b = a * x0 * x0;
      q = `${a}x² = ${b} を解け。`;
      answer = `x = ±${x0}`;
      steps = [`x² = ${b} ÷ ${a} = ${x0 * x0}`, `x = ±√${x0 * x0} = ±${x0}`];
      choices = shuffle([answer, `x = ${x0}`, `x = ±${x0 + 1}`, `x = ±${x0 > 1 ? x0 - 1 : x0 + 2}`]);
    } else if (pat === 4) {
      // 展開してから整理して解く：(x+p)(x+q) = rx + s の形
      const r1 = randNonZero(-8, 8);
      let r2; do { r2 = randNonZero(-8, 8); } while (r2 === r1);
      const p = randNonZero(-6, 6);
      let qq; do { qq = randNonZero(-6, 6); } while (qq === p);
      const rCoef = p + qq + r1 + r2;
      const sConst = p * qq - r1 * r2;
      const pS = p >= 0 ? `+ ${p}` : `− ${Math.abs(p)}`;
      const qS = qq >= 0 ? `+ ${qq}` : `− ${Math.abs(qq)}`;
      const rS = rCoef >= 0 ? `${rCoef}x` : `−${Math.abs(rCoef)}x`;
      const sS = sConst >= 0 ? `+ ${sConst}` : `− ${Math.abs(sConst)}`;
      q = `(x ${pS})(x ${qS}) = ${rS} ${sS} を解け。`;
      const rlo = Math.min(r1, r2), rhi = Math.max(r1, r2);
      answer = roots(rlo, rhi);
      steps = [`左辺を展開して整理する`, `x² + ${fr(-(r1 + r2))}x + ${fr(r1 * r2)} = 0`, `因数分解して x = ${fr(r1)}, ${fr(r2)}`];
      choices = shuffle([answer, roots(-rlo, -rhi), roots(rlo - 1, rhi), roots(rlo, rhi + 1)]);
    } else if (pat === 5) {
      // 置き換え型：(x+k)² + p(x+k) + q = 0
      const k = randNonZero(-6, 6);
      let m1, m2; do { m1 = randNonZero(-7, 7); m2 = randNonZero(-7, 7); } while (m1 === m2);
      const coefMid = -(m1 + m2), coefConst = m1 * m2;
      const kStr = k >= 0 ? `+${k}` : `${k}`;
      const midSign = coefMid >= 0 ? '+' : '−';
      const midAbs = Math.abs(coefMid);
      const midTermStr = midAbs === 1 ? `(x${kStr})` : `${midAbs}(x${kStr})`;
      const constTermStr = coefConst >= 0 ? `+ ${coefConst}` : `− ${Math.abs(coefConst)}`;
      q = `(x${kStr})² ${midSign} ${midTermStr} ${constTermStr} = 0 を解け。`;
      const x1 = m1 - k, x2 = m2 - k;
      const xlo = Math.min(x1, x2), xhi = Math.max(x1, x2);
      answer = roots(xlo, xhi);
      steps = [`x${kStr} をXとおくと、X² ${midSign} ${midAbs}X ${constTermStr} = 0`, `X = ${m1}, ${m2}`, `x${kStr} = ${m1} または x${kStr} = ${m2}`, `= ${answer}`];
      choices = shuffle([answer, roots(-xlo, -xhi), roots(xlo - 1, xhi), roots(xlo, xhi + 1)]);
    } else if (pat === 0) {
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

  // 二次方程式の文章題（中3）。答えとなる整数を先に決め、そこから問題文の
  // 数値を逆算して作ることで、常に綺麗な整数解になるようにしている。
  function genQuadEqWordProblem3() {
    const pat = randInt(0, 5);
    let question, answer, wrongs, steps;
    if (pat === 0) {
      // 連続する2つの正の整数の積
      answer = randInt(3, 20);
      const next = answer + 1;
      const product = answer * next;
      question = `連続する2つの正の整数があります。この2つの数の積が${product}であるとき、小さい方の整数を求めなさい。`;
      steps = [
        `小さい方の整数をxとすると、大きい方は x + 1`,
        `x(x + 1) = ${product}`,
        `x² + x − ${product} = 0`,
        `(x − ${answer})(x + ${next}) = 0`,
        `x は正の整数なので x = ${answer}`,
      ];
      wrongs = [next, answer - 1, answer + 2];
    } else if (pat === 1) {
      // 長方形: 縦が横よりdcm短い
      answer = randInt(5, 15); // 横の長さ
      const d = randInt(1, Math.min(5, answer - 1));
      const tate = answer - d;
      const area = answer * tate;
      question = `縦の長さが横の長さより${d}cm短い長方形があります。面積が${area}cm²であるとき、横の長さを求めなさい。`;
      steps = [
        `横の長さをxcmとすると、縦の長さは (x − ${d})cm`,
        `x(x − ${d}) = ${area}`,
        `x² − ${d}x − ${area} = 0`,
        `(x − ${answer})(x + ${tate + answer}) = 0`,
        `x > ${d} なので x = ${answer}`,
      ];
      wrongs = [tate, answer + 1, answer - 1];
    } else if (pat === 2) {
      // 正方形の1辺をdcm伸ばしてできる長方形
      answer = randInt(3, 12); // もとの正方形の1辺
      const d = randInt(1, 6);
      const area = answer * (answer + d);
      question = `1辺の長さがxcmの正方形があります。1辺を${d}cm伸ばして長方形を作ったところ、面積が${area}cm²になりました。もとの正方形の1辺の長さを求めなさい。`;
      steps = [
        `もとの正方形の1辺をxcmとすると、長方形の面積は x(x + ${d})`,
        `x(x + ${d}) = ${area}`,
        `x² + ${d}x − ${area} = 0`,
        `(x − ${answer})(x + ${answer + d}) = 0`,
        `x は正の数なので x = ${answer}`,
      ];
      wrongs = [answer + d, answer + 1, answer - 1].filter((v) => v !== answer);
    } else if (pat === 3) {
      // 連続する2つの自然数の2乗の和
      const n = randInt(1, 15);
      const s = n * n + (n + 1) * (n + 1);
      question = `連続する2つの自然数があります。それぞれを2乗した数の和が${s}になるとき、小さい方の自然数を求めなさい。`;
      steps = [
        `小さい方の自然数をxとすると、大きい方は x + 1`,
        `x² + (x + 1)² = ${s}`,
        `2x² + 2x + 1 = ${s}`,
        `x² + x − ${n * (n + 1)} = 0`,
        `(x − ${n})(x + ${n + 1}) = 0`,
        `x は正の整数なので x = ${n}`,
      ];
      answer = n;
      wrongs = [n + 1, n - 1, n + 2].filter((v) => v !== answer);
    } else if (pat === 4) {
      // 長方形の畑に同じ幅の道(縦横)を作り、残りの面積から道幅を求める
      const H = randInt(16, 30);
      const W = randInt(16, 30);
      const maxWidth = Math.max(2, Math.min(H, W) - 5);
      answer = randInt(2, maxWidth);
      const area = (H - answer) * (W - answer);
      const otherRoot = H + W - answer;
      question = `縦${H}m、横${W}mの長方形の畑があります。畑の中に、縦と横に同じ幅の道を作ります。道の幅をxmとすると、残りの畑の面積は (${H} − x)(${W} − x) と表されます。残りの畑の面積が${area}m²であるとき、道の幅を求めなさい。`;
      steps = [
        `(${H} − x)(${W} − x) = ${area}`,
        `x² − ${H + W}x + ${H * W} = ${area}`,
        `x² − ${H + W}x + ${H * W - area} = 0`,
        `(x − ${answer})(x − ${otherRoot}) = 0`,
        `0 < x < ${Math.min(H, W)} なので x = ${answer}`,
      ];
      wrongs = [otherRoot, answer + 1, answer - 1].filter((v) => v !== answer && v > 0);
    } else {
      // 長方形の厚紙の4すみを切り取って作る、ふたのない箱の容積
      const c = randInt(2, 5);
      answer = randInt(2 * c + 6, 2 * c + 20); // もとの厚紙の縦の長さ
      const D = randInt(1, 6); // 横は縦よりDcm長い
      const yoko = answer + D;
      const volume = c * (answer - 2 * c) * (yoko - 2 * c);
      const otherRoot = 4 * c - D - answer;
      const yokoOffset = D - 2 * c;
      const yokoOffsetStr = yokoOffset === 0 ? 'x' : yokoOffset > 0 ? `x + ${yokoOffset}` : `x − ${Math.abs(yokoOffset)}`;
      const otherRootStr = otherRoot >= 0 ? `(x − ${otherRoot})` : `(x + ${-otherRoot})`;
      question = `縦が横より${D}cm短い長方形の厚紙があります。この厚紙の4すみから1辺が${c}cmの正方形を切り取り、ふたのない箱を作ったところ、容積が${volume}cm³になりました。もとの厚紙の縦の長さを求めなさい。`;
      steps = [
        `縦の長さをxcmとすると、横の長さは (x + ${D})cm`,
        `箱の底面は縦(x − ${2 * c})cm、横(${yokoOffsetStr})cm、高さ${c}cm`,
        `${c}(x − ${2 * c})(${yokoOffsetStr}) = ${volume}`,
        `(x − ${answer})${otherRootStr} = 0`,
        `x > ${2 * c} なので x = ${answer}`,
      ];
      wrongs = [yoko, answer + 1, answer - 1].filter((v) => v !== answer && v > 0);
    }
    return { category: 'quadEqWordProblem3', question, questionHtml: stepToHtml(question), answer, choices: buildChoices(answer, wrongs), steps };
  }

  /* ---------- 比例・反比例 ---------- */

  function makeTbl(xs, ys) {
    const row = (label, vals) =>
      `<tr><th>${label}</th>${vals.map(v=>`<td>${v}</td>`).join('')}</tr>`;
    return `<table class="q-table"><tbody>${row('x',xs)}${row('y',ys)}</tbody></table>`;
  }

  function genProportion() {
    const pat = randInt(0, 7);
    let question, questionHtml, answer, steps, wrongs;
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
      questionHtml = `y = <span class="frac"><span class="num">${a}</span><span class="den">x</span></span> で x = ${x} のとき y = ?`;
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
      questionHtml = `反比例のグラフが点 (${x}, ${y}) を通る。y = <span class="frac"><span class="num">a</span><span class="den">x</span></span> の a は？`;
      steps = [`y = a/x に代入: ${y} = a ÷ ${fmtNum(x)}`, `a = ${x} × ${y} = ${a}`];
      answer = a; wrongs = [-a, x+y, a+1];
    }
    return { category:'proportion', question, questionHtml, answer, choices:buildChoices(answer, wrongs), steps };
  }

  /* ---------- 一次関数 ---------- */

  function linearEqStr(a, b) {
    const aD = a === 1 ? '' : a === -1 ? '−' : `${a}`;
    if (b === 0) return `y = ${aD}x`;
    const bS = b < 0 ? `− ${Math.abs(b)}` : `+ ${b}`;
    return `y = ${aD}x ${bS}`;
  }

  function genLinear() {
    const a = randNonZero(-5, 5);
    const aD = a===1?'':a===-1?'−':`${a}`;
    const pat = randInt(0, 10);
    let question, answer, steps, wrongs;
    if (pat === 8) {
      // xの増加量・yの増加量を求める
      const b = randNonZero(-8, 8), bS = b<0?`− ${Math.abs(b)}`:`+ ${b}`;
      const x1 = randInt(-8, 3), x2 = x1 + randInt(2, 8);
      const askDx = Math.random() < 0.5;
      const dx = x2 - x1, dy = a * dx;
      question = `一次関数 y = ${aD}x ${bS} で、xの値が${x1}から${x2}まで増加したときの、${askDx ? 'xの増加量' : 'yの増加量'}を求めなさい。`;
      answer = askDx ? dx : dy;
      wrongs = [askDx ? dy : dx, answer + 1, Math.max(1, answer - 1)].filter(v => v !== answer);
      steps = askDx ? [`xの増加量 = ${x2} − ${fmtNum(x1)} = ${dx}`] : [`xの増加量 = ${x2} − ${fmtNum(x1)} = ${dx}`, `yの増加量 = 傾き × xの増加量 = ${aD || 1} × ${dx} = ${dy}`];
      return { category: 'linear', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 9) {
      // 平行な直線の式を求める
      const mb = randNonZero(-8, 8);
      const x1 = randNonZero(-5, 5), y1 = randNonZero(-8, 8);
      const b = y1 - a * x1;
      const answerStr = linearEqStr(a, b);
      question = `グラフが直線 ${linearEqStr(a, mb)} に平行で、点 (${x1}, ${y1}) を通る一次関数の式は？`;
      steps = [
        `平行な直線は傾きが等しいので a = ${a}`,
        `y = ${aD}x + b に (${x1}, ${y1}) を代入`,
        `b = ${y1} − ${fmtNum(a * x1)} = ${b}`,
        `${answerStr}`,
      ];
      const candidates = [
        linearEqStr(a, -b),
        linearEqStr(-a, b),
        linearEqStr(a, b + 1),
        linearEqStr(a + 1, b),
      ];
      return { category: 'linear', question, answer: answerStr, choices: buildChoicesFromList(answerStr, candidates), steps };
    } else if (pat === 0) {
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
      const b = y1 - a*x1;
      const yStep = y1<0?`${y2} − (${y1})`:`${y2} − ${y1}`;
      const xStep = x1<0?`${x2} − (${x1})`:`${x2} − ${x1}`;
      const answerStr = linearEqStr(a, b);
      question = `2点 (${x1}, ${y1})、(${x2}, ${y2}) を通る一次関数の式は？`;
      steps = [
        `傾き = Δy ÷ Δx`,
        `= (${yStep}) ÷ (${xStep}) = ${dy} ÷ ${dx} = ${a}`,
        `y = ${aD}x + b に (${x1}, ${y1}) を代入して b を求める`,
        `b = ${y1} − ${fmtNum(a*x1)} = ${b}`,
        `${answerStr}`,
      ];
      const candidates = [
        linearEqStr(a, -b),
        linearEqStr(-a, b),
        linearEqStr(a, b + 1),
        linearEqStr(a + 1, b),
      ];
      return { category:'linear', question, answer: answerStr, choices: buildChoicesFromList(answerStr, candidates), steps };
    } else if (pat === 10) {
      // 2点を「x=◯のときy=◯」の形で与えるパターン（座標表記の2点問題と数学的には同じ）
      const x1 = randInt(-5, 4), y1 = randInt(-8, 7);
      const dx = randNonZero(-4, 4), x2 = x1+dx;
      const dy = a*dx, y2 = y1+dy;
      const b = y1 - a*x1;
      const yStep = y1<0?`${y2} − (${y1})`:`${y2} − ${y1}`;
      const xStep = x1<0?`${x2} − (${x1})`:`${x2} − ${x1}`;
      const answerStr = linearEqStr(a, b);
      question = `x = ${x1} のとき y = ${y1}、x = ${x2} のとき y = ${y2} となる一次関数を求めなさい。`;
      steps = [
        `傾き = Δy ÷ Δx`,
        `= (${yStep}) ÷ (${xStep}) = ${dy} ÷ ${dx} = ${a}`,
        `y = ${aD}x + b に (${x1}, ${y1}) を代入して b を求める`,
        `b = ${y1} − ${fmtNum(a*x1)} = ${b}`,
        `${answerStr}`,
      ];
      const candidates10 = [
        linearEqStr(a, -b),
        linearEqStr(-a, b),
        linearEqStr(a, b + 1),
        linearEqStr(a + 1, b),
      ];
      return { category:'linear', question, answer: answerStr, choices: buildChoicesFromList(answerStr, candidates10), steps };
    } else if (pat === 4) {
      // 傾きと1点が与えられ、一次関数の式を求める
      const b = randNonZero(-8, 8), x1 = randNonZero(-5, 5), y1 = a*x1+b;
      const answerStr = linearEqStr(a, b);
      question = `傾き ${a} で点 (${x1}, ${y1}) を通る一次関数の式は？`;
      steps = [
        `y = ${aD}x + b に代入: ${y1} = ${a===1?x1:a===-1?`-${x1}`:`${a}×${x1}`} + b`,
        `${y1} = ${a*x1} + b`,
        `b = ${y1} − ${fmtNum(a*x1)} = ${b}`,
        `${answerStr}`,
      ];
      const candidates4 = [
        linearEqStr(a, -b),
        linearEqStr(-a, b),
        linearEqStr(a, b + 1),
        linearEqStr(a + 1, b),
      ];
      return { category:'linear', question, answer: answerStr, choices: buildChoicesFromList(answerStr, candidates4), steps };
    } else if (pat === 5) {
      // 変化の割合（=傾き）と1点が与えられ、一次関数の式を求める
      const b = randNonZero(-8, 8), x1 = randNonZero(-5, 5), y1 = a*x1+b;
      const answerStr = linearEqStr(a, b);
      question = `変化の割合が ${a} で、点 (${x1}, ${y1}) を通る一次関数の式は？`;
      steps = [
        `一次関数では 変化の割合 = 傾き なので a = ${a}`,
        `y = ${aD}x + b に代入: ${y1} = ${a===1?x1:a===-1?`-${x1}`:`${a}×${x1}`} + b`,
        `b = ${y1} − ${fmtNum(a*x1)} = ${b}`,
        `${answerStr}`,
      ];
      const candidates5 = [
        linearEqStr(a, -b),
        linearEqStr(-a, b),
        linearEqStr(a, b + 1),
        linearEqStr(a + 1, b),
      ];
      return { category:'linear', question, answer: answerStr, choices: buildChoicesFromList(answerStr, candidates5), steps };
    } else if (pat === 6) {
      // y切片と1点が与えられ、一次関数の式を求める（傾きを求める）
      const b = randNonZero(-8, 8), x1 = randNonZero(-5, 5), y1 = a*x1+b;
      const answerStr = linearEqStr(a, b);
      question = `y切片が ${b} で、点 (${x1}, ${y1}) を通る一次関数の式は？`;
      steps = [
        `y = ax + ${b} に (${x1}, ${y1}) を代入`,
        `${y1} = a × ${fmtNum(x1)} + ${b}`,
        `a = (${y1} − ${b}) ÷ ${x1} = ${a}`,
        `${answerStr}`,
      ];
      const candidates6 = [
        linearEqStr(a, -b),
        linearEqStr(-a, b),
        linearEqStr(a, b + 1),
        linearEqStr(a + 1, b),
      ];
      return { category:'linear', question, answer: answerStr, choices: buildChoicesFromList(answerStr, candidates6), steps };
    } else {
      // グラフから：2点が与えられ一次関数の式を求める
      const b = randNonZero(-6, 6);
      const x1 = randInt(-4, -1), y1 = a*x1+b;
      const x2 = randInt(1, 4),   y2 = a*x2+b;
      const answerStr = linearEqStr(a, b);
      question = `2点 (${x1}, ${y1})、(${x2}, ${y2}) を通る一次関数の式は？`;
      steps = [
        `傾き = (${y2} − ${fmtNum(y1)}) ÷ (${x2} − ${fmtNum(x1)}) = ${a}`,
        `y = ${aD}x + b に (${x2}, ${y2}) を代入`,
        `${y2} = ${a*x2} + b → b = ${b}`,
        `${answerStr}`,
      ];
      const candidates = [
        linearEqStr(a, -b),
        linearEqStr(-a, b),
        linearEqStr(a, b + 1),
        linearEqStr(a + 1, b),
      ];
      return { category:'linear', question, answer: answerStr, choices: buildChoicesFromList(answerStr, candidates), steps };
    }
    return { category:'linear', question, answer, choices:buildChoices(answer, wrongs), steps };
  }

  /* ---------- 二次関数 ---------- */

  function genQuadFunc() {
    const a = randNonZero(-3, 3);
    const aD = a===1?'':a===-1?'−':`${a}`;
    const pat = randInt(0, 7);
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
    } else if (pat === 3) {
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
    } else if (pat === 4) {
      // 変域全体を1つの答え(m≦y≦M)として求める
      const aAbs4 = randInt(1, 3);
      const aSign4 = Math.random() < 0.5 ? 1 : -1;
      const aVal4 = aAbs4 * aSign4;
      const aDom4 = aAbs4 === 1 ? (aSign4 > 0 ? '' : '−') : (aSign4 > 0 ? String(aAbs4) : `−${aAbs4}`);
      const dc4 = randInt(0, 2);
      let p4, q4;
      if (dc4 === 0) { p4 = randInt(1, 3); q4 = p4 + randInt(1, 3); }
      else if (dc4 === 1) { p4 = -randInt(1, 4); q4 = randInt(1, 4); }
      else { q4 = -randInt(1, 2); p4 = q4 - randInt(1, 3); }
      const yAtP4 = aVal4 * p4 * p4, yAtQ4 = aVal4 * q4 * q4;
      const crosses04 = p4 < 0 && q4 > 0;
      let yMin4, yMax4;
      if (crosses04) {
        yMin4 = aVal4 > 0 ? 0 : Math.min(yAtP4, yAtQ4);
        yMax4 = aVal4 > 0 ? Math.max(yAtP4, yAtQ4) : 0;
      } else {
        yMin4 = Math.min(yAtP4, yAtQ4);
        yMax4 = Math.max(yAtP4, yAtQ4);
      }
      const answerStr4 = `${yMin4} ≦ y ≦ ${yMax4}`;
      question = `y = ${aDom4}x² で ${p4} ≦ x ≦ ${q4} のとき、y の変域を求めなさい。`;
      steps = [`${p4} ≦ x ≦ ${q4}`, `y の変域: ${answerStr4}`];
      const candidates4 = [
        `${yMin4 - 2} ≦ y ≦ ${yMax4}`,
        `${yMin4} ≦ y ≦ ${yMax4 + 2}`,
        `${-yMax4} ≦ y ≦ ${-yMin4}`,
        `${yMin4 - 4} ≦ y ≦ ${yMax4 + 4}`,
      ];
      return { category: 'quadfunc', question, answer: answerStr4, choices: buildChoicesFromList(answerStr4, candidates4), steps };
    } else if (pat === 5) {
      // 係数aを求める：xの変域(0をまたぐ)とyの変域から、aの値を求める
      const p5 = randNonZero(-4, -1), q5 = randNonZero(1, 4);
      const aSign5 = Math.random() < 0.5 ? 1 : -1;
      const bigAbsX5 = Math.abs(p5) >= Math.abs(q5) ? Math.abs(p5) : Math.abs(q5);
      const k5 = randInt(1, 4);
      const aVal5 = aSign5 * k5;
      const M5 = k5 * bigAbsX5 * bigAbsX5;
      const rangeStr5 = aSign5 > 0 ? `0 ≦ y ≦ ${M5}` : `${-M5} ≦ y ≦ 0`;
      question = `y = ax² で、x の変域が ${p5} ≦ x ≦ ${q5} のとき、y の変域が ${rangeStr5} です。a の値を求めなさい。`;
      answer = aVal5;
      wrongs = [aVal5 + 1, aVal5 + 2, Math.max(1, -aVal5), -aVal5 + 1].filter(v => v !== answer);
      steps = [`x = 0 を含むので、頂点(0,0)がy=0を与える`, `もう一方の極値は |x| が大きい方(x=${Math.abs(p5) >= Math.abs(q5) ? p5 : q5})で決まる`, `a × ${bigAbsX5}² = ${aSign5 > 0 ? M5 : -M5}`, `a = ${answer}`];
    } else if (pat === 6) {
      // 未知の変域の端点aを求める：係数固定、既知の端点q、もう一方の未知の端点a(qと反対符号、|a|>|q|)
      const kAbs6 = [1, 2, 3][randInt(0, 2)];
      const kSign6 = Math.random() < 0.5 ? 1 : -1;
      const kVal6 = kAbs6 * kSign6;
      const kStr6 = kAbs6 === 1 ? (kSign6 > 0 ? '' : '−') : (kSign6 > 0 ? String(kAbs6) : `−${kAbs6}`);
      const qSign6 = Math.random() < 0.5 ? 1 : -1;
      const qAbs6 = randInt(1, 3);
      const q6 = qSign6 * qAbs6;
      const targetAbsX6 = qAbs6 + randInt(1, 3);
      const aVal6 = -qSign6 * targetAbsX6;
      const M6 = kAbs6 * targetAbsX6 * targetAbsX6;
      const rangeStr6 = kSign6 > 0 ? `0 ≦ y ≦ ${M6}` : `${-M6} ≦ y ≦ 0`;
      const domainStr6 = aVal6 < q6 ? `a ≦ x ≦ ${q6}` : `${q6} ≦ x ≦ a`;
      question = `y = ${kStr6}x² で、x の変域が ${domainStr6} のとき、y の変域が ${rangeStr6} です。a の値を求めなさい。`;
      answer = aVal6;
      wrongs = [aVal6 + 1, aVal6 + 2, Math.max(1, -aVal6), -aVal6 + 1].filter(v => v !== answer);
      steps = [`x=0を含むので頂点(0,0)がy=0を与える`, `もう一方の極値 ${kSign6 > 0 ? M6 : -M6} は |x|=${targetAbsX6} のときの値`, `q=${q6} では届かないので、a = ${aVal6}`];
    } else {
      // 変化の割合から始点aを逆算
      const kAbs7 = [1, 2, 3][randInt(0, 2)];
      const kSign7 = Math.random() < 0.5 ? 1 : -1;
      const kVal7 = kAbs7 * kSign7;
      const kStr7 = kAbs7 === 1 ? (kSign7 > 0 ? '' : '−') : (kSign7 > 0 ? String(kAbs7) : `−${kAbs7}`);
      const d7 = randInt(1, 4);
      const aVal7 = randNonZero(-6, 6);
      const rate7 = kVal7 * (aVal7 + (aVal7 + d7));
      question = `y = ${kStr7}x² について、x の値が a から a+${d7} まで増加するときの変化の割合が ${rate7} です。a の値を求めなさい。`;
      answer = aVal7;
      wrongs = [aVal7 + 1, aVal7 + 2, Math.max(1, -aVal7), -aVal7 + 1].filter(v => v !== answer);
      steps = [`変化の割合 = ${kStr7 || 1}×(a + (a+${d7}))`, `${rate7} = ${kVal7}×(2a+${d7})`, `a = ${answer}`];
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
      const fracHtml = `<span class="frac"><span class="num">${a}</span><span class="den">√${b}</span></span>`;
      const questionHtml = `${fracHtml} を有理化すると？`;
      const answerStr2 = sqrtStr(k, b);
      steps = [
        `分母に √${b} をかける: ${a}/√${b} × √${b}/√${b}`,
        `= ${a}√${b} / ${b} = ${answerStr2}`,
      ];
      return { category:'sqrtmd', question:q, questionHtml, answer: answerStr2, choices: buildChoicesFromList(answerStr2, [`${a}√${b}`, sqrtStr(k+1, b), sqrtStr(Math.max(1,k-1), b), sqrtStr(k, b===2?3:2)]), steps };
    }
    return { category:'sqrtmd', question:q, answer, choices:buildChoices(answer, wrongs), steps };
  }

  /* ---------- 出題範囲の定義 ---------- */

  const CATEGORIES = [
    // ---------- 中1 ----------
    { id: 'add2',       label: '加法（たし算）（中1）',           gen: genAdd2 },
    { id: 'sub2',       label: '減法（ひき算）（中1）',           gen: genSub2 },
    { id: 'chain3',     label: '加減混合（中1）',                 gen: genChain3 },
    { id: 'mul2',       label: '乗法（かけ算）（中1）',           gen: genMul2 },
    { id: 'div2',       label: '除法（わり算）（中1）',           gen: genDiv2 },
    { id: 'mixed',      label: 'かっこを含む四則（中1）',         gen: genMixedParen },
    { id: 'allops',     label: '四則混合計算（中1）',             gen: genAllOps },
    { id: 'power',      label: '累乗の計算（中1）',               gen: genPower },
    { id: 'brace',      label: '中かっこを含む計算（中1）',       gen: genBrace },
    { id: 'literal',    label: '文字式の計算（中1）',             gen: genLiteral },
    { id: 'notation',   label: '文字式の表し方（中1）',           gen: genNotation },
    { id: 'subst',      label: '代入の計算（中1）',               gen: genSubst },
    { id: 'maxof4',     label: '大小関係（中1）',                 gen: genMaxOf4 },
    { id: 'equation',   label: '一次方程式（中1）',               gen: genEquation },
    { id: 'eqWordProblem1', label: '方程式の文章題（中1）',        gen: genEqWordProblem1 , addedDate: '2026-08-01' },
    { id: 'eqWordProblemAdv1', label: '方程式の文章題の応用（中1）', gen: genEqWordProblemAdv1 , addedDate: '2026-08-08' },
    { id: 'proportion', label: '比例・反比例（中1）',             gen: genProportion },
    { id: 'linearMul',   label: '1次式×÷数（中1）',              gen: genLinearMul },
    { id: 'polyMul',     label: '多項式×÷数（中1）',              gen: genPolyMul },
    { id: 'linearAddSub',label: '1次式の加減（中1）',             gen: genLinearAddSub },
    { id: 'planeFigure', label: '平面図形（中1）',                gen: genPlaneFigure },
    { id: 'planeFigureComposite1', label: '平面図形の複合図形（中1）', gen: genPlaneFigureComposite1, defaultOff: true , addedDate: '2026-08-03' },
    { id: 'solidFigure', label: '空間図形（中1）',                gen: genSolidFigure },
    { id: 'coneDevelopment1', label: '空間図形（円錐の展開図・中心角）（中1）', gen: genConeDevelopment1, defaultOff: true , addedDate: '2026-08-08' },
    { id: 'construction', label: '作図（中1）',                    gen: genConstruction },

    // ---------- 中2 ----------
    { id: 'simul',      label: '連立方程式（中2）',               gen: genSimul },
    { id: 'simulEqWordProblem2', label: '連立方程式の文章題（中2）', gen: genSimulEqWordProblem2 , addedDate: '2026-08-01' },
    { id: 'simulEqWordProblemAdv2', label: '連立方程式の文章題の応用（中2）', gen: genSimulEqWordProblemAdv2 , addedDate: '2026-08-08' },
    { id: 'linear',     label: '一次関数（中2）',                 gen: genLinear },
    { id: 'angle',      label: '角度の計算（中2）',               gen: genAngle },
    { id: 'angleApplication2', label: '角度の応用（中2）',         gen: genAngleApplication2, defaultOff: true , addedDate: '2026-08-12' },
    { id: 'congruence', label: '三角形の合同（中2）',             gen: genCongruence },
    { id: 'parallelogramCondition2', label: '平行四辺形の性質や条件（中2）', gen: genParallelogramCondition2, defaultOff: true , addedDate: '2026-08-12' },
    { id: 'probability', label: '確率（中2）',                     gen: genProbability },
    { id: 'quartileBoxplot2', label: '四分位範囲と箱ひげ図（中2）', gen: genQuartileBoxplot2, defaultOff: true , addedDate: '2026-08-12' },
    { id: 'polyCalc2',  label: '式の計算（中2）',                  gen: genPolyCalc2 , addedDate: '2026-08-02' },

    // ---------- 中3 ----------
    { id: 'expand2',    label: '式の展開・基本（中3）',           gen: genExpand2 },
    { id: 'expand3',    label: '式の展開・発展（中3）',           gen: genExpand3 },
    { id: 'factor',     label: '因数分解（中3）',                 gen: genFactor },
    { id: 'sqrt',       label: '平方根の計算（中3）',             gen: genSqrt },
    { id: 'sqrtmd',     label: '√のかけ算・割り算（中3）',       gen: genSqrtMulDiv },
    { id: 'quadratic',  label: '二次方程式（中3）',               gen: genQuadratic },
    { id: 'quadEqWordProblem3', label: '二次方程式の文章題（中3）', gen: genQuadEqWordProblem3 , addedDate: '2026-08-01' },
    { id: 'quadfunc',   label: '二次関数（中3）',                 gen: genQuadFunc },
    { id: 'similarity',   label: '三角形の相似（中3）',            gen: genSimilarity },
    { id: 'similarRatio3', label: '相似な図形の面積比・体積比（中3）', gen: genSimilarRatio3, addedDate: '2026-08-16' },
    { id: 'circleAngle', label: '円周角（中3）',                   gen: genCircleAngle },
    { id: 'pythagoras',    label: '三平方の定理（中3）',           gen: genPythagoras },
    { id: 'samplingSurvey3', label: '標本調査（中3）',             gen: genSamplingSurvey3, addedDate: '2026-08-16' },

    // ---------- 小4 ----------
    { id: 'round4',         label: '四捨五入（小4）',                     gen: genRound4,         defaultOff: true },
    { id: 'fourOps4',       label: '四則計算（小4）',                     gen: genFourOps4,       defaultOff: true },
    { id: 'decAddSub4',     label: '小数のたし算・ひき算（小4）',         gen: genDecAddSub4,     defaultOff: true },
    { id: 'decMul4',        label: '小数のかけ算（小4）',                 gen: genDecMul4,        defaultOff: true },
    { id: 'frac4',          label: '分数のたし算・ひき算（小4）',         gen: genFrac4,          defaultOff: true },
    { id: 'unit4',          label: '単位の変換（小4）',                   gen: genUnit4,          defaultOff: true },
    { id: 'mul3x2_4',       label: '3桁×2桁のかけ算（小4）',              gen: genMul3x2_4,       defaultOff: true },
    { id: 'divRemainder4',  label: 'あまりのあるわり算（小4）',           gen: genDivRemainder4,  defaultOff: true },
    { id: 'div2by1_4',      label: '2桁÷1桁のわり算（小4）',             gen: genDiv2by1_4,      defaultOff: true },
    { id: 'div2by2_4',      label: '2桁÷2桁のわり算（小4）',             gen: genDiv2by2_4,      defaultOff: true },
    { id: 'div3by1_4',      label: '3桁÷1桁のわり算（小4）',             gen: genDiv3by1_4,      defaultOff: true },
    { id: 'div3by2_4',      label: '3桁÷2桁のわり算（小4）',             gen: genDiv3by2_4,      defaultOff: true },
    { id: 'div3by3_4',      label: '3桁÷3桁のわり算（小4）',             gen: genDiv3by3_4,      defaultOff: true },
    { id: 'rectArea4',      label: '長方形・正方形の面積（小4）',        gen: genRectArea4,      defaultOff: true },
    { id: 'largeNum4',      label: '億・兆の大きな数（小4）',             gen: genLargeNum4,      defaultOff: true },
    { id: 'decAddSubMixed4', label: '小数のたし算・ひき算：発展（小4）',  gen: genDecAddSubMixed4, defaultOff: true , addedDate: '2026-08-02' },
    { id: 'setSquareAngle4', label: '三角じょうぎの角度（小4）',           gen: genSetSquareAngle4, defaultOff: true , addedDate: '2026-08-02' },
    { id: 'timesWordProblem4', label: '倍の見方の文章題（小4）',           gen: genTimesWordProblem4, defaultOff: true , addedDate: '2026-08-02' },
    { id: 'divWordProblem4',   label: 'わり算の文章題（小4）',             gen: genDivWordProblem4, defaultOff: true , addedDate: '2026-08-10' },
    { id: 'decWordProblem4',   label: '小数の文章題（小4）',               gen: genDecWordProblem4, defaultOff: true , addedDate: '2026-08-10' },
    { id: 'fracType4',         label: '真分数・仮分数・帯分数（小4）',     gen: genFracType4, defaultOff: true , addedDate: '2026-08-10' },
    { id: 'sumDiffWordProblem4', label: '文章題特訓：和差算（小4）',       gen: genSumDiffWordProblem4, defaultOff: true , addedDate: '2026-08-10' },

    // ---------- 小5 ----------
    { id: 'decStructure5',   label: '整数と小数のしくみ（小5）',           gen: genDecStructure5,   defaultOff: true , addedDate: '2026-08-02' },
    { id: 'evenOdd5',        label: '偶数と奇数（小5）',                   gen: genEvenOdd5,        defaultOff: true , addedDate: '2026-08-02' },
    { id: 'fracAddSub5',     label: '分数のたし算・ひき算（小5）',         gen: genFracAddSub5,     defaultOff: true },
    { id: 'decFracAddSub5',  label: '小数と分数のたし算・ひき算（小5）',   gen: genDecFracAddSub5,  defaultOff: true , addedDate: '2026-08-01' },
    { id: 'fracReduceConvert5', label: '約分・通分（小5）',                gen: genFracReduceConvert5, defaultOff: true },
    { id: 'decMul5',         label: '小数のかけ算（小5）',                 gen: genDecMul5,         defaultOff: true },
    { id: 'decDiv5',         label: '小数のわり算（小5）',                 gen: genDecDiv5,         defaultOff: true },
    { id: 'decDivRemainder5', label: '小数のわり算：あまり・がい数（小5）', gen: genDecDivRemainder5, defaultOff: true , addedDate: '2026-08-02' },
    { id: 'decWordProblem5', label: '小数の文章題（小5）',                 gen: genDecWordProblem5, defaultOff: true , addedDate: '2026-08-02' },
    { id: 'speedRate5',      label: '単位量あたりの大きさ・速さ（小5）',   gen: genSpeedRate5,      defaultOff: true },
    { id: 'speedApp5',       label: '速さの計算の応用（小5）',             gen: genSpeedApp5,       defaultOff: true , addedDate: '2026-08-08' },
    { id: 'unitRateWordProblem5', label: '単位量あたりの大きさの文章題（小5）', gen: genUnitRateWordProblem5, defaultOff: true , addedDate: '2026-08-03' },
    { id: 'timeFraction5',   label: '時間と分数（小5）',                   gen: genTimeFraction5,   defaultOff: true , addedDate: '2026-08-03' },
    { id: 'percent5',        label: '割合・百分率（小5）',                 gen: genPercent5,        defaultOff: true },
    { id: 'percentWordProblem5', label: '割合の文章題（小5）',              gen: genPercentWordProblem5, defaultOff: true , addedDate: '2026-08-11' },
    { id: 'percentWordProblemAdvanced5', label: '割合の文章題（応用）（小5）', gen: genPercentWordProblemAdvanced5, defaultOff: true , addedDate: '2026-08-12' },
    { id: 'figureArea5',     label: '図形の面積（小5）',                   gen: genFigureArea5,     defaultOff: true , addedDate: '2026-08-12' },
    { id: 'percentConvert5', label: '割合の表し方：小数・百分率・歩合（小5）', gen: genPercentConvert5, defaultOff: true },
    { id: 'multiples5',      label: '倍数と約数（小5）',                   gen: genMultiples5,      defaultOff: true },
    { id: 'multiplesDivisorsWordProblem5', label: '倍数・約数の文章題（小5）', gen: genMultiplesDivisorsWordProblem5, defaultOff: true , addedDate: '2026-08-11' },
    { id: 'polygonAngle5',   label: '図形の角（小5）',                     gen: genPolygonAngle5,   defaultOff: true },
    { id: 'fracDecConvert5', label: '分数と小数、整数の関係（小5）',       gen: genFracDecConvert5, defaultOff: true },
    { id: 'fracDecimal5',    label: '分数と小数（小5）',                   gen: genFracDecimal5,    defaultOff: true , addedDate: '2026-08-02' },
    { id: 'average5',        label: '平均（小5）',                         gen: genAverage5,        defaultOff: true },
    { id: 'averageWordProblemAdvanced5', label: '平均の文章題：応用（小5）', gen: genAverageWordProblemAdvanced5, defaultOff: true , addedDate: '2026-08-11' },
    { id: 'circumference5',  label: '円周（小5）',                         gen: genCircumference5,  defaultOff: true },

    // ---------- 小6 ----------
    { id: 'fracMulDiv6',     label: '分数のかけ算・わり算（小6）',         gen: genFracMulDiv6,     defaultOff: true },
    { id: 'fracDecIntMulDiv6', label: '分数、小数、整数のまじったかけ算・わり算（小6）', gen: genFracDecIntMulDiv6, defaultOff: true , addedDate: '2026-08-02' },
    { id: 'fracWordProblem6', label: '分数のかけ算・わり算の文章題（小6）', gen: genFracWordProblem6, defaultOff: true , addedDate: '2026-08-02' },
    { id: 'ratioWordProblem6', label: '比の文章題（小6）',                  gen: genRatioWordProblem6, defaultOff: true , addedDate: '2026-08-02' },
    { id: 'ratio6',          label: '比（小6）',                           gen: genRatio6,          defaultOff: true },
    { id: 'scale6',          label: '拡大図と縮図（小6）',                 gen: genScale6,          defaultOff: true },
    { id: 'dataValues6',     label: 'データの調べ方（小6）',               gen: genDataValues6,     defaultOff: true },
    { id: 'arrangeCombine6', label: '並べ方と組み合わせ方（小6）',        gen: genArrangeCombine6, defaultOff: true },
    { id: 'circleArea6',     label: '円の面積（小6）',                     gen: genCircleArea6,     defaultOff: true },
    { id: 'circleSector6',   label: '円とおうぎ形（小6）',                 gen: genCircleSector6,   defaultOff: true , addedDate: '2026-08-11' },
    { id: 'speedFrac6',      label: '分数を含んだ速さの計算（小6）',       gen: genSpeedFrac6,      defaultOff: true , addedDate: '2026-08-12' },
    { id: 'workMeetingPassage6', label: '仕事算・旅人算・通過算（小6）',   gen: genWorkMeetingPassage6, defaultOff: true , addedDate: '2026-08-12' },
    { id: 'mathSummary456',  label: '算数のまとめ（小4〜小6）',            gen: genMathSummary456,  defaultOff: true , addedDate: '2026-08-12' },
    { id: 'prismVolume6',    label: '角柱と円柱の体積（小6）',             gen: genPrismVolume6,    defaultOff: true },
    // ---------- 小3 ----------
    { id: 'mulWritten3',     label: 'かけ算の筆算（小3）',                 gen: genMulWritten3,     defaultOff: true },
    { id: 'largeNum3',       label: '大きな数（小3）',                     gen: genLargeNum3,       defaultOff: true },
    { id: 'clockTime3',      label: '時こくと時間（小3）',                 gen: genClockTime3,      defaultOff: true },
    { id: 'clockWordProblem3', label: '時こくと時間の文章題（小3）',       gen: genClockWordProblem3, defaultOff: true , addedDate: '2026-08-10' },
    { id: 'addSub3Digit3',   label: 'たし算とひき算：3けた以上（小3）',    gen: genAddSub3Digit3,   defaultOff: true , addedDate: '2026-08-02' },
    { id: 'units3',          label: '単位の関係（小3）',                   gen: genUnits3,          defaultOff: true , addedDate: '2026-08-02' },
    { id: 'division3',       label: 'わり算（小3）',                       gen: genDivision3,       defaultOff: true , addedDate: '2026-08-10' },
    { id: 'boxEquation3',    label: '□を使った式（小3）',                 gen: genBoxEquation3,    defaultOff: true , addedDate: '2026-08-10' },
    { id: 'fraction3',       label: '分数の計算（小3）',                   gen: genFraction3,       defaultOff: true , addedDate: '2026-08-10' },
    { id: 'fractionWordProblem3', label: '分数の文章題（小3）',            gen: genFractionWordProblem3, defaultOff: true , addedDate: '2026-08-10' },
    { id: 'wordProblemMulDiv3', label: '算数の文章題まとめ（小3）',        gen: genWordProblemMulDiv3, defaultOff: true , addedDate: '2026-08-10' },
  ];

  // 理科の単元一覧。CATEGORIESとは完全に独立した別リスト(算数・数学とは出題範囲の
  // 選択画面を分ける)。MPは算数・数学と共通のプール(state.points/pointsToday、
  // 1日の上限も共通)を使うが、経験値だけは理科専用のstate.scienceExpに分けて集計する。
  const SCIENCE_CATEGORIES = [
    { id: 'matterInvestigation1', label: '物の調べ方（中1）', gen: genMatterInvestigation1, addedDate: '2026-08-12' },
    { id: 'whitePowder1', label: '白い粉末の見分け方（中1）', gen: genWhitePowder1, addedDate: '2026-08-12' },
    { id: 'dissolve1', label: '物質が水にとけるようす（中1）', gen: genDissolve1, addedDate: '2026-08-12' },
    { id: 'solubility1', label: '溶解度と再結晶（中1）', gen: genSolubility1, addedDate: '2026-08-12' },
    { id: 'gasProperties1', label: '気体の性質（中1）', gen: genGasProperties1, addedDate: '2026-08-13' },
    { id: 'stateChange1', label: '物質の状態変化（中1）', gen: genStateChange1, addedDate: '2026-08-13' },
    { id: 'meltingBoiling1', label: '状態変化が起こるときの温度とその利用（中1）', gen: genMeltingBoiling1, addedDate: '2026-08-13' },
    { id: 'distillation1', label: '蒸留（中1）', gen: genDistillation1, addedDate: '2026-08-13' },
    { id: 'cellBiology2', label: '生物と細胞（中2）', gen: genCellBiology2, addedDate: '2026-08-13' },
    { id: 'photosynthesis2', label: '葉と光合成（中2）', gen: genPhotosynthesis2, addedDate: '2026-08-13' },
    { id: 'plantWater2', label: '植物と水（中2）', gen: genPlantWater2, addedDate: '2026-08-13' },
    { id: 'digestion2', label: '消化と吸収のしくみ（中2）', gen: genDigestion2, addedDate: '2026-08-13' },
    { id: 'respiration2', label: '呼吸と血液のはたらき（中2）', gen: genRespiration2, addedDate: '2026-08-13' },
    { id: 'stimulusResponse2', label: '刺激と反応（中2）', gen: genStimulusResponse2, addedDate: '2026-08-13' },
    { id: 'growthReproduction3', label: '生物の成長と生殖（中3）', gen: genGrowthReproduction3, addedDate: '2026-08-14' },
    { id: 'evolution3', label: '生物の多様性と進化（中3）', gen: genEvolution3, addedDate: '2026-08-14' },
    { id: 'motion3', label: '物体の運動（中3）', gen: genMotion3, addedDate: '2026-08-14' },
    { id: 'forceComposition3', label: '力の合成と分解（中3）', gen: genForceComposition3, addedDate: '2026-08-14' },
    { id: 'genetics3', label: '遺伝の規則性と遺伝子（中3）', gen: genGenetics3, addedDate: '2026-08-22' },
    { id: 'forceAction3', label: '力の作用・水中ではたらく力（中3）', gen: genForceAction3, addedDate: '2026-08-22' },
    { id: 'energyWork3', label: 'エネルギーと仕事（中3）', gen: genEnergyWork3, addedDate: '2026-08-22' },
    { id: 'energyConservation3', label: 'エネルギーの変換と保存（中3）', gen: genEnergyConservation3, addedDate: '2026-08-22' },
    { id: 'electricCircuit4', label: '電気のはたらき（小4）', gen: genElectricCircuit4, addedDate: '2026-08-21' },
    { id: 'dissolveWays5', label: 'もののとけ方（小5）', gen: genDissolveWays5, addedDate: '2026-08-21' },
    { id: 'combustion6', label: '燃焼のしくみ（小6）', gen: genCombustion6, addedDate: '2026-08-21' },
    { id: 'season4', label: '季節と生物（小4）', gen: genSeason4, addedDate: '2026-08-21' },
    { id: 'weather4', label: '天気の様子（小4）', gen: genWeather4, addedDate: '2026-08-21' },
    { id: 'moonStar4', label: '月と星（小4）', gen: genMoonStar4, addedDate: '2026-08-21' },
    { id: 'rainSoil4', label: '雨水のゆくえと地面の様子（小4）', gen: genRainSoil4, addedDate: '2026-08-21' },
    { id: 'confinedAirWater4', label: 'とじこめた空気や水（小4）', gen: genConfinedAirWater4, addedDate: '2026-08-21' },
    { id: 'heatSpread4', label: 'もののあたたまり方（小4）', gen: genHeatSpread4, addedDate: '2026-08-21' },
    { id: 'waterForms4', label: '水のすがた（小4）', gen: genWaterForms4, addedDate: '2026-08-21' },
    { id: 'bodyMovement4', label: '人の体のつくりと運動（小4）', gen: genBodyMovement4, addedDate: '2026-08-21' },
    { id: 'weatherChange5', label: '天気の変化（小5）', gen: genWeatherChange5, addedDate: '2026-08-21' },
    { id: 'plantGrowth5', label: '植物の発芽・成長・結実（小5）', gen: genPlantGrowth5, addedDate: '2026-08-21' },
    { id: 'animalBirth5', label: '動物のたんじょう（小5）', gen: genAnimalBirth5, addedDate: '2026-08-21' },
    { id: 'flowingWater5', label: '流水のはたらきと土地の変化（小5）', gen: genFlowingWater5, addedDate: '2026-08-21' },
    { id: 'pendulum5', label: 'ふりこの運動（小5）', gen: genPendulum5, addedDate: '2026-08-21' },
    { id: 'electromagnet5', label: '電流がつくる磁力（小5）', gen: genElectromagnet5, addedDate: '2026-08-21' },
    { id: 'humanBody6', label: '人の体のつくりとはたらき（小6）', gen: genHumanBody6, addedDate: '2026-08-21' },
    { id: 'plantFunction6', label: '植物のつくりとはたらき（小6）', gen: genPlantFunction6, addedDate: '2026-08-21' },
    { id: 'foodChain6', label: '生物どうしのつながり（小6）', gen: genFoodChain6, addedDate: '2026-08-21' },
    { id: 'landChange6', label: '土地のつくりと変化（小6）', gen: genLandChange6, addedDate: '2026-08-21' },
    { id: 'lever6', label: 'てこのはたらき（小6）', gen: genLever6, addedDate: '2026-08-21' },
    { id: 'electricityUse6', label: '電気の利用（小6）', gen: genElectricityUse6, addedDate: '2026-08-21' },
    { id: 'aqueousSolution6', label: '水溶液の性質（小6）', gen: genAqueousSolution6, addedDate: '2026-08-21' },
    { id: 'moonSun6', label: '月と太陽（小6）', gen: genMoonSun6, addedDate: '2026-08-21' },
  ];

  const GRADE_RANK = { '小3': 1, '小4': 2, '小5': 3, '小6': 4, '中1': 5, '中2': 6, '中3': 7 };
  const categoryGrade = Object.fromEntries([...CATEGORIES, ...SCIENCE_CATEGORIES].map(c => {
    const m = c.label.match(/（(小[3456]|中[123])）/);
    return [c.id, m ? m[1] : null];
  }));
  function isAboveOwnGrade(catId, ownGrade) {
    const ownRank = GRADE_RANK[ownGrade];
    const catRank = GRADE_RANK[categoryGrade[catId]];
    if (!ownRank || !catRank) return false;
    return catRank > ownRank;
  }
  // 世界一周のボス戦の出題範囲チェック用。isAboveOwnGradeと違い、自分の学年と同じ
  // 単元も対象に含める(「学年以上」)。
  function isAtOrAboveOwnGrade(catId, ownGrade) {
    const ownRank = GRADE_RANK[ownGrade];
    const catRank = GRADE_RANK[categoryGrade[catId]];
    if (!ownRank || !catRank) return false;
    return catRank >= ownRank;
  }
  // 学年が分かっている場合は「自分の学年以下」の単元だけを初期状態でON。
  // 学年不明（ゲスト等）の場合は、これまで通り小4〜6の復習系だけOFFにする。
  function defaultEnabledIds(grade) {
    const ownRank = GRADE_RANK[grade];
    if (!ownRank) return CATEGORIES.filter(c => !c.defaultOff).map(c => c.id);
    return CATEGORIES.filter(c => {
      const rank = GRADE_RANK[categoryGrade[c.id]];
      return rank && rank <= ownRank;
    }).map(c => c.id);
  }
  // adminOnly:trueの単元(本番公開前のプレビュー中)は、00001アカウントだけに
  // 表示・出題する。本番公開する際はSCIENCE_CATEGORIES側のadminOnlyを外す。
  function isAdminSession_() {
    var s = loadSession();
    return !!(s && s.id === '00001');
  }
  // 理科版のdefaultEnabledIds。生徒の学年以下の理科単元を初期状態でONにする。
  function defaultEnabledScienceIds(grade) {
    const ownRank = GRADE_RANK[grade];
    const visible = SCIENCE_CATEGORIES.filter(c => !c.adminOnly || isAdminSession_());
    if (!ownRank) return visible.filter(c => !c.defaultOff).map(c => c.id);
    return visible.filter(c => {
      const rank = GRADE_RANK[categoryGrade[c.id]];
      return rank && rank <= ownRank;
    }).map(c => c.id);
  }

  /* ---------- 理科の単元 ---------- */

  // 実在する物質の密度(g/cm³、小数第1位)。密度から物質を特定する問題や、
  // 誤答の選択肢としても使う。
  const DENSITY_TABLE_1_ = [
    { name: '鉄', d: 7.9 },
    { name: '銅', d: 8.9 },
    { name: 'アルミニウム', d: 2.7 },
    { name: '金', d: 19.3 },
    { name: '銀', d: 10.5 },
    { name: '鉛', d: 11.3 },
  ];
  const NONMAGNETIC_METALS_1_ = ['銅', 'アルミニウム', '金', '銀', '鉛'];
  const NONMETAL_EXAMPLES_1_ = ['プラスチック', 'ガラス', '紙'];
  const BALANCE_DESCRIPTIONS_1_ = [
    { desc: '水平なところに置き、針が左右に等しく振れるかを確認してから使う。分銅と皿にのせた物のつり合いで、質量をはかることができる。', ans: '上皿てんびん' },
    { desc: '水平なところに置き、何ものせていないときの表示を0.0gや0.00gなどにしてから、質量をはかる。', ans: '電子てんびん' },
  ];

  // 物の調べ方（中1）：密度の計算(質量・体積・密度の相互変換、密度表からの
  // 物質の特定)と、金属の性質・展性延性などの知識問題。
  function genMatterInvestigation1() {
    const pat = randInt(0, 12);
    let question, answer, wrongs, steps, choices;
    if (pat === 0) {
      const idx = randInt(0, DENSITY_TABLE_1_.length - 1);
      const entry = DENSITY_TABLE_1_[idx];
      const v = randInt(2, 40);
      const mass = Math.round(entry.d * v * 10) / 10;
      answer = entry.d.toFixed(1);
      const others = DENSITY_TABLE_1_.filter((_, i) => i !== idx).map(e => e.d.toFixed(1));
      const candidates = shuffle(others).slice(0, 3);
      question = `質量${mass}g、体積${v}cm³の物質があります。この物質の密度は何g/cm³ですか。（小数第1位まで求めなさい）`;
      steps = [`密度 = 質量 ÷ 体積`, `= ${mass} ÷ ${v} = ${answer}g/cm³`];
      return { category: 'matterInvestigation1', question, answer, choices: buildChoicesFromList(answer, candidates), steps };
    } else if (pat === 1) {
      const entry = DENSITY_TABLE_1_[randInt(0, DENSITY_TABLE_1_.length - 1)];
      const v = randInt(2, 40);
      const mass = Math.round(entry.d * v * 10) / 10;
      question = `${entry.name}（密度${entry.d}g/cm³）${v}cm³の質量は何gですか。`;
      answer = mass;
      wrongs = [Math.round((mass + 1) * 10) / 10, Math.round((mass + 2) * 10) / 10, Math.max(0.1, Math.round((mass - 1) * 10) / 10), Math.max(0.1, Math.round((mass - 2) * 10) / 10)].filter(w => w !== answer);
      steps = [`質量 = 密度 × 体積 = ${entry.d} × ${v} = ${answer}g`];
      return { category: 'matterInvestigation1', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 2) {
      const entry = DENSITY_TABLE_1_[randInt(0, DENSITY_TABLE_1_.length - 1)];
      const v = randInt(2, 40);
      const mass = Math.round(entry.d * v * 10) / 10;
      question = `${entry.name}（密度${entry.d}g/cm³）でできた物体があります。質量が${mass}gのとき、体積は何cm³ですか。`;
      answer = v;
      wrongs = [v + 1, v + 2, Math.max(1, v - 1), Math.max(1, v - 2)].filter(w => w !== answer);
      steps = [`体積 = 質量 ÷ 密度 = ${mass} ÷ ${entry.d} = ${answer}cm³`];
      return { category: 'matterInvestigation1', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 3) {
      const idx = randInt(0, DENSITY_TABLE_1_.length - 1);
      const entry = DENSITY_TABLE_1_[idx];
      const v = randInt(2, 40);
      const mass = Math.round(entry.d * v * 10) / 10;
      const tableStr = DENSITY_TABLE_1_.map(e => `${e.name}: ${e.d}g/cm³`).join('、');
      question = `質量${mass}g、体積${v}cm³の物質があります。次の密度表をもとに、この物質は何であると考えられますか。（${tableStr}）`;
      answer = entry.name;
      const otherNames = DENSITY_TABLE_1_.filter((_, i) => i !== idx).map(e => e.name);
      choices = shuffle([answer, ...shuffle(otherNames).slice(0, 3)]);
      steps = [`密度 = ${mass} ÷ ${v} = ${entry.d}g/cm³`, `密度表より、${entry.d}g/cm³は${entry.name}`];
      return { category: 'matterInvestigation1', question, answer, choices, steps };
    } else if (pat === 4) {
      const METAL_PROPS = ['電気をよく通す', '熱をよく伝える', 'みがくと特有の光沢(金属光沢)が出る', 'たたくと広がったり、引っ張るとのびたりする'];
      const FAKE_METAL = '磁石には必ずつく';
      question = '次のうち、金属に共通する性質として正しくないものはどれですか。';
      answer = FAKE_METAL;
      choices = shuffle([FAKE_METAL, ...shuffle(METAL_PROPS).slice(0, 3)]);
      steps = ['金属は電気を通す・熱を伝える・金属光沢がある・展性延性がある、という性質を共通してもつ', '磁石につくのは鉄など一部の金属だけなので、金属に共通する性質ではない'];
      return { category: 'matterInvestigation1', question, answer, choices, steps };
    } else if (pat === 5) {
      const VOCAB = [
        { term: '展性', q: '金属をたたいて薄く広げることができる性質を何といいますか。' },
        { term: '延性', q: '金属を引っ張って細くのばすことができる性質を何といいますか。' },
      ];
      const pick = VOCAB[randInt(0, 1)];
      question = pick.q;
      answer = pick.term;
      const otherTerms = ['展性', '延性', '金属光沢', '磁性'].filter(t => t !== pick.term);
      choices = shuffle([pick.term, ...otherTerms]);
      steps = [`「${pick.q}」の答えは「${answer}」`];
      return { category: 'matterInvestigation1', question, answer, choices, steps };
    } else if (pat === 6) {
      const isTai = Math.random() < 0.5;
      if (isTai) {
        question = 'いすやコップのように、形や大きさ、使いみちに着目したときの、物の名前を何といいますか。';
        answer = '物体';
        choices = shuffle(['物体', '物質', '質量', '密度']);
        steps = ['形や大きさ、使いみちなど、物の外観に注目したときの分類を物体という'];
      } else {
        question = '物体をつくっている材料に着目したときの、物の名前を何といいますか。';
        answer = '物質';
        choices = shuffle(['物質', '物体', '混合物', '単体']);
        steps = ['物をつくっている材料に注目したときの分類を物質という'];
      }
      return { category: 'matterInvestigation1', question, answer, choices, steps };
    } else if (pat === 7) {
      const isMagnetic = Math.random() < 0.5;
      if (isMagnetic) {
        question = '次の金属のうち、磁石につくものはどれですか。';
        answer = '鉄';
        choices = shuffle(['鉄', ...shuffle(NONMAGNETIC_METALS_1_).slice(0, 3)]);
        steps = ['金属の中で、磁石につくのは鉄などごく一部だけである'];
      } else {
        answer = NONMAGNETIC_METALS_1_[randInt(0, NONMAGNETIC_METALS_1_.length - 1)];
        question = '次の金属のうち、磁石につかないものはどれですか。';
        const others = NONMAGNETIC_METALS_1_.filter(m => m !== answer);
        choices = shuffle([answer, '鉄', ...shuffle(others).slice(0, 2)]);
        steps = [`${answer}は磁石につかない`, '鉄は磁石につくが、銅・アルミニウム・金・銀・鉛などは磁石につかない'];
      }
      return { category: 'matterInvestigation1', question, answer, choices, steps };
    } else if (pat === 8) {
      answer = NONMETAL_EXAMPLES_1_[randInt(0, NONMETAL_EXAMPLES_1_.length - 1)];
      question = '次のうち、非金属であるものはどれですか。';
      const metalNames = shuffle(DENSITY_TABLE_1_.map(e => e.name)).slice(0, 3);
      choices = shuffle([answer, ...metalNames]);
      steps = [`${answer}は金属ではないので非金属`, '非金属は電気を通しにくく、磁石にもつかない'];
      return { category: 'matterInvestigation1', question, answer, choices, steps };
    } else if (pat === 9) {
      const LIQUIDS_ = [{ name: '水', d: 1.00 }, { name: '水銀', d: 13.6 }];
      const liquid = LIQUIDS_[randInt(0, 1)];
      const obj = DENSITY_TABLE_1_[randInt(0, DENSITY_TABLE_1_.length - 1)];
      answer = obj.d > liquid.d ? '沈む' : '浮く';
      const opposite = answer === '沈む' ? '浮く' : '沈む';
      question = `密度${obj.d}g/cm³の${obj.name}を、密度${liquid.d}g/cm³の${liquid.name}に入れると、${obj.name}はどうなりますか。`;
      choices = shuffle([answer, opposite, '完全にとけてなくなる', '液体の中間の高さで静止する']);
      steps = [`物体の密度が液体の密度より大きいときは沈み、小さいときは浮く`, `${obj.name}の密度(${obj.d}g/cm³)は${liquid.name}の密度(${liquid.d}g/cm³)より${obj.d > liquid.d ? '大きい' : '小さい'}ので、${answer}`];
      return { category: 'matterInvestigation1', question, answer, choices, steps };
    } else if (pat === 10) {
      const isEyeQ = Math.random() < 0.5;
      if (isEyeQ) {
        question = 'メスシリンダーの目盛りを読むときは、目の位置をどこに合わせますか。';
        answer = '液面と同じ高さ（水平な位置）';
        choices = shuffle([answer, 'メスシリンダーの真上', '液面より少し低い位置', '液面より少し高い位置']);
        steps = ['目盛りは、液面と同じ高さから水平に見て読む'];
      } else {
        question = 'メスシリンダーの目盛りを読むとき、最小目盛りの何分の1まで目分量で読みますか。';
        answer = '10分の1（1/10）';
        choices = shuffle([answer, '2分の1（1/2）', '100分の1（1/100）', '5分の1（1/5）']);
        steps = ['メスシリンダーは、最小目盛りの1/10まで目分量で読み取る'];
      }
      return { category: 'matterInvestigation1', question, answer, choices, steps };
    } else if (pat === 11) {
      const pick = BALANCE_DESCRIPTIONS_1_[randInt(0, 1)];
      question = `次の特徴を持つ実験器具は何ですか。「${pick.desc}」`;
      answer = pick.ans;
      choices = shuffle([pick.ans, ...['上皿てんびん', '電子てんびん', 'メスシリンダー', '温度計'].filter(c => c !== pick.ans).slice(0, 3)]);
      steps = [`「${pick.desc}」は${answer}の使い方`];
      return { category: 'matterInvestigation1', question, answer, choices, steps };
    } else {
      question = '密度の単位として使われるものはどれですか。';
      answer = 'g/cm³';
      choices = shuffle(['g/cm³', 'cm³/g', 'g/cm', 'cm/g']);
      steps = ['密度の単位は、グラム毎立方センチメートル(g/cm³)である'];
      return { category: 'matterInvestigation1', question, answer, choices, steps };
    }
  }

  // 白い粉末の見分け方（中1）：有機物・無機物の区別、燃焼でできる物質(二酸化炭素・水)の知識問題。
  const ORGANIC_EXAMPLES_1_ = ['白砂糖', 'デンプン', 'ろう', 'エタノール'];
  const INORGANIC_EXAMPLES_1_ = ['食塩', '鉄', 'ガラス', 'アルミニウム'];
  function genWhitePowder1() {
    const pat = randInt(0, 15);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '炭素をふくみ、燃やすと炭になったり、二酸化炭素と水ができたりする物質を何といいますか。';
      answer = '有機物';
      choices = shuffle(['有機物', '無機物', '金属', '非金属']);
      steps = ['炭素をふくむ物質を有機物、それ以外を無機物という'];
    } else if (pat === 1) {
      question = '有機物ではない物質を何といいますか。';
      answer = '無機物';
      choices = shuffle(['無機物', '有機物', '金属光沢', '展性']);
      steps = ['有機物以外の物質を無機物という'];
    } else if (pat === 2) {
      const pick = ORGANIC_EXAMPLES_1_[randInt(0, ORGANIC_EXAMPLES_1_.length - 1)];
      question = `次のうち、有機物はどれですか。`;
      answer = pick;
      const distractors = shuffle(INORGANIC_EXAMPLES_1_).slice(0, 3);
      choices = shuffle([pick, ...distractors]);
      steps = [`${pick}は炭素をふくむ有機物`];
    } else if (pat === 3) {
      const pick = INORGANIC_EXAMPLES_1_[randInt(0, INORGANIC_EXAMPLES_1_.length - 1)];
      question = `次のうち、無機物はどれですか。`;
      answer = pick;
      const distractors = shuffle(ORGANIC_EXAMPLES_1_).slice(0, 3);
      choices = shuffle([pick, ...distractors]);
      steps = [`${pick}は炭素をふくまない無機物`];
    } else if (pat === 4) {
      question = '物質を燃やしたときにできる気体のうち、石灰水を白くにごらせるものは何ですか。';
      answer = '二酸化炭素';
      choices = shuffle(['二酸化炭素', '酸素', '水素', '窒素']);
      steps = ['二酸化炭素には石灰水を白くにごらせる性質がある'];
    } else if (pat === 5) {
      question = '物質を燃やしたときに集気びんの内側がくもるのは、何という物質ができたためですか。';
      answer = '水';
      choices = shuffle(['水', '二酸化炭素', '炭', '灰']);
      steps = ['有機物を燃やすと水ができ、集気びんの内側で水滴となってくもる'];
    } else if (pat === 6) {
      question = 'ガスバーナーに火をつけるときの、正しい順番はどれですか。';
      answer = '元栓を開く→コックを開く→マッチに火をつける→ガス調節ねじを開く';
      choices = shuffle([
        answer,
        'コックを開く→元栓を開く→マッチに火をつける→ガス調節ねじを開く',
        'ガス調節ねじを開く→マッチに火をつける→元栓を開く→コックを開く',
        '元栓を開く→マッチに火をつける→コックを開く→ガス調節ねじを開く',
      ]);
      steps = ['まず上下のねじが閉まっているか確認し、元栓→コック→マッチに火をつける→ガス調節ねじを開く、の順に点火する'];
    } else if (pat === 7) {
      question = 'ガスバーナーの火を消すときの、正しい順番はどれですか。';
      answer = '空気調節ねじ→ガス調節ねじ→コック→元栓';
      choices = shuffle([
        answer,
        'ガス調節ねじ→空気調節ねじ→コック→元栓',
        '元栓→コック→ガス調節ねじ→空気調節ねじ',
        'コック→元栓→空気調節ねじ→ガス調節ねじ',
      ]);
      steps = ['火を消すときは、空気調節ねじ→ガス調節ねじ→コック→元栓の順に閉めていく'];
    } else if (pat === 8) {
      question = 'ガスバーナーの火を消すとき、最初に閉めるねじはどれですか。';
      answer = '空気調節ねじ';
      choices = shuffle(['空気調節ねじ', 'ガス調節ねじ', 'コック', '元栓']);
      steps = ['火を消すときは、空気調節ねじ→ガス調節ねじ→コック→元栓の順に閉める'];
    } else if (pat === 9) {
      question = 'ガスバーナーで、上下2つのねじのうち、上にあって空気の量を調節するねじを何といいますか。';
      answer = '空気調節ねじ';
      choices = shuffle(['空気調節ねじ', 'ガス調節ねじ', 'コック', '元栓']);
      steps = ['ガスバーナーの上のねじが空気調節ねじ、下のねじがガス調節ねじである'];
    } else if (pat === 10) {
      question = 'ガスバーナーで、上下2つのねじのうち、下にあってガスの量を調節するねじを何といいますか。';
      answer = 'ガス調節ねじ';
      choices = shuffle(['ガス調節ねじ', '空気調節ねじ', 'コック', '元栓']);
      steps = ['ガスバーナーの上のねじが空気調節ねじ、下のねじがガス調節ねじである'];
    } else if (pat === 11) {
      question = 'ガスバーナーのガス調節ねじ・空気調節ねじを、ゆるめて開くときは、どちらに回しますか（バーナーを正面から見たとき）。';
      answer = '左（反時計回り）';
      choices = shuffle(['左（反時計回り）', '右（時計回り）', '上', '下']);
      steps = ['ガス調節ねじ・空気調節ねじは、どちらも左(反時計回り)に回すとゆるんで開く'];
    } else if (pat === 12) {
      question = 'ガスバーナーに火をつけたとき、炎が赤色(オレンジ色)で不安定でした。青色の安定した炎にするには、どうすればよいですか。';
      answer = '空気調節ねじをゆるめて、空気の量を増やす';
      choices = shuffle([
        answer,
        'ガス調節ねじをしめて、ガスの量を減らす',
        '空気調節ねじをしめて、空気の量を減らす',
        '元栓をしめて、ガスの量を減らす',
      ]);
      steps = ['炎が赤いのは空気が不足しているためなので、空気調節ねじをゆるめて空気の量を増やし、青色の安定した炎にする'];
    } else if (pat === 13) {
      question = '白い粉末を水を入れた試験管に入れてふり混ぜたところ、とけずに白くにごりました。この粉末として最も適切なものはどれですか。（食塩・白砂糖・デンプン・グラニュー糖のいずれか）';
      answer = 'デンプン';
      choices = shuffle(['デンプン', '食塩', '白砂糖', 'グラニュー糖']);
      steps = ['デンプンは水にとけにくく、水に入れてふり混ぜると白くにごる', '食塩・白砂糖・グラニュー糖は水にとける'];
    } else if (pat === 14) {
      question = '白い粉末を弱火で加熱したところ、こげたり液体になったりせず、変化しませんでした。この粉末として最も適切なものはどれですか。（食塩・白砂糖・デンプン・グラニュー糖のいずれか）';
      answer = '食塩';
      choices = shuffle(['食塩', '白砂糖', 'デンプン', 'グラニュー糖']);
      steps = ['食塩は無機物なので、熱しても燃えたりこげたりせず変化しない', '白砂糖・デンプン・グラニュー糖は有機物なので、熱するとこげたり液体になったりする'];
    } else {
      question = '白砂糖とグラニュー糖は、どちらも水にとけ、熱するとこげる点で似ていますが、何のちがいで見分けることができますか。';
      answer = '粒の大きさ';
      choices = shuffle(['粒の大きさ', '色', 'におい', '手ざわり']);
      steps = ['白砂糖とグラニュー糖は見た目や性質がよく似ているが、グラニュー糖の方が粒が大きいことで見分けられる'];
    }
    return { category: 'whitePowder1', question, answer, choices, steps };
  }

  // 気体の性質（中1）：気体の調べ方(におい・水へのとけやすさ・助燃性・可燃性・リトマス紙・
  // BTB溶液)、二酸化炭素・酸素・水素・窒素・アンモニアの発生方法・性質の比較、
  // 気体の集め方(水上置換法・上方置換法・下方置換法)、空気の組成、密度比較。
  const GAS_DENSITY_TABLE_1_ = [
    { name: '二酸化炭素', d: 1.53 },
    { name: '酸素', d: 1.11 },
    { name: '水素', d: 0.07 },
    { name: '窒素', d: 0.97 },
    { name: 'アンモニア', d: 0.60 },
  ];
  function genGasProperties1() {
    const pat = randInt(0, 35);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '二酸化炭素を発生させるには、石灰石(貝殻)に何を加えればよいですか。';
      answer = 'うすい塩酸';
      choices = shuffle(['うすい塩酸', 'オキシドール(うすい過酸化水素水)', '二酸化マンガン', '食塩水']);
      steps = ['二酸化炭素は、石灰石(貝殻)にうすい塩酸を加えると発生する'];
    } else if (pat === 1) {
      question = '酸素を発生させるには、二酸化マンガンに何を加えればよいですか。';
      answer = 'オキシドール(うすい過酸化水素水)';
      choices = shuffle(['オキシドール(うすい過酸化水素水)', 'うすい塩酸', '石灰石', '食塩水']);
      steps = ['酸素は、二酸化マンガンにオキシドール(うすい過酸化水素水)を加えると発生する'];
    } else if (pat === 2) {
      question = '二酸化炭素を発生させるとき、うすい塩酸を加える固体は何ですか。';
      answer = '石灰石(貝殻)';
      choices = shuffle(['石灰石(貝殻)', '二酸化マンガン', '鉄', '食塩']);
      steps = ['石灰石(貝殻)にうすい塩酸を加えると、二酸化炭素が発生する'];
    } else if (pat === 3) {
      question = '酸素を発生させるとき、オキシドール(うすい過酸化水素水)を加える固体は何ですか。';
      answer = '二酸化マンガン';
      choices = shuffle(['二酸化マンガン', '石灰石(貝殻)', '鉄', '食塩']);
      steps = ['二酸化マンガンにオキシドール(うすい過酸化水素水)を加えると、酸素が発生する'];
    } else if (pat === 4) {
      question = '二酸化炭素と酸素のうち、石灰水を白くにごらせるのはどちらですか。';
      answer = '二酸化炭素';
      choices = shuffle(['二酸化炭素', '酸素', 'どちらも白くにごらせる', 'どちらも白くにごらせない']);
      steps = ['二酸化炭素には石灰水を白くにごらせる性質がある。酸素は石灰水を変化させない'];
    } else if (pat === 5) {
      question = '二酸化炭素を集めた試験管に、火のついた線香を入れるとどうなりますか。';
      answer = '火が消える';
      choices = shuffle(['火が消える', '線香が激しく燃える', '変化しない', '線香が青く燃える']);
      steps = ['二酸化炭素には物を燃やすはたらきがないため、線香の火は消える'];
    } else if (pat === 6) {
      question = '酸素を集めた試験管に、火のついた線香を入れるとどうなりますか。';
      answer = '線香が激しく燃える';
      choices = shuffle(['線香が激しく燃える', '火が消える', '変化しない', '線香が黒くこげるだけで燃えない']);
      steps = ['酸素には物を燃やすはたらき(助燃性)があるため、線香が激しく燃える'];
    } else if (pat === 7) {
      question = '物質を燃やすはたらきを持つ性質を何といいますか。';
      answer = '助燃性';
      choices = shuffle(['助燃性', '可燃性', '酸性', '中性']);
      steps = ['ものを燃やすのを助けるはたらきを助燃性という。酸素には助燃性がある'];
    } else if (pat === 8) {
      question = '気体そのものが燃える性質を何といいますか。';
      answer = '可燃性';
      choices = shuffle(['可燃性', '助燃性', '酸性', '中性']);
      steps = ['気体そのものが燃える性質を可燃性という'];
    } else if (pat === 9) {
      question = '二酸化炭素が水にとけた水溶液は、何性を示しますか。';
      answer = '酸性';
      choices = shuffle(['酸性', '中性', 'アルカリ性', 'どれでもない']);
      steps = ['二酸化炭素の水溶液は酸性を示す(BTB溶液を黄色に変化させる)'];
    } else if (pat === 10) {
      question = '酸素の水溶液は何性を示しますか。';
      answer = '中性';
      choices = shuffle(['中性', '酸性', 'アルカリ性', 'どれでもない']);
      steps = ['酸素は水にとけにくく、水溶液は中性を示す(BTB溶液の色は変化しない)'];
    } else if (pat === 11) {
      question = '緑色のBTB溶液が黄色に変化したとき、その水溶液は何性ですか。';
      answer = '酸性';
      choices = shuffle(['酸性', '中性', 'アルカリ性', 'どれでもない']);
      steps = ['BTB溶液は、酸性で黄色、中性で緑色、アルカリ性で青色になる'];
    } else if (pat === 12) {
      question = '緑色のBTB溶液が青色に変化したとき、その水溶液は何性ですか。';
      answer = 'アルカリ性';
      choices = shuffle(['アルカリ性', '酸性', '中性', 'どれでもない']);
      steps = ['BTB溶液は、酸性で黄色、中性で緑色、アルカリ性で青色になる'];
    } else if (pat === 13) {
      question = '緑色のBTB溶液の色が変化しなかったとき、その水溶液は何性ですか。';
      answer = '中性';
      choices = shuffle(['中性', '酸性', 'アルカリ性', 'どれでもない']);
      steps = ['BTB溶液は、酸性で黄色、中性で緑色、アルカリ性で青色になる'];
    } else if (pat === 14) {
      question = '青色のリトマス紙を気体にふれさせたところ、赤色に変わりました。この気体がとけた水溶液は何性を示すと考えられますか。';
      answer = '酸性';
      choices = shuffle(['酸性', 'アルカリ性', '中性', 'どれでもない']);
      steps = ['青色リトマス紙が赤色に変わるのは、酸性の性質を示すとき'];
    } else if (pat === 15) {
      question = '赤色のリトマス紙を気体にふれさせたところ、青色に変わりました。この気体がとけた水溶液は何性を示すと考えられますか。';
      answer = 'アルカリ性';
      choices = shuffle(['アルカリ性', '酸性', '中性', 'どれでもない']);
      steps = ['赤色リトマス紙が青色に変わるのは、アルカリ性の性質を示すとき'];
    } else if (pat === 16) {
      question = '気体のにおいを調べるときの、正しい方法はどれですか。';
      answer = '手であおぐようにして、直接吸い込まないようにかぐ';
      choices = shuffle([answer, '鼻を気体に直接近づけて大きく吸い込む', '目を近づけてよく見る', '気体に直接口をつけて吸う']);
      steps = ['気体のにおいをかぐときは、手であおぐようにして、直接吸い込まないようにする'];
    } else if (pat === 17) {
      question = '気体が水にとけるかどうかを調べる方法として、正しいものはどれですか。';
      answer = '気体の入ったペットボトルに少量の水を入れ、ふたをしてよくふる';
      choices = shuffle([answer, '気体のにおいを直接かぐ', '気体に火のついた線香を入れる', '気体に石灰水を入れずに放置する']);
      steps = ['気体が水にとけやすいかどうかは、気体の入ったペットボトルに水を入れてふり、ペットボトルがへこむかどうかで調べる'];
    } else if (pat === 18) {
      question = '酸素は、空気と比べて密度はどうですか。';
      answer = '空気よりも少し大きい（重い）';
      choices = shuffle([answer, '空気よりもかなり大きい（重い）', '空気よりも小さい（軽い）', '空気とほぼ同じである']);
      steps = ['酸素は空気よりも密度が少し大きい(重い)気体である'];
    } else if (pat === 19) {
      question = '水素を発生させるには、亜鉛などの金属に何を加えればよいですか。';
      answer = 'うすい塩酸';
      choices = shuffle(['うすい塩酸', 'オキシドール(うすい過酸化水素水)', '石灰石', '食塩水']);
      steps = ['水素は、亜鉛などの金属にうすい塩酸を加えると発生する'];
    } else if (pat === 20) {
      question = '水素は、物質の中でどのような性質を持ちますか。';
      answer = '物質の中でいちばん密度が小さい';
      choices = shuffle([answer, '物質の中でいちばん密度が大きい', '空気とほぼ同じ密度である', '水よりも重い']);
      steps = ['水素は、すべての物質の中でいちばん密度が小さい気体である'];
    } else if (pat === 21) {
      question = '水素に火をつけるとどうなりますか。';
      answer = '音を出して燃え、水ができる';
      choices = shuffle([answer, '火が消える', '爆発して分解するだけで何もできない', '変化しない']);
      steps = ['水素は空気中で火をつけると、音を出して燃え、水ができる'];
    } else if (pat === 22) {
      question = '空気の体積の約何%が窒素ですか。';
      answer = '約78%';
      choices = shuffle(['約78%', '約21%', '約4%', '約1%']);
      steps = ['空気の組成は、窒素が約78%、酸素が約21%である'];
    } else if (pat === 23) {
      question = '空気の体積の約何%が酸素ですか。';
      answer = '約21%';
      choices = shuffle(['約21%', '約78%', '約50%', '約1%']);
      steps = ['空気の組成は、窒素が約78%、酸素が約21%である'];
    } else if (pat === 24) {
      question = '窒素は、ふつうの温度でどのような性質を示しますか。';
      answer = 'ほかの物質と反応しにくい(燃えない)';
      choices = shuffle([answer, '非常に反応しやすく、よく燃える', '強い酸性を示す', '強いアルカリ性を示す']);
      steps = ['窒素はふつうの温度では他の物質とほとんど反応せず、燃えたり物を燃やしたりしない'];
    } else if (pat === 25) {
      question = 'アンモニアを発生させるには、塩化アンモニウムに何を混ぜ合わせて加熱すればよいですか。';
      answer = '水酸化カルシウム';
      choices = shuffle(['水酸化カルシウム', '二酸化マンガン', '石灰石', '食塩']);
      steps = ['塩化アンモニウムと水酸化カルシウムを混ぜ合わせて加熱すると、アンモニアが発生する'];
    } else if (pat === 26) {
      question = 'アンモニアのにおいの特徴として正しいものはどれですか。';
      answer = '特有の刺激臭がある';
      choices = shuffle([answer, '無臭である', '甘いにおいがする', 'こげたようなにおいがする']);
      steps = ['アンモニアには特有の刺激臭がある'];
    } else if (pat === 27) {
      question = 'アンモニアは水に非常にとけやすく、空気より密度が小さい気体です。この気体を集めるのに適した方法はどれですか。';
      answer = '上方置換法';
      choices = shuffle(['上方置換法', '下方置換法', '水上置換法', 'ろ過']);
      steps = ['水にとけやすく、空気より密度が小さい気体は上方置換法で集める'];
    } else if (pat === 28) {
      question = 'アンモニアが水にとけた水溶液(アンモニア水)は、何性を示しますか。';
      answer = 'アルカリ性';
      choices = shuffle(['アルカリ性', '酸性', '中性', 'どれでもない']);
      steps = ['アンモニア水はアルカリ性を示す(フェノールフタレイン溶液を赤色に変える)'];
    } else if (pat === 29) {
      question = '水にとけにくい気体を集めるのに適した方法はどれですか。';
      answer = '水上置換法';
      choices = shuffle(['水上置換法', '上方置換法', '下方置換法', 'ろ過']);
      steps = ['水にとけにくい気体は水上置換法で集める'];
    } else if (pat === 30) {
      question = '水にとけやすく、空気より密度が大きい気体を集めるのに適した方法はどれですか。';
      answer = '下方置換法';
      choices = shuffle(['下方置換法', '上方置換法', '水上置換法', 'ろ過']);
      steps = ['水にとけやすく、空気より密度が大きい気体は下方置換法で集める'];
    } else if (pat === 31) {
      question = '水にとけやすく、空気より密度が小さい気体を集めるのに適した方法はどれですか。';
      answer = '上方置換法';
      choices = shuffle(['上方置換法', '下方置換法', '水上置換法', 'ろ過']);
      steps = ['水にとけやすく、空気より密度が小さい気体は上方置換法で集める'];
    } else if (pat === 32) {
      const idx = randInt(0, GAS_DENSITY_TABLE_1_.length - 1);
      const entry = GAS_DENSITY_TABLE_1_[idx];
      question = `空気を1としたときの密度が約${entry.d}である気体はどれですか。`;
      answer = entry.name;
      const others = GAS_DENSITY_TABLE_1_.filter((_, i) => i !== idx).map(e => e.name);
      choices = shuffle([answer, ...shuffle(others).slice(0, 3)]);
      steps = [`${entry.name}は、空気を1としたときの密度が約${entry.d}である`];
    } else if (pat === 33) {
      const idx = randInt(0, GAS_DENSITY_TABLE_1_.length - 1);
      const entry = GAS_DENSITY_TABLE_1_[idx];
      question = `${entry.name}の、空気を1としたときの密度は約何ですか。`;
      answer = entry.d.toFixed(2);
      const otherVals = GAS_DENSITY_TABLE_1_.filter((_, i) => i !== idx).map(e => e.d.toFixed(2));
      choices = buildChoicesFromList(answer, shuffle(otherVals).slice(0, 3));
      steps = [`${entry.name}の、空気を1としたときの密度は約${entry.d}である`];
    } else if (pat === 34) {
      const others = GAS_DENSITY_TABLE_1_.filter(g => g.name !== '水素').map(g => g.name);
      question = '次の気体のうち、空気を1としたときの密度がいちばん小さいものはどれですか。';
      answer = '水素';
      choices = shuffle(['水素', ...shuffle(others).slice(0, 3)]);
      steps = ['水素は物質の中でいちばん密度が小さい気体である(空気を1とした密度比は約0.07)'];
    } else {
      question = '空気中に最も多くふくまれる気体は何ですか。';
      answer = '窒素';
      choices = shuffle(['窒素', '酸素', '二酸化炭素', 'アルゴン']);
      steps = ['空気中には窒素が約78%、酸素が約21%ふくまれており、窒素が最も多い'];
    }
    return { category: 'gasProperties1', question, answer, choices, steps };
  }

  // 物質が水にとけるようす（中1）：溶質・溶媒・溶液・水溶液の用語、水溶液の性質、
  // 質量パーセント濃度の計算(3方向)。
  const DISSOLVE1_SOLUTE_ITEMS_ = ['食塩', '砂糖', 'ミョウバン'];
  function genDissolve1() {
    const pat = randInt(0, 11);
    let question, answer, choices, steps, wrongs;
    if (pat === 0) {
      question = '水溶液にとけている物質を何といいますか。';
      answer = '溶質';
      choices = shuffle(['溶質', '溶媒', '溶液', '結晶']);
      steps = ['水溶液にとけている物質を溶質という'];
    } else if (pat === 1) {
      question = '物質をとかしている液体を何といいますか。';
      answer = '溶媒';
      choices = shuffle(['溶媒', '溶質', '溶液', 'ろ液']);
      steps = ['物質をとかしている液体を溶媒という'];
    } else if (pat === 2) {
      question = '溶質が溶媒にとけた液全体を何といいますか。';
      answer = '溶液';
      choices = shuffle(['溶液', '溶質', '溶媒', '結晶']);
      steps = ['溶質が溶媒にとけた液全体を溶液という'];
    } else if (pat === 3) {
      question = '溶媒が水である溶液を何といいますか。';
      answer = '水溶液';
      choices = shuffle(['水溶液', '純粋な物質', '混合物', 'ろ液']);
      steps = ['溶媒が水である溶液を水溶液という'];
    } else if (pat === 4) {
      question = '水溶液の性質として正しいものはどれですか。';
      answer = '透明である（色がついていることもある）';
      choices = shuffle([answer, 'とけた物質が時間がたつと底にしずむ', '場所によって濃さがちがう', 'つぶが不均一に散らばっている']);
      steps = ['水溶液は、とけた物質の粒が均一に広がっていて、時間がたってもかたよったりしずんだりしない透明な液体である'];
    } else if (pat === 5) {
      const item = DISSOLVE1_SOLUTE_ITEMS_[randInt(0, DISSOLVE1_SOLUTE_ITEMS_.length - 1)];
      const concentration = 5 * randInt(1, 8);
      const solutionMass = 20 * randInt(3, 20);
      const soluteMass = (solutionMass * concentration) / 100;
      const solventMass = solutionMass - soluteMass;
      question = `水${solventMass}gに${item}${soluteMass}gをとかした水溶液の質量パーセント濃度は何%ですか。`;
      answer = concentration;
      wrongs = [concentration + 5, concentration + 10, Math.max(1, concentration - 5), Math.max(1, concentration - 10)].filter(v => v !== answer);
      steps = [`質量パーセント濃度 = 溶質の質量 ÷ 溶液の質量 × 100`, `= ${soluteMass} ÷ (${soluteMass}+${solventMass}) × 100 = ${answer}%`];
      return { category: 'dissolve1', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 6) {
      const item = DISSOLVE1_SOLUTE_ITEMS_[randInt(0, DISSOLVE1_SOLUTE_ITEMS_.length - 1)];
      const concentration = 5 * randInt(1, 8);
      const solutionMass = 20 * randInt(3, 20);
      const soluteMass = (solutionMass * concentration) / 100;
      question = `質量パーセント濃度${concentration}%の${item}水が${solutionMass}gあります。とけている${item}は何gですか。`;
      answer = soluteMass;
      wrongs = [soluteMass + 2, soluteMass + 4, Math.max(1, soluteMass - 2), Math.max(1, soluteMass - 4)].filter(v => v !== answer);
      steps = [`溶質の質量 = 溶液の質量 × 濃度 ÷ 100`, `= ${solutionMass} × ${concentration} ÷ 100 = ${answer}g`];
      return { category: 'dissolve1', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 7) {
      const item = DISSOLVE1_SOLUTE_ITEMS_[randInt(0, DISSOLVE1_SOLUTE_ITEMS_.length - 1)];
      const concentration = 5 * randInt(1, 8);
      const solutionMass = 20 * randInt(3, 20);
      const soluteMass = (solutionMass * concentration) / 100;
      const solventMass = solutionMass - soluteMass;
      question = `${soluteMass}gの${item}を水にとかして、質量パーセント濃度${concentration}%の${item}水を作りたい。水は何g必要ですか。`;
      answer = solventMass;
      wrongs = [solventMass + 5, solventMass + 10, Math.max(1, solventMass - 5), Math.max(1, solventMass - 10)].filter(v => v !== answer);
      steps = [`溶液の質量 = 溶質の質量 ÷ (濃度 ÷ 100) = ${soluteMass} ÷ ${concentration / 100} = ${solutionMass}g`, `水の質量 = ${solutionMass} − ${soluteMass} = ${answer}g`];
      return { category: 'dissolve1', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 8) {
      question = 'ろ過をするとき、ろ紙はどこに密着させますか。';
      answer = 'ろうと';
      choices = shuffle(['ろうと', 'ビーカーの壁', 'ガラス棒', '三脚']);
      steps = ['ろ過をするときは、ろ紙を水でぬらしてろうとに密着させてから使う'];
    } else if (pat === 9) {
      question = 'ろ過で液体をろうとに注ぐとき、正しい方法はどれですか。';
      answer = 'ガラス棒を伝わらせて注ぐ';
      choices = shuffle([answer, 'ろうとに直接勢いよく注ぐ', 'ガラス棒を使わず、ビーカーから直接すべて一気に注ぐ', 'ろ紙の外側から注ぐ']);
      steps = ['ろ過で液体を注ぐときは、ガラス棒を伝わらせて静かに注ぐ'];
    } else if (pat === 10) {
      question = 'ろ過をするとき、ろうとの脚(あし)はどのようにしますか。';
      answer = '脚の長い方をビーカーの壁につける';
      choices = shuffle([answer, '脚をビーカーの底につける', '脚をビーカーには触れさせない', '脚を上に向ける']);
      steps = ['ろうとの脚の長い方を、ビーカーの内側の壁につけるようにする'];
    } else {
      question = 'ろ過によって、水溶液中の何と何を分けることができますか。';
      answer = 'とけずに残った固体と、水溶液(ろ液)';
      choices = shuffle([answer, '水と水素', '酸性の部分とアルカリ性の部分', '固体の色のちがい']);
      steps = ['ろ過は、液体にとけずに残っている固体と、液体(ろ液)を分ける操作である'];
    }
    return { category: 'dissolve1', question, answer, choices, steps };
  }

  // 溶解度と再結晶（中1）：結晶・飽和水溶液・溶解度・溶解度曲線・再結晶の用語、
  // 硝酸カリウム/塩化ナトリウムの溶解度表を使った知識問題と析出量の計算。
  const SOLUBILITY1_TEMPS_ = [0, 10, 20, 40, 60, 80, 100];
  const SOLUBILITY1_KNO3_ = [13.3, 22.0, 31.6, 63.9, 109.2, 168.8, 244.8];
  function solubility1Round1_(x) { return Math.round(x * 10) / 10; }
  function genSolubility1() {
    const pat = randInt(0, 12);
    let question, answer, choices, steps, wrongs;
    if (pat === 0) {
      question = '規則正しい形をした固体を何といいますか。';
      answer = '結晶';
      choices = shuffle(['結晶', '溶質', '溶解度', '再結晶']);
      steps = ['規則正しい形をした固体を結晶という'];
    } else if (pat === 1) {
      question = '物質が水にそれ以上とけることができなくなった水溶液を何といいますか。';
      answer = '飽和水溶液';
      choices = shuffle(['飽和水溶液', '再結晶', '溶解度曲線', 'ろ液']);
      steps = ['物質がとけるだけとけた水溶液を飽和水溶液という'];
    } else if (pat === 2) {
      question = '100gの水にとかすことができる物質の最大の質量を何といいますか。';
      answer = '溶解度';
      choices = shuffle(['溶解度', '濃度', '密度', '融点']);
      steps = ['水100gにとける物質の限度の質量を溶解度という'];
    } else if (pat === 3) {
      question = '溶解度を、水の温度に対するグラフで表したものを何といいますか。';
      answer = '溶解度曲線';
      choices = shuffle(['溶解度曲線', '状態変化', '飽和水溶液', '質量パーセント濃度']);
      steps = ['溶解度を水の温度に対して表したグラフを溶解度曲線という'];
    } else if (pat === 4) {
      question = 'いったん水にとかした物質を、温度を下げたり水を蒸発させたりして、再び結晶としてとり出すことを何といいますか。';
      answer = '再結晶';
      choices = shuffle(['再結晶', '結晶', '溶解', 'ろ過']);
      steps = ['水にとかした物質を再び結晶としてとり出すことを再結晶という'];
    } else if (pat === 5) {
      question = '硝酸カリウムと塩化ナトリウムのうち、水溶液の温度を下げることで結晶を多くとり出せるのはどちらですか。（温度による溶解度の変化が大きい方）';
      answer = '硝酸カリウム';
      choices = shuffle(['硝酸カリウム', '塩化ナトリウム', 'どちらも同じ', 'どちらもとり出せない']);
      steps = ['硝酸カリウムは温度が下がると溶解度が大きく下がるため、冷やすと結晶が多く出てくる', '塩化ナトリウムは温度による溶解度の変化が小さいため、冷やしてもあまり結晶が出てこない'];
    } else if (pat === 6) {
      question = '塩化ナトリウムのように、温度による溶解度の変化が小さい物質から結晶をとり出すのに適した方法はどれですか。';
      answer = '水を蒸発させる';
      choices = shuffle(['水を蒸発させる', '水溶液の温度を下げる', '水を加える', '水溶液をあたためる']);
      steps = ['温度による溶解度の変化が小さい物質は、冷やしてもあまり結晶が出ないため、水を蒸発させて濃度を上げることで結晶をとり出す'];
    } else if (pat === 7) {
      let t1idx, t2idx;
      do { t1idx = randInt(0, SOLUBILITY1_TEMPS_.length - 1); t2idx = randInt(0, SOLUBILITY1_TEMPS_.length - 1); } while (t1idx <= t2idx);
      const t1 = SOLUBILITY1_TEMPS_[t1idx], t2 = SOLUBILITY1_TEMPS_[t2idx];
      const diff = solubility1Round1_(SOLUBILITY1_KNO3_[t1idx] - SOLUBILITY1_KNO3_[t2idx]);
      question = `${t1}℃の水100gに硝酸カリウムをとけるだけとかした飽和水溶液を、${t2}℃まで冷やすと、何gの結晶が出てきますか。（${t1}℃での溶解度は${SOLUBILITY1_KNO3_[t1idx]}g、${t2}℃での溶解度は${SOLUBILITY1_KNO3_[t2idx]}g）`;
      answer = diff;
      wrongs = [solubility1Round1_(diff + 5), solubility1Round1_(diff + 10), Math.max(0.1, solubility1Round1_(diff - 5)), Math.max(0.1, solubility1Round1_(diff - 10))].filter(v => v !== answer);
      steps = [`出てくる結晶の質量 = ${t1}℃の溶解度 − ${t2}℃の溶解度`, `= ${SOLUBILITY1_KNO3_[t1idx]} − ${SOLUBILITY1_KNO3_[t2idx]} = ${answer}g`];
      return { category: 'solubility1', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 8) {
      let t1idx, t2idx;
      do { t1idx = randInt(0, SOLUBILITY1_TEMPS_.length - 1); t2idx = randInt(0, SOLUBILITY1_TEMPS_.length - 1); } while (t1idx <= t2idx);
      const t1 = SOLUBILITY1_TEMPS_[t1idx], t2 = SOLUBILITY1_TEMPS_[t2idx];
      const waterAmounts = [50, 200, 300];
      const waterAmount = waterAmounts[randInt(0, waterAmounts.length - 1)];
      const diffPer100 = solubility1Round1_(SOLUBILITY1_KNO3_[t1idx] - SOLUBILITY1_KNO3_[t2idx]);
      const crystalMass = solubility1Round1_(diffPer100 * (waterAmount / 100));
      question = `${t1}℃の水${waterAmount}gに硝酸カリウムをとけるだけとかした飽和水溶液を、${t2}℃まで冷やすと、何gの結晶が出てきますか。（水100gあたりの溶解度は${t1}℃で${SOLUBILITY1_KNO3_[t1idx]}g、${t2}℃で${SOLUBILITY1_KNO3_[t2idx]}g）`;
      answer = crystalMass;
      wrongs = [solubility1Round1_(crystalMass + 5), solubility1Round1_(crystalMass + 10), Math.max(0.1, solubility1Round1_(crystalMass - 5)), Math.max(0.1, solubility1Round1_(crystalMass - 10))].filter(v => v !== answer);
      steps = [`水100gあたりの結晶量 = ${SOLUBILITY1_KNO3_[t1idx]} − ${SOLUBILITY1_KNO3_[t2idx]} = ${diffPer100}g`, `水${waterAmount}gでは ${diffPer100} × ${waterAmount}/100 = ${answer}g`];
      return { category: 'solubility1', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 9) {
      question = '結晶の形について、正しく説明しているものはどれですか。';
      answer = '物質によって決まった、規則正しい特有の形をしている';
      choices = shuffle([answer, '物質の種類に関係なく、すべて同じ形になる', '結晶にはこれといって決まった形はない', '温度によって毎回ちがう形になる']);
      steps = ['結晶の形は物質によって決まっており、物質ごとに特有の規則正しい形をしている'];
    } else if (pat === 10) {
      question = '冷やして結晶を出した水溶液から、結晶をとり出すために行う操作は何ですか。';
      answer = 'ろ過';
      choices = shuffle(['ろ過', '蒸留', '中和', '電気分解']);
      steps = ['冷やして出てきた結晶は、ろ過によって水溶液と分けてとり出す'];
    } else if (pat === 11) {
      question = '食塩や硝酸カリウムを水にとかす実験で、水溶液の温度を50℃まで上げた後に行う操作はどれですか。';
      answer = '水で冷やす';
      choices = shuffle(['水で冷やす', 'ろ過する', '蒸発させる', 'さらに加熱を続ける']);
      steps = ['水溶液の温度を50℃まで上げてとかした後、水で冷やしてようすを観察する'];
    } else {
      question = '食塩(塩化ナトリウム)の水溶液を冷やしても、結晶がほとんど出てこないのはなぜですか。';
      answer = '食塩は、温度による溶解度の変化が小さいため';
      choices = shuffle([answer, '食塩は水にとけないため', '食塩は温度が下がると溶解度が大きくなるため', '食塩は結晶をつくらない物質だから']);
      steps = ['食塩は温度による溶解度の変化が小さいため、冷やしてもあまり結晶が出てこない'];
    }
    return { category: 'solubility1', question, answer, choices, steps };
  }

  // 物質の状態変化（中1）：融解・凝固・蒸発・凝縮の用語、状態変化にともなう質量・体積の
  // 変化(粒子の数は変わらない、体積は変わる)、水の例外的な密度の関係、粒子モデル。
  function genStateChange1() {
    const pat = randInt(0, 15);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '固体が液体に変化することを何といいますか。';
      answer = '融解';
      choices = shuffle(['融解', '凝固', '蒸発', '凝縮']);
      steps = ['固体→液体の変化を融解という'];
    } else if (pat === 1) {
      question = '液体が固体に変化することを何といいますか。';
      answer = '凝固';
      choices = shuffle(['凝固', '融解', '蒸発', '凝縮']);
      steps = ['液体→固体の変化を凝固という'];
    } else if (pat === 2) {
      question = '液体が気体に変化することを何といいますか。';
      answer = '蒸発';
      choices = shuffle(['蒸発', '凝縮', '融解', '凝固']);
      steps = ['液体→気体の変化を蒸発(気化)という'];
    } else if (pat === 3) {
      question = '気体が液体に変化することを何といいますか。';
      answer = '凝縮';
      choices = shuffle(['凝縮', '蒸発', '融解', '凝固']);
      steps = ['気体→液体の変化を凝縮(液化)という'];
    } else if (pat === 4) {
      question = '物質が状態変化するとき、質量はどうなりますか。';
      answer = '変わらない';
      choices = shuffle(['変わらない', '大きくなる', '小さくなる', '0になる']);
      steps = ['状態変化では粒子の数は変わらないため、質量は変わらない'];
    } else if (pat === 5) {
      question = '物質が状態変化するとき、体積はどうなりますか。';
      answer = '変わる';
      choices = shuffle(['変わる', '変わらない', '2倍になる', '半分になる']);
      steps = ['状態変化では粒子の集まり方や運動のようすが変わるため、体積は変わる'];
    } else if (pat === 6) {
      question = '質量10gの水が液体から固体（氷）になると、体積は約10cm³から約11cm³になります。このことから、水が氷になると体積はどうなるとわかりますか。';
      answer = '大きくなる';
      choices = shuffle(['大きくなる', '小さくなる', '変わらない', '半分になる']);
      steps = ['ほとんどの物質は固体になると体積が小さくなるが、水は例外的に固体(氷)になると体積が大きくなる'];
    } else if (pat === 7) {
      question = '質量10gの水が液体から気体（水蒸気）になると、体積は約10cm³から約17000cm³になります。このことから、水が水蒸気になると体積はどうなるとわかりますか。';
      answer = '非常に大きくなる';
      choices = shuffle(['非常に大きくなる', '少し大きくなる', '変わらない', '小さくなる']);
      steps = ['液体が気体になると、粒子の運動が激しくなり粒子の間隔が広がるため、体積は非常に大きくなる'];
    } else if (pat === 8) {
      question = '固体・液体・気体のうち、同じ質量の水の密度が最も大きいのはどの状態のときですか。';
      answer = '液体';
      choices = shuffle(['液体', '固体', '気体', 'どれも同じ']);
      steps = ['質量が同じでも、固体(氷)は液体(水)より体積が大きいため密度は小さい', 'そのため氷は水に浮く。密度が最も大きいのは液体のとき'];
    } else if (pat === 9) {
      question = '物質が固体から液体、液体から気体に状態変化するとき、物質をつくる粒子の数はどうなりますか。';
      answer = '変化しない';
      choices = shuffle(['変化しない', '増える', '減る', '半分になる']);
      steps = ['状態変化では、物質をつくる粒子の数は変化しない。粒子の集まり方や運動のようすが変わるだけである'];
    } else if (pat === 10) {
      question = '固体に熱を加えて温度を上げていくと、粒子の運動はどうなりますか。';
      answer = '激しくなり、粒子と粒子の間が広がる';
      choices = shuffle([answer, 'おだやかになり、粒子と粒子の間がせまくなる', '変化しない', '粒子の数が増える']);
      steps = ['熱が加えられると粒子の運動が激しくなり、粒子と粒子の間が広がる'];
    } else if (pat === 11) {
      question = '気体を冷やしていくと、粒子の運動はどうなりますか。';
      answer = 'おだやかになり、粒子と粒子の間がせまくなる';
      choices = shuffle([answer, '激しくなり、粒子と粒子の間が広がる', '変化しない', '粒子の数が減る']);
      steps = ['冷やされると粒子の運動はおだやかになり、粒子と粒子の間がせまくなる'];
    } else if (pat === 12) {
      question = '固体・液体・気体のうち、粒子の運動が最も激しいのはどの状態ですか。';
      answer = '気体';
      choices = shuffle(['気体', '液体', '固体', 'どれも同じ']);
      steps = ['気体は粒子が自由に飛び回っており、3つの状態の中で粒子の運動が最も激しい'];
    } else if (pat === 13) {
      question = '固体・液体・気体のうち、粒子が最も規則正しく並んでいる状態はどれですか。';
      answer = '固体';
      choices = shuffle(['固体', '液体', '気体', 'どれも同じ']);
      steps = ['固体は粒子がほとんど動かず、規則正しく並んでいる'];
    } else if (pat === 14) {
      question = '水以外の多くの物質では、固体と液体のどちらの方が密度が大きいですか。';
      answer = '固体';
      choices = shuffle(['固体', '液体', 'どちらも同じ', '気体']);
      steps = ['多くの物質は、固体になると体積が小さくなるので、液体よりも密度が大きくなる（水は例外）'];
    } else {
      question = '水は、多くの物質とちがって、固体(氷)と液体(水)のどちらの方が密度が大きいですか。';
      answer = '液体（水）';
      choices = shuffle(['液体（水）', '固体（氷）', 'どちらも同じ', '気体']);
      steps = ['水は例外的に、固体(氷)になると体積が大きくなるため、液体(水)の方が密度が大きい'];
    }
    return { category: 'stateChange1', question, answer, choices, steps };
  }

  // 状態変化が起こるときの温度とその利用（中1）：融点・沸点の用語、純粋な物質は
  // 融点・沸点が一定であること、沸騰石の役割、物質ごとの融点・沸点表を使った状態判定。
  const MP_BP_TABLE_1_ = [
    { name: '鉄', mp: 1535, bp: 2750 },
    { name: '銅', mp: 1083, bp: 2567 },
    { name: '金', mp: 1064, bp: 2807 },
    { name: 'アルミニウム', mp: 660, bp: 2467 },
    { name: '水銀', mp: -39, bp: 357 },
    { name: '塩化ナトリウム', mp: 801, bp: 1413 },
    { name: '水', mp: 0, bp: 100 },
    { name: 'エタノール', mp: -115, bp: 78 },
    { name: '酸素', mp: -218, bp: -183 },
    { name: '窒素', mp: -210, bp: -196 },
    { name: 'パルミチン酸', mp: 63, bp: 360 },
    { name: 'ナフタレン', mp: 81, bp: 218 },
  ];
  function genMeltingBoiling1() {
    const pat = randInt(0, 12);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '固体が液体に変わるときの温度を何といいますか。';
      answer = '融点';
      choices = shuffle(['融点', '沸点', '凝固点', '沸騰']);
      steps = ['固体が液体に変わるときの温度を融点という'];
    } else if (pat === 1) {
      question = '液体が沸騰して気体に変わるときの温度を何といいますか。';
      answer = '沸点';
      choices = shuffle(['沸点', '融点', '凝固点', '融解']);
      steps = ['液体が沸騰して気体に変わるときの温度を沸点という'];
    } else if (pat === 2) {
      question = '純粋な物質の融点や沸点は、物質の量を変えるとどうなりますか。';
      answer = '変わらない(物質の種類によって決まっている)';
      choices = shuffle([answer, '量が多いほど高くなる', '量が多いほど低くなる', '量によって毎回変わる']);
      steps = ['純粋な物質の融点・沸点は、物質の量に関係なく、物質の種類によって決まっている一定の値である'];
    } else if (pat === 3) {
      question = '純粋な物質が融解している間(固体と液体が混ざっている間)、温度はどうなっていますか。';
      answer = '一定である(変化しない)';
      choices = shuffle([answer, '上がり続ける', '下がり続ける', '急激に上下する']);
      steps = ['純粋な物質が融解している間は、温度は融点のまま一定である'];
    } else if (pat === 4) {
      question = '純粋な物質が沸騰している間、温度はどうなっていますか。';
      answer = '一定である(変化しない)';
      choices = shuffle([answer, '上がり続ける', '下がり続ける', '急激に上下する']);
      steps = ['純粋な物質が沸騰している間は、温度は沸点のまま一定である'];
    } else if (pat === 5) {
      question = '液体を加熱して沸騰させる実験で、沸騰石を入れるのはなぜですか。';
      answer = '急に沸騰する(突沸)のを防ぐため';
      choices = shuffle([answer, '液体の温度を下げるため', '液体の色を変えるため', '液体の量を増やすため']);
      steps = ['沸騰石を入れないと、急に沸騰する(突沸)ことがあり危険なため、沸騰石を入れて防ぐ'];
    } else if (pat === 6) {
      question = '水(純粋な水)の融点は何℃ですか。';
      answer = '0℃';
      choices = shuffle(['0℃', '100℃', '-10℃', '50℃']);
      steps = ['水の融点は0℃である'];
    } else if (pat === 7) {
      question = '水(純粋な水)の沸点は何℃ですか。';
      answer = '100℃';
      choices = shuffle(['100℃', '0℃', '80℃', '120℃']);
      steps = ['水の沸点は100℃である'];
    } else if (pat === 8) {
      question = 'エタノールの沸点は、約何℃ですか。';
      answer = '約78℃';
      choices = shuffle(['約78℃', '約100℃', '約50℃', '約115℃']);
      steps = ['エタノールの沸点は約78℃である'];
    } else if (pat === 9) {
      const entry = MP_BP_TABLE_1_[randInt(0, MP_BP_TABLE_1_.length - 1)];
      const stateRoll = randInt(0, 2);
      let temp, answerState;
      if (stateRoll === 0) {
        temp = entry.mp - randInt(5, 50);
        answerState = '固体';
      } else if (stateRoll === 1) {
        const lo = entry.mp + 1, hi = entry.bp - 1;
        temp = lo + randInt(0, Math.max(0, hi - lo));
        answerState = '液体';
      } else {
        temp = entry.bp + randInt(5, 50);
        answerState = '気体';
      }
      question = `${entry.name}(融点${entry.mp}℃、沸点${entry.bp}℃)は、${temp}℃のときどのような状態ですか。`;
      answer = answerState;
      const REAL_STATES = ['固体', '液体', '気体'];
      choices = shuffle([...REAL_STATES, '固体と液体が混ざった状態']);
      steps = [`融点は${entry.mp}℃、沸点は${entry.bp}℃なので、${temp}℃では${answer}である`];
    } else if (pat === 10) {
      question = '純粋な物質と異なり、混合物(2種類以上の物質が混ざったもの)を加熱すると、温度はどうなりますか。';
      answer = '状態変化している間も温度が変化し続ける(一定にならない)';
      choices = shuffle([answer, '状態変化している間は温度が一定になる', '沸点だけは物質と同じように一定になる', '融点だけは物質と同じように一定になる']);
      steps = ['混合物では、成分によって融点・沸点がちがうため、状態変化している間も温度が変化し続け、一定にならない'];
    } else if (pat === 11) {
      question = '物質を加熱したときの温度変化のグラフで、温度が変化せず一定になっている(グラフが水平になっている)区間は、何を表していますか。';
      answer = '状態変化が起こっている間(固体と液体、または液体と気体が混ざっている間)';
      choices = shuffle([answer, '物質がまだ全く熱せられていない状態', '物質の温度が下がり続けている状態', '実験が失敗した部分']);
      steps = ['温度が一定になっている区間は、固体⇔液体や液体⇔気体の状態変化が起こっている間である'];
    } else {
      question = 'ある物質の融点と沸点の関係として、正しいものはどれですか。';
      answer = '融点は沸点より低い';
      choices = shuffle([answer, '融点は沸点より高い', '融点と沸点は常に等しい', '融点と沸点に決まった関係はない']);
      steps = ['どの物質も、融点は沸点よりも低い(固体→液体→気体の順に温度が上がっていく)'];
    }
    return { category: 'meltingBoiling1', question, answer, choices, steps };
  }

  // 蒸留（中1）：純粋な物質・混合物の用語と沸点の性質、水とエタノールの混合物を
  // 蒸留する実験(沸点のちがいで先にエタノールが多く出てくること)、蒸留装置の扱い方。
  const PURE_SUBSTANCES_1_ = ['鉄', '水', 'エタノール', '塩化ナトリウム', '二酸化炭素'];
  const MIXTURES_1_ = ['食塩水', '空気', '炭酸水', 'アンモニア水'];
  function genDistillation1() {
    const pat = randInt(0, 12);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '1種類の物質だけでできているものを何といいますか。';
      answer = '純粋な物質(純物質)';
      choices = shuffle(['純粋な物質(純物質)', '混合物', '化合物', '単体']);
      steps = ['1種類の物質だけでできているものを純粋な物質(純物質)という'];
    } else if (pat === 1) {
      question = '2種類以上の物質が混ざり合ったものを何といいますか。';
      answer = '混合物';
      choices = shuffle(['混合物', '純粋な物質(純物質)', '単体', '化合物']);
      steps = ['2種類以上の物質が混ざり合ったものを混合物という'];
    } else if (pat === 2) {
      question = '純粋な物質(純物質)の沸点について、正しいものはどれですか。';
      answer = '決まった一定の値を示す';
      choices = shuffle([answer, '決まった値を示さない', '物質の量によって変わる', '常に100℃である']);
      steps = ['純粋な物質は、沸点が物質ごとに決まった一定の値を示す'];
    } else if (pat === 3) {
      question = '混合物の沸点について、正しいものはどれですか。';
      answer = '決まった値を示さない(混ざる割合によって変わる)';
      choices = shuffle([answer, '決まった一定の値を示す', '必ず100℃になる', '常に0℃になる']);
      steps = ['混合物の沸点は決まった値を示さず、混ざっている物質の割合によって変化する'];
    } else if (pat === 4) {
      const askPure = Math.random() < 0.5;
      if (askPure) {
        answer = PURE_SUBSTANCES_1_[randInt(0, PURE_SUBSTANCES_1_.length - 1)];
        question = '次のうち、純粋な物質(純物質)はどれですか。';
        choices = shuffle([answer, ...shuffle(MIXTURES_1_).slice(0, 3)]);
        steps = [`${answer}は1種類の物質だけでできている純粋な物質である`];
      } else {
        answer = MIXTURES_1_[randInt(0, MIXTURES_1_.length - 1)];
        question = '次のうち、混合物はどれですか。';
        choices = shuffle([answer, ...shuffle(PURE_SUBSTANCES_1_).slice(0, 3)]);
        steps = [`${answer}は2種類以上の物質が混ざり合った混合物である`];
      }
    } else if (pat === 5) {
      question = '液体を熱して沸騰させ、出てくる蒸気(気体)を冷やして再び液体にしてとり出す方法を何といいますか。';
      answer = '蒸留';
      choices = shuffle(['蒸留', 'ろ過', '再結晶', '中和']);
      steps = ['液体を熱して沸騰させ、出てくる蒸気を冷やして再び液体としてとり出す操作を蒸留という'];
    } else if (pat === 6) {
      question = '蒸留は、物質の何のちがいを利用して、混合物中の物質を分ける方法ですか。';
      answer = '沸点のちがい';
      choices = shuffle(['沸点のちがい', '色のちがい', '質量のちがい', '密度のちがい']);
      steps = ['蒸留は、物質による沸点のちがいを利用して、混合物中の物質をそれぞれ分けてとり出す方法である'];
    } else if (pat === 7) {
      question = '水とエタノールの混合物を熱すると、はじめに出てくる気体には、どちらの物質が多くふくまれていますか。';
      answer = 'エタノール';
      choices = shuffle(['エタノール', '水', 'どちらも同じ量', 'どちらもふくまれない']);
      steps = ['エタノールの沸点(78℃)は水の沸点(100℃)より低いため、はじめにエタノールを多くふくむ気体が出てくる'];
    } else if (pat === 8) {
      question = '水とエタノールの混合物を熱し続けると、後から出てくる気体には、どちらの物質が多くふくまれるようになりますか。';
      answer = '水';
      choices = shuffle(['水', 'エタノール', 'どちらも同じ量', 'どちらもふくまれない']);
      steps = ['加熱を続けると、沸点の高い水を多くふくむ気体が出てくるようになる'];
    } else if (pat === 9) {
      question = '水とエタノールの混合物を蒸留する実験で、最初に集めた液体に火をつけると、どうなると考えられますか。';
      answer = 'エタノールを多くふくむため、よく燃える';
      choices = shuffle([answer, '水を多くふくむため、燃えない', 'どちらの液体も同じくらい燃える', '燃やすと爆発する']);
      steps = ['最初に集めた液体はエタノールを多くふくむため、火をつけるとよく燃える'];
    } else if (pat === 10) {
      question = '枝つきフラスコを使って蒸留するとき、温度計の球部(先端)はどこに合わせますか。';
      answer = '枝の分かれ目の高さ';
      choices = shuffle([answer, 'フラスコの底', '液面の中', 'フラスコの一番上']);
      steps = ['出てくる気体の温度をはかるため、温度計の球部は枝の分かれ目の高さに合わせる'];
    } else if (pat === 11) {
      question = '蒸留の実験で、枝つきフラスコに沸騰石を入れるのはなぜですか。';
      answer = '急に沸騰する(突沸)のを防ぐため';
      choices = shuffle([answer, '液体の温度を下げるため', 'においの成分を消すため', '液体の色を変えるため']);
      steps = ['沸騰石を入れないと急に沸騰する(突沸)ことがあり危険なため、必ず沸騰石を入れる'];
    } else {
      question = '蒸留の実験で、出てきた気体を集める試験管を、水などで冷やすのはなぜですか。';
      answer = '出てきた気体を冷やして液体にするため';
      choices = shuffle([answer, '気体のにおいを消すため', '試験管を割れにくくするため', '液体の色を変えるため']);
      steps = ['出てきた気体を冷やすことで再び液体(蒸留液)になり、集めることができる'];
    }
    return { category: 'distillation1', question, answer, choices, steps };
  }

  // 生物と細胞（中2）：植物・動物の細胞のつくり(核・細胞膜・細胞質・葉緑体・細胞壁・液胞)、
  // 単細胞生物・多細胞生物、細胞→組織→器官→個体の体制、細胞の呼吸。
  const SINGLE_CELL_ORGANISMS_2_ = ['アメーバ', 'ミカヅキモ', 'ゾウリムシ'];
  const MULTI_CELL_ORGANISMS_2_ = ['ミジンコ', 'ツバキ', 'ニワトリ', 'オオカナダモ'];
  function genCellBiology2() {
    const pat = randInt(0, 20);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = 'プレパラートを作るとき、カバーガラスはどのようにかぶせますか。';
      answer = '気泡が入らないように、はしからゆっくりかぶせる';
      choices = shuffle([answer, '中央から一気にかぶせる', '気泡が入るようにすばやくかぶせる', 'カバーガラスは使わない']);
      steps = ['プレパラートを作るときは、気泡が入らないように、カバーガラスをはしからゆっくりかぶせる'];
    } else if (pat === 1) {
      question = '植物の細胞を観察するとき、酢酸カーミン液(または酢酸オルセイン液)を使うと、何が赤く染まりますか。';
      answer = '核';
      choices = shuffle(['核', '細胞壁', '葉緑体', '細胞膜']);
      steps = ['酢酸カーミン液や酢酸オルセイン液は、核を赤く染める染色液である'];
    } else if (pat === 2) {
      question = '生物のからだに見られる、小さな部屋のようなつくりを何といいますか。';
      answer = '細胞';
      choices = shuffle(['細胞', '組織', '器官', '個体']);
      steps = ['生物のからだに見られる小さな部屋のようなつくりを細胞という'];
    } else if (pat === 3) {
      question = '植物の細胞で、染色液によって赤く染まる、丸い部分を何といいますか。';
      answer = '核';
      choices = shuffle(['核', '液胞', '葉緑体', '細胞質']);
      steps = ['染色液によって赤く染まる丸い部分を核という'];
    } else if (pat === 4) {
      question = '植物の細胞質の中にある、たくさんの緑色の粒を何といいますか。';
      answer = '葉緑体';
      choices = shuffle(['葉緑体', '液胞', '核', '細胞壁']);
      steps = ['植物の細胞質に見られる緑色の粒を葉緑体という(光合成を行う)'];
    } else if (pat === 5) {
      question = '細胞質の外側をつつむ、無色のうすいふくろ状のつくりを何といいますか。';
      answer = '細胞膜';
      choices = shuffle(['細胞膜', '細胞壁', '液胞', '核膜']);
      steps = ['細胞質の外側をつつむ無色のうすいふくろ状のつくりを細胞膜という'];
    } else if (pat === 6) {
      question = '植物の細胞で、細胞膜の外側にあり、細胞の形を維持してからだを支えるはたらきをするつくりを何といいますか。';
      answer = '細胞壁';
      choices = shuffle(['細胞壁', '細胞膜', '液胞', '葉緑体']);
      steps = ['細胞膜の外側にあり、細胞の形を維持しからだを支えるつくりを細胞壁という'];
    } else if (pat === 7) {
      question = '植物の細胞に見られる、物質や水が入っているつくりを何といいますか。';
      answer = '液胞';
      choices = shuffle(['液胞', '葉緑体', '核', '細胞壁']);
      steps = ['植物の細胞に見られ、物質や水が入っているつくりを液胞という'];
    } else if (pat === 8) {
      question = '植物の細胞と動物の細胞に共通して見られるつくりはどれですか。';
      answer = '核・細胞膜・細胞質';
      choices = shuffle([answer, '葉緑体・細胞壁・液胞', '葉緑体だけ', '細胞壁だけ']);
      steps = ['核・細胞膜・細胞質は、植物の細胞と動物の細胞に共通して見られるつくりである'];
    } else if (pat === 9) {
      question = '次のうち、植物の細胞には見られるが、動物の細胞には見られないつくりはどれですか。';
      answer = '細胞壁';
      choices = shuffle(['細胞壁', '核', '細胞膜', '細胞質']);
      steps = ['細胞壁は植物の細胞に特徴的なつくりで、動物の細胞には見られない'];
    } else if (pat === 10) {
      question = 'からだが1つの細胞だけでできている生物を何といいますか。';
      answer = '単細胞生物';
      choices = shuffle(['単細胞生物', '多細胞生物', '原核生物', '無脊椎動物']);
      steps = ['からだが1つの細胞だけでできている生物を単細胞生物という'];
    } else if (pat === 11) {
      question = 'からだが多数の細胞からできている生物を何といいますか。';
      answer = '多細胞生物';
      choices = shuffle(['多細胞生物', '単細胞生物', '原核生物', '脊椎動物']);
      steps = ['からだが多数の細胞からできている生物を多細胞生物という'];
    } else if (pat === 12) {
      question = '形やはたらきが同じ細胞が集まってできた、まとまりを何といいますか。';
      answer = '組織';
      choices = shuffle(['組織', '器官', '個体', '細胞膜']);
      steps = ['形やはたらきが同じ細胞が集まってできたまとまりを組織という'];
    } else if (pat === 13) {
      question = 'いくつかの組織が集まって、特定のはたらきをする部分を何といいますか。';
      answer = '器官';
      choices = shuffle(['器官', '組織', '個体', '細胞']);
      steps = ['いくつかの組織が集まって特定のはたらきをする部分を器官という'];
    } else if (pat === 14) {
      question = 'いくつかの器官が集まって、1つのまとまったからだをつくったものを何といいますか。';
      answer = '個体';
      choices = shuffle(['個体', '器官', '組織', '群体']);
      steps = ['いくつかの器官が集まって1つのまとまったからだをつくったものを個体という'];
    } else if (pat === 15) {
      question = '多細胞生物のからだは、どのような順番でできていますか。';
      answer = '細胞→組織→器官→個体';
      choices = shuffle([answer, '細胞→器官→組織→個体', '組織→細胞→器官→個体', '個体→器官→組織→細胞']);
      steps = ['多細胞生物のからだは、細胞→組織→器官→個体の順にできている'];
    } else if (pat === 16) {
      question = 'ゾウリムシなどの単細胞生物で、食物をとりこむところを何といいますか。';
      answer = '食胞';
      choices = shuffle(['食胞', '収縮胞', '核', '細胞膜']);
      steps = ['ゾウリムシなどの単細胞生物で、食物をとりこむところを食胞という'];
    } else if (pat === 17) {
      question = 'ゾウリムシなどの単細胞生物にある、体内の余分な水などを排出するはたらきをするつくりを何といいますか。';
      answer = '収縮胞';
      choices = shuffle(['収縮胞', '食胞', '核', '細胞壁']);
      steps = ['体内の余分な水などを排出するつくりを収縮胞という'];
    } else if (pat === 18) {
      answer = SINGLE_CELL_ORGANISMS_2_[randInt(0, SINGLE_CELL_ORGANISMS_2_.length - 1)];
      question = '次のうち、単細胞生物はどれですか。';
      choices = shuffle([answer, ...shuffle(MULTI_CELL_ORGANISMS_2_).slice(0, 3)]);
      steps = [`${answer}は、からだが1つの細胞でできている単細胞生物である`];
    } else if (pat === 19) {
      answer = MULTI_CELL_ORGANISMS_2_[randInt(0, MULTI_CELL_ORGANISMS_2_.length - 1)];
      question = '次のうち、多細胞生物はどれですか。';
      choices = shuffle([answer, ...shuffle(SINGLE_CELL_ORGANISMS_2_)]);
      steps = [`${answer}は、からだが多数の細胞でできている多細胞生物である`];
    } else {
      question = '細胞の内部で、酸素を使って養分を分解し、生きるためのエネルギーをとり出すはたらきを何といいますか。';
      answer = '細胞の呼吸(細胞呼吸)';
      choices = shuffle(['細胞の呼吸(細胞呼吸)', '光合成', '蒸散', '消化']);
      steps = ['細胞内で酸素を使って養分を分解し、エネルギーをとり出すはたらきを細胞の呼吸(細胞呼吸)という'];
    }
    return { category: 'cellBiology2', question, answer, choices, steps };
  }

  // 葉と光合成（中2）：光合成の定義・場所(葉緑体)、脱色実験(エタノール・ヨウ素液)、
  // 光合成に必要な物質と生成物、植物の呼吸、BTB溶液を使ったオオカナダモの実験。
  function genPhotosynthesis2() {
    const pat = randInt(0, 13);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '光を受けた植物が、デンプンなどの養分をつくるはたらきを何といいますか。';
      answer = '光合成';
      choices = shuffle(['光合成', '呼吸', '蒸散', '消化']);
      steps = ['光を受けた植物が、デンプンなどの養分をつくるはたらきを光合成という'];
    } else if (pat === 1) {
      question = '光合成は、植物の細胞の中にある何というつくりで行われますか。';
      answer = '葉緑体';
      choices = shuffle(['葉緑体', '核', '細胞壁', '液胞']);
      steps = ['光合成は、植物の細胞の中にある葉緑体で行われる'];
    } else if (pat === 2) {
      question = '植物の葉のつき方には、どのような共通点がありますか。';
      answer = '葉が重ならないようにつき、多くの光を受けられるようになっている';
      choices = shuffle([answer, 'すべての葉が同じ向きに重なっている', '葉は光を受けないようについている', '葉のつき方に共通点はない']);
      steps = ['植物の葉は、重ならないようにつくことで、多くの光を受けられるようになっている'];
    } else if (pat === 3) {
      question = '葉を脱色するとき、熱湯につけた後、何にひたして脱色しますか。';
      answer = 'エタノール';
      choices = shuffle(['エタノール', '食塩水', '石灰水', 'うすい塩酸']);
      steps = ['葉は熱湯につけたあと、エタノールにひたして脱色する'];
    } else if (pat === 4) {
      question = '葉をエタノールにひたして脱色するのはなぜですか。';
      answer = '葉の緑色を脱色し、ヨウ素液の色の変化を見やすくするため';
      choices = shuffle([answer, 'デンプンを分解するため', '葉をやわらかくするため', '葉の水分を抜くため']);
      steps = ['葉の緑色を脱色しておくと、ヨウ素液での色の変化が見やすくなる'];
    } else if (pat === 5) {
      question = 'ヨウ素液は、デンプンにつけると何色に変化しますか。';
      answer = '青紫色';
      choices = shuffle(['青紫色', '赤色', '黄色', '無色']);
      steps = ['ヨウ素液はデンプンに反応して青紫色に変化する(ヨウ素デンプン反応)'];
    } else if (pat === 6) {
      question = '光合成に必要な物質のうち、気孔からとりこまれるものは何ですか。';
      answer = '二酸化炭素';
      choices = shuffle(['二酸化炭素', '酸素', '窒素', '水素']);
      steps = ['光合成には、気孔からとりこまれる二酸化炭素が使われる'];
    } else if (pat === 7) {
      question = '光合成によって、デンプンなどの有機物のほかに何がつくられますか。';
      answer = '酸素';
      choices = shuffle(['酸素', '二酸化炭素', '窒素', '水素']);
      steps = ['光合成では、デンプンなどの有機物とともに酸素がつくられる'];
    } else if (pat === 8) {
      question = '植物は、光合成のほかに呼吸も行っています。植物はいつ呼吸を行っていますか。';
      answer = '一日中(昼も夜も)行っている';
      choices = shuffle([answer, '夜だけ行っている', '昼だけ行っている', '光合成をしていないときだけ行っている']);
      steps = ['植物も動物と同じように、一日中呼吸を行い、酸素をとり入れ二酸化炭素を出している'];
    } else if (pat === 9) {
      question = '晴れた日の昼間、植物は光合成による気体の出入りの量が呼吸による量より多いため、見かけ上はどうなっていますか。';
      answer = '二酸化炭素を吸収し、酸素を放出しているように見える';
      choices = shuffle([answer, '酸素を吸収し、二酸化炭素を放出しているように見える', 'どちらの気体も出入りしていないように見える', '窒素だけを吸収しているように見える']);
      steps = ['昼間は光合成による気体の出入りが呼吸による量を上回るため、見かけ上は二酸化炭素を吸収し酸素を放出しているように見える'];
    } else if (pat === 10) {
      question = 'BTB溶液に息をふきこんで二酸化炭素を増やすと、溶液の色は何色になりますか。';
      answer = '黄色';
      choices = shuffle(['黄色', '青色', '緑色', '無色']);
      steps = ['二酸化炭素が増えると水溶液は酸性に近づき、BTB溶液は黄色になる'];
    } else if (pat === 11) {
      question = 'オオカナダモに光を当てて光合成が盛んに行われ、二酸化炭素が使われて減っていくと、緑色のBTB溶液は何色になっていきますか。';
      answer = '青色';
      choices = shuffle(['青色', '黄色', '赤色', '無色']);
      steps = ['光合成によって二酸化炭素が減ると水溶液はアルカリ性に近づき、BTB溶液は青色になる'];
    } else if (pat === 12) {
      question = 'オオカナダモを入れたBTB溶液に十分に光を当てると、青色になりました。このことから何がわかりますか。';
      answer = '光が当たると、オオカナダモが光合成によって二酸化炭素を使ったこと';
      choices = shuffle([answer, '光が当たると、オオカナダモが二酸化炭素を出したこと', '光が当たらなくても、色は変化すること', 'オオカナダモには関係なく色が変化したこと']);
      steps = ['光を当てると光合成が盛んになり、二酸化炭素が使われて減るため、BTB溶液は青色になる'];
    } else {
      question = 'オオカナダモを入れたBTB溶液を、アルミニウムはくでおおって光を当てないようにすると、黄色になりました。このことから何がわかりますか。';
      answer = '光が当たらないと、オオカナダモは呼吸によって二酸化炭素を出すこと';
      choices = shuffle([answer, '光が当たらないと、オオカナダモは二酸化炭素を吸収すること', '光がなくても光合成は行われること', 'オオカナダモには呼吸のはたらきがないこと']);
      steps = ['光が当たらないと光合成が行われず、呼吸によって二酸化炭素が出されるため、BTB溶液は黄色になる'];
    }
    return { category: 'photosynthesis2', question, answer, choices, steps };
  }

  // 植物と水（中2）：吸水・蒸散・気孔の用語、蒸散が葉の裏側で盛んなこと、
  // 道管・師管・維管束のはたらきと位置、双子葉類/単子葉類の維管束の並び方、
  // 主根・側根・ひげ根・根毛の用語。
  function genPlantWater2() {
    const pat = randInt(0, 17);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '植物が水を根から吸い上げることを何といいますか。';
      answer = '吸水';
      choices = shuffle(['吸水', '蒸散', '光合成', '呼吸']);
      steps = ['植物が根から水を吸い上げることを吸水という'];
    } else if (pat === 1) {
      question = '植物のからだから、水が水蒸気として出ていくことを何といいますか。';
      answer = '蒸散';
      choices = shuffle(['蒸散', '吸水', '光合成', '呼吸']);
      steps = ['植物のからだから水が水蒸気として出ていくことを蒸散という'];
    } else if (pat === 2) {
      question = '気孔は、その開閉によって何を調節していますか。';
      answer = '蒸散(水蒸気の出入り)';
      choices = shuffle([answer, '光合成の量だけ', '根からの吸水量だけ', '種子の数']);
      steps = ['気孔は開閉することで蒸散(水蒸気の出入り)を調節している'];
    } else if (pat === 3) {
      question = '植物の蒸散は、主に葉のどこから行われますか。';
      answer = '気孔';
      choices = shuffle(['気孔', '道管', '師管', '形成層']);
      steps = ['蒸散は主に葉の気孔から行われる'];
    } else if (pat === 4) {
      question = '葉の表面にワセリンをぬると、その面からの蒸散はどうなりますか。';
      answer = '防がれる(できなくなる)';
      choices = shuffle([answer, 'さらに盛んになる', '変化しない', '吸水が盛んになる']);
      steps = ['ワセリンをぬると気孔がふさがれるため、その面からの蒸散が防がれる'];
    } else if (pat === 5) {
      question = '植物の葉で、蒸散がより盛んに行われるのは、表側と裏側のどちらですか。';
      answer = '裏側';
      choices = shuffle(['裏側', '表側', 'どちらも同じ', 'どちらも行われない']);
      steps = ['一般に、葉の裏側には気孔が多く分布しているため、裏側からの蒸散が盛んである'];
    } else if (pat === 6) {
      question = '根から吸収した水や肥料分が通る管を何といいますか。';
      answer = '道管';
      choices = shuffle(['道管', '師管', '気孔', '維管束']);
      steps = ['根から吸収した水や肥料分が通る管を道管という'];
    } else if (pat === 7) {
      question = '葉でつくられた養分が、水にとける形に変えられたあとに通る管を何といいますか。';
      answer = '師管';
      choices = shuffle(['師管', '道管', '気孔', '形成層']);
      steps = ['葉でつくられた養分が水にとける形に変えられたあと通る管を師管という'];
    } else if (pat === 8) {
      question = '道管と師管が集まった束を何といいますか。';
      answer = '維管束';
      choices = shuffle(['維管束', '形成層', '気孔', '根毛']);
      steps = ['道管と師管が集まった束を維管束という'];
    } else if (pat === 9) {
      question = '植物に色水を吸わせると、茎のどの管が染まりますか。';
      answer = '道管';
      choices = shuffle(['道管', '師管', '気孔', '形成層']);
      steps = ['色水は根から吸収されて道管を通るため、道管が染まる'];
    } else if (pat === 10) {
      question = '双子葉類の茎の断面で、道管は師管に対してどちら側にありますか。';
      answer = '内側(中心に近い側)';
      choices = shuffle([answer, '外側(表皮に近い側)', '同じ位置', '決まった位置はない']);
      steps = ['双子葉類の茎では、維管束の中で道管が内側、師管が外側に並んでいる'];
    } else if (pat === 11) {
      question = 'ヒマワリのような双子葉類の茎で、維管束はどのように並んでいますか。';
      answer = '輪のように並んでいる';
      choices = shuffle([answer, '茎全体に散らばっている', '中心に1つだけある', '外側だけに集まっている']);
      steps = ['双子葉類の茎では、維管束が輪のように並んでいる'];
    } else if (pat === 12) {
      question = 'トウモロコシのような単子葉類の茎で、維管束はどのように並んでいますか。';
      answer = '茎全体に散らばっている';
      choices = shuffle([answer, '輪のように並んでいる', '中心に1つだけある', '外側だけに集まっている']);
      steps = ['単子葉類の茎では、維管束が茎全体に散らばっている'];
    } else if (pat === 13) {
      question = '双子葉類に見られる、中心の太い根を何といいますか。';
      answer = '主根';
      choices = shuffle(['主根', '側根', 'ひげ根', '根毛']);
      steps = ['双子葉類の中心にある太い根を主根という'];
    } else if (pat === 14) {
      question = '双子葉類で、主根から枝分かれして伸びる細い根を何といいますか。';
      answer = '側根';
      choices = shuffle(['側根', '主根', 'ひげ根', '根毛']);
      steps = ['主根から枝分かれして伸びる細い根を側根という'];
    } else if (pat === 15) {
      question = 'トウモロコシなどの単子葉類に見られる、たくさんの細い根を何といいますか。';
      answer = 'ひげ根';
      choices = shuffle(['ひげ根', '主根', '側根', '根毛']);
      steps = ['単子葉類に見られる、太さがほぼ同じ多数の細い根をひげ根という'];
    } else if (pat === 16) {
      question = '根の先端近くに見られる、綿毛のような小さな毛を何といいますか。';
      answer = '根毛';
      choices = shuffle(['根毛', '側根', '主根', '維管束']);
      steps = ['根の先端近くに見られる綿毛のような小さな毛を根毛という'];
    } else {
      question = '根毛には、どのようなはたらきがありますか。';
      answer = '根の表面積を広げ、水や養分を効率よく吸収する';
      choices = shuffle([answer, '光合成を行う', 'デンプンをつくる', '二酸化炭素を出す']);
      steps = ['根毛は根の表面積を広げ、水や養分を効率よく吸収するはたらきをもつ'];
    }
    return { category: 'plantWater2', question, answer, choices, steps };
  }

  // 消化と吸収のしくみ（中2）：消化・消化酵素の用語、だ液のアミラーゼ・胃液の
  // ペプシン・すい液のトリプシン/リパーゼ、ベネジクト液の反応、柔毛のつくりと
  // 吸収先(毛細血管・リンパ管)、デンプン/タンパク質/脂肪の最終的な分解物。
  function genDigestion2() {
    const pat = randInt(0, 18);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '食物が体内に吸収されやすい物質に分解されていくことを何といいますか。';
      answer = '消化';
      choices = shuffle(['消化', '吸収', '排出', '呼吸']);
      steps = ['食物が体内に吸収されやすい物質に分解されていくことを消化という'];
    } else if (pat === 1) {
      question = '麦芽糖(ブドウ糖)をふくむ溶液にベネジクト液を入れて加熱すると、何色の沈殿ができますか。';
      answer = '赤褐色';
      choices = shuffle(['赤褐色', '青紫色', '黄色', '白色']);
      steps = ['ベネジクト液は麦芽糖やブドウ糖と反応し、加熱すると赤褐色の沈殿ができる'];
    } else if (pat === 2) {
      question = '消化液などにふくまれ、食物の成分を分解するはたらきをもつ物質を何といいますか。';
      answer = '消化酵素';
      choices = shuffle(['消化酵素', '消化液', '消化管', 'だ液']);
      steps = ['消化液などにふくまれ、食物の成分を分解する物質を消化酵素という'];
    } else if (pat === 3) {
      question = 'だ液にふくまれ、デンプンを分解する消化酵素を何といいますか。';
      answer = 'アミラーゼ';
      choices = shuffle(['アミラーゼ', 'ペプシン', 'トリプシン', 'リパーゼ']);
      steps = ['だ液にふくまれ、デンプンを分解する消化酵素をアミラーゼという'];
    } else if (pat === 4) {
      question = '胃液にふくまれ、タンパク質を分解する消化酵素を何といいますか。';
      answer = 'ペプシン';
      choices = shuffle(['ペプシン', 'アミラーゼ', 'トリプシン', 'リパーゼ']);
      steps = ['胃液にふくまれ、タンパク質を分解する消化酵素をペプシンという'];
    } else if (pat === 5) {
      question = 'すい液にふくまれ、タンパク質を分解する消化酵素を何といいますか。';
      answer = 'トリプシン';
      choices = shuffle(['トリプシン', 'ペプシン', 'アミラーゼ', 'リパーゼ']);
      steps = ['すい液にふくまれ、タンパク質を分解する消化酵素をトリプシンという'];
    } else if (pat === 6) {
      question = 'すい液にふくまれ、脂肪を分解する消化酵素を何といいますか。';
      answer = 'リパーゼ';
      choices = shuffle(['リパーゼ', 'トリプシン', 'ペプシン', 'アミラーゼ']);
      steps = ['すい液にふくまれ、脂肪を分解する消化酵素をリパーゼという'];
    } else if (pat === 7) {
      question = '食物中の水分は、主にどこで吸収されますか。';
      answer = '小腸や大腸';
      choices = shuffle(['小腸や大腸', '胃', '食道', '肝臓']);
      steps = ['食物中の水分は主に小腸や大腸で吸収される'];
    } else if (pat === 8) {
      question = '消化されなかった食物中の繊維などは、何として肛門から排出されますか。';
      answer = '便';
      choices = shuffle(['便', '尿', '汗', '消化酵素']);
      steps = ['消化されなかった食物中の繊維などは便として肛門から排出される'];
    } else if (pat === 9) {
      question = '分解された物質が、体内にとりこまれることを何といいますか。';
      answer = '吸収';
      choices = shuffle(['吸収', '消化', '排出', '分泌']);
      steps = ['分解された物質が体内にとりこまれることを吸収という'];
    } else if (pat === 10) {
      question = '消化された物質の多くは、どこから吸収されますか。';
      answer = '小腸の壁にある柔毛';
      choices = shuffle([answer, '胃の壁', '食道の壁', '大腸の壁だけ']);
      steps = ['消化された物質の多くは、小腸の壁にある柔毛から吸収される'];
    } else if (pat === 11) {
      question = 'デンプンが消化されて分解されると、最終的に何という物質になりますか。';
      answer = 'ブドウ糖';
      choices = shuffle(['ブドウ糖', 'アミノ酸', '脂肪酸', 'モノグリセリド']);
      steps = ['デンプンは消化されて最終的にブドウ糖になる'];
    } else if (pat === 12) {
      question = 'タンパク質が消化されて分解されると、最終的に何という物質になりますか。';
      answer = 'アミノ酸';
      choices = shuffle(['アミノ酸', 'ブドウ糖', '脂肪酸', 'モノグリセリド']);
      steps = ['タンパク質は消化されて最終的にアミノ酸になる'];
    } else if (pat === 13) {
      question = '脂肪が消化されて分解されると、最終的に何という物質になりますか(2つ)。';
      answer = '脂肪酸とモノグリセリド';
      choices = shuffle([answer, 'ブドウ糖とアミノ酸', 'アミノ酸とモノグリセリド', 'ブドウ糖と脂肪酸']);
      steps = ['脂肪は消化されて最終的に脂肪酸とモノグリセリドになる'];
    } else if (pat === 14) {
      question = '小腸の壁にある柔毛には、どのような利点がありますか。';
      answer = '小腸の表面積を広げ、効率よく養分を吸収できる';
      choices = shuffle([answer, '消化酵素をつくるだけ', '食物をくだくだけ', '水分を排出するだけ']);
      steps = ['柔毛は小腸の表面積を広げ、効率よく養分を吸収できるようにしている'];
    } else if (pat === 15) {
      question = '柔毛から吸収されたブドウ糖とアミノ酸は、柔毛の中のどちらの管に入りますか。';
      answer = '毛細血管';
      choices = shuffle(['毛細血管', 'リンパ管', '気管', '食道']);
      steps = ['ブドウ糖とアミノ酸は柔毛の毛細血管に入る'];
    } else if (pat === 16) {
      question = '柔毛から吸収された脂肪酸とモノグリセリドは、柔毛の細胞内で再び脂肪になったあと、どちらの管に入りますか。';
      answer = 'リンパ管';
      choices = shuffle(['リンパ管', '毛細血管', '気管', '食道']);
      steps = ['脂肪酸とモノグリセリドは、柔毛の細胞内で再び脂肪になったあとリンパ管に入る'];
    } else if (pat === 17) {
      question = 'ヒトの消化管を、食物が通る順に並べたものはどれですか。';
      answer = '口→食道→胃→小腸→大腸→肛門';
      choices = shuffle([answer, '口→胃→食道→小腸→大腸→肛門', '口→食道→小腸→胃→大腸→肛門', '口→食道→胃→大腸→小腸→肛門']);
      steps = ['ヒトの消化管は、口→食道→胃→小腸→大腸→肛門の順につながっている'];
    } else {
      question = '肝臓でつくられ胆のうにたくわえられる胆汁には、消化酵素は含まれていませんが、どのようなはたらきをしますか。';
      answer = '脂肪を細かい粒にして、消化されやすくする';
      choices = shuffle([answer, 'デンプンを直接分解する', 'タンパク質を直接分解する', '水分を吸収する']);
      steps = ['胆汁は消化酵素をふくまないが、脂肪を細かい粒にして消化されやすくするはたらきをもつ'];
    }
    return { category: 'digestion2', question, answer, choices, steps };
  }

  // 呼吸と血液のはたらき（中2）：肺呼吸・肺胞・毛細血管、動脈血/静脈血、
  // 動脈/静脈と肺循環/体循環、血液の成分(赤血球・白血球・血小板・血しょう)の
  // はたらき、アンモニア→尿素の変換(肝臓)と腎臓・ぼうこうによる排出のしくみ。
  function genRespiration2() {
    const pat = randInt(0, 18);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '肺による呼吸を何といいますか。';
      answer = '肺呼吸';
      choices = shuffle(['肺呼吸', '細胞の呼吸', '光合成', '蒸散']);
      steps = ['肺による呼吸を肺呼吸という'];
    } else if (pat === 1) {
      question = '肺をつくっている、たくさんの小さなふくろを何といいますか。';
      answer = '肺胞';
      choices = shuffle(['肺胞', '毛細血管', '気管支', '細胞']);
      steps = ['肺をつくっているたくさんの小さなふくろを肺胞という'];
    } else if (pat === 2) {
      question = '肺胞のまわりを網目のようにとりかこんでいる、細い血管を何といいますか。';
      answer = '毛細血管';
      choices = shuffle(['毛細血管', '動脈', '静脈', 'リンパ管']);
      steps = ['肺胞のまわりを網目のようにとりかこむ細い血管を毛細血管という'];
    } else if (pat === 3) {
      question = '肺が多数の肺胞に分かれていることには、どのような利点がありますか。';
      answer = '肺の表面積を広げ、効率よくガス交換ができる';
      choices = shuffle([answer, '肺を軽くするだけ', '空気を温めるだけ', '声を出しやすくするだけ']);
      steps = ['肺が多数の肺胞に分かれていることで表面積が広がり、効率よくガス交換ができる'];
    } else if (pat === 4) {
      question = '酸素を多くふくみ、二酸化炭素が少ない血液を何といいますか。';
      answer = '動脈血';
      choices = shuffle(['動脈血', '静脈血', 'リンパ液', '血しょう']);
      steps = ['酸素を多くふくみ、二酸化炭素が少ない血液を動脈血という'];
    } else if (pat === 5) {
      question = '二酸化炭素を多くふくみ、酸素が少ない血液を何といいますか。';
      answer = '静脈血';
      choices = shuffle(['静脈血', '動脈血', 'リンパ液', '血しょう']);
      steps = ['二酸化炭素を多くふくみ、酸素が少ない血液を静脈血という'];
    } else if (pat === 6) {
      question = '心臓から送り出される血液が流れる血管を何といいますか。';
      answer = '動脈';
      choices = shuffle(['動脈', '静脈', '毛細血管', 'リンパ管']);
      steps = ['心臓から送り出される血液が流れる血管を動脈という'];
    } else if (pat === 7) {
      question = '心臓へ戻ってくる血液が流れる血管を何といいますか。';
      answer = '静脈';
      choices = shuffle(['静脈', '動脈', '毛細血管', 'リンパ管']);
      steps = ['心臓へ戻ってくる血液が流れる血管を静脈という'];
    } else if (pat === 8) {
      question = '心臓から肺を通って心臓へ戻る血液の流れを何といいますか。';
      answer = '肺循環';
      choices = shuffle(['肺循環', '体循環', '血液循環', 'リンパ循環']);
      steps = ['心臓から肺を通って心臓へ戻る血液の流れを肺循環という'];
    } else if (pat === 9) {
      question = '心臓から全身を通って心臓へ戻る血液の流れを何といいますか。';
      answer = '体循環';
      choices = shuffle(['体循環', '肺循環', '血液循環', 'リンパ循環']);
      steps = ['心臓から全身を通って心臓へ戻る血液の流れを体循環という'];
    } else if (pat === 10) {
      question = '血液の成分のうち、酸素を運ぶはたらきをもつものはどれですか。';
      answer = '赤血球';
      choices = shuffle(['赤血球', '白血球', '血小板', '血しょう']);
      steps = ['赤血球は酸素を運ぶはたらきをもつ'];
    } else if (pat === 11) {
      question = '血液の成分のうち、細菌などの異物を分解し、体を守るはたらきをもつものはどれですか。';
      answer = '白血球';
      choices = shuffle(['白血球', '赤血球', '血小板', '血しょう']);
      steps = ['白血球は細菌などの異物を分解し、体を守るはたらきをもつ'];
    } else if (pat === 12) {
      question = '血液の成分のうち、出血した血液を固めるはたらきをもつものはどれですか。';
      answer = '血小板';
      choices = shuffle(['血小板', '赤血球', '白血球', '血しょう']);
      steps = ['血小板は出血した血液を固めるはたらきをもつ'];
    } else if (pat === 13) {
      question = '血液の成分のうち、液体成分で、養分や不要な物質を運ぶはたらきをもつものはどれですか。';
      answer = '血しょう';
      choices = shuffle(['血しょう', '赤血球', '白血球', '血小板']);
      steps = ['血しょうは液体成分で、養分や不要な物質を運ぶはたらきをもつ'];
    } else if (pat === 14) {
      question = '細胞の活動で生じた有害なアンモニアは、どこに運ばれて無害な物質に変えられますか。';
      answer = '肝臓';
      choices = shuffle(['肝臓', '腎臓', 'ぼうこう', 'すい臓']);
      steps = ['有害なアンモニアは肝臓に運ばれ、無害な物質に変えられる'];
    } else if (pat === 15) {
      question = 'アンモニアは、肝臓で何という無害な物質に変えられますか。';
      answer = '尿素';
      choices = shuffle(['尿素', 'ブドウ糖', 'アミノ酸', '脂肪酸']);
      steps = ['アンモニアは肝臓で尿素という無害な物質に変えられる'];
    } else if (pat === 16) {
      question = '血液中から尿素などの不要な物質をとり除く器官を何といいますか。';
      answer = '腎臓';
      choices = shuffle(['腎臓', '肝臓', 'ぼうこう', 'すい臓']);
      steps = ['血液中から尿素などの不要な物質をとり除く器官を腎臓という'];
    } else if (pat === 17) {
      question = '腎臓でとり除かれた不要な物質は、尿として排出されるまでどこに一時的にためられますか。';
      answer = 'ぼうこう';
      choices = shuffle(['ぼうこう', '肝臓', '腎臓', '肺']);
      steps = ['腎臓でとり除かれた不要な物質は、尿としてぼうこうに一時的にためられてから排出される'];
    } else {
      question = '心臓が規則正しく収縮と拡張をくり返し、血液を送り出すはたらきを何といいますか。';
      answer = '拍動';
      choices = shuffle(['拍動', '呼吸', '蒸散', '消化']);
      steps = ['心臓が規則正しく収縮と拡張をくり返して血液を送り出すはたらきを拍動という'];
    }
    return { category: 'respiration2', question, answer, choices, steps };
  }

  // 刺激と反応（中2）：感覚器官と感覚(視覚・聴覚・触覚・嗅覚・味覚)、中枢神経・
  // 末しょう神経・感覚神経・運動神経、反射の定義と信号の伝わり方のちがい、
  // 骨・関節・けんの用語、うでの筋肉の対になったはたらき。
  function genStimulusResponse2() {
    const pat = randInt(0, 17);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '目や耳など、周囲からの刺激を受けとるからだの器官を何といいますか。';
      answer = '感覚器官';
      choices = shuffle(['感覚器官', '中枢神経', '運動器官', '末しょう神経']);
      steps = ['目や耳など、周囲からの刺激を受けとるからだの器官を感覚器官という'];
    } else if (pat === 1) {
      question = '耳が受けとる刺激によって生じる感覚を何といいますか。';
      answer = '聴覚';
      choices = shuffle(['聴覚', '視覚', '触覚', '嗅覚']);
      steps = ['耳は音の刺激を受けとり、聴覚が生じる'];
    } else if (pat === 2) {
      question = '皮膚が受けとる圧力などの刺激によって生じる感覚を何といいますか。';
      answer = '触覚';
      choices = shuffle(['触覚', '視覚', '聴覚', '嗅覚']);
      steps = ['皮膚は圧力などの刺激を受けとり、触覚が生じる'];
    } else if (pat === 3) {
      question = '鼻が受けとるにおいの刺激によって生じる感覚を何といいますか。';
      answer = '嗅覚';
      choices = shuffle(['嗅覚', '視覚', '聴覚', '味覚']);
      steps = ['鼻はにおいの刺激を受けとり、嗅覚が生じる'];
    } else if (pat === 4) {
      question = '舌が受けとる味の刺激によって生じる感覚を何といいますか。';
      answer = '味覚';
      choices = shuffle(['味覚', '嗅覚', '視覚', '聴覚']);
      steps = ['舌は味の刺激を受けとり、味覚が生じる'];
    } else if (pat === 5) {
      question = '目が受けとる光の刺激によって生じる感覚を何といいますか。';
      answer = '視覚';
      choices = shuffle(['視覚', '聴覚', '触覚', '嗅覚']);
      steps = ['目は光の刺激を受けとり、視覚が生じる'];
    } else if (pat === 6) {
      question = '脳やせきずいからなる神経を何といいますか。';
      answer = '中枢神経';
      choices = shuffle(['中枢神経', '末しょう神経', '感覚神経', '運動神経']);
      steps = ['脳やせきずいからなる神経を中枢神経という'];
    } else if (pat === 7) {
      question = '中枢神経から枝分かれして全身に広がっている神経を何といいますか。';
      answer = '末しょう神経';
      choices = shuffle(['末しょう神経', '中枢神経', '感覚器官', '運動器官']);
      steps = ['中枢神経から枝分かれして全身に広がっている神経を末しょう神経という'];
    } else if (pat === 8) {
      question = '感覚器官が受けとった刺激の信号を、中枢神経に伝える神経を何といいますか。';
      answer = '感覚神経';
      choices = shuffle(['感覚神経', '運動神経', '中枢神経', '末しょう神経']);
      steps = ['感覚器官からの信号を中枢神経に伝える神経を感覚神経という'];
    } else if (pat === 9) {
      question = '中枢神経からの命令の信号を、運動器官に伝える神経を何といいますか。';
      answer = '運動神経';
      choices = shuffle(['運動神経', '感覚神経', '中枢神経', '末しょう神経']);
      steps = ['中枢神経からの命令を運動器官に伝える神経を運動神経という'];
    } else if (pat === 10) {
      question = '刺激に対して、意識とは無関係に決まった反応が起こることを何といいますか。';
      answer = '反射';
      choices = shuffle(['反射', '反応', '反発', '興奮']);
      steps = ['刺激に対して意識とは無関係に決まった反応が起こることを反射という'];
    } else if (pat === 11) {
      question = '反射は、意識して行う反応に比べて、反応の速さはどうですか。';
      answer = '反射の方が速い';
      choices = shuffle([answer, '意識して行う反応の方が速い', '同じ速さである', 'どちらも起こらない']);
      steps = ['反射は脳を経由しないため、意識して行う反応よりも反応が速い'];
    } else if (pat === 12) {
      question = '意識して行う反応では、信号はどのような順で伝わりますか。';
      answer = '感覚器官→感覚神経→脳→(せきずい→)運動神経→運動器官';
      choices = shuffle([answer, '感覚器官→運動神経→脳→感覚神経→運動器官', '運動器官→運動神経→脳→感覚神経→感覚器官', '感覚器官→せきずい→運動器官(脳を通らない)']);
      steps = ['意識して行う反応では、信号は感覚器官から感覚神経を通って脳に伝わり、脳が判断してから運動神経を通って運動器官に伝わる'];
    } else if (pat === 13) {
      question = '熱いものにうっかりふれて、思わず手を引っこめるような反射では、信号はどのように伝わりますか。';
      answer = '脳を通らず、せきずいから直接運動神経に伝わる';
      choices = shuffle([answer, '必ず脳を通ってから運動神経に伝わる', '信号は運動神経を通らない', '感覚神経を通らずに反応する']);
      steps = ['反射では、信号が脳を通らずせきずいから直接運動神経に伝わるため、反応が速い'];
    } else if (pat === 14) {
      question = '骨には、からだを支えたり動かしたりするほかに、どのようなはたらきがありますか。';
      answer = '内臓を保護するはたらき';
      choices = shuffle([answer, '養分をつくるはたらき', '光合成を行うはたらき', '消化液を出すはたらき']);
      steps = ['骨には、からだを支える・動かすはたらきのほかに、脳や内臓を保護するはたらきがある'];
    } else if (pat === 15) {
      question = '骨と骨がつながっていて、曲げのばしができる部分を何といいますか。';
      answer = '関節';
      choices = shuffle(['関節', 'けん', '筋肉', '神経']);
      steps = ['骨と骨がつながっていて、曲げのばしができる部分を関節という'];
    } else if (pat === 16) {
      question = '筋肉が骨についている部分を何といいますか。';
      answer = 'けん';
      choices = shuffle(['けん', '関節', '神経', '軟骨']);
      steps = ['筋肉が骨についている部分をけんという'];
    } else {
      question = 'うでを曲げのばしするとき、関節をはさんで骨についている2つの筋肉は、どのようにはたらきますか。';
      answer = '一方が縮むと、もう一方はゆるむ(対になってはたらく)';
      choices = shuffle([answer, '両方が同時に縮む', '両方が同時にゆるむ', '片方の筋肉しか使われない']);
      steps = ['関節をはさんで向かい合う2つの筋肉は、一方が縮むと他方がゆるむというように、対になってはたらく'];
    }
    return { category: 'stimulusResponse2', question, answer, choices, steps };
  }

  // 生物の成長と生殖（中3）：細胞分裂・染色体・遺伝子の用語、体細胞分裂の順序、
  // 無性生殖(栄養生殖)/有性生殖の区別、生殖細胞・受精・受精卵・花粉管、
  // 減数分裂と受精による染色体数の変化、無性/有性生殖での形質の受けつがれ方、
  // クローンの用語。
  function genGrowthReproduction3() {
    const pat = randInt(0, 19);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '1個の細胞が2つに分かれて2個の細胞になることを何といいますか。';
      answer = '細胞分裂';
      choices = shuffle(['細胞分裂', '減数分裂', '体細胞分裂', '受精']);
      steps = ['1個の細胞が2つに分かれて2個の細胞になることを細胞分裂という'];
    } else if (pat === 1) {
      question = '細胞分裂のときに見られる、ひものようなつくりを何といいますか。';
      answer = '染色体';
      choices = shuffle(['染色体', '遺伝子', '細胞質', '細胞膜']);
      steps = ['細胞分裂のときに見られるひものようなつくりを染色体という'];
    } else if (pat === 2) {
      question = '染色体に存在し、生物の形質(形や性質)を決めるものを何といいますか。';
      answer = '遺伝子';
      choices = shuffle(['遺伝子', '染色体', '細胞質', '細胞壁']);
      steps = ['染色体に存在し、生物の形質を決めるものを遺伝子という'];
    } else if (pat === 3) {
      question = '多細胞生物は、どのようにして成長しますか。';
      answer = '細胞分裂で細胞の数がふえ、それぞれの細胞自体も大きくなる';
      choices = shuffle([answer, '1つの細胞だけがどんどん大きくなる', '細胞の数が減って、1つ1つが大きくなる', '細胞分裂だけが起こり、細胞は大きくならない']);
      steps = ['多細胞生物は、細胞分裂で細胞数がふえ、細胞自体が大きくなることで成長する'];
    } else if (pat === 4) {
      question = '根の細胞分裂を観察するとき、染色体を染めるために使う染色液は何ですか。';
      answer = '酢酸カーミン液(酢酸オルセイン液)';
      choices = shuffle([answer, 'ヨウ素液', 'ベネジクト液', 'BTB溶液']);
      steps = ['細胞分裂の観察には、染色体を赤く染める酢酸カーミン液(酢酸オルセイン液)を使う'];
    } else if (pat === 5) {
      question = '体細胞分裂で、染色体が中央付近に集まって並んだ後、次に起こることはどれですか。';
      answer = '染色体が2つに分かれて、両端に移動する';
      choices = shuffle([answer, '仕切りができて2個の細胞に分かれる', '核の中に染色体が現れる', '細胞自体が大きくなる']);
      steps = ['染色体が中央に並んだ後、2つに分かれて両端に移動し、その後仕切りができて2つの細胞になる'];
    } else if (pat === 6) {
      question = '生物が、自分と同じ種類の新しい個体(子)をつくることを何といいますか。';
      answer = '生殖';
      choices = shuffle(['生殖', '成長', '受精', '分裂']);
      steps = ['生物が自分と同じ種類の新しい個体をつくることを生殖という'];
    } else if (pat === 7) {
      question = '受精を行わずに子をつくる生殖を何といいますか。';
      answer = '無性生殖';
      choices = shuffle(['無性生殖', '有性生殖', '栄養生殖', '減数分裂']);
      steps = ['受精を行わずに子をつくる生殖を無性生殖という'];
    } else if (pat === 8) {
      question = '受精によって新しい個体(子)をつくる生殖を何といいますか。';
      answer = '有性生殖';
      choices = shuffle(['有性生殖', '無性生殖', '栄養生殖', '体細胞分裂']);
      steps = ['受精によって新しい個体をつくる生殖を有性生殖という'];
    } else if (pat === 9) {
      question = '植物のからだの一部(茎など)から新しい個体ができる無性生殖を、特に何といいますか。';
      answer = '栄養生殖';
      choices = shuffle(['栄養生殖', '有性生殖', '減数分裂', '体細胞分裂']);
      steps = ['植物のからだの一部から新しい個体ができる無性生殖を栄養生殖という'];
    } else if (pat === 10) {
      question = '卵や精子など、生殖のためにつくられる特別な細胞を何といいますか。';
      answer = '生殖細胞';
      choices = shuffle(['生殖細胞', '体細胞', '受精卵', '染色体']);
      steps = ['卵や精子など、生殖のためにつくられる特別な細胞を生殖細胞という'];
    } else if (pat === 11) {
      question = '卵(卵細胞)と精子(精細胞)などの生殖細胞が合体することを何といいますか。';
      answer = '受精';
      choices = shuffle(['受精', '受粉', '発生', '分裂']);
      steps = ['生殖細胞が合体することを受精という'];
    } else if (pat === 12) {
      question = '受精によってつくられる新しい細胞を何といいますか。';
      answer = '受精卵';
      choices = shuffle(['受精卵', '生殖細胞', '体細胞', '胚']);
      steps = ['受精によってつくられる新しい細胞を受精卵という'];
    } else if (pat === 13) {
      question = '被子植物では、花粉から何がのびて、その中を精細胞が移動しますか。';
      answer = '花粉管';
      choices = shuffle(['花粉管', '道管', '師管', '柱頭']);
      steps = ['被子植物では花粉から花粉管がのび、その中を精細胞が移動して卵細胞と受精する'];
    } else if (pat === 14) {
      question = '生殖細胞がつくられるときに行われる、染色体の数がもとの細胞の半分になる特別な細胞分裂を何といいますか。';
      answer = '減数分裂';
      choices = shuffle(['減数分裂', '体細胞分裂', '栄養生殖', '受精']);
      steps = ['生殖細胞ができるときに行われる、染色体数が半分になる細胞分裂を減数分裂という'];
    } else if (pat === 15) {
      question = '減数分裂でできた卵と精子が受精すると、受精卵の染色体の数はもとの体細胞と比べてどうなりますか。';
      answer = 'もとの体細胞と同じ数にもどる';
      choices = shuffle([answer, 'もとの体細胞の2倍になる', 'もとの体細胞の半分のままである', '染色体はなくなる']);
      steps = ['半分の染色体をもつ卵と精子が受精することで、受精卵の染色体数はもとの体細胞と同じ数にもどる'];
    } else if (pat === 16) {
      question = '無性生殖でできた子の形質は、親の形質と比べてどうなりますか。';
      answer = '親の形質と同じになる';
      choices = shuffle([answer, '親の形質とは全く異なるものになる', '形質は半分だけ受けつがれる', '形質は受けつがれない']);
      steps = ['無性生殖では体細胞分裂によって子ができるため、子は親の染色体をそのまま受けつぎ、形質は親と同じになる'];
    } else if (pat === 17) {
      question = '有性生殖でできた子は、両親からどのように染色体を受けつぎますか。';
      answer = '両親から半分ずつ染色体を受けつぐ';
      choices = shuffle([answer, '父親からすべて受けつぐ', '母親からすべて受けつぐ', '染色体は受けつがない']);
      steps = ['有性生殖では、子は両親から半分ずつ染色体を受けつぐ'];
    } else if (pat === 18) {
      question = '無性生殖によってできる、同じ遺伝子をもつ個体の集団を何といいますか。';
      answer = 'クローン';
      choices = shuffle(['クローン', 'コロニー', 'コミュニティ', 'ヘテロ']);
      steps = ['無性生殖によってできる、同じ遺伝子をもつ個体の集団をクローンという'];
    } else {
      question = 'からだが成長するときに行われる細胞分裂を何といいますか(減数分裂と区別して)。';
      answer = '体細胞分裂';
      choices = shuffle(['体細胞分裂', '減数分裂', '栄養生殖', '有性生殖']);
      steps = ['からだが成長するときに行われる細胞分裂を体細胞分裂という'];
    }
    return { category: 'growthReproduction3', question, answer, choices, steps };
  }

  // 生物の多様性と進化（中3）：化石からわかること、脊椎動物5グループの移動・
  // 呼吸器官/子のうまれ方/生活場所の比較、出現順序、進化の定義とダーウィン、
  // 中間的な特徴をもつ化石(イクチオステガ・始祖鳥)、相同器官、植物の進化順序。
  function genEvolution3() {
    const pat = randInt(0, 19);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '化石から、何を推測することができますか。';
      answer = '過去の生物の種類や生息環境';
      choices = shuffle([answer, '未来の気候変動だけ', '現在の人口だけ', '地球の中心温度だけ']);
      steps = ['化石から、過去の生物の種類や生息環境などを推測することができる'];
    } else if (pat === 1) {
      question = '脊椎動物のすべてのグループに共通する特徴は何ですか。';
      answer = '背骨がある';
      choices = shuffle(['背骨がある', '肺で呼吸する', '卵生である', '陸上で生活する']);
      steps = ['脊椎動物のすべてのグループに共通する特徴として、背骨があることがあげられる'];
    } else if (pat === 2) {
      question = '魚類や両生類の幼生(子)の、移動のための器官は何ですか。';
      answer = 'ひれ';
      choices = shuffle(['ひれ', 'あし', 'つばさ', '羽毛']);
      steps = ['魚類や両生類の幼生の移動のための器官はひれである'];
    } else if (pat === 3) {
      question = 'ハチュウ類、鳥類、哺乳類の、移動のための器官は何ですか。';
      answer = 'あし';
      choices = shuffle(['あし', 'ひれ', 'えら', '肺']);
      steps = ['ハチュウ類、鳥類、哺乳類の移動のための器官はあしである'];
    } else if (pat === 4) {
      question = '魚類や両生類の幼生の呼吸器官は何ですか。';
      answer = 'えら';
      choices = shuffle(['えら', '肺', '皮膚だけ', '気管だけ']);
      steps = ['魚類や両生類の幼生の呼吸器官はえらである'];
    } else if (pat === 5) {
      question = 'ハチュウ類、鳥類、哺乳類の呼吸器官は何ですか。';
      answer = '肺';
      choices = shuffle(['肺', 'えら', 'ひれ', 'うろこ']);
      steps = ['ハチュウ類、鳥類、哺乳類の呼吸器官は肺である'];
    } else if (pat === 6) {
      question = '魚類、両生類、ハチュウ類、鳥類に共通する子のうまれ方を何といいますか。';
      answer = '卵生';
      choices = shuffle(['卵生', '胎生', '無性生殖', '栄養生殖']);
      steps = ['魚類、両生類、ハチュウ類、鳥類は卵生である'];
    } else if (pat === 7) {
      question = '母親の体内である程度育ってから生まれる、哺乳類の子のうまれ方を何といいますか。';
      answer = '胎生';
      choices = shuffle(['胎生', '卵生', '変態', '栄養生殖']);
      steps = ['哺乳類は、母親の体内である程度育ってから生まれる胎生である'];
    } else if (pat === 8) {
      question = '脊椎動物が地球上に出現した順序として正しいものはどれですか。';
      answer = '魚類→両生類→ハチュウ類→哺乳類・鳥類';
      choices = shuffle([answer, '哺乳類→鳥類→ハチュウ類→両生類→魚類', '両生類→魚類→ハチュウ類→鳥類→哺乳類', 'ハチュウ類→魚類→両生類→哺乳類→鳥類']);
      steps = ['脊椎動物は、魚類→両生類→ハチュウ類→哺乳類・鳥類の順に出現したと考えられている'];
    } else if (pat === 9) {
      question = '生物が長い年月をかけて代を重ねる間に変化することを何といいますか。';
      answer = '進化';
      choices = shuffle(['進化', '成長', '生殖', '変態']);
      steps = ['生物が長い年月をかけて代を重ねる間に変化することを進化という'];
    } else if (pat === 10) {
      question = '1859年に「種の起源」を発表し、進化の考えを唱えた人物は誰ですか。';
      answer = 'チャールズ・ダーウィン';
      choices = shuffle(['チャールズ・ダーウィン', 'グレゴール・メンデル', 'チャールズ・ライエル', 'アイザック・ニュートン']);
      steps = ['1859年に「種の起源」を発表したのはチャールズ・ダーウィンである'];
    } else if (pat === 11) {
      question = 'イクチオステガの化石には、両生類的な特徴のほかに、どのような特徴が見られますか。';
      answer = '魚類的な特徴';
      choices = shuffle(['魚類的な特徴', '鳥類的な特徴', '哺乳類的な特徴', '植物的な特徴']);
      steps = ['イクチオステガの化石には、両生類的な特徴と魚類的な特徴の両方が見られる'];
    } else if (pat === 12) {
      question = '始祖鳥の化石には、ハチュウ類の特徴のほかに、どのような特徴が見られますか。';
      answer = '羽毛やつばさなど鳥類の特徴';
      choices = shuffle([answer, 'えらなど魚類の特徴', '肺以外の呼吸器官', '胎生という特徴']);
      steps = ['始祖鳥の化石には、ハチュウ類の特徴と、羽毛やつばさなどの鳥類の特徴の両方が見られる'];
    } else if (pat === 13) {
      question = '現在の形やはたらきは異なるが、基本的なつくりが同じで、もとは同じ器官であったと考えられるものを何といいますか。';
      answer = '相同器官';
      choices = shuffle(['相同器官', '相似器官', '退化器官', '生殖器官']);
      steps = ['現在の形やはたらきは異なるが、もとは同じ器官であったと考えられるものを相同器官という'];
    } else if (pat === 14) {
      question = 'コウモリの翼、クジラのひれ、ヒトのうでに共通することは何ですか。';
      answer = '基本的な骨格のつくりが同じで、相同器官であると考えられる';
      choices = shuffle([answer, 'すべて同じはたらきをする', 'すべて空を飛ぶための器官である', 'すべて呼吸のための器官である']);
      steps = ['コウモリの翼、クジラのひれ、ヒトのうでは、形やはたらきはちがうが基本的な骨格のつくりが同じ相同器官である'];
    } else if (pat === 15) {
      question = '陸上に現れた最初の植物のグループは何ですか。';
      answer = 'コケ植物';
      choices = shuffle(['コケ植物', 'シダ植物', '裸子植物', '被子植物']);
      steps = ['陸上に現れた最初の植物はコケ植物であると考えられている'];
    } else if (pat === 16) {
      question = '植物は、どのような順序で進化してきたと考えられていますか。';
      answer = 'コケ植物→シダ植物→裸子植物→被子植物';
      choices = shuffle([answer, '被子植物→裸子植物→シダ植物→コケ植物', 'シダ植物→コケ植物→被子植物→裸子植物', '裸子植物→被子植物→コケ植物→シダ植物']);
      steps = ['植物は、コケ植物→シダ植物→裸子植物→被子植物の順に進化してきたと考えられている'];
    } else if (pat === 17) {
      question = '両生類の成体は、主にどこで生活しますか。';
      answer = '陸上と水辺';
      choices = shuffle(['陸上と水辺', '水中のみ', '陸上のみ(一生)', '空中のみ']);
      steps = ['両生類の成体は、陸上と水辺の両方で生活する'];
    } else if (pat === 18) {
      question = 'ハチュウ類、鳥類、哺乳類は、一生をどこで生活しますか。';
      answer = '陸上';
      choices = shuffle(['陸上', '水中', '水辺のみ', '空中のみ']);
      steps = ['ハチュウ類、鳥類、哺乳類は一生を陸上で生活する'];
    } else {
      question = 'イクチオステガや始祖鳥のように、2つのグループの中間的な特徴をもつ生物の化石が発見されることは、何の証拠と考えられますか。';
      answer = '生物が進化してきたことの証拠';
      choices = shuffle([answer, '生物は進化していないことの証拠', '化石が偽物であることの証拠', '地層が新しいことの証拠']);
      steps = ['中間的な特徴をもつ生物の化石は、生物が進化してきたことの証拠と考えられる'];
    }
    return { category: 'evolution3', question, answer, choices, steps };
  }

  // 物体の運動（中3）：記録タイマーの打点(東日本50Hz/西日本60Hz)、平均の速さ・
  // 瞬間の速さ・等速直線運動の用語、おし出す力と速さ・移動距離の関係、
  // 速さの単位(m/s・km/h)の意味と換算、テープの間隔から運動のようすを読み取る。
  function genMotion3() {
    const pat = randInt(0, 17);
    let question, answer, choices, steps, wrongs;
    if (pat === 0) {
      question = '物体の運動を、一定時間ごとの打点としてテープに記録する装置を何といいますか。';
      answer = '記録タイマー';
      choices = shuffle(['記録タイマー', 'ストップウォッチ', 'ストロボスコープ', '速度計']);
      steps = ['物体の運動を一定時間ごとの打点としてテープに記録する装置を記録タイマーという'];
    } else if (pat === 1) {
      question = '記録タイマーは、周波数が50Hzである東日本では、1秒間に何回打点しますか。';
      answer = '50回';
      choices = shuffle(['50回', '60回', '100回', '10回']);
      steps = ['東日本の交流の周波数は50Hzなので、記録タイマーは1秒間に50回打点する'];
    } else if (pat === 2) {
      question = '記録タイマーは、周波数が60Hzである西日本では、1秒間に何回打点しますか。';
      answer = '60回';
      choices = shuffle(['60回', '50回', '100回', '10回']);
      steps = ['西日本の交流の周波数は60Hzなので、記録タイマーは1秒間に60回打点する'];
    } else if (pat === 3) {
      question = '東日本(50Hz)の記録タイマーを使うとき、0.1秒間の移動距離を求めるには、何打点ごとにテープを区切ればよいですか。';
      answer = '5打点ごと';
      choices = shuffle(['5打点ごと', '6打点ごと', '10打点ごと', '1打点ごと']);
      steps = ['50Hzでは1秒間に50打点、つまり0.1秒間に5打点するので、5打点ごとに区切る'];
    } else if (pat === 4) {
      question = '西日本(60Hz)の記録タイマーを使うとき、0.1秒間の移動距離を求めるには、何打点ごとにテープを区切ればよいですか。';
      answer = '6打点ごと';
      choices = shuffle(['6打点ごと', '5打点ごと', '10打点ごと', '1打点ごと']);
      steps = ['60Hzでは1秒間に60打点、つまり0.1秒間に6打点するので、6打点ごとに区切る'];
    } else if (pat === 5) {
      question = 'ある距離を移動するのにかかった時間で、移動した距離を割って求める速さを何といいますか。';
      answer = '平均の速さ';
      choices = shuffle(['平均の速さ', '瞬間の速さ', '等速直線運動', '加速度']);
      steps = ['移動距離を、かかった時間で割って求める速さを平均の速さという'];
    } else if (pat === 6) {
      question = 'ごく短い時間に移動した距離をもとに求めた、その一瞬の速さを何といいますか。';
      answer = '瞬間の速さ';
      choices = shuffle(['瞬間の速さ', '平均の速さ', '等速直線運動', '相対速度']);
      steps = ['ごく短い時間の移動距離をもとに求めた、その一瞬の速さを瞬間の速さという'];
    } else if (pat === 7) {
      question = '一直線上を一定の速さで進む運動を何といいますか。';
      answer = '等速直線運動';
      choices = shuffle(['等速直線運動', '加速度運動', '自由落下運動', '等速円運動']);
      steps = ['一直線上を一定の速さで進む運動を等速直線運動という'];
    } else if (pat === 8) {
      question = '等速直線運動では、移動距離は時間に対してどのような関係にありますか。';
      answer = '比例する';
      choices = shuffle(['比例する', '反比例する', '関係がない', '2乗に比例する']);
      steps = ['等速直線運動では、移動距離は時間に比例する'];
    } else if (pat === 9) {
      question = '台車をおし出す力を強めると、記録テープの0.1秒ごとの移動距離はどうなりますか。';
      answer = '大きくなる(長くなる)';
      choices = shuffle(['大きくなる(長くなる)', '小さくなる(短くなる)', '変わらない', '0になる']);
      steps = ['おし出す力を強めると、台車の速さが増すため0.1秒ごとの移動距離は大きくなる'];
    } else if (pat === 10) {
      question = '台車をおし出す力を強めるほど、台車の速さはどうなりますか。';
      answer = '大きくなる';
      choices = shuffle(['大きくなる', '小さくなる', '変わらない', '0になる']);
      steps = ['おし出す力を強めるほど、台車の速さは大きくなる'];
    } else if (pat === 11) {
      question = '速さの単位「m/s」は、何を表していますか。';
      answer = '1秒間に何m進むかを表す速さ';
      choices = shuffle([answer, '1分間に何m進むかを表す速さ', '1時間に何m進むかを表す速さ', '1mを進むのにかかる時間']);
      steps = ['m/s(メートル毎秒)は、1秒間に何m進むかを表す速さの単位である'];
    } else if (pat === 12) {
      question = '速さの単位「km/h」は、何を表していますか。';
      answer = '1時間に何km進むかを表す速さ';
      choices = shuffle([answer, '1秒間に何km進むかを表す速さ', '1分間に何km進むかを表す速さ', '1kmを進むのにかかる時間']);
      steps = ['km/h(キロメートル毎時)は、1時間に何km進むかを表す速さの単位である'];
    } else if (pat === 13) {
      const ms = randInt(2, 50);
      const kmh = Math.round(ms * 3.6 * 10) / 10;
      question = `秒速${ms}mは、時速何kmですか。（小数第1位まで求めなさい）`;
      answer = kmh;
      wrongs = [Math.round((kmh + 3.6) * 10) / 10, Math.round((kmh + 7.2) * 10) / 10, Math.max(0.1, Math.round((kmh - 3.6) * 10) / 10), Math.max(0.1, Math.round((kmh - 7.2) * 10) / 10)].filter(v => v !== answer);
      steps = [`km/hに直すには×3.6する`, `${ms} × 3.6 = ${answer}km/h`];
      return { category: 'motion3', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 14) {
      const ms = randInt(2, 50);
      const kmh = Math.round(ms * 3.6 * 10) / 10;
      question = `時速${kmh}kmは、秒速何mですか。`;
      answer = ms;
      wrongs = [ms + 2, ms + 4, Math.max(1, ms - 2), Math.max(1, ms - 4)].filter(v => v !== answer);
      steps = [`m/sに直すには÷3.6する`, `${kmh} ÷ 3.6 = ${answer}m/s`];
      return { category: 'motion3', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 15) {
      question = '一定時間ごとに物体を撮影したストロボ写真から、何がわかりますか。';
      answer = '運動の速さと向きが、刻々とどのように変化しているか';
      choices = shuffle([answer, '物体の色だけ', '物体の温度だけ', '物体の質量だけ']);
      steps = ['一定時間ごとに撮影したストロボ写真から、運動の速さと向きの変化がわかる'];
    } else if (pat === 16) {
      question = '記録テープの打点の間隔が、常に同じ(均等)であるとき、その運動は何であると考えられますか。';
      answer = '等速直線運動';
      choices = shuffle(['等速直線運動', '加速度運動', '減速運動', '静止']);
      steps = ['打点の間隔が均等であれば、一定時間ごとの移動距離が変わらないので等速直線運動と考えられる'];
    } else {
      question = '記録テープの打点の間隔が、だんだん広くなっているとき、物体の運動はどうなっていると考えられますか。';
      answer = 'だんだん速くなっている(加速している)';
      choices = shuffle([answer, 'だんだん遅くなっている', '一定の速さで動いている', '静止している']);
      steps = ['打点の間隔がだんだん広くなっているのは、一定時間ごとの移動距離が増えている、つまり速くなっているということである'];
    }
    return { category: 'motion3', question, answer, choices, steps };
  }

  // 力の合成と分解（中3）：力の合成・合力、一直線上の2力の合成(向き・大きさ)、
  // 角度をもつ2力の合成(平行四辺形の作図)、力の分解・分力、斜面上の重力の
  // 分解と傾きとの関係、垂直抗力、力のつり合い。
  function genForceComposition3() {
    const pat = randInt(0, 17);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '複数の力と同じはたらきをする1つの力を求めることを何といいますか。';
      answer = '力の合成';
      choices = shuffle(['力の合成', '力の分解', '力のつり合い', '作用・反作用']);
      steps = ['複数の力と同じはたらきをする1つの力を求めることを力の合成という'];
    } else if (pat === 1) {
      question = '力の合成によって求められる、複数の力と同じはたらきをする1つの力を何といいますか。';
      answer = '合力';
      choices = shuffle(['合力', '分力', '抗力', '張力']);
      steps = ['力の合成で求められる1つの力を合力という'];
    } else if (pat === 2) {
      question = '一直線上で同じ向きにはたらく2つの力を合成すると、合力の向きはどうなりますか。';
      answer = '2力と同じ向きになる';
      choices = shuffle([answer, '2力と反対向きになる', '2力に垂直な向きになる', '向きは定まらない']);
      steps = ['同じ向きの2力を合成すると、合力の向きは2力と同じ向きになる'];
    } else if (pat === 3) {
      question = '一直線上で同じ向きにはたらく2つの力を合成すると、合力の大きさはどうなりますか。';
      answer = '2力の大きさの和になる';
      choices = shuffle([answer, '2力の大きさの差になる', '2力の大きさの平均になる', '2力のうち大きい方と同じになる']);
      steps = ['同じ向きの2力を合成すると、合力の大きさは2力の大きさの和になる'];
    } else if (pat === 4) {
      question = '一直線上で逆向きにはたらく2つの力を合成すると、合力の大きさはどうなりますか。';
      answer = '2力の大きさの差になる';
      choices = shuffle([answer, '2力の大きさの和になる', '2力の大きさの平均になる', '常に0になる']);
      steps = ['逆向きの2力を合成すると、合力の大きさは2力の大きさの差になる'];
    } else if (pat === 5) {
      question = '一直線上で逆向きにはたらく2つの力を合成すると、合力の向きはどうなりますか。';
      answer = '大きい方の力と同じ向きになる';
      choices = shuffle([answer, '小さい方の力と同じ向きになる', '2力に垂直な向きになる', '向きは定まらない']);
      steps = ['逆向きの2力を合成すると、合力の向きは大きい方の力と同じ向きになる'];
    } else if (pat === 6) {
      question = '大きさが等しく、向きが反対の2つの力を合成すると、合力の大きさはどうなりますか。';
      answer = '0になる';
      choices = shuffle(['0になる', '2倍になる', '変わらない', '2力の平均になる']);
      steps = ['大きさが等しく向きが反対の2力の合力は0になる(力がつり合った状態)'];
    } else if (pat === 7) {
      question = '角度をもってはたらく2つの力の合力は、どのような作図で求められますか。';
      answer = '2つの力を表す矢印を2辺とする平行四辺形の対角線として求める';
      choices = shuffle([answer, '2つの力を表す矢印を単純に足し合わせた長さの矢印として求める', '2つの力の角度の中間の向きに矢印をかいて求める', '2つの力の大きい方だけを使って求める']);
      steps = ['角度をもってはたらく2力の合力は、2力を2辺とする平行四辺形の対角線として作図できる'];
    } else if (pat === 8) {
      question = '左右対称な角度で2つの力を引くとき、その角度を大きくすると、合力の大きさはどうなりますか。';
      answer = '小さくなる';
      choices = shuffle(['小さくなる', '大きくなる', '変わらない', '0になる']);
      steps = ['左右対称に引く2力の角度を大きくすると、合力の大きさは小さくなる'];
    } else if (pat === 9) {
      question = '1つの力を、これと同じはたらきをする2つ以上の力に分けることを何といいますか。';
      answer = '力の分解';
      choices = shuffle(['力の分解', '力の合成', '力のつり合い', '作用・反作用']);
      steps = ['1つの力を同じはたらきをする2つ以上の力に分けることを力の分解という'];
    } else if (pat === 10) {
      question = '力の分解によって分けられた、それぞれの力を何といいますか。';
      answer = '分力';
      choices = shuffle(['分力', '合力', '抗力', '張力']);
      steps = ['力の分解で分けられたそれぞれの力を分力という'];
    } else if (pat === 11) {
      question = '斜面上に置かれた物体にはたらく重力は、どのような2つの分力に分解できますか。';
      answer = '斜面に平行な分力と、斜面に垂直な分力';
      choices = shuffle([answer, '水平方向の分力と、鉛直方向の分力の2つだけ', '大きさが等しい2つの分力', '向きが同じ2つの分力']);
      steps = ['斜面上の物体にはたらく重力は、斜面に平行な分力と斜面に垂直な分力に分解できる'];
    } else if (pat === 12) {
      question = '斜面の傾きが大きくなるほど、斜面下向き(斜面に平行な方向)の分力はどうなりますか。';
      answer = '大きくなる';
      choices = shuffle(['大きくなる', '小さくなる', '変わらない', '0になる']);
      steps = ['斜面の傾きが大きくなるほど、斜面に平行な(斜面下向きの)分力は大きくなる'];
    } else if (pat === 13) {
      question = '斜面の傾きが大きくなるほど、斜面に垂直な方向の分力はどうなりますか。';
      answer = '小さくなる';
      choices = shuffle(['小さくなる', '大きくなる', '変わらない', '2倍になる']);
      steps = ['斜面の傾きが大きくなるほど、斜面に垂直な方向の分力は小さくなる'];
    } else if (pat === 14) {
      question = '斜面や床などの面から、面に垂直な方向に物体がおされる力を何といいますか。';
      answer = '垂直抗力';
      choices = shuffle(['垂直抗力', '摩擦力', '張力', '弾性力']);
      steps = ['面から面に垂直な方向に物体がおされる力を垂直抗力という'];
    } else if (pat === 15) {
      question = '静止している物体にはたらく力の合力は、どうなっていますか。';
      answer = '0である(合力ははたらいていない)';
      choices = shuffle([answer, '常に一定の大きさではたらいている', '重力と同じ大きさではたらいている', '物体の重さの2倍になっている']);
      steps = ['静止している物体にはたらく力はつり合っており、合力は0である'];
    } else if (pat === 16) {
      question = '斜面上で静止している物体では、垂直抗力Nと、重力の斜面に垂直な分力の関係はどうなっていますか。';
      answer = '大きさが等しく、つり合っている';
      choices = shuffle([answer, '垂直抗力の方が常に大きい', '斜面に垂直な分力の方が常に大きい', '関係はない']);
      steps = ['斜面上で静止している物体では、垂直抗力と重力の斜面に垂直な分力はつり合い、大きさが等しい'];
    } else {
      question = '2力がつくる角度を測るときに使う道具は何ですか。';
      answer = '分度器';
      choices = shuffle(['分度器', 'ものさし', 'ばねばかり', '電子てんびん']);
      steps = ['2力がつくる角度を測るときは分度器を使う'];
    }
    return { category: 'forceComposition3', question, answer, choices, steps };
  }

  // 電気のはたらき（小4）：直列つなぎ・へい列つなぎ、乾電池の向きとモーターの
  // 回転、回路・電気用図記号の基礎。
  function genElectricCircuit4() {
    const pat = randInt(0, 10);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '乾電池1個と、乾電池2個を直列につないだときとで、豆電球の明るさをくらべると、乾電池2個の方はどうなりますか。';
      answer = '明るくなる';
      choices = shuffle(['明るくなる', '暗くなる', '変わらない', '光らなくなる']);
      steps = ['乾電池を直列につなぐと、回路に流れる電流が大きくなるため豆電球は明るくなる'];
    } else if (pat === 1) {
      question = '乾電池1個のときと、乾電池2個をへい列につないだときとで、豆電球の明るさをくらべるとどうなりますか。';
      answer = '変わらない';
      choices = shuffle(['変わらない', '明るくなる', '暗くなる', '光らなくなる']);
      steps = ['乾電池をへい列につないでも、回路に流れる電流の大きさは乾電池1個のときとほぼ変わらない'];
    } else if (pat === 2) {
      question = '乾電池を直列つなぎとへい列つなぎにしたとき、電池が長持ちするのはどちらですか。';
      answer = 'へい列つなぎ';
      choices = shuffle(['へい列つなぎ', '直列つなぎ', 'どちらも同じ', 'つなぎ方には関係ない']);
      steps = ['へい列つなぎは1個あたりの電池が使われる量が少なくてすむため、電池が長持ちする'];
    } else if (pat === 3) {
      question = 'モーターに流れる電流の向きを逆にすると、モーターの回転はどうなりますか。';
      answer = '逆向きに回る';
      choices = shuffle(['逆向きに回る', '同じ向きのまま回る', '止まる', '速く回る']);
      steps = ['電流の向きを逆にすると、モーターは逆向きに回転する'];
    } else if (pat === 4) {
      question = '乾電池の向きを反対にしてつなぐと、モーターの回転はどうなりますか。';
      answer = '逆向きに回る';
      choices = shuffle(['逆向きに回る', '同じ向きのまま回る', '止まる', '速く回る']);
      steps = ['乾電池の向きを反対にすると、回路に流れる電流の向きが逆になり、モーターは逆向きに回る'];
    } else if (pat === 5) {
      question = '電気を通す道が輪のようにひとつながりになっているものを何といいますか。';
      answer = '回路';
      choices = shuffle(['回路', '導線', '端子', '極']);
      steps = ['電気の通り道がひとつながりの輪になっているものを回路という'];
    } else if (pat === 6) {
      question = '乾電池の記号で、たての線が長い方はどちらの極を表しますか。';
      answer = '＋極';
      choices = shuffle(['＋極', '－極', 'どちらでもない', '両方とも同じ極']);
      steps = ['乾電池の電気用図記号は、長い線が＋極、短い線が－極を表す'];
    } else if (pat === 7) {
      question = '回路の中を流れる電流の向きは、乾電池のどちらの極からどちらの極に向かって流れますか。';
      answer = '＋極から－極';
      choices = shuffle(['＋極から－極', '－極から＋極', '両方の極から同時に流れる', '向きは決まっていない']);
      steps = ['回路の外側(導線の中)を流れる電流は、乾電池の＋極から出て－極にもどる向きに流れる'];
    } else if (pat === 8) {
      question = '回路に流れる電流の大きさをはかる器具を何といいますか。';
      answer = '検流計（電流計）';
      choices = shuffle(['検流計（電流計）', '電圧計', '温度計', 'ばねばかり']);
      steps = ['回路に流れる電流の大きさは検流計(電流計)ではかる'];
    } else if (pat === 9) {
      question = '乾電池の＋極と－極を、豆電球などを通さずに導線だけで直接つなぐと、どうなりますか。';
      answer = 'とても大きな電流が流れて危険（ショート回路）';
      choices = shuffle([answer, '電流はまったく流れない', '豆電球が最も明るく光る', '乾電池が長持ちする']);
      steps = ['＋極と－極を導線だけで直接つなぐとショート回路となり、とても大きな電流が流れて危険なので絶対にしてはいけない'];
    } else {
      question = '直列つなぎにした2つの豆電球のうち、1つの豆電球のフィラメントが切れると、もう1つの豆電球はどうなりますか。';
      answer = '消える（回路がつながらなくなるため）';
      choices = shuffle([answer, '変わらず光り続ける', 'これまでより明るくなる', '一瞬だけ明るくなってから消える']);
      steps = ['直列つなぎでは回路が1本の輪になっているため、1つの豆電球が切れると回路全体がつながらなくなり、もう1つも消える'];
    }
    return { category: 'electricCircuit4', question, answer, choices, steps };
  }

  // もののとけ方（小5）：とかしても重さは変わらない(質量保存)、とける量には
  // 限度がある(飽和)、水の温度や量を変えたときのとける量の変化、ろ過。
  function genDissolveWays5() {
    const pat = randInt(0, 9);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '食塩を水にとかす前と後で、食塩と水を合わせた全体の重さはどうなりますか。';
      answer = '変わらない';
      choices = shuffle(['変わらない', '軽くなる', '重くなる', 'とけた分だけ軽くなる']);
      steps = ['ものを水にとかしても、なくなったわけではなく水の中に広がっているだけなので、全体の重さは変わらない'];
    } else if (pat === 1) {
      question = '一定の量の水にとける食塩やミョウバンの量には限りがあります。それ以上とけなくなった状態の水よう液を何といいますか。';
      answer = '飽和水よう液';
      choices = shuffle(['飽和水よう液', '中性水よう液', 'うすい水よう液', '蒸留水']);
      steps = ['ものがそれ以上とけることができなくなった水よう液を飽和水よう液という'];
    } else if (pat === 2) {
      question = '水の温度を上げると、ミョウバンが水にとける量はどうなりますか。';
      answer = '増える';
      choices = shuffle(['増える', '減る', '変わらない', '0になる']);
      steps = ['ミョウバンは、水の温度が高くなるほど、とける量が大きく増える'];
    } else if (pat === 3) {
      question = '水の温度を上げても、食塩が水にとける量はミョウバンと比べてどうなりますか。';
      answer = 'あまり変わらない（増え方が小さい）';
      choices = shuffle([answer, 'ミョウバンよりも大きく増える', '減っていく', 'まったくとけなくなる']);
      steps = ['食塩は、水の温度を上げてもとける量はあまり増えない。これはミョウバンとの大きなちがいである'];
    } else if (pat === 4) {
      question = '水の量を2倍にすると、その水にとけるものの量はどうなりますか。';
      answer = '2倍になる';
      choices = shuffle(['2倍になる', '変わらない', '半分になる', '4倍になる']);
      steps = ['水の量を増やすと、とけるものの量もその分だけ増える(水の量に比例する)'];
    } else if (pat === 5) {
      question = 'とけ残った食塩を水よう液から取りのぞくには、どのような方法を使いますか。';
      answer = 'ろ過';
      choices = shuffle(['ろ過', '蒸発', '冷却', 'かくはん']);
      steps = ['とけきれずに残った固体を液体と分けるには、ろ紙とろうとを使ったろ過を行う'];
    } else if (pat === 6) {
      question = 'ろ過をするときに使う実験器具の組み合わせとして正しいものはどれですか。';
      answer = 'ろ紙・ろうと・ビーカー';
      choices = shuffle(['ろ紙・ろうと・ビーカー', '温度計・ガスバーナーだけ', 'ピンセットだけ', '虫めがねと定規']);
      steps = ['ろ過には、ろ紙・ろうと・ビーカー(受け皿)を使う'];
    } else if (pat === 7) {
      question = '食塩水を蒸発皿に入れて水を蒸発させ続けると、最後に何が残りますか。';
      answer = '食塩の固体（結晶）';
      choices = shuffle(['食塩の固体（結晶）', '何も残らない', '水だけが残る', '色のついた気体が残る']);
      steps = ['水よう液の水をすべて蒸発させると、とけていた固体(この場合は食塩)が結晶として残る'];
    } else {
      question = '色のついていない水よう液に光を当てたとき、とけている粒(つぶ)の見え方として正しいものはどれですか。';
      answer = '目に見えないくらい小さく、液全体に均一に広がっている';
      choices = shuffle([answer, '液の底にだけ粒が集まっている', '液の表面にだけ粒がうかんでいる', '粒が大きく、はっきり見える']);
      steps = ['水よう液にとけている粒は非常に小さく、目には見えず、液全体に均一に広がっている'];
    }
    return { category: 'dissolveWays5', question, answer, choices, steps };
  }

  // 燃焼のしくみ（小6）：ものが燃えるために必要な酸素、燃焼後にできる二酸化炭素、
  // 空気中の気体の割合の変化、酸素・ちっ素の性質。
  function genCombustion6() {
    const pat = randInt(0, 10);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = 'ろうそくなどのものが燃え続けるために、空気中の何という気体が必要ですか。';
      answer = '酸素';
      choices = shuffle(['酸素', 'ちっ素', '二酸化炭素', '水素']);
      steps = ['ものが燃え続けるには、空気中の酸素が必要である'];
    } else if (pat === 1) {
      question = 'ろうそくなどのものが燃えると、新しく何という気体ができますか。';
      answer = '二酸化炭素';
      choices = shuffle(['二酸化炭素', '酸素', 'ちっ素', '水素']);
      steps = ['ものが燃える(燃焼する)と、二酸化炭素と水ができる'];
    } else if (pat === 2) {
      question = '燃えたあとの気体の中に二酸化炭素ができたことを確かめるには、何を使いますか。';
      answer = '石灰水（白くにごる）';
      choices = shuffle(['石灰水（白くにごる）', 'BTB液（緑色になる）', 'リトマス紙（赤色になる）', '線香の火（激しく燃える）']);
      steps = ['気体に石灰水を入れて振り、白くにごれば二酸化炭素が含まれていることが確かめられる'];
    } else if (pat === 3) {
      question = '空気中の気体のうち、体積の割合が一番多いのは何ですか。';
      answer = 'ちっ素（約78％）';
      choices = shuffle(['ちっ素（約78％）', '酸素（約78％）', '二酸化炭素（約78％）', '水素（約78％）']);
      steps = ['空気の体積の約78％はちっ素、約21％は酸素、残りが二酸化炭素などである'];
    } else if (pat === 4) {
      question = 'ちっ素には、ものを燃やすはたらきがありますか。';
      answer = 'ない（燃焼に直接関係しない）';
      choices = shuffle([answer, 'ある（酸素より強い）', '酸素と同じくらいある', 'ちっ素だけで燃える']);
      steps = ['ちっ素には物を燃やすはたらきはなく、燃焼に直接関係しない気体である'];
    } else if (pat === 5) {
      question = 'ふたをした集気びんの中でろうそくを燃やし続けると、やがて火が消えます。この理由として正しいものはどれですか。';
      answer = 'びんの中の酸素が使われて少なくなるから';
      choices = shuffle([answer, 'びんの中のちっ素がなくなるから', 'びんの中の二酸化炭素がなくなるから', 'ろうそくのろうがなくなるから（酸素は関係ない）']);
      steps = ['集気びんの中は酸素の量が限られているため、燃焼で酸素が使われて少なくなると、やがて燃え続けられなくなり火が消える'];
    } else if (pat === 6) {
      question = 'ものが燃える前と後で、空気中の酸素の割合はどう変化しますか。';
      answer = '減る';
      choices = shuffle(['減る', '増える', '変わらない', '0になる']);
      steps = ['ものが燃えると酸素が使われるため、燃えた後の空気中の酸素の割合は減る'];
    } else if (pat === 7) {
      question = 'ものが燃える前と後で、空気中の二酸化炭素の割合はどう変化しますか。';
      answer = '増える';
      choices = shuffle(['増える', '減る', '変わらない', '0になる']);
      steps = ['ものが燃えると二酸化炭素ができるため、燃えた後の空気中の二酸化炭素の割合は増える'];
    } else if (pat === 8) {
      question = '酸素だけを集めた集気びんの中でろうそくを燃やすと、空気中で燃やすときと比べてどうなりますか。';
      answer = 'はげしく（明るく）燃える';
      choices = shuffle(['はげしく（明るく）燃える', 'すぐに火が消える', '同じように燃える', 'まったく燃えない']);
      steps = ['酸素の割合が高いほど、ものはより激しく燃える'];
    } else {
      question = '酸素そのものは、火をつけると燃えますか。';
      answer = '燃えない（ものを燃やすはたらきがあるだけ）';
      choices = shuffle([answer, 'よく燃える', '少しだけ燃える', 'ちっ素と混ざると燃える']);
      steps = ['酸素自身は燃える気体ではなく、他の物質が燃えるのを助けるはたらき(助燃性)を持つ気体である'];
    }
    return { category: 'combustion6', question, answer, choices, steps };
  }

  // 季節と生物（小4）。
  function genSeason4() {
    const pat = randInt(0, 7);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '春になり気温が上がってくると、こん虫や生き物の活動はどうなりますか。';
      answer = '活発になる';
      choices = shuffle(['活発になる', '活動しなくなる', '死んでしまう', '変わらない']);
      steps = ['春に気温が上がると、冬の間活動をひかえていたこん虫や生き物の活動が活発になる'];
    } else if (pat === 1) {
      question = '夏になると、生き物の成長や活動のようすはどうなりますか。';
      answer = '春よりもさらに活発になる（よく成長する）';
      choices = shuffle([answer, '活動しなくなる', '冬眠する', '姿を消してしまう']);
      steps = ['気温が高い夏は、生き物の活動や成長がもっとも盛んになる時期である'];
    } else if (pat === 2) {
      question = '秋になり気温が下がってくると、生き物の活動はどうなりますか。';
      answer = '少しずつおとろえていく（活動がにぶくなる）';
      choices = shuffle([answer, 'もっとも活発になる', '急に姿を消してしまう', '変わらない']);
      steps = ['秋は気温が下がるにつれて、生き物の活動がだんだんおとろえていく'];
    } else if (pat === 3) {
      question = '冬になると、多くのこん虫はどのようなすがたで冬をこしますか。';
      answer = '卵やさなぎなどのすがたで冬をこす';
      choices = shuffle([answer, '夏と同じように活発に飛び回る', 'すべて死んでしまい、卵も残さない', '色だけが変わって活動を続ける']);
      steps = ['多くのこん虫は、冬は卵やさなぎ、幼虫などのすがたで寒さをしのぎ、春になると活動を始める'];
    } else if (pat === 4) {
      question = '夏になると日本にやってきて、秋になると南の方へ渡っていく鳥は何ですか。';
      answer = 'ツバメ';
      choices = shuffle(['ツバメ', 'スズメ', 'カラス', 'ハト']);
      steps = ['ツバメは春に日本にやってきて夏に子育てをし、秋になると暖かい南の地方へ渡っていく渡り鳥である'];
    } else if (pat === 5) {
      question = 'サクラの花がさくのは、主にどの季節ですか。';
      answer = '春';
      choices = shuffle(['春', '夏', '秋', '冬']);
      steps = ['サクラの花は、気温が上がり始める春にさく'];
    } else if (pat === 6) {
      question = '1年を通して、こん虫や植物の成長・活動のようすが変化していく主な原因は何ですか。';
      answer = '気温の変化';
      choices = shuffle(['気温の変化', '風の強さ', '土の色', '人の活動']);
      steps = ['生き物の1年の活動や成長のようすは、季節による気温の変化と深く関係している'];
    } else {
      question = 'ヘチマなどの植物の種をまくのに適した季節はいつですか。';
      answer = '暖かくなってきた春（気温が十分に上がってから）';
      choices = shuffle([answer, '雪の降る真冬', '気温が下がり始めた秋の終わり', 'いつでもよく、季節は関係ない']);
      steps = ['ヘチマなどの種は、気温が十分に暖かくなった春にまくと発芽しやすい'];
    }
    return { category: 'season4', question, answer, choices, steps };
  }

  // 天気の様子（小4）。
  function genWeather4() {
    const pat = randInt(0, 7);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '1日の気温の変化が大きいのは、晴れの日とくもり・雨の日のどちらですか。';
      answer = '晴れの日';
      choices = shuffle(['晴れの日', 'くもり・雨の日', 'どちらも同じ', '季節による(天気には関係ない)']);
      steps = ['晴れの日は日光が地面を直接あたためるため、1日の気温の変化(差)が大きくなる'];
    } else if (pat === 1) {
      question = '気温を正しくはかるとき、温度計をどこに置きますか。';
      answer = '直射日光が当たらない、地面から1.2〜1.5mくらいの風通しのよい場所';
      choices = shuffle([answer, '直射日光がよく当たる地面の上', '風の当たらない室内のすみ', '地面にできるだけ近い場所']);
      steps = ['気温は、直射日光が当たらず風通しのよい、地上1.2〜1.5mくらいの高さではかる'];
    } else if (pat === 2) {
      question = '晴れの日に水たまりの水がだんだん減っていくのはなぜですか。';
      answer = '水が蒸発して水蒸気になるから';
      choices = shuffle(['水が蒸発して水蒸気になるから', '水が土の中で凍るから', '水が別の場所に流れていくだけだから', '風で水が固まるから']);
      steps = ['水は蒸発して目に見えない水蒸気となり、空気中に出ていくため、水たまりの水は少しずつ減っていく'];
    } else if (pat === 3) {
      question = '空気中の水蒸気が冷やされて、目に見える水滴になることを何といいますか。';
      answer = '結露';
      choices = shuffle(['結露', '蒸発', '沸騰', '凝固']);
      steps = ['空気中の水蒸気が冷たいものに触れて水滴に変わることを結露という(コップの表面の水滴など)'];
    } else if (pat === 4) {
      question = '天気を「晴れ」か「くもり」かで決めるとき、主に何を見て判断しますか。';
      answer = '空全体にしめる雲の量';
      choices = shuffle(['空全体にしめる雲の量', '気温の高さ', '風の強さ', '湿度の高さ']);
      steps = ['天気は、空全体に対して雲がどのくらいの割合をしめているか(雲量)で決められる'];
    } else if (pat === 5) {
      question = '温度計の目盛りを読むとき、目の高さはどのようにしますか。';
      answer = '液面と同じ高さにして真横から読む';
      choices = shuffle([answer, '温度計を見上げるようにして読む', '温度計を見下ろすようにして読む', 'どの角度から読んでもよい']);
      steps = ['温度計の目盛りは、液の先端と目の高さを合わせ、真横から読むと正確に読み取れる'];
    } else if (pat === 6) {
      question = '気温をはかるための、よろい戸のような箱を何といいますか。';
      answer = '百葉箱';
      choices = shuffle(['百葉箱', '観測箱', '気圧箱', '雨量計']);
      steps = ['百葉箱は、中の温度計に直射日光が当たらず風通しがよいように工夫された白い箱である'];
    } else {
      question = '空全体を雲がすべておおっているとき、天気は何ですか。';
      answer = 'くもり';
      choices = shuffle(['くもり', '快晴', '晴れ', '雨']);
      steps = ['雲の量が多く、空全体を雲がおおっているような状態は「くもり」と判断される'];
    }
    return { category: 'weather4', question, answer, choices, steps };
  }

  // 月と星（小4）。
  function genMoonStar4() {
    const pat = randInt(0, 6);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '月は、空のどちらの方角からのぼり、どちらの方角にしずみますか。';
      answer = '東からのぼり、西にしずむ';
      choices = shuffle(['東からのぼり、西にしずむ', '西からのぼり、東にしずむ', '北からのぼり、南にしずむ', '南からのぼり、北にしずむ']);
      steps = ['月は太陽や星と同じように、東からのぼり、南の空を通って西にしずむ'];
    } else if (pat === 1) {
      question = '半月(弦月)が動く向きは、満月が動く向きと同じですか、ちがいますか。';
      answer = '同じ（どちらも東から西へ動く）';
      choices = shuffle([answer, 'ちがう(半月は西から東へ動く)', '半月は動かない', '満月だけが動く']);
      steps = ['月は形にかかわらず、どれも東からのぼり西へしずむという同じ動き方をする'];
    } else if (pat === 2) {
      question = '星の明るさや色について、正しいものはどれですか。';
      answer = '星によって明るさや色にちがいがある';
      choices = shuffle([answer, 'すべての星は同じ明るさ、同じ色である', '星には色のちがいはない', '明るい星ほど色は同じになる']);
      steps = ['星は種類によって明るさや色にちがいがあり、白っぽい星や赤っぽい星などさまざまである'];
    } else if (pat === 3) {
      question = 'いくつかの星を結んで、動物や道具などの形に見立てたものを何といいますか。';
      answer = '星座';
      choices = shuffle(['星座', '星団', '星雲', '惑星']);
      steps = ['星の集まりを、その並び方から動物や道具などに見立てたものを星座という'];
    } else if (pat === 4) {
      question = '北極星を見つけるのに手がかりとして使われる星の並びは何ですか。';
      answer = '北斗七星やカシオペヤ座';
      choices = shuffle(['北斗七星やカシオペヤ座', 'オリオン座', 'さそり座', '南十字星']);
      steps = ['北斗七星やカシオペヤ座の星の並びを利用すると、ほぼ動かない北極星を見つけることができる'];
    } else if (pat === 5) {
      question = '星は1日の間に、どの方角からどの方角へ動いて見えますか。';
      answer = '東から西へ動いて見える';
      choices = shuffle(['東から西へ動いて見える', '西から東へ動いて見える', '南から北へ動いて見える', '動かずに止まって見える']);
      steps = ['星は月や太陽と同じように、東からのぼり西にしずむように動いて見える'];
    } else {
      question = '同じ日の夜、時間がたつと月の見える位置は変わりますが、月の形はどうなりますか。';
      answer = '短い時間ではほとんど変わらない';
      choices = shuffle(['短い時間ではほとんど変わらない', 'どんどん満ちていく', 'どんどん欠けていく', '色が変わる']);
      steps = ['月の形が変わるのは日がたつにつれてであり、同じ夜のうちの数時間ではほとんど変化しない'];
    }
    return { category: 'moonStar4', question, answer, choices, steps };
  }

  // 雨水のゆくえと地面の様子（小4）。
  function genRainSoil4() {
    const pat = randInt(0, 5);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '地面に降った雨水は、どのように流れていきますか。';
      answer = '高い場所から低い場所へ流れる';
      choices = shuffle(['高い場所から低い場所へ流れる', '低い場所から高い場所へ流れる', '流れずにその場に止まる', '方角に関係なく一定方向に流れる']);
      steps = ['水は高いところから低いところへ流れる性質があり、地面の傾きにそって流れていく'];
    } else if (pat === 1) {
      question = 'つぶが大きい(つぶつぶした)砂地と、つぶが細かい土では、水がしみこみやすいのはどちらですか。';
      answer = 'つぶが大きい砂地';
      choices = shuffle(['つぶが大きい砂地', 'つぶが細かい土', 'どちらも同じ', 'どちらもしみこまない']);
      steps = ['つぶが大きい砂地はすきまが多いため水がしみこみやすく、つぶが細かい土は水がしみこみにくい'];
    } else if (pat === 2) {
      question = '運動場のようなつぶの細かい土と、砂場のようなつぶの粗い場所で、雨の後に水たまりができやすいのはどちらですか。';
      answer = 'つぶの細かい土（運動場のような場所）';
      choices = shuffle(['つぶの細かい土（運動場のような場所）', 'つぶの粗い砂場', 'どちらもできない', '土の色によって決まる']);
      steps = ['つぶの細かい土は水がしみこみにくいため、雨がふった後に水たまりができやすい'];
    } else if (pat === 3) {
      question = '雨水は最終的にどのような場所に集まっていきますか。';
      answer = '地面の低い場所（くぼんだ場所）';
      choices = shuffle(['地面の低い場所（くぼんだ場所）', '地面の高い場所', '平らな場所だけ', '土の色が濃い場所だけ']);
      steps = ['雨水は高いところから低いところへ流れるため、最終的に地面の低い場所に集まっていく'];
    } else {
      question = '地面の傾き(かたむき)を調べるとき、水の流れを見る以外にどのような道具が使えますか。';
      answer = 'ビー玉やボールを転がして、転がる向きを見る';
      choices = shuffle([answer, '温度計で地面の温度をはかる', '虫めがねで土のつぶを見る', 'リトマス紙を地面に置く']);
      steps = ['ビー玉やボールを地面に置いて転がる方向を観察すると、地面の傾きを調べることができる'];
    }
    return { category: 'rainSoil4', question, answer, choices, steps };
  }

  // とじこめた空気や水（小4）。
  function genConfinedAirWater4() {
    const pat = randInt(0, 6);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '注射器などにとじこめた空気を押すと、空気の体積はどうなりますか。';
      answer = '小さくなる（縮む）';
      choices = shuffle(['小さくなる（縮む）', '大きくなる', '変わらない', '空気がなくなる']);
      steps = ['とじこめた空気を押すと、空気は押し縮められて体積が小さくなる'];
    } else if (pat === 1) {
      question = 'とじこめた空気を押す力を強くすると、空気が押し返す力はどうなりますか。';
      answer = '大きくなる';
      choices = shuffle(['大きくなる', '小さくなる', '変わらない', '0になる']);
      steps = ['空気を強く押して縮めるほど、空気が元にもどろうとして押し返す力は大きくなる'];
    } else if (pat === 2) {
      question = '注射器などにとじこめた水を押すと、水の体積はどうなりますか。';
      answer = 'ほとんど変わらない（縮まない）';
      choices = shuffle(['ほとんど変わらない（縮まない）', '空気と同じくらい小さくなる', '大きくなる', '水がなくなる']);
      steps = ['水は空気とちがって押してもほとんど縮まず、体積はほとんど変化しない'];
    } else if (pat === 3) {
      question = 'とじこめた空気ととじこめた水で、押したときに体積が変化しやすいのはどちらですか。';
      answer = '空気';
      choices = shuffle(['空気', '水', 'どちらも同じくらい変化する', 'どちらも変化しない']);
      steps = ['空気は押すと体積が小さくなるが、水は押してもほとんど体積が変わらない'];
    } else if (pat === 4) {
      question = '空気でっぽうの玉が勢いよく飛び出すのはなぜですか。';
      answer = '押し縮められた空気が、元にもどろうとする力で玉を押し出すから';
      choices = shuffle([answer, '玉自体が急に軽くなるから', '筒の中の水が玉を押すから', '玉が自然に温まって膨張するから']);
      steps = ['空気でっぽうでは、押し縮められた空気が元の体積にもどろうとする力によって、前の玉が勢いよく押し出される'];
    } else {
      question = 'とじこめた空気を強く押していくと、押し返す力はどうなっていきますか。';
      answer = 'だんだん大きくなっていく';
      choices = shuffle(['だんだん大きくなっていく', 'だんだん小さくなっていく', '一定のまま変わらない', '急に0になる']);
      steps = ['空気を押し縮めるほど、押し返す力(手ごたえ)はだんだん大きくなっていく'];
    }
    return { category: 'confinedAirWater4', question, answer, choices, steps };
  }

  // もののあたたまり方（小4）。
  function genHeatSpread4() {
    const pat = randInt(0, 6);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '金属の棒の一部を熱すると、熱はどのように伝わっていきますか。';
      answer = '熱した部分から順に、はなれた部分へと伝わっていく';
      choices = shuffle([answer, '棒全体が一瞬で同じ温度になる', '熱した部分から遠い方から先にあたたまる', '熱はまったく伝わらない']);
      steps = ['金属は、熱した部分から順にとなり合った部分へ熱が伝わっていく(伝導)という温まり方をする'];
    } else if (pat === 1) {
      question = '金属の棒を熱したとき、熱した点に近い部分と遠い部分では、どちらが早くあたたまりますか。';
      answer = '熱した点に近い部分';
      choices = shuffle(['熱した点に近い部分', '熱した点から遠い部分', '同時にあたたまる', '遠い部分だけあたたまる']);
      steps = ['金属では、熱している点に近い部分から順にあたたまっていく'];
    } else if (pat === 2) {
      question = '水を熱したとき、あたたまった水はどのように動きますか。';
      answer = '上の方に動き、全体がかき混ざるようにあたたまる';
      choices = shuffle([answer, 'そのまま下にとどまり続ける', '水は動かず、その場だけあたたまる', '横方向にだけ広がる']);
      steps = ['水はあたためられると軽くなって上に動き、全体がかき混ざるようにあたたまっていく(対流)'];
    } else if (pat === 3) {
      question = '空気の温まり方は、金属と水のどちらの温まり方に近いですか。';
      answer = '水（対流によってあたたまる）';
      choices = shuffle(['水（対流によってあたたまる）', '金属（伝導によってあたたまる）', 'どちらとも似ていない', '空気は温まらない']);
      steps = ['空気も水と同じように、あたたかい部分が上に動くことで全体があたたまる(対流)'];
    } else if (pat === 4) {
      question = 'なべで水をあたためるとき、火を下から当てるのはなぜですか。';
      answer = 'あたたまった水が上に動くことで、効率よく全体をあたためられるから';
      choices = shuffle([answer, '下から熱した方が水の量が増えるから', '上から熱すると水がこおってしまうから', '下から熱すると水が減らないから']);
      steps = ['水は対流によって、あたたかい部分が上に動いて全体に広がるため、下から熱すると効率よくあたたまる'];
    } else {
      question = '金属の温まり方(伝導)と、水や空気の温まり方(対流)の大きなちがいは何ですか。';
      answer = '金属は熱した部分から順に伝わるが、水や空気はあたたまった部分自体が動いて全体に広がる';
      choices = shuffle([answer, 'どちらも同じしくみであたたまる', '金属だけが温まり、水や空気は温まらない', '水や空気は熱した部分から遠い方から先にあたたまる']);
      steps = ['金属は物質そのものは動かずに熱が順に伝わる(伝導)が、水や空気はあたたまった部分自体が動くことで全体に熱が広がる(対流)'];
    }
    return { category: 'heatSpread4', question, answer, choices, steps };
  }

  // 水のすがた（小4）。
  function genWaterForms4() {
    const pat = randInt(0, 6);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '水を熱し続けると、およそ何度で沸騰しますか。';
      answer = '100度';
      choices = shuffle(['100度', '0度', '50度', '150度']);
      steps = ['水は熱し続けると、およそ100度で沸騰しはじめる'];
    } else if (pat === 1) {
      question = '水が沸騰している間、水の温度はどうなっていますか。';
      answer = '100度のまま変わらない';
      choices = shuffle(['100度のまま変わらない', 'どんどん上がり続ける', 'どんどん下がっていく', '0度まで下がる']);
      steps = ['水が沸騰している間は、熱し続けても温度は100度のまま変わらない'];
    } else if (pat === 2) {
      question = '水を冷やし続けると、およそ何度で氷になりますか。';
      answer = '0度';
      choices = shuffle(['0度', '100度', 'マイナス10度', '10度']);
      steps = ['水は冷やし続けると、およそ0度で氷になり始める'];
    } else if (pat === 3) {
      question = '水蒸気は、目で見ることができますか。';
      answer = '見えない（目に見えない気体である）';
      choices = shuffle(['見えない（目に見えない気体である）', '白い煙のように見える', '氷のように見える', '青く見える']);
      steps = ['水蒸気は目に見えない気体で、やかんの口近くで見える白い「湯気」は、水蒸気が冷やされてできた細かい水滴である'];
    } else if (pat === 4) {
      question = '氷が水に変わったり、水が氷に変わったりするような変化を何といいますか。';
      answer = '状態変化';
      choices = shuffle(['状態変化', '化学変化', '蒸発変化', '対流変化']);
      steps = ['氷⇔水⇔水蒸気のように、温度によって物質のすがた(固体・液体・気体)が変わることを状態変化という'];
    } else {
      question = '氷は水に比べて、体積はどうなりますか。';
      answer = '水のときより体積が大きくなる';
      choices = shuffle(['水のときより体積が大きくなる', '水のときより体積が小さくなる', '体積は変わらない', '重さが変わる']);
      steps = ['水はこおって氷になるとき、体積が少し大きくなる(これはほとんどの物質とは逆の性質である)'];
    }
    return { category: 'waterForms4', question, answer, choices, steps };
  }

  // 人の体のつくりと運動（小4）。
  function genBodyMovement4() {
    const pat = randInt(0, 5);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '骨と骨のつなぎ目で、体を曲げることができる部分を何といいますか。';
      answer = '関節';
      choices = shuffle(['関節', '筋肉', '腱', '神経']);
      steps = ['骨と骨のつなぎ目で曲げ伸ばしができる部分を関節という'];
    } else if (pat === 1) {
      question = '体を動かすとき、骨を引っぱって動かすはたらきをするものは何ですか。';
      answer = '筋肉';
      choices = shuffle(['筋肉', '関節', '皮ふ', '血管']);
      steps = ['筋肉が縮んだりゆるんだりすることで、骨が引っぱられて体が動く'];
    } else if (pat === 2) {
      question = 'うでを曲げるとき、うでの内側(力こぶができる側)の筋肉はどうなりますか。';
      answer = '縮む';
      choices = shuffle(['縮む', 'ゆるむ', '骨に変わる', '関節に変わる']);
      steps = ['うでを曲げるときは、内側の筋肉が縮み、外側の筋肉がゆるむ'];
    } else if (pat === 3) {
      question = 'うでを伸ばすとき、うでの外側の筋肉はどうなりますか。';
      answer = '縮む（内側の筋肉はゆるむ）';
      choices = shuffle(['縮む（内側の筋肉はゆるむ）', 'ゆるむ（内側の筋肉が縮む）', '両方とも縮む', '両方ともゆるむ']);
      steps = ['うでを伸ばすときは、外側の筋肉が縮み、内側の筋肉がゆるむ。筋肉は関節をはさんで対になってはたらく'];
    } else {
      question = '体を支えたり、脳や内臓を守ったりするはたらきをするものは何ですか。';
      answer = '骨';
      choices = shuffle(['骨', '筋肉', '皮ふ', '血液']);
      steps = ['骨は体を支えるだけでなく、頭の骨が脳を、ろっ骨が心臓や肺を守るなどのはたらきもしている'];
    }
    return { category: 'bodyMovement4', question, answer, choices, steps };
  }

  // 天気の変化（小5）。
  function genWeatherChange5() {
    const pat = randInt(0, 6);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '日本付近では、天気はおよそどちらの方角からどちらの方角へ変わっていくことが多いですか。';
      answer = '西から東へ変わっていくことが多い';
      choices = shuffle(['西から東へ変わっていくことが多い', '東から西へ変わっていくことが多い', '北から南へ変わっていくことが多い', '南から北へ変わっていくことが多い']);
      steps = ['日本付近の上空にはつねに西から東へ風(偏西風)が吹いているため、天気もおおよそ西から東へ変わっていくことが多い'];
    } else if (pat === 1) {
      question = '雲の量や動きを継続して観察することで、何を予想することができますか。';
      answer = 'これからの天気の変化';
      choices = shuffle(['これからの天気の変化', '地震の発生時期', '川の水質', '気温をはかる必要がなくなる']);
      steps = ['雲の量や動きを観察・記録することで、これからの天気の変化を予想することができる'];
    } else if (pat === 2) {
      question = '台風は、主にどのあたりで発生することが多いですか。';
      answer = '日本の南の海上（あたたかい海の上）';
      choices = shuffle(['日本の南の海上（あたたかい海の上）', '日本の北の海上（冷たい海の上）', '内陸の山の上', '日本の真上']);
      steps = ['台風は、あたたかい南の海上で発生し、その後北や東の方へ進んでいくことが多い'];
    } else if (pat === 3) {
      question = '台風が近づくと、風や雨の強さはどうなることが多いですか。';
      answer = '風や雨がとても強くなる';
      choices = shuffle(['風や雨がとても強くなる', '風も雨もほとんど無くなる', '気温が急に下がって雪になる', '天気には特に変化がない']);
      steps = ['台風が近づくと、強い風とはげしい雨をともなうことが多く、災害に注意が必要になる'];
    } else if (pat === 4) {
      question = '天気の変化を予想するために利用できる情報の組み合わせとして正しいものはどれですか。';
      answer = '気象衛星の雲画像や、各地の雨量・風の情報';
      choices = shuffle([answer, '地図の縮尺だけ', '過去の年号だけ', '生き物の種類だけ']);
      steps = ['気象衛星の雲の画像やアメダスなどの雨量・風の情報を組み合わせることで、天気の変化を予想することができる'];
    } else if (pat === 5) {
      question = '雲が多く、今にも雨が降りそうな空を観察したとき、この後の天気としてもっとも考えられるものはどれですか。';
      answer = 'まもなく雨が降り出す可能性が高い';
      choices = shuffle(['まもなく雨が降り出す可能性が高い', 'かならず快晴になる', '気温が急に上がる', '天気とは関係がない']);
      steps = ['雲の量やようすから、この先の天気の変化をある程度予想することができる'];
    } else {
      question = '日本付近の上空を1年中西から東へ吹いている風を何といいますか。';
      answer = '偏西風';
      choices = shuffle(['偏西風', '季節風', '台風', '貿易風']);
      steps = ['日本の上空には偏西風という西から東へ吹く風があり、これが天気を西から東へ変化させる大きな原因になっている'];
    }
    return { category: 'weatherChange5', question, answer, choices, steps };
  }

  // 植物の発芽・成長・結実（小5）。
  function genPlantGrowth5() {
    const pat = randInt(0, 7);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '種子が発芽するために必要な3つの条件は何ですか。';
      answer = '水、空気（酸素）、適当な温度';
      choices = shuffle([answer, '水、肥料、光', '肥料、光、適当な温度', '土、光、肥料']);
      steps = ['種子の発芽には、水・空気(酸素)・適当な温度の3つの条件が必要である'];
    } else if (pat === 1) {
      question = '種子が発芽するために、日光(光)は必ず必要ですか。';
      answer = '発芽には必要ない（成長には必要になる）';
      choices = shuffle([answer, '発芽にも必ず必要である', 'まったく関係がない', '光がないと発芽しない']);
      steps = ['発芽には水・空気・適当な温度があればよく、日光は発芽には必要ないが、その後成長するためには必要になる'];
    } else if (pat === 2) {
      question = '発芽するとき、種子の中にたくわえられている養分を主に何といいますか。';
      answer = '子葉（にたくわえられた養分）';
      choices = shuffle(['子葉（にたくわえられた養分）', '花粉', '根毛', 'やく']);
      steps = ['多くの種子は、発芽のための養分を子葉にたくわえている'];
    } else if (pat === 3) {
      question = 'ヨウ素液を使うと、種子の中にある何という養分を調べることができますか。';
      answer = 'でんぷん';
      choices = shuffle(['でんぷん', '水分', 'たんぱく質', 'ビタミン']);
      steps = ['ヨウ素液は、でんぷんに反応して青むらさき色に変化する性質を利用して、でんぷんの存在を調べることができる'];
    } else if (pat === 4) {
      question = '植物がじょうぶに成長するために必要なものの組み合わせとして正しいものはどれですか。';
      answer = '日光・肥料・適当な水（適当な温度）';
      choices = shuffle([answer, '暗い場所と肥料だけ', '水だけあればよい', '肥料は必要ない']);
      steps = ['植物がじょうぶに成長するためには、発芽の条件に加えて日光や肥料も必要になる'];
    } else if (pat === 5) {
      question = '花粉がめしべの先(柱頭)につくことを何といいますか。';
      answer = '受粉';
      choices = shuffle(['受粉', '受精', '発芽', '結実']);
      steps = ['花粉がめしべの柱頭につくことを受粉という'];
    } else if (pat === 6) {
      question = '花が受粉すると、めしべのもとの部分(子房)は成長して何になりますか。';
      answer = '実（果実）';
      choices = shuffle(['実（果実）', '花粉', '葉', '根']);
      steps = ['受粉した花のめしべのもと(子房)は成長して実になり、その中には種子ができる'];
    } else {
      question = '花粉を運ぶ役割をはたすものの例として正しいものはどれですか。';
      answer = '昆虫や風';
      choices = shuffle(['昆虫や風', '水だけ', '土の養分だけ', '光だけ']);
      steps = ['花粉は、昆虫(ハチなど)や風によって運ばれてめしべに届き、受粉が行われることが多い'];
    }
    return { category: 'plantGrowth5', question, answer, choices, steps };
  }

  // 動物のたんじょう（小5、メダカ・人）。
  function genAnimalBirth5() {
    const pat = randInt(0, 6);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = 'メダカのおすとめすを見分けるとき、主にどこのひれの形を見ますか。';
      answer = 'せびれと尻びれ（しりびれ）の形';
      choices = shuffle(['せびれと尻びれ（しりびれ）の形', '目の大きさ', '体の色', '尾びれの大きさだけ']);
      steps = ['メダカのおすとめすは、せびれの切れこみの有無や尻びれの形のちがいで見分けることができる'];
    } else if (pat === 1) {
      question = 'めすが産んだメダカの卵は、おすがいないと成長して子になりますか。';
      answer = 'ならない（おすの精子と結びついて受精する必要がある）';
      choices = shuffle([answer, 'おすがいなくても必ず子になる', '卵ではなく子が直接産まれる', 'めすだけで子になる卵と、おすが必要な卵の2種類がある']);
      steps = ['めすの卵とおすの精子が結びつく(受精する)ことで受精卵となり、成長して子メダカになる'];
    } else if (pat === 2) {
      question = '卵と精子が結びつくことを何といいますか。';
      answer = '受精';
      choices = shuffle(['受精', '受粉', '発芽', '孵化（ふか）']);
      steps = ['卵と精子が結びつくことを受精といい、受精した卵(受精卵)が成長して子になる'];
    } else if (pat === 3) {
      question = '人の子どもは、母親の体のどこで育ちますか。';
      answer = '子宮';
      choices = shuffle(['子宮', '胃', '心臓', '肺']);
      steps = ['人の子どもは、母親の体内にある子宮の中で育つ'];
    } else if (pat === 4) {
      question = '母親の体内で育つ子どもは、成長に必要な養分を主にどこから受け取っていますか。';
      answer = 'たいばん（へそのお）を通して母親から受け取る';
      choices = shuffle([answer, '自分で食べ物を食べて栄養をとる', '羊水を飲んで栄養をとる', '養分は必要としない']);
      steps = ['母親の体内の子どもは、たいばんとへそのおを通して母親の血液から養分をもらって成長する'];
    } else {
      question = '人はお母さんの体内で、だいたい何週(約何か月)ほど育ってから生まれますか。';
      answer = 'およそ38週（約10か月）';
      choices = shuffle(['およそ38週（約10か月）', 'およそ1週間', 'およそ3か月', 'およそ2年']);
      steps = ['人の子どもは、受精してからおよそ38週(約10か月)ほど母親の体内で育ってから生まれる'];
    }
    return { category: 'animalBirth5', question, answer, choices, steps };
  }

  // 流水のはたらきと土地の変化（小5）。
  function genFlowingWater5() {
    const pat = randInt(0, 7);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '流れる水が地面や岩を削るはたらきを何といいますか。';
      answer = '侵食';
      choices = shuffle(['侵食', '運搬', '堆積', '風化']);
      steps = ['流れる水が地面や岩などを削るはたらきを侵食という'];
    } else if (pat === 1) {
      question = '流れる水が、けずった土や石を運ぶはたらきを何といいますか。';
      answer = '運搬';
      choices = shuffle(['運搬', '侵食', '堆積', '蒸発']);
      steps = ['流れる水が土や石などを運ぶはたらきを運搬という'];
    } else if (pat === 2) {
      question = '流れる水が、運んできた土や石を積もらせるはたらきを何といいますか。';
      answer = '堆積';
      choices = shuffle(['堆積', '侵食', '運搬', '風化']);
      steps = ['流れがゆるやかになったところで、運ばれてきた土や石が積もることを堆積という'];
    } else if (pat === 3) {
      question = '川の流れが速いのは、川の上流と下流のどちらですか。';
      answer = '上流';
      choices = shuffle(['上流', '下流', 'どちらも同じ速さ', '流れの速さは決まっていない']);
      steps = ['川は上流ほど傾きが急で流れが速く、下流に近づくほど傾きがゆるやかになり流れがおそくなる'];
    } else if (pat === 4) {
      question = '川が曲がって流れているところでは、外側と内側のどちらの流れが速いですか。';
      answer = '外側';
      choices = shuffle(['外側', '内側', 'どちらも同じ', '流れは止まっている']);
      steps = ['川が曲がっているところでは、外側の方が流れが速く、侵食が強くはたらいて岸がけずられやすい'];
    } else if (pat === 5) {
      question = '川原(かわら)の石は、上流から下流に行くにつれて、大きさや形はどう変わっていきますか。';
      answer = 'だんだん小さく、丸みをおびた形になっていく';
      choices = shuffle([answer, 'だんだん大きく、角ばった形になっていく', '大きさや形は変わらない', '下流に行くほど数が増えるだけ']);
      steps = ['石は水に流されながらぶつかり合ったりけずられたりして、下流に行くほど小さく丸い形になっていく'];
    } else if (pat === 6) {
      question = '大雨が降ったとき、川の水の量や流れの勢いはどうなりますか。';
      answer = '増えて、流れの勢いも強くなる';
      choices = shuffle(['増えて、流れの勢いも強くなる', '減って、流れもおだやかになる', '変わらない', '川の水が完全になくなる']);
      steps = ['大雨が降ると川に流れこむ水の量が急に増え、流れが速く勢いも強くなるため、災害に注意が必要になる'];
    } else {
      question = '川の上流でよく見られる地形として正しいものはどれですか。';
      answer = 'V字型の深い谷';
      choices = shuffle(['V字型の深い谷', '広くて平らな川原', '三角州', '海に近い河口の砂浜']);
      steps = ['川の上流は流れが速く侵食が強くはたらくため、V字型の深い谷ができやすい'];
    }
    return { category: 'flowingWater5', question, answer, choices, steps };
  }

  // ふりこの運動（小5）。
  function genPendulum5() {
    const pat = randInt(0, 6);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = 'ふりこが1往復するのにかかる時間を何といいますか。';
      answer = '周期';
      choices = shuffle(['周期', '振幅', '振動数', '重心']);
      steps = ['ふりこが1往復するのにかかる時間を周期という'];
    } else if (pat === 1) {
      question = 'ふりこのおもりの重さを変えると、ふりこの周期はどうなりますか。';
      answer = '変わらない';
      choices = shuffle(['変わらない', '重いほど周期が長くなる', '重いほど周期が短くなる', '軽いほど周期が長くなる']);
      steps = ['ふりこの周期は、おもりの重さを変えてもほとんど変化しない'];
    } else if (pat === 2) {
      question = 'ふりこのふれはば(振れ幅)を変えると、ふりこの周期はどうなりますか。';
      answer = '変わらない（ほとんど変化しない）';
      choices = shuffle([answer, 'ふれはばが大きいほど周期が長くなる', 'ふれはばが大きいほど周期が短くなる', 'ふれはばが小さいと止まってしまう']);
      steps = ['ふりこの周期は、ふれはばを変えてもほとんど変化しない'];
    } else if (pat === 3) {
      question = 'ふりこの糸の長さを変えると、ふりこの周期はどうなりますか。';
      answer = '変わる（糸を長くすると周期は長くなる）';
      choices = shuffle([answer, '糸の長さを変えても変わらない', '糸を長くすると周期は短くなる', '糸の長さと周期は関係ない']);
      steps = ['ふりこの周期は糸の長さによって変わり、糸を長くするほど周期は長くなる'];
    } else if (pat === 4) {
      question = 'ふりこの糸を短くすると、周期はどうなりますか。';
      answer = '短くなる';
      choices = shuffle(['短くなる', '長くなる', '変わらない', 'ふりこが止まる']);
      steps = ['糸を短くすると、ふりこの周期は短くなる(1往復にかかる時間が短くなる)'];
    } else {
      question = 'ふりこの周期を決める条件として、もっとも関係が深いものはどれですか。';
      answer = '糸の長さ';
      choices = shuffle(['糸の長さ', 'おもりの重さ', 'おもりの色', 'ふれはばの大きさ']);
      steps = ['ふりこの周期は、おもりの重さやふれはばにはほとんど関係なく、糸の長さによって決まる'];
    }
    return { category: 'pendulum5', question, answer, choices, steps };
  }

  // 電流がつくる磁力・電磁石（小5）。
  function genElectromagnet5() {
    const pat = randInt(0, 6);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = 'エナメル線を同じ向きに何回も巻いたコイルに電流を流すと、どうなりますか。';
      answer = '磁力が生じ、電磁石になる';
      choices = shuffle(['磁力が生じ、電磁石になる', '電流が流れなくなる', '熱だけが発生し磁力は生じない', '光を発する']);
      steps = ['導線を巻いたコイルに電流を流すと、まわりに磁力が生じ、鉄しんを入れると電磁石になる'];
    } else if (pat === 1) {
      question = '電磁石の磁力を強くするには、コイルの巻き数をどうすればよいですか。';
      answer = '巻き数を増やす';
      choices = shuffle(['巻き数を増やす', '巻き数を減らす', '巻き数は関係ない', '巻く向きだけ変える']);
      steps = ['コイルの巻き数を増やすほど、電磁石の磁力は強くなる'];
    } else if (pat === 2) {
      question = '電磁石の磁力を強くするには、流す電流をどうすればよいですか。';
      answer = '電流を大きく（強く）する';
      choices = shuffle(['電流を大きく（強く）する', '電流を小さくする', '電流の向きだけ変える', '電流は関係ない']);
      steps = ['コイルに流す電流を大きくするほど、電磁石の磁力は強くなる'];
    } else if (pat === 3) {
      question = '電磁石と、鉄でできた永久磁石(棒磁石など)の大きなちがいは何ですか。';
      answer = '電磁石は電流を流しているときだけ磁力を持つ';
      choices = shuffle([answer, '電磁石はいつでも磁力を持ち続ける', '永久磁石は電流を流さないと磁力を持たない', '電磁石にはN極やS極がない']);
      steps = ['電磁石は電流を流している間だけ磁石のはたらきをし、電流を止めると磁力がなくなる'];
    } else if (pat === 4) {
      question = '電磁石に流れる電流の向きを反対にすると、N極とS極はどうなりますか。';
      answer = 'N極とS極が入れかわる';
      choices = shuffle(['N極とS極が入れかわる', '変わらない', 'N極だけになる', 'S極だけになる']);
      steps = ['電流の向きを逆にすると、電磁石のN極とS極が入れかわる'];
    } else {
      question = '電磁石を強くする方法として、正しい組み合わせはどれですか。';
      answer = 'コイルの巻き数を増やし、流す電流を大きくする';
      choices = shuffle([answer, 'コイルの巻き数を減らし、電流を小さくする', '導線の色を変える', 'コイルを巻く向きだけを変える']);
      steps = ['電磁石の磁力は、コイルの巻き数を増やすことと、流す電流を大きくすることの両方で強くすることができる'];
    }
    return { category: 'electromagnet5', question, answer, choices, steps };
  }

  // 人の体のつくりとはたらき（小6）。
  function genHumanBody6() {
    const pat = randInt(0, 7);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '食べ物を体に吸収されやすい養分に変えるはたらきを何といいますか。';
      answer = '消化';
      choices = shuffle(['消化', '呼吸', '排出', '循環']);
      steps = ['食べ物を体に吸収されやすい形に分解するはたらきを消化という'];
    } else if (pat === 1) {
      question = '口の中に出される消化液で、でんぷんの消化を始めるものは何ですか。';
      answer = 'だ液';
      choices = shuffle(['だ液', '胃液', 'たん汁', 'すい液']);
      steps = ['だ液には、でんぷんを分解するはたらきがあり、口の中で消化が始まる'];
    } else if (pat === 2) {
      question = '消化された養分は、主にどこで吸収されますか。';
      answer = '小腸';
      choices = shuffle(['小腸', '胃', '大腸', '肝臓']);
      steps = ['消化された養分は、主に小腸のかべから血液の中に吸収される'];
    } else if (pat === 3) {
      question = '呼吸によって、肺では空気中の何という気体を血液に取り入れていますか。';
      answer = '酸素';
      choices = shuffle(['酸素', '二酸化炭素', 'ちっ素', '水素']);
      steps = ['呼吸では、肺で空気中の酸素を血液の中に取り入れ、いらなくなった二酸化炭素を体の外に出す'];
    } else if (pat === 4) {
      question = '血液を全身に送り出すポンプのようなはたらきをする臓器は何ですか。';
      answer = '心臓';
      choices = shuffle(['心臓', '肺', '胃', 'かん臓']);
      steps = ['心臓は縮んだりゆるんだりすることで、血液を全身に送り出すポンプのはたらきをしている'];
    } else if (pat === 5) {
      question = '血液が心臓から送り出されて全身をめぐり、また心臓にもどってくることを何といいますか。';
      answer = '血液循環';
      choices = shuffle(['血液循環', '消化', '光合成', '蒸散']);
      steps = ['血液が心臓を中心にして体じゅうをめぐることを血液循環という'];
    } else if (pat === 6) {
      question = '血液の中の不要なものをこしとって、尿として体の外に出すはたらきをする臓器は何ですか。';
      answer = 'じん臓（腎臓）';
      choices = shuffle(['じん臓（腎臓）', '肝臓', '肺', '胃']);
      steps = ['じん臓(腎臓)は血液中の不要な物質をこしとり、尿として体の外に出すはたらきをしている'];
    } else {
      question = '血液の中で、酸素を運ぶはたらきをしている主な成分は何ですか。';
      answer = '赤血球';
      choices = shuffle(['赤血球', '白血球', '血小板', '血しょう']);
      steps = ['血液中の赤血球には酸素を運ぶはたらきがある'];
    }
    return { category: 'humanBody6', question, answer, choices, steps };
  }

  // 植物のつくりとはたらき（小6）。
  function genPlantFunction6() {
    const pat = randInt(0, 6);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '植物が日光を受けて、でんぷんなどの養分をつくるはたらきを何といいますか。';
      answer = '光合成';
      choices = shuffle(['光合成', '蒸散', '呼吸', '消化']);
      steps = ['植物が日光を受けて、水と二酸化炭素からでんぷんなどの養分をつくるはたらきを光合成という'];
    } else if (pat === 1) {
      question = '光合成では、植物は何という気体を取り入れ、何という気体を出しますか。';
      answer = '二酸化炭素を取り入れ、酸素を出す';
      choices = shuffle(['二酸化炭素を取り入れ、酸素を出す', '酸素を取り入れ、二酸化炭素を出す', 'ちっ素を取り入れ、酸素を出す', '酸素を取り入れ、水素を出す']);
      steps = ['光合成では、二酸化炭素と水を材料にして養分をつくり、酸素を出す'];
    } else if (pat === 2) {
      question = '根から吸い上げた水が、植物の体の中を通っていく管を何といいますか。';
      answer = '道管';
      choices = shuffle(['道管', '師管', '気孔', '柱頭']);
      steps = ['根から吸い上げられた水は、道管という管を通って植物の体全体に運ばれる'];
    } else if (pat === 3) {
      question = '葉でつくられた養分が、植物の体の中を通っていく管を何といいますか。';
      answer = '師管';
      choices = shuffle(['師管', '道管', '気孔', '子房']);
      steps = ['葉でつくられた養分は、師管という管を通って植物の体全体に運ばれる'];
    } else if (pat === 4) {
      question = '植物の体の中の水が、水蒸気となって外に出ていくことを何といいますか。';
      answer = '蒸散';
      choices = shuffle(['蒸散', '光合成', '呼吸', '結露']);
      steps = ['植物の体内の水が水蒸気となって空気中に出ていくことを蒸散という'];
    } else if (pat === 5) {
      question = '蒸散は、主に葉のどこで行われますか。';
      answer = '気孔';
      choices = shuffle(['気孔', '道管', '師管', '柱頭']);
      steps = ['蒸散は、主に葉の裏側などに多くある気孔という小さな穴を通して行われる'];
    } else {
      question = '植物も、人と同じように呼吸をして酸素を取り入れ、二酸化炭素を出していますか。';
      answer = 'している（1日中呼吸をしている）';
      choices = shuffle([answer, 'まったくしていない', '光合成をしているときだけ呼吸もする', '夜だけ光合成をする']);
      steps = ['植物は光合成だけでなく、人と同じように1日中呼吸を行い、酸素を取り入れ二酸化炭素を出している'];
    }
    return { category: 'plantFunction6', question, answer, choices, steps };
  }

  // 生物どうしのつながり（小6）。
  function genFoodChain6() {
    const pat = randInt(0, 5);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '生物どうしの「食べる・食べられる」というひとつながりの関係を何といいますか。';
      answer = '食物連鎖';
      choices = shuffle(['食物連鎖', '光合成連鎖', '生態循環', '消化連鎖']);
      steps = ['生物どうしの食べる・食べられるという関係のつながりを食物連鎖という'];
    } else if (pat === 1) {
      question = '食物連鎖の出発点になっている、自分で養分をつくることができる生物は何ですか。';
      answer = '植物';
      choices = shuffle(['植物', '肉食動物', '菌類だけ', '水だけ']);
      steps = ['植物は光合成によって自分で養分をつくることができ、食物連鎖の出発点(生産者)となっている'];
    } else if (pat === 2) {
      question = '池や川の水の中にいる、目に見えないくらい小さな生物をまとめて何といいますか。';
      answer = 'プランクトン';
      choices = shuffle(['プランクトン', 'こん虫', '細菌だけ', '貝類だけ']);
      steps = ['水の中の小さな生物をまとめてプランクトンといい、多くの水中生物の食べ物になっている'];
    } else if (pat === 3) {
      question = '空気中の酸素と二酸化炭素の量が大きく変わらずに保たれているのは、主にどのはたらきによりますか。';
      answer = '植物の光合成と、動植物の呼吸のつり合い';
      choices = shuffle([answer, '海水の量だけ', '風の強さだけ', '気温の変化だけ']);
      steps = ['植物の光合成による酸素の放出と、生物の呼吸による酸素の消費・二酸化炭素の放出がつり合うことで、空気の成分がおおむね保たれている'];
    } else {
      question = '「草→バッタ→カエル→ヘビ」という関係のように、生物のつながりを表す言葉は何ですか。';
      answer = '食物連鎖';
      choices = shuffle(['食物連鎖', '生態系のバランス', '光合成のつながり', '呼吸のつながり']);
      steps = ['「食べる・食べられる」の関係が鎖のようにつながっている様子を食物連鎖という'];
    }
    return { category: 'foodChain6', question, answer, choices, steps };
  }

  // 土地のつくりと変化（小6）。
  function genLandChange6() {
    const pat = randInt(0, 6);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '長い年月をかけて、れき・砂・どろなどが層になって重なったものを何といいますか。';
      answer = '地層';
      choices = shuffle(['地層', 'たい積岩', '火山灰', '断層']);
      steps = ['れき・砂・どろなどが層になって積み重なったものを地層という'];
    } else if (pat === 1) {
      question = '大昔の生物の体や、生活のあとが地層の中に残ったものを何といいますか。';
      answer = '化石';
      choices = shuffle(['化石', '鉱物', '結晶', '溶岩']);
      steps = ['大昔の生物の体や足あとなどが地層の中に残ったものを化石という'];
    } else if (pat === 2) {
      question = 'れき・砂・どろなどが押し固められてできた岩石をまとめて何といいますか。';
      answer = 'たい積岩';
      choices = shuffle(['たい積岩', '火成岩', '変成岩', '鉱物']);
      steps = ['れき・砂・どろなどが長い年月をかけて押し固められてできた岩石をたい積岩という'];
    } else if (pat === 3) {
      question = '火山がふん火したときに空中に飛び出す、細かい岩石のつぶを何といいますか。';
      answer = '火山灰';
      choices = shuffle(['火山灰', '溶岩', '軽石', 'マグマ']);
      steps = ['火山がふん火すると、細かい岩石のつぶである火山灰がふき出され、遠くまで積もることがある'];
    } else if (pat === 4) {
      question = '地震が起こると、土地にどのような変化が起こることがありますか。';
      answer = '土地が盛り上がったり(隆起)、しずんだり(沈降)、ずれ(断層)ができたりする';
      choices = shuffle([answer, '土地の様子はまったく変化しない', '海水がすべて消える', '地層がすべて消える']);
      steps = ['大きな地震が起こると、土地が盛り上がったりしずんだりすることや、地層がずれて断層ができることがある'];
    } else if (pat === 5) {
      question = '地層をつくっている、れき・砂・どろのつぶの大きさのちがいは、主に何によって分けられますか。';
      answer = 'つぶの大きさ（れきが最も大きく、どろが最も細かい）';
      choices = shuffle([answer, 'つぶの色だけ', 'つぶのにおいだけ', 'つぶの味だけ']);
      steps = ['れき・砂・どろは、つぶの大きさによって分けられ、れきが最も大きく、どろが最も細かいつぶである'];
    } else {
      question = '地層の中に見られるしま模様は、主に何のちがいによってできますか。';
      answer = 'つぶの大きさや色のちがい';
      choices = shuffle(['つぶの大きさや色のちがい', '気温のちがいだけ', '光の当たり方だけ', '風の強さだけ']);
      steps = ['地層のしま模様は、積もったつぶの大きさや色のちがいによって生まれる'];
    }
    return { category: 'landChange6', question, answer, choices, steps };
  }

  // てこのはたらき（小6）。
  function genLever6() {
    const pat = randInt(0, 7);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = 'てこで、棒を支えている動かない点を何といいますか。';
      answer = '支点';
      choices = shuffle(['支点', '力点', '作用点', '重心']);
      steps = ['てこを支えている、動かない点を支点という'];
    } else if (pat === 1) {
      question = 'てこで、力を加える点を何といいますか。';
      answer = '力点';
      choices = shuffle(['力点', '支点', '作用点', '重心']);
      steps = ['てこに力を加える点を力点という'];
    } else if (pat === 2) {
      question = 'てこで、力がはたらいて物を動かす点を何といいますか。';
      answer = '作用点';
      choices = shuffle(['作用点', '支点', '力点', '重心']);
      steps = ['てこの力がはたらいて実際に物を動かす点を作用点という'];
    } else if (pat === 3) {
      question = '支点から力点までの距離を長くすると、同じ物を持ち上げるのに必要な力はどうなりますか。';
      answer = '小さい力ですむ（楽になる）';
      choices = shuffle(['小さい力ですむ（楽になる）', 'より大きい力が必要になる', '力の大きさは変わらない', '持ち上げられなくなる']);
      steps = ['支点から力点までの距離を長くするほど、小さな力で物を持ち上げることができる'];
    } else if (pat === 4) {
      question = '支点から作用点までの距離を短くすると、同じ力を加えたときの手ごたえはどうなりますか。';
      answer = '大きな力ではたらく（重い物でも動かしやすくなる）';
      choices = shuffle([answer, '力がまったくはたらかなくなる', '手ごたえは変わらない', 'てこが動かなくなる']);
      steps = ['支点から作用点までの距離を短くすると、同じ力点の力でも作用点でより大きな力がはたらく'];
    } else if (pat === 5) {
      question = 'てこがつり合っているとき、成り立っている関係はどれですか。';
      answer = '支点の左右で「おもりの重さ×支点からの距離」が等しくなっている';
      choices = shuffle([answer, '支点の左右で「おもりの重さ」だけが等しくなっている', '支点からの距離だけが左右で等しくなっている', 'おもりの色が左右で同じになっている']);
      steps = ['てこがつり合うのは、支点の両側で「おもりの重さ×支点からの距離」が等しいときである'];
    } else if (pat === 6) {
      question = 'くぎぬきやせんぬきのように、小さな力を大きな力に変えて使う道具に共通するしくみは何ですか。';
      answer = 'てこのしくみ（支点・力点・作用点の関係）';
      choices = shuffle(['てこのしくみ（支点・力点・作用点の関係）', '電磁石のしくみ', '光合成のしくみ', '浮力のしくみ']);
      steps = ['くぎぬきやせんぬきなどの道具は、てこのしくみを利用して小さな力を大きな力に変えている'];
    } else {
      question = 'はさみやピンセットのうち、支点が力点と作用点の間にあるのはどちらですか。';
      answer = 'はさみ';
      choices = shuffle(['はさみ', 'ピンセット', 'どちらも支点は間にない', 'どちらも作用点が間にある']);
      steps = ['はさみは支点(かなめの部分)が力点と作用点の間にあるてこの道具の一例である'];
    }
    return { category: 'lever6', question, answer, choices, steps };
  }

  // 電気の利用（小6）。
  function genElectricityUse6() {
    const pat = randInt(0, 6);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '手回し発電機を使うと、何をつくることができますか。';
      answer = '電気（電流）';
      choices = shuffle(['電気（電流）', '磁石', 'でんぷん', '二酸化炭素']);
      steps = ['手回し発電機のハンドルを回すと、電気(電流)をつくり出すことができる'];
    } else if (pat === 1) {
      question = 'コンデンサーには、どのようなはたらきがありますか。';
      answer = '電気をたくわえるはたらき';
      choices = shuffle(['電気をたくわえるはたらき', '電気を光にだけ変えるはたらき', '磁力をつくるはたらき', '養分をつくるはたらき']);
      steps = ['コンデンサーは、電気をたくわえておくことができる部品である'];
    } else if (pat === 2) {
      question = '電気は、光・音・熱・運動など、さまざまなものに変えて利用することができますか。';
      answer = 'できる（電気はいろいろなはたらきに変えて利用できる）';
      choices = shuffle([answer, '光にしか変えられない', '熱にしか変えられない', '電気は他のものに変えられない']);
      steps = ['電気は、豆電球(光)、スピーカー(音)、電熱線(熱)、モーター(運動)のように、さまざまなはたらきに変えて利用されている'];
    } else if (pat === 3) {
      question = '発光ダイオード(LED)は、豆電球と比べて電気の消費量(使う電気の量)はどうですか。';
      answer = '少ない（同じ明るさでも消費電力が少ない）';
      choices = shuffle([answer, '豆電球よりずっと多い', '豆電球とまったく同じ', '電気を使わずに光る']);
      steps = ['発光ダイオード(LED)は、豆電球に比べて少ない電気で明るく光らせることができる'];
    } else if (pat === 4) {
      question = '電気を光に変える器具の例として正しいものはどれですか。';
      answer = '豆電球や発光ダイオード（LED）';
      choices = shuffle(['豆電球や発光ダイオード（LED）', 'モーターだけ', 'ブザーだけ', '電熱線だけ']);
      steps = ['豆電球や発光ダイオードは、電気を光に変える器具の代表的な例である'];
    } else if (pat === 5) {
      question = '電気を音に変える器具の例として正しいものはどれですか。';
      answer = 'ブザーやスピーカー';
      choices = shuffle(['ブザーやスピーカー', '豆電球', 'モーターだけ', '電熱線だけ']);
      steps = ['ブザーやスピーカーは、電気を音に変える器具の例である'];
    } else {
      question = '電気を熱に変える器具の例として正しいものはどれですか。';
      answer = '電熱線を使ったヒーターやドライヤー';
      choices = shuffle(['電熱線を使ったヒーターやドライヤー', '豆電球だけ', 'ブザーだけ', '発光ダイオードだけ']);
      steps = ['電熱線を利用したヒーターやドライヤーなどは、電気を熱に変えて利用している道具である'];
    }
    return { category: 'electricityUse6', question, answer, choices, steps };
  }

  // 水溶液の性質（小6）。
  function genAqueousSolution6() {
    const pat = randInt(0, 7);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '青色リトマス紙を赤色に変える水よう液は、何性ですか。';
      answer = '酸性';
      choices = shuffle(['酸性', 'アルカリ性', '中性', 'どの性質でもない']);
      steps = ['青色リトマス紙を赤色に変える水よう液は酸性である'];
    } else if (pat === 1) {
      question = '赤色リトマス紙を青色に変える水よう液は、何性ですか。';
      answer = 'アルカリ性';
      choices = shuffle(['アルカリ性', '酸性', '中性', 'どの性質でもない']);
      steps = ['赤色リトマス紙を青色に変える水よう液はアルカリ性である'];
    } else if (pat === 2) {
      question = '青色リトマス紙も赤色リトマス紙も色を変えない水よう液は、何性ですか。';
      answer = '中性';
      choices = shuffle(['中性', '酸性', 'アルカリ性', '不明']);
      steps = ['どちらのリトマス紙の色も変えない水よう液は中性である'];
    } else if (pat === 3) {
      question = '炭酸水には、どのような気体がとけていますか。';
      answer = '二酸化炭素';
      choices = shuffle(['二酸化炭素', '酸素', 'ちっ素', 'アンモニア']);
      steps = ['炭酸水は、二酸化炭素が水にとけた水よう液である'];
    } else if (pat === 4) {
      question = '塩酸(うすい塩酸)には、どのような気体がとけていますか。';
      answer = '塩化水素';
      choices = shuffle(['塩化水素', '二酸化炭素', '酸素', 'ちっ素']);
      steps = ['塩酸は、塩化水素という気体が水にとけた水よう液である'];
    } else if (pat === 5) {
      question = 'うすい塩酸に鉄やアルミニウムを入れると、どうなりますか。';
      answer = '金属がとけて、気体（水素）が発生する';
      choices = shuffle([answer, '金属はまったく変化しない', '金属が固くなるだけ', '塩酸の色が消えるだけ']);
      steps = ['うすい塩酸に鉄やアルミニウムなどの金属を入れると、金属がとけて水素が発生する'];
    } else if (pat === 6) {
      question = 'アンモニア水は何性の水よう液ですか。';
      answer = 'アルカリ性';
      choices = shuffle(['アルカリ性', '酸性', '中性', 'どちらでもない']);
      steps = ['アンモニア(気体)が水にとけたアンモニア水はアルカリ性を示す'];
    } else {
      question = '気体がとけている水よう液の組み合わせとして正しいものはどれですか。';
      answer = '炭酸水（二酸化炭素）と塩酸（塩化水素）';
      choices = shuffle(['炭酸水（二酸化炭素）と塩酸（塩化水素）', '食塩水と砂糖水', '石灰水と食塩水', 'すべての水よう液には気体はとけていない']);
      steps = ['炭酸水には二酸化炭素、塩酸には塩化水素というように、気体がとけている水よう液もある'];
    }
    return { category: 'aqueousSolution6', question, answer, choices, steps };
  }

  // 月と太陽（小6）。
  function genMoonSun6() {
    const pat = randInt(0, 5);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '月が光って見えるのはなぜですか。';
      answer = '太陽の光を反射しているから';
      choices = shuffle(['太陽の光を反射しているから', '月自身が光を出しているから', '星の光が集まっているから', '地球の光を反射しているから']);
      steps = ['月は自分では光を出しておらず、太陽の光を反射することで光って見えている'];
    } else if (pat === 1) {
      question = '月の形が日によって満ちたり欠けたりして見えるのはなぜですか。';
      answer = '太陽・地球・月の位置関係が変化するから';
      choices = shuffle(['太陽・地球・月の位置関係が変化するから', '月の形そのものが変化しているから', '月が近づいたり遠ざかったりするから', '雲によって隠れる部分が変わるから']);
      steps = ['太陽・地球・月の位置関係が日々変わることで、太陽の光が当たって見える部分(月の形)が変化して見える'];
    } else if (pat === 2) {
      question = '太陽と月のうち、自ら光を出しているのはどちらですか。';
      answer = '太陽';
      choices = shuffle(['太陽', '月', 'どちらも自ら光を出す', 'どちらも自ら光を出さない']);
      steps = ['太陽は自ら光を出す天体(恒星)だが、月は自ら光を出さず、太陽の光を反射しているだけである'];
    } else if (pat === 3) {
      question = '満月の後、月の形はどのように変化していきますか。';
      answer = 'だんだん欠けていく';
      choices = shuffle(['だんだん欠けていく', 'だんだん満ちていく', '急に新月になる', '形は変化しない']);
      steps = ['満月を過ぎると、月は少しずつ欠けていき、新月に近づいていく'];
    } else {
      question = '月と太陽で、地球からの見かけの大きさがほぼ同じに見えることがあるのはなぜですか。';
      answer = '月は太陽よりずっと小さいが、地球からの距離もずっと近いから';
      choices = shuffle([answer, '月と太陽は実際の大きさがほぼ同じだから', '月の方が太陽より大きいから', '見かけの大きさは全く同じにはならない']);
      steps = ['太陽は月よりはるかに大きいが、地球からの距離も月よりはるかに遠いため、見かけの大きさがほぼ同じくらいに見える'];
    }
    return { category: 'moonSun6', question, answer, choices, steps };
  }

  // 遺伝の規則性と遺伝子（中3）：対立形質・純系・分離の法則・顕性形質と潜性形質・
  // メンデルの交配実験の遺伝子の組み合わせと形質の比・DNA・遺伝子組換え・品種改良。
  function genGenetics3() {
    const pat = randInt(0, 13);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '同時に現れることのない、1つの形質についての2つの異なる形質(例：丸形としわ形)を何といいますか。';
      answer = '対立形質';
      choices = shuffle(['対立形質', '潜性形質', '遺伝子形質', '相同形質']);
      steps = ['丸形としわ形のように、同時には現れない1つの形質についての2つの異なる形質を対立形質という'];
    } else if (pat === 1) {
      question = '代を重ねて自家受粉させても、親と同じ形質だけが子に現れる個体を何といいますか。';
      answer = '純系';
      choices = shuffle(['純系', '雑種', '対立形質', '中間形質']);
      steps = ['代を重ねて自家受粉させても、親と同じ形質しか現れない個体を純系という'];
    } else if (pat === 2) {
      question = '同じ個体(または同じ純系)の花粉が、めしべについて受粉することを何といいますか。';
      answer = '自家受粉';
      choices = shuffle(['自家受粉', '他家受粉', '自家受精', '人工受粉']);
      steps = ['同じ個体(同じ純系)の花粉がめしべにつくことを自家受粉という'];
    } else if (pat === 3) {
      question = '生殖細胞がつくられる減数分裂のとき、対になっている遺伝子が分かれてそれぞれ別の生殖細胞に入ることを何といいますか。';
      answer = '分離の法則';
      choices = shuffle(['分離の法則', '独立の法則', '優劣の法則', '純系の法則']);
      steps = ['減数分裂の際、対になっている遺伝子が分離してそれぞれ別々の生殖細胞に入ることを分離の法則という'];
    } else if (pat === 4) {
      question = '対立形質をもつ純系どうしを交配したとき、子(雑種第一代)に現れる形質を何といいますか。';
      answer = '顕性形質';
      choices = shuffle(['顕性形質', '潜性形質', '中間形質', '対立形質']);
      steps = ['対立形質の純系どうしを交配したとき、子に現れる形質を顕性形質(以前は優性形質と呼ばれた)という'];
    } else if (pat === 5) {
      question = '対立形質をもつ純系どうしを交配したとき、子に現れない形質を何といいますか。';
      answer = '潜性形質';
      choices = shuffle(['潜性形質', '顕性形質', '中間形質', '純系形質']);
      steps = ['子に現れない方の形質を潜性形質(以前は劣性形質と呼ばれた)という'];
    } else if (pat === 6) {
      question = '丸形の遺伝子をAとし、丸形の純系(AA)としわ形の純系(aa)を交配してできた子の遺伝子の組み合わせは何ですか。';
      answer = 'Aa（すべてAa）';
      choices = shuffle(['Aa（すべてAa）', 'AA（すべてAA）', 'aa（すべてaa）', 'AAとaaが半分ずつ']);
      steps = ['AAの生殖細胞はすべてA、aaの生殖細胞はすべてaなので、子の遺伝子の組み合わせはすべてAaになる'];
    } else if (pat === 7) {
      question = 'AAとaaの純系を交配してできた子(Aa)の形質は、丸形(A)としわ形(a)のどちらになりますか。';
      answer = '丸形（顕性形質が現れる）';
      choices = shuffle(['丸形（顕性形質が現れる）', 'しわ形（潜性形質が現れる）', '丸形としわ形の中間の形', '半分が丸形、半分がしわ形']);
      steps = ['Aaは顕性形質の遺伝子Aをもつため、顕性形質である丸形が現れる'];
    } else if (pat === 8) {
      question = '子(Aa)を自家受粉させてできる孫の遺伝子の組み合わせの比(AA：Aa：aa)はどうなりますか。';
      answer = '1：2：1';
      choices = shuffle(['1：2：1', '1：1：1', '2：1：1', '1：3：1']);
      steps = ['Aaの生殖細胞はAとaが1：1ずつでき、これらを組み合わせると孫の遺伝子の比はAA：Aa：aa＝1：2：1になる'];
    } else if (pat === 9) {
      question = '子(Aa)を自家受粉させてできる孫のうち、丸形(顕性形質)としわ形(潜性形質)の個体数の比はどうなりますか。';
      answer = '3：1';
      choices = shuffle(['3：1', '1：1', '2：1', '1：3']);
      steps = ['孫の遺伝子の比はAA：Aa：aa＝1：2：1で、AAとAaはどちらも丸形になるため、丸形：しわ形＝(1+2)：1＝3：1になる'];
    } else if (pat === 10) {
      question = 'Aa（丸形）どうしを交配してできた種子が800個できました。このうち、しわ形になると考えられるのは理論上何個ですか。';
      answer = 200;
      choices = buildChoices(200, [150, 300, 400]);
      steps = ['丸形：しわ形＝3：1なので、しわ形の個数 = 800 × 1/4 = 200個'];
      return { category: 'genetics3', question, answer, choices, steps };
    } else if (pat === 11) {
      question = '遺伝子の本体である物質を何といいますか(アルファベット3文字)。';
      answer = 'DNA';
      choices = shuffle(['DNA', 'RNA', 'ATP', 'DNP']);
      steps = ['遺伝子の本体はDNA(デオキシリボ核酸)という物質である'];
    } else if (pat === 12) {
      question = 'ある生物から取り出した遺伝子を、別の生物のDNAに組みこんで、新しい形質をもたせる技術を何といいますか。';
      answer = '遺伝子組換え';
      choices = shuffle(['遺伝子組換え', '細胞分裂', '自家受粉', '分離の法則']);
      steps = ['ある生物の遺伝子を別の生物のDNAに組みこみ、新しい形質を発現させる技術を遺伝子組換えという'];
    } else {
      question = '遺伝子組換えなどの技術を農作物の品種改良に応用すると、どのようなことが期待できますか。';
      answer = '収穫量が多い、乾燥や病気に強いなど、有用な形質をもつ新しい品種を短期間でつくれる';
      choices = shuffle([answer, '品種改良の効果はまったく期待できない', '必ず収穫量が減ってしまう', '同じ形質の個体しかつくれなくなる']);
      steps = ['遺伝子組換えなどの技術により、有用な形質をもつ新しい品種を、従来の交配をくり返す方法より短期間でつくり出すことができる'];
    }
    return { category: 'genetics3', question, answer, choices, steps };
  }

  // 力の作用・水中ではたらく力（中3）：慣性の法則、作用・反作用の法則(つり合う
  // 2力との違い)、浮力・水圧の性質と計算。
  function genForceAction3() {
    const pat = randInt(0, 15);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '他から力がはたらかない、または力がはたらいていても合力が0である場合、静止している物体はどうなりますか。';
      answer = '静止し続ける';
      choices = shuffle(['静止し続ける', 'ひとりでに動き出す', '必ず倒れる', '重さが変化する']);
      steps = ['合力が0のとき、静止している物体は静止の状態を続ける(慣性の法則)'];
    } else if (pat === 1) {
      question = '他から力がはたらかない、または合力が0である場合、運動している物体はどうなりますか。';
      answer = 'そのままの速さで等速直線運動を続ける';
      choices = shuffle(['そのままの速さで等速直線運動を続ける', 'だんだん速くなっていく', 'だんだん遅くなり、やがて止まる', '向きだけが変わり続ける']);
      steps = ['合力が0のとき、運動している物体はそのままの速さで一直線上を進む運動(等速直線運動)を続ける(慣性の法則)'];
    } else if (pat === 2) {
      question = '物体が、それまでの運動の状態(静止または等速直線運動)を続けようとする性質を何といいますか。';
      answer = '慣性';
      choices = shuffle(['慣性', '重力', '浮力', '作用反作用']);
      steps = ['物体がそれまでの運動の状態を続けようとする性質を慣性という'];
    } else if (pat === 3) {
      question = 'バスが急発進すると、乗客の体が進行方向とは反対(後ろ)に傾くのはなぜですか。';
      answer = '乗客の体には、それまでの静止の状態を続けようとする慣性がはたらくから';
      choices = shuffle([answer, '乗客の体が急に重くなるから', 'バスの中に強い風が吹くから', '慣性とは関係のない現象である']);
      steps = ['バスが発進しても乗客の体は静止を続けようとする(慣性)ため、バスに対して後ろへ傾くように見える'];
    } else if (pat === 4) {
      question = '走っているバスが急停車すると、乗客の体が前のめりに傾くのはなぜですか。';
      answer = '乗客の体には、それまでの運動の状態を続けようとする慣性がはたらくから';
      choices = shuffle([answer, '乗客の体が急に軽くなるから', 'ブレーキの音におどろくから', '慣性とは関係のない現象である']);
      steps = ['バスが止まっても乗客の体は運動を続けようとする(慣性)ため、前のめりに傾くように見える'];
    } else if (pat === 5) {
      question = '1つの物体が、もう1つの別の物体に力を加えたとき、力を加えた物体は、加えた相手からどうなりますか。';
      answer = '同時に、逆向きで同じ大きさの力を受ける';
      choices = shuffle([answer, '何も力を受けない', '少し時間がたってから力を受ける', '同じ向きで同じ大きさの力を受ける']);
      steps = ['物体に力(作用)を加えると、同時に相手から同じ大きさで逆向きの力(反作用)を受ける(作用・反作用の法則)'];
    } else if (pat === 6) {
      question = '1つの物体が別の物体に力を加えたとき、同時にはたらく2つの力の関係を何といいますか。';
      answer = '作用・反作用の法則';
      choices = shuffle(['作用・反作用の法則', '慣性の法則', 'つり合いの法則', '分離の法則']);
      steps = ['1つの物体が別の物体に力を加えたとき、必ず同時に逆向き・同じ大きさの力を受け返す関係を作用・反作用の法則という'];
    } else if (pat === 7) {
      question = '作用・反作用の2力は、同じ1つの物体にはたらきますか、それとも別々の物体にはたらきますか。';
      answer = '別々の物体にはたらく（それぞれの物体に1つずつ）';
      choices = shuffle([answer, '同じ1つの物体にはたらく', 'どちらの物体にもはたらかない', '3つ以上の物体にまたがってはたらく']);
      steps = ['作用・反作用の2力は、力を加えた物体と力を受けた物体の、それぞれ別々の物体にはたらく'];
    } else if (pat === 8) {
      question = '「つり合っている2力」と「作用・反作用の2力」は、どちらも大きさが等しく向きが反対ですが、大きなちがいは何ですか。';
      answer = 'つり合う2力は同じ1つの物体にはたらくが、作用・反作用の2力は別々の物体にはたらく';
      choices = shuffle([answer, 'つり合う2力の方が必ず大きい', '作用・反作用の2力は同時にはたらかない', 'つり合う2力は一直線上にない']);
      steps = ['つり合う2力は同一の物体にはたらく力どうしだが、作用・反作用の2力は力を及ぼし合う別々の物体にそれぞれはたらく点が異なる'];
    } else if (pat === 9) {
      question = '水中にある物体に、水から上向きにはたらく力を何といいますか。';
      answer = '浮力';
      choices = shuffle(['浮力', '水圧', '重力', '垂直抗力']);
      steps = ['水中の物体に水からはたらく上向きの力を浮力という'];
    } else if (pat === 10) {
      question = '水中にある物体の浮力の大きさは、物体の水中に沈んでいる部分の体積が大きいほどどうなりますか。';
      answer = '大きくなる';
      choices = shuffle(['大きくなる', '小さくなる', '変化しない', '0になる']);
      steps = ['水中に沈んでいる部分の体積が大きいほど、はたらく浮力は大きくなる'];
    } else if (pat === 11) {
      question = '物体全体が水中に沈んでいるとき、その物体の深さを変えると、はたらく浮力の大きさはどうなりますか。';
      answer = '深さを変えても、浮力の大きさは変化しない';
      choices = shuffle([answer, '深いほど浮力は大きくなる', '深いほど浮力は小さくなる', '深さによって浮力の向きが変わる']);
      steps = ['沈んでいる部分の体積が変わらなければ、水中のどの深さにあっても浮力の大きさは変化しない'];
    } else if (pat === 12) {
      question = '水中にある面が、あらゆる向きから水の重さによって受ける圧力を何といいますか。';
      answer = '水圧';
      choices = shuffle(['水圧', '浮力', '大気圧', '垂直抗力']);
      steps = ['水中の面が水の重さによって受ける圧力を水圧という'];
    } else if (pat === 13) {
      question = '水の深さが深いほど、水圧の大きさはどうなりますか。';
      answer = '大きくなる';
      choices = shuffle(['大きくなる', '小さくなる', '変化しない', '0になる']);
      steps = ['水圧は、水の深さが深いほど大きくなる(その地点より上にある水の重さの分だけ加わる)'];
    } else if (pat === 14) {
      question = '水中で、物体の上面にはたらく水圧と下面にはたらく水圧をくらべると、浮力が生じる理由として正しいのはどれですか。';
      answer = '下面の方が深い位置にあるため、下面にはたらく上向きの水圧の方が、上面にはたらく下向きの水圧より大きいから';
      choices = shuffle([answer, '上面と下面の水圧はつねに等しく、浮力とは無関係だから', '上面にはたらく水圧の方が下面より常に大きいから', '水圧は物体の側面にしかはたらかないから']);
      steps = ['物体の下面の方が上面より深い位置にあるため下面にはたらく水圧の方が大きく、その差(上向きの力)が浮力として生じる'];
    } else {
      question = '空気中で0.8Nの重さがある物体を、ばねばかりにつるしたまま水の中に沈めると、ばねばかりの示す値は0.5Nになりました。この物体にはたらく浮力の大きさは何Nですか。';
      answer = 0.3;
      choices = buildChoices(0.3, [0.5, 0.8, 1.3]);
      steps = ['浮力 = 空気中での重さ − 水中でのばねばかりの値', '= 0.8 − 0.5 = 0.3N'];
      return { category: 'forceAction3', question, answer, choices, steps };
    }
    return { category: 'forceAction3', question, answer, choices, steps };
  }

  // エネルギーと仕事（中3）：運動エネルギー・位置エネルギー・力学的エネルギーの
  // 保存、仕事の意味と単位[J]、仕事の原理、仕事率[W]。
  function genEnergyWork3() {
    const pat = randInt(0, 15);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = '他の物体に対してさまざまなはたらきをすることができる能力を何といいますか。';
      answer = 'エネルギー';
      choices = shuffle(['エネルギー', '仕事率', '慣性', '浮力']);
      steps = ['他の物体に対してさまざまなはたらきをすることができる能力をエネルギーという'];
    } else if (pat === 1) {
      question = '運動している物体がもつエネルギーを何といいますか。';
      answer = '運動エネルギー';
      choices = shuffle(['運動エネルギー', '位置エネルギー', '化学エネルギー', '電気エネルギー']);
      steps = ['運動している物体がもつエネルギーを運動エネルギーという'];
    } else if (pat === 2) {
      question = '物体の運動エネルギーは、物体の速さが速いほど、また質量が大きいほどどうなりますか。';
      answer = '大きくなる';
      choices = shuffle(['大きくなる', '小さくなる', '変化しない', '0になる']);
      steps = ['運動エネルギーは、物体の速さが速いほど、質量が大きいほど大きくなる'];
    } else if (pat === 3) {
      question = '高い位置にある物体がもつエネルギーを何といいますか。';
      answer = '位置エネルギー';
      choices = shuffle(['位置エネルギー', '運動エネルギー', '弾性エネルギー', '熱エネルギー']);
      steps = ['高い位置にある物体がもつエネルギーを位置エネルギーという'];
    } else if (pat === 4) {
      question = '物体の位置エネルギーは、基準面からの高さが高いほど、また質量が大きいほどどうなりますか。';
      answer = '大きくなる';
      choices = shuffle(['大きくなる', '小さくなる', '変化しない', '0になる']);
      steps = ['位置エネルギーは、基準面からの高さが高いほど、質量が大きいほど大きくなる'];
    } else if (pat === 5) {
      question = '運動エネルギーと位置エネルギーの和を何といいますか。';
      answer = '力学的エネルギー';
      choices = shuffle(['力学的エネルギー', '弾性エネルギー', '熱エネルギー', '仕事エネルギー']);
      steps = ['運動エネルギーと位置エネルギーの和を力学的エネルギーという'];
    } else if (pat === 6) {
      question = '摩擦や空気の抵抗を考えないとき、物体がもつ力学的エネルギーの総量は、運動中どうなりますか。';
      answer = 'つねに一定に保たれる';
      choices = shuffle(['つねに一定に保たれる', 'だんだん大きくなる', 'だんだん小さくなる', '運動のたびに0になる']);
      steps = ['摩擦や空気抵抗がなければ、位置エネルギーと運動エネルギーが移り変わっても、力学的エネルギーの総量は一定に保たれる(力学的エネルギー保存の法則)'];
    } else if (pat === 7) {
      question = 'ふりこが最も高い位置(振れの両端)にきたとき、運動エネルギーと位置エネルギーはそれぞれどうなっていますか。';
      answer = '運動エネルギーは最小(0)、位置エネルギーは最大になる';
      choices = shuffle([answer, '運動エネルギーは最大、位置エネルギーは最小(0)になる', 'どちらも0になる', 'どちらも最大になる']);
      steps = ['ふりこの振れの両端(最も高い位置)では、速さが0になるため運動エネルギーは最小(0)、高さが最大なので位置エネルギーは最大になる'];
    } else if (pat === 8) {
      question = 'ふりこが最も低い位置(基準面付近)を通るとき、運動エネルギーと位置エネルギーはそれぞれどうなっていますか。';
      answer = '運動エネルギーは最大、位置エネルギーは最小(0)になる';
      choices = shuffle([answer, '運動エネルギーは最小(0)、位置エネルギーは最大になる', 'どちらも0になる', 'どちらも最大になる']);
      steps = ['最も低い位置では速さが最大になるため運動エネルギーは最大、高さが基準面と同じ(0)なので位置エネルギーは最小(0)になる'];
    } else if (pat === 9) {
      question = '物体に力を加えて、力の向きに物体を移動させたとき、力が物体に対して行ったことを何といいますか。';
      answer = '仕事';
      choices = shuffle(['仕事', '仕事率', 'エネルギー', '運動']);
      steps = ['力を加えた物体が、その力の向きに移動したとき、力が物体に仕事をしたという'];
    } else if (pat === 10) {
      question = '仕事の大きさを表す単位は何ですか。';
      answer = 'J（ジュール）';
      choices = shuffle(['J（ジュール）', 'N（ニュートン）', 'W（ワット）', 'Pa（パスカル）']);
      steps = ['仕事の大きさはJ(ジュール)という単位で表す'];
    } else if (pat === 11) {
      question = '力を加えても物体がまったく動かなかった場合、その力がした仕事の大きさはどうなりますか。';
      answer = '0（仕事をしたことにはならない）';
      choices = shuffle(['0（仕事をしたことにはならない）', '加えた力の大きさと同じになる', '無限に大きくなる', '時間の長さに比例する']);
      steps = ['力を加えても物体が動かなければ、その力がした仕事は0になる'];
    } else if (pat === 12) {
      question = '質量2kgの物体を、真上に1.5m持ち上げました。このときの仕事は何Jですか。ただし、100gの物体にはたらく重力を1Nとします。';
      answer = 30;
      choices = buildChoices(30, [20, 15, 45]);
      steps = ['質量2kg=2000gの物体にはたらく重力 = 2000÷100 = 20N', '仕事[J] = 力[N] × 移動距離[m] = 20 × 1.5 = 30J'];
      return { category: 'energyWork3', question, answer, choices, steps };
    } else if (pat === 13) {
      question = '動滑車や斜面などの道具を使って物体を同じ状態(同じ高さ)まで移動させるとき、道具を使わない場合と比べて仕事の大きさはどうなりますか。';
      answer = '道具を使っても使わなくても、仕事の大きさは変わらない';
      choices = shuffle([answer, '道具を使うと仕事は必ず半分になる', '道具を使うと仕事は必ず2倍になる', '道具の種類によって仕事の単位が変わる']);
      steps = ['てこや滑車などの道具を使っても、同じ状態まで物体を移動させる仕事の大きさは変わらない(仕事の原理)'];
    } else if (pat === 14) {
      question = '単位時間(1秒間)あたりにする仕事の大きさを何といいますか。';
      answer = '仕事率';
      choices = shuffle(['仕事率', '仕事の原理', '力学的エネルギー', '運動エネルギー']);
      steps = ['1秒間あたりにする仕事の大きさを仕事率という'];
    } else {
      question = '100Nの力で物体を2m引き上げるのに5秒かかりました。このときの仕事率は何Wですか。';
      answer = 40;
      choices = buildChoices(40, [20, 50, 100]);
      steps = ['仕事[J] = 力[N] × 距離[m] = 100 × 2 = 200J', '仕事率[W] = 仕事[J] ÷ 時間[s] = 200 ÷ 5 = 40W'];
      return { category: 'energyWork3', question, answer, choices, steps };
    }
    return { category: 'energyWork3', question, answer, choices, steps };
  }

  // エネルギーの変換と保存（中3）：さまざまなエネルギー変換の例、エネルギー保存の
  // 法則、エネルギー変換効率、熱の伝わり方(伝導・対流・放射)。
  function genEnergyConservation3() {
    const pat = randInt(0, 13);
    let question, answer, choices, steps;
    if (pat === 0) {
      question = 'あるエネルギーが、利用する目的に応じて別のエネルギーに変わることを何といいますか。';
      answer = 'エネルギーの変換';
      choices = shuffle(['エネルギーの変換', 'エネルギーの保存', 'エネルギーの分解', '力の分解']);
      steps = ['あるエネルギーが目的に応じて別のエネルギーに移り変わることをエネルギーの変換という'];
    } else if (pat === 1) {
      question = 'エネルギーが変換されても、変換の前後でエネルギーの総量はどうなりますか。';
      answer = '変化せず、つねに一定に保たれる';
      choices = shuffle(['変化せず、つねに一定に保たれる', '変換のたびに必ず増える', '変換のたびに必ず減る', '完全になくなってしまう']);
      steps = ['エネルギーが変換されても、その前後でエネルギーの総量は変化せず一定に保たれる(エネルギー保存の法則)'];
    } else if (pat === 2) {
      question = '手回し発電機のハンドルを回して電流を発生させるとき、どのようなエネルギー変換が起きていますか。';
      answer = '力学的エネルギー→電気エネルギー';
      choices = shuffle(['力学的エネルギー→電気エネルギー', '電気エネルギー→力学的エネルギー', '化学エネルギー→電気エネルギー', '光エネルギー→電気エネルギー']);
      steps = ['手回し発電機は、手を回す力学的エネルギーを電気エネルギーに変換する装置である'];
    } else if (pat === 3) {
      question = '乾電池は、どのようなエネルギー変換によって電流を流していますか。';
      answer = '化学エネルギー→電気エネルギー';
      choices = shuffle(['化学エネルギー→電気エネルギー', '電気エネルギー→化学エネルギー', '熱エネルギー→電気エネルギー', '力学的エネルギー→電気エネルギー']);
      steps = ['乾電池は、内部にたくわえられた化学エネルギーを電気エネルギーに変換している'];
    } else if (pat === 4) {
      question = 'モーターは、電気エネルギーを主に何エネルギーに変換する装置ですか。';
      answer = '力学的エネルギー（運動エネルギー）';
      choices = shuffle(['力学的エネルギー（運動エネルギー）', '化学エネルギー', '光エネルギー', '音エネルギー']);
      steps = ['モーターは、電気エネルギーを力学的エネルギー(運動エネルギー)に変換する装置である'];
    } else if (pat === 5) {
      question = 'LED電球は、電気エネルギーを主に何エネルギーに変換していますか。';
      answer = '光エネルギー';
      choices = shuffle(['光エネルギー', '力学的エネルギー', '化学エネルギー', '音エネルギー']);
      steps = ['LED電球は、電気エネルギーを光エネルギーに変換する装置である'];
    } else if (pat === 6) {
      question = '電気ケトルは、電気エネルギーを主に何エネルギーに変換していますか。';
      answer = '熱エネルギー';
      choices = shuffle(['熱エネルギー', '光エネルギー', '力学的エネルギー', '化学エネルギー']);
      steps = ['電気ケトルは、電気エネルギーを熱エネルギーに変換して水をあたためる装置である'];
    } else if (pat === 7) {
      question = '植物の光合成では、どのようなエネルギー変換が行われていますか。';
      answer = '光エネルギー→化学エネルギー';
      choices = shuffle(['光エネルギー→化学エネルギー', '化学エネルギー→光エネルギー', '熱エネルギー→化学エネルギー', '電気エネルギー→化学エネルギー']);
      steps = ['光合成では、光エネルギーを使って養分(でんぷんなど)をつくり出し、化学エネルギーとしてたくわえている'];
    } else if (pat === 8) {
      question = '投入したエネルギーのうち、利用目的どおりのエネルギーに変換された割合を何といいますか。';
      answer = 'エネルギー変換効率';
      choices = shuffle(['エネルギー変換効率', 'エネルギー保存の法則', '仕事の原理', '力学的エネルギー']);
      steps = ['投入したエネルギーのうち、目的のエネルギーに変換された割合をエネルギー変換効率という'];
    } else if (pat === 9) {
      question = 'エネルギー変換効率を求める式として正しいものはどれですか。';
      answer = '利用できるエネルギー ÷ 投入したエネルギー × 100（%）';
      choices = shuffle([answer, '投入したエネルギー ÷ 利用できるエネルギー × 100（%）', '利用できるエネルギー − 投入したエネルギー', '投入したエネルギー × 利用できるエネルギー']);
      steps = ['エネルギー変換効率(%) = 利用できるエネルギー ÷ 投入したエネルギー × 100 で求められる'];
    } else if (pat === 10) {
      question = '手回し発電機で5.0Jの仕事をして発電したところ、電気エネルギーが1.0Jになりました。このときのエネルギー変換効率は何%ですか。';
      answer = 20;
      choices = buildChoices(20, [10, 50, 80]);
      steps = ['エネルギー変換効率(%) = 電気エネルギー ÷ 仕事 × 100 = 1.0 ÷ 5.0 × 100 = 20%'];
      return { category: 'energyConservation3', question, answer, choices, steps };
    } else if (pat === 11) {
      question = '固体の熱いところから、温度の低い周囲の部分へ熱が順に伝わっていく現象を何といいますか。';
      answer = '伝導';
      choices = shuffle(['伝導', '対流', '放射', '拡散']);
      steps = ['固体の温度の高い部分から低い部分へ順に熱が伝わる現象を伝導という'];
    } else if (pat === 12) {
      question = '気体や液体そのものが移動することで、熱が全体に伝わる現象を何といいますか。';
      answer = '対流';
      choices = shuffle(['対流', '伝導', '放射', '蒸発']);
      steps = ['あたためられた気体や液体そのものが移動して、熱が全体に伝わる現象を対流という'];
    } else {
      question = '熱源から、間に空間(空気など)をへだてた離れたところまで、赤外線などによって熱が伝わる現象を何といいますか。';
      answer = '放射';
      choices = shuffle(['放射', '伝導', '対流', '反射']);
      steps = ['熱源から空間をへだてたところまで、赤外線などによって熱が伝わる現象を放射という(たき火のそばであたたかく感じるのはこの例)'];
    }
    return { category: 'energyConservation3', question, answer, choices, steps };
  }

  /* ---------- 今日のミッション（学年ごとに毎日ランダムな単元を1つ出題） ---------- */

  const MISSION_TARGET = 10;
  const MISSION_REWARD_MP = 20;

  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) >>> 0;
    }
    return h;
  }
  // 日付＋学年で決まる（＝同じ学年の生徒には同じ日は同じミッションが出る）
  function pickDailyMissionCategory(grade, dateKey) {
    const pool = CATEGORIES.filter(c => categoryGrade[c.id] === grade);
    const src = pool.length > 0 ? pool : CATEGORIES;
    const idx = hashStr(`${dateKey}:${grade}`) % src.length;
    return src[idx];
  }

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

  // 億・兆の大きな数（小4）
  function formatJp4Groups(numStr) {
    const rev = numStr.split('').reverse();
    const groups = [];
    for (let i = 0; i < rev.length; i += 4) groups.push(rev.slice(i, i + 4).reverse().join(''));
    return groups.reverse().join(',');
  }
  function genLargeNum4() {
    const pat = randInt(0, 3);
    let question, answer, wrongs, steps;
    if (pat === 2) {
      // 大きな数の10倍・100倍・1000倍、10分の1
      const bases = [
        { label: '億', mult: 100000000 }, { label: '兆', mult: 1000000000000 },
      ];
      const b = bases[randInt(0, 1)];
      const count = randInt(2, 90);
      const baseStr = `${count}${b.label}`;
      const way = randInt(0, 1);
      let candidates;
      if (way === 0) {
        const k = [10, 100, 1000][randInt(0, 2)];
        const resultCount = count * k;
        question = `${baseStr} を ${k}倍すると？`;
        answer = `${resultCount}${b.label}`;
        candidates = [`${resultCount / 10}${b.label}`, `${resultCount * 10}${b.label}`, `${resultCount + k}${b.label}`];
        steps = [`${count} × ${k} = ${resultCount}`, `= ${answer}`];
      } else {
        const bigCount = count * 10;
        question = `${bigCount}${b.label} を 10分の1にすると？`;
        answer = `${count}${b.label}`;
        candidates = [`${count * 10}${b.label}`, `${count + 1}${b.label}`, `${Math.max(1, count - 1)}${b.label}`];
        steps = [`${bigCount} ÷ 10 = ${count}`, `= ${answer}`];
      }
      return { category: 'largeNum4', question, answer, choices: buildChoicesFromList(answer, candidates), steps };
    } else if (pat === 3) {
      // 与えられた数字を1回ずつ使って作れる、いちばん大きい数・いちばん小さい数
      const k = randInt(4, 7);
      const allDigits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      const digits = shuffle(allDigits.slice()).slice(0, k);
      const askMax = Math.random() < 0.5;
      let answerDigits;
      if (askMax) {
        answerDigits = digits.slice().sort((a, b) => b - a);
      } else {
        const asc = digits.slice().sort((a, b) => a - b);
        if (asc[0] === 0) {
          const firstNonZeroIdx = asc.findIndex(d => d !== 0);
          [asc[0], asc[firstNonZeroIdx]] = [asc[firstNonZeroIdx], asc[0]];
        }
        answerDigits = asc;
      }
      question = `${digits.join('、')} の数字を1回ずつ使って${kanjiDigit(k)}けたの数をつくります。${askMax ? 'いちばん大きい数' : 'いちばん小さい数'}を答えましょう。`;
      answer = answerDigits.join('');
      const otherWay = askMax ? digits.slice().sort((a, b) => a - b).join('') : digits.slice().sort((a, b) => b - a).join('');
      const candidates = [otherWay, answer.slice(0, -1) + (answer[answer.length - 1] === '9' ? '8' : String(Number(answer[answer.length - 1]) + 1)), answer.slice(1) + answer[0]];
      steps = [askMax ? `大きい位から順に大きい数字を並べる` : `大きい位から順に小さい数字を並べる（先頭は0にできない）`, `= ${answer}`];
      return { category: 'largeNum4', question, answer, choices: buildChoicesFromList(answer, candidates), steps };
    } else if (pat === 0) {
      // 億・兆の位の数字
      let numStr = String(randInt(1, 9));
      for (let i = 1; i < 16; i++) numStr += String(randInt(0, 9));
      const places = [
        { label: '億', pow: 8 }, { label: '十億', pow: 9 }, { label: '百億', pow: 10 }, { label: '千億', pow: 11 },
        { label: '兆', pow: 12 }, { label: '十兆', pow: 13 }, { label: '百兆', pow: 14 }, { label: '千兆', pow: 15 },
      ];
      const place = places[randInt(0, places.length - 1)];
      const digit = parseInt(numStr[15 - place.pow], 10);
      question = `${formatJp4Groups(numStr)} という数の「${place.label}の位」の数字は？`;
      answer = digit;
      const wrongSet = new Set([digit]);
      wrongs = [];
      while (wrongs.length < 3) {
        const d = randInt(0, 9);
        if (!wrongSet.has(d)) { wrongSet.add(d); wrongs.push(d); }
      }
      steps = [`右から${place.pow + 1}桁目が「${place.label}の位」`, `その数字は ${digit}`];
    } else {
      // 億・兆と数字の変換
      const useCho = Math.random() < 0.5;
      const unit = useCho ? '兆' : '億';
      const mult = useCho ? 1000000000000 : 100000000;
      const count = useCho ? randInt(2, 9) : randInt(2, 999);
      const value = count * mult;
      const toNumeral = Math.random() < 0.5;
      if (toNumeral) {
        question = `${count}${unit} を数字で表すと？`;
        answer = value;
        wrongs = [(count - 1) * mult, (count + 1) * mult, value + mult * 10].filter(v => v !== value && v > 0);
        steps = [`1${unit} = ${mult}`, `${count} × ${mult} = ${value}`];
      } else {
        question = `${formatJp4Groups(String(value))} は何${unit}ですか？`;
        answer = count;
        wrongs = [count + 1, Math.max(1, count - 1), count * 10].filter(v => v !== count);
        steps = [`1${unit} = ${mult}`, `${value} ÷ ${mult} = ${count}`];
      }
    }
    return { category: 'largeNum4', question, answer, choices: buildChoices(answer, wrongs), steps };
  }

  // 三角じょうぎの角度（小4）：30-60-90と45-45-90の三角じょうぎの角を求める
  function genSetSquareAngle4() {
    const pat = randInt(0, 2);
    let question, answer, wrongs, steps;
    if (pat === 0) {
      const knownIsThirty = Math.random() < 0.5;
      const known = knownIsThirty ? 30 : 60;
      answer = 180 - 90 - known;
      question = `三角じょうぎの1つの角が${known}°で、直角(90°)の角もあります。残りの角は何度ですか。`;
      wrongs = [known, 90, answer + 10].filter(v => v !== answer);
      steps = [`三角形の内角の和は180°`, `180 − 90 − ${known} = ${answer}`];
    } else if (pat === 1) {
      question = `直角二等辺三角形の三角じょうぎがあります。直角(90°)以外の2つの角は、それぞれ何度ですか。`;
      answer = '45°と45°';
      wrongs = ['30°と60°', '60°と60°', '30°と30°'];
      steps = [`直角二等辺三角形の内角の和は180°`, `(180 − 90) ÷ 2 = 45`, `45°と45°`];
      return { category: 'setSquareAngle4', question, answer, choices: shuffle([answer, ...wrongs]), steps };
    } else {
      // 2枚の三角じょうぎの角をとなり合わせに置いたときにできる角（和・差）
      const setA = [30, 60, 90];
      const setB = [45, 45, 90];
      const a = setA[randInt(0, 2)];
      const b = setB[randInt(0, 1)];
      const isSum = Math.random() < 0.5;
      answer = isSum ? a + b : Math.abs(a - b);
      question = isSum
        ? `${a}°の角と${b}°の角をとなり合わせに置くと、合わせた角は何度になりますか。`
        : `${Math.max(a, b)}°の角に${Math.min(a, b)}°の角を重ねて置くと、残りの角は何度になりますか。`;
      wrongs = [a, b, answer + 10].filter(v => v !== answer);
      steps = isSum ? [`${a} + ${b} = ${answer}`] : [`${Math.max(a, b)} − ${Math.min(a, b)} = ${answer}`];
    }
    return { category: 'setSquareAngle4', question, answer, choices: buildChoices(answer, wrongs), steps };
  }

  // 倍の見方の文章題（小4）：何倍かを求める・何倍かにあたる大きさを求める
  function genTimesWordProblem4() {
    const pat = randInt(0, 2);
    const contexts = [
      { a: '風船', tpl: (base, cmp) => `赤い風船が${base}こ、青い風船が${cmp}こあります。青い風船の数は、赤い風船の数の何倍ですか。` },
      { a: 'お金', tpl: (base, cmp) => `ゆうまさんは${base}円、ほのかさんは${cmp}円持っています。ほのかさんの持っているお金は、ゆうまさんの持っているお金の何倍ですか。` },
      { a: '生徒数', tpl: (base, cmp) => `たくみさんのクラスの人数は${base}人で、全校生徒数は${cmp}人です。全校生徒数は、クラスの人数の何倍ですか。` },
    ];
    let question, answer, wrongs, steps;
    if (pat === 0) {
      const ctx = contexts[randInt(0, contexts.length - 1)];
      const base = randInt(2, 20);
      const times = randInt(2, 9);
      const cmp = base * times;
      question = ctx.tpl(base, cmp);
      answer = times;
      wrongs = [times + 1, Math.max(1, times - 1), base].filter(v => v !== answer);
      steps = [`何倍 = くらべる量 ÷ もとにする量`, `${cmp} ÷ ${base} = ${times}`];
    } else if (pat === 1) {
      // 何倍にあたる大きさを求める（もとにする量×倍）
      const base = randInt(2, 300);
      const times = randInt(2, 9);
      const result = base * times;
      question = `メロンのねだんは${base}円で、りんごのねだんは、メロンのねだんの${times}倍です。りんごのねだんはいくらですか。`;
      answer = result;
      wrongs = [result + base, Math.max(1, result - base), base + times].filter(v => v !== answer);
      steps = [`○倍にあたる大きさ = もとにする大きさ × 倍`, `${base} × ${times} = ${result}`];
    } else {
      // もとにする大きさを求める（くらべる量÷倍）
      const base = randInt(2, 300);
      const times = randInt(2, 9);
      const result = base * times;
      question = `キャベツ1この重さは、ナス1この重さの${times}倍で、${result}gあります。ナス1この重さは何gですか。`;
      answer = base;
      wrongs = [base + times, Math.max(1, base - times), result].filter(v => v !== answer);
      steps = [`もとにする大きさ = くらべる量 ÷ 倍`, `${result} ÷ ${times} = ${base}`];
    }
    return { category: 'timesWordProblem4', question, answer, choices: buildChoices(answer, wrongs), steps };
  }

  // 大きな数（小3）：万の位までの理解、10倍・100倍・1000倍、10でわる
  function genLargeNum3() {
    const pat = randInt(0, 2);
    let question, answer, wrongs, steps;
    if (pat === 0) {
      // 万の位までの位の数字（8桁、〜9999万台まで。億の位は小4で扱うため使わない）
      let numStr = String(randInt(1, 9));
      for (let i = 1; i < 8; i++) numStr += String(randInt(0, 9));
      const places = [
        { label: '一', pow: 0 }, { label: '十', pow: 1 }, { label: '百', pow: 2 }, { label: '千', pow: 3 },
        { label: '万', pow: 4 }, { label: '十万', pow: 5 }, { label: '百万', pow: 6 }, { label: '千万', pow: 7 },
      ];
      const place = places[randInt(0, places.length - 1)];
      const digit = parseInt(numStr[7 - place.pow], 10);
      question = `${formatJp4Groups(numStr)} という数の「${place.label}の位」の数字は？`;
      answer = digit;
      const wrongSet = new Set([digit]);
      wrongs = [];
      while (wrongs.length < 3) {
        const d = randInt(0, 9);
        if (!wrongSet.has(d)) { wrongSet.add(d); wrongs.push(d); }
      }
      steps = [`右から${place.pow + 1}桁目が「${place.label}の位」`, `その数字は ${digit}`];
    } else if (pat === 1) {
      // 10倍・100倍・1000倍
      const base = randInt(2, 9999);
      const mult = [10, 100, 1000][randInt(0, 2)];
      const answerVal = base * mult;
      question = `${base} を ${mult}倍すると？`;
      answer = answerVal;
      wrongs = [base * (mult / 10), base * (mult * 10), answerVal + mult].filter(v => v !== answerVal && v > 0);
      steps = [`${base} × ${mult} = ${answerVal}`];
    } else {
      // 10でわる（10分の1にする）
      const core = randInt(2, 9999);
      const base = core * 10;
      question = `${base} を 10 でわった数は？`;
      answer = core;
      wrongs = [core + 1, Math.max(1, core - 1), base * 10].filter(v => v !== core);
      steps = [`${base} ÷ 10 = ${core}`];
    }
    return { category: 'largeNum3', question, answer, choices: buildChoices(answer, wrongs), steps };
  }

  // 時こくと時間（小3）：時刻の何分後、単位換算、時刻の差
  function genClockTime3() {
    const pat = randInt(0, 3);
    let question, answer, wrongs, steps;
    if (pat === 0) {
      const startHour = randInt(1, 9);
      const startMin = randInt(0, 11) * 5;
      const durationMin = randInt(1, 6) * 10;
      const total = startMin + durationMin;
      const endHour = startHour + Math.floor(total / 60);
      const endMin = total % 60;
      question = `${startHour}時${startMin}分の${durationMin}分後は何時何分？`;
      answer = `${endHour}時${endMin}分`;
      const wrongCands = [
        `${endHour}時${(endMin + 10) % 60}分`,
        `${endHour - 1 >= 1 ? endHour - 1 : endHour + 1}時${endMin}分`,
        `${endHour}時${Math.max(0, endMin - 10)}分`,
      ];
      steps = [`${startMin}分 + ${durationMin}分 = ${total}分`, `${total}分 = ${Math.floor(total / 60)}時間${total % 60}分`, `${startHour}時 + ${Math.floor(total / 60)}時間 = ${endHour}時、のこり${endMin}分 → ${answer}`];
      return { category: 'clockTime3', question, answer, choices: buildChoicesFromList(answer, wrongCands), steps };
    } else if (pat === 1) {
      const kind = randInt(0, 6);
      let choices;
      if (kind === 0) {
        const min = randInt(1, 9);
        question = `${min}分は何秒？`;
        answer = min * 60;
        wrongs = [answer + 60, Math.max(1, answer - 60), min * 100];
      } else if (kind === 1) {
        const minVal = randInt(1, 9);
        const sec = minVal * 60;
        question = `${sec}秒は何分？`;
        answer = minVal;
        wrongs = [answer + 1, Math.max(1, answer - 1), sec / 100];
      } else if (kind === 2) {
        const hr = randInt(1, 5);
        question = `${hr}時間は何分？`;
        answer = hr * 60;
        wrongs = [answer + 60, Math.max(1, answer - 60), hr * 100];
      } else if (kind === 3) {
        // 分秒(複合)→秒
        const min = randInt(1, 9);
        const sec = randInt(1, 59);
        question = `${min}分${sec}秒は何秒？`;
        answer = min * 60 + sec;
        wrongs = [answer + 10, Math.max(1, answer - 10), min * 100 + sec];
      } else if (kind === 4) {
        // 秒→分秒(複合)
        const min = randInt(1, 9);
        const sec = randInt(1, 59);
        const totalSec = min * 60 + sec;
        question = `${totalSec}秒は何分何秒？`;
        answer = `${min}分${sec}秒`;
        const wrongCands = [
          `${min}分${sec + 10 <= 59 ? sec + 10 : sec - 10}秒`,
          `${min + 1}分${sec}秒`,
          `${min > 1 ? min - 1 : min + 1}分${sec}秒`,
        ];
        steps = [`${totalSec}秒 ÷ 60 = ${min}分あまり${sec}秒`, `= ${answer}`];
        return { category: 'clockTime3', question, answer, choices: buildChoicesFromList(answer, wrongCands), steps };
      } else if (kind === 5) {
        // 時間→秒
        const hr = randInt(1, 3);
        question = `${hr}時間は何秒？`;
        answer = hr * 3600;
        wrongs = [answer + 3600, Math.max(1, answer - 3600), hr * 60];
        steps = [`${hr}時間 = ${hr}×60分 = ${hr * 60}分`, `${hr * 60}分 = ${hr * 60}×60秒 = ${answer}秒`];
      } else {
        // 分→時間分(複合)
        const hr = randInt(1, 2);
        const min = randInt(1, 59);
        const totalMin = hr * 60 + min;
        question = `${totalMin}分は何時間何分？`;
        answer = `${hr}時間${min}分`;
        const wrongCands = [
          `${hr}時間${min + 10 <= 59 ? min + 10 : min - 10}分`,
          `${hr + 1}時間${min}分`,
          `${hr > 1 ? hr - 1 : hr + 1}時間${min}分`,
        ];
        steps = [`${totalMin}分 ÷ 60 = ${hr}時間あまり${min}分`, `= ${answer}`];
        return { category: 'clockTime3', question, answer, choices: buildChoicesFromList(answer, wrongCands), steps };
      }
      wrongs = wrongs.filter((v, i, arr) => arr.indexOf(v) === i && v !== answer);
      steps = steps || [`= ${answer}`];
      return { category: 'clockTime3', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 2) {
      const startHour = randInt(1, 6);
      const startMin = randInt(0, 11) * 5;
      const durationMin = randInt(1, 8) * 10;
      const total = startMin + durationMin;
      const endHour = startHour + Math.floor(total / 60);
      const endMin = total % 60;
      question = `${startHour}時${startMin}分から${endHour}時${endMin}分までは何分間？`;
      answer = durationMin;
      wrongs = [durationMin + 10, Math.max(1, durationMin - 10), durationMin + 60].filter(v => v !== durationMin);
      steps = [`${startHour}時${startMin}分 から ${endHour}時${endMin}分 まで`, `= ${durationMin}分間`];
      return { category: 'clockTime3', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else {
      // アナログ時計を読む・○分前の時こく・○時までの残り時間
      function clockSvg(hour, minute) {
        const hourAngle = (hour % 12) * 30 + minute * 0.5 - 90;
        const minAngle = minute * 6 - 90;
        const hx = 60 + 30 * Math.cos(hourAngle * Math.PI / 180);
        const hy = 60 + 30 * Math.sin(hourAngle * Math.PI / 180);
        const mx = 60 + 42 * Math.cos(minAngle * Math.PI / 180);
        const my = 60 + 42 * Math.sin(minAngle * Math.PI / 180);
        let nums = '';
        for (let n = 1; n <= 12; n++) {
          const a = n * 30 - 90;
          const nx = 60 + 47 * Math.cos(a * Math.PI / 180);
          const ny = 60 + 47 * Math.sin(a * Math.PI / 180);
          nums += `<text x="${nx.toFixed(1)}" y="${(ny + 4).toFixed(1)}" font-size="10" text-anchor="middle" fill="#1c2127">${n}</text>`;
        }
        return `<svg width="120" height="120" viewBox="0 0 120 120" style="display:block;margin:0 auto 8px"><circle cx="60" cy="60" r="55" fill="none" stroke="#1c2127" stroke-width="1.5"/>${nums}<line x1="60" y1="60" x2="${hx.toFixed(1)}" y2="${hy.toFixed(1)}" stroke="#1c2127" stroke-width="3" stroke-linecap="round"/><line x1="60" y1="60" x2="${mx.toFixed(1)}" y2="${my.toFixed(1)}" stroke="#1c2127" stroke-width="2" stroke-linecap="round"/><circle cx="60" cy="60" r="2.5" fill="#1c2127"/></svg>`;
      }
      const hour = randInt(1, 12);
      const minute = randInt(0, 11) * 5;
      const timeStr = `${hour}時${minute === 0 ? '' : minute + '分'}`.trim();
      const timeStrFull = `${hour}時${minute}分`;
      const kind = randInt(0, 2);
      if (kind === 0) {
        question = `右の時計を見て、何時何分か答えましょう。`;
        answer = timeStrFull;
        const wrongCands = [`${hour}時${(minute + 10) % 60}分`, `${hour % 12 === 0 ? 1 : hour % 12 + 1}時${minute}分`, `${hour}時${Math.max(0, minute - 5)}分`];
        steps = [`長い針（分針）は ${minute}分`, `短い針（時針）は ${hour}時`, `= ${answer}`];
        return { category: 'clockTime3', question, questionHtml: clockSvg(hour, minute) + `<span style="display:block">${question}</span>`, answer, choices: buildChoicesFromList(answer, wrongCands), steps };
      } else if (kind === 1) {
        const before = [10, 15, 20, 30][randInt(0, 3)];
        const totalBefore = (hour % 12) * 60 + minute - before;
        const wrapped = ((totalBefore % 720) + 720) % 720;
        let beforeHour = Math.floor(wrapped / 60);
        const beforeMin = wrapped % 60;
        if (beforeHour === 0) beforeHour = 12;
        question = `右の時計が示す時こくの ${before}分前は何時何分ですか。`;
        answer = `${beforeHour}時${beforeMin}分`;
        const wrongCands = [`${beforeHour}時${(beforeMin + 5) % 60}分`, `${hour}時${minute}分`, `${beforeHour}時${Math.max(0, beforeMin - 5)}分`];
        steps = [`${timeStrFull} の ${before}分前を求める`, `= ${answer}`];
        return { category: 'clockTime3', question, questionHtml: clockSvg(hour, minute) + `<span style="display:block">${question}</span>`, answer, choices: buildChoicesFromList(answer, wrongCands), steps };
      } else {
        // 時計が示す時こくから、次の「◯時ちょうど」までの残り時間
        const targetHour = ((hour % 12) + 1 === 0 ? 12 : (hour % 12) + 1) === 13 ? 1 : (hour % 12) + 1;
        const remaining = 60 - minute;
        if (remaining === 60) { question = null; }
        const dispTargetHour = targetHour === 0 ? 12 : targetHour;
        question = `右の時計が示す時こくから、${dispTargetHour}時までは何分ありますか。`;
        answer = remaining === 60 ? 0 : remaining;
        const wrongs = [answer + 5, Math.max(1, answer - 5), answer + 10].filter(v => v !== answer);
        steps = [`${timeStrFull} から ${dispTargetHour}時 まで`, `= ${answer}分`];
        return { category: 'clockTime3', question, questionHtml: clockSvg(hour, minute) + `<span style="display:block">${question}</span>`, answer, choices: buildChoices(answer, wrongs), steps };
      }
    }
  }

  // じこくと時間の文章題（小3）
  function genClockWordProblem3() {
    const pat = randInt(0, 3);
    const places = ['公園', '図書館', '学校', '駅', 'プール'];
    const place = places[randInt(0, places.length - 1)];
    let question, answer, steps;
    if (pat === 0) {
      // 出発時こく + 所要時間 → 到着時こく
      const startHour = randInt(1, 9);
      const startMin = randInt(0, 11) * 5;
      const durationMin = randInt(2, 9) * 10;
      const total = startMin + durationMin;
      const endHour = startHour + Math.floor(total / 60);
      const endMin = total % 60;
      question = `家を${startHour}時${startMin}分に出て、${durationMin}分歩くと${place}に着きました。着いた時こくは何時何分ですか。`;
      answer = `${endHour}時${endMin}分`;
      const wrongCands = [
        `${endHour}時${(endMin + 10) % 60}分`,
        `${endHour + 1}時${endMin}分`,
        `${endHour}時${Math.max(0, endMin - 10)}分`,
      ];
      steps = [`${startMin}分 + ${durationMin}分 = ${total}分`, `${startHour}時 + ${Math.floor(total / 60)}時間${endMin}分 = ${answer}`];
      return { category: 'clockWordProblem3', question, answer, choices: buildChoicesFromList(answer, wrongCands), steps };
    } else if (pat === 1) {
      // 到着時こく − 所要時間 → 出発時こく(答えを先に決めて逆算する)
      const startHour = randInt(1, 9);
      const startMin = randInt(0, 11) * 5;
      const durationMin = randInt(2, 9) * 10;
      const total = startMin + durationMin;
      const endHour = startHour + Math.floor(total / 60);
      const endMin = total % 60;
      question = `家を出て${durationMin}分歩き、${place}に${endHour}時${endMin}分に着きました。家を出た時こくは何時何分ですか。`;
      answer = `${startHour}時${startMin}分`;
      const wrongCands = [
        `${startHour}時${(startMin + 10) % 60}分`,
        `${startHour + 1}時${startMin}分`,
        `${startHour}時${Math.max(0, startMin - 10)}分`,
      ];
      steps = [`${endHour}時${endMin}分の${durationMin}分前を求める`, `= ${answer}`];
      return { category: 'clockWordProblem3', question, answer, choices: buildChoicesFromList(answer, wrongCands), steps };
    } else if (pat === 2) {
      // 出発時こく・到着時こく → かかった時間
      const startHour = randInt(1, 6);
      const startMin = randInt(0, 11) * 5;
      const durationMin = randInt(1, 8) * 10;
      const total = startMin + durationMin;
      const endHour = startHour + Math.floor(total / 60);
      const endMin = total % 60;
      question = `家を${startHour}時${startMin}分に出て、${place}に${endHour}時${endMin}分に着きました。家を出てから${place}に着くまでにかかった時間は何分ですか。`;
      answer = durationMin;
      const wrongs = [durationMin + 10, Math.max(1, durationMin - 10), durationMin + 60].filter((v) => v !== durationMin);
      steps = [`${startHour}時${startMin}分 から ${endHour}時${endMin}分 まで`, `= ${durationMin}分`];
      return { category: 'clockWordProblem3', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else {
      // 2つの時間の合計(時間分の複合表記になることもある)
      const places2 = places.filter((p) => p !== place);
      const place2 = places2[randInt(0, places2.length - 1)];
      const dur1 = randInt(20, 50);
      const dur2 = randInt(20, 50);
      const total = dur1 + dur2;
      const hr = Math.floor(total / 60);
      const min = total % 60;
      question = `${place}にいた時間は${dur1}分、${place2}にいた時間は${dur2}分です。あわせて何時間何分ですか。`;
      if (hr === 0) {
        answer = `${min}分`;
        const wrongCands = [`${min + 10}分`, `${Math.max(1, min - 10)}分`, `1時間${min}分`];
        steps = [`${dur1}分 + ${dur2}分 = ${total}分`, `= ${answer}`];
        return { category: 'clockWordProblem3', question, answer, choices: buildChoicesFromList(answer, wrongCands), steps };
      }
      answer = `${hr}時間${min}分`;
      const wrongCands = [`${hr}時間${min === 0 ? 10 : Math.max(0, min - 10)}分`, `${hr + 1}時間${min}分`, `${hr}時間${(min + 10) % 60}分`];
      steps = [`${dur1}分 + ${dur2}分 = ${total}分`, `${total}分 = ${hr}時間${min}分`, `= ${answer}`];
      return { category: 'clockWordProblem3', question, answer, choices: buildChoicesFromList(answer, wrongCands), steps };
    }
  }

  // たし算とひき算：3けた以上（小3）
  function genAddSub3Digit3() {
    const digits = randInt(3, 4);
    const min = digits === 3 ? 100 : 1000;
    const max = digits === 3 ? 999 : 9999;
    const isAdd = Math.random() < 0.5;
    let question, answer, wrongs, steps;
    if (isAdd) {
      const a = randInt(min, max), b = randInt(min, max);
      answer = a + b;
      question = `${a} + ${b} = ?`;
      wrongs = [answer + 10, Math.max(1, answer - 10), a - b, answer + 100].filter(v => v !== answer && v > 0);
      steps = [`${a} + ${b} = ${answer}`];
    } else {
      let a = randInt(min, max), b = randInt(min, max);
      if (a < b) { const t = a; a = b; b = t; }
      answer = a - b;
      question = `${a} − ${b} = ?`;
      wrongs = [answer + 10, Math.max(1, answer - 10), a + b, answer + 100].filter(v => v !== answer && v >= 0);
      steps = [`${a} − ${b} = ${answer}`];
    }
    return { category: 'addSub3Digit3', question, answer, choices: buildChoices(answer, wrongs), steps };
  }

  // 単位の関係（小3）：L↔dL、kg↔g、km↔m、分↔秒
  function genUnits3() {
    const pat = randInt(0, 5);
    let question, answer, wrongs, steps;
    if (pat <= 1) {
      const units = [
        { big: 'L', small: 'dL', factor: 10 },
        { big: 'kg', small: 'g', factor: 1000 },
        { big: 'km', small: 'm', factor: 1000 },
        { big: '分', small: '秒', factor: 60 },
      ];
      const u = units[randInt(0, units.length - 1)];
      const toSmall = Math.random() < 0.5;
      const count = randInt(2, 9);
      if (toSmall) {
        question = `${count}${u.big} は何${u.small}ですか。`;
        answer = count * u.factor;
        wrongs = [answer + u.factor, Math.max(1, answer - u.factor), count * (u.factor / 10 || 1)].filter(v => v !== answer && v > 0);
        steps = [`1${u.big} = ${u.factor}${u.small}`, `${count} × ${u.factor} = ${answer}`];
      } else {
        const smallVal = count * u.factor;
        question = `${smallVal}${u.small} は何${u.big}ですか。`;
        answer = count;
        wrongs = [count + 1, Math.max(1, count - 1), smallVal].filter(v => v !== answer && v > 0);
        steps = [`1${u.big} = ${u.factor}${u.small}`, `${smallVal} ÷ ${u.factor} = ${answer}`];
      }
      return { category: 'units3', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 2) {
      // 複合(kg+g)→g
      const kg = randInt(1, 9);
      const g = randInt(1, 999);
      question = `${kg}kg${g}g は何gですか。`;
      answer = kg * 1000 + g;
      wrongs = [answer + 100, Math.max(1, answer - 100), kg * 100 + g].filter(v => v !== answer && v > 0);
      steps = [`1kg = 1000g`, `${kg}kg = ${kg * 1000}g`, `${kg * 1000}g + ${g}g = ${answer}g`];
      return { category: 'units3', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 3) {
      // g→複合(kg◯g)
      const kg = randInt(1, 9);
      const g = randInt(1, 999);
      const total = kg * 1000 + g;
      question = `${total}g は何kg何gですか。`;
      answer = `${kg}kg${g}g`;
      const wrongCands = [`${kg}kg${g + 10}g`, `${kg + 1}kg${g}g`, `${kg > 1 ? kg - 1 : kg + 1}kg${g}g`];
      steps = [`${total}g ÷ 1000 = ${kg}kgあまり${g}g`, `= ${answer}`];
      return { category: 'units3', question, answer, choices: buildChoicesFromList(answer, wrongCands), steps };
    } else if (pat === 4) {
      // kg→t
      const t = randInt(1, 9);
      const kg = t * 1000;
      question = `${kg}kg は何tですか。`;
      answer = t;
      wrongs = [t + 1, Math.max(1, t - 1), kg].filter(v => v !== answer && v > 0);
      steps = [`1t = 1000kg`, `${kg} ÷ 1000 = ${answer}t`];
      return { category: 'units3', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else {
      // t→kg
      const t = randInt(1, 9);
      question = `${t}t は何kgですか。`;
      answer = t * 1000;
      wrongs = [answer + 1000, Math.max(1, answer - 1000), t * 100].filter(v => v !== answer && v > 0);
      steps = [`1t = 1000kg`, `${t} × 1000 = ${answer}kg`];
      return { category: 'units3', question, answer, choices: buildChoices(answer, wrongs), steps };
    }
  }

  // □を使った式（小3）：数量の関係を□を使った式に表す・□にあてはまる数を求める
  function genBoxEquation3() {
    const pat = randInt(0, 4);
    const items = ['色紙', 'おはじき', 'あめ', 'クッキー', 'ビー玉'];
    const item = items[randInt(0, items.length - 1)];
    let question, answer, steps;
    if (pat === 0) {
      // ひき算の式に表す(全部○個あって、□個使った/あげた→残りを式に表す)
      const total = randInt(10, 30);
      const verb = ['使いました', 'あげました', '食べました'][randInt(0, 2)];
      question = `${item}が${total}こありましたが、□こ${verb}。のこった${item}のこ数を、□を使って式に表しなさい。`;
      answer = `${total}－□`;
      const wrongCands = [`□－${total}`, `${total}＋□`, `${total + 1}－□`];
      steps = [`のこり = 全部 − 使った数`, `= ${answer}`];
      return { category: 'boxEquation3', question, answer, choices: buildChoicesFromList(answer, wrongCands), steps };
    } else if (pat === 1) {
      // かけ算の式に表す(□の◯倍)
      const n = randInt(2, 9);
      const colors = [['赤', '青'], ['青', '赤'], ['白', '黒'], ['長い', '短い']];
      const [nameA, nameB] = colors[randInt(0, colors.length - 1)];
      question = `${nameB}のテープは${nameA}のテープの${n}倍の長さです。${nameA}のテープの長さを□cmとして、${nameB}のテープの長さを式に表しなさい。`;
      answer = `□×${n}`;
      const wrongCands = [`□÷${n}`, `□＋${n}`, `${n}×${n}`];
      steps = [`${nameB} = ${nameA}(□) × ${n}`, `= ${answer}`];
      return { category: 'boxEquation3', question, answer, choices: buildChoicesFromList(answer, wrongCands), steps };
    } else if (pat === 2) {
      // わり算の式に表す(□を等分する)
      const n = randInt(2, 9);
      const objects = ['リボン', 'ロープ', 'ひも', 'テープ'];
      const obj = objects[randInt(0, objects.length - 1)];
      question = `${obj}を同じ長さで${n}本に切り分けました。もとの${obj}の長さを□cmとして、切り分けた1本の長さを式に表しなさい。`;
      answer = `□÷${n}`;
      const wrongCands = [`□×${n}`, `${n}÷□`, `□－${n}`];
      steps = [`1本分 = もとの長さ(□) ÷ 本数`, `= ${answer}`];
      return { category: 'boxEquation3', question, answer, choices: buildChoicesFromList(answer, wrongCands), steps };
    } else if (pat === 3) {
      // たし算の式を解いて□を求める(皿の重さ+中身の重さ=全体)
      const base = randInt(50, 200);
      const boxAnswer = randInt(50, 300);
      const total = base + boxAnswer;
      const contents = ['バター', '小麦粉', 'さとう', 'チョコレート'];
      const content = contents[randInt(0, contents.length - 1)];
      question = `${content}を${base}gの皿にのせました。${content}の重さを□gとして、全体の重さが${total}gになったとき、□にあてはまる数を求めなさい。`;
      answer = boxAnswer;
      const wrongs = [answer + 10, Math.max(1, answer - 10), total].filter((v) => v !== answer && v > 0);
      steps = [`□＋${base}＝${total}`, `□＝${total}－${base}＝${answer}`];
      return { category: 'boxEquation3', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else {
      // かけ算の式を解いて□を求める(1個の値段×こ数=代金)
      const n = randInt(2, 8);
      const boxAnswer = [50, 80, 100, 120, 150, 200][randInt(0, 5)];
      const total = n * boxAnswer;
      question = `${item}を${n}こ買うと、代金は${total}円でした。この${item}1こを□円として、□にあてはまる数を求めなさい。`;
      answer = boxAnswer;
      const wrongs = [answer + 10, Math.max(1, answer - 10), total].filter((v) => v !== answer && v > 0);
      steps = [`□×${n}＝${total}`, `□＝${total}÷${n}＝${answer}`];
      return { category: 'boxEquation3', question, answer, choices: buildChoices(answer, wrongs), steps };
    }
  }

  // 分数の計算（小3）：同分母のたし算・ひき算
  function genFraction3() {
    const pat = randInt(0, 2);
    const d = randInt(3, 9);
    let question, answer, steps;
    if (pat === 0) {
      let a, b;
      do { a = randInt(1, d - 1); b = randInt(1, d - 1); } while (a + b >= d);
      question = `${a}/${d} + ${b}/${d} を計算しなさい。`;
      answer = `${a + b}/${d}`;
      steps = [`分母はそのまま、分子どうしをたす`, `${a} + ${b} = ${a + b}`, `= ${answer}`];
      return { category: 'fraction3', question, questionHtml: stepToHtml(question), answer, choices: buildChoicesFromList(answer, [`${a + b + 1}/${d}`, `${Math.max(1, a + b - 1)}/${d}`, `${a + b}/${d + 1}`]), steps };
    } else if (pat === 1) {
      const a = randInt(2, d - 1);
      const b = randInt(1, a - 1);
      question = `${a}/${d} − ${b}/${d} を計算しなさい。`;
      answer = `${a - b}/${d}`;
      steps = [`分母はそのまま、分子どうしをひく`, `${a} − ${b} = ${a - b}`, `= ${answer}`];
      return { category: 'fraction3', question, questionHtml: stepToHtml(question), answer, choices: buildChoicesFromList(answer, [`${a - b + 1}/${d}`, `${Math.max(1, a - b - 1)}/${d}`, `${a - b}/${d - 1}`]), steps };
    } else {
      // 整数(1)-分数
      const a = randInt(1, d - 1);
      question = `1 − ${a}/${d} を計算しなさい。`;
      answer = `${d - a}/${d}`;
      steps = [`1 = ${d}/${d}`, `${d}/${d} − ${a}/${d} = ${d - a}/${d}`, `= ${answer}`];
      return { category: 'fraction3', question, questionHtml: stepToHtml(question), answer, choices: buildChoicesFromList(answer, [`${d - a + 1}/${d}`, `${Math.max(1, d - a - 1)}/${d}`, `${a}/${d}`]), steps };
    }
  }

  // 分数の文章題（小3）：同分母のたし算・ひき算を使った文章題
  function genFractionWordProblem3() {
    const pat = randInt(0, 2);
    const d = randInt(3, 9);
    let question, answer, steps;
    if (pat === 0) {
      let a, b;
      do { a = randInt(1, d - 1); b = randInt(1, d - 1); } while (a + b >= d);
      const templates = [
        { unit: 'dL', build: (x, y) => `水がコップに${x}/${d}dL入っています。もう1つのコップに${y}/${d}dL入っています。水は全部で何dLありますか。` },
        { unit: 'kg', build: (x, y) => `油が${x}/${d}kgあります。この油を${y}/${d}kgの重さのかんに入れます。重さはあわせて何kgですか。` },
        { unit: 'L', build: (x, y) => `ジュースが${x}/${d}Lあります。もう1本に${y}/${d}L入っています。ジュースは全部で何Lありますか。` },
      ];
      const T = templates[randInt(0, templates.length - 1)];
      question = T.build(a, b);
      answer = `${a + b}/${d}${T.unit}`;
      steps = [`${a}/${d} + ${b}/${d} = ${a + b}/${d}`, `= ${answer}`];
      return { category: 'fractionWordProblem3', question, questionHtml: stepToHtml(question), answer, choices: buildChoicesFromList(answer, [`${a + b + 1}/${d}${T.unit}`, `${Math.max(1, a + b - 1)}/${d}${T.unit}`, `${a + b}/${d + 1}${T.unit}`]), steps };
    } else if (pat === 1) {
      const a = randInt(2, d - 1);
      const b = randInt(1, a - 1);
      const items = [
        { item: 'ジュース', unit: 'L', verb: '飲むと' },
        { item: '水', unit: 'dL', verb: '使うと' },
        { item: 'ジャム', unit: 'kg', verb: '使うと' },
      ];
      const I = items[randInt(0, items.length - 1)];
      question = `${I.item}が${a}/${d}${I.unit}あります。${b}/${d}${I.unit}${I.verb}、のこりは何${I.unit}ですか。`;
      answer = `${a - b}/${d}${I.unit}`;
      steps = [`${a}/${d} − ${b}/${d} = ${a - b}/${d}`, `= ${answer}`];
      return { category: 'fractionWordProblem3', question, questionHtml: stepToHtml(question), answer, choices: buildChoicesFromList(answer, [`${a - b + 1}/${d}${I.unit}`, `${Math.max(1, a - b - 1)}/${d}${I.unit}`, `${a - b}/${d - 1}${I.unit}`]), steps };
    } else {
      // 整数(1本・1つ)-分数
      const a = randInt(1, d - 1);
      const things = [
        { item: 'ロールケーキ', unit: '本', verb: '食べると' },
        { item: 'ようかん', unit: '本', verb: '食べると' },
        { item: 'ピザ', unit: 'まい', verb: '食べると' },
      ];
      const T = things[randInt(0, things.length - 1)];
      question = `${T.item}が1${T.unit}あります。${a}/${d}${T.unit}${T.verb}、のこりは何${T.unit}ですか。`;
      answer = `${d - a}/${d}${T.unit}`;
      steps = [`1 = ${d}/${d}`, `${d}/${d} − ${a}/${d} = ${d - a}/${d}`, `= ${answer}`];
      return { category: 'fractionWordProblem3', question, questionHtml: stepToHtml(question), answer, choices: buildChoicesFromList(answer, [`${d - a + 1}/${d}${T.unit}`, `${Math.max(1, d - a - 1)}/${d}${T.unit}`, `${a}/${d}${T.unit}`]), steps };
    }
  }

  // わり算（小3）：2桁・3桁÷1桁の筆算（あまりあり）、等分の文章題
  function genDivision3() {
    const pat = randInt(0, 2);
    let question, answer, steps;
    if (pat === 0) {
      // 2桁÷1桁(あまりあり)
      const divisor = randInt(2, 9);
      let quotient, remainder, dividend;
      for (let tries = 0; tries < 30; tries++) {
        quotient = randInt(2, Math.floor(99 / divisor));
        remainder = randInt(0, divisor - 1);
        dividend = divisor * quotient + remainder;
        if (dividend >= 10 && dividend <= 99) break;
      }
      question = `${dividend} ÷ ${divisor} を計算しなさい。`;
      answer = remainder === 0 ? `${quotient}` : `${quotient}あまり${remainder}`;
      const wrongCands = remainder === 0
        ? [`${quotient + 1}`, `${Math.max(1, quotient - 1)}`, `${quotient}あまり1`]
        : [`${quotient}あまり${remainder + 1}`, `${quotient + 1}あまり${remainder}`, `${Math.max(0, quotient - 1)}あまり${remainder}`];
      steps = [`${divisor} × ${quotient} = ${divisor * quotient}`, `${dividend} − ${divisor * quotient} = ${remainder}`, `= ${answer}`];
      return { category: 'division3', question, answer, choices: buildChoicesFromList(answer, wrongCands), steps };
    } else if (pat === 1) {
      // 3桁÷1桁(あまりあり)
      const divisor = randInt(2, 9);
      let quotient, remainder, dividend;
      for (let tries = 0; tries < 30; tries++) {
        quotient = randInt(34, Math.floor(999 / divisor));
        remainder = randInt(0, divisor - 1);
        dividend = divisor * quotient + remainder;
        if (dividend >= 100 && dividend <= 999) break;
      }
      question = `${dividend} ÷ ${divisor} を計算しなさい。`;
      answer = remainder === 0 ? `${quotient}` : `${quotient}あまり${remainder}`;
      const wrongCands = remainder === 0
        ? [`${quotient + 1}`, `${Math.max(1, quotient - 1)}`, `${quotient}あまり1`]
        : [`${quotient}あまり${remainder + 1}`, `${quotient + 1}あまり${remainder}`, `${Math.max(0, quotient - 1)}あまり${remainder}`];
      steps = [`${divisor} × ${quotient} = ${divisor * quotient}`, `${dividend} − ${divisor * quotient} = ${remainder}`, `= ${answer}`];
      return { category: 'division3', question, answer, choices: buildChoicesFromList(answer, wrongCands), steps };
    } else {
      // 等分の文章題(わり切れる)
      const divisor = randInt(2, 9);
      const quotient = randInt(20, 200);
      const dividend = divisor * quotient;
      const items = ['カード', 'おはじき', 'あめ', 'シール', '色紙'];
      const item = items[randInt(0, items.length - 1)];
      question = `${item}が${dividend}まいあります。${divisor}人に同じ数ずつ配ります。1人に何まいずつ配れますか。`;
      answer = quotient;
      const wrongs = [quotient + 1, Math.max(1, quotient - 1), dividend].filter((v) => v !== answer && v > 0);
      steps = [`${dividend} ÷ ${divisor} = ${quotient}`, `= ${answer}まい`];
      return { category: 'division3', question, answer, choices: buildChoices(answer, wrongs), steps };
    }
  }

  // 算数の文章題まとめ（小3）：かけ算・わり算の一〜二段階の文章題
  function genWordProblemMulDiv3() {
    const pat = randInt(0, 6);
    let question, answer, wrongs, steps;
    if (pat === 0) {
      const items = ['ガム', 'あめ', 'クッキー', 'ビスケット', 'チョコレート'];
      const item = items[randInt(0, items.length - 1)];
      const perUnit = randInt(2, 30);
      const bags = randInt(2, 40);
      question = `${perUnit}こ入りの${item}のふくろが${bags}ふくろあります。${item}は全部で何こありますか。`;
      answer = perUnit * bags;
      wrongs = [perUnit + bags, bags, perUnit].filter(v => v !== answer && v > 0);
      steps = [`${perUnit} × ${bags} = ${answer}`];
      return { category: 'wordProblemMulDiv3', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 1) {
      const items = ['クッキー', 'あめ', 'どんぐり', 'ビー玉', 'おはじき'];
      const item = items[randInt(0, items.length - 1)];
      const divisor = randInt(2, 9);
      const quotient = randInt(3, 20);
      const total = divisor * quotient;
      question = `${item}が${total}こあります。1ふくろに${divisor}こずつ入れていきます。ふくろは何まいいりますか。`;
      answer = quotient;
      wrongs = [total, divisor, quotient + 1].filter(v => v !== answer && v > 0);
      steps = [`${total} ÷ ${divisor} = ${answer}`];
      return { category: 'wordProblemMulDiv3', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 2) {
      const items = ['ケーキ', 'プリン', 'パン', 'カップケーキ'];
      const item = items[randInt(0, items.length - 1)];
      const price = randInt(50, 300);
      const n = randInt(10, 99);
      question = `子どもが${n}人います。1こ${price}円の${item}を1人1こずつ配ります。${item}の代金は全部で何円ですか。`;
      answer = price * n;
      wrongs = [price + n, price, n].filter(v => v !== answer && v > 0);
      steps = [`${price} × ${n} = ${answer}`];
      return { category: 'wordProblemMulDiv3', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 3) {
      const pairs = [
        { a: 'えん筆', b: 'ボールペン' },
        { a: 'ノート', b: '消しゴム' },
        { a: 'クレヨン', b: '色えんぴつ' },
        { a: 'シール', b: 'カード' },
      ];
      const p = pairs[randInt(0, pairs.length - 1)];
      const a = randInt(2, 9);
      const b = randInt(2, 9);
      const n = randInt(5, 30);
      question = `${n}人に${p.a}を${a}本ずつ、${p.b}を${b}本ずつ配ります。${p.a}と${p.b}は、あわせて何本いりますか。`;
      answer = (a + b) * n;
      wrongs = [a * n, b * n, (a + b) + n].filter(v => v !== answer && v > 0);
      steps = [`(${a} + ${b}) × ${n} = ${answer}`];
      return { category: 'wordProblemMulDiv3', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 4) {
      const colors = ['赤', '青', '黄', '緑'];
      const c1 = colors[randInt(0, colors.length - 1)];
      let c2;
      do { c2 = colors[randInt(0, colors.length - 1)]; } while (c2 === c1);
      const a = randInt(2, 9);
      const b = randInt(2, 9);
      const people = randInt(3, 20);
      const total = (a + b) * people;
      question = `${c1}い色紙${a}まいと、${c2}い色紙${b}まいを1人分にして、色紙は全部で${total}まいくばりました。色紙は何人に配りましたか。`;
      answer = people;
      wrongs = [total, a + b, people + 1].filter(v => v !== answer && v > 0);
      steps = [`${a} + ${b} = ${a + b}`, `${total} ÷ ${a + b} = ${answer}`];
      return { category: 'wordProblemMulDiv3', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 5) {
      const names = ['はると', 'ひなた', 'さくら', 'ゆい', 'そら'];
      let n1 = randInt(0, names.length - 1);
      let n2, n3;
      do { n2 = randInt(0, names.length - 1); } while (n2 === n1);
      do { n3 = randInt(0, names.length - 1); } while (n3 === n1 || n3 === n2);
      const itemCounter = { 'ミニカー': '台', 'シール': 'まい', 'カード': 'まい', 'おりがみ': 'まい' };
      const items = Object.keys(itemCounter);
      const item = items[randInt(0, items.length - 1)];
      const counter = itemCounter[item];
      const base = randInt(2, 9);
      const k1 = randInt(2, 5);
      const k2 = randInt(2, 5);
      question = `${names[n1]}さんは${item}を${base}${counter}持っています。${names[n2]}さんは${names[n1]}さんの${k1}倍、${names[n3]}さんは${names[n2]}さんの${k2}倍持っています。${names[n3]}さんは${item}を何${counter}持っていますか。`;
      answer = base * k1 * k2;
      wrongs = [base * k1, base * k2, base * (k1 + k2)].filter(v => v !== answer && v > 0);
      steps = [`${base} × ${k1} = ${base * k1}`, `${base * k1} × ${k2} = ${answer}`];
      return { category: 'wordProblemMulDiv3', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else {
      const names = ['はると', 'ひなた', 'さくら', 'ゆい', 'そら'];
      let n1 = randInt(0, names.length - 1);
      let n2;
      do { n2 = randInt(0, names.length - 1); } while (n2 === n1);
      const itemCounter = { 'ミニカー': '台', 'シール': 'まい', 'カード': 'まい', '切手': 'まい' };
      const items = Object.keys(itemCounter);
      const item = items[randInt(0, items.length - 1)];
      const counter = itemCounter[item];
      const quotient = randInt(2, 9);
      const k = randInt(2, 9);
      const total = quotient * k;
      question = `${names[n1]}は${item}を${total}${counter}持っています。これは${names[n2]}の持っている${item}の${k}倍にあたります。${names[n2]}が持っている${item}は、何${counter}ですか。`;
      answer = quotient;
      wrongs = [total, total * k, k].filter(v => v !== answer && v > 0);
      steps = [`${total} ÷ ${k} = ${answer}`];
      return { category: 'wordProblemMulDiv3', question, answer, choices: buildChoices(answer, wrongs), steps };
    }
  }

  // わり算の文章題（小4）：2〜3桁÷2桁のわり算文章題、あまりあり
  function genDivWordProblem4() {
    const pat = randInt(0, 4);
    let question, answer, wrongs, steps;
    if (pat === 0) {
      const items = ['色紙', 'おり紙', 'カード', 'シール'];
      const item = items[randInt(0, items.length - 1)];
      const divisor = randInt(10, 40);
      const quotient = randInt(4, 30);
      const dividend = divisor * quotient;
      question = `${dividend}まいの${item}を、同じ数ずつ${divisor}人で分けます。1人分は何まいになりますか。`;
      answer = quotient;
      wrongs = [dividend, divisor, quotient + 1].filter(v => v !== answer && v > 0);
      steps = [`${dividend} ÷ ${divisor} = ${answer}`];
      return { category: 'divWordProblem4', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 1) {
      const items = [
        { name: 'えん筆', counter: '本' },
        { name: 'ノート', counter: 'さつ' },
        { name: '消しゴム', counter: 'こ' },
      ];
      const it = items[randInt(0, items.length - 1)];
      const price = randInt(15, 95);
      const count = randInt(4, 20);
      const money = price * count;
      question = `${money}円では、1${it.counter}${price}円の${it.name}が何${it.counter}買えますか。`;
      answer = count;
      wrongs = [money, price, count + 1].filter(v => v !== answer && v > 0);
      steps = [`${money} ÷ ${price} = ${answer}`];
      return { category: 'divWordProblem4', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 2) {
      const items = ['おかし', 'クッキー', 'みかん', 'りんご'];
      const item = items[randInt(0, items.length - 1)];
      const perBox = randInt(10, 20);
      const boxes = randInt(4, 20);
      const total = perBox * boxes;
      question = `${total}この${item}を${perBox}こずつ箱につめていきます。${perBox}こ入りの箱は何箱できますか。`;
      answer = boxes;
      wrongs = [total, perBox, boxes + 1].filter(v => v !== answer && v > 0);
      steps = [`${total} ÷ ${perBox} = ${answer}`];
      return { category: 'divWordProblem4', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 3) {
      const items = [
        { name: 'えん筆', counter: '本' },
        { name: 'ノート', counter: 'さつ' },
        { name: 'クリアファイル', counter: 'まい' },
      ];
      const it = items[randInt(0, items.length - 1)];
      let price, money, quotient, remainder;
      let guard = 0;
      do {
        price = randInt(15, 95);
        money = randInt(200, 900);
        quotient = Math.floor(money / price);
        remainder = money % price;
        guard++;
      } while ((remainder === 0 || quotient < 2) && guard < 100);
      question = `${money}円で、1${it.counter}${price}円の${it.name}を買おうと思います。${it.name}は何${it.counter}買えて、いくらあまりますか。`;
      answer = `${quotient}${it.counter}買えて、${remainder}円あまる`;
      const wrongCands = [
        `${quotient + 1}${it.counter}買えて、${remainder}円あまる`,
        `${quotient}${it.counter}買えて、${price}円あまる`,
        `${quotient}${it.counter}買えて、${Math.max(1, remainder - 1)}円あまる`,
      ];
      steps = [`${money} ÷ ${price} = ${quotient} あまり ${remainder}`, `= ${answer}`];
      return { category: 'divWordProblem4', question, answer, choices: buildChoicesFromList(answer, wrongCands), steps };
    } else {
      const items = [
        { name: 'ノート', counter: 'さつ' },
        { name: 'えん筆', counter: '本' },
        { name: '色紙', counter: 'まい' },
      ];
      const it = items[randInt(0, items.length - 1)];
      let total, perPerson, quotient, remainder;
      let guard = 0;
      do {
        perPerson = randInt(11, 40);
        total = randInt(50, 300);
        quotient = Math.floor(total / perPerson);
        remainder = total % perPerson;
        guard++;
      } while ((remainder === 0 || quotient < 2) && guard < 100);
      question = `${it.name}が${total}${it.counter}あります。これを1人に${perPerson}${it.counter}ずつ配ると、何人に配ることができて、何${it.counter}あまりますか。`;
      answer = `${quotient}人に配れて、${remainder}${it.counter}あまる`;
      const wrongCands = [
        `${quotient + 1}人に配れて、${remainder}${it.counter}あまる`,
        `${quotient}人に配れて、${perPerson}${it.counter}あまる`,
        `${quotient}人に配れて、${Math.max(1, remainder - 1)}${it.counter}あまる`,
      ];
      steps = [`${total} ÷ ${perPerson} = ${quotient} あまり ${remainder}`, `= ${answer}`];
      return { category: 'divWordProblem4', question, answer, choices: buildChoicesFromList(answer, wrongCands), steps };
    }
  }

  // 小数の文章題（小4）：たし算・ひき算の文章題、単位換算あり
  function formatDecFromCents(cents) {
    if (cents % 10 === 0) return (cents / 100).toFixed(1);
    return (cents / 100).toFixed(2);
  }
  function genDecWordProblem4() {
    const pat = randInt(0, 3);
    let question, answer, steps;
    if (pat === 0) {
      const templates = [
        () => {
          const box = randInt(105, 495);
          const w = randInt(105, 995);
          return {
            q: `重さが${formatDecFromCents(box)}kgの箱に、りんごを${formatDecFromCents(w)}kg入れました。全体の重さは何kgですか。`,
            unit: 'kg', a: box, b: w,
          };
        },
        () => {
          const big = randInt(505, 995);
          const small = randInt(105, 495);
          return {
            q: `大小2つの水そうに水を入れます。大きい水そうには${formatDecFromCents(big)}L、小さい水そうには${formatDecFromCents(small)}L入れました。全部で何Lの水を入れましたか。`,
            unit: 'L', a: big, b: small,
          };
        },
        () => {
          const a = randInt(205, 495);
          const b = randInt(205, 495);
          return {
            q: `走りはばとびをしたときの記録は、たろう君が${formatDecFromCents(a)}m、はなこさんが${formatDecFromCents(b)}mでした。2人あわせた長さは何mですか。`,
            unit: 'm', a, b,
          };
        },
      ];
      const t = templates[randInt(0, templates.length - 1)]();
      question = t.q;
      const total = t.a + t.b;
      answer = `${formatDecFromCents(total)}${t.unit}`;
      const wrongCands = [
        `${formatDecFromCents(t.a)}${t.unit}`,
        `${formatDecFromCents(total + 10)}${t.unit}`,
        `${formatDecFromCents(Math.max(1, total - 10))}${t.unit}`,
      ];
      steps = [`${formatDecFromCents(t.a)} + ${formatDecFromCents(t.b)} = ${formatDecFromCents(total)}`];
      return { category: 'decWordProblem4', question, answer, choices: buildChoicesFromList(answer, wrongCands), steps };
    } else if (pat === 1) {
      const kind = randInt(0, 1);
      let wrongCands;
      if (kind === 0) {
        const bigL = randInt(105, 495);
        const dLraw = randInt(11, 99);
        const smallLcents = dLraw * 10;
        question = `牛にゅうが、大きいびんに${formatDecFromCents(bigL)}L、小さいびんに${dLraw}dL入っています。あわせて何Lありますか。`;
        const total = bigL + smallLcents;
        answer = `${formatDecFromCents(total)}L`;
        wrongCands = [
          `${formatDecFromCents(bigL + dLraw)}L`,
          `${formatDecFromCents(total + 10)}L`,
          `${formatDecFromCents(Math.max(1, total - 10))}L`,
        ];
        steps = [`${dLraw}dL = ${formatDecFromCents(smallLcents)}L`, `${formatDecFromCents(bigL)} + ${formatDecFromCents(smallLcents)} = ${formatDecFromCents(total)}`];
      } else {
        const kmCents = randInt(105, 495);
        const mRaw = randInt(10, 99) * 10;
        const mAsKmCents = mRaw / 10;
        question = `たろう君の家から学校までの道のりは${mRaw}m、学校から駅までの道のりは${formatDecFromCents(kmCents)}kmあります。家から学校を通って駅まで行く道のりは何kmありますか。`;
        const total = kmCents + mAsKmCents;
        answer = `${formatDecFromCents(total)}km`;
        wrongCands = [
          `${formatDecFromCents(kmCents + mRaw)}km`,
          `${formatDecFromCents(total + 10)}km`,
          `${formatDecFromCents(Math.max(1, total - 10))}km`,
        ];
        steps = [`${mRaw}m = ${formatDecFromCents(mAsKmCents)}km`, `${formatDecFromCents(kmCents)} + ${formatDecFromCents(mAsKmCents)} = ${formatDecFromCents(total)}`];
      }
      return { category: 'decWordProblem4', question, answer, choices: buildChoicesFromList(answer, wrongCands), steps };
    } else if (pat === 2) {
      const templates = [
        { unit: 'm', name: 'リボン', verb: '使いました' },
        { unit: 'L', name: 'ジュース', verb: '飲みました' },
        { unit: 'kg', name: '砂糖', verb: '使いました' },
      ];
      const t = templates[randInt(0, templates.length - 1)];
      let a, b;
      do { a = randInt(205, 995); b = randInt(105, 895); } while (b >= a);
      question = `${t.name}が${formatDecFromCents(a)}${t.unit}ありました。${formatDecFromCents(b)}${t.unit}${t.verb}。残りは何${t.unit}ですか。`;
      const diff = a - b;
      answer = `${formatDecFromCents(diff)}${t.unit}`;
      const wrongCands = [
        `${formatDecFromCents(a + b)}${t.unit}`,
        `${formatDecFromCents(diff + 10)}${t.unit}`,
        `${formatDecFromCents(Math.max(1, diff - 10))}${t.unit}`,
      ];
      steps = [`${formatDecFromCents(a)} - ${formatDecFromCents(b)} = ${formatDecFromCents(diff)}`];
      return { category: 'decWordProblem4', question, answer, choices: buildChoicesFromList(answer, wrongCands), steps };
    } else {
      const templates = [
        { unit: 'm', build: (a, b) => `赤いテープの長さは${a}m、青いテープの長さは${b}mです。長さのちがいは何mですか。` },
        { unit: 'kg', build: (a, b) => `たろう君のランドセルの重さは${a}kg、はなこさんのランドセルの重さは${b}kgです。重さのちがいは何kgですか。` },
        { unit: 'L', build: (a, b) => `大きいバケツには水が${a}L、小さいバケツには水が${b}L入っています。かさのちがいは何Lですか。` },
      ];
      const t = templates[randInt(0, templates.length - 1)];
      let a, b;
      do { a = randInt(205, 995); b = randInt(105, 895); } while (b >= a);
      question = t.build(formatDecFromCents(a), formatDecFromCents(b));
      const diff = a - b;
      answer = `${formatDecFromCents(diff)}${t.unit}`;
      const wrongCands = [
        `${formatDecFromCents(a + b)}${t.unit}`,
        `${formatDecFromCents(diff + 10)}${t.unit}`,
        `${formatDecFromCents(Math.max(1, diff - 10))}${t.unit}`,
      ];
      steps = [`${formatDecFromCents(a)} - ${formatDecFromCents(b)} = ${formatDecFromCents(diff)}`];
      return { category: 'decWordProblem4', question, answer, choices: buildChoicesFromList(answer, wrongCands), steps };
    }
  }

  // 真分数・仮分数・帯分数（小4）：分類と相互変換
  function genFracType4() {
    const pat = randInt(0, 2);
    let question, answer, steps;
    if (pat === 0) {
      const kind = randInt(0, 2);
      let fracText;
      if (kind === 0) {
        const den = randInt(3, 12);
        const num = randInt(1, den - 1);
        fracText = `${num}/${den}`;
        answer = '真分数';
      } else if (kind === 1) {
        const den = randInt(2, 9);
        const num = randInt(den, den * 3);
        fracText = `${num}/${den}`;
        answer = '仮分数';
      } else {
        const den = randInt(2, 9);
        const whole = randInt(1, 6);
        const rem = randInt(1, den - 1);
        fracText = `${whole}と${rem}/${den}`;
        answer = '帯分数';
      }
      question = `次の分数は、真分数・仮分数・帯分数のどれですか。 ${fracText}`;
      steps = [`${fracText} は${answer}`];
      return { category: 'fracType4', question, questionHtml: stepToHtml(question), answer, choices: shuffle(['真分数', '仮分数', '帯分数']), steps };
    } else if (pat === 1) {
      const den = randInt(2, 9);
      const whole = randInt(1, 6);
      const rem = randInt(1, den - 1);
      const num = whole * den + rem;
      question = `${num}/${den} を帯分数で表しなさい。`;
      answer = `${whole}と${rem}/${den}`;
      const wrongCands = [
        `${whole + 1}と${rem}/${den}`,
        `${whole + 2}と${rem}/${den}`,
        `${whole + 3}と${rem}/${den}`,
      ];
      steps = [`${num} ÷ ${den} = ${whole} あまり ${rem}`, `= ${answer}`];
      return { category: 'fracType4', question, questionHtml: stepToHtml(question), answer, choices: buildChoicesFromList(answer, wrongCands), steps };
    } else {
      const den = randInt(2, 9);
      const whole = randInt(1, 6);
      const rem = randInt(1, den - 1);
      question = `${whole}と${rem}/${den} を仮分数で表しなさい。`;
      const num = whole * den + rem;
      answer = `${num}/${den}`;
      const wrongCands = [
        `${num + 1}/${den}`,
        `${Math.max(1, num - 1)}/${den}`,
        `${whole * den}/${den}`,
      ];
      steps = [`${whole} × ${den} + ${rem} = ${num}`, `= ${answer}`];
      return { category: 'fracType4', question, questionHtml: stepToHtml(question), answer, choices: buildChoicesFromList(answer, wrongCands), steps };
    }
  }

  // 文章題特訓：和差算（小4）：和と差から2つの数量を求めるチャレンジ文章題
  function genSumDiffWordProblem4() {
    const pat = randInt(0, 5);
    let question, answer, wrongs, steps;
    if (pat === 0) {
      const small = randInt(20, 300);
      const diff = randInt(5, 100);
      const large = small + diff;
      const sum = small + large;
      const askLarge = Math.random() < 0.5;
      question = `大小2つの数があります。その2つの数の和は${sum}で、差は${diff}です。${askLarge ? '大きい' : '小さい'}ほうの数はいくらですか。`;
      answer = askLarge ? large : small;
      wrongs = [askLarge ? small : large, sum, diff].filter(v => v !== answer && v > 0);
      steps = askLarge
        ? [`(${sum} + ${diff}) ÷ 2 = ${answer}`]
        : [`(${sum} - ${diff}) ÷ 2 = ${answer}`];
      return { category: 'sumDiffWordProblem4', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 1) {
      const girls = randInt(10, 40);
      const diffBG = randInt(2, Math.min(15, girls - 1));
      const boysMore = Math.random() < 0.5;
      const boys = boysMore ? girls + diffBG : girls - diffBG;
      const total = girls + boys;
      const askGirls = Math.random() < 0.5;
      question = `あるクラスの児童の人数は${total}人です。男子が女子より${diffBG}人${boysMore ? '多い' : '少ない'}とき、このクラスの${askGirls ? '女子' : '男子'}は何人ですか。`;
      answer = askGirls ? girls : boys;
      wrongs = [askGirls ? boys : girls, total, diffBG].filter(v => v !== answer && v > 0);
      steps = [`求める人数を求める`, `= ${answer}人`];
      return { category: 'sumDiffWordProblem4', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 2) {
      const pairs = [
        { big: 'Aさん', small: 'Bさん' },
        { big: 'お姉さん', small: 'はなこさん' },
        { big: 'お兄さん', small: '弟' },
      ];
      const p = pairs[randInt(0, pairs.length - 1)];
      const small = randInt(200, 2000);
      const diff = randInt(50, 500);
      const big = small + diff;
      const total = small + big;
      const askBig = Math.random() < 0.5;
      question = `${p.big}は${p.small}より${diff}円多くお金を持っています。2人の持っているお金の合計は${total}円です。${askBig ? p.big : p.small}の持っているお金はいくらですか。`;
      answer = askBig ? big : small;
      wrongs = [askBig ? small : big, total, diff].filter(v => v !== answer && v > 0);
      steps = askBig
        ? [`(${total} + ${diff}) ÷ 2 = ${answer}`]
        : [`(${total} - ${diff}) ÷ 2 = ${answer}`];
      return { category: 'sumDiffWordProblem4', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 3) {
      const pairs = [
        { big: 'お母さん', small: 'たろう君', childMin: 5, childMax: 15, gapMin: 20, gapMax: 35 },
        { big: 'お父さん', small: 'はなこさん', childMin: 5, childMax: 15, gapMin: 20, gapMax: 35 },
        { big: 'お姉さん', small: '妹', childMin: 3, childMax: 12, gapMin: 2, gapMax: 8 },
      ];
      const p = pairs[randInt(0, pairs.length - 1)];
      const small = randInt(p.childMin, p.childMax);
      const diff = randInt(p.gapMin, p.gapMax);
      const big = small + diff;
      const sum = small + big;
      const askBig = Math.random() < 0.5;
      question = `${p.small}と${p.big}の年れいの和は${sum}才です。${p.big}と${p.small}の年れいの差は${diff}才です。${askBig ? p.big : p.small}は何才ですか。`;
      answer = askBig ? big : small;
      wrongs = [askBig ? small : big, sum, diff].filter(v => v !== answer && v > 0);
      steps = askBig
        ? [`(${sum} + ${diff}) ÷ 2 = ${answer}`]
        : [`(${sum} - ${diff}) ÷ 2 = ${answer}`];
      return { category: 'sumDiffWordProblem4', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 4) {
      const tate = randInt(20, 150);
      const diff = randInt(5, 80);
      const yoko = tate + diff;
      const perimeter = 2 * (tate + yoko);
      const askYoko = Math.random() < 0.5;
      question = `長方形の形をした土地があります。この土地のまわりの長さは${perimeter}mで、横の長さはたての長さより${diff}m長いそうです。この土地の${askYoko ? '横' : 'たて'}の長さは何mですか。`;
      answer = askYoko ? yoko : tate;
      const half = tate + yoko;
      wrongs = [askYoko ? tate : yoko, half, perimeter].filter(v => v !== answer && v > 0);
      steps = askYoko
        ? [`${perimeter} ÷ 2 = ${half}`, `(${half} + ${diff}) ÷ 2 = ${answer}`]
        : [`${perimeter} ÷ 2 = ${half}`, `(${half} - ${diff}) ÷ 2 = ${answer}`];
      return { category: 'sumDiffWordProblem4', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else {
      const pairs = [
        { big: 'ノート', small: '消しゴム' },
        { big: '本', small: 'しおり' },
        { big: '色えんぴつ', small: 'えんぴつ' },
      ];
      const p = pairs[randInt(0, pairs.length - 1)];
      const small = randInt(20, 150);
      const diff = randInt(5, 80);
      const big = small + diff;
      const total = small + big;
      const askBig = Math.random() < 0.5;
      question = `${p.big}と${p.small}を買い、合計で${total}円でした。${p.small}のねだんは${p.big}より${diff}円安かったです。${askBig ? p.big : p.small}のねだんはいくらでしたか。`;
      answer = askBig ? big : small;
      wrongs = [askBig ? small : big, total, diff].filter(v => v !== answer && v > 0);
      steps = askBig
        ? [`(${total} + ${diff}) ÷ 2 = ${answer}`]
        : [`(${total} - ${diff}) ÷ 2 = ${answer}`];
      return { category: 'sumDiffWordProblem4', question, answer, choices: buildChoices(answer, wrongs), steps };
    }
  }

  // 四則計算（小4）：かっこ・×÷の優先順位（負の数は使わない）
  function genFourOps4() {
    const pattern = randInt(0, 8);
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
    } else if (pattern === 3) {
      const a = randInt(2, 20), b = randInt(2, 20), c = randInt(2, 9);
      const useMinus = a > b && Math.random() < 0.5;
      const inner = useMinus ? a - b : a + b;
      answer = inner * c;
      question = `(${a} ${useMinus ? '−' : '+'} ${b}) × ${c} = ?`;
      const wrongMisreadNoParen = useMinus ? a - b * c : a + b * c;
      wrongs = [wrongMisreadNoParen, inner + c, a * c + (useMinus ? -b : b)];
      steps = [`かっこの中を先に計算: ${a} ${useMinus ? '−' : '+'} ${b} = ${inner}`, `= ${inner} × ${c} = ${answer}`];
    } else if (pattern === 4) {
      // (a±b) ÷ c ＝きれいに割り切れるよう内側の値を先に作る
      const c = randInt(2, 9), q = randInt(2, 9);
      const inner = c * q;
      const useMinus = Math.random() < 0.5;
      let a, b;
      if (useMinus) { b = randInt(1, 15); a = inner + b; } else { b = randInt(1, inner - 1); a = inner - b; }
      answer = q;
      question = `(${a} ${useMinus ? '−' : '+'} ${b}) ÷ ${c} = ?`;
      const wrongMisreadNoParen = useMinus ? a - b / c : a + b / c;
      wrongs = [wrongMisreadNoParen, inner - c, inner * c];
      steps = [`かっこの中を先に計算: ${a} ${useMinus ? '−' : '+'} ${b} = ${inner}`, `= ${inner} ÷ ${c} = ${answer}`];
    } else if (pattern === 5) {
      // c × (a±b)：かっこが右側にくる形
      const a = randInt(2, 20), b = randInt(2, 20), c = randInt(2, 9);
      const useMinus = a > b && Math.random() < 0.5;
      const inner = useMinus ? a - b : a + b;
      answer = c * inner;
      question = `${c} × (${a} ${useMinus ? '−' : '+'} ${b}) = ?`;
      const wrongMisreadNoParen = useMinus ? c * a - b : c * a + b;
      wrongs = [wrongMisreadNoParen, inner + c, c * a + (useMinus ? -b : b)];
      steps = [`かっこの中を先に計算: ${a} ${useMinus ? '−' : '+'} ${b} = ${inner}`, `= ${c} × ${inner} = ${answer}`];
    } else if (pattern === 6) {
      // c ÷ (a±b)：かっこの中がわり算の相手になる形
      const q = randInt(2, 9), innerVal = randInt(2, 9);
      const c = q * innerVal;
      const useMinus = Math.random() < 0.5;
      let a, b;
      if (useMinus) { b = randInt(1, 15); a = innerVal + b; } else { b = randInt(1, innerVal - 1); a = innerVal - b; }
      answer = q;
      question = `${c} ÷ (${a} ${useMinus ? '−' : '+'} ${b}) = ?`;
      const wrongMisreadNoParen = useMinus ? c / a - b : c / a + b;
      wrongs = [wrongMisreadNoParen, c - innerVal, c * innerVal];
      steps = [`かっこの中を先に計算: ${a} ${useMinus ? '−' : '+'} ${b} = ${innerVal}`, `= ${c} ÷ ${innerVal} = ${answer}`];
    } else if (pattern === 7) {
      // a ÷ b + c × d：かっこなしで、わり算とかけ算の2つの項を+でつなぐ
      const b = randInt(2, 9), q = randInt(2, 9), a = b * q;
      const c = randInt(2, 9), d = randInt(2, 9);
      const cd = c * d;
      answer = q + cd;
      question = `${a} ÷ ${b} + ${c} × ${d} = ?`;
      wrongs = [(a / b + c) * d, a / (b + c) * d, q * d + c];
      steps = [`÷ と × をそれぞれ先に計算: ${a} ÷ ${b} = ${q}、${c} × ${d} = ${cd}`, `= ${q} + ${cd} = ${answer}`];
    } else {
      // a ± b × c ÷ d：かっこなしで、×÷のチェーンを先に計算してから+-
      const d = randInt(2, 9), m = randInt(2, 9), b = randInt(2, 9);
      const c = d * m;
      const chain = b * m;
      const useMinus = Math.random() < 0.5;
      const a = useMinus ? chain + randInt(10, 500) : randInt(1, 50);
      answer = useMinus ? a - chain : a + chain;
      question = `${a} ${useMinus ? '−' : '+'} ${b} × ${c} ÷ ${d} = ?`;
      const wrongLeftToRight = useMinus ? (a - b) * c / d : (a + b) * c / d;
      wrongs = [wrongLeftToRight, useMinus ? a - b * c : a + b * c, chain + (useMinus ? -d : d)];
      steps = [`× と ÷ を先に計算: ${b} × ${c} = ${b * c}、${b * c} ÷ ${d} = ${chain}`, `= ${a} ${useMinus ? '−' : '+'} ${chain} = ${answer}`];
    }

    wrongs = wrongs.map(Math.round);
    return { category: 'fourOps4', question, answer, choices: buildChoices(answer, wrongs), steps };
  }

  // 分数のたし算・ひき算（通分・約分あり、小5）
  function genFracAddSub5() {
    if (randInt(0, 1) === 1) return genMixedFracAddSub5_();
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

  // 帯分数どうしのたし算・ひき算（分母が異なる、繰り上がり・繰り下がりあり、小5）
  function mixedFracStr_(whole, n, d) {
    if (n === 0) return `${whole}`;
    return whole === 0 ? `${n}/${d}` : `${whole} ${n}/${d}`;
  }
  function genMixedFracAddSub5_() {
    let d1, n1, w1 = randInt(1, 4);
    do { d1 = randInt(2, 9); n1 = randInt(1, d1 - 1); } while (gcdFrac(n1, d1) !== 1);
    let d2, n2, w2 = randInt(1, 4);
    do { d2 = randInt(2, 9); } while (d2 === d1);
    do { n2 = randInt(1, d2 - 1); } while (gcdFrac(n2, d2) !== 1);

    const isAdd = Math.random() < 0.5;
    const L = lcmFrac(d1, d2);
    let N1 = n1 * (L / d1), N2 = n2 * (L / d2);

    // ひき算は大きい方から小さい方を引く(答えが負にならないようにする)。
    if (!isAdd && (w1 * L + N1) < (w2 * L + N2)) {
      [w1, w2] = [w2, w1]; [n1, n2] = [n2, n1]; [d1, d2] = [d2, d1];
      N1 = n1 * (L / d1); N2 = n2 * (L / d2);
    }

    const opSym = isAdd ? '+' : '−';
    const question = `${mixedFracStr_(w1, n1, d1)} ${opSym} ${mixedFracStr_(w2, n2, d2)} = ?`;

    let wholeAns, numAns;
    if (isAdd) {
      wholeAns = w1 + w2;
      numAns = N1 + N2;
      if (numAns >= L) { numAns -= L; wholeAns += 1; }
    } else {
      wholeAns = w1 - w2;
      numAns = N1 - N2;
      if (numAns < 0) { numAns += L; wholeAns -= 1; }
    }
    const [rn, rd] = reduceFrac(numAns, L);
    const answer = mixedFracStr_(wholeAns, rn, rd);

    // 誤答候補: 繰り上がり/繰り下がりを忘れた場合、約分し忘れた場合、通分せず分母をそのまま足した場合
    const wrongNoCarry = mixedFracStr_(isAdd ? w1 + w2 : w1 - w2, isAdd ? N1 + N2 : Math.abs(N1 - N2), L);
    const wrongUnreduced = (rn === numAns && rd === L) ? null : mixedFracStr_(wholeAns, numAns, L);
    const wrongWrongDenom = mixedFracStr_(isAdd ? w1 + w2 : Math.abs(w1 - w2), n1 + n2, d1 + d2);
    const candidates = [wrongNoCarry, wrongUnreduced, wrongWrongDenom].filter(v => v && v !== answer);

    const steps = [
      `通分する: 分母を最小公倍数 ${L} にそろえる`,
      `${mixedFracStr_(w1, n1, d1)} = ${w1}と${N1}/${L}、${mixedFracStr_(w2, n2, d2)} = ${w2}と${N2}/${L}`,
      isAdd ? `整数部分どうし、分数部分どうしをたす（繰り上がりに注意）` : `整数部分どうし、分数部分どうしをひく（繰り下がりに注意）`,
      `= ${answer}`,
    ];
    return { category: 'fracAddSub5', question, questionHtml: stepToHtml(question), answer, choices: buildChoicesFromSet(answer, candidates), steps };
  }

  // 小数と分数のたし算・ひき算（小5）。答えは分数で表す。
  function genDecFracAddSub5() {
    const decTenths = randInt(1, 99); // 0.1〜9.9
    const decStr = (decTenths / 10).toFixed(1);
    const n1 = decTenths, d1 = 10; // 小数を分数(未約分)として扱う
    const [n2, d2] = randFrac(9);

    const isAdd = Math.random() < 0.5;
    const L = lcmFrac(d1, d2);
    const N1 = n1 * (L / d1);
    const N2 = n2 * (L / d2);

    // ひき算のときは大きい方から小さい方を引く(答えが負にならないようにする)。
    const decimalFirst = isAdd ? Math.random() < 0.5 : N1 >= N2;
    const opSym = isAdd ? '+' : '−';
    const question = decimalFirst
      ? `${decStr} ${opSym} ${n2}/${d2} = ?`
      : `${n2}/${d2} ${opSym} ${decStr} = ?`;

    const numAns = isAdd ? N1 + N2 : Math.abs(N1 - N2);
    const denAns = L;
    const answer = fracToStr(numAns, denAns);

    const [, rd] = reduceFrac(numAns, denAns);
    const wrongUnreduced = denAns === rd ? null : `${numAns}/${denAns}`;
    const wrongAddDenom = `${n1 + n2}/${d1 + d2}`;
    const wrongNumOnly = `${n1 + n2}/${L}`;
    const candidates = [wrongUnreduced, wrongAddDenom, wrongNumOnly].filter(Boolean);

    const steps = [
      `${decStr} を分数に直す: ${decStr} = ${n1}/${d1}`,
      `通分する: 分母を最小公倍数 ${L} にそろえる`,
      `${n1}/${d1} = ${N1}/${L}、${n2}/${d2} = ${N2}/${L}`,
      `${decimalFirst ? `${N1}/${L} ${opSym} ${N2}/${L}` : `${N2}/${L} ${opSym} ${N1}/${L}`} = ${numAns}/${denAns}`,
      `= ${answer}`,
    ];
    return { category: 'decFracAddSub5', question, questionHtml: stepToHtml(question), answer, choices: buildChoicesFromSet(answer, candidates), steps };
  }

  // 約分・通分（小5）
  function genFracReduceConvert5() {
    const pat = randInt(0, 2);
    if (pat === 0) {
      // 約分：既約分数を作り、それを何倍かした分数を約分できるか問う
      let n0, d0;
      do {
        d0 = randInt(2, 9);
        n0 = randInt(1, d0 - 1);
      } while (gcdFrac(n0, d0) !== 1);
      const g = randInt(2, 5);
      const n = n0 * g, d = d0 * g;
      const question = `${n}/${d} を約分すると？`;
      const answer = `${n0}/${d0}`;
      const candidates = [`${n}/${d}`, `${n0 * 2}/${d0 * 2}`, `${n0}/${d0 + 1}`];
      const steps = [`${n}と${d}の最大公約数は ${g}`, `${n}/${d} = ${n0}/${d0}`];
      return { category: 'fracReduceConvert5', question, questionHtml: stepToHtml(question), answer, choices: buildChoicesFromSet(answer, candidates), steps };
    } else if (pat === 1) {
      // 通分：共通の分母（最小公倍数）を求める
      let d1, d2;
      do { d1 = randInt(2, 9); d2 = randInt(2, 9); } while (d1 === d2 || d2 % d1 === 0 || d1 % d2 === 0);
      const n1 = randInt(1, d1 - 1), n2 = randInt(1, d2 - 1);
      const L = lcmFrac(d1, d2);
      const question = `${n1}/${d1} と ${n2}/${d2} を通分するとき、共通の分母はいくつ？`;
      const answer = L;
      const wrongs = [d1 * d2, L + Math.max(d1, d2), Math.max(d1, d2)].filter(v => v !== L);
      const steps = [`${d1}と${d2}の最小公倍数を求める`, `= ${L}`];
      return { category: 'fracReduceConvert5', question, questionHtml: stepToHtml(question), answer, choices: buildChoices(answer, wrongs), steps };
    } else {
      // 通分：同じ大きさの分数に直す
      let d1, d2;
      do { d1 = randInt(2, 9); d2 = randInt(2, 9); } while (d1 === d2 || d2 % d1 === 0 || d1 % d2 === 0);
      const n1 = randInt(1, d1 - 1);
      const L = lcmFrac(d1, d2);
      const mult = L / d1;
      const question = `${n1}/${d1} を、分母が${L}の分数に直すと？`;
      const answer = `${n1 * mult}/${L}`;
      const candidates = [`${n1}/${L}`, `${n1 * mult + 1}/${L}`, `${(n1 * mult) - mult}/${L}`].filter(c => parseInt(c.split('/')[0], 10) !== 0);
      const steps = [`${d1} × ${mult} = ${L} なので、分子と分母に${mult}をかける`, `${n1} × ${mult} = ${n1 * mult}`, `= ${n1 * mult}/${L}`];
      return { category: 'fracReduceConvert5', question, questionHtml: stepToHtml(question), answer, choices: buildChoicesFromSet(answer, candidates), steps };
    }
  }

  // 小数のかけ算（小5、小数×小数）
  function genDecMul5() {
    const pat = randInt(0, 4);
    let question, answer, candidates, steps;
    if (pat === 0) {
      // 1桁小数×1桁小数（どちらも10未満）
      let aTenths, bTenths;
      do { aTenths = randInt(11, 99); } while (aTenths % 10 === 0);
      do { bTenths = randInt(11, 99); } while (bTenths % 10 === 0);
      const productHundredths = aTenths * bTenths;
      const a = (aTenths / 10).toFixed(1);
      const b = (bTenths / 10).toFixed(1);
      answer = (productHundredths / 100).toString();
      question = `${a} × ${b} = ?`;
      candidates = [
        ((productHundredths + 10) / 100).toString(),
        (Math.max(1, productHundredths - 10) / 100).toString(),
        ((productHundredths + 100) / 100).toString(),
        (Math.round(productHundredths / 10) / 10).toString(),
      ];
      steps = [
        `${aTenths} × ${bTenths} = ${productHundredths}（0.01のまとまりが${productHundredths}個）`,
        `= ${answer}`,
      ];
    } else if (pat === 1) {
      // 1桁小数×1桁小数（10以上の数を含む、例: 19.6×20.3）
      let aTenths, bTenths;
      do { aTenths = randInt(101, 299); } while (aTenths % 10 === 0);
      do { bTenths = randInt(101, 299); } while (bTenths % 10 === 0);
      const productHundredths = aTenths * bTenths;
      const a = (aTenths / 10).toFixed(1);
      const b = (bTenths / 10).toFixed(1);
      answer = (productHundredths / 100).toString();
      question = `${a} × ${b} = ?`;
      candidates = [
        ((productHundredths + 10) / 100).toString(),
        (Math.max(1, productHundredths - 10) / 100).toString(),
        ((productHundredths + 100) / 100).toString(),
        (Math.round(productHundredths / 10) / 10).toString(),
      ];
      steps = [
        `${aTenths} × ${bTenths} = ${productHundredths}（0.01のまとまりが${productHundredths}個）`,
        `= ${answer}`,
      ];
    } else if (pat === 2) {
      // 2桁小数×1桁小数（順序はランダム、例: 3.28×4.5, 0.13×2.4）
      let aHundredths, bTenths;
      do { aHundredths = randInt(1, 999); } while (aHundredths % 10 === 0);
      do { bTenths = randInt(11, 99); } while (bTenths % 10 === 0);
      const productThousandths = aHundredths * bTenths;
      const aStr = (aHundredths / 100).toFixed(2);
      const bStr = (bTenths / 10).toFixed(1);
      answer = (productThousandths / 1000).toString();
      question = Math.random() < 0.5 ? `${bStr} × ${aStr} = ?` : `${aStr} × ${bStr} = ?`;
      candidates = [
        ((productThousandths + 100) / 1000).toString(),
        (Math.max(1, productThousandths - 100) / 1000).toString(),
        ((productThousandths + 1000) / 1000).toString(),
        (Math.round(productThousandths / 100) / 100).toString(),
      ];
      steps = [
        `${aHundredths} × ${bTenths} = ${productThousandths}（0.001のまとまりが${productThousandths}個）`,
        `= ${answer}`,
      ];
    } else if (pat === 3) {
      // 整数×1桁小数（順序はランダム、例: 587×2.1, 135×3.6）
      const whole = randInt(2, 999);
      let decTenths;
      do { decTenths = randInt(11, 99); } while (decTenths % 10 === 0);
      const productTenths = whole * decTenths;
      const decStr = (decTenths / 10).toFixed(1);
      answer = (productTenths / 10).toString();
      question = Math.random() < 0.5 ? `${decStr} × ${whole} = ?` : `${whole} × ${decStr} = ?`;
      candidates = [
        ((productTenths + 1) / 10).toString(),
        (Math.max(1, productTenths - 1) / 10).toString(),
        ((productTenths + 10) / 10).toString(),
        String(whole * Math.round(decTenths / 10)),
      ];
      steps = [
        `${whole} × ${decTenths} = ${productTenths}（0.1のまとまりが${productTenths}個）`,
        `= ${answer}`,
      ];
    } else if (Math.random() < 0.5) {
      // 1未満の2桁小数×1未満の1桁小数（例: 0.44×0.3）
      let aHundredths, bTenths;
      aHundredths = randInt(1, 99);
      bTenths = randInt(1, 9);
      const productThousandths = aHundredths * bTenths;
      const aStr = '0.' + String(aHundredths).padStart(2, '0');
      const bStr = '0.' + String(bTenths);
      answer = (productThousandths / 1000).toString();
      question = `${aStr} × ${bStr} = ?`;
      candidates = [
        ((productThousandths + 10) / 1000).toString(),
        (Math.max(1, productThousandths - 10) / 1000).toString(),
        ((productThousandths + 100) / 1000).toString(),
        (Math.round(productThousandths / 10) / 100).toString(),
      ];
      steps = [
        `${aHundredths} × ${bTenths} = ${productThousandths}（0.001のまとまりが${productThousandths}個）`,
        `= ${answer}`,
      ];
    } else {
      // 1未満の1桁小数どうし（例: 0.2×0.4）
      const aTenths = randInt(1, 9);
      const bTenths = randInt(1, 9);
      const productHundredths = aTenths * bTenths;
      const aStr = '0.' + String(aTenths);
      const bStr = '0.' + String(bTenths);
      answer = (productHundredths / 100).toString();
      question = `${aStr} × ${bStr} = ?`;
      candidates = [
        ((productHundredths + 1) / 100).toString(),
        (Math.max(1, productHundredths - 1) / 100).toString(),
        ((productHundredths + 10) / 100).toString(),
        (aTenths * bTenths / 10).toString(),
      ];
      steps = [
        `${aTenths} × ${bTenths} = ${productHundredths}（0.01のまとまりが${productHundredths}個）`,
        `= ${answer}`,
      ];
    }
    return { category: 'decMul5', question, answer, choices: buildChoicesFromList(answer, candidates), steps };
  }

  // 小数のわり算：類題(文章題)の共通部品(わる数・商・わられる数の3つ組を作る)
  function mkCleanDecPair_(divMin, divMax, qMin, qMax) {
    const divisorTenths = randInt(divMin, divMax);
    const quotient = randInt(qMin, qMax);
    const dividendTenths = divisorTenths * quotient;
    return { divisor: (divisorTenths / 10).toString(), quotient, dividend: (dividendTenths / 10).toString() };
  }
  // 小数のわり算（小5、商は整数になる）
  function genDecDiv5() {
    const pat = randInt(0, 9);
    let question, answer, wrongs, candidates, steps;
    if (pat === 5) {
      const items = ['布', 'リボン', 'ロープ'];
      const item = items[randInt(0, items.length - 1)];
      const k = 2 * randInt(2, 8) + 1;
      const lengthStr = (k / 2).toFixed(1);
      const unitPrice = randInt(15, 250) * 2;
      const totalPrice = (k * unitPrice) / 2;
      question = `${lengthStr}mが${totalPrice}円の${item}があります。この${item}の1mのねだんは何円ですか。`;
      answer = unitPrice;
      wrongs = [totalPrice, unitPrice + 10, Math.max(1, unitPrice - 10)].filter(v => v !== answer && v > 0);
      steps = [`${totalPrice} ÷ ${lengthStr} = ${answer}`];
      return { category: 'decDiv5', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 6) {
      const { divisor, quotient, dividend } = mkCleanDecPair_(11, 99, 2, 30);
      question = `横の長さが${divisor}m、面積が${dividend}m²の長方形の土地があります。この土地のたての長さは何mですか。`;
      answer = quotient;
      wrongs = [quotient + 1, quotient + 2, Math.max(1, quotient - 1), Math.max(1, quotient - 2)].filter(v => v !== answer && v > 0);
      steps = [`${dividend} ÷ ${divisor} = ${answer}`];
      return { category: 'decDiv5', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 7) {
      const { divisor, quotient, dividend } = mkCleanDecPair_(11, 40, 3, 30);
      question = `${dividend}Lの牛にゅうを${divisor}L入りのびんに分けると、びんは何本できますか。`;
      answer = quotient;
      wrongs = [quotient + 1, quotient + 2, Math.max(1, quotient - 1), Math.max(1, quotient - 2)].filter(v => v !== answer && v > 0);
      steps = [`${dividend} ÷ ${divisor} = ${answer}`];
      return { category: 'decDiv5', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 8) {
      const kind = randInt(0, 1);
      if (kind === 0) {
        let divisorTenths, totalTenths, quotient, remainderTenths;
        let guard = 0;
        do {
          divisorTenths = randInt(2, 9);
          totalTenths = randInt(divisorTenths * 3, divisorTenths * 40);
          quotient = Math.floor(totalTenths / divisorTenths);
          remainderTenths = totalTenths - quotient * divisorTenths;
          guard++;
        } while (remainderTenths === 0 && guard < 100);
        const total = (totalTenths / 10).toString();
        const div = (divisorTenths / 10).toString();
        const remainder = (remainderTenths / 10).toString();
        question = `${total}Lのしょうゆを${div}L入りのびんに分けると、何Lのしょうゆが残りますか。`;
        answer = `${remainder}L`;
        const wrongCands = [`${(remainderTenths + 1) / 10}L`, `${(remainderTenths + 2) / 10}L`, `${total}L`];
        steps = [`${total} ÷ ${div} = ${quotient} あまり ${answer}`];
        return { category: 'decDiv5', question, answer, choices: buildChoicesFromList(answer, wrongCands), steps };
      } else {
        let totalDeci, cutCm, cutTenths, quotient, remainderTenths;
        let guard = 0;
        do {
          totalDeci = randInt(50, 200);
          cutCm = randInt(10, 90) * 10;
          cutTenths = cutCm / 10;
          quotient = Math.floor(totalDeci / cutTenths);
          remainderTenths = totalDeci - quotient * cutTenths;
          guard++;
        } while ((remainderTenths === 0 || quotient < 2) && guard < 100);
        const total = (totalDeci / 10).toString();
        const remainder = (remainderTenths / 10).toString();
        question = `${total}mのひもから${cutCm}cmずつひもを切り取ると、何本できて、何m余りますか。`;
        answer = `${quotient}本できて、${remainder}m余る`;
        const wrongCands = [
          `${quotient + 1}本できて、${remainder}m余る`,
          `${quotient}本できて、${(cutTenths / 10)}m余る`,
          `${quotient}本できて、${Math.max(0, remainderTenths - 1) / 10}m余る`,
        ];
        steps = [`${cutCm}cm = ${(cutTenths / 10)}m`, `${total} ÷ ${(cutTenths / 10)} = ${quotient} あまり ${remainder}`];
        return { category: 'decDiv5', question, answer, choices: buildChoicesFromList(answer, wrongCands), steps };
      }
    } else if (pat === 9) {
      const { divisor, quotient, dividend } = mkCleanDecPair_(11, 30, 2, 20);
      question = `${dividend}Lのジュースと何Lかの水があります。ジュースの量が水の量の${divisor}倍であるとき、水は何Lありますか。`;
      answer = quotient;
      wrongs = [quotient + 1, quotient + 2, Math.max(1, quotient - 1), Math.max(1, quotient - 2)].filter(v => v !== answer && v > 0);
      steps = [`${dividend} ÷ ${divisor} = ${answer}`];
      return { category: 'decDiv5', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 0) {
      // 小数÷小数、商は整数（2〜12）
      let divisorTenths;
      do { divisorTenths = randInt(2, 98); } while (divisorTenths % 10 === 0);
      const divisor = (divisorTenths / 10).toFixed(1);
      const quotient = randInt(2, 12);
      const dividend = ((divisorTenths * quotient) / 10).toFixed(1);
      answer = quotient;
      question = `${dividend} ÷ ${divisor} = ?`;
      wrongs = [quotient + 1, quotient - 1, quotient * 10, Math.max(1, quotient - 2)];
      const dividendX10 = divisorTenths * quotient;
      steps = [
        `わる数・わられる数の小数点を右に1つずつ移して整数にする`,
        `${dividend} ÷ ${divisor} = ${dividendX10} ÷ ${divisorTenths}`,
        `= ${answer}`,
      ];
    } else if (pat === 1) {
      // 商が1より小さいわり算（例: 1.5÷2.5=0.6）
      const divisorTenths = randInt(15, 99);
      const quotientTenths = randInt(1, 9);
      const productHundredths = divisorTenths * quotientTenths;
      const divisor = (divisorTenths / 10).toFixed(1);
      const dividend = (productHundredths / 100).toString();
      answer = (quotientTenths / 10).toString();
      question = `${dividend} ÷ ${divisor} = ?`;
      candidates = [
        ((quotientTenths + 1) / 10).toString(),
        (Math.max(1, quotientTenths - 1) / 10).toString(),
        quotientTenths.toString(),
        ((quotientTenths + 10) / 10).toString(),
      ];
      steps = [
        `わる数・わられる数の小数点を右に1つずつ移して計算する`,
        `${dividend} ÷ ${divisor} = ${productHundredths} ÷ ${divisorTenths}`,
        `= ${answer}`,
      ];
    } else if (pat === 2) {
      // 整数÷小数（商は小数になることもある、例: 4÷2.5=1.6, 18÷2.4=7.5）
      let divisorTenths, quotientTenths, dividend;
      for (let attempt = 0; attempt < 50; attempt++) {
        divisorTenths = randInt(12, 96);
        quotientTenths = randInt(11, 99);
        const productHundredths = divisorTenths * quotientTenths;
        if (productHundredths % 100 === 0) { dividend = productHundredths / 100; break; }
      }
      if (dividend === undefined) { divisorTenths = 25; quotientTenths = 16; dividend = 4; }
      const divisor = (divisorTenths / 10).toFixed(1);
      answer = (quotientTenths / 10).toString();
      question = `${dividend} ÷ ${divisor} = ?`;
      candidates = [
        ((quotientTenths + 1) / 10).toString(),
        (Math.max(1, quotientTenths - 1) / 10).toString(),
        ((quotientTenths + 10) / 10).toString(),
        Math.round(quotientTenths / 10).toString(),
      ];
      steps = [
        `わる数・わられる数の小数点を右に1つずつ移して計算する`,
        `${dividend} ÷ ${divisor} = ${dividend * 10} ÷ ${divisorTenths}`,
        `= ${answer}`,
      ];
    } else if (pat === 3) {
      // 1より小さい数でわる計算（例: 4.4÷0.8=5.5）
      let divisorTenths, quotientTenths, dividend;
      for (let attempt = 0; attempt < 50; attempt++) {
        divisorTenths = randInt(1, 9);
        quotientTenths = randInt(11, 99);
        const productHundredths = divisorTenths * quotientTenths;
        if (productHundredths % 10 === 0) { dividend = productHundredths / 100; break; }
      }
      if (dividend === undefined) { divisorTenths = 8; quotientTenths = 55; dividend = 4.4; }
      const divisor = '0.' + divisorTenths;
      answer = (quotientTenths / 10).toString();
      question = `${dividend} ÷ ${divisor} = ?`;
      candidates = [
        ((quotientTenths + 1) / 10).toString(),
        (Math.max(1, quotientTenths - 1) / 10).toString(),
        (Math.round(quotientTenths / 10) * 10).toString(),
        ((quotientTenths + 10) / 10).toString(),
      ];
      steps = [
        `わる数・わられる数の小数点を右に1つずつ移して計算する`,
        `= ${answer}`,
      ];
    } else {
      // 小数第二位までを含む商のわり算（例: 8.58÷7.8=1.1）
      const divisorTenths = randInt(11, 99);
      const quotientHundredths = randInt(11, 199);
      const productThousandths = divisorTenths * quotientHundredths;
      const divisor = (divisorTenths / 10).toFixed(1);
      const dividend = (productThousandths / 1000).toString();
      answer = (quotientHundredths / 100).toString();
      question = `${dividend} ÷ ${divisor} = ?`;
      candidates = [
        ((quotientHundredths + 1) / 100).toString(),
        (Math.max(1, quotientHundredths - 1) / 100).toString(),
        ((quotientHundredths + 10) / 100).toString(),
        (Math.round(quotientHundredths / 10) / 10).toString(),
      ];
      steps = [
        `わる数・わられる数の小数点を右に1つずつ移して計算する`,
        `${dividend} ÷ ${divisor} = ${productThousandths} ÷ ${divisorTenths * 100}`,
        `= ${answer}`,
      ];
    }
    return { category: 'decDiv5', question, answer, choices: candidates ? buildChoicesFromList(String(answer), candidates.map(String)) : buildChoices(answer, wrongs), steps };
  }

  function roundToSigFigs_(num, sig) {
    if (num === 0) return 0;
    const d = Math.ceil(Math.log10(Math.abs(num)));
    const power = sig - d;
    const magnitude = Math.pow(10, power);
    return Math.round(num * magnitude) / magnitude;
  }

  // 小数のわり算：あまりのあるわり算・がい数で求める商（小5）
  function genDecDivRemainder5() {
    const pat = randInt(0, 3);
    let question, answer, wrongs, steps;
    if (pat === 0) {
      // 商を四捨五入して、上から2けたのがい数で求める
      let divisorTenths, dividendTenths;
      do { divisorTenths = randInt(11, 99); } while (divisorTenths % 10 === 0);
      do { dividendTenths = randInt(divisorTenths, 999); } while (dividendTenths % 10 === 0);
      const divisor = (divisorTenths / 10).toFixed(1);
      const dividend = (dividendTenths / 10).toFixed(1);
      const trueQuotient = dividendTenths / divisorTenths;
      const rounded = roundToSigFigs_(trueQuotient, 2);
      answer = rounded.toString();
      question = `${dividend} ÷ ${divisor} の商を四捨五入して、上から2けたのがい数で求めなさい。`;
      const step = rounded < 10 ? 0.1 : 1;
      wrongs = [
        (Math.round((rounded + step) * 100) / 100).toString(),
        (Math.round((rounded - step) * 100) / 100).toString(),
        (Math.round(trueQuotient * 10) / 10).toString(),
      ].filter((v) => v !== answer);
      steps = [
        `${dividend} ÷ ${divisor} を計算すると ${Math.round(trueQuotient * 1000) / 1000}…`,
        `上から2けたのがい数にすると ${answer}`,
      ];
      return { category: 'decDivRemainder5', question, answer, choices: buildChoicesFromList(answer, wrongs), steps };
    } else if (pat === 1) {
      // 商を一の位まで求めて、あまりも出す
      const divisorTenths = randInt(11, 40);
      const quotient = randInt(2, 9);
      const remainderTenths = randInt(1, divisorTenths - 1);
      const dividendTenths = quotient * divisorTenths + remainderTenths;
      const divisor = (divisorTenths / 10).toFixed(1);
      const dividend = (dividendTenths / 10).toFixed(1);
      const remainder = (remainderTenths / 10).toFixed(1);
      const askQuotient = Math.random() < 0.5;
      let choiceList;
      if (askQuotient) {
        question = `${dividend} ÷ ${divisor} の商を一の位まで求めなさい。（あまりも出る）`;
        answer = String(quotient);
        choiceList = [String(quotient + 1), String(Math.max(1, quotient - 1)), String(quotient * 10)];
      } else {
        question = `${dividend} ÷ ${divisor} の商を一の位まで求めたときの、あまりは？`;
        answer = remainder;
        choiceList = [((remainderTenths + 1) / 10).toFixed(1), (Math.max(1, remainderTenths - 1) / 10).toFixed(1), divisor];
      }
      steps = [`${divisor} × ${quotient} = ${(divisorTenths * quotient / 10).toFixed(1)}`, `${dividend} − ${(divisorTenths * quotient / 10).toFixed(1)} = ${remainder}`, `商 ${quotient}、あまり ${remainder}`];
      return { category: 'decDivRemainder5', question, answer, choices: buildChoicesFromList(answer, choiceList), steps };
    } else if (pat === 2) {
      // 商を10分の1の位まで求めて、あまりも出す
      const divisorTenths = randInt(11, 60);
      const quotientTenths = randInt(2, 50);
      const remainderHundredths = randInt(1, divisorTenths * 10 - 1);
      const dividendHundredths = quotientTenths * divisorTenths + remainderHundredths;
      const divisor = (divisorTenths / 10).toFixed(1);
      const dividend = (dividendHundredths / 100).toString();
      const quotientStr = (quotientTenths / 10).toString();
      const remainderStr = (remainderHundredths / 100).toString();
      const askQuotient = Math.random() < 0.5;
      let wrongsList;
      if (askQuotient) {
        question = `${dividend} ÷ ${divisor} の商を10分の1の位（小数第一位）まで求めなさい。（あまりも出る）`;
        answer = quotientStr;
        wrongsList = [
          ((quotientTenths + 1) / 10).toString(),
          (Math.max(1, quotientTenths - 1) / 10).toString(),
          ((quotientTenths + 10) / 10).toString(),
        ];
      } else {
        question = `${dividend} ÷ ${divisor} の商を10分の1の位まで求めたときの、あまりは？`;
        answer = remainderStr;
        wrongsList = [
          ((remainderHundredths + 1) / 100).toString(),
          (Math.max(1, remainderHundredths - 1) / 100).toString(),
          divisor,
        ];
      }
      steps = [`${divisor} × ${quotientStr} = ${(divisorTenths * quotientTenths / 100).toString()}`, `${dividend} − ${(divisorTenths * quotientTenths / 100).toString()} = ${remainderStr}`, `商 ${quotientStr}、あまり ${remainderStr}`];
      return { category: 'decDivRemainder5', question, answer, choices: buildChoicesFromList(answer, wrongsList), steps };
    } else {
      // 文章題：ひもを配る（あまりが出る場面）
      const perPersonTenths = randInt(2, 20);
      const people = randInt(3, 15);
      const remainderTenths = randInt(1, perPersonTenths - 1);
      const totalTenths = people * perPersonTenths + remainderTenths;
      const perPerson = (perPersonTenths / 10).toFixed(1);
      const total = (totalTenths / 10).toFixed(1);
      const remainder = (remainderTenths / 10).toFixed(1);
      const askPeople = Math.random() < 0.5;
      let choiceList2;
      if (askPeople) {
        question = `${total}mのひもを、1人に${perPerson}mずつ配ります。何人に配ることができますか。`;
        answer = String(people);
        choiceList2 = [String(people + 1), String(Math.max(1, people - 1)), String(people * 10)];
      } else {
        question = `${total}mのひもを、1人に${perPerson}mずつ配ります。何人かに配ったとき、何mあまりますか。`;
        answer = remainder;
        choiceList2 = [((remainderTenths + 1) / 10).toFixed(1), (Math.max(1, remainderTenths - 1) / 10).toFixed(1), perPerson];
      }
      steps = [
        `${perPerson} × ${people} = ${(perPersonTenths * people / 10).toFixed(1)}`,
        `${total} − ${(perPersonTenths * people / 10).toFixed(1)} = ${remainder}`,
        `${people}人に配れて、${remainder}mあまる`,
      ];
      return { category: 'decDivRemainder5', question, answer, choices: buildChoicesFromList(answer, choiceList2), steps };
    }
  }

  // decimals as an integer numerator over 10^decimals; shifting the decimal point
  // (×10^k / ÷10^k) is then just reinterpreting the same digits at a new `decimals`
  // count, so this stays exact with no floating-point error.
  function formatScaledDecimal_(intVal, decimals) {
    if (decimals <= 0) return String(intVal * Math.pow(10, -decimals));
    const s = String(Math.abs(intVal)).padStart(decimals + 1, '0');
    const intPart = s.slice(0, s.length - decimals) || '0';
    const fracPart = s.slice(s.length - decimals).replace(/0+$/, '');
    const sign = intVal < 0 ? '-' : '';
    return sign + intPart + (fracPart ? '.' + fracPart : '');
  }

  // 整数と小数のしくみ（小5）
  function genDecStructure5() {
    const pat = randInt(0, 4);
    let question, answer, wrongs, steps;
    if (pat === 0) {
      // 10×a+1×b+0.1×c（または 0.1×d+0.01×e+0.001×f）の形に表したときの、指定した位の数字
      const styleA = Math.random() < 0.5;
      let numStr, parts, labels;
      if (styleA) {
        const t = randInt(1, 9), o = randInt(0, 9), n = randInt(1, 9);
        numStr = `${t}${o}.${n}`;
        parts = [String(t), String(o), String(n)];
        labels = ['10×', '1×', '0.1×'];
      } else {
        const d = randInt(1, 9), e = randInt(0, 9), f = randInt(1, 9);
        numStr = `0.${d}${e}${f}`;
        parts = [String(d), String(e), String(f)];
        labels = ['0.1×', '0.01×', '0.001×'];
      }
      const target = randInt(0, 2);
      const eq = parts.map((v, i) => `${labels[i]}${i === target ? '□' : v}`).join(' + ');
      question = `${numStr} = ${eq} の□にあてはまる数は？`;
      answer = parts[target];
      wrongs = parts.filter((v, i) => i !== target);
      wrongs.push(String((parseInt(parts[target], 10) + 1) % 10));
      steps = [`小数点の位置を基準に、各位の数字を読み取る`, `= ${answer}`];
      return { category: 'decStructure5', question, answer, choices: buildChoicesFromList(answer, wrongs), steps };
    }
    const decimals = randInt(1, 3);
    const intVal = decimals === 1 ? randInt(11, 2999) : randInt(11, 999);
    const base = formatScaledDecimal_(intVal, decimals);
    if (pat === 1) {
      // ×10, ×100, ×1000
      const k = randInt(1, 3);
      const label = ['10倍', '100倍', '1000倍'][k - 1];
      const result = formatScaledDecimal_(intVal, decimals - k);
      question = `${base} を ${label} した数は？`;
      answer = result;
      wrongs = [
        formatScaledDecimal_(intVal, decimals - k + 1),
        formatScaledDecimal_(intVal, decimals - k - 1),
        formatScaledDecimal_(intVal, decimals - (k === 3 ? 2 : k + 1)),
      ];
      steps = [`小数点を右に${k}つ移す`, `= ${answer}`];
      return { category: 'decStructure5', question, answer, choices: buildChoicesFromList(answer, wrongs), steps };
    } else if (pat === 2) {
      // 何倍したか
      const k = randInt(1, 3);
      const result = formatScaledDecimal_(intVal, decimals - k);
      question = `${result} は、${base} を何倍した数ですか。`;
      answer = String(Math.pow(10, k));
      wrongs = [String(Math.pow(10, k === 3 ? 2 : k + 1)), String(Math.pow(10, k === 1 ? 2 : k - 1)), String(k)];
      steps = [`小数点が右に何個分移動したかを数える`, `= ${answer}`];
      return { category: 'decStructure5', question, answer, choices: buildChoicesFromList(answer, wrongs), steps };
    } else if (pat === 3) {
      // 10分の1, 100分の1, 1000分の1
      const k = randInt(1, 3);
      const label = ['1/10', '1/100', '1/1000'][k - 1];
      const result = formatScaledDecimal_(intVal, decimals + k);
      question = `${base} を ${label} にした数は？`;
      answer = result;
      wrongs = [
        formatScaledDecimal_(intVal, decimals + k - 1),
        formatScaledDecimal_(intVal, decimals + k + 1),
        formatScaledDecimal_(intVal, decimals + (k === 3 ? 2 : k + 1)),
      ];
      steps = [`小数点を左に${k}つ移す`, `= ${answer}`];
      return { category: 'decStructure5', question, answer, choices: buildChoicesFromList(answer, wrongs), steps };
    } else {
      // 何分の一にしたか
      const k = randInt(1, 3);
      const result = formatScaledDecimal_(intVal, decimals + k);
      question = `${result} は、${base} を何分の一にした数ですか。`;
      answer = String(Math.pow(10, k));
      wrongs = [String(Math.pow(10, k === 3 ? 2 : k + 1)), String(Math.pow(10, k === 1 ? 2 : k - 1)), String(k)];
      steps = [`小数点が左に何個分移動したかを数える`, `= ${answer}`];
      return { category: 'decStructure5', question, answer, choices: buildChoicesFromList(answer, wrongs), steps };
    }
  }

  // 小数の文章題（小5）
  function genDecWordProblem5() {
    const pat = randInt(0, 4);
    let question, answer, wrongs, steps;
    if (pat === 0) {
      // がい数で求める文章題（面積を四捨五入して上から2けたのがい数で求める）
      const tateTenths = randInt(20, 99);
      const yokoTenths = randInt(20, 99);
      const tate = (tateTenths / 10).toFixed(1);
      const yoko = (yokoTenths / 10).toFixed(1);
      const trueArea = (tateTenths * yokoTenths) / 100;
      const rounded = roundToSigFigs_(trueArea, 2);
      answer = rounded.toString();
      question = `縦${tate}m、横${yoko}mの長方形の花だんがあります。面積を四捨五入して、上から2けたのがい数で求めなさい。`;
      const step = rounded < 10 ? 0.1 : 1;
      wrongs = [
        (Math.round((rounded + step) * 100) / 100).toString(),
        (Math.round((rounded - step) * 100) / 100).toString(),
        (Math.round(trueArea * 10) / 10).toString(),
      ];
      steps = [`面積 = ${tate} × ${yoko} = ${Math.round(trueArea * 1000) / 1000}…`, `上から2けたのがい数にすると ${answer}`];
    } else if (pat === 1) {
      // 単位量あたりの大きさ（油の重さ）：与える・逆算どちらもランダム
      const perLiterTenths = randInt(5, 50);
      const liters = randInt(2, 15);
      const totalTenths = perLiterTenths * liters;
      const perLiter = (perLiterTenths / 10).toFixed(1);
      const total = (totalTenths / 10).toFixed(1);
      const sub = randInt(0, 2);
      if (sub === 0) {
        question = `1Lの重さが${perLiter}kgの油があります。この油${liters}Lの重さは何kgですか。`;
        answer = total;
        wrongs = [
          ((totalTenths + 10) / 10).toFixed(1),
          (Math.max(1, totalTenths - 10) / 10).toFixed(1),
          ((totalTenths + 1) / 10).toFixed(1),
        ];
        steps = [`重さ = 1Lあたりの重さ × 量`, `${perLiter} × ${liters} = ${total}`];
      } else if (sub === 1) {
        question = `${total}kgの油が${liters}Lあります。この油1Lの重さは何kgですか。`;
        answer = perLiter;
        wrongs = [
          ((perLiterTenths + 1) / 10).toFixed(1),
          (Math.max(1, perLiterTenths - 1) / 10).toFixed(1),
          ((perLiterTenths + 10) / 10).toFixed(1),
        ];
        steps = [`1Lあたりの重さ = 全体の重さ ÷ 量`, `${total} ÷ ${liters} = ${perLiter}`];
      } else {
        question = `1Lの重さが${perLiter}kgの油が${total}kgあります。この油は何Lありますか。`;
        answer = String(liters);
        wrongs = [String(liters + 1), String(Math.max(1, liters - 1)), String(liters * 10)];
        steps = [`量 = 全体の重さ ÷ 1Lあたりの重さ`, `${total} ÷ ${perLiter} = ${liters}`];
      }
    } else if (pat === 2) {
      // 何倍ですか（割合を求める）
      const aTenths = randInt(10, 99);
      const xTenths = randInt(5, 50);
      const productHundredths = aTenths * xTenths;
      const a = (aTenths / 10).toFixed(1);
      const b = trimTrailingZeros((productHundredths / 100).toFixed(2));
      const x = trimTrailingZeros((xTenths / 10).toFixed(1));
      question = `${a}Lのジュースと${b}Lのジュースがあります。${b}Lは${a}Lの何倍ですか。`;
      answer = x;
      wrongs = [
        trimTrailingZeros(((xTenths + 5) / 10).toFixed(1)),
        trimTrailingZeros((Math.max(1, xTenths - 5) / 10).toFixed(1)),
        b,
      ];
      steps = [`何倍 = くらべる量 ÷ もとにする量`, `${b} ÷ ${a} = ${x}`];
    } else {
      // ○倍にあたる大きさ／もとにする大きさ、どちらもランダム
      const baseTenths = randInt(10, 99);
      const xTenths = randInt(5, 50);
      const resultHundredths = baseTenths * xTenths;
      const base = (baseTenths / 10).toFixed(1);
      const result = trimTrailingZeros((resultHundredths / 100).toFixed(2));
      const x = trimTrailingZeros((xTenths / 10).toFixed(1));
      if (Math.random() < 0.5) {
        question = `もとにする長さが${base}mのテープがあります。その${x}倍にあたる長さは何mですか。`;
        answer = result;
        wrongs = [
          trimTrailingZeros(((resultHundredths + 10) / 100).toFixed(2)),
          trimTrailingZeros((Math.max(1, resultHundredths - 10) / 100).toFixed(2)),
          base,
        ];
        steps = [`○倍にあたる大きさ = もとにする大きさ × 割合`, `${base} × ${x} = ${result}`];
      } else {
        question = `${result}mのテープは、もとにする長さの${x}倍にあたります。もとにする長さは何mですか。`;
        answer = base;
        wrongs = [
          trimTrailingZeros(((baseTenths + 5) / 10).toFixed(1)),
          trimTrailingZeros((Math.max(1, baseTenths - 5) / 10).toFixed(1)),
          result,
        ];
        steps = [`もとにする大きさ = くらべる量 ÷ 割合`, `${result} ÷ ${x} = ${base}`];
      }
    }
    return { category: 'decWordProblem5', question, answer, choices: buildChoicesFromList(answer, wrongs), steps };
  }

  // 偶数と奇数（小5）
  function genEvenOdd5() {
    const pat = randInt(0, 2);
    let question, answer, wrongs, steps;
    if (pat === 0) {
      const n = randInt(11, 999);
      const isEven = n % 2 === 0;
      question = `${n} は偶数と奇数のどちらですか。`;
      answer = isEven ? '偶数' : '奇数';
      steps = [`${n} ÷ 2 = ${Math.floor(n / 2)}${isEven ? ' あまりなし' : ' あまり1'}`, `= ${answer}`];
      return { category: 'evenOdd5', question, answer, choices: shuffle([isEven ? '偶数' : '奇数', isEven ? '奇数' : '偶数']), steps };
    } else if (pat === 1) {
      // 範囲内の偶数・奇数の個数
      const start = randInt(1, 50);
      const end = start + randInt(9, 30) * 2 - 1;
      const askEven = Math.random() < 0.5;
      const evenCount = Math.floor(end / 2) - Math.floor((start - 1) / 2);
      const total = end - start + 1;
      const oddCount = total - evenCount;
      question = `${start}から${end}までの整数の中に、${askEven ? '偶数' : '奇数'}はいくつありますか。`;
      answer = String(askEven ? evenCount : oddCount);
      wrongs = [String((askEven ? evenCount : oddCount) + 1), String(Math.max(1, (askEven ? evenCount : oddCount) - 1)), String(total)];
      steps = [`${start}から${end}までの整数は全部で${total}個`, `${askEven ? '偶数' : '奇数'}は${answer}個`];
    } else {
      // ○に一番近い偶数／奇数
      // nの偶奇と求める偶奇が違う場合、n-1とn+1が同じ距離(1)になり答えが2つに
      // なってしまうため、その場合は「同じ距離なら大きい方」というルールを明示して
      // 一意に定める。
      const n = randInt(12, 998);
      const findEven = Math.random() < 0.5;
      const nIsEven = n % 2 === 0;
      const isTie = findEven !== nIsEven;
      const nearest = isTie ? n + 1 : n;
      question = `${n} に一番近い${findEven ? '偶数' : '奇数'}は？（${n}自身も含む${isTie ? '。同じ差の場合は大きい方' : ''}）`;
      answer = String(nearest);
      wrongs = isTie ? [String(n - 1), String(nearest + 2), String(n)] : [String(nearest + 2), String(nearest - 2), String(nearest + 1)];
      steps = isTie
        ? [`${n} は${nIsEven ? '偶数' : '奇数'}で、${n - 1}と${n + 1}はどちらも同じ距離(1)なので、大きい方の ${nearest}`]
        : [`${n} はすでに${findEven ? '偶数' : '奇数'}なので、一番近い${findEven ? '偶数' : '奇数'}は ${nearest}（自分自身）`];
    }
    return { category: 'evenOdd5', question, answer, choices: buildChoices(answer, wrongs), steps };
  }

  // 分数のかけ算・わり算（小6）
  // 真分数、または(50%の確率で)仮分数になる帯分数相当の分数を返す
  function randFracOrMixed6_(maxDen) {
    let d, properN;
    do { d = randInt(2, maxDen); properN = randInt(1, d - 1); } while (gcdFrac(properN, d) !== 1);
    if (Math.random() < 0.5) return [properN, d];
    const whole = randInt(1, 3);
    return [whole * d + properN, d];
  }
  // 分数を、仮分数なら帯分数の見た目(「2 1/3」のように)で表示する
  function fracDisplayStr6_(num, den) {
    const [rn, rd] = reduceFrac(num, den);
    if (rd === 1) return `${rn}`;
    if (rn > rd) {
      const whole = Math.floor(rn / rd), rem = rn % rd;
      return rem === 0 ? `${whole}` : `${whole} ${rem}/${rd}`;
    }
    return `${rn}/${rd}`;
  }

  function genFracMulDiv6() {
    const pat = randInt(0, 3);
    let question, answer, candidates, steps;
    if (pat === 0) {
      // 分数どうしのかけ算・わり算（帯分数になるものを含む）
      const [n1, d1] = randFracOrMixed6_(9);
      const [n2, d2] = randFracOrMixed6_(9);
      const isMul = Math.random() < 0.5;
      const numAns = isMul ? n1 * n2 : n1 * d2;
      const denAns = isMul ? d1 * d2 : d1 * n2;
      answer = fracDisplayStr6_(numAns, denAns);
      const opSym = isMul ? '×' : '÷';
      question = `${fracDisplayStr6_(n1, d1)} ${opSym} ${fracDisplayStr6_(n2, d2)} = ?`;
      candidates = [
        fracDisplayStr6_(isMul ? n1 * d2 : n1 * n2, isMul ? d1 * n2 : d1 * d2),
        fracDisplayStr6_(numAns + denAns, denAns),
        fracDisplayStr6_(Math.max(1, numAns - denAns), denAns),
      ];
      steps = isMul
        ? [`分子どうし・分母どうしをかける`, `= ${answer}`]
        : [`÷ は、わる数をひっくり返してかけ算にする`, `= ${answer}`];
    } else if (pat === 1) {
      // 整数と分数のかけ算・わり算（順序はランダム）
      const whole = randInt(2, 20);
      const [n, d] = randFracOrMixed6_(9);
      const isMul = Math.random() < 0.5;
      const wholeFirst = Math.random() < 0.5;
      let numAns, denAns;
      if (isMul) { numAns = whole * n; denAns = d; }
      else if (wholeFirst) { numAns = whole * d; denAns = n; }
      else { numAns = n; denAns = whole * d; }
      answer = fracDisplayStr6_(numAns, denAns);
      const opSym = isMul ? '×' : '÷';
      question = wholeFirst ? `${whole} ${opSym} ${fracDisplayStr6_(n, d)} = ?` : `${fracDisplayStr6_(n, d)} ${opSym} ${whole} = ?`;
      candidates = [
        fracDisplayStr6_(numAns + denAns, denAns),
        fracDisplayStr6_(Math.max(1, numAns - denAns), denAns),
        fracDisplayStr6_(numAns, denAns + 1),
      ];
      steps = [`整数は分母が1の分数として計算する`, `= ${answer}`];
    } else if (pat === 2) {
      // 3口の連続したかけ算（整数・帯分数を含むこともある）
      const parts = [randFracOrMixed6_(9), randFracOrMixed6_(9), randFracOrMixed6_(9)];
      if (Math.random() < 0.4) parts[randInt(0, 2)] = [randInt(2, 12), 1];
      let numAns = 1, denAns = 1;
      parts.forEach(([n, d]) => { numAns *= n; denAns *= d; });
      answer = fracDisplayStr6_(numAns, denAns);
      question = `${parts.map(([n, d]) => fracDisplayStr6_(n, d)).join(' × ')} = ?`;
      candidates = [
        fracDisplayStr6_(numAns + denAns, denAns),
        fracDisplayStr6_(Math.max(1, numAns - denAns), denAns),
        fracDisplayStr6_(numAns, denAns + 1),
      ];
      steps = [`分子どうし・分母どうしをすべてかける`, `= ${answer}`];
    } else {
      // かけ算とわり算の混じった3口の計算
      const [n1, d1] = randFracOrMixed6_(9);
      const [n2, d2] = randFracOrMixed6_(9);
      const [n3, d3] = randFracOrMixed6_(9);
      const mulFirst = Math.random() < 0.5;
      // A × B ÷ C = (n1×n2×d3)/(d1×d2×n3)、A ÷ B × C = (n1×d2×n3)/(d1×n2×d3)
      const numAns = mulFirst ? n1 * n2 * d3 : n1 * d2 * n3;
      const realDen = mulFirst ? d1 * d2 * n3 : d1 * n2 * d3;
      answer = fracDisplayStr6_(numAns, realDen);
      question = mulFirst
        ? `${fracDisplayStr6_(n1, d1)} × ${fracDisplayStr6_(n2, d2)} ÷ ${fracDisplayStr6_(n3, d3)} = ?`
        : `${fracDisplayStr6_(n1, d1)} ÷ ${fracDisplayStr6_(n2, d2)} × ${fracDisplayStr6_(n3, d3)} = ?`;
      candidates = [
        fracDisplayStr6_(numAns + realDen, realDen),
        fracDisplayStr6_(Math.max(1, numAns - realDen), realDen),
        fracDisplayStr6_(numAns, realDen + 1),
      ];
      steps = [`わり算は、わる数をひっくり返してかけ算にしてから、まとめて計算する`, `= ${answer}`];
    }
    return { category: 'fracMulDiv6', question, questionHtml: stepToHtml(question), answer, choices: buildChoicesFromList(answer, candidates), steps };
  }

  // 分数、小数、整数のまじったかけ算・わり算（小6）
  function genFracDecIntMulDiv6() {
    function decOperand6_() {
      let tenths; do { tenths = randInt(1, 99); } while (tenths % 10 === 0);
      return { num: tenths, den: 10, display: (tenths / 10).toString() };
    }
    function fracOperand6_() {
      const [n, d] = randFracOrMixed6_(9);
      return { num: n, den: d, display: fracDisplayStr6_(n, d) };
    }
    function intOperand6_() {
      const v = randInt(2, 20);
      return { num: v, den: 1, display: `${v}` };
    }
    const pat = randInt(0, 1);
    let operands, ops;
    if (pat === 0) {
      const decFirst = Math.random() < 0.5;
      const dec = decOperand6_(), frac = fracOperand6_();
      operands = decFirst ? [dec, frac] : [frac, dec];
      ops = [Math.random() < 0.5 ? '×' : '÷'];
    } else {
      const kinds = shuffle([decOperand6_, fracOperand6_, intOperand6_]);
      operands = kinds.map(fn => fn());
      ops = [Math.random() < 0.5 ? '×' : '÷', Math.random() < 0.5 ? '×' : '÷'];
    }
    let numAns = operands[0].num, denAns = operands[0].den;
    for (let i = 0; i < ops.length; i++) {
      const op = operands[i + 1];
      if (ops[i] === '×') { numAns *= op.num; denAns *= op.den; }
      else { numAns *= op.den; denAns *= op.num; }
    }
    const answer = fracDisplayStr6_(numAns, denAns);
    const questionSimple = operands.map((o, i) => i === 0 ? o.display : `${ops[i - 1]} ${o.display}`).join(' ') + ' = ?';
    const candidates = [
      fracDisplayStr6_(numAns + denAns, denAns),
      fracDisplayStr6_(Math.max(1, numAns - denAns), denAns),
      fracDisplayStr6_(numAns, denAns + 1),
    ];
    const steps = [`小数は分数になおしてから計算する`, `わり算は、わる数をひっくり返してかけ算にする`, `= ${answer}`];
    return { category: 'fracDecIntMulDiv6', question: questionSimple, questionHtml: stepToHtml(questionSimple), answer, choices: buildChoicesFromList(answer, candidates), steps };
  }

  // 分数のかけ算・わり算の文章題（小6）
  function genFracWordProblem6() {
    const pat = randInt(0, 7);
    let question, answer, candidates, steps;
    if (pat === 5) {
      // かけ算とわり算をまちがえた文章題
      const [xn, xd] = randFracOrMixed6_(9);
      const [mn, md] = randFracOrMixed6_(9);
      const wrongNum = xn * md, wrongDen = xd * mn;
      const correctNum = xn * mn, correctDen = xd * md;
      const askOriginal = Math.random() < 0.5;
      const mDisp = fracDisplayStr6_(mn, md);
      const wrongDisp = fracDisplayStr6_(wrongNum, wrongDen);
      // 分子が1のように小さいケースでは「答え-分母を1にクランプ」型の誤答候補が
      // 正答と衝突しやすい(twice-confirmed済みのバグパターン)。ここでは常に正答より
      // 大きい候補(+分母、+分母×2、+分母×3)と、分母をずらした候補を使い衝突を避ける。
      if (askOriginal) {
        question = `ある数に、${mDisp}をかけるのをまちがえて、${mDisp}でわってしまったので、答えが${wrongDisp}になりました。ある数を求めなさい。`;
        answer = fracDisplayStr6_(xn, xd);
        candidates = [fracDisplayStr6_(xn + xd, xd), fracDisplayStr6_(xn + 2 * xd, xd), fracDisplayStr6_(xn + 3 * xd, xd), fracDisplayStr6_(xn, xd + 2)];
        steps = [`ある数 = 答え × ${mDisp} × ${mDisp}`, `= ${answer}`];
      } else {
        question = `ある数に、${mDisp}をかけるのをまちがえて、${mDisp}でわってしまったので、答えが${wrongDisp}になりました。正しい答えを求めなさい。`;
        answer = fracDisplayStr6_(correctNum, correctDen);
        candidates = [fracDisplayStr6_(correctNum + correctDen, correctDen), fracDisplayStr6_(correctNum + 2 * correctDen, correctDen), fracDisplayStr6_(correctNum + 3 * correctDen, correctDen), fracDisplayStr6_(correctNum, correctDen + 2)];
        steps = [`ある数 = ${wrongDisp} × ${mDisp} × ${mDisp}`, `正しい答え = ある数 × ${mDisp} × ${mDisp} = ${answer}`];
      }
      return { category: 'fracWordProblem6', question, questionHtml: stepToHtml(question), answer, choices: buildChoicesFromList(answer, candidates), steps };
    } else if (pat === 6) {
      // あまりのある分数のわり算文章題（テープを同じ長さずつ切り取り、残りを求める）
      // p/dが既約分数になるようpとdを互いに素にしておく(そうしないと表示時に約分されて
      // 選択肢が衝突し、誤答候補の自動生成が破綻することがある)。
      const d = randInt(3, 9);
      let p;
      do { p = randInt(2, d - 1); } while (gcdFrac(p, d) !== 1);
      const quotient = randInt(3, 10);
      const r = randInt(1, p - 1);
      const totalNum = quotient * p + r;
      const items = [
        { unit: 'm', name: 'テープ', verb: '切り取って' },
        { unit: 'm', name: 'ひも', verb: '切り取って' },
      ];
      const it = items[randInt(0, items.length - 1)];
      question = `${fracDisplayStr6_(totalNum, d)} ${it.unit} の長さの${it.name}を ${fracDisplayStr6_(p, d)} ${it.unit} ずつ${it.verb}いくと、最後に何${it.unit}の${it.name}が余りますか。`;
      answer = fracDisplayStr6_(r, d);
      // r+1やr+3はpと衝突しうる(rはp-1まで届くため)。quotient(商)は常に整数で
      // あまり(真分数)とは表示形が異なるため、衝突しない安全な誤答候補として使う。
      candidates = [fracDisplayStr6_(r + 1, d), fracDisplayStr6_(r + 3, d), fracDisplayStr6_(r + 5, d), `${quotient}`];
      steps = [`${fracDisplayStr6_(totalNum, d)} ÷ ${fracDisplayStr6_(p, d)} = ${quotient} あまり ${answer}`];
      return { category: 'fracWordProblem6', question, questionHtml: stepToHtml(question), answer, choices: buildChoicesFromList(answer, candidates), steps };
    } else if (pat === 7) {
      // 残りを人数で分ける文章題（飲んでから等分する）
      // tnが真分数(1未満)だとdrunkNumがtn以上になり得るため、tn>=3を保証してから
      // drunkNumの上限もtn-1でおさえ、remainderNumが必ず正になるようにする。
      let tn, td;
      do { [tn, td] = randFracOrMixed6_(9); } while (tn < 3);
      const drunkNum = randInt(1, Math.min(td - 1, tn - 1));
      const remainderNum = tn - drunkNum;
      const people = randInt(2, 8);
      question = `${fracDisplayStr6_(tn, td)} L のジュースがあります。まず ${fracDisplayStr6_(drunkNum, td)} L 飲みました。残りのジュースを${people}人で等しく分けると、1人分は何Lになりますか。`;
      answer = fracDisplayStr6_(remainderNum, td * people);
      candidates = [
        fracDisplayStr6_(remainderNum, td),
        fracDisplayStr6_(remainderNum + 1, td * people),
        fracDisplayStr6_(remainderNum + 2, td * people),
        fracDisplayStr6_(remainderNum + 3, td * people),
      ];
      steps = [`残り = ${fracDisplayStr6_(tn, td)} − ${fracDisplayStr6_(drunkNum, td)} = ${fracDisplayStr6_(remainderNum, td)}`, `1人分 = ${fracDisplayStr6_(remainderNum, td)} ÷ ${people} = ${answer}`];
      return { category: 'fracWordProblem6', question, questionHtml: stepToHtml(question), answer, choices: buildChoicesFromList(answer, candidates), steps };
    } else if (pat === 0) {
      // 分数÷整数の文章題
      const contexts = [
        { unit: 'L', tpl: (a, b) => `牛にゅうが${a} Lあります。これを${b}人で同じ量ずつ分けると、1人分は何Lになりますか。` },
        { unit: 'm', tpl: (a, b) => `テープが${a} mあります。これを${b}人で同じ長さずつ分けると、1人分は何mになりますか。` },
      ];
      const ctx = contexts[randInt(0, contexts.length - 1)];
      const [an, ad] = randFracOrMixed6_(9);
      const b = randInt(2, 9);
      question = ctx.tpl(fracDisplayStr6_(an, ad), b);
      answer = fracDisplayStr6_(an, ad * b);
      candidates = [fracDisplayStr6_(an, ad), fracDisplayStr6_(an + 1, ad * b), fracDisplayStr6_(an + 2, ad * b), fracDisplayStr6_(an + 3, ad * b)];
      steps = [`1人分 = 全体 ÷ 人数`, `${fracDisplayStr6_(an, ad)} ÷ ${b} = ${answer}`];
    } else if (pat === 1) {
      // 単位量あたり（ガソリン、速さ）: 1Lで進める距離から、他の量での距離を求める
      const [rn, rd] = randFracOrMixed6_(9);
      const [ln, ld] = randFracOrMixed6_(9);
      question = `1Lのガソリンで、${fracDisplayStr6_(rn, rd)} km走れる車があります。この車は${fracDisplayStr6_(ln, ld)} Lのガソリンでは何km走れますか。`;
      const numAns = rn * ln, denAns = rd * ld;
      answer = fracDisplayStr6_(numAns, denAns);
      // Math.max(1, numAns-denAns)による衝突(twice-confirmed済みのバグパターン)を避けるため、
      // 常に正答より大きい候補と、分母をずらした候補のみを使う。
      candidates = [fracDisplayStr6_(numAns + denAns, denAns), fracDisplayStr6_(numAns + 2 * denAns, denAns), fracDisplayStr6_(numAns + 3 * denAns, denAns), fracDisplayStr6_(numAns, denAns + 2)];
      steps = [`道のり = 1Lで進む距離 × 使う量`, `${fracDisplayStr6_(rn, rd)} × ${fracDisplayStr6_(ln, ld)} = ${answer}`];
    } else if (pat === 2) {
      // 長方形の面積（縦×横）
      const [tn, td] = randFracOrMixed6_(9);
      const [yn, yd] = randFracOrMixed6_(9);
      question = `縦が${fracDisplayStr6_(tn, td)} m、横が${fracDisplayStr6_(yn, yd)} mの長方形の面積は何m²ですか。`;
      const numAns = tn * yn, denAns = td * yd;
      answer = fracDisplayStr6_(numAns, denAns);
      candidates = [fracDisplayStr6_(numAns + denAns, denAns), fracDisplayStr6_(numAns + 2 * denAns, denAns), fracDisplayStr6_(numAns + 3 * denAns, denAns), fracDisplayStr6_(numAns, denAns + 2)];
      steps = [`面積 = 縦 × 横`, `${fracDisplayStr6_(tn, td)} × ${fracDisplayStr6_(yn, yd)} = ${answer}`];
    } else if (pat === 3) {
      // 単位量あたり重さ：○Lで○kgから、1Lの重さを求める
      const [wn, wd] = randFrac(9);
      const [vn, vd] = randFrac(9);
      question = `${fracDisplayStr6_(vn, vd)} Lの重さが${fracDisplayStr6_(wn, wd)} kgの油があります。この油1Lの重さは何kgですか。`;
      const numAns = wn * vd, denAns = wd * vn;
      answer = fracDisplayStr6_(numAns, denAns);
      candidates = [fracDisplayStr6_(numAns + denAns, denAns), fracDisplayStr6_(numAns + 2 * denAns, denAns), fracDisplayStr6_(numAns + 3 * denAns, denAns), fracDisplayStr6_(numAns, denAns + 2)];
      steps = [`1Lの重さ = 全体の重さ ÷ 全体の量`, `${fracDisplayStr6_(wn, wd)} ÷ ${fracDisplayStr6_(vn, vd)} = ${answer}`];
    } else {
      // 長方形の面積から辺の長さを求める（逆算）
      const [tn, td] = randFracOrMixed6_(9);
      const areaWhole = randInt(2, 12);
      question = `面積が${areaWhole}m²、縦の長さが${fracDisplayStr6_(tn, td)} mの長方形の鉄板があります。この鉄板の横の長さは何mですか。`;
      const numAns = areaWhole * td, denAns = tn;
      answer = fracDisplayStr6_(numAns, denAns);
      candidates = [fracDisplayStr6_(numAns + denAns, denAns), fracDisplayStr6_(numAns + 2 * denAns, denAns), fracDisplayStr6_(numAns + 3 * denAns, denAns), fracDisplayStr6_(numAns, denAns + 2)];
      steps = [`横の長さ = 面積 ÷ 縦の長さ`, `${areaWhole} ÷ ${fracDisplayStr6_(tn, td)} = ${answer}`];
    }
    return { category: 'fracWordProblem6', question, questionHtml: stepToHtml(question), answer, choices: buildChoicesFromList(answer, candidates), steps };
  }

  // 比の文章題（小6）
  function genRatioWordProblem6() {
    const pat = randInt(0, 2);
    let question, answer, wrongs, steps;
    if (pat === 0) {
      // 全体を比で分ける文章題
      let p, q; do { p = randInt(1, 9); q = randInt(1, 9); } while (gcdFrac(p, q) !== 1 || p === q);
      const k = randInt(2, 15);
      const total = k * (p + q);
      const smaller = k * Math.min(p, q);
      const bigger = k * Math.max(p, q);
      const askSmaller = Math.random() < 0.5;
      question = `${total}cmのリボンを、妹と姉が${p}:${q}の比で分けます。${askSmaller ? '少ない方' : '多い方'}は何cmもらいますか。`;
      answer = askSmaller ? smaller : bigger;
      wrongs = [askSmaller ? bigger : smaller, answer + k, Math.max(1, answer - k)].filter(v => v !== answer);
      steps = [`${p} + ${q} = ${p + q}等分にする`, `1あたり ${total} ÷ ${p + q} = ${k}`, `${askSmaller ? '少ない方' : '多い方'} = ${k} × ${askSmaller ? Math.min(p, q) : Math.max(p, q)} = ${answer}`];
    } else if (pat === 1) {
      // 混合の文章題：2つのものを比で混ぜて全体量を作る
      let p, q; do { p = randInt(1, 9); q = randInt(1, 9); } while (gcdFrac(p, q) !== 1 || p === q);
      const k = randInt(2, 12);
      const total = k * (p + q);
      const partP = k * p;
      question = `ミルクとコーヒーを${p}:${q}の割合で混ぜて、カフェオレを作ります。カフェオレを${total}mL作るとき、ミルクは何mL必要ですか。`;
      answer = partP;
      wrongs = [k * q, partP + k, Math.max(1, partP - k)].filter(v => v !== answer);
      steps = [`${p} + ${q} = ${p + q}等分にする`, `1あたり ${total} ÷ ${p + q} = ${k}`, `ミルク = ${k} × ${p} = ${answer}`];
    } else {
      // 整数比に直す文章題
      const g = randInt(2, 8);
      let b1, b2; do { b1 = randInt(1, 12); b2 = randInt(1, 12); } while (gcdFrac(b1, b2) !== 1 || b1 === b2);
      const a = g * b1, b = g * b2;
      question = `赤いペンキを${a}dL、白いペンキを${b}dL混ぜて、ピンク色のペンキを作りました。混ぜた赤と白のペンキの量の割合を、最も簡単な整数の比で表しましょう。`;
      answer = `${b1}:${b2}`;
      const wrongCands = [`${a}:${b}`, `${b2}:${b1}`, `${b1 + 1}:${b2}`];
      steps = [`最大公約数 ${g} で両方を割る`, `${a} ÷ ${g} : ${b} ÷ ${g} = ${answer}`];
      return { category: 'ratioWordProblem6', question, answer, choices: buildChoicesFromList(answer, wrongCands), steps };
    }
    return { category: 'ratioWordProblem6', question, answer, choices: buildChoices(answer, wrongs), steps };
  }

  function buildChoicesFromList(answerStr, wrongCandidates) {
    const set = new Set([answerStr]);
    const choices = [answerStr];
    for (const w of wrongCandidates) {
      if (choices.length >= 4) break;
      if (w && !set.has(w)) { set.add(w); choices.push(w); }
    }
    // Fallback in case the supplied candidates weren't distinct enough (e.g. collided
    // with the answer or each other): perturb a number found within the answer string
    // (anywhere, not just a leading position) so formats like "y = 2x + 3" or "√6"
    // both get a sensible, still-valid-looking distractor instead of a garbled prefix.
    let guard = 0;
    while (choices.length < 4 && guard < 30) {
      guard++;
      const m = answerStr.match(/-?\d+/);
      let cand;
      if (m) {
        const newNum = parseInt(m[0], 10) + randNonZero(-3, 3);
        cand = answerStr.slice(0, m.index) + newNum + answerStr.slice(m.index + m[0].length);
      } else {
        cand = `${answerStr}${randInt(2, 9)}`;
      }
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

  // 桁数を指定したわり算の筆算（あまりなし）（小4）
  // divisor は [divMin, divMax] からランダムに選び、その範囲で dividend が
  // [dividendMin, dividendMax] に収まるような商をランダムに選ぶ。
  function genCleanDivision(category, divMin, divMax, dividendMin, dividendMax) {
    const divisor = randInt(divMin, divMax);
    const minQ = Math.max(2, Math.ceil(dividendMin / divisor));
    const maxQ = Math.floor(dividendMax / divisor);
    const quotient = randInt(minQ, maxQ);
    const dividend = divisor * quotient;
    const question = `${dividend} ÷ ${divisor} = ?`;
    const wrongs = [quotient + 1, Math.max(1, quotient - 1), divisor];
    const steps = [`${divisor} × ${quotient} = ${dividend}`, `${dividend} ÷ ${divisor} = ${quotient}`];
    return { category, question, answer: quotient, choices: buildChoices(quotient, wrongs), steps };
  }
  function genDiv2by1_4() { return genCleanDivision('div2by1_4', 2, 9, 10, 99); }
  function genDiv2by2_4() { return genCleanDivision('div2by2_4', 10, 49, 20, 99); }
  function genDiv3by1_4() { return genCleanDivision('div3by1_4', 2, 9, 100, 999); }
  function genDiv3by2_4() { return genCleanDivision('div3by2_4', 12, 99, 100, 999); }
  function genDiv3by3_4() { return genCleanDivision('div3by3_4', 100, 499, 100, 999); }

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

  // 速さの計算の応用（小5）: 分速を求める・時速/分速/秒速の単位換算・時間(分/秒)を求める・複合問題
  function genSpeedApp5() {
    const pat = randInt(0, 6);
    let question, answer, wrongs, steps;
    if (pat === 0) {
      // 分速を求める基本問題
      const t = randInt(2, 10);
      const v = randInt(50, 300);
      const d = v * t;
      question = `ひろみさんは自転車で${t}分間に${d}m走りました。自転車の走る速さは、分速何mですか。`;
      answer = v;
      wrongs = [d, t, v + 10, v - 10].filter((x) => x !== v && x > 0);
      steps = [`速さ = 道のり ÷ 時間`, `= ${d} ÷ ${t} = ${v}`, `分速${v}m`];
    } else if (pat === 1) {
      // 時速⇄分速の単位換算
      const base = randInt(1, 20) * 3; // 時速km（3の倍数）
      const fun = (base * 1000) / 60; // 分速m
      const askKmToM = Math.random() < 0.5;
      if (askKmToM) {
        question = `時速${base}kmは、分速何mですか。`;
        answer = fun;
        steps = [`時速${base}km = 分速(${base}×1000÷60)m`, `= ${base * 1000} ÷ 60 = ${fun}m`];
      } else {
        question = `分速${fun}mは、時速何kmですか。`;
        answer = base;
        steps = [`分速${fun}m = 時速(${fun}×60÷1000)km`, `= ${fun * 60} ÷ 1000 = ${base}km`];
      }
      wrongs = [answer + 10, answer - 10, answer * 2].filter((x) => x !== answer && x > 0);
    } else if (pat === 2) {
      // 分速⇄秒速の単位換算
      const sec = randInt(1, 30);
      const minV = sec * 60;
      const askMinToSec = Math.random() < 0.5;
      if (askMinToSec) {
        question = `分速${minV}mは、秒速何mですか。`;
        answer = sec;
        steps = [`分速${minV}m = 秒速(${minV}÷60)m`, `= ${minV} ÷ 60 = ${sec}m`];
      } else {
        question = `秒速${sec}mは、分速何mですか。`;
        answer = minV;
        steps = [`秒速${sec}m = 分速(${sec}×60)m`, `= ${sec} × 60 = ${minV}m`];
      }
      wrongs = [answer + 5, answer - 5, answer * 2].filter((x) => x !== answer && x > 0);
    } else if (pat === 3) {
      // 時速⇄秒速の単位換算
      const base = randInt(1, 6) * 18; // 時速km（18の倍数）
      const secV = (base * 5) / 18;
      const askKmToSec = Math.random() < 0.5;
      if (askKmToSec) {
        question = `時速${base}kmは、秒速何mですか。`;
        answer = secV;
        steps = [`時速${base}km = 秒速(${base}×1000÷3600)m`, `= ${base * 1000} ÷ 3600 = ${secV}m`];
      } else {
        question = `秒速${secV}mは、時速何kmですか。`;
        answer = base;
        steps = [`秒速${secV}m = 時速(${secV}×3600÷1000)km`, `= ${secV * 3600} ÷ 1000 = ${base}km`];
      }
      wrongs = [answer + 6, answer - 6, answer * 2].filter((x) => x !== answer && x > 0);
    } else if (pat === 4) {
      // 分速m・km距離から時間(分)を求める
      const vMin = randInt(2, 12) * 100;
      const tMin = randInt(2, 20);
      const dM = vMin * tMin;
      const dKm = dM / 1000;
      question = `分速${vMin}mで走るバイクが、${dKm}km走るのにかかる時間は何分ですか。`;
      answer = tMin;
      wrongs = [tMin + 1, tMin - 1, Math.round(vMin / 100)].filter((x) => x !== tMin && x > 0);
      steps = [`道のりをmに直すと ${dKm}km = ${dM}m`, `時間 = 道のり ÷ 速さ`, `= ${dM} ÷ ${vMin} = ${tMin}分`];
    } else if (pat === 5) {
      // 分速m・m距離から時間(秒)を求める
      const vSec = randInt(1, 10);
      const vMin = vSec * 60;
      const tSec = randInt(5, 60);
      const d = vSec * tSec;
      question = `分速${vMin}mで走る人が、${d}m走るのにかかる時間は何秒ですか。`;
      answer = tSec;
      wrongs = [tSec + 5, tSec - 5, vSec].filter((x) => x !== tSec && x > 0);
      steps = [`分速${vMin}m = 秒速(${vMin}÷60)m = 秒速${vSec}m`, `時間 = 道のり ÷ 速さ`, `= ${d} ÷ ${vSec} = ${tSec}秒`];
    } else {
      // 複合問題: 距離÷時間で時速を求めてから、分速または秒速に変換する
      const hours = randInt(2, 8);
      const vKmH = randInt(1, 10) * 18; // 18の倍数(分速・秒速どちらも整数になる)
      const dKm = vKmH * hours;
      const askUnit = randInt(0, 1); // 0=分速, 1=秒速
      question = `新幹線が、${dKm}kmの道のりを${hours}時間で走りました。この新幹線の速さは、${askUnit === 0 ? '分速' : '秒速'}何mですか。`;
      if (askUnit === 0) {
        answer = (vKmH * 1000) / 60;
        steps = [`まず時速を求める: ${dKm} ÷ ${hours} = ${vKmH}km`, `時速${vKmH}km = 分速(${vKmH}×1000÷60)m`, `= ${vKmH * 1000} ÷ 60 = ${answer}m`];
      } else {
        answer = (vKmH * 1000) / 3600;
        steps = [`まず時速を求める: ${dKm} ÷ ${hours} = ${vKmH}km`, `時速${vKmH}km = 秒速(${vKmH}×1000÷3600)m`, `= ${vKmH * 1000} ÷ 3600 = ${answer}m`];
      }
      wrongs = [answer + 10, answer - 10, vKmH].filter((x) => x !== answer && x > 0);
    }
    return { category: 'speedApp5', question, answer, choices: buildChoices(answer, wrongs), steps };
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

  // 割合の文章題（小5）：もとにする量・比べる量・割合を求める応用文章題、割引・利益・食塩水など
  function genPercentWordProblem5() {
    const pat = randInt(0, 6);
    let question, answer, wrongs, steps;
    if (pat === 0) {
      const percent = 5 * randInt(1, 30);
      const base = 20 * randInt(2, 45);
      const part = (base * percent) / 100;
      const templates = [
        () => `${base}の${percent}%は何ですか。`,
        () => `${base}kgの${percent}%は何kgですか。`,
        () => `${base}円の${percent}%は何円ですか。`,
        () => `${base}Lの${percent}%は何Lですか。`,
        () => `たろう君の年れいはお母さんの${percent}%にあたります。お母さんが今、${base}才とすると、たろう君は何才ですか。`,
      ];
      question = templates[randInt(0, templates.length - 1)]();
      answer = part;
      wrongs = [part + 1, part + 2, Math.max(1, part - 1), Math.max(1, part - 2)].filter(v => v !== answer && v > 0);
      steps = [`${base} × ${percent}/100 = ${answer}`];
      return { category: 'percentWordProblem5', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 1) {
      const kind = randInt(0, 1);
      if (kind === 0) {
        const percentOff = 5 * randInt(1, 15);
        const base = 20 * randInt(3, 40);
        const salePrice = (base * (100 - percentOff)) / 100;
        question = `ある品物の定価の${percentOff}%引きで売ったところ、${salePrice}円になりました。定価はいくらですか。`;
        answer = base;
        wrongs = [base + 20, base + 40, Math.max(1, base - 20), Math.max(1, base - 40)].filter(v => v !== answer && v > 0);
        steps = [`定価 × (100 − ${percentOff})/100 = ${salePrice}`, `定価 = ${salePrice} ÷ ${(100 - percentOff) / 100} = ${answer}`];
      } else {
        const percent = 5 * randInt(1, 15);
        const base = 20 * randInt(3, 40);
        const partVal = (base * percent) / 100;
        question = `出席者の${percent}%にあたる${partVal}人が欠席しました。出席予定だった人数は何人ですか。`;
        answer = base;
        wrongs = [base + 10, base + 20, Math.max(1, base - 10), Math.max(1, base - 20)].filter(v => v !== answer && v > 0);
        steps = [`${partVal} ÷ ${percent}/100 = ${answer}`];
      }
      return { category: 'percentWordProblem5', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 2) {
      const percent = 5 * randInt(1, 30);
      const base = 20 * randInt(2, 45);
      const part = (base * percent) / 100;
      question = `${part}は${base}の何%ですか。`;
      answer = percent;
      wrongs = [percent + 5, percent + 10, Math.max(1, percent - 5), Math.max(1, percent - 10)].filter(v => v !== answer && v > 0);
      steps = [`${part} ÷ ${base} × 100 = ${answer}%`];
      return { category: 'percentWordProblem5', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 3) {
      // bu(分)を0か5に限定すると、percentTenths(=割合の1000分率)が常に50の倍数になり、
      // 20の倍数のbase/costと組み合わせたときに割り算の結果が必ず整数になる
      // (20×50=1000で割り切れる)。そのためリトライなしで毎回きれいな整数が作れる。
      const kind = randInt(0, 2);
      const wari = randInt(1, 8);
      const bu = 5 * randInt(0, 1);
      const notation = bu === 0 ? `${wari}割` : `${wari}割${bu}分`;
      const percentTenths = wari * 100 + bu * 10;
      const base = 20 * randInt(3, 40);
      if (kind === 0) {
        const salePrice = (base * (1000 - percentTenths)) / 1000;
        question = `□円の${notation}引きが${salePrice}円でした。□にあてはまる数を求めなさい。`;
        answer = base;
        wrongs = [base + 20, base + 40, Math.max(1, base - 20), Math.max(1, base - 40)].filter(v => v !== answer && v > 0);
        steps = [`${notation} = ${percentTenths / 10}%`, `${salePrice} ÷ (1 − ${percentTenths / 1000}) = ${answer}`];
      } else if (kind === 1) {
        const afterVal = (base * (1000 + percentTenths)) / 1000;
        question = `${afterVal}mは□mの${notation}増しです。□にあてはまる数を求めなさい。`;
        answer = base;
        wrongs = [base + 20, base + 40, Math.max(1, base - 20), Math.max(1, base - 40)].filter(v => v !== answer && v > 0);
        steps = [`${notation} = ${percentTenths / 10}%`, `${afterVal} ÷ (1 + ${percentTenths / 1000}) = ${answer}`];
      } else {
        const partVal = (base * percentTenths) / 1000;
        question = `□人の${notation}は${partVal}人です。□にあてはまる数を求めなさい。`;
        answer = base;
        wrongs = [base + 20, base + 40, Math.max(1, base - 20), Math.max(1, base - 40)].filter(v => v !== answer && v > 0);
        steps = [`${notation} = ${percentTenths / 10}%`, `${partVal} ÷ ${percentTenths / 1000} = ${answer}`];
      }
      return { category: 'percentWordProblem5', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 4) {
      const wari = randInt(1, 4);
      const bu = 5 * randInt(0, 1);
      const notation = bu === 0 ? `${wari}割` : `${wari}割${bu}分`;
      const percentTenths = wari * 100 + bu * 10;
      const cost = 20 * randInt(10, 80);
      const price = (cost * (1000 + percentTenths)) / 1000;
      question = `${notation}の利益をみこんで${price}円の定価をつけた品物の原価はいくらですか。`;
      answer = cost;
      wrongs = [cost + 50, cost + 100, Math.max(1, cost - 50), Math.max(1, cost - 100)].filter(v => v !== answer && v > 0);
      steps = [`${notation} = ${percentTenths / 10}%`, `${price} ÷ (1 + ${percentTenths / 1000}) = ${answer}`];
      return { category: 'percentWordProblem5', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 5) {
      const percent = 5 * randInt(1, 19);
      const angle = (360 * percent) / 100;
      question = `円グラフで、${percent}%にあたる部分の中心の角度は何度ですか。`;
      answer = angle;
      wrongs = [angle + 9, angle + 18, Math.max(1, angle - 9), Math.max(1, angle - 18)].filter(v => v !== answer && v > 0);
      steps = [`360° × ${percent}/100 = ${answer}°`];
      return { category: 'percentWordProblem5', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else {
      const kind = randInt(0, 1);
      if (kind === 0) {
        // lengthを20の倍数にすると、depth=length×percent/100が必ず整数になる
        const length = 20 * randInt(3, 15);
        const percent = 5 * randInt(6, 19);
        const depth = (length * percent) / 100;
        question = `深さ${depth}cmの水中にぼうを立てたところ、ぼうの長さの${percent}%が水の中に入りました。このぼうの長さは何cmですか。`;
        answer = length;
        wrongs = [length + 10, length + 20, Math.max(1, length - 10), Math.max(1, length - 20)].filter(v => v !== answer && v > 0);
        steps = [`${depth} ÷ ${percent}/100 = ${answer}cm`];
        return { category: 'percentWordProblem5', question, answer, choices: buildChoices(answer, wrongs), steps };
      } else {
        // totalを20の倍数にすると、maleCount=total×(100-percent)/100が必ず整数になる
        const total = 20 * randInt(2, 10);
        const percent = 5 * randInt(2, 15);
        const maleCount = (total * (100 - percent)) / 100;
        question = `あるクラスの女子の人数はクラス全体の${percent}%で、男子の人数は${maleCount}人です。このクラス全体の人数を求めなさい。`;
        answer = total;
        wrongs = [total + 2, total + 4, Math.max(1, total - 2), Math.max(1, total - 4)].filter(v => v !== answer && v > 0);
        steps = [`男子の割合 = 100 − ${percent} = ${100 - percent}%`, `${maleCount} ÷ ${(100 - percent) / 100} = ${answer}`];
        return { category: 'percentWordProblem5', question, answer, choices: buildChoices(answer, wrongs), steps };
      }
    }
  }

  // 割合の文章題（応用）（小5）：食塩水（濃度）専門の応用文章題
  function genPercentWordProblemAdvanced5() {
    const pat = randInt(0, 4);
    let question, answer, wrongs, steps;
    if (pat === 0) {
      // newTotalを20の倍数、targetPercentを5の倍数にすると、salt=newTotal×targetPercent/100が
      // 必ず整数になる(newTotal×5k/100=newTotal×k/20で、newTotalが20の倍数だから)。
      const newTotal = 20 * randInt(15, 45);
      const targetPercent = 5 * randInt(1, 5);
      const salt = (newTotal * targetPercent) / 100;
      const evaporate = randInt(50, 300);
      const water = newTotal + evaporate - salt;
      question = `${water}gの水に${salt}gの食塩をとかしました。この食塩水の濃さを${targetPercent}%にするには、何gの水をじょう発させるとよいですか。`;
      answer = evaporate;
      wrongs = [evaporate + 10, evaporate + 20, Math.max(1, evaporate - 10), Math.max(1, evaporate - 20)].filter(v => v !== answer && v > 0);
      steps = [`目標の食塩水の量 = ${salt} ÷ ${targetPercent}/100 = ${newTotal}g`, `もとの量 ${water + salt}g − ${newTotal}g = ${answer}g`];
      return { category: 'percentWordProblemAdvanced5', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 1) {
      const total = 20 * randInt(5, 50);
      const percent = 5 * randInt(1, 10);
      const salt = (total * percent) / 100;
      const water = total - salt;
      question = `${water}gの水に${salt}gの食塩をとかしました。この食塩水の濃度は何%ですか。`;
      answer = percent;
      wrongs = [percent + 5, percent + 10, Math.max(1, percent - 5), Math.max(1, percent - 10)].filter(v => v !== answer && v > 0);
      steps = [`食塩水全体の重さ = ${water}+${salt} = ${total}g`, `濃度 = ${salt}÷${total}×100 = ${percent}%`];
      return { category: 'percentWordProblemAdvanced5', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 2) {
      const total = 20 * randInt(5, 50);
      const percent = 5 * randInt(1, 15);
      const salt = (total * percent) / 100;
      question = `${percent}%の食塩水が${total}gあります。とけている食塩は何gですか。`;
      answer = salt;
      wrongs = [salt + 2, salt + 4, Math.max(1, salt - 2), Math.max(1, salt - 4)].filter(v => v !== answer && v > 0);
      steps = [`食塩の重さ = ${total} × ${percent}/100 = ${answer}g`];
      return { category: 'percentWordProblemAdvanced5', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 3) {
      const total = 20 * randInt(5, 50);
      const percent = 5 * randInt(1, 15);
      const salt = (total * percent) / 100;
      const water = total - salt;
      question = `${percent}%の食塩水が${total}gあります。とけている食塩以外の水の重さは何gですか。`;
      answer = water;
      wrongs = [water + 10, water + 20, Math.max(1, water - 10), Math.max(1, water - 20)].filter(v => v !== answer && v > 0);
      steps = [`食塩の重さ = ${total} × ${percent}/100 = ${salt}g`, `水の重さ = ${total} − ${salt} = ${answer}g`];
      return { category: 'percentWordProblemAdvanced5', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else {
      // targetPercentの倍数mを掛けたものをoriginalPercentにすることで、newTotal=originalTotal×mが
      // 必ず整数になるようにしている(originalTotalは常に整数のまま)。
      const targetPercent = 5 * randInt(1, 5);
      const m = randInt(2, Math.min(4, Math.floor(80 / targetPercent)));
      const originalPercent = targetPercent * m;
      const originalTotal = 20 * randInt(15, 45);
      const salt = (originalTotal * originalPercent) / 100;
      const newTotal = originalTotal * m;
      const addedWater = newTotal - originalTotal;
      question = `${originalPercent}%の食塩水が${originalTotal}gあります。これに水を加えて濃さを${targetPercent}%にするには、何gの水を加えればよいですか。`;
      answer = addedWater;
      wrongs = [addedWater + 10, addedWater + 20, Math.max(1, addedWater - 10), Math.max(1, addedWater - 20)].filter(v => v !== answer && v > 0);
      steps = [`とけている食塩の重さ = ${originalTotal}×${originalPercent}/100 = ${salt}g`, `濃さ${targetPercent}%にするための食塩水の重さ = ${salt}÷${targetPercent}/100 = ${newTotal}g`, `加える水の重さ = ${newTotal}−${originalTotal} = ${answer}g`];
      return { category: 'percentWordProblemAdvanced5', question, answer, choices: buildChoices(answer, wrongs), steps };
    }
  }

  // 図形の面積（小5）：平行四辺形・三角形・台形・ひし形（対角線）の面積
  function genFigureArea5() {
    const pat = randInt(0, 3);
    let question, answer, wrongs, steps;
    if (pat === 0) {
      const b = randInt(3, 20), h = randInt(3, 20);
      const a = b * h;
      question = `底辺${b}cm、高さ${h}cmの平行四辺形の面積は何cm²ですか。`;
      answer = a;
      wrongs = [a + 2, a + 4, Math.max(1, a - 2), Math.max(1, a - 4)].filter(v => v !== answer && v > 0);
      steps = [`平行四辺形の面積 = 底辺 × 高さ = ${b} × ${h} = ${answer}cm²`];
      return { category: 'figureArea5', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 1) {
      const b = 2 * randInt(2, 12), h = randInt(2, 20);
      const a = (b * h) / 2;
      question = `底辺${b}cm、高さ${h}cmの三角形の面積は何cm²ですか。`;
      answer = a;
      wrongs = [a + 2, a + 4, Math.max(1, a - 2), Math.max(1, a - 4)].filter(v => v !== answer && v > 0);
      steps = [`三角形の面積 = 底辺 × 高さ ÷ 2 = ${b} × ${h} ÷ 2 = ${answer}cm²`];
      return { category: 'figureArea5', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 2) {
      const top = randInt(2, 15), bottom = randInt(2, 15);
      const h = 2 * randInt(2, 10);
      const a = ((top + bottom) * h) / 2;
      question = `上底${top}cm、下底${bottom}cm、高さ${h}cmの台形の面積は何cm²ですか。`;
      answer = a;
      wrongs = [a + 2, a + 4, Math.max(1, a - 2), Math.max(1, a - 4)].filter(v => v !== answer && v > 0);
      steps = [`台形の面積 = (上底+下底) × 高さ ÷ 2 = (${top}+${bottom}) × ${h} ÷ 2 = ${answer}cm²`];
      return { category: 'figureArea5', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else {
      const d1 = 2 * randInt(2, 15), d2 = randInt(2, 20);
      const a = (d1 * d2) / 2;
      const shapeName = Math.random() < 0.5 ? 'ひし形' : '対角線が垂直に交わる四角形';
      question = `2本の対角線の長さが${d1}cmと${d2}cmの${shapeName}の面積は何cm²ですか。`;
      answer = a;
      wrongs = [a + 2, a + 4, Math.max(1, a - 2), Math.max(1, a - 4)].filter(v => v !== answer && v > 0);
      steps = [`面積 = 対角線 × 対角線 ÷ 2 = ${d1} × ${d2} ÷ 2 = ${answer}cm²`];
      return { category: 'figureArea5', question, answer, choices: buildChoices(answer, wrongs), steps };
    }
  }

  function trimTrailingZeros(str) {
    if (!str.includes('.')) return str;
    return str.replace(/0+$/, '').replace(/\.$/, '');
  }

  function wariBuRinStr(wari, bu, rin) {
    let s = '';
    if (wari > 0) s += `${wari}割`;
    if (bu > 0) s += `${bu}分`;
    if (rin > 0) s += `${rin}厘`;
    return s || '0割';
  }

  // 割合の表し方：小数・百分率・歩合（何割何分何厘）（小5）
  function genPercentConvert5() {
    const pat = randInt(0, 3);
    let question, answer, candidates;
    if (pat === 0) {
      // 小数 -> 百分率
      const permille = randInt(1, 1999);
      const decimalStr = trimTrailingZeros((permille / 1000).toFixed(3));
      const pctStr = trimTrailingZeros((permille / 10).toFixed(1));
      question = `${decimalStr} を百分率で表すと？`;
      answer = `${pctStr}%`;
      candidates = [
        `${decimalStr}%`,
        `${trimTrailingZeros((permille / 10 + 10).toFixed(1))}%`,
        `${trimTrailingZeros((Math.max(0, permille / 10 - 10)).toFixed(1))}%`,
        `${trimTrailingZeros((permille / 100).toFixed(2))}%`,
      ];
    } else if (pat === 1) {
      // 百分率 -> 小数
      const permille = randInt(1, 1999);
      const decimalStr = trimTrailingZeros((permille / 1000).toFixed(3));
      const pctStr = trimTrailingZeros((permille / 10).toFixed(1));
      question = `${pctStr}% を小数で表すと？`;
      answer = decimalStr;
      candidates = [
        `${pctStr}`,
        trimTrailingZeros((permille / 1000 + 0.1).toFixed(3)),
        trimTrailingZeros((Math.max(0, permille / 1000 - 0.1)).toFixed(3)),
        trimTrailingZeros((permille / 100).toFixed(3)),
      ];
    } else if (pat === 2) {
      // 小数 -> 歩合（何割何分何厘）
      const permille = randInt(1, 999);
      const decimalStr = trimTrailingZeros((permille / 1000).toFixed(3));
      const wari = Math.floor(permille / 100), bu = Math.floor((permille % 100) / 10), rin = permille % 10;
      const wariStr = wariBuRinStr(wari, bu, rin);
      question = `${decimalStr} を「割・分・厘」で表すと？`;
      answer = wariStr;
      candidates = [
        wariBuRinStr(wari, rin, bu),
        wariBuRinStr(wari + 1, bu, rin),
        wariBuRinStr(wari, bu, 0),
        wariBuRinStr(Math.max(0, wari - 1), bu, rin),
      ];
    } else {
      // 歩合（何割何分何厘） -> 小数
      const permille = randInt(1, 999);
      const decimalStr = trimTrailingZeros((permille / 1000).toFixed(3));
      const wari = Math.floor(permille / 100), bu = Math.floor((permille % 100) / 10), rin = permille % 10;
      const wariStr = wariBuRinStr(wari, bu, rin);
      question = `${wariStr} を小数で表すと？`;
      answer = decimalStr;
      candidates = [
        trimTrailingZeros((permille / 100).toFixed(3)),
        trimTrailingZeros((permille / 1000 + 0.01).toFixed(3)),
        trimTrailingZeros((Math.max(0, permille / 1000 - 0.01)).toFixed(3)),
        trimTrailingZeros((permille / 10000).toFixed(4)),
      ];
    }
    const steps = pat <= 1
      ? [`小数 ⇔ 百分率は100倍・100で割るの関係`, `= ${answer}`]
      : [`割=0.1、分=0.01、厘=0.001`, `= ${answer}`];
    return { category: 'percentConvert5', question, answer, choices: buildChoicesFromList(answer, candidates), steps };
  }

  function pick3Distinct_(min, max) {
    const a = randInt(min, max);
    const bCands = [];
    for (let v = min; v <= max; v++) if (v !== a) bCands.push(v);
    const b = bCands[randInt(0, bCands.length - 1)];
    const cCands = [];
    for (let v = min; v <= max; v++) if (v !== a && v !== b) cCands.push(v);
    const c = cCands[randInt(0, cCands.length - 1)];
    return [a, b, c].sort((x, y) => x - y);
  }

  // 公約数の問題(2個)で「公約数が1個しかない(=互いに素)」を避けるため、共通の約数
  // (2〜5のいずれか)を持つ2つの数を選ぶ。小さい順に並べて返す。
  function pick2NonCoprime_(min, max) {
    const factors = [2, 3, 4, 5];
    const k = factors[randInt(0, factors.length - 1)];
    const multiples = [];
    for (let v = min; v <= max; v++) if (v % k === 0) multiples.push(v);
    const a = multiples[randInt(0, multiples.length - 1)];
    const bCands = multiples.filter(v => v !== a);
    const b = bCands[randInt(0, bCands.length - 1)];
    return [a, b].sort((x, y) => x - y);
  }

  // 公約数の問題(3個)で同様に、共通の約数(2〜5のいずれか)を持つ3つの数を小さい順に選ぶ。
  function pick3DistinctNonCoprime_(min, max) {
    const factors = [2, 3, 4, 5];
    const k = factors[randInt(0, factors.length - 1)];
    const multiples = [];
    for (let v = min; v <= max; v++) if (v % k === 0) multiples.push(v);
    const a = multiples[randInt(0, multiples.length - 1)];
    const bCands = multiples.filter(v => v !== a);
    const b = bCands[randInt(0, bCands.length - 1)];
    const cCands = multiples.filter(v => v !== a && v !== b);
    const c = cCands[randInt(0, cCands.length - 1)];
    return [a, b, c].sort((x, y) => x - y);
  }

  // 倍数と約数（小5）
  function genMultiples5() {
    const pat = randInt(0, 4);
    const [a, b] = pick2NonCoprime_(2, 12);
    let question, answer, wrongs, steps;
    if (pat === 3) {
      // 3つの数の最小公倍数
      const nums = pick3Distinct_(2, 15);
      const l = lcmFrac(lcmFrac(nums[0], nums[1]), nums[2]);
      question = `${nums[0]}、${nums[1]}、${nums[2]} の最小公倍数は？`;
      answer = l;
      wrongs = [nums[0] * nums[1] * nums[2], lcmFrac(nums[0], nums[1]), l + Math.min(...nums)].filter(v => v !== l);
      steps = [`3つの数の倍数を並べて共通のものを探す`, `最小公倍数 = ${l}`];
      return { category: 'multiples5', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 4) {
      // 3つの数の最大公約数
      const nums = pick3DistinctNonCoprime_(6, 40);
      const g = gcdFrac(gcdFrac(nums[0], nums[1]), nums[2]);
      question = `${nums[0]}、${nums[1]}、${nums[2]} の最大公約数は？`;
      answer = g;
      wrongs = [gcdFrac(nums[0], nums[1]), Math.min(...nums), g + 1].filter(v => v !== g);
      steps = [`3つの数をともに割り切れる数のうち、一番大きい数を探す`, `最大公約数 = ${g}`];
      return { category: 'multiples5', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 0) {
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

  // 倍数・約数の文章題（小5）：範囲内の倍数の個数、最も近い倍数、最小公倍数・最大公約数の応用
  function genMultiplesDivisorsWordProblem5() {
    const pat = randInt(0, 5);
    let question, answer, wrongs, steps;
    if (pat === 0) {
      const m = randInt(3, 12);
      const offset = Math.random() < 0.5;
      if (!offset) {
        const n = randInt(m * 8, m * 30);
        const count = Math.floor(n / m);
        question = `1から${n}までの整数の中に、${m}の倍数は何個ありますか。`;
        answer = count;
        wrongs = [count + 1, Math.max(1, count - 1), Math.floor(n / m) + Math.floor(n / (m + 1))].filter(v => v !== answer && v > 0);
        steps = [`${n} ÷ ${m} = ${count} あまり ${n % m}`, `= ${answer}個`];
      } else {
        const a = randInt(m * 5, m * 15);
        const b = a + randInt(m * 5, m * 15);
        const count = Math.floor(b / m) - Math.floor((a - 1) / m);
        question = `${a}から${b}までの整数の中に、${m}の倍数は何個ありますか。`;
        answer = count;
        wrongs = [count + 1, Math.max(1, count - 1), Math.floor(b / m)].filter(v => v !== answer && v > 0);
        steps = [`${b} ÷ ${m} = ${Math.floor(b / m)}`, `${a - 1} ÷ ${m} = ${Math.floor((a - 1) / m)}`, `${Math.floor(b / m)} − ${Math.floor((a - 1) / m)} = ${answer}個`];
      }
      return { category: 'multiplesDivisorsWordProblem5', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 1) {
      const kind = randInt(0, 2);
      let m, label;
      if (kind === 0) {
        m = randInt(6, 15);
        label = `${m}`;
      } else if (kind === 1) {
        const nums = [randInt(2, 9), randInt(2, 9)];
        m = lcmFrac(nums[0], nums[1]);
        label = `${nums[0]}でわっても${nums[1]}でわっても`;
      } else {
        const pool = [2, 3, 4, 5, 6, 7, 8, 9];
        const nums = [];
        while (nums.length < 3) {
          const v = pool[randInt(0, pool.length - 1)];
          if (nums.indexOf(v) === -1) nums.push(v);
        }
        m = lcmFrac(lcmFrac(nums[0], nums[1]), nums[2]);
        label = `${nums[0]}でわっても${nums[1]}でわっても${nums[2]}でわっても`;
      }
      const n = randInt(m * 5, m * 40);
      const lower = Math.floor(n / m) * m;
      const upper = lower + m;
      answer = (n - lower < upper - n) ? lower : upper;
      question = kind === 0
        ? `${n}に最も近い${m}の倍数を求めなさい。`
        : `${label}わり切れる整数のうち、${n}に最も近い整数を求めなさい。`;
      wrongs = [lower === answer ? upper : lower, answer + m, Math.max(1, answer - m)].filter(v => v !== answer && v > 0);
      steps = [`${n} ÷ ${m} = ${(n / m).toFixed(1)}`, `近い方の倍数を選ぶ → ${answer}`];
      return { category: 'multiplesDivisorsWordProblem5', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 2) {
      const items = [
        { unit: '電車', verb: '発車' },
        { unit: 'バス', verb: '出発' },
      ];
      const it = items[randInt(0, items.length - 1)];
      const nums = [randInt(4, 9), randInt(4, 9), randInt(4, 9)];
      const l = lcmFrac(lcmFrac(nums[0], nums[1]), nums[2]);
      const startHour = randInt(6, 9);
      const totalMin = l;
      const endHour24 = startHour + Math.floor(totalMin / 60);
      const endMin = totalMin % 60;
      const fmtAmPm = (h24, m) => {
        const h = ((h24 % 24) + 24) % 24;
        const period = h < 12 ? '午前' : '午後';
        const h12 = h % 12;
        return m === 0 ? `${period}${h12}時` : `${period}${h12}時${m}分`;
      };
      question = `${nums[0]}分ごと、${nums[1]}分ごと、${nums[2]}分ごとに${it.verb}する${it.unit}が午前${startHour}時に同時に${it.verb}しました。次に3つの${it.unit}が同時に${it.verb}するのは何時何分ですか。`;
      answer = fmtAmPm(endHour24, endMin);
      const wrongCands = [
        fmtAmPm(endHour24, (endMin + 5) % 60),
        fmtAmPm(endHour24 + 1, endMin),
        fmtAmPm(endHour24 - 1, endMin),
      ];
      steps = [`${nums[0]}、${nums[1]}、${nums[2]} の最小公倍数 = ${l}`, `午前${startHour}時 + ${l}分 = ${answer}`];
      return { category: 'multiplesDivisorsWordProblem5', question, answer, choices: buildChoicesFromList(answer, wrongCands), steps };
    } else if (pat === 3) {
      const items = [
        { a: 'えん筆', b: 'ボールペン', counterA: '本', counterB: '本' },
        { a: '色紙', b: 'おり紙', counterA: 'まい', counterB: 'まい' },
        { a: 'クッキー', b: 'あめ', counterA: 'こ', counterB: 'こ' },
        { a: 'ノート', b: '消しゴム', counterA: 'さつ', counterB: 'こ' },
      ];
      const it = items[randInt(0, items.length - 1)];
      const g = randInt(6, 20);
      const ka = randInt(3, 8);
      let kb = randInt(3, 8);
      if (kb === ka) kb += 1;
      const a = g * (ka + 2);
      const b = g * (kb + 2);
      question = `${it.a}が${a}${it.counterA}、${it.b}が${b}${it.counterB}あります。${it.a}と${it.b}の両方を、できるだけ多くの子どもに同じ数ずつ余りがないように分けます。何人の子どもに分けられるか求めなさい。`;
      answer = gcdFrac(a, b);
      wrongs = [answer * 2, Math.max(1, answer - 1), answer + 1].filter(v => v !== answer && v > 0);
      steps = [`${a} と ${b} の最大公約数を求める`, `最大公約数 = ${answer}`];
      return { category: 'multiplesDivisorsWordProblem5', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 4) {
      const gBase = randInt(4, 16);
      const kt = randInt(3, 9);
      let ky = randInt(3, 9);
      if (ky === kt) ky += 1;
      const tate = gBase * kt;
      const yoko = gBase * ky;
      const g = gcdFrac(tate, yoko);
      const askSide = Math.random() < 0.5;
      question = `たて${tate}cm、横${yoko}cmの長方形の紙があります。この紙を、同じ大きさのできるだけ大きな正方形に切り分けると、${askSide ? '1辺が何cmの正方形になりますか。' : '正方形は何まいできますか。'}`;
      if (askSide) {
        answer = g;
        wrongs = [g * 2, Math.max(1, g - 1), g + 1].filter(v => v !== answer && v > 0);
        steps = [`${tate} と ${yoko} の最大公約数を求める`, `1辺 = ${answer}cm`];
      } else {
        answer = (tate / g) * (yoko / g);
        wrongs = [answer + 1, Math.max(1, answer - 1), (tate / g) + (yoko / g)].filter(v => v !== answer && v > 0);
        steps = [`${tate} と ${yoko} の最大公約数 = ${g}`, `(${tate}÷${g}) × (${yoko}÷${g}) = ${answer}まい`];
      }
      return { category: 'multiplesDivisorsWordProblem5', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else {
      const a = randInt(2, 6);
      let b;
      do { b = randInt(2, 6); } while (b === a || lcmFrac(a, b) === a || lcmFrac(a, b) === b);
      const n = randInt(60, 200);
      const l = lcmFrac(a, b);
      const count = Math.floor(n / a) + Math.floor(n / b) - Math.floor(n / l);
      question = `1から${n}までの整数の中に、${a}の倍数または${b}の倍数は何個ありますか。`;
      answer = count;
      wrongs = [Math.floor(n / a) + Math.floor(n / b), count + 1, Math.max(1, count - 1)].filter(v => v !== answer && v > 0);
      steps = [`${a}の倍数: ${Math.floor(n / a)}個`, `${b}の倍数: ${Math.floor(n / b)}個`, `${a}と${b}の公倍数(${l}の倍数): ${Math.floor(n / l)}個`, `${Math.floor(n / a)} + ${Math.floor(n / b)} − ${Math.floor(n / l)} = ${answer}個`];
      return { category: 'multiplesDivisorsWordProblem5', question, answer, choices: buildChoices(answer, wrongs), steps };
    }
  }

  // 図形の角：内角の和（小5）
  function genPolygonAngle5() {
    const pat = randInt(0, 6);
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
    } else if (pat === 2) {
      const ns = [5, 6, 7, 8, 9, 10, 12];
      const n = ns[randInt(0, ns.length - 1)];
      const sum = 180 * (n - 2);
      question = `${kanjiDigit(n)}角形の内角の和は？`;
      answer = sum;
      wrongs = [180 * n, sum + 180, Math.max(180, sum - 180)];
      steps = [`多角形の内角の和 = 180° × (n−2)`, `= 180 × (${n}−2) = ${sum}°`];
    } else if (pat === 3) {
      // 二等辺三角形：底角から頂角、または頂角から底角を求める
      const askApex = Math.random() < 0.5;
      if (askApex) {
        const base = randInt(20, 79);
        const apex = 180 - base * 2;
        question = `二等辺三角形があります。等しい2つの辺にはさまれていない角（底角）が2つとも ${base}° のとき、頂角 x は？`;
        answer = apex;
        wrongs = [base, 180 - base, apex + 10].filter(v => v !== apex);
        steps = [`二等辺三角形は底角が等しい`, `x = 180 − ${base} × 2 = ${apex}`];
      } else {
        let apexAngle;
        do { apexAngle = randInt(20, 140); } while ((180 - apexAngle) % 2 !== 0);
        const base = (180 - apexAngle) / 2;
        question = `二等辺三角形があります。頂角が ${apexAngle}° のとき、底角 x は？（底角は2つとも等しい）`;
        answer = base;
        wrongs = [apexAngle, base + 10, Math.max(1, base - 10)].filter(v => v !== base);
        steps = [`底角はどちらも等しい`, `x = (180 − ${apexAngle}) ÷ 2 = ${base}`];
      }
    } else if (pat === 4) {
      // 外角の定理：三角形の1つの角と、別の頂点の外角（延長線上の角）から残りの角を求める
      const aa = randInt(20, 80);
      const ext = randInt(aa + 30, 170);
      const x = ext - aa;
      question = `三角形の1つの角が ${aa}°。もう1つの頂点で辺を延長すると、その外側の角（外角）が ${ext}° でした。残りの角 x は？`;
      answer = x;
      wrongs = [ext - aa + 10, Math.max(1, ext - aa - 10), 180 - ext].filter(v => v !== x);
      steps = [`外角は、となり合わない2つの内角の和に等しい`, `x = ${ext} − ${aa} = ${x}`];
    } else if (pat === 5) {
      // 五角形など、1つを除く角がすべて分かっているときの残りの角
      const ns = [5, 6];
      const n = ns[randInt(0, ns.length - 1)];
      const sum = 180 * (n - 2);
      let angles, x;
      for (let attempt = 0; attempt < 30; attempt++) {
        angles = [];
        let remaining = sum;
        for (let i = 0; i < n - 1; i++) {
          const unassignedAfter = n - i - 1; // remaining explicit angles after this one, plus the final x
          const maxForThis = Math.min(160, remaining - 60 * unassignedAfter);
          if (maxForThis < 60) { angles = null; break; }
          const a = randInt(60, maxForThis);
          angles.push(a);
          remaining -= a;
        }
        if (angles && remaining >= 60 && remaining <= 170) { x = remaining; break; }
      }
      if (!angles || x === undefined) {
        angles = n === 5 ? [120, 110, 105, 115] : [130, 120, 125, 115, 110];
        x = sum - angles.reduce((s, v) => s + v, 0);
      }
      question = `${kanjiDigit(n)}角形の${n - 1}つの角が ${angles.join('°、')}°。残りの角 x は？`;
      answer = x;
      wrongs = [angles[angles.length - 1], x + 10, Math.max(1, x - 10)].filter(v => v !== x);
      steps = [`${kanjiDigit(n)}角形の内角の和は 180 × (${n}−2) = ${sum}°`, `x = ${sum} − (${angles.join(' + ')}) = ${x}`];
    } else {
      // ひし形・平行四辺形：対角は等しい、となり合う角は180°
      const aa = randInt(30, 150);
      const opposite = Math.random() < 0.5;
      question = opposite
        ? `4つの辺の長さがすべて等しい四角形（ひし形）があります。ある角が ${aa}° のとき、その向かい合う角 x は？`
        : `4つの辺の長さがすべて等しい四角形（ひし形）があります。ある角が ${aa}° のとき、そのとなり合う角 x は？`;
      answer = opposite ? aa : 180 - aa;
      wrongs = opposite ? [180 - aa, aa + 10, Math.max(1, aa - 10)] : [aa, 180 - aa + 10, Math.max(1, 180 - aa - 10)];
      wrongs = wrongs.filter(v => v !== answer);
      steps = opposite
        ? [`ひし形は向かい合う角が等しい`, `x = ${aa}`]
        : [`ひし形はとなり合う角の和が180°`, `x = 180 − ${aa} = ${180 - aa}`];
    }
    return { category: 'polygonAngle5', question, answer, choices: buildChoices(answer, wrongs), steps };
  }

  // 分数と小数、整数の関係（小5）
  // 時間と分数（小5）：分は時間の何分の1か、秒は分の何分の1か
  function genTimeFraction5() {
    const pat = randInt(0, 1);
    let question, answer, steps;
    if (pat === 0) {
      const n = randInt(1, 150);
      const [rn, rd] = reduceFrac(n, 60);
      question = `${n}分は何時間ですか。分数で答えなさい。`;
      answer = fracToStr(n, 60);
      steps = [`${n}分 = ${n}/60 時間`, `約分すると ${rn}/${rd} 時間`];
    } else {
      const n = randInt(1, 150);
      const [rn, rd] = reduceFrac(n, 60);
      question = `${n}秒は何分ですか。分数で答えなさい。`;
      answer = fracToStr(n, 60);
      steps = [`${n}秒 = ${n}/60 分`, `約分すると ${rn}/${rd} 分`];
    }
    return { category: 'timeFraction5', question, questionHtml: stepToHtml(question), answer, choices: buildChoicesFromSet(answer, timeFractionWrongs_(answer)), steps };
  }
  function timeFractionWrongs_(answerStr) {
    const m = answerStr.match(/^(-?\d+)\/(\d+)$/);
    if (!m) return [];
    const n = parseInt(m[1], 10), d = parseInt(m[2], 10);
    return [
      `${n}/60`,
      fracToStr(n + 1, d),
      fracToStr(Math.max(1, n - 1), d),
    ];
  }

  // 単位量あたりの大きさの文章題（小5）：直接計算・こみぐあい/値段/燃費の比較
  function genUnitRateWordProblem5() {
    const pat = randInt(0, 4);
    let question, answer, wrongs, steps;
    if (pat === 4) {
      const items = [
        { name: '鉄のぼう', unitA: 'm', unitB: 'kg' },
        { name: '針金', unitA: 'm', unitB: 'g' },
      ];
      const item = items[randInt(0, items.length - 1)];
      const perUnit = randInt(2, 9);
      const baseLen = randInt(2, 9);
      const baseWeight = perUnit * baseLen;
      const targetLen = randInt(2, 40);
      const targetWeight = perUnit * targetLen;
      question = `${baseLen}${item.unitA}の重さが${baseWeight}${item.unitB}の${item.name}があります。この${item.name}${targetWeight}${item.unitB}の長さは何${item.unitA}ですか。`;
      answer = targetLen;
      wrongs = [targetLen + 1, targetLen + 2, Math.max(1, targetLen - 1), Math.max(1, targetLen - 2)].filter(v => v !== answer && v > 0);
      steps = [`1${item.unitA}あたりの重さ = ${baseWeight} ÷ ${baseLen} = ${perUnit}${item.unitB}`, `${targetWeight} ÷ ${perUnit} = ${answer}`];
      return { category: 'unitRateWordProblem5', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 0) {
      // 直接計算：1(単位)あたりの個数・人数を求める
      const contexts = [
        { unit: 'm²', tpl: (a, b) => `面積${a}m²の花だんに、球根が${b}個植えられています。1m²あたり何個の球根が植えられていますか。` },
        { unit: 'km²', tpl: (a, b) => `面積${a}km²の町に、${b}人が住んでいます。1km²あたり何人住んでいますか。` },
        { unit: 'L', tpl: (a, b) => `水そうに水が${a}L入っていて、メダカが${b}匹います。水1Lあたり何匹のメダカがいますか。` },
      ];
      const ctx = contexts[randInt(0, contexts.length - 1)];
      const rate = randInt(2, 9);
      const total = randInt(2, 12);
      const count = rate * total;
      question = ctx.tpl(total, count);
      answer = String(rate);
      wrongs = [String(rate + 1), String(rate + 2), String(Math.max(1, rate - 1)), String(Math.max(1, rate - 2))];
      steps = [`1${ctx.unit}あたりの数 = 全体の数 ÷ ${ctx.unit === 'm²' || ctx.unit === 'km²' ? '面積' : '量'}`, `${count} ÷ ${total} = ${rate}`];
    } else if (pat === 1) {
      // こみぐあい・人口密度の比較：どちらが混んでいるか
      const contexts = [
        { subject: '花だん', unit: 'm²', tpl: (label, a, b) => `${label}の花だんは、面積${a}m²に球根が${b}個植えられています。`, ask: 'どちらが混んでいますか。', verdict: '混んでいる' },
        { subject: '町', unit: 'km²', tpl: (label, a, b) => `${label}町は、面積${a}km²に人口${b}人が住んでいます。`, ask: 'どちらが混んでいますか。', verdict: '混んでいる' },
        { subject: '水そう', unit: 'L', tpl: (label, a, b) => `${label}の水そうは、水${a}Lにメダカが${b}匹います。`, ask: 'どちらが混んでいますか。', verdict: '混んでいる' },
        { subject: '畑', unit: 'm²', tpl: (label, a, b) => `${label}さんの家では、${a}m²の畑から、じゃがいもが${b}kgとれました。`, ask: 'どちらがよくとれたといえますか。', verdict: 'よくとれている' },
      ];
      const ctx = contexts[randInt(0, contexts.length - 1)];
      let rateA, rateB;
      do { rateA = randInt(2, 9); rateB = randInt(2, 9); } while (rateA === rateB);
      const totalA = randInt(2, 10), totalB = randInt(2, 10);
      const countA = rateA * totalA, countB = rateB * totalB;
      const aWins = rateA > rateB;
      question = `${ctx.tpl('A', totalA, countA)}${ctx.tpl('B', totalB, countB)}${ctx.ask}`;
      answer = aWins ? 'A' : 'B';
      wrongs = ['どちらも同じ', aWins ? 'B' : 'A'];
      steps = [`Aの1${ctx.unit}あたり = ${countA} ÷ ${totalA} = ${rateA}`, `Bの1${ctx.unit}あたり = ${countB} ÷ ${totalB} = ${rateB}`, `数が大きい方が${ctx.verdict} → ${answer}`];
      return { category: 'unitRateWordProblem5', question, answer, choices: shuffle([answer, ...wrongs]), steps };
    } else if (pat === 2) {
      // 値段の比較：どちらが安いか
      const items = [
        { name: 'りんご', unit: '個' }, { name: 'みかんジュース', unit: '缶' }, { name: 'バラの花', unit: '本' }, { name: 'ノート', unit: '冊' },
      ];
      const item = items[randInt(0, items.length - 1)];
      let priceA, priceB;
      do { priceA = randInt(20, 200); priceB = randInt(20, 200); } while (priceA === priceB);
      const qtyA = randInt(2, 9), qtyB = randInt(2, 9);
      const totalA = priceA * qtyA, totalB = priceB * qtyB;
      const aCheaper = priceA < priceB;
      question = `${qtyA}${item.unit}で${totalA}円の${item.name}と、${qtyB}${item.unit}で${totalB}円の${item.name}があります。1${item.unit}あたりの値段が安いのはどちらですか。`;
      answer = aCheaper ? '1つ目' : '2つ目';
      wrongs = ['どちらも同じ', aCheaper ? '2つ目' : '1つ目'];
      steps = [`1つ目: ${totalA} ÷ ${qtyA} = ${priceA}円`, `2つ目: ${totalB} ÷ ${qtyB} = ${priceB}円`, `値段が安い方 → ${answer}`];
      return { category: 'unitRateWordProblem5', question, answer, choices: shuffle([answer, ...wrongs]), steps };
    } else {
      // 燃費の比較：どちらがよく走るか
      let rateA, rateB;
      do { rateA = randInt(5, 15); rateB = randInt(5, 15); } while (rateA === rateB);
      const literA = randInt(2, 9), literB = randInt(2, 9);
      const distA = rateA * literA, distB = rateB * literB;
      const aWins = rateA > rateB;
      question = `自動車Aは、${literA}Lのガソリンで${distA}km走り、自動車Bは、${literB}Lのガソリンで${distB}km走りました。1Lあたりで、よく走るのはどちらの自動車ですか。`;
      answer = aWins ? '自動車A' : '自動車B';
      wrongs = ['どちらも同じ', aWins ? '自動車B' : '自動車A'];
      steps = [`Aは1Lあたり ${distA} ÷ ${literA} = ${rateA}km`, `Bは1Lあたり ${distB} ÷ ${literB} = ${rateB}km`, `距離が長い方がよく走る → ${answer}`];
      return { category: 'unitRateWordProblem5', question, answer, choices: shuffle([answer, ...wrongs]), steps };
    }
    return { category: 'unitRateWordProblem5', question, answer, choices: buildChoices(Number(answer), wrongs.map(Number)), steps };
  }

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

  function terminatesAsDecimal_(d) {
    let x = d;
    while (x % 2 === 0) x /= 2;
    while (x % 5 === 0) x /= 5;
    return x === 1;
  }

  // 分数と小数（小5）：わり算を分数で表す、分数の倍、分数と小数の大小
  function genFracDecimal5() {
    const pat = randInt(0, 6);
    let question, answer, wrongs, steps;
    if (pat === 0) {
      // わり算を分数で表す文章題
      const contexts = [
        { unit: 'm', tpl: (a, b) => `${a}mのリボンを${b}人で同じ長さずつ分けます。1人分は何mになりますか。` },
        { unit: 'L', tpl: (a, b) => `${a}Lのジュースを${b}個のコップに同じかさずつ分けます。コップ1個分は何Lになりますか。` },
        { unit: 'kg', tpl: (a, b) => `${a}kgの砂糖を${b}人で同じ重さずつ分けます。1人分は何kgになりますか。` },
      ];
      const ctx = contexts[randInt(0, contexts.length - 1)];
      let a, b;
      do { a = randInt(2, 20); b = randInt(2, 9); } while (a === b);
      question = ctx.tpl(a, b);
      answer = `${a}/${b}`;
      wrongs = [`${b}/${a}`, `${a + 1}/${b}`, `${a}/${b + 1}`].filter(v => v !== answer);
      steps = [`1人分 = 全体 ÷ 人数 を分数で表す`, `${a} ÷ ${b} = ${a}/${b}`];
    } else if (pat === 1) {
      // わり算をそのまま分数で表す
      let a, b;
      do { a = randInt(1, 20); b = randInt(2, 12); } while (a === b);
      question = `${a} ÷ ${b} を分数で表すと？`;
      answer = `${a}/${b}`;
      wrongs = [`${b}/${a}`, `${a + 1}/${b}`, `${Math.max(1, a - 1)}/${b}`].filter(v => v !== answer);
      steps = [`わり算の商は、わられる数を分子、わる数を分母にした分数で表せる`, `${a} ÷ ${b} = ${answer}`];
    } else if (pat === 2) {
      // □にあてはまる数を求める（分数とわり算の関係）
      const d = randInt(2, 12);
      const n = randInt(1, d - 1);
      const askDenominator = Math.random() < 0.5;
      if (askDenominator) {
        question = `${n}/${d} = ${n} ÷ □ の□にあてはまる数は？`;
        answer = d;
      } else {
        question = `${n}/${d} = □ ÷ ${d} の□にあてはまる数は？`;
        answer = n;
      }
      wrongs = [answer + 1, Math.max(1, answer - 1), askDenominator ? n : d].filter(v => v !== answer);
      steps = [`分数は、分子 ÷ 分母 で表せる`, `= ${answer}`];
      return { category: 'fracDecimal5', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 3) {
      // 分数の倍（年齢などの文章題）
      const baseAge = randInt(6, 12);
      let compareAge;
      do { compareAge = randInt(4, 20); } while (compareAge === baseAge);
      const people = ['姉', '兄', '妹', 'はるきさん'];
      const person = people[randInt(0, people.length - 1)];
      question = `弟の年れいは${baseAge}才、${person}の年れいは${compareAge}才です。弟の年れいをもとにすると、${person}の年れいは何倍にあたりますか。`;
      answer = fracToStr(compareAge, baseAge);
      wrongs = [fracToStr(baseAge, compareAge), fracToStr(compareAge + 1, baseAge), fracToStr(Math.max(1, compareAge - 1), baseAge)].filter(v => v !== answer);
      steps = [`何倍 = くらべる量 ÷ もとにする量`, `${compareAge} ÷ ${baseAge} = ${compareAge}/${baseAge}`, `= ${answer}`];
      return { category: 'fracDecimal5', question, answer, choices: buildChoicesFromList(answer, wrongs), steps };
    } else if (pat === 4) {
      // 分数と小数の大小
      const d = [2, 4, 5, 8, 10, 20, 25][randInt(0, 6)];
      let n;
      do { n = randInt(1, d * 2); } while (n === d);
      const fracVal = n / d;
      const tieBreak = Math.random() < 0.3;
      const decVal = tieBreak ? fracVal : Math.max(0.01, Math.round((fracVal + (Math.random() < 0.5 ? 1 : -1) * (randInt(1, 20) / 100)) * 100) / 100);
      const decStr = decVal.toFixed(2).replace(/0$/, '').replace(/0$/, '').replace(/\.$/, '');
      const fracStr = fracToStr(n, d);
      question = `${fracStr} と ${decStr} では、どちらが大きいですか。（同じ場合は「同じ」）`;
      if (Math.abs(fracVal - decVal) < 0.0001) answer = '同じ';
      else answer = fracVal > decVal ? fracStr : decStr;
      steps = [`${fracStr} を小数に直すと ${fracVal}`, `${fracVal} と ${decStr} を比べる`, `= ${answer}`];
      return { category: 'fracDecimal5', question, answer, choices: shuffle([fracStr, decStr, '同じ']), steps };
    } else if (pat === 5) {
      // 整数で表すことができる分数を選ぶ
      const wholeD = randInt(2, 9);
      const wholeN = wholeD * randInt(2, 6);
      const others = [];
      while (others.length < 3) {
        const dd = randInt(2, 9);
        let nn;
        do { nn = randInt(2, dd * 5); } while (nn % dd === 0);
        const cand = `${nn}/${dd}`;
        if (!others.includes(cand)) others.push(cand);
      }
      answer = `${wholeN}/${wholeD}`;
      question = `次のうち、整数で表すことができる分数はどれですか。`;
      return { category: 'fracDecimal5', question, answer, choices: shuffle([answer, ...others]), steps: [`分子が分母の倍数になっている分数は、整数で表せる`, `${answer} = ${wholeN / wholeD}`] };
    } else {
      // 小数で正確に表すことができる分数を選ぶ
      const termDenoms = [2, 4, 5, 8, 10, 16, 20, 25];
      const nonTermDenoms = [3, 6, 7, 9, 11, 12, 13];
      const td = termDenoms[randInt(0, termDenoms.length - 1)];
      let tn;
      do { tn = randInt(1, td - 1); } while (gcdFrac(tn, td) !== 1);
      const termFrac = fracToStr(tn, td);
      const others = [];
      while (others.length < 3) {
        const dd = nonTermDenoms[randInt(0, nonTermDenoms.length - 1)];
        let nn;
        do { nn = randInt(1, dd - 1); } while (gcdFrac(nn, dd) !== 1 || terminatesAsDecimal_(dd));
        const cand = fracToStr(nn, dd);
        if (!others.includes(cand) && cand !== termFrac) others.push(cand);
      }
      answer = termFrac;
      question = `次のうち、小数で正確に表すことができる分数はどれですか。`;
      return { category: 'fracDecimal5', question, answer, choices: shuffle([answer, ...others]), steps: [`分母を約分したときに2と5だけの積で表せる分数は、小数で正確に表せる`, `${answer} の分母は ${td}`] };
    }
    return { category: 'fracDecimal5', question, answer, choices: buildChoicesFromList(answer, wrongs), steps };
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

  // 平均の文章題（応用）チャレンジレベル（小5）：合計から逆算する複合文章題
  function genAverageWordProblemAdvanced5() {
    const pat = randInt(0, 5);
    let question, answer, wrongs, steps;
    if (pat === 0) {
      const totalTests = randInt(4, 6);
      let known, avg, missing, guard = 0;
      do {
        known = [];
        for (let i = 0; i < totalTests - 1; i++) known.push(randInt(40, 100));
        avg = randInt(50, 95);
        const total = avg * totalTests;
        missing = total - known.reduce((a, b) => a + b, 0);
        guard++;
      } while ((missing < 30 || missing > 100) && guard < 200);
      const missingIdx = randInt(0, totalTests - 1);
      const scores = known.slice();
      scores.splice(missingIdx, 0, null);
      const parts = scores.map((v, i) => v === null ? null : `${i + 1}回目${v}点`).filter(Boolean);
      question = `せいこさんは${totalTests}回の計算テストを受けました。${parts.join('、')}で、${totalTests}回の平均点は${avg}点でした。${missingIdx + 1}回目は何点でしたか。`;
      answer = missing;
      wrongs = [missing + 1, missing + 2, Math.max(1, missing - 1), Math.max(1, missing - 2)].filter(v => v !== answer && v > 0);
      steps = [`${totalTests}回の合計 = ${avg} × ${totalTests} = ${avg * totalTests}`, `${avg * totalTests} − ${known.reduce((a, b) => a + b, 0)} = ${answer}`];
      return { category: 'averageWordProblemAdvanced5', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 1) {
      const names = [
        { group: 'A、B、C、D', extra: 'E' },
        { group: 'A、B、C', extra: 'D' },
      ];
      const nm = names[randInt(0, names.length - 1)];
      const groupSize = nm.group.split('、').length;
      const avgBeforeTenths = randInt(300, 600);
      const totalBeforeTenths = avgBeforeTenths * groupSize;
      let avgAfterTenths, newMemberTenths, guard = 0;
      do {
        avgAfterTenths = randInt(280, 650);
        const newTotalTenths = avgAfterTenths * (groupSize + 1);
        newMemberTenths = newTotalTenths - totalBeforeTenths;
        guard++;
      } while ((newMemberTenths < 150 || newMemberTenths > 800) && guard < 200);
      const avgBefore = (avgBeforeTenths / 10).toString();
      const avgAfter = (avgAfterTenths / 10).toString();
      question = `${nm.group}の${groupSize}人の体重の平均は${avgBefore}kgです。この${groupSize}人に${nm.extra}を加えた${groupSize + 1}人の体重の平均は${avgAfter}kgです。${nm.extra}の体重は何kgですか。`;
      answer = `${(newMemberTenths / 10)}kg`;
      const wrongCands = [
        `${((newMemberTenths + 10) / 10)}kg`,
        `${(Math.max(1, newMemberTenths - 10) / 10)}kg`,
        `${avgAfter}kg`,
      ];
      steps = [`${groupSize}人の合計 = ${avgBefore} × ${groupSize} = ${(totalBeforeTenths / 10)}`, `${groupSize + 1}人の合計 = ${avgAfter} × ${groupSize + 1} = ${(avgAfterTenths * (groupSize + 1) / 10)}`, `差が${nm.extra}の体重 = ${answer}`];
      return { category: 'averageWordProblemAdvanced5', question, answer, choices: buildChoicesFromList(answer, wrongCands), steps };
    } else if (pat === 2) {
      let totalCount, subCount, otherCount, subAvg, totalAvg, otherAvg, guard = 0;
      do {
        totalCount = randInt(25, 40);
        subCount = randInt(10, totalCount - 8);
        otherCount = totalCount - subCount;
        subAvg = randInt(55, 85);
        totalAvg = randInt(55, 85);
        const totalSum = totalAvg * totalCount;
        const subSum = subAvg * subCount;
        const otherSum = totalSum - subSum;
        otherAvg = otherSum / otherCount;
        guard++;
      } while ((!Number.isInteger(otherAvg) || otherAvg < 30 || otherAvg > 100) && guard < 300);
      question = `あるクラスの児童の人数は${totalCount}人です。男子${subCount}人の平均点は${subAvg}点で、クラス全体の平均点は${totalAvg}点でした。このとき、女子の平均点を求めなさい。`;
      answer = otherAvg;
      wrongs = [otherAvg + 1, otherAvg + 2, Math.max(1, otherAvg - 1), Math.max(1, otherAvg - 2)].filter(v => v !== answer && v > 0);
      steps = [`クラス全体の合計 = ${totalAvg} × ${totalCount} = ${totalAvg * totalCount}`, `男子の合計 = ${subAvg} × ${subCount} = ${subAvg * subCount}`, `女子の合計 ÷ ${otherCount} = ${answer}`];
      return { category: 'averageWordProblemAdvanced5', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 3) {
      let A, B, C;
      do {
        A = 2 * randInt(30, 49);
        B = 2 * randInt(30, 49);
        C = 2 * randInt(30, 49);
      } while ((A + B + C) % 3 !== 0);
      const AB = (A + B) / 2, BC = (B + C) / 2, CA = (C + A) / 2;
      answer = (A + B + C) / 3;
      question = `A君とB君の2人のテストの平均点は${AB}点、B君とC君の2人の平均点は${BC}点、C君とA君の2人の平均点は${CA}点でした。3人のテストの平均点を求めなさい。`;
      wrongs = [answer + 1, answer + 2, Math.max(1, answer - 1), Math.max(1, answer - 2)].filter(v => v !== answer && v > 0);
      steps = [`${AB} + ${BC} + ${CA} = ${AB + BC + CA}（= A+B+Cの合計）`, `${AB + BC + CA} ÷ 3 = ${answer}`];
      return { category: 'averageWordProblemAdvanced5', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 4) {
      const f1 = randInt(2, 8), f2 = randInt(2, 8), f3 = randInt(2, 8);
      const workUnits = f1 * f2 * f3;
      const peopleA = f1, daysA = f2 * f3;
      const askDays = Math.random() < 0.5;
      if (askDays) {
        const peopleB = f2;
        const daysB = f1 * f3;
        question = `${peopleA}人ですると${daysA}日かかる仕事があります。この仕事を${peopleB}人ですると何日かかりますか。`;
        answer = daysB;
        wrongs = [daysB + 1, daysB + 2, Math.max(1, daysB - 1), Math.max(1, daysB - 2)].filter(v => v !== answer && v > 0);
        steps = [`仕事全体の量 = ${peopleA} × ${daysA} = ${workUnits}`, `${workUnits} ÷ ${peopleB} = ${answer}`];
      } else {
        const daysC = f2;
        const peopleC = f1 * f3;
        question = `${peopleA}人ですると${daysA}日かかる仕事があります。この仕事を${daysC}日で終わらせるには、何人ですればよいですか。`;
        answer = peopleC;
        wrongs = [peopleC + 1, peopleC + 2, Math.max(1, peopleC - 1), Math.max(1, peopleC - 2)].filter(v => v !== answer && v > 0);
        steps = [`仕事全体の量 = ${peopleA} × ${daysA} = ${workUnits}`, `${workUnits} ÷ ${daysC} = ${answer}`];
      }
      return { category: 'averageWordProblemAdvanced5', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else {
      let n, prevAvg, newScore, newAvg, guard = 0;
      do {
        n = randInt(3, 10);
        prevAvg = randInt(60, 90);
        newScore = randInt(60, 100);
        const total = prevAvg * n + newScore;
        newAvg = total / (n + 1);
        guard++;
      } while ((!Number.isInteger(newAvg) || newAvg === prevAvg) && guard < 300);
      question = `今まで算数のテストが何回かあり、その平均点は${prevAvg}点です。この次のテストで${newScore}点をとると、全体の平均点が${newAvg}点になります。今まで何回テストがありましたか。`;
      answer = n;
      wrongs = [n + 1, n + 2, Math.max(1, n - 1), Math.max(1, n - 2)].filter(v => v !== answer && v > 0);
      steps = [`今までの回数をx回とすると`, `(${prevAvg} × x + ${newScore}) ÷ (x + 1) = ${newAvg}`, `x = ${answer}`];
      return { category: 'averageWordProblemAdvanced5', question, answer, choices: buildChoices(answer, wrongs), steps };
    }
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
    const pat = randInt(0, 2);
    if (pat === 0) {
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
    } else if (pat === 1) {
      // 半径×半径の4分の1の四分円の面積
      const r = randInt(2, 16);
      const areaX100 = r * r * 314;
      const a = (areaX100 / 400).toFixed(2);
      const question = `半径 ${r} cm の四分円（円の4分の1のおうぎ形）の面積は？（円周率は3.14）`;
      const answer = a;
      const candidates = [
        (areaX100 / 100).toFixed(2),
        (areaX100 / 200).toFixed(2),
        (((r + 1) * (r + 1) * 314) / 400).toFixed(2),
      ];
      const steps = [`円の面積 = ${r} × ${r} × 3.14 = ${(areaX100 / 100).toFixed(2)} cm²`, `四分円の面積 = 円の面積 ÷ 4 = ${a} cm²`];
      return { category: 'circleArea6', question, answer, choices: buildChoicesFromList(answer, candidates), steps };
    } else {
      // 大小2つの円がつくる輪(ドーナツ型)の面積
      const inner = randInt(2, 10);
      const outer = inner + randInt(2, 8);
      const areaX100 = (outer * outer - inner * inner) * 314;
      const a = (areaX100 / 100).toFixed(2);
      const question = `半径 ${outer} cm の円から、半径 ${inner} cm の円をくりぬいた、輪の形をした図形の面積は？（円周率は3.14）`;
      const answer = a;
      const candidates = [
        (((outer * outer) - (inner * inner) * 2) * 314 / 100).toFixed(2),
        ((outer * outer * 314) / 100).toFixed(2),
        (((outer + 1) * (outer + 1) - inner * inner) * 314 / 100).toFixed(2),
      ];
      const steps = [`外側の円の面積 = ${outer} × ${outer} × 3.14 = ${((outer * outer * 314) / 100).toFixed(2)} cm²`, `内側の円の面積 = ${inner} × ${inner} × 3.14 = ${((inner * inner * 314) / 100).toFixed(2)} cm²`, `輪の面積 = 外側 − 内側 = ${a} cm²`];
      return { category: 'circleArea6', question, answer, choices: buildChoicesFromList(answer, candidates), steps };
    }
  }

  // 円とおうぎ形（小6）：おうぎ形の面積・弧の長さ・まわりの長さ・中心角の逆算
  function genCircleSector6() {
    const pat = randInt(0, 3);
    const angles = [30, 45, 60, 90, 120, 135, 150, 180, 270];
    let question, answer, steps;
    if (pat === 0) {
      const r = randInt(2, 20);
      const angle = angles[randInt(0, angles.length - 1)];
      const area = (r * r * 3.14 * angle) / 360;
      answer = area.toFixed(2);
      question = `半径${r}cm、中心角${angle}°のおうぎ形の面積は何cm²ですか。（円周率は3.14）`;
      const candidates = [
        (r * r * 3.14).toFixed(2),
        ((r * r * 3.14 * angle) / 180).toFixed(2),
        (((r + 1) * (r + 1) * 3.14 * angle) / 360).toFixed(2),
        ((2 * r * 3.14 * angle) / 360).toFixed(2),
      ];
      steps = [`面積 = 半径 × 半径 × 3.14 × 中心角/360`, `= ${r} × ${r} × 3.14 × ${angle}/360 = ${answer}cm²`];
      return { category: 'circleSector6', question, answer, choices: buildChoicesFromList(answer, candidates), steps };
    } else if (pat === 1) {
      const r = randInt(2, 20);
      const angle = angles[randInt(0, angles.length - 1)];
      const arc = (2 * r * 3.14 * angle) / 360;
      answer = arc.toFixed(2);
      question = `半径${r}cm、中心角${angle}°のおうぎ形の弧の長さは何cmですか。（円周率は3.14）`;
      const candidates = [
        (2 * r * 3.14).toFixed(2),
        ((2 * r * 3.14 * angle) / 180).toFixed(2),
        ((2 * (r + 1) * 3.14 * angle) / 360).toFixed(2),
        ((r * 3.14 * angle) / 360).toFixed(2),
      ];
      steps = [`弧の長さ = 直径 × 3.14 × 中心角/360`, `= ${2 * r} × 3.14 × ${angle}/360 = ${answer}cm`];
      return { category: 'circleSector6', question, answer, choices: buildChoicesFromList(answer, candidates), steps };
    } else if (pat === 2) {
      const r = randInt(2, 20);
      const angle = angles[randInt(0, angles.length - 1)];
      const arc = (2 * r * 3.14 * angle) / 360;
      const perimeter = arc + 2 * r;
      answer = perimeter.toFixed(2);
      question = `半径${r}cm、中心角${angle}°のおうぎ形のまわりの長さは何cmですか。（円周率は3.14）`;
      const candidates = [
        arc.toFixed(2),
        (perimeter + 2).toFixed(2),
        (perimeter - 2).toFixed(2),
        (arc + r).toFixed(2),
      ];
      steps = [`弧の長さ = ${2 * r} × 3.14 × ${angle}/360 = ${arc.toFixed(2)}cm`, `まわりの長さ = 弧の長さ + 半径 × 2 = ${arc.toFixed(2)} + ${2 * r} = ${answer}cm`];
      return { category: 'circleSector6', question, answer, choices: buildChoicesFromList(answer, candidates), steps };
    } else {
      const angleSet = [60, 90, 120, 180];
      const angle = angleSet[randInt(0, angleSet.length - 1)];
      let r;
      if (angle === 90) r = 2 * randInt(1, 10);
      else if (angle === 180) r = randInt(2, 20);
      else if (angle === 120) r = 3 * randInt(1, 6);
      else r = 6 * randInt(1, 3);
      const area = (r * r * 3.14 * angle) / 360;
      const areaStr = area.toFixed(2);
      question = `半径${r}cmのおうぎ形の面積が${areaStr}cm²でした。このおうぎ形の中心角は何度ですか。（円周率は3.14）`;
      answer = angle;
      const wrongs = [angle + 30, angle + 60, Math.max(10, angle - 30), Math.max(10, angle - 60)].filter(v => v !== answer && v > 0);
      steps = [`中心角 = 360 × 面積 ÷ (半径 × 半径 × 3.14)`, `= 360 × ${areaStr} ÷ (${r} × ${r} × 3.14) = ${answer}°`];
      return { category: 'circleSector6', question, answer, choices: buildChoices(answer, wrongs), steps };
    }
  }

  // 分数を含んだ速さの計算（小6）：時間の単位を分数で表す換算、分数の時間・速さでの
  // 速さ・道のり・時間の計算（文章題を含む）
  const SPEED_FRAC6_HOUR_MIN_DIVISORS_ = [2, 3, 4, 5, 6, 10, 12, 15, 20, 30, 60];
  function genSpeedFrac6() {
    const pat = randInt(0, 5);
    let question, answer, wrongs, candidates, steps;
    if (pat === 0) {
      // 分数時間→分、分数分→秒（分母が60の約数なので必ず整数になる）
      const kind = randInt(0, 1);
      const d = SPEED_FRAC6_HOUR_MIN_DIVISORS_[randInt(0, SPEED_FRAC6_HOUR_MIN_DIVISORS_.length - 1)];
      const n = randInt(1, d + Math.floor(d / 2));
      const answerNum = (n * 60) / d;
      const fracStr = fracDisplayStr6_(n, d);
      question = kind === 0 ? `${fracStr}時間は何分ですか。` : `${fracStr}分は何秒ですか。`;
      answer = answerNum;
      wrongs = [answerNum + 2, answerNum + 4, Math.max(1, answerNum - 2), Math.max(1, answerNum - 4)].filter(v => v !== answer && v > 0);
      steps = kind === 0 ? [`${fracStr}時間 = (60×${fracStr})分 = ${answer}分`] : [`${fracStr}分 = (60×${fracStr})秒 = ${answer}秒`];
      return { category: 'speedFrac6', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 1) {
      // 整数分→分数時間、整数秒→分数分（答えが分数）
      const kind = randInt(0, 1);
      const m = randInt(1, 119);
      answer = fracDisplayStr6_(m, 60);
      candidates = [fracDisplayStr6_(m + 60, 60), fracDisplayStr6_(m + 120, 60), fracDisplayStr6_(m + 180, 60), fracDisplayStr6_(m, 62)];
      question = kind === 0 ? `${m}分は何時間ですか。分数で答えなさい。` : `${m}秒は何分ですか。分数で答えなさい。`;
      steps = kind === 0 ? [`${m}分 = ${m}/60時間 = ${answer}時間`] : [`${m}秒 = ${m}/60分 = ${answer}分`];
      return { category: 'speedFrac6', question, answer, choices: buildChoicesFromList(answer, candidates), steps };
    } else if (pat === 2) {
      // 道のり・分数時間 → 時速を求める
      const d = randInt(2, 10);
      let n; do { n = randInt(1, d - 1); } while (gcdFrac(n, d) !== 1);
      const k = randInt(2, 15);
      const S = k * d;
      const distance = k * n;
      const fracStr = fracDisplayStr6_(n, d);
      question = `${distance}kmの道のりを${fracStr}時間で走る電車の速さは、時速何kmですか。`;
      answer = S;
      wrongs = [S + 5, S + 10, Math.max(1, S - 5), Math.max(1, S - 10)].filter(v => v !== answer && v > 0);
      steps = [`速さ = 道のり ÷ 時間 = ${distance} ÷ ${fracStr} = ${answer}`];
      return { category: 'speedFrac6', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 3) {
      // 道のり・整数分（分を時間の分数に直す）→ 時速を求める
      const mList = [10, 12, 15, 20, 30, 60];
      const m = mList[randInt(0, mList.length - 1)];
      const k = randInt(1, 10);
      const S = k * (60 / m);
      const distance = k;
      question = `${distance}kmの道のりを${m}分で走る自転車の時速は何kmですか。`;
      answer = S;
      wrongs = [S + 5, S + 10, Math.max(1, S - 5), Math.max(1, S - 10)].filter(v => v !== answer && v > 0);
      steps = [`単位を時間にそろえると、${m}分 = ${m}/60時間`, `${distance} ÷ ${m}/60 = ${answer}`];
      return { category: 'speedFrac6', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 4) {
      // 時速・道のり → かかる時間を分数時間で求め、分に直す
      const dList = [2, 3, 4, 5, 6, 10, 12, 15, 20, 30];
      const d = dList[randInt(0, dList.length - 1)];
      let n; do { n = randInt(1, d - 1); } while (gcdFrac(n, d) !== 1);
      const base = randInt(2, 8);
      const D = n * base;
      const S = d * base;
      const minutesAnswer = (n * 60) / d;
      const fracStr = fracDisplayStr6_(n, d);
      question = `時速${S}kmで走るバスが、${D}kmの道のりを進むのにかかる時間は何分ですか。`;
      answer = minutesAnswer;
      wrongs = [minutesAnswer + 5, minutesAnswer + 10, Math.max(1, minutesAnswer - 5), Math.max(1, minutesAnswer - 10)].filter(v => v !== answer && v > 0);
      steps = [`時間 = 道のり ÷ 速さ = ${D} ÷ ${S} = ${fracStr}時間`, `= (60×${fracStr})分 = ${answer}分`];
      return { category: 'speedFrac6', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else {
      // 分数の分速・整数分 → 道のりを求める
      const d = randInt(2, 10);
      let n; do { n = randInt(1, d - 1); } while (gcdFrac(n, d) !== 1);
      const k = randInt(2, 10);
      const t = d * k;
      const distance = n * k;
      const fracStr = fracDisplayStr6_(n, d);
      question = `分速${fracStr}kmで走る自動車が、${t}分間に進む道のりは何kmですか。`;
      answer = distance;
      wrongs = [distance + 2, distance + 4, Math.max(1, distance - 2), Math.max(1, distance - 4)].filter(v => v !== answer && v > 0);
      steps = [`道のり = 速さ × 時間 = ${fracStr} × ${t} = ${answer}km`];
      return { category: 'speedFrac6', question, answer, choices: buildChoices(answer, wrongs), steps };
    }
  }

  // 仕事算・旅人算・通過算（小6）：小4〜小6の算数まとめの文章題のうち、既存単元に
  // 無かった3タイプ(仕事算・列車の通過算・池のまわりの旅人算)をまとめた単元
  const WORK_MEETING_PASSAGE6_PAIRS_ = [[4, 12, 3], [6, 3, 2], [9, 18, 6], [8, 8, 4], [10, 15, 6], [20, 5, 4], [6, 6, 3], [16, 16, 8], [12, 12, 6]];
  function genWorkMeetingPassage6() {
    const pat = randInt(0, 2);
    let question, answer, wrongs, steps;
    if (pat === 0) {
      const [a, b, combined] = WORK_MEETING_PASSAGE6_PAIRS_[randInt(0, WORK_MEETING_PASSAGE6_PAIRS_.length - 1)];
      const kind = randInt(0, 1);
      if (kind === 0) {
        question = `ある仕事をAさん1人ですると${a}日、Bさん1人ですると${b}日かかります。この仕事をAさんとBさんの2人でいっしょにすると、何日かかりますか。`;
        answer = combined;
        wrongs = [combined + 1, combined + 2, Math.max(1, combined - 1), Math.max(1, combined - 2)].filter(v => v !== answer && v > 0);
        steps = [`1日にできる仕事量: Aさん = 1/${a}、Bさん = 1/${b}`, `2人ですると1日に 1/${a}+1/${b} = 1/${combined} だけ進むので、${combined}日かかる`];
      } else {
        question = `ある仕事を、AさんとBさんの2人でいっしょにすると${combined}日かかります。この仕事をAさんだけですると${a}日かかるとすると、Bさんだけですると何日かかりますか。`;
        answer = b;
        wrongs = [b + 1, b + 2, Math.max(1, b - 1), Math.max(1, b - 2)].filter(v => v !== answer && v > 0);
        steps = [`2人の1日の仕事量 = 1/${combined}、Aさんの1日の仕事量 = 1/${a}`, `Bさんの1日の仕事量 = 1/${combined} − 1/${a}`, `Bさんだけですると${b}日かかる`];
      }
      return { category: 'workMeetingPassage6', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 1) {
      const speed = randInt(10, 25);
      const time = randInt(8, 40);
      const totalDist = speed * time;
      const trainLen = randInt(Math.max(30, totalDist - 500), totalDist - 20);
      const objLen = totalDist - trainLen;
      const kind = randInt(0, 1);
      if (kind === 0) {
        question = `長さ${trainLen}mの列車が、秒速${speed}mで走っています。この列車が、長さ${objLen}mの鉄橋を渡り始めてから渡り終わるまでにかかる時間は何秒ですか。`;
        answer = time;
        wrongs = [time + 2, time + 4, Math.max(1, time - 2), Math.max(1, time - 4)].filter(v => v !== answer && v > 0);
        steps = [`渡る道のり = 列車の長さ + 鉄橋の長さ = ${trainLen} + ${objLen} = ${totalDist}m`, `時間 = ${totalDist} ÷ ${speed} = ${answer}秒`];
      } else {
        question = `長さ${trainLen}mの列車が、長さ${objLen}mの鉄橋を渡り始めてから渡り終わるまでに${time}秒かかりました。この列車の速さは秒速何mですか。`;
        answer = speed;
        wrongs = [speed + 2, speed + 4, Math.max(1, speed - 2), Math.max(1, speed - 4)].filter(v => v !== answer && v > 0);
        steps = [`渡る道のり = 列車の長さ + 鉄橋の長さ = ${trainLen} + ${objLen} = ${totalDist}m`, `速さ = ${totalDist} ÷ ${time} = 秒速${answer}m`];
      }
      return { category: 'workMeetingPassage6', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else {
      const kind = randInt(0, 1);
      if (kind === 0) {
        const vA = randInt(40, 90), vB = randInt(40, 90);
        const sumV = vA + vB;
        const time = randInt(3, 15);
        const L = sumV * time;
        question = `池のまわりを、AさんとBさんが同じ地点から反対方向に同時に出発します。Aさんの速さは分速${vA}m、Bさんの速さは分速${vB}mです。池のまわりは${L}mあります。2人が出会うのは出発してから何分後ですか。`;
        answer = time;
        wrongs = [time + 2, time + 4, Math.max(1, time - 2), Math.max(1, time - 4)].filter(v => v !== answer && v > 0);
        steps = [`2人が1分間に近づく道のり = ${vA} + ${vB} = ${sumV}m`, `出会うまでの時間 = ${L} ÷ ${sumV} = ${answer}分後`];
      } else {
        const vB = randInt(40, 80);
        const vA = randInt(vB + 10, vB + 60);
        const diffV = vA - vB;
        const time = randInt(5, 20);
        const L = diffV * time;
        question = `池のまわりを、AさんとBさんが同じ地点から同じ方向に同時に出発します。Aさんの速さは分速${vA}m、Bさんの速さは分速${vB}mです。池のまわりは${L}mあります。AさんがBさんに追いつくのは出発してから何分後ですか。`;
        answer = time;
        wrongs = [time + 2, time + 4, Math.max(1, time - 2), Math.max(1, time - 4)].filter(v => v !== answer && v > 0);
        steps = [`1分間に縮まる差 = ${vA} − ${vB} = ${diffV}m`, `追いつくまでの時間 = ${L} ÷ ${diffV} = ${answer}分後`];
      }
      return { category: 'workMeetingPassage6', question, answer, choices: buildChoices(answer, wrongs), steps };
    }
  }

  // 算数のまとめ（小4〜小6）：既存の小4〜小6の各単元の出題ロジックをそのまま流用し、
  // 出題のたびにランダムでどれか1つを選んで出す「ミックス」単元。中身は既存単元の
  // 複製ではなく、実際にその単元で使われている生成関数を直接呼び出しているので、
  // 各単元の最新の出題内容がそのまま反映される。
  const MATH_SUMMARY_456_GENS_ = [
    genRound4, genFourOps4, genDecAddSub4, genDecMul4, genFrac4, genUnit4, genMul3x2_4,
    genDivRemainder4, genDiv2by1_4, genDiv2by2_4, genDiv3by1_4, genDiv3by2_4, genDiv3by3_4,
    genRectArea4, genLargeNum4, genDecAddSubMixed4, genSetSquareAngle4, genTimesWordProblem4,
    genDivWordProblem4, genDecWordProblem4, genFracType4, genSumDiffWordProblem4,
    genDecStructure5, genEvenOdd5, genFracAddSub5, genDecFracAddSub5, genFracReduceConvert5,
    genDecMul5, genDecDiv5, genDecDivRemainder5, genDecWordProblem5, genSpeedRate5, genSpeedApp5,
    genUnitRateWordProblem5, genTimeFraction5, genPercent5, genPercentWordProblem5,
    genPercentWordProblemAdvanced5, genFigureArea5, genPercentConvert5, genMultiples5,
    genMultiplesDivisorsWordProblem5, genPolygonAngle5, genFracDecConvert5, genFracDecimal5,
    genAverage5, genAverageWordProblemAdvanced5, genCircumference5, genFracMulDiv6,
    genFracDecIntMulDiv6, genFracWordProblem6, genRatioWordProblem6, genRatio6, genScale6,
    genDataValues6, genArrangeCombine6, genCircleArea6, genCircleSector6, genSpeedFrac6,
    genWorkMeetingPassage6, genPrismVolume6,
  ];
  function genMathSummary456() {
    const gen = MATH_SUMMARY_456_GENS_[randInt(0, MATH_SUMMARY_456_GENS_.length - 1)];
    const q = gen();
    q.category = 'mathSummary456';
    return q;
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

  // 小4はまだ約分を習っていないため、分母はそのまま（約分しない）。
  // ただし分子が分母の倍数になる場合（=整数になる場合）だけ整数で答える。
  function mixedFracStr(num, den) {
    if (num % den === 0) return `${num / den}`;
    const whole = Math.floor(num / den);
    const rem = num % den;
    if (whole === 0) return `${rem}/${den}`;
    return `${whole} ${rem}/${den}`;
  }

  // "1 2/3" 、"4/3" 、"1" のような文字列を数値に変換する（同じ値の別表記を
  // 見分けて重複選択肢を除くために使う）
  function fracTextValue4_(s) {
    const parts = String(s).trim().split(' ');
    if (parts.length === 2) {
      const whole = parseInt(parts[0], 10);
      const [n, dd] = parts[1].split('/').map(Number);
      return whole + n / dd;
    }
    if (String(s).includes('/')) {
      const [n, dd] = String(s).split('/').map(Number);
      return n / dd;
    }
    return parseInt(s, 10);
  }

  // 小数のたし算・ひき算（小4）
  function genDecAddSub4() {
    const isAdd = Math.random() < 0.5;
    let aTenths, bTenths;
    do { aTenths = randInt(11, 999); } while (aTenths % 10 === 0);
    do { bTenths = randInt(11, 999); } while (bTenths % 10 === 0);
    if (!isAdd && aTenths < bTenths) { [aTenths, bTenths] = [bTenths, aTenths]; }
    const a = (aTenths / 10).toFixed(1);
    const b = (bTenths / 10).toFixed(1);
    const resultTenths = isAdd ? aTenths + bTenths : aTenths - bTenths;
    const answer = trimTrailingZeros((resultTenths / 10).toFixed(1));
    const question = `${a} ${isAdd ? '+' : '−'} ${b} = ?`;
    const candidates = [
      trimTrailingZeros((Math.max(0, resultTenths - 10) / 10).toFixed(1)),
      trimTrailingZeros(((resultTenths + 10) / 10).toFixed(1)),
      `${Math.round(resultTenths / 10)}`,
      trimTrailingZeros((Math.abs(aTenths - bTenths) / 10).toFixed(1)),
    ];
    const steps = [`小数点をそろえて計算する`, `${a} ${isAdd ? '+' : '−'} ${b} = ${answer}`];
    return { category: 'decAddSub4', question, answer, choices: buildChoicesFromList(answer, candidates), steps };
  }

  // 小数のたし算・ひき算（小4）：小数点の位置がそろっていない・整数との混合・3口の計算
  function genDecAddSubMixed4() {
    const pat = randInt(0, 1);
    if (pat === 0) {
      // 小数のけた数がそろっていない2口の計算（整数を含むこともある）
      let decA = randInt(0, 3), decB = randInt(0, 3);
      if (decA === decB) decB = (decB + 1) % 4;
      const aInt = randInt(1, 999), bInt = randInt(1, 999);
      const maxD = Math.max(decA, decB);
      const aScaled = aInt * Math.pow(10, maxD - decA);
      const bScaled = bInt * Math.pow(10, maxD - decB);
      const isAdd = Math.random() < 0.5;
      let aFinalInt = aInt, aFinalDec = decA, bFinalInt = bInt, bFinalDec = decB;
      let x = aScaled, y = bScaled;
      if (!isAdd && x < y) {
        [x, y] = [y, x];
        aFinalInt = bInt; aFinalDec = decB; bFinalInt = aInt; bFinalDec = decA;
      }
      const A = formatScaledDecimal_(aFinalInt, aFinalDec);
      const B = formatScaledDecimal_(bFinalInt, bFinalDec);
      const resultScaled = isAdd ? (aScaled + bScaled) : (x - y);
      const answer = formatScaledDecimal_(resultScaled, maxD);
      const question = `${A} ${isAdd ? '+' : '−'} ${B} = ?`;
      const candidates = [
        formatScaledDecimal_(resultScaled + Math.pow(10, maxD > 0 ? maxD - 1 : 0), maxD),
        formatScaledDecimal_(Math.max(0, resultScaled - Math.pow(10, maxD > 0 ? maxD - 1 : 0)), maxD),
        formatScaledDecimal_(resultScaled + Math.pow(10, maxD), maxD),
      ];
      const steps = [`小数点の位置をそろえて計算する`, `${A} ${isAdd ? '+' : '−'} ${B} = ${answer}`];
      return { category: 'decAddSubMixed4', question, answer, choices: buildChoicesFromList(answer, candidates), steps };
    } else {
      // 3口の計算（A op1 B op2 C、答えが負にならないように調整）
      const ops = [['+', '−'], ['−', '+'], ['−', '−']][randInt(0, 2)];
      let A, B, C, decA, decB, decC, maxD, result;
      for (let attempt = 0; attempt < 30; attempt++) {
        decA = randInt(0, 2); decB = randInt(0, 2); decC = randInt(0, 2);
        maxD = Math.max(decA, decB, decC);
        const aInt = randInt(10, 999), bInt = randInt(10, 999), cInt = randInt(10, 999);
        const aS = aInt * Math.pow(10, maxD - decA);
        const bS = bInt * Math.pow(10, maxD - decB);
        const cS = cInt * Math.pow(10, maxD - decC);
        const r = (ops[0] === '+' ? aS + bS : aS - bS);
        const r2 = (ops[1] === '+' ? r + cS : r - cS);
        if (r >= 0 && r2 >= 0) {
          A = formatScaledDecimal_(aInt, decA); B = formatScaledDecimal_(bInt, decB); C = formatScaledDecimal_(cInt, decC);
          result = r2;
          break;
        }
      }
      if (result === undefined) { A = '10'; B = '3.5'; C = '2.1'; decA = 0; decB = 1; decC = 1; maxD = 1; result = ops[0] === '+' ? (ops[1] === '+' ? 155 : 115) : 45; }
      const answer = formatScaledDecimal_(result, maxD);
      const question = `${A} ${ops[0]} ${B} ${ops[1]} ${C} = ?`;
      const candidates = [
        formatScaledDecimal_(result + Math.pow(10, maxD > 0 ? maxD - 1 : 0), maxD),
        formatScaledDecimal_(Math.max(0, result - Math.pow(10, maxD > 0 ? maxD - 1 : 0)), maxD),
        formatScaledDecimal_(result + Math.pow(10, maxD), maxD),
      ];
      const steps = [`前から順に計算する`, `${A} ${ops[0]} ${B} = ${formatScaledDecimal_((ops[0] === '+' ? (parseFloat(A) + parseFloat(B)) : (parseFloat(A) - parseFloat(B))) * Math.pow(10, maxD), maxD)}`, `${ops[1]} ${C} = ${answer}`];
      return { category: 'decAddSubMixed4', question, answer, choices: buildChoicesFromList(answer, candidates), steps };
    }
  }

  // 分数のたし算・ひき算（同分母、小4）
  function genFrac4() {
    const pat = randInt(0, 3);
    const d = randInt(3, 9);
    let question, answer, candidates;
    if (pat === 0) {
      const a = randInt(1, d - 1), b = randInt(1, d - 1);
      question = `${a}/${d} + ${b}/${d} = ?`;
      answer = mixedFracStr(a + b, d);
      candidates = [`${a + b}/${d}`, mixedFracStr(a + b + 1, d), mixedFracStr(Math.max(1, a + b - 1), d), mixedFracStr(a + b, d + 1)];
    } else if (pat === 1) {
      let a = randInt(1, d - 1), b = randInt(1, d - 1);
      if (a === b) { a = Math.min(d - 1, a + 1); }
      if (a < b) { [a, b] = [b, a]; }
      question = `${a}/${d} − ${b}/${d} = ?`;
      answer = mixedFracStr(a - b, d);
      candidates = [`${a - b}/${d}`, mixedFracStr(a - b + 1, d), mixedFracStr(Math.max(1, a - b - 1), d), mixedFracStr(a + b, d)];
    } else if (pat === 2) {
      const w1 = randInt(1, 4), f1 = randInt(1, d - 1);
      const w2 = randInt(1, 4), f2 = randInt(1, d - 1);
      const totalNum = (w1 * d + f1) + (w2 * d + f2);
      question = `${w1} ${f1}/${d} + ${w2} ${f2}/${d} = ?`;
      answer = mixedFracStr(totalNum, d);
      candidates = [
        `${w1 + w2} ${f1 + f2}/${d}`,
        mixedFracStr(totalNum + 1, d),
        mixedFracStr(Math.max(1, totalNum - 1), d),
        mixedFracStr(totalNum + d, d),
      ];
    } else {
      const w2 = randInt(1, 3), f2 = randInt(1, d - 1);
      const w1 = randInt(w2 + 1, w2 + 4), f1 = randInt(1, d - 1);
      const num1 = w1 * d + f1, num2 = w2 * d + f2;
      const diff = num1 - num2;
      question = `${w1} ${f1}/${d} − ${w2} ${f2}/${d} = ?`;
      answer = mixedFracStr(diff, d);
      candidates = [
        `${Math.max(0, w1 - w2)} ${Math.abs(f1 - f2)}/${d}`,
        mixedFracStr(diff + 1, d),
        mixedFracStr(Math.max(1, diff - 1), d),
        mixedFracStr(diff + d, d),
      ];
    }
    const steps = [`分母${d}のまま、分子どうしで計算する`, `= ${answer}`];
    // candidatesの中に、表記は違うが答えと同じ値になるもの(例: 答え「1 1/3」に対して
    // 「4/3」)が紛れることがあり、その場合「正解が2つある」状態になってしまう。
    // 数値としても答えと異なるものだけを選択肢の候補として残す。
    const answerVal = fracTextValue4_(answer);
    const filteredCandidates = candidates.filter(c => Math.abs(fracTextValue4_(c) - answerVal) > 1e-9);
    return { category: 'frac4', question, questionHtml: stepToHtml(question), answer, choices: buildChoicesFromList(answer, filteredCandidates), steps };
  }

  // 単位の変換（小4）
  function genUnit4() {
    const pat = randInt(0, 14);
    let question, answer, candidates, wrongs;
    if (pat === 0) {
      const mm = randInt(2, 99);
      const cmStr = trimTrailingZeros((mm / 10).toFixed(1));
      question = `${mm} mm は 何 cm ？`;
      answer = cmStr;
      candidates = [`${mm}`, trimTrailingZeros(((mm + 10) / 10).toFixed(1)), trimTrailingZeros((Math.max(1, mm - 10) / 10).toFixed(1)), (mm / 100).toFixed(2)];
      return { category: 'unit4', question, answer, choices: buildChoicesFromList(answer, candidates), steps: [`1cm = 10mm なので ÷10`, `${mm} ÷ 10 = ${cmStr} cm`] };
    } else if (pat === 1) {
      const cm = randInt(1, 99);
      answer = cm * 10;
      wrongs = [cm, answer + 10, Math.max(1, answer - 10)];
      return { category: 'unit4', question: `${cm} cm は 何 mm ？`, answer, choices: buildChoices(answer, wrongs), steps: [`1cm = 10mm なので ×10`, `${cm} × 10 = ${answer} mm`] };
    } else if (pat === 2) {
      const g = randInt(1, 49) * 100;
      const kgStr = trimTrailingZeros((g / 1000).toFixed(1));
      question = `${g} g は 何 kg ？`;
      answer = kgStr;
      candidates = [`${g}`, trimTrailingZeros(((g + 1000) / 1000).toFixed(1)), trimTrailingZeros((Math.max(100, g - 1000) / 1000).toFixed(1)), trimTrailingZeros((g / 100).toFixed(1))];
      return { category: 'unit4', question, answer, choices: buildChoicesFromList(answer, candidates), steps: [`1000g = 1kg なので ÷1000`, `${g} ÷ 1000 = ${kgStr} kg`] };
    } else if (pat === 3) {
      const kgTenths = randInt(1, 99);
      const kgStr = (kgTenths / 10).toFixed(1);
      answer = kgTenths * 100;
      wrongs = [kgTenths, answer + 100, Math.max(1, answer - 100)];
      return { category: 'unit4', question: `${kgStr} kg は 何 g ？`, answer, choices: buildChoices(answer, wrongs), steps: [`1kg = 1000g なので ×1000`, `${kgStr} × 1000 = ${answer} g`] };
    } else if (pat === 4) {
      const kmPart = randInt(1, 9), mPart = randInt(1, 9) * 100;
      const totalM = kmPart * 1000 + mPart;
      const kmStr = (totalM / 1000).toFixed(1);
      question = `${kmPart}km${mPart}m は 何 km ？`;
      answer = kmStr;
      candidates = [`${kmPart}.${mPart}`, ((totalM + 1000) / 1000).toFixed(1), (Math.max(100, totalM - 1000) / 1000).toFixed(1), `${kmPart}`];
      return { category: 'unit4', question, answer, choices: buildChoicesFromList(answer, candidates), steps: [`1000m = 1km なので m 部分を km に直す`, `${totalM} m = ${kmStr} km`] };
    } else if (pat === 5) {
      const mPart = randInt(1, 9), cmPart = randInt(1, 9) * 10;
      const totalCm = mPart * 100 + cmPart;
      const mStr = (totalCm / 100).toFixed(1);
      question = `${mPart}m${cmPart}cm は 何 m ？`;
      answer = mStr;
      candidates = [`${mPart}.${cmPart}`, ((totalCm + 100) / 100).toFixed(1), (Math.max(10, totalCm - 100) / 100).toFixed(1), `${mPart}`];
      return { category: 'unit4', question, answer, choices: buildChoicesFromList(answer, candidates), steps: [`100cm = 1m なので cm 部分を m に直す`, `${totalCm} cm = ${mStr} m`] };
    } else if (pat === 6) {
      const m2 = randInt(1, 9);
      answer = m2 * 10000;
      wrongs = [m2 * 100, answer + 10000, Math.max(1, answer - 10000)];
      return { category: 'unit4', question: `${m2} m² は 何 cm² ？`, answer, choices: buildChoices(answer, wrongs), steps: [`1m² = 10000cm² なので ×10000`, `${m2} × 10000 = ${answer} cm²`] };
    } else if (pat === 7) {
      const km2 = randInt(1, 9);
      answer = km2 * 1000000;
      wrongs = [km2 * 1000, answer + 1000000, Math.max(1, answer - 1000000)];
      return { category: 'unit4', question: `${km2} km² は 何 m² ？`, answer, choices: buildChoices(answer, wrongs), steps: [`1km² = 1000000m² なので ×1000000`, `${km2} × 1000000 = ${answer} m²`] };
    } else if (pat === 8) {
      const km2 = randInt(1, 9);
      answer = km2 * 100;
      wrongs = [km2 * 10, answer + 100, Math.max(1, answer - 100)];
      return { category: 'unit4', question: `${km2} km² は 何 ha ？`, answer, choices: buildChoices(answer, wrongs), steps: [`1km² = 100ha なので ×100`, `${km2} × 100 = ${answer} ha`] };
    } else if (pat === 9) {
      const ha = randInt(1, 9) * 100;
      answer = ha / 100;
      wrongs = [ha / 10, answer + 1, Math.max(1, answer - 1)];
      return { category: 'unit4', question: `${ha} ha は 何 km² ？`, answer, choices: buildChoices(answer, wrongs), steps: [`100ha = 1km² なので ÷100`, `${ha} ÷ 100 = ${answer} km²`] };
    } else if (pat === 10) {
      const ha = randInt(1, 9);
      answer = ha * 100;
      wrongs = [ha * 10, answer + 100, Math.max(1, answer - 100)];
      return { category: 'unit4', question: `${ha} ha は 何 a ？`, answer, choices: buildChoices(answer, wrongs), steps: [`1ha = 100a なので ×100`, `${ha} × 100 = ${answer} a`] };
    } else if (pat === 11) {
      const a = randInt(1, 9) * 100;
      answer = a / 100;
      wrongs = [a / 10, answer + 1, Math.max(1, answer - 1)];
      return { category: 'unit4', question: `${a} a は 何 ha ？`, answer, choices: buildChoices(answer, wrongs), steps: [`100a = 1ha なので ÷100`, `${a} ÷ 100 = ${answer} ha`] };
    } else if (pat === 12) {
      const ha = randInt(1, 9);
      answer = ha * 10000;
      wrongs = [ha * 1000, answer + 10000, Math.max(1, answer - 10000)];
      return { category: 'unit4', question: `${ha} ha は 何 m² ？`, answer, choices: buildChoices(answer, wrongs), steps: [`1ha = 10000m² なので ×10000`, `${ha} × 10000 = ${answer} m²`] };
    } else if (pat === 13) {
      const a = randInt(1, 9);
      answer = a * 100;
      wrongs = [a * 10, answer + 100, Math.max(1, answer - 100)];
      return { category: 'unit4', question: `${a} a は 何 m² ？`, answer, choices: buildChoices(answer, wrongs), steps: [`1a = 100m² なので ×100`, `${a} × 100 = ${answer} m²`] };
    } else {
      const m2 = randInt(1, 9) * 100;
      answer = m2 / 100;
      wrongs = [m2 / 10, answer + 1, Math.max(1, answer - 1)];
      return { category: 'unit4', question: `${m2} m² は 何 a ？`, answer, choices: buildChoices(answer, wrongs), steps: [`100m² = 1a なので ÷100`, `${m2} ÷ 100 = ${answer} a`] };
    }
  }

  // 3桁×2桁のかけ算（小4）
  function genMul3x2_4() {
    const a = randInt(100, 999);
    const b = randInt(10, 99);
    const answer = a * b;
    const question = `${a} × ${b} = ?`;
    const bTens = Math.floor(b / 10) * 10, bOnes = b % 10;
    const wrongs = [answer + b, Math.max(1, answer - b), a * (b + 1), a * bTens + a * bOnes + 10];
    const steps = [`${a} × ${b} = ${a} × ${bTens} + ${a} × ${bOnes}`, `= ${a * bTens} + ${a * bOnes}`, `= ${answer}`];
    return { category: 'mul3x2_4', question, answer, choices: buildChoices(answer, wrongs), steps };
  }

  // かけ算の筆算（小3）：2桁×1桁、3桁×1桁
  function genMulWritten3() {
    const pat = randInt(0, 1);
    const b = randInt(2, 9);
    const a = pat === 0 ? randInt(10, 99) : randInt(100, 999);
    const answer = a * b;
    const question = `${a} × ${b} = ?`;
    const wrongs = [answer + b, Math.max(1, answer - b), a * (b + 1), Math.max(1, a * (b - 1))]
      .filter((v, i, arr) => arr.indexOf(v) === i);
    let steps;
    if (pat === 0) {
      const tens = Math.floor(a / 10) * 10, ones = a % 10;
      steps = [`${a} × ${b} = ${tens} × ${b} + ${ones} × ${b}`, `= ${tens * b} + ${ones * b}`, `= ${answer}`];
    } else {
      const hundreds = Math.floor(a / 100) * 100, rest = a % 100;
      steps = [`${a} × ${b} = ${hundreds} × ${b} + ${rest} × ${b}`, `= ${hundreds * b} + ${rest * b}`, `= ${answer}`];
    }
    return { category: 'mulWritten3', question, answer, choices: buildChoices(answer, wrongs), steps };
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

  const VERT_PAIR = { a: 'c', b: 'd', c: 'a', d: 'b' };
  const CORRESPONDING_PAIR = { a: 'e', b: 'f', c: 'g', d: 'h', e: 'a', f: 'b', g: 'c', h: 'd' };
  const ALTERNATE_PAIR = { c: 'e', d: 'f', e: 'c', f: 'd' };
  // 教科書と同じく、平行記号を斜めに表示する（プレーンテキストの∥だと縦棒に見えるため）。
  const PARALLEL_SYM_HTML = '<span style="display:inline-block;transform:skewX(-18deg)">∥</span>';

  function mkVerticalAnglesSvg(givenLabel, theta) {
    const pos = { a: [35, 25], b: [78, 25], c: [78, 78], d: [35, 78] };
    const parts = Object.keys(pos).map(k => {
      const [x, y] = pos[k];
      const txt = k === givenLabel ? `${k}=${theta}°` : k;
      const color = k === givenLabel ? '#c23b2e' : '#1c2127';
      return `<text x="${x}" y="${y}" font-size="13" font-weight="bold" fill="${color}" text-anchor="middle">${txt}</text>`;
    }).join('');
    return `<svg width="115" height="100" viewBox="0 0 115 100" style="display:block;margin:0 auto 8px"><line x1="8" y1="50" x2="106" y2="50" stroke="#1c2127" stroke-width="1.5"/><line x1="25" y1="15" x2="89" y2="85" stroke="#1c2127" stroke-width="1.5"/>${parts}</svg>`;
  }

  function mkParallelTransversalSvg(givenLabel, theta, targetLabel) {
    const topPos = { a: [30, 18], b: [66, 18], c: [66, 42], d: [30, 42] };
    const botPos = { e: [54, 58], f: [90, 58], g: [90, 82], h: [54, 82] };
    const allPos = Object.assign({}, topPos, botPos);
    const parts = Object.keys(allPos).map(k => {
      const [x, y] = allPos[k];
      const txt = k === givenLabel ? `${k}=${theta}°` : k;
      const color = k === givenLabel ? '#c23b2e' : (k === targetLabel ? '#2563eb' : '#1c2127');
      return `<text x="${x}" y="${y}" font-size="12" font-weight="bold" fill="${color}" text-anchor="middle">${txt}</text>`;
    }).join('');
    return `<svg width="130" height="105" viewBox="0 0 130 105" style="display:block;margin:0 auto 8px"><line x1="8" y1="30" x2="118" y2="30" stroke="#1c2127" stroke-width="1.5"/><line x1="8" y1="70" x2="118" y2="70" stroke="#1c2127" stroke-width="1.5"/><line x1="30" y1="0" x2="90" y2="100" stroke="#1c2127" stroke-width="1.5"/><text x="122" y="34" font-size="12" fill="#1c2127">l</text><text x="122" y="74" font-size="12" fill="#1c2127">m</text>${parts}</svg>`;
  }

  function genAngle() {
    const pat = randInt(0, 12);
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
      const ns = [4, 5, 6, 8, 9, 10, 12, 15, 18, 20];
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
    } else if (pat === 7) {
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
    } else if (pat === 8) {
      // 対頂角
      const givenLabel = ['a', 'b', 'c', 'd'][randInt(0, 3)];
      const targetLabel = VERT_PAIR[givenLabel];
      const theta = randInt(20, 160);
      question = `右の図で、∠${givenLabel} = ${theta}° のとき、∠${givenLabel}の対頂角 ∠${targetLabel} の大きさは？`;
      answer = theta;
      wrongs = [180 - theta, theta + 10, Math.max(1, theta - 10)];
      steps = [`対頂角は等しい`, `∠${targetLabel} = ∠${givenLabel} = ${theta}°`];
      questionHtml = mkVerticalAnglesSvg(givenLabel, theta) + `<span style="display:block">${question}</span>`;
    } else if (pat === 9) {
      // 同位角（平行線）
      const labels = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
      const givenLabel = labels[randInt(0, labels.length - 1)];
      const targetLabel = CORRESPONDING_PAIR[givenLabel];
      const theta = randInt(20, 160);
      question = `下の図で、l ∥ m のとき、∠${givenLabel} = ${theta}° です。∠${givenLabel}の同位角 ∠${targetLabel} の大きさは？`;
      answer = theta;
      wrongs = [180 - theta, theta + 10, Math.max(1, theta - 10)];
      steps = [`l ∥ m のとき、同位角は等しい`, `∠${targetLabel} = ∠${givenLabel} = ${theta}°`];
      questionHtml = mkParallelTransversalSvg(givenLabel, theta, targetLabel) + `<span style="display:block">${question.replace('∥', PARALLEL_SYM_HTML)}</span>`;
    } else if (pat === 10) {
      // 錯角（平行線、内側の角どうし）
      const labels = ['c', 'd', 'e', 'f'];
      const givenLabel = labels[randInt(0, labels.length - 1)];
      const targetLabel = ALTERNATE_PAIR[givenLabel];
      const theta = randInt(20, 160);
      question = `下の図で、l ∥ m のとき、∠${givenLabel} = ${theta}° です。∠${givenLabel}の錯角 ∠${targetLabel} の大きさは？`;
      answer = theta;
      wrongs = [180 - theta, theta + 10, Math.max(1, theta - 10)];
      steps = [`l ∥ m のとき、錯角は等しい`, `∠${targetLabel} = ∠${givenLabel} = ${theta}°`];
      questionHtml = mkParallelTransversalSvg(givenLabel, theta, targetLabel) + `<span style="display:block">${question.replace('∥', PARALLEL_SYM_HTML)}</span>`;
    } else if (pat === 11) {
      const ns = [4, 5, 6, 8, 9, 10, 12, 15, 18, 20];
      const n = ns[randInt(0, ns.length - 1)];
      const ext = 360 / n;
      question = `正${kanjiDigit(n)}角形の1つの外角は？`;
      steps = [`外角の和はつねに360°`, `1つの外角 = 360 ÷ ${n} = ${ext}°`];
      answer = ext; wrongs = [360 - ext, (n - 2) * 180 / n, ext + 10];
      questionHtml = mkPolySvg(n, true) + `<span style="display:block">${question}</span>`;
    } else {
      const ns = [4, 5, 6, 8, 9, 10, 12, 15, 18, 20];
      const n = ns[randInt(0, ns.length - 1)];
      const interior = 180 - 360 / n;
      question = `1つの内角が ${interior}° である正多角形は正何角形？`;
      steps = [`1つの外角 = 180 − ${interior} = ${180 - interior}°`, `辺の数 = 360 ÷ ${180 - interior} = ${n}（正${kanjiDigit(n)}角形）`];
      answer = n; wrongs = [n - 1, n + 1, n + 2];
      questionHtml = mkPolySvg(n, false) + `<span style="display:block">${question}</span>`;
    }
    return { category: 'angle', question, questionHtml, answer, choices: buildChoices(answer, wrongs), steps };
  }

  // 角度の応用（中2）：多角形の外角の和(360°)・五芒星の先端角の和(180°)・
  // 三角形の2つの角の二等分線の交点にできる角(90°+∠A÷2)を使った応用問題
  const ANGLE_APP2_KANJI_NUM_ = { 4: '四', 5: '五', 6: '六' };
  function genAngleApplication2() {
    const pat = randInt(0, 2);
    let question, answer, wrongs, steps;
    if (pat === 0) {
      const n = [4, 5, 6][randInt(0, 2)];
      const count = n - 1;
      let angles, remaining;
      do {
        angles = Array.from({ length: count }, () => randInt(20, 80));
        remaining = 360 - angles.reduce((s, v) => s + v, 0);
      } while (remaining < 10 || remaining > 170);
      question = `凸${ANGLE_APP2_KANJI_NUM_[n]}角形の${n}つの外角のうち、${count}つの大きさがそれぞれ${angles.join('°、')}°です。残り1つの外角の大きさを求めなさい。（多角形の外角の和は360°です）`;
      answer = remaining;
      wrongs = [remaining + 10, remaining + 20, Math.max(1, remaining - 10), Math.max(1, remaining - 20)].filter(v => v !== answer && v > 0);
      steps = [`多角形の外角の和 = 360°`, `残りの外角 = 360 − (${angles.join('+')}) = ${answer}°`];
      return { category: 'angleApplication2', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else if (pat === 1) {
      let angles, remaining;
      do {
        angles = Array.from({ length: 4 }, () => randInt(15, 35));
        remaining = 180 - angles.reduce((s, v) => s + v, 0);
      } while (remaining < 20 || remaining > 120);
      question = `五角形の形をした星（五芒星）の5つの先端の角の大きさの和は180°になることが知られています。5つの先端の角のうち4つの大きさがそれぞれ${angles.join('°、')}°のとき、残り1つの先端の角の大きさを求めなさい。`;
      answer = remaining;
      wrongs = [remaining + 10, remaining + 20, Math.max(1, remaining - 10), Math.max(1, remaining - 20)].filter(v => v !== answer && v > 0);
      steps = [`五芒星の先端角の和 = 180°`, `残りの角 = 180 − (${angles.join('+')}) = ${answer}°`];
      return { category: 'angleApplication2', question, answer, choices: buildChoices(answer, wrongs), steps };
    } else {
      const A = 2 * randInt(10, 60);
      const P = 90 + A / 2;
      const askA = Math.random() < 0.5;
      if (!askA) {
        question = `三角形ABCで、∠Bと∠Cの二等分線の交点をPとします。∠A = ${A}°のとき、∠BPCの大きさを求めなさい。`;
        answer = P;
        wrongs = [P + 10, P + 20, Math.max(1, P - 10), Math.max(1, P - 20)].filter(v => v !== answer && v > 0);
        steps = [`∠BPC = 90° + ∠A÷2`, `= 90 + ${A}÷2 = ${answer}°`];
      } else {
        question = `三角形ABCで、∠Bと∠Cの二等分線の交点をPとします。∠BPC = ${P}°のとき、∠Aの大きさを求めなさい。`;
        answer = A;
        wrongs = [A + 10, A + 20, Math.max(1, A - 10), Math.max(1, A - 20)].filter(v => v !== answer && v > 0);
        steps = [`∠BPC = 90° + ∠A÷2 より`, `∠A = (∠BPC − 90) × 2 = (${P} − 90) × 2 = ${answer}°`];
      }
      return { category: 'angleApplication2', question, answer, choices: buildChoices(answer, wrongs), steps };
    }
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

  /* ---------- 式の計算（中2） ---------- */

  function termStr2_(coef, letter) {
    if (coef === 0) return '';
    const abs = Math.abs(coef);
    const core = abs === 1 ? letter : `${abs}${letter}`;
    return coef > 0 ? `+ ${core}` : `− ${core}`;
  }
  function constStr2_(c) {
    if (c === 0) return '';
    return c > 0 ? `+ ${c}` : `− ${Math.abs(c)}`;
  }

  function genPolyCalc2() {
    const pat = randInt(0, 4);
    let question, answer, choices, steps;
    if (pat === 0) {
      // 同類項の整理：ax + by + cx + dy の形
      const a = randNonZero(-9, 9), b = randNonZero(-9, 9);
      let c = randNonZero(-9, 9), d = randNonZero(-9, 9);
      const sx = a + c, sy = b + d;
      const cTerm = c > 0 ? `+ ${c}x` : `− ${Math.abs(c)}x`;
      const dTerm = d > 0 ? `+ ${d}y` : `− ${Math.abs(d)}y`;
      question = `${a}x ${b > 0 ? '+' : '−'} ${Math.abs(b)}y ${cTerm} ${dTerm} を計算しなさい。`;
      answer = `${termStr2_(sx, 'x').replace(/^\+ /, '')} ${termStr2_(sy, 'y')}`.trim();
      if (sx === 0) answer = termStr2_(sy, 'y').replace(/^\+ /, '');
      steps = [`xの項どうし、yの項どうしをまとめる`, `${a}x + ${c}x = ${sx}x`, `${b}y + ${d}y = ${sy}y`, `= ${answer}`];
      const wrongAns1 = `${termStr2_(a - c, 'x').replace(/^\+ /, '')} ${termStr2_(b - d, 'y')}`.trim();
      const wrongAns2 = `${termStr2_(sx, 'x').replace(/^\+ /, '')} ${termStr2_(d, 'y')}`.trim();
      choices = buildChoicesFromList(answer, [wrongAns1, wrongAns2]);
    } else if (pat === 1) {
      // 分配法則による展開：k(ax + by) の形
      const k = randNonZero(-9, 9);
      const a = randNonZero(-9, 9), b = randNonZero(-9, 9);
      question = `${k}(${a}x ${b > 0 ? '+' : '−'} ${Math.abs(b)}y) を計算しなさい。`;
      const ra = k * a, rb = k * b;
      answer = `${termStr2_(ra, 'x').replace(/^\+ /, '')} ${termStr2_(rb, 'y')}`.trim();
      steps = [`かっこの中の各項に${k}をかける`, `${k}×${a}x=${ra}x、${k}×${b}y=${rb}y`, `= ${answer}`];
      const wrongAns1 = `${termStr2_(k * a, 'x').replace(/^\+ /, '')} ${termStr2_(b, 'y')}`.trim();
      const wrongAns2 = `${termStr2_(a, 'x').replace(/^\+ /, '')} ${termStr2_(rb, 'y')}`.trim();
      choices = buildChoicesFromList(answer, [wrongAns1, wrongAns2]);
    } else if (pat === 2) {
      // かっこを含む同類項の整理：p(ax+b) + q(cx+d)
      const p = randNonZero(-6, 6), q = randNonZero(-6, 6);
      const a = randNonZero(-6, 6), b = randNonZero(-9, 9);
      const c = randNonZero(-6, 6), d = randNonZero(-9, 9);
      question = `${p}(${a}x ${b >= 0 ? '+' : '−'} ${Math.abs(b)}) ${q >= 0 ? '+' : '−'} ${Math.abs(q)}(${c}x ${d >= 0 ? '+' : '−'} ${Math.abs(d)}) を計算しなさい。`;
      const sx = p * a + q * c, sc = p * b + q * d;
      answer = `${termStr2_(sx, 'x').replace(/^\+ /, '')} ${constStr2_(sc)}`.trim();
      steps = [`かっこを展開する`, `${p}×${a}x + ${p}×${b} ${q >= 0 ? '+' : '−'} ${Math.abs(q)}×(${c}x) ${q >= 0 ? '+' : '−'} ${Math.abs(q)}×(${d})`, `同類項をまとめる`, `= ${answer}`];
      const wrongAns1 = `${termStr2_(p * a - q * c, 'x').replace(/^\+ /, '')} ${constStr2_(p * b - q * d)}`.trim();
      const wrongAns2 = `${termStr2_(sx, 'x').replace(/^\+ /, '')} ${constStr2_(p * b)}`.trim();
      choices = buildChoicesFromList(answer, [wrongAns1, wrongAns2]);
    } else if (pat === 3) {
      // 単項式の乗除（累乗・負の数を含む）
      const sub = randInt(0, 2);
      if (sub === 0) {
        const a = randNonZero(-9, 9), b = randNonZero(-9, 9);
        question = `${a}a × ${b}a を計算しなさい。`;
        const coef = a * b;
        answer = `${coef}a²`;
        steps = [`係数どうし、文字どうしをかける`, `${a}×${b}=${coef}、a×a=a²`, `= ${answer}`];
        choices = shuffle([answer, `${coef}a`, `${a + b}a²`, `${Math.abs(coef)}a²`].filter((v, i, arr) => arr.indexOf(v) === i));
        if (choices.length < 4) choices.push(`${coef + 1}a²`);
      } else if (sub === 1) {
        let a, b; do { a = randNonZero(-9, 9); b = randNonZero(-9, 9); } while (a % b !== 0);
        question = `${a}ab ÷ ${b}b を計算しなさい。`;
        const coef = a / b;
        answer = coef === 1 ? 'a' : coef === -1 ? '−a' : `${coef}a`;
        steps = [`${a} ÷ ${b} = ${coef}`, `b ÷ b = 1`, `= ${answer}`];
        choices = shuffle([answer, `${coef}ab`, `${coef + 1}a`, `${-coef}a`].filter((v, i, arr) => arr.indexOf(v) === i));
        if (choices.length < 4) choices.push(`${coef}b`);
      } else {
        const a = randNonZero(-9, 9), b = randNonZero(2, 9);
        const c = randNonZero(-9, 9);
        // a×b÷c の3口の単項式計算（係数がcで割り切れるように調整）
        const productForC = a * b;
        let cAdj = c;
        while (productForC % cAdj !== 0) cAdj += cAdj > 0 ? 1 : -1;
        if (cAdj === 0) cAdj = 1;
        question = `${a}x × ${b}x ÷ ${cAdj} を計算しなさい。`;
        const coef = (a * b) / cAdj;
        answer = `${coef}x²`;
        steps = [`${a} × ${b} ÷ ${cAdj} = ${coef}`, `x × x = x²`, `= ${answer}`];
        choices = shuffle([answer, `${coef}x`, `${coef + b}x²`, `${-coef}x²`].filter((v, i, arr) => arr.indexOf(v) === i));
        if (choices.length < 4) choices.push(`${coef - 1}x²`);
      }
    } else {
      // 式の値：代入
      const a = randNonZero(-6, 6);
      let b; do { b = randNonZero(-6, 6); } while (b === a);
      const p = randNonZero(-5, 5), q = randNonZero(-5, 5);
      question = `a = ${a}、b = ${b} のとき、${p}(2a + b) ${q >= 0 ? '+' : '−'} ${Math.abs(q)}(a − b) の値を求めなさい。`;
      // p(2a+b) + q(a-b) = (2p+q)a + (p-q)b
      const coefA = 2 * p + q, coefB = p - q;
      const value = coefA * a + coefB * b;
      answer = `${value}`;
      steps = [`式を展開して整理する`, `= ${termStr2_(coefA, 'a').replace(/^\+ /, '')} ${termStr2_(coefB, 'b')}`.trim(), `a=${a}、b=${b} を代入`, `= ${answer}`];
      choices = buildChoices(value, [value + 1, value - 1, -value].filter(v => v !== value));
    }
    return { category: 'polyCalc2', question, answer, choices, steps };
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
        {
          q: '△ABD ≡ △CBD の証明。AB=CB、BDは∠ABCの二等分線であることが仮定から分かる。∠ABD=∠CBDであることに加えて、証明に使える図から分かることは何か？',
          a: 'BD は共通',
          w: ['AD=CD', 'AB=BD', '∠ADB=∠CDB'],
          s: ['①AB=CB（仮定）', '②∠ABD=∠CBD（角の二等分線）', '③BD は共通', '①②③より2組の辺とその間の角がそれぞれ等しいから △ABD≡△CBD'],
          svg: '<svg width="118" height="94" viewBox="0 0 118 94" style="display:block;margin:0 auto 8px"><path d="M59,10 L14,80 L104,80 Z" fill="none" stroke="#1c2127" stroke-width="1.5"/><line x1="59" y1="10" x2="59" y2="80" stroke="#1c2127" stroke-width="1.5" stroke-dasharray="5,3"/><text x="53" y="9" font-size="11" font-weight="bold" fill="#1c2127">B</text><text x="4" y="91" font-size="11" font-weight="bold" fill="#1c2127">A</text><text x="106" y="91" font-size="11" font-weight="bold" fill="#1c2127">C</text><text x="53" y="91" font-size="11" font-weight="bold" fill="#1c2127">D</text></svg>',
        },
        {
          q: '△ABC ≡ △DCB の証明。AB=DC、AC=DBが仮定から分かる。図から分かるのは何か？',
          a: 'BC は共通',
          w: ['∠ABC=∠DCB', 'AB=BC', '∠BAC=∠CDB'],
          s: ['①AB=DC（仮定）', '②AC=DB（仮定）', '③BC は共通', '①②③より3組の辺がそれぞれ等しいから △ABC≡△DCB'],
          svg: '<svg width="118" height="90" viewBox="0 0 118 90" style="display:block;margin:0 auto 8px"><path d="M14,14 L104,14 L104,76 L14,76 Z" fill="none" stroke="#1c2127" stroke-width="1.5" stroke-opacity="0"/><line x1="14" y1="14" x2="104" y2="76" stroke="#1c2127" stroke-width="1.5"/><line x1="104" y1="14" x2="14" y2="76" stroke="#1c2127" stroke-width="1.5"/><line x1="14" y1="14" x2="14" y2="76" stroke="#1c2127" stroke-width="1.5"/><line x1="104" y1="14" x2="104" y2="76" stroke="#1c2127" stroke-width="1.5"/><text x="6" y="12" font-size="11" font-weight="bold" fill="#1c2127">A</text><text x="6" y="86" font-size="11" font-weight="bold" fill="#1c2127">B</text><text x="106" y="86" font-size="11" font-weight="bold" fill="#1c2127">C</text><text x="106" y="12" font-size="11" font-weight="bold" fill="#1c2127">D</text></svg>',
        },
        {
          q: '△ACM ≡ △BDM の証明。線分ABの中点をM、∠CAM=∠DBMが仮定から分かる。AM=BM（中点）であることに加えて、証明に使える図から分かることは何か？',
          a: '∠AMC=∠BMD（対頂角）',
          w: ['∠ACM=∠BDM', 'CM=DM', 'AC=BD'],
          s: ['①∠CAM=∠DBM（仮定）', '②AM=BM（中点）', '③∠AMC=∠BMD（対頂角）', '①②③より1組の辺とその両端の角がそれぞれ等しいから △ACM≡△BDM'],
          svg: '<svg width="118" height="94" viewBox="0 0 118 94" style="display:block;margin:0 auto 8px"><path d="M14,50 L104,44 L82,84 Z" fill="none" stroke="#1c2127" stroke-width="1.5"/><path d="M14,50 L104,44 L36,10 Z" fill="none" stroke="#1c2127" stroke-width="1.5" stroke-opacity="0"/><line x1="36" y1="10" x2="82" y2="84" stroke="#1c2127" stroke-width="1.5"/><circle cx="59" cy="47" r="2.5" fill="#1c2127"/><text x="6" y="49" font-size="11" font-weight="bold" fill="#1c2127">A</text><text x="106" y="43" font-size="11" font-weight="bold" fill="#1c2127">B</text><text x="30" y="9" font-size="11" font-weight="bold" fill="#1c2127">C</text><text x="84" y="91" font-size="11" font-weight="bold" fill="#1c2127">D</text><text x="62" y="44" font-size="10" font-weight="bold" fill="#1c2127">M</text></svg>',
        },
      ];
      const sc = scenarios[randInt(0, scenarios.length - 1)];
      question = sc.q; answer = sc.a;
      choices = shuffle([answer, ...sc.w]);
      steps = sc.s;
      questionHtml = sc.svg + `<span style="display:block">${question}</span>`;
    }
    return { category: 'congruence', question, questionHtml, answer, choices, steps };
  }

  /* ---------- 平行四辺形の性質や条件（中2） ---------- */

  const PARA_COND2_CONDS_ = [
    { name: '2組の対辺がそれぞれ平行である', c: ['AB∥DC', 'AD∥BC'] },
    { name: '2組の対辺がそれぞれ等しい', c: ['AB=DC', 'AD=BC'] },
    { name: '2組の対角がそれぞれ等しい', c: ['∠A=∠C', '∠B=∠D'] },
    { name: '対角線がそれぞれの中点で交わる', c: ['対角線ACとBDの交点をMとすると、AM=CM', 'BM=DM'] },
    { name: '1組の対辺が平行で、その長さが等しい', c: ['AB∥DC', 'AB=DC'] },
  ];
  const PARA_COND2_FAKE_ = '1組の対辺が平行である';

  function genParallelogramCondition2() {
    const pat = randInt(0, 1);
    let question, answer, choices, steps;
    if (pat === 0) {
      const idx = randInt(0, PARA_COND2_CONDS_.length - 1);
      const cond = PARA_COND2_CONDS_[idx];
      const others = PARA_COND2_CONDS_.filter((_, i) => i !== idx).map(c => c.name);
      const distractors = shuffle(others).slice(0, 2);
      question = `四角形ABCDで ${cond.c.join('、')} が成り立つとき、四角形ABCDが平行四辺形になるための条件として使えるものは？`;
      answer = cond.name;
      choices = shuffle([answer, ...distractors, PARA_COND2_FAKE_]);
      steps = [`${cond.c.join('、')} → 「${cond.name}」`];
      return { category: 'parallelogramCondition2', question, answer, choices, steps };
    } else {
      const picked = shuffle(PARA_COND2_CONDS_.map(c => c.name)).slice(0, 3);
      question = `次のうち、四角形が平行四辺形になるための条件として正しくないものはどれですか。`;
      answer = PARA_COND2_FAKE_;
      choices = shuffle([answer, ...picked]);
      steps = [
        '① 2組の対辺がそれぞれ平行である → 平行四辺形の定義 ✓',
        '② 2組の対辺がそれぞれ等しい → 平行四辺形になる ✓',
        '③ 2組の対角がそれぞれ等しい → 平行四辺形になる ✓',
        '④ 対角線がそれぞれの中点で交わる → 平行四辺形になる ✓',
        '⑤ 1組の対辺が平行で、その長さが等しい → 平行四辺形になる ✓',
        '「1組の対辺が平行である」だけでは、台形の場合もあるため平行四辺形とは限らない ✗',
      ];
      return { category: 'parallelogramCondition2', question, answer, choices, steps };
    }
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
      // rest の2つはどちらも「2組の角がそれぞれ等しい」を示すのに十分な、同格に正しい
      // 答え。両方を選択肢に入れると正解が2つ存在してしまうため、片方だけを正解にし、
      // もう片方は選択肢に含めない(代わりに辺に関する誤答を使う)。
      const missing = rest[randInt(0, 1)];
      question = `△ABCと△DEFで${known}が分かっている。2組の角がそれぞれ等しいことを示すのにあと1つは？`;
      answer = missing;
      choices = shuffle([missing, 'AB:DE=BC:EF', 'AB=DE', 'BC:EF=CA:FD']);
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
    const pat = randInt(0, 3);
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
    } else if (pat === 2) {
      const cs = [
        {a:6,num:2,den:3,neg:false,ans:9},{a:-6,num:2,den:3,neg:false,ans:-9},
        {a:18,num:2,den:3,neg:false,ans:27},{a:18,num:2,den:3,neg:true,ans:-27},
        {a:-18,num:2,den:3,neg:true,ans:27},{a:10,num:2,den:5,neg:false,ans:25},
        {a:9,num:3,den:2,neg:false,ans:6},{a:-9,num:3,den:2,neg:false,ans:-6},
        {a:12,num:3,den:4,neg:false,ans:16},{a:8,num:4,den:3,neg:false,ans:6},
      ];
      const c = cs[randInt(0, cs.length - 1)];
      const fracStr = negFracStr(c.num, c.den, c.neg);
      question = `${fmtMono(c.a, v)} ÷ ${fracStr} = ?`;
      const fracHtml = negFracHtml(c.num, c.den, c.neg);
      const questionHtml = `${escHtml(fmtMono(c.a, v))} ÷ ${fracHtml} = ?`;
      answer = fmtMono(c.ans, v);
      choices = monoChoices(c.ans, v);
      steps = [
        `割り算 → 逆数をかける`,
        `${c.a} × ${c.neg ? '−' : ''}${c.den}/${c.num} = ${c.ans}`,
        `= ${answer}`,
      ];
      return { category: 'linearMul', question, questionHtml, answer, choices, steps };
    } else {
      // 単項式 × 分数
      const den = [2, 3, 4, 5][randInt(0, 3)];
      let num;
      do { num = randInt(1, 9); } while (num === den);
      const neg = Math.random() < 0.5;
      const q = randNonZero(-6, 6);
      const a = den * q;
      const signedNum = neg ? -num : num;
      const ans = q * signedNum;
      const fracStr = negFracStr(num, den, neg);
      question = `${fmtMono(a, v)} × ${fracStr} = ?`;
      const fracHtml = negFracHtml(num, den, neg);
      const questionHtml = `${escHtml(fmtMono(a, v))} × ${fracHtml} = ?`;
      answer = fmtMono(ans, v);
      choices = monoChoices(ans, v);
      steps = [
        `係数どうしをかける: ${a} × ${neg ? '−' : ''}${num}/${den} = ${ans}`,
        `= ${answer}`,
      ];
      return { category: 'linearMul', question, questionHtml, answer, choices, steps };
    }
    return { category: 'linearMul', question, answer, choices, steps };
  }

  /* ---------- 多項式と数の乗法・除法（中1） ---------- */

  function genPolyMul() {
    const pat = randInt(0, 6);
    const v = ['a', 'x', 'n', 'm'][randInt(0, 3)];
    let question, questionHtml, answer, choices, steps;

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
    } else if (pat === 3) {
      // (ax+b) ÷ 負のk
      const kabs = [2, 3, 4][randInt(0, 2)];
      const a = randNonZero(-6, 6) * kabs, b = randNonZero(-6, 6) * kabs;
      const rx = a / -kabs, rc = b / -kabs;
      question = `(${fmtPoly(a, v, b)}) ÷ (${-kabs}) = ?`;
      answer = fmtPoly(rx, v, rc);
      choices = polyChoices(rx, v, rc);
      steps = [`各項を${-kabs}で割る`, `${a}${v} ÷ (${-kabs}) = ${rx}${v}、${b} ÷ (${-kabs}) = ${rc}`, `= ${answer}`];
    } else if (pat === 4) {
      // (ax+b) × 分数
      const FD = [2, 3, 4][randInt(0, 2)];
      let FN;
      do { FN = randInt(1, 9); } while (FN === FD);
      const negFrac = Math.random() < 0.5;
      const s = negFrac ? -1 : 1;
      const p = randNonZero(-6, 6), q = randNonZero(-9, 9);
      const a = FD * p, b = FD * q;
      const rx = s * FN * p, rc = s * FN * q;
      const fracStr = negFracStr(FN, FD, negFrac);
      question = `(${fmtPoly(a, v, b)}) × ${fracStr} = ?`;
      const fracHtml = negFracHtml(FN, FD, negFrac);
      questionHtml = `(${escHtml(fmtPoly(a, v, b))}) × ${fracHtml} = ?`;
      answer = fmtPoly(rx, v, rc);
      choices = polyChoices(rx, v, rc);
      steps = [`各項に${negFrac ? '−' : ''}${FN}/${FD}をかける`, `${a}${v} × (...) = ${rx}${v}、${b} × (...) = ${rc}`, `= ${answer}`];
    } else if (pat === 5) {
      // (ax+b) ÷ 分数
      const FD = [2, 3, 4][randInt(0, 2)];
      const FNoptions = [2, 3, 5, 7].filter(n => n !== FD);
      const FN = FNoptions[randInt(0, FNoptions.length - 1)];
      const negFrac = Math.random() < 0.5;
      const s = negFrac ? -1 : 1;
      const p = randNonZero(-6, 6), q = randNonZero(-9, 9);
      const a = FN * p, b = FN * q;
      const rx = s * FD * p, rc = s * FD * q;
      const fracStr = negFracStr(FN, FD, negFrac);
      question = `(${fmtPoly(a, v, b)}) ÷ ${fracStr} = ?`;
      const fracHtml = negFracHtml(FN, FD, negFrac);
      questionHtml = `(${escHtml(fmtPoly(a, v, b))}) ÷ ${fracHtml} = ?`;
      answer = fmtPoly(rx, v, rc);
      choices = polyChoices(rx, v, rc);
      steps = [`割り算 → 逆数をかける: ×(${negFrac ? '' : '−'}${FD}/${FN})`, `${a}${v} × (...) = ${rx}${v}、${b} × (...) = ${rc}`, `= ${answer}`];
    } else {
      // 分数の形の1次式 × 整数（例: (3x−7)/4 × 8）
      const den = [2, 3, 4, 5][randInt(0, 3)];
      const m = randNonZero(-6, 6);
      const k = den * m;
      const a = randNonZero(-9, 9), b = randNonZero(-9, 9);
      const rx = a * m, rc = b * m;
      question = `(${fmtPoly(a, v, b)})/${den} × ${k} = ?`;
      const fracHtml = `<span class="frac"><span class="num">${escHtml(fmtPoly(a, v, b))}</span><span class="den">${den}</span></span>`;
      questionHtml = `${fracHtml} × ${k} = ?`;
      answer = fmtPoly(rx, v, rc);
      choices = polyChoices(rx, v, rc);
      steps = [`先に ${k} ÷ ${den} = ${m} を計算`, `(${fmtPoly(a, v, b)}) × ${m}`, `= ${answer}`];
    }
    return { category: 'polyMul', question, questionHtml, answer, choices, steps };
  }

  /* ---------- 1次式の加法と減法（中1） ---------- */

  function genLinearAddSub() {
    const pat = randInt(0, 3);
    const v = ['a', 'x', 'n', 'm'][randInt(0, 3)];
    let question, questionHtml, answer, choices, steps;

    if (pat === 0) {
      const a = randNonZero(-5, 5), b = randNonZero(-9, 9);
      const c = randNonZero(-5, 5), d = randNonZero(-9, 9);
      const rx = a + c, rc = b + d;
      question = `(${fmtPoly(a, v, b)}) + (${fmtPoly(c, v, d)}) = ?`;
      answer = fmtPoly(rx, v, rc);
      choices = polyChoices(rx, v, rc);
      steps = [
        `文字の項: ${fmtMono(a,v)} + ${fmtMono(c,v)} = ${fmtMono(rx,v)}`,
        `数の項: ${b} + (${d}) = ${rc}`,
        `= ${answer}`,
      ];
    } else if (pat === 1) {
      const a = randNonZero(-5, 5), b = randNonZero(-9, 9);
      const c = randNonZero(-5, 5), d = randNonZero(-9, 9);
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
    } else if (pat === 2) {
      // 分配してから同類項をまとめる: k(ax+b) ± m(cx+d)
      const k = randNonZero(-8, 8);
      const aa = randNonZero(-6, 6), bb = randNonZero(-9, 9);
      const m = randInt(2, 8);
      const cc = randNonZero(-6, 6), dd = randNonZero(-9, 9);
      const opAdd = Math.random() < 0.5;
      const signedM = opAdd ? m : -m;
      const rx = k * aa + signedM * cc, rc = k * bb + signedM * dd;
      question = `${k}(${fmtPoly(aa, v, bb)}) ${opAdd ? '+' : '−'} ${m}(${fmtPoly(cc, v, dd)}) = ?`;
      answer = fmtPoly(rx, v, rc);
      choices = polyChoices(rx, v, rc);
      steps = [
        `①: ${k}(${fmtPoly(aa, v, bb)}) = ${fmtPoly(k*aa, v, k*bb)}`,
        `②: ${opAdd ? '' : '−'}${m}(${fmtPoly(cc, v, dd)}) = ${fmtPoly(signedM*cc, v, signedM*dd)}`,
        `①＋②（同類項をまとめる）: ${answer}`,
      ];
    } else {
      // 分数の係数で分配してから同類項をまとめる
      const den1 = [2, 3, 4, 5, 7][randInt(0, 4)];
      const p1 = randNonZero(-4, 4), q1 = randNonZero(-4, 4);
      const aa = den1 * p1, bb = den1 * q1;
      let num1;
      do { num1 = randInt(1, 6); } while (num1 === den1);
      const neg1 = Math.random() < 0.5;
      const signedNum1 = neg1 ? -num1 : num1;
      const rx1 = p1 * signedNum1, rc1 = q1 * signedNum1;

      const den2opts = [2, 3, 4, 5, 7].filter(d => d !== den1);
      const den2 = den2opts[randInt(0, den2opts.length - 1)];
      const p2 = randNonZero(-4, 4), q2 = randNonZero(-4, 4);
      const cc = den2 * p2, dd = den2 * q2;
      let num2;
      do { num2 = randInt(1, 6); } while (num2 === den2);
      // 2つ目の分数の符号は常に正にする（間の演算子（+/−）が符号を担うため、
      // 「− −(...)」のような紛らわしい二重符号表示を避ける）。
      const rx2 = p2 * num2, rc2 = q2 * num2;

      const opAdd = Math.random() < 0.5;
      const rx = rx1 + (opAdd ? rx2 : -rx2), rc = rc1 + (opAdd ? rc2 : -rc2);

      const fracStr1 = negFracStr(num1, den1, neg1), fracStr2 = negFracStr(num2, den2, false);
      question = `${fracStr1}(${fmtPoly(aa, v, bb)}) ${opAdd ? '+' : '−'} ${fracStr2}(${fmtPoly(cc, v, dd)}) = ?`;
      const frac1Html = negFracHtml(num1, den1, neg1), frac2Html = negFracHtml(num2, den2, false);
      questionHtml = `${frac1Html}(${escHtml(fmtPoly(aa, v, bb))}) ${opAdd ? '+' : '−'} ${frac2Html}(${escHtml(fmtPoly(cc, v, dd))}) = ?`;
      answer = fmtPoly(rx, v, rc);
      choices = polyChoices(rx, v, rc);
      steps = [
        `①: ${fracStr1}(${fmtPoly(aa, v, bb)}) = ${fmtPoly(rx1, v, rc1)}`,
        `②: ${opAdd ? '' : '−'}${fracStr2}(${fmtPoly(cc, v, dd)}) = ${fmtPoly(opAdd?rx2:-rx2, v, opAdd?rc2:-rc2)}`,
        `①＋②（同類項をまとめる）: ${answer}`,
      ];
    }
    return { category: 'linearAddSub', question, questionHtml, answer, choices, steps };
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

  /* ---------- 平面図形の複合図形（円の応用、中1） ---------- */
  // 大・中・小3つの円が同じ直線上で内接する「三日月型」の複合図形。
  // 大円の半径R = 中円の半径r2 + 小円の半径r1 になるようにすることで、
  // 周の長さ・面積のどちらも綺麗な整数×πになる。
  // 中円・小円はどちらも大円の中の「くり抜き穴」(白い部分)であり、互いに
  // 外接して重ならないため、色がついた部分はその両方を大円から引いた残り。
  // 周の長さ = 2π(R+r1+r2) = 2π(2R) = 4πR
  // 面積 = πR² − πr2² − πr1² = π(2×r1×r2)
  function genPlaneFigureComposite1() {
    const askPerimeter = Math.random() < 0.5;
    const r1 = randInt(1, 5);
    const r2 = randInt(r1 + 1, r1 + 8);
    const R = r1 + r2;
    const scale = 60 / R;
    const scaledR2 = r2 * scale, scaledR1 = r1 * scale;
    const leftX = 70 - 60;
    const medCenterX = leftX + scaledR2;
    const smallCenterX = leftX + 2 * scaledR2 + scaledR1;
    const diagramSvg = `<svg width="140" height="140" viewBox="0 0 140 140" style="display:block;margin:0 auto 8px">`
      + `<circle cx="70" cy="70" r="60" fill="#f2b84b" stroke="#1c2127" stroke-width="1.5"/>`
      + `<circle cx="${medCenterX.toFixed(1)}" cy="70" r="${scaledR2.toFixed(1)}" fill="#e8f4f8" stroke="#1c2127" stroke-width="1.2"/>`
      + `<circle cx="${smallCenterX.toFixed(1)}" cy="70" r="${scaledR1.toFixed(1)}" fill="#e8f4f8" stroke="#1c2127" stroke-width="1.2"/>`
      + `<text x="70" y="20" font-size="11" text-anchor="middle">半径${R}cm</text>`
      + `<text x="${medCenterX.toFixed(1)}" y="${(70 - scaledR2 - 6).toFixed(1)}" font-size="10" text-anchor="middle">${r2}cm</text>`
      + `<text x="${smallCenterX.toFixed(1)}" y="${(70 - scaledR1 - 6).toFixed(1)}" font-size="10" text-anchor="middle">${r1}cm</text>`
      + `</svg>`;
    if (askPerimeter) {
      const perim = 4 * R;
      const question = `右の図のように、半径${R}cmの大きい円の中に、半径${r2}cmと半径${r1}cmの円がぴったり並んで入っています（3つの円は同じ直線上で接しています）。色がついた部分の周の長さを求めなさい。`;
      const questionHtml = diagramSvg + `<span style="display:block">${question}</span>`;
      const answer = `${perim}π`;
      const choices = piCh(perim);
      const steps = [`大円の周 = 2π×${R} = ${2 * R}π`, `中円の周 = 2π×${r2} = ${2 * r2}π`, `小円の周 = 2π×${r1} = ${2 * r1}π`, `合計 = ${2 * R}π+${2 * r2}π+${2 * r1}π = ${perim}π cm`];
      return { category: 'planeFigureComposite1', question, questionHtml, answer, choices, steps };
    } else {
      const area = R * R - r2 * r2 - r1 * r1;
      const question = `右の図のように、半径${R}cmの大きい円の中に、半径${r2}cmと半径${r1}cmの円がぴったり並んで入っています（3つの円は同じ直線上で接しています）。色がついた部分の面積を求めなさい。`;
      const questionHtml = diagramSvg + `<span style="display:block">${question}</span>`;
      const answer = `${area}π`;
      const choices = piCh(area);
      const steps = [`大円の面積 = ${R}×${R}×π = ${R * R}π`, `中円の面積 = ${r2}×${r2}×π = ${r2 * r2}π`, `小円の面積 = ${r1}×${r1}×π = ${r1 * r1}π`, `中円と小円はどちらも大円の中の穴(白い部分)なので、色がついた部分 = 大円 − 中円 − 小円 = ${R * R}π−${r2 * r2}π−${r1 * r1}π = ${area}π cm²`];
      return { category: 'planeFigureComposite1', question, questionHtml, answer, choices, steps };
    }
  }

  /* ---------- 円錐の展開図・中心角（中1） ---------- */
  // 底面の半径r・母線L の円錐を展開すると、側面は半径Lのおうぎ形になり、
  // 弧の長さ=底面の円周(2πr)、中心角θ=360°×r/L になる。dは360の約数、
  // k<d、L=d×m、r=k×m とすることで、θ=360×k/dが必ず整数になるようにしている。
  function genConeDevelopment1() {
    const DIVISORS = [2, 3, 4, 5, 6, 8, 9, 10, 12, 15, 18, 20, 24, 30, 36, 40, 45];
    let d, k, m, L, r, theta;
    for (let tries = 0; tries < 30; tries++) {
      d = DIVISORS[randInt(0, DIVISORS.length - 1)];
      k = randInt(1, d - 1);
      m = randInt(1, 4);
      L = d * m; r = k * m; theta = (360 * k) / d;
      if (r >= 2 && r <= 20 && L >= 3 && L <= 40 && theta >= 20 && theta <= 340) break;
    }
    if (!(r >= 2 && r <= 20 && L >= 3 && L <= 40 && theta >= 20 && theta <= 340)) return genConeDevelopment1();
    const pat = randInt(0, 3);
    let question, answer, choices, steps;
    const sectorSvg = (labelR, labelTheta) => {
      const ea = -Math.PI / 2 + (labelTheta || 90) * Math.PI / 180;
      const x2 = (56 + 40 * Math.cos(ea)).toFixed(1), y2 = (50 + 40 * Math.sin(ea)).toFixed(1);
      const la = (labelTheta || 90) > 180 ? 1 : 0;
      return `<svg width="112" height="108" viewBox="0 0 112 108" style="display:block;margin:0 auto 8px"><path d="M56,50 L56,10 A40,40,0,${la},1,${x2},${y2} Z" fill="#e8f4f8" stroke="#1c2127" stroke-width="1.5"/><text x="56" y="66" font-size="11" fill="#555" text-anchor="middle">${labelTheta ? labelTheta + '°' : '?'}</text><text x="34" y="30" font-size="10" fill="#555">${labelR}</text></svg>`;
    };
    if (pat === 0) {
      // 弧の長さを求める
      question = `底面の半径が${r}cm、母線の長さが${L}cmの円錐があります。この円錐の展開図で、側面のおうぎ形の弧の長さを求めなさい。（πを含む式で）`;
      answer = `${2 * r}π`;
      choices = piCh(2 * r);
      steps = [`おうぎ形の弧の長さ = 底面の円周に等しい`, `= 2πr = 2π×${r} = ${2 * r}π cm`];
    } else if (pat === 1) {
      // 中心角を求める(底面の半径・母線が既知)
      question = `底面の半径が${r}cm、母線の長さが${L}cmの円錐があります。この円錐の展開図で、側面のおうぎ形の中心角を求めなさい。`;
      answer = theta;
      const wrongs = [theta + 10, theta - 10, 360 - theta].filter((v) => v !== theta && v > 0 && v < 360);
      choices = buildChoices(theta, wrongs);
      steps = [
        `おうぎ形の弧の長さ = 底面の円周 = 2π×${r} = ${2 * r}π cm`,
        `半径${L}cmの円周 = 2π×${L} = ${2 * L}π cm`,
        `中心角 = 360° × ${r}/${L} = ${theta}°`,
      ];
    } else if (pat === 2) {
      // 底面の半径を求める(母線・中心角が既知)
      question = `母線の長さが${L}cm、展開図の側面のおうぎ形の中心角が${theta}°である円錐があります。底面の半径を求めなさい。`;
      answer = r;
      choices = buildChoices(r, [r + 1, r - 1, L - r].filter((v) => v !== r && v > 0));
      steps = [
        `底面の半径をxcmとすると、底面の円周は2πx`,
        `おうぎ形の弧の長さ = 2π×${L} × ${theta}/360`,
        `2πx = 2π×${L}×${theta}/360`,
        `x = ${L} × ${theta}/360 = ${r}`,
      ];
    } else {
      // 母線の長さを求める(底面の半径・中心角が既知)
      question = `底面の半径が${r}cm、展開図の側面のおうぎ形の中心角が${theta}°である円錐があります。母線の長さを求めなさい。`;
      answer = L;
      choices = buildChoices(L, [L + 2, L - 2, r * 2].filter((v) => v !== L && v > 0));
      steps = [
        `母線の長さをxcmとすると`,
        `底面の円周 = おうぎ形の弧の長さ`,
        `2π×${r} = 2πx × ${theta}/360`,
        `${r} = x × ${theta}/360`,
        `x = ${r} × 360 ÷ ${theta} = ${L}`,
      ];
    }
    const questionHtml = sectorSvg(`母線${L}cm`, pat === 2 ? theta : (pat === 3 ? theta : undefined)) + `<span style="display:block">${question}</span>`;
    return { category: 'coneDevelopment1', question, questionHtml, answer, choices, steps };
  }

  /* ---------- 作図（中1） ---------- */

  function genConstruction() {
    const pat = randInt(0, 5);
    let question, questionHtml, answer, choices, steps;
    if (pat === 0) {
      // 垂直二等分線の性質：2点から等距離
      const x = randInt(3, 15);
      question = `線分ABの垂直二等分線上に点Pがある。PA = ${x} cm のとき、PBの長さは？`;
      answer = x;
      choices = buildChoices(x, [x * 2, Math.max(1, Math.floor(x / 2)), x + 3]);
      steps = [`垂直二等分線上の点は、2点A、Bから等しい距離にある`, `PB = PA = ${x} cm`];
      questionHtml = `<svg width="130" height="100" viewBox="0 0 130 100" style="display:block;margin:0 auto 8px"><line x1="20" y1="60" x2="90" y2="60" stroke="#1c2127" stroke-width="1.5"/><line x1="55" y1="15" x2="55" y2="88" stroke="#1c2127" stroke-width="1.5"/><circle cx="55" cy="25" r="2.5" fill="#c23b2e"/><line x1="55" y1="25" x2="20" y2="60" stroke="#c23b2e" stroke-width="1.2" stroke-dasharray="3,2"/><line x1="55" y1="25" x2="90" y2="60" stroke="#c23b2e" stroke-width="1.2" stroke-dasharray="3,2"/><text x="12" y="72" font-size="12" font-weight="bold">A</text><text x="94" y="72" font-size="12" font-weight="bold">B</text><text x="60" y="20" font-size="12" font-weight="bold" fill="#c23b2e">P</text></svg><span style="display:block">${question}</span>`;
    } else if (pat === 1) {
      // 角の二等分線の性質：2辺から等距離
      const x = randInt(3, 15);
      question = `∠AOBの二等分線上に点Pがある。Pから辺OAまでの距離が ${x} cm のとき、辺OBまでの距離は？`;
      answer = x;
      choices = buildChoices(x, [x * 2, Math.max(1, Math.floor(x / 2)), x + 3]);
      steps = [`角の二等分線上の点は、2辺から等しい距離にある`, `辺OBまでの距離 = ${x} cm`];
      questionHtml = `<svg width="130" height="100" viewBox="0 0 130 100" style="display:block;margin:0 auto 8px"><line x1="15" y1="88" x2="118" y2="88" stroke="#1c2127" stroke-width="1.5"/><line x1="15" y1="88" x2="60" y2="12" stroke="#1c2127" stroke-width="1.5"/><line x1="15" y1="88" x2="98" y2="38" stroke="#c23b2e" stroke-width="1.5"/><circle cx="66" cy="55" r="2.5" fill="#c23b2e"/><line x1="66" y1="55" x2="66" y2="88" stroke="#555" stroke-width="1" stroke-dasharray="3,2"/><line x1="66" y1="55" x2="45.5" y2="43.5" stroke="#555" stroke-width="1" stroke-dasharray="3,2"/><text x="6" y="94" font-size="11" font-weight="bold">O</text><text x="62" y="10" font-size="11" font-weight="bold">A</text><text x="102" y="40" font-size="11" font-weight="bold">B</text><text x="70" y="52" font-size="11" font-weight="bold" fill="#c23b2e">P</text></svg><span style="display:block">${question}</span>`;
    } else if (pat === 2) {
      // 用語：2点から等距離の軌跡
      question = `2点A、Bから等しい距離にある点の集まり（軌跡）を表す直線を何というか？`;
      answer = '垂直二等分線';
      choices = shuffle(['垂直二等分線', '角の二等分線', '円の接線', '中線']);
      steps = [`2点から等距離にある点は、その2点を結ぶ線分の垂直二等分線上にある`];
    } else if (pat === 3) {
      // 用語：角の2辺から等距離の軌跡
      question = `∠AOBの2辺から等しい距離にある点の集まり（軌跡）を表す直線を何というか？`;
      answer = '角の二等分線';
      choices = shuffle(['角の二等分線', '垂直二等分線', '垂線', '対角線']);
      steps = [`角の2辺から等距離にある点は、その角の二等分線上にある`];
    } else if (pat === 4) {
      // 垂直二等分線の作図手順（最初の操作）
      question = `線分ABの垂直二等分線を作図するとき、最初に行う操作として正しいのは？`;
      answer = '点A、Bをそれぞれ中心として、等しい半径の円（弧）をかく';
      choices = shuffle([
        '点A、Bをそれぞれ中心として、等しい半径の円（弧）をかく',
        '分度器でABの角度を測る',
        '点Aを中心として、Bを通る円をかく',
        '定規でABを2倍に延長する',
      ]);
      steps = [`A、Bを中心に等しい半径の弧をかき、2つの交点を通る直線をひくと垂直二等分線になる`];
    } else {
      // 角の二等分線の作図手順（最初の操作）
      question = `∠AOBの二等分線を作図するとき、最初に行う操作として正しいのは？`;
      answer = '点Oを中心として円（弧）をかき、辺OA、OBとの交点をつくる';
      choices = shuffle([
        '点Oを中心として円（弧）をかき、辺OA、OBとの交点をつくる',
        '分度器で∠AOBの大きさを測る',
        '辺OA、OBの中点をそれぞれ求める',
        '点Oから辺ABに垂線をひく',
      ]);
      steps = [`Oを中心とする弧でOA、OB上に交点をつくり、そこから等しい半径の弧を交わらせて二等分線をひく`];
    }
    return { category: 'construction', question, questionHtml, answer, choices, steps };
  }

  /* ---------- 空間図形（中1） ---------- */

  function genSolidFigure() {
    const pat = randInt(0, 9);
    let question, answer, choices, steps;
    if (pat === 6) {
      // 立体の名前あてクイズ
      const solids = [
        { name: '円錐', desc: '底面が円で、側面が曲面になっていて、頂点が1つある立体' },
        { name: '直方体', desc: '6つの長方形（または正方形）の面でできた、箱の形をした立体' },
        { name: '四角錐', desc: '底面が四角形で、側面がすべて三角形になっていて、頂点が1つある立体' },
        { name: '球', desc: 'どの方向から見ても円に見える、ボールの形をした立体' },
        { name: '三角錐', desc: '底面が三角形で、側面もすべて三角形になっていて、頂点が1つある立体' },
        { name: '円柱', desc: '底面が2つの合同な円で、側面が曲面になっている立体' },
      ];
      const s = solids[randInt(0, solids.length - 1)];
      question = `${s.desc}の立体の名前は？`;
      answer = s.name;
      choices = shuffle([s.name].concat(solids.filter(x => x.name !== s.name).map(x => x.name).sort(() => Math.random() - 0.5).slice(0, 3)));
      steps = [`${s.desc} → ${s.name}`];
    } else if (pat === 7) {
      // 立体の各部分の名称
      const terms = [
        { q: '円錐の頂点から、底面の円周上の点までを結ぶ線分を何といいますか。', a: '母線' },
        { q: '角錐や円錐で、底面ではない、まわりの面を何といいますか。', a: '側面' },
        { q: '角柱や円柱で、上下に向かい合う2つの合同な面を何といいますか。', a: '底面' },
        { q: '角柱や円柱で、底面に垂直な方向の長さを何といいますか。', a: '高さ' },
        { q: '角錐や円錐で、底面と側面が交わってできる点を何といいますか。', a: '頂点' },
      ];
      const t = terms[randInt(0, terms.length - 1)];
      question = t.q;
      answer = t.a;
      choices = shuffle([t.a].concat(terms.filter(x => x.a !== t.a).map(x => x.a).sort(() => Math.random() - 0.5).slice(0, 3)));
      steps = [`${t.q} → ${t.a}`];
    } else if (pat === 8) {
      // 球の表面積 S = 4πr²
      const r = randInt(2, 15);
      const v = r * r * 4;
      question = `半径 ${r} cm の球の表面積は？`;
      answer = `${v}π`;
      choices = piCh(v);
      steps = [`表面積 = 4πr² = 4 × π × ${r}² = ${v}π cm²`];
    } else if (pat === 9) {
      // 半球の体積・表面積
      const askVolume = Math.random() < 0.5;
      if (askVolume) {
        const rs = [3, 6, 9, 12];
        const r = rs[randInt(0, rs.length - 1)];
        const v = (4 * r * r * r / 3) / 2;
        question = `半径 ${r} cm の半球の体積は？`;
        answer = `${v}π`;
        choices = piCh(v);
        steps = [`球の体積 = (4/3)πr³ = (4/3) × π × ${r}³ = ${2 * v}π cm³`, `半球の体積 = 球の体積 ÷ 2 = ${v}π cm³`];
      } else {
        const r = randInt(2, 15);
        const v = r * r * 3;
        question = `半径 ${r} cm の半球の表面積は？（球の曲面部分＋平らな円の部分）`;
        answer = `${v}π`;
        choices = piCh(v);
        steps = [`球の曲面部分 = 4πr² ÷ 2 = 2πr² = 2 × π × ${r}² = ${2 * r * r}π cm²`, `平らな円の部分 = πr² = ${r * r}π cm²`, `合計 = ${2 * r * r}π+${r * r}π = ${v}π cm²`];
      }
    } else if (pat === 0) {
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

  const PROBABILITY_BALL_COLORS_ = ['赤', '白', '青', '黄', '黒'];
  const PROBABILITY_SUM_COUNTS_ = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

  function genProbability() {
    const pat = randInt(0, 10);
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
    } else if (pat === 5) {
      const combos = [{N:4,k:2,cnt:2,fr:'1/2'},{N:5,k:2,cnt:2,fr:'2/5'},{N:6,k:3,cnt:2,fr:'1/3'},{N:8,k:4,cnt:2,fr:'1/4'},{N:9,k:3,cnt:3,fr:'1/3'},{N:10,k:5,cnt:2,fr:'1/5'}];
      const c = combos[randInt(0, combos.length-1)];
      question = `1から ${c.N} のカードから1枚引くとき、${c.k} の倍数が出る確率は？`;
      answer = c.fr;
      const pool = ['1/6', '1/2', '2/3', '3/4', '3/5', '2/5'].filter(f => f !== c.fr);
      choices = shuffle([c.fr, pool[0], pool[1], pool[2]]);
      steps = [`全体 = ${c.N}通り、${c.k}の倍数 → ${c.cnt}通り`, `確率 = ${c.cnt}/${c.N} = ${c.fr}`];
    } else if (pat === 6) {
      // 箱の中の色玉を1個取り出す確率
      const numColors = randInt(2, 3);
      const colors = shuffle(PROBABILITY_BALL_COLORS_).slice(0, numColors);
      const counts = colors.map(() => randInt(2, 8));
      const total = counts.reduce((s, v) => s + v, 0);
      const targetIdx = randInt(0, numColors - 1);
      answer = frac(counts[targetIdx], total);
      question = `箱の中に、${colors.map((c, i) => `${c}球${counts[i]}個`).join('、')}が入っています。この箱から球を1個取り出すとき、${colors[targetIdx]}球である確率を求めなさい。`;
      const candidates6 = [
        frac(counts[targetIdx] + 1, total),
        frac(counts[targetIdx] + 2, total),
        frac(total - counts[targetIdx], total),
        frac(counts[targetIdx], total + 2),
      ];
      steps = [`全体 = ${total}個`, `${colors[targetIdx]}球 = ${counts[targetIdx]}個`, `確率 = ${counts[targetIdx]}/${total} = ${answer}`];
      return { category: 'probability', question, answer, choices: buildChoicesFromList(answer, candidates6), steps };
    } else if (pat === 7) {
      // 3枚の硬貨：ちょうどk枚表、または余事象（少なくとも1枚裏）
      const kind = randInt(0, 1);
      if (kind === 0) {
        const k = randInt(0, 3);
        const C3 = [1, 3, 3, 1];
        answer = frac(C3[k], 8);
        question = `3枚の硬貨を同時に投げるとき、ちょうど${k}枚が表になる確率を求めなさい。`;
        steps = [`全体 = 8通り`, `ちょうど${k}枚表になるのは${C3[k]}通り`, `確率 = ${C3[k]}/8 = ${answer}`];
        const pool = ['1/8', '3/8', '5/8', '7/8'].filter(f => f !== answer);
        choices = shuffle([answer, pool[0], pool[1], pool[2]]);
      } else {
        question = `3枚の硬貨を同時に投げるとき、少なくとも1枚は裏となる確率を求めなさい。`;
        answer = '7/8';
        steps = [`「少なくとも1枚裏」の余事象は「3枚とも表」`, `3枚とも表になる確率 = 1/8`, `少なくとも1枚裏になる確率 = 1 − 1/8 = 7/8`];
        const pool = ['1/8', '3/8', '5/8', '1/2'].filter(f => f !== answer);
        choices = shuffle([answer, pool[0], pool[1], pool[2]]);
      }
    } else if (pat === 8) {
      // 2つのさいころ：目の和の余事象（○以上／○以下になる確率）
      const kind = randInt(0, 1);
      if (kind === 0) {
        const threshold = randInt(9, 11);
        let below = 0;
        for (let s = 2; s < threshold; s++) below += PROBABILITY_SUM_COUNTS_[s];
        const targetCount = 36 - below;
        answer = frac(targetCount, 36);
        question = `大小2つのさいころを同時に投げるとき、出た目の数の和が${threshold}以上になる確率を求めなさい。`;
        steps = [`和が${threshold}未満になるのは${below}通り`, `確率 = 1 − ${below}/36 = ${targetCount}/36 = ${answer}`];
        const candidates8 = [frac(targetCount + 2, 36), frac(Math.max(1, targetCount - 2), 36), frac(36 - targetCount, 36), frac(targetCount, 38)];
        return { category: 'probability', question, answer, choices: buildChoicesFromList(answer, candidates8), steps };
      } else {
        const threshold = randInt(3, 5);
        let atMost = 0;
        for (let s = 2; s <= threshold; s++) atMost += PROBABILITY_SUM_COUNTS_[s];
        answer = frac(atMost, 36);
        question = `大小2つのさいころを同時に投げるとき、出た目の数の和が${threshold}以下になる確率を求めなさい。`;
        steps = [`和が${threshold}以下になるのは${atMost}通り`, `確率 = ${atMost}/36 = ${answer}`];
        const candidates8b = [frac(atMost + 2, 36), frac(Math.max(1, atMost - 2), 36), frac(36 - atMost, 36), frac(atMost, 38)];
        return { category: 'probability', question, answer, choices: buildChoicesFromList(answer, candidates8b), steps };
      }
    } else if (pat === 9) {
      // 3枚の数字カードから2枚を並べてできる2けたの整数が偶数/奇数になる確率
      let digits, evenDigits, oddDigits;
      do {
        const pool = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 3);
        digits = pool;
        evenDigits = digits.filter(d => d % 2 === 0);
        oddDigits = digits.filter(d => d % 2 !== 0);
      } while (evenDigits.length === 0 || oddDigits.length === 0);
      const askEven = randInt(0, 1) === 0;
      const evenCount = evenDigits.length * 2;
      const targetCount = askEven ? evenCount : 6 - evenCount;
      answer = frac(targetCount, 6);
      question = `${digits.join('、')}の3枚のカードから2枚を取り出して並べ、2けたの整数を作ります。できた整数が${askEven ? '偶数' : '奇数'}になる確率を求めなさい。`;
      steps = [`できる整数は全部で6通り`, `一の位が${askEven ? '偶数' : '奇数'}になるのは${targetCount}通り`, `確率 = ${targetCount}/6 = ${answer}`];
      const candidates9 = [frac(targetCount + 1, 6), frac(Math.max(1, targetCount - 1), 6), frac(6 - targetCount, 6), frac(targetCount, 8)];
      return { category: 'probability', question, answer, choices: buildChoicesFromList(answer, candidates9), steps };
    } else {
      // n人から2人をくじで選ぶとき、特定の2人が選ばれる確率
      const n = randInt(4, 6);
      const totalPairs = (n * (n - 1)) / 2;
      question = `${n}人の中から、2人の委員をくじ引きで選びます。特定の2人が選ばれる確率を求めなさい。`;
      answer = frac(1, totalPairs);
      steps = [`選び方は全部で ${n}×${n - 1}÷2 = ${totalPairs}通り`, `特定の2人が選ばれるのは1通り`, `確率 = 1/${totalPairs}`];
      const candidates10 = [frac(1, totalPairs + 1), frac(1, totalPairs + 2), frac(2, totalPairs), frac(1, totalPairs - 1)];
      return { category: 'probability', question, answer, choices: buildChoicesFromList(answer, candidates10), steps };
    }
    return { category: 'probability', question, answer, choices, steps };
  }

  /* ---------- 四分位範囲と箱ひげ図（中2） ---------- */
  // 四分位数は「はんぶんこ」方式(データを中央値で2つに分け、その中央値をそれぞれ
  // 第1・第3四分位数とする)で求める。データ数が偶数のときの下組・上組の中央値が
  // 割り切れる(整数になる)組み合わせが出るまでデータを作り直す。
  function quartileBoxplot2Median_(arr) {
    const m = arr.length;
    return m % 2 === 1 ? arr[(m - 1) / 2] : (arr[m / 2 - 1] + arr[m / 2]) / 2;
  }
  function genQuartileBoxplot2() {
    const nOptions = [7, 8, 9, 10, 11];
    let n, data, q1, q2, q3, guard0 = 0;
    do {
      guard0++;
      n = nOptions[randInt(0, nOptions.length - 1)];
      const vals = new Set();
      while (vals.size < n) vals.add(randInt(10, 99));
      data = Array.from(vals).sort((a, b) => a - b);
      q2 = quartileBoxplot2Median_(data);
      let lower, upper;
      if (n % 2 === 1) { lower = data.slice(0, (n - 1) / 2); upper = data.slice((n + 1) / 2); }
      else { lower = data.slice(0, n / 2); upper = data.slice(n / 2); }
      q1 = quartileBoxplot2Median_(lower);
      q3 = quartileBoxplot2Median_(upper);
    } while ((!Number.isInteger(q1) || !Number.isInteger(q2) || !Number.isInteger(q3)) && guard0 < 500);

    const pat = randInt(0, 3);
    let question, answer, wrongs, steps;
    const dataStr = data.join('、');
    if (pat === 0) {
      question = `次のデータは、あるデータを小さい順に並べたものです。${dataStr}　第1四分位数を求めなさい。`;
      answer = q1;
      wrongs = [q1 + 2, q1 + 4, Math.max(1, q1 - 2), Math.max(1, q1 - 4)].filter(v => v !== answer && v > 0);
      steps = [`データ数は${n}個`, `第1四分位数 = ${q1}`];
    } else if (pat === 1) {
      question = `次のデータは、あるデータを小さい順に並べたものです。${dataStr}　第2四分位数（中央値）を求めなさい。`;
      answer = q2;
      wrongs = [q2 + 2, q2 + 4, Math.max(1, q2 - 2), Math.max(1, q2 - 4)].filter(v => v !== answer && v > 0);
      steps = [`データ数は${n}個`, `第2四分位数（中央値） = ${q2}`];
    } else if (pat === 2) {
      question = `次のデータは、あるデータを小さい順に並べたものです。${dataStr}　第3四分位数を求めなさい。`;
      answer = q3;
      wrongs = [q3 + 2, q3 + 4, Math.max(1, q3 - 2), Math.max(1, q3 - 4)].filter(v => v !== answer && v > 0);
      steps = [`データ数は${n}個`, `第3四分位数 = ${q3}`];
    } else {
      const iqr = q3 - q1;
      question = `次のデータは、あるデータを小さい順に並べたものです。${dataStr}　四分位範囲を求めなさい。`;
      answer = iqr;
      wrongs = [iqr + 2, iqr + 4, Math.max(1, iqr - 2), Math.max(1, iqr - 4)].filter(v => v !== answer && v > 0);
      steps = [`第1四分位数 = ${q1}、第3四分位数 = ${q3}`, `四分位範囲 = 第3四分位数 − 第1四分位数 = ${q3} − ${q1} = ${answer}`];
    }
    return { category: 'quartileBoxplot2', question, answer, choices: buildChoices(answer, wrongs), steps };
  }

  /* ---------- 相似な図形の面積比・体積比（中3） ---------- */

  function genSimilarRatio3() {
    const pat = randInt(0, 6);
    let question, answer, choices, steps;

    if (pat === 0) {
      // 相似比 → 面積比
      let a, b; do { a = randInt(2, 9); b = randInt(2, 9); } while (gcdFrac(a, b) !== 1 || a === b);
      question = `相似な2つの図形があり、相似比が${a}:${b}です。この2つの図形の面積比を求めなさい。`;
      answer = `${a * a}:${b * b}`;
      const candidates = [`${a}:${b}`, `${a * a * a}:${b * b * b}`, `${a * 2}:${b * 2}`, `${a * a}:${b * b + 1}`];
      choices = buildChoicesFromList(answer, candidates);
      steps = [`相似比 ${a}:${b} のとき、面積比は相似比の2乗`, `${a}²:${b}² = ${a * a}:${b * b}`];
    } else if (pat === 1) {
      // 面積比 → 相似比(逆算)
      let a, b; do { a = randInt(2, 9); b = randInt(2, 9); } while (gcdFrac(a, b) !== 1 || a === b);
      const p = a * a, q = b * b;
      question = `相似な2つの図形があり、面積比が${p}:${q}です。この2つの図形の相似比を求めなさい。`;
      answer = `${a}:${b}`;
      const candidates = [`${p}:${q}`, `${a}:${b + 1}`, `${a + 1}:${b}`];
      choices = buildChoicesFromList(answer, candidates);
      steps = [`面積比 ${p}:${q} は相似比の2乗`, `√${p}:√${q} = ${a}:${b}`];
    } else if (pat === 2) {
      // 相似比+一方の面積 → 他方の面積(文章題)
      let a, b; do { a = randInt(2, 9); b = randInt(2, 9); } while (gcdFrac(a, b) !== 1 || a === b);
      const m = randInt(1, 6);
      const areaA = a * a * m, areaB = b * b * m;
      question = `相似な△ABCと△DEFがあり、相似比はAB:DE=${a}:${b}です。△ABCの面積が${areaA}cm²のとき、△DEFの面積を求めなさい。`;
      answer = areaB;
      const wrongs = [areaA, areaB + m, Math.max(1, areaB - m), areaB + 2 * m].filter(v => v !== answer);
      choices = buildChoices(answer, wrongs);
      steps = [`面積比 = ${a}²:${b}² = ${a * a}:${b * b}`, `△DEF = △ABC × ${b * b}/${a * a} = ${areaA} × ${b * b}/${a * a} = ${areaB}`];
    } else if (pat === 3) {
      // 相似比 → 体積比
      let a, b; do { a = randInt(2, 6); b = randInt(2, 6); } while (gcdFrac(a, b) !== 1 || a === b);
      question = `相似な2つの立体があり、相似比が${a}:${b}です。この2つの立体の体積比を求めなさい。`;
      answer = `${a ** 3}:${b ** 3}`;
      const candidates = [`${a}:${b}`, `${a * a}:${b * b}`, `${a * 2}:${b * 2}`];
      choices = buildChoicesFromList(answer, candidates);
      steps = [`相似比 ${a}:${b} のとき、体積比は相似比の3乗`, `${a}³:${b}³ = ${a ** 3}:${b ** 3}`];
    } else if (pat === 4) {
      // 体積比 → 相似比(逆算)
      let a, b; do { a = randInt(2, 6); b = randInt(2, 6); } while (gcdFrac(a, b) !== 1 || a === b);
      const p = a ** 3, q = b ** 3;
      question = `相似な2つの立体があり、体積比が${p}:${q}です。この2つの立体の相似比を求めなさい。`;
      answer = `${a}:${b}`;
      const candidates = [`${p}:${q}`, `${a}:${b + 1}`, `${a * a}:${b * b}`];
      choices = buildChoicesFromList(answer, candidates);
      steps = [`体積比 ${p}:${q} は相似比の3乗`, `∛${p}:∛${q} = ${a}:${b}`];
    } else if (pat === 5) {
      // 相似比+一方の体積 → 他方の体積(文章題)
      let a, b; do { a = randInt(2, 6); b = randInt(2, 6); } while (gcdFrac(a, b) !== 1 || a === b);
      const m = randInt(1, 5);
      const volA = a ** 3 * m, volB = b ** 3 * m;
      question = `相似な2つの立体PとQがあり、相似比はP:Q=${a}:${b}です。Pの体積が${volA}cm³のとき、Qの体積を求めなさい。`;
      answer = volB;
      const wrongs = [volA, volB + m, Math.max(1, volB - m), volB + 2 * m].filter(v => v !== answer);
      choices = buildChoices(answer, wrongs);
      steps = [`体積比 = ${a}³:${b}³ = ${a ** 3}:${b ** 3}`, `Q = P × ${b ** 3}/${a ** 3} = ${volA} × ${b ** 3}/${a ** 3} = ${volB}`];
    } else {
      // 三角形の辺上の点を通る平行線と面積比
      let m, n; do { m = randInt(1, 6); n = randInt(1, 6); } while (gcdFrac(m, n) !== 1 || m === n);
      const total = m + n;
      question = `△ABCの辺AB上に点Dがあり、Dを通り辺BCに平行な直線が辺ACと交わる点をEとする。AD:DB=${m}:${n}のとき、△ADEと△ABCの面積比を求めなさい。`;
      answer = `${m * m}:${total * total}`;
      const candidates = [`${m}:${n}`, `${m}:${total}`, `${m * m}:${n * n}`];
      choices = buildChoicesFromList(answer, candidates);
      steps = [`AD:AB = ${m}:${total}`, `△ADE∽△ABC で相似比は${m}:${total}`, `面積比 = ${m}²:${total}² = ${m * m}:${total * total}`];
    }
    return { category: 'similarRatio3', question, answer, choices, steps };
  }

  /* ---------- 標本調査（中3） ---------- */

  function genSamplingSurvey3() {
    const pat = randInt(0, 3);
    let question, answer, choices, steps;

    if (pat === 0) {
      // 全数調査 か 標本調査 かの判別
      const scenarios = [
        { q: 'ある中学校で、健康診断のために全校生徒の体重を記録する', a: '全数調査' },
        { q: 'テレビ番組の視聴率を調べる調査', a: '標本調査' },
        { q: '缶詰工場で、缶詰を開けて中身の品質を検査する(開けると売り物にならなくなる)', a: '標本調査' },
        { q: '国が5年ごとに行う国勢調査', a: '全数調査' },
        { q: '電球工場で、電球の寿命を調べる検査(調べると壊れて使えなくなる)', a: '標本調査' },
        { q: 'クラス全員の期末テストの点数を集計する', a: '全数調査' },
        { q: '世論調査で内閣支持率を調べる', a: '標本調査' },
        { q: '学校の避難訓練で、全生徒の出席を確認する', a: '全数調査' },
        { q: '湖にどれくらいの魚がいるかを調べる調査', a: '標本調査' },
        { q: '新入生全員の身長を記録する健康診断', a: '全数調査' },
        { q: '工場で作られた大量のねじの中から不良品の割合を調べる検査', a: '標本調査' },
        { q: '選挙の当選者を確定するための開票作業', a: '全数調査' },
      ];
      const sc = scenarios[randInt(0, scenarios.length - 1)];
      question = `次の調査は、全数調査と標本調査のどちらが適切か。「${sc.q}」`;
      answer = sc.a;
      choices = shuffle(['全数調査', '標本調査', 'どちらでもよい', '調査する必要がない']);
      steps = [sc.a === '全数調査' ? '対象全部を調べられる(または調べる必要がある)ので全数調査' : '対象全部を調べるのが困難、または調べると壊れる/コストがかかるので標本調査'];
    } else if (pat === 1) {
      // 混合法(既知の数を混ぜて標本抽出し、母集団を推定する)
      let a, b; do { a = randInt(1, 3); b = randInt(a + 2, a + 7); } while (gcdFrac(a, b) !== 1);
      const s = randInt(3, 10);
      const t = randInt(2, 6);
      const white = a * s;
      const sampleTotal = b * t;
      const whiteInSample = a * t;
      const population = s * b;
      const black = population - white;
      question = `黒いご石の中に白いご石を${white}個入れてよくかき混ぜ、無作為に${sampleTotal}個取り出したところ、その中に白いご石が${whiteInSample}個ふくまれていました。黒いご石はおよそ何個あると考えられますか。`;
      answer = black;
      const wrongs = [population, white, Math.max(1, black - t), black + t].filter(v => v !== answer);
      choices = buildChoices(answer, wrongs);
      steps = [`標本での白の割合 = ${whiteInSample}/${sampleTotal}`, `全体 ≈ ${white} × ${sampleTotal}/${whiteInSample} = ${population}`, `黒 ≈ ${population} − ${white} = ${black}`];
    } else if (pat === 2) {
      // 捕獲再捕獲法
      let p, q; do { p = randInt(1, 3); q = randInt(p + 2, p + 7); } while (gcdFrac(p, q) !== 1);
      const k = randInt(2, 6);
      const s = randInt(2, 8);
      const n2 = q * k;
      const m2 = p * k;
      const M = p * s;
      const population = s * q;
      question = `ある池のフナを${M}匹捕まえて印をつけ、もとの池にもどしました。数日後、同じ池でフナを${n2}匹捕まえたところ、印のついたフナが${m2}匹ふくまれていました。この池には、およそ何匹のフナがいると考えられますか。`;
      answer = population;
      const wrongs = [M + n2, population + k, Math.max(1, population - k), population + 2 * k].filter(v => v !== answer);
      choices = buildChoices(answer, wrongs);
      steps = [`印のついた割合 = ${m2}/${n2}`, `池全体 ≈ ${M} × ${n2}/${m2} = ${population}`];
    } else {
      // 比率推定(不良品など)
      const n = randInt(2, 10) * 50;
      const d = randInt(10, 30);
      const total = n * d;
      const k = randInt(1, 6);
      const estimate = d * k;
      question = `ある工場では1日に${total}個の製品を生産しています。この${total}個の中から${n}個を無作為に抽出したところ、そのうち${k}個が不良品でした。この工場で1日に生産している製品の中に、およそ何個の不良品がふくまれていると考えられますか。`;
      answer = estimate;
      const wrongs = [k, total, estimate + d, Math.max(1, estimate - d)].filter(v => v !== answer);
      choices = buildChoices(answer, wrongs);
      steps = [`標本での不良品の割合 = ${k}/${n}`, `1日の不良品 ≈ ${total} × ${k}/${n} = ${estimate}`];
    }
    return { category: 'samplingSurvey3', question, answer, choices, steps };
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
    const pat = randInt(0, 6);
    let question, questionHtml, answer, choices, steps;
    function triSvg(bot, left, hyp, xpos) {
      const bc = xpos==='bot'?'#c23b2e':'#1c2127', lc = xpos==='left'?'#c23b2e':'#1c2127', hc = xpos==='hyp'?'#c23b2e':'#1c2127';
      return `<svg width="108" height="100" viewBox="0 0 108 100" style="display:block;margin:0 auto 8px"><path d="M14,86 L94,86 L14,14 Z" fill="none" stroke="#1c2127" stroke-width="1.5"/><path d="M14,76 L24,76 L24,86" fill="none" stroke="#1c2127" stroke-width="1.2"/><text x="54" y="96" font-size="12" fill="${bc}" text-anchor="middle">${bot}</text><text x="6" y="52" font-size="12" fill="${lc}" text-anchor="middle">${left}</text><text x="63" y="42" font-size="12" fill="${hc}" text-anchor="middle">${hyp}</text></svg>`;
    }
    if (pat === 4) {
      // 直方体の対角線（各辺の長さの2乗の和が完全平方数になる組を使う）
      const boxes = [[1,2,2,3],[2,3,6,7],[2,6,9,11],[3,4,12,13],[4,4,7,9],[6,6,7,11],[1,4,8,9]];
      const [a,b,c,diag] = boxes[randInt(0, boxes.length-1)];
      question = `縦${a}cm、横${b}cm、高さ${c}cmの直方体の対角線の長さは？`;
      answer = diag;
      choices = buildChoices(diag, [a+b+c, diag+1, diag-1]);
      steps = [`対角線² = ${a}² + ${b}² + ${c}² = ${a*a+b*b+c*c}`, `対角線 = ${diag} cm`];
    } else if (pat === 5) {
      // 正三角形の高さ（1辺は偶数、30-60-90の比1:√3:2を使う）
      const halfSides = [3,4,5,6,7];
      const half = halfSides[randInt(0, halfSides.length-1)];
      const side = half * 2;
      question = `1辺が${side}cmの正三角形の高さは？`;
      answer = `${half}√3`;
      choices = shuffle([answer, `${half+1}√3`, `${half}√2`, `${side}`]);
      steps = [`正三角形を半分にすると、30°,60°,90°の直角三角形になる`, `高さ² = ${side}² − ${half}² = ${side*side-half*half}`, `高さ = √${side*side-half*half} = ${half}√3 cm`];
    } else if (pat === 6) {
      // 30°,60°,90°の直角三角形の辺の比（1:√3:2）
      const k = randInt(2, 9);
      const hyp = 2 * k;
      const askLong = Math.random() < 0.5;
      question = askLong
        ? `30°、60°、90°の直角三角形で、斜辺が${hyp}cmのとき、60°の角に向かい合う辺の長さは？`
        : `30°、60°、90°の直角三角形で、斜辺が${hyp}cmのとき、30°の角に向かい合う辺の長さは？`;
      answer = askLong ? `${k}√3` : `${k}`;
      choices = askLong ? shuffle([answer, `${k+1}√3`, `${k}√2`, `${k}`]) : buildChoices(k, [k+1, Math.max(1,k-1), hyp]);
      steps = [`30°,60°,90°の直角三角形の辺の比は 1:√3:2`, `斜辺 ${hyp} に対して、30°側 = ${k}、60°側 = ${k}√3`];
    } else if (pat === 0) {
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
    { name: 'マチガイオ',      emoji: '👺', img: 'images/machigaio.png' },
    { name: 'ケアレスミス',    emoji: '😅' },
    { name: 'ボンミスコ',      emoji: '💥', img: 'images/bonmisuko.png' },
    { name: 'チンカイトウ',    emoji: '❌' },
    { name: 'ウッカリミスコ',  emoji: '😱', img: 'images/ukkarimisuko.png' },
    { name: 'アキラメタル',    emoji: '🤘' },
    { name: 'ゴーマジンガー',  emoji: '🤖' },
    { name: 'キラキラアキラ',  emoji: '⭐' },
    { name: 'ナットウスライム', emoji: '🟫' },
    { name: 'ハナマルオ',      emoji: '⭕' },
    { name: 'カッコウ',        emoji: '🐦', img: 'images/kakkou.png' },
    { name: 'かっこっこ',      emoji: '🐤', img: 'images/kakkokko.jpg' },
    { name: 'イコールくん',    emoji: '🟰', img: 'images/ikorukun.png' },
  ];

  const RARE_TYPES = {
    zombie: {
      id: 'zombie', name: 'ゾンビAKR', img: 'images/zombie_akr.png',
      lines: {
        appear: 'へへっ、僕を倒すのは簡単じゃないぞ〜',
        defeat: 'これで、君は勉強の時に1人じゃない！いつでも僕がそばにいるよ笑',
        miss: '間違えたら振り出しに戻る…それが10問連続の厳しさだ！',
      },
    },
    santa: {
      id: 'santa', name: 'サンタAKR', img: 'images/santa_akr.png',
      lines: {
        appear: '逃げも隠れもしない…と言いたいけど、1問間違えたら逃げます笑',
        defeat: '僕を倒した君には、スペシャルアイテムをプレゼント！',
        miss: 'ミスは誰にでもある。大事なのは、そこからどう立て直すかだ！',
      },
    },
    thinker: {
      id: 'thinker', name: '考えるAKR', img: 'images/thinker_akr.png',
      lines: {
        defeat: '君が勉強することを諦めても、僕は応援することを諦めない。',
      },
    },
    hikizaru: {
      id: 'hikizaru', name: 'ひきザル', img: 'images/hikizaru.png',
      lines: {
        defeat: 'ヒキッ！ここまで来れたのは、迷いを一つずつ「引き算」してきたからだね。400レベル達成、おめでとう！',
      },
    },
    smile: {
      id: 'smile', name: 'ほほえみAKR', img: 'images/smile_akr.png',
      lines: {
        miss: 'バファリンの半分は優しさ、AKRの半分は…採点の厳しさでできている笑',
      },
    },
    nekoda: {
      id: 'nekoda', name: 'ネコダ', img: 'images/nekoda.png',
      lines: {
        appear: 'にゃ〜ん。1問でも間違えたら、すぐ逃げちゃうにゃ！',
        defeat: 'にゃーん！やるにゃね！ネコのシャーペンをあげるにゃ🐈',
        miss: 'あちゃ〜、逃げちゃったにゃ…',
      },
    },
    warisu: {
      id: 'warisu', name: 'わりーリス', img: 'images/waririsu.png',
      lines: {
        appear: '割り算は得意だけど、1問間違えたらすぐ逃げちゃうよ！',
        defeat: 'よくやったね！ボーナスMPをあげるよ！',
        miss: 'あ、逃げられた…また今度ね！',
      },
    },
    inuda: {
      id: 'inuda', name: 'イヌダ', img: 'images/inuda.png',
      lines: {
        appear: 'わんっ！1問でも間違えたら、すぐ逃げちゃうよ！',
        defeat: 'わんわん！やったね！ボーナスMPをあげるよ！',
        miss: 'わんっ…逃げちゃった…また今度ね！',
      },
    },
    iine: {
      id: 'iine', name: 'いいねAKR', img: 'images/iine.png',
      lines: {
        appear: 'いつも見てるぜ！1問でも間違えたら逃げちゃうぞ！',
        defeat: 'いいね！よくやったな！',
        miss: 'あちゃー、逃げちゃったぜ…また今度な！',
      },
    },
    doubleorhalf: {
      id: 'doubleorhalf', name: 'ダブルorハーフ', img: 'images/doubleorhalf.png',
      lines: {
        appear: '今日獲得したMP、2倍にするか半分にするか勝負だ！1問でも間違えたら逃げるぞ！',
        defeat: 'やったな！今日のMPが2倍になったぞ！',
        miss: '残念、逃げてしまった…今日のMPは半分になってしまった…',
      },
    },
    soubusen: {
      id: 'soubusen', name: 'ゆうかんそうぶせん戦士', img: 'images/soubusen.png',
      lines: {
        appear: '勇敢そうぶせん戦士、参上！1問でも間違えたら撤退するぞ！',
        defeat: 'よくやった！ボーナスMPをあげよう！',
        miss: '…撤退する。また今度な！',
      },
    },
    nattoman: {
      id: 'nattoman', name: 'ナットマン', img: 'images/nattoman.png',
      lines: {
        appear: '納豆の鮮度が…1問でも間違えたら去るぞ！',
        defeat: 'よくやったな！納豆心をあげよう！ボーナスMPもだ！',
        miss: '…去る。また今度な！',
      },
    },
    fugoupakkun: {
      id: 'fugoupakkun', name: '不等号パックン', img: 'images/fugoupakkun.png',
      lines: {
        appear: 'くらべっこ勝負だ！こっちがおおきいぞ！1問でも間違えたら逃げるぞ！',
        defeat: 'やったー！よくくらべられたな！',
        miss: 'あっ、こっちの方がおおきくなってる…逃げちゃうぞ！',
      },
    },
    // ごーまじは他のレアキャラと違い、10問連続正解ではなく20問連続正解で撃破となる
    // 特別なレアキャラ(handleAnswer内で個別に必要ストリーク数を分岐させている)。
    goumaji: {
      id: 'goumaji', name: 'ごーまじ', img: 'images/goumaji.png',
      lines: {
        appear: 'ごーまじか…20問連続正解、できるか？1問でも間違えたら逃げるぞ！',
        defeat: 'まじかよ…20問連続正解とは、ごーまじですごいな！',
        miss: 'あ、ごーまじで逃げちゃうぞ…また今度な！',
      },
    },
    // 漁師AKRは他のレアキャラと違い、間違えても逃げない(FLEEING_RARE_TYPES_に
    // 含めていない)。その代わり不正解のたびにHPを2つ奪ってくる特別なレアキャラ
    // (HP処理はhandleAnswer内でstate.rareType==='gyoshi'を見て行う)。
    gyoshi: {
      id: 'gyoshi', name: '漁師AKR', img: 'images/gyoshi_akr.png',
      lines: {
        appear: '海の男は逃げも隠れもしねぇ！1問間違えるごとに、HPを2つもらっていくぜ！',
        defeat: 'やるじゃねぇか！今日イチの大物はお前だったな！',
        miss: '🎣 いただき！',
      },
    },
    // スットボケAKRは文章題限定のレアキャラ。既存のレアキャラ抽選(rollRareType)とは
    // 完全に独立した仕組みで、文章題の問題が出た瞬間に別枠で5%の確率で登場する。
    sutoboke: {
      id: 'sutoboke', name: 'スットボケAKR', img: 'images/sutoboke.png',
      lines: {
        appear: 'ん…？あれ、なんの問題だっけ…でも解けるぜ！',
        defeat: 'おっと正解！たまには決めるもんだな！',
      },
    },
    mistakeking: {
      id: 'mistakeking', name: '間違い大魔王', img: 'images/mistakeking.png',
      lines: {
        appear: '😈 我は間違い大魔王！お前が間違えた問題、もう一度見せてもらうぞ！',
        defeat: '😈 ぐぬぬ…！お前が間違いを克服するとはな…だが次はもっと手強い間違いを用意してやるぞ！',
        miss: '😈 まだまだじゃのう…！その調子で間違え続けるがいい！',
      },
    },
    // 算数デビルちゃんは間違い大魔王と同じ「間違えた問題を出題」仕組みを使うレアキャラ
    // (nextQuestion内でmistakekingと一緒に判定している)。イジワルっぽい性格の設定に
    // 合わせ、ミスしても逃げずにその場でイジワルを続ける(mistakekingと同じ非フリー仕様)。
    sansudevil: {
      id: 'sansudevil', name: '算数デビルちゃん', img: 'images/sansudevil.png',
      lines: {
        appear: 'イジワルが大すき〜♪ 算数デビルちゃん参上！前に間違えた問題、もう一度見せちゃうぞ〜！',
        defeat: 'むむっ、やられちゃった〜！でも正体はまだヒミツだよ〜？またイジワルしに来るからね〜♪',
        miss: 'イジワル成功〜！その調子で、もっとまちがえちゃえ〜♪',
      },
    },
    // 天使の涙は通常のレア抽選(rollRareType)とは完全に独立した専用トリガーで登場する。
    // ボス戦以外で2問連続不正解になった瞬間、その時点の敵(通常の敵・レアキャラ問わず)が
    // 天使の涙に変わる(handleAnswer内でwrongStreakを見て判定)。間違えても逃げず、
    // 他のレアキャラと同じ10問連続正解で撃破するとずかんに載る。
    angelTears: {
      id: 'angelTears', name: '天使の涙', img: 'images/angeltears.png',
      lines: {
        appear: '私をこんなに泣かせたのは、あなたしかいないわ。もう、計算で間違わないでね。',
        defeat: '涙が止まった…ありがとう。あなたのおかげで、また笑顔になれたよ。',
        miss: 'もう泣かせないで…。',
      },
    },
    warlord_nobunaga: {
      id: 'warlord_nobunaga', name: '織田信長', img: 'images/warlord_nobunaga.png', isWarlord: true,
      lines: {
        appear: '天下布武！儂に挑む度胸、褒めてつかわす。',
        defeat: '『鳴かぬなら 殺してしまえ ホトトギス』…実際に言ったかは諸説あるがな。桶狭間の奇襲や長篠の鉄砲隊で、常識を破り続けた男よ。天下布武、覚えておけ！',
      },
    },
    warlord_hideyoshi: {
      id: 'warlord_hideyoshi', name: '豊臣秀吉', img: 'images/warlord_hideyoshi.png', isWarlord: true,
      lines: {
        appear: 'サルと呼ばれたこの儂が、天下人になったのだぞ！',
        defeat: '農民から天下人にまで登り詰めた、この儂の出世物語はすごいだろう？人たらしの秘訣は、いつも相手の気持ちを考えること。太閤検地や刀狩りも、儂の発明だぞ！',
      },
    },
    warlord_ieyasu: {
      id: 'warlord_ieyasu', name: '徳川家康', img: 'images/warlord_ieyasu.png', isWarlord: true,
      lines: {
        appear: '鳴くまで待とう…とは言うが、勝負は待ってやらぬぞ。',
        defeat: '『鳴かぬなら 鳴くまで待とう ホトトギス』——我慢強さこそ我が武器。関ヶ原の戦いに勝利し、260年続く江戸幕府を開いたのじゃ。',
      },
    },
    warlord_shingen: {
      id: 'warlord_shingen', name: '武田信玄', img: 'images/warlord_shingen.png', isWarlord: true,
      lines: {
        appear: '甲斐の虎、参る。風のように速く、山のように動かぬぞ。',
        defeat: '『風林火山』の旗印のもと、甲斐の虎と恐れられた男よ。上杉謙信とのライバル関係、川中島の戦いは今も語り継がれておる。',
      },
    },
    warlord_kenshin: {
      id: 'warlord_kenshin', name: '上杉謙信', img: 'images/warlord_kenshin.png', isWarlord: true,
      lines: {
        appear: '軍神と呼ばれし我に、その一問で挑むか。',
        defeat: '毘沙門天の化身とまで呼ばれた軍神、それが我じゃ。敵に塩を送ったという逸話もあるほど、義を重んじた武将なのだ。',
      },
    },
    warlord_masamune: {
      id: 'warlord_masamune', name: '伊達政宗', img: 'images/warlord_masamune.png', isWarlord: true,
      lines: {
        appear: '独眼竜政宗、参上。片目でも見えぬものなどないわ。',
        defeat: '独眼竜と呼ばれたこの伊達政宗、隻眼でも天下を狙ったのだ！派手な兜と甲冑は「伊達者」の語源にもなったのだぞ。',
      },
    },
    warlord_yukimura: {
      id: 'warlord_yukimura', name: '真田幸村', img: 'images/warlord_yukimura.png', isWarlord: true,
      lines: {
        appear: '日本一の兵、真田幸村。真っ赤な甲冑、見忘れるなよ。',
        defeat: '大坂の陣で徳川本陣に迫った、日本一の兵と称えられたこの真田幸村じゃ。真っ赤な甲冑「真田の赤備え」、目に焼き付いたか？',
      },
    },
    warlord_mitsuhide: {
      id: 'warlord_mitsuhide', name: '明智光秀', img: 'images/warlord_mitsuhide.png', isWarlord: true,
      lines: {
        appear: '敵は本能寺にあり…お主がその敵かもしれぬな。',
        defeat: '本能寺の変で主君・信長を討った男、それが儂じゃ。なぜ謀反を起こしたのか、その理由は今も歴史のミステリーなのだよ。',
      },
    },
    warlord_motonari: {
      id: 'warlord_motonari', name: '毛利元就', img: 'images/warlord_motonari.png', isWarlord: true,
      lines: {
        appear: '一本の矢では折れても、三本まとまれば折れぬぞ。',
        defeat: '『一本の矢は折れるが、三本まとめれば折れぬ』——三本の矢の教えを息子たちに残した、それが儂じゃ。中国地方の覇者よ。',
      },
    },
    warlord_ujiyasu: {
      id: 'warlord_ujiyasu', name: '北条氏康', img: 'images/warlord_ujiyasu.png', isWarlord: true,
      lines: {
        appear: '小田原城は難攻不落。お主の挑戦、受けて立とう。',
        defeat: '小田原城を本拠に、関東に覇を唱えたのがこの北条氏康じゃ。民のための「四公六民」の税制、覚えておけよ。',
      },
    },
    warlord_mitsunari: {
      id: 'warlord_mitsunari', name: '石田三成', img: 'images/warlord_mitsunari.png', isWarlord: true,
      lines: {
        appear: '義のために、この石田三成、参る。',
        defeat: '関ヶ原の戦いで西軍を率いたのが、この石田三成だ。義に厚く、豊臣家への忠義を最後まで貫いたのだぞ。',
      },
    },
    warlord_yoshihiro: {
      id: 'warlord_yoshihiro', name: '島津義弘', img: 'images/warlord_yoshihiro.png', isWarlord: true,
      lines: {
        appear: '鬼島津、参る。退くも一つの戦法よ。',
        defeat: '関ヶ原の戦場のど真ん中を敵陣突破して薩摩に帰った、あの「島津の退き口」の主が儂じゃ。鬼島津と恐れられたわい。',
      },
    },
    // 世界一周のステージボス。倒すとレアキャラコレクションに追加される(通常のレア
    // キャラと違い、1回倒すだけでコレクション入り。WORLD_BOSS_COLLECTIBLE_IDS参照)。
    wboss_baby: {
      id: 'wboss_baby', name: 'ベビーAKR', img: 'images/baby_akr.png',
      lines: {
        appear: '君が来るのをあくびをしながら、待っていたバブー！',
        defeat: '君にも、赤ちゃんの時があったよね。だから、僕らは仲間だ！',
      },
    },
    wboss_hebitsukai: {
      id: 'wboss_hebitsukai', name: 'ヘビ使いAKR', img: 'images/hebitsukai_akr.png',
      lines: { appear: 'この先には進ませない！俺を倒してから行け！君に、蛇の攻撃がかわせるかな！？' },
    },
    wboss_suijobike: {
      id: 'wboss_suijobike', name: '水上バイクAKR', img: 'images/suijobike_akr.png',
      lines: { appear: '俺に助けてもらおうなんて思うなよ！自分の人生の波は、自分で乗り越えろ！' },
    },
    wboss_fullswing: {
      id: 'wboss_fullswing', name: 'フルスイングAKR', img: 'images/fullswing_akr.png',
      lines: { appear: '人生のバッターボックスに立ったら、見逃し三振だけはするな！' },
    },
    wboss_chuni: {
      id: 'wboss_chuni', name: '中2病AKR', img: 'images/chuni_akr.png',
      lines: { appear: '戦うのを諦めてもいいんだぜ！逃げるなら、今だ！僕も逃げるから笑' },
    },
    wboss_sensei: {
      id: 'wboss_sensei', name: '先生AKR', img: 'images/sensei_akr.png',
      lines: {
        appear: '仮に君が先生に負けても、先生を恨まないでくれ。先生は、いつでも君の味方だよ。',
        miss: '数学の問題と女の子（男の子）は、見た目じゃなくて中身が大事！しっかり問題文（中身）を見てね！君の挑戦を待っているぞ！',
        defeat: '君の勝利だ！これは、ただの勝利ではない！君は、これまでに10000題以上の問題に正解してきた！努力したからこそ、ここまで来れた！自信を持っていい！今後は、【数学の神】の称号をさずけよう！是非、今の気持ちを先生にLINEで聞かせてくれ！',
      },
    },
  };
  // 世界一周のボスは通常のレアキャラ(5回撃破でコレクション入り)と違い、1回倒すだけで
  // コレクション入りする特別枠。
  const WORLD_BOSS_COLLECTIBLE_IDS = ['wboss_baby', 'wboss_hebitsukai', 'wboss_suijobike', 'wboss_fullswing', 'wboss_chuni', 'wboss_sensei'];

  const WARLORD_IDS = [
    'warlord_nobunaga', 'warlord_hideyoshi', 'warlord_ieyasu', 'warlord_shingen',
    'warlord_kenshin', 'warlord_masamune', 'warlord_yukimura', 'warlord_mitsuhide',
    'warlord_motonari', 'warlord_ujiyasu', 'warlord_mitsunari', 'warlord_yoshihiro',
  ];
  function warlordForLevel(level) {
    const idx = Math.max(0, Math.floor(level / 50) - 1) % WARLORD_IDS.length;
    return WARLORD_IDS[idx];
  }
  const RARE_COLLECTION_THRESHOLD = 5;
  const RARE_COLLECTIBLE_IDS = ['zombie', 'santa', 'smile', 'nekoda', 'warisu', 'inuda', 'iine', 'nattoman', 'fugoupakkun', 'goumaji', 'angelTears', 'gyoshi'].concat(WARLORD_IDS);
  // レアキャラを追加するたびに個別の確率をそのまま積み上げると、合計出現率が
  // 際限なく膨らんでしまう(実際に42%まで積み上がっていた)。各キャラの相対的な
  // 出現しやすさの比率は保ったまま、合計が約20%になるよう一律スケールする。
  // 漁師AKR(1/20)を追加した分、素の合計は192/300(64%)になったため、
  // スケール係数も60/192に更新して合計20%を維持する。
  const RARE_SCALE = 60 / 192; // 合計64%→20%
  const RARE_CHANCE_ZOMBIE = 0.08 * RARE_SCALE;
  const RARE_CHANCE_SANTA = (1 / 30) * RARE_SCALE;
  const RARE_CHANCE_SMILE = (1 / 30) * RARE_SCALE;
  const RARE_CHANCE_NEKODA = (1 / 20) * RARE_SCALE;
  const RARE_CHANCE_WARISU = (1 / 50) * RARE_SCALE;
  const RARE_CHANCE_MISTAKEKING = (1 / 10) * RARE_SCALE;
  const RARE_CHANCE_SANSUDEVIL = (1 / 15) * RARE_SCALE;
  const RARE_CHANCE_INUDA = (1 / 20) * RARE_SCALE;
  // ダブルorハーフだけは他のレアキャラと違い、RARE_SCALEによる相対スケールを使わず
  // 最終的な出現率を直接0.5%に固定する。
  const RARE_CHANCE_DOUBLEORHALF = 0.005;
  const RARE_CHANCE_IINE = (1 / 30) * RARE_SCALE;
  const RARE_CHANCE_SOUBUSEN = (1 / 20) * RARE_SCALE;
  const RARE_CHANCE_NATTOMAN = (1 / 50) * RARE_SCALE;
  const RARE_CHANCE_FUGOUPAKKUN = (1 / 30) * RARE_SCALE;
  const RARE_CHANCE_GOUMAJI = (1 / 50) * RARE_SCALE;
  const RARE_CHANCE_GYOSHI = (1 / 20) * RARE_SCALE;
  const RARE_BONUS_MP = 10;
  const SMILE_BONUS_MP = 20;
  const WARISU_BONUS_MP = 30;
  const MISTAKEKING_BONUS_MP = 30;
  const SANSUDEVIL_BONUS_MP = 30;
  const ANGELTEARS_BONUS_MP = 20;
  const INUDA_BONUS_MP = 20;
  const SOUBUSEN_BONUS_MP = 20;
  const NATTOMAN_BONUS_MP = 20;
  const FUGOUPAKKUN_BONUS_MP = 20;
  // 漁師AKR：逃げないレアキャラで、不正解のたびにHPを2つ奪ってくる(非フリー仕様は
  // FLEEING_RARE_TYPES_に含めないことで実現、HP減少は上のhandleAnswer内で処理)。
  const GYOSHI_BONUS_MP = 20;
  const GYOSHI_HP_STEAL_ = 2;
  // 宝箱・鍵・指輪：レアキャラを撃破すると確率で、その時解いていた問題の学年に
  // 応じたティアの宝箱を手に入れる(小学生→銅、中1→銀、中2→金、中3→虹色)。
  // 8/29・30は「宝箱イベントデー」として5分の1の高確率、8/31以降は通常確率の
  // 20分の1に下がる(それより前は宝箱自体が出ない)。宝箱はなんでも屋で対応する
  // ティアの鍵を買わないと開けられない。開けると報酬(MP・HP)とそのティアの
  // 指輪がもらえ、指輪はなんでも屋で鍵と同額で売却できる。鍵の購入・宝箱を
  // 開ける・指輪の売却はMPが直接動くためサーバー側(handleBuyTreasureKey/
  // handleOpenTreasureChest/handleSellTreasureRing)で検証してから実行する
  // (薬草などの購入と同じ方式)。
  var TREASURE_EVENT_START_ = '2026-08-29';
  var TREASURE_EVENT_END_ = '2026-08-30';
  const TREASURE_CHEST_EVENT_CHANCE = 1 / 5;
  const TREASURE_CHEST_NORMAL_CHANCE = 1 / 20;
  // 宝箱・鍵・指輪は2026-08-26に全生徒へ公開済み(それ以前は00001のみの事前確認
  // 期間だった)。イベントデー(8/29・30)より前から遊べるが、高確率になるのは
  // イベントデーだけ(treasureChestDropChance_を参照)。
  var TREASURE_RELEASE_START_ = '2026-08-26';
  function isTreasureChestActive_() {
    return todayKey() >= TREASURE_RELEASE_START_;
  }
  // イベント日(8/29・30)だけ高確率、それ以外の日は通常確率。
  function treasureChestDropChance_() {
    var today = todayKey();
    if (today >= TREASURE_EVENT_START_ && today <= TREASURE_EVENT_END_) return TREASURE_CHEST_EVENT_CHANCE;
    return TREASURE_CHEST_NORMAL_CHANCE;
  }
  const TREASURE_TIER_LABEL_ = { bronze: '銅', silver: '銀', gold: '金', rainbow: '虹色' };
  const TREASURE_TIER_EMOJI_ = { bronze: '🥉', silver: '🥈', gold: '🥇', rainbow: '🌈' };
  const TREASURE_KEY_COST_MP_ = { bronze: 50, silver: 100, gold: 200, rainbow: 500 };
  const TREASURE_RING_SELL_MP_ = { bronze: 50, silver: 100, gold: 200, rainbow: 500 };
  const TREASURE_CHEST_REWARD_ = {
    bronze: { mp: 1, hp: 5 }, silver: { mp: 2, hp: 10 }, gold: { mp: 3, hp: 15 }, rainbow: { mp: 5, hp: 20 },
  };
  // 出題単元の学年(小3〜小6/中1〜中3)から、獲得する宝箱のティアを決める。
  // 学年が読み取れない単元(理科の一部など学年表記のないもの)では宝箱は出さない。
  function treasureTierForGrade_(grade) {
    if (!grade) return null;
    if (grade.charAt(0) === '小') return 'bronze';
    if (grade === '中1') return 'silver';
    if (grade === '中2') return 'gold';
    if (grade === '中3') return 'rainbow';
    return null;
  }
  function treasureItemKey_(prefix, tier) {
    return prefix + tier.charAt(0).toUpperCase() + tier.slice(1);
  }
  // 指輪の護り：銀・金・虹色の指輪を持っていると、ボス戦の不正解のダメージを
  // 完全に防いでくれる(銅の指輪には効果なし)。1個の指輪につき防げる回数は
  // 銀=1回・金=2回・虹色=3回で、使い切ると壊れてなくなる(所持数から1個減る)。
  // 複数個持っていれば、1個使い切りしだい次の指輪に自動で切り替わる。
  // 虹色→金→銀の順に、持っている中でいちばん強い指輪から使う。
  const RING_SHIELD_CHARGES_ = { silver: 1, gold: 2, rainbow: 3 };
  const RING_SHIELD_TIER_ORDER_ = ['rainbow', 'gold', 'silver'];
  // treasureItemsに入りうる全キー(サーバー側sync.jsのTREASURE_ITEM_KEYS_と合わせる)。
  const TREASURE_ITEM_ALL_KEYS_ = [
    'chestBronze', 'chestSilver', 'chestGold', 'chestRainbow',
    'keyBronze', 'keySilver', 'keyGold', 'keyRainbow',
    'ringBronze', 'ringSilver', 'ringGold', 'ringRainbow',
    'ringShieldChargesSilver', 'ringShieldChargesGold', 'ringShieldChargesRainbow',
  ];
  function consumeRingShieldIfAvailable_() {
    state.treasureItems = state.treasureItems || {};
    for (let i = 0; i < RING_SHIELD_TIER_ORDER_.length; i++) {
      const tier = RING_SHIELD_TIER_ORDER_[i];
      const chargeField = 'ringShieldCharges' + tier.charAt(0).toUpperCase() + tier.slice(1);
      if ((Number(state.treasureItems[chargeField]) || 0) <= 0) {
        const ringKey = treasureItemKey_('ring', tier);
        const ringCount = Number(state.treasureItems[ringKey]) || 0;
        if (ringCount > 0) {
          state.treasureItems[ringKey] = ringCount - 1;
          state.treasureItems[chargeField] = RING_SHIELD_CHARGES_[tier];
        }
      }
      if ((Number(state.treasureItems[chargeField]) || 0) > 0) {
        state.treasureItems[chargeField] = Number(state.treasureItems[chargeField]) - 1;
        const remaining = state.treasureItems[chargeField];
        const ringLeft = Number(state.treasureItems[treasureItemKey_('ring', tier)]) || 0;
        return {
          tier: tier,
          html: remaining > 0
            ? `<div class="enemy-quote-banner">${TREASURE_TIER_EMOJI_[tier]} ${TREASURE_TIER_LABEL_[tier]}の指輪のおかげでダメージなし！（残り${remaining}回）</div>`
            : `<div class="enemy-quote-banner">${TREASURE_TIER_EMOJI_[tier]} ${TREASURE_TIER_LABEL_[tier]}の指輪のおかげでダメージなし！…指輪は壊れてなくなった。${ringLeft > 0 ? `（あと${ringLeft}個所持）` : ''}</div>`,
        };
      }
    }
    return null;
  }
  // ボン・ミスコの呪い：通常の敵「ボンミスコ」に間違えるとかかる。呪われている間は
  // 10問連続正解してもMP報酬が上限5に制限される。なんでも屋でAKRの祈り(100MP)を
  // 受けるまで解除されない。
  const BONMISUKO_CURSE_MP_CAP = 5;
  const AKR_PRAYER_COST_MP = 100;
  // なんでも屋の常設アイテム「薬草」：300MPでHPを100増やせる。
  const HERB_COST_MP = 300;
  const HERB_HP_GAIN = 100;
  // 薬草の上位版「爆裂薬草」：1000MPでHPを400増やせる。
  const BAKUHERB_COST_MP = 1000;
  const BAKUHERB_HP_GAIN = 400;
  // 爆裂薬草のさらに上位版「超絶薬草」：3000MPでHPを1500増やせる。
  const CHOUHERB_COST_MP = 3000;
  const CHOUHERB_HP_GAIN = 1500;
  // なんでも屋の消費アイテム「すばやさの種」：100MPで購入し、アイテム図鑑に個数が
  // 表示される。逃げるタイプのレアキャラに間違えて逃げられそうになった瞬間、
  // 所持していれば自動で1個消費されて逃走を防ぎ、もう1回だけそのレアキャラに
  // 挑戦できる(使うと図鑑から減っていき、0個になると表示から消える)。
  const SPEEDSEED_COST_MP = 100;
  // 「逃げる」演出があるレアキャラのrareType一覧(handleAnswerの不正解分岐と一致させる)。
  const FLEEING_RARE_TYPES_ = ['santa', 'nekoda', 'warisu', 'inuda', 'doubleorhalf', 'iine', 'soubusen', 'nattoman', 'fugoupakkun', 'goumaji'];
  // なんでも屋の消費アイテム「鉄壁の盾」：500MPで購入し、ボス戦で間違えるたびに
  // 自動で1チャージ消費して、そのミスのダメージを半分にする(最大3チャージ)。
  // すばやさの種と異なり複数個は保有できず、3回使い切ると壊れて消える。
  // (内部の変数名/DB列名はironWall系のまま。表示名だけ「鉄壁の盾」に変更)
  const IRONWALL_COST_MP = 500;
  const IRONWALL_MAX_CHARGES = 3;
  // ごーまじは他のレアキャラと違い、必要な連続正解数が10ではなく20。その分、撃破報酬は
  // 通常の(10 or 20)+ボーナスの積み上げ方式ではなく、固定30MPとする。
  const GOUMAJI_REQUIRED_STREAK = 20;
  const GOUMAJI_BONUS_MP = 30;
  const GOUMAJI_ITEM_DROP_CHANCE = 1 / 5;
  // 文章題(小数・分数・時間・方程式・連立方程式・二次方程式の文章題)は、他の単元と
  // 同じく10問連続正解で敵を倒す通常ルールのままだが、勝利時の報酬だけ特別扱いにする
  // 単元グループ。MPは学年に関わらず固定50、経験値は通常どおり+10、さらにおまけで
  // 新ステータス「HP」も+10稼げる。
  const WORD_PROBLEM_CATEGORY_IDS = ['decWordProblem5', 'fracWordProblem6', 'timesWordProblem4', 'eqWordProblem1', 'eqWordProblemAdv1', 'simulEqWordProblem2', 'simulEqWordProblemAdv2', 'quadEqWordProblem3'];
  const WORD_PROBLEM_FIXED_MP = 50;
  const WORD_PROBLEM_HP_GAIN = 10;
  const WORD_PROBLEM_HP_GAIN_MIDDLE = 20;
  function wordProblemHpGainForGrade_(grade) {
    return (String(grade || '').charAt(0) === '中') ? WORD_PROBLEM_HP_GAIN_MIDDLE : WORD_PROBLEM_HP_GAIN;
  }
  // 文章題ではないが、同じように❤️HPが貯まる単元(MPは通常どおりの計算式のまま)。
  const HP_ONLY_CATEGORY_IDS = ['planeFigureComposite1', 'unitRateWordProblem5', 'coneDevelopment1', 'circleSector6', 'speedApp5', 'decWordProblem4', 'divWordProblem4', 'sumDiffWordProblem4', 'percentWordProblemAdvanced5', 'speedFrac6', 'figureArea5', 'angleApplication2', 'quartileBoxplot2', 'workMeetingPassage6', 'mathSummary456'];
  function isHpEarningCategory_(catId) {
    return WORD_PROBLEM_CATEGORY_IDS.indexOf(catId) !== -1 || HP_ONLY_CATEGORY_IDS.indexOf(catId) !== -1;
  }
  // 円とおうぎ形(小6)は学年によらず固定で+20HPを獲得する特別枠
  // (通常の文章題HP付与は小学生+10/中学生+20だが、この単元は指定により小学生でも+20)。
  const CIRCLE_SECTOR6_FIXED_HP_GAIN = 20;
  // スットボケAKRは文章題限定のレアキャラ。既存のレアキャラ抽選とは独立して、文章題の
  // 問題が表示されるたびに5%の確率で登場する。正解すると10分の1の確率でスットボケの剣を
  // ゲットできる(斬鉄剣と同様、確実ではなく確率ドロップ)。
  const SUTOBOKE_CHANCE = 0.05;
  const SUTOBOKE_ITEM_DROP_CHANCE = 1 / 10;
  // いいねAKRを撃破した時、5分の1の確率で斬鉄剣をゲットできる。
  const IINE_ITEM_DROP_CHANCE = 1 / 5;
  // イヌダは期間限定キャラ(2026-07-30〜2026-08-31)。この期間だけ出現する。
  const INUDA_START = '2026-07-30';
  const INUDA_END = '2026-08-31';
  function isWithinInudaWindow() {
    const today = todayKey();
    return today >= INUDA_START && today <= INUDA_END;
  }
  // 期間限定キャラの汎用の期間判定(ソウブセン・ナットマンで使用)。
  function isWithinDateWindow(startKey, endKey) {
    const today = todayKey();
    return today >= startKey && today <= endKey;
  }
  const SOUBUSEN_START = '2026-07-31';
  const SOUBUSEN_END = '2026-08-31';
  const NATTOMAN_START = '2026-07-31';
  const NATTOMAN_END = '2026-08-31';
  const SPECIAL_ITEM_FLAME_SWORD = 'flameSword';
  const SPECIAL_ITEM_SMILE_MASK = 'smileMask';
  const SPECIAL_ITEM_CAT_PENCIL = 'catPencil';
  const SPECIAL_ITEM_ZANTETSUKEN = 'zantetsuken';
  const SPECIAL_ITEM_NATTO_GOKORO = 'nattoGokoro';
  const SPECIAL_ITEM_SUTOBOKE_SWORD = 'sutobokeSword';
  const SPECIAL_ITEM_GOUMAJI_MEDAMAJIKARA = 'goumajiMedamajikara';
  const SPECIAL_ITEM_AKR_STAFF = 'akrStaff';
  const SPECIAL_ITEMS = [
    { id: SPECIAL_ITEM_FLAME_SWORD, icon: '🔥⚔️', name: '炎の剣', desc: 'サンタAKRを撃破して手に入れた伝説の剣' },
    { id: SPECIAL_ITEM_SMILE_MASK, icon: '😊🎭', name: 'ほほえみの仮面', desc: 'ほほえみAKRを撃破して手に入れた仮面' },
    { id: SPECIAL_ITEM_CAT_PENCIL, icon: '🐈', name: 'ネコのシャーペン', desc: 'ネコダを撃破して手に入れた特別なシャーペン' },
    { id: SPECIAL_ITEM_ZANTETSUKEN, icon: '⚔️', name: '斬鉄剣', desc: 'いいねAKRを撃破して手に入れた伝説の剣（5分の1の確率）' },
    { id: SPECIAL_ITEM_NATTO_GOKORO, icon: '🧑‍🍳', name: '納豆心', desc: 'ナットマンを撃破して手に入れた特別なアイテム' },
    { id: SPECIAL_ITEM_SUTOBOKE_SWORD, icon: '🗡️', name: 'スットボケの剣', desc: '文章題限定のレアキャラ「スットボケAKR」を撃破して手に入れた剣（10分の1の確率）' },
    { id: SPECIAL_ITEM_GOUMAJI_MEDAMAJIKARA, icon: '👀', name: 'ゴーマジの目力', desc: 'ごーまじを撃破して手に入れた特別なアイテム（5分の1の確率）' },
    { id: SPECIAL_ITEM_AKR_STAFF, icon: '<img src="images/akr_staff.png" alt="">', name: 'AKRの杖', desc: 'ゾンビAKRを撃破して手に入れた不思議な杖' },
  ];
  // 累積しきい値を手計算で並べる方式は、間に新しいレアキャラを差し込むと後続の
  // しきい値が更新漏れになりやすい(実際に発生したバグ)。ここでは各レアキャラの
  // 出現確率を配列で並べ、実行時に累積和を取ることでその種のバグを防ぐ。
  function rollRareType() {
    const r = Math.random();
    const chanceInuda = isWithinInudaWindow() ? RARE_CHANCE_INUDA : 0;
    const chanceSoubusen = isWithinDateWindow(SOUBUSEN_START, SOUBUSEN_END) ? RARE_CHANCE_SOUBUSEN : 0;
    const chanceNattoman = isWithinDateWindow(NATTOMAN_START, NATTOMAN_END) ? RARE_CHANCE_NATTOMAN : 0;
    const slices = [
      ['santa', RARE_CHANCE_SANTA],
      ['zombie', RARE_CHANCE_ZOMBIE],
      ['smile', RARE_CHANCE_SMILE],
      ['nekoda', RARE_CHANCE_NEKODA],
      ['warisu', RARE_CHANCE_WARISU],
      ['mistakeking', RARE_CHANCE_MISTAKEKING],
      ['sansudevil', RARE_CHANCE_SANSUDEVIL],
      ['iine', RARE_CHANCE_IINE],
      ['inuda', chanceInuda],
      ['doubleorhalf', RARE_CHANCE_DOUBLEORHALF],
      ['soubusen', chanceSoubusen],
      ['nattoman', chanceNattoman],
      ['fugoupakkun', RARE_CHANCE_FUGOUPAKKUN],
      ['goumaji', RARE_CHANCE_GOUMAJI],
      ['gyoshi', RARE_CHANCE_GYOSHI],
    ];
    let cumulative = 0;
    for (let i = 0; i < slices.length; i++) {
      cumulative += slices[i][1];
      if (r < cumulative) return slices[i][0];
    }
    return null;
  }
  // ダブルorハーフが新しく出現した瞬間の「本日の獲得MP(pointsToday)」を記録しておく。
  // 撃破/失敗時にはこのスナップショットを2倍/半分にする（出現後に稼いだ分は対象外）。
  function assignRareType(state) {
    const t = rollRareType();
    if (t === 'doubleorhalf') state.doubleOrHalfSnapshot = state.pointsToday;
    return t;
  }
  // 通常キャラ「分数くん」：分数を扱う単元を解いている時だけ、通常の敵の代わりに
  // 表示される(enemyIdxの進行自体には影響しない、見た目だけの差し替え)。
  const FRACTION_CATEGORY_IDS = ['frac4', 'fracAddSub5', 'decFracAddSub5', 'fracReduceConvert5', 'fracDecConvert5', 'fracDecimal5', 'fracMulDiv6', 'fracDecIntMulDiv6', 'fracWordProblem6'];
  const FRACTION_KUN = { name: '分数くん', img: 'images/bunsukun.png' };
  // 通常キャラ「かけちゃん」：かけ算だけを扱う単元を解いている時だけ表示される。
  const KAKE_CATEGORY_IDS = ['mul2', 'decMul4', 'mul3x2_4', 'decMul5', 'mulWritten3'];
  const KAKE_CHAN = { name: 'かけちゃん', img: 'images/kakechan.png' };
  // 通常キャラ「わるくん」：わり算だけを扱う単元を解いている時だけ表示される。
  const WARU_CATEGORY_IDS = ['div2', 'divRemainder4', 'div2by1_4', 'div2by2_4', 'div3by1_4', 'div3by2_4', 'div3by3_4', 'decDiv5', 'decDivRemainder5'];
  const WARU_KUN = { name: 'わるくん', img: 'images/warukun.png' };
  // 通常キャラ「しすうくん」：累乗（指数）を扱う単元を解いている時だけ表示される。
  const POWER_CATEGORY_IDS = ['power'];
  const SHISUU_KUN = { name: 'しすうくん', img: 'images/shisuukun.png' };
  function currentEnemyDisplay(st) {
    if (st.rareType && RARE_TYPES[st.rareType]) return RARE_TYPES[st.rareType];
    if (st.current && FRACTION_CATEGORY_IDS.indexOf(st.current.category) !== -1) return FRACTION_KUN;
    if (st.current && KAKE_CATEGORY_IDS.indexOf(st.current.category) !== -1) return KAKE_CHAN;
    if (st.current && WARU_CATEGORY_IDS.indexOf(st.current.category) !== -1) return WARU_KUN;
    if (st.current && POWER_CATEGORY_IDS.indexOf(st.current.category) !== -1) return SHISUU_KUN;
    return ENEMIES[st.enemyIdx];
  }

  /* ---------- アプリ状態 ---------- */

  const savedGame = loadGameState();
  const savedProgress = loadAccountProgress_((loadSession() || {}).id);
  const state = {
    total: 0,
    correct: 0,
    streak: 0,
    wrongStreak: 0,
    streakAboveGrade: true,
    catStats: {},
    current: null,
    answered: false,
    // 出題範囲(有効カテゴリ)の設定は、アカウント別ストレージ(progress)を優先し、
    // 保存されていなければ学年ごとのデフォルトを使う。
    enabled: new Set((function () {
      var savedEnabled = (savedProgress && Array.isArray(savedProgress.enabled) && savedProgress.enabled.length > 0) ? savedProgress.enabled
        : ((savedGame && Array.isArray(savedGame.enabled) && savedGame.enabled.length > 0) ? savedGame.enabled : null);
      return savedEnabled || defaultEnabledIds((loadSession() || {}).grade);
    })()),
    // 理科の出題範囲設定。算数・数学のenabledとは完全に別のSetで持つ。
    enabledScience: new Set((function () {
      var savedEnabledSci = (savedProgress && Array.isArray(savedProgress.enabledScience) && savedProgress.enabledScience.length > 0) ? savedProgress.enabledScience
        : ((savedGame && Array.isArray(savedGame.enabledScience) && savedGame.enabledScience.length > 0) ? savedGame.enabledScience : null);
      return savedEnabledSci || defaultEnabledScienceIds((loadSession() || {}).grade);
    })()),
    // 現在の科目('math'または'science')。理科ボタンで切り替える。
    subject: (savedProgress && savedProgress.subject) || (savedGame && savedGame.subject) || 'math',
    // 理科専用の経験値(算数・数学のexpとは別集計)。MPは共通プールを使う。
    scienceExp: (savedProgress && Number(savedProgress.scienceExp)) || (savedGame && Number(savedGame.scienceExp)) || 0,
    // 理科モードの連続正解数(端末セッション限定、あえて永続化しない)。
    scienceStreak: 0,
    // 爆裂想像力クイズで正解済みの問題ID一覧(同じ問題で何度もHPを稼げないようにする)。
    bakuretsuSolved: new Set((function () {
      var saved = (savedProgress && Array.isArray(savedProgress.bakuretsuSolved)) ? savedProgress.bakuretsuSolved
        : ((savedGame && Array.isArray(savedGame.bakuretsuSolved)) ? savedGame.bakuretsuSolved : null);
      return saved || [];
    })()),
    // なんでも屋で買える消費アイテム「すばやさの種」の所持数。
    speedSeedCount: (savedProgress && Number(savedProgress.speedSeedCount)) || (savedGame && Number(savedGame.speedSeedCount)) || 0,
    // なんでも屋で買える消費アイテム「鉄壁の盾」の残りチャージ数(0〜3、複数保有不可)。
    ironWallCharges: (savedProgress && Number(savedProgress.ironWallCharges)) || (savedGame && Number(savedGame.ironWallCharges)) || 0,
    // なんでも屋で買える消費アイテム「鋼の鎧」の残りチャージ数(0〜10、複数保有不可)。
    // ボス戦以外の不正解のたびに1消費してHP減少を防ぎ、10回使い切ると壊れてなくなる。
    steelArmorCharges: (savedProgress && Number(savedProgress.steelArmorCharges)) || (savedGame && Number(savedGame.steelArmorCharges)) || 0,
    points: (savedGame && savedGame.points) || 0,
    level: (savedGame && savedGame.level) || 1,
    exp: (savedGame && savedGame.exp) || 0,
    // pointsToday/pointsDate/items/rareDefeats/rareCollected/thinkerMilestoneは
    // アカウントごとの別ストレージ(progress)を優先し、まだ無い場合のみ従来の
    // matsue-math-game側の値を使う(移行用フォールバック)。
    pointsToday: savedProgress ? (Number(savedProgress.pointsToday) || 0) : ((savedGame && Number(savedGame.pointsToday)) || 0),
    pointsDate: (savedProgress && savedProgress.pointsDate) || (savedGame && savedGame.pointsDate) || null,
    // 計算問題(理科含む)と文章題、それぞれ別々の1日MP上限を管理するためのカウンター。
    // pointsDateが変わったタイミングでpointsTodayと一緒にリセットする。
    pointsTodayCalc: (savedProgress && Number(savedProgress.pointsTodayCalc)) || (savedGame && Number(savedGame.pointsTodayCalc)) || 0,
    pointsTodayWord: (savedProgress && Number(savedProgress.pointsTodayWord)) || (savedGame && Number(savedGame.pointsTodayWord)) || 0,
    enemyIdx: (savedGame && savedGame.enemyIdx) || 0,
    rareType: (savedGame && (savedGame.rareType === null || RARE_TYPES[savedGame.rareType])) ? savedGame.rareType : rollRareType(),
    items: (savedProgress && Array.isArray(savedProgress.items)) ? savedProgress.items.slice() : ((savedGame && Array.isArray(savedGame.items)) ? savedGame.items.slice() : []),
    prefectureCount: Math.max(0, Math.min(47, (savedGame && Number(savedGame.prefectureCount)) || 0)),
    avatar: (savedGame && savedGame.avatar && typeof savedGame.avatar === 'object') ? savedGame.avatar : null,
    missionDate: (savedProgress && savedProgress.missionDate) || (savedGame && savedGame.missionDate) || null,
    missionGrade: (savedProgress && savedProgress.missionGrade) || (savedGame && savedGame.missionGrade) || null,
    missionCategoryId: (savedProgress && savedProgress.missionCategoryId) || (savedGame && savedGame.missionCategoryId) || null,
    missionCorrect: savedProgress ? (Number(savedProgress.missionCorrect) || 0) : ((savedGame && Number(savedGame.missionCorrect)) || 0),
    missionClaimed: (savedProgress ? !!savedProgress.missionClaimed : !!(savedGame && savedGame.missionClaimed)),
    rareDefeats: (savedProgress && savedProgress.rareDefeats && typeof savedProgress.rareDefeats === 'object') ? Object.assign({}, savedProgress.rareDefeats) : ((savedGame && savedGame.rareDefeats && typeof savedGame.rareDefeats === 'object') ? Object.assign({}, savedGame.rareDefeats) : {}),
    rareCollected: (savedProgress && Array.isArray(savedProgress.rareCollected)) ? savedProgress.rareCollected.slice() : ((savedGame && Array.isArray(savedGame.rareCollected)) ? savedGame.rareCollected.slice() : []),
    thinkerMilestone: (savedProgress && savedProgress.thinkerMilestone) || (savedGame && savedGame.thinkerMilestone) || null,
    // 間違い大魔王が出題する「間違えた問題」の保存庫。カテゴリID→問題スナップショット配列。
    wrongBank: (savedProgress && savedProgress.wrongBank && typeof savedProgress.wrongBank === 'object') ? JSON.parse(JSON.stringify(savedProgress.wrongBank)) : ((savedGame && savedGame.wrongBank && typeof savedGame.wrongBank === 'object') ? JSON.parse(JSON.stringify(savedGame.wrongBank)) : {}),
    doubleOrHalfSnapshot: (savedGame && Number(savedGame.doubleOrHalfSnapshot)) || 0,
    // ボン・ミスコの呪いにかかっているか。なんでも屋でAKRの祈りを受けるまで持続する
    // 状態のため、アカウント別ストレージ(progress)を優先する。
    cursed: (savedProgress ? !!savedProgress.cursed : !!(savedGame && savedGame.cursed)),
    // 単元ごとの1日の出題数上限(DAILY_CATEGORY_COMPLETE_AT)のカウンタ。日付が変われば
    // ensureCategoryDailyReset()でリセットされる。
    categoryDailyCounts: (savedProgress && savedProgress.categoryDailyCounts && typeof savedProgress.categoryDailyCounts === 'object') ? Object.assign({}, savedProgress.categoryDailyCounts) : ((savedGame && savedGame.categoryDailyCounts && typeof savedGame.categoryDailyCounts === 'object') ? Object.assign({}, savedGame.categoryDailyCounts) : {}),
    categoryDailyDate: (savedProgress && savedProgress.categoryDailyDate) || (savedGame && savedGame.categoryDailyDate) || null,
    // HP: 文章題を正解するたびに+10される新ステータス。MP/経験値と同様に増えていくが、
    // 世界一周のボス戦で不正解になるとステージに応じた量だけ減ることもある。
    hp: (savedProgress && Number(savedProgress.hp)) || (savedGame && Number(savedGame.hp)) || 0,
    // 世界一周2周目以降の開始レベル(1周目は100)。worldCountForLevelはこの値を基準に
    // 「今の周」の制覇済みヵ国数を計算する(レベル自体は下げない)。
    worldLapStartLevel: (savedProgress && Number(savedProgress.worldLapStartLevel)) || (savedGame && Number(savedGame.worldLapStartLevel)) || 100,
    // 世界一周の現在地点(制覇済みヵ国数)。2026-09-01以降はレベル10ごとのサイコロで
    // 増減する(rollWorldCountryDice_を参照)。それまではlegacyWorldCountForLevel_で
    // レベルから毎回自動計算した値と常に同期させておき、9月になった瞬間そこから
    // サイコロ制に切り替わるようにする。
    worldCountry: (savedProgress && Number(savedProgress.worldCountry)) || (savedGame && Number(savedGame.worldCountry)) || legacyWorldCountForLevel_((savedGame && Number(savedGame.level)) || 1, (savedProgress && Number(savedProgress.worldLapStartLevel)) || (savedGame && Number(savedGame.worldLapStartLevel)) || 100),
    worldLap: (savedProgress && Number(savedProgress.worldLap)) || (savedGame && Number(savedGame.worldLap)) || 1,
    // ステージID→撃破済みかどうか。周が変わるとリセットされる。
    worldBossDefeated: (savedProgress && savedProgress.worldBossDefeated && typeof savedProgress.worldBossDefeated === 'object') ? Object.assign({}, savedProgress.worldBossDefeated) : ((savedGame && savedGame.worldBossDefeated && typeof savedGame.worldBossDefeated === 'object') ? Object.assign({}, savedGame.worldBossDefeated) : {}),
    // 撃破したボス(国コード)のリスト。周をまたいでも記録として残す。
    worldAllies: (savedProgress && Array.isArray(savedProgress.worldAllies)) ? savedProgress.worldAllies.slice() : ((savedGame && Array.isArray(savedGame.worldAllies)) ? savedGame.worldAllies.slice() : []),
    // 宝箱・鍵・指輪の所持数。{chestBronze,keyBronze,ringBronze,...}
    // のようにティア(bronze/silver/gold/rainbow)ごとに数える。
    treasureItems: (savedProgress && savedProgress.treasureItems && typeof savedProgress.treasureItems === 'object') ? Object.assign({}, savedProgress.treasureItems) : ((savedGame && savedGame.treasureItems && typeof savedGame.treasureItems === 'object') ? Object.assign({}, savedGame.treasureItems) : {}),
    // 現在挑戦中のボス戦のステージID(挑戦していなければnull)。
    // 挑戦中かどうかは端末セッション限定(ページ再読み込みでリセット)。あえて永続化しない。
    worldBossActiveStage: null,
    // ステージ4のように複数体を順番に倒すステージでの進行度(ステージID→次に戦う
    // ボスのインデックス、0始まり)。worldBossActiveStageと同様に端末セッション限定。
    worldBossSubIndex: {},
    // 世界一周の最終ボス(ステージ4)を初めて倒すと永続的にtrueになる称号フラグ。
    // 2周目以降にworldBossDefeatedがリセットされても、この称号は失われない。
    mathGodTitleEarned: !!((savedProgress && savedProgress.mathGodTitleEarned) || (savedGame && savedGame.mathGodTitleEarned)),
    // 魔法の書(2周目/9月のボス戦専用消費アイテム)の所持冊数。{fire,ice,thunder,...}
    // のように属性ごとに数える。treasureItemsと同じ「端末を信頼してSET」方式。
    spellbooks: (savedProgress && savedProgress.spellbooks && typeof savedProgress.spellbooks === 'object') ? Object.assign({}, savedProgress.spellbooks) : ((savedGame && savedGame.spellbooks && typeof savedGame.spellbooks === 'object') ? Object.assign({}, savedGame.spellbooks) : {}),
    // 詠唱済みで結果待ちの魔法(属性名、無ければnull)。次の問題に正解すればボスに
    // ダメージが入り、不正解だとかわされて不発になる。worldBossActiveStageと同様に
    // 端末セッション限定、あえて永続化しない。
    worldPendingSpell: null,
    // 今のボスに与えた累計ダメージ(正解1問ごとの通常ダメージ＋魔法のダメージ)。
    // 連続正解数(streak)とは切り離して数えるので、不正解でもボスのHPは戻らない。
    // worldBossActiveStageと同様に端末セッション限定。
    worldBossDamage: 0,
  };
  applyWorldDataForLap_(state.worldLap);

  // 旧バージョン(matsue-math-gameのみ)からアカウント別の進捗ストレージへの移行を
  // 確実にするため、セッションが既にある場合はページ読み込み時に一度、無条件で
  // 書き込んでおく。これが無いと「再ログインではなく既存セッションの再読み込みで、
  // かつポイント等に差分が無い」場合にsaveGameStateが一度も呼ばれないまま
  // ログアウトされ、アイテム等が新ストレージへ移行される前に消えてしまう。
  (function migrateAccountProgressOnLoad_() {
    var sess = loadSession();
    if (sess && sess.id) saveGameState(state);
  })();

  const els = {
    questionText: document.getElementById('questionText'),
    categoryTag: document.getElementById('categoryTag'),
    memoToggle: document.getElementById('memoToggle'),
    worldSpellBtn: document.getElementById('worldSpellBtn'),
    battleVsRow: document.getElementById('battleVsRow'),
    battlePlayerAvatar: document.getElementById('battlePlayerAvatar'),
    battleEnemyAvatar: document.getElementById('battleEnemyAvatar'),
    battleEnemyCaption: document.getElementById('battleEnemyCaption'),
    battlePlayerHpText: document.getElementById('battlePlayerHpText'),
    battleEnemyHpBarInner: document.getElementById('battleEnemyHpBarInner'),
    battleEnemyHpText: document.getElementById('battleEnemyHpText'),
    memoPanel: document.getElementById('memoPanel'),
    memoCanvas: document.getElementById('memoCanvas'),
    memoPenBtn: document.getElementById('memoPenBtn'),
    memoEraserBtn: document.getElementById('memoEraserBtn'),
    memoClearBtn: document.getElementById('memoClearBtn'),
    choices: document.getElementById('choices'),
    feedback: document.getElementById('feedback'),
    nextBtn: document.getElementById('nextBtn'),
    statTotal: document.getElementById('statTotal'),
    statCorrect: document.getElementById('statCorrect'),
    statRate: document.getElementById('statRate'),
    statPoints: document.getElementById('statPoints'),
    statExpSub: document.getElementById('statExpSub'),
    statHp: document.getElementById('statHp'),
    statLevel: document.getElementById('statLevel'),
    expBarInner: document.getElementById('expBarInner'),
    enemyEmoji: document.getElementById('enemyEmoji'),
    enemyName: document.getElementById('enemyName'),
    enemySpeech: document.getElementById('enemySpeech'),
    hpBarInner: document.getElementById('hpBarInner'),
    hpText: document.getElementById('hpText'),
    resetBtn: document.getElementById('resetBtn'),
    settingsToggle: document.getElementById('settingsToggle'),
    settingsPanel: document.getElementById('settingsPanel'),
    settingsGrid: document.getElementById('settingsGrid'),
    settingsDailyLimitNote: document.getElementById('settingsDailyLimitNote'),
    numberlineTicks: document.querySelector('.nl-ticks'),

    loginCard: document.getElementById('loginCard'),
    loginGateNotice: document.getElementById('loginGateNotice'),
    loginGatePanel: document.getElementById('loginGatePanel'),
    loginGateProgress: document.getElementById('loginGateProgress'),
    loginGateQuestion: document.getElementById('loginGateQuestion'),
    loginGateChoiceRow: document.getElementById('loginGateChoiceRow'),
    loginGateResult: document.getElementById('loginGateResult'),
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
    photoAvatarConsent: document.getElementById('photoAvatarConsent'),
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
    historyBadges: document.getElementById('historyBadges'),
    historyItems: document.getElementById('historyItems'),
    historyRareCollection: document.getElementById('historyRareCollection'),
    rankingToggle: document.getElementById('rankingToggle'),
    rankingPanel: document.getElementById('rankingPanel'),
    rankingTitle: document.getElementById('rankingTitle'),
    rankingTabExp: document.getElementById('rankingTabExp'),
    rankingTabToday: document.getElementById('rankingTabToday'),
    rankingTabPoints: document.getElementById('rankingTabPoints'),
    rankingTabGrade: document.getElementById('rankingTabGrade'),
    rankingTabHp: document.getElementById('rankingTabHp'),
    rankingTabChallenge: document.getElementById('rankingTabChallenge'),
    rankingHpHint: document.getElementById('rankingHpHint'),
    rankingSummary: document.getElementById('rankingSummary'),
    rankingList: document.getElementById('rankingList'),
    rankingNearby: document.getElementById('rankingNearby'),
    rankingNearbyList: document.getElementById('rankingNearbyList'),
    rankingChallengeElementary: document.getElementById('rankingChallengeElementary'),
    rankingChallengeElementaryList: document.getElementById('rankingChallengeElementaryList'),
    rankingChallengeElementaryNearby: document.getElementById('rankingChallengeElementaryNearby'),
    rankingChallengeElementaryNearbyList: document.getElementById('rankingChallengeElementaryNearbyList'),
    rankingChallengeMiddle: document.getElementById('rankingChallengeMiddle'),
    rankingChallengeMiddleList: document.getElementById('rankingChallengeMiddleList'),
    rankingChallengeMiddleNearby: document.getElementById('rankingChallengeMiddleNearby'),
    rankingChallengeMiddleNearbyList: document.getElementById('rankingChallengeMiddleNearbyList'),
    apologyBanner: document.getElementById('apologyBanner'),
    teamEventBanner: document.getElementById('teamEventBanner'),
    teamEventBannerText: document.getElementById('teamEventBannerText'),
    teamEventBannerBtn: document.getElementById('teamEventBannerBtn'),
    teamEventToggle: document.getElementById('teamEventToggle'),
    teamEventPanel: document.getElementById('teamEventPanel'),
    teamEventTitle: document.getElementById('teamEventTitle'),
    teamEventPeriod: document.getElementById('teamEventPeriod'),
    teamEventMyTeamBox: document.getElementById('teamEventMyTeamBox'),
    teamEventMyTeamTitle: document.getElementById('teamEventMyTeamTitle'),
    teamEventMyRank: document.getElementById('teamEventMyRank'),
    teamEventMyMembersList: document.getElementById('teamEventMyMembersList'),
    teamEventAllTeamsList: document.getElementById('teamEventAllTeamsList'),
    weeklyQuizSpecialBanner: document.getElementById('weeklyQuizSpecialBanner'),
    weeklyQuizSpecialBannerText: document.getElementById('weeklyQuizSpecialBannerText'),
    weeklyQuizSpecialBannerBtn: document.getElementById('weeklyQuizSpecialBannerBtn'),
    worldLaunchBanner: document.getElementById('worldLaunchBanner'),
    worldLaunchText: document.getElementById('worldLaunchText'),
    missionBanner: document.getElementById('missionBanner'),
    missionDesc: document.getElementById('missionDesc'),
    missionProgressBarInner: document.getElementById('missionProgressBarInner'),
    missionProgressText: document.getElementById('missionProgressText'),
    missionReward: document.getElementById('missionReward'),
    subjectToggle: document.getElementById('subjectToggle'),
    mathArea: document.getElementById('mathArea'),
    scienceArea: document.getElementById('scienceArea'),
    scienceStreakBarInner: document.getElementById('scienceStreakBarInner'),
    scienceStreakText: document.getElementById('scienceStreakText'),
    scienceExpText: document.getElementById('scienceExpText'),
    hpRulesBanner: document.getElementById('hpRulesBanner'),
    hpRulesBannerText: document.getElementById('hpRulesBannerText'),
    mpCapBanner: document.getElementById('mpCapBanner'),
    mpCapBannerText: document.getElementById('mpCapBannerText'),
    hpGameOverPanel: document.getElementById('hpGameOverPanel'),
    hpGameOverLogoutBtn: document.getElementById('hpGameOverLogoutBtn'),
    hpGameOverShopBtn: document.getElementById('hpGameOverShopBtn'),
    quizCard: document.getElementById('quizCard'),
    giftToggle: document.getElementById('giftToggle'),
    giftPanel: document.getElementById('giftPanel'),
    giftSummary: document.getElementById('giftSummary'),
    giftList: document.getElementById('giftList'),
    giftCodeResult: document.getElementById('giftCodeResult'),
    curseBanner: document.getElementById('curseBanner'),
    curseBannerBtn: document.getElementById('curseBannerBtn'),
    shopToggle: document.getElementById('shopToggle'),
    shopPanel: document.getElementById('shopPanel'),
    shopSummary: document.getElementById('shopSummary'),
    shopList: document.getElementById('shopList'),
    prefectureToggle: document.getElementById('prefectureToggle'),
    prefecturePanel: document.getElementById('prefecturePanel'),
    prefectureProgress: document.getElementById('prefectureProgress'),
    prefectureMapWrap: document.getElementById('prefectureMapWrap'),
    prefectureList: document.getElementById('prefectureList'),
    userAvatarBadge: document.getElementById('userAvatarBadge'),
    avatarToggle: document.getElementById('avatarToggle'),
    avatarPanel: document.getElementById('avatarPanel'),
    avatarLocked: document.getElementById('avatarLocked'),
    avatarLockedText: document.getElementById('avatarLockedText'),
    avatarBuilder: document.getElementById('avatarBuilder'),
    avatarPreview: document.getElementById('avatarPreview'),
    avatarHairRow: document.getElementById('avatarHairRow'),
    avatarHairColorRow: document.getElementById('avatarHairColorRow'),
    avatarFaceRow: document.getElementById('avatarFaceRow'),
    avatarSkinRow: document.getElementById('avatarSkinRow'),
    avatarOutfitColorRow: document.getElementById('avatarOutfitColorRow'),
    avatarSaveBtn: document.getElementById('avatarSaveBtn'),
    avatarSaveMsg: document.getElementById('avatarSaveMsg'),
    avatarModeTabs: document.getElementById('avatarModeTabs'),
    avatarModePresetBtn: document.getElementById('avatarModePresetBtn'),
    avatarModePartsBtn: document.getElementById('avatarModePartsBtn'),
    avatarPresetSection: document.getElementById('avatarPresetSection'),
    avatarPartsSection: document.getElementById('avatarPartsSection'),
    avatarPresetPreview: document.getElementById('avatarPresetPreview'),
    avatarPresetGrid: document.getElementById('avatarPresetGrid'),
    worldToggle: document.getElementById('worldToggle'),
    worldPanel: document.getElementById('worldPanel'),
    worldProgress: document.getElementById('worldProgress'),
    worldMapWrap: document.getElementById('worldMapWrap'),
    worldZoomTabs: document.getElementById('worldZoomTabs'),
    worldMapZoomWrap: document.getElementById('worldMapZoomWrap'),
    worldStageList: document.getElementById('worldStageList'),
    worldBossSection: document.getElementById('worldBossSection'),
    worldAllySection: document.getElementById('worldAllySection'),
    worldLapRestart: document.getElementById('worldLapRestart'),
    worldDiceModal: document.getElementById('worldDiceModal'),
    worldDiceTestBtn: document.getElementById('worldDiceTestBtn'),
    worldBossTestRow: document.getElementById('worldBossTestRow'),
    worldDiceFace: document.getElementById('worldDiceFace'),
    worldDiceResultText: document.getElementById('worldDiceResultText'),
    worldDiceCloseBtn: document.getElementById('worldDiceCloseBtn'),
    grantToggle: document.getElementById('grantToggle'),
    grantPanel: document.getElementById('grantPanel'),
    grantForm: document.getElementById('grantForm'),
    grantTargetId: document.getElementById('grantTargetId'),
    grantFlameSword: document.getElementById('grantFlameSword'),
    grantSmileMask: document.getElementById('grantSmileMask'),
    grantCatPencil: document.getElementById('grantCatPencil'),
    grantOtherIds: document.getElementById('grantOtherIds'),
    grantSubmitBtn: document.getElementById('grantSubmitBtn'),
    grantResult: document.getElementById('grantResult'),
    testPhotoToggle: document.getElementById('testPhotoToggle'),
    testPhotoPanel: document.getElementById('testPhotoPanel'),
    penaTestCard: document.getElementById('penaTestCard'),
    penaTestCardTitle: document.getElementById('penaTestCardTitle'),
    penaTestFileInput: document.getElementById('penaTestFileInput'),
    penaTestSubmitBtn: document.getElementById('penaTestSubmitBtn'),
    penaTestResult: document.getElementById('penaTestResult'),
    rankingTestCard: document.getElementById('rankingTestCard'),
    rankingTestFileInput: document.getElementById('rankingTestFileInput'),
    rankingTierRow: document.getElementById('rankingTierRow'),
    rankingTestConfirm: document.getElementById('rankingTestConfirm'),
    rankingTestConfirmText: document.getElementById('rankingTestConfirmText'),
    rankingTestConfirmYes: document.getElementById('rankingTestConfirmYes'),
    rankingTestConfirmNo: document.getElementById('rankingTestConfirmNo'),
    rankingTestResult: document.getElementById('rankingTestResult'),
    hyakuMasuCard: document.getElementById('hyakuMasuCard'),
    hyakuMasuCardTitle: document.getElementById('hyakuMasuCardTitle'),
    hyakuMasuHint: document.getElementById('hyakuMasuHint'),
    hyakuMasuConfirmCheckbox: document.getElementById('hyakuMasuConfirmCheckbox'),
    hyakuMasuFileInput: document.getElementById('hyakuMasuFileInput'),
    hyakuMasuSubmitBtn: document.getElementById('hyakuMasuSubmitBtn'),
    hyakuMasuResult: document.getElementById('hyakuMasuResult'),
    challengeTestCard: document.getElementById('challengeTestCard'),
    challengeTestCardTitle: document.getElementById('challengeTestCardTitle'),
    challengeTestHint: document.getElementById('challengeTestHint'),
    challengeTestFileInput: document.getElementById('challengeTestFileInput'),
    challengeTierRow: document.getElementById('challengeTierRow'),
    challengeTestConfirm: document.getElementById('challengeTestConfirm'),
    challengeTestConfirmText: document.getElementById('challengeTestConfirmText'),
    challengeTestConfirmYes: document.getElementById('challengeTestConfirmYes'),
    challengeTestConfirmNo: document.getElementById('challengeTestConfirmNo'),
    challengeTestResult: document.getElementById('challengeTestResult'),
    weeklyQuizToggle: document.getElementById('weeklyQuizToggle'),
    weeklyQuizPanel: document.getElementById('weeklyQuizPanel'),
    weeklyQuizUnavailable: document.getElementById('weeklyQuizUnavailable'),
    weeklyQuizUnavailableText: document.getElementById('weeklyQuizUnavailableText'),
    weeklyQuizBody: document.getElementById('weeklyQuizBody'),
    weeklyQuizSpecialLabel: document.getElementById('weeklyQuizSpecialLabel'),
    weeklyQuizQuestion: document.getElementById('weeklyQuizQuestion'),
    weeklyQuizChoiceRow: document.getElementById('weeklyQuizChoiceRow'),
    weeklyQuizConfirm: document.getElementById('weeklyQuizConfirm'),
    weeklyQuizConfirmText: document.getElementById('weeklyQuizConfirmText'),
    weeklyQuizConfirmYes: document.getElementById('weeklyQuizConfirmYes'),
    weeklyQuizConfirmNo: document.getElementById('weeklyQuizConfirmNo'),
    weeklyQuizResult: document.getElementById('weeklyQuizResult'),
    bakuretsuQuizToggle: document.getElementById('bakuretsuQuizToggle'),
    bakuretsuQuizPanel: document.getElementById('bakuretsuQuizPanel'),
    bakuretsuQuizUnavailable: document.getElementById('bakuretsuQuizUnavailable'),
    bakuretsuQuizUnavailableText: document.getElementById('bakuretsuQuizUnavailableText'),
    bakuretsuQuizBody: document.getElementById('bakuretsuQuizBody'),
    bakuretsuQuizQuestion: document.getElementById('bakuretsuQuizQuestion'),
    bakuretsuQuizChoiceRow: document.getElementById('bakuretsuQuizChoiceRow'),
    bakuretsuQuizResult: document.getElementById('bakuretsuQuizResult'),
    withdrawToggle: document.getElementById('withdrawToggle'),
    withdrawPanel: document.getElementById('withdrawPanel'),
    withdrawForm: document.getElementById('withdrawForm'),
    withdrawId: document.getElementById('withdrawId'),
    withdrawPassword: document.getElementById('withdrawPassword'),
    withdrawError: document.getElementById('withdrawError'),
    withdrawSubmitBtn: document.getElementById('withdrawSubmitBtn'),
    withdrawConfirm: document.getElementById('withdrawConfirm'),
    withdrawConfirmText: document.getElementById('withdrawConfirmText'),
    withdrawConfirmYes: document.getElementById('withdrawConfirmYes'),
    withdrawConfirmNo: document.getElementById('withdrawConfirmNo'),
    withdrawResult: document.getElementById('withdrawResult'),
  };

  const categoryLabel = Object.fromEntries([...CATEGORIES, ...SCIENCE_CATEGORIES].map(c => [c.id, c.label]));

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
    if (state.subject === 'science') {
      els.settingsDailyLimitNote.textContent = '🔬理科の出題単元を選べます。チェックした単元からランダムに出題します。';
      els.settingsGrid.innerHTML = SCIENCE_CATEGORIES.filter(c => !c.adminOnly || isAdminSession_()).map(c => {
        const cs = state.catStats[c.id];
        const acc = cs && cs.total >= 3
          ? `<span class="cat-acc">${Math.round(cs.correct / cs.total * 100)}%</span>`
          : '';
        const newBadge = isRecentlyAdded(c.addedDate) ? `<span class="cat-new-badge">NEW🌟</span>` : '';
        return `
          <label class="settings-item">
            <input type="checkbox" data-cat="${c.id}" ${state.enabledScience.has(c.id) ? 'checked' : ''} />
            <span class="cat-label">${c.label}</span>${newBadge}${acc}
          </label>
        `;
      }).join('');
      els.settingsGrid.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
          const id = cb.dataset.cat;
          if (cb.checked) state.enabledScience.add(id);
          else state.enabledScience.delete(id);
          if (state.enabledScience.size === 0) {
            state.enabledScience.add(id);
            cb.checked = true;
          }
          saveGameState(state);
        });
      });
      return;
    }
    els.settingsDailyLimitNote.textContent = !isDailyCategoryLimitActive()
      ? '📢 8月1日から、同じ単元は1日最大100問まで（90問でその日はコンプリート）になります。コンプリートした単元は翌日にまた挑戦できます。ポイント・経験値を稼ぐには、他の単元も解く必要があります。'
      : todayKey() >= DAILY_CATEGORY_LIMIT_V2_START
      ? '📌 同じ単元は1日最大50問まで（40問でその日はコンプリート）。コンプリートした単元は翌日にまた挑戦できます。ポイント・経験値を稼ぐには、他の単元も解こう！'
      : '📌 同じ単元は1日最大100問まで（90問でその日はコンプリート）。コンプリートした単元は翌日にまた挑戦できます。ポイント・経験値を稼ぐには、他の単元も解こう！ 📢8月8日から、1日最大50問（40問でコンプリート）に変更されます。';
    els.settingsGrid.innerHTML = CATEGORIES.map(c => {
      const cs = state.catStats[c.id];
      const acc = cs && cs.total >= 3
        ? `<span class="cat-acc">${Math.round(cs.correct / cs.total * 100)}%</span>`
        : '';
      const complete = isCategoryCompleteToday(state, c.id);
      const completeBadge = complete ? `<span class="cat-complete-badge">🌟コンプリート</span>` : '';
      const hpBadge = isHpEarningCategory_(c.id)
        ? `<span class="cat-hp-badge" title="10問連続正解でHPが増える単元">❤️HP UP</span>`
        : '';
      const newBadge = isRecentlyAdded(c.addedDate) ? `<span class="cat-new-badge">NEW🌟</span>` : '';
      return `
        <label class="settings-item${complete ? ' is-daily-complete' : ''}">
          <input type="checkbox" data-cat="${c.id}" ${(state.enabled.has(c.id) && !complete) ? 'checked' : ''} ${complete ? 'disabled' : ''} />
          <span class="cat-label">${c.label}</span>${newBadge}${hpBadge}${acc}${completeBadge}
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
        saveGameState(state);
      });
    });
  }

  function updateStats() {
    els.statTotal.textContent = state.total;
    els.statCorrect.textContent = state.correct;
    els.statRate.textContent = state.total === 0 ? '—' : `${Math.round((state.correct / state.total) * 100)}%`;
  }

  function pickGenerator() {
    if (state.worldBossActiveStage) {
      const session = loadSession();
      const ownGrade = session && session.grade;
      const eligible = CATEGORIES.filter(c => state.enabled.has(c.id) && isAtOrAboveOwnGrade(c.id, ownGrade));
      if (eligible.length > 0) return eligible[randInt(0, eligible.length - 1)];
    }
    const notComplete = c => !isCategoryCompleteToday(state, c.id);
    const pool = CATEGORIES.filter(c => state.enabled.has(c.id) && notComplete(c));
    const src = pool.length > 0 ? pool : CATEGORIES.filter(notComplete);
    const finalSrc = src.length > 0 ? src : CATEGORIES;
    return finalSrc[randInt(0, finalSrc.length - 1)];
  }
  // ボス戦に挑戦できるか判定。自分の学年以上の単元を10個以上ONにしていて、かつ
  // そのうち文章題(WORD_PROBLEM_CATEGORY_IDS)を最低1つ含む必要がある。
  function worldBossEligibility() {
    const session = loadSession();
    const ownGrade = session && session.grade;
    const eligibleEnabled = CATEGORIES.filter(c => state.enabled.has(c.id) && isAtOrAboveOwnGrade(c.id, ownGrade));
    const hasWordProblem = eligibleEnabled.some(c => WORD_PROBLEM_CATEGORY_IDS.indexOf(c.id) !== -1);
    const ok = eligibleEnabled.length >= WORLD_BOSS_MIN_ELIGIBLE_CATEGORIES && hasWordProblem;
    return { ok, count: eligibleEnabled.length, hasWordProblem, required: WORLD_BOSS_MIN_ELIGIBLE_CATEGORIES };
  }

  /* ---------- 間違い大魔王：間違えた問題の保存庫 ---------- */

  const WRONG_BANK_MAX_PER_CATEGORY = 20;
  function wrongBankKeyFor(q) {
    return q.questionHtml || q.question;
  }
  function recordWrongQuestion(q) {
    const catId = q.category;
    if (!state.wrongBank[catId]) state.wrongBank[catId] = [];
    const bank = state.wrongBank[catId];
    const key = wrongBankKeyFor(q);
    if (bank.some(b => wrongBankKeyFor(b) === key)) return;
    bank.push({ category: q.category, question: q.question, questionHtml: q.questionHtml, answer: q.answer, choices: q.choices.slice(), steps: q.steps });
    if (bank.length > WRONG_BANK_MAX_PER_CATEGORY) bank.shift();
  }
  function clearWrongQuestion(q) {
    const bank = state.wrongBank[q.category];
    if (!bank) return;
    const key = wrongBankKeyFor(q);
    const idx = bank.findIndex(b => wrongBankKeyFor(b) === key);
    if (idx !== -1) bank.splice(idx, 1);
  }
  // 選択中(有効)な単元の中から、間違えた問題をランダムに1つ選ぶ。無ければnull。
  function pickMistakeKingQuestion() {
    const pool = [];
    state.enabled.forEach(id => {
      const bank = state.wrongBank[id];
      if (bank && bank.length > 0) bank.forEach(snap => pool.push(snap));
    });
    if (pool.length === 0) return null;
    return JSON.parse(JSON.stringify(pool[randInt(0, pool.length - 1)]));
  }
  // ステージ4のボス戦は「間違えた問題が多く出る」仕様。出題範囲(自分の学年以上・
  // ON中)の間違えた問題の中からランダムに1つ選ぶ。無ければnull。
  const WORLD_BOSS_STAGE4_WRONG_BIAS = 0.5;
  function pickWorldBossWrongQuestion() {
    const session = loadSession();
    const ownGrade = session && session.grade;
    const pool = [];
    CATEGORIES.forEach(c => {
      if (!state.enabled.has(c.id) || !isAtOrAboveOwnGrade(c.id, ownGrade)) return;
      const bank = state.wrongBank[c.id];
      if (bank && bank.length > 0) bank.forEach(snap => pool.push(snap));
    });
    if (pool.length === 0) return null;
    return JSON.parse(JSON.stringify(pool[randInt(0, pool.length - 1)]));
  }

  /* ---------- 計算メモ（手書き） ---------- */

  let memoTool = 'pen';
  let memoDrawing = false;
  let memoLastX = 0;
  let memoLastY = 0;
  let memoSized = false;

  function memoCtx() {
    return els.memoCanvas.getContext && els.memoCanvas.getContext('2d');
  }
  function sizeMemoCanvasIfNeeded() {
    if (memoSized) return;
    const w = els.memoCanvas.clientWidth;
    const h = els.memoCanvas.clientHeight;
    if (!w || !h) return;
    els.memoCanvas.width = w;
    els.memoCanvas.height = h;
    memoSized = true;
  }
  function clearMemoCanvas() {
    const ctx = memoCtx();
    if (!ctx) return;
    ctx.clearRect(0, 0, els.memoCanvas.width, els.memoCanvas.height);
  }
  function memoPointFromEvent(ev) {
    const rect = els.memoCanvas.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }
  function setMemoTool(tool) {
    memoTool = tool;
    els.memoPenBtn.classList.toggle('is-active', tool === 'pen');
    els.memoEraserBtn.classList.toggle('is-active', tool === 'eraser');
  }
  function toggleMemo() {
    const isHidden = els.memoPanel.hasAttribute('hidden');
    if (!isHidden) { els.memoPanel.setAttribute('hidden', ''); return; }
    els.memoPanel.removeAttribute('hidden');
    sizeMemoCanvasIfNeeded();
  }

  els.memoToggle.addEventListener('click', toggleMemo);
  els.worldSpellBtn.addEventListener('click', castWorldSpell_);
  els.memoPenBtn.addEventListener('click', () => setMemoTool('pen'));
  els.memoEraserBtn.addEventListener('click', () => setMemoTool('eraser'));
  els.memoClearBtn.addEventListener('click', clearMemoCanvas);
  els.memoCanvas.addEventListener('pointerdown', (ev) => {
    sizeMemoCanvasIfNeeded();
    memoDrawing = true;
    const p = memoPointFromEvent(ev);
    memoLastX = p.x; memoLastY = p.y;
  });
  els.memoCanvas.addEventListener('pointermove', (ev) => {
    if (!memoDrawing) return;
    const ctx = memoCtx();
    if (!ctx) return;
    const p = memoPointFromEvent(ev);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (memoTool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = 20;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 3;
    }
    ctx.beginPath();
    ctx.moveTo(memoLastX, memoLastY);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    memoLastX = p.x; memoLastY = p.y;
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((evName) => {
    els.memoCanvas.addEventListener(evName, () => { memoDrawing = false; });
  });

  /* ---------- 理科モード ---------- */

  const SCIENCE_STREAK_MP = 10;
  const SCIENCE_EXP_PER_STREAK = 10;

  function pickScienceGenerator() {
    const allowed = SCIENCE_CATEGORIES.filter(c => !c.adminOnly || isAdminSession_());
    const pool = allowed.filter(c => state.enabledScience.has(c.id));
    const src = pool.length > 0 ? pool : allowed;
    return src[randInt(0, src.length - 1)];
  }

  function updateScienceHud() {
    const streak = state.scienceStreak || 0;
    const pct = Math.round((streak / 10) * 100);
    if (els.scienceStreakBarInner) els.scienceStreakBarInner.style.width = `${pct}%`;
    if (els.scienceStreakText) els.scienceStreakText.textContent = `${streak}/10`;
    if (els.scienceExpText) els.scienceExpText.textContent = state.scienceExp;
    if (els.statPoints) els.statPoints.textContent = state.points;
  }

  function nextScienceQuestion() {
    clearMemoCanvas();
    const cat = pickScienceGenerator();
    const q = cat.gen();
    state.current = q;
    state.answered = false;
    els.categoryTag.textContent = categoryLabel[q.category] || q.category;
    if (q.questionHtml) {
      els.questionText.innerHTML = q.questionHtml;
    } else {
      els.questionText.innerHTML = '';
      els.questionText.appendChild(document.createTextNode(q.question));
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
      btn.addEventListener('click', () => handleScienceAnswer(btn, choiceStr));
      els.choices.appendChild(btn);
    });
    updateScienceHud();
  }

  function handleScienceAnswer(btn, choiceStr) {
    if (state.answered) return;
    state.answered = true;
    state.total++;

    const q = state.current;
    const correctStr = String(q.answer);
    const isCorrect = choiceStr === correctStr;
    const catId = q.category;

    Array.from(els.choices.children).forEach(b => {
      b.disabled = true;
      if (b.dataset.value === correctStr) b.classList.add('is-correct');
      else if (b === btn) b.classList.add('is-incorrect');
    });

    const session = loadSession();
    if (session && session.id) logAnswer_({ id: session.id, category: catId, correct: isCorrect });

    if (!state.catStats[catId]) state.catStats[catId] = { total: 0, correct: 0 };
    state.catStats[catId].total++;

    const stepsHtml = q.steps && q.steps.length > 0
      ? `<div class="steps-box"><div class="steps-label">解説</div>${q.steps.map(s => `<span class="step-line">${stepToHtml(s)}</span>`).join('')}</div>`
      : '';

    let winHtml = '';
    if (isCorrect) {
      state.correct++;
      state.catStats[catId].correct++;
      state.scienceStreak = (state.scienceStreak || 0) + 1;
      if (state.scienceStreak >= 10) {
        const today = todayKey();
        if (state.pointsDate !== today) { state.pointsDate = today; state.pointsToday = 0; state.pointsTodayCalc = 0; state.pointsTodayWord = 0; }
        // 理科は文章題ではないので「計算問題」側の1日上限(50MP)を共有する。
        const pointsToAdd = Math.max(0, Math.min(SCIENCE_STREAK_MP, POINTS_DAILY_CAP_CALC - state.pointsTodayCalc));
        state.points += pointsToAdd;
        state.pointsToday += pointsToAdd;
        state.pointsTodayCalc += pointsToAdd;
        state.scienceExp += SCIENCE_EXP_PER_STREAK;
        state.scienceStreak = 0;
        // レベルは算数・数学の経験値と理科の経験値を合算して決まる(単一のLv.)。
        const newLevel = Math.min(MAX_LEVEL, Math.floor((state.exp + state.scienceExp) / EXP_PER_LEVEL) + 1);
        const leveledUp = newLevel > state.level;
        const worldDiceHtml = rollWorldCountryDice_(state.level, newLevel);
        state.level = newLevel;
        const lvlMsg = leveledUp ? `<span class="level-up-badge">LEVEL UP! Lv.${state.level}</span>` : '';
        winHtml = (pointsToAdd > 0
          ? `<div class="win-banner">${lvlMsg}🎉 10問連続正解！ +${pointsToAdd}MP、理科の経験値+${SCIENCE_EXP_PER_STREAK}！🎉</div>`
          : `<div class="win-banner">${lvlMsg}🎉 10問連続正解！ 理科の経験値+${SCIENCE_EXP_PER_STREAK}！（本日のMP上限に達しています）🎉</div>`) + worldDiceHtml;
      }
    } else {
      state.scienceStreak = 0;
      if (isHpDamageActive_() && hasSteelArmorCharge_()) {
        state.steelArmorCharges = (Number(state.steelArmorCharges) || 0) - 1;
        winHtml = state.steelArmorCharges > 0
          ? `<div class="enemy-quote-banner">🛡️ 鋼の鎧のおかげでダメージなし！（残り${state.steelArmorCharges}回）</div>`
          : `<div class="enemy-quote-banner">🛡️ 鋼の鎧のおかげでダメージなし！…鎧は壊れてなくなった。</div>`;
      } else if (isHpDamageActive_()) {
        state.hp = Math.max(0, (Number(state.hp) || 0) - HP_WRONG_ANSWER_PENALTY_);
        if (state.hp <= 0) {
          winHtml = `<div class="enemy-quote-banner">💥 HPが0になった…なんでも屋で薬草を買うか、ログアウトして再ログイン後に文章題を3問連続正解するまで、問題に答えられません。</div>`;
        }
      }
    }
    saveGameState(state);
    if (session && session.id) apiPost('syncPoints', buildProgressSyncPayload(session.id)).catch(function () { });

    els.feedback.innerHTML =
      (isCorrect
        ? `<span class="fb-result">正解！</span>`
        : `<span class="fb-result">不正解。正解は <strong>${stepToHtml(correctStr)}</strong> です。</span>`)
      + winHtml + stepsHtml;
    els.feedback.classList.add(isCorrect ? 'correct' : 'incorrect');
    els.nextBtn.disabled = false;
    showNextWorldDiceRoll_();
    updateStats();
    updateScienceHud();
    if (!els.settingsPanel.hasAttribute('hidden')) renderSettings();
  }

  // 理科モード関連のDOM要素は、ブラウザのキャッシュでindex.htmlとapp.jsの
  // バージョンがずれた場合(古いHTML+新しいJS)にnullになりうる。他の要素の
  // 初期化やイベント登録を巻き添えで止めてしまわないよう、必ずnullチェックしてから触る。
  function syncSubjectUi_() {
    if (els.mathArea) els.mathArea.hidden = state.subject === 'science';
    if (els.scienceArea) els.scienceArea.hidden = state.subject !== 'science';
    if (els.subjectToggle) els.subjectToggle.textContent = state.subject === 'science' ? '🧮計算' : '🔬理科';
  }

  // 算数・数学 ⇔ 理科の科目を切り替える。単元設定・出題プール・HUD表示が
  // 丸ごと入れ替わる。MPは共通プールのまま、経験値だけ理科専用に分ける。
  function toggleSubject() {
    state.subject = state.subject === 'science' ? 'math' : 'science';
    syncSubjectUi_();
    saveGameState(state);
    if (!els.settingsPanel.hasAttribute('hidden')) renderSettings();
    updateGameHud();
    updateScienceHud();
    nextQuestion();
  }

  function nextQuestion() {
    if (ensureNotHpGameOver_()) return;
    if (state.subject === 'science') { nextScienceQuestion(); return; }
    clearMemoCanvas();
    // ボン・ミスコの呪いにかかっている間も、間違い大魔王/算数デビルちゃんと同じ
    // 「間違えた問題の保存庫」から出題する。
    let mistakeQ = (state.rareType === 'mistakeking' || state.rareType === 'sansudevil' || state.cursed) ? pickMistakeKingQuestion() : null;
    if (!mistakeQ && state.worldBossActiveStage === 4 && Math.random() < WORLD_BOSS_STAGE4_WRONG_BIAS) {
      mistakeQ = pickWorldBossWrongQuestion();
    }
    const q = mistakeQ || (function () { const cat = pickGenerator(); return cat.gen(); })();
    state.current = q;
    state.answered = false;

    // スットボケAKRは文章題限定の独立したレア抽選。既存のレアキャラ抽選(rollRareType)や
    // 連続正解の仕組みとは一切連動しない、文章題1問ごとの別枠のお楽しみ要素。
    if (WORD_PROBLEM_CATEGORY_IDS.indexOf(q.category) !== -1) {
      q.sutobokeActive = Math.random() < SUTOBOKE_CHANCE;
    }

    els.categoryTag.textContent = categoryLabel[q.category];
    const sutobokeBannerHtml = q.sutobokeActive
      ? `<div class="enemy-quote-banner">✨${RARE_TYPES.sutoboke.name}出現！✨ ${RARE_TYPES.sutoboke.lines.appear}</div>`
      : '';
    if (q.questionHtml) {
      els.questionText.innerHTML = sutobokeBannerHtml + q.questionHtml;
    } else {
      els.questionText.innerHTML = sutobokeBannerHtml;
      const textNode = document.createTextNode(q.question);
      els.questionText.appendChild(textNode);
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
    const isBossFight = !!state.worldBossActiveStage;
    const bossSubIndex = isBossFight ? (state.worldBossSubIndex[state.worldBossActiveStage] || 0) : 0;
    // requiredStreakは「敵のHP」。通常の敵・レアキャラは1問1ダメージなので
    // 「あと何問」とHPが一致するが、ボス戦は周ごとのダメージ量(と魔法)で削る。
    const requiredStreak = isBossFight ? worldBossCurrentSubBoss(state.worldBossActiveStage, bossSubIndex).streak : (state.rareType === 'goumaji' ? GOUMAJI_REQUIRED_STREAK : 10);
    const hp = isBossFight
      ? worldBossRemainingHp_(state.worldBossActiveStage, bossSubIndex)
      : Math.max(0, requiredStreak - state.streak);
    const enemy = isBossFight ? worldBossEnemyDisplay(state.worldBossActiveStage, bossSubIndex) : currentEnemyDisplay(state);
    const isRare = !isBossFight && !!state.rareType;
    if (enemy.img) {
      els.enemyEmoji.innerHTML = `<img src="${enemy.img}" alt="${enemy.name}" class="enemy-char-img${isRare ? ' is-rare' : ''}">`;
    } else {
      els.enemyEmoji.textContent = enemy.emoji;
    }
    els.enemyEmoji.classList.toggle('is-rare', isRare);
    els.enemyName.textContent = (isBossFight ? '👑 ' : isRare ? '✨ ' : '') + enemy.name + (isBossFight ? ' 👑' : isRare ? ' ✨' : '');
    els.enemyName.classList.toggle('is-rare-name', isRare);
    if ((isRare || isBossFight) && enemy.lines && enemy.lines.appear) {
      els.enemySpeech.textContent = enemy.lines.appear;
      els.enemySpeech.hidden = false;
    } else {
      els.enemySpeech.hidden = true;
    }
    // ボス戦のときだけ、自分とボスのアバターを対戦画面のように並べて表示する。
    // 00001限定プレビュー中(本番許可が出るまでlap1のボス戦にも出さない)。
    if (els.battleVsRow) {
      if (isBossFight && isAdminSession_()) {
        els.battleVsRow.hidden = false;
        // 1箇所で例外が出てもHUD全体(この後のMP/HP/レベル表示)が巻き添えで
        // 止まらないよう、この区画だけは個別にガードする。
        try {
          if (els.battlePlayerAvatar) {
            els.battlePlayerAvatar.innerHTML = (state.avatar && (state.avatar.preset || AVATAR_HAIR_SAFE.length > 0)) ? avatarDisplayHtml_(state.avatar) : '🧑';
          }
          if (els.battleEnemyAvatar) {
            els.battleEnemyAvatar.innerHTML = enemy.img ? `<img src="${enemy.img}" alt="${enemy.name}">` : (enemy.emoji || '👑');
          }
          if (els.battleEnemyCaption) els.battleEnemyCaption.textContent = enemy.name;
          if (els.battlePlayerHpText) els.battlePlayerHpText.textContent = Number(state.hp) || 0;
          if (els.battleEnemyHpBarInner) {
            const battleHpPct = Math.round((hp / requiredStreak) * 100);
            els.battleEnemyHpBarInner.style.width = `${battleHpPct}%`;
            els.battleEnemyHpBarInner.style.background = hp <= requiredStreak * 0.3 ? '#ef4444' : hp <= requiredStreak * 0.6 ? '#f59e0b' : '#22c55e';
          }
          if (els.battleEnemyHpText) els.battleEnemyHpText.textContent = `${hp}/${requiredStreak}`;
        } catch (e) {
          reportAdminError_('VS表示', e);
        }
      } else {
        els.battleVsRow.hidden = true;
      }
    }
    const hpPct = Math.round((hp / requiredStreak) * 100);
    els.hpBarInner.style.width = `${hpPct}%`;
    els.hpBarInner.style.background = hp <= requiredStreak * 0.3 ? '#ef4444' : hp <= requiredStreak * 0.6 ? '#f59e0b' : '#22c55e';
    els.hpText.textContent = `${hp}/${requiredStreak}`;
    els.statPoints.textContent = state.points;
    els.statHp.textContent = Number(state.hp) || 0;
    els.statExpSub.textContent = `算数・数学の経験値${state.exp}、理科の経験値${state.scienceExp}（Lv.${state.level}）`;
    els.statLevel.textContent = state.level;
    els.expBarInner.style.width = `${(((state.exp + state.scienceExp) % EXP_PER_LEVEL) / EXP_PER_LEVEL) * 100}%`;
    updateUserAvatarBadge();
    updateWorldToggleVisibility();
    updateWorldSpellBtnVisibility_();
    renderWorldLaunchBanner();
    renderCurseBanner();
    renderHpRulesBanner_();
    renderMpCapBanner_();
  }

  // 世界旅行編：レベル100に到達した瞬間（再ログイン不要）にボタンを表示する。
  function updateWorldToggleVisibility() {
    var session = loadSession();
    var isGuestSession = !session || !session.id || session.guest;
    els.worldToggle.hidden = !!isGuestSession || state.level < 100;
  }

  function updateUserAvatarBadge() {
    if (state.avatar && (state.avatar.preset || AVATAR_HAIR_SAFE.length > 0)) {
      els.userAvatarBadge.innerHTML = avatarDisplayHtml_(state.avatar);
      els.userAvatarBadge.hidden = false;
    } else {
      els.userAvatarBadge.hidden = true;
      els.userAvatarBadge.innerHTML = '';
    }
  }

  function ensureDailyMission(grade) {
    if (!grade) return;
    const today = todayKey();
    if (state.missionDate !== today || state.missionGrade !== grade) {
      const cat = pickDailyMissionCategory(grade, today);
      state.missionDate = today;
      state.missionGrade = grade;
      state.missionCategoryId = cat.id;
      state.missionCorrect = 0;
      state.missionClaimed = false;
      saveGameState(state);
    }
  }

  // ログアウト時にアイテムが消える不具合のお詫び告知バナー。
  // サーバー側の300MP付与ウィンドウ(APOLOGY_BONUS_START〜END in Code.gs)と同じ期間だけ表示する。
  const APOLOGY_BANNER_START = '2026-07-30';
  const APOLOGY_BANNER_END = '2026-08-01';
  function isWithinApologyBannerWindow() {
    const today = todayKey();
    return today >= APOLOGY_BANNER_START && today <= APOLOGY_BANNER_END;
  }
  function renderApologyBanner() {
    const session = loadSession();
    els.apologyBanner.hidden = !(session && session.id && isWithinApologyBannerWindow());
  }

  // 1日限定の特別クイズ(週替わり重要ワード)の告知バナー。GAS側のWEEKLY_QUIZ_.special.activeDate
  // と同じ日付をここにも直書きしている(バナー表示はサーバー往復せずクライアント側の日付だけで
  // 判定する軽量な告知のため。実際の採点・回答済み判定はサーバー側が正とする)。
  const WEEKLY_QUIZ_SPECIAL_DATE_ = '2026-08-09';
  const WEEKLY_QUIZ_SPECIAL_BANNER_TEXT_ = '📅本日限定！「週替わり重要ワード」で特別クイズを開催中。2問連続正解で+30MP、間違えると-100MPです。';
  function renderWeeklyQuizSpecialBanner() {
    const session = loadSession();
    els.weeklyQuizSpecialBanner.hidden = !(session && session.id && todayKey() === WEEKLY_QUIZ_SPECIAL_DATE_);
    if (!els.weeklyQuizSpecialBanner.hidden) {
      els.weeklyQuizSpecialBannerText.textContent = WEEKLY_QUIZ_SPECIAL_BANNER_TEXT_;
    }
  }

  // 世界旅行編スタートの告知バナー。レベル100未満は「あと何レベル」、100以上は「挑戦しよう」の案内を出す。
  function renderWorldLaunchBanner() {
    const session = loadSession();
    if (!session || !session.id) { els.worldLaunchBanner.hidden = true; return; }
    els.worldLaunchBanner.hidden = false;
    if (state.level < 100) {
      els.worldLaunchText.textContent = `🌍 世界旅行編スタート！レベル100になったら世界一周に出発できるよ。あとレベル${100 - state.level}で出発だ！`;
    } else {
      els.worldLaunchText.textContent = '🌍 世界旅行編スタート！画面上の「🌍世界制覇」ボタンから世界一周に出発しよう！10レベルごとに1ヵ国ずつ制覇していくぞ。';
    }
  }

  function renderMissionBanner() {
    const session = loadSession();
    const grade = session && session.grade;
    if (!grade) { els.missionBanner.hidden = true; return; }
    ensureDailyMission(grade);
    els.missionBanner.hidden = false;
    const label = categoryLabel[state.missionCategoryId] || '';
    const shown = Math.min(state.missionCorrect, MISSION_TARGET);
    const pct = Math.round((shown / MISSION_TARGET) * 100);
    els.missionProgressBarInner.style.width = `${pct}%`;
    els.missionProgressText.textContent = `${shown}/${MISSION_TARGET}`;
    els.missionBanner.classList.toggle('is-complete', state.missionClaimed);
    if (state.missionClaimed) {
      els.missionDesc.textContent = `${label} をクリア済み！`;
      els.missionReward.textContent = `🎉 +${MISSION_REWARD_MP}MP ゲット！また明日ちょうせんしよう`;
    } else {
      els.missionDesc.textContent = `${label} を${MISSION_TARGET}問正解しよう！`;
      els.missionReward.textContent = `クリアすると +${MISSION_REWARD_MP}MP！`;
    }
  }

  function handleAnswer(btn, choiceStr) {
    if (state.subject === 'science') { handleScienceAnswer(btn, choiceStr); return; }
    if (state.answered) return;
    state.answered = true;
    state.total++;

    const correctStr = String(state.current.answer);
    const isCorrect = choiceStr === correctStr;
    const catId = state.current.category;
    // 同じ単元を1日90問解いたら、その単元はその日は出題対象から外す(DAILY_CATEGORY_COMPLETE_AT)。
    // state.enabled(生徒が選んでいる単元)自体は変更しない。翌日に日付が変わればまた解けるように
    // なるので、完了判定はカウンタから毎回その場で導出する(isCategoryCompleteToday)。
    if (isDailyCategoryLimitActive()) {
      ensureCategoryDailyReset(state);
      state.categoryDailyCounts[catId] = (state.categoryDailyCounts[catId] || 0) + 1;
    }
    const session = loadSession();
    const ownGrade = session && session.grade;
    const isWordProblem = WORD_PROBLEM_CATEGORY_IDS.indexOf(catId) !== -1;
    let missLineHtml = '';
    let sutobokeHtml = '';
    if (isCorrect) {
      state.correct++;
      clearWrongQuestion(state.current);
      if (state.streak === 0) state.streakAboveGrade = true;
      state.streakAboveGrade = state.streakAboveGrade && isAboveOwnGrade(catId, ownGrade);
      state.streak++;
      state.wrongStreak = 0;
      // ボス戦は1問正解するごとに累積でダメージを与える(不正解で連続正解数が
      // 0に戻っても、ここまで削ったボスのHPは戻らない)。
      if (state.worldBossActiveStage) {
        state.worldBossDamage = (Number(state.worldBossDamage) || 0) + worldBossDamagePerHit_();
      }
      // 魔法を詠唱した直後の問題に正解した場合、ここで初めてボスにダメージが入る
      // (詠唱時点では自分のHPが減るだけで、ボスへのダメージは保留されている)。
      if (state.worldBossActiveStage && state.worldPendingSpell) {
        const spellInfo = SPELLBOOK_INFO_[state.worldPendingSpell];
        state.worldPendingSpell = null;
        if (spellInfo) {
          state.worldBossDamage = (Number(state.worldBossDamage) || 0) + spellInfo.dmg;
          missLineHtml += `<div class="item-gain-banner">${spellInfo.emoji} ${spellInfo.label}が命中！ボスに${spellInfo.dmg}ダメージ！</div>`;
        }
      }
      // スットボケAKRは正解した問題ごとに(勝利のタイミングを待たず)その場で判定する。
      if (state.current.sutobokeActive) {
        const sutobokeTag = `<span class="rare-badge">✨${RARE_TYPES.sutoboke.name}出現！✨</span>`;
        if (!state.items.includes(SPECIAL_ITEM_SUTOBOKE_SWORD) && Math.random() < SUTOBOKE_ITEM_DROP_CHANCE) {
          state.items.push(SPECIAL_ITEM_SUTOBOKE_SWORD);
          sutobokeHtml = `<div class="enemy-quote-banner">${sutobokeTag}${RARE_TYPES.sutoboke.lines.defeat}</div><div class="item-gain-banner">⚔️ スペシャルアイテム「スットボケの剣」を手に入れた！⚔️</div>`;
        } else {
          sutobokeHtml = `<div class="enemy-quote-banner">${sutobokeTag}${RARE_TYPES.sutoboke.lines.defeat}</div>`;
        }
      }
      saveGameState(state);
    } else {
      const enemyBeforeMiss = currentEnemyDisplay(state);
      if (enemyBeforeMiss.lines && enemyBeforeMiss.lines.miss) {
        missLineHtml = `<div class="enemy-quote-banner">${enemyBeforeMiss.lines.miss}</div>`;
      }
      recordWrongQuestion(state.current);
      saveGameState(state);
      // すばやさの種：逃げるタイプのレアキャラに間違えて逃げられる直前、所持していれば
      // 自動で1個消費して逃走そのものを取り消す(rareTypeは変えず、そのまま再挑戦できる)。
      const speedSeedSaved = FLEEING_RARE_TYPES_.indexOf(state.rareType) !== -1 && (Number(state.speedSeedCount) || 0) > 0;
      if (speedSeedSaved) {
        state.speedSeedCount = (Number(state.speedSeedCount) || 0) - 1;
        missLineHtml += `<div class="enemy-quote-banner">🌱 すばやさの種のおかげで、${RARE_TYPES[state.rareType].name}に追いついた！もう1回挑戦できる！（残り${state.speedSeedCount}個）</div>`;
        saveGameState(state);
        if (session && session.id) apiPost('syncPoints', buildProgressSyncPayload(session.id)).catch(function () { });
      }
      const santaFled = !speedSeedSaved && state.rareType === 'santa';
      const nekodaFled = !speedSeedSaved && state.rareType === 'nekoda';
      const warisuFled = !speedSeedSaved && state.rareType === 'warisu';
      const inudaFled = !speedSeedSaved && state.rareType === 'inuda';
      const doubleOrHalfFled = !speedSeedSaved && state.rareType === 'doubleorhalf';
      const iineFled = !speedSeedSaved && state.rareType === 'iine';
      const soubusenFled = !speedSeedSaved && state.rareType === 'soubusen';
      const nattomanFled = !speedSeedSaved && state.rareType === 'nattoman';
      const fugoupakkunFled = !speedSeedSaved && state.rareType === 'fugoupakkun';
      const goumajiFled = !speedSeedSaved && state.rareType === 'goumaji';
      state.streak = 0;
      if (santaFled) {
        missLineHtml += `<div class="enemy-quote-banner">🎅💨 サンタAKRは逃げてしまった…</div>`;
        state.enemyIdx = (state.enemyIdx + 1) % ENEMIES.length;
        state.rareType = assignRareType(state);
        saveGameState(state);
      } else if (nekodaFled) {
        missLineHtml += `<div class="enemy-quote-banner">🐈💨 ネコダは逃げてしまった…</div>`;
        state.enemyIdx = (state.enemyIdx + 1) % ENEMIES.length;
        state.rareType = assignRareType(state);
        saveGameState(state);
      } else if (warisuFled) {
        missLineHtml += `<div class="enemy-quote-banner">🐿️💨 わりーリスは逃げてしまった…</div>`;
        state.enemyIdx = (state.enemyIdx + 1) % ENEMIES.length;
        state.rareType = assignRareType(state);
        saveGameState(state);
      } else if (inudaFled) {
        missLineHtml += `<div class="enemy-quote-banner">🐶💨 イヌダは逃げてしまった…</div>`;
        state.enemyIdx = (state.enemyIdx + 1) % ENEMIES.length;
        state.rareType = assignRareType(state);
        saveGameState(state);
      } else if (doubleOrHalfFled) {
        // 「本日のMPが半分に」という演出どおり、減らすのはあくまで今日稼いだ分
        // (pointsToday)だけにする。以前はstate.points(累計MP)も一緒に減らしてしまっており、
        // 生徒の累計MPが意図せず目減りするバグになっていた。
        const snapshot = Number(state.doubleOrHalfSnapshot) || 0;
        const halfAmount = Math.floor(snapshot / 2);
        state.pointsToday = Math.max(0, state.pointsToday - halfAmount);
        missLineHtml += `<div class="enemy-quote-banner">💦 ダブルorハーフは逃げてしまった…本日のMPが半分に（-${halfAmount}MP）</div>`;
        state.enemyIdx = (state.enemyIdx + 1) % ENEMIES.length;
        state.rareType = assignRareType(state);
        saveGameState(state);
      } else if (iineFled) {
        missLineHtml += `<div class="enemy-quote-banner">👍💨 いいねAKRは逃げてしまった…</div>`;
        state.enemyIdx = (state.enemyIdx + 1) % ENEMIES.length;
        state.rareType = assignRareType(state);
        saveGameState(state);
      } else if (soubusenFled) {
        missLineHtml += `<div class="enemy-quote-banner">💨 ゆうかんそうぶせん戦士は撤退してしまった…</div>`;
        state.enemyIdx = (state.enemyIdx + 1) % ENEMIES.length;
        state.rareType = assignRareType(state);
        saveGameState(state);
      } else if (nattomanFled) {
        missLineHtml += `<div class="enemy-quote-banner">🫘💨 ナットマンは去ってしまった…</div>`;
        state.enemyIdx = (state.enemyIdx + 1) % ENEMIES.length;
        state.rareType = assignRareType(state);
        saveGameState(state);
      } else if (fugoupakkunFled) {
        missLineHtml += `<div class="enemy-quote-banner">💨 不等号パックンは逃げてしまった…</div>`;
        state.enemyIdx = (state.enemyIdx + 1) % ENEMIES.length;
        state.rareType = assignRareType(state);
        saveGameState(state);
      } else if (goumajiFled) {
        missLineHtml += `<div class="enemy-quote-banner">💨 ごーまじは逃げてしまった…</div>`;
        state.enemyIdx = (state.enemyIdx + 1) % ENEMIES.length;
        state.rareType = assignRareType(state);
        saveGameState(state);
      }
      // ボン・ミスコの呪い：通常の敵「ボンミスコ」との対決で不正解になると呪いをかけ
      // られる。呪われている間は間違えた問題ばかり出題され(nextQuestion側)、10問連続
      // 正解のMP報酬も上限5に制限される(handleAnswerのisCorrect側)。なんでも屋で
      // AKRの祈りを受けるまで解除されない。
      if (!state.worldBossActiveStage && enemyBeforeMiss.name === 'ボンミスコ' && !state.cursed) {
        state.cursed = true;
        missLineHtml += `<div class="enemy-quote-banner">😈 ボン・ミスコの呪いをかけられた…！なんでも屋でAKRの祈りを受けるまで、間違えた問題ばかり出題され、MP獲得も${BONMISUKO_CURSE_MP_CAP}に制限されてしまう…</div>`;
        saveGameState(state);
      }
      // 天使の涙：通常のレア抽選とは独立した専用トリガー。ボス戦以外で2問連続不正解に
      // なった瞬間、その時点の敵(通常の敵・レアキャラ問わず、上のfled処理で入れ替わった
      // 後の敵も含む)を天使の涙に変える。間違えても逃げないので、ここでの判定は
      // 「まだ天使の涙になっていない時だけ」でよい。
      state.wrongStreak = (state.wrongStreak || 0) + 1;
      if (state.wrongStreak >= 2 && !state.worldBossActiveStage && state.rareType !== 'angelTears') {
        state.rareType = 'angelTears';
        missLineHtml += `<div class="enemy-quote-banner">${RARE_TYPES.angelTears.lines.appear}</div>`;
        state.wrongStreak = 0;
        saveGameState(state);
      }
      // ボス戦中の不正解は、ステージに応じた量だけHPが減る。HPが0になったら
      // ボス戦は最初(0/30)からやり直しになる。
      if (state.worldBossActiveStage) {
        const bossMissDisplay = worldBossEnemyDisplay(state.worldBossActiveStage, state.worldBossSubIndex[state.worldBossActiveStage] || 0);
        const bossMissQuoteHtml = (bossMissDisplay.lines && bossMissDisplay.lines.miss) ? `<div class="enemy-quote-banner">${bossMissDisplay.lines.miss}</div>` : '';
        // 魔法を詠唱した直後の問題を間違えると、ダメージは入らずボスにかわされる
        // (詠唱時のHP減少はそのまま。ここではダメージが不発になったことだけ伝える)。
        if (state.worldPendingSpell) {
          const dodgedSpellInfo = SPELLBOOK_INFO_[state.worldPendingSpell];
          state.worldPendingSpell = null;
          if (dodgedSpellInfo) {
            missLineHtml += `<div class="enemy-quote-banner">💨 ${dodgedSpellInfo.label}はボスにかわされた…！攻撃は当たらなかった。</div>`;
          }
        }
        let penalty = worldBossHpPenalty(state.worldBossActiveStage);
        let ironWallHtml = '';
        // 指輪の護り：銀・金・虹色の指輪を持っていれば、鉄壁の盾より優先して
        // ダメージを完全に防ぐ(指輪が使われた場合、鉄壁の盾は消費しない)。
        const ringShieldResult = consumeRingShieldIfAvailable_();
        if (ringShieldResult) {
          penalty = 0;
          ironWallHtml = ringShieldResult.html;
        } else if ((Number(state.ironWallCharges) || 0) > 0) {
          // 鉄壁の盾：ボス戦の不正解のたびに、残りチャージがあれば自動で1個消費して
          // このミスのダメージを半分にする(最大3チャージ、0回で「壊れて消える」)。
          penalty = Math.floor(penalty / 2);
          state.ironWallCharges = (Number(state.ironWallCharges) || 0) - 1;
          ironWallHtml = state.ironWallCharges > 0
            ? `<div class="enemy-quote-banner">🛡️ 鉄壁の盾のおかげでダメージ半減！（残り${state.ironWallCharges}回）</div>`
            : `<div class="enemy-quote-banner">🛡️ 鉄壁の盾のおかげでダメージ半減！…盾は壊れてなくなった。</div>`;
        }
        state.hp = Math.max(0, (Number(state.hp) || 0) - penalty);
        if (state.hp <= 0) {
          missLineHtml += `${bossMissQuoteHtml}${ironWallHtml}<div class="enemy-quote-banner">💥 HPが0になってしまった…ボス戦は最初からやり直しだ！</div>`;
          state.worldBossActiveStage = null;
          state.worldPendingSpell = null;
          state.worldBossDamage = 0;
        } else {
          missLineHtml += `${bossMissQuoteHtml}${ironWallHtml}<div class="enemy-quote-banner">💥 ボスの反撃！HPが${penalty}減った！（残りHP: ${state.hp}）</div>`;
        }
        saveGameState(state);
        // 指輪をシールドとして消費した場合、個数の減少をすぐサーバーに反映しておく
        // (次回ログイン時に古いキャッシュへ巻き戻らないようにするため)。
        if (ringShieldResult && session && session.id) {
          apiPost('syncPoints', buildProgressSyncPayload(session.id)).catch(function () { });
        }
      } else if (state.rareType === 'gyoshi' && hasSteelArmorCharge_()) {
        state.steelArmorCharges = (Number(state.steelArmorCharges) || 0) - 1;
        missLineHtml += state.steelArmorCharges > 0
          ? `<div class="enemy-quote-banner">🛡️ 鋼の鎧のおかげでダメージなし！（残り${state.steelArmorCharges}回）</div>`
          : `<div class="enemy-quote-banner">🛡️ 鋼の鎧のおかげでダメージなし！…鎧は壊れてなくなった。</div>`;
        saveGameState(state);
      } else if (state.rareType === 'gyoshi') {
        // 漁師AKRは他のレアキャラと違い逃げず、その場に居座って不正解のたびにHPを
        // 2つ奪ってくる特別なレアキャラ(isHpDamageActive_の日付ゲートとは無関係に、
        // このキャラ固有のルールとして常に有効)。
        state.hp = Math.max(0, (Number(state.hp) || 0) - GYOSHI_HP_STEAL_);
        missLineHtml += `<div class="enemy-quote-banner">🎣 漁師AKRに、HPを${GYOSHI_HP_STEAL_}つ奪われた！（残りHP: ${state.hp}）</div>`;
        if (state.hp <= 0) {
          missLineHtml += `<div class="enemy-quote-banner">💥 HPが0になった…なんでも屋で薬草を買うか、ログアウトして再ログイン後に文章題を3問連続正解するまで、問題に答えられません。</div>`;
        }
        saveGameState(state);
      } else if (isHpDamageActive_() && hasSteelArmorCharge_()) {
        state.steelArmorCharges = (Number(state.steelArmorCharges) || 0) - 1;
        missLineHtml += state.steelArmorCharges > 0
          ? `<div class="enemy-quote-banner">🛡️ 鋼の鎧のおかげでダメージなし！（残り${state.steelArmorCharges}回）</div>`
          : `<div class="enemy-quote-banner">🛡️ 鋼の鎧のおかげでダメージなし！…鎧は壊れてなくなった。</div>`;
        saveGameState(state);
      } else if (isHpDamageActive_()) {
        // ボス戦以外の不正解は、8/13からHPが1減る。0になると、なんでも屋で回復するか
        // 再ログイン時の文章題3問連続正解(HP+3)をするまで、問題に答えられなくなる。
        state.hp = Math.max(0, (Number(state.hp) || 0) - HP_WRONG_ANSWER_PENALTY_);
        if (state.hp <= 0) {
          missLineHtml += `<div class="enemy-quote-banner">💥 HPが0になった…なんでも屋で薬草を買うか、ログアウトして再ログイン後に文章題を3問連続正解するまで、問題に答えられません。</div>`;
        }
        saveGameState(state);
      }
    }

    if (!state.catStats[catId]) state.catStats[catId] = { total: 0, correct: 0 };
    state.catStats[catId].total++;
    if (isCorrect) state.catStats[catId].correct++;

    Array.from(els.choices.children).forEach(b => {
      b.disabled = true;
      if (b.dataset.value === correctStr) b.classList.add('is-correct');
      else if (b === btn) b.classList.add('is-incorrect');
    });

    if (session && session.id) {
      logAnswer_({ id: session.id, category: catId, correct: isCorrect });
    }

    const q = state.current;
    const stepsHtml = q.steps && q.steps.length > 0
      ? `<div class="steps-box"><div class="steps-label">途中式</div>${q.steps.map(s => `<span class="step-line">${stepToHtml(s)}</span>`).join('')}</div>`
      : '';

    let winHtml = '';
    const bossSubIndexForWin = state.worldBossActiveStage ? (state.worldBossSubIndex[state.worldBossActiveStage] || 0) : 0;
    const requiredStreak = state.worldBossActiveStage ? worldBossCurrentSubBoss(state.worldBossActiveStage, bossSubIndexForWin).streak : (state.rareType === 'goumaji' ? GOUMAJI_REQUIRED_STREAK : 10);
    if (isCorrect && state.worldBossActiveStage && worldBossRemainingHp_(state.worldBossActiveStage, bossSubIndexForWin) <= 0) {
      // 世界一周のボス撃破：MP/経験値の通常報酬ではなく、ボスが仲間になる特別演出。
      // ステージ4のように複数体を順番に倒すステージでは、途中のボスを倒しても
      // ステージ自体はまだクリアにならず、そのまま次のボスへ続く。
      // (共通処理はfinishWorldBossWin_に切り出し、魔法でトドメを刺した場合の
      // castWorldSpell_からも呼べるようにしている)
      winHtml = finishWorldBossWin_(state.worldBossActiveStage, bossSubIndexForWin);
    } else if (isCorrect && state.streak >= requiredStreak) {
      const today = todayKey();
      if (state.pointsDate !== today) { state.pointsDate = today; state.pointsToday = 0; state.pointsTodayCalc = 0; state.pointsTodayWord = 0; }
      const bonusEligible = state.streakAboveGrade;
      const wasRareType = state.rareType;
      const rareMpBonus = wasRareType === 'zombie' ? RARE_BONUS_MP : wasRareType === 'smile' ? SMILE_BONUS_MP : wasRareType === 'warisu' ? WARISU_BONUS_MP : wasRareType === 'mistakeking' ? MISTAKEKING_BONUS_MP : wasRareType === 'sansudevil' ? SANSUDEVIL_BONUS_MP : wasRareType === 'angelTears' ? ANGELTEARS_BONUS_MP : wasRareType === 'inuda' ? INUDA_BONUS_MP : wasRareType === 'soubusen' ? SOUBUSEN_BONUS_MP : wasRareType === 'nattoman' ? NATTOMAN_BONUS_MP : wasRareType === 'fugoupakkun' ? FUGOUPAKKUN_BONUS_MP : wasRareType === 'gyoshi' ? GYOSHI_BONUS_MP : 0;
      // ごーまじは20問連続正解という高いハードルの代わりに、通常の(5 or 10)+ボーナス
      // 積み上げ方式ではなく、固定30MPを報酬とする。文章題カテゴリは学年に関わらず
      // 固定50MP。計算問題は10問正解で5MP(学年より上の単元に挑戦した
      // ボーナスは10MPで、2倍の比率は維持)。
      const rawBasePoints = wasRareType === 'goumaji' ? GOUMAJI_BONUS_MP : isWordProblem ? WORD_PROBLEM_FIXED_MP : (bonusEligible ? 10 : 5) + rareMpBonus;
      // ボン・ミスコの呪いにかかっている間は、どんな組み合わせでもMP報酬が上限
      // BONMISUKO_CURSE_MP_CAPに制限される。
      const basePoints = state.cursed ? Math.min(rawBasePoints, BONMISUKO_CURSE_MP_CAP) : rawBasePoints;
      // 文章題と計算問題(理科含む)で、1日のMP上限を別々の50MPずつに分けて管理する。
      const dailyCapForThis = isWordProblem ? POINTS_DAILY_CAP_WORD : POINTS_DAILY_CAP_CALC;
      const todayBucketForThis = isWordProblem ? state.pointsTodayWord : state.pointsTodayCalc;
      const pointsToAdd = Math.max(0, Math.min(basePoints, dailyCapForThis - todayBucketForThis));
      state.points += pointsToAdd;
      state.pointsToday += pointsToAdd;
      if (isWordProblem) state.pointsTodayWord += pointsToAdd; else state.pointsTodayCalc += pointsToAdd;
      let doubleGainedHtml = '';
      if (wasRareType === 'doubleorhalf') {
        // 「本日のMPが2倍」というボーナスの性質上、通常の1日の上限(POINTS_DAILY_CAP)で
        // 頭打ちにしてしまうと、既に上限に達している時は+0になり「2倍」が成立しなく
        // なってしまう(ハーフ側の減算は上限を経由せず無条件に効くのと非対称だった)。
        // そのため、このボーナスだけは1日の上限を経由せず、そのまま加算する。
        const snapshot = Number(state.doubleOrHalfSnapshot) || 0;
        const doubleBonusToAdd = Math.max(0, snapshot);
        state.points += doubleBonusToAdd;
        state.pointsToday += doubleBonusToAdd;
        doubleGainedHtml = `<div class="item-gain-banner">💰 ダブル成功！本日のMPが2倍に（+${doubleBonusToAdd}MP）💰</div>`;
      }
      state.exp += 10;
      // レベルは算数・数学の経験値(exp)と理科の経験値(scienceExp)を合算して決まる。
      // 経験値そのものは科目ごとに別集計だが、レベルは1つに統一する。
      const newLevel = Math.min(MAX_LEVEL, Math.floor((state.exp + state.scienceExp) / EXP_PER_LEVEL) + 1);
      const leveledUp = newLevel > state.level;
      const prevWorldCount = worldCountForLevel(state.level);
      const worldDiceHtml = rollWorldCountryDice_(state.level, newLevel);
      state.level = newLevel;
      state.streak = 0;
      state.streakAboveGrade = true;

      let hpBonusHtml = '';
      if (isHpEarningCategory_(catId)) {
        const hpGain = catId === 'circleSector6' ? CIRCLE_SECTOR6_FIXED_HP_GAIN : wordProblemHpGainForGrade_(ownGrade);
        state.hp = (Number(state.hp) || 0) + hpGain;
        hpBonusHtml = ` +${hpGain}HP`;
      }

      let itemGainedHtml = '';
      if (wasRareType === 'santa' && !state.items.includes(SPECIAL_ITEM_FLAME_SWORD)) {
        state.items.push(SPECIAL_ITEM_FLAME_SWORD);
        itemGainedHtml = '<div class="item-gain-banner">🔥⚔️ スペシャルアイテム「炎の剣」を手に入れた！🔥⚔️</div>';
      } else if (wasRareType === 'smile' && !state.items.includes(SPECIAL_ITEM_SMILE_MASK)) {
        state.items.push(SPECIAL_ITEM_SMILE_MASK);
        itemGainedHtml = '<div class="item-gain-banner">😊🎭 スペシャルアイテム「ほほえみの仮面」を手に入れた！😊🎭</div>';
      } else if (wasRareType === 'nekoda' && !state.items.includes(SPECIAL_ITEM_CAT_PENCIL)) {
        state.items.push(SPECIAL_ITEM_CAT_PENCIL);
        itemGainedHtml = '<div class="item-gain-banner">🐈✏️ スペシャルアイテム「ネコのシャーペン」を手に入れた！🐈✏️</div>';
      } else if (wasRareType === 'iine' && !state.items.includes(SPECIAL_ITEM_ZANTETSUKEN) && Math.random() < IINE_ITEM_DROP_CHANCE) {
        state.items.push(SPECIAL_ITEM_ZANTETSUKEN);
        itemGainedHtml = '<div class="item-gain-banner">⚔️ スペシャルアイテム「斬鉄剣」を手に入れた！⚔️</div>';
      } else if (wasRareType === 'nattoman' && !state.items.includes(SPECIAL_ITEM_NATTO_GOKORO)) {
        state.items.push(SPECIAL_ITEM_NATTO_GOKORO);
        itemGainedHtml = '<div class="item-gain-banner">🧑‍🍳 スペシャルアイテム「納豆心」を手に入れた！🧑‍🍳</div>';
      } else if (wasRareType === 'goumaji' && !state.items.includes(SPECIAL_ITEM_GOUMAJI_MEDAMAJIKARA) && Math.random() < GOUMAJI_ITEM_DROP_CHANCE) {
        state.items.push(SPECIAL_ITEM_GOUMAJI_MEDAMAJIKARA);
        itemGainedHtml = '<div class="item-gain-banner">👀 スペシャルアイテム「ゴーマジの目力」を手に入れた！👀</div>';
      } else if (wasRareType === 'zombie' && !state.items.includes(SPECIAL_ITEM_AKR_STAFF)) {
        state.items.push(SPECIAL_ITEM_AKR_STAFF);
        itemGainedHtml = '<div class="item-gain-banner">🌀 スペシャルアイテム「AKRの杖」を手に入れた！🌀</div>';
      }

      let collectionGainedHtml = '';
      if (wasRareType && RARE_COLLECTIBLE_IDS.indexOf(wasRareType) !== -1) {
        state.rareDefeats[wasRareType] = (state.rareDefeats[wasRareType] || 0) + 1;
        if (state.rareDefeats[wasRareType] >= RARE_COLLECTION_THRESHOLD && state.rareCollected.indexOf(wasRareType) === -1) {
          state.rareCollected.push(wasRareType);
          collectionGainedHtml = `<div class="item-gain-banner">🎖️ レアキャラ「${RARE_TYPES[wasRareType].name}」を${RARE_COLLECTION_THRESHOLD}回撃破してコレクションにゲットした！🎖️</div>`;
        }
      } else if (wasRareType === 'thinker' && state.thinkerMilestone === 1000 && state.rareCollected.indexOf('thinker') === -1) {
        // 考えるAKRはレベル100では記念撃破のみだが、レベル1000で再登場したときに倒すとコレクションにゲットできる
        state.rareCollected.push('thinker');
        collectionGainedHtml = `<div class="item-gain-banner">🎖️ レアキャラ「${RARE_TYPES.thinker.name}」をコレクションにゲットした！🎖️</div>`;
      }

      // 宝箱ドロップ：レアキャラ撃破時のみ、その日の確率(イベントデーは高確率)で、
      // その時解いていた問題の学年に応じたティアの宝箱を1個手に入れる。
      let treasureChestGainedHtml = '';
      if (wasRareType && isTreasureChestActive_() && Math.random() < treasureChestDropChance_()) {
        const treasureTier = treasureTierForGrade_(categoryGrade[catId]);
        if (treasureTier) {
          const chestKey = treasureItemKey_('chest', treasureTier);
          state.treasureItems = state.treasureItems || {};
          state.treasureItems[chestKey] = (Number(state.treasureItems[chestKey]) || 0) + 1;
          treasureChestGainedHtml = `<div class="item-gain-banner">${TREASURE_TIER_EMOJI_[treasureTier]} ${TREASURE_TIER_LABEL_[treasureTier]}の宝箱を見つけた！（なんでも屋で${TREASURE_TIER_LABEL_[treasureTier]}の鍵を買うと開けられる）</div>`;
          if (session && session.id) apiPost('syncPoints', buildProgressSyncPayload(session.id)).catch(function () { });
        }
      }

      const prevPrefectureCount = state.prefectureCount;
      state.prefectureCount = Math.min(47, state.prefectureCount + 1);
      const newlyUnlockedPrefecture = (state.prefectureCount > prevPrefectureCount && PREFECTURE_DATA.length > 0) ? PREFECTURE_DATA[state.prefectureCount - 1] : null;

      const newWorldCount = worldCountForLevel(state.level);
      const newlyUnlockedCountry = (newWorldCount > prevWorldCount && Array.isArray(WORLD_DATA) && WORLD_DATA.length > 0) ? WORLD_DATA[newWorldCount - 1] : null;

      state.enemyIdx = (state.enemyIdx + 1) % ENEMIES.length;
      state.thinkerMilestone = null;
      if (leveledUp && newLevel === 100) { state.rareType = 'thinker'; state.thinkerMilestone = 100; }
      else if (leveledUp && newLevel === 1000) { state.rareType = 'thinker'; state.thinkerMilestone = 1000; }
      else if (leveledUp && newLevel === 400) { state.rareType = 'hikizaru'; }
      else if (leveledUp && newLevel % 50 === 0) { state.rareType = warlordForLevel(newLevel); }
      else { state.rareType = assignRareType(state); }
      saveGameState(state);
      if (session && session.id) {
        debouncedSyncPoints_(session.id, function (res) {
          if (res && res.bonusAwarded > 0) {
            state.points += res.bonusAwarded;
            saveGameState(state);
            updateGameHud();
            if (res.prefectureBonusAwarded > 0) window.alert(`🎉 都道府県制覇ボーナス！+${res.prefectureBonusAwarded}MP 🎉`);
            if (res.continentBonusAwarded > 0) window.alert(`🌏 大陸制覇ボーナス！+${res.continentBonusAwarded}MP 🌏`);
          }
        });
      }
      let prefectureGainedHtml = '';
      if (newlyUnlockedPrefecture) {
        prefectureGainedHtml = `<div class="prefecture-gain-banner">🗾「${newlyUnlockedPrefecture.name}」を制覇！（${state.prefectureCount}/47）<br><span class="prefecture-trivia">${newlyUnlockedPrefecture.trivia}</span></div>`;
        if (state.prefectureCount === 47) {
          prefectureGainedHtml += `<div class="prefecture-complete-banner">🎉 47都道府県制覇達成！おめでとう！🎉</div>`;
        }
      }
      let worldGainedHtml = '';
      if (newlyUnlockedCountry) {
        worldGainedHtml = `<div class="world-gain-banner">🌍「${newlyUnlockedCountry.name}」を制覇！（${newWorldCount}/${WORLD_DATA.length}）<br><span class="world-funny-moment">${funnyMomentForCountry(newlyUnlockedCountry)}</span><br><span class="world-trivia">${newlyUnlockedCountry.trivia}</span></div>`;
        if (newWorldCount === WORLD_DATA.length) {
          worldGainedHtml += `<div class="prefecture-complete-banner">🎉 世界${WORLD_DATA.length}ヵ国制覇達成！おめでとう！🎉</div>`;
        }
      } else if (state.level >= 100 && Math.random() < WORLD_SENSEI_RANDOM_CHANCE) {
        worldGainedHtml = `<div class="world-gain-banner">${pickWorldSenseiLine()}</div>`;
      }
      const prevEnemy = wasRareType ? RARE_TYPES[wasRareType] : ENEMIES[(state.enemyIdx - 1 + ENEMIES.length) % ENEMIES.length];
      const nextEnemy = currentEnemyDisplay(state);
      const lvlMsg = leveledUp ? `<span class="level-up-badge">LEVEL UP! Lv.${state.level}</span>` : '';
      const eIcon = (e) => e.img ? `<img src="${e.img}" class="enemy-char-img-sm" alt="">` : e.emoji;
      const bonusTag = bonusEligible ? '（学年より上の単元に挑戦！）' : '';
      const rareTag = wasRareType === 'zombie' ? ('<span class="rare-badge">✨レア撃破！+' + RARE_BONUS_MP + 'MP✨</span>')
        : wasRareType === 'santa' ? '<span class="rare-badge">🎅レア撃破！🎅</span>'
        : wasRareType === 'thinker' ? '<span class="rare-badge">🤔レベル100記念撃破！🤔</span>'
        : wasRareType === 'smile' ? ('<span class="rare-badge">😊レア撃破！+' + SMILE_BONUS_MP + 'MP✨</span>')
        : wasRareType === 'nekoda' ? '<span class="rare-badge">🐈レア撃破！🐈</span>'
        : wasRareType === 'warisu' ? ('<span class="rare-badge">🐿️レア撃破！+' + WARISU_BONUS_MP + 'MP✨</span>')
        : wasRareType === 'inuda' ? ('<span class="rare-badge">🐶レア撃破！+' + INUDA_BONUS_MP + 'MP✨</span>')
        : wasRareType === 'iine' ? '<span class="rare-badge">👍レア撃破！👍</span>'
        : wasRareType === 'soubusen' ? ('<span class="rare-badge">✨レア撃破！+' + SOUBUSEN_BONUS_MP + 'MP✨</span>')
        : wasRareType === 'nattoman' ? ('<span class="rare-badge">🫘レア撃破！+' + NATTOMAN_BONUS_MP + 'MP✨</span>')
        : wasRareType === 'fugoupakkun' ? ('<span class="rare-badge">🔢レア撃破！+' + FUGOUPAKKUN_BONUS_MP + 'MP✨</span>')
        : wasRareType === 'hikizaru' ? '<span class="rare-badge">🐒レベル400記念撃破！🐒</span>'
        : (wasRareType && RARE_TYPES[wasRareType] && RARE_TYPES[wasRareType].isWarlord) ? ('<span class="rare-badge">⚔️' + RARE_TYPES[wasRareType].name + '撃破！⚔️</span>')
        : '';
      const defeatQuoteHtml = (wasRareType && RARE_TYPES[wasRareType].lines && RARE_TYPES[wasRareType].lines.defeat)
        ? `<div class="enemy-quote-banner">${RARE_TYPES[wasRareType].lines.defeat}</div>` : '';
      const rareNextTag = state.rareType ? `<span class="rare-badge">✨${RARE_TYPES[state.rareType].name}出現！✨</span>` : '';
      const ptText = pointsToAdd > 0 ? `+${pointsToAdd}MP${bonusTag} ` : '(本日のMP上限に到達) ';
      winHtml = `<div class="win-banner">${lvlMsg}${rareTag}${eIcon(prevEnemy)} 倒した！ ${ptText}+10exp${hpBonusHtml}<br>次の敵: ${eIcon(nextEnemy)} ${nextEnemy.name}${rareNextTag}</div>${defeatQuoteHtml}${itemGainedHtml}${doubleGainedHtml}${collectionGainedHtml}${treasureChestGainedHtml}${prefectureGainedHtml}${worldDiceHtml}${worldGainedHtml}`;
    }

    let missionHtml = '';
    if (isCorrect && state.missionCategoryId && catId === state.missionCategoryId && !state.missionClaimed) {
      state.missionCorrect = Math.min(MISSION_TARGET, state.missionCorrect + 1);
      if (state.missionCorrect >= MISSION_TARGET) {
        state.missionClaimed = true;
        state.points += MISSION_REWARD_MP;
        missionHtml = `<div class="win-banner">🎯 今日のミッション達成！ +${MISSION_REWARD_MP}MP 🎉</div>`;
        if (session && session.id) {
          apiPost('syncPoints', buildProgressSyncPayload(session.id)).catch(function () { });
        }
      }
      saveGameState(state);
    }

    const streakHtml = state.streak >= 3
      ? `<span class="streak-badge">${state.streak}問連続正解</span>`
      : '';

    els.feedback.innerHTML =
      (isCorrect
        ? `<span class="fb-result">正解！${streakHtml}</span>`
        : `<span class="fb-result">不正解。正解は <strong>${stepToHtml(correctStr)}</strong> です。</span>`)
      + missLineHtml + sutobokeHtml + winHtml + missionHtml + stepsHtml;
    els.feedback.classList.add(isCorrect ? 'correct' : 'incorrect');

    els.nextBtn.disabled = false;
    showNextWorldDiceRoll_();
    updateStats();
    updateGameHud();
    renderMissionBanner();
    if (!els.settingsPanel.hasAttribute('hidden')) renderSettings();
    if (!els.worldPanel.hasAttribute('hidden')) renderWorldPanel();
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
    saveGameState(state);
  });
  document.getElementById('deselectAllBtn').addEventListener('click', () => {
    state.enabled.clear();
    renderSettings();
    saveGameState(state);
  });

  els.nextBtn.addEventListener('click', nextQuestion);
  els.resetBtn.addEventListener('click', resetStats);
  els.settingsToggle.addEventListener('click', () => {
    const isHidden = els.settingsPanel.hasAttribute('hidden');
    if (isHidden) { els.settingsPanel.removeAttribute('hidden'); renderSettings(); }
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

  // 世界一周の最終ボスを倒すと称号【数学の神】が名前の前に付く(一度手に入れたら
  // 2周目以降も失われない)。
  function renderUserGreeting(name) {
    els.userName.textContent = (state.mathGodTitleEarned ? '【数学の神】' : '') + name;
  }

  /* ---------- HPダメージ制・ゲームオーバー(8/13から) ----------
     問題を間違えるとHPが1減る(ボス戦をのぞく。ボス戦は既存の専用ペナルティのまま)。
     HPが0になると、ログアウトして再ログイン後に文章題3問連続正解(HP+3)するか、
     なんでも屋で薬草を購入してHPを回復するまで、問題に答えられなくなる。
     8/12から予告バナーを出し、8/13に適用開始、8/18までバナーを表示する。 */
  var HP_DAMAGE_START_ = '2026-08-13';
  var HP_RULES_BANNER_START_ = '2026-08-12';
  var HP_RULES_BANNER_END_ = '2026-08-18';
  var HP_WRONG_ANSWER_PENALTY_ = 1;
  var HP_LOGIN_GATE_BONUS_ = 3;
  function isHpDamageActive_() {
    return todayKey() >= HP_DAMAGE_START_;
  }
  function isHpGameOver_() {
    return isHpDamageActive_() && (Number(state.hp) || 0) <= 0;
  }
  // なんでも屋の消費アイテム「鋼の鎧」：購入日に関わらず、ボス戦以外の不正解による
  // HP減少を最大10回分防ぐ(10回使い切ると壊れてなくなる)消費アイテム。
  const STEELARMOR_COST_MP = 100;
  const STEELARMOR_MAX_CHARGES = 10;
  function hasSteelArmorCharge_() {
    return (Number(state.steelArmorCharges) || 0) > 0;
  }

  // HPが0のときは、mathArea/scienceArea/quizCardを隠してhpGameOverPanelを表示する。
  // 戻り値trueのとき、呼び出し元(nextQuestion)は出題処理を中断する。
  function ensureNotHpGameOver_() {
    if (isHpGameOver_()) {
      if (els.quizCard) els.quizCard.hidden = true;
      if (els.mathArea) els.mathArea.hidden = true;
      if (els.scienceArea) els.scienceArea.hidden = true;
      if (els.hpGameOverPanel) els.hpGameOverPanel.hidden = false;
      return true;
    }
    if (els.hpGameOverPanel) els.hpGameOverPanel.hidden = true;
    if (els.quizCard) els.quizCard.hidden = false;
    syncSubjectUi_();
    return false;
  }

  // 8/12〜8/18は新ルールの予告・案内バナーを表示する。8/13の適用開始前後で文言を変える。
  function renderHpRulesBanner_() {
    if (!els.hpRulesBanner) return;
    var today = todayKey();
    if (today < HP_RULES_BANNER_START_ || today > HP_RULES_BANNER_END_) {
      els.hpRulesBanner.hidden = true;
      return;
    }
    els.hpRulesBanner.hidden = false;
    if (els.hpRulesBannerText) {
      els.hpRulesBannerText.textContent = isHpDamageActive_()
        ? '❤️ HPのルール：ボスキャラ以外でも、問題を間違えるとHPが1減ります。HPが0になるとゲームオーバーになり、問題に答えられなくなります。ログアウトして再ログインし、文章題を3問連続正解するとHPが3回復します。または🏪なんでも屋で薬草を購入してもHPを回復できます。'
        : '❤️ 8月13日からのお知らせ：ボスキャラ以外でも、問題を間違えるとHPが1減るようになります。HPが0になるとゲームオーバーになり、問題に答えられなくなります。ログアウトして再ログインし、文章題を3問連続正解するとHPが3回復します。または🏪なんでも屋で薬草を購入してもHPを回復できます。';
    }
  }

  // MP上限の分割ルール変更のお知らせを5日間だけ表示する(8/16〜8/20)。
  var MP_CAP_BANNER_START_ = '2026-08-16';
  var MP_CAP_BANNER_END_ = '2026-08-20';
  function renderMpCapBanner_() {
    if (!els.mpCapBanner) return;
    var today = todayKey();
    if (today < MP_CAP_BANNER_START_ || today > MP_CAP_BANNER_END_) {
      els.mpCapBanner.hidden = true;
      return;
    }
    els.mpCapBanner.hidden = false;
    if (els.mpCapBannerText) {
      els.mpCapBannerText.textContent = '📢 MPのルール変更のお知らせ：計算問題（理科もふくむ）で稼げるMPは1日最大50MPまで、文章題で稼げるMPも1日最大50MPまで（今までと同じ）になりました。また、計算問題は10問連続正解ごとに+5MP（学年より上の単元に挑戦した場合は+10MP）です。';
    }
  }

  /* ---------- ログイン前チェック(文章題3問連続正解、8/10から) ---------- */
  var LOGIN_GATE_START_ = '2026-08-10';
  var LOGIN_GATE_REQUIRED_STREAK_ = 3;
  var LOGIN_GATE_REWARD_MP_ = 10;
  var GRADE_ORDER_ = ['小4', '小5', '小6', '中1', '中2', '中3'];
  var GRADE_WORD_PROBLEM_CATEGORY_ = { '小4': 'timesWordProblem4', '小5': 'decWordProblem5', '小6': 'fracWordProblem6', '中1': 'eqWordProblem1', '中2': 'simulEqWordProblem2', '中3': 'quadEqWordProblem3' };
  function isLoginGateActive_() {
    return todayKey() >= LOGIN_GATE_START_;
  }
  // 自分の学年、および(小4以外は)1つ下の学年の文章題から出題する。
  function loginGateCategoryIdsForGrade_(grade) {
    var idx = GRADE_ORDER_.indexOf(grade);
    if (idx === -1) return [];
    var ids = [GRADE_WORD_PROBLEM_CATEGORY_[grade]];
    if (idx > 0) ids.push(GRADE_WORD_PROBLEM_CATEGORY_[GRADE_ORDER_[idx - 1]]);
    return ids.filter(Boolean);
  }
  var loginGate = { streak: 0, categories: [], current: null, pendingId: null, pendingName: null };

  function startLoginGate(id, name, grade) {
    loginGate.streak = 0;
    loginGate.categories = CATEGORIES.filter(function (c) { return loginGateCategoryIdsForGrade_(grade).indexOf(c.id) !== -1; });
    loginGate.pendingId = id;
    loginGate.pendingName = name;
    els.loginCard.hidden = true;
    els.appMain.hidden = true;
    els.loginGatePanel.hidden = false;
    renderLoginGateQuestion();
  }

  function renderLoginGateQuestion() {
    var cat = loginGate.categories[randInt(0, loginGate.categories.length - 1)];
    var q = cat.gen();
    loginGate.current = q;
    els.loginGateProgress.textContent = loginGate.streak + '/' + LOGIN_GATE_REQUIRED_STREAK_;
    els.loginGateQuestion.innerHTML = q.questionHtml || escHtml(String(q.question));
    els.loginGateResult.textContent = '';
    els.loginGateChoiceRow.innerHTML = '';
    q.choices.forEach(function (choiceRaw) {
      var choiceStr = String(choiceRaw);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'test-photo-tier-btn';
      btn.dataset.value = choiceStr;
      btn.innerHTML = stepToHtml(choiceStr);
      btn.addEventListener('click', function () { handleLoginGateAnswer(choiceStr); });
      els.loginGateChoiceRow.appendChild(btn);
    });
  }

  function handleLoginGateAnswer(choiceStr) {
    Array.from(els.loginGateChoiceRow.children).forEach(function (btn) { btn.disabled = true; });
    var isCorrect = choiceStr === String(loginGate.current.answer);
    if (isCorrect) {
      loginGate.streak++;
      if (loginGate.streak >= LOGIN_GATE_REQUIRED_STREAK_) {
        finishLoginGate();
        return;
      }
      els.loginGateResult.textContent = '✅ 正解！';
      window.setTimeout(renderLoginGateQuestion, 700);
    } else {
      loginGate.streak = 0;
      els.loginGateResult.textContent = '❌ 不正解…正解は「' + loginGate.current.answer + '」でした。最初からやり直しです。';
      window.setTimeout(renderLoginGateQuestion, 1400);
    }
  }

  function finishLoginGate() {
    els.loginGatePanel.hidden = true;
    var id = loginGate.pendingId;
    var name = loginGate.pendingName;
    state.points += LOGIN_GATE_REWARD_MP_;
    var hpBonusAwarded = 0;
    if (isHpDamageActive_()) {
      hpBonusAwarded = HP_LOGIN_GATE_BONUS_;
      state.hp = (Number(state.hp) || 0) + hpBonusAwarded;
    }
    saveGameState(state);
    showApp(name, false);
    window.alert('🎉 3問連続正解！+' + LOGIN_GATE_REWARD_MP_ + 'MP獲得！' + (hpBonusAwarded > 0 ? '+' + hpBonusAwarded + 'HP獲得！' : ''));
    if (id) apiPost('syncPoints', buildProgressSyncPayload(id)).catch(function () { });
  }

  function showApp(name, isGuest) {
    els.loginCard.hidden = true;
    els.appMain.hidden = false;
    renderUserGreeting(name);
    els.historyToggle.hidden = !!isGuest;
    els.historyPanel.hidden = true;
    els.rankingToggle.hidden = !!isGuest;
    els.rankingPanel.hidden = true;
    els.giftToggle.hidden = !!isGuest;
    els.giftPanel.hidden = true;
    els.shopToggle.hidden = !!isGuest;
    els.shopPanel.hidden = true;
    var session = loadSession();
    updateWorldToggleVisibility();
    els.worldPanel.hidden = true;
    els.grantToggle.hidden = !(session && session.id === '00001');
    if (els.worldDiceTestBtn) els.worldDiceTestBtn.hidden = !(session && session.id === '00001');
    if (els.worldBossTestRow) els.worldBossTestRow.hidden = !(session && session.id === '00001');
    els.grantPanel.hidden = true;
    els.testPhotoToggle.hidden = !!isGuest;
    els.testPhotoPanel.hidden = true;
    els.withdrawPanel.hidden = true;
    els.rankingTabPoints.hidden = !!isGuest;
    els.rankingTabHp.hidden = !!isGuest;
    syncSubjectUi_();
    drawNumberline();
    renderSettings();
    updateStats();
    updateGameHud();
    renderApologyBanner();
    renderWeeklyQuizSpecialBanner();
    renderWorldLaunchBanner();
    renderMissionBanner();
    if (!isGuest) fetchTeamEventStatus_();
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
        else if (res.error === 'no_password') msg = 'パスワードが未設定です。下の「パスワードを忘れた方はこちら」から新しいパスワードを設定してください。';
        else if (res.error === 'wrong_password') {
          msg = 'パスワードが違います。';
          if (res.attemptsRemaining !== undefined) msg += `（あと${res.attemptsRemaining}回間違えるとロックされます）`;
        } else if (res.error === 'locked') {
          msg = `パスワードを何度も間違えたため、${res.retryAfterMinutes}分ほどログインできません。しばらくしてから再度お試しください。`;
        } else if (res.error === 'id_reassigned') {
          msg = `IDが変更になりました。お手数ですが、新しいID「${res.newId}」でログインし直してください。パスワードは今までと同じです。`;
        }
        showFieldError(els.loginError, msg);
        return;
      }
      saveSession({ id: id, name: res.name, grade: res.grade });
      const progress = loadAccountProgress_(id);
      if (progress) {
        state.pointsToday = Number(progress.pointsToday) || 0;
        state.pointsDate = progress.pointsDate || null;
        state.pointsTodayCalc = Number(progress.pointsTodayCalc) || 0;
        state.pointsTodayWord = Number(progress.pointsTodayWord) || 0;
        state.items = Array.isArray(progress.items) ? progress.items.slice() : state.items;
        state.rareDefeats = (progress.rareDefeats && typeof progress.rareDefeats === 'object') ? Object.assign({}, progress.rareDefeats) : state.rareDefeats;
        state.rareCollected = Array.isArray(progress.rareCollected) ? progress.rareCollected.slice() : state.rareCollected;
        state.thinkerMilestone = progress.thinkerMilestone || state.thinkerMilestone;
        state.missionDate = progress.missionDate || null;
        state.missionGrade = progress.missionGrade || null;
        state.missionCategoryId = progress.missionCategoryId || null;
        state.missionCorrect = Number(progress.missionCorrect) || 0;
        state.missionClaimed = !!progress.missionClaimed;
        state.wrongBank = (progress.wrongBank && typeof progress.wrongBank === 'object') ? JSON.parse(JSON.stringify(progress.wrongBank)) : state.wrongBank;
        state.categoryDailyCounts = (progress.categoryDailyCounts && typeof progress.categoryDailyCounts === 'object') ? Object.assign({}, progress.categoryDailyCounts) : state.categoryDailyCounts;
        state.categoryDailyDate = progress.categoryDailyDate || state.categoryDailyDate;
        state.hp = Number(progress.hp) || state.hp;
        state.worldLap = Number(progress.worldLap) || state.worldLap;
        state.worldLapStartLevel = Number(progress.worldLapStartLevel) || state.worldLapStartLevel;
        state.worldCountry = (progress.worldCountry !== undefined && progress.worldCountry !== null) ? Number(progress.worldCountry) || 0 : state.worldCountry;
        applyWorldDataForLap_(state.worldLap);
        state.worldBossDefeated = (progress.worldBossDefeated && typeof progress.worldBossDefeated === 'object') ? Object.assign({}, progress.worldBossDefeated) : state.worldBossDefeated;
        state.worldAllies = Array.isArray(progress.worldAllies) ? progress.worldAllies.slice() : state.worldAllies;
        state.speedSeedCount = Number(progress.speedSeedCount) || state.speedSeedCount;
        state.ironWallCharges = Number(progress.ironWallCharges) || state.ironWallCharges;
        state.steelArmorCharges = Number(progress.steelArmorCharges) || state.steelArmorCharges;
        state.spellbooks = (progress.spellbooks && typeof progress.spellbooks === 'object') ? Object.assign({}, progress.spellbooks) : state.spellbooks;
      }
      if (res.pendingItems && res.pendingItems.length > 0) applyPendingItemGrants(res.pendingItems);
      // reconcilePointsは端末とサーバーのMPのうち大きい方を採用するため、付与分は
      // reconcilePointsを呼ぶ前にローカルへ加算しておく。先にreconcileしてしまうと、
      // 端末側の方が(付与前の値で)大きかった場合、その古い値がサーバーへ書き戻されて
      // 付与直後のMPを消してしまう恐れがある。
      if (res.apologyBonusAwarded > 0) state.points += res.apologyBonusAwarded;
      state.enabled = (progress && Array.isArray(progress.enabled) && progress.enabled.length > 0) ? new Set(progress.enabled) : new Set(defaultEnabledIds(res.grade));
      // サーバーにアバターが無い(まだ作っていない)場合に、端末に保存済みの
      // アバターを消してしまわないよう、取得できた時だけ上書きする。
      var parsedAvatarOnLogin = parseAvatarJson(res.avatar);
      if (parsedAvatarOnLogin) state.avatar = parsedAvatarOnLogin;
      saveGameState(state);
      reconcilePoints(id, res);
      if (isLoginGateActive_()) {
        startLoginGate(id, res.name, res.grade);
      } else {
        showApp(res.name, false);
      }
      if (res.pointsReset) {
        window.alert('5日以上ログインが無かったため、MPが0にリセットされました。レベル・EXPはそのまま残っています。');
      }
      if (res.apologyBonusAwarded > 0) {
        window.alert(`🙇 お詫びとして+${res.apologyBonusAwarded}MPを付与しました！`);
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
  // 考えるAKRの出現状態は null < 100 < 1000 の順で「進んでいる」とみなす
  function thinkerMilestoneRank(v) {
    return v === 1000 ? 2 : v === 100 ? 1 : 0;
  }

  // points/level/exp/prefectureCount/items/rareCollected/rareDefeats/thinkerMilestoneを
  // まとめてサーバーへ送るための共通ペイロード(syncPointsアクション)。
  function buildProgressSyncPayload(id) {
    return {
      id: id, points: state.points, level: state.level, exp: state.exp, scienceExp: state.scienceExp, prefectureCount: state.prefectureCount,
      items: state.items, rareCollected: state.rareCollected, rareDefeats: state.rareDefeats, thinkerMilestone: state.thinkerMilestone,
      hp: state.hp,
      worldLap: state.worldLap, worldLapStartLevel: state.worldLapStartLevel, worldCountry: state.worldCountry,
      worldBossDefeated: state.worldBossDefeated, worldAllies: state.worldAllies,
      treasureItems: state.treasureItems || {},
      mathGodTitleEarned: state.mathGodTitleEarned,
      speedSeedCount: state.speedSeedCount,
      ironWallCharges: state.ironWallCharges,
      steelArmorCharges: state.steelArmorCharges,
      spellbooks: state.spellbooks || {},
    };
  }

  // 敵を倒すたびに毎回即座にsyncPointsを送ると、短時間に連続で倒した時にApps Scriptの
  // 実行回数を無駄に消費してしまう。数秒以内の連続呼び出しをまとめ、最後の状態だけを
  // 1回で送信する(デバウンス)。ボーナス付与の判定はサーバー側で「前回保存値→今回の値」の
  // 範囲を見て行っているため、間の呼び出しを省略しても正しく判定される。
  var SYNC_POINTS_DEBOUNCE_MS_ = 3000;
  var syncPointsDebounceTimer_ = null;
  function debouncedSyncPoints_(id, onResult) {
    if (syncPointsDebounceTimer_) window.clearTimeout(syncPointsDebounceTimer_);
    syncPointsDebounceTimer_ = window.setTimeout(function () {
      syncPointsDebounceTimer_ = null;
      apiPost('syncPoints', buildProgressSyncPayload(id)).then(function (res) {
        if (onResult) onResult(res);
      }).catch(function () { });
    }, SYNC_POINTS_DEBOUNCE_MS_);
  }

  // ログイン・再開時に、端末側とサーバー側の進捗のうち進んでいる方に揃える。
  // MP・レベル・EXP・都道府県制覇数は「大きい方」を採用。アイテム・図鑑・レア撃破回数は
  // 端末ごとに独立して増えていく(同じIDを複数端末で使うと図鑑がズレる不具合の原因だった)
  // ため、どちらか一方を採用するのではなく和集合(アイテム・図鑑)・最大値(撃破回数)で
  // マージする。マージの結果、端末側の方が進んでいる項目があればサーバーへ書き戻す。
  function reconcilePoints(id, server) {
    server = server || {};
    var sp = Number(server.points) || 0;
    var sl = Number(server.level) || 1;
    var se = Number(server.exp) || 0;
    var sse = Number(server.scienceExp) || 0;
    var spc = Number(server.prefectureCount) || 0;
    var sItems = Array.isArray(server.items) ? server.items : [];
    var sRareCollected = Array.isArray(server.rareCollected) ? server.rareCollected : [];
    var sRareDefeats = (server.rareDefeats && typeof server.rareDefeats === 'object') ? server.rareDefeats : {};
    var sThinkerMilestone = server.thinkerMilestone || null;
    var sHp = Number(server.hp) || 0;
    var sWorldLap = Number(server.worldLap) || 1;
    var sWorldLapStartLevel = Number(server.worldLapStartLevel) || 100;
    var sWorldCountry = Number(server.worldCountry) || 0;
    var sWorldBossDefeated = (server.worldBossDefeated && typeof server.worldBossDefeated === 'object') ? server.worldBossDefeated : {};
    var sWorldAllies = Array.isArray(server.worldAllies) ? server.worldAllies : [];
    var sMathGodTitleEarned = !!server.mathGodTitleEarned;
    var sTreasureItems = (server.treasureItems && typeof server.treasureItems === 'object') ? server.treasureItems : {};
    var sSpellbooks = (server.spellbooks && typeof server.spellbooks === 'object') ? server.spellbooks : {};
    var changed = false;

    if (sp > state.points) { state.points = sp; changed = true; }
    // レベルの進み具合は算数exp+理科exp合算で比較する(理科expはサーバーに新しく
    // 追加した列で、以前は比較に入っておらずサーバー同期のたびに理科分の
    // レベルアップが巻き戻る不具合の原因だった)。
    if (isProgressGreater(sl, se + sse, state.level, (Number(state.exp) || 0) + (Number(state.scienceExp) || 0))) {
      state.level = sl; state.exp = se; state.scienceExp = sse; changed = true;
    }
    if (spc > state.prefectureCount) { state.prefectureCount = spc; changed = true; }
    if (sHp > (Number(state.hp) || 0)) { state.hp = sHp; changed = true; }
    if (sWorldCountry > (Number(state.worldCountry) || 0)) { state.worldCountry = sWorldCountry; changed = true; }
    sItems.forEach(function (itemId) {
      if (state.items.indexOf(itemId) === -1) { state.items.push(itemId); changed = true; }
    });
    sRareCollected.forEach(function (rid) {
      if (state.rareCollected.indexOf(rid) === -1) { state.rareCollected.push(rid); changed = true; }
    });
    Object.keys(sRareDefeats).forEach(function (k) {
      var sv = Number(sRareDefeats[k]) || 0;
      if (sv > (Number(state.rareDefeats[k]) || 0)) { state.rareDefeats[k] = sv; changed = true; }
    });
    if (thinkerMilestoneRank(sThinkerMilestone) > thinkerMilestoneRank(state.thinkerMilestone)) {
      state.thinkerMilestone = sThinkerMilestone; changed = true;
    }
    // 世界一周の周(worldLap)が進んでいる方に揃える。周が違うとボス撃破状況
    // (worldBossDefeated)の意味が変わるので、周が同じ場合だけ和集合でマージする。
    var localWorldLap = Number(state.worldLap) || 1;
    if (sWorldLap > localWorldLap) {
      state.worldLap = sWorldLap;
      state.worldLapStartLevel = sWorldLapStartLevel;
      applyWorldDataForLap_(state.worldLap);
      state.worldBossDefeated = Object.assign({}, sWorldBossDefeated);
      changed = true;
    } else if (sWorldLap === localWorldLap) {
      Object.keys(sWorldBossDefeated).forEach(function (k) {
        if (sWorldBossDefeated[k] && !state.worldBossDefeated[k]) { state.worldBossDefeated[k] = true; changed = true; }
      });
    }
    sWorldAllies.forEach(function (code) {
      if (state.worldAllies.indexOf(code) === -1) { state.worldAllies.push(code); changed = true; }
    });
    // 宝箱・鍵・指輪はironWallCharges等と同じ「端末ローカルの消費数値」の性質が
    // あるため(指輪をシールドとして使うと個数が減る等)、大きい方を採用する
    // (ゼロから作り直した端末で古いキャッシュに戻ってしまわないための保険。
    // 通常はbuildProgressSyncPayloadで直近の値がすぐ同期される)。
    TREASURE_ITEM_ALL_KEYS_.forEach(function (k) {
      var sv = Number(sTreasureItems[k]) || 0;
      if (sv > (Number(state.treasureItems[k]) || 0)) { state.treasureItems[k] = sv; changed = true; }
    });
    SPELLBOOK_ELEMENTS_.forEach(function (el) {
      var sv = Number(sSpellbooks[el]) || 0;
      if (sv > (Number(state.spellbooks[el]) || 0)) { state.spellbooks[el] = sv; changed = true; }
    });

    if (changed) {
      saveGameState(state);
      updateGameHud();
    }

    var localAhead = sp < state.points
      || isProgressGreater(state.level, (Number(state.exp) || 0) + (Number(state.scienceExp) || 0), sl, se + sse)
      || spc < state.prefectureCount
      || state.items.some(function (x) { return sItems.indexOf(x) === -1; })
      || state.rareCollected.some(function (x) { return sRareCollected.indexOf(x) === -1; })
      || Object.keys(state.rareDefeats).some(function (k) { return (Number(state.rareDefeats[k]) || 0) > (Number(sRareDefeats[k]) || 0); })
      || thinkerMilestoneRank(state.thinkerMilestone) > thinkerMilestoneRank(sThinkerMilestone)
      || (Number(state.hp) || 0) > sHp
      || localWorldLap > sWorldLap
      || (localWorldLap === sWorldLap && Object.keys(state.worldBossDefeated).some(function (k) { return state.worldBossDefeated[k] && !sWorldBossDefeated[k]; }))
      || state.worldAllies.some(function (x) { return sWorldAllies.indexOf(x) === -1; })
      || TREASURE_ITEM_ALL_KEYS_.some(function (k) { return (Number(state.treasureItems[k]) || 0) > (Number(sTreasureItems[k]) || 0); })
      || SPELLBOOK_ELEMENTS_.some(function (el) { return (Number(state.spellbooks[el]) || 0) > (Number(sSpellbooks[el]) || 0); });
    if (localAhead) {
      apiPost('syncPoints', buildProgressSyncPayload(id)).catch(function () { });
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
      saveSession({ id: res.id, name: res.name, grade: grade });
      clearGameState();
      window.alert('登録が完了しました！\n\nあなたのID: ' + res.id + '\n\n次回からは、このIDとパスワードでログインします。忘れずに控えておいてください。');
      // 同じ端末で以前に別の生徒が使っていた場合、ポイント等がメモリ上に
      // 残らないよう、ページごと再読み込みしてまっさらな状態から始める。
      window.location.reload();
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

    var photoAvatarConsent = !!(els.photoAvatarConsent && els.photoAvatarConsent.checked);
    els.guardianSubmit.disabled = true;
    apiPost('registerGuardian', { guardianName: guardianName, children: children, photoAvatarConsent: photoAvatarConsent }).then(function (res) {
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

  function finishLogout() {
    clearSession();
    clearGameState();
    // 同じ端末で別のIDに切り替えた際に、前の生徒のポイント・レベル・
    // 都道府県制覇の進捗などがメモリ上に残ったまま次のログインに
    // 引き継がれてしまわないよう、ページごと再読み込みして完全に
    // まっさらな状態にする。
    window.location.reload();
  }

  function handleLogout() {
    // ログアウト時にlocalStorageを消してからreloadするため、直前の正解が何らかの
    // 理由(通信が遅い・一時的な回線不調等)でまだサーバーへ同期し切れていないと、
    // その分の進捗が端末側にしか存在しない状態のままログアウトで失われてしまう
    // (レベル・MPが古いサーバー値まで巻き戻って見える不具合の原因になっていた)。
    // ログアウト直前に一度だけ同期を試み、その結果を待ってから消去する。オフライン等
    // で同期できない場合に画面が固まらないよう、一定時間で待つのをあきらめて進める。
    var session = loadSession();
    if (!session || !session.id) { finishLogout(); return; }
    els.logoutBtn.disabled = true;
    if (logFlushTimer_) { window.clearTimeout(logFlushTimer_); logFlushTimer_ = null; }
    flushLogQueue_();
    var timeout = new Promise(function (resolve) { window.setTimeout(resolve, 4000); });
    Promise.race([apiPost('syncPoints', buildProgressSyncPayload(session.id)), timeout])
      .catch(function () { })
      .then(finishLogout);
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

  const BADGES = [
    { id: 'allCategories', icon: '🏆', name: '全カテゴリ制覇', desc: '全ての単元で1問以上正解した' },
    { id: 'streak7',       icon: '🔥', name: '7日連続ログイン', desc: '7日連続で学習した' },
    { id: 'level100',      icon: '🥉', name: 'レベル100',      desc: 'レベル100に到達した' },
    { id: 'level200',      icon: '🥈', name: 'レベル200',      desc: 'レベル200に到達した' },
    { id: 'level300',      icon: '🥇', name: 'レベル300',      desc: 'レベル300に到達した' },
    { id: 'level500',      icon: '💎', name: 'レベル500',      desc: 'レベル500に到達した' },
    { id: 'level1000',     icon: '👑', name: 'レベル1000',     desc: 'レベル1000に到達した' },
  ];

  function computeEarnedBadges(data) {
    const earned = new Set();
    const allCatIds = CATEGORIES.map(c => c.id);
    const clearedCats = new Set((data.byCategory || []).filter(c => c.correct > 0).map(c => c.category));
    if (allCatIds.length > 0 && allCatIds.every(id => clearedCats.has(id))) earned.add('allCategories');
    if ((data.streak || 0) >= 7) earned.add('streak7');
    [100, 200, 300, 500, 1000].forEach(n => { if (state.level >= n) earned.add('level' + n); });
    return earned;
  }

  function renderBadges(data) {
    const earned = computeEarnedBadges(data);
    els.historyBadges.innerHTML = BADGES.map(b => {
      const isEarned = earned.has(b.id);
      const cls = 'badge-item' + (isEarned ? ' badge-earned' : ' badge-locked');
      return `<div class="${cls}" title="${b.desc}"><span class="badge-icon">${b.icon}</span><span class="badge-name">${b.name}</span></div>`;
    }).join('');
  }

  function renderItems() {
    var html = SPECIAL_ITEMS.map(function (it) {
      const owned = state.items.includes(it.id);
      const cls = 'badge-item' + (owned ? ' badge-earned' : ' badge-locked');
      return `<div class="${cls}" title="${it.desc}"><span class="badge-icon">${it.icon}</span><span class="badge-name">${it.name}</span></div>`;
    }).join('');
    // すばやさの種はなんでも屋で買える消費アイテムなので、他のアイテムと違い所持数で
    // 表示し、使い切って0個になったら図鑑から消える。
    var speedSeedCount = Number(state.speedSeedCount) || 0;
    if (speedSeedCount > 0) {
      html += `<div class="badge-item badge-earned" title="逃げるタイプのレアキャラに間違えて逃げられそうになったとき、自動で1個使われて逃走を防ぐ"><span class="badge-icon"><img src="images/speed_seed.png" alt=""></span><span class="badge-name">すばやさの種 ×${speedSeedCount}</span></div>`;
    }
    // 鉄壁の盾も消費アイテムなので残りチャージ数で表示し、使い切ったら図鑑から消える。
    var ironWallCharges = Number(state.ironWallCharges) || 0;
    if (ironWallCharges > 0) {
      html += `<div class="badge-item badge-earned" title="ボス戦で間違えるたびに自動で1回分使われ、そのミスのダメージを半分にする"><span class="badge-icon"><img src="images/iron_wall_seed.png" alt=""></span><span class="badge-name">鉄壁の盾（残り${ironWallCharges}回）</span></div>`;
    }
    // 鋼の鎧も消費アイテムなので残りチャージ数で表示し、使い切ったら図鑑から消える。
    var steelArmorCharges = Number(state.steelArmorCharges) || 0;
    if (steelArmorCharges > 0) {
      html += `<div class="badge-item badge-earned" title="ボス戦以外の間違いのたびに自動で1回分使われ、HP減少を防ぐ"><span class="badge-icon"><img src="images/steel_armor.png" alt=""></span><span class="badge-name">鋼の鎧（残り${steelArmorCharges}回）</span></div>`;
    }
    els.historyItems.innerHTML = html;
  }

  // 管理者(ID 00001)がgrantItemsで付与予約したアイテム・レアキャラ図鑑を、
  // ログイン/再開時に受け取ってstateへ反映する。
  function applyPendingItemGrants(itemIds) {
    var changed = false;
    var grantedNames = [];
    (itemIds || []).forEach(function (id) {
      var specialDef = SPECIAL_ITEMS.find(function (it) { return it.id === id; });
      if (specialDef) {
        if (!state.items.includes(id)) { state.items.push(id); changed = true; }
        grantedNames.push(specialDef.name);
      } else if (id === 'thinker' || RARE_COLLECTIBLE_IDS.indexOf(id) !== -1) {
        if (state.rareCollected.indexOf(id) === -1) { state.rareCollected.push(id); changed = true; }
        grantedNames.push(RARE_TYPES[id] ? RARE_TYPES[id].name : id);
      }
    });
    if (changed) {
      saveGameState(state);
      updateGameHud();
      window.alert('🎁 運営より、以前失われたアイテムが復活しました：' + grantedNames.join('、'));
    }
  }

  // 5回撃破でコレクション入り(通常枠)した後、さらに撃破を重ねると枠が段位で光る。
  // 高い段位ほど優先(20回以上ならゴールド、15回以上ならシルバー、10回以上ならブロンズ)。
  const RARE_TIER_GOLD_AT = 20;
  const RARE_TIER_SILVER_AT = 15;
  const RARE_TIER_BRONZE_AT = 10;
  function rareTierClassFor(defeatCount) {
    if (defeatCount >= RARE_TIER_GOLD_AT) return 'badge-tier-gold';
    if (defeatCount >= RARE_TIER_SILVER_AT) return 'badge-tier-silver';
    if (defeatCount >= RARE_TIER_BRONZE_AT) return 'badge-tier-bronze';
    return '';
  }
  function renderRareCollection() {
    const ids = RARE_COLLECTIBLE_IDS.concat(['thinker']).concat(WORLD_BOSS_COLLECTIBLE_IDS);
    els.historyRareCollection.innerHTML = ids.map(function (id) {
      const rt = RARE_TYPES[id];
      const collected = state.rareCollected.indexOf(id) !== -1;
      const defeatCount = state.rareDefeats[id] || 0;
      const tierCls = collected ? rareTierClassFor(defeatCount) : '';
      const cls = 'badge-item' + (collected ? ' badge-earned' : ' badge-locked') + (tierCls ? ' ' + tierCls : '');
      const iconHtml = rt.img ? `<img src="${rt.img}" alt="">` : (rt.emoji || '❓');
      const label = collected ? rt.name : '？？？';
      let title;
      if (collected) {
        title = rt.name;
        if (tierCls === 'badge-tier-gold') title += `（ゴールド・${defeatCount}回撃破）`;
        else if (tierCls === 'badge-tier-silver') title += `（シルバー・${defeatCount}回撃破）`;
        else if (tierCls === 'badge-tier-bronze') title += `（ブロンズ・${defeatCount}回撃破）`;
      } else if (id === 'thinker') {
        title = 'レベル1000で登場する考えるAKRを倒すとゲット';
      } else if (WORLD_BOSS_COLLECTIBLE_IDS.indexOf(id) !== -1) {
        title = '世界一周のボスを倒すとゲット';
      } else {
        title = `あと${Math.max(0, RARE_COLLECTION_THRESHOLD - defeatCount)}回撃破でゲット`;
      }
      return `<div class="${cls}" title="${title}"><span class="badge-icon">${iconHtml}</span><span class="badge-name">${label}</span></div>`;
    }).join('');
  }

  function renderHistory(data) {
    renderBadges(data);
    renderRareCollection();
    renderItems();
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
    els.prefecturePanel.setAttribute('hidden', '');
    els.avatarPanel.setAttribute('hidden', '');
    els.worldPanel.setAttribute('hidden', '');
    els.grantPanel.setAttribute('hidden', '');
    els.testPhotoPanel.setAttribute('hidden', '');
    els.weeklyQuizPanel.setAttribute('hidden', '');
    if (els.bakuretsuQuizPanel) els.bakuretsuQuizPanel.setAttribute('hidden', '');
    els.withdrawPanel.setAttribute('hidden', '');
    if (els.teamEventPanel) els.teamEventPanel.setAttribute('hidden', '');
    els.shopPanel.setAttribute('hidden', '');

    els.historyPanel.removeAttribute('hidden');
    els.historySummary.textContent = '読み込み中…';
    els.historyStreak.textContent = '';
    els.historyCalendar.innerHTML = '';
    els.historyBadges.innerHTML = '';
    els.historyItems.innerHTML = '';
    els.historyRareCollection.innerHTML = '';
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

  function rankingRowHtml(r, mode) {
    var cls = 'ranking-row' + (r.isYou ? ' ranking-you' : '');
    var youTag = r.isYou ? '<span class="ranking-you-tag">あなた</span>' : '';
    var gradeTag = r.grade ? `<span class="ranking-grade">${r.grade}</span>` : '';
    var detail = mode === 'today' ? `正解 ${r.correct}問（挑戦 ${r.total}問）` : mode === 'points' ? `${r.points}MP` : mode === 'hp' ? `HP ${r.hp}` : `Lv.${r.level}（経験値 ${r.exp}）`;
    return `<div class="${cls}"><span class="ranking-rank">${r.rank}</span><span class="ranking-name">${gradeTag}${r.nickname}${youTag}</span><span class="ranking-points">${detail}</span></div>`;
  }

  function renderRanking(res, mode) {
    els.rankingChallengeElementary.hidden = true;
    els.rankingChallengeMiddle.hidden = true;
    els.rankingList.hidden = false;
    els.rankingTitle.textContent = mode === 'grade' ? `ランキング（学年内 上位30位）${res.grade ? '【' + res.grade + '】' : ''}` : 'ランキング（上位50位）';
    if (res.ranking.length === 0) {
      els.rankingSummary.textContent = mode === 'today' ? 'まだ本日のランキングデータがありません。' : mode === 'points' ? 'まだMPランキングデータがありません。' : mode === 'grade' ? 'まだ同学年のランキングデータがありません。' : mode === 'hp' ? 'まだHPランキングデータがありません。' : 'まだランキングデータがありません。';
      els.rankingList.innerHTML = '';
      els.rankingNearby.hidden = true;
      return;
    }
    els.rankingSummary.textContent = mode === 'today' ? `本日の正解数上位 ${res.ranking.length} 名` : mode === 'points' ? `MP保有量上位 ${res.ranking.length} 名` : mode === 'grade' ? `同学年 経験値上位 ${res.ranking.length} 名` : mode === 'hp' ? `HP上位 ${res.ranking.length} 名` : `経験値上位 ${res.ranking.length} 名`;
    els.rankingList.innerHTML = res.ranking.map(function (r) { return rankingRowHtml(r, mode); }).join('');

    if (Array.isArray(res.nearby) && res.nearby.length > 0) {
      els.rankingNearby.hidden = false;
      els.rankingNearbyList.innerHTML = res.nearby.map(function (r) { return rankingRowHtml(r, mode); }).join('');
    } else {
      els.rankingNearby.hidden = true;
      els.rankingNearbyList.innerHTML = '';
    }
  }

  function challengeRankingRowHtml(r) {
    var cls = 'ranking-row' + (r.isYou ? ' ranking-you' : '');
    var youTag = r.isYou ? '<span class="ranking-you-tag">あなた</span>' : '';
    var gradeTag = r.grade ? `<span class="ranking-grade">${r.grade}</span>` : '';
    return `<div class="${cls}"><span class="ranking-rank">${r.rank}</span><span class="ranking-name">${gradeTag}${r.nickname}${youTag}</span><span class="ranking-points">正解 ${r.total}問</span></div>`;
  }

  function renderChallengeDivision(list, nearby, listEl, nearbyEl, nearbyListEl, emptyText) {
    if (list.length === 0) {
      listEl.innerHTML = `<p class="history-summary">${emptyText}</p>`;
      nearbyEl.hidden = true;
      return;
    }
    listEl.innerHTML = list.map(challengeRankingRowHtml).join('');
    if (Array.isArray(nearby) && nearby.length > 0) {
      nearbyEl.hidden = false;
      nearbyListEl.innerHTML = nearby.map(challengeRankingRowHtml).join('');
    } else {
      nearbyEl.hidden = true;
      nearbyListEl.innerHTML = '';
    }
  }

  function renderChallengeRanking(res) {
    els.rankingList.hidden = true;
    els.rankingNearby.hidden = true;
    els.rankingTitle.textContent = 'チャレンジ問題正解数ランキング（累計）';
    els.rankingSummary.textContent = '提出のたびに申告した正解数（1問=1、2問=2、3問以上=3）を積み上げた累計です。';
    els.rankingChallengeElementary.hidden = false;
    els.rankingChallengeMiddle.hidden = false;
    renderChallengeDivision(res.elementary, res.elementaryNearby, els.rankingChallengeElementaryList, els.rankingChallengeElementaryNearby, els.rankingChallengeElementaryNearbyList, 'まだ小学部のデータがありません。');
    renderChallengeDivision(res.middle, res.middleNearby, els.rankingChallengeMiddleList, els.rankingChallengeMiddleNearby, els.rankingChallengeMiddleNearbyList, 'まだ中学部のデータがありません。');
  }

  function setRankingTabActive(mode) {
    els.rankingTabExp.classList.toggle('is-active', mode === 'exp');
    els.rankingTabExp.setAttribute('aria-selected', String(mode === 'exp'));
    els.rankingTabToday.classList.toggle('is-active', mode === 'today');
    els.rankingTabToday.setAttribute('aria-selected', String(mode === 'today'));
    els.rankingTabPoints.classList.toggle('is-active', mode === 'points');
    els.rankingTabPoints.setAttribute('aria-selected', String(mode === 'points'));
    els.rankingTabGrade.classList.toggle('is-active', mode === 'grade');
    els.rankingTabGrade.setAttribute('aria-selected', String(mode === 'grade'));
    els.rankingTabHp.classList.toggle('is-active', mode === 'hp');
    els.rankingTabHp.setAttribute('aria-selected', String(mode === 'hp'));
    els.rankingTabChallenge.classList.toggle('is-active', mode === 'challenge');
    els.rankingTabChallenge.setAttribute('aria-selected', String(mode === 'challenge'));
    els.rankingHpHint.hidden = mode !== 'hp';
  }

  function loadRanking(mode) {
    els.rankingSummary.textContent = '読み込み中…';
    els.rankingList.innerHTML = '';

    var session = loadSession();
    if (!session || !session.id) return;
    if (mode === 'challenge') {
      apiPost('challengeRanking', { id: session.id }).then(function (res) {
        if (!res.ok) { els.rankingSummary.textContent = '読み込みに失敗しました。'; return; }
        renderChallengeRanking(res);
      }).catch(function () {
        els.rankingSummary.textContent = '読み込みに失敗しました。';
      });
      return;
    }
    var action = mode === 'today' ? 'rankingToday' : mode === 'points' ? 'rankingPoints' : mode === 'grade' ? 'rankingGrade' : mode === 'hp' ? 'rankingHp' : 'ranking';
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
    els.prefecturePanel.setAttribute('hidden', '');
    els.avatarPanel.setAttribute('hidden', '');
    els.worldPanel.setAttribute('hidden', '');
    els.grantPanel.setAttribute('hidden', '');
    els.testPhotoPanel.setAttribute('hidden', '');
    els.weeklyQuizPanel.setAttribute('hidden', '');
    if (els.bakuretsuQuizPanel) els.bakuretsuQuizPanel.setAttribute('hidden', '');
    els.withdrawPanel.setAttribute('hidden', '');
    if (els.teamEventPanel) els.teamEventPanel.setAttribute('hidden', '');
    els.shopPanel.setAttribute('hidden', '');

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
    els.prefecturePanel.setAttribute('hidden', '');
    els.avatarPanel.setAttribute('hidden', '');
    els.worldPanel.setAttribute('hidden', '');
    els.grantPanel.setAttribute('hidden', '');
    els.testPhotoPanel.setAttribute('hidden', '');
    els.weeklyQuizPanel.setAttribute('hidden', '');
    if (els.bakuretsuQuizPanel) els.bakuretsuQuizPanel.setAttribute('hidden', '');
    els.withdrawPanel.setAttribute('hidden', '');
    if (els.teamEventPanel) els.teamEventPanel.setAttribute('hidden', '');
    els.shopPanel.setAttribute('hidden', '');

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

  /* ---------- なんでも屋（ボン・ミスコの呪いをAKRの祈りで解く） ---------- */

  function renderCurseBanner() {
    els.curseBanner.hidden = !state.cursed;
  }

  function renderShopList() {
    els.shopSummary.textContent = `現在のMP: ${state.points}`;

    var prayerCanAfford = state.points >= AKR_PRAYER_COST_MP;
    var prayerActionHtml;
    if (!state.cursed) {
      prayerActionHtml = `<span class="gift-insufficient">今は呪われていません</span>`;
    } else if (prayerCanAfford) {
      prayerActionHtml = `<button type="button" class="gift-redeem-btn" id="akrPrayerBtn">祈ってもらう</button>`;
    } else {
      prayerActionHtml = `<span class="gift-insufficient">MP不足</span>`;
    }
    var prayerRowHtml = `<div class="gift-row"><img class="shop-item-img" src="images/akr_prayer.png" alt="AKRの祈り"><div class="gift-info"><span class="gift-label">🙏 AKRの祈り（ボン・ミスコの呪いを解く）</span><span class="gift-cost">${AKR_PRAYER_COST_MP}MP</span></div>${prayerActionHtml}</div>`;

    var herbCanAfford = state.points >= HERB_COST_MP;
    var herbActionHtml = herbCanAfford
      ? `<button type="button" class="gift-redeem-btn" id="buyHerbBtn">購入する</button>`
      : `<span class="gift-insufficient">MP不足</span>`;
    var herbRowHtml = `<div class="gift-row"><div class="gift-info"><span class="gift-label">🌿 薬草（HPを${HERB_HP_GAIN}増やす）</span><span class="gift-cost">${HERB_COST_MP}MP</span></div>${herbActionHtml}</div>`;

    var bakuHerbCanAfford = state.points >= BAKUHERB_COST_MP;
    var bakuHerbActionHtml = bakuHerbCanAfford
      ? `<button type="button" class="gift-redeem-btn" id="buyBakuHerbBtn">購入する</button>`
      : `<span class="gift-insufficient">MP不足</span>`;
    var bakuHerbRowHtml = `<div class="gift-row"><img class="shop-item-img" src="images/bakuretsu_herb.png" alt="爆裂薬草"><div class="gift-info"><span class="gift-label">💥 爆裂薬草（HPを${BAKUHERB_HP_GAIN}増やす）</span><span class="gift-cost">${BAKUHERB_COST_MP}MP</span></div>${bakuHerbActionHtml}</div>`;

    var chouHerbCanAfford = state.points >= CHOUHERB_COST_MP;
    var chouHerbActionHtml = chouHerbCanAfford
      ? `<button type="button" class="gift-redeem-btn" id="buyChouHerbBtn">購入する</button>`
      : `<span class="gift-insufficient">MP不足</span>`;
    var chouHerbRowHtml = `<div class="gift-row"><img class="shop-item-img" src="images/chouzetsu_herb.png" alt="超絶薬草"><div class="gift-info"><span class="gift-label">🌟 超絶薬草（HPを${CHOUHERB_HP_GAIN}増やす）</span><span class="gift-cost">${CHOUHERB_COST_MP}MP</span><span class="shop-item-note">世界一周のボス戦の前に購入をお勧め</span></div>${chouHerbActionHtml}</div>`;

    var speedSeedCanAfford = state.points >= SPEEDSEED_COST_MP;
    var speedSeedActionHtml = speedSeedCanAfford
      ? `<button type="button" class="gift-redeem-btn" id="buySpeedSeedBtn">購入する</button>`
      : `<span class="gift-insufficient">MP不足</span>`;
    var speedSeedRowHtml = `<div class="gift-row"><img class="shop-item-img" src="images/speed_seed.png" alt="すばやさの種"><div class="gift-info"><span class="gift-label">🌱 すばやさの種（所持数: ${state.speedSeedCount || 0}個）</span><span class="gift-cost">${SPEEDSEED_COST_MP}MP</span><span class="shop-item-note">逃げるタイプのレアキャラに間違えて逃げられそうになったとき、自動で1個使われて逃走を防ぐ</span></div>${speedSeedActionHtml}</div>`;

    var ironWallCharges = Number(state.ironWallCharges) || 0;
    var ironWallCanAfford = state.points >= IRONWALL_COST_MP;
    var ironWallActionHtml;
    if (ironWallCharges > 0) {
      ironWallActionHtml = `<span class="gift-insufficient">使用中（残り${ironWallCharges}回）</span>`;
    } else if (ironWallCanAfford) {
      ironWallActionHtml = `<button type="button" class="gift-redeem-btn" id="buyIronWallBtn">購入する</button>`;
    } else {
      ironWallActionHtml = `<span class="gift-insufficient">MP不足</span>`;
    }
    var ironWallRowHtml = `<div class="gift-row"><img class="shop-item-img" src="images/iron_wall_seed.png" alt="鉄壁の盾"><div class="gift-info"><span class="gift-label">🛡️ 鉄壁の盾（1個だけ保有可・最大3回分）</span><span class="gift-cost">${IRONWALL_COST_MP}MP</span><span class="shop-item-note">ボス戦で間違えるたびに自動で1回分使われ、そのミスのダメージが半分になる。3回使うと壊れてなくなる</span></div>${ironWallActionHtml}</div>`;

    var steelArmorCharges = Number(state.steelArmorCharges) || 0;
    var steelArmorCanAfford = state.points >= STEELARMOR_COST_MP;
    var steelArmorActionHtml;
    if (steelArmorCharges > 0) {
      steelArmorActionHtml = `<span class="gift-insufficient">使用中（残り${steelArmorCharges}回）</span>`;
    } else if (steelArmorCanAfford) {
      steelArmorActionHtml = `<button type="button" class="gift-redeem-btn" id="buySteelArmorBtn">購入する</button>`;
    } else {
      steelArmorActionHtml = `<span class="gift-insufficient">MP不足</span>`;
    }
    var steelArmorRowHtml = `<div class="gift-row"><img class="shop-item-img" src="images/steel_armor.png" alt="鋼の鎧"><div class="gift-info"><span class="gift-label">🛡️ 鋼の鎧（1個だけ保有可・最大${STEELARMOR_MAX_CHARGES}回分）</span><span class="gift-cost">${STEELARMOR_COST_MP}MP</span><span class="shop-item-note">ボス戦以外の間違いのたびに自動で1回分使われ、HP減少を防ぐ。${STEELARMOR_MAX_CHARGES}回使うと壊れてなくなる</span></div>${steelArmorActionHtml}</div>`;

    var treasureRowsHtml = treasureShopRowsHtml_();
    var spellbookRowsHtml = spellbookShopRowsHtml_();

    els.shopList.innerHTML = prayerRowHtml + herbRowHtml + bakuHerbRowHtml + chouHerbRowHtml + speedSeedRowHtml + ironWallRowHtml + steelArmorRowHtml + treasureRowsHtml + spellbookRowsHtml;
    els.shopList.querySelectorAll('[data-treasure-buy-key]').forEach(function (btn) {
      btn.addEventListener('click', function () { handleBuyTreasureKeyClick(btn.getAttribute('data-treasure-buy-key'), btn); });
    });
    els.shopList.querySelectorAll('[data-treasure-open]').forEach(function (btn) {
      btn.addEventListener('click', function () { handleOpenTreasureChestClick(btn.getAttribute('data-treasure-open'), btn); });
    });
    els.shopList.querySelectorAll('[data-treasure-sell-ring]').forEach(function (btn) {
      btn.addEventListener('click', function () { handleSellTreasureRingClick(btn.getAttribute('data-treasure-sell-ring'), btn); });
    });
    els.shopList.querySelectorAll('[data-spellbook-buy]').forEach(function (btn) {
      btn.addEventListener('click', function () { handleBuySpellbookClick(btn.getAttribute('data-spellbook-buy'), btn); });
    });
    var prayerBtn = document.getElementById('akrPrayerBtn');
    if (prayerBtn) prayerBtn.addEventListener('click', function () { handleAkrPrayerClick(prayerBtn); });
    var herbBtn = document.getElementById('buyHerbBtn');
    if (herbBtn) herbBtn.addEventListener('click', function () { handleBuyHerbClick(herbBtn); });
    var bakuHerbBtn = document.getElementById('buyBakuHerbBtn');
    if (bakuHerbBtn) bakuHerbBtn.addEventListener('click', function () { handleBuyBakuHerbClick(bakuHerbBtn); });
    var chouHerbBtn = document.getElementById('buyChouHerbBtn');
    if (chouHerbBtn) chouHerbBtn.addEventListener('click', function () { handleBuyChouHerbClick(chouHerbBtn); });
    var speedSeedBtn = document.getElementById('buySpeedSeedBtn');
    if (speedSeedBtn) speedSeedBtn.addEventListener('click', function () { handleBuySpeedSeedClick(speedSeedBtn); });
    var ironWallBtn = document.getElementById('buyIronWallBtn');
    if (ironWallBtn) ironWallBtn.addEventListener('click', function () { handleBuyIronWallClick(ironWallBtn); });
    var steelArmorBtn = document.getElementById('buySteelArmorBtn');
    if (steelArmorBtn) steelArmorBtn.addEventListener('click', function () { handleBuySteelArmorClick(steelArmorBtn); });
  }

  // 宝箱・鍵・指輪のなんでも屋UI。ティアごとに「鍵を買う」
  // 「宝箱を開ける」「指輪を売る」の3行を並べる。日付ゲート前は何も表示しない。
  function treasureShopRowsHtml_() {
    if (!isTreasureChestActive_()) return '';
    var items = state.treasureItems || {};
    var rowsHtml = ['bronze', 'silver', 'gold', 'rainbow'].map(function (tier) {
      var label = TREASURE_TIER_LABEL_[tier];
      var emoji = TREASURE_TIER_EMOJI_[tier];
      var chestCount = Number(items[treasureItemKey_('chest', tier)]) || 0;
      var keyCount = Number(items[treasureItemKey_('key', tier)]) || 0;
      var ringCount = Number(items[treasureItemKey_('ring', tier)]) || 0;
      var keyCost = TREASURE_KEY_COST_MP_[tier];
      var ringSell = TREASURE_RING_SELL_MP_[tier];
      var reward = TREASURE_CHEST_REWARD_[tier];

      var keyActionHtml = state.points >= keyCost
        ? `<button type="button" class="gift-redeem-btn" data-treasure-buy-key="${tier}">購入する</button>`
        : `<span class="gift-insufficient">MP不足</span>`;
      var keyRowHtml = `<div class="gift-row"><div class="gift-info"><span class="gift-label">${emoji} ${label}の鍵（所持: ${keyCount}個）</span><span class="gift-cost">${keyCost}MP</span></div>${keyActionHtml}</div>`;

      var openActionHtml = (chestCount > 0 && keyCount > 0)
        ? `<button type="button" class="gift-redeem-btn" data-treasure-open="${tier}">開ける</button>`
        : `<span class="gift-insufficient">${chestCount > 0 ? '鍵が必要' : '宝箱なし'}</span>`;
      var openRowHtml = `<div class="gift-row"><div class="gift-info"><span class="gift-label">${emoji} ${label}の宝箱（所持: ${chestCount}個）</span><span class="gift-cost">開けると+${reward.mp}MP・+${reward.hp}HP・${label}の指輪</span></div>${openActionHtml}</div>`;

      var sellActionHtml = ringCount > 0
        ? `<button type="button" class="gift-redeem-btn" data-treasure-sell-ring="${tier}">売却する</button>`
        : `<span class="gift-insufficient">未所持</span>`;
      var shieldCharges = RING_SHIELD_CHARGES_[tier];
      var shieldNoteHtml = shieldCharges
        ? `<span class="shop-item-note">持っているとボス戦のダメージを${shieldCharges}回防いでくれる（使い切ると壊れてなくなる）</span>`
        : '';
      var sellRowHtml = `<div class="gift-row"><div class="gift-info"><span class="gift-label">${emoji} ${label}の指輪（所持: ${ringCount}個）</span><span class="gift-cost">${ringSell}MPで売却</span>${shieldNoteHtml}</div>${sellActionHtml}</div>`;

      return keyRowHtml + openRowHtml + sellRowHtml;
    }).join('');
    var dropNote = (todayKey() >= TREASURE_EVENT_START_ && todayKey() <= TREASURE_EVENT_END_)
      ? '宝箱イベントデー中！レアキャラを倒すと5分の1の確率で宝箱ゲット！'
      : 'レアキャラを倒すと20分の1の確率で宝箱ゲット！（8/29・30はイベントデーで5分の1に）';
    return `<div class="shop-section-title">🗝️ 宝箱・鍵・指輪（${dropNote}）</div>` + rowsHtml;
  }

  function handleBuyTreasureKeyClick(tier, btn) {
    var session = loadSession();
    if (!session || !session.id) return;
    var cost = TREASURE_KEY_COST_MP_[tier];
    var label = TREASURE_TIER_LABEL_[tier];
    if (!window.confirm(`${label}の鍵を購入します（${cost}MP）。よろしいですか？`)) return;

    btn.disabled = true;
    apiPost('buyTreasureKey', { id: session.id, tier: tier }).then(function (res) {
      if (!res.ok) {
        var msg = res.error === 'insufficient_points' ? 'MPが不足しています。' : '購入に失敗しました。もう一度お試しください。';
        window.alert(msg);
        btn.disabled = false;
        return;
      }
      state.points = res.remainingPoints;
      state.treasureItems = res.treasureItems;
      saveGameState(state);
      updateGameHud();
      renderShopList();
      window.alert(`🗝️ ${label}の鍵を手に入れた！`);
    }).catch(function () {
      window.alert('通信に失敗しました。もう一度お試しください。');
      btn.disabled = false;
    });
  }

  function handleSellTreasureRingClick(tier, btn) {
    var session = loadSession();
    if (!session || !session.id) return;
    var gain = TREASURE_RING_SELL_MP_[tier];
    var label = TREASURE_TIER_LABEL_[tier];
    if (!window.confirm(`${label}の指輪を売却します（+${gain}MP）。よろしいですか？`)) return;

    btn.disabled = true;
    apiPost('sellTreasureRing', { id: session.id, tier: tier }).then(function (res) {
      if (!res.ok) {
        var msg = res.error === 'no_ring' ? '指輪を持っていません。' : '売却に失敗しました。もう一度お試しください。';
        window.alert(msg);
        btn.disabled = false;
        return;
      }
      state.points = res.remainingPoints;
      state.treasureItems = res.treasureItems;
      saveGameState(state);
      updateGameHud();
      renderShopList();
      window.alert(`💰 ${label}の指輪を売って+${gain}MP手に入れた！`);
    }).catch(function () {
      window.alert('通信に失敗しました。もう一度お試しください。');
      btn.disabled = false;
    });
  }

  function handleOpenTreasureChestClick(tier, btn) {
    var session = loadSession();
    if (!session || !session.id) return;
    var label = TREASURE_TIER_LABEL_[tier];
    if (!window.confirm(`${label}の宝箱を開けます（${label}の鍵を1個使います）。よろしいですか？`)) return;

    btn.disabled = true;
    var today = todayKey();
    if (state.pointsDate !== today) { state.pointsDate = today; state.pointsToday = 0; state.pointsTodayCalc = 0; state.pointsTodayWord = 0; }
    var reward = TREASURE_CHEST_REWARD_[tier];
    // 宝箱のMP報酬は(指輪の売却と違って)1日の上限100MP(計算50+文章題50)に
    // 含める。今日まだ獲得できる分だけをmpGrantとしてサーバーに伝える。
    var headroom = Math.max(0, (POINTS_DAILY_CAP_CALC + POINTS_DAILY_CAP_WORD) - (Number(state.pointsToday) || 0));
    var mpGrant = Math.min(reward.mp, headroom);
    apiPost('openTreasureChest', { id: session.id, tier: tier, mpGrant: mpGrant }).then(function (res) {
      if (!res.ok) {
        var msg = res.error === 'no_key' ? `${label}の鍵がありません。`
          : res.error === 'no_chest' ? `${label}の宝箱がありません。`
          : '宝箱を開けられませんでした。もう一度お試しください。';
        window.alert(msg);
        btn.disabled = false;
        return;
      }
      var granted = Number(res.mpGranted) || 0;
      state.points = res.remainingPoints;
      state.hp = res.hp;
      state.treasureItems = res.treasureItems;
      state.pointsToday = (Number(state.pointsToday) || 0) + granted;
      state.pointsTodayCalc = (Number(state.pointsTodayCalc) || 0) + granted;
      state.pointsDate = today;
      saveGameState(state);
      updateGameHud();
      renderShopList();
      var mpNote = granted < reward.mp ? `+${granted}MP（本日のMP上限のため一部のみ）` : `+${granted}MP`;
      window.alert(`🎁 ${label}の宝箱を開けた！ ${mpNote}・+${reward.hp}HP・${label}の指輪をゲット！`);
    }).catch(function () {
      window.alert('通信に失敗しました。もう一度お試しください。');
      btn.disabled = false;
    });
  }

  // 魔法の書のなんでも屋UI(9月/2周目のボス戦専用)。00001限定プレビュー。
  function spellbookShopRowsHtml_() {
    if (!isAdminSession_()) return '';
    var books = state.spellbooks || {};
    var rowsHtml = SPELLBOOK_ELEMENTS_.map(function (el) {
      var info = SPELLBOOK_INFO_[el];
      var count = Number(books[el]) || 0;
      var canAfford = state.points >= SPELLBOOK_COST_MP_;
      var actionHtml = canAfford
        ? `<button type="button" class="gift-redeem-btn" data-spellbook-buy="${el}">購入する</button>`
        : `<span class="gift-insufficient">MP不足</span>`;
      return `<div class="gift-row"><div class="gift-info"><span class="gift-label">${info.emoji} 魔法の書「${info.label}」（所持: ${count}冊）</span><span class="gift-cost">${SPELLBOOK_COST_MP_}MP</span><span class="shop-item-note">ステージ${info.stageId}のボスに有効。詠唱すると自分のHPが${SPELLBOOK_SELF_DAMAGE_}減り、次の問題に正解すると相手のHPを${info.dmg}減らす（不正解だとボスにかわされて不発）</span></div>${actionHtml}</div>`;
    }).join('');
    return `<div class="shop-section-title">📖 魔法の書（00001限定プレビュー中）</div>` + rowsHtml;
  }

  function handleBuySpellbookClick(element, btn) {
    var session = loadSession();
    if (!session || !session.id) return;
    var info = SPELLBOOK_INFO_[element];
    if (!info) return;
    if (!window.confirm(`魔法の書「${info.label}」を購入します（${SPELLBOOK_COST_MP_}MP）。よろしいですか？`)) return;

    btn.disabled = true;
    apiPost('buySpellbook', { id: session.id, element: element }).then(function (res) {
      if (!res.ok) {
        var msg = res.error === 'insufficient_points' ? 'MPが不足しています。' : '購入に失敗しました。もう一度お試しください。';
        window.alert(msg);
        btn.disabled = false;
        return;
      }
      state.points = res.remainingPoints;
      state.spellbooks = res.spellbooks;
      saveGameState(state);
      updateGameHud();
      renderShopList();
      window.alert(`📖 魔法の書「${info.label}」を手に入れた！`);
    }).catch(function () {
      window.alert('通信に失敗しました。もう一度お試しください。');
      btn.disabled = false;
    });
  }

  function handleAkrPrayerClick(btn) {
    var session = loadSession();
    if (!session || !session.id) return;
    if (!window.confirm(`AKRの祈りを受けます（${AKR_PRAYER_COST_MP}MP）。よろしいですか？`)) return;

    btn.disabled = true;
    apiPost('akrPrayer', { id: session.id }).then(function (res) {
      if (!res.ok) {
        var msg = '祈りの受付に失敗しました。もう一度お試しください。';
        if (res.error === 'insufficient_points') msg = 'MPが不足しています。';
        window.alert(msg);
        btn.disabled = false;
        return;
      }
      state.points = res.remainingPoints;
      state.cursed = false;
      saveGameState(state);
      updateGameHud();
      renderCurseBanner();
      renderShopList();
      window.alert('🙏 AKRの祈りが届き、ボン・ミスコの呪いが解けた！');
    }).catch(function () {
      window.alert('通信に失敗しました。もう一度お試しください。');
      btn.disabled = false;
    });
  }

  function handleBuyHerbClick(btn) {
    var session = loadSession();
    if (!session || !session.id) return;
    if (!window.confirm(`薬草を購入します（${HERB_COST_MP}MP）。HPが${HERB_HP_GAIN}増えます。よろしいですか？`)) return;

    btn.disabled = true;
    apiPost('buyHerb', { id: session.id }).then(function (res) {
      if (!res.ok) {
        var msg = '購入に失敗しました。もう一度お試しください。';
        if (res.error === 'insufficient_points') msg = 'MPが不足しています。';
        window.alert(msg);
        btn.disabled = false;
        return;
      }
      state.points = res.remainingPoints;
      state.hp = res.hp;
      saveGameState(state);
      updateGameHud();
      renderShopList();
      window.alert(`🌿 薬草を使った！HPが${HERB_HP_GAIN}増えた！`);
    }).catch(function () {
      window.alert('通信に失敗しました。もう一度お試しください。');
      btn.disabled = false;
    });
  }

  function handleBuyBakuHerbClick(btn) {
    var session = loadSession();
    if (!session || !session.id) return;
    if (!window.confirm(`爆裂薬草を購入します（${BAKUHERB_COST_MP}MP）。HPが${BAKUHERB_HP_GAIN}増えます。よろしいですか？`)) return;

    btn.disabled = true;
    apiPost('buyBakuHerb', { id: session.id }).then(function (res) {
      if (!res.ok) {
        var msg = '購入に失敗しました。もう一度お試しください。';
        if (res.error === 'insufficient_points') msg = 'MPが不足しています。';
        window.alert(msg);
        btn.disabled = false;
        return;
      }
      state.points = res.remainingPoints;
      state.hp = res.hp;
      saveGameState(state);
      updateGameHud();
      renderShopList();
      window.alert(`💥 爆裂薬草を使った！HPが${BAKUHERB_HP_GAIN}増えた！`);
    }).catch(function () {
      window.alert('通信に失敗しました。もう一度お試しください。');
      btn.disabled = false;
    });
  }

  function handleBuyChouHerbClick(btn) {
    var session = loadSession();
    if (!session || !session.id) return;
    if (!window.confirm(`超絶薬草を購入します（${CHOUHERB_COST_MP}MP）。HPが${CHOUHERB_HP_GAIN}増えます。よろしいですか？`)) return;

    btn.disabled = true;
    apiPost('buyChouHerb', { id: session.id }).then(function (res) {
      if (!res.ok) {
        var msg = '購入に失敗しました。もう一度お試しください。';
        if (res.error === 'insufficient_points') msg = 'MPが不足しています。';
        window.alert(msg);
        btn.disabled = false;
        return;
      }
      state.points = res.remainingPoints;
      state.hp = res.hp;
      saveGameState(state);
      updateGameHud();
      renderShopList();
      window.alert(`🌟 超絶薬草を使った！HPが${CHOUHERB_HP_GAIN}増えた！`);
    }).catch(function () {
      window.alert('通信に失敗しました。もう一度お試しください。');
      btn.disabled = false;
    });
  }

  function handleBuySpeedSeedClick(btn) {
    var session = loadSession();
    if (!session || !session.id) return;
    if (!window.confirm(`すばやさの種を購入します（${SPEEDSEED_COST_MP}MP）。逃げるタイプのレアキャラに間違えて逃げられそうになったとき、自動で1個使われて逃走を防ぎます。よろしいですか？`)) return;

    btn.disabled = true;
    apiPost('buySpeedSeed', { id: session.id }).then(function (res) {
      if (!res.ok) {
        var msg = '購入に失敗しました。もう一度お試しください。';
        if (res.error === 'insufficient_points') msg = 'MPが不足しています。';
        window.alert(msg);
        btn.disabled = false;
        return;
      }
      state.points = res.remainingPoints;
      state.speedSeedCount = res.speedSeedCount;
      saveGameState(state);
      updateGameHud();
      renderShopList();
      renderItems();
      window.alert(`🌱 すばやさの種を手に入れた！（所持数: ${state.speedSeedCount}個）`);
    }).catch(function () {
      window.alert('通信に失敗しました。もう一度お試しください。');
      btn.disabled = false;
    });
  }

  function handleBuyIronWallClick(btn) {
    var session = loadSession();
    if (!session || !session.id) return;
    if (!window.confirm(`鉄壁の盾を購入します（${IRONWALL_COST_MP}MP）。ボス戦で間違えるたびに自動で1回分使われ、そのミスのダメージが半分になります（最大${IRONWALL_MAX_CHARGES}回、使い切ると壊れてなくなります）。よろしいですか？`)) return;

    btn.disabled = true;
    apiPost('buyIronWall', { id: session.id }).then(function (res) {
      if (!res.ok) {
        var msg = '購入に失敗しました。もう一度お試しください。';
        if (res.error === 'insufficient_points') msg = 'MPが不足しています。';
        else if (res.error === 'already_owned') msg = 'すでに鉄壁の盾を持っています。使い切ってから購入してください。';
        window.alert(msg);
        btn.disabled = false;
        return;
      }
      state.points = res.remainingPoints;
      state.ironWallCharges = res.ironWallCharges;
      saveGameState(state);
      updateGameHud();
      renderShopList();
      renderItems();
      window.alert(`🛡️ 鉄壁の盾を手に入れた！（残り${state.ironWallCharges}回分）`);
    }).catch(function () {
      window.alert('通信に失敗しました。もう一度お試しください。');
      btn.disabled = false;
    });
  }

  function handleBuySteelArmorClick(btn) {
    var session = loadSession();
    if (!session || !session.id) return;
    if (!window.confirm(`鋼の鎧を購入します（${STEELARMOR_COST_MP}MP）。ボス戦以外の間違いのたびに自動で1回分使われ、HP減少を防ぎます（最大${STEELARMOR_MAX_CHARGES}回、使い切ると壊れてなくなります）。よろしいですか？`)) return;

    btn.disabled = true;
    apiPost('buySteelArmor', { id: session.id }).then(function (res) {
      if (!res.ok) {
        var msg = '購入に失敗しました。もう一度お試しください。';
        if (res.error === 'insufficient_points') msg = 'MPが不足しています。';
        else if (res.error === 'already_owned') msg = 'すでに鋼の鎧を持っています。使い切ってから購入してください。';
        window.alert(msg);
        btn.disabled = false;
        return;
      }
      state.points = res.remainingPoints;
      state.steelArmorCharges = res.steelArmorCharges;
      saveGameState(state);
      updateGameHud();
      renderShopList();
      renderItems();
      window.alert(`🛡️ 鋼の鎧を手に入れた！（残り${state.steelArmorCharges}回分）`);
    }).catch(function () {
      window.alert('通信に失敗しました。もう一度お試しください。');
      btn.disabled = false;
    });
  }

  function toggleShop() {
    var isHidden = els.shopPanel.hasAttribute('hidden');
    if (!isHidden) { els.shopPanel.setAttribute('hidden', ''); return; }
    els.historyPanel.setAttribute('hidden', '');
    els.rankingPanel.setAttribute('hidden', '');
    els.giftPanel.setAttribute('hidden', '');
    els.prefecturePanel.setAttribute('hidden', '');
    els.avatarPanel.setAttribute('hidden', '');
    els.worldPanel.setAttribute('hidden', '');
    els.grantPanel.setAttribute('hidden', '');
    els.testPhotoPanel.setAttribute('hidden', '');
    els.weeklyQuizPanel.setAttribute('hidden', '');
    if (els.bakuretsuQuizPanel) els.bakuretsuQuizPanel.setAttribute('hidden', '');
    els.withdrawPanel.setAttribute('hidden', '');
    if (els.teamEventPanel) els.teamEventPanel.setAttribute('hidden', '');

    els.shopPanel.removeAttribute('hidden');
    renderShopList();
  }

  /* ---------- 47都道府県制覇（特別夏バージョン） ---------- */

  var prefectureMapInjected = false;

  function renderPrefectureMap() {
    if (PREFECTURE_DATA.length === 0) {
      els.prefectureProgress.textContent = '地図データの読み込みに失敗しました。ページを再読み込みしてください。';
      return;
    }
    if (!prefectureMapInjected) {
      els.prefectureMapWrap.innerHTML = PREFECTURE_MAP_SVG_SAFE;
      prefectureMapInjected = true;
    }
    var count = state.prefectureCount;
    var svgEl = els.prefectureMapWrap.querySelector('svg');
    if (svgEl) {
      PREFECTURE_DATA.forEach(function (p) {
        var el = svgEl.querySelector('[data-code="' + p.code + '"]');
        if (!el) return;
        el.classList.toggle('unlocked', p.code <= count);
      });
    }
    els.prefectureProgress.textContent = count >= 47
      ? '🎉 47/47 都道府県すべて制覇しました！おめでとう！ 🎉'
      : count + ' / 47 都道府県を制覇！（次は「' + PREFECTURE_DATA[count].name + '」）';
    els.prefectureList.innerHTML = PREFECTURE_DATA.map(function (p) {
      if (p.code > count) {
        return '<div class="prefecture-row is-locked"><span class="prefecture-row-name">？？？</span></div>';
      }
      return '<div class="prefecture-row is-unlocked"><span class="prefecture-row-name">' + p.code + '. ' + p.name + '</span><span class="prefecture-row-trivia">' + p.trivia + '</span></div>';
    }).join('');
  }

  function togglePrefecture() {
    var isHidden = els.prefecturePanel.hasAttribute('hidden');
    if (!isHidden) { els.prefecturePanel.setAttribute('hidden', ''); return; }
    els.historyPanel.setAttribute('hidden', '');
    els.rankingPanel.setAttribute('hidden', '');
    els.giftPanel.setAttribute('hidden', '');
    els.avatarPanel.setAttribute('hidden', '');
    els.worldPanel.setAttribute('hidden', '');
    els.grantPanel.setAttribute('hidden', '');
    els.testPhotoPanel.setAttribute('hidden', '');
    els.weeklyQuizPanel.setAttribute('hidden', '');
    if (els.bakuretsuQuizPanel) els.bakuretsuQuizPanel.setAttribute('hidden', '');
    els.withdrawPanel.setAttribute('hidden', '');
    if (els.teamEventPanel) els.teamEventPanel.setAttribute('hidden', '');
    els.shopPanel.setAttribute('hidden', '');

    els.prefecturePanel.removeAttribute('hidden');
    renderPrefectureMap();
  }

  /* ---------- アバター作成 ---------- */

  function avatarUnlocked() {
    return state.level >= AVATAR_LEVEL_THRESHOLD || state.points >= AVATAR_MP_THRESHOLD;
  }

  var avatarDraft = null;
  var avatarPresetDraft = null;
  var avatarMode = 'parts';

  function setAvatarMode_(mode) {
    avatarMode = mode;
    els.avatarPresetSection.hidden = mode !== 'preset';
    els.avatarPartsSection.hidden = mode !== 'parts';
    els.avatarModePresetBtn.classList.toggle('is-active', mode === 'preset');
    els.avatarModePartsBtn.classList.toggle('is-active', mode === 'parts');
  }

  function renderAvatarPresetGrid() {
    els.avatarPresetPreview.innerHTML = avatarPresetDraft ? avatarDisplayHtml_({ preset: avatarPresetDraft }) : '';
    els.avatarPresetGrid.innerHTML = '';
    AVATAR_PRESETS.forEach(function (preset) {
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'avatar-preset-item' + (avatarPresetDraft === preset.id ? ' is-selected' : '');
      item.innerHTML = `<img src="${preset.img}" alt="${preset.label}"><span class="avatar-preset-item-label">${preset.label}</span>`;
      item.addEventListener('click', function () {
        avatarPresetDraft = preset.id;
        renderAvatarPresetGrid();
      });
      els.avatarPresetGrid.appendChild(item);
    });
  }

  function renderAvatarSwatchRow(rowEl, group, options, isColor) {
    rowEl.innerHTML = '';
    options.forEach(function (opt) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'avatar-swatch' + (isColor ? ' is-color' : '');
      btn.title = opt.name;
      btn.dataset.value = opt.id;
      if (isColor) {
        btn.style.background = opt.hex;
      } else {
        var previewSel = Object.assign({}, avatarDraft, group === 'hair' ? { hair: opt.id } : { face: opt.id });
        btn.innerHTML = buildAvatarSvgSafe(previewSel);
      }
      btn.classList.toggle('is-selected', avatarDraft[group] === opt.id);
      btn.addEventListener('click', function () {
        avatarDraft[group] = opt.id;
        renderAvatarBuilder();
      });
      rowEl.appendChild(btn);
    });
  }

  function renderAvatarBuilder() {
    els.avatarPreview.innerHTML = buildAvatarSvgSafe(avatarDraft);
    renderAvatarSwatchRow(els.avatarHairRow, 'hair', AVATAR_HAIR_SAFE, false);
    renderAvatarSwatchRow(els.avatarFaceRow, 'face', AVATAR_FACE_SAFE, false);
    renderAvatarSwatchRow(els.avatarSkinRow, 'skin', AVATAR_SKIN_COLORS_SAFE, true);
    renderAvatarSwatchRow(els.avatarHairColorRow, 'hairColor', AVATAR_HAIR_COLORS_SAFE, true);
    renderAvatarSwatchRow(els.avatarOutfitColorRow, 'outfitColor', AVATAR_OUTFIT_COLORS_SAFE, true);
  }

  function renderAvatarPanel() {
    var unlocked = avatarUnlocked();
    els.avatarLocked.hidden = unlocked;
    els.avatarBuilder.hidden = !unlocked;
    if (!unlocked) {
      els.avatarLockedText.textContent = `レベル${AVATAR_LEVEL_THRESHOLD}、またはMP${AVATAR_MP_THRESHOLD}でアバターが作れるようになります。（現在: レベル${state.level} / MP${state.points}）`;
      return;
    }
    if (AVATAR_HAIR_SAFE.length === 0) {
      els.avatarLocked.hidden = false;
      els.avatarBuilder.hidden = true;
      els.avatarLockedText.textContent = 'アバターデータの読み込みに失敗しました。ページを再読み込みしてください。';
      return;
    }
    avatarDraft = Object.assign({}, AVATAR_DEFAULT_SELECTION, state.avatar || {});
    avatarPresetDraft = (state.avatar && state.avatar.preset) ? state.avatar.preset : null;
    els.avatarSaveMsg.hidden = true;
    // イラストプリセット方式は画像素材がまだ揃っていないため00001限定プレビュー中。
    // 本番公開時にこのisAdminSession_()チェックを外す。
    els.avatarModeTabs.hidden = !isAdminSession_();
    setAvatarMode_((isAdminSession_() && avatarPresetDraft) ? 'preset' : 'parts');
    renderAvatarPresetGrid();
    renderAvatarBuilder();
  }

  function toggleAvatar() {
    var isHidden = els.avatarPanel.hasAttribute('hidden');
    if (!isHidden) { els.avatarPanel.setAttribute('hidden', ''); return; }
    els.historyPanel.setAttribute('hidden', '');
    els.rankingPanel.setAttribute('hidden', '');
    els.giftPanel.setAttribute('hidden', '');
    els.prefecturePanel.setAttribute('hidden', '');
    els.worldPanel.setAttribute('hidden', '');
    els.grantPanel.setAttribute('hidden', '');
    els.testPhotoPanel.setAttribute('hidden', '');
    els.weeklyQuizPanel.setAttribute('hidden', '');
    if (els.bakuretsuQuizPanel) els.bakuretsuQuizPanel.setAttribute('hidden', '');
    els.withdrawPanel.setAttribute('hidden', '');
    if (els.teamEventPanel) els.teamEventPanel.setAttribute('hidden', '');
    els.shopPanel.setAttribute('hidden', '');

    els.avatarPanel.removeAttribute('hidden');
    renderAvatarPanel();
  }

  /* ---------- 世界制覇 ---------- */

  var worldMapInjected = false;
  var worldMapLoading = false;

  var WORLD_REGION_KEYS = ['eastasia', 'europe', 'africa', 'middleeast', 'southasia', 'oceania', 'northamerica', 'southamerica', 'pacific'];

  function applyWorldMapColors(count) {
    if (!worldMapInjected) return;
    WORLD_DATA.forEach(function (c) {
      if (!c.iso) return;
      var el = els.worldMapWrap.querySelector('[id="' + c.iso + '"]');
      if (!el) return;
      var unlocked = c.code <= count;
      el.classList.toggle('is-unlocked-country', unlocked);
      WORLD_REGION_KEYS.forEach(function (r) { el.classList.toggle('region-' + r, unlocked && c.region === r); });
    });
    syncWorldMapZoomClone();
  }

  // 世界一周のステージ(大陸)ボス戦のルール。
  // ・各ステージの最後の国にはボスがいて、30問連続正解で撃破。
  // ・撃破するまでは、そのステージの最後の国(および以降の国)は制覇できない。
  // ・不正解のたびにHPが減る(ステージが進むごとに100ずつ増える: 100/200/300/400...)。
  // ・HPが0になると、そのボス戦は最初から(0/30)やり直しになる。
  // ・撃破するとその国の守護者が仲間になる(worldAllies)。
  const WORLD_BOSS_STREAK_REQUIRED = 30;
  const WORLD_BOSS_MIN_ELIGIBLE_CATEGORIES = 10;
  function worldBossHpPenalty(stageId) {
    return stageId * 100;
  }
  // 指定ステージの最後の国(=ボスの国)の国コードを返す。
  function worldBossCountryCodeForStage(stageId) {
    if (typeof WORLD_DATA === 'undefined' || !Array.isArray(WORLD_DATA)) return 0;
    var maxCode = 0;
    WORLD_DATA.forEach(function (c) { if (c.stage === stageId && c.code > maxCode) maxCode = c.code; });
    return maxCode;
  }
  function worldBossCountryForStage(stageId) {
    var code = worldBossCountryCodeForStage(stageId);
    return (typeof WORLD_DATA !== 'undefined' && Array.isArray(WORLD_DATA)) ? WORLD_DATA.find(function (c) { return c.code === code; }) : null;
  }
  function isoToFlagEmoji(iso) {
    if (!iso || iso.length !== 2) return '👑';
    var chars = iso.toUpperCase().split('').map(function (ch) { return 0x1F1E6 + (ch.charCodeAt(0) - 65); });
    return String.fromCodePoint(chars[0], chars[1]);
  }
  // ステージごとの専用ボスキャラ(連続撃破シーケンス)。通常は1体(30問連続正解)だが、
  // ステージ4のように複数体を順番に倒す形式もある。streakはそのボスに必要な
  // 連続正解数。用意が無いステージ/シーケンス外は、その国名から汎用の
  // 「(国名)の守護者」表示にフォールバックする。
  const WORLD_BOSS_SEQUENCES = {
    1: [{ streak: 30, id: 'wboss_baby' }],
    2: [{ streak: 30, id: 'wboss_hebitsukai' }],
    3: [{ streak: 30, id: 'wboss_suijobike' }],
    4: [
      { streak: 10, id: 'wboss_fullswing' },
      { streak: 20, id: 'wboss_chuni' },
      { streak: 30, id: 'wboss_sensei' },
    ],
  };
  // 世界一周2周目(9月〜)専用のボス撃破に必要な連続正解数(=ボスのHP)。ボスキャラ自体は
  // 1周目と共通(wboss_*)だが、9月ステージでは各ボスに属性が設定され、対応する
  // 魔法の書(SPELLBOOK_INFO_)でダメージを与えられる。ステージ4(大地・自然・光闇)の
  // 書はまだ未実装(2026-08-24時点、追って追加予定)。
  const WORLD_BOSS_SEQUENCES_LAP2 = {
    1: [{ streak: 300, id: 'wboss_baby' }],
    2: [{ streak: 400, id: 'wboss_hebitsukai' }],
    3: [{ streak: 500, id: 'wboss_suijobike' }],
    4: [
      { streak: 500, id: 'wboss_fullswing' },
      { streak: 1000, id: 'wboss_chuni' },
      { streak: 2000, id: 'wboss_sensei' },
    ],
  };
  function worldBossSequenceForStage(stageId) {
    var source = (Number(state.worldLap) || 1) >= 2 ? WORLD_BOSS_SEQUENCES_LAP2 : WORLD_BOSS_SEQUENCES;
    return source[stageId] || [{ streak: WORLD_BOSS_STREAK_REQUIRED, id: null }];
  }
  // 9月ステージ(2周目)のボスを倒すとMPは増えない代わりに+300HP。
  const WORLD_BOSS_LAP2_HP_BONUS_ = 300;
  // WORLD_BOSS_SEQUENCES(_LAP2)のstreakは「ボスのHP」。1問正解するたびに
  // 与えるダメージは周によって変わる。1周目は1ダメージ(HP30=30問)、
  // 2周目は10ダメージ(HP300=30問)で、必要な問題数は同じだが、2周目は
  // 魔法の書(1冊50ダメージ=5問分)でHPを直接削れるようになっている。
  const WORLD_BOSS_DAMAGE_PER_HIT_LAP2_ = 10;
  function worldBossDamagePerHit_() {
    return (Number(state.worldLap) || 1) >= 2 ? WORLD_BOSS_DAMAGE_PER_HIT_LAP2_ : 1;
  }
  // 今のボスの残りHP。与えたダメージは累積で、不正解で連続正解数が0に戻っても
  // ボスのHPは戻らない(state.worldBossDamageに貯めていく)。
  function worldBossRemainingHp_(stageId, subIndex) {
    const sub = worldBossCurrentSubBoss(stageId, subIndex);
    if (!sub) return 0;
    return Math.max(0, sub.streak - (Number(state.worldBossDamage) || 0));
  }
  // 魔法の書(2周目のボス戦専用消費アイテム)。なんでも屋で100MPで購入し、対応する
  // 属性のボス戦で1冊消費して詠唱する。詠唱すると自分のHPが常に10減り、その直後の
  // 問題に正解して初めてボスにダメージが入る(不正解だとボスにかわされて不発になる)。
  // ステージ4(大地・自然・光闇)の書は未実装。
  const SPELLBOOK_ELEMENTS_ = ['fire', 'ice', 'thunder'];
  const SPELLBOOK_COST_MP_ = 100;
  const SPELLBOOK_SELF_DAMAGE_ = 10;
  const SPELLBOOK_INFO_ = {
    fire: { label: 'ファイアボール', emoji: '🔥', dmg: 50, stageId: 1 },
    ice: { label: 'アイスランス', emoji: '❄️', dmg: 50, stageId: 2 },
    thunder: { label: 'サンダー', emoji: '⚡', dmg: 50, stageId: 3 },
  };
  // 現在挑戦中のボスの属性(ステージ1〜3のみ対応、ステージ4は未定でnullを返す)。
  function currentWorldBossElement_() {
    if (!state.worldBossActiveStage || (Number(state.worldLap) || 1) < 2) return null;
    var el = null;
    SPELLBOOK_ELEMENTS_.forEach(function (key) {
      if (SPELLBOOK_INFO_[key].stageId === state.worldBossActiveStage) el = key;
    });
    return el;
  }
  function worldBossCurrentSubBoss(stageId, subIndex) {
    const seq = worldBossSequenceForStage(stageId);
    return seq[Math.min(subIndex || 0, seq.length - 1)];
  }
  function worldBossEnemyDisplay(stageId, subIndex) {
    const sub = worldBossCurrentSubBoss(stageId, subIndex);
    const rt = sub && sub.id ? RARE_TYPES[sub.id] : null;
    if (rt) return { name: rt.name, img: rt.img, lines: rt.lines };
    var country = worldBossCountryForStage(stageId);
    if (!country) return { emoji: '👑', name: 'ボス' };
    return { emoji: isoToFlagEmoji(country.iso), name: country.name + 'の守護者' };
  }

  // ボス撃破時の共通処理(コレクション登録・次のボスへの進行・ステージクリア判定)。
  // 通常の正解での撃破と、魔法でトドメを刺した場合の両方から呼ばれる。
  function finishWorldBossWin_(stageId, subIndex) {
    const session = loadSession();
    const sequence = worldBossSequenceForStage(stageId);
    const bossDisplay = worldBossEnemyDisplay(stageId, subIndex);
    const bossDefeatQuoteHtml = (bossDisplay.lines && bossDisplay.lines.defeat) ? `<div class="enemy-quote-banner">${bossDisplay.lines.defeat}</div>` : '';
    const defeatedSub = worldBossCurrentSubBoss(stageId, subIndex);
    let collectionGainedHtml = '';
    if (defeatedSub && defeatedSub.id) {
      state.rareDefeats[defeatedSub.id] = (state.rareDefeats[defeatedSub.id] || 0) + 1;
      if (state.rareCollected.indexOf(defeatedSub.id) === -1) {
        state.rareCollected.push(defeatedSub.id);
        collectionGainedHtml = `<div class="item-gain-banner">🎖️ レアキャラ「${bossDisplay.name}」をコレクションにゲットした！🎖️</div>`;
      }
    }
    // 9月の世界一周(2周目)限定：ボスを倒してもMPは増えないが+300HP。
    let hpBonusGainedHtml = '';
    if ((Number(state.worldLap) || 1) >= 2 && defeatedSub && defeatedSub.id) {
      state.hp = (Number(state.hp) || 0) + WORLD_BOSS_LAP2_HP_BONUS_;
      hpBonusGainedHtml = `<div class="item-gain-banner">💚 +${WORLD_BOSS_LAP2_HP_BONUS_}HP！</div>`;
    }
    // 次のボスへは持ち越さない(魔法で与えたダメージも撃破と同時にリセット)。
    state.streak = 0;
    state.worldPendingSpell = null;
    state.worldBossDamage = 0;
    const nextSubIndex = subIndex + 1;
    let winHtml;
    if (nextSubIndex >= sequence.length) {
      const country = worldBossCountryForStage(stageId);
      state.worldBossDefeated[stageId] = true;
      if (country && state.worldAllies.indexOf(country.code) === -1) state.worldAllies.push(country.code);
      state.worldBossSubIndex[stageId] = 0;
      state.worldBossActiveStage = null;
      let titleGainedHtml = '';
      if (stageId === 4 && !state.mathGodTitleEarned) {
        state.mathGodTitleEarned = true;
        if (session && session.name) renderUserGreeting(session.name);
        titleGainedHtml = `<div class="item-gain-banner">🏆 称号【数学の神】を獲得した！🏆</div>`;
      }
      saveGameState(state);
      if (session && session.id) {
        apiPost('syncPoints', buildProgressSyncPayload(session.id)).catch(function () { });
      }
      winHtml = `<div class="win-banner">🎉 ボス「${bossDisplay.name}」を倒した！${bossDisplay.name}が仲間になった！🎉</div>${bossDefeatQuoteHtml}${collectionGainedHtml}${hpBonusGainedHtml}${titleGainedHtml}`;
    } else {
      state.worldBossSubIndex[stageId] = nextSubIndex;
      saveGameState(state);
      if (session && session.id) {
        apiPost('syncPoints', buildProgressSyncPayload(session.id)).catch(function () { });
      }
      const nextBossDisplay = worldBossEnemyDisplay(stageId, nextSubIndex);
      winHtml = `<div class="win-banner">🎉 ボス「${bossDisplay.name}」を倒した！🎉</div>${bossDefeatQuoteHtml}${collectionGainedHtml}${hpBonusGainedHtml}<div class="enemy-quote-banner">次のボス「${nextBossDisplay.name}」が立ちはだかる！</div>`;
    }
    return winHtml;
  }

  // 「魔法を使う」ボタンの表示可否(ボス戦中・今のボスに対応する魔法の書を
  // 1冊以上持っている場合だけ表示する。詠唱済みで結果待ちの間は非表示)。
  function updateWorldSpellBtnVisibility_() {
    if (!els.worldSpellBtn) return;
    if (!isAdminSession_()) { els.worldSpellBtn.hidden = true; return; }
    if (state.worldPendingSpell) { els.worldSpellBtn.hidden = true; return; }
    const element = currentWorldBossElement_();
    const info = element ? SPELLBOOK_INFO_[element] : null;
    const count = info ? (Number((state.spellbooks || {})[element]) || 0) : 0;
    if (info && count > 0) {
      els.worldSpellBtn.hidden = false;
      els.worldSpellBtn.textContent = `${info.emoji} ${info.label}を使う（残り${count}冊）`;
    } else {
      els.worldSpellBtn.hidden = true;
    }
  }

  // 魔法の書を1冊消費して詠唱する。ダメージはすぐには入らず、自分のHPが
  // SPELLBOOK_SELF_DAMAGE_だけ先に減る。次に答える問題に正解して初めてボスに
  // ダメージが入り(handleAnswerのisCorrect側で解決)、不正解だとボスにかわされて
  // 不発になる(handleAnswerの不正解側で解決)。
  function castWorldSpell_() {
    if (state.worldPendingSpell) return;
    const element = currentWorldBossElement_();
    if (!element) return;
    const info = SPELLBOOK_INFO_[element];
    const count = Number((state.spellbooks || {})[element]) || 0;
    if (count <= 0) return;
    state.spellbooks[element] = count - 1;
    state.worldPendingSpell = element;
    state.hp = Math.max(0, (Number(state.hp) || 0) - SPELLBOOK_SELF_DAMAGE_);
    saveGameState(state);
    const session = loadSession();
    if (session && session.id) {
      apiPost('syncPoints', buildProgressSyncPayload(session.id)).catch(function () { });
    }
    els.feedback.innerHTML = `<span class="fb-result">${info.emoji} ${info.label}を詠唱！（自分のHPが${SPELLBOOK_SELF_DAMAGE_}減った。残りHP: ${state.hp}）次の問題に正解すればボスに${info.dmg}ダメージ！不正解だとかわされてしまう…</span>`;
    els.feedback.classList.remove('incorrect');
    els.feedback.classList.add('correct');
    updateGameHud();
    if (!els.worldPanel.hasAttribute('hidden')) renderWorldPanel();
  }

  // 世界一周サイコロ方式は2026-09-01から開始(生徒への告知済みの開始日)。
  // それまでは従来どおりレベルからの自動計算(legacyWorldCountForLevel_)を使う。
  var WORLD_DICE_MODE_START_ = '2026-09-01';
  function isWorldDiceModeActive_() {
    return todayKey() >= WORLD_DICE_MODE_START_;
  }
  // 世界旅行編：2026-09-01以降はレベルが10上がるごとにサイコロ(1〜6)を振って、
  // 偶数ならその数だけヵ国を進め、奇数ならその数だけ戻る(state.worldCountryが
  // サイコロで増減する実際の位置。rollWorldCountryDice_を参照)。それまでは
  // 従来どおりレベルから毎回自動計算する。
  // 2周目以降はworldLapStartLevelがその周の開始レベルになる(レベル自体はリセットしない)。
  // また各ステージの最後の国(ボス)は、ボスを撃破する(worldBossDefeated)までは
  // 制覇できないようキャップする。
  function worldCountForLevel(level) {
    if (typeof WORLD_DATA === 'undefined' || !Array.isArray(WORLD_DATA) || WORLD_DATA.length === 0) return 0;
    var lapStart = (state && Number(state.worldLapStartLevel)) || 100;
    var raw = isWorldDiceModeActive_()
      ? Math.max(0, Math.min(WORLD_DATA.length, Number(state && state.worldCountry) || 0))
      : legacyWorldCountForLevel_(level, lapStart);
    var defeated = (state && state.worldBossDefeated) || {};
    for (var i = 0; i < WORLD_STAGES.length; i++) {
      var stage = WORLD_STAGES[i];
      var bossCode = worldBossCountryCodeForStage(stage.id);
      if (bossCode > 0 && raw >= bossCode && !defeated[stage.id]) {
        return bossCode - 1;
      }
    }
    return raw;
  }
  // サイコロ方式が始まる前(または始まった後の非アクティブ期間には発生しないが念の
  // ため)の「レベルから自動計算」。isWorldDiceModeActive_()がfalseの間、
  // worldCountForLevelはこの関数の値をそのまま返す。
  function legacyWorldCountForLevel_(level, lapStart) {
    if (typeof WORLD_DATA === 'undefined' || !Array.isArray(WORLD_DATA) || WORLD_DATA.length === 0) return 0;
    var effectiveLapStart = Math.max(100, Number(lapStart) || 100);
    if (level < effectiveLapStart) return 0;
    return Math.min(WORLD_DATA.length, Math.floor((level - effectiveLapStart) / 10) + 1);
  }
  // 既に撃破済みのボスの国コードより手前には、サイコロで戻っても下がらない下限。
  function worldCountryFloor_() {
    if (typeof WORLD_STAGES === 'undefined' || !Array.isArray(WORLD_STAGES)) return 0;
    var defeated = (state && state.worldBossDefeated) || {};
    var floor = 0;
    for (var i = 0; i < WORLD_STAGES.length; i++) {
      var stage = WORLD_STAGES[i];
      if (defeated[stage.id]) {
        var bossCode = worldBossCountryCodeForStage(stage.id);
        if (bossCode > floor) floor = bossCode;
      }
    }
    return floor;
  }
  // 2026-09-01より前：state.worldCountryを常にlegacyWorldCountForLevel_と同期させて
  // おくだけ(サイコロは振らない)。これにより、9月になった瞬間の最初のダイスロールが
  // その時点の正しい位置から始まる。
  // 2026-09-01以降：レベルがoldLevel→newLevelに上がる間に「10レベルごと」の節目を
  // 何回またいだかを数え、その回数分だけサイコロ(1〜6)を振ってstate.worldCountryを
  // 増減させる。最初にlapStartへ到達する瞬間(1ヵ国目)だけは、旧仕様どおりサイコロ
  // 無しで自動的に手に入る。戻り値はサイコロの結果を伝える演出用HTML(無ければ'')。
  function rollWorldCountryDice_(oldLevel, newLevel) {
    if (typeof WORLD_DATA === 'undefined' || !Array.isArray(WORLD_DATA) || WORLD_DATA.length === 0) return '';
    var lapStart = Math.max(100, (state && Number(state.worldLapStartLevel)) || 100);
    if (!isWorldDiceModeActive_()) {
      state.worldCountry = legacyWorldCountForLevel_(newLevel, lapStart);
      return '';
    }
    var oldThreshold = oldLevel >= lapStart ? Math.floor((oldLevel - lapStart) / 10) : -1;
    var newThreshold = newLevel >= lapStart ? Math.floor((newLevel - lapStart) / 10) : -1;
    if (newThreshold <= oldThreshold) return '';
    if (oldThreshold < 0 && newThreshold >= 0) {
      state.worldCountry = Math.max(Number(state.worldCountry) || 0, 1);
      oldThreshold = 0;
    }
    var rollsToMake = Math.max(0, newThreshold - oldThreshold);
    for (var i = 0; i < rollsToMake; i++) {
      rollOnceWorldCountryDice_();
    }
    // サイコロ演出は専用モーダル(worldDiceModal)で見せるため、win-banner側の
    // HTMLは返さない(呼び出し元はshowNextWorldDiceRoll_をDOM更新後に呼ぶ)。
    return '';
  }
  // サイコロを1回だけ振ってstate.worldCountryを増減させ、結果をキューに積む。
  // rollWorldCountryDice_(通常のレベルアップ時)と、00001限定のテスト表示ボタンの
  // 両方から呼ばれる共通処理。
  function rollOnceWorldCountryDice_() {
    var die = randInt(1, 6);
    var isEven = die % 2 === 0;
    var delta = isEven ? die : -die;
    var before = Number(state.worldCountry) || 0;
    var floor = worldCountryFloor_();
    var after = Math.max(floor, Math.min((typeof WORLD_DATA !== 'undefined' ? WORLD_DATA.length : 100), before + delta));
    state.worldCountry = after;
    enqueueWorldDiceRoll_({ die: die, isEven: isEven, before: before, after: after });
  }
  // サイコロを振った結果を1件ずつ順番に見せるためのキュー。1回のレベルアップで
  // 複数回サイコロを振ることがあるため(例: 一気に20レベル上がった等)、
  // showNextWorldDiceRoll_で1件ずつモーダル表示する。
  var worldDiceRollQueue_ = [];
  var worldDiceRollTimer_ = null;
  function enqueueWorldDiceRoll_(info) {
    worldDiceRollQueue_.push(info);
  }
  function worldDiceResultText_(info) {
    if (info.isEven) {
      return `出た目：${info.die}（偶数）\n${info.die}ヵ国分すすんだ！`;
    } else if (info.after < info.before) {
      return `出た目：${info.die}（奇数）\n${info.before - info.after}ヵ国分もどってしまった…`;
    }
    return `出た目：${info.die}（奇数）\nでも、倒したボスより手前にはもどらなかった！`;
  }
  var WORLD_DICE_FACES_ = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  function showNextWorldDiceRoll_() {
    if (!els.worldDiceModal || worldDiceRollQueue_.length === 0) return;
    var info = worldDiceRollQueue_.shift();
    els.worldDiceModal.hidden = false;
    els.worldDiceCloseBtn.textContent = worldDiceRollQueue_.length > 0 ? 'つぎへ' : 'とじる';
    els.worldDiceResultText.textContent = '';
    els.worldDiceFace.textContent = '🎲';
    els.worldDiceFace.classList.add('is-rolling');
    var ticks = 0;
    if (worldDiceRollTimer_) clearInterval(worldDiceRollTimer_);
    worldDiceRollTimer_ = setInterval(function () {
      els.worldDiceFace.textContent = WORLD_DICE_FACES_[randInt(0, 5)];
      ticks++;
      if (ticks >= 9) {
        clearInterval(worldDiceRollTimer_);
        worldDiceRollTimer_ = null;
        els.worldDiceFace.classList.remove('is-rolling');
        els.worldDiceFace.textContent = WORLD_DICE_FACES_[info.die - 1];
        els.worldDiceResultText.textContent = worldDiceResultText_(info);
      }
    }, 80);
  }
  // 現在、挑戦可能な(まだ倒していない)ボスのステージを返す。無ければnull。
  function currentChallengeableBossStage() {
    if (typeof WORLD_DATA === 'undefined' || !Array.isArray(WORLD_DATA) || WORLD_DATA.length === 0) return null;
    var count = worldCountForLevel(state.level);
    var defeated = state.worldBossDefeated || {};
    for (var i = 0; i < WORLD_STAGES.length; i++) {
      var stage = WORLD_STAGES[i];
      var bossCode = worldBossCountryCodeForStage(stage.id);
      if (bossCode > 0 && count === bossCode - 1 && !defeated[stage.id]) {
        return stage;
      }
    }
    return null;
  }

  // 国ごとの専用ネタ(funnyMoment)が無い場合の、AKRの旅先ハプニング汎用ネタ。
  var WORLD_GENERIC_FUNNY_MOMENTS = [
    'AKRが時差ボケで、ずっとあくびをしている。',
    'AKRが現地の言葉が分からず、ジェスチャーだけで頑張っている。',
    'AKRがスーツケースを開けたら、お土産で溢れかえっていた。',
    'AKRが空港の乗り換えで迷子になりかける。',
    'AKRが現地の激辛料理に挑戦して、涙目になる。',
    'AKRが記念写真を撮ろうとして、逆光で真っ暗な写真になる。',
    'AKRが両替に失敗して、お土産を買いすぎてしまう。',
    'AKRが時差で真夜中に元気満々になってしまう。',
  ];
  function funnyMomentForCountry(country) {
    if (country && country.funnyMoment) return country.funnyMoment;
    return WORLD_GENERIC_FUNNY_MOMENTS[randInt(0, WORLD_GENERIC_FUNNY_MOMENTS.length - 1)];
  }

  // 松江塾っぽい、おもしろトーク集（国を制覇した時以外の「随時」のひとことで使う）。
  var WORLD_SENSEI_LINES = [
    'また1つ制覇したな！この調子で計算ドリルも制覇してくれよ〜。',
    '先生も一度は海外に行ってみたいけど、今日も採点で家から出られません。',
    '移動時間ゼロ、旅費もゼロ。これが計算力トラベルのすごいところだ！',
    '世界は広いが、君の計算力はもっと広がっていくぞ！',
    'パスポートはいらない。必要なのは正解を出す力だけだ！',
    '先生の学生時代の夢は世界一周。今の君はもう半分以上叶えてるぞ、すごいな。',
    '次の国に行く前に、小テストの復習は済んだか？（心配性の先生より）',
    '制覇スピード、速すぎないか？ちゃんと復習もしてるか後で確認するからな！',
    '旅先で食べたいものランキング1位は…先生的には地元のご飯かな。',
    '夏休みの宿題、世界一周と同じペースで進んでるか？',
    'この国に着いたなら、次はテストで高得点という国を制覇しよう。',
    '先生、地図帳を眺めるのが好きだったんだ。今の君は実際に「制覇」してるんだからすごいよ。',
    '海外旅行の前に、まずは今日の宿題からだな（笑）',
    '君の計算力、もう立派なパスポートだな。',
  ];
  function pickWorldSenseiLine() {
    return WORLD_SENSEI_LINES[randInt(0, WORLD_SENSEI_LINES.length - 1)];
  }
  // 国を制覇した時以外にも、随時（低確率で）先生トークを見せる。
  var WORLD_SENSEI_RANDOM_CHANCE = 1 / 8;

  // 世界地図が小さくて国が分かりにくいという声を受けて、地域ごとに拡大表示できるようにする。
  // 同じ(着色済みの)地図をクローンし、viewBoxだけ切り替えて特定地域を拡大表示する。
  var WORLD_MAP_ZOOMS = [
    { id: 'eurasia', label: 'ユーラシア', viewBox: '880 60 1500 640' },
    { id: 'africa_middleeast', label: 'アフリカ・中東', viewBox: '1150 320 700 760' },
    { id: 'southasia_oceania', label: '南・東南アジア/オセアニア', viewBox: '1550 320 1200 760' },
    { id: 'northamerica', label: '北アメリカ', viewBox: '0 0 1050 620' },
    { id: 'southamerica', label: '南米', viewBox: '380 480 700 700' },
    { id: 'pacific', label: '太平洋の島々', viewBox: '2250 650 504 400' },
  ];
  var worldMapZoomActiveId = WORLD_MAP_ZOOMS[0].id;

  function applyWorldMapZoomViewBox() {
    var svg = els.worldMapZoomWrap.querySelector('svg');
    if (!svg) return;
    var zoom = WORLD_MAP_ZOOMS.find(function (z) { return z.id === worldMapZoomActiveId; });
    if (!zoom) return;
    svg.setAttribute('viewBox', zoom.viewBox);
    // 元のwidth/height属性(2754x1398)が残っていると、一部ブラウザでCSSのwidth:100%と
    // 競合してズーム後のviewBoxが正しく反映されないことがあるため、明示的に取り除く。
    svg.removeAttribute('width');
    svg.removeAttribute('height');
  }

  function syncWorldMapZoomClone() {
    if (!worldMapInjected) return;
    els.worldMapZoomWrap.innerHTML = els.worldMapWrap.innerHTML;
    applyWorldMapZoomViewBox();
  }

  function renderWorldZoomTabs() {
    els.worldZoomTabs.innerHTML = WORLD_MAP_ZOOMS.map(function (z) {
      return '<button type="button" class="world-zoom-tab-btn' + (z.id === worldMapZoomActiveId ? ' is-active' : '') + '" data-zoom="' + z.id + '">' + z.label + '</button>';
    }).join('');
    Array.from(els.worldZoomTabs.querySelectorAll('button')).forEach(function (btn) {
      btn.addEventListener('click', function () {
        worldMapZoomActiveId = btn.dataset.zoom;
        renderWorldZoomTabs();
        applyWorldMapZoomViewBox();
      });
    });
  }

  function ensureWorldMapLoaded(count) {
    if (worldMapInjected || worldMapLoading) return;
    worldMapLoading = true;
    try {
      fetch('world-map.svg').then(function (res) { return res.text(); }).then(function (svgText) {
        els.worldMapWrap.innerHTML = svgText;
        worldMapInjected = true;
        worldMapLoading = false;
        applyWorldMapColors(count);
      }).catch(function () {
        worldMapLoading = false;
      });
    } catch (e) {
      worldMapLoading = false;
    }
  }

  // ボス出現セクション：挑戦可能なボスがいれば出題条件のチェック結果と挑戦ボタンを、
  // 既に挑戦中ならキャンセルボタンを表示する。
  function renderWorldBossSection() {
    if (state.worldBossActiveStage) {
      const stageId = state.worldBossActiveStage;
      const subIndex = state.worldBossSubIndex[stageId] || 0;
      const sequence = worldBossSequenceForStage(stageId);
      const bossDisplay = worldBossEnemyDisplay(stageId, subIndex);
      const requiredStreak = worldBossCurrentSubBoss(stageId, subIndex).streak;
      const seqLabel = sequence.length > 1 ? '（' + (subIndex + 1) + '/' + sequence.length + '体目）' : '';
      els.worldBossSection.hidden = false;
      els.worldBossSection.innerHTML =
        '<div class="world-boss-card is-fighting">'
        + '<p class="world-boss-title">👑 ボス「' + bossDisplay.name + '」' + seqLabel + 'に挑戦中！</p>'
        + '<p class="world-boss-desc">画面上のクイズに正解するたびにボスへ' + worldBossDamagePerHit_() + 'ダメージ。ボスのHP' + requiredStreak + 'を削り切るとクリア（' + Math.ceil(requiredStreak / worldBossDamagePerHit_()) + '問正解）。不正解になっても削ったHPは戻らないが、自分のHPが' + worldBossHpPenalty(stageId) + '減る。</p>'
        + '<button type="button" class="ghost-btn" id="worldBossCancelBtn">挑戦をやめる</button>'
        + '</div>';
      const cancelBtn = document.getElementById('worldBossCancelBtn');
      if (cancelBtn) cancelBtn.addEventListener('click', function () {
        state.worldBossActiveStage = null;
        state.streak = 0;
        state.worldPendingSpell = null;
        state.worldBossDamage = 0;
        saveGameState(state);
        renderWorldPanel();
        updateGameHud();
      });
      return;
    }
    const stage = currentChallengeableBossStage();
    if (!stage) { els.worldBossSection.hidden = true; els.worldBossSection.innerHTML = ''; return; }
    const subIndex = state.worldBossSubIndex[stage.id] || 0;
    const sequence = worldBossSequenceForStage(stage.id);
    const bossDisplay = worldBossEnemyDisplay(stage.id, subIndex);
    const requiredStreak = worldBossCurrentSubBoss(stage.id, subIndex).streak;
    const seqLabel = sequence.length > 1 ? '（' + (subIndex + 1) + '/' + sequence.length + '体目）' : '';
    const elig = worldBossEligibility();
    const penalty = worldBossHpPenalty(stage.id);
    const condHtml = '<p class="world-boss-cond' + (elig.ok ? ' is-ok' : '') + '">出題条件: 自分の学年以上の単元を' + elig.required + '個以上ON（現在' + elig.count + '個）、うち文章題を1つ以上含む（' + (elig.hasWordProblem ? '✅OK' : '❌不足') + '）</p>';
    els.worldBossSection.hidden = false;
    els.worldBossSection.innerHTML =
      '<div class="world-boss-card">'
      + '<p class="world-boss-title">👑 ボス出現！「' + bossDisplay.name + '」' + seqLabel + '</p>'
      + '<p class="world-boss-desc">正解するたびにボスへ' + worldBossDamagePerHit_() + 'ダメージ。ボスのHP' + requiredStreak + 'を削り切ればクリア（' + Math.ceil(requiredStreak / worldBossDamagePerHit_()) + '問正解）。不正解になっても削ったHPは戻らないが、自分のHPが' + penalty + '減る。自分のHPが0になるとボスのHPは全回復してやり直しになる。倒すと仲間になる！</p>'
      + condHtml
      + '<button type="button" class="primary-btn" id="worldBossChallengeBtn"' + (elig.ok ? '' : ' disabled') + '>挑戦する（現在HP: ' + (Number(state.hp) || 0) + '）</button>'
      + '</div>';
    const challengeBtn = document.getElementById('worldBossChallengeBtn');
    if (challengeBtn) challengeBtn.addEventListener('click', function () {
      state.worldBossActiveStage = stage.id;
      state.streak = 0;
      state.worldPendingSpell = null;
      state.worldBossDamage = 0;
      saveGameState(state);
      renderWorldPanel();
      updateGameHud();
      nextQuestion();
    });
  }

  // 撃破済みボス(仲間)一覧。
  function renderWorldAllySection() {
    const allies = state.worldAllies || [];
    if (allies.length === 0) { els.worldAllySection.hidden = true; els.worldAllySection.innerHTML = ''; return; }
    els.worldAllySection.hidden = false;
    const chips = allies.map(function (code) {
      const country = WORLD_DATA.find(function (c) { return c.code === code; });
      if (!country) return '';
      return '<span class="world-ally-chip">' + isoToFlagEmoji(country.iso) + ' ' + country.name + '</span>';
    }).join('');
    els.worldAllySection.innerHTML = '<p class="world-ally-title">🤝 仲間になったボス</p><div class="world-ally-list">' + chips + '</div>';
  }

  // 世界一周は2周まで。100ヵ国制覇済みなら、1周目終了時だけ2周目スタートの確認
  // (はい/いいえ)を表示する。2周目を制覇したら3周目の案内はせず、完全制覇のお祝いを表示する。
  var WORLD_LAP_MAX_ = 2;
  function renderWorldLapRestart(count, total) {
    if (count < total) { els.worldLapRestart.hidden = true; els.worldLapRestart.innerHTML = ''; return; }
    var currentLap = Number(state.worldLap) || 1;
    els.worldLapRestart.hidden = false;
    if (currentLap >= WORLD_LAP_MAX_) {
      els.worldLapRestart.innerHTML =
        '<div class="world-lap-card">'
        + '<p class="world-lap-question">🌍🎉 ' + currentLap + '周目も制覇！世界一周を完全制覇しました！おめでとう！ 🎉🌍</p>'
        + '</div>';
      return;
    }
    els.worldLapRestart.innerHTML =
      '<div class="world-lap-card">'
      + '<p class="world-lap-question">🌍 ' + currentLap + '周目を制覇しました！2周目をスタートしますか？</p>'
      + '<button type="button" class="primary-btn" id="worldLapYesBtn">はい</button>'
      + '<button type="button" class="ghost-btn" id="worldLapNoBtn">いいえ</button>'
      + '</div>';
    const yesBtn = document.getElementById('worldLapYesBtn');
    const noBtn = document.getElementById('worldLapNoBtn');
    if (yesBtn) yesBtn.addEventListener('click', function () {
      state.worldLap = (Number(state.worldLap) || 1) + 1;
      state.worldLapStartLevel = state.level;
      state.worldCountry = 0;
      applyWorldDataForLap_(state.worldLap);
      state.worldBossDefeated = {};
      state.worldBossActiveStage = null;
      state.worldAllies = [];
      saveGameState(state);
      if (typeof window !== 'undefined') {
        const session = loadSession();
        if (session && session.id) apiPost('syncPoints', buildProgressSyncPayload(session.id)).catch(function () { });
      }
      renderWorldPanel();
    });
    if (noBtn) noBtn.addEventListener('click', function () {
      els.worldLapRestart.hidden = true;
      els.worldLapRestart.innerHTML = '';
    });
  }

  function renderWorldPanel() {
    if (typeof WORLD_DATA === 'undefined' || !Array.isArray(WORLD_DATA) || WORLD_DATA.length === 0) {
      els.worldProgress.textContent = '国データの読み込みに失敗しました。ページを再読み込みしてください。';
      return;
    }
    var total = WORLD_DATA.length;
    var count = worldCountForLevel(state.level);
    var lapLabel = (Number(state.worldLap) || 1) + '周目：';
    var lapStart = Math.max(100, Number(state.worldLapStartLevel) || 100);
    var nextRollText = !isWorldDiceModeActive_()
      ? '（次は「' + WORLD_DATA[count].name + '」、レベル' + (lapStart + count * 10) + 'で制覇）'
      : (state.level < lapStart
        ? '（レベル' + lapStart + 'で1ヵ国目に到達！）'
        : '（レベル' + (lapStart + (Math.floor((state.level - lapStart) / 10) + 1) * 10) + 'でサイコロを振って進む/戻る！）');
    els.worldProgress.textContent = count >= total
      ? '🎉 ' + lapLabel + total + '/' + total + 'ヵ国すべて制覇しました！おめでとう！ 🎉'
      : lapLabel + count + ' / ' + total + 'ヵ国を制覇！' + nextRollText;
    ensureWorldMapLoaded(count);
    applyWorldMapColors(count);
    renderWorldZoomTabs();
    renderWorldBossSection(count, total);
    renderWorldAllySection();
    renderWorldLapRestart(count, total);
    els.worldStageList.innerHTML = WORLD_STAGES.map(function (stage) {
      var countries = WORLD_DATA.filter(function (c) { return c.stage === stage.id; });
      var chips = countries.map(function (c) {
        var unlocked = c.code <= count;
        if (!unlocked) return '<span class="world-chip is-locked">？？？</span>';
        var d = c.details;
        var detailsHtml = d
          ? '<div class="world-chip-details">'
            + '<p><span class="world-chip-detail-label">🌾特産物</span>' + d.specialty + '</p>'
            + '<p><span class="world-chip-detail-label">📍有名な地名</span>' + d.places + '</p>'
            + '<p><span class="world-chip-detail-label">🎎文化</span>' + d.culture + '</p>'
            + '<p><span class="world-chip-detail-label">🏛️遺産</span>' + d.heritage + '</p>'
            + '</div>'
          : '';
        return '<details class="world-chip is-unlocked"><summary><span class="world-chip-name">' + c.code + '. ' + c.name + '</span>'
          + (c.funnyMoment ? '<span class="world-chip-funny">😄' + c.funnyMoment + '</span>' : '')
          + (c.trivia ? '<span class="world-chip-trivia">' + c.trivia + '</span>' : '') + '</summary>'
          + detailsHtml + '</details>';
      }).join('');
      return '<div class="world-stage-block"><p class="world-stage-title">' + stage.name + '</p>'
        + '<p class="world-stage-desc">' + stage.desc + '</p>'
        + '<div class="world-country-grid">' + chips + '</div></div>';
    }).join('');
  }

  function toggleWorld() {
    var isHidden = els.worldPanel.hasAttribute('hidden');
    if (!isHidden) { els.worldPanel.setAttribute('hidden', ''); return; }
    els.historyPanel.setAttribute('hidden', '');
    els.rankingPanel.setAttribute('hidden', '');
    els.giftPanel.setAttribute('hidden', '');
    els.prefecturePanel.setAttribute('hidden', '');
    els.avatarPanel.setAttribute('hidden', '');
    els.grantPanel.setAttribute('hidden', '');
    els.testPhotoPanel.setAttribute('hidden', '');
    els.weeklyQuizPanel.setAttribute('hidden', '');
    if (els.bakuretsuQuizPanel) els.bakuretsuQuizPanel.setAttribute('hidden', '');
    els.withdrawPanel.setAttribute('hidden', '');
    if (els.teamEventPanel) els.teamEventPanel.setAttribute('hidden', '');
    els.shopPanel.setAttribute('hidden', '');

    els.worldPanel.removeAttribute('hidden');
    renderWorldPanel();
  }

  /* ---------- アイテム付与（管理用、00001のみ表示） ---------- */

  function toggleGrant() {
    var isHidden = els.grantPanel.hasAttribute('hidden');
    if (!isHidden) { els.grantPanel.setAttribute('hidden', ''); return; }
    els.historyPanel.setAttribute('hidden', '');
    els.rankingPanel.setAttribute('hidden', '');
    els.giftPanel.setAttribute('hidden', '');
    els.prefecturePanel.setAttribute('hidden', '');
    els.avatarPanel.setAttribute('hidden', '');
    els.worldPanel.setAttribute('hidden', '');
    els.grantPanel.setAttribute('hidden', '');
    els.testPhotoPanel.setAttribute('hidden', '');
    els.weeklyQuizPanel.setAttribute('hidden', '');
    if (els.bakuretsuQuizPanel) els.bakuretsuQuizPanel.setAttribute('hidden', '');
    els.withdrawPanel.setAttribute('hidden', '');
    if (els.teamEventPanel) els.teamEventPanel.setAttribute('hidden', '');
    els.shopPanel.setAttribute('hidden', '');

    els.grantResult.textContent = '';
    els.grantResult.className = 'grant-result';
    els.grantPanel.removeAttribute('hidden');
  }

  function handleGrantSubmit(ev) {
    ev.preventDefault();
    var session = loadSession();
    if (!session || session.id !== '00001') return;

    var targetId = els.grantTargetId.value.trim();
    var itemIds = [];
    if (els.grantFlameSword.checked) itemIds.push('flameSword');
    if (els.grantSmileMask.checked) itemIds.push('smileMask');
    if (els.grantCatPencil.checked) itemIds.push('catPencil');
    var otherIds = els.grantOtherIds.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    itemIds = itemIds.concat(otherIds);

    if (!targetId || itemIds.length === 0) {
      els.grantResult.textContent = '生徒IDと、付与するアイテムを1つ以上指定してください。';
      els.grantResult.className = 'grant-result is-error';
      return;
    }

    els.grantSubmitBtn.disabled = true;
    apiPost('grantItems', { id: session.id, targetId: targetId, itemIds: itemIds }).then(function (res) {
      els.grantSubmitBtn.disabled = false;
      if (!res.ok) {
        var msg = '付与に失敗しました。';
        if (res.error === 'not_found') msg = 'そのIDの生徒が見つかりません。';
        else if (res.error === 'forbidden') msg = 'この操作は許可されていません。';
        els.grantResult.textContent = msg;
        els.grantResult.className = 'grant-result is-error';
        return;
      }
      els.grantResult.textContent = `ID ${targetId} への付与を予約しました。次回ログイン/再開時に届きます。`;
      els.grantResult.className = 'grant-result is-success';
      els.grantForm.reset();
    }).catch(function () {
      els.grantSubmitBtn.disabled = false;
      els.grantResult.textContent = '通信に失敗しました。もう一度お試しください。';
      els.grantResult.className = 'grant-result is-error';
    });
  }

  /* ---------- テスト画像提出（ペナテスト・抜き打ちテスト・ランキングテスト） ---------- */

  var RANKING_TEST_TIER_LABELS_ = { '100': '100点（500MP）', '90s': '90点台（400MP）', '80s': '80点台（300MP）', '70s': '70点台（200MP）' };
  var rankingTestSelectedTier = null;

  function toggleTestPhoto() {
    var isHidden = els.testPhotoPanel.hasAttribute('hidden');
    if (!isHidden) { els.testPhotoPanel.setAttribute('hidden', ''); return; }
    els.historyPanel.setAttribute('hidden', '');
    els.rankingPanel.setAttribute('hidden', '');
    els.giftPanel.setAttribute('hidden', '');
    els.prefecturePanel.setAttribute('hidden', '');
    els.avatarPanel.setAttribute('hidden', '');
    els.worldPanel.setAttribute('hidden', '');
    els.grantPanel.setAttribute('hidden', '');
    els.weeklyQuizPanel.setAttribute('hidden', '');
    if (els.bakuretsuQuizPanel) els.bakuretsuQuizPanel.setAttribute('hidden', '');
    els.withdrawPanel.setAttribute('hidden', '');
    if (els.teamEventPanel) els.teamEventPanel.setAttribute('hidden', '');
    els.shopPanel.setAttribute('hidden', '');

    els.testPhotoPanel.removeAttribute('hidden');
    renderTestPhotoPanel();
  }

  var HYAKUMASU_ALLOWED_GRADES_ = ['小4', '小5', '小6'];
  var HYAKUMASU_TARGET_TIME_LABELS_ = { '小4': '1分30秒', '小5': '1分', '小6': '45秒' };

  // 中学生は「抜き打ちテスト」、それ以外(小学生)は「ペナテスト」として同じ仕組みを表示する。
  // ランキングテストカードは中学生のみ表示。100マス計算チャレンジは小4〜小6のみ表示。
  function renderTestPhotoPanel() {
    var session = loadSession();
    var grade = (session && session.grade) || '';
    var isMiddle = grade.charAt(0) === '中';
    els.penaTestCardTitle.textContent = isMiddle ? '📝 抜き打ちテスト' : '📝 ペナテスト';
    els.penaTestCard.hidden = false;
    els.rankingTestCard.hidden = !isMiddle;
    els.penaTestFileInput.value = '';
    els.penaTestSubmitBtn.disabled = true;
    els.penaTestResult.textContent = '';
    els.rankingTestFileInput.value = '';
    els.rankingTestConfirm.hidden = true;
    els.rankingTestResult.textContent = '';
    rankingTestSelectedTier = null;
    rankingTestSubmitting = false;
    setRankingTestControlsDisabled(false);
    renderRankingTierButtons();

    var hyakuMasuAllowed = HYAKUMASU_ALLOWED_GRADES_.indexOf(grade) !== -1;
    els.hyakuMasuCard.hidden = !hyakuMasuAllowed;
    if (hyakuMasuAllowed) {
      var targetLabel = HYAKUMASU_TARGET_TIME_LABELS_[grade];
      els.hyakuMasuHint.textContent = '100マス計算（50問）を目標タイム（' + targetLabel + '）内に解いて、その写真を提出すると20MPもらえます。提出は週1回（月〜日）までです。';
    }
    els.hyakuMasuConfirmCheckbox.checked = false;
    els.hyakuMasuFileInput.value = '';
    els.hyakuMasuSubmitBtn.disabled = true;
    els.hyakuMasuResult.textContent = '';

    els.challengeTestCard.hidden = false;
    els.challengeTestHint.textContent = isMiddle
      ? 'チャレンジ問題の写真を提出すると、正解数に応じてMPがもらえます（1問正解=10MP、2問正解=20MP、3問以上正解=30MP）。提出は週3回（月〜日）までです。写真を選んでから、正解数を選んでください。'
      : 'チャレンジ問題の写真を提出すると、正解数に応じてMPがもらえます（1問正解=10MP、2問正解=20MP、3問以上正解=30MP）。提出は週1回（月〜日）までです。写真を選んでから、正解数を選んでください。';
    els.challengeTestFileInput.value = '';
    els.challengeTestConfirm.hidden = true;
    els.challengeTestResult.textContent = '';
    challengeTestSelectedTier = null;
    challengeTestSubmitting = false;
    setChallengeTestControlsDisabled(false);
    renderChallengeTierButtons();
  }

  // 写真をそのまま送ると通信が重くなる/GASの実行時間を圧迫するため、canvasで
  // 長辺1280pxまで縮小してJPEG(quality 0.7)に変換してから送信する。
  function compressImageFileToBase64(file, maxDim, quality) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('read failed')); };
      reader.onload = function (e) {
        var img = new Image();
        img.onerror = function () { reject(new Error('decode failed')); };
        img.onload = function () {
          var w = img.width, h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
            else { w = Math.round(w * maxDim / h); h = maxDim; }
          }
          var canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          var ctx2d = canvas.getContext('2d');
          if (!ctx2d) { reject(new Error('canvas unsupported')); return; }
          ctx2d.drawImage(img, 0, 0, w, h);
          var dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(dataUrl.substring(dataUrl.indexOf(',') + 1));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function applyTestPhotoPointsResult(res) {
    state.points = res.newTotalPoints;
    saveGameState(state);
    updateStats();
    updateGameHud();
  }

  function submitPenaTestPhoto() {
    var session = loadSession();
    if (!session || !session.id) return;
    var file = els.penaTestFileInput.files && els.penaTestFileInput.files[0];
    if (!file) { els.penaTestResult.textContent = '写真を選んでください。'; return; }
    els.penaTestSubmitBtn.disabled = true;
    els.penaTestResult.textContent = '送信中…';
    compressImageFileToBase64(file, 1280, 0.7).then(function (base64) {
      return apiPost('submitTestPhoto', { id: session.id, testType: 'pena', imageBase64: base64, mimeType: 'image/jpeg' });
    }).then(function (res) {
      els.penaTestSubmitBtn.disabled = false;
      if (!res.ok) { els.penaTestResult.textContent = '送信に失敗しました。もう一度お試しください。'; return; }
      applyTestPhotoPointsResult(res);
      els.penaTestFileInput.value = '';
      els.penaTestResult.textContent = res.pointsAwarded > 0
        ? ('✅ 送信完了！ +' + res.pointsAwarded + 'MP獲得しました！')
        : '✅ 送信完了しました！（本日の上限（30MP）に達しているため、MPの追加はありません）';
    }).catch(function () {
      els.penaTestSubmitBtn.disabled = false;
      els.penaTestResult.textContent = '送信に失敗しました。もう一度お試しください。';
    });
  }

  var rankingTestSubmitting = false;

  function renderRankingTierButtons() {
    Array.from(els.rankingTierRow.children).forEach(function (btn) {
      btn.classList.toggle('is-selected', btn.dataset.tier === rankingTestSelectedTier);
    });
  }

  // 送信中に他のボタンを連打すると、確認ダイアログを再度開いて別リクエストを重ねて
  // 送信できてしまう(サーバー側の月1回制限とは別に、そもそも二重送信自体を防ぐ)。
  // 送信中は関連する操作をすべて無効化する。
  function setRankingTestControlsDisabled(disabled) {
    Array.from(els.rankingTierRow.children).forEach(function (btn) { btn.disabled = disabled; });
    els.rankingTestConfirmYes.disabled = disabled;
    els.rankingTestConfirmNo.disabled = disabled;
    els.rankingTestFileInput.disabled = disabled;
  }

  function handleRankingTierClick(tier) {
    if (rankingTestSubmitting) return;
    var file = els.rankingTestFileInput.files && els.rankingTestFileInput.files[0];
    if (!file) { els.rankingTestResult.textContent = '先に写真を選んでください。'; return; }
    els.rankingTestResult.textContent = '';
    rankingTestSelectedTier = tier;
    renderRankingTierButtons();
    els.rankingTestConfirmText.textContent = RANKING_TEST_TIER_LABELS_[tier] + ' で送信します。これでいいですか？';
    els.rankingTestConfirm.hidden = false;
  }

  function submitRankingTestPhoto() {
    if (rankingTestSubmitting) return;
    var session = loadSession();
    if (!session || !session.id || !rankingTestSelectedTier) return;
    var file = els.rankingTestFileInput.files && els.rankingTestFileInput.files[0];
    if (!file) { els.rankingTestResult.textContent = '写真を選んでください。'; els.rankingTestConfirm.hidden = true; return; }
    var tier = rankingTestSelectedTier;
    rankingTestSubmitting = true;
    setRankingTestControlsDisabled(true);
    els.rankingTestConfirm.hidden = true;
    els.rankingTestResult.textContent = '送信中…';
    compressImageFileToBase64(file, 1280, 0.7).then(function (base64) {
      return apiPost('submitTestPhoto', { id: session.id, testType: 'ranking', scoreTier: tier, imageBase64: base64, mimeType: 'image/jpeg' });
    }).then(function (res) {
      rankingTestSubmitting = false;
      setRankingTestControlsDisabled(false);
      if (!res.ok) {
        els.rankingTestResult.textContent = res.error === 'already_submitted_this_month'
          ? '今月のランキングテストはすでに提出済みです（提出は月1回までです）。'
          : res.error === 'elementary_not_allowed'
          ? '数学ランキングテストは、まだ小学生の提出には対応していません。'
          : '送信に失敗しました。もう一度お試しください。';
        return;
      }
      applyTestPhotoPointsResult(res);
      els.rankingTestFileInput.value = '';
      rankingTestSelectedTier = null;
      renderRankingTierButtons();
      els.rankingTestResult.textContent = res.pointsAwarded > 0
        ? ('✅ 送信完了！ +' + res.pointsAwarded + 'MP獲得しました！')
        : '✅ 送信完了しました！（70点未満のため、MPの加算はありません）';
    }).catch(function () {
      rankingTestSubmitting = false;
      setRankingTestControlsDisabled(false);
      els.rankingTestResult.textContent = '送信に失敗しました。もう一度お試しください。';
    });
  }

  function cancelRankingTierConfirm() {
    if (rankingTestSubmitting) return;
    rankingTestSelectedTier = null;
    renderRankingTierButtons();
    els.rankingTestConfirm.hidden = true;
  }

  /* ---------- 100マス計算チャレンジ ---------- */

  function updateHyakuMasuSubmitEnabled() {
    var hasFile = !!(els.hyakuMasuFileInput.files && els.hyakuMasuFileInput.files[0]);
    els.hyakuMasuSubmitBtn.disabled = !(hasFile && els.hyakuMasuConfirmCheckbox.checked);
  }

  function submitHyakuMasuPhoto() {
    var session = loadSession();
    if (!session || !session.id) return;
    var file = els.hyakuMasuFileInput.files && els.hyakuMasuFileInput.files[0];
    if (!file || !els.hyakuMasuConfirmCheckbox.checked) return;
    els.hyakuMasuSubmitBtn.disabled = true;
    els.hyakuMasuResult.textContent = '送信中…';
    compressImageFileToBase64(file, 1280, 0.7).then(function (base64) {
      return apiPost('submitTestPhoto', { id: session.id, testType: 'hyakuMasu', imageBase64: base64, mimeType: 'image/jpeg' });
    }).then(function (res) {
      if (!res.ok) {
        els.hyakuMasuResult.textContent = res.error === 'already_submitted_this_week'
          ? '今週の100マス計算チャレンジはすでに提出済みです（提出は週1回までです）。'
          : res.error === 'grade_not_allowed'
          ? '100マス計算チャレンジは小4〜小6限定です。'
          : '送信に失敗しました。もう一度お試しください。';
        updateHyakuMasuSubmitEnabled();
        return;
      }
      applyTestPhotoPointsResult(res);
      els.hyakuMasuFileInput.value = '';
      els.hyakuMasuConfirmCheckbox.checked = false;
      els.hyakuMasuSubmitBtn.disabled = true;
      els.hyakuMasuResult.textContent = '✅ 送信完了！ +' + res.pointsAwarded + 'MP獲得しました！';
    }).catch(function () {
      els.hyakuMasuResult.textContent = '送信に失敗しました。もう一度お試しください。';
      updateHyakuMasuSubmitEnabled();
    });
  }

  /* ---------- チャレンジ問題 ---------- */

  var CHALLENGE_TEST_TIER_LABELS_ = { '3plus': '3問以上正解（30MP）', '2': '2問正解（20MP）', '1': '1問正解（10MP）' };
  var challengeTestSelectedTier = null;
  var challengeTestSubmitting = false;

  function renderChallengeTierButtons() {
    Array.from(els.challengeTierRow.children).forEach(function (btn) {
      btn.classList.toggle('is-selected', btn.dataset.tier === challengeTestSelectedTier);
    });
  }

  function setChallengeTestControlsDisabled(disabled) {
    Array.from(els.challengeTierRow.children).forEach(function (btn) { btn.disabled = disabled; });
    els.challengeTestConfirmYes.disabled = disabled;
    els.challengeTestConfirmNo.disabled = disabled;
    els.challengeTestFileInput.disabled = disabled;
  }

  function handleChallengeTierClick(tier) {
    if (challengeTestSubmitting) return;
    var file = els.challengeTestFileInput.files && els.challengeTestFileInput.files[0];
    if (!file) { els.challengeTestResult.textContent = '先に写真を選んでください。'; return; }
    els.challengeTestResult.textContent = '';
    challengeTestSelectedTier = tier;
    renderChallengeTierButtons();
    els.challengeTestConfirmText.textContent = CHALLENGE_TEST_TIER_LABELS_[tier] + ' で送信します。これでいいですか？';
    els.challengeTestConfirm.hidden = false;
  }

  function submitChallengeTestPhoto() {
    if (challengeTestSubmitting) return;
    var session = loadSession();
    if (!session || !session.id || !challengeTestSelectedTier) return;
    var file = els.challengeTestFileInput.files && els.challengeTestFileInput.files[0];
    if (!file) { els.challengeTestResult.textContent = '写真を選んでください。'; els.challengeTestConfirm.hidden = true; return; }
    var tier = challengeTestSelectedTier;
    challengeTestSubmitting = true;
    setChallengeTestControlsDisabled(true);
    els.challengeTestConfirm.hidden = true;
    els.challengeTestResult.textContent = '送信中…';
    compressImageFileToBase64(file, 1280, 0.7).then(function (base64) {
      return apiPost('submitTestPhoto', { id: session.id, testType: 'challenge', scoreTier: tier, imageBase64: base64, mimeType: 'image/jpeg' });
    }).then(function (res) {
      challengeTestSubmitting = false;
      setChallengeTestControlsDisabled(false);
      if (!res.ok) {
        els.challengeTestResult.textContent = res.error === 'already_submitted_this_week'
          ? '今週のチャレンジ問題はすでに提出済みです（提出は週1回までです）。'
          : '送信に失敗しました。もう一度お試しください。';
        return;
      }
      applyTestPhotoPointsResult(res);
      els.challengeTestFileInput.value = '';
      challengeTestSelectedTier = null;
      renderChallengeTierButtons();
      els.challengeTestResult.textContent = '✅ 送信完了！ +' + res.pointsAwarded + 'MP獲得しました！';
    }).catch(function () {
      challengeTestSubmitting = false;
      setChallengeTestControlsDisabled(false);
      els.challengeTestResult.textContent = '送信に失敗しました。もう一度お試しください。';
    });
  }

  function cancelChallengeTierConfirm() {
    if (challengeTestSubmitting) return;
    challengeTestSelectedTier = null;
    renderChallengeTierButtons();
    els.challengeTestConfirm.hidden = true;
  }

  /* ---------- 週替わりクイズ ---------- */

  var weeklyQuizChoices = [];
  var weeklyQuizSelectedIndex = null;
  var weeklyQuizSubmitting = false;
  var weeklyQuizIsSpecial = false;
  var weeklyQuizSpecialQuestions = [];
  var weeklyQuizSpecialIndex = 0;
  var weeklyQuizSpecialSelections = [];
  var weeklyQuizSpecialLabelText = '';

  function toggleWeeklyQuiz() {
    var isHidden = els.weeklyQuizPanel.hasAttribute('hidden');
    if (!isHidden) { els.weeklyQuizPanel.setAttribute('hidden', ''); return; }
    els.historyPanel.setAttribute('hidden', '');
    els.rankingPanel.setAttribute('hidden', '');
    els.giftPanel.setAttribute('hidden', '');
    els.prefecturePanel.setAttribute('hidden', '');
    els.avatarPanel.setAttribute('hidden', '');
    els.worldPanel.setAttribute('hidden', '');
    els.grantPanel.setAttribute('hidden', '');
    els.testPhotoPanel.setAttribute('hidden', '');
    els.withdrawPanel.setAttribute('hidden', '');
    els.shopPanel.setAttribute('hidden', '');
    if (els.teamEventPanel) els.teamEventPanel.setAttribute('hidden', '');

    els.weeklyQuizPanel.removeAttribute('hidden');
    loadWeeklyQuiz();
  }

  function setWeeklyQuizControlsDisabled(disabled) {
    Array.from(els.weeklyQuizChoiceRow.children).forEach(function (btn) { btn.disabled = disabled; });
    els.weeklyQuizConfirmYes.disabled = disabled;
    els.weeklyQuizConfirmNo.disabled = disabled;
  }

  function renderWeeklyQuizChoiceButtons() {
    Array.from(els.weeklyQuizChoiceRow.children).forEach(function (btn, idx) {
      btn.classList.toggle('is-selected', idx === weeklyQuizSelectedIndex);
    });
  }

  function loadWeeklyQuiz() {
    var session = loadSession();
    els.weeklyQuizUnavailable.hidden = true;
    els.weeklyQuizBody.hidden = true;
    els.weeklyQuizConfirm.hidden = true;
    els.weeklyQuizSpecialLabel.hidden = true;
    els.weeklyQuizResult.textContent = '';
    weeklyQuizSelectedIndex = null;
    weeklyQuizSubmitting = false;
    weeklyQuizIsSpecial = false;
    weeklyQuizSpecialQuestions = [];
    weeklyQuizSpecialIndex = 0;
    weeklyQuizSpecialSelections = [];
    if (!session || !session.id) {
      els.weeklyQuizUnavailable.hidden = false;
      els.weeklyQuizUnavailableText.textContent = 'この機能は生徒登録した方のみご利用いただけます。';
      return;
    }
    els.weeklyQuizUnavailable.hidden = false;
    els.weeklyQuizUnavailableText.textContent = '読み込み中…';
    apiPost('weeklyQuizGet', { id: session.id }).then(function (res) {
      if (!res.ok) { els.weeklyQuizUnavailableText.textContent = '読み込みに失敗しました。'; return; }
      if (!res.available) {
        els.weeklyQuizUnavailable.hidden = false;
        els.weeklyQuizUnavailableText.textContent = res.alreadyAnswered
          ? (res.special ? '本日限定クイズはすでに回答済みです。' : '今週のクイズはすでに回答済みです。また来週挑戦してください！')
          : '今週の問題はまだ準備中です。もうしばらくお待ちください。';
        return;
      }
      els.weeklyQuizUnavailable.hidden = true;
      els.weeklyQuizBody.hidden = false;
      if (res.special) {
        weeklyQuizIsSpecial = true;
        weeklyQuizSpecialQuestions = res.questions;
        weeklyQuizSpecialIndex = 0;
        weeklyQuizSpecialSelections = [];
        weeklyQuizSpecialLabelText = res.label || '';
        renderWeeklyQuizCurrentQuestion();
      } else {
        weeklyQuizChoices = res.choices;
        els.weeklyQuizSpecialLabel.hidden = true;
        els.weeklyQuizQuestion.textContent = res.question;
        renderWeeklyQuizChoiceRow(res.choices);
      }
    }).catch(function () {
      els.weeklyQuizUnavailableText.textContent = '読み込みに失敗しました。';
    });
  }

  function renderWeeklyQuizChoiceRow(choices) {
    els.weeklyQuizChoiceRow.innerHTML = choices.map(function (choice, idx) {
      return '<button type="button" class="test-photo-tier-btn" data-idx="' + idx + '">' + choice + '</button>';
    }).join('');
    Array.from(els.weeklyQuizChoiceRow.children).forEach(function (btn) {
      btn.addEventListener('click', function () { handleWeeklyQuizChoiceClick(Number(btn.dataset.idx)); });
    });
  }

  function renderWeeklyQuizCurrentQuestion() {
    var q = weeklyQuizSpecialQuestions[weeklyQuizSpecialIndex];
    weeklyQuizChoices = q.choices;
    weeklyQuizSelectedIndex = null;
    els.weeklyQuizSpecialLabel.hidden = false;
    els.weeklyQuizSpecialLabel.textContent = weeklyQuizSpecialLabelText + '（' + (weeklyQuizSpecialIndex + 1) + '/' + weeklyQuizSpecialQuestions.length + '問目）';
    els.weeklyQuizQuestion.textContent = q.question;
    renderWeeklyQuizChoiceRow(q.choices);
  }

  function handleWeeklyQuizChoiceClick(idx) {
    if (weeklyQuizSubmitting) return;
    weeklyQuizSelectedIndex = idx;
    renderWeeklyQuizChoiceButtons();
    els.weeklyQuizConfirmText.textContent = '「' + weeklyQuizChoices[idx] + '」で回答します。これでいいですか？';
    els.weeklyQuizConfirm.hidden = false;
  }

  function submitWeeklyQuizAnswer() {
    if (weeklyQuizSubmitting || weeklyQuizSelectedIndex === null) return;
    var session = loadSession();
    if (!session || !session.id) return;
    els.weeklyQuizConfirm.hidden = true;

    if (weeklyQuizIsSpecial) {
      weeklyQuizSpecialSelections.push(weeklyQuizSelectedIndex);
      if (weeklyQuizSpecialIndex < weeklyQuizSpecialQuestions.length - 1) {
        weeklyQuizSpecialIndex++;
        renderWeeklyQuizCurrentQuestion();
        return;
      }
      weeklyQuizSubmitting = true;
      setWeeklyQuizControlsDisabled(true);
      els.weeklyQuizResult.textContent = '送信中…';
      apiPost('weeklyQuizAnswer', { id: session.id, choiceIndices: weeklyQuizSpecialSelections }).then(function (res) {
        weeklyQuizSubmitting = false;
        if (!res.ok) {
          els.weeklyQuizResult.textContent = res.error === 'already_answered'
            ? '本日限定クイズはすでに回答済みです。'
            : res.error === 'no_quiz'
            ? '本日限定クイズは終了しました。'
            : '送信に失敗しました。もう一度お試しください。';
          setWeeklyQuizControlsDisabled(false);
          return;
        }
        state.points = res.newTotalPoints;
        saveGameState(state);
        updateStats();
        updateGameHud();
        els.weeklyQuizBody.hidden = true;
        els.weeklyQuizResult.textContent = res.correct
          ? '🎉 2問連続正解！ +' + res.pointsDelta + 'MP獲得しました！'
          : '😢 不正解の問題がありました… ' + res.pointsDelta + 'MP';
      }).catch(function () {
        weeklyQuizSubmitting = false;
        setWeeklyQuizControlsDisabled(false);
        els.weeklyQuizResult.textContent = '送信に失敗しました。もう一度お試しください。';
      });
      return;
    }

    weeklyQuizSubmitting = true;
    setWeeklyQuizControlsDisabled(true);
    els.weeklyQuizResult.textContent = '送信中…';
    apiPost('weeklyQuizAnswer', { id: session.id, choiceIndex: weeklyQuizSelectedIndex }).then(function (res) {
      weeklyQuizSubmitting = false;
      if (!res.ok) {
        els.weeklyQuizResult.textContent = res.error === 'already_answered'
          ? '今週のクイズはすでに回答済みです。'
          : res.error === 'no_quiz'
          ? '今週の問題はまだ準備中です。'
          : '送信に失敗しました。もう一度お試しください。';
        setWeeklyQuizControlsDisabled(false);
        return;
      }
      state.points = res.newTotalPoints;
      saveGameState(state);
      updateStats();
      updateGameHud();
      els.weeklyQuizBody.hidden = true;
      els.weeklyQuizResult.textContent = res.correct
        ? '🎉 正解！ +' + res.pointsDelta + 'MP獲得しました！'
        : '😢 不正解…（正解は「' + weeklyQuizChoices[res.correctIndex] + '」でした） ' + res.pointsDelta + 'MP';
    }).catch(function () {
      weeklyQuizSubmitting = false;
      setWeeklyQuizControlsDisabled(false);
      els.weeklyQuizResult.textContent = '送信に失敗しました。もう一度お試しください。';
    });
  }

  function cancelWeeklyQuizConfirm() {
    if (weeklyQuizSubmitting) return;
    weeklyQuizSelectedIndex = null;
    renderWeeklyQuizChoiceButtons();
    els.weeklyQuizConfirm.hidden = true;
  }

  /* ---------- 爆裂想像力クイズ ----------
     「こんな間違いをしてしまいそう」を想像して当てる、笑える間違い探しクイズ
     (実話ではなく創作)。サーバー側の週次管理は使わず、問題バンク
     (BAKURETSU_QUIZ_QUESTIONS_)を随時追加していく。1問ごとに、正解済みIDを
     state.bakuretsuSolvedに記録し、同じ問題では二度とHPを稼げないように
     する。正解でHP+1、不正解はペナルティなし。 */
  const BAKURETSU_QUIZ_QUESTIONS_ = [
    {
      id: 'mom_weight_ton',
      question: '宿題の問題「④ お母さんの体重 42( )」。もし単位を書きまちがえるとしたら、どんな単位を書いてしまいそう？（ヒント: お母さんが42トンに…！？）',
      choices: ['g', 'kg', 't', 'mL'],
      correctIndex: 2,
      revealText: '正解は「t」！お母さんの体重が42トン(=42000kg)になってしまう、まさかの大爆裂の間違い🔥 正しい単位はもちろん「kg」です。',
    },
    {
      id: 'game_time_limit',
      isNew: true,
      question: '夜おそくまでゲームに夢中な男の子。カーテンの外はもう星空で、お父さんとお母さんも「まだかな…」と心配顔。この子が直すべきことは何でしょう？',
      choices: ['ゲーム機を2台買う', 'ゲーム機を破壊する', '時間を決めてゲームをする', 'もっと遅くまでゲームをする'],
      correctIndex: 2,
      revealText: '正解は「時間を決めてゲームをする」！ゲームは楽しいけど、夜おそくまで続けると寝る時間や次の日の生活に響いちゃう。2台に増やしたり、遅くまでやったりするのは逆効果、ゲーム機を破壊するのはやりすぎ🔥 時間を決めて、楽しく続けるのが一番。',
    },
  ];

  function toggleBakuretsuQuiz() {
    var isHidden = els.bakuretsuQuizPanel.hasAttribute('hidden');
    if (!isHidden) { els.bakuretsuQuizPanel.setAttribute('hidden', ''); return; }
    els.historyPanel.setAttribute('hidden', '');
    els.rankingPanel.setAttribute('hidden', '');
    els.giftPanel.setAttribute('hidden', '');
    els.prefecturePanel.setAttribute('hidden', '');
    els.avatarPanel.setAttribute('hidden', '');
    els.worldPanel.setAttribute('hidden', '');
    els.grantPanel.setAttribute('hidden', '');
    els.testPhotoPanel.setAttribute('hidden', '');
    els.withdrawPanel.setAttribute('hidden', '');
    els.shopPanel.setAttribute('hidden', '');
    els.weeklyQuizPanel.setAttribute('hidden', '');
    if (els.teamEventPanel) els.teamEventPanel.setAttribute('hidden', '');

    els.bakuretsuQuizPanel.removeAttribute('hidden');
    renderBakuretsuQuiz();
  }

  var bakuretsuQuizCurrent = null;

  function renderBakuretsuQuiz() {
    els.bakuretsuQuizResult.textContent = '';
    var next = BAKURETSU_QUIZ_QUESTIONS_.find(function (q) { return !state.bakuretsuSolved.has(q.id); });
    if (!next) {
      bakuretsuQuizCurrent = null;
      els.bakuretsuQuizBody.hidden = true;
      els.bakuretsuQuizUnavailable.hidden = false;
      els.bakuretsuQuizUnavailableText.textContent = '今ある問題は全部クリア済みです！また新しい問題が追加されるのを待っててね🔥';
      return;
    }
    bakuretsuQuizCurrent = next;
    els.bakuretsuQuizUnavailable.hidden = true;
    els.bakuretsuQuizBody.hidden = false;
    var newBadgeHtml = next.isNew ? '<span class="rare-badge">🆕NEW</span>' : '';
    els.bakuretsuQuizQuestion.innerHTML = newBadgeHtml + escHtml(next.question);
    els.bakuretsuQuizChoiceRow.innerHTML = next.choices.map(function (choice, idx) {
      return '<button type="button" class="test-photo-tier-btn" data-idx="' + idx + '">' + escHtml(choice) + '</button>';
    }).join('');
    Array.from(els.bakuretsuQuizChoiceRow.children).forEach(function (btn) {
      btn.addEventListener('click', function () { handleBakuretsuQuizChoice(Number(btn.dataset.idx)); });
    });
  }

  function handleBakuretsuQuizChoice(idx) {
    if (!bakuretsuQuizCurrent) return;
    var q = bakuretsuQuizCurrent;
    Array.from(els.bakuretsuQuizChoiceRow.children).forEach(function (btn) { btn.disabled = true; });
    var isCorrect = idx === q.correctIndex;
    if (isCorrect) {
      var alreadySolved = state.bakuretsuSolved.has(q.id);
      state.bakuretsuSolved.add(q.id);
      if (!alreadySolved) {
        state.hp = (Number(state.hp) || 0) + 1;
      }
      saveGameState(state);
      updateGameHud();
      els.bakuretsuQuizResult.textContent = '🎉 正解！' + (alreadySolved ? '' : ' +1HP獲得！') + ' ' + q.revealText;
      var session = loadSession();
      if (session && session.id) apiPost('syncPoints', buildProgressSyncPayload(session.id)).catch(function () { });
    } else {
      els.bakuretsuQuizResult.textContent = '😅 ちがうかな…もう一度考えてみて！';
      window.setTimeout(function () {
        Array.from(els.bakuretsuQuizChoiceRow.children).forEach(function (btn) { btn.disabled = false; });
      }, 900);
    }
  }

  /* ---------- チーム対抗経験値バトル ---------- */

  var teamEventCache = null;

  function fetchTeamEventStatus_(onDone) {
    var session = loadSession();
    if (!session || !session.id) return;
    apiPost('teamEventStatus', { id: session.id }).then(function (res) {
      if (res && res.ok) {
        teamEventCache = res;
        renderTeamEventBanner_();
        if (onDone) onDone(res);
      }
    }).catch(function () { });
  }

  function renderTeamEventBanner_() {
    if (!els.teamEventBanner) return;
    if (!teamEventCache || !teamEventCache.active) {
      els.teamEventBanner.hidden = true;
      if (els.teamEventToggle) els.teamEventToggle.hidden = true;
      return;
    }
    // チームに参加していない生徒(管理者00001など)も、開催中であれば
    // 🤝チーム対抗戦ボタンから全チームの順位だけは見られるようにする。
    if (els.teamEventToggle) els.teamEventToggle.hidden = false;
    var ev = teamEventCache.event;
    var my = teamEventCache.myTeam;
    if (!my) {
      els.teamEventBanner.hidden = true;
      return;
    }
    els.teamEventBanner.hidden = false;
    els.teamEventBannerText.textContent =
      `🤝 チーム対抗経験値バトル開催中！（${ev.startDate}〜${ev.endDate}）\n` +
      `5〜6人1組のチームで、期間中にどれだけ経験値を上げられるかを競います。\n` +
      `チームの経験値上昇量の順位に応じて、1位3000MP・2位2500MP・3位2000MP・4位1800MP・5位1500MP・6位1400MP・7位1300MP・8位1200MP・9位1100MP・10位1000MPが、チーム内で経験値を上げた量に比例して分配されます（1つも上げていない人には分配されません）。\n` +
      `あなたのチームは「${my.teamName}」！現在の順位：${my.rank}位`;
  }

  function teamMemberRowHtml_(m, isYou) {
    var cls = 'ranking-row' + (isYou ? ' ranking-you' : '');
    var youTag = isYou ? '<span class="ranking-you-tag">あなた</span>' : '';
    var gradeTag = m.grade ? `<span class="ranking-grade">${m.grade}</span>` : '';
    var leaderTag = m.isLeader ? '<span class="team-leader-crown" title="チームリーダー">👑</span>' : '';
    return `<div class="${cls}"><span class="ranking-rank"></span><span class="ranking-name">${leaderTag}${gradeTag}${m.name}${youTag}</span><span class="ranking-points">経験値+${m.gained * 10}</span></div>`;
  }

  function teamRowHtml_(t, isMyTeam) {
    var cls = 'ranking-row' + (isMyTeam ? ' ranking-you' : '');
    var myTag = isMyTeam ? '<span class="ranking-you-tag">あなたのチーム</span>' : '';
    return `<div class="${cls}"><span class="ranking-rank">${t.rank}</span><span class="ranking-name">${t.teamName}（${t.memberCount}人）${myTag}</span><span class="ranking-points">経験値+${t.totalGained * 10}</span></div>`;
  }

  function renderTeamEventPanel_() {
    if (!teamEventCache || !teamEventCache.active) {
      els.teamEventPeriod.textContent = '現在開催中のイベントはありません。';
      els.teamEventMyTeamBox.hidden = true;
      els.teamEventAllTeamsList.innerHTML = '';
      return;
    }
    var ev = teamEventCache.event;
    els.teamEventPeriod.textContent = `期間：${ev.startDate}〜${ev.endDate}／チームの経験値上昇量で対決！順位ごとのMPは、チーム内で経験値を上げた量に比例して分配されます（全く上げていない人には分配されません）。`;

    var session = loadSession();
    var myId = session && session.id;

    if (teamEventCache.myTeam) {
      els.teamEventMyTeamBox.hidden = false;
      var my = teamEventCache.myTeam;
      els.teamEventMyTeamTitle.textContent = `あなたのチーム：${my.teamName}`;
      els.teamEventMyRank.textContent = `現在 ${my.rank}位／チーム合計 経験値+${my.totalGained * 10}`;
      els.teamEventMyMembersList.innerHTML = my.members.map(function (m) {
        return teamMemberRowHtml_(m, m.id === myId);
      }).join('');
    } else {
      els.teamEventMyTeamBox.hidden = true;
    }

    els.teamEventAllTeamsList.innerHTML = teamEventCache.allTeams.map(function (t) {
      return teamRowHtml_(t, !!(teamEventCache.myTeam && t.teamId === teamEventCache.myTeam.teamId));
    }).join('');
  }

  function toggleTeamEvent() {
    var isHidden = els.teamEventPanel.hasAttribute('hidden');
    if (!isHidden) { els.teamEventPanel.setAttribute('hidden', ''); return; }
    els.historyPanel.setAttribute('hidden', '');
    els.rankingPanel.setAttribute('hidden', '');
    els.giftPanel.setAttribute('hidden', '');
    els.prefecturePanel.setAttribute('hidden', '');
    els.avatarPanel.setAttribute('hidden', '');
    els.worldPanel.setAttribute('hidden', '');
    els.grantPanel.setAttribute('hidden', '');
    els.testPhotoPanel.setAttribute('hidden', '');
    els.weeklyQuizPanel.setAttribute('hidden', '');
    if (els.bakuretsuQuizPanel) els.bakuretsuQuizPanel.setAttribute('hidden', '');
    els.withdrawPanel.setAttribute('hidden', '');
    els.shopPanel.setAttribute('hidden', '');

    els.teamEventPanel.removeAttribute('hidden');
    els.teamEventPeriod.textContent = '読み込み中…';
    fetchTeamEventStatus_(function () { renderTeamEventPanel_(); });
  }

  /* ---------- 退会 ---------- */

  var withdrawSubmitting = false;

  function toggleWithdraw() {
    var isHidden = els.withdrawPanel.hasAttribute('hidden');
    if (!isHidden) { els.withdrawPanel.setAttribute('hidden', ''); return; }
    els.historyPanel.setAttribute('hidden', '');
    els.rankingPanel.setAttribute('hidden', '');
    els.giftPanel.setAttribute('hidden', '');
    els.prefecturePanel.setAttribute('hidden', '');
    els.avatarPanel.setAttribute('hidden', '');
    els.worldPanel.setAttribute('hidden', '');
    els.grantPanel.setAttribute('hidden', '');
    els.testPhotoPanel.setAttribute('hidden', '');
    els.weeklyQuizPanel.setAttribute('hidden', '');
    if (els.bakuretsuQuizPanel) els.bakuretsuQuizPanel.setAttribute('hidden', '');
    els.shopPanel.setAttribute('hidden', '');
    if (els.teamEventPanel) els.teamEventPanel.setAttribute('hidden', '');

    hideFieldError(els.withdrawError);
    els.withdrawForm.hidden = false;
    els.withdrawConfirm.hidden = true;
    els.withdrawResult.textContent = '';
    els.withdrawId.value = '';
    els.withdrawPassword.value = '';
    withdrawSubmitting = false;
    els.withdrawPanel.removeAttribute('hidden');
  }

  function handleWithdrawSubmitClick() {
    if (withdrawSubmitting) return;
    hideFieldError(els.withdrawError);
    var id = els.withdrawId.value.trim();
    var password = els.withdrawPassword.value;
    if (!id || !password) {
      showFieldError(els.withdrawError, 'IDとパスワードを入力してください。');
      return;
    }
    els.withdrawConfirmText.textContent = 'ID「' + id + '」を退会します。記録やデータはすべて削除され、元に戻せません。本当によろしいですか？';
    els.withdrawConfirm.hidden = false;
  }

  function cancelWithdrawConfirm() {
    if (withdrawSubmitting) return;
    els.withdrawConfirm.hidden = true;
  }

  function submitWithdraw() {
    if (withdrawSubmitting) return;
    var id = els.withdrawId.value.trim();
    var password = els.withdrawPassword.value;
    if (!id || !password) return;
    withdrawSubmitting = true;
    els.withdrawConfirm.hidden = true;
    els.withdrawSubmitBtn.disabled = true;
    els.withdrawConfirmYes.disabled = true;
    els.withdrawConfirmNo.disabled = true;
    els.withdrawResult.textContent = '送信中…';
    apiPost('withdraw', { id: id, password: password }).then(function (res) {
      withdrawSubmitting = false;
      els.withdrawSubmitBtn.disabled = false;
      els.withdrawConfirmYes.disabled = false;
      els.withdrawConfirmNo.disabled = false;
      if (!res.ok) {
        var msg = '退会処理に失敗しました。もう一度お試しください。';
        if (res.error === 'not_found') msg = 'そのIDは登録されていません。';
        else if (res.error === 'no_password') msg = 'パスワードが未設定のアカウントです。先生にご相談ください。';
        else if (res.error === 'wrong_password') msg = 'パスワードが違います。';
        else if (res.error === 'locked') msg = `パスワードを何度も間違えたため、${res.retryAfterMinutes}分ほどお試しいただけません。`;
        els.withdrawResult.textContent = msg;
        return;
      }
      els.withdrawForm.hidden = true;
      els.withdrawResult.textContent = '退会手続きが完了しました。ご利用ありがとうございました。';
      window.alert('退会手続きが完了しました。ご利用ありがとうございました。');
      finishLogout();
    }).catch(function () {
      withdrawSubmitting = false;
      els.withdrawSubmitBtn.disabled = false;
      els.withdrawConfirmYes.disabled = false;
      els.withdrawConfirmNo.disabled = false;
      els.withdrawResult.textContent = '通信に失敗しました。もう一度お試しください。';
    });
  }

  function handleAvatarSave() {
    var session = loadSession();
    if (!session || !session.id) {
      els.avatarSaveMsg.hidden = false;
      els.avatarSaveMsg.textContent = 'この機能は生徒登録した方のみご利用いただけます。';
      return;
    }
    if (avatarMode === 'preset' && !avatarPresetDraft) {
      els.avatarSaveMsg.hidden = false;
      els.avatarSaveMsg.textContent = 'イラストを1つ選んでください。';
      return;
    }
    var payload = avatarMode === 'preset' ? { preset: avatarPresetDraft } : avatarDraft;
    els.avatarSaveBtn.disabled = true;
    apiPost('saveAvatar', { id: session.id, avatar: payload }).then(function (res) {
      els.avatarSaveBtn.disabled = false;
      if (!res.ok) {
        els.avatarSaveMsg.hidden = false;
        els.avatarSaveMsg.textContent = res.error === 'not_unlocked'
          ? 'まだアバター作成が解放されていません。'
          : '保存に失敗しました。もう一度お試しください。';
        return;
      }
      state.avatar = Object.assign({}, payload);
      saveGameState(state);
      updateUserAvatarBadge();
      els.avatarSaveMsg.hidden = false;
      els.avatarSaveMsg.textContent = '保存しました！';
    }).catch(function () {
      els.avatarSaveBtn.disabled = false;
      els.avatarSaveMsg.hidden = false;
      els.avatarSaveMsg.textContent = '通信に失敗しました。もう一度お試しください。';
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
  els.rankingTabPoints.addEventListener('click', function () { selectRankingMode('points'); });
  els.rankingTabGrade.addEventListener('click', function () { selectRankingMode('grade'); });
  els.rankingTabHp.addEventListener('click', function () { selectRankingMode('hp'); });
  els.rankingTabChallenge.addEventListener('click', function () { selectRankingMode('challenge'); });
  if (els.subjectToggle) els.subjectToggle.addEventListener('click', toggleSubject);
  els.giftToggle.addEventListener('click', toggleGift);
  els.shopToggle.addEventListener('click', toggleShop);
  els.curseBannerBtn.addEventListener('click', toggleShop);
  if (els.hpGameOverLogoutBtn) els.hpGameOverLogoutBtn.addEventListener('click', handleLogout);
  if (els.hpGameOverShopBtn) els.hpGameOverShopBtn.addEventListener('click', toggleShop);
  els.prefectureToggle.addEventListener('click', togglePrefecture);
  els.avatarToggle.addEventListener('click', toggleAvatar);
  els.worldToggle.addEventListener('click', toggleWorld);
  if (els.worldDiceTestBtn) {
    els.worldDiceTestBtn.addEventListener('click', function () {
      rollOnceWorldCountryDice_();
      saveGameState(state);
      var session = loadSession();
      if (session && session.id) apiPost('syncPoints', buildProgressSyncPayload(session.id)).catch(function () { });
      showNextWorldDiceRoll_();
    });
  }
  // 00001限定のボス戦テスト。世界一周の進行状況(worldCountry等)には一切触れず、
  // 挑戦中フラグだけを立てて、その場でボス戦を始める(挑戦中フラグは端末セッション
  // 限定なので、ページを再読み込みすれば元に戻る)。
  if (els.worldBossTestRow) {
    els.worldBossTestRow.querySelectorAll('[data-boss-test]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var stageId = Number(btn.getAttribute('data-boss-test')) || 1;
        state.worldBossActiveStage = stageId;
        state.worldBossSubIndex[stageId] = 0;
        state.streak = 0;
        state.worldPendingSpell = null;
        state.worldBossDamage = 0;
        saveGameState(state);
        renderWorldPanel();
        updateGameHud();
        nextQuestion();
        els.worldPanel.setAttribute('hidden', '');
      });
    });
  }
  if (els.worldDiceCloseBtn) {
    els.worldDiceCloseBtn.addEventListener('click', function () {
      if (worldDiceRollQueue_.length > 0) {
        showNextWorldDiceRoll_();
      } else {
        els.worldDiceModal.hidden = true;
        renderWorldPanel();
      }
    });
  }
  els.grantToggle.addEventListener('click', toggleGrant);
  els.grantForm.addEventListener('submit', handleGrantSubmit);
  els.avatarSaveBtn.addEventListener('click', handleAvatarSave);
  els.avatarModePresetBtn.addEventListener('click', function () { setAvatarMode_('preset'); });
  els.avatarModePartsBtn.addEventListener('click', function () { setAvatarMode_('parts'); });
  els.testPhotoToggle.addEventListener('click', toggleTestPhoto);
  els.penaTestFileInput.addEventListener('change', function () {
    els.penaTestSubmitBtn.disabled = !(els.penaTestFileInput.files && els.penaTestFileInput.files[0]);
  });
  els.penaTestSubmitBtn.addEventListener('click', submitPenaTestPhoto);
  Array.from(els.rankingTierRow.children).forEach(function (btn) {
    btn.addEventListener('click', function () { handleRankingTierClick(btn.dataset.tier); });
  });
  els.rankingTestConfirmYes.addEventListener('click', submitRankingTestPhoto);
  els.rankingTestConfirmNo.addEventListener('click', cancelRankingTierConfirm);
  els.hyakuMasuFileInput.addEventListener('change', updateHyakuMasuSubmitEnabled);
  els.hyakuMasuConfirmCheckbox.addEventListener('change', updateHyakuMasuSubmitEnabled);
  els.hyakuMasuSubmitBtn.addEventListener('click', submitHyakuMasuPhoto);
  Array.from(els.challengeTierRow.children).forEach(function (btn) {
    btn.addEventListener('click', function () { handleChallengeTierClick(btn.dataset.tier); });
  });
  els.challengeTestConfirmYes.addEventListener('click', submitChallengeTestPhoto);
  els.challengeTestConfirmNo.addEventListener('click', cancelChallengeTierConfirm);
  els.weeklyQuizToggle.addEventListener('click', toggleWeeklyQuiz);
  els.weeklyQuizSpecialBannerBtn.addEventListener('click', toggleWeeklyQuiz);
  els.weeklyQuizConfirmYes.addEventListener('click', submitWeeklyQuizAnswer);
  els.weeklyQuizConfirmNo.addEventListener('click', cancelWeeklyQuizConfirm);
  if (els.bakuretsuQuizToggle) els.bakuretsuQuizToggle.addEventListener('click', toggleBakuretsuQuiz);
  if (els.teamEventToggle) els.teamEventToggle.addEventListener('click', toggleTeamEvent);
  if (els.teamEventBannerBtn) els.teamEventBannerBtn.addEventListener('click', toggleTeamEvent);
  els.withdrawToggle.addEventListener('click', toggleWithdraw);
  els.withdrawSubmitBtn.addEventListener('click', handleWithdrawSubmitClick);
  els.withdrawConfirmYes.addEventListener('click', submitWithdraw);
  els.withdrawConfirmNo.addEventListener('click', cancelWithdrawConfirm);

  applyMenuNewBadges();
  els.loginGateNotice.hidden = isLoginGateActive_();

  // 未送信のlogキューを、起動時・オンライン復帰時・定期的(2分ごと)に再送を試みる。
  flushLogQueue_();
  window.addEventListener('online', flushLogQueue_);
  setInterval(flushLogQueue_, 2 * 60 * 1000);

  // タブ/PWAを閉じずに何日も使い続けると、ページの再読み込み(getPoints呼び出し)が
  // 発生しないままlast_loginだけが古くなり、次に何らかの理由で再ログインした際に
  // 「5日以上ログイン無し」と誤判定されてMPが0にリセットされてしまうことがあった。
  // これを防ぐため、ログイン中は1時間おきに軽くgetPointsを呼んでlast_loginを
  // 更新し続ける(レスポンスは特に画面に反映しない、生存確認のみが目的)。
  setInterval(function () {
    var s = loadSession();
    if (s && s.id) apiPost('getPoints', { id: s.id }).catch(function () { });
  }, 60 * 60 * 1000);

  var existingSession = loadSession();
  if (existingSession) {
    showApp(existingSession.name, !!existingSession.guest);
    if (existingSession.id) {
      apiPost('getPoints', { id: existingSession.id }).then(function (res) {
        if (res.ok) {
          var parsedAvatar = parseAvatarJson(res.avatar);
          if (parsedAvatar) { state.avatar = parsedAvatar; saveGameState(state); updateUserAvatarBadge(); }
          if (res.pendingItems && res.pendingItems.length > 0) applyPendingItemGrants(res.pendingItems);
          if (res.apologyBonusAwarded > 0) { state.points += res.apologyBonusAwarded; saveGameState(state); }
          reconcilePoints(existingSession.id, res);
          if (res.pendingNotice) {
            window.alert(res.pendingNotice);
          }
          if (!existingSession.grade && res.grade) {
            existingSession.grade = res.grade;
            saveSession(existingSession);
            // 学年不明の間に既に保存済みの出題範囲設定があれば、それを優先して上書きしない。
            var hadSavedEnabled = savedProgress && Array.isArray(savedProgress.enabled) && savedProgress.enabled.length > 0;
            if (!hadSavedEnabled) state.enabled = new Set(defaultEnabledIds(res.grade));
            renderSettings();
          }
          if (res.apologyBonusAwarded > 0) {
            window.alert(`🙇 お詫びとして+${res.apologyBonusAwarded}MPを付与しました！`);
          }
        }
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
