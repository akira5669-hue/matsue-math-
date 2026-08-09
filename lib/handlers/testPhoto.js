const { put, del } = require('@vercel/blob');
const { sql } = require('../db');
const { findStudent } = require('../students');
const { dateKeyTokyo, monthKeyTokyo, mondayKeyTokyo } = require('../util');
const {
  TEST_PHOTO_RETENTION_DAYS, PENA_TEST_MP_PER_SHEET, PENA_TEST_DAILY_CAP_MP,
  RANKING_TEST_TIERS, RANKING_TEST_BLOCKED_GRADES, HYAKUMASU_MP, HYAKUMASU_ALLOWED_GRADES,
  CHALLENGE_TEST_TIERS, TEST_PHOTO_TYPES, WEEKLY_LIMITED_TEST_TYPES, weeklySubmitLimitForTestType,
} = require('../testPhotoConfig');

async function sumPenaPointsToday(id, today) {
  const rows = await sql().query(
    "SELECT points_awarded, ts FROM test_photos WHERE student_id = $1 AND test_type = 'pena'",
    [id]
  );
  let sum = 0;
  for (const r of rows) {
    if (dateKeyTokyo(new Date(r.ts)) !== today) continue;
    sum += Number(r.points_awarded) || 0;
  }
  return sum;
}

async function countSubmittedTestPhotoThisWeek(id, testType, weekKey) {
  const rows = await sql().query('SELECT ts FROM test_photos WHERE student_id = $1 AND test_type = $2', [id, testType]);
  let count = 0;
  for (const r of rows) {
    if (mondayKeyTokyo(new Date(r.ts)) === weekKey) count++;
  }
  return count;
}

// 期限切れ(TEST_PHOTO_RETENTION_DAYS経過)の提出をBlob・テーブル両方から削除する。
// 定期実行の仕組みを別途用意せず、提出のたびに毎回チェックする遅延クリーンアップ方式
// (GAS版cleanupExpiredTestPhotos_と同じ方針)。
async function cleanupExpiredTestPhotos() {
  const rows = await sql().query('SELECT id, drive_file_id FROM test_photos WHERE expires_at < now()', []);
  for (const r of rows) {
    if (r.drive_file_id) {
      try { await del(r.drive_file_id); } catch (e) { /* 削除失敗は無視して続行 */ }
    }
  }
  if (rows.length) {
    const ids = rows.map((r) => r.id);
    await sql().query(`DELETE FROM test_photos WHERE id = ANY($1)`, [ids]);
  }
}

async function handleSubmitTestPhoto(body) {
  const id = String(body.id || '').trim();
  const testType = String(body.testType || '').trim();
  const scoreTier = String(body.scoreTier || '').trim();
  const imageBase64 = body.imageBase64;
  let mimeType = String(body.mimeType || 'image/jpeg').trim();
  if (!id || !imageBase64 || !TEST_PHOTO_TYPES.includes(testType)) {
    return { ok: false, error: 'missing_fields' };
  }
  if (mimeType !== 'image/jpeg' && mimeType !== 'image/png') mimeType = 'image/jpeg';

  let tier = null;
  if (testType === 'ranking') {
    tier = RANKING_TEST_TIERS.find((t) => t.id === scoreTier) || null;
  } else if (testType === 'challenge') {
    tier = CHALLENGE_TEST_TIERS.find((t) => t.id === scoreTier) || null;
    if (!tier) return { ok: false, error: 'missing_fields' };
  }

  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  if (testType === 'ranking' && RANKING_TEST_BLOCKED_GRADES.includes(row.grade)) {
    return { ok: false, error: 'elementary_not_allowed' };
  }
  if (testType === 'hyakuMasu' && !HYAKUMASU_ALLOWED_GRADES.includes(row.grade)) {
    return { ok: false, error: 'grade_not_allowed' };
  }
  const currentMonth = monthKeyTokyo(new Date());
  if (testType === 'ranking' && row.lastRankingTestMonth === currentMonth) {
    return { ok: false, error: 'already_submitted_this_month' };
  }
  const currentWeek = mondayKeyTokyo(new Date());
  if (WEEKLY_LIMITED_TEST_TYPES.includes(testType)) {
    const weeklyLimit = weeklySubmitLimitForTestType(testType, row.grade);
    if (await countSubmittedTestPhotoThisWeek(id, testType, currentWeek) >= weeklyLimit) {
      return { ok: false, error: 'already_submitted_this_week' };
    }
  }

  const bytes = Buffer.from(imageBase64, 'base64');
  const ext = mimeType === 'image/png' ? '.png' : '.jpg';
  const pathname = `test-photos/${id}_${Date.now()}${ext}`;
  const blob = await put(pathname, bytes, { access: 'private', contentType: mimeType, addRandomSuffix: true });

  let pointsAwarded = 0;
  let tierUsed = '';
  const sets = [];
  const values = [];
  function set(col, val) { values.push(val); sets.push(`${col} = $${values.length}`); }

  if (testType === 'ranking') {
    if (tier) { pointsAwarded = tier.mp; tierUsed = tier.id; }
    set('last_ranking_test_month', currentMonth);
  } else if (testType === 'challenge') {
    pointsAwarded = tier.mp;
    tierUsed = tier.id;
    set('challenge_correct_total', (row.challengeCorrectTotal || 0) + tier.count);
  } else if (testType === 'hyakuMasu') {
    pointsAwarded = HYAKUMASU_MP;
  } else {
    const today = dateKeyTokyo(new Date());
    const todayTotal = await sumPenaPointsToday(id, today);
    pointsAwarded = Math.max(0, Math.min(PENA_TEST_MP_PER_SHEET, PENA_TEST_DAILY_CAP_MP - todayTotal));
  }

  const newTotalPoints = row.points + pointsAwarded;
  if (pointsAwarded > 0) set('points', newTotalPoints);

  if (sets.length) {
    values.push(id);
    await sql().query(`UPDATE students SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
  }

  const expiresAt = new Date(Date.now() + TEST_PHOTO_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await sql().query(
    'INSERT INTO test_photos (ts, student_id, name, test_type, score_tier, points_awarded, drive_file_id, expires_at) VALUES (now(), $1, $2, $3, $4, $5, $6, $7)',
    [id, row.name, testType, tierUsed, pointsAwarded, blob.url, expiresAt.toISOString()]
  );

  const result = { ok: true, pointsAwarded, newTotalPoints };
  cleanupExpiredTestPhotos().catch((e) => console.error('cleanup failed', e)); // 応答は待たない
  return result;
}

module.exports = { handleSubmitTestPhoto };
