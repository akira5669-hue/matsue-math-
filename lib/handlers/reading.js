const { sql } = require('../db');
const { findStudent } = require('../students');
const { dateKeyTokyo, monthKeyTokyo } = require('../util');
const { nicknameForId } = require('./ranking');

// 読者の秋：読み終わった本のタイトルと感想(50文字以上)を提出すると+5MP+10HP。
// 1日1回まで(乱発防止)。月間の冊数でランキングし、上位10人の投稿内容は
// 他の生徒にも表示する(handleReadingRankingのbooksフィールド)。
const READING_MP = 5;
const READING_HP = 10;
const READING_REVIEW_MIN_LENGTH = 50;

async function hasSubmittedReadingToday(id, today) {
  const rows = await sql().query('SELECT ts FROM reading_log WHERE student_id = $1', [id]);
  return rows.some((r) => dateKeyTokyo(new Date(r.ts)) === today);
}

async function handleSubmitReading(body) {
  const id = String(body.id || '').trim();
  const title = String(body.title || '').trim();
  const review = String(body.review || '').trim();
  if (!id || !title || review.length < READING_REVIEW_MIN_LENGTH) return { ok: false, error: 'missing_fields' };

  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };

  const today = dateKeyTokyo(new Date());
  if (await hasSubmittedReadingToday(id, today)) return { ok: false, error: 'already_submitted_today' };

  const newPoints = row.points + READING_MP;
  const newHp = (Number(row.hp) || 0) + READING_HP;
  await sql().query('UPDATE students SET points = $1, hp = $2 WHERE id = $3', [newPoints, newHp, id]);
  const monthKey = monthKeyTokyo(new Date());
  await sql().query(
    'INSERT INTO reading_log (ts, student_id, name, grade, month_key, title, review) VALUES (now(), $1, $2, $3, $4, $5, $6)',
    [id, row.name, row.grade, monthKey, title, review]
  );
  return { ok: true, pointsAwarded: READING_MP, hpAwarded: READING_HP, newTotalPoints: newPoints, newTotalHp: newHp };
}

function displayGradeForId_(id, grade) {
  return String(id).trim() === '00001' ? '先生' : grade;
}

async function handleReadingRanking(body) {
  const myId = String(body.id || '').trim();
  const monthKey = monthKeyTokyo(new Date());
  const rows = await sql().query(
    'SELECT student_id, name, grade, title, review FROM reading_log WHERE month_key = $1 ORDER BY ts ASC',
    [monthKey]
  );
  const byStudent = {};
  rows.forEach((r) => {
    if (!byStudent[r.student_id]) byStudent[r.student_id] = { id: r.student_id, grade: r.grade || '', books: [] };
    byStudent[r.student_id].books.push({ title: r.title, review: r.review });
  });
  const list = Object.values(byStudent).map((s) => ({ id: s.id, grade: s.grade, count: s.books.length, books: s.books }));
  list.sort((a, b) => b.count - a.count);
  const mapFn = (r, idx) => ({
    rank: idx + 1, nickname: nicknameForId(r.id), count: r.count, grade: displayGradeForId_(r.id, r.grade), isYou: r.id === myId,
    books: idx < 10 ? r.books : undefined,
  });
  const myIndex = list.findIndex((r) => r.id === myId);
  let nearby = [];
  if (myIndex !== -1) {
    const start = Math.max(0, myIndex - 3);
    const end = Math.min(list.length, myIndex + 4);
    for (let j = start; j < end; j++) nearby.push(mapFn(list[j], j));
  }
  return { ok: true, monthKey, ranking: list.slice(0, 50).map(mapFn), nearby };
}

module.exports = { handleSubmitReading, handleReadingRanking, READING_MP, READING_HP, READING_REVIEW_MIN_LENGTH };
