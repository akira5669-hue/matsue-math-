const { sql } = require('../db');
const { findStudent } = require('../students');
const { dateKeyTokyo } = require('../util');

// 超絶！図形！トレーニング！！(新！図形問題！キャンペーン！ 2026-11-03〜)。
// 問題(積み木の数・見え方・展開図・回転/裏返し)は端末で作って答え合わせする。
// MPはここで付ける：1問正解で+1MP、1日ZUKEI_DAILY_MP_CAPまで。ふだんの1日100MPの上限とは別枠。
// まちがえても何も減らない(端末は正解したときだけ呼ぶ)。
// 今は00001だけ(ZUKEI_OPEN_ALLをtrueにすると、ZUKEI_START以降は全員)。app.js側と揃えること。
const ZUKEI_DAILY_MP_CAP = 20;
const ZUKEI_START = '2026-11-03';
const ZUKEI_OPEN_ALL = false;

function isActive_(id, today) {
  return id === '00001' || (ZUKEI_OPEN_ALL && today >= ZUKEI_START);
}

let tablesReady = null;
function ensureTables_() {
  if (!tablesReady) {
    tablesReady = sql().query(`CREATE TABLE IF NOT EXISTS zukei_progress (
      student_id TEXT PRIMARY KEY, mp_date TEXT NOT NULL DEFAULT '', mp_today INTEGER NOT NULL DEFAULT 0,
      total_correct INTEGER NOT NULL DEFAULT 0)`, [])
      .catch((e) => { tablesReady = null; throw e; });
  }
  return tablesReady;
}

async function todayMp_(id, today) {
  const rows = await sql().query('SELECT mp_date, mp_today FROM zukei_progress WHERE student_id = $1', [id]);
  return rows.length && rows[0].mp_date === today ? Number(rows[0].mp_today) || 0 : 0;
}

async function handleZukeiStatus(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  await ensureTables_();
  const today = dateKeyTokyo(new Date());
  return { ok: true, active: isActive_(id, today), todayMp: await todayMp_(id, today), dailyMpCap: ZUKEI_DAILY_MP_CAP };
}

async function handleZukeiReward(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  await ensureTables_();
  const today = dateKeyTokyo(new Date());
  if (!isActive_(id, today)) return { ok: false, error: 'not_active' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  await sql().query('INSERT INTO zukei_progress (student_id) VALUES ($1) ON CONFLICT DO NOTHING', [id]);
  // 同時に呼ばれても上限を超えないよう、上限未満のときだけ1つ増やす。
  const up = await sql().query(
    `UPDATE zukei_progress SET mp_today = CASE WHEN mp_date = $2 THEN mp_today ELSE 0 END + 1, mp_date = $2, total_correct = total_correct + 1
     WHERE student_id = $1 AND (mp_date <> $2 OR mp_today < $3) RETURNING mp_today`,
    [id, today, ZUKEI_DAILY_MP_CAP]
  );
  if (!up.length) {
    await sql().query('UPDATE zukei_progress SET total_correct = total_correct + 1 WHERE student_id = $1', [id]);
    return { ok: true, granted: 0, todayMp: ZUKEI_DAILY_MP_CAP, dailyMpCap: ZUKEI_DAILY_MP_CAP };
  }
  const st = await sql().query('UPDATE students SET points = points + 1 WHERE id = $1 RETURNING points', [id]);
  return { ok: true, granted: 1, todayMp: Number(up[0].mp_today) || 0, dailyMpCap: ZUKEI_DAILY_MP_CAP, newTotalPoints: Number(st[0].points) || 0 };
}

module.exports = { handleZukeiStatus, handleZukeiReward, ZUKEI_DAILY_MP_CAP };
