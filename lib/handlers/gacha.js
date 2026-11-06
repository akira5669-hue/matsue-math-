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
// 9回裏・ノーアウト満塁・3ボール2ストライクの1球勝負。生徒はバッターで、内角・真ん中・外角から
// コースを読んで振る。投げたコースと同じならバットに当たる(3分の1)、違えば三振(0MP)。
// 当たったときの結果(3600分の…)：ヒット1/4・二塁打1/20・三塁打1/40・ホームラン1/30・外野フライ1/10、
// 残りは内野フライ/ライナー(0MP)が3分の1・内野ゴロ(5MP)が3分の2(2026-11-06先生の指示)。
const BB_COURSES = ['in', 'mid', 'out'];
const BB_RESULTS = [
  { res: 'single', w: 900, mp: 5 },
  { res: 'double', w: 180, mp: 10 },
  { res: 'triple', w: 90, mp: 15 },
  { res: 'hr', w: 120, mp: 100 },
  { res: 'ofly', w: 360, mp: 5 },
  { res: 'ifly', w: 650, mp: 0 },
  { res: 'grounder', w: 1300, mp: 5 },
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
    const pitch = BB_COURSES[rnd_(3)];
    const contact = swing === pitch;
    let res = 'k', mp = 0;
    if (contact) {
      let r = rnd_(3600);
      const o = BB_RESULTS.find((x) => (r -= x.w) < 0) || BB_RESULTS[BB_RESULTS.length - 1];
      res = o.res; mp = o.mp;
    }
    // 内野フライとライナーは同じ扱い(0MP)。見た目だけ半分ずつにする。
    if (res === 'ifly' && rnd_(2) === 0) res = 'iliner';
    d = { result: { swing, pitch, contact, res }, mp };
  } else d = draw_(kind);
  // 先生(00001)はPK・野球を何度でも試せる(2026-11-06)。遊び終わった今日の記録を消してから引き直す
  // (PKはキーパーまで終わっているときだけ消す。キックだけならキーパーの続きをする)。
  if (id === '00001' && (kind === 'baseball' || kind === 'pk')) {
    await sql().query("DELETE FROM gacha_log WHERE student_id = $1 AND kind = $2 AND day = $3 AND ($2 = 'baseball' OR result ? 'keep')", [id, kind, today]);
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
