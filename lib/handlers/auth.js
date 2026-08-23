const crypto = require('crypto');
const { sql } = require('../db');
const { findStudent } = require('../students');
const { sha256Hex, dateKeyTokyo } = require('../util');

const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCK_SECONDS = 15 * 60;

async function getLoginAttempts(id) {
  const rows = await sql().query('SELECT attempts, locked_until FROM login_attempts WHERE student_id = $1', [id]);
  if (!rows.length) return { attempts: 0, lockedUntil: null };
  return { attempts: rows[0].attempts, lockedUntil: rows[0].locked_until ? new Date(rows[0].locked_until) : null };
}
async function recordFailedAttempt(id) {
  const { attempts } = await getLoginAttempts(id);
  const next = attempts + 1;
  const lockedUntil = next >= LOGIN_MAX_ATTEMPTS ? new Date(Date.now() + LOGIN_LOCK_SECONDS * 1000) : null;
  await sql().query(
    `INSERT INTO login_attempts (student_id, attempts, locked_until, updated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (student_id) DO UPDATE SET attempts = $2, locked_until = $3, updated_at = now()`,
    [id, next, lockedUntil]
  );
  return { attempts: next, lockedUntil };
}
async function clearLoginAttempts(id) {
  await sql().query('DELETE FROM login_attempts WHERE student_id = $1', [id]);
}

// GAS版handleLogin_の移植。ID_REASSIGN_NOTICES_(2026-07-28/29の重複ID事故の
// 一時的な案内)は、本番切替時点では対象者が全員新IDへ移行済みの想定のため移植しない。
async function handleLogin(body) {
  const id = String(body.id || '').trim();
  const password = String(body.password || '');
  if (!id || !password) return { ok: false, error: 'missing_fields' };

  const { attempts, lockedUntil } = await getLoginAttempts(id);
  if (lockedUntil && lockedUntil.getTime() > Date.now()) {
    return { ok: false, error: 'locked', retryAfterMinutes: Math.ceil((lockedUntil.getTime() - Date.now()) / 60000) };
  }

  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  if (!row.passwordHash) return { ok: false, error: 'no_password' };

  const hash = sha256Hex(password + row.salt);
  if (hash !== row.passwordHash) {
    const result = await recordFailedAttempt(id);
    if (result.lockedUntil) {
      return { ok: false, error: 'locked', retryAfterMinutes: Math.ceil(LOGIN_LOCK_SECONDS / 60) };
    }
    return { ok: false, error: 'wrong_password', attemptsRemaining: LOGIN_MAX_ATTEMPTS - result.attempts };
  }
  await clearLoginAttempts(id);

  const now = new Date();
  let points = row.points;
  let pointsReset = false;
  if (row.lastLogin) {
    const daysSince = Math.floor((now.getTime() - new Date(row.lastLogin).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince >= 5 && points > 0) {
      points = 0;
      pointsReset = true;
    }
  }
  await sql().query('UPDATE students SET last_login = $1, points = $2 WHERE id = $3', [now.toISOString(), points, id]);

  return {
    ok: true, name: row.name, points, pointsReset, level: row.level, exp: row.exp, scienceExp: row.scienceExp, grade: row.grade,
    prefectureCount: row.prefectureCount, avatar: row.avatar, pendingItems: [], apologyBonusAwarded: 0,
    items: row.items, rareCollected: row.rareCollected, rareDefeats: row.rareDefeats, thinkerMilestone: row.thinkerMilestone, hp: row.hp,
    worldLap: row.worldLap, worldLapStartLevel: row.worldLapStartLevel, worldBossDefeated: row.worldBossDefeated, worldAllies: row.worldAllies,
    worldCountry: row.worldCountry, treasureItems: row.treasureItems,
  };
}

// 欠番の最小値から採番する(GAS版nextStudentId_と同じ方針)。挿入時にPRIMARY KEY
// 違反(23505)が起きたら、それ自体が「他のリクエストと衝突した」証拠なので、
// 採番からやり直す。これによりGAS版で実際に起きたキャッシュ遅延による重複ID事故が
// 構造的に起こり得なくなる(DBの一意制約が最終防衛線になる)。
async function nextStudentId() {
  const rows = await sql().query("SELECT id FROM students WHERE id ~ '^[0-9]{5}$'", []);
  const used = new Set(rows.map((r) => parseInt(r.id, 10)));
  let max = 0;
  used.forEach((n) => { if (n > max) max = n; });
  for (let i = 1; i <= max; i++) {
    if (!used.has(i)) return String(i).padStart(5, '0');
  }
  return String(max + 1).padStart(5, '0');
}

async function handleRegister(body) {
  const name = String(body.name || '').trim();
  const grade = String(body.grade || '').trim();
  const guardian = String(body.guardian || '').trim();
  const password = String(body.password || '');
  if (!name || !password) return { ok: false, error: 'missing_fields' };
  if (!/^[A-Za-z0-9]{4}$/.test(password)) return { ok: false, error: 'invalid_password' };

  const salt = crypto.randomUUID();
  const hash = sha256Hex(password + salt);
  const now = new Date().toISOString();

  for (let attempt = 0; attempt < 5; attempt++) {
    const id = await nextStudentId();
    try {
      await sql().query(
        `INSERT INTO students (id, name, password_hash, salt, created_at, grade, points, guardian, level, exp, last_login)
         VALUES ($1, $2, $3, $4, $5, $6, 0, $7, 1, 0, $5)`,
        [id, name, hash, salt, now, grade, guardian]
      );
      return { ok: true, id, name };
    } catch (e) {
      if (e && e.code === '23505') continue; // 他のリクエストと同じIDになった場合は採番し直す
      throw e;
    }
  }
  return { ok: false, error: 'internal_error' };
}

async function handleResetPassword(body) {
  const id = String(body.id || '').trim();
  const password = String(body.password || '');
  if (!id || !password) return { ok: false, error: 'missing_fields' };
  if (!/^[A-Za-z0-9]{4}$/.test(password)) return { ok: false, error: 'invalid_password' };

  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  if (row.passwordHash) return { ok: false, error: 'password_already_set' };

  const salt = crypto.randomUUID();
  const hash = sha256Hex(password + salt);
  await sql().query('UPDATE students SET password_hash = $1, salt = $2 WHERE id = $3', [hash, salt, id]);
  await clearLoginAttempts(id);
  return { ok: true, name: row.name };
}

async function handleCheckId(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  const row = await findStudent(id);
  if (!row) return { ok: true, found: false };
  return { ok: true, found: true, hasPassword: !!row.passwordHash, name: row.name };
}

module.exports = {
  handleLogin, handleRegister, handleResetPassword, handleCheckId,
  getLoginAttempts, recordFailedAttempt, clearLoginAttempts,
  LOGIN_MAX_ATTEMPTS, LOGIN_LOCK_SECONDS,
};
