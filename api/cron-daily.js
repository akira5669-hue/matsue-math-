// Vercelのスケジュール実行(vercel.jsonのcrons設定)から、毎日JST 0:00に1回だけ
// GETで叩かれるエンドポイント。努力の種(日次)を前日分、そして月が変わった
// 直後(JST日付が1日)であれば前月分の月次配布(賢さの種+読書いいねHP階層、
// チャレンジ問題正解数ランキングの賢さの実、勉強時間ランキングの努力の種)を
// まとめて自動実行する。00001による手動ボタンは、cronが失敗した場合の
// フォールバック/再実行用としてそのまま残してある(どちらも同じ
// distributed_atテーブルで二重配布を防ぐため、両方叩いても安全)。
const { dateKeyTokyo, previousDateKeyTokyo, previousMonthKeyTokyo } = require('../lib/util');
const { handleDistributeDailyEffortSeed, handleDistributeMonthlyEffortSeed } = require('../lib/handlers/effortSeedReward');
const { handleDistributeChallengeFruits } = require('../lib/handlers/challengeReward');
const { handleDistributeWisdomSeeds } = require('../lib/handlers/reading');

async function runSafely_(fn) {
  try {
    return await fn();
  } catch (e) {
    return { ok: false, error: 'internal_error', message: String((e && e.message) || e) };
  }
}

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers['authorization'] || '';
    if (auth !== `Bearer ${secret}`) {
      res.status(401).json({ ok: false, error: 'unauthorized' });
      return;
    }
  }

  const now = new Date();
  const yesterdayDateKey = previousDateKeyTokyo(now);
  const todayDateKey = dateKeyTokyo(now);
  const isFirstOfMonth = todayDateKey.slice(-2) === '01';

  const results = {
    dailyEffortSeed: await runSafely_(() => handleDistributeDailyEffortSeed({ id: '00001', dateKey: yesterdayDateKey })),
  };

  if (isFirstOfMonth) {
    const prevMonthKey = previousMonthKeyTokyo(now);
    results.monthlyEffortSeed = await runSafely_(() => handleDistributeMonthlyEffortSeed({ id: '00001', monthKey: prevMonthKey }));
    results.challengeFruits = await runSafely_(() => handleDistributeChallengeFruits({ id: '00001', monthKey: prevMonthKey }));
    results.wisdomSeeds = await runSafely_(() => handleDistributeWisdomSeeds({ id: '00001', monthKey: prevMonthKey }));
  }

  res.status(200).json({ ok: true, now: now.toISOString(), yesterdayDateKey, isFirstOfMonth, results });
};
