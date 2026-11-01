const { sql } = require('../db');
const { findStudent } = require('../students');
const { sendAdminEmail } = require('../mail');

// アンケート(授業・悩みや不安・不満・改善点・満足度)。生徒本人か保護者が、生徒のアカウントで答える。
// 答えると+100MP(アンケート1回につき1アカウント1回まで。2回目以降も送れるがMPはなし)。
// 答えはsurvey_answersに保存し、先生(管理者)にメールでも届ける。アプリ上で答えの一覧は見せない(悩みなどを含むため)。
// 今は00001だけ(SURVEY_OPEN_ALLをtrueにすると全員)。app.js側と揃えること。
const SURVEY_ID = '2026-11';
const SURVEY_REWARD_MP = 100;
const SURVEY_OPEN_ALL = false;
const TEXT_FIELDS = ['class_text', 'worry_text', 'complaint_text', 'improve_text', 'other_text'];
const TEXT_MAX = 2000;

function isActive_(id) { return id === '00001' || SURVEY_OPEN_ALL; }

let tablesReady = null;
function ensureTables_() {
  if (!tablesReady) {
    tablesReady = sql().query(`CREATE TABLE IF NOT EXISTS survey_answers (
      id SERIAL PRIMARY KEY, ts TIMESTAMPTZ NOT NULL DEFAULT now(), survey_id TEXT NOT NULL, student_id TEXT NOT NULL,
      name TEXT, grade TEXT, respondent TEXT, sat_class INTEGER, sat_overall INTEGER,
      class_text TEXT, worry_text TEXT, complaint_text TEXT, improve_text TEXT, other_text TEXT,
      mp_awarded INTEGER NOT NULL DEFAULT 0)`, [])
      .catch((e) => { tablesReady = null; throw e; });
  }
  return tablesReady;
}

async function handleSurveyStatus(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  await ensureTables_();
  const rows = await sql().query('SELECT count(*)::int AS n, coalesce(sum(mp_awarded), 0)::int AS mp FROM survey_answers WHERE survey_id = $1 AND student_id = $2', [SURVEY_ID, id]);
  return { ok: true, active: isActive_(id), surveyId: SURVEY_ID, rewardMp: SURVEY_REWARD_MP, answered: rows[0].n > 0, rewarded: rows[0].mp > 0 };
}

async function handleSurveySubmit(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  if (!isActive_(id)) return { ok: false, error: 'not_active' };
  await ensureTables_();
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  const respondent = body.respondent === 'guardian' ? 'guardian' : 'student';
  const sat = (v) => { const n = Math.floor(Number(v)); return n >= 1 && n <= 5 ? n : null; };
  const satClass = sat(body.satClass), satOverall = sat(body.satOverall);
  const texts = {};
  TEXT_FIELDS.forEach((k) => { texts[k] = String(body[k] || '').trim().slice(0, TEXT_MAX); });
  const textLen = TEXT_FIELDS.reduce((s, k) => s + texts[k].length, 0);
  if (!satClass || !satOverall) return { ok: false, error: 'missing_satisfaction' };
  if (textLen < 10) return { ok: false, error: 'too_short' };

  const ins = await sql().query(
    `INSERT INTO survey_answers (survey_id, student_id, name, grade, respondent, sat_class, sat_overall, class_text, worry_text, complaint_text, improve_text, other_text)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [SURVEY_ID, id, row.name, row.grade, respondent, satClass, satOverall, texts.class_text, texts.worry_text, texts.complaint_text, texts.improve_text, texts.other_text]
  );
  // MPはこのアンケートで初めての回答のときだけ(同時に送られても1回だけになるよう、まだ誰ももらっていないときだけ付ける)。
  const award = await sql().query(
    `UPDATE survey_answers SET mp_awarded = $1 WHERE id = $2
       AND NOT EXISTS (SELECT 1 FROM survey_answers WHERE survey_id = $3 AND student_id = $4 AND mp_awarded > 0) RETURNING id`,
    [SURVEY_REWARD_MP, ins[0].id, SURVEY_ID, id]
  );
  let newTotalPoints = null;
  if (award.length) {
    const st = await sql().query('UPDATE students SET points = points + $1 WHERE id = $2 RETURNING points', [SURVEY_REWARD_MP, id]);
    newTotalPoints = Number(st[0].points) || 0;
  }
  const label = { class_text: '授業について', worry_text: '悩みや不安', complaint_text: '不満', improve_text: '改善してほしいこと', other_text: 'その他' };
  await sendAdminEmail(
    `【アンケート】${row.name}（${row.grade || ''}・${respondent === 'guardian' ? '保護者' : '生徒'}）`,
    `ID: ${id}\n名前: ${row.name}\n学年: ${row.grade || ''}\n回答者: ${respondent === 'guardian' ? '保護者' : '生徒本人'}\n`
      + `授業の満足度: ${'★'.repeat(satClass)}${'☆'.repeat(5 - satClass)}（${satClass}）\n松江塾全体の満足度: ${'★'.repeat(satOverall)}${'☆'.repeat(5 - satOverall)}（${satOverall}）\n\n`
      + TEXT_FIELDS.map((k) => `■${label[k]}\n${texts[k] || '（なし）'}`).join('\n\n')
  );
  return { ok: true, rewarded: award.length > 0, rewardMp: award.length ? SURVEY_REWARD_MP : 0, newTotalPoints };
}

module.exports = { handleSurveyStatus, handleSurveySubmit, SURVEY_ID };
