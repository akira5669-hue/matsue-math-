const crypto = require('crypto');
const { sql } = require('../db');
const { findStudent } = require('../students');
const { dateKeyTokyo } = require('../util');
const { zukeiCorrectToday, zukeiKokoCorrectToday, ZUKEI_GACHA_UNLOCK_, KOKO_PK_UNLOCK_ } = require('./zukei');
const { scienceCorrectToday } = require('./logging');

// ガチャ(サイコロガチャ・大吉占いガチャ・豆知識ガチャ・ミッションガチャ)。
// どれも1日1回ずつ無料で引ける。ただしサイコロガチャは、その日に超絶！図形！トレーニング！！で
// ZUKEI_GACHA_UNLOCK_問以上正解したときだけ引ける(2026-11-02〜。11-04からは解いた数ではなく正解した数)。結果(出目・運勢など)はここで決めて、MPもここで付ける
// (ふだんの1日100MPの上限とは別枠)。豆知識やミッションの文は端末側(app.js)に持ち、ここでは番号(pick)だけ決める。
// 2026-11-03から全員に公開。app.js側と揃えること。
const GACHA_OPEN_ALL = true;
const TRIVIA_COUNT = 30;
const MISSION_COUNT = 20;
// 大吉占い：運勢と出やすさ(合計100)とMP。
const FORTUNES = [
  { rank: '大吉', weight: 10, mp: 20 },
  { rank: '中吉', weight: 20, mp: 10 },
  { rank: '小吉', weight: 25, mp: 5 },
  { rank: '吉', weight: 25, mp: 3 },
  { rank: '末吉', weight: 15, mp: 2 },
  { rank: '凶', weight: 5, mp: 1 },
];
const KINDS = ['dice', 'omikuji', 'trivia', 'mission', 'pk', 'baseball'];
// サッカーPKガチャ(2026-11-06〜、2026-11-07から全員)。🏫高校受験問題！で今日KOKO_PK_UNLOCK_問正解するとできる(先生(00001)は条件なし)。2回勝負：
// ①キッカー：左・真ん中・右から選んでシュート。キーパーが飛んだ方向と違えばゴールで+5MP。
// ②キーパー：相手のシュートの方向を当てれば止めて+5MP。相手の動きはここ(サーバー)で決める。
const PK_DIRS = ['L', 'C', 'R'];
const PK_MP = 5;
// 2026-11-08〜：キックの方向を選んだあと、HP5を使って🌀無回転シュートか↪️カーブシュートが打てる。
// 10回に1回は枠の外(ゴールならず)。それ以外はゴール：キーパーが同じ方向に飛んでも、そこからさらに曲がって入る(bend)。
const PK_SPECIAL = ['knuckle', 'curve'];
const PK_SPECIAL_HP = 5;
// 野球ガチャ(2026-11-06〜。2026-11-10から全員)。🔬理科を今日BB_SCI_UNLOCK_問正解するとできる(先生(00001)は条件なし)。1日1試合。
// 2026-11-07先生の指示：9回裏・2アウト満塁・0対3。バッター大谷笑平(生徒)、ピッチャー松江太郎。
// 1球ごとに内角・真ん中・外角からコースを読んで振る。3球に1球はボール(4つで押し出し)。ストライクは投げたコースと
// 同じならバットに当たる、違えば空振り。3ストライクで三振→ゲームセット。ヒット・二塁打・三塁打はランナーが進んで点が入り、
// もう一度バッターボックスに立てる。ホームラン(または3点を超えた時点)でサヨナラ勝ち。アウト(フライ・ゴロ・ライナー)はゲームセット。
// 1日1試合。記録(gacha_log)に1球ずつ足していく。MPはその球の結果ごとに入る。
// 当たったときの結果(3600分の…)：ヒット1/4・二塁打1/20・三塁打1/40・ホームラン1/30・外野フライ1/10、
// 残りは内野フライ/ライナーが3分の1・内野ゴロが3分の2(2026-11-06先生の指示)。アウト(フライ・ゴロ・ライナー・三振)はすべて0MP(2026-11-07)。
const BB_COURSES = ['in', 'mid', 'out'];
const BB_SCI_UNLOCK_ = 10;
const BB_STRIKES = 3;
const BB_BALL_IN = 3; // 3球に1球はボール(2026-11-07先生の指示で4球に1球から変更)
const BB_AWAY = 3; // 相手の点
const BB_HIT_BASES = { single: 1, double: 2, triple: 3, hr: 4 };
const BB_RESULTS = [
  { res: 'single', w: 900, mp: 5 },
  { res: 'double', w: 180, mp: 10 },
  { res: 'triple', w: 90, mp: 50 }, // 2026-11-07先生の指示で15→50MP
  { res: 'hr', w: 120, mp: 100 },
  { res: 'ofly', w: 720, mp: 0 }, // 2026-11-07先生の指示で10%→20%、そのぶん内野ゴロを減らす
  { res: 'ifly', w: 650, mp: 0 },
  { res: 'grounder', w: 940, mp: 0 },
];
// 今引ける種類(2026-11-03〜サイコロ、11-04〜豆知識も。豆知識は条件なし。11-07〜PKも)。app.jsのGACHA_ENABLED_KINDS_と揃えること。
const ENABLED_KINDS = ['dice', 'trivia', 'pk', 'baseball'];

function isActive_(id) { return id === '00001' || GACHA_OPEN_ALL; }
function rnd_(n) { return crypto.randomInt(n); }

function draw_(kind) {
  if (kind === 'dice') {
    // サイコロ2個。出目の合計がMP。ゾロ目なら2倍。
    const dice = [rnd_(6) + 1, rnd_(6) + 1];
    const zorome = dice[0] === dice[1];
    return { result: { dice, zorome }, mp: (dice[0] + dice[1]) * (zorome ? 2 : 1) };
  }
  if (kind === 'omikuji') {
    let r = rnd_(100);
    const f = FORTUNES.find((x) => (r -= x.weight) < 0) || FORTUNES[FORTUNES.length - 1];
    return { result: { rank: f.rank, seed: rnd_(1000000) }, mp: f.mp };
  }
  if (kind === 'trivia') return { result: { pick: rnd_(TRIVIA_COUNT) }, mp: 1 };
  return { result: { pick: rnd_(MISSION_COUNT) }, mp: 1 };
}

let tablesReady = null;
function ensureTables_() {
  if (!tablesReady) {
    tablesReady = sql().query(`CREATE TABLE IF NOT EXISTS gacha_log (
      student_id TEXT NOT NULL, kind TEXT NOT NULL, day TEXT NOT NULL, ts TIMESTAMPTZ NOT NULL DEFAULT now(),
      result JSONB NOT NULL DEFAULT '{}', mp INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (student_id, kind, day))`, [])
      .catch((e) => { tablesReady = null; throw e; });
  }
  return tablesReady;
}

async function todayResults_(id, today) {
  const rows = await sql().query('SELECT kind, result, mp FROM gacha_log WHERE student_id = $1 AND day = $2', [id, today]);
  const out = {};
  rows.forEach((r) => { out[r.kind] = { result: r.result, mp: Number(r.mp) || 0 }; });
  return out;
}

async function handleGachaStatus(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  await ensureTables_();
  const today = dateKeyTokyo(new Date());
  return { ok: true, active: isActive_(id), today: await todayResults_(id, today), zukeiCorrect: await zukeiCorrectToday(id, today), diceUnlock: ZUKEI_GACHA_UNLOCK_, kokoCorrect: await zukeiKokoCorrectToday(id, today), pkUnlock: KOKO_PK_UNLOCK_, sciCorrect: await scienceCorrectToday(id, today), bbUnlock: BB_SCI_UNLOCK_ };
}

async function handleGachaDraw(body) {
  const id = String(body.id || '').trim();
  const kind = String(body.kind || '');
  if (!id) return { ok: false, error: 'missing_id' };
  if (!KINDS.includes(kind) || (id !== '00001' && !ENABLED_KINDS.includes(kind))) return { ok: false, error: 'bad_kind' };
  if (!isActive_(id)) return { ok: false, error: 'not_active' };
  await ensureTables_();
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  const today = dateKeyTokyo(new Date());
  if (kind === 'dice') {
    const n = await zukeiCorrectToday(id, today);
    if (n < ZUKEI_GACHA_UNLOCK_) return { ok: false, error: 'dice_locked', zukeiCorrect: n, diceUnlock: ZUKEI_GACHA_UNLOCK_ };
  }
  if (kind === 'pk' && id !== '00001') {
    const n = await zukeiKokoCorrectToday(id, today);
    if (n < KOKO_PK_UNLOCK_) return { ok: false, error: 'pk_locked', kokoCorrect: n, pkUnlock: KOKO_PK_UNLOCK_ };
  }
  if (kind === 'baseball' && id !== '00001') {
    const n = await scienceCorrectToday(id, today);
    if (n < BB_SCI_UNLOCK_) return { ok: false, error: 'bb_locked', sciCorrect: n, bbUnlock: BB_SCI_UNLOCK_ };
  }
  let d;
  if (kind === 'pk') {
    const kick = String(body.kick || '');
    if (!PK_DIRS.includes(kick)) return { ok: false, error: 'bad_dir' };
    const dive = PK_DIRS[rnd_(3)];
    const shot = PK_SPECIAL.includes(body.shot) ? body.shot : '';
    if (!shot) {
      // ふつうのシュートも10回に1回は枠の外(2026-11-08〜)
      const out = rnd_(10) === 0;
      const goal = !out && kick !== dive;
      const r = { kick, dive, goal };
      if (out) r.out = true;
      d = { result: r, mp: goal ? PK_MP : 0 };
    } else {
      // 払ったあともHPが残るときだけ(HP0のゲームオーバーにならないように)
      if ((Number(row.hp) || 0) <= PK_SPECIAL_HP) return { ok: false, error: 'insufficient_hp', hp: Number(row.hp) || 0 };
      const out = rnd_(10) === 0;
      const r = { kick, dive, goal: !out, sp: shot }; // sp=シュートの種類(キーパーのshotと別の名前にする)
      if (out) r.out = true;
      else if (kick === dive) r.bend = kick === 'C' ? (rnd_(2) ? 'L' : 'R') : 'C';
      d = { result: r, mp: out ? 0 : PK_MP, hpCost: PK_SPECIAL_HP };
    }
  } else if (kind === 'baseball') {
    const swing = String(body.swing || '');
    if (!BB_COURSES.includes(swing)) return { ok: false, error: 'bad_dir' };
    return bbPitch_(id, today, swing);
  } else d = draw_(kind);
  // 先生(00001)はPKを何度でも試せる(2026-11-06)。キーパーまで終わった今日の記録を消してから引き直す
  // (キックだけならキーパーの続きをする)。
  if (id === '00001' && kind === 'pk') {
    await sql().query("DELETE FROM gacha_log WHERE student_id = $1 AND kind = 'pk' AND day = $2 AND result ? 'keep'", [id, today]);
  }
  // 1日1回だけ。同時に押されても1回分だけになるよう、主キーで弾く。
  const ins = await sql().query(
    'INSERT INTO gacha_log (student_id, kind, day, result, mp) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING RETURNING mp',
    [id, kind, today, JSON.stringify(d.result), d.mp]
  );
  if (!ins.length) {
    const prev = (await todayResults_(id, today))[kind];
    return { ok: false, error: 'already_drawn', prev };
  }
  const st = await sql().query('UPDATE students SET points = points + $1, hp = GREATEST(0, hp - $3) WHERE id = $2 RETURNING points, hp', [d.mp, id, d.hpCost || 0]);
  return { ok: true, kind, result: d.result, mp: d.mp, newTotalPoints: Number(st[0].points) || 0, hp: d.hpCost ? Number(st[0].hp) || 0 : undefined };
}

// 野球の1球。今日の試合に1球足す。アウトになるか勝つと終わり(done)。
// 前の形(abがない記録)は終わったものとして扱う。
function bbDone_(r) { return !r || !r.ab || !!r.done; }
function bbNewGame_() { return { ab: 1, n: 0, balls: 0, strikes: 0, bases: [1, 1, 1], home: 0, away: BB_AWAY, pitches: [], done: false, win: false }; }
// k塁打でランナーを進める(ホームランは4)。入った点を返す。
function bbAdvance_(st, k) {
  let runs = 0;
  const nb = [0, 0, 0];
  for (let i = 2; i >= 0; i--) if (st.bases[i]) { if (i + k >= 3) runs++; else nb[i + k] = 1; }
  if (k >= 4) runs++; else nb[k - 1] = 1;
  st.bases = nb;
  return runs;
}
// 四球：つまっている塁だけ押し出す。
function bbWalk_(st) {
  const b = st.bases;
  let runs = 0;
  if (b[0]) { if (b[1]) { if (b[2]) runs = 1; b[2] = 1; } b[1] = 1; }
  b[0] = 1;
  return runs;
}
async function bbPitch_(id, today, swing) {
  // 先生(00001)は何度でも：終わった今日の試合を消してから始める
  if (id === '00001') {
    await sql().query("DELETE FROM gacha_log WHERE student_id = $1 AND kind = 'baseball' AND day = $2 AND (NOT (result ? 'ab') OR result->>'done' = 'true')", [id, today]);
  }
  const cur = (await sql().query("SELECT result, mp FROM gacha_log WHERE student_id = $1 AND kind = 'baseball' AND day = $2", [id, today]))[0];
  if (cur && bbDone_(cur.result)) return { ok: false, error: 'already_drawn', prev: { result: cur.result, mp: Number(cur.mp) || 0 } };
  const st = cur ? cur.result : bbNewGame_();
  const prevN = st.n;
  const isBall = rnd_(BB_BALL_IN) === 0;
  const pitch = isBall ? 'ball' : BB_COURSES[rnd_(3)];
  const ev = { ab: st.ab, swing, pitch, contact: false, res: '', runs: 0 };
  let add = 0, nextAb = false;
  if (isBall) {
    st.balls++;
    if (st.balls >= 4) { ev.res = 'walk'; ev.runs = bbWalk_(st); nextAb = true; } else ev.res = 'ball';
  } else if (swing === pitch) {
    ev.contact = true;
    let r = rnd_(3600);
    const o = BB_RESULTS.find((x) => (r -= x.w) < 0) || BB_RESULTS[BB_RESULTS.length - 1];
    ev.res = o.res; add = o.mp;
    // 内野フライとライナーは同じ扱い(0MP)。見た目だけ半分ずつにする。
    if (ev.res === 'ifly' && rnd_(2) === 0) ev.res = 'iliner';
    if (BB_HIT_BASES[ev.res]) { ev.runs = bbAdvance_(st, BB_HIT_BASES[ev.res]); nextAb = true; } else { st.done = true; }
  } else {
    st.strikes++;
    if (st.strikes >= BB_STRIKES) { ev.res = 'k'; st.done = true; } else ev.res = 'strike';
  }
  st.home += ev.runs;
  if (st.home > st.away || ev.res === 'hr') { st.win = true; st.done = true; }
  if (nextAb && !st.done) { st.ab++; st.balls = 0; st.strikes = 0; }
  st.pitches = (st.pitches || []).concat([ev]);
  st.n = prevN + 1;
  // 打率クイズ：半分は「.345→何割何分何厘？」、半分は逆に「3割4分5厘→小数で？」(bqRev、2026-11-12〜)
  // 2026-11-13〜：3つ目のパターン「打数と安打数から打率を計算する」(bqAb・bqH)を追加。3つのパターンが1/3ずつ。
  if (st.done) {
    const m = rnd_(3);
    st.avg = bbRandomAvg_(); st.bqRev = m === 1;
    if (m === 2) { const c = bbCalcQ_(); st.avg = c.avg; st.bqAb = c.ab; st.bqH = c.h; }
  }
  const mpTotal = (cur ? Number(cur.mp) || 0 : 0) + add;
  // 同時に押されても1球分だけになるよう、球数を見てから書く
  const w = cur
    ? await sql().query(
      "UPDATE gacha_log SET result = $3, mp = $4 WHERE student_id = $1 AND kind = 'baseball' AND day = $2 AND (result->>'n')::int = $5 AND result->>'done' = 'false' RETURNING mp",
      [id, today, JSON.stringify(st), mpTotal, prevN])
    : await sql().query(
      "INSERT INTO gacha_log (student_id, kind, day, result, mp) VALUES ($1, 'baseball', $2, $3, $4) ON CONFLICT DO NOTHING RETURNING mp",
      [id, today, JSON.stringify(st), mpTotal]);
  if (!w.length) return { ok: false, error: 'busy', prev: (await todayResults_(id, today)).baseball };
  let newTotalPoints = null;
  if (add > 0) {
    const r2 = await sql().query('UPDATE students SET points = points + $1 WHERE id = $2 RETURNING points', [add, id]);
    newTotalPoints = Number(r2[0].points) || 0;
  }
  return { ok: true, kind: 'baseball', result: st, last: ev, addMp: add, mp: mpTotal, newTotalPoints };
}

// 野球ガチャのゲームセット後の打率クイズ(2026-11-11〜)。最後のバッターの打率(1000分のいくつ)を見せて、
// 「3割4分5厘」のような読み方を4択で答える。正解で+1MP、まちがえても減らない。1試合1回(result.bqに記録)。app.jsと揃えること。
// 打率は .100〜.399。0の入った読み方(3割5厘・3割4分)も練習できるように、4回に1回ずつ分・厘を0にする。
function bbRandomAvg_() {
  let a = 100 + rnd_(300);
  const k = rnd_(4);
  if (k === 1) a = Math.floor(a / 100) * 100 + (a % 10 || 5); // 分が0(.305など)
  else if (k === 2) { a = Math.floor(a / 10) * 10; if (a % 100 === 0) a += 40; } // 厘が0(.340など。3割ちょうどにはしない)
  return a;
}
// 打率を計算する問題：割り切れる打数・安打数を選ぶ(打率は .100〜.399)。答えは小数第3位まで(0.340のように書く)
const BB_CALC_ABS_ = [20, 25, 40, 50, 80, 100, 125, 200, 250, 400, 500];
function bbCalcQ_() {
  const ab = BB_CALC_ABS_[rnd_(BB_CALC_ABS_.length)];
  const hs = [];
  for (let h = 1; h < ab; h++) { const a = h * 1000 / ab; if (Number.isInteger(a) && a >= 100 && a <= 399) hs.push(h); }
  const h = hs[rnd_(hs.length)];
  return { ab, h, avg: h * 1000 / ab };
}
function bbAvgReading_(a) {
  const d = [Math.floor(a / 100), Math.floor(a / 10) % 10, a % 10];
  return (d[0] ? d[0] + '割' : '') + (d[1] ? d[1] + '分' : '') + (d[2] ? d[2] + '厘' : '');
}
async function handleGachaBbQuiz(body) {
  const id = String(body.id || '').trim();
  const ans = String(body.answer || '');
  if (!id) return { ok: false, error: 'missing_id' };
  if (!ans || ans.length > 20) return { ok: false, error: 'bad_answer' };
  await ensureTables_();
  const today = dateKeyTokyo(new Date());
  const cur = (await sql().query("SELECT result FROM gacha_log WHERE student_id = $1 AND kind = 'baseball' AND day = $2", [id, today]))[0];
  if (!cur || !cur.result || !cur.result.done || !cur.result.avg) return { ok: false, error: 'not_drawn' };
  const correct = cur.result.bqAb ? (Number(cur.result.avg) / 1000).toFixed(3) : cur.result.bqRev ? String(Number(cur.result.avg) / 1000) : bbAvgReading_(Number(cur.result.avg));
  const ok = ans === correct;
  const add = ok ? 1 : 0;
  const up = await sql().query(
    `UPDATE gacha_log SET result = result || $3::jsonb, mp = mp + $4
     WHERE student_id = $1 AND kind = 'baseball' AND day = $2 AND NOT (result ? 'bq') RETURNING result, mp`,
    [id, today, JSON.stringify({ bq: { a: ans, ok } }), add]
  );
  if (!up.length) return { ok: false, error: 'already_answered', prev: (await todayResults_(id, today)).baseball };
  let newTotalPoints = null;
  if (add) {
    const st = await sql().query('UPDATE students SET points = points + $1 WHERE id = $2 RETURNING points', [add, id]);
    newTotalPoints = st.length ? Number(st[0].points) || 0 : null;
  }
  return { ok: true, result: up[0].result, mp: Number(up[0].mp) || 0, correct: ok, answer: correct, newTotalPoints };
}

// サイコロガチャのあとの確率クイズ(2026-11-09〜)。ゾロ目が出たら「ゾロ目が出る確率」、
// それ以外は「和がその数になる確率」を4択で。正解で+1MP、まちがえても減らない。1日1回(result.qaに記録)。
function gcd_(a, b) { return b ? gcd_(b, a % b) : a; }
function diceQuizAnswer_(dice) {
  const ways = dice[0] === dice[1] ? 6 : 6 - Math.abs(dice[0] + dice[1] - 7);
  const g = gcd_(ways, 36);
  return (ways / g) + '/' + (36 / g);
}
async function handleGachaDiceQuiz(body) {
  const id = String(body.id || '').trim();
  const ans = String(body.answer || '');
  if (!id) return { ok: false, error: 'missing_id' };
  if (!/^\d{1,2}\/\d{1,2}$/.test(ans)) return { ok: false, error: 'bad_answer' };
  await ensureTables_();
  const today = dateKeyTokyo(new Date());
  const cur = (await sql().query("SELECT result FROM gacha_log WHERE student_id = $1 AND kind = 'dice' AND day = $2", [id, today]))[0];
  if (!cur || !Array.isArray(cur.result.dice)) return { ok: false, error: 'not_drawn' };
  const correct = diceQuizAnswer_(cur.result.dice);
  const ok = ans === correct;
  const add = ok ? 1 : 0;
  const up = await sql().query(
    `UPDATE gacha_log SET result = result || $3::jsonb, mp = mp + $4
     WHERE student_id = $1 AND kind = 'dice' AND day = $2 AND NOT (result ? 'qa') RETURNING result, mp`,
    [id, today, JSON.stringify({ qa: { a: ans, ok } }), add]
  );
  if (!up.length) {
    const prev = (await todayResults_(id, today)).dice;
    return { ok: false, error: 'already_answered', prev };
  }
  let newTotalPoints = null;
  if (add) {
    const st = await sql().query('UPDATE students SET points = points + $1 WHERE id = $2 RETURNING points', [add, id]);
    newTotalPoints = st.length ? Number(st[0].points) || 0 : null;
  }
  return { ok: true, result: up[0].result, mp: Number(up[0].mp) || 0, correct: ok, answer: correct, newTotalPoints };
}

// PKの2回目(キーパー)。1回目のキックが済んでいて、まだ守っていないときだけ1回。
async function handleGachaPkKeep(body) {
  const id = String(body.id || '').trim();
  const keep = String(body.keep || '');
  if (!id) return { ok: false, error: 'missing_id' };
  if (id !== '00001' && !ENABLED_KINDS.includes('pk')) return { ok: false, error: 'bad_kind' };
  if (!PK_DIRS.includes(keep)) return { ok: false, error: 'bad_dir' };
  await ensureTables_();
  const today = dateKeyTokyo(new Date());
  const shot = PK_DIRS[rnd_(3)];
  // 相手のシュートも10回に1回は枠の外(wide、2026-11-08〜)。止められなくても、枠の外なら+5MP。キックのoutとは別の名前。
  const out = rnd_(10) === 0;
  const saved = !out && keep === shot;
  const add = saved || out ? PK_MP : 0;
  const up = await sql().query(
    `UPDATE gacha_log SET result = result || $4::jsonb, mp = mp + $5
     WHERE student_id = $1 AND kind = $2 AND day = $3 AND NOT (result ? 'keep') RETURNING result, mp`,
    [id, 'pk', today, JSON.stringify(out ? { keep, shot, saved, wide: true } : { keep, shot, saved }), add]
  );
  if (!up.length) {
    const prev = (await todayResults_(id, today)).pk;
    return { ok: false, error: prev ? 'already_kept' : 'not_kicked', prev };
  }
  const st = await sql().query('UPDATE students SET points = points + $1 WHERE id = $2 RETURNING points', [add, id]);
  return { ok: true, kind: 'pk', result: up[0].result, mp: Number(up[0].mp) || 0, addMp: add, newTotalPoints: st.length ? Number(st[0].points) || 0 : null };
}

module.exports = { handleGachaStatus, handleGachaDraw, handleGachaPkKeep, handleGachaDiceQuiz, handleGachaBbQuiz };
