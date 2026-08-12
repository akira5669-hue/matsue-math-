const { sql } = require('../db');
const { findStudent } = require('../students');
const { dateKeyTokyo, mondayKeyTokyo } = require('../util');
const { WEEKLY_QUIZ_CORRECT_MP, WEEKLY_QUIZ_WRONG_MP, WEEKLY_QUIZ } = require('../weeklyQuizConfig');

async function hasAnsweredWeeklyQuiz(id, weekKey) {
  const rows = await sql().query('SELECT 1 FROM weekly_quiz_answers WHERE student_id = $1 AND week_key = $2 LIMIT 1', [id, weekKey]);
  return rows.length > 0;
}

async function handleWeeklyQuizGet(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_fields' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };

  const special = WEEKLY_QUIZ.special;
  if (special && special.activeDate === dateKeyTokyo(new Date())) {
    const specialKey = 'SPECIAL:' + special.activeDate;
    if (await hasAnsweredWeeklyQuiz(id, specialKey)) {
      return { ok: true, available: false, alreadyAnswered: true, special: true };
    }
    return {
      ok: true, available: true, special: true, label: special.label,
      questions: special.questions.map((q) => ({ question: q.question, choices: q.choices })),
    };
  }

  const currentWeek = mondayKeyTokyo(new Date());
  if (WEEKLY_QUIZ.weekKey !== currentWeek) return { ok: true, available: false };
  const quiz = WEEKLY_QUIZ.byGrade[row.grade];
  if (!quiz) return { ok: true, available: false };
  if (await hasAnsweredWeeklyQuiz(id, currentWeek)) return { ok: true, available: false, alreadyAnswered: true };
  return { ok: true, available: true, question: quiz.question, choices: quiz.choices };
}

async function handleWeeklyQuizSpecialAnswer(id, choiceIndices, special) {
  const specialKey = 'SPECIAL:' + special.activeDate;
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  if (await hasAnsweredWeeklyQuiz(id, specialKey)) return { ok: false, error: 'already_answered' };

  const correct = choiceIndices.length === special.questions.length &&
    special.questions.every((q, i) => Number(choiceIndices[i]) === q.correctIndex);
  const delta = correct ? WEEKLY_QUIZ_CORRECT_MP : WEEKLY_QUIZ_WRONG_MP;
  const newPoints = Math.max(0, row.points + delta);
  await sql().query('UPDATE students SET points = $1 WHERE id = $2', [newPoints, id]);
  await sql().query(
    'INSERT INTO weekly_quiz_answers (ts, student_id, name, grade, week_key, correct, points_delta) VALUES (now(), $1, $2, $3, $4, $5, $6)',
    [id, row.name, row.grade, specialKey, correct, delta]
  );
  return { ok: true, correct, pointsDelta: delta, newTotalPoints: newPoints, correctIndices: special.questions.map((q) => q.correctIndex) };
}

async function handleWeeklyQuizAnswer(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_fields' };

  const special = WEEKLY_QUIZ.special;
  if (special && special.activeDate === dateKeyTokyo(new Date()) && Array.isArray(body.choiceIndices)) {
    return handleWeeklyQuizSpecialAnswer(id, body.choiceIndices, special);
  }

  const choiceIndex = Number(body.choiceIndex);
  if (!isFinite(choiceIndex)) return { ok: false, error: 'missing_fields' };

  const currentWeek = mondayKeyTokyo(new Date());
  if (WEEKLY_QUIZ.weekKey !== currentWeek) return { ok: false, error: 'no_quiz' };

  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  const quiz = WEEKLY_QUIZ.byGrade[row.grade];
  if (!quiz) return { ok: false, error: 'no_quiz' };
  if (await hasAnsweredWeeklyQuiz(id, currentWeek)) return { ok: false, error: 'already_answered' };

  const correct = choiceIndex === quiz.correctIndex;
  const delta = correct ? WEEKLY_QUIZ_CORRECT_MP : WEEKLY_QUIZ_WRONG_MP;
  const newPoints = Math.max(0, row.points + delta);
  await sql().query('UPDATE students SET points = $1 WHERE id = $2', [newPoints, id]);
  await sql().query(
    'INSERT INTO weekly_quiz_answers (ts, student_id, name, grade, week_key, correct, points_delta) VALUES (now(), $1, $2, $3, $4, $5, $6)',
    [id, row.name, row.grade, currentWeek, correct, delta]
  );
  return { ok: true, correct, pointsDelta: delta, newTotalPoints: newPoints, correctIndex: quiz.correctIndex };
}

module.exports = { handleWeeklyQuizGet, handleWeeklyQuizAnswer };
