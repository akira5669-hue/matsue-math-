const { sql } = require('../db');
const { findStudent } = require('../students');
const { monthKeyTokyo, previousMonthKeyTokyo } = require('../util');
const { nicknameWithProfession_, fetchProfessionMap_ } = require('./ranking');

// 読書の秋：読み終わった本のタイトルと感想(50文字以上)を提出すると+5MP+10HP。
// 1日に何回でも投稿可能(1冊読み終えるたびに提出するイメージなので回数制限は
// 設けない)。月間の冊数でランキングし、上位30人の投稿内容は他の生徒にも
// 表示する(handleReadingRankingのbooksフィールド)。
// 同じ月に同じタイトルを何度も投稿してランキング・MPを水増しする生徒がいたため
// (2026-10-06、00109で確認、同月に同タイトルを34回投稿)、同じ月・同じタイトルの
// 投稿は1回までに制限する(過去の重複分は管理者側で一括削除済み)。
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

  const monthKey = monthKeyTokyo(new Date());
  const existing = await sql().query(
    'SELECT id FROM reading_log WHERE student_id = $1 AND month_key = $2 AND title = $3 LIMIT 1',
    [id, monthKey, title]
  );
  if (existing.length > 0) return { ok: false, error: 'duplicate_title_this_month' };

  const newPoints = row.points + READING_MP;
  const newHp = (Number(row.hp) || 0) + READING_HP;
  await sql().query('UPDATE students SET points = $1, hp = $2 WHERE id = $3', [newPoints, newHp, id]);
  await sql().query(
    'INSERT INTO reading_log (ts, student_id, name, grade, month_key, title, review) VALUES (now(), $1, $2, $3, $4, $5, $6)',
    [id, row.name, row.grade, monthKey, title, review]
  );
  return { ok: true, pointsAwarded: READING_MP, hpAwarded: READING_HP, newTotalPoints: newPoints, newTotalHp: newHp };
}

// 投稿後に打ち間違いに気づいた生徒向けの編集機能(2026-10-08〜、米山さんからの
// バグ報告を機に追加)。MP/HPは再編集では追加しない(二重取得防止)。自分の投稿
// 以外は編集できないよう所有者チェックを行い、タイトルを変える場合は同じ月の
// 重複タイトル禁止ルール(handleSubmitReadingと同じ)を自分以外との間で再チェックする。
async function handleEditReading(body) {
  const id = String(body.id || '').trim();
  const readingLogId = Math.floor(Number(body.readingLogId));
  const title = String(body.title || '').trim();
  const review = String(body.review || '').trim();
  if (!id || !Number.isFinite(readingLogId) || !title || review.length < READING_REVIEW_MIN_LENGTH) {
    return { ok: false, error: 'missing_fields' };
  }

  const rows = await sql().query('SELECT id, student_id, month_key FROM reading_log WHERE id = $1', [readingLogId]);
  if (!rows.length) return { ok: false, error: 'not_found' };
  const log = rows[0];
  if (String(log.student_id) !== id) return { ok: false, error: 'forbidden' };

  const dup = await sql().query(
    'SELECT id FROM reading_log WHERE student_id = $1 AND month_key = $2 AND title = $3 AND id != $4 LIMIT 1',
    [id, log.month_key, title, readingLogId]
  );
  if (dup.length > 0) return { ok: false, error: 'duplicate_title_this_month' };

  await sql().query('UPDATE reading_log SET title = $1, review = $2 WHERE id = $3', [title, review, readingLogId]);
  return { ok: true, readingLogId, title, review };
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
  const profMap = await fetchProfessionMap_(list.map((r) => r.id));
  const mapFn = (r, idx) => ({
    rank: idx + 1, nickname: nicknameWithProfession_(r.id, profMap[r.id]), count: r.count, grade: displayGradeForId_(r.id, r.grade), isYou: r.id === myId,
    books: idx < 30 ? booksByStudent[r.id] : undefined,
  });
  let nearby = [];
  if (myIndex !== -1) {
    for (let j = nearbyStart; j < nearbyEnd; j++) nearby.push(mapFn(list[j], j));
  }
  return { ok: true, monthKey, ranking: list.slice(0, 50).map(mapFn), nearby };
}

// 読書いいねランキングの月間特典：
// ・1〜3位は「賢さの種」(秘密アイテム、入手方法は生徒に非公開)を1粒。
// ・1〜25位は、順位に応じたHPボーナス(READING_HP_TIERS_)。
// 自動実行の仕組み(cron)がまだ無いため、fuji_pool_distributionsと同じく00001が
// 手動で呼び出して配布する運用とする。同じ月は二重配布できないよう、実行済みなら
// wisdom_seed_distributionsで弾く(このテーブルが月間読書いいね特典の精算記録を兼ねる)。
const WISDOM_SEED_TOP_N = 3;
const READING_HP_TIERS_ = [
  { fromRank: 1, toRank: 3, hp: 1500 },
  { fromRank: 4, toRank: 5, hp: 1000 },
  { fromRank: 6, toRank: 10, hp: 800 },
  { fromRank: 11, toRank: 15, hp: 600 },
  { fromRank: 16, toRank: 20, hp: 500 },
  { fromRank: 21, toRank: 25, hp: 300 },
];
const READING_HP_TIER_TOP_N = 25;
function hpTierForRank_(rank) {
  const tier = READING_HP_TIERS_.find((t) => rank >= t.fromRank && rank <= t.toRank);
  return tier ? tier.hp : 0;
}
async function handleDistributeWisdomSeeds(body) {
  const adminId = String(body.id || '').trim();
  if (adminId !== '00001') return { ok: false, error: 'forbidden' };

  let monthKey = String(body.monthKey || '').trim();
  if (!/^\d{4}-\d{2}$/.test(monthKey)) monthKey = previousMonthKeyTokyo(new Date());

  const already = await sql().query('SELECT month_key FROM wisdom_seed_distributions WHERE month_key = $1', [monthKey]);
  if (already.length > 0) return { ok: false, error: 'already_distributed' };

  const topRows = await sql().query(
    `SELECT rl.student_id, COUNT(lk.*)::int AS like_count
     FROM reading_log rl
     LEFT JOIN reading_likes lk ON lk.reading_log_id = rl.id
     WHERE rl.month_key = $1
     GROUP BY rl.student_id
     HAVING COUNT(lk.*) > 0
     ORDER BY like_count DESC
     LIMIT $2`,
    [monthKey, READING_HP_TIER_TOP_N]
  );
  if (topRows.length === 0) {
    return { ok: false, error: 'no_likes_this_month' };
  }

  // HPボーナスはtier(定額)ごとにまとめてUPDATEする。賢さの種は上位3名だけ別途+1。
  const tierGroups = {};
  topRows.forEach((r, idx) => {
    const rank = idx + 1;
    const hp = hpTierForRank_(rank);
    if (hp > 0) {
      if (!tierGroups[hp]) tierGroups[hp] = [];
      tierGroups[hp].push(r.student_id);
    }
  });
  for (const hpStr of Object.keys(tierGroups)) {
    const hp = Number(hpStr);
    await sql().query('UPDATE students SET hp = hp + $1 WHERE id = ANY($2)', [hp, tierGroups[hpStr]]);
  }

  const recipientIds = topRows.slice(0, WISDOM_SEED_TOP_N).map((r) => r.student_id);
  if (recipientIds.length > 0) {
    await sql().query('UPDATE students SET wisdom_seed_count = wisdom_seed_count + 1 WHERE id = ANY($1)', [recipientIds]);
  }
  await sql().query(
    'INSERT INTO wisdom_seed_distributions (month_key, distributed_at, recipient_ids) VALUES ($1, now(), $2)',
    [monthKey, JSON.stringify(topRows)]
  );
  return { ok: true, monthKey, recipients: topRows, wisdomSeedRecipientIds: recipientIds };
}

module.exports = {
  handleSubmitReading, handleReadingRanking, handleLikeReading, handleEditReading,
  READING_MP, READING_HP, READING_REVIEW_MIN_LENGTH, handleDistributeWisdomSeeds,
};
