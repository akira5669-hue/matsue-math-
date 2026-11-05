const { sql } = require('../db');
const { findStudent } = require('../students');
const { sendAdminEmail } = require('../mail');
const { dateKeyTokyo } = require('../util');

// 月1アンケート(紙の「月1アンケート」をアプリにしたもの＋満足度・改善点)。
// 生徒本人か保護者が、生徒のアカウントで答える。答えられるのは毎月1アカウント1回だけで、答えると+50MP。
//答えはsurvey_answersに保存し、先生(管理者)にメールでも届ける。
// アプリ上で答えの一覧は見せない(悩みなどを含むため)。
// 今は00001だけ(SURVEY_OPEN_ALLをtrueにすると全員)。app.js側と揃えること。
const SURVEY_REWARD_MP = 50;
const SURVEY_OPEN_ALL = false;
const TEXT_MAX = 2000;
const TEST_MARKS = ['◎', '○', '△', '×'];
const WORRY_ITEMS = ['成績', '受験', '学校', '部活', '家庭', '恋愛', '趣味', '人間関係', 'その他', 'なし'];
const TEXT_KEYS = ['testReason', 'goalAction', 'classRequest', 'worryOther', 'consult', 'effort', 'improve'];

function isActive_(id) { return id === '00001' || SURVEY_OPEN_ALL; }
function surveyId_() { return dateKeyTokyo(new Date()).slice(0, 7); }

let tablesReady = null;
function ensureTables_() {
  if (!tablesReady) {
    tablesReady = sql().query(`CREATE TABLE IF NOT EXISTS survey_answers (
      id SERIAL PRIMARY KEY, ts TIMESTAMPTZ NOT NULL DEFAULT now(), survey_id TEXT NOT NULL, student_id TEXT NOT NULL,
      name TEXT, grade TEXT, respondent TEXT, sat_class INTEGER, sat_overall INTEGER,
      answers JSONB NOT NULL DEFAULT '{}', mp_awarded INTEGER NOT NULL DEFAULT 0)`, [])
      .then(() => sql().query("ALTER TABLE survey_answers ADD COLUMN IF NOT EXISTS answers JSONB NOT NULL DEFAULT '{}'", []))
      .catch((e) => { tablesReady = null; throw e; });
  }
  return tablesReady;
}

async function handleSurveyStatus(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  await ensureTables_();
  const sid = surveyId_();
  const rows = await sql().query('SELECT count(*)::int AS n, coalesce(sum(mp_awarded), 0)::int AS mp FROM survey_answers WHERE survey_id = $1 AND student_id = $2', [sid, id]);
  return { ok: true, active: isActive_(id), surveyId: sid, rewardMp: SURVEY_REWARD_MP, answered: rows[0].n > 0, rewarded: rows[0].mp > 0 };
}

async function handleSurveySubmit(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  if (!isActive_(id)) return { ok: false, error: 'not_active' };
  await ensureTables_();
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  const sid = surveyId_();
  const respondent = body.respondent === 'guardian' ? 'guardian' : 'student';
  const sat = (v) => { const n = Math.floor(Number(v)); return n >= 1 && n <= 5 ? n : null; };
  const satClass = sat(body.satClass), satOverall = sat(body.satOverall);
  const a = {
    testMark: TEST_MARKS.includes(body.testMark) ? body.testMark : '',
    goalRank: String(body.goalRank || '').trim().slice(0, 20),
    classStatus: body.classStatus === 'change' ? 'change' : body.classStatus === 'ok' ? 'ok' : '',
    worries: Array.isArray(body.worries) ? body.worries.filter((w) => WORRY_ITEMS.includes(w)) : [],
    anxiety: Math.max(0, Math.min(100, Math.round(Number(body.anxiety) || 0))),
    interview: body.interview === 'want' ? 'want' : body.interview === 'fine' ? 'fine' : '',
  };
  TEXT_KEYS.forEach((k) => { a[k] = String(body[k] || '').trim().slice(0, TEXT_MAX); });
  // 選ぶところ(◎○△×・授業・面談・満足度など)は、2026-11-05から選ばなくても送れる。
  const textLen = TEXT_KEYS.reduce((s, k) => s + a[k].length, 0) + a.goalRank.length;
  if (textLen < 5) return { ok: false, error: 'too_short' };

  // 1か月に1回だけ。その月にまだ答えていないときだけ保存する(同時に送られても1件だけになるよう、1つの文で確かめて入れる)。
  const award = await sql().query(
    `INSERT INTO survey_answers (survey_id, student_id, name, grade, respondent, sat_class, sat_overall, answers, mp_awarded)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9
     WHERE NOT EXISTS (SELECT 1 FROM survey_answers WHERE survey_id = $1 AND student_id = $2) RETURNING id`,
    [sid, id, row.name, row.grade, respondent, satClass, satOverall, JSON.stringify(a), SURVEY_REWARD_MP]
  );
  if (!award.length) return { ok: false, error: 'already_answered' };
  let newTotalPoints = null;
  if (award.length) {
    const st = await sql().query('UPDATE students SET points = points + $1 WHERE id = $2 RETURNING points', [SURVEY_REWARD_MP, id]);
    newTotalPoints = Number(st[0].points) || 0;
  }
  const stars = (n) => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) + `（${n}）` : '（未回答）');
  const who = respondent === 'guardian' ? '保護者' : '生徒';
  const flags = (a.interview === 'want' ? '【面談希望】' : '') + (a.anxiety >= 50 ? `【不安度${a.anxiety}%】` : '');
  await sendAdminEmail(
    `${flags}【月1アンケート】${row.name}（${row.grade || ''}・${who}）`,
    [
      `ID: ${id}　名前: ${row.name}　学年: ${row.grade || ''}　回答者: ${who}本人`.replace('保護者本人', '保護者'),
      '',
      `1. テストの進み具合: ${a.testMark || '（未回答）'}　理由: ${a.testReason || '（なし）'}`,
      `2. 目標順位: ${a.goalRank || '（なし）'}　行動: ${a.goalAction || '（なし）'}`,
      `3. 授業の進度・難易度・座席: ${a.classStatus === 'change' ? 'ちょっと変えてほしいことがある' : a.classStatus === 'ok' ? '特に不満はない' : '（未回答）'}${a.classRequest ? '\n   要望: ' + a.classRequest : ''}`,
      `4. 相談したいこと・不安なこと: ${a.worries.length ? a.worries.join('、') : '（チェックなし）'}${a.worryOther ? '（その他: ' + a.worryOther + '）' : ''}`,
      '',
      `■自由記入欄（相談したいこと）\n${a.consult || '（なし）'}`,
      `■最近頑張っていること\n${a.effort || '（なし）'}`,
      '',
      `不安度・モヤモヤ度: ${a.anxiety}%`,
      `面談: ${a.interview === 'want' ? '面談を希望する' : a.interview === 'fine' ? '今は大丈夫' : '（未回答）'}`,
      '',
      `授業の満足度: ${stars(satClass)}`,
      `松江塾全体の満足度: ${stars(satOverall)}`,
      `■不満・改善してほしいこと\n${a.improve || '（なし）'}`,
    ].join('\n')
  );
  return { ok: true, rewarded: award.length > 0, rewardMp: award.length ? SURVEY_REWARD_MP : 0, newTotalPoints };
}

module.exports = { handleSurveyStatus, handleSurveySubmit };
