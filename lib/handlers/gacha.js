const crypto = require('crypto');
const { sql } = require('../db');
const { findStudent } = require('../students');
const { dateKeyTokyo } = require('../util');
const { zukeiCorrectToday, ZUKEI_GACHA_UNLOCK_ } = require('./zukei');

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
// サッカーPKガチャ(2026-11-06〜、今は00001だけ。ENABLED_KINDSに'pk'を足すと全員)。2回勝負：
// ①キッカー：左・真ん中・右から選んでシュート。キーパーが飛んだ方向と違えばゴールで+5MP。
// ②キーパー：相手のシュートの方向を当てれば止めて+5MP。相手の動きはここ(サーバー)で決める。
const PK_DIRS = ['L', 'C', 'R'];
const PK_MP = 5;
// 野球ガチャ(2026-11-06〜、今は00001だけ。ENABLED_KINDSに'baseball'を足すと全員)。
// 2026-11-07先生の指示：9回裏・2アウト満塁・0対3。バッター大谷笑平(生徒)、ピッチャー松江太郎。
// 1球ごとに内角・真ん中・外角からコースを読んで振る。3球に1球はボール(4つで押し出し)。ストライクは投げたコースと
// 同じならバットに当たる、違えば空振り。3ストライクで三振→ゲームセット。ヒット・二塁打・三塁打はランナーが進んで点が入り、
// もう一度バッターボックスに立てる。ホームラン(または3点を超えた時点)でサヨナラ勝ち。アウト(フライ・ゴロ・ライナー)はゲームセット。
// 1日1試合。記録(gacha_log)に1球ずつ足していく。MPはその球の結果ごとに入る。
// 当たったときの結果(3600分の…)：ヒット1/4・二塁打1/20・三塁打1/40・ホームラン1/30・外野フライ1/10、
// 残りは内野フライ/ライナーが3分の1・内野ゴロが3分の2(2026-11-06先生の指示)。アウト(フライ・ゴロ・ライナー・三振)はすべて0MP(2026-11-07)。
const BB_COURSES = ['in', 'mid', 'out'];
const BB_STRIKES = 3;
const BB_BALL_IN = 3; // 3球に1球はボール(2026-11-07先生の指示で4球に1球から変更)
const BB_AWAY = 3; // 相手の点
const BB_HIT_BASES = { single: 1, double: 2, triple: 3, hr: 4 };
const BB_RESULTS = [
  { res: 'single', w: 900, mp: 5 },
  { res: 'double', w: 180, mp: 10 },
  { res: 'triple', w: 90, mp: 15 },
  { res: 'hr', w: 120, mp: 100 },
  { res: 'ofly', w: 360, mp: 0 },
  { res: 'ifly', w: 650, mp: 0 },
  { res: 'grounder', w: 1300, mp: 0 },
];
// 今引ける種類(2026-11-03〜サイコロ、11-04〜豆知識も。豆知識は条件なし)。app.jsのGACHA_ENABLED_KINDS_と揃えること。
const ENABLED_KINDS = ['dice', 'trivia'];

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
  return { ok: true, active: isActive_(id), today: await todayResults_(id, today), zukeiCorrect: await zukeiCorrectToday(id, today), diceUnlock: ZUKEI_GACHA_UNLOCK_ };
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
  let d;
  if (kind === 'pk') {
    const kick = String(body.kick || '');
    if (!PK_DIRS.includes(kick)) return { ok: false, error: 'bad_dir' };
    const dive = PK_DIRS[rnd_(3)];
    const goal = kick !== dive;
    d = { result: { kick, dive, goal }, mp: goal ? PK_MP : 0 };
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
  const st = await sql().query('UPDATE students SET points = points + $1 WHERE id = $2 RETURNING points', [d.mp, id]);
  return { ok: true, kind, result: d.result, mp: d.mp, newTotalPoints: Number(st[0].points) || 0 };
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
  const saved = keep === shot;
  const add = saved ? PK_MP : 0;
  const up = await sql().query(
    `UPDATE gacha_log SET result = result || $4::jsonb, mp = mp + $5
     WHERE student_id = $1 AND kind = $2 AND day = $3 AND NOT (result ? 'keep') RETURNING result, mp`,
    [id, 'pk', today, JSON.stringify({ keep, shot, saved }), add]
  );
  if (!up.length) {
    const prev = (await todayResults_(id, today)).pk;
    return { ok: false, error: prev ? 'already_kept' : 'not_kicked', prev };
  }
  const st = await sql().query('UPDATE students SET points = points + $1 WHERE id = $2 RETURNING points', [add, id]);
  return { ok: true, kind: 'pk', result: up[0].result, mp: Number(up[0].mp) || 0, addMp: add, newTotalPoints: st.length ? Number(st[0].points) || 0 : null };
}

module.exports = { handleGachaStatus, handleGachaDraw, handleGachaPkKeep };
