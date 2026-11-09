const { sql } = require('../db');
const { findStudent } = require('../students');
const { dateKeyTokyo } = require('../util');

// 超絶！図形！トレーニング！！
// 問題(積み木の数・見え方・展開図・回転体・回転/裏返し)は端末で作って答え合わせする。
// 2026-11-02から：正解でHP+1・まちがいでHP-1(HPは端末で増減してふだんの同期で送る)。MPは増えない。
// ここでは「今日何問解いたか」と「今日何問正解したか」を数える。1日ZUKEI_GACHA_UNLOCK_問以上「正解」すると、その日のサイコロガチャが引ける(gacha.js)。
// (2026-11-04から「解いた数」ではなく「正解した数」で判定。cor_dateとcor_todayで数える)
// 連打で数を稼げないよう、前の回答からZUKEI_MIN_INTERVAL_MS_より短い回答は数えない。
// 今は00001だけ(ZUKEI_OPEN_ALLをtrueにすると、ZUKEI_START以降は全員)。app.js側と揃えること。
const ZUKEI_GACHA_UNLOCK_ = 10;
// 🏫高校受験問題！(mode='koko')の正解は別に数える(koko_date/koko_today)。1日KOKO_PK_UNLOCK_問正解すると
// その日の⚽サッカーPKガチャが1回できる(2026-11-07先生の指示)。高校受験問題の正解はサイコロガチャには数えない。
const KOKO_PK_UNLOCK_ = 10;
const ZUKEI_MIN_INTERVAL_MS_ = 2000;
const ZUKEI_START = '2026-11-03';
const ZUKEI_OPEN_ALL = true;

function isActive_(id, today) {
  return id === '00001' || (ZUKEI_OPEN_ALL && today >= ZUKEI_START);
}

let tablesReady = null;
function ensureTables_() {
  if (!tablesReady) {
    tablesReady = sql().query(`CREATE TABLE IF NOT EXISTS zukei_progress (
      student_id TEXT PRIMARY KEY, mp_date TEXT NOT NULL DEFAULT '', mp_today INTEGER NOT NULL DEFAULT 0,
      total_correct INTEGER NOT NULL DEFAULT 0)`, [])
      .then(() => sql().query(`ALTER TABLE zukei_progress
        ADD COLUMN IF NOT EXISTS ans_date TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS ans_today INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS total_answers INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS last_answer_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS cor_date TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS cor_today INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS koko_date TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS koko_today INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS koko_ans INTEGER NOT NULL DEFAULT 0`, []))
      .catch((e) => { tablesReady = null; throw e; });
  }
  return tablesReady;
}

// 今日解いた問題数(図形・中学受験問題。2026-11-09から高校受験問題はkoko_ansで別に数える)。
async function zukeiAnsweredToday(id, today) {
  await ensureTables_();
  const rows = await sql().query('SELECT ans_date, ans_today FROM zukei_progress WHERE student_id = $1', [id]);
  return rows.length && rows[0].ans_date === today ? Number(rows[0].ans_today) || 0 : 0;
}

// 今日正解した問題数(サイコロガチャの判定に使う)。
async function zukeiCorrectToday(id, today) {
  await ensureTables_();
  const rows = await sql().query('SELECT cor_date, cor_today FROM zukei_progress WHERE student_id = $1', [id]);
  return rows.length && rows[0].cor_date === today ? Number(rows[0].cor_today) || 0 : 0;
}

// 今日🏫高校受験問題！で正解した問題数(サッカーPKガチャの判定に使う)。
async function zukeiKokoCorrectToday(id, today) {
  await ensureTables_();
  const rows = await sql().query('SELECT koko_date, koko_today FROM zukei_progress WHERE student_id = $1', [id]);
  return rows.length && rows[0].koko_date === today ? Number(rows[0].koko_today) || 0 : 0;
}

// 今日🏫高校受験問題！で解いた問題数(2026-11-09〜)。
async function zukeiKokoAnsweredToday(id, today) {
  await ensureTables_();
  const rows = await sql().query('SELECT koko_date, koko_ans FROM zukei_progress WHERE student_id = $1', [id]);
  return rows.length && rows[0].koko_date === today ? Number(rows[0].koko_ans) || 0 : 0;
}

async function handleZukeiStatus(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  const today = dateKeyTokyo(new Date());
  return { ok: true, active: isActive_(id, today), answeredToday: await zukeiAnsweredToday(id, today), correctToday: await zukeiCorrectToday(id, today), kokoCorrectToday: await zukeiKokoCorrectToday(id, today), kokoAnsweredToday: await zukeiKokoAnsweredToday(id, today), gachaUnlock: ZUKEI_GACHA_UNLOCK_, pkUnlock: KOKO_PK_UNLOCK_ };
}

async function handleZukeiAnswer(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  await ensureTables_();
  const today = dateKeyTokyo(new Date());
  if (!isActive_(id, today)) return { ok: false, error: 'not_active' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  const isKoko = body.mode === 'koko';
  const correct = body.correct === true ? 1 : 0;
  await sql().query('INSERT INTO zukei_progress (student_id) VALUES ($1) ON CONFLICT DO NOTHING', [id]);
  const up = await sql().query(
    `UPDATE zukei_progress SET ans_today = CASE WHEN ans_date = $2 THEN ans_today ELSE 0 END + $7, ans_date = $2,
       koko_ans = CASE WHEN koko_date = $2 THEN koko_ans ELSE 0 END + $8,
       cor_today = CASE WHEN cor_date = $2 THEN cor_today ELSE 0 END + $5, cor_date = $2,
       koko_today = CASE WHEN koko_date = $2 THEN koko_today ELSE 0 END + $6, koko_date = $2,
       total_answers = total_answers + 1, total_correct = total_correct + $3, last_answer_at = now()
     WHERE student_id = $1 AND (last_answer_at IS NULL OR last_answer_at < now() - ($4 || ' milliseconds')::interval) RETURNING ans_today, cor_today, koko_today, koko_ans`,
    [id, today, correct, String(ZUKEI_MIN_INTERVAL_MS_), isKoko ? 0 : correct, isKoko ? correct : 0, isKoko ? 0 : 1, isKoko ? 1 : 0]
  );
  const answeredToday = up.length ? Number(up[0].ans_today) || 0 : await zukeiAnsweredToday(id, today);
  const correctToday = up.length ? Number(up[0].cor_today) || 0 : await zukeiCorrectToday(id, today);
  const kokoCorrectToday = up.length ? Number(up[0].koko_today) || 0 : await zukeiKokoCorrectToday(id, today);
  const kokoAnsweredToday = up.length ? Number(up[0].koko_ans) || 0 : await zukeiKokoAnsweredToday(id, today);
  return { ok: true, counted: up.length > 0, answeredToday, correctToday, kokoCorrectToday, kokoAnsweredToday, gachaUnlock: ZUKEI_GACHA_UNLOCK_, pkUnlock: KOKO_PK_UNLOCK_ };
}

module.exports = { handleZukeiStatus, handleZukeiAnswer, zukeiAnsweredToday, zukeiCorrectToday, zukeiKokoCorrectToday, ZUKEI_GACHA_UNLOCK_, KOKO_PK_UNLOCK_ };
