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
      video: (function () {
        var R0 = { x: RULER_X, y: RULER_Y }, v = [{ t: 'say', say: '辺BC（' + fmtCm(bc) + '）は、もうかいてあるよ。見本と同じ三角形をかこう。' }];
        function ro(len) { return { t: 'open', c: R0, to: { x: RULER_X + len * CM, y: RULER_Y }, cm: true, say: 'コンパスの針をものさしの0に合わせて、えんぴつの先を' + fmtCm(len) + 'まで開く。' }; }
        function ray(P, Q, deg) {
          v.push({ t: 'prot', c: P, base: Q, deg: deg, R: 100, say: '分度器の中心を点' + P.label + 'に、0°の線を辺BCに合わせて、' + deg + '°のところに印をつける。' });
          v.push(vLine(P, addP(P, unit(A.x - P.x, A.y - P.y), dist(P, A) + 45), '定規で、点' + P.label + 'と印を結んで、長めに線をひく。'));
        }
        function arcAt(P, len) { var a = arcOver(P, dist(P, A), A, A, 16, '頂点Aがありそうなところに、弧をかく。'); v.push(ro(len), moveTo(a, '開いたまま（' + fmtCm(len) + 'のまま）、コンパスの針を点' + P.label + 'にさす。'), a); }
        if (given.angB) ray(B, C, given.angB);
        if (given.angC) ray(C, B, given.angC);
        if (given.AB) arcAt(B, given.AB);
        if (given.AC) arcAt(C, given.AC);
        v.push({ t: 'pt', p: [lbl(A, 'A')], say: (given.angB && given.angC ? '2本の線' : given.angB ? '線と弧' : '2つの弧') + 'が交わった点が、頂点Aだよ。' + (given.angB && given.angC ? 'できあがり！' : '') });
        if (!given.angB) v.push(vLine(A, B, '定規で、点Aと点Bを結ぶ。'));
        if (!given.angC) v.push(vLine(A, C, '点Aと点Cを結んだら、できあがり！'));
        return v;
      })(),
    };
  }
  // ===== 🎬 答えの動画の手順をつくる道具(2026-11-22 先生「答えは、全て動画解説で」) =====
  // 角度は画面の向き(右が0°、下向きが＋)。手順の形は「かき方の動画」と同じ。
  function angOf(c, p) { return Math.atan2(p.y - c.y, p.x - c.x) * 180 / Math.PI; }
  function nrm(a) { while (a > 180) a -= 360; while (a <= -180) a += 360; return a; }
  function addP(p, v, k) { return { x: p.x + v.x * k, y: p.y + v.y * k }; }
  function vpt(c, r, deg) { var t = deg * Math.PI / 180; return { x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) }; }
  // 中心cから見て、点p1〜p2をまたぐ弧(padは両はしの余白°)
  function arcOver(c, r, p1, p2, pad, say) { var a = angOf(c, p1), d = nrm(angOf(c, p2) - a), sg = d >= 0 ? 1 : -1; return { t: 'arc', c: c, r: r, a0: a - sg * pad, a1: a + d + sg * pad, say: say }; }
  function moveTo(a, say) { return { t: 'move', c: a.c, r: a.r, a: a.a0, say: say }; }
  function openTo(a, say) { return { t: 'open', c: a.c, to: vpt(a.c, a.r, a.a0), say: say }; }
  function vLine(p, q, say) { return { t: 'line', p: p, q: q, say: say }; }
  function nm(p) { return p && p.label ? '点' + p.label : 'その点'; }
  function lbl(p, l) { return { x: p.x, y: p.y, label: l }; }
  // 線分ABの垂直二等分線
  function vPerpBis(A, B, lab) {
    var d = dist(A, B), r = d * 0.68, M = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }, n = unit(-(B.y - A.y), B.x - A.x), h = Math.sqrt(r * r - d * d / 4);
    var X1 = addP(M, n, h), X2 = addP(M, n, -h), u = unit(X2.x - X1.x, X2.y - X1.y);
    var a1 = arcOver(A, r, X1, X2, 14, nm(A) + 'を中心に、線分' + lab + 'の両がわにとどく弧をかく。'), a2 = arcOver(B, r, X1, X2, 14, '同じように、両がわに弧をかく。');
    return { X1: X1, X2: X2, u: u, steps: [
      openTo(a1, 'コンパスの針を' + nm(A) + 'にさして、' + lab + 'の半分より大きく開く。'), a1,
      moveTo(a2, '開いたまま（同じ大きさで）、針を' + nm(B) + 'にさす。'), a2,
      { t: 'pt', p: [X1, X2], say: '弧が交わった点が、2つできたね。' },
      vLine(addP(X1, u, -30), addP(X2, u, 30), '2つの点を定規で結ぶと、' + lab + 'の垂直二等分線！'),
    ] };
  }
  // ∠AOBの二等分線(r1：Oの弧の半径)
  function vAngBis(O, A, B, r1, finalSay, ext) {
    var E1 = addP(O, unit(A.x - O.x, A.y - O.y), r1), E2 = addP(O, unit(B.x - O.x, B.y - O.y), r1);
    var r2 = Math.max(r1 * 0.9, dist(E1, E2) * 0.75);
    var X = interCC({ c: E1, r: r2 }, { c: E2, r: r2 }), R = dist(X[0], O) > dist(X[1], O) ? X[0] : X[1];
    var a0 = arcOver(O, r1, E1, E2, 12, '角の2つの辺と交わるように、弧をかく。');
    var b1 = arcOver(E1, r2, R, R, 20, '角の内がわに、弧をかく。'), b2 = arcOver(E2, r2, R, R, 20, 'さっきの弧と交わるように、弧をかく。');
    var w = unit(R.x - O.x, R.y - O.y);
    return { R: R, E1: E1, E2: E2, steps: [
      openTo(a0, 'コンパスの針を、角の頂点' + (O.label ? O.label : '') + 'にさす。'), a0,
      { t: 'pt', p: [E1, E2], say: '辺と交わった点が2つできたね。' },
      openTo(b1, '1つめの点に針をさす。'), b1,
      moveTo(b2, '開いたまま（同じ大きさで）、もう1つの点に針をさす。'), b2,
      { t: 'pt', p: [R], say: '2つの弧が交わった点ができたね。' },
      vLine(O, addP(O, w, ext || dist(O, R) + 60), finalSay || '頂点と交わった点を結ぶと、角の二等分線！'),
    ] };
  }
  // 直線(向きu)上の点Pを通る垂線。sideの点があれば、そちらがわに作る
  function vPerpOn(P, u, r1, r2, side, finalSay, back, fwd) {
    var E1 = addP(P, u, r1), E2 = addP(P, u, -r1), n = { x: -u.y, y: u.x };
    if (side ? (side.x - P.x) * n.x + (side.y - P.y) * n.y < 0 : n.y > 0) n = { x: -n.x, y: -n.y };
    var X = addP(P, n, Math.sqrt(r2 * r2 - r1 * r1));
    var a1 = arcOver(P, r1, E1, E1, 18, '直線と交わるように、弧をかく。'), a2 = arcOver(P, r1, E2, E2, 18, '反対がわにも、弧をかく。');
    var b1 = arcOver(E1, r2, X, X, 18, '弧をかく。'), b2 = arcOver(E2, r2, X, X, 18, 'さっきの弧と交わるように、弧をかく。');
    return { X: X, n: n, E1: E1, E2: E2, steps: [
      openTo(a1, 'コンパスの針を' + nm(P) + 'にさす。'), a1, moveTo(a2, '開いたまま、反対がわへ。'), a2,
      { t: 'pt', p: [E1, E2], say: nm(P) + 'から同じ距離の点が、直線の上に2つできたね。' },
      openTo(b1, '1つめの点に針をさして、さっきより大きく開く。'), b1,
      moveTo(b2, '開いたまま（同じ大きさで）、もう1つの点に針をさす。'), b2,
      { t: 'pt', p: [X], say: '2つの弧が交わった点ができたね。' },
      vLine(addP(P, n, -(back == null ? 50 : back)), addP(P, n, fwd || dist(P, X) + 40), finalSay || nm(P) + 'と交わった点を結ぶと、垂線！'),
    ] };
  }
  // 直線LpLqの外の点Pを通る垂線
  function vPerpOut(P, Lp, Lq, finalSay) {
    var u = unit(Lq.x - Lp.x, Lq.y - Lp.y), Fo = foot(P, Lp, Lq), d = dist(P, Fo), r1 = d * 1.15, half = Math.sqrt(r1 * r1 - d * d);
    var E1 = addP(Fo, u, half), E2 = addP(Fo, u, -half), n = unit(Fo.x - P.x, Fo.y - P.y), r2 = half * 1.2;
    var X = addP(Fo, n, Math.sqrt(r2 * r2 - half * half));
    var a1 = arcOver(P, r1, E1, E2, 6, '直線と2か所で交わるように、弧をかく。');
    var b1 = arcOver(E1, r2, X, X, 18, '直線の反対がわに、弧をかく。'), b2 = arcOver(E2, r2, X, X, 18, 'さっきの弧と交わるように、弧をかく。');
    return { X: X, F: Fo, steps: [
      openTo(a1, 'コンパスの針を' + nm(P) + 'にさして、直線をこえるくらいに開く。'), a1,
      { t: 'pt', p: [E1, E2], say: '直線と交わった点が2つできたね。' },
      openTo(b1, '1つめの点に針をさす。'), b1,
      moveTo(b2, '開いたまま（同じ大きさで）、もう1つの点に針をさす。'), b2,
      { t: 'pt', p: [X], say: '2つの弧が交わった点ができたね。' },
      vLine(addP(P, n, -25), addP(P, n, Math.max(dist(P, X), 2 * d) + 25), finalSay || nm(P) + 'と交わった点を結ぶと、垂線！'),
    ] };
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
          t.hint = '① 「コンパス」で、ものさしの0の点をタップしてから、' + fmtCm(c) + 'の目もりをタップ（コンパスが' + fmtCm(c) + 'に開く。円はまだかかれない）。② 点Bをタップして円をかく。③ 同じように、コンパスでものさしの0→' + fmtCm(b) + 'をタップして、点Cをタップ。④ 2つの円が交わった点（上のほう）がA。';
          return t;
        }
      },
    },
    {
      id: 'elemTriSAS', level: 'elem', title: '2つの辺とその間の角がわかる三角形ABC',
      make: function () {
        for (var k = 0; k < 200; k++) {
          var bc = 0.5 * randInt(10, 14), deg = 10 * randInt(3, 7), c = 0.5 * randInt(7, 12);
          var ax = c * Math.cos(deg * Math.PI / 180), ay = c * Math.sin(deg * Math.PI / 180);
          if (ay < 1.5 || ay > 5.4) continue;
          var t = elemTri_(bc, ax, ay, { AB: c, BC: bc, angB: deg }, true);
          if (!t) continue;
          t.hint = '① 「📐 分度器」で、点B（中心）→点C（0°の線）の順にタップして、' + deg + '°の目もりをタップして印をつける。② 「📏 定規」で、点Bと印を結ぶ。③ 「コンパス」で、ものさしの0の点→' + fmtCm(c) + 'の目もりをタップ（コンパスが開く）。④ 点Bをタップして円をかく。⑤ 直線と円が交わった点がA。';
          return t;
        }
      },
    },
    {
      id: 'elemTriASA', level: 'elem', title: '1つの辺とその両はしの角がわかる三角形ABC',
      make: function () {
        for (var k = 0; k < 200; k++) {
          var bc = 0.5 * randInt(10, 14), db = 10 * randInt(3, 7), dc = 10 * randInt(3, 7);
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
          video: (function () {
            var Cc = { x: B.x + D.x - A.x, y: B.y + D.y - A.y }, a1 = angOf(B, A), a2 = angOf(D, A);
            var s1 = nrm(angOf(B, Cc) - a1), s2 = nrm(angOf(D, Cc) - a2);
            return [
              { t: 'say', say: 'ひし形は、4つの辺の長さがぜんぶ同じだよ。' },
              { t: 'open', c: B, to: A, say: 'コンパスの針を点Bにさして、えんぴつを点Aまで開く（ABの長さ）。' },
              { t: 'arc', c: B, r: len, a0: a1, a1: a1 + s1 + (s1 > 0 ? 14 : -14), say: 'Cがありそうなところまで、弧をかく。' },
              { t: 'open', c: D, to: A, say: '開いたまま（同じ長さで）、針を点Dにさす。' },
              { t: 'arc', c: D, r: len, a0: a2, a1: a2 + s2 + (s2 > 0 ? 14 : -14), say: 'さっきの弧と交わるまで、弧をかく。' },
              { t: 'pt', p: [lbl(Cc, 'C')], say: '2つの弧が交わった点が、頂点Cだよ。' },
              vLine(B, Cc, '定規で、点Bと点Cを結ぶ。'), vLine(D, Cc, '点Dと点Cも結んだら、ひし形のできあがり！'),
            ];
          })(),
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
          video: (function () {
            var Bp = at(O, r, d + 60), Cp = at(O, r, d + 120), a1 = angOf(A, O), a2 = angOf(Bp, O);
            var s1 = nrm(angOf(A, Bp) - a1), s2 = nrm(angOf(Bp, Cp) - a2);
            return [
              { t: 'say', say: '正六角形の1辺の長さは、円の半径と同じだよ。' },
              { t: 'open', c: A, to: O, say: 'コンパスの針を点Aにさして、えんぴつを点Oまで開く（半径の長さ）。' },
              { t: 'arc', c: A, r: r, a0: a1, a1: a1 + s1 + (s1 > 0 ? 14 : -14), say: '円Oと交わるまで、弧をかく。' },
              { t: 'pt', p: [lbl(Bp, 'B')], say: '円と交わった点が、となりの頂点Bだよ。' },
              { t: 'open', c: Bp, to: O, say: '開いたまま（同じ長さで）、針を点Bにさす。' },
              { t: 'arc', c: Bp, r: r, a0: a2, a1: a2 + s2 + (s2 > 0 ? 14 : -14), say: '同じように、円Oと交わるまで弧をかく。' },
              { t: 'pt', p: [lbl(Cp, 'C')], say: '円と交わった点が、頂点Cだよ！' },
            ];
          })(),
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
          video: [{ t: 'say', say: '線分ABの垂直二等分線をかこう。' }].concat(vPerpBis(A, B, 'AB').steps),
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
          video: [{ t: 'say', say: '∠AOBを半分に分ける、角の二等分線をかこう。' }].concat(vAngBis(O, A, B, 90, '頂点Oと交わった点を結ぶと、∠AOBの二等分線！', 230).steps),
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
          video: [{ t: 'say', say: '点Pを通って、直線ℓに垂直な線（垂線）をかこう。' }].concat(vPerpOut(P, L.p, L.q).steps),
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
          video: [{ t: 'say', say: '直線ℓ上の点Pを通って、ℓに垂直な線をかこう。' }].concat(vPerpOn(P, u, 55, 95, null, '点Pと交わった点を結ぶと、垂線！', 60).steps),
          hint: '① 点Pを中心に円をかき、直線ℓとの交点を2つつくる。② その2つの交点を中心に、①より大きい同じ半径の円をそれぞれかく。③ その2つの円の交点と、点Pを定規で結ぶ。',
        };
      },
    },

    // ----- 2026-11-27 先生の指示「コンパスの作図問題を増やして」で追加(基本) -----
    {
      id: 'midpoint', level: 'basic', title: '線分ABの中点M',
      make: function () {
        var A = { x: rnd(60, 100), y: rnd(200, 250), label: 'A' }, B = { x: rnd(260, 300), y: rnd(150, 210), label: 'B' };
        var M = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
        return {
          points: [A, B], objs: [{ type: 'segment', p: A, q: B }], target: { kind: 'point', p: M, label: 'M' },
          ask: '作図してできた中点Mを「📍 答えの点」でタップしてね。',
          video: [{ t: 'say', say: '中点は、線分ABの垂直二等分線と、線分ABが交わる点だよ。' }].concat(vPerpBis(A, B, 'AB').steps,
            [{ t: 'pt', p: [lbl(M, 'M')], say: '垂直二等分線と線分ABが交わった点が、中点Mだよ！' }]),
          hint: '中点は、線分ABの垂直二等分線と線分ABの交点。① 点Aを中心に円をかく（半径はABの半分より大きく）。② 「⭕ 同じ大きさの円」で点Bをタップする。③ 2つの円の交点2つを定規で結ぶ。④ その直線と線分ABの交点がM。',
        };
      },
    },
    {
      id: 'equilateral', level: 'basic', title: '線分ABを1辺とする正三角形ABCの頂点C（ABの上がわ）',
      make: function () {
        var A = { x: rnd(80, 110), y: rnd(240, 270), label: 'A' }, len = rnd(150, 175), d = rnd(-8, 8);
        var B = at(A, len, d, 'B'), C = at(A, len, d + 60);
        return {
          points: [A, B], objs: [{ type: 'segment', p: A, q: B }], target: { kind: 'point', p: C, label: 'C' },
          ask: '作図してできた点Cを「📍 答えの点」でタップしてね。',
          video: (function () {
            var a1 = arcOver(A, len, C, C, 16, 'Cがありそうな上のほうに、弧をかく。'), a2 = arcOver(B, len, C, C, 16, 'さっきの弧と交わるように、弧をかく。');
            return [{ t: 'say', say: '正三角形は、3つの辺の長さがぜんぶ同じだよ。ABの長さをコンパスで写そう。' },
              { t: 'open', c: A, to: B, say: 'コンパスの針を点Aにさして、えんぴつを点Bまで開く（ABの長さ）。' }, a1,
              moveTo(a2, '開いたまま（同じ長さで）、針を点Bにさす。'), a2,
              { t: 'pt', p: [lbl(C, 'C')], say: '2つの弧が交わった点が、頂点Cだよ。' },
              vLine(A, C, '定規で、点Aと点Cを結ぶ。'), vLine(B, C, '点Bと点Cも結んだら、正三角形のできあがり！')];
          })(),
          hint: '正三角形は3つの辺の長さが同じ。① コンパスで、点Aを中心にして点Bをタップする（半径AB）。② 「⭕ 同じ大きさの円」で点Bをタップする。③ 2つの円が交わった点のうち、上のほうがC。',
        };
      },
    },
    {
      id: 'angle60', level: 'basic', title: '∠XOA＝60°となる直線OA',
      make: function () {
        var O = { x: rnd(70, 100), y: rnd(270, 300), label: 'O' }, d0 = rnd(-6, 6), X = at(O, 250, d0, 'X');
        return {
          points: [O, X], objs: [{ type: 'ray', p: O, q: X }],
          target: { kind: 'line', lines: [{ p: O, u: dirDeg(d0 + 60) }, { p: O, u: dirDeg(d0 - 60) }] },
          video: (function () {
            var rr = 100, E = at(O, rr, d0), Fp = at(O, rr, d0 + 60);
            var a = arcOver(O, rr, E, Fp, 12, '半直線OXと交わるところから、上のほうまで弧をかく。'), b = arcOver(E, rr, Fp, Fp, 16, 'さっきの弧と交わるように、弧をかく。');
            return [{ t: 'say', say: '60°は正三角形の角。コンパスで正三角形をつくろう。' }, openTo(a, 'コンパスの針を点Oにさす。'), a,
              { t: 'pt', p: [E], say: '半直線OXと交わった点ができたね。' }, moveTo(b, '開いたまま（同じ大きさで）、その点に針をさす。'), b,
              { t: 'pt', p: [Fp], say: '2つの弧が交わった点ができたね。Oとこの点を結ぶと、正三角形の角で60°だよ。' },
              vLine(O, at(O, 240, d0 + 60), '点Oと交わった点を結ぶと、∠XOA＝60°の直線！')];
          })(),
          hint: '60°は正三角形の角。① 点Oを中心に円をかき、半直線OXとの交点Eをつくる。② 「⭕ 同じ大きさの円」で点Eをタップする。③ 2つの円の交点（上のほう）と点Oを定規で結ぶ。',
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
          video: [{ t: 'say', say: '円の中心は、A・B・Cのどれからも同じ距離。2本の垂直二等分線でさがそう。' }].concat(vPerpBis(t[0], t[1], t[0].label + t[1].label).steps, vPerpBis(t[1], t[2], t[1].label + t[2].label).steps,
            [{ t: 'pt', p: [lbl(circumcenter(t[0], t[1], t[2]), 'O')], say: '2本の垂直二等分線が交わった点が、円の中心Oだよ！' }]),
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
          video: (function () {
            var u = unit(A.x - O.x, A.y - O.y);
            return [{ t: 'say', say: '接線は、接点Aを通って、半径OAに垂直な直線だよ。' }, vLine(O, addP(A, u, 70), 'まず、定規で点Oと点Aを結んで、長めに線をひく。')]
              .concat(vPerpOn(A, u, 35, 62, null, '点Aと交わった点を結ぶと、接線のできあがり！', 70).steps);
          })(),
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
              video: (function () {
                var pb = vPerpBis(A, B, 'AB'), far = dist(pb.X1, P) > dist(pb.X2, P) ? pb.X1 : pb.X2, w = unit(P.x - far.x, P.y - far.y);
                return [{ t: 'say', say: 'AとBから同じ距離にある点は、線分ABの垂直二等分線の上にあるよ。' }].concat(pb.steps.slice(0, -1), [
                  vLine(addP(far, w, -25), addP(P, w, 25), '2つの点を定規で結んで、直線ℓまでのばす。'),
                  { t: 'pt', p: [lbl(P, 'P')], say: '直線ℓと交わった点がPだよ！' }]);
              })(),
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
          video: (function () {
            var po = vPerpOn(O, dirDeg(d0), 50, 85, null, 'Oを通る垂線がひけた。これで90°の角ができたよ。', 20), G = addP(O, po.n, 60);
            return [{ t: 'say', say: '45°は90°の半分。まず90°をつくって、それを半分にしよう。' }].concat(po.steps, vAngBis(O, X, G, 60, '頂点Oと交わった点を結ぶと、90°の半分で45°！', 200).steps);
          })(),
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
          video: (function () {
            var rr = 90, E = at(O, rr, d0), Fp = at(O, rr, d0 + 60);
            var a = arcOver(O, rr, E, Fp, 12, '半直線OXと交わるところから、上のほうまで弧をかく。'), b = arcOver(E, rr, Fp, Fp, 16, 'さっきの弧と交わるように、弧をかく。');
            var ab = vAngBis(O, E, Fp, rr, '頂点Oと交わった点を結ぶと、60°の半分で30°！', 230);
            return [{ t: 'say', say: '30°は60°の半分。60°は正三角形の角だよ。' }, openTo(a, 'コンパスの針を点Oにさす。'), a,
              { t: 'pt', p: [E], say: '半直線OXと交わった点ができたね。' }, moveTo(b, '開いたまま（同じ大きさで）、その点に針をさす。'), b,
              { t: 'pt', p: [Fp], say: '交わった点とOを結ぶと正三角形になるので、ここの角は60°だよ。' }].concat(ab.steps.slice(3));
          })(),
          hint: '30°は60°の半分。60°は正三角形の角。① 点Oを中心に円をかき、半直線OXとの交点Eをつくる。② 点Eを中心に、同じ半径の円をかく（交点Fと、O・Eで正三角形）。③ ∠EOF(60°)の二等分線をひく。',
        };
      },
    },

    // ----- 2026-11-27 追加(標準) -----
    {
      id: 'square', level: 'std', title: '線分ABを1辺とする正方形ABCDの頂点D（ABの上がわ）',
      make: function () {
        var A = { x: rnd(100, 130), y: rnd(265, 285), label: 'A' }, len = rnd(120, 140), d = rnd(-8, 8);
        var B = at(A, len, d, 'B'), D = at(A, len, d + 90);
        return {
          points: [A, B], objs: [{ type: 'line', p: at(A, 85, d + 180), q: at(A, len + 70, d) }],
          target: { kind: 'point', p: D, label: 'D' },
          ask: '作図してできた点Dを「📍 答えの点」でタップしてね。',
          video: (function () {
            var u = dirDeg(d), po = vPerpOn(A, u, 50, 85, D, '点Aと交わった点を結ぶと、ABに垂直な線。', 30, len + 30), a0 = angOf(A, B);
            return [{ t: 'say', say: '正方形は、4つの角が直角で、4つの辺が同じ長さ。まず点AにABと垂直な線をひこう。' }].concat(po.steps, [
              { t: 'open', c: A, to: B, say: 'コンパスの針を点Aにさして、点Bまで開く（ABの長さ）。' },
              { t: 'arc', c: A, r: len, a0: a0, a1: a0 - 100, say: '点Bから、垂直な線と交わるまで弧をかく。' },
              { t: 'pt', p: [lbl(D, 'D')], say: '垂直な線と弧が交わった点が、頂点Dだよ！' }]);
          })(),
          hint: '正方形は、角が直角で辺の長さが同じ。① 点Aを中心に円をかき、直線ABとの交点を2つつくる。② その2つの交点を中心に、①より大きい同じ半径の円をそれぞれかき、交点と点Aを結ぶ（Aを通る垂線）。③ 点Aを中心に、点Bを通る円をかく。④ 垂線と円の交点のうち、上のほうがD。',
        };
      },
    },
    {
      id: 'altitude', level: 'std', title: '△ABCの頂点Cから辺ABにひいた垂線',
      make: function () {
        // 辺ABを長めにして、Cを中心にした円が辺ABと2か所で交わりやすくする
        var A = { x: rnd(25, 45), y: rnd(225, 250), label: 'A' }, B = { x: rnd(315, 335), y: rnd(215, 250), label: 'B' }, C = { x: rnd(150, 210), y: rnd(80, 115), label: 'C' }, t = [A, B, C], u = unit(B.x - A.x, B.y - A.y);
        return {
          points: t, objs: triObjs(A, B, C), target: { kind: 'line', lines: [{ p: C, u: { x: -u.y, y: u.x } }] },
          video: [{ t: 'say', say: '頂点Cから辺ABに、垂直な線（垂線）をひこう。三角形の高さになる線だよ。' }].concat(vPerpOut(C, A, B, '点Cと交わった点を結ぶと、辺ABへの垂線！').steps),
          hint: '「直線の外の点を通る垂線」と同じ。① 点Cを中心に、辺ABと2点で交わる円をかく。② その2つの交点を中心に、同じ半径の円をそれぞれかく。③ その2つの円の交点（ABの下がわ）と、点Cを定規で結ぶ。',
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
          video: (function () {
            var A = t[0], B = t[1], C = t[2], I = incenter(A, B, C), rA = Math.min(dist(A, B), dist(A, C)) * 0.35, rB = Math.min(dist(B, A), dist(B, C)) * 0.35;
            return [{ t: 'say', say: '3辺から同じ距離の点は、角の二等分線の上にあるよ。2つの角の二等分線をかこう。' }]
              .concat(vAngBis(A, B, C, rA, '点' + A.label + 'と交わった点を結ぶと、∠' + A.label + 'の二等分線。', dist(A, I) * 1.3).steps,
                vAngBis(B, A, C, rB, '点' + B.label + 'と交わった点を結ぶと、∠' + B.label + 'の二等分線。', dist(B, I) * 1.3).steps,
                [{ t: 'pt', p: [lbl(I, 'I')], say: '2本の線が交わった点が、Iだよ！' }]);
          })(),
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
              video: (function () {
                var po = vPerpOut(A, L.p, L.q, '点Aからℓに、垂線がひけた。'), c = arcOver(po.F, dist(po.F, A), A2, A2, 16, 'ℓの反対がわに、弧をかく。');
                return [{ t: 'say', say: 'ℓについてAと対称な点A′をつくると、AP＝A′P。A′とBをまっすぐ結べばいちばん短いよ。' }].concat(po.steps, [
                  openTo(c, '垂線とℓが交わった点に針をさして、点Aまでの長さに開く。'), c,
                  { t: 'pt', p: [lbl(A2, 'A′')], say: '垂線と弧が交わった点が、A′だよ。' },
                  vLine(A2, addP(B, unit(B.x - A2.x, B.y - A2.y), 20), '定規で、点A′と点Bを結ぶ。'),
                  { t: 'pt', p: [lbl(P, 'P')], say: 'ℓと交わった点がPだよ！' }]);
              })(),
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
          video: (function () {
            var po = vPerpOut(A, L.p, L.q, '点Aからℓに、垂線がひけた。'), a0 = angOf(A, F);
            return [{ t: 'say', say: '接する円の半径は、点Aから直線ℓまでの距離（垂線の長さ）だよ。' }].concat(po.steps, [
              { t: 'pt', p: [lbl(F, 'H')], say: '垂線とℓが交わった点をHとするよ。' },
              { t: 'open', c: A, to: F, say: 'コンパスの針を点Aにさして、点Hまで開く。' },
              { t: 'arc', c: A, r: dist(A, F), a0: a0, a1: a0 + 359, say: 'くるっと1周、円をかいたらできあがり！' }]);
          })(),
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
          video: (function () {
            var u = unit(A.x - O.x, A.y - O.y), A2 = at(O, r, d + 90), a0 = angOf(O, A);
            return [{ t: 'say', say: '回転させても、Oからの距離は同じ。OAに垂直な線と、Aを通る円を使おう。' }, vLine(addP(O, u, -80), addP(A, u, 30), 'まず、定規で直線OAをひく。')]
              .concat(vPerpOn(O, u, 40, 70, A2, '点Oと交わった点を結ぶと、OAに垂直な線。', 60, r + 30).steps, [
                { t: 'open', c: O, to: A, say: 'コンパスの針を点Oにさして、点Aまで開く。' },
                { t: 'arc', c: O, r: r, a0: a0, a1: a0 - 100, say: '点Aから、左回りに弧をかく。' },
                { t: 'pt', p: [lbl(A2, 'A′')], say: '垂直な線と弧が交わった点が、A′だよ！' }]);
          })(),
          ask: '作図してできた点A′を「📍 答えの点」でタップしてね。',
          hint: '回転させても、Oからの距離は同じ。① 定規で直線OAをひく。② 直線OA上の点Oを通る垂線をひく。③ Oを中心に、Aを通る円をかく。④ 円と垂線の交点のうち、左回りに90°のほうがA′。',
        };
      },
    },

    // ----- 2026-11-27 追加(入試) -----
    {
      id: 'circleCenter', level: 'exam', title: '円周上の3点A、B、Cを使って、円の中心Oを見つける',
      make: function () {
        var O = { x: rnd(170, 190), y: rnd(195, 215) }, r = rnd(110, 125);
        var A = at(O, r, rnd(195, 225), 'A'), B = at(O, r, rnd(-45, -15), 'B'), C = at(O, r, rnd(75, 105), 'C');
        return {
          points: [A, B, C], objs: [{ type: 'circle', c: O, r: r, given: true }], target: { kind: 'point', p: O, label: 'O' },
          ask: '作図してできた中心Oを「📍 答えの点」でタップしてね。',
          video: [{ t: 'say', say: '円の中心は、円周上のどの点からも同じ距離。弦の垂直二等分線は、かならず中心を通るよ。' }].concat(
            vPerpBis(A, C, 'AC').steps, vPerpBis(C, B, 'CB').steps,
            [{ t: 'pt', p: [lbl(O, 'O')], say: '2本の垂直二等分線が交わった点が、円の中心Oだよ！' }]),
          hint: '弦の垂直二等分線は、円の中心を通る。① 点Aと点Cの垂直二等分線をひく（Aを中心に円 → 「⭕ 同じ大きさの円」でC → 交点2つを結ぶ）。② 点Cと点Bの垂直二等分線も同じようにひく。③ 2本の交点がO。',
        };
      },
    },
    {
      id: 'tangentOut', level: 'exam', title: '円Oの外の点Pから円Oにひいた接線',
      make: function () {
        var O = { x: rnd(100, 125), y: rnd(215, 240), label: 'O' }, r = rnd(58, 68);
        var P = at(O, rnd(175, 195), rnd(15, 30), 'P');
        var M = { x: (O.x + P.x) / 2, y: (O.y + P.y) / 2 }, h = dist(O, P) / 2;
        var X = interCC({ c: O, r: r }, { c: M, r: h });
        return {
          points: [O, P], objs: [{ type: 'circle', c: O, r: r, given: true }],
          target: { kind: 'line', lines: X.map(function (T) { return { p: P, u: unit(T.x - P.x, T.y - P.y) }; }) },
          video: (function () {
            var u = unit(P.x - O.x, P.y - O.y), T = X[0].y < X[1].y ? X[0] : X[1], a0 = angOf(M, O);
            return [{ t: 'say', say: '接線は、接点を通る半径に垂直。OPを直径とする円をかくと、その円の上の点からOとPを見た角は90°になるよ。' },
              vLine(addP(O, u, -30), addP(P, u, 30), 'まず、定規で点Oと点Pを結ぶ。')].concat(vPerpBis(O, P, 'OP').steps, [
              { t: 'pt', p: [lbl(M, 'M')], say: '垂直二等分線と直線OPが交わった点が、OPの中点Mだよ。' },
              { t: 'open', c: M, to: O, say: 'コンパスの針を点Mにさして、点Oまで開く。' },
              { t: 'arc', c: M, r: h, a0: a0, a1: a0 + 359, say: 'OPを直径とする円をかく。' },
              { t: 'pt', p: [lbl(X[0], 'T'), lbl(X[1], 'T′')], say: '円Oと交わった点が、接点だよ。' },
              vLine(P, addP(P, unit(T.x - P.x, T.y - P.y), dist(P, T) + 50), '点Pと接点を結ぶと、接線のできあがり！（もう1つの接点を結んでも正解）')]);
          })(),
          hint: '接線は、接点を通る半径に垂直。OPを直径とする円の上の点は、∠OTP＝90°になる。① 定規で直線OPをひく。② 線分OPの垂直二等分線をひいて、OPの中点Mをつくる。③ 点Mを中心に、点Oを通る円をかく。④ その円と円Oの交点の1つと、点Pを定規で結ぶ。',
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
  // 作図のコンパスの小さいアイコン(🧭は方位磁針なので使わない。2026-11-27 バグ報告#95)
  var COMPASS_ICON = '<svg viewBox="0 0 24 24" width="1.15em" height="1.15em" style="vertical-align:-0.22em" aria-hidden="true"><line x1="12" y1="1.5" x2="12" y2="5" stroke="#334155" stroke-width="2.4" stroke-linecap="round"/><line x1="11" y1="7.5" x2="5" y2="20" stroke="#64748b" stroke-width="2.2" stroke-linecap="round"/><line x1="5" y1="20" x2="4.2" y2="23" stroke="#111827" stroke-width="1.1" stroke-linecap="round"/><line x1="13" y1="7.5" x2="17.4" y2="17" stroke="#64748b" stroke-width="2.2" stroke-linecap="round"/><line x1="17.4" y1="17" x2="18.9" y2="20.4" stroke="#facc15" stroke-width="2.8"/><line x1="18.9" y1="20.4" x2="19.6" y2="22.6" stroke="#1f2937" stroke-width="1.4" stroke-linecap="round"/><circle cx="12" cy="6.3" r="2.1" fill="#cbd5e1" stroke="#475569" stroke-width="1"/></svg>';
  // ===== コンパスの絵(2026-11-22 先生「コンパスの絵があるとイメージしやすい」) =====
  // c＝針の先、pen＝えんぴつの先。2本の足は同じ長さで、つまみ(持つところ)は上がわ。
  function compassSvg(c, pen, opa) {
    var d = dist(c, pen), L = Math.max(62, d / 2 + 28), m = { x: (c.x + pen.x) / 2, y: (c.y + pen.y) / 2 };
    var u = d > 0.5 ? unit(pen.x - c.x, pen.y - c.y) : { x: 1, y: 0 };
    var n = { x: u.y, y: -u.x }; if (n.y > 0 || (Math.abs(n.y) < 1e-6 && n.x > 0)) n = { x: -n.x, y: -n.y };
    var hh = Math.sqrt(Math.max(0, L * L - d * d / 4)), H = { x: m.x + n.x * hh, y: m.y + n.y * hh };
    var a = unit(H.x - c.x, H.y - c.y), b = unit(H.x - pen.x, H.y - pen.y);
    function P(o, v, k) { return { x: o.x + v.x * k, y: o.y + v.y * k }; }
    function ln(p, q, col, w) { return '<line x1="' + p.x.toFixed(1) + '" y1="' + p.y.toFixed(1) + '" x2="' + q.x.toFixed(1) + '" y2="' + q.y.toFixed(1) + '" stroke="' + col + '" stroke-width="' + w + '" stroke-linecap="round"/>'; }
    var h = '<g opacity="' + (opa || 0.95) + '" pointer-events="none">';
    h += ln(c, P(c, a, 12), '#111827', 1.6);                                   // 針
    h += ln(P(c, a, 11), H, '#64748b', 5.5) + ln(P(c, a, 13), P(H, a, -8), '#e2e8f0', 1.4); // 針がわの足(金属)
    h += ln(P(pen, b, 4), P(pen, b, 11), '#fcd9a5', 5) + ln(pen, P(pen, b, 5), '#1f2937', 2.6); // えんぴつの先
    h += ln(P(pen, b, 11), P(pen, b, 26), '#facc15', 6);                        // えんぴつ
    h += ln(P(pen, b, 26), H, '#64748b', 5.5) + ln(P(pen, b, 28), P(H, b, -8), '#e2e8f0', 1.4); // えんぴつがわの足
    h += ln(H, P(H, n, 18), '#334155', 6.5);                                   // つまみ
    h += '<circle cx="' + H.x.toFixed(1) + '" cy="' + H.y.toFixed(1) + '" r="6.5" fill="#cbd5e1" stroke="#475569" stroke-width="1.6"/>';
    return h + '</g>';
  }
  // 分度器の絵(中心c、0°の向きphi、sgn：角度をはかる向き)
  function protDraw(c, phi, sgn, R, opa) {
    function pt(deg, rr) { var t = phi + sgn * deg * Math.PI / 180; return { x: c.x + rr * Math.cos(t), y: c.y + rr * Math.sin(t) }; }
    var h = '<g opacity="' + (opa == null ? 1 : opa) + '">', a = pt(0, R), b = pt(180, R);
    h += '<path d="M' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) + ' A' + R + ' ' + R + ' 0 0 ' + (sgn > 0 ? 1 : 0) + ' ' + b.x.toFixed(1) + ' ' + b.y.toFixed(1) + ' Z" fill="rgba(56,189,248,0.16)" stroke="#0284c7" stroke-width="1.3"/>';
    for (var d = 0; d <= 180; d += 5) {
      var o = pt(d, R), i = pt(d, R - (d % 10 ? 6 : 11));
      h += '<line x1="' + o.x.toFixed(1) + '" y1="' + o.y.toFixed(1) + '" x2="' + i.x.toFixed(1) + '" y2="' + i.y.toFixed(1) + '" stroke="#0284c7" stroke-width="1"/>';
      if (d % 10 === 0) { var tp = pt(d, R - 22); h += '<text x="' + tp.x.toFixed(1) + '" y="' + (tp.y + 3).toFixed(1) + '" font-size="8.5" text-anchor="middle" fill="#0369a1">' + d + '</text>'; }
    }
    return h + '</g>';
  }
  function protFrameOf(c, base) { var phi = Math.atan2(base.y - c.y, base.x - c.x); return { phi: phi, sgn: Math.sin(phi - Math.PI / 2) < 0 ? -1 : 1 }; }

  // ===== 🎬 かき方の動画(2026-11-22 先生「最初に動画で書き方の説明。5パターンぐらい」) =====
  function dpt(O, r, deg, label) { var t = deg * Math.PI / 180, p = { x: O.x + r * Math.cos(t), y: O.y + r * Math.sin(t) }; if (label) p.label = label; return p; } // 画面の角度(下向きが＋)
  var DRX = 30, DRY = 356, DCM = 34;
  var DEMOS = (function () {
    var R0 = { x: DRX, y: DRY };
    var B = { x: 95, y: 280, label: 'B' }, C = { x: 265, y: 280, label: 'C' };
    var A1 = { x: 203.8, y: 198.4, label: 'A' };
    var A2 = dpt(B, 136, -50, 'A');
    var A3 = { x: 195.7, y: 160.0, label: 'A' };
    var PA = { x: 70, y: 230, label: 'A' }, PB = { x: 290, y: 230, label: 'B' };
    var O5 = { x: 60, y: 300, label: 'O' }, P5 = dpt(O5, 110, 0), Q5 = dpt(O5, 110, -60), R5 = dpt(O5, 178.8, -30);
    var P6 = { x: 180, y: 120, label: 'P' }, A6 = { x: 60, y: 280 }, B6 = { x: 300, y: 280 }, Q6 = { x: 180, y: 370 };
    function rl(cm) { return { x: DRX + cm * DCM, y: DRY }; }
    return [
      { name: '3つの辺', title: '3つの辺の長さがわかる三角形（小学生）', ruler: true, segs: [[B, C, '5cm']], pts: [B, C], steps: [
        { t: 'say', say: '辺BC（5cm）は、もうかいてあるよ。AB＝4cm、AC＝3cmの三角形をかこう。' },
        { t: 'open', c: R0, to: rl(4), say: 'コンパスの針をものさしの0に合わせて、えんぴつの先を4cmまで開く。' },
        { t: 'move', c: B, r: 136, a: -55, say: '開いたまま（4cmのまま）、コンパスの針を点Bにさす。' },
        { t: 'arc', c: B, r: 136, a0: -55, a1: -18, say: '頂点Aがありそうなところに、くるっと弧をかく。' },
        { t: 'open', c: R0, to: rl(3), say: 'こんどは、ものさしでコンパスを3cmに開く。' },
        { t: 'move', c: C, r: 102, a: -150, say: '開いたまま（3cmのまま）、針を点Cにさす。' },
        { t: 'arc', c: C, r: 102, a0: -150, a1: -104, say: 'さっきの弧と交わるように、弧をかく。' },
        { t: 'pt', p: [A1], say: '2つの弧が交わった点が、頂点Aだよ。' },
        { t: 'line', p: A1, q: B, say: '定規で、点Aと点Bを結ぶ。' },
        { t: 'line', p: A1, q: C, say: '点Aと点Cも結んだら、できあがり！' },
      ] },
      { name: '2つの辺と間の角', title: '2つの辺とその間の角がわかる三角形（小学生）', ruler: true, segs: [[B, C, '5cm']], pts: [B, C], steps: [
        { t: 'say', say: '辺BC（5cm）はかいてあるよ。∠B＝50°、AB＝4cmの三角形をかこう。' },
        { t: 'prot', c: B, base: C, deg: 50, say: '分度器の中心を点Bに、0°の線を辺BCに合わせて、50°のところに印をつける。' },
        { t: 'line', p: B, q: dpt(B, 230, -50), say: '定規で、点Bと印を結んで、長めに線をひく。' },
        { t: 'open', c: R0, to: rl(4), say: 'コンパスの針をものさしの0に合わせて、4cmに開く。' },
        { t: 'move', c: B, r: 136, a: -66, say: '開いたまま、針を点Bにさす。' },
        { t: 'arc', c: B, r: 136, a0: -66, a1: -34, say: 'ひいた線と交わるように、弧をかく。' },
        { t: 'pt', p: [A2], say: '線と弧が交わった点が、頂点Aだよ。' },
        { t: 'line', p: A2, q: C, say: '点Aと点Cを結んだら、できあがり！' },
      ] },
      { name: '1つの辺と両はしの角', title: '1つの辺とその両はしの角がわかる三角形（小学生）', ruler: true, segs: [[B, C, '5cm']], pts: [B, C], steps: [
        { t: 'say', say: '辺BC（5cm）はかいてあるよ。∠B＝50°、∠C＝60°の三角形をかこう。' },
        { t: 'prot', c: B, base: C, deg: 50, say: '分度器の中心を点Bに合わせて、50°のところに印をつける。' },
        { t: 'line', p: B, q: dpt(B, 230, -50), say: '点Bと印を結んで、長めに線をひく。' },
        { t: 'prot', c: C, base: B, deg: 60, say: 'こんどは、分度器の中心を点Cに合わせて、60°のところに印をつける。' },
        { t: 'line', p: C, q: dpt(C, 190, -120), say: '点Cと印を結んで、長めに線をひく。' },
        { t: 'pt', p: [A3], say: '2本の線が交わった点が、頂点Aだよ。できあがり！' },
      ] },
      { name: '垂直二等分線', title: '線分ABの垂直二等分線（中学1年）', segs: [[PA, PB]], pts: [PA, PB], steps: [
        { t: 'say', say: '線分ABの垂直二等分線をかこう。' },
        { t: 'open', c: PA, to: dpt(PA, 140, -58), say: 'コンパスの針を点Aにさして、ABの半分より大きく開く。' },
        { t: 'arc', c: PA, r: 140, a0: -58, a1: 58, say: '線分ABの上と下にとどくように、弧をかく。' },
        { t: 'move', c: PB, r: 140, a: -122, say: '開いたまま（同じ大きさで）、針を点Bにさす。' },
        { t: 'arc', c: PB, r: 140, a0: -122, a1: -238, say: '同じように、上と下に弧をかく。' },
        { t: 'pt', p: [{ x: 180, y: 143.4 }, { x: 180, y: 316.6 }], say: '弧が交わった点が、上と下に2つできたね。' },
        { t: 'line', p: { x: 180, y: 105 }, q: { x: 180, y: 345 }, say: '2つの点を定規で結ぶと、垂直二等分線のできあがり！' },
      ] },
      { name: '角の二等分線', title: '∠XOYの二等分線（中学1年）', lines: [[O5, dpt(O5, 280, 0), 'X'], [O5, dpt(O5, 260, -60), 'Y']], pts: [O5], steps: [
        { t: 'say', say: '∠XOYを半分に分ける、角の二等分線をかこう。' },
        { t: 'open', c: O5, to: dpt(O5, 110, 12), say: 'コンパスの針を、角の頂点Oにさす。' },
        { t: 'arc', c: O5, r: 110, a0: 12, a1: -72, say: '2つの辺と交わるように、弧をかく。' },
        { t: 'pt', p: [P5, Q5], say: '辺と交わった2つの点ができたね。' },
        { t: 'move', c: P5, r: 100, a: -88, say: '1つめの点に針をさす。' },
        { t: 'arc', c: P5, r: 100, a0: -88, a1: -40, say: '角の内がわに、弧をかく。' },
        { t: 'move', c: Q5, r: 100, a: -22, say: '開いたまま（同じ大きさで）、もう1つの点に針をさす。' },
        { t: 'arc', c: Q5, r: 100, a0: -22, a1: 26, say: 'さっきの弧と交わるように、弧をかく。' },
        { t: 'pt', p: [R5], say: '2つの弧が交わった点ができたね。' },
        { t: 'line', p: O5, q: dpt(O5, 285, -30), say: '頂点Oと交わった点を結ぶと、角の二等分線のできあがり！' },
      ] },
      { name: '垂線', title: '点Pを通る、直線ℓの垂線（中学1年）', lines: [[{ x: 15, y: 280 }, { x: 345, y: 280 }, 'ℓ']], pts: [P6], steps: [
        { t: 'say', say: '点Pを通って、直線ℓに垂直な線（垂線）をかこう。' },
        { t: 'open', c: P6, to: dpt(P6, 200, 145), say: 'コンパスの針を点Pにさして、直線ℓをこえるくらい大きく開く。' },
        { t: 'arc', c: P6, r: 200, a0: 145, a1: 35, say: '直線ℓと2か所で交わるように、弧をかく。' },
        { t: 'pt', p: [A6, B6], say: '直線ℓと交わった2つの点ができたね。' },
        { t: 'move', c: A6, r: 150, a: 18, say: '左の点に針をさす。' },
        { t: 'arc', c: A6, r: 150, a0: 18, a1: 56, say: '直線ℓの下に、弧をかく。' },
        { t: 'move', c: B6, r: 150, a: 162, say: '開いたまま（同じ大きさで）、右の点に針をさす。' },
        { t: 'arc', c: B6, r: 150, a0: 162, a1: 124, say: 'さっきの弧と交わるように、弧をかく。' },
        { t: 'pt', p: [Q6], say: '2つの弧が交わった点ができたね。' },
        { t: 'line', p: { x: 180, y: 100 }, q: { x: 180, y: 390 }, say: '点Pと交わった点を結ぶと、垂線のできあがり！' },
      ] },
    ];
  })();
  var DEMO_DUR = { say: 1600, open: 1900, move: 1300, arc: 1700, line: 1300, prot: 2600, pt: 1100 }, DEMO_HOLD = 1300;
  function ease(k) { return k * k * (3 - 2 * k); }
  function lerpP(p, q, k) { return { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k }; }
  function arcPath(c, r, a0, a1, col, w) {
    var p0 = dpt(c, r, a0), p1 = dpt(c, r, a1);
    return '<path d="M' + p0.x.toFixed(1) + ' ' + p0.y.toFixed(1) + ' A' + r + ' ' + r + ' 0 ' + (Math.abs(a1 - a0) > 180 ? 1 : 0) + ' ' + (a1 > a0 ? 1 : 0) + ' ' + p1.x.toFixed(1) + ' ' + p1.y.toFixed(1) + '" fill="none" stroke="' + col + '" stroke-width="' + w + '"/>';
  }
  function lineSvg(p, q, col, w) { return '<line x1="' + p.x.toFixed(1) + '" y1="' + p.y.toFixed(1) + '" x2="' + q.x.toFixed(1) + '" y2="' + q.y.toFixed(1) + '" stroke="' + col + '" stroke-width="' + w + '" stroke-linecap="round"/>'; }
  function txt(x, y, t, o) { o = o || {}; return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" font-size="' + (o.fs || 14) + '"' + (o.b === false ? '' : ' font-weight="bold"') + ' fill="' + (o.col || '#1c2127') + '"' + (o.mid ? ' text-anchor="middle"' : '') + '>' + t + '</text>'; }
  function demoRulerSvg() {
    var h = '<rect x="' + (DRX - 12) + '" y="' + DRY + '" width="' + (9 * DCM + 24) + '" height="34" rx="3" fill="#fef9c3" stroke="#ca8a04" stroke-width="1.3"/>';
    for (var k = 0; k <= 18; k++) { var x = DRX + k * DCM / 2; h += lineSvg({ x: x, y: DRY }, { x: x, y: DRY + (k % 2 ? 7 : 12) }, '#854d0e', 1); if (k % 2 === 0) h += txt(x, DRY + 26, String(k / 2), { fs: 10, b: false, mid: true, col: '#713f12' }); }
    return h;
  }
  function demoFrame(D, t) {
    var h = (D.base || '') + (D.ruler ? demoRulerSvg() : '');
    (D.segs || []).forEach(function (s2) { h += lineSvg(s2[0], s2[1], '#1c2127', 2.2); if (s2[2]) h += txt((s2[0].x + s2[1].x) / 2, s2[0].y + 20, s2[2], { fs: 12, b: false, mid: true }); });
    (D.lines || []).forEach(function (l) { h += lineSvg(l[0], l[1], '#1c2127', 2.2); if (l[2]) h += txt(l[1].x - 14, l[1].y - 8, l[2], { fs: 15 }); });
    var n = D.steps.length, acc = 0, i = n - 1, local = DEMO_DUR[D.steps[n - 1].t] + DEMO_HOLD, end = true;
    for (var j = 0; j < n; j++) { var span = DEMO_DUR[D.steps[j].t] + DEMO_HOLD; if (t < acc + span) { i = j; local = t - acc; end = false; break; } acc += span; }
    var pose = null, show = false, over = '';
    for (j = 0; j <= i; j++) {
      var S = D.steps[j], k = ease(Math.min(1, (j < i ? 1e9 : local) / DEMO_DUR[S.t]));
      if (S.t === 'open') {
        var u = unit(S.to.x - S.c.x, S.to.y - S.c.y), full = dist(S.c, S.to);
        if (pose) {
          var pr = Math.min(dist(pose.c, pose.pen), full), mid = { c: S.c, pen: { x: S.c.x + u.x * pr, y: S.c.y + u.y * pr } };
          pose = k < 0.4 ? { c: lerpP(pose.c, mid.c, k / 0.4), pen: lerpP(pose.pen, mid.pen, k / 0.4) } : { c: S.c, pen: lerpP(mid.pen, S.to, (k - 0.4) / 0.6) };
        } else pose = { c: S.c, pen: lerpP({ x: S.c.x + u.x * 14, y: S.c.y + u.y * 14 }, S.to, k) };
        show = true;
        if (j === i && (S.cm || (D.ruler && S.c.y === DRY)) && k > 0.4) over += txt(pose.pen.x, S.c.y - 8, (Math.round(dist(S.c, pose.pen) / DCM * 2) / 2) + 'cm', { fs: 13, col: '#c2410c', mid: true });
      } else if (S.t === 'move') {
        var tgt = { c: S.c, pen: dpt(S.c, S.r, S.a) };
        pose = pose ? { c: lerpP(pose.c, tgt.c, k), pen: lerpP(pose.pen, tgt.pen, k) } : tgt; show = true;
      } else if (S.t === 'arc') {
        var a = S.a0 + (S.a1 - S.a0) * k;
        if (Math.abs(a - S.a0) > 0.3) h += arcPath(S.c, S.r, S.a0, a, '#2f6fd6', 1.8);
        pose = { c: S.c, pen: dpt(S.c, S.r, a) }; show = true;
      } else if (S.t === 'line') {
        var q = lerpP(S.p, S.q, k); h += lineSvg(S.p, q, '#c23b2e', 2);
        if (j === i && k < 1) { var ang = Math.atan2(S.q.y - S.p.y, S.q.x - S.p.x) * 180 / Math.PI, len = dist(S.p, S.q); over += '<g transform="translate(' + S.p.x.toFixed(1) + ' ' + S.p.y.toFixed(1) + ') rotate(' + ang.toFixed(1) + ')" opacity="0.8"><rect x="-14" y="2" width="' + (len + 28).toFixed(1) + '" height="18" rx="3" fill="#fef08a" stroke="#ca8a04"/></g>'; }
        show = false;
      } else if (S.t === 'prot') {
        var PR = S.R || 85, pf = protFrameOf(S.c, S.base), mk = dpt(S.c, PR, pf.phi * 180 / Math.PI + pf.sgn * S.deg);
        if (j === i && k < 1) over += protDraw(S.c, pf.phi, pf.sgn, PR, Math.min(1, k * 4));
        if (k > 0.5) { h += '<circle cx="' + mk.x.toFixed(1) + '" cy="' + mk.y.toFixed(1) + '" r="3.5" fill="#c2410c"/>' + txt(mk.x + 6, mk.y - 6, S.deg + '°', { fs: 12, col: '#c2410c' }); }
        show = false;
      } else if (S.t === 'pt') {
        S.p.forEach(function (p) {
          if (j === i && k < 1) h += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (6 + 14 * (1 - k)).toFixed(1) + '" fill="none" stroke="#16a34a" stroke-width="2" opacity="' + (1 - k * 0.6).toFixed(2) + '"/>';
          h += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="5" fill="#16a34a"/>';
          if (p.label) h += txt(p.x + 8, p.y - 8, p.label, { fs: 16, col: '#16a34a' });
        });
        show = false;
      } else show = false;
    }
    (D.pts || []).forEach(function (p) { h += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="4.5" fill="#1c2127"/>' + (p.label ? txt(p.x + 7, p.y - 7, p.label, { fs: 15 }) : ''); });
    h += over;
    if (show && pose) h += compassSvg(pose.c, pose.pen, 0.97);
    return { svg: h, i: i, end: end };
  }
  var demoEl = null, demo = null, demoList = DEMOS;
  function openDemo(idx) { openPlayer(DEMOS, idx || 0, true); }
  // 1つの問題の答えの動画
  function openVideo(D) { openPlayer([D], 0, false); }
  function openPlayer(list, idx, tabs) {
    if (!demoEl) buildDemoEl();
    demoList = list;
    demoEl.querySelector('.sk-demo-tabs').hidden = !tabs;
    demoEl.querySelector('.sk-demo-next').hidden = !tabs;
    demoEl.querySelector('.sk-demo-head b').textContent = tabs ? '🎬 作図のかき方' : '🎬 答えの動画';
    demoEl.hidden = false;
    playDemo(idx);
  }
  function buildDemoEl() {
    if (!demoEl) {
      demoEl = document.createElement('div'); demoEl.className = 'sk-demo';
      demoEl.innerHTML = '<div class="sk-demo-card"><div class="sk-demo-head"><b>🎬 作図のかき方</b><button type="button" class="ghost-btn sk-demo-close">✖ とじる</button></div>' +
        '<div class="sk-demo-tabs">' + DEMOS.map(function (d, i) { return '<button type="button" class="ghost-btn sk-demo-tab" data-i="' + i + '">' + (i + 1) + '. ' + d.name + '</button>'; }).join('') + '</div>' +
        '<p class="sk-demo-title"></p><svg class="sk-demo-svg" viewBox="0 0 360 400" xmlns="http://www.w3.org/2000/svg"></svg><p class="sk-demo-cap"></p>' +
        '<div class="sk-demo-ctl"><button type="button" class="ghost-btn sk-demo-pause">⏸ 止める</button><button type="button" class="ghost-btn sk-demo-again">🔁 もう一度</button><button type="button" class="ghost-btn sk-demo-next">次の動画 ▶</button></div></div>';
      document.body.appendChild(demoEl);
      demoEl.addEventListener('click', function (e) {
        if (e.target === demoEl) return closeDemo();
        var b = e.target.closest('button'); if (!b) return;
        if (b.classList.contains('sk-demo-close')) closeDemo();
        else if (b.classList.contains('sk-demo-tab')) playDemo(+b.getAttribute('data-i'));
        else if (b.classList.contains('sk-demo-again')) playDemo(demo.idx);
        else if (b.classList.contains('sk-demo-next')) playDemo((demo.idx + 1) % demoList.length);
        else if (b.classList.contains('sk-demo-pause')) { if (demo.end) return playDemo(demo.idx); demo.paused = !demo.paused; b.textContent = demo.paused ? '▶ 続ける' : '⏸ 止める'; if (!demo.paused) { demo.last = 0; loop(); } }
      });
    }
  }
  function closeDemo() { if (demoEl) demoEl.hidden = true; if (demo) demo.stop = true; }
  function playDemo(idx) {
    if (demo) demo.stop = true;
    demo = { idx: idx, t: 0, last: 0, paused: false, end: false };
    var D = demoList[idx];
    demoEl.querySelector('.sk-demo-svg').setAttribute('viewBox', D.vb || '0 0 360 400');
    demoEl.querySelectorAll('.sk-demo-tab').forEach(function (b) { b.classList.toggle('is-on', +b.getAttribute('data-i') === idx); });
    demoEl.querySelector('.sk-demo-title').textContent = D.title;
    demoEl.querySelector('.sk-demo-pause').textContent = '⏸ 止める';
    loop();
  }
  function loop() {
    var me = demo;
    function tick(now) {
      if (me.stop || me.paused || me !== demo) return;
      if (me.last) me.t += Math.min(100, now - me.last);
      me.last = now;
      renderDemo(me);
      if (!me.end) window.requestAnimationFrame(tick);
    }
    if (window.requestAnimationFrame) window.requestAnimationFrame(tick); else renderDemo(me);
  }
  function renderDemo(me) {
    var D = demoList[me.idx], f = demoFrame(D, me.t), n = D.steps.length;
    demoEl.querySelector('.sk-demo-svg').innerHTML = f.svg;
    demoEl.querySelector('.sk-demo-cap').innerHTML = '<span class="sk-demo-no">' + (f.i + 1) + ' / ' + n + '</span>' + D.steps[f.i].say + (f.end ? ' 🎉' : '');
    if (f.end) { me.end = true; demoEl.querySelector('.sk-demo-pause').textContent = '🔁 はじめから'; }
  }
  function demoIdxFor(pid) {
    var m = { elemTri3: 0, elemTriSAS: 1, elemTriASA: 2, bisector: 3, angle: 4, perpOut: 5, perpOn: 5 };
    return m[pid] != null ? m[pid] : (/^elem/.test(pid) ? 0 : 3);
  }

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
      '<div class="sk-top"><select class="sk-sel"></select> <button type="button" class="ghost-btn sk-new">🔄 別の図</button> <button type="button" class="ghost-btn sk-demo-btn">🎬 かき方の動画</button></div>' +
      '<p class="sk-title"></p>' +
      '<svg class="sk-svg" viewBox="0 ' + VY + ' ' + W + ' ' + VH + '" xmlns="http://www.w3.org/2000/svg"></svg>' +
      '<div class="sk-shape">円の形：<button type="button" class="ghost-btn sk-arcmode" data-a="0">⭕ 円</button><button type="button" class="ghost-btn sk-arcmode" data-a="1">◠ 3分の2の円</button></div>' +
      '<div class="sk-tools">' +
      '<button type="button" class="ghost-btn sk-tool" data-t="compass">' + COMPASS_ICON + ' コンパス</button>' +
      '<button type="button" class="ghost-btn sk-tool" data-t="ruler">📏 定規</button>' +
      '<button type="button" class="ghost-btn sk-tool" data-t="prot" hidden>📐 分度器</button>' +
      '<button type="button" class="ghost-btn sk-tool" data-t="answer" hidden>📍 答えの点</button>' +
      '<button type="button" class="ghost-btn sk-tool" data-t="same">⭕ 同じ大きさの円</button>' +
      '</div>' +
      '<p class="sk-msg"></p>' +
      '<div class="sk-tools"><button type="button" class="ghost-btn sk-undo">↩️ 1つもどす</button> <button type="button" class="ghost-btn sk-reset">🗑 はじめから</button> <button type="button" class="ghost-btn sk-hint">💡 ヒント</button> <button type="button" class="ghost-btn sk-show">🎬 答えの動画</button></div>' +
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
      st.pick = null; st.lastR = 0; st.done = false; st.correctObj = null; st.showAns = false; st.rewarded = false; st.anim = null; st.parked = null; st.hover = null;
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
      st.tool = t; st.pick = null; st.protBase = null; st.parked = null; st.hover = null;
      root.querySelectorAll('.sk-tool').forEach(function (b) { b.classList.toggle('is-on', b.getAttribute('data-t') === t); });
      if (!st.done) msg(t === 'compass' ? '円の中心にする点をタップしてね。' : t === 'ruler' ? '直線を引く1つめの点をタップしてね。'
        : t === 'same' ? (st.lastR ? (st.arcMode ? '① 中心にする点をタップ → ② 弧をかきたい側をタップすると、<b>1つ前と同じ大きさの3分の2の円</b>がかけるよ。' : '円の中心にする点をタップすると、<b>1つ前の円と同じ大きさ</b>の円がかけるよ。') : 'まだ円がないよ。先に「' + COMPASS_ICON + ' コンパス」で円を1つかいてね。')
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
      // バグ報告#77：正解のあと「↩️ 1つもどす」でかき直すと、同じ図でまた正解になってMPと正解数が増えていた。
      // 1つの図でごほうび(MP・野球ガチャの正解数)は1回だけ。答えの動画を見た図も、もどしてかき直してもごほうびなし。
      if (st.rewarded || st.showAns) { $('.sk-msg').innerHTML += '<br>（' + (st.rewarded ? 'この図ではもうMPをもらったよ' : '答えの動画を見た図なのでMPはなし') + '。「🔄 別の図」でチャレンジしよう）'; return; }
      st.rewarded = true;
      if (opts.onCorrect) try { var extra = opts.onCorrect(st.pid); if (extra) $('.sk-msg').innerHTML += '<br>' + extra; } catch (e) { }
    }
    // 円をかくとき、コンパスがくるっと回って線がのびていく(2026-11-22 先生「コンパスを使っているイメージができるように」)
    function animate(a) { if (!window.requestAnimationFrame) return; a.t0 = Date.now(); st.anim = a; }
    function push(o) {
      if (o.type === 'circle') { animate({ obj: o, dur: o.arc ? 650 : 850 }); st.parked = null; }
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
          msg((diffR ? '❌ ' : '') + 'その直線は、答えの線ではないよ（作図のとちゅうで使う線なら、そのまま続けてOK）。' + (diffR ? '<b>2つの円の半径がちがう</b>よ。同じ半径の円でかこう（2つめの円は「⭕ 同じ大きさの円」を使うとかんたん）。' : '') + 'まちがえて引いたときは「↩️ 1つもどす」で消してね。');
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
          var r0 = st.pick; st.pick = null; st.lastR = len;
          setTool('same');
          st.parked = { c: { x: r0.x, y: r0.y }, pen: { x: sn.x, y: sn.y } };
          animate({ open: true, c: st.parked.c, to: st.parked.pen, dur: 600 }); draw();
          msg(COMPASS_ICON + ' コンパスを<b>' + fmtCm(len / CM) + '</b>に開いたよ。次に、円の中心にする点（BやC）をタップしてね' + (st.arcMode ? '（そのあと、弧をかきたい側をタップ）' : '') + '。');
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
        if (!st.lastR) { msg('まだ円がないよ。先に「' + COMPASS_ICON + ' コンパス」で円を1つかいてね。'); return; }
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
        // 📐 分度器(2026-11-22)：①頂点 ②0°の線を合わせる点 ③目もりをタップすると、その角度(10°ごと。2026-11-22 先生の指示)の所に印をつける
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
        var deg = Math.max(10, Math.min(170, Math.round(ang / 10) * 10));
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
    var hoverRaf = 0;
    svg.addEventListener('pointermove', function (ev) {
      if (st.done || !st.pick || !(st.tool === 'compass' || (st.tool === 'same' && st.arcMode))) return;
      st.hover = toSvg(ev);
      if (!hoverRaf && window.requestAnimationFrame) hoverRaf = window.requestAnimationFrame(function () { hoverRaf = 0; draw(); });
    });
    root.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.classList.contains('sk-demo-btn')) return openDemo(demoIdxFor(st.pid));
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
        // 2026-11-22 先生「答えは、全て動画解説で」：その問題の図のまま、かき方を動画で見せる。
        if (st.showAns) { playAnswerVideo_(); return; }
        if (!st.done && !window.confirm('答えの動画を見ると、この図ではMPがもらえません。見ますか？')) return;
        st.showAns = true; st.pick = null; st.protBase = null;
        var wasDone = st.done; st.done = true;
        $('.sk-hinttext').hidden = false;
        if (!wasDone) msg('🎬 答えの動画を見たね。答えの図を緑色で出したよ。もう一度見るときは「🎬 答えの動画」。次は「🔄 別の図」でチャレンジしよう。');
        draw();
        playAnswerVideo_();
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
      var pf = protFrame_();
      return protDraw(pf.c, pf.phi, pf.sgn, PROT_R);
    }
    // 答えの動画：問題の図(見本・ものさし・はじめからある線と点)の上で、かき方を動かして見せる
    function probBaseSvg_(pr) {
      var h = pr.deco || '';
      pr.objs.forEach(function (o) {
        if (o.type === 'circle') { h += '<circle cx="' + o.c.x.toFixed(1) + '" cy="' + o.c.y.toFixed(1) + '" r="' + o.r.toFixed(1) + '" fill="none" stroke="#1c2127" stroke-width="2"/>'; return; }
        var e = ext(o);
        h += '<line x1="' + e[0].toFixed(1) + '" y1="' + e[1].toFixed(1) + '" x2="' + e[2].toFixed(1) + '" y2="' + e[3].toFixed(1) + '" stroke="#1c2127" stroke-width="2"/>';
        if (o.label) h += '<text x="' + (o.q.x - 14).toFixed(1) + '" y="' + (o.q.y - 8).toFixed(1) + '" font-size="15" font-weight="bold" fill="#1c2127">' + o.label + '</text>';
      });
      return h;
    }
    function playAnswerVideo_() {
      var pr = st.prob;
      if (!pr.video) return;
      openVideo({ title: '答え：' + byId(st.pid).title, base: probBaseSvg_(pr), vb: '0 ' + VY + ' ' + W + ' ' + VH, steps: pr.video, pts: pr.points.filter(function (p) { return !p.tick; }) });
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
      var A = st.anim, prog = 1, now = Date.now();
      if (A) { prog = Math.min(1, (now - A.t0) / A.dur); prog = prog * prog * (3 - 2 * prog); if (!A.open && st.objs.indexOf(A.obj) < 0) { A = st.anim = null; prog = 1; } }
      var compass = '';
      st.objs.forEach(function (o) {
        var good = st.done && o === st.correctObj;
        if (A && o === A.obj && prog < 1) {
          var sw = o.arc ? 2 * ARC_HALF : 2 * Math.PI, sa = o.arc ? o.a0 - ARC_HALF : 0, ang = sa + sw * prog, len = o.r * sw;
          var p0 = { x: o.c.x + o.r * Math.cos(sa), y: o.c.y + o.r * Math.sin(sa) };
          h += '<path d="M' + p0.x.toFixed(1) + ' ' + p0.y.toFixed(1) + ' A' + o.r.toFixed(1) + ' ' + o.r.toFixed(1) + ' 0 ' + (sw * prog > Math.PI ? 1 : 0) + ' 1 ' + (o.c.x + o.r * Math.cos(ang)).toFixed(1) + ' ' + (o.c.y + o.r * Math.sin(ang)).toFixed(1) + '" fill="none" stroke="#2f6fd6" stroke-width="1.6"/>';
          compass = compassSvg(o.c, { x: o.c.x + o.r * Math.cos(ang), y: o.c.y + o.r * Math.sin(ang) });
          return;
        }
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
      // コンパスの絵：かいている途中・ものさしで開いたとき・中心をえらんだとき
      if (!compass && !st.done) {
        if (A && A.open && prog < 1) compass = compassSvg(A.c, { x: A.c.x + (A.to.x - A.c.x) * prog, y: A.c.y + (A.to.y - A.c.y) * prog });
        else if (st.parked && st.tool === 'same' && !st.pick) compass = compassSvg(st.parked.c, st.parked.pen, 0.85);
        else if (st.pick && (st.tool === 'compass' || (st.tool === 'same' && st.arcMode))) {
          var pen = st.hover && dist(st.hover, st.pick) > 8 ? st.hover : null;
          if (st.tool === 'same' && st.lastR) { var hv = pen || { x: st.pick.x + 1, y: st.pick.y - 1 }, uu = unit(hv.x - st.pick.x, hv.y - st.pick.y); pen = { x: st.pick.x + uu.x * st.lastR, y: st.pick.y + uu.y * st.lastR }; }
          if (!pen) pen = st.pick.tick ? { x: st.pick.x + 18, y: st.pick.y } : { x: st.pick.x + (st.lastR || 60) * 0.87, y: st.pick.y - (st.lastR || 60) * 0.5 };
          compass = compassSvg(st.pick, pen, 0.9);
        }
      }
      st.points.forEach(function (p) {
        var on = st.pick && dist(st.pick, p) < 0.5;
        if (p.tick && !on) { h += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="2.4" fill="#854d0e"/>'; return; }
        var ans = st.done && st.answerPt && dist(st.answerPt, p) < 0.5;
        h += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (on || ans ? 7 : p.given ? 4.5 : 3.5) + '" fill="' + (ans ? '#18a058' : on ? '#f59e0b' : p.given ? '#1c2127' : '#2f6fd6') + '"/>';
        if (p.label) h += '<text x="' + (p.x + 7).toFixed(1) + '" y="' + (p.y - 7).toFixed(1) + '" font-size="15" font-weight="bold">' + p.label + '</text>';
      });
      svg.innerHTML = h + compass;
      if (A) { if (prog < 1) window.requestAnimationFrame(draw); else st.anim = null; }
      var sameBtn = root.querySelector('.sk-tool[data-t="same"]'); if (sameBtn) { sameBtn.disabled = !st.lastR || st.done; sameBtn.textContent = st.arcMode ? '◠ 同じ大きさの3分の2の円' : '⭕ 同じ大きさの円'; }
    }

    setArcMode(st.arcMode);
    setLevel('basic');
    // はじめて作図を開いたときは、かき方の動画を自動で見せる
    try { if (!localStorage.getItem('sakuzuDemoSeen')) { localStorage.setItem('sakuzuDemoSeen', '1'); openDemo(demoIdxFor(st.pid)); } } catch (e) { }
  }

  window.Sakuzu = { mount: mount, PROBLEMS: PROBLEMS, _demoList: function () { return demoList; }, _intersect: intersect, _lineMatches: lineMatches, _demoFrame: demoFrame, _DEMOS: DEMOS, _compass: compassSvg };
})();
