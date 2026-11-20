/* 📐 作図にチャレンジ(2026-11-18〜、先生(00001)だけのプレビュー)
   コンパスと定規だけを使って、画面の上で本当に作図する。
   - コンパス：中心にする点をタップ → 半径をきめる場所をタップ(点の近くなら点にぴったり)。「⭕ 同じ大きさの円」の道具で、点をタップするだけで1つ前の円と同じ半径の円がかける。
   - 円の形：「⭕ 円」か「◠ 3分の2の円」(240°の弧。コンパスは半径をきめた場所の側、同じ大きさの円は2回目にタップした側にかく)をえらべる。
   - 定規：2つの点をタップすると、その2点を通る直線を引く。
   - 答えの点：答えが「点」の問題で、作図してできた点をタップして答える。
   - 点は、はじめからある点と、線や円が交わる点(交点)だけ。タップすると一番近い点に吸いつく。
   レベル：小学生(合同な三角形の作図。ものさし・分度器つき)・基本・標準・入試。答えの種類(target.kind)は line(直線)・point(点)・circle(円)。
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
  var LEVELS = [{ id: 'elem', label: '小学生' }, { id: 'basic', label: '基本' }, { id: 'std', label: '標準' }, { id: 'exam', label: '入試' }];
  // 長さを写すための線分PQ(図の上のほうに置く)。小学生の問題で使う。
  function lenSeg(len, y, l1, l2) {
    var x0 = rnd(30, Math.max(31, 330 - len));
    return { p: { x: x0, y: y, label: l1 || 'P' }, q: { x: x0 + len, y: y, label: l2 || 'Q' } };
  }
  // 2つの円の交点のうち、画面で上にあるほう
  function upperMeet(c1, r1, c2, r2) {
    var X = interCC({ c: c1, r: r1 }, { c: c2, r: r2 });
    return X[0].y < X[1].y ? X[0] : X[1];
  }
  // ---- 小学生の三角形の作図の道具 ----
  var CM = 34, RULER_X = 28, RULER_Y = 412, RULER_CM = 9, BASE_Y = 300;
  function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function fmtCm(v) { return (Math.round(v * 10) / 10) + 'cm'; }
  // ものさし：0.5cmごとに点(目もり)をおく。コンパスの中心を0に、半径を目もりにタップして長さをとる。
  function rulerParts() {
    var pts = [], d = '<rect x="' + (RULER_X - 12) + '" y="' + (RULER_Y - 3) + '" width="' + (RULER_CM * CM + 24) + '" height="32" rx="4" fill="#fef9c3" stroke="#ca8a04"/>';
    for (var i = 0; i <= RULER_CM * 2; i++) {
      var x = RULER_X + i * CM / 2;
      pts.push({ x: x, y: RULER_Y, tick: true });
      d += '<line x1="' + x.toFixed(1) + '" y1="' + RULER_Y + '" x2="' + x.toFixed(1) + '" y2="' + (RULER_Y + (i % 2 ? 7 : 12)) + '" stroke="#854d0e" stroke-width="1"/>';
      if (i % 2 === 0) d += '<text x="' + x.toFixed(1) + '" y="' + (RULER_Y + 25) + '" font-size="10" text-anchor="middle" fill="#854d0e">' + (i / 2) + '</text>';
    }
    d += '<text x="' + (RULER_X + RULER_CM * CM + 4) + '" y="' + (RULER_Y + 25) + '" font-size="9" fill="#854d0e">cm</text>';
    return { pts: pts, deco: d };
  }
  // 見本の三角形(上に小さく)と、作図する辺BC。ax, ay は Bから見たAの位置(cm、上が+)。
  function elemTri_(bc, ax, ay, given, useProt) {
    var B = { x: (W - bc * CM) / 2 + rnd(-12, 12), y: BASE_Y, label: 'B' }, C = { x: 0, y: BASE_Y, label: 'C' };
    C.x = B.x + bc * CM;
    var A = { x: B.x + ax * CM, y: BASE_Y - ay * CM };
    if (A.x < 14 || A.x > W - 14) return null;
    // 見本(1cm=13px)
    var s = 13, rb = { x: W / 2 - bc * s / 2, y: 22 }, rc = { x: W / 2 + bc * s / 2, y: 22 }, ra = { x: rb.x + ax * s, y: 22 - ay * s };
    var g = { x: (ra.x + rb.x + rc.x) / 3, y: (ra.y + rb.y + rc.y) / 3 };
    function lab(p, q, txt) { var m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, u = unit(m.x - g.x, m.y - g.y); return '<text x="' + (m.x + u.x * 14).toFixed(1) + '" y="' + (m.y + u.y * 14 + 4).toFixed(1) + '" font-size="11" text-anchor="middle" fill="#1c2127">' + txt + '</text>'; }
    function vlab(p, txt) { var u = unit(p.x - g.x, p.y - g.y); return '<text x="' + (p.x + u.x * 10).toFixed(1) + '" y="' + (p.y + u.y * 10 + 4).toFixed(1) + '" font-size="11" font-weight="bold" text-anchor="middle" fill="#1c2127">' + txt + '</text>'; }
    function alab(p, q1, q2, txt) { var u1 = unit(q1.x - p.x, q1.y - p.y), u2 = unit(q2.x - p.x, q2.y - p.y), u = unit(u1.x + u2.x, u1.y + u2.y); return '<text x="' + (p.x + u.x * 22).toFixed(1) + '" y="' + (p.y + u.y * 22 + 4).toFixed(1) + '" font-size="10" text-anchor="middle" fill="#c2410c">' + txt + '</text>'; }
    var d = '<text x="8" y="' + (VY + 16) + '" font-size="11" fill="#475569">見本（この三角形と合同な三角形をかこう）</text>';
    d += '<path d="M' + ra.x.toFixed(1) + ' ' + ra.y.toFixed(1) + ' L' + rb.x.toFixed(1) + ' ' + rb.y.toFixed(1) + ' L' + rc.x.toFixed(1) + ' ' + rc.y.toFixed(1) + ' Z" fill="#f1f5f9" stroke="#475569" stroke-width="1.5"/>';
    d += vlab(ra, 'A') + vlab(rb, 'B') + vlab(rc, 'C');
    if (given.AB) d += lab(ra, rb, fmtCm(given.AB));
    if (given.AC) d += lab(ra, rc, fmtCm(given.AC));
    d += lab(rb, rc, fmtCm(bc));
    if (given.angB) d += alab(rb, ra, rc, given.angB + '°');
    if (given.angC) d += alab(rc, ra, rb, given.angC + '°');
    d += '<line x1="0" y1="52" x2="' + W + '" y2="52" stroke="#cbd5e1" stroke-dasharray="4 4"/>';
    d += '<text x="' + ((B.x + C.x) / 2).toFixed(1) + '" y="' + (BASE_Y + 20) + '" font-size="12" text-anchor="middle" fill="#1c2127">' + fmtCm(bc) + '</text>';
    var ru = rulerParts();
    return {
      points: [B, C].concat(ru.pts), objs: [{ type: 'segment', p: B, q: C }], deco: d + ru.deco, protractor: !!useProt,
      target: { kind: 'point', p: A, label: 'A' },
      // 「答えを見る」で出す作図のあと：辺AB・ACと、コンパスの弧(長さがわかる辺)か、分度器で引いた直線(角がわかるとき)
      sol: (function () {
        var o = [{ type: 'seg', p: B, q: A }, { type: 'seg', p: C, q: A }];
        function arcAt(c) { var a = Math.atan2(A.y - c.y, A.x - c.x) * 180 / Math.PI; o.push({ type: 'arc', c: c, r: dist(c, A), a0: a, span: 18 }); }
        function rayAt(c) { var u = unit(A.x - c.x, A.y - c.y); o.push({ type: 'seg', p: c, q: { x: c.x + u.x * (dist(c, A) + 40), y: c.y + u.y * (dist(c, A) + 40) }, thin: true }); }
        if (given.AB) arcAt(B); if (given.AC) arcAt(C);
        if (given.angB) rayAt(B); if (given.angC) rayAt(C);
        if (given.AB && given.angB) arcAt(B);
        return o;
      })(),
      ask: '下のものさし' + (useProt ? 'と「📐 分度器」' : '') + 'を使って作図し、できた頂点Aを「📍 答えの点」でタップしてね。',
    };
  }
  var PROBLEMS = [
    // ===== 小学生(2026-11-22 先生の指示で、合同な三角形の作図(小5)に変更) =====
    // 辺BCはかいてある。ものさし(0.5cmごとの目もり)でコンパスに長さをとり、分度器で角をはかって、頂点Aをかく。
    {
      id: 'elemTri3', level: 'elem', title: '3つの辺の長さがわかる三角形ABC',
      make: function () {
        for (var k = 0; k < 200; k++) {
          var bc = 0.5 * randInt(10, 14), c = 0.5 * randInt(7, 13), b = 0.5 * randInt(7, 13);
          if (Math.abs(b - c) < 0.5) continue;
          var ax = (c * c - b * b + bc * bc) / (2 * bc), ay2 = c * c - ax * ax;
          if (ay2 <= 0) continue;
          var ay = Math.sqrt(ay2);
          if (ay < 1.5 || ay > 5.4) continue;
          var t = elemTri_(bc, ax, ay, { AB: c, AC: b, BC: bc });
          if (!t) continue;
          t.hint = '① 「🧭 コンパス」で、ものさしの0の点をタップしてから、' + fmtCm(c) + 'の目もりをタップ（コンパスが' + fmtCm(c) + 'に開く。円はまだかかれない）。② 点Bをタップして円をかく。③ 同じように、コンパスでものさしの0→' + fmtCm(b) + 'をタップして、点Cをタップ。④ 2つの円が交わった点（上のほう）がA。';
          return t;
        }
      },
    },
    {
      id: 'elemTriSAS', level: 'elem', title: '2つの辺とその間の角がわかる三角形ABC',
      make: function () {
        for (var k = 0; k < 200; k++) {
          var bc = 0.5 * randInt(10, 14), deg = 5 * randInt(6, 14), c = 0.5 * randInt(7, 12);
          var ax = c * Math.cos(deg * Math.PI / 180), ay = c * Math.sin(deg * Math.PI / 180);
          if (ay < 1.5 || ay > 5.4) continue;
          var t = elemTri_(bc, ax, ay, { AB: c, BC: bc, angB: deg }, true);
          if (!t) continue;
          t.hint = '① 「📐 分度器」で、点B（中心）→点C（0°の線）の順にタップして、' + deg + '°の目もりをタップして印をつける。② 「📏 定規」で、点Bと印を結ぶ。③ 「🧭 コンパス」で、ものさしの0の点→' + fmtCm(c) + 'の目もりをタップ（コンパスが開く）。④ 点Bをタップして円をかく。⑤ 直線と円が交わった点がA。';
          return t;
        }
      },
    },
    {
      id: 'elemTriASA', level: 'elem', title: '1つの辺とその両はしの角がわかる三角形ABC',
      make: function () {
        for (var k = 0; k < 200; k++) {
          var bc = 0.5 * randInt(10, 14), db = 5 * randInt(6, 14), dc = 5 * randInt(6, 14);
          if (db + dc > 140 || db === dc) continue;
          var tb = Math.tan(db * Math.PI / 180), tc = Math.tan(dc * Math.PI / 180);
          var ax = bc * tc / (tb + tc), ay = ax * tb;
          if (ay < 1.5 || ay > 5.4) continue;
          var t = elemTri_(bc, ax, ay, { BC: bc, angB: db, angC: dc }, true);
          if (!t) continue;
          t.hint = '① 「📐 分度器」で、点B（中心）→点C（0°の線）の順にタップして、' + db + '°の印をつける。② 「📏 定規」で点Bと印を結ぶ。③ 「📐 分度器」で、点C（中心）→点B（0°の線）の順にタップして、' + dc + '°の印をつける。④ 「📏 定規」で点Cと印を結ぶ。⑤ 2本の直線が交わった点がA。';
          return t;
        }
      },
    },
    {
      id: 'elemRhombus', level: 'elem', title: 'ひし形ABCDの頂点C（AB＝ADの2辺がかいてある）',
      make: function () {
        var A = { x: rnd(60, 90), y: rnd(250, 280), label: 'A' }, len = rnd(120, 150), d1 = rnd(-12, 0), d2 = d1 + rnd(50, 70);
        var B = at(A, len, d1, 'B'), D = at(A, len, d2, 'D');
        return {
          points: [A, B, D], objs: [{ type: 'segment', p: A, q: B }, { type: 'segment', p: A, q: D }],
          target: { kind: 'point', p: { x: B.x + D.x - A.x, y: B.y + D.y - A.y } },
          ask: '作図してできた点Cを「📍 答えの点」でタップしてね。',
          hint: 'ひし形は4つの辺の長さがぜんぶ同じ。① コンパスで、点Bを中心にして点Aをタップする（半径AB）。② 「⭕ 同じ大きさの円」で点Dをタップする。③ 2つの円が交わった点のうち、Aではないほうが C。',
        };
      },
    },
    {
      id: 'elemHexagon', level: 'elem', title: '円Oの周上に頂点がある正六角形ABCDEFの頂点C（Aから左回りに2つめ）',
      make: function () {
        var O = { x: rnd(170, 190), y: rnd(200, 220), label: 'O' }, r = rnd(100, 115), d = rnd(-20, 20);
        var A = at(O, r, d, 'A');
        return {
          points: [O, A], objs: [{ type: 'circle', c: O, r: r, given: true }],
          target: { kind: 'point', p: at(O, r, d + 120) },
          ask: '作図してできた点Cを「📍 答えの点」でタップしてね。',
          hint: '正六角形の1辺の長さは、円の半径と同じ。① コンパスで、点Aを中心にして点Oをタップする（半径と同じ長さ）。② 円Oと交わった点のうち、左回り（上のほう）がB。③ 「⭕ 同じ大きさの円」で点Bをタップする。④ 円Oと交わった点のうち、Aではないほうが C。',
        };
      },
    },
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
      if (!st.done) msg(st.arcMode ? '◠ <b>3分の2の円</b>でかくよ。コンパスでは、半径をきめるためにタップした場所のほうに弧がかけるよ。「◠ 同じ大きさの3分の2の円」では、中心の点 → 弧をかきたい側の順にタップしてね。' : '⭕ <b>円</b>でかくよ。');
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
      '<button type="button" class="ghost-btn sk-tool" data-t="prot" hidden>📐 分度器</button>' +
      '<button type="button" class="ghost-btn sk-tool" data-t="answer" hidden>📍 答えの点</button>' +
      '<button type="button" class="ghost-btn sk-tool" data-t="same">⭕ 同じ大きさの円</button>' +
      '</div>' +
      '<p class="sk-msg"></p>' +
      '<div class="sk-tools"><button type="button" class="ghost-btn sk-undo">↩️ 1つもどす</button> <button type="button" class="ghost-btn sk-reset">🗑 はじめから</button> <button type="button" class="ghost-btn sk-hint">💡 ヒント</button> <button type="button" class="ghost-btn sk-show">👀 答えを見る</button></div>' +
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
      st.pick = null; st.lastR = 0; st.done = false; st.correctObj = null; st.showAns = false;
      $('.sk-title').textContent = '📐 ' + def.title + 'を作図しよう！';
      $('.sk-hinttext').hidden = true;
      $('.sk-hinttext').textContent = pr.hint;
      $('.sk-tool[data-t="answer"]').hidden = pr.target.kind !== 'point';
      $('.sk-tool[data-t="prot"]').hidden = !pr.protractor;
      setTool('compass');
      recompute();
      msg('コンパスで円をかこう。まず、円の中心にする点をタップしてね。' + (pr.ask ? '<br>' + pr.ask : ''));
    }
    function msg(t) { $('.sk-msg').innerHTML = t; }
    function setTool(t) {
      st.tool = t; st.pick = null; st.protBase = null;
      root.querySelectorAll('.sk-tool').forEach(function (b) { b.classList.toggle('is-on', b.getAttribute('data-t') === t); });
      if (!st.done) msg(t === 'compass' ? '円の中心にする点をタップしてね。' : t === 'ruler' ? '直線を引く1つめの点をタップしてね。'
        : t === 'same' ? (st.lastR ? (st.arcMode ? '① 中心にする点をタップ → ② 弧をかきたい側をタップすると、<b>1つ前と同じ大きさの3分の2の円</b>がかけるよ。' : '円の中心にする点をタップすると、<b>1つ前の円と同じ大きさ</b>の円がかけるよ。') : 'まだ円がないよ。先に「🧭 コンパス」で円を1つかいてね。')
        : t === 'prot' ? '📐 分度器：まず、角の頂点（分度器の中心にする点）をタップしてね。'
        : '答えだと思う点（作図してできた点）をタップしてね。');
      draw();
    }
    function recompute() {
      var pts = st.prob.points.map(function (p) { return { x: p.x, y: p.y, label: p.label, given: true, tick: p.tick }; });
      st.objs.forEach(function (o) { if (o.type === 'mark') add(pts, o.p); });
      st.prob.objs.forEach(function (o) { if (o.type === 'segment') { [o.p, o.q].forEach(function (e) { add(pts, e); }); } });
      for (var i = 0; i < st.objs.length; i++) for (var j = i + 1; j < st.objs.length; j++) {
        if (st.objs[i].type === 'mark' || st.objs[j].type === 'mark') continue;
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
          if (sn.tick) { msg('📏 ものさしで長さをはかるよ。次に、はかりたい長さの目もりをタップしてね（円はかかれないよ）。'); draw(); return; }
          msg('次に、円の半径をきめる場所をタップしてね。' + (st.lastR ? '1つ前の円と同じ大きさにしたいときは「⭕ 同じ大きさの円」を使ってね。' : ''));
          draw();
        } else if (st.pick.tick) {
          // ものさしで長さをとる(2026-11-22 先生「長さをとる前に勝手に円がかかれる」)：円はかかずに、コンパスをその長さに開くだけ。
          if (!sn || !sn.tick || dist(sn, st.pick) < 1) { msg('ものさしの目もり（茶色の点）をタップしてね。'); return; }
          var len = dist(sn, st.pick);
          st.pick = null; st.lastR = len;
          setTool('same');
          msg('🧭 コンパスを<b>' + fmtCm(len / CM) + '</b>に開いたよ。次に、円の中心にする点（BやC）をタップしてね' + (st.arcMode ? '（そのあと、弧をかきたい側をタップ）' : '') + '。');
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
        if (sn.tick) { msg('ものさしの目もりは、コンパスで長さをはかるときに使うよ。定規は、三角形の点（●）をタップしてね。'); return; }
        if (!st.pick) { st.pick = sn; msg('2つめの点をタップしてね。'); draw(); return; }
        if (dist(st.pick, sn) < 1) { msg('ちがう点をタップしてね。'); return; }
        var a = st.pick; st.pick = null;
        push({ type: 'line', p: { x: a.x, y: a.y }, q: { x: sn.x, y: sn.y }, mine: true });
        if (!st.done && st.prob.target.kind !== 'line') msg('直線を引いたよ。');
      } else if (st.tool === 'same') {
        // ⭕ 同じ大きさの円(2026-11-19 先生の指示)：点をタップするだけで、1つ前にかいた円と同じ半径の円をかく
        if (!st.lastR) { msg('まだ円がないよ。先に「🧭 コンパス」で円を1つかいてね。'); return; }
        if (sn && sn.tick && !st.pick) { msg('円の中心は、三角形の点（BやC）をタップしてね。'); return; }
        if (st.arcMode) {
          // 3分の2の円：①中心の点 → ②弧をかきたい側をタップ
          if (!st.pick) {
            if (!sn) { msg('円の中心は、点（●）の上をタップしてね。'); return; }
            st.pick = sn; msg('点線が、1つ前と同じ大きさだよ。次に、<b>弧をかきたい側</b>（点線の上やその近く、どこでもよい）をタップしてね。'); draw(); return;
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
      } else if (st.tool === 'prot') {
        // 📐 分度器(2026-11-22)：①頂点 ②0°の線を合わせる点 ③目もりをタップすると、その角度(5°ごと)の所に印をつける
        if (!st.pick) {
          if (!sn) { msg('分度器の中心は、点（●）の上をタップしてね。'); return; }
          st.pick = sn; st.protBase = null; msg('次に、分度器の0°の線を合わせる辺の、もう一方のはしの点をタップしてね。'); draw(); return;
        }
        if (!st.protBase) {
          if (!sn || dist(sn, st.pick) < 1) { msg('0°の線を合わせる点（●）をタップしてね。'); return; }
          st.protBase = sn; msg('分度器を置いたよ。印をつけたい角度の目もりをタップしてね。'); draw(); return;
        }
        var pf = protFrame_();
        var ang = Math.atan2(p.y - st.pick.y, p.x - st.pick.x) - pf.phi;
        ang = pf.sgn * ang * 180 / Math.PI;
        while (ang < -90) ang += 360; while (ang > 270) ang -= 360;
        if (ang < 0 || ang > 180) { msg('分度器の上（半円の中）の目もりをタップしてね。'); return; }
        var deg = Math.max(5, Math.min(175, Math.round(ang / 5) * 5));
        var mp = protPoint_(pf, deg, PROT_R);
        var v = st.pick; st.pick = null; st.protBase = null;
        push({ type: 'mark', p: mp, deg: deg, v: { x: v.x, y: v.y } });
        if (!st.done) msg(deg + '°のところに印をつけたよ。「📏 定規」で、頂点と印を結んでね。（ちがったら「↩️ 1つもどす」）');
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
        if (st.pick) { st.pick = null; st.protBase = null; draw(); return; }
        var o = st.history.pop(); if (!o) return;
        st.objs.splice(st.objs.lastIndexOf(o), 1); st.done = false; st.answerPt = null;
        recompute(); msg('1つもどしたよ。');
      }
      else if (b.classList.contains('sk-reset')) start(st.pid);
      else if (b.classList.contains('sk-new')) start(sel.value);
      else if (b.classList.contains('sk-hint')) $('.sk-hinttext').hidden = !$('.sk-hinttext').hidden;
      else if (b.classList.contains('sk-show')) {
        // 👀 答えを見る(2026-11-22 先生の指示)：かき方がわからないときに、できあがりの図と手順を見せる。見たらこの図ではMPなし。
        if (st.showAns) return;
        if (!st.done && !window.confirm('答えを見ると、この図ではMPがもらえません。答えを見ますか？')) return;
        st.showAns = true; st.pick = null; st.protBase = null;
        var wasDone = st.done; st.done = true;
        $('.sk-hinttext').hidden = false;
        if (!wasDone) msg('👀 答えの図を緑色で出したよ（下の手順もいっしょに見てね）。このとおりにかけるか、「🔄 別の図」で次の問題にチャレンジしよう。');
        draw();
      }
    });
    sel.addEventListener('change', function () { start(sel.value); });

    // 分度器の向き：中心st.pick、0°の線はst.protBaseの方向。半円は画面の上がわ(三角形の頂点Aのある側)。
    var PROT_R = 120;
    function protFrame_() {
      var phi = Math.atan2(st.protBase.y - st.pick.y, st.protBase.x - st.pick.x);
      var sgn = Math.sin(phi - Math.PI / 2) < 0 ? -1 : 1;
      return { phi: phi, sgn: sgn, c: st.pick };
    }
    function protPoint_(pf, deg, r) { var t = pf.phi + pf.sgn * deg * Math.PI / 180; return { x: pf.c.x + r * Math.cos(t), y: pf.c.y + r * Math.sin(t) }; }
    function protSvg_() {
      var pf = protFrame_(), h = '', a = protPoint_(pf, 0, PROT_R), b = protPoint_(pf, 180, PROT_R);
      h += '<path d="M' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) + ' A' + PROT_R + ' ' + PROT_R + ' 0 0 ' + (pf.sgn > 0 ? 1 : 0) + ' ' + b.x.toFixed(1) + ' ' + b.y.toFixed(1) + ' Z" fill="rgba(56,189,248,0.16)" stroke="#0284c7" stroke-width="1.3"/>';
      for (var d = 0; d <= 180; d += 5) {
        var o = protPoint_(pf, d, PROT_R), i = protPoint_(pf, d, PROT_R - (d % 10 ? 6 : 11));
        h += '<line x1="' + o.x.toFixed(1) + '" y1="' + o.y.toFixed(1) + '" x2="' + i.x.toFixed(1) + '" y2="' + i.y.toFixed(1) + '" stroke="#0284c7" stroke-width="1"/>';
        if (d % 10 === 0) { var tp = protPoint_(pf, d, PROT_R - 22); h += '<text x="' + tp.x.toFixed(1) + '" y="' + (tp.y + 3).toFixed(1) + '" font-size="8.5" text-anchor="middle" fill="#0369a1">' + d + '</text>'; }
      }
      return h;
    }

    function answerSvg_() {
      var pr = st.prob, T = pr.target, h = '', G = '#16a34a';
      (pr.sol || []).forEach(function (o) {
        if (o.type === 'seg') h += '<line x1="' + o.p.x.toFixed(1) + '" y1="' + o.p.y.toFixed(1) + '" x2="' + o.q.x.toFixed(1) + '" y2="' + o.q.y.toFixed(1) + '" stroke="' + G + '" stroke-width="' + (o.thin ? 1.5 : 3) + '"' + (o.thin ? ' stroke-dasharray="6 4"' : '') + '/>';
        else if (o.type === 'arc') {
          var a0 = (o.a0 - o.span) * Math.PI / 180, a1 = (o.a0 + o.span) * Math.PI / 180;
          h += '<path d="M' + (o.c.x + o.r * Math.cos(a0)).toFixed(1) + ' ' + (o.c.y + o.r * Math.sin(a0)).toFixed(1) + ' A' + o.r.toFixed(1) + ' ' + o.r.toFixed(1) + ' 0 0 1 ' + (o.c.x + o.r * Math.cos(a1)).toFixed(1) + ' ' + (o.c.y + o.r * Math.sin(a1)).toFixed(1) + '" fill="none" stroke="' + G + '" stroke-width="1.8" stroke-dasharray="6 4"/>';
        }
      });
      if (T.kind === 'line') T.lines.forEach(function (L) { h += '<line x1="' + (L.p.x - 1000 * L.u.x).toFixed(1) + '" y1="' + (L.p.y - 1000 * L.u.y).toFixed(1) + '" x2="' + (L.p.x + 1000 * L.u.x).toFixed(1) + '" y2="' + (L.p.y + 1000 * L.u.y).toFixed(1) + '" stroke="' + G + '" stroke-width="3" opacity="0.85"/>'; });
      else if (T.kind === 'circle') h += '<circle cx="' + T.c.x.toFixed(1) + '" cy="' + T.c.y.toFixed(1) + '" r="' + T.r.toFixed(1) + '" fill="none" stroke="' + G + '" stroke-width="3" opacity="0.85"/>';
      else if (T.kind === 'point') {
        h += '<circle cx="' + T.p.x.toFixed(1) + '" cy="' + T.p.y.toFixed(1) + '" r="8" fill="none" stroke="' + G + '" stroke-width="3"/><circle cx="' + T.p.x.toFixed(1) + '" cy="' + T.p.y.toFixed(1) + '" r="3.5" fill="' + G + '"/>';
        h += '<text x="' + (T.p.x + 10).toFixed(1) + '" y="' + (T.p.y - 10).toFixed(1) + '" font-size="15" font-weight="bold" fill="' + G + '">' + (T.label || '答え') + '</text>';
      }
      return h;
    }

    // ---- 描く ----
    function ext(o) {
      var L = lineOf(o), a = o.type === 'line' ? -1000 : L.min, b = o.type === 'segment' ? L.max : 1000;
      return [L.p.x + a * L.u.x, L.p.y + a * L.u.y, L.p.x + b * L.u.x, L.p.y + b * L.u.y];
    }
    function draw() {
      var h = (st.prob && st.prob.deco) || '';
      st.objs.forEach(function (o) {
        var good = st.done && o === st.correctObj;
        if (o.type === 'mark') { h += '<text x="' + (o.p.x + 6).toFixed(1) + '" y="' + (o.p.y - 6).toFixed(1) + '" font-size="11" fill="#c2410c" font-weight="bold">' + o.deg + '°</text>'; return; }
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
      // 3分の2の円で「同じ大きさ」：中心をえらんだら、かける大きさを点線で見せる(2026-11-20 先生の指示)
      if (st.arcMode && st.tool === 'same' && st.pick && st.lastR) h += '<circle cx="' + st.pick.x.toFixed(1) + '" cy="' + st.pick.y.toFixed(1) + '" r="' + st.lastR.toFixed(1) + '" fill="none" stroke="#f59e0b" stroke-width="1.2" stroke-dasharray="5 5"/>';
      if (st.tool === 'prot' && st.pick && st.protBase) h += protSvg_();
      if (st.showAns) h += answerSvg_();
      st.points.forEach(function (p) {
        var on = st.pick && dist(st.pick, p) < 0.5;
        if (p.tick && !on) { h += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="2.4" fill="#854d0e"/>'; return; }
        var ans = st.done && st.answerPt && dist(st.answerPt, p) < 0.5;
        h += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (on || ans ? 7 : p.given ? 4.5 : 3.5) + '" fill="' + (ans ? '#18a058' : on ? '#f59e0b' : p.given ? '#1c2127' : '#2f6fd6') + '"/>';
        if (p.label) h += '<text x="' + (p.x + 7).toFixed(1) + '" y="' + (p.y - 7).toFixed(1) + '" font-size="15" font-weight="bold">' + p.label + '</text>';
      });
      svg.innerHTML = h;
      var sameBtn = root.querySelector('.sk-tool[data-t="same"]'); if (sameBtn) { sameBtn.disabled = !st.lastR || st.done; sameBtn.textContent = st.arcMode ? '◠ 同じ大きさの3分の2の円' : '⭕ 同じ大きさの円'; }
    }

    setArcMode(st.arcMode);
    setLevel('basic');
  }

  window.Sakuzu = { mount: mount, PROBLEMS: PROBLEMS, _intersect: intersect, _lineMatches: lineMatches };
})();
