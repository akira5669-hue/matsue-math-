const { sql } = require('../db');
const { previousMonthKeyTokyo } = require('../util');

// チャレンジ問題正解数ランキング(月間)の上位者に「賢さの実」を配布する。
// 小学生・中学生それぞれ独立に判定し、1〜10位は3個、11〜20位は2個、21〜30位は
// 1個もらえる。自動実行の仕組み(cron)がまだ無いため、月末〜月初めに00001が
// 手動で呼び出して配布する運用とする(fuji_pool_distributions等と同じ方式)。
// 同じ月は二重配布できないよう、実行済みならchallenge_fruit_distributionsで弾く。
const FRUIT_TIERS_ = [
  { fromRank: 1, toRank: 10, count: 3 },
  { fromRank: 11, toRank: 20, count: 2 },
  { fromRank: 21, toRank: 30, count: 1 },
];
function fruitCountForRank_(rank) {
  const tier = FRUIT_TIERS_.find((t) => rank >= t.fromRank && rank <= t.toRank);
  return tier ? tier.count : 0;
}

async function handleDistributeChallengeFruits(body) {
  const adminId = String(body.id || '').trim();
  if (adminId !== '00001') return { ok: false, error: 'forbidden' };

  let monthKey = String(body.monthKey || '').trim();
  if (!/^\d{4}-\d{2}$/.test(monthKey)) monthKey = previousMonthKeyTokyo(new Date());

  const already = await sql().query('SELECT month_key FROM challenge_fruit_distributions WHERE month_key = $1', [monthKey]);
  if (already.length > 0) return { ok: false, error: 'already_distributed' };

  const rows = await sql().query(
    'SELECT id, grade, challenge_month_total FROM students WHERE challenge_month_key = $1 AND challenge_month_total > 0',
    [monthKey]
  );
  if (rows.length === 0) return { ok: false, error: 'no_entries' };

  const elementary = rows.filter((r) => String(r.grade || '').charAt(0) === '小').sort((a, b) => b.challenge_month_total - a.challenge_month_total);
  const middle = rows.filter((r) => String(r.grade || '').charAt(0) === '中').sort((a, b) => b.challenge_month_total - a.challenge_month_total);

  const grants = {};
  function applyTier(list) {
    list.forEach((r, idx) => {
      const count = fruitCountForRank_(idx + 1);
      if (count > 0) grants[r.id] = (grants[r.id] || 0) + count;
    });
  }
  applyTier(elementary);
  applyTier(middle);

  const grantIds = Object.keys(grants);
  for (const id of grantIds) {
    await sql().query('UPDATE students SET wisdom_fruit_count = wisdom_fruit_count + $1 WHERE id = $2', [grants[id], id]);
  }
  await sql().query(
    'INSERT INTO challenge_fruit_distributions (month_key, distributed_at, recipients) VALUES ($1, now(), $2)',
    [monthKey, JSON.stringify(grants)]
  );
  return {
    ok: true, monthKey,
    elementaryCount: elementary.length, middleCount: middle.length,
    recipients: grantIds.map((id) => ({ id, count: grants[id] })),
  };
}

module.exports = { handleDistributeChallengeFruits };
