// Vercel Functionsの窓口。フロントエンドは今までのGAS(action+POSTボディ)と
// 全く同じ形式で呼び出すため、apiPost自体は書き換えず、API_URLをこのエンドポイントに
// 向けるだけで済むようにしてある。
const { handleGetPoints } = require('../lib/handlers/points');
const { handleLogin, handleRegister, handleResetPassword, handleCheckId } = require('../lib/handlers/auth');
const { handleLog, handleLogBatch, handleHistory } = require('../lib/handlers/logging');
const { handleSyncPoints, handleSaveAvatar } = require('../lib/handlers/sync');
const {
  handleRanking, handleRankingGrade, handleRankingToday, handleRankingPoints, handleRankingHp, handleChallengeRanking,
  handleHyakuMasuRanking, handleHyakuMasuHistory,
} = require('../lib/handlers/ranking');
const { handleGiftCatalog, handleRedeemGift, handleGrantItems } = require('../lib/handlers/gifts');
const { handleAkrPrayer, handleZombieVaccine, handleSharpenSword, handleBuyOnigiri, handleBuySteak, handleBuyHerb, handleBuyBakuHerb, handleBuyChouHerb, handleBuySeimeiMizu, handleBuySpeedSeed, handleBuyShuriken, handleBuyIronWall, handleBuySteelArmor, handleBuyIceSword, handleBuySkySpear, handleBuyRaidenAxe, handleBuyTreasureKey, handleSellTreasureRing, handleOpenTreasureChest, handleSellGem, handleBuySpellbook, handleSuperAkirametalPenalty, handleFujiEntryFee, handleFujiRescuePenalty, handleBuyOxygenCan, handleShopPurchaseHistory } = require('../lib/handlers/shop');
const { handleRegisterGuardian } = require('../lib/handlers/guardian');
const { handleWithdraw } = require('../lib/handlers/withdraw');
const { handleWeeklyQuizGet, handleWeeklyQuizAnswer } = require('../lib/handlers/weeklyQuiz');
const { handleSubmitTestPhoto } = require('../lib/handlers/testPhoto');
const { handleTeamEventStatus } = require('../lib/handlers/teamEvent');
const { handleStudyReport, handleStudyReportRankingToday, handleStudyReportRankingMonth, handleStudyCalendar } = require('../lib/handlers/studyReport');
const { handleSubmitReading, handleReadingRanking, handleLikeReading, handleEditReading, handleDistributeWisdomSeeds } = require('../lib/handlers/reading');
const { handleFujiClimbSuccess, handleFujiDistributePool, handleOhachiEntryFee, handleUseYushaSword } = require('../lib/handlers/fuji');
const { handleSaveProfession } = require('../lib/handlers/profession');
const { handleDistributeChallengeFruits } = require('../lib/handlers/challengeReward');
const { handleDistributeDailyEffortSeed, handleDistributeMonthlyEffortSeed } = require('../lib/handlers/effortSeedReward');

const ACTIONS = {
  getPoints: handleGetPoints,
  login: handleLogin,
  register: handleRegister,
  resetPassword: handleResetPassword,
  checkId: handleCheckId,
  log: handleLog,
  logBatch: handleLogBatch,
  history: handleHistory,
  syncPoints: handleSyncPoints,
  saveAvatar: handleSaveAvatar,
  ranking: handleRanking,
  rankingGrade: handleRankingGrade,
  rankingToday: handleRankingToday,
  rankingPoints: handleRankingPoints,
  rankingHp: handleRankingHp,
  challengeRanking: handleChallengeRanking,
  hyakuMasuRanking: handleHyakuMasuRanking,
  hyakuMasuHistory: handleHyakuMasuHistory,
  studyReport: handleStudyReport,
  studyReportRankingToday: handleStudyReportRankingToday,
  studyReportRankingMonth: handleStudyReportRankingMonth,
  studyCalendar: handleStudyCalendar,
  submitReading: handleSubmitReading,
  readingRanking: handleReadingRanking,
  likeReading: handleLikeReading,
  editReading: handleEditReading,
  giftCatalog: handleGiftCatalog,
  redeemGift: handleRedeemGift,
  grantItems: handleGrantItems,
  akrPrayer: handleAkrPrayer,
  zombieVaccine: handleZombieVaccine,
  sharpenSword: handleSharpenSword,
  buyOnigiri: handleBuyOnigiri,
  buySteak: handleBuySteak,
  buyHerb: handleBuyHerb,
  buyBakuHerb: handleBuyBakuHerb,
  buyChouHerb: handleBuyChouHerb,
  buySeimeiMizu: handleBuySeimeiMizu,
  buySpeedSeed: handleBuySpeedSeed,
  buyShuriken: handleBuyShuriken,
  buyIronWall: handleBuyIronWall,
  buySteelArmor: handleBuySteelArmor,
  buyIceSword: handleBuyIceSword,
  buySkySpear: handleBuySkySpear,
  buyRaidenAxe: handleBuyRaidenAxe,
  buyOxygenCan: handleBuyOxygenCan,
  shopPurchaseHistory: handleShopPurchaseHistory,
  buyTreasureKey: handleBuyTreasureKey,
  sellTreasureRing: handleSellTreasureRing,
  sellGem: handleSellGem,
  openTreasureChest: handleOpenTreasureChest,
  buySpellbook: handleBuySpellbook,
  superAkirametalPenalty: handleSuperAkirametalPenalty,
  fujiEntryFee: handleFujiEntryFee,
  fujiRescuePenalty: handleFujiRescuePenalty,
  fujiClimbSuccess: handleFujiClimbSuccess,
  fujiDistributePool: handleFujiDistributePool,
  ohachiEntryFee: handleOhachiEntryFee,
  useYushaSword: handleUseYushaSword,
  saveProfession: handleSaveProfession,
  distributeChallengeFruits: handleDistributeChallengeFruits,
  distributeDailyEffortSeed: handleDistributeDailyEffortSeed,
  distributeMonthlyEffortSeed: handleDistributeMonthlyEffortSeed,
  distributeWisdomSeeds: handleDistributeWisdomSeeds,
  registerGuardian: handleRegisterGuardian,
  withdraw: handleWithdraw,
  weeklyQuizGet: handleWeeklyQuizGet,
  weeklyQuizAnswer: handleWeeklyQuizAnswer,
  submitTestPhoto: handleSubmitTestPhoto,
  teamEventStatus: handleTeamEventStatus,
};

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.length > 0) return JSON.parse(req.body);
  return {};
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }
  let body;
  try {
    body = parseBody(req);
  } catch (e) {
    res.status(200).json({ ok: false, error: 'bad_request' });
    return;
  }
  const action = body.action;
  const handler = ACTIONS[action];
  if (!handler) {
    res.status(200).json({ ok: false, error: 'unknown_action' });
    return;
  }
  try {
    const result = await handler(body);
    res.status(200).json(result);
  } catch (e) {
    console.error('handler error:', action, e);
    res.status(200).json({ ok: false, error: 'internal_error' });
  }
};
