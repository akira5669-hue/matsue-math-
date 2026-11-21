const { sql } = require('../db');
const { dateKeyTokyo } = require('../util');

// 📐作図にチャレンジの、今日の正解数(2026-11-22〜)。作図で1日15問正解すると野球ガチャができる(gacha.jsのBB_SAKUZU_UNLOCK_)。
// 正解のたびに端末(app.js)から sakuzuCorrect を呼ぶ。続けて送られても数えすぎないよう、前の正解から SAKUZU_GAP_SEC_ 秒たっていないものは数えない。
// (作図は1問かくのに何秒もかかるので、ふつうに解いていれば引っかからない)
const SAKUZU_GAP_SEC_ = 4;
let tableReady = null;
function ensureTable_() {
  if (!tableReady) {
    tableReady = sql().query(`CREATE TABLE IF NOT EXISTS sakuzu_daily (
      student_id TEXT NOT NULL, date_key TEXT NOT NULL, correct INTEGER NOT NULL DEFAULT 0,
      last_ts TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (student_id, date_key))`, [])
      .catch((e) => { tableReady = null; throw e; });
  }
  return tableReady;
}

async function sakuzuCorrectToday(id, today) {
  await ensureTable_();
  const r = await sql().query('SELECT correct FROM sakuzu_daily WHERE student_id = $1 AND date_key = $2', [id, today]);
  return r.length ? Number(r[0].correct) || 0 : 0;
}

async function handleSakuzuCorrect(body) {
  const id = String(body.id || '').trim();
  if (!id || id.length > 20) return { ok: false, error: 'missing_id' };
  await ensureTable_();
  const today = dateKeyTokyo(new Date());
  const up = await sql().query(
    `INSERT INTO sakuzu_daily (student_id, date_key, correct, last_ts) VALUES ($1, $2, 1, now())
     ON CONFLICT (student_id, date_key) DO UPDATE SET correct = sakuzu_daily.correct + 1, last_ts = now()
     WHERE sakuzu_daily.last_ts < now() - make_interval(secs => $3)
     RETURNING correct`,
    [id, today, SAKUZU_GAP_SEC_]
  );
  const correct = up.length ? Number(up[0].correct) || 0 : await sakuzuCorrectToday(id, today);
  return { ok: true, correct, counted: up.length > 0 };
}

module.exports = { handleSakuzuCorrect, sakuzuCorrectToday };
