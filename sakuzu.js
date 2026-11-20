/* 📐 作図にチャレンジ(2026-11-18〜、先生(00001)だけのプレビュー)
   コンパスと定規だけを使って、画面の上で本当に作図する。
   - コンパス：中心にする点をタップ → 半径をきめる場所をタップ(点の近くなら点にぴったり)。「⭕ 同じ大きさの円」の道具で、点をタップするだけで1つ前の円と同じ半径の円がかける。
   - 円の形：「⭕ 円」か「◠ 3分の2の円」(240°の弧。コンパスは半径をきめた場所の側、同じ大きさの円は2回目にタップした側にかく)をえらべる。
   - 定規：2つの点をタップすると、その2点を通る直線を引く。
   - 答えの点：答えが「点」の問題で、作図してできた点をタップして答える。
   - 点は、はじめからある点と、線や円が交わる点(交点)だけ。タップすると一番近い点に吸いつく。
   レベル：基本・標準・入試。答えの種類(target.kind)は line(直線)・point(点)・circle(円)。
   app.js から window.Sakuzu.mount(要素, { onCorrect }) で使う。 */
(function () {
  'use strict';
  var W = 360, H = 360, SNAP = 22, EPS = 1e-6, TOL = 2.5;
  // 解答欄は縦に1.5倍(2026-11-20 先生「入らない」)：問題の図(0〜360)の上下に90ずつ広げて見せる
  var VY = -90, VH = 540;
  // 3分の2の円(弧)：コンパスの円を、向きをきめた240°の弧でかく(2026-11-20 先生「円だと交点が多くなる」)
  var ARC_HALF = Math.PI * 2 / 3;
  function onArc(o, p) {
    if (!o.arc) return true;
    var d = Math.atan2(p.y - o.c.y, p.x - o.c.x) - o.a0;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return Math.abs(d) <= ARC_HALF + 0.01;
  }

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function dist(p, q) { return Math.hypot(p.x - q.x, p.y - q.y); }
  function unit(dx, dy) { var l = Math.hypot(dx, dy) || 1; return { x: dx / l, y: dy / l }; }
  // 点Oから、長さlen・角度deg(左回りが正、画面で見た向き)の点
  function at(O, len, deg, label) { var t = deg * Math.PI / 180; var p = { x: O.x + len * Math.cos(t), y: O.y - len * Math.sin(t) }; if (label) p.label = label; return p; }
  function dirDeg(deg) { var t = deg * Math.PI / 180; return { x: Math.cos(t), y: -Math.sin(t) }; }
  function foot(P, A, B) { var u = unit(B.x - A.x, B.y - A.y); var t = (P.x - A.x) * u.x + (P.y - A.y) * u.y; return { x: A.x + t * u.x, y: A.y + t * u.y }; }
  function reflect(P, A, B) { var f = foot(P, A, B); return { x: 2 * f.x - P.x, y: 2 * f.y - P.y }; }
  function lineMeet(p1, u1, p2, u2) { var den = u1.x * u2.y - u1.y * u2.x; var t = ((p2.x - p1.x) * u2.y - (p2.y - p1.y) * u2.x) / den; return { x: p1.x + t * u1.x, y: p1.y + t * u1.y }; }
  function circumcenter(A, B, C) {
    var d = 2 * (A.x * (B.y - C.y) + B.x * (C.y - A.y) + C.x * (A.y - B.y));
    var a2 = A.x * A.x + A.y * A.y, b2 = B.x * B.x + B.y * B.y, c2 = C.x * C.x + C.y * C.y;
    return { x: (a2 * (B.y - C.y) + b2 * (C.y - A.y) + c2 * (A.y - B.y)) / d, y: (a2 * (C.x - B.x) + b2 * (A.x - C.x) + c2 * (B.x - A.x)) / d };
  }
  function incenter(A, B, C) {
    var a = dist(B, C), b = dist(C, A), c = dist(A, B), s = a + b + c;
    return { x: (a * A.x + b * B.x + c * C.x) / s, y: (a * A.y + b * B.y + c * C.y) / s };
  }
  function tri() {
    var A = { x: rnd(50, 100), y: rnd(215, 245), label: 'A' };
    var B = { x: rnd(260, 310), y: rnd(205, 245), label: 'B' };
    var C = { x: rnd(140, 220), y: rnd(45, 80), label: 'C' };
    return [A, B, C];
  }
  function triObjs(A, B, C) { return [{ type: 'segment', p: A, q: B }, { type: 'segment', p: B, q: C }, { type: 'segment', p: C, q: A }]; }
  function lineAcross(y0, tilt, label) { return { type: 'line', p: { x: 20, y: y0 - tilt * 160 }, q: { x: 340, y: y0 + tilt * 160 }, label: label || 'ℓ' }; }
  function onLine(L, x) { return { x: x, y: L.p.y + (L.q.y - L.p.y) / (L.q.x - L.p.x) * (x - L.p.x) }; }

  // ---- 問題 ----
  var LEVELS = [{ id: 'basic', label: '基本' }, { id: 'std', label: '標準' }, { id: 'exam', label: '入試' }];
  var PROBLEMS = [
    // ===== 基本 =====
    {
      id: 'bisector', level: 'basic', title: '線分ABの垂直二等分線',
      make: function () {
        var A = { x: rnd(60, 100), y: rnd(200, 250), label: 'A' }, B = { x: rnd(260, 300), y: rnd(150, 210), label: 'B' };
        return {
          points: [A, B], objs: [{ type: 'segment', p: A, q: B }],
          target: { kind: 'line', lines: [{ p: { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }, u: unit(-(B.y - A.y), B.x - A.x) }] },
          hint: '① 点Aを中心に円をかく（半径はABの半分より大きく）。② 点Bを中心に、同じ半径の円をかく。③ 2つの円の交点2つを定規で結ぶ。',
        };
      },
    },
    {
      id: 'angle', level: 'basic', title: '∠AOBの二等分線',
      make: function () {
        var O = { x: rnd(50, 70), y: rnd(290, 310), label: 'O' }, d1 = rnd(0, 15), d2 = d1 + rnd(40, 80);
        var A = at(O, 250, d1, 'A'), B = at(O, 200, d2, 'B');
        return {
          points: [O, A, B], objs: [{ type: 'ray', p: O, q: A }, { type: 'ray', p: O, q: B }],
          target: { kind: 'line', lines: [{ p: O, u: dirDeg((d1 + d2) / 2) }] },
          hint: '① 点Oを中心に円をかき、辺OA・辺OBとの交点をつくる。② その2つの交点を中心に、同じ半径の円をそれぞれかく。③ その2つの円の交点と、点Oを定規で結ぶ。',
        };
      },
    },
    {
      id: 'perpOut', level: 'basic', title: '点Pを通る、直線ℓの垂線（Pは直線の外）',
      make: function () {
        var L = lineAcross(rnd(230, 260), rnd(-0.15, 0.15)), u = unit(L.q.x - L.p.x, L.q.y - L.p.y);
        var P = onLine(L, rnd(150, 210)); P.y -= rnd(110, 150); P.label = 'P';
        return {
          points: [P], objs: [L], target: { kind: 'line', lines: [{ p: P, u: { x: -u.y, y: u.x } }] },
          hint: '① 点Pを中心に、直線ℓと2点で交わる円をかく。② その2つの交点を中心に、同じ半径の円をそれぞれかく。③ その2つの円の交点と、点Pを定規で結ぶ。',
        };
      },
    },
    {
      id: 'perpOn', level: 'basic', title: '直線ℓ上の点Pを通る、ℓの垂線',
      make: function () {
        var L = lineAcross(rnd(200, 240), rnd(-0.15, 0.15)), u = unit(L.q.x - L.p.x, L.q.y - L.p.y);
        var P = onLine(L, rnd(160, 200)); P.label = 'P';
        return {
          points: [P], objs: [L], target: { kind: 'line', lines: [{ p: P, u: { x: -u.y, y: u.x } }] },
          hint: '① 点Pを中心に円をかき、直線ℓとの交点を2つつくる。② その2つの交点を中心に、①より大きい同じ半径の円をそれぞれかく。③ その2つの円の交点と、点Pを定規で結ぶ。',
        };
      },
    },
    // ===== 標準 =====
    {
      id: 'circum', level: 'std', title: '3点A、B、Cを通る円の中心O',
      make: function () {
        var t = tri();
        return {
          points: t, objs: triObjs(t[0], t[1], t[2]), target: { kind: 'point', p: circumcenter(t[0], t[1], t[2]) },
          ask: '作図してできた中心Oを「📍 答えの点」でタップしてね。',
          hint: '円の中心は、A・B・Cのどれからも同じ距離にある点。① 辺ABの垂直二等分線をひく。② 辺BCの垂直二等分線をひく。③ 2本の交点が中心O。',
        };
      },
    },
    {
      id: 'tangent', level: 'std', title: '円Oの周上の点Aを通る、円Oの接線',
      make: function () {
        var O = { x: rnd(160, 200), y: rnd(200, 230), label: 'O' }, r = rnd(80, 95), deg = rnd(20, 70) * (Math.random() < 0.5 ? 1 : -1) + (Math.random() < 0.5 ? 0 : 180);
        if (Math.sin(deg * Math.PI / 180) < -0.3) deg = -deg; // 下すぎると画面からはみ出すので上側に
        var A = at(O, r, deg, 'A');
        return {
          points: [O, A], objs: [{ type: 'circle', c: O, r: r, given: true }],
          target: { kind: 'line', lines: [{ p: A, u: dirDeg(deg + 90) }] },
          hint: '接線は、接点Aを通る半径OAに垂直な直線。① 定規で直線OAをひく。② 直線OA上の点Aを通る垂線を作図する（基本の「直線上の点を通る垂線」と同じ）。',
        };
      },
    },
    {
      id: 'eqOnLine', level: 'std', title: '直線ℓ上にあって、2点A、Bから等しい距離にある点P',
      make: function () {
        for (var k = 0; k < 50; k++) {
          var L = lineAcross(rnd(270, 300), rnd(-0.08, 0.08));
          var A = { x: rnd(60, 130), y: rnd(70, 130), label: 'A' }, B = { x: rnd(220, 300), y: rnd(150, 210), label: 'B' };
          var M = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
          var P = lineMeet(M, unit(-(B.y - A.y), B.x - A.x), L.p, unit(L.q.x - L.p.x, L.q.y - L.p.y));
          if (P.x > 40 && P.x < 320) {
            return {
              points: [A, B], objs: [L], target: { kind: 'point', p: P },
              ask: '作図してできた点Pを「📍 答えの点」でタップしてね。',
              hint: 'AとBから等しい距離にある点は、線分ABの垂直二等分線の上にある。① 線分ABの垂直二等分線をひく。② それと直線ℓの交点がP。',
            };
          }
        }
        return PROBLEMS[0].make();
      },
    },
    {
      id: 'angle45', level: 'std', title: '∠XOA＝45°となる直線OA',
      make: function () {
        var O = { x: rnd(110, 150), y: rnd(250, 280), label: 'O' }, d0 = rnd(-6, 6), X = at(O, 190, d0, 'X');
        return {
          points: [O, X], objs: [{ type: 'line', p: at(O, 100, d0 + 180), q: X }],
          target: { kind: 'line', lines: [{ p: O, u: dirDeg(d0 + 45) }, { p: O, u: dirDeg(d0 - 45) }] },
          hint: '45°は90°の半分。① 直線OX上の点Oを通る垂線をひいて90°をつくる。② その90°の角の二等分線をひく。',
        };
      },
    },
    {
      id: 'angle30', level: 'std', title: '∠XOA＝30°となる直線OA',
      make: function () {
        var O = { x: rnd(70, 100), y: rnd(270, 300), label: 'O' }, d0 = rnd(-6, 6), X = at(O, 250, d0, 'X');
        return {
          points: [O, X], objs: [{ type: 'ray', p: O, q: X }],
          target: { kind: 'line', lines: [{ p: O, u: dirDeg(d0 + 30) }, { p: O, u: dirDeg(d0 - 30) }] },
          hint: '30°は60°の半分。60°は正三角形の角。① 点Oを中心に円をかき、半直線OXとの交点Eをつくる。② 点Eを中心に、同じ半径の円をかく（交点Fと、O・Eで正三角形）。③ ∠EOF(60°)の二等分線をひく。',
        };
      },
    },
    // ===== 入試 =====
    {
      id: 'incenter', level: 'exam', title: '△ABCの3辺から等しい距離にある点I（内心）',
      make: function () {
        var t = tri();
        return {
          points: t, objs: triObjs(t[0], t[1], t[2]), target: { kind: 'point', p: incenter(t[0], t[1], t[2]) },
          ask: '作図してできた点Iを「📍 答えの点」でタップしてね。',
          hint: '2辺から等しい距離にある点は、角の二等分線の上にある。① ∠Aの二等分線をひく。② ∠Bの二等分線をひく。③ 2本の交点がI。',
        };
      },
    },
    {
      id: 'shortest', level: 'exam', title: '直線ℓ上の点Pで、AP＋PBがいちばん短くなる点P',
      make: function () {
        for (var k = 0; k < 50; k++) {
          var L = lineAcross(rnd(195, 215), rnd(-0.06, 0.06));
          var A = { x: rnd(60, 120), y: rnd(60, 110), label: 'A' }, B = { x: rnd(230, 300), y: rnd(100, 160), label: 'B' };
          var A2 = reflect(A, L.p, L.q);
          var P = lineMeet(A2, unit(B.x - A2.x, B.y - A2.y), L.p, unit(L.q.x - L.p.x, L.q.y - L.p.y));
          if (A2.y < 340 && P.x > 50 && P.x < 310) {
            return {
              points: [A, B], objs: [L], target: { kind: 'point', p: P },
              ask: '作図してできた点Pを「📍 答えの点」でタップしてね。',
              hint: '直線ℓについて点Aと対称な点A′をつくると、AP＝A′P。① 点Aから直線ℓに垂線をひく。② ℓとの交点を中心に、Aを通る円をかいて、垂線の反対側にA′をつくる。③ A′とBを定規で結ぶ。④ その直線とℓの交点がP。',
            };
          }
        }
        return PROBLEMS[0].make();
      },
    },
    {
      id: 'tangentCircle', level: 'exam', title: '点Aを中心とし、直線ℓに接する円',
      make: function () {
        var L = lineAcross(rnd(250, 280), rnd(-0.15, 0.15));
        var A = { x: rnd(140, 220), y: 0, label: 'A' }; A.y = onLine(L, A.x).y - rnd(90, 130);
        var F = foot(A, L.p, L.q);
        return {
          points: [A], objs: [L], target: { kind: 'circle', c: A, r: dist(A, F) },
          hint: '接する円の半径は、中心Aから直線ℓまでの距離（垂線の長さ）。① 点Aから直線ℓに垂線をひく。② 垂線とℓの交点Hを通るように、Aを中心に円をかく。',
        };
      },
    },
    {
      id: 'rotate90', level: 'exam', title: '点Oを中心に、点Aを左回りに90°回転させた点A′',
      make: function () {
        var O = { x: rnd(150, 190), y: rnd(220, 250), label: 'O' }, d = rnd(-25, 25), r = rnd(100, 120);
        var A = at(O, r, d, 'A');
        return {
          points: [O, A], objs: [],
          target: { kind: 'point', p: at(O, r, d + 90) },
          ask: '作図してできた点A′を「📍 答えの点」でタップしてね。',
          hint: '回転させても、Oからの距離は同じ。① 定規で直線OAをひく。② 直線OA上の点Oを通る垂線をひく。③ Oを中心に、Aを通る円をかく。④ 円と垂線の交点のうち、左回りに90°のほうがA′。',
        };
      },
    },
  ];

  // ---- 交点 ----
  function lineOf(o) {
    var u = unit(o.q.x - o.p.x, o.q.y - o.p.y);
    return { p: o.p, u: u, min: o.type === 'line' ? -Infinity : 0, max: o.type === 'segment' ? dist(o.p, o.q) : Infinity };
  }
  function onRange(L, t) { return t >= L.min - EPS && t <= L.max + EPS; }
  function interLL(a, b) {
    var A = lineOf(a), B = lineOf(b);
    var den = A.u.x * B.u.y - A.u.y * B.u.x;
    if (Math.abs(den) < 1e-9) return [];
    var dx = B.p.x - A.p.x, dy = B.p.y - A.p.y;
    var t = (dx * B.u.y - dy * B.u.x) / den, s = (dx * A.u.y - dy * A.u.x) / den;
    if (!onRange(A, t) || !onRange(B, s)) return [];
    return [{ x: A.p.x + t * A.u.x, y: A.p.y + t * A.u.y }];
  }
  function interLC(l, c) {
    var L = lineOf(l);
    var fx = L.p.x - c.c.x, fy = L.p.y - c.c.y;
    var b = fx * L.u.x + fy * L.u.y, cc = fx * fx + fy * fy - c.r * c.r;
    var D = b * b - cc;
    if (D < -EPS) return [];
    var sq = Math.sqrt(Math.max(0, D)), out = [];
    [-b - sq, -b + sq].forEach(function (t) { if (onRange(L, t)) out.push({ x: L.p.x + t * L.u.x, y: L.p.y + t * L.u.y }); });
    return out;
  }
  function interCC(a, b) {
    var d = dist(a.c, b.c);
    if (d < EPS || d > a.r + b.r + EPS || d < Math.abs(a.r - b.r) - EPS) return [];
    var x = (d * d + a.r * a.r - b.r * b.r) / (2 * d);
    var h = Math.sqrt(Math.max(0, a.r * a.r - x * x));
    var ux = (b.c.x - a.c.x) / d, uy = (b.c.y - a.c.y) / d;
    var mx = a.c.x + x * ux, my = a.c.y + x * uy;
    return [{ x: mx - h * uy, y: my + h * ux }, { x: mx + h * uy, y: my - h * ux }];
  }
  function intersect(a, b) {
    var la = a.type !== 'circle', lb = b.type !== 'circle', out;
    if (la && lb) return interLL(a, b);
    if (la) out = interLC(a, b);
    else if (lb) out = interLC(b, a);
    else out = interCC(a, b);
    return out.filter(function (p) { return onArc(a, p) && onArc(b, p); });
  }
  function lineMatches(o, T) {
    var L = lineOf(o);
    var cross = Math.abs(L.u.x * T.u.y - L.u.y * T.u.x);
    var off = Math.abs((T.p.x - L.p.x) * L.u.y - (T.p.y - L.p.y) * L.u.x);
    return cross < 0.02 && off < TOL;
  }

  // ---- 画面 ----
  function mount(root, opts) {
    opts = opts || {};
    var st = { level: 'basic', pid: 'bisector', prob: null, objs: [], points: [], tool: 'compass', pick: null, lastR: 0, done: false, history: [], arcMode: false };
    try { st.arcMode = localStorage.getItem('sakuzuArcMode') === '1'; } catch (e) { }
    // 円をつくる(3分の2の円のときは、dirの向きを真ん中にした240°の弧)
    function makeCircle(c, r, dir) {
      var o = { type: 'circle', c: { x: c.x, y: c.y }, r: r };
      if (st.arcMode && dir && dist(c, dir) > 0.5) { o.arc = true; o.a0 = Math.atan2(dir.y - c.y, dir.x - c.x); }
      return o;
    }
    function setArcMode(on) {
      st.arcMode = !!on; st.pick = null;
      try { localStorage.setItem('sakuzuArcMode', on ? '1' : '0'); } catch (e) { }
      root.querySelectorAll('.sk-arcmode').forEach(function (b) { b.classList.toggle('is-on', (b.getAttribute('data-a') === '1') === st.arcMode); });
      if (!st.done) msg(st.arcMode ? '◠ <b>3分の2の円</b>でかくよ。コンパスでは、半径をきめるためにタップした場所のほうに弧がかけるよ。' : '⭕ <b>円</b>でかくよ。');
      draw();
    }

    root.innerHTML =
      '<div class="sk-levels"></div>' +
      '<div class="sk-top"><select class="sk-sel"></select> <button type="button" class="ghost-btn sk-new">🔄 別の図</button></div>' +
      '<p class="sk-title"></p>' +
      '<svg class="sk-svg" viewBox="0 ' + VY + ' ' + W + ' ' + VH + '" xmlns="http://www.w3.org/2000/svg"></svg>' +
      '<div class="sk-shape">円の形：<button type="button" class="ghost-btn sk-arcmode" data-a="0">⭕ 円</button><button type="button" class="ghost-btn sk-arcmode" data-a="1">◠ 3分の2の円</button></div>' +
      '<div class="sk-tools">' +
      '<button type="button" class="ghost-btn sk-tool" data-t="compass">🧭 コンパス</button>' +
      '<button type="button" class="ghost-btn sk-tool" data-t="ruler">📏 定規</button>' +
      '<button type="button" class="ghost-btn sk-tool" data-t="answer" hidden>📍 答えの点</button>' +
      '<button type="button" class="ghost-btn sk-tool" data-t="same">⭕ 同じ大きさの円</button>' +
      '</div>' +
      '<p class="sk-msg"></p>' +
      '<div class="sk-tools"><button type="button" class="ghost-btn sk-undo">↩️ 1つもどす</button> <button type="button" class="ghost-btn sk-reset">🗑 はじめから</button> <button type="button" class="ghost-btn sk-hint">💡 ヒント</button></div>' +
      '<p class="sk-hinttext" hidden></p>';
    var $ = function (c) { return root.querySelector(c); };
    var svg = $('.sk-svg'), sel = $('.sk-sel');
    $('.sk-levels').innerHTML = LEVELS.map(function (l) { return '<button type="button" class="ghost-btn sk-level" data-lv="' + l.id + '">' + l.label + '</button>'; }).join('');

    function byId(id) { for (var i = 0; i < PROBLEMS.length; i++) if (PROBLEMS[i].id === id) return PROBLEMS[i]; return PROBLEMS[0]; }
    function setLevel(lv) {
      st.level = lv;
      root.querySelectorAll('.sk-level').forEach(function (b) { b.classList.toggle('is-on', b.getAttribute('data-lv') === lv); });
      sel.innerHTML = '';
      PROBLEMS.filter(function (p) { return p.level === lv; }).forEach(function (p) { var o = document.createElement('option'); o.value = p.id; o.textContent = p.title; sel.appendChild(o); });
      start(sel.value);
    }
    function start(pid) {
      var def = byId(pid);
      st.pid = def.id; sel.value = def.id;
      var pr = def.make();
      st.prob = pr;
      st.objs = pr.objs.slice();
      st.history = [];
      st.pick = null; st.lastR = 0; st.done = false; st.correctObj = null;
      $('.sk-title').textContent = '📐 ' + def.title + 'を作図しよう！';
      $('.sk-hinttext').hidden = true;
      $('.sk-hinttext').textContent = pr.hint;
      $('.sk-tool[data-t="answer"]').hidden = pr.target.kind !== 'point';
      setTool('compass');
      recompute();
      msg('コンパスで円をかこう。まず、円の中心にする点をタップしてね。' + (pr.ask ? '<br>' + pr.ask : ''));
    }
    function msg(t) { $('.sk-msg').innerHTML = t; }
    function setTool(t) {
      st.tool = t; st.pick = null;
      root.querySelectorAll('.sk-tool').forEach(function (b) { b.classList.toggle('is-on', b.getAttribute('data-t') === t); });
      if (!st.done) msg(t === 'compass' ? '円の中心にする点をタップしてね。' : t === 'ruler' ? '直線を引く1つめの点をタップしてね。'
        : t === 'same' ? (st.lastR ? '円の中心にする点をタップすると、<b>1つ前の円と同じ大きさ</b>の円がかけるよ。' : 'まだ円がないよ。先に「🧭 コンパス」で円を1つかいてね。')
        : '答えだと思う点（作図してできた点）をタップしてね。');
      draw();
    }
    function recompute() {
      var pts = st.prob.points.map(function (p) { return { x: p.x, y: p.y, label: p.label, given: true }; });
      st.prob.objs.forEach(function (o) { if (o.type === 'segment') { [o.p, o.q].forEach(function (e) { add(pts, e); }); } });
      for (var i = 0; i < st.objs.length; i++) for (var j = i + 1; j < st.objs.length; j++) {
        intersect(st.objs[i], st.objs[j]).forEach(function (p) { if (p.x > -20 && p.x < W + 20 && p.y > VY - 20 && p.y < VY + VH + 20) add(pts, p); });
      }
      st.points = pts;
      draw();
    }
    function add(pts, p) { for (var k = 0; k < pts.length; k++) if (dist(pts[k], p) < 1.5) return; pts.push({ x: p.x, y: p.y }); }
    function nearest(p) {
      var best = null, bd = SNAP;
      st.points.forEach(function (q) { var d = dist(p, q); if (d < bd) { bd = d; best = q; } });
      return best;
    }
    function toSvg(ev) {
      var pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
      var m = svg.getScreenCTM(); if (!m) return { x: 0, y: 0 };
      var r = pt.matrixTransform(m.inverse()); return { x: r.x, y: r.y };
    }
    function correct(obj) {
      st.done = true; st.correctObj = obj;
      msg('⭕ <b>正解！</b>きれいに作図できたね！「🔄 別の図」で次の問題にチャレンジしよう。');
      draw();
      if (opts.onCorrect) try { var extra = opts.onCorrect(st.pid); if (extra) $('.sk-msg').innerHTML += '<br>' + extra; } catch (e) { }
    }
    function push(o) {
      st.objs.push(o); st.history.push(o);
      recompute();
      var T = st.prob.target;
      if (o.type === 'line' && T.kind === 'line') {
        if (T.lines.some(function (t) { return lineMatches(o, t); })) correct(o);
        else {
          // 交点を結んだ2つの円の半径がちがうときは、その理由を出す
          var ends = [o.p, o.q], radii = [];
          st.objs.forEach(function (c2) { if (c2.type === 'circle' && ends.every(function (e) { return Math.abs(dist(c2.c, e) - c2.r) < 1.5; })) radii.push(c2.r); });
          var diffR = radii.length >= 2 && Math.max.apply(null, radii) - Math.min.apply(null, radii) > 1;
          msg('❌ その直線は正しい作図の線ではないみたい。' + (diffR ? '<b>2つの円の半径がちがう</b>よ。同じ半径の円でかこう（2つめの円は「⭕ 同じ大きさの円」を使うとかんたん）。' : '') + '「↩️ 1つもどす」で消して、もう一度考えてみよう。');
        }
      } else if (o.type === 'circle' && T.kind === 'circle' && dist(o.c, T.c) < TOL && Math.abs(o.r - T.r) < TOL) {
        correct(o);
      }
    }

    svg.addEventListener('click', function (ev) {
      if (st.done) return;
      var p = toSvg(ev), sn = nearest(p);
      if (st.tool === 'compass') {
        if (!st.pick) {
          if (!sn) { msg('円の中心は、点（●）の上をタップしてね。'); return; }
          st.pick = sn;
          msg('次に、円の半径をきめる場所をタップしてね。' + (st.lastR ? '1つ前の円と同じ大きさにしたいときは「⭕ 同じ大きさの円」を使ってね。' : ''));
          draw();
        } else {
          var to = sn || p, r = dist(st.pick, to), snapped = false;
          if (r < 8) { msg('半径が小さすぎます。もう少しはなれた場所をタップしてね。'); return; }
          // 指で同じ大きさの円をかくのはむずかしいので、点の上でないときは、前にかいた円の半径に近ければその半径にそろえる(2026-11-19 先生「少しでもズレると不正解」)。
          if (!sn) {
            var bestR = 0, bestD = Infinity;
            st.objs.forEach(function (o) { if (o.type === 'circle') { var d = Math.abs(o.r - r); if (d < bestD) { bestD = d; bestR = o.r; } } });
            if (bestR && bestD <= Math.max(14, bestR * 0.15)) { r = bestR; snapped = true; }
          }
          var c = st.pick; st.pick = null; st.lastR = r;
          push(makeCircle(c, r, to));
          if (!st.done) msg((snapped ? '前の円と<b>同じ半径</b>にそろえて、' : '') + '円をかいたよ。続けて、次の円の中心にする点をタップしてね（直線を引くときは「📏 定規」）。');
        }
      } else if (st.tool === 'ruler') {
        if (!sn) { msg('定規は、点（●）の上をタップしてね。'); return; }
        if (!st.pick) { st.pick = sn; msg('2つめの点をタップしてね。'); draw(); return; }
        if (dist(st.pick, sn) < 1) { msg('ちがう点をタップしてね。'); return; }
        var a = st.pick; st.pick = null;
        push({ type: 'line', p: { x: a.x, y: a.y }, q: { x: sn.x, y: sn.y }, mine: true });
        if (!st.done && st.prob.target.kind !== 'line') msg('直線を引いたよ。');
      } else if (st.tool === 'same') {
        // ⭕ 同じ大きさの円(2026-11-19 先生の指示)：点をタップするだけで、1つ前にかいた円と同じ半径の円をかく
        if (!st.lastR) { msg('まだ円がないよ。先に「🧭 コンパス」で円を1つかいてね。'); return; }
        if (st.arcMode) {
          // 3分の2の円：①中心の点 → ②弧をかきたい側をタップ
          if (!st.pick) {
            if (!sn) { msg('円の中心は、点（●）の上をタップしてね。'); return; }
            st.pick = sn; msg('次に、弧をかきたい側（どこでもよい）をタップしてね。'); draw(); return;
          }
          if (dist(st.pick, p) < 3) { msg('中心から少しはなれた場所をタップしてね。'); return; }
          var c2 = st.pick; st.pick = null;
          push(makeCircle(c2, st.lastR, p));
          if (!st.done) msg('1つ前の円と同じ大きさの弧をかいたよ。続けて、次の中心の点をタップしてね。');
          return;
        }
        if (!sn) { msg('円の中心は、点（●）の上をタップしてね。'); return; }
        push({ type: 'circle', c: { x: sn.x, y: sn.y }, r: st.lastR });
        if (!st.done) msg('1つ前の円と同じ大きさの円をかいたよ。続けて点をタップすると、また同じ大きさの円がかけるよ。');
      } else {
        if (!sn) { msg('点（●）の上をタップしてね。'); return; }
        if (dist(sn, st.prob.target.p) < TOL) { st.answerPt = sn; correct(null); }
        else msg('❌ その点ではないみたい。作図を続けるか、ヒントを見てみよう。');
      }
    });
    root.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.classList.contains('sk-level')) setLevel(b.getAttribute('data-lv'));
      else if (b.classList.contains('sk-arcmode')) setArcMode(b.getAttribute('data-a') === '1');
      else if (b.classList.contains('sk-tool')) setTool(b.getAttribute('data-t'));
      else if (b.classList.contains('sk-undo')) {
        if (st.pick) { st.pick = null; draw(); return; }
        var o = st.history.pop(); if (!o) return;
        st.objs.splice(st.objs.lastIndexOf(o), 1); st.done = false; st.answerPt = null;
        recompute(); msg('1つもどしたよ。');
      }
      else if (b.classList.contains('sk-reset')) start(st.pid);
      else if (b.classList.contains('sk-new')) start(sel.value);
      else if (b.classList.contains('sk-hint')) $('.sk-hinttext').hidden = !$('.sk-hinttext').hidden;
    });
    sel.addEventListener('change', function () { start(sel.value); });

    // ---- 描く ----
    function ext(o) {
      var L = lineOf(o), a = o.type === 'line' ? -1000 : L.min, b = o.type === 'segment' ? L.max : 1000;
      return [L.p.x + a * L.u.x, L.p.y + a * L.u.y, L.p.x + b * L.u.x, L.p.y + b * L.u.y];
    }
    function draw() {
      var h = '';
      st.objs.forEach(function (o) {
        var good = st.done && o === st.correctObj;
        if (o.type === 'circle' && o.arc) {
          var s0 = o.a0 - ARC_HALF, s1 = o.a0 + ARC_HALF;
          h += '<path d="M' + (o.c.x + o.r * Math.cos(s0)).toFixed(1) + ' ' + (o.c.y + o.r * Math.sin(s0)).toFixed(1) + ' A' + o.r.toFixed(1) + ' ' + o.r.toFixed(1) + ' 0 1 1 ' + (o.c.x + o.r * Math.cos(s1)).toFixed(1) + ' ' + (o.c.y + o.r * Math.sin(s1)).toFixed(1) + '" fill="none" stroke="' + (good ? '#18a058' : '#2f6fd6') + '" stroke-width="' + (good ? 3 : 1.2) + '" opacity="' + (good ? 1 : 0.75) + '"/>';
        } else if (o.type === 'circle') {
          h += '<circle cx="' + o.c.x.toFixed(1) + '" cy="' + o.c.y.toFixed(1) + '" r="' + o.r.toFixed(1) + '" fill="none" stroke="' + (good ? '#18a058' : o.given ? '#1c2127' : '#2f6fd6') + '" stroke-width="' + (good ? 3 : o.given ? 2 : 1.2) + '" opacity="' + (o.given || good ? 1 : 0.75) + '"/>';
        } else {
          var e = ext(o);
          h += '<line x1="' + e[0].toFixed(1) + '" y1="' + e[1].toFixed(1) + '" x2="' + e[2].toFixed(1) + '" y2="' + e[3].toFixed(1) + '" stroke="' + (good ? '#18a058' : o.mine ? '#c23b2e' : '#1c2127') + '" stroke-width="' + (good ? 3 : o.mine ? 1.6 : 2) + '"/>';
          if (o.label) h += '<text x="' + (o.q.x - 14).toFixed(1) + '" y="' + (o.q.y - 8).toFixed(1) + '" font-size="15" font-weight="bold">' + o.label + '</text>';
        }
      });
      st.points.forEach(function (p) {
        var on = st.pick && dist(st.pick, p) < 0.5;
        var ans = st.done && st.answerPt && dist(st.answerPt, p) < 0.5;
        h += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (on || ans ? 7 : p.given ? 4.5 : 3.5) + '" fill="' + (ans ? '#18a058' : on ? '#f59e0b' : p.given ? '#1c2127' : '#2f6fd6') + '"/>';
        if (p.label) h += '<text x="' + (p.x + 7).toFixed(1) + '" y="' + (p.y - 7).toFixed(1) + '" font-size="15" font-weight="bold">' + p.label + '</text>';
      });
      svg.innerHTML = h;
      var sameBtn = root.querySelector('.sk-tool[data-t="same"]'); if (sameBtn) sameBtn.disabled = !st.lastR || st.done;
    }

    setArcMode(st.arcMode);
    setLevel('basic');
  }

  window.Sakuzu = { mount: mount, PROBLEMS: PROBLEMS, _intersect: intersect, _lineMatches: lineMatches };
})();
