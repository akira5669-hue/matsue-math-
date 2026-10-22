const { sql } = require('../db');
const { findStudent } = require('../students');
const { dateKeyTokyo } = require('../util');

// 4コマ漫画(2026-10-19〜)。
// ・読む：1日1作品まで。10MPか20HPのどちらかを払って読める。一度払って読んだ作品は
//   次の日以降もいつでも無料で読み直せる(「1日1つ」は新しく読む作品の数の制限)。
// ・買い取り：勉強や松江塾に関する4コマ漫画を描いて画像で送ると300MP。1日2作品まで(言葉が書いていない漫画は認めない)、
//   MANGA_BUYBACK_DEADLINEまで。送られた画像は00001(先生)だけが見られ、先生が加工して掲載する。
// ・2026-10-20から：言葉が書いていない漫画にMPを払わないよう、送った時点ではMPを入れず
//   (status='pending')、00001が「認める」を押したときに300MPを入れる。「認めない」はMPなし。
//   status列がNULLの行は、この仕組みより前に送られて既にMPを払った分。
const MANGA_VIEW_COST_MP = 10;
const MANGA_VIEW_COST_HP = 20;
// 期間限定の半額セール(5MPか10HP)。
const MANGA_SALE_START = '2026-10-21';
const MANGA_SALE_END = '2026-10-31';
function viewCost_(today) {
  const sale = today >= MANGA_SALE_START && today <= MANGA_SALE_END;
  return { sale, mp: sale ? MANGA_VIEW_COST_MP / 2 : MANGA_VIEW_COST_MP, hp: sale ? MANGA_VIEW_COST_HP / 2 : MANGA_VIEW_COST_HP };
}
const MANGA_BUYBACK_MP = 300;
const MANGA_BUYBACK_DEADLINE = '2026-10-31';
const MANGA_MAX_BASE64_LENGTH = 4 * 1024 * 1024;
const MANGA_SUBMIT_PER_DAY = 2;
// 無料公開の作品(払わなくても読めるので、いいねもできる)。app.jsのMANGA_LIST_のfree:trueと合わせる。
const MANGA_FREE_IDS = ['m005'];
// 1日に送れる数を1→2に増やしたとき、テーブルの UNIQUE (student_id, date_key) を変えずに済むよう、
// 2作品目は date_key を「日付#2」にして入れる(同時に送っても2作品を超えない)。
function submitDateKeys_(today) {
  const keys = [today];
  for (let i = 2; i <= MANGA_SUBMIT_PER_DAY; i++) keys.push(today + '#' + i);
  return keys;
}

// 専用テーブルは初回呼び出し時に作る(既存テーブルには触らない)。
let tablesReady = null;
function ensureTables_() {
  if (!tablesReady) {
    tablesReady = (async () => {
      await sql().query(`CREATE TABLE IF NOT EXISTS manga_views (
        student_id TEXT NOT NULL, date_key TEXT NOT NULL, manga_id TEXT NOT NULL, pay_with TEXT NOT NULL,
        ts TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (student_id, date_key))`, []);
      await sql().query(`CREATE TABLE IF NOT EXISTS manga_submissions (
        id SERIAL PRIMARY KEY, ts TIMESTAMPTZ NOT NULL DEFAULT now(), student_id TEXT NOT NULL, name TEXT, grade TEXT,
        date_key TEXT NOT NULL, mime TEXT NOT NULL, image_base64 TEXT NOT NULL, mp_awarded INTEGER NOT NULL DEFAULT 0,
        UNIQUE (student_id, date_key))`, []);
      await sql().query('ALTER TABLE manga_submissions ADD COLUMN IF NOT EXISTS status TEXT', []);
      // いいね(2026-10-22〜)：1人1作品に1回。もう一度押すと取り消し。
      await sql().query(`CREATE TABLE IF NOT EXISTS manga_likes (
        student_id TEXT NOT NULL, manga_id TEXT NOT NULL, ts TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (student_id, manga_id))`, []);
    })().catch((e) => { tablesReady = null; throw e; });
  }
  return tablesReady;
}

async function likeSummary_(id) {
  const rows = await sql().query('SELECT manga_id, count(*)::int AS n, bool_or(student_id = $1) AS mine FROM manga_likes GROUP BY manga_id', [id]);
  const counts = {};
  const mine = [];
  rows.forEach((r) => { counts[r.manga_id] = Number(r.n) || 0; if (r.mine) mine.push(r.manga_id); });
  return { counts, mine };
}

// いいね/取り消し。読んだ作品(払って読んだ作品か無料公開の作品)だけ押せる。
async function handleMangaLike(body) {
  const id = String(body.id || '').trim();
  const mangaId = String(body.mangaId || '').trim();
  if (!id || !/^[a-z0-9_-]{1,40}$/i.test(mangaId)) return { ok: false, error: 'missing_fields' };
  await ensureTables_();
  if (!MANGA_FREE_IDS.includes(mangaId)) {
    const v = await sql().query('SELECT 1 FROM manga_views WHERE student_id = $1 AND manga_id = $2 LIMIT 1', [id, mangaId]);
    if (v.length === 0) return { ok: false, error: 'not_read' };
  }
  const del = await sql().query('DELETE FROM manga_likes WHERE student_id = $1 AND manga_id = $2 RETURNING manga_id', [id, mangaId]);
  if (del.length === 0) await sql().query('INSERT INTO manga_likes (student_id, manga_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, mangaId]);
  const likes = await likeSummary_(id);
  return { ok: true, liked: del.length === 0, likeCounts: likes.counts, myLikes: likes.mine };
}

async function mangaStatus_(id) {
  const today = dateKeyTokyo(new Date());
  const views = await sql().query('SELECT date_key, manga_id FROM manga_views WHERE student_id = $1', [id]);
  const sub = await sql().query('SELECT id FROM manga_submissions WHERE student_id = $1 AND date_key = ANY($2)', [id, submitDateKeys_(today)]);
  const mine = await sql().query('SELECT status FROM manga_submissions WHERE student_id = $1', [id]);
  const todayView = views.find((v) => v.date_key === today);
  const likes = await likeSummary_(id);
  return {
    likeCounts: likes.counts,
    myLikes: likes.mine,
    todayMangaId: todayView ? todayView.manga_id : null,
    unlocked: Array.from(new Set(views.map((v) => v.manga_id))),
    submittedToday: sub.length >= MANGA_SUBMIT_PER_DAY,
    submittedCountToday: sub.length,
    submitPerDay: MANGA_SUBMIT_PER_DAY,
    myPending: mine.filter((r) => r.status === 'pending').length,
    myApproved: mine.filter((r) => r.status === 'approved' || r.status === null).length,
    myRejected: mine.filter((r) => r.status === 'rejected').length,
    buybackOpen: today <= MANGA_BUYBACK_DEADLINE,
    costMp: viewCost_(today).mp,
    costHp: viewCost_(today).hp,
    sale: viewCost_(today).sale,
    saleEnd: MANGA_SALE_END,
  };
}

async function handleMangaStatus(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  await ensureTables_();
  return Object.assign({ ok: true }, await mangaStatus_(id));
}

async function handleMangaView(body) {
  const id = String(body.id || '').trim();
  const mangaId = String(body.mangaId || '').trim();
  const payWith = body.payWith === 'hp' ? 'hp' : 'mp';
  if (!id || !/^[a-z0-9_-]{1,40}$/i.test(mangaId)) return { ok: false, error: 'missing_fields' };
  await ensureTables_();
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  const st = await mangaStatus_(id);
  if (st.unlocked.includes(mangaId)) return { ok: true, free: true, remainingPoints: row.points, hp: Number(row.hp) || 0 };
  if (st.todayMangaId) return { ok: false, error: 'already_viewed_today' };
  const cost = viewCost_(dateKeyTokyo(new Date()));
  if (payWith === 'mp' && row.points < cost.mp) return { ok: false, error: 'insufficient_points' };
  // HPで払うときは、払ったあとにHPが0にならないようにする。
  if (payWith === 'hp' && (Number(row.hp) || 0) <= cost.hp) return { ok: false, error: 'insufficient_hp' };

  const today = dateKeyTokyo(new Date());
  const ins = await sql().query(
    'INSERT INTO manga_views (student_id, date_key, manga_id, pay_with) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING manga_id',
    [id, today, mangaId, payWith]
  );
  if (ins.length === 0) return { ok: false, error: 'already_viewed_today' };
  const upd = payWith === 'mp'
    ? await sql().query('UPDATE students SET points = points - $1 WHERE id = $2 AND points >= $1 RETURNING points, hp', [cost.mp, id])
    : await sql().query('UPDATE students SET hp = hp - $1 WHERE id = $2 AND hp > $1 RETURNING points, hp', [cost.hp, id]);
  if (upd.length === 0) {
    await sql().query('DELETE FROM manga_views WHERE student_id = $1 AND date_key = $2', [id, today]);
    return { ok: false, error: payWith === 'mp' ? 'insufficient_points' : 'insufficient_hp' };
  }
  return { ok: true, free: false, remainingPoints: Number(upd[0].points) || 0, hp: Number(upd[0].hp) || 0 };
}

async function handleMangaSubmit(body) {
  const id = String(body.id || '').trim();
  const imageBase64 = String(body.imageBase64 || '');
  let mimeType = String(body.mimeType || 'image/jpeg').trim();
  if (mimeType !== 'image/jpeg' && mimeType !== 'image/png') mimeType = 'image/jpeg';
  if (!id || !imageBase64) return { ok: false, error: 'missing_fields' };
  if (imageBase64.length > MANGA_MAX_BASE64_LENGTH) return { ok: false, error: 'too_large' };
  await ensureTables_();
  const today = dateKeyTokyo(new Date());
  if (today > MANGA_BUYBACK_DEADLINE) return { ok: false, error: 'submission_closed' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  let ins = [];
  let slot = 0;
  for (const key of submitDateKeys_(today)) {
    slot++;
    ins = await sql().query(
      "INSERT INTO manga_submissions (student_id, name, grade, date_key, mime, image_base64, mp_awarded, status) VALUES ($1, $2, $3, $4, $5, $6, 0, 'pending') ON CONFLICT DO NOTHING RETURNING id",
      [id, row.name, row.grade, key, mimeType, imageBase64]
    );
    if (ins.length > 0) break;
  }
  if (ins.length === 0) return { ok: false, error: 'already_submitted_today' };
  return { ok: true, pending: true, pointsOnApproval: MANGA_BUYBACK_MP, submittedCountToday: slot, submitPerDay: MANGA_SUBMIT_PER_DAY };
}

// 00001限定：送られた漫画の一覧(画像本体は含めない)。
async function handleMangaSubmissions(body) {
  if (String(body.id || '').trim() !== '00001') return { ok: false, error: 'forbidden' };
  await ensureTables_();
  const rows = await sql().query('SELECT id, ts, student_id, name, grade, status, mp_awarded FROM manga_submissions ORDER BY ts DESC LIMIT 200', []);
  return { ok: true, submissions: rows.map((r) => ({ id: r.id, ts: r.ts, studentId: r.student_id, name: r.name, grade: r.grade, status: r.status || 'approved', mpAwarded: Number(r.mp_awarded) || 0 })) };
}

// 00001限定：送られた漫画を「認める」(+300MP)か「認めない」(MPなし)にする。確認待ちのものだけ変えられる。
async function handleMangaReview(body) {
  if (String(body.id || '').trim() !== '00001') return { ok: false, error: 'forbidden' };
  await ensureTables_();
  const approve = body.approve === true;
  const upd = await sql().query(
    "UPDATE manga_submissions SET status = $1, mp_awarded = $2 WHERE id = $3 AND status = 'pending' RETURNING student_id",
    [approve ? 'approved' : 'rejected', approve ? MANGA_BUYBACK_MP : 0, Number(body.submissionId) || 0]
  );
  if (upd.length === 0) return { ok: false, error: 'not_pending' };
  if (approve) await sql().query('UPDATE students SET points = points + $1 WHERE id = $2', [MANGA_BUYBACK_MP, upd[0].student_id]);
  return { ok: true, status: approve ? 'approved' : 'rejected', mpAwarded: approve ? MANGA_BUYBACK_MP : 0 };
}

// 00001限定：送られた漫画の画像1枚。
async function handleMangaSubmissionImage(body) {
  if (String(body.id || '').trim() !== '00001') return { ok: false, error: 'forbidden' };
  await ensureTables_();
  const rows = await sql().query('SELECT mime, image_base64 FROM manga_submissions WHERE id = $1', [Number(body.submissionId) || 0]);
  if (rows.length === 0) return { ok: false, error: 'not_found' };
  return { ok: true, mimeType: rows[0].mime, imageBase64: rows[0].image_base64 };
}

module.exports = {
  handleMangaStatus, handleMangaView, handleMangaSubmit, handleMangaSubmissions, handleMangaSubmissionImage, handleMangaReview, handleMangaLike,
  MANGA_VIEW_COST_MP, MANGA_VIEW_COST_HP, MANGA_BUYBACK_MP, MANGA_BUYBACK_DEADLINE,
};
