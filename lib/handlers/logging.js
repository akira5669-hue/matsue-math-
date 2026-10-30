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

// 連続学習日数ボーナス(2026-10-31〜)：問題を解いた日が7日/15日/30日続いた日に、
// 1日の上限とは別にMPを直接足す。その日の最初の記録の時に1回だけ判定する
// (streak_bonus_dateで「今日はもう判定済み」を取り合うので二重にもらえない)。
// 連続が途切れたら、また7日目からもらえる。
const STREAK_BONUS_MP = { 7: 50, 15: 150, 30: 300 };
async function checkStreakBonus_(id) {
  const today = dateKeyTokyo(new Date());
  const claimed = await sql().query(
    'UPDATE students SET streak_bonus_date = $1 WHERE id = $2 AND streak_bonus_date IS DISTINCT FROM $1 RETURNING id',
    [today, id]
  );
  if (!claimed.length) return null;
  const rows = await sql().query(
    "SELECT DISTINCT (ts AT TIME ZONE 'Asia/Tokyo')::date::text AS d FROM records WHERE student_id = $1 AND ts > now() - interval '32 days'",
    [id]
  );
  const days = new Set(rows.map((r) => r.d));
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  let streak = 0;
  let cursor = new Date();
  while (days.has(dateKeyTokyo(cursor))) {
    streak++;
    cursor = new Date(cursor.getTime() - ONE_DAY_MS);
  }
  const mp = STREAK_BONUS_MP[streak];
  if (!mp) return null;
  const upd = await sql().query('UPDATE students SET points = points + $1 WHERE id = $2 RETURNING points', [mp, id]);
  return { days: streak, mp, newTotalPoints: Number(upd[0].points) || 0 };
}

async function handleLog(body) {
  const id = String(body.id || '').trim();
  const category = String(body.category || '');
  const correct = !!body.correct;
  if (!id || !category) return { ok: false, error: 'missing_fields' };

  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  if (row.forceBlocked) return { ok: false, error: 'force_blocked' };

  await sql().query('INSERT INTO records (ts, student_id, name, category, correct) VALUES (now(), $1, $2, $3, $4)', [id, row.name, category, correct]);

  const stats = nextTodayStats(row, correct ? 1 : 0, 1);
  const newLoggedCorrect = correct ? row.loggedCorrectCount + 1 : row.loggedCorrectCount;
  // 問題を解いている間はlast_loginも更新する(syncPointsと同じ理由。追加クエリなし)。
  await sql().query('UPDATE students SET logged_correct_count = $1, today_stats = $2, last_login = $3 WHERE id = $4', [newLoggedCorrect, JSON.stringify(stats), new Date().toISOString(), id]);

  let streakBonus = null;
  try { streakBonus = await checkStreakBonus_(id); } catch (e) { console.error('streak bonus failed', e); }
  return { ok: true, streakBonus };
}

async function handleLogBatch(body) {
  const id = String(body.id || '').trim();
  const entries = Array.isArray(body.entries) ? body.entries : [];
  if (!id || entries.length === 0) return { ok: false, error: 'missing_fields' };

  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  if (row.forceBlocked) return { ok: false, error: 'force_blocked' };

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
  // 問題を解いている間はlast_loginも更新する(syncPointsと同じ理由。追加クエリなし)。
  await sql().query('UPDATE students SET logged_correct_count = $1, today_stats = $2, last_login = $3 WHERE id = $4', [newLoggedCorrect, JSON.stringify(stats), new Date().toISOString(), id]);

  let streakBonus = null;
  try { streakBonus = await checkStreakBonus_(id); } catch (e) { console.error('streak bonus failed', e); }
  return { ok: true, logged: rows.length, streakBonus };
}

async function handleHistory(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };

  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };

  // 生徒によっては数万件におよぶ生涯の全回答履歴を毎回まるごと取得すると、
  // 集計に使う分にはオーバースペックな上、Neonのデータ転送量を大きく圧迫する
  // (実際に無料枠の超過要因になった)。単元別・日別の集計はSQL側のGROUP BYで
  // 行い、一覧表示に使う直近30件だけを別途LIMIT付きで取得することで、
  // 転送されるのは生涯の総回答数に関わらず「単元数+日数+30件」程度に抑える。
  const [categoryRows, dateRows, recentRows] = await Promise.all([
    sql().query(
      "SELECT category, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE correct)::int AS correct FROM records WHERE student_id = $1 GROUP BY category",
      [id]
    ),
    sql().query(
      "SELECT (ts AT TIME ZONE 'Asia/Tokyo')::date::text AS date, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE correct)::int AS correct FROM records WHERE student_id = $1 GROUP BY date",
      [id]
    ),
    sql().query('SELECT ts, category, correct FROM records WHERE student_id = $1 ORDER BY ts DESC LIMIT 30', [id]),
  ]);

  let total = 0, correct = 0;
  const byCategory = {};
  categoryRows.forEach((r) => {
    total += r.total;
    correct += r.correct;
    byCategory[r.category] = { category: r.category, total: r.total, correct: r.correct };
  });

  const byDate = {};
  dateRows.forEach((r) => {
    byDate[r.date] = { date: r.date, total: r.total, correct: r.correct };
  });

  const recent = recentRows.map((r) => ({ timestamp: r.ts, category: r.category, correct: !!r.correct }));

  const todayKey = dateKeyTokyo(new Date());
  let streak = 0;
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  // setDate()/getDate()は実行環境のローカルタイムゾーン(Vercel本番はUTC)基準で
  // 日付を読み書きするため、JSTキーのbyDateと組み合わせるとmondayKeyTokyoと
  // 同種の不具合になりうる。ミリ秒単位の引き算はタイムゾーンに影響されないので
  // こちらを使う。
  let cursor = !byDate[todayKey] ? new Date(Date.now() - ONE_DAY_MS) : new Date();
  while (byDate[dateKeyTokyo(cursor)]) {
    streak++;
    cursor = new Date(cursor.getTime() - ONE_DAY_MS);
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
