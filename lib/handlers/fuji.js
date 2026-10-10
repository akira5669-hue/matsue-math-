const { sql } = require('../db');
const { findStudent } = require('../students');
const { monthKeyTokyo } = require('../util');
const { logShopPurchase_ } = require('./shop');

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

// お鉢巡り(2026-10-10〜10-31限定、富士登山の成功者のみ)の入山料。富士登山の
// 入山料(handleFujiEntryFee)と同じく、MPを減らす必要があるためサーバー側で
// 確定的に減算する専用エンドポイントとする(syncPointsは増加方向にしか動けない)。
const OHACHI_ENTRY_FEE_MP = 300;
async function handleOhachiEntryFee(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  if (!row.fujiSummitReached) return { ok: false, error: 'fuji_not_cleared' };
  if (row.ohachiCompleted) return { ok: false, error: 'already_completed' };
  if (row.points < OHACHI_ENTRY_FEE_MP) return { ok: false, error: 'insufficient_points' };

  const newPoints = row.points - OHACHI_ENTRY_FEE_MP;
  await sql().query('UPDATE students SET points = $1 WHERE id = $2', [newPoints, id]);
  // 挑戦回数を後から追えるよう、なんでも屋の購入履歴と同じ仕組みでログに残す
  // (2026-10-10〜。それ以前の挑戦回数は記録されていないため追跡不可)。
  await logShopPurchase_(id, row, 'お鉢巡り(参加料)', OHACHI_ENTRY_FEE_MP);
  return { ok: true, points: newPoints };
}

// お鉢巡りイージーモード(タイムアタック無し、00001専用プレビュー)：通常版を
// クリア済みでも挑戦できる(ohachiCompletedは見ない)が、イージーモード自体の
// 成功(ohachiEasyCompleted)は一度きり。
const OHACHI_EASY_ENTRY_FEE_MP = 50;
async function handleOhachiEasyEntryFee(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  if (!row.fujiSummitReached) return { ok: false, error: 'fuji_not_cleared' };
  if (row.ohachiEasyCompleted) return { ok: false, error: 'already_completed' };
  if (row.points < OHACHI_EASY_ENTRY_FEE_MP) return { ok: false, error: 'insufficient_points' };

  const newPoints = row.points - OHACHI_EASY_ENTRY_FEE_MP;
  await sql().query('UPDATE students SET points = $1 WHERE id = $2', [newPoints, id]);
  await logShopPurchase_(id, row, 'お鉢巡りイージーモード(参加料)', OHACHI_EASY_ENTRY_FEE_MP);
  return { ok: true, points: newPoints };
}

// 勇者の剣を使う(世界一周のボス戦で1回だけ使える特別攻撃)。所持数の減少は、
// 他の消費アイテムと違って端末を信頼したSET方式だと保護者用端末等の古い
// キャッシュに巻き戻される不具合があったため(2026-10-03、00220で確認)、ここで
// サーバー側が確定的に減算する(0のまま減らそうとした場合はno_swordを返す)。
async function handleUseYushaSword(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  const rows = await sql().query(
    'UPDATE students SET yusha_sword_count = yusha_sword_count - 1 WHERE id = $1 AND yusha_sword_count > 0 RETURNING yusha_sword_count',
    [id]
  );
  if (rows.length === 0) return { ok: false, error: 'no_sword' };
  return { ok: true, yushaSwordCount: rows[0].yusha_sword_count };
}

module.exports = {
  handleFujiClimbSuccess, handleFujiDistributePool, FUJI_POOL_SHARE_RATE,
  handleOhachiEntryFee, OHACHI_ENTRY_FEE_MP,
  handleOhachiEasyEntryFee, OHACHI_EASY_ENTRY_FEE_MP,
  handleUseYushaSword,
};
