const { sql } = require('./db');
const { parseJsonCell } = require('./util');

// PostgresのJSONB列は既にオブジェクト/配列としてそのまま返ってくるので、
// GAS版のparseJsonCell_ほど頑張ってパースする必要はないが、念のため通しておく。
function toStudentObject(row) {
  return {
    id: row.id,
    name: row.name,
    passwordHash: row.password_hash,
    salt: row.salt,
    createdAt: row.created_at,
    grade: row.grade || '',
    points: Number(row.points) || 0,
    guardian: row.guardian || '',
    level: Number(row.level) || 1,
    exp: Number(row.exp) || 0,
    lastLogin: row.last_login,
    prefectureCount: Number(row.prefecture_count) || 0,
    avatar: parseJsonCell(row.avatar, null),
    apologyBonusGrantedAt: row.apology_bonus_granted_at,
    items: parseJsonCell(row.items, []),
    rareCollected: parseJsonCell(row.rare_collected, []),
    rareDefeats: parseJsonCell(row.rare_defeats, {}),
    thinkerMilestone: row.thinker_milestone,
    loggedCorrectCount: Number(row.logged_correct_count) || 0,
    todayStats: parseJsonCell(row.today_stats, null),
    hp: Number(row.hp) || 0,
    lastRankingTestMonth: row.last_ranking_test_month,
    worldLap: Number(row.world_lap) || 1,
    worldLapStartLevel: Number(row.world_lap_start_level) || 100,
    worldBossDefeated: parseJsonCell(row.world_boss_defeated, {}),
    worldAllies: parseJsonCell(row.world_allies, []),
    challengeCorrectTotal: Number(row.challenge_correct_total) || 0,
    pendingNotice: row.pending_notice || '',
    speedSeedCount: Number(row.speed_seed_count) || 0,
    ironWallCharges: Number(row.iron_wall_charges) || 0,
  };
}

async function findStudent(id) {
  const trimmed = String(id || '').trim();
  if (!trimmed) return null;
  const rows = await sql().query('SELECT * FROM students WHERE id = $1', [trimmed]);
  if (!rows.length) return null;
  return toStudentObject(rows[0]);
}

module.exports = { toStudentObject, findStudent };
