// 週替わり4択クイズの設定。毎週の問題・正解・選択肢は先生からチャットで伝えられる
// 内容をここへ直接書き換えてデプロイする運用(GAS版Code.gsのWEEKLY_QUIZ_と同じ)。
const WEEKLY_QUIZ_CORRECT_MP = 30;
const WEEKLY_QUIZ_WRONG_MP = -100;
const WEEKLY_QUIZ = {
  weekKey: null, // 例: '2026-08-03'（対象週の月曜日）
  byGrade: {
    // '小4': { question: '...', choices: ['...', '...', '...', '...'], correctIndex: 0 },
  },
  special: {
    activeDate: '2026-08-09',
    label: '📅本日限定！特別クイズ（2問連続正解で+30ポイント）',
    questions: [
      {
        question: '今週の授業の中で話をした、数学の偏差値が55から爆上がりした生徒さんは、いくつまで上がったのでしょう。',
        choices: ['64', '69', '74', '79'],
        correctIndex: 3,
      },
      {
        question: 'その生徒さんの数学の偏差値が爆上がりした要因は！？',
        choices: ['1人で頑張ったから', '保護者の方のサポートがあったから', '図書館で勉強したから', '学校の先生に質問したから'],
        correctIndex: 1,
      },
    ],
  },
};

module.exports = { WEEKLY_QUIZ_CORRECT_MP, WEEKLY_QUIZ_WRONG_MP, WEEKLY_QUIZ };
