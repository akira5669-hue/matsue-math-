const { sql } = require('../db');
const { findStudent } = require('../students');
const { dateKeyTokyo } = require('../util');

// 4コマ漫画(2026-10-19〜)。
// ・読む：1日1作品まで。10MPか20HPのどちらかを払って読める。一度払って読んだ作品は
//   次の日以降もいつでも無料で読み直せる(「1日1つ」は新しく読む作品の数の制限)。
// ・買い取り：勉強や松江塾に関する4コマ漫画を描いて画像で送ると300MP。1日1作品まで、
//   MANGA_BUYBACK_DEADLINEまで。送られた画像は00001(先生)だけが見られ、先生が加工して掲載する。
const MANGA_VIEW_COST_MP = 10;
const MANGA_VIEW_COST_HP = 20;
const MANGA_BUYBACK_MP = 300;
const MANGA_BUYBACK_DEADLINE = '2026-10-31';
const MANGA_MAX_BASE64_LENGTH = 4 * 1024 * 1024;

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
    })().catch((e) => { tablesReady = null; throw e; });
  }
  return tablesReady;
}

async function mangaStatus_(id) {
  const today = dateKeyTokyo(new Date());
  const views = await sql().query('SELECT date_key, manga_id FROM manga_views WHERE student_id = $1', [id]);
  const sub = await sql().query('SELECT id FROM manga_submissions WHERE student_id = $1 AND date_key = $2', [id, today]);
  const todayView = views.find((v) => v.date_key === today);
  return {
    todayMangaId: todayView ? todayView.manga_id : null,
    unlocked: Array.from(new Set(views.map((v) => v.manga_id))),
    submittedToday: sub.length > 0,
    buybackOpen: today <= MANGA_BUYBACK_DEADLINE,
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
  if (payWith === 'mp' && row.points < MANGA_VIEW_COST_MP) return { ok: false, error: 'insufficient_points' };
  // HPで払うときは、払ったあとにHPが0にならないようにする。
  if (payWith === 'hp' && (Number(row.hp) || 0) <= MANGA_VIEW_COST_HP) return { ok: false, error: 'insufficient_hp' };

  const today = dateKeyTokyo(new Date());
  const ins = await sql().query(
    'INSERT INTO manga_views (student_id, date_key, manga_id, pay_with) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING manga_id',
    [id, today, mangaId, payWith]
  );
  if (ins.length === 0) return { ok: false, error: 'already_viewed_today' };
  const upd = payWith === 'mp'
    ? await sql().query('UPDATE students SET points = points - $1 WHERE id = $2 AND points >= $1 RETURNING points, hp', [MANGA_VIEW_COST_MP, id])
    : await sql().query('UPDATE students SET hp = hp - $1 WHERE id = $2 AND hp > $1 RETURNING points, hp', [MANGA_VIEW_COST_HP, id]);
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
  const ins = await sql().query(
    'INSERT INTO manga_submissions (student_id, name, grade, date_key, mime, image_base64, mp_awarded) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING RETURNING id',
    [id, row.name, row.grade, today, mimeType, imageBase64, MANGA_BUYBACK_MP]
  );
  if (ins.length === 0) return { ok: false, error: 'already_submitted_today' };
  const upd = await sql().query('UPDATE students SET points = points + $1 WHERE id = $2 RETURNING points', [MANGA_BUYBACK_MP, id]);
  return { ok: true, pointsAwarded: MANGA_BUYBACK_MP, newTotalPoints: Number(upd[0].points) || 0 };
}

// 00001限定：送られた漫画の一覧(画像本体は含めない)。
async function handleMangaSubmissions(body) {
  if (String(body.id || '').trim() !== '00001') return { ok: false, error: 'forbidden' };
  await ensureTables_();
  const rows = await sql().query('SELECT id, ts, student_id, name, grade FROM manga_submissions ORDER BY ts DESC LIMIT 200', []);
  return { ok: true, submissions: rows.map((r) => ({ id: r.id, ts: r.ts, studentId: r.student_id, name: r.name, grade: r.grade })) };
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
  handleMangaStatus, handleMangaView, handleMangaSubmit, handleMangaSubmissions, handleMangaSubmissionImage,
  MANGA_VIEW_COST_MP, MANGA_VIEW_COST_HP, MANGA_BUYBACK_MP, MANGA_BUYBACK_DEADLINE,
};
