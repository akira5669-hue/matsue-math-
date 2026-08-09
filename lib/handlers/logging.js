const { sql } = require('../db');
const { findStudent } = require('../students');
const { dateKeyTokyo } = require('../util');

function nextTodayStats(row, isCorrectDelta, totalDelta) {
  const today = dateKeyTokyo(new Date());
  const stats = (row.todayStats && row.todayStats.date === today) ? row.todayStats : { date: today, correct: 0, total: 0 };
  stats.total += totalDelta;
  stats.correct += isCorrectDelta;
  return stats;
}

async function handleLog(body) {
  const id = String(body.id || '').trim();
  const category = String(body.category || '');
  const correct = !!body.correct;
  if (!id || !category) return { ok: false, error: 'missing_fields' };

  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };

  await sql().query('INSERT INTO records (ts, student_id, name, category, correct) VALUES (now(), $1, $2, $3, $4)', [id, row.name, category, correct]);

  const stats = nextTodayStats(row, correct ? 1 : 0, 1);
  const newLoggedCorrect = correct ? row.loggedCorrectCount + 1 : row.loggedCorrectCount;
  await sql().query('UPDATE students SET logged_correct_count = $1, today_stats = $2 WHERE id = $3', [newLoggedCorrect, JSON.stringify(stats), id]);

  return { ok: true };
}

async function handleLogBatch(body) {
  const id = String(body.id || '').trim();
  const entries = Array.isArray(body.entries) ? body.entries : [];
  if (!id || entries.length === 0) return { ok: false, error: 'missing_fields' };

  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };

  const today = dateKeyTokyo(new Date());
  const stats = (row.todayStats && row.todayStats.date === today) ? row.todayStats : { date: today, correct: 0, total: 0 };
  const rows = [];
  let correctCount = 0;
  for (const entry of entries) {
    const category = String((entry && entry.category) || '');
    if (!category) continue;
    const correct = !!(entry && entry.correct);
    rows.push([id, row.name, category, correct]);
    if (correct) correctCount++;
    stats.total++;
    if (correct) stats.correct++;
  }
  if (rows.length === 0) return { ok: true };

  const values = [];
  const placeholders = rows.map((r, i) => {
    const base = i * 4;
    values.push(...r);
    return `(now(), $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
  }).join(', ');
  await sql().query(`INSERT INTO records (ts, student_id, name, category, correct) VALUES ${placeholders}`, values);

  const newLoggedCorrect = row.loggedCorrectCount + correctCount;
  await sql().query('UPDATE students SET logged_correct_count = $1, today_stats = $2 WHERE id = $3', [newLoggedCorrect, JSON.stringify(stats), id]);

  return { ok: true, logged: rows.length };
}

async function handleHistory(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };

  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };

  const recordRows = await sql().query('SELECT ts, category, correct FROM records WHERE student_id = $1 ORDER BY ts DESC', [id]);

  const byCategory = {};
  const byDate = {};
  let total = 0, correct = 0;
  const recent = [];

  for (const r of recordRows) {
    const cat = r.category;
    const isCorrect = !!r.correct;
    total++;
    if (isCorrect) correct++;
    if (!byCategory[cat]) byCategory[cat] = { category: cat, total: 0, correct: 0 };
    byCategory[cat].total++;
    if (isCorrect) byCategory[cat].correct++;

    const dKey = dateKeyTokyo(new Date(r.ts));
    if (!byDate[dKey]) byDate[dKey] = { date: dKey, total: 0, correct: 0 };
    byDate[dKey].total++;
    if (isCorrect) byDate[dKey].correct++;

    if (recent.length < 30) recent.push({ timestamp: r.ts, category: cat, correct: isCorrect });
  }

  const todayKey = dateKeyTokyo(new Date());
  let streak = 0;
  const cursor = new Date();
  if (!byDate[todayKey]) cursor.setDate(cursor.getDate() - 1);
  while (byDate[dateKeyTokyo(cursor)]) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return {
    ok: true,
    name: row.name,
    total,
    correct,
    byCategory: Object.keys(byCategory).map((k) => byCategory[k]),
    byDate: Object.keys(byDate).map((k) => byDate[k]),
    streak,
    recent,
  };
}

module.exports = { handleLog, handleLogBatch, handleHistory };
