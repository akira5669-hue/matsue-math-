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

// 薬草：300MPでHPを100増やせる、なんでも屋の常設アイテム。
const HERB_COST_MP = 300;
const HERB_HP_GAIN = 100;

async function handleBuyHerb(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  if (row.points < HERB_COST_MP) return { ok: false, error: 'insufficient_points' };

  const remainingPoints = row.points - HERB_COST_MP;
  const newHp = (Number(row.hp) || 0) + HERB_HP_GAIN;
  await sql().query('UPDATE students SET points = $1, hp = $2 WHERE id = $3', [remainingPoints, newHp, id]);
  return { ok: true, remainingPoints, hp: newHp };
}

// 爆裂薬草：薬草の上位版。1000MPでHPを400増やせる。
const BAKUHERB_COST_MP = 1000;
const BAKUHERB_HP_GAIN = 400;

async function handleBuyBakuHerb(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  if (row.points < BAKUHERB_COST_MP) return { ok: false, error: 'insufficient_points' };

  const remainingPoints = row.points - BAKUHERB_COST_MP;
  const newHp = (Number(row.hp) || 0) + BAKUHERB_HP_GAIN;
  await sql().query('UPDATE students SET points = $1, hp = $2 WHERE id = $3', [remainingPoints, newHp, id]);
  return { ok: true, remainingPoints, hp: newHp };
}

module.exports = {
  handleAkrPrayer, AKR_PRAYER_COST_MP,
  handleBuyHerb, HERB_COST_MP, HERB_HP_GAIN,
  handleBuyBakuHerb, BAKUHERB_COST_MP, BAKUHERB_HP_GAIN,
};
