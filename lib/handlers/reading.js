const { sql } = require('../db');
const { findStudent } = require('../students');
const { monthKeyTokyo } = require('../util');
const { nicknameForId } = require('./ranking');

// 読書の秋：読み終わった本のタイトルと感想(50文字以上)を提出すると+5MP+10HP。
// 1日に何回でも投稿可能(1冊読み終えるたびに提出するイメージなので回数制限は
// 設けない)。月間の冊数でランキングし、上位30人の投稿内容は他の生徒にも
// 表示する(handleReadingRankingのbooksフィールド)。
const READING_MP = 5;
const READING_HP = 10;
const READING_REVIEW_MIN_LENGTH = 50;

async function handleSubmitReading(body) {
  const id = String(body.id || '').trim();
  const title = String(body.title || '').trim();
  const review = String(body.review || '').trim();
  if (!id || !title || review.length < READING_REVIEW_MIN_LENGTH) return { ok: false, error: 'missing_fields' };

  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };

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

// 読書ランキングで紹介される投稿への「いいね」。1人1投稿1回まで(UNIQUE制約で
// 二重いいねを防ぐ、ON CONFLICT DO NOTHINGで既に押していても静かに無視する)。
async function handleLikeReading(body) {
  const id = String(body.id || '').trim();
  const readingLogId = Math.floor(Number(body.readingLogId));
  if (!id || !Number.isFinite(readingLogId)) return { ok: false, error: 'missing_fields' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  const logRows = await sql().query('SELECT id FROM reading_log WHERE id = $1', [readingLogId]);
  if (!logRows.length) return { ok: false, error: 'not_found' };
  await sql().query(
    'INSERT INTO reading_likes (ts, reading_log_id, student_id) VALUES (now(), $1, $2) ON CONFLICT (reading_log_id, student_id) DO NOTHING',
    [readingLogId, id]
  );
  const countRows = await sql().query('SELECT COUNT(*) AS cnt FROM reading_likes WHERE reading_log_id = $1', [readingLogId]);
  return { ok: true, likeCount: Number(countRows[0].cnt) || 0 };
}

async function handleReadingRanking(body) {
  const myId = String(body.id || '').trim();
  const monthKey = monthKeyTokyo(new Date());
  // タイトル・感想文(最大1000文字)を含めて全投稿を取得すると、月間の投稿数が
  // 多いときにデータ転送量が非常に大きくなる(Neonの無料枠を圧迫した一因)。
  // 順位を決めるだけなら冊数さえ分かればよいので、まず本文抜きの集計だけ取得する。
  const counts = await sql().query(
    'SELECT student_id, grade, COUNT(*) AS book_count FROM reading_log WHERE month_key = $1 GROUP BY student_id, grade',
    [monthKey]
  );
  const list = counts.map((r) => ({ id: r.student_id, grade: r.grade || '', count: Number(r.book_count) || 0, books: undefined }));
  list.sort((a, b) => b.count - a.count);
  const myIndex = list.findIndex((r) => r.id === myId);
  const nearbyStart = myIndex === -1 ? -1 : Math.max(0, myIndex - 3);
  const nearbyEnd = myIndex === -1 ? -1 : Math.min(list.length, myIndex + 4);
  // 投稿本文が必要なのは「紹介対象(上位30人)」と「自分の近く(前後3人)」の
  // 生徒だけなので、その人たちのidだけに絞って本文を取得する。
  const needBooksIds = new Set();
  for (let i = 0; i < Math.min(30, list.length); i++) needBooksIds.add(list[i].id);
  if (nearbyStart >= 0) for (let i = nearbyStart; i < nearbyEnd; i++) needBooksIds.add(list[i].id);
  const idsArr = Array.from(needBooksIds);
  const booksByStudent = {};
  if (idsArr.length > 0) {
    const rows = await sql().query(
      'SELECT id, student_id, title, review FROM reading_log WHERE month_key = $1 AND student_id = ANY($2) ORDER BY ts ASC',
      [monthKey, idsArr]
    );
    const logIds = rows.map((r) => r.id);
    const likeCounts = {};
    const likedByMe = {};
    if (logIds.length > 0) {
      const likeRows = await sql().query('SELECT reading_log_id, student_id FROM reading_likes WHERE reading_log_id = ANY($1)', [logIds]);
      likeRows.forEach((l) => {
        likeCounts[l.reading_log_id] = (likeCounts[l.reading_log_id] || 0) + 1;
        if (String(l.student_id) === myId) likedByMe[l.reading_log_id] = true;
      });
    }
    rows.forEach((r) => {
      if (!booksByStudent[r.student_id]) booksByStudent[r.student_id] = [];
      booksByStudent[r.student_id].push({
        id: r.id, title: r.title, review: r.review,
        likeCount: likeCounts[r.id] || 0, likedByMe: !!likedByMe[r.id],
      });
    });
  }
  const mapFn = (r, idx) => ({
    rank: idx + 1, nickname: nicknameForId(r.id), count: r.count, grade: displayGradeForId_(r.id, r.grade), isYou: r.id === myId,
    books: idx < 30 ? booksByStudent[r.id] : undefined,
  });
  let nearby = [];
  if (myIndex !== -1) {
    for (let j = nearbyStart; j < nearbyEnd; j++) nearby.push(mapFn(list[j], j));
  }
  return { ok: true, monthKey, ranking: list.slice(0, 50).map(mapFn), nearby };
}

module.exports = { handleSubmitReading, handleReadingRanking, handleLikeReading, READING_MP, READING_HP, READING_REVIEW_MIN_LENGTH };
