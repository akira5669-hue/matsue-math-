const { sql } = require('../db');
const { findStudent } = require('../students');
const { sha256Hex } = require('../util');
const { getLoginAttempts, recordFailedAttempt, clearLoginAttempts, LOGIN_LOCK_SECONDS } = require('./auth');

async function handleRegisterGuardian(body) {
  const guardianName = String(body.guardianName || '').trim();
  const children = Array.isArray(body.children) ? body.children : [];
  if (!guardianName || children.length === 0 || children.length > 4) {
    return { ok: false, error: 'missing_fields' };
  }

  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    const childId = String((c && c.id) || '').trim();
    const childPassword = String((c && c.password) || '');
    if (!childId || !childPassword) return { ok: false, error: 'missing_fields', index: i };

    const { lockedUntil } = await getLoginAttempts(childId);
    if (lockedUntil && lockedUntil.getTime() > Date.now()) {
      return { ok: false, error: 'child_locked', index: i, retryAfterMinutes: Math.ceil(LOGIN_LOCK_SECONDS / 60) };
    }

    const row = await findStudent(childId);
    if (!row || !row.passwordHash) return { ok: false, error: 'child_mismatch', index: i };
    const hash = sha256Hex(childPassword + row.salt);
    if (hash !== row.passwordHash) {
      await recordFailedAttempt(childId);
      return { ok: false, error: 'child_mismatch', index: i };
    }
  }
  for (const c of children) await clearLoginAttempts(String(c.id).trim());

  const values = [guardianName];
  for (let j = 0; j < 4; j++) {
    if (j < children.length) {
      values.push(String(children[j].id).trim(), String(children[j].name || '').trim());
    } else {
      values.push(null, null);
    }
  }
  await sql().query(
    `INSERT INTO guardians (ts, guardian_name, child_id_1, child_name_1, child_id_2, child_name_2, child_id_3, child_name_3, child_id_4, child_name_4)
     VALUES (now(), $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    values
  );

  return { ok: true };
}

module.exports = { handleRegisterGuardian };
