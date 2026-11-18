/* 📐 作図にチャレンジ(2026-11-18〜、今は先生(00001)だけのプレビュー)
   コンパスと定規だけを使って、画面の上で本当に作図する。
   - コンパス：中心にする点をタップ → 半径をきめる場所をタップ(点の近くなら点にぴったり)。「同じ半径」ボタンで前と同じ半径の円もかける。
   - 定規：2つの点をタップすると、その2点を通る直線を引く。
   - 点は、はじめからある点と、線や円が交わる点(交点)だけ。タップすると一番近い点に吸いつく。
   - 引いた直線が、正しい作図の線と重なったら正解。
   app.js から window.Sakuzu.mount(要素) で使う。 */
(function () {
  'use strict';
  var W = 360, H = 360, SNAP = 22, EPS = 1e-6;

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function dist(p, q) { return Math.hypot(p.x - q.x, p.y - q.y); }
  function unit(dx, dy) { var l = Math.hypot(dx, dy) || 1; return { x: dx / l, y: dy / l }; }

  // ---- 問題 ----
  // given: 表示する図(点・線分・半直線・直線)。target: 正解の直線(通る点pと向きu)。
  var PROBLEMS = [
    {
      id: 'bisector', title: '線分ABの垂直二等分線',
      make: function () {
        var A = { x: rnd(60, 100), y: rnd(200, 250), label: 'A' };
        var B = { x: rnd(260, 300), y: rnd(150, 210), label: 'B' };
        var M = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
        return {
          points: [A, B],
          objs: [{ type: 'segment', p: A, q: B }],
          target: { p: M, u: unit(-(B.y - A.y), B.x - A.x) },
          hint: '① 点Aを中心に円をかく（半径はABの半分より大きく）。② 点Bを中心に、同じ半径の円をかく。③ 2つの円の交点2つを定規で結ぶ。',
        };
      },
    },
    {
      id: 'angle', title: '∠AOBの二等分線',
      make: function () {
        var O = { x: rnd(50, 70), y: rnd(290, 310), label: 'O' };
        var t1 = rnd(0, 15) * Math.PI / 180, t2 = t1 + rnd(40, 80) * Math.PI / 180;
        var A = { x: O.x + 250 * Math.cos(t1), y: O.y - 250 * Math.sin(t1), label: 'A' };
        var B = { x: O.x + 200 * Math.cos(t2), y: O.y - 200 * Math.sin(t2), label: 'B' };
        var tm = (t1 + t2) / 2;
        return {
          points: [O, A, B],
          objs: [{ type: 'ray', p: O, q: A }, { type: 'ray', p: O, q: B }],
          target: { p: O, u: { x: Math.cos(tm), y: -Math.sin(tm) } },
          hint: '① 点Oを中心に円をかき、辺OA・辺OBとの交点をつくる。② その2つの交点を中心に、同じ半径の円をそれぞれかく。③ その2つの円の交点と、点Oを定規で結ぶ。',
        };
      },
    },
    {
      id: 'perpOut', title: '点Pを通る、直線ℓの垂線（Pは直線の外）',
      make: function () {
        var y0 = rnd(230, 260), tilt = rnd(-0.15, 0.15);
        var C = { x: 40, y: y0 + tilt * -140 }, D = { x: 320, y: y0 + tilt * 140 };
        var u = unit(D.x - C.x, D.y - C.y);
        var P = { x: rnd(150, 210), y: 0, label: 'P' };
        P.y = C.y + u.y / u.x * (P.x - C.x) - rnd(110, 150);
        return {
          points: [P],
          objs: [{ type: 'line', p: C, q: D, label: 'ℓ' }],
          target: { p: P, u: { x: -u.y, y: u.x } },
          hint: '① 点Pを中心に、直線ℓと2点で交わる円をかく。② その2つの交点を中心に、同じ半径の円をそれぞれかく。③ その2つの円の交点と、点Pを定規で結ぶ。',
        };
      },
    },
    {
      id: 'perpOn', title: '直線ℓ上の点Pを通る、ℓの垂線',
      make: function () {
        var y0 = rnd(200, 240), tilt = rnd(-0.15, 0.15);
        var C = { x: 30, y: y0 + tilt * -150 }, D = { x: 330, y: y0 + tilt * 150 };
        var u = unit(D.x - C.x, D.y - C.y);
        var px = rnd(160, 200);
        var P = { x: px, y: C.y + u.y / u.x * (px - C.x), label: 'P' };
        return {
          points: [P],
          objs: [{ type: 'line', p: C, q: D, label: 'ℓ' }],
          target: { p: P, u: { x: -u.y, y: u.x } },
          hint: '① 点Pを中心に円をかき、直線ℓとの交点を2つつくる。② その2つの交点を中心に、①より大きい同じ半径の円をそれぞれかく。③ その2つの円の交点と、点Pを定規で結ぶ。',
        };
      },
    },
  ];

  // ---- 交点 ----
  // 直線系の図形は p + t*u (uは単位ベクトル)。半直線は t>=0、線分は 0<=t<=len。
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
    var la = a.type !== 'circle', lb = b.type !== 'circle';
    if (la && lb) return interLL(a, b);
    if (la) return interLC(a, b);
    if (lb) return interLC(b, a);
    return interCC(a, b);
  }

  // ---- 画面 ----
  function mount(root, opts) {
    opts = opts || {};
    var st = { pi: 0, prob: null, objs: [], points: [], tool: 'compass', pick: null, lastR: 0, done: false, history: [] };

    root.innerHTML =
      '<div class="sk-top"><select class="sk-sel"></select> <button type="button" class="ghost-btn sk-new">🔄 別の図</button></div>' +
      '<p class="sk-title"></p>' +
      '<svg class="sk-svg" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg"></svg>' +
      '<div class="sk-tools">' +
      '<button type="button" class="ghost-btn sk-tool" data-t="compass">🧭 コンパス</button>' +
      '<button type="button" class="ghost-btn sk-tool" data-t="ruler">📏 定規</button>' +
      '<button type="button" class="ghost-btn sk-same" hidden>⭕ 同じ半径でかく</button>' +
      '</div>' +
      '<p class="sk-msg"></p>' +
      '<div class="sk-tools"><button type="button" class="ghost-btn sk-undo">↩️ 1つもどす</button> <button type="button" class="ghost-btn sk-reset">🗑 はじめから</button> <button type="button" class="ghost-btn sk-hint">💡 ヒント</button></div>' +
      '<p class="sk-hinttext" hidden></p>';
    var $ = function (c) { return root.querySelector(c); };
    var svg = $('.sk-svg'), sel = $('.sk-sel');
    PROBLEMS.forEach(function (p, i) { var o = document.createElement('option'); o.value = i; o.textContent = p.title; sel.appendChild(o); });

    function start(pi) {
      st.pi = pi; sel.value = pi;
      var pr = PROBLEMS[pi].make();
      st.prob = pr;
      st.objs = pr.objs.slice();
      st.history = [];
      st.pick = null; st.lastR = 0; st.done = false;
      $('.sk-title').textContent = '📐 ' + PROBLEMS[pi].title + 'を作図しよう！';
      $('.sk-hinttext').hidden = true;
      $('.sk-hinttext').textContent = pr.hint;
      setTool('compass');
      recompute();
      msg('コンパスで円をかこう。まず、円の中心にする点をタップしてね。');
    }
    function msg(t) { $('.sk-msg').innerHTML = t; }
    function setTool(t) {
      st.tool = t; st.pick = null;
      root.querySelectorAll('.sk-tool').forEach(function (b) { b.classList.toggle('is-on', b.getAttribute('data-t') === t); });
      if (!st.done) msg(t === 'compass' ? '円の中心にする点をタップしてね。' : '直線を引く1つめの点をタップしてね。');
      draw();
    }
    // 吸いつく点(はじめからある点＋交点)を作りなおす
    function recompute() {
      var pts = st.prob.points.map(function (p) { return { x: p.x, y: p.y, label: p.label, given: true }; });
      st.prob.objs.forEach(function (o) { if (o.type === 'segment') { [o.p, o.q].forEach(function (e) { add(pts, e); }); } });
      for (var i = 0; i < st.objs.length; i++) for (var j = i + 1; j < st.objs.length; j++) {
        intersect(st.objs[i], st.objs[j]).forEach(function (p) { if (p.x > -20 && p.x < W + 20 && p.y > -20 && p.y < H + 20) add(pts, p); });
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
    function push(o) {
      st.objs.push(o); st.history.push(o);
      recompute();
      if (o.type === 'line') check(o);
    }
    function check(o) {
      var L = lineOf(o), T = st.prob.target;
      var cross = Math.abs(L.u.x * T.u.y - L.u.y * T.u.x);           // 向きのずれ(sin)
      var off = Math.abs((T.p.x - L.p.x) * L.u.y - (T.p.y - L.p.y) * L.u.x); // 正解の点から線までの距離
      if (cross < 0.02 && off < 2.5) {
        st.done = true; st.correctLine = o;
        msg('⭕ <b>正解！</b>きれいに作図できたね！「🔄 別の図」で次の問題にチャレンジしよう。');
        draw();
        if (opts.onCorrect) try { opts.onCorrect(PROBLEMS[st.pi].id); } catch (e) { }
      } else {
        msg('❌ その直線は正しい作図の線ではないみたい。「↩️ 1つもどす」で消して、もう一度考えてみよう。');
      }
    }

    svg.addEventListener('click', function (ev) {
      if (st.done) return;
      var p = toSvg(ev), sn = nearest(p);
      if (st.tool === 'compass') {
        if (!st.pick) {
          if (!sn) { msg('円の中心は、点（●）の上をタップしてね。'); return; }
          st.pick = sn;
          msg('次に、円の半径をきめる場所をタップしてね。' + (st.lastR ? '前と同じ半径なら「⭕ 同じ半径でかく」を押してね。' : ''));
          draw();
        } else {
          var to = sn || p, r = dist(st.pick, to);
          if (r < 8) { msg('半径が小さすぎます。もう少しはなれた場所をタップしてね。'); return; }
          var c = st.pick; st.pick = null; st.lastR = r;
          push({ type: 'circle', c: { x: c.x, y: c.y }, r: r });
          if (!st.done) msg('円をかいたよ。続けて、次の円の中心にする点をタップしてね（直線を引くときは「📏 定規」）。');
        }
      } else {
        if (!sn) { msg('定規は、点（●）の上をタップしてね。'); return; }
        if (!st.pick) { st.pick = sn; msg('2つめの点をタップしてね。'); draw(); return; }
        if (dist(st.pick, sn) < 1) { msg('ちがう点をタップしてね。'); return; }
        var a = st.pick; st.pick = null;
        push({ type: 'line', p: { x: a.x, y: a.y }, q: { x: sn.x, y: sn.y }, mine: true });
      }
    });
    root.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.classList.contains('sk-tool')) setTool(b.getAttribute('data-t'));
      else if (b.classList.contains('sk-same')) {
        if (st.tool === 'compass' && st.pick && st.lastR && !st.done) { var c = st.pick; st.pick = null; push({ type: 'circle', c: { x: c.x, y: c.y }, r: st.lastR }); if (!st.done) msg('同じ半径の円をかいたよ。'); }
      }
      else if (b.classList.contains('sk-undo')) {
        if (st.pick) { st.pick = null; draw(); return; }
        var o = st.history.pop(); if (!o) return;
        st.objs.splice(st.objs.lastIndexOf(o), 1); st.done = false;
        recompute(); msg('1つもどしたよ。');
      }
      else if (b.classList.contains('sk-reset')) start(st.pi);
      else if (b.classList.contains('sk-new')) start(Number(sel.value) || 0);
      else if (b.classList.contains('sk-hint')) $('.sk-hinttext').hidden = !$('.sk-hinttext').hidden;
    });
    sel.addEventListener('change', function () { start(Number(sel.value) || 0); });

    // ---- 描く ----
    function ext(o) {
      var L = lineOf(o), a = o.type === 'line' ? -1000 : L.min, b = o.type === 'segment' ? L.max : 1000;
      return [L.p.x + a * L.u.x, L.p.y + a * L.u.y, L.p.x + b * L.u.x, L.p.y + b * L.u.y];
    }
    function draw() {
      var h = '';
      st.objs.forEach(function (o) {
        if (o.type === 'circle') {
          h += '<circle cx="' + o.c.x.toFixed(1) + '" cy="' + o.c.y.toFixed(1) + '" r="' + o.r.toFixed(1) + '" fill="none" stroke="#2f6fd6" stroke-width="1.2" opacity=".75"/>';
        } else {
          var e = ext(o), good = st.done && o === st.correctLine;
          h += '<line x1="' + e[0].toFixed(1) + '" y1="' + e[1].toFixed(1) + '" x2="' + e[2].toFixed(1) + '" y2="' + e[3].toFixed(1) + '" stroke="' + (good ? '#18a058' : o.mine ? '#c23b2e' : '#1c2127') + '" stroke-width="' + (good ? 3 : o.mine ? 1.6 : 2) + '"/>';
          if (o.label) h += '<text x="' + (o.q.x - 14).toFixed(1) + '" y="' + (o.q.y - 8).toFixed(1) + '" font-size="15" font-weight="bold">' + o.label + '</text>';
        }
      });
      st.points.forEach(function (p) {
        var on = st.pick && dist(st.pick, p) < 0.5;
        h += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (on ? 7 : p.given ? 4.5 : 3.5) + '" fill="' + (on ? '#f59e0b' : p.given ? '#1c2127' : '#2f6fd6') + '"/>';
        if (p.label) h += '<text x="' + (p.x + 7).toFixed(1) + '" y="' + (p.y - 7).toFixed(1) + '" font-size="15" font-weight="bold">' + p.label + '</text>';
      });
      svg.innerHTML = h;
      var same = $('.sk-same');
      same.hidden = !(st.tool === 'compass' && st.pick && st.lastR && !st.done);
    }

    start(0);
  }

  window.Sakuzu = { mount: mount, PROBLEMS: PROBLEMS, _intersect: intersect };
})();
