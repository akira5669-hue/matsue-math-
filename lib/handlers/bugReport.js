const { sql } = require('../db');
const { findStudent } = require('../students');
const { sendAdminEmail } = require('../mail');
const { dateKeyTokyo } = require('../util');

// 🐞バグ報告(2026-11-09〜)。アプリのまちがい(答えがおかしい・数がおかしい・動かないなど)を生徒が先生に送る。
// 送れるのはレベルBUG_MIN_LEVEL以上の生徒だけ(先生(00001)は条件なし)。1日BUG_PER_DAY件まで。
// 報告はbug_reportsに保存し、先生にメールでも届ける。画面写真(1枚・任意)は先生がアプリの一覧で見る。
// MPは自動では入らない(先生が確かめてから、ふだんどおり付与する)。
// Claudeもscripts/bug-reports.jsで報告を読んで直し、修正済み(fixed)やバグではない(not_bug)を記録する。先生の一覧にもその結果が出る。
const BUG_MIN_LEVEL = 300;
const BUG_PER_DAY = 3;
const TEXT_MAX = 1000;
const IMAGE_MAX_BASE64 = 3 * 1024 * 1024;
const PLACES = ['計算', '文章題', '理科', '図形トレーニング', '中学受験問題', '高校受験問題', 'ガチャ', '4コマ漫画', 'ランキング', 'なんでも屋・MP交換', 'その他'];

let tablesReady = null;
function ensureTables_() {
  if (!tablesReady) {
    tablesReady = sql().query(`CREATE TABLE IF NOT EXISTS bug_reports (
      id SERIAL PRIMARY KEY, ts TIMESTAMPTZ NOT NULL DEFAULT now(), date_key TEXT NOT NULL, student_id TEXT NOT NULL,
      name TEXT, grade TEXT, level INTEGER, place TEXT, what TEXT, detail TEXT, mime TEXT, image_base64 TEXT,
      status TEXT NOT NULL DEFAULT 'new')`, [])
      // Claudeが確かめた結果(scripts/bug-reports.js)：status='fixed'(修正済み)/'not_bug'(バグではない)と、そのメモ
      .then(() => sql().query('ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS fix_note TEXT, ADD COLUMN IF NOT EXISTS fixed_at TIMESTAMPTZ', []))
      .catch((e) => { tablesReady = null; throw e; });
  }
  return tablesReady;
}

async function todayCount_(id, today) {
  const r = await sql().query('SELECT count(*)::int AS n FROM bug_reports WHERE student_id = $1 AND date_key = $2', [id, today]);
  return Number(r[0].n) || 0;
}

async function handleBugReportStatus(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  await ensureTables_();
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  const level = Number(row.level) || 1;
  const n = await todayCount_(id, dateKeyTokyo(new Date()));
  return { ok: true, level, minLevel: BUG_MIN_LEVEL, allowed: id === '00001' || level >= BUG_MIN_LEVEL, todayCount: n, perDay: BUG_PER_DAY, places: PLACES };
}

async function handleBugReportSubmit(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  await ensureTables_();
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  const level = Number(row.level) || 1;
  if (id !== '00001' && level < BUG_MIN_LEVEL) return { ok: false, error: 'level_low', level, minLevel: BUG_MIN_LEVEL };
  const place = PLACES.includes(body.place) ? body.place : 'その他';
  const what = String(body.what || '').trim().slice(0, TEXT_MAX);
  const detail = String(body.detail || '').trim().slice(0, TEXT_MAX);
  if (what.length < 5) return { ok: false, error: 'too_short' };
  let img = String(body.imageBase64 || '');
  if (img.length > IMAGE_MAX_BASE64) return { ok: false, error: 'too_large' };
  if (img && !/^[A-Za-z0-9+/=]+$/.test(img)) img = '';
  const today = dateKeyTokyo(new Date());
  // 1日BUG_PER_DAY件まで(同時に送られても超えないよう、1つの文で数えてから入れる)
  const ins = await sql().query(
    `INSERT INTO bug_reports (date_key, student_id, name, grade, level, place, what, detail, mime, image_base64)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
     WHERE (SELECT count(*) FROM bug_reports WHERE student_id = $2 AND date_key = $1) < $11 RETURNING id`,
    [today, id, row.name, row.grade || '', level, place, what, detail, img ? 'image/jpeg' : null, img || null, BUG_PER_DAY]
  );
  if (!ins.length) return { ok: false, error: 'limit', perDay: BUG_PER_DAY };
  await sendAdminEmail(
    `【バグ報告】${place}：${row.name}（${row.grade || ''}・Lv.${level}）`,
    [
      `報告番号: ${ins[0].id}`,
      `ID: ${id}　名前: ${row.name}　学年: ${row.grade || ''}　Lv.${level}`,
      `場所: ${place}`,
      '',
      `■何が起きたか\n${what}`,
      '',
      `■問題文・選んだ答え・正解とされた答えなど\n${detail || '（なし）'}`,
      '',
      img ? '📷 画面の写真あり（アプリの「🐞バグ報告」→先生用の一覧で見られます）' : '（画面の写真なし）',
    ].join('\n')
  );
  return { ok: true, reportId: ins[0].id, todayCount: await todayCount_(id, today), perDay: BUG_PER_DAY };
}

// 先生(00001)用：報告の一覧(新しい順・50件)と、写真・対応済みの切りかえ。
async function handleBugReportList(body) {
  if (String(body.id || '').trim() !== '00001') return { ok: false, error: 'forbidden' };
  await ensureTables_();
  const rows = await sql().query('SELECT id, ts, student_id, name, grade, level, place, what, detail, status, fix_note, image_base64 IS NOT NULL AS has_image FROM bug_reports ORDER BY id DESC LIMIT 50', []);
  return { ok: true, reports: rows.map((r) => ({ id: r.id, ts: r.ts, studentId: r.student_id, name: r.name, grade: r.grade, level: r.level, place: r.place, what: r.what, detail: r.detail, status: r.status, fixNote: r.fix_note || '', hasImage: !!r.has_image })) };
}
async function handleBugReportImage(body) {
  if (String(body.id || '').trim() !== '00001') return { ok: false, error: 'forbidden' };
  await ensureTables_();
  const rows = await sql().query('SELECT mime, image_base64 FROM bug_reports WHERE id = $1', [Number(body.reportId) || 0]);
  if (!rows.length || !rows[0].image_base64) return { ok: false, error: 'not_found' };
  return { ok: true, mimeType: rows[0].mime, imageBase64: rows[0].image_base64 };
}
async function handleBugReportDone(body) {
  if (String(body.id || '').trim() !== '00001') return { ok: false, error: 'forbidden' };
  await ensureTables_();
  const st = body.done ? 'done' : 'new';
  const r = await sql().query('UPDATE bug_reports SET status = $1 WHERE id = $2 RETURNING id, status', [st, Number(body.reportId) || 0]);
  return r.length ? { ok: true, status: r[0].status } : { ok: false, error: 'not_found' };
}

module.exports = { handleBugReportStatus, handleBugReportSubmit, handleBugReportList, handleBugReportImage, handleBugReportDone };
