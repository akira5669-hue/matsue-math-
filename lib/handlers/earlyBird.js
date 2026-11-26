const { sql } = require('../db');
const { findStudent } = require('../students');
const { dateKeyTokyo } = require('../util');

// 🌅 早起きボーナス(2026-11-26 先生の指示)
// 2026-12-25〜2027-01-07 の毎日、午前6:00〜8:00(日本時間)にアプリを開いた(ログインした)人に +20MP。1日1回。
// 1日のMP上限(100MP)とは別。時間はサーバーの時計で判定する(端末の時計を変えてもダメ)。
const EB_START_ = '2026-12-25';
const EB_END_ = '2027-01-07';
const EB_OPEN_MIN_ = 6 * 60;   // 6:00
const EB_CLOSE_MIN_ = 8 * 60;  // 8:00(8:00ちょうどはおしまい)
const EB_MP_ = 20;

let ready = null;
function ensureTable_() {
  if (!ready) {
    ready = sql().query(`CREATE TABLE IF NOT EXISTS early_bird_bonus (
        day TEXT NOT NULL, student_id TEXT NOT NULL, mp INTEGER NOT NULL, ts TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (day, student_id))`, []).catch((e) => { ready = null; throw e; });
  }
  return ready;
}
function tokyoMinutes_() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

async function handleEarlyBirdBonus(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  const today = dateKeyTokyo(new Date());
  if (today < EB_START_ || today > EB_END_) return { ok: true, added: 0, reason: 'not_period' };
  const m = tokyoMinutes_();
  if (m < EB_OPEN_MIN_ || m >= EB_CLOSE_MIN_) return { ok: true, added: 0, reason: 'not_time' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  await ensureTable_();
  const ins = await sql().query('INSERT INTO early_bird_bonus (day, student_id, mp) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING mp', [today, id, EB_MP_]);
  if (!ins.length) return { ok: true, added: 0, reason: 'already' };
  const up = await sql().query('UPDATE students SET points = points + $2 WHERE id = $1 RETURNING points', [id, EB_MP_]);
  return { ok: true, added: EB_MP_, points: up.length ? Number(up[0].points) : null, day: today };
}

module.exports = { handleEarlyBirdBonus, EB_START_, EB_END_ };
