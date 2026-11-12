// Vercel Functionsの窓口。フロントエンドは今までのGAS(action+POSTボディ)と
// 全く同じ形式で呼び出すため、apiPost自体は書き換えず、API_URLをこのエンドポイントに
// 向けるだけで済むようにしてある。
const { handleGetPoints } = require('../lib/handlers/points');
const { handleLogin, handleRegister, handleResetPassword, handleCheckId, handleCheckName } = require('../lib/handlers/auth');
const { handleLog, handleLogBatch, handleHistory } = require('../lib/handlers/logging');
const { handleSyncPoints, handleSaveAvatar } = require('../lib/handlers/sync');
const {
  handleRanking, handleRankingGrade, handleRankingToday, handleRankingPoints, handleRankingHp, handleChallengeRanking,
  handleHyakuMasuRanking, handleHyakuMasuHistory,
} = require('../lib/handlers/ranking');
const { handleGiftCatalog, handleRedeemGift, handleGrantItems } = require('../lib/handlers/gifts');
const { handleAkrPrayer, handleZombieVaccine, handleSharpenSword, handleBuyOnigiri, handleBuyFestivalFood, handleBuySteak, handleBuyHerb, handleBuyBakuHerb, handleBuyChouHerb, handleBuySeimeiMizu, handleBuySpeedSeed, handleBuyShuriken, handleBuyDragonSword, handleSellDragonSword, handleBuyGoldNecklace, handleSellGoldNecklace, handleBuyIronWall, handleBuySteelArmor, handleBuyIceSword, handleBuySkySpear, handleBuyRaidenAxe, handleSharpenRaidenAxe, handleBuyTreasureKey, handleSellTreasureRing, handleOpenTreasureChest, handleSellGem, handleSellDiamondRing, handleSellWisdomFruit, handleSellEffortSeed, handleSellWisdomSeed, handleBuySpellbook, handleSuperAkirametalPenalty, handleFujiEntryFee, handleFujiRescuePenalty, handleBuyOxygenCan, handleShopPurchaseHistory } = require('../lib/handlers/shop');
const { handleUsaCrossingEntryFee } = require('../lib/handlers/usaCrossing');
const { handleRegisterGuardian } = require('../lib/handlers/guardian');
const { handleWithdraw } = require('../lib/handlers/withdraw');
const { handleWeeklyQuizGet, handleWeeklyQuizAnswer } = require('../lib/handlers/weeklyQuiz');
const { handleSubmitTestPhoto } = require('../lib/handlers/testPhoto');
const { handleRankingAutoExplain, handleRankingReviewStatus, handleRankingReviewExplImage, handleRankingFixSubmit, handleRankingReviewList, handleRankingReviewPhoto, handleRankingReviewFeedback, handleRankingFixReview } = require('../lib/handlers/rankingReview');
const { handleTeamEventStatus } = require('../lib/handlers/teamEvent');
const { handleStudyReport, handleStudyReportRankingToday, handleStudyReportRankingMonth, handleStudyCalendar } = require('../lib/handlers/studyReport');
const { handleSubmitReading, handleReadingRanking, handleLikeReading, handleEditReading, handleDistributeWisdomSeeds, handleReadingHallOfFame } = require('../lib/handlers/reading');
const { handleFujiHallOfFame, handleFujiClimbSuccess, handleFujiDistributePool, handleOhachiEntryFee, handleOhachiEasyEntryFee, handleUseYushaSword } = require('../lib/handlers/fuji');
const { handleSaveProfession } = require('../lib/handlers/profession');
const { handleMangaStatus, handleMangaView, handleMangaSubmit, handleMangaSubmissions, handleMangaSubmissionImage, handleMangaReview, handleMangaLike, handleMangaFreeView } = require('../lib/handlers/manga');
const { handleHalloweenStatus, handleHalloweenBuyCandy, handleHalloweenGhost } = require('../lib/handlers/halloween');
const { handleZukeiStatus, handleZukeiAnswer } = require('../lib/handlers/zukei');
const { handleBugReportStatus, handleBugReportSubmit, handleBugReportList, handleBugReportImage, handleBugReportDone } = require('../lib/handlers/bugReport');
const { handleGachaStatus, handleGachaDraw, handleGachaPkKeep, handleGachaDiceQuiz, handleGachaBbQuiz } = require('../lib/handlers/gacha');
const { handleZeroDragonReward, handleZeroDragonUfoStatus, handleZeroDragonUfoPlay } = require('../lib/handlers/zeroDragon');
const { handleKenStatus, handleKenClear, handleKenRanking } = require('../lib/handlers/kenken');
const { handleSurveyStatus, handleSurveySubmit } = require('../lib/handlers/survey');
const { handleDistributeChallengeFruits } = require('../lib/handlers/challengeReward');
const { handleDistributeDailyEffortSeed, handleDistributeMonthlyEffortSeed } = require('../lib/handlers/effortSeedReward');

const ACTIONS = {
  getPoints: handleGetPoints,
  login: handleLogin,
  register: handleRegister,
  checkName: handleCheckName,
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
  readingHallOfFame: handleReadingHallOfFame,
  likeReading: handleLikeReading,
  editReading: handleEditReading,
  giftCatalog: handleGiftCatalog,
  redeemGift: handleRedeemGift,
  grantItems: handleGrantItems,
  akrPrayer: handleAkrPrayer,
  zombieVaccine: handleZombieVaccine,
  sharpenSword: handleSharpenSword,
  buyOnigiri: handleBuyOnigiri,
  buyFestivalFood: handleBuyFestivalFood,
  buySteak: handleBuySteak,
  buyHerb: handleBuyHerb,
  buyBakuHerb: handleBuyBakuHerb,
  buyChouHerb: handleBuyChouHerb,
  buySeimeiMizu: handleBuySeimeiMizu,
  buySpeedSeed: handleBuySpeedSeed,
  buyShuriken: handleBuyShuriken,
  buyDragonSword: handleBuyDragonSword,
  sellDragonSword: handleSellDragonSword,
  buyGoldNecklace: handleBuyGoldNecklace,
  sellGoldNecklace: handleSellGoldNecklace,
  buyIronWall: handleBuyIronWall,
  buySteelArmor: handleBuySteelArmor,
  buyIceSword: handleBuyIceSword,
  buySkySpear: handleBuySkySpear,
  buyRaidenAxe: handleBuyRaidenAxe,
  sharpenRaidenAxe: handleSharpenRaidenAxe,
  buyOxygenCan: handleBuyOxygenCan,
  shopPurchaseHistory: handleShopPurchaseHistory,
  buyTreasureKey: handleBuyTreasureKey,
  sellTreasureRing: handleSellTreasureRing,
  sellGem: handleSellGem,
  sellDiamondRing: handleSellDiamondRing,
  sellWisdomFruit: handleSellWisdomFruit,
  sellEffortSeed: handleSellEffortSeed,
  sellWisdomSeed: handleSellWisdomSeed,
  usaCrossingEntryFee: handleUsaCrossingEntryFee,
  openTreasureChest: handleOpenTreasureChest,
  buySpellbook: handleBuySpellbook,
  superAkirametalPenalty: handleSuperAkirametalPenalty,
  fujiEntryFee: handleFujiEntryFee,
  fujiRescuePenalty: handleFujiRescuePenalty,
  fujiClimbSuccess: handleFujiClimbSuccess,
  fujiDistributePool: handleFujiDistributePool,
  fujiHallOfFame: handleFujiHallOfFame,
  ohachiEntryFee: handleOhachiEntryFee,
  ohachiEasyEntryFee: handleOhachiEasyEntryFee,
  useYushaSword: handleUseYushaSword,
  saveProfession: handleSaveProfession,
  mangaStatus: handleMangaStatus,
  mangaView: handleMangaView,
  mangaFreeView: handleMangaFreeView,
  mangaSubmit: handleMangaSubmit,
  mangaSubmissions: handleMangaSubmissions,
  mangaSubmissionImage: handleMangaSubmissionImage,
  mangaReview: handleMangaReview,
  mangaLike: handleMangaLike,
  halloweenStatus: handleHalloweenStatus,
  halloweenBuyCandy: handleHalloweenBuyCandy,
  halloweenGhost: handleHalloweenGhost,
  zukeiStatus: handleZukeiStatus,
  zukeiAnswer: handleZukeiAnswer,
  gachaStatus: handleGachaStatus,
  bugReportStatus: handleBugReportStatus,
  bugReportSubmit: handleBugReportSubmit,
  bugReportList: handleBugReportList,
  bugReportImage: handleBugReportImage,
  bugReportDone: handleBugReportDone,
  gachaDraw: handleGachaDraw,
  gachaPkKeep: handleGachaPkKeep,
  gachaDiceQuiz: handleGachaDiceQuiz,
  gachaBbQuiz: handleGachaBbQuiz,
  zeroDragonReward: handleZeroDragonReward,
  zeroDragonUfoStatus: handleZeroDragonUfoStatus,
  zeroDragonUfoPlay: handleZeroDragonUfoPlay,
  kenStatus: handleKenStatus,
  kenClear: handleKenClear,
  kenRanking: handleKenRanking,
  surveyStatus: handleSurveyStatus,
  surveySubmit: handleSurveySubmit,
  distributeChallengeFruits: handleDistributeChallengeFruits,
  distributeDailyEffortSeed: handleDistributeDailyEffortSeed,
  distributeMonthlyEffortSeed: handleDistributeMonthlyEffortSeed,
  distributeWisdomSeeds: handleDistributeWisdomSeeds,
  registerGuardian: handleRegisterGuardian,
  withdraw: handleWithdraw,
  weeklyQuizGet: handleWeeklyQuizGet,
  weeklyQuizAnswer: handleWeeklyQuizAnswer,
  submitTestPhoto: handleSubmitTestPhoto,
  rankingReviewStatus: handleRankingReviewStatus,
  rankingAutoExplain: handleRankingAutoExplain,
  rankingReviewExplImage: handleRankingReviewExplImage,
  rankingFixSubmit: handleRankingFixSubmit,
  rankingReviewList: handleRankingReviewList,
  rankingReviewPhoto: handleRankingReviewPhoto,
  rankingReviewFeedback: handleRankingReviewFeedback,
  rankingFixReview: handleRankingFixReview,
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
