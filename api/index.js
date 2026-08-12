// Vercel Functionsの窓口。フロントエンドは今までのGAS(action+POSTボディ)と
// 全く同じ形式で呼び出すため、apiPost自体は書き換えず、API_URLをこのエンドポイントに
// 向けるだけで済むようにしてある。
const { handleGetPoints } = require('../lib/handlers/points');
const { handleLogin, handleRegister, handleResetPassword, handleCheckId } = require('../lib/handlers/auth');
const { handleLog, handleLogBatch, handleHistory } = require('../lib/handlers/logging');
const { handleSyncPoints, handleSaveAvatar } = require('../lib/handlers/sync');
const {
  handleRanking, handleRankingGrade, handleRankingToday, handleRankingPoints, handleRankingHp, handleChallengeRanking,
} = require('../lib/handlers/ranking');
const { handleGiftCatalog, handleRedeemGift, handleGrantItems } = require('../lib/handlers/gifts');
const { handleAkrPrayer, handleBuyHerb, handleBuyBakuHerb } = require('../lib/handlers/shop');
const { handleRegisterGuardian } = require('../lib/handlers/guardian');
const { handleWithdraw } = require('../lib/handlers/withdraw');
const { handleWeeklyQuizGet, handleWeeklyQuizAnswer } = require('../lib/handlers/weeklyQuiz');
const { handleSubmitTestPhoto } = require('../lib/handlers/testPhoto');

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
  giftCatalog: handleGiftCatalog,
  redeemGift: handleRedeemGift,
  grantItems: handleGrantItems,
  akrPrayer: handleAkrPrayer,
  buyHerb: handleBuyHerb,
  buyBakuHerb: handleBuyBakuHerb,
  registerGuardian: handleRegisterGuardian,
  withdraw: handleWithdraw,
  weeklyQuizGet: handleWeeklyQuizGet,
  weeklyQuizAnswer: handleWeeklyQuizAnswer,
  submitTestPhoto: handleSubmitTestPhoto,
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
