const crypto = require('crypto');
const { sql } = require('../db');
const { findStudent } = require('../students');
const { dateKeyTokyo } = require('../util');
const { zukeiAnsweredToday, ZUKEI_GACHA_UNLOCK_ } = require('./zukei');

// ガチャ(サイコロガチャ・大吉占いガチャ・豆知識ガチャ・ミッションガチャ)。
// どれも1日1回ずつ無料で引ける。ただしサイコロガチャは、その日に超絶！図形！トレーニング！！で
// ZUKEI_GACHA_UNLOCK_問以上解いたときだけ引ける(2026-11-02〜)。結果(出目・運勢など)はここで決めて、MPもここで付ける
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
const KINDS = ['dice', 'omikuji', 'trivia', 'mission'];

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
  return { ok: true, active: isActive_(id), today: await todayResults_(id, today), zukeiAnswered: await zukeiAnsweredToday(id, today), diceUnlock: ZUKEI_GACHA_UNLOCK_ };
}

async function handleGachaDraw(body) {
  const id = String(body.id || '').trim();
  const kind = String(body.kind || '');
  if (!id) return { ok: false, error: 'missing_id' };
  if (!KINDS.includes(kind)) return { ok: false, error: 'bad_kind' };
  if (!isActive_(id)) return { ok: false, error: 'not_active' };
  await ensureTables_();
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  const today = dateKeyTokyo(new Date());
  if (kind === 'dice') {
    const n = await zukeiAnsweredToday(id, today);
    if (n < ZUKEI_GACHA_UNLOCK_) return { ok: false, error: 'dice_locked', zukeiAnswered: n, diceUnlock: ZUKEI_GACHA_UNLOCK_ };
  }
  const d = draw_(kind);
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

module.exports = { handleGachaStatus, handleGachaDraw };
