const { sql } = require('../db');
const { findStudent } = require('../students');

// ボン・ミスコの呪いを解くための「AKRの祈り」。呪い状態自体はバトル演出用の
// フラグでクライアント側(localStorage)だけが持っており、サーバー側では
// MPの消費だけを検証・実行する(MP交換=redeemGiftと同じ、サーバー確定方式)。
const AKR_PRAYER_COST_MP = 100;

async function handleAkrPrayer(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  if (row.points < AKR_PRAYER_COST_MP) return { ok: false, error: 'insufficient_points' };

  const remaining = row.points - AKR_PRAYER_COST_MP;
  await sql().query('UPDATE students SET points = $1 WHERE id = $2', [remaining, id]);
  return { ok: true, remainingPoints: remaining };
}

module.exports = { handleAkrPrayer, AKR_PRAYER_COST_MP };
