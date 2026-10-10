// 週替わり4択クイズの設定。毎週の問題・正解・選択肢は先生からチャットで伝えられる
// 内容をここへ直接書き換えてデプロイする運用(GAS版Code.gsのWEEKLY_QUIZ_と同じ)。
const WEEKLY_QUIZ_CORRECT_MP = 30;
const WEEKLY_QUIZ_WRONG_MP = -200;
const WEEKLY_QUIZ_QUESTION_ = '松江塾の中3の生徒で、数学の偏差値60以上の生徒の割合は？';
const WEEKLY_QUIZ_CHOICES_ = ['7.7%', '82.5%', '92.3%', '95%'];
const WEEKLY_QUIZ_CORRECT_INDEX_ = 2;
const WEEKLY_QUIZ = {
  weekKey: '2026-09-14', // 対象週の月曜日
  byGrade: {
    '小3': { question: WEEKLY_QUIZ_QUESTION_, choices: WEEKLY_QUIZ_CHOICES_, correctIndex: WEEKLY_QUIZ_CORRECT_INDEX_ },
    '小4': { question: WEEKLY_QUIZ_QUESTION_, choices: WEEKLY_QUIZ_CHOICES_, correctIndex: WEEKLY_QUIZ_CORRECT_INDEX_ },
    '小5': { question: WEEKLY_QUIZ_QUESTION_, choices: WEEKLY_QUIZ_CHOICES_, correctIndex: WEEKLY_QUIZ_CORRECT_INDEX_ },
    '小6': { question: WEEKLY_QUIZ_QUESTION_, choices: WEEKLY_QUIZ_CHOICES_, correctIndex: WEEKLY_QUIZ_CORRECT_INDEX_ },
    '中1': { question: WEEKLY_QUIZ_QUESTION_, choices: WEEKLY_QUIZ_CHOICES_, correctIndex: WEEKLY_QUIZ_CORRECT_INDEX_ },
    '中2': { question: WEEKLY_QUIZ_QUESTION_, choices: WEEKLY_QUIZ_CHOICES_, correctIndex: WEEKLY_QUIZ_CORRECT_INDEX_ },
    '中3': { question: WEEKLY_QUIZ_QUESTION_, choices: WEEKLY_QUIZ_CHOICES_, correctIndex: WEEKLY_QUIZ_CORRECT_INDEX_ },
  },
  // activeDate〜endDateの期間中(両端含む)表示する特別クイズ。endDateを省略した
  // 場合はactiveDate当日限定(以前の仕様のまま)。
  special: {
    activeDate: '2026-10-10',
    endDate: '2026-10-18',
    label: '📅期間限定クイズ！（10/18まで）',
    questions: [
      {
        question: '読書時間と学力が比例するのは、小6と中3のどちらでしょう？',
        choices: ['小6', '中3'],
        correctIndex: 0,
      },
    ],
  },
};

module.exports = { WEEKLY_QUIZ_CORRECT_MP, WEEKLY_QUIZ_WRONG_MP, WEEKLY_QUIZ };
