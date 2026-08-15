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

// 超絶薬草：爆裂薬草のさらに上位版。3000MPでHPを1500増やせる。
const CHOUHERB_COST_MP = 3000;
const CHOUHERB_HP_GAIN = 1500;

async function handleBuyChouHerb(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  if (row.points < CHOUHERB_COST_MP) return { ok: false, error: 'insufficient_points' };

  const remainingPoints = row.points - CHOUHERB_COST_MP;
  const newHp = (Number(row.hp) || 0) + CHOUHERB_HP_GAIN;
  await sql().query('UPDATE students SET points = $1, hp = $2 WHERE id = $3', [remainingPoints, newHp, id]);
  return { ok: true, remainingPoints, hp: newHp };
}

// すばやさの種：100MPで買える消費アイテム。逃げるタイプのレアキャラに
// 間違えて逃げられそうになったとき、所持していれば自動で1個消費されて
// 逃走を防ぐ(クライアント側のバトル処理で判定・消費し、syncPointsで
// 個数をサーバーに反映する。hpと同じ「クライアントを信頼して直接SET」方式)。
const SPEEDSEED_COST_MP = 100;

async function handleBuySpeedSeed(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  if (row.points < SPEEDSEED_COST_MP) return { ok: false, error: 'insufficient_points' };

  const remainingPoints = row.points - SPEEDSEED_COST_MP;
  const newCount = (Number(row.speedSeedCount) || 0) + 1;
  await sql().query('UPDATE students SET points = $1, speed_seed_count = $2 WHERE id = $3', [remainingPoints, newCount, id]);
  return { ok: true, remainingPoints, speedSeedCount: newCount };
}

module.exports = {
  handleAkrPrayer, AKR_PRAYER_COST_MP,
  handleBuyHerb, HERB_COST_MP, HERB_HP_GAIN,
  handleBuyBakuHerb, BAKUHERB_COST_MP, BAKUHERB_HP_GAIN,
  handleBuyChouHerb, CHOUHERB_COST_MP, CHOUHERB_HP_GAIN,
  handleBuySpeedSeed, SPEEDSEED_COST_MP,
};
