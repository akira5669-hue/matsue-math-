const { put, get, del } = require('@vercel/blob');
const { sql } = require('../db');
const { RANKING_TEST_TIERS } = require('../testPhotoConfig');

// 数学ランキングテストの「先生からの解説・弱点アドバイス」と「直しの提出(+100MP)」(2026-10-27〜)。
// test_photos は21日で消えるので、解説や直しはこの表に別に残す(photo_id = test_photos.id)。
// 直しは1回の提出につき1回まで。先生(00001)が確認して「認める」と+100MP。
const RANKING_FIX_MP = 100;
const ADMIN_ID = '00001';

let tablesReady = null;
function ensureTables_() {
  if (!tablesReady) {
    tablesReady = (async () => {
      await sql().query(`CREATE TABLE IF NOT EXISTS ranking_test_reviews (
        photo_id BIGINT PRIMARY KEY, ts TIMESTAMPTZ NOT NULL, student_id TEXT NOT NULL, name TEXT, grade TEXT,
        score_tier TEXT, photo_url TEXT,
        explanation TEXT, advice TEXT, expl_mime TEXT, expl_image_base64 TEXT, feedback_at TIMESTAMPTZ,
        fix_photo_url TEXT, fix_ts TIMESTAMPTZ, fix_status TEXT, fix_mp INTEGER NOT NULL DEFAULT 0)`, []);
      await sql().query('CREATE INDEX IF NOT EXISTS idx_ranking_test_reviews_student ON ranking_test_reviews (student_id)', []);
      // それまでに提出されたランキングテストも一覧に出す(まだ消えていない分だけ)。
      await sql().query(`INSERT INTO ranking_test_reviews (photo_id, ts, student_id, name, score_tier, photo_url)
        SELECT id, ts, student_id, name, score_tier, drive_file_id FROM test_photos WHERE test_type = 'ranking'
        ON CONFLICT DO NOTHING`, []);
    })().catch((e) => { tablesReady = null; throw e; });
  }
  return tablesReady;
}

// testPhoto.js からランキングテスト提出のたびに呼ぶ。
async function recordRankingSubmission(photoId, row, tierId, photoUrl) {
  await ensureTables_();
  await sql().query(
    `INSERT INTO ranking_test_reviews (photo_id, ts, student_id, name, grade, score_tier, photo_url)
     VALUES ($1, now(), $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
    [photoId, row.id, row.name, row.grade, tierId, photoUrl]
  );
}

function tierLabel_(id) {
  const t = RANKING_TEST_TIERS.find((x) => x.id === id);
  return t ? t.label : '';
}

async function addNotice_(studentId, text) {
  await sql().query(
    "UPDATE students SET pending_notice = CASE WHEN pending_notice IS NULL OR pending_notice = '' THEN $1 ELSE pending_notice || E'\\n\\n' || $1 END WHERE id = $2",
    [text, studentId]
  );
}

async function blobToBase64_(url) {
  const r = await get(url, { access: 'private' });
  if (!r || !r.stream) return null;
  const chunks = [];
  for await (const c of r.stream) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks).toString('base64');
}

// 生徒用：自分のランキングテスト提出と、先生からの解説・直しの状況。
async function handleRankingReviewStatus(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_fields' };
  await ensureTables_();
  const rows = await sql().query(
    `SELECT photo_id, ts, score_tier, explanation, advice, (expl_image_base64 IS NOT NULL) AS has_img, feedback_at, fix_ts, fix_status, fix_mp
     FROM ranking_test_reviews WHERE student_id = $1 ORDER BY ts DESC LIMIT 6`,
    [id]
  );
  return {
    ok: true,
    fixMp: RANKING_FIX_MP,
    reviews: rows.map((r) => ({
      photoId: String(r.photo_id), ts: r.ts, tierLabel: tierLabel_(r.score_tier),
      explanation: r.explanation || '', advice: r.advice || '', hasExplImage: !!r.has_img, feedbackAt: r.feedback_at,
      fixTs: r.fix_ts, fixStatus: r.fix_status || '', fixMp: Number(r.fix_mp) || 0,
    })),
  };
}

// 生徒用：先生の解説画像。自分の分だけ見られる。
async function handleRankingReviewExplImage(body) {
  const id = String(body.id || '').trim();
  await ensureTables_();
  const rows = await sql().query(
    'SELECT student_id, expl_mime, expl_image_base64 FROM ranking_test_reviews WHERE photo_id = $1',
    [String(body.photoId || '0')]
  );
  if (!rows.length || !rows[0].expl_image_base64) return { ok: false, error: 'not_found' };
  if (rows[0].student_id !== id && id !== ADMIN_ID) return { ok: false, error: 'forbidden' };
  return { ok: true, mimeType: rows[0].expl_mime || 'image/jpeg', imageBase64: rows[0].expl_image_base64 };
}

// 生徒用：直しの写真を送る(1回の提出につき1回。先生が認めると+100MP)。
async function handleRankingFixSubmit(body) {
  const id = String(body.id || '').trim();
  const photoId = String(body.photoId || '0');
  if (!id || !body.imageBase64) return { ok: false, error: 'missing_fields' };
  await ensureTables_();
  const rows = await sql().query('SELECT student_id, fix_status FROM ranking_test_reviews WHERE photo_id = $1', [photoId]);
  if (!rows.length || rows[0].student_id !== id) return { ok: false, error: 'not_found' };
  if (rows[0].fix_status) return { ok: false, error: 'already_submitted' };
  const bytes = Buffer.from(body.imageBase64, 'base64');
  const blob = await put(`ranking-fix/${id}_${Date.now()}.jpg`, bytes, { access: 'private', contentType: 'image/jpeg', addRandomSuffix: true });
  const upd = await sql().query(
    "UPDATE ranking_test_reviews SET fix_photo_url = $1, fix_ts = now(), fix_status = 'pending' WHERE photo_id = $2 AND fix_status IS NULL RETURNING photo_id",
    [blob.url, photoId]
  );
  if (!upd.length) {
    try { await del(blob.url); } catch (e) { /* 無視 */ }
    return { ok: false, error: 'already_submitted' };
  }
  return { ok: true, fixMp: RANKING_FIX_MP };
}

// 00001限定：提出の一覧。
async function handleRankingReviewList(body) {
  if (String(body.id || '').trim() !== ADMIN_ID) return { ok: false, error: 'forbidden' };
  await ensureTables_();
  const rows = await sql().query(
    `SELECT r.photo_id, r.ts, r.student_id, r.name, COALESCE(r.grade, s.grade) AS grade, r.score_tier, r.explanation, r.advice,
       (r.expl_image_base64 IS NOT NULL) AS has_img, r.feedback_at, r.fix_ts, r.fix_status, r.fix_mp,
       EXISTS (SELECT 1 FROM test_photos t WHERE t.id = r.photo_id) AS photo_alive
     FROM ranking_test_reviews r LEFT JOIN students s ON s.id = r.student_id
     ORDER BY (r.fix_status = 'pending') DESC NULLS LAST, r.ts DESC LIMIT 200`,
    []
  );
  return {
    ok: true,
    fixMp: RANKING_FIX_MP,
    reviews: rows.map((r) => ({
      photoId: String(r.photo_id), ts: r.ts, studentId: r.student_id, name: r.name || '', grade: r.grade || '',
      tierLabel: tierLabel_(r.score_tier), explanation: r.explanation || '', advice: r.advice || '', hasExplImage: !!r.has_img,
      feedbackAt: r.feedback_at, fixTs: r.fix_ts, fixStatus: r.fix_status || '', fixMp: Number(r.fix_mp) || 0,
      photoAlive: !!r.photo_alive,
    })),
  };
}

// 00001限定：答案(kind='answer')か直し(kind='fix')の画像。
async function handleRankingReviewPhoto(body) {
  if (String(body.id || '').trim() !== ADMIN_ID) return { ok: false, error: 'forbidden' };
  await ensureTables_();
  const rows = await sql().query('SELECT photo_url, fix_photo_url FROM ranking_test_reviews WHERE photo_id = $1', [String(body.photoId || '0')]);
  if (!rows.length) return { ok: false, error: 'not_found' };
  const url = body.kind === 'fix' ? rows[0].fix_photo_url : rows[0].photo_url;
  if (!url) return { ok: false, error: 'not_found' };
  try {
    const b64 = await blobToBase64_(url);
    if (!b64) return { ok: false, error: 'not_found' };
    return { ok: true, mimeType: 'image/jpeg', imageBase64: b64 };
  } catch (e) {
    return { ok: false, error: 'not_found' };
  }
}

// 00001限定：解説・弱点アドバイスを送る(もう一度送ると上書き)。画像は任意。
async function handleRankingReviewFeedback(body) {
  if (String(body.id || '').trim() !== ADMIN_ID) return { ok: false, error: 'forbidden' };
  await ensureTables_();
  const photoId = String(body.photoId || '0');
  const explanation = String(body.explanation || '').trim().slice(0, 4000);
  const advice = String(body.advice || '').trim().slice(0, 4000);
  const imageBase64 = body.imageBase64 ? String(body.imageBase64) : null;
  const removeImage = body.removeImage === true;
  if (!explanation && !advice && !imageBase64) return { ok: false, error: 'empty' };
  const upd = await sql().query(
    `UPDATE ranking_test_reviews SET explanation = $1, advice = $2, feedback_at = now(),
       expl_mime = CASE WHEN $3::text IS NOT NULL THEN 'image/jpeg' WHEN $4 THEN NULL ELSE expl_mime END,
       expl_image_base64 = CASE WHEN $3::text IS NOT NULL THEN $3 WHEN $4 THEN NULL ELSE expl_image_base64 END
     WHERE photo_id = $5 RETURNING student_id`,
    [explanation, advice, imageBase64, removeImage, photoId]
  );
  if (!upd.length) return { ok: false, error: 'not_found' };
  await addNotice_(upd[0].student_id, '📊 数学ランキングテストの解説・アドバイスが先生から届いたよ！\n「テスト提出」→「数学ランキングテスト」で見てね。直しの写真を送ると +' + RANKING_FIX_MP + 'MP もらえるよ。');
  return { ok: true };
}

// 00001限定：直しを認める(+100MP)／認めない。
async function handleRankingFixReview(body) {
  if (String(body.id || '').trim() !== ADMIN_ID) return { ok: false, error: 'forbidden' };
  await ensureTables_();
  const approve = body.approve === true;
  const upd = await sql().query(
    "UPDATE ranking_test_reviews SET fix_status = $1, fix_mp = $2 WHERE photo_id = $3 AND fix_status = 'pending' RETURNING student_id",
    [approve ? 'approved' : 'rejected', approve ? RANKING_FIX_MP : 0, String(body.photoId || '0')]
  );
  if (!upd.length) return { ok: false, error: 'not_pending' };
  if (approve) {
    await sql().query('UPDATE students SET points = points + $1 WHERE id = $2', [RANKING_FIX_MP, upd[0].student_id]);
    await addNotice_(upd[0].student_id, '✏️ 数学ランキングテストの直しを先生が確認しました！ +' + RANKING_FIX_MP + 'MP！よくがんばったね！');
  } else {
    // 認めなかった時は、もう一度送り直せるようにする。
    await sql().query("UPDATE ranking_test_reviews SET fix_status = NULL, fix_ts = NULL WHERE photo_id = $1", [String(body.photoId || '0')]);
    await addNotice_(upd[0].student_id, '✏️ 数学ランキングテストの直しは、まだ足りないところがあるみたい。もう一度直して送ってね。');
  }
  return { ok: true, status: approve ? 'approved' : 'rejected', fixMp: approve ? RANKING_FIX_MP : 0 };
}

module.exports = {
  recordRankingSubmission, handleRankingReviewStatus, handleRankingReviewExplImage, handleRankingFixSubmit,
  handleRankingReviewList, handleRankingReviewPhoto, handleRankingReviewFeedback, handleRankingFixReview, RANKING_FIX_MP,
};
