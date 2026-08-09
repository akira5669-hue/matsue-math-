const { sql } = require('../db');
const { findStudent } = require('../students');
const { sha256Hex } = require('../util');
const { getLoginAttempts, recordFailedAttempt, clearLoginAttempts, LOGIN_LOCK_SECONDS } = require('./auth');

// 退会処理。IDとパスワードで再認証したうえで、students行をwithdrawn_studentsへ
// バックアップしてから削除する(誤操作・不正からの安全弁)。records/test_photos/
// weekly_quiz_answers/item_grantsは、students.idへのFK(ON DELETE CASCADE)により
// 自動的に削除される(GAS版では手動でdeleteRowsByIdColumn_していた部分)。
// gift_requests/gift_codes/guardiansは会計・登録記録として退会後も残す。
async function handleWithdraw(body) {
  const id = String(body.id || '').trim();
  const password = String(body.password || '');
  if (!id || !password) return { ok: false, error: 'missing_fields' };

  const { lockedUntil } = await getLoginAttempts(id);
  if (lockedUntil && lockedUntil.getTime() > Date.now()) {
    return { ok: false, error: 'locked', retryAfterMinutes: Math.ceil((lockedUntil.getTime() - Date.now()) / 60000) };
  }

  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  if (!row.passwordHash) return { ok: false, error: 'no_password' };

  const hash = sha256Hex(password + row.salt);
  if (hash !== row.passwordHash) {
    const result = await recordFailedAttempt(id);
    if (result.lockedUntil) return { ok: false, error: 'locked', retryAfterMinutes: Math.ceil(LOGIN_LOCK_SECONDS / 60) };
    return { ok: false, error: 'wrong_password', attemptsRemaining: 5 - result.attempts };
  }
  await clearLoginAttempts(id);

  const rawRows = await sql().query('SELECT * FROM students WHERE id = $1', [id]);
  if (!rawRows.length) return { ok: false, error: 'not_found' };
  const raw = rawRows[0];

  await sql().query(
    'INSERT INTO withdrawn_students (withdrawn_at, student_id, name, grade, points, level, raw_data) VALUES (now(), $1, $2, $3, $4, $5, $6)',
    [id, raw.name, raw.grade, raw.points, raw.level, JSON.stringify(raw)]
  );
  await sql().query('DELETE FROM students WHERE id = $1', [id]); // CASCADEでrecords等も削除される

  return { ok: true };
}

module.exports = { handleWithdraw };
