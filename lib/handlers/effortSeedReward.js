const { sql } = require('../db');
const { previousDateKeyTokyo, previousMonthKeyTokyo } = require('../util');

// 努力の種：購入不可、2種類の配布経路がある。
// ①その日の勉強時間トップ(小学生・中学生それぞれ1名)に1粒(毎日)。
// ②月間勉強時間ランキングの上位者(小学生・中学生それぞれ)に順位に応じた個数。
// どちらも自動実行の仕組み(cron)がまだ無いため、00001が手動で呼び出して配布する
// 運用とする(他の月次配布と同じ方式)。date_key/month_key単位で二重配布を防ぐ。
const EFFORT_SEED_MONTHLY_TIERS_ = [
  { fromRank: 1, toRank: 10, count: 10 },
  { fromRank: 11, toRank: 15, count: 8 },
  { fromRank: 16, toRank: 20, count: 5 },
  { fromRank: 21, toRank: 30, count: 3 },
  { fromRank: 31, toRank: 50, count: 1 },
];
function effortSeedCountForRank_(rank) {
  const tier = EFFORT_SEED_MONTHLY_TIERS_.find((t) => rank >= t.fromRank && rank <= t.toRank);
  return tier ? tier.count : 0;
}
function splitByGrade_(rows, minutesOf) {
  const elementary = [], middle = [];
  rows.forEach((d) => {
    if (!d.student_id) return;
    const minutes = minutesOf(d);
    if (minutes <= 0) return;
    const grade = d.grade || '';
    const entry = { id: d.student_id, minutes, grade };
    if (String(grade).charAt(0) === '中') middle.push(entry);
    else if (String(grade).charAt(0) === '小') elementary.push(entry);
  });
  elementary.sort((a, b) => b.minutes - a.minutes);
  middle.sort((a, b) => b.minutes - a.minutes);
  return { elementary, middle };
}

async function handleDistributeDailyEffortSeed(body) {
  const adminId = String(body.id || '').trim();
  if (adminId !== '00001') return { ok: false, error: 'forbidden' };
  let dateKey = String(body.dateKey || '').trim();
  if (!dateKey) dateKey = previousDateKeyTokyo(new Date());

  const already = await sql().query('SELECT date_key FROM effort_seed_daily_distributions WHERE date_key = $1', [dateKey]);
  if (already.length > 0) return { ok: false, error: 'already_distributed' };

  const rows = await sql().query('SELECT student_id, grade, minutes FROM study_reports WHERE date_key = $1', [dateKey]);
  const { elementary, middle } = splitByGrade_(rows, (d) => Number(d.minutes) || 0);

  const grants = {};
  if (elementary.length > 0) grants[elementary[0].id] = (grants[elementary[0].id] || 0) + 1;
  if (middle.length > 0) grants[middle[0].id] = (grants[middle[0].id] || 0) + 1;

  const grantIds = Object.keys(grants);
  if (grantIds.length === 0) return { ok: false, error: 'no_entries' };
  for (const id of grantIds) {
    await sql().query('UPDATE students SET effort_seed_count = effort_seed_count + $1 WHERE id = $2', [grants[id], id]);
  }
  await sql().query(
    'INSERT INTO effort_seed_daily_distributions (date_key, distributed_at, recipients) VALUES ($1, now(), $2)',
    [dateKey, JSON.stringify(grants)]
  );
  return { ok: true, dateKey, recipients: grantIds.map((id) => ({ id, count: grants[id] })) };
}

async function handleDistributeMonthlyEffortSeed(body) {
  const adminId = String(body.id || '').trim();
  if (adminId !== '00001') return { ok: false, error: 'forbidden' };
  let monthKey = String(body.monthKey || '').trim();
  if (!/^\d{4}-\d{2}$/.test(monthKey)) monthKey = previousMonthKeyTokyo(new Date());

  const already = await sql().query('SELECT month_key FROM effort_seed_monthly_distributions WHERE month_key = $1', [monthKey]);
  if (already.length > 0) return { ok: false, error: 'already_distributed' };

  const rows = await sql().query(
    'SELECT student_id, grade, SUM(minutes) AS total_minutes FROM study_reports WHERE month_key = $1 GROUP BY student_id, grade',
    [monthKey]
  );
  const { elementary, middle } = splitByGrade_(rows, (d) => Number(d.total_minutes) || 0);

  const grants = {};
  function applyTier(list) {
    list.forEach((r, idx) => {
      const count = effortSeedCountForRank_(idx + 1);
      if (count > 0) grants[r.id] = (grants[r.id] || 0) + count;
    });
  }
  applyTier(elementary);
  applyTier(middle);

  const grantIds = Object.keys(grants);
  if (grantIds.length === 0) return { ok: false, error: 'no_entries' };
  for (const id of grantIds) {
    await sql().query('UPDATE students SET effort_seed_count = effort_seed_count + $1 WHERE id = $2', [grants[id], id]);
  }
  await sql().query(
    'INSERT INTO effort_seed_monthly_distributions (month_key, distributed_at, recipients) VALUES ($1, now(), $2)',
    [monthKey, JSON.stringify(grants)]
  );
  return {
    ok: true, monthKey,
    elementaryCount: elementary.length, middleCount: middle.length,
    recipients: grantIds.map((id) => ({ id, count: grants[id] })),
  };
}

module.exports = { handleDistributeDailyEffortSeed, handleDistributeMonthlyEffortSeed };
