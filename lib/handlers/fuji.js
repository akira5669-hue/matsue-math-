const { sql } = require('../db');
const { findStudent } = require('../students');
const { monthKeyTokyo } = require('../util');

// 富士登山共済プール：毎月、入山料(fuji.jsではなくshop.jsのhandleFujiEntryFee)・
// 救助ペナルティ(同handleFujiRescuePenalty)としてfuji_climb_logに積み上がった
// MPの8割を、その月に山頂へ到達した生徒たちで均等に山分けする。自動実行の
// 仕組み(cron)がまだ無いため、月末に00001が手動でhandleFujiDistributePoolを
// 呼び出して精算する運用とする。
const FUJI_POOL_SHARE_RATE = 0.8;

// 登頂成功をログに残す(山分けの受取対象を集計するため)。山頂到達は生涯1回きりの
// 実績なので、既にログ済みなら何もしない(二重計上防止)。
async function handleFujiClimbSuccess(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };

  const existing = await sql().query(
    "SELECT id FROM fuji_climb_log WHERE student_id = $1 AND event_type = 'success' LIMIT 1",
    [id]
  );
  if (existing.length > 0) return { ok: true, alreadyLogged: true };

  await sql().query(
    'INSERT INTO fuji_climb_log (ts, student_id, name, grade, month_key, event_type, amount) VALUES (now(), $1, $2, $3, $4, $5, $6)',
    [id, row.name, row.grade, monthKeyTokyo(new Date()), 'success', 0]
  );
  return { ok: true };
}

// 指定した月(省略時は今月)のプールを精算し、その月の登頂成功者に均等に山分けする。
// 00001限定。同じ月は二重精算できないよう、実行済みならfuji_pool_distributionsで弾く。
async function handleFujiDistributePool(body) {
  const adminId = String(body.id || '').trim();
  if (adminId !== '00001') return { ok: false, error: 'forbidden' };

  let monthKey = String(body.monthKey || '').trim();
  if (!/^\d{4}-\d{2}$/.test(monthKey)) monthKey = monthKeyTokyo(new Date());

  const already = await sql().query('SELECT month_key FROM fuji_pool_distributions WHERE month_key = $1', [monthKey]);
  if (already.length > 0) return { ok: false, error: 'already_distributed' };

  const poolRows = await sql().query(
    "SELECT COALESCE(SUM(amount), 0)::int AS total FROM fuji_climb_log WHERE month_key = $1 AND event_type IN ('entry_fee', 'rescue_penalty')",
    [monthKey]
  );
  const poolTotal = Number(poolRows[0].total) || 0;

  const successRows = await sql().query(
    "SELECT DISTINCT student_id FROM fuji_climb_log WHERE month_key = $1 AND event_type = 'success'",
    [monthKey]
  );
  const recipientIds = successRows.map((r) => r.student_id);
  if (recipientIds.length === 0) {
    return { ok: false, error: 'no_successful_climbers', poolTotal };
  }

  const distributable = Math.floor(poolTotal * FUJI_POOL_SHARE_RATE);
  const perPerson = Math.floor(distributable / recipientIds.length);
  if (perPerson > 0) {
    await sql().query('UPDATE students SET points = points + $1 WHERE id = ANY($2)', [perPerson, recipientIds]);
  }
  await sql().query(
    'INSERT INTO fuji_pool_distributions (month_key, distributed_at, pool_total, recipient_count, per_person) VALUES ($1, now(), $2, $3, $4)',
    [monthKey, poolTotal, recipientIds.length, perPerson]
  );
  return { ok: true, monthKey, poolTotal, distributable, recipientCount: recipientIds.length, perPerson };
}

module.exports = { handleFujiClimbSuccess, handleFujiDistributePool, FUJI_POOL_SHARE_RATE };
