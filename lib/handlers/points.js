const { sql } = require('../db');
const { findStudent } = require('../students');
const { dateKeyTokyo } = require('../util');

// 管理者(00001)がバグ等でアイテムを失った生徒に個別付与予約したものを、
// 次回アクセス時に一度だけ配布する(GAS版のtakePendingItemGrants_と同じ役割)。
async function takePendingItemGrants(id) {
  const rows = await sql().query(
    'SELECT id, item_ids FROM item_grants WHERE student_id = $1 ORDER BY id LIMIT 1',
    [id]
  );
  if (!rows.length) return [];
  const row = rows[0];
  await sql().query('DELETE FROM item_grants WHERE id = $1', [row.id]);
  return String(row.item_ids || '').split(',').map((s) => s.trim()).filter(Boolean);
}

// GAS版handleGetPoints_の移植。お詫びボーナス(APOLOGY_BONUS)は付与期間が
// 2026-08-01で終了済みのため、意図的に移植していない(常に0を返す)。
async function handleGetPoints(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };

  // ログイン状態を保ったままアプリを再開した場合、これまでlastLoginが更新されず
  // 「5日ログイン無しでMPリセット」が誤発動する不具合があったため、getPoints呼び出し
  // (=アプリを開いた)たびにも、その日のうち最初の1回だけlastLoginを更新する。
  const today = dateKeyTokyo(new Date());
  const lastLoginDay = row.lastLogin ? dateKeyTokyo(new Date(row.lastLogin)) : null;
  if (lastLoginDay !== today) {
    const now = new Date();
    await sql().query('UPDATE students SET last_login = $1 WHERE id = $2', [now.toISOString(), id]);
    row.lastLogin = now;
  }

  const pendingItems = await takePendingItemGrants(id);

  return {
    ok: true, points: row.points, level: row.level, exp: row.exp, grade: row.grade, prefectureCount: row.prefectureCount,
    avatar: row.avatar, pendingItems, apologyBonusAwarded: 0,
    items: row.items, rareCollected: row.rareCollected, rareDefeats: row.rareDefeats, thinkerMilestone: row.thinkerMilestone, hp: row.hp,
    worldLap: row.worldLap, worldLapStartLevel: row.worldLapStartLevel, worldBossDefeated: row.worldBossDefeated, worldAllies: row.worldAllies,
  };
}

module.exports = { handleGetPoints };
