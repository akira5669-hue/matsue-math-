// テスト提出(ペナテスト/抜き打ちテスト/ランキングテスト/100マス計算/チャレンジ問題)の
// 設定。GAS版Code.gsの各定数と同じ内容。
const TEST_PHOTO_RETENTION_DAYS = 21;
const PENA_TEST_MP_PER_SHEET = 30;
const PENA_TEST_DAILY_CAP_MP = 30;
const RANKING_TEST_TIERS = [
  { id: '100', label: '100点', mp: 500 },
  { id: '90s', label: '90点台', mp: 400 },
  { id: '80s', label: '80点台', mp: 300 },
  { id: '70s', label: '70点台', mp: 200 },
];
const RANKING_TEST_BLOCKED_GRADES = ['小3', '小4', '小5', '小6'];
const HYAKUMASU_MP = 20;
const HYAKUMASU_ALLOWED_GRADES = ['小4', '小5', '小6'];
const CHALLENGE_TEST_TIERS = [
  { id: '3plus', label: '3問以上正解', mp: 30, count: 3 },
  { id: '2', label: '2問正解', mp: 20, count: 2 },
  { id: '1', label: '1問正解', mp: 10, count: 1 },
];
const CHALLENGE_WEEKLY_LIMIT_ELEMENTARY = 1;
const CHALLENGE_WEEKLY_LIMIT_MIDDLE = 3;
const HYAKUMASU_WEEKLY_LIMIT = 1;
const TEST_PHOTO_TYPES = ['pena', 'ranking', 'hyakuMasu', 'challenge'];
const WEEKLY_LIMITED_TEST_TYPES = ['hyakuMasu', 'challenge'];

function weeklySubmitLimitForTestType(testType, grade) {
  if (testType === 'hyakuMasu') return HYAKUMASU_WEEKLY_LIMIT;
  if (testType === 'challenge') {
    return (String(grade || '').charAt(0) === '中') ? CHALLENGE_WEEKLY_LIMIT_MIDDLE : CHALLENGE_WEEKLY_LIMIT_ELEMENTARY;
  }
  return 0;
}

module.exports = {
  TEST_PHOTO_RETENTION_DAYS, PENA_TEST_MP_PER_SHEET, PENA_TEST_DAILY_CAP_MP,
  RANKING_TEST_TIERS, RANKING_TEST_BLOCKED_GRADES, HYAKUMASU_MP, HYAKUMASU_ALLOWED_GRADES,
  CHALLENGE_TEST_TIERS, TEST_PHOTO_TYPES, WEEKLY_LIMITED_TEST_TYPES, weeklySubmitLimitForTestType,
};
