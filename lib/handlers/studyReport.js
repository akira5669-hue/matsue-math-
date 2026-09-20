const { sql } = require('../db');
const { findStudent } = require('../students');
const { dateKeyTokyo } = require('../util');
const { nicknameForId } = require('./ranking');

// 毎日勉強時間報告：1日1回、報告すると+1MP+1HP(1日のMP上限100に達していても
// 加算される。buyHerb等と同じくサーバー側で直接points/hpをSETする方式のため
// 通常のcalc/word日次上限の対象外)。study_report_dateで1日1回制限、
// study_report_totalを月間ランキング(小学生/中学生別)の集計に使う。
const STUDY_REPORT_MP = 1;
const STUDY_REPORT_HP = 1;
// 30分刻み(30分〜16時間)。範囲外・不正な値は無視して0分として記録する
// (MP/HPの報酬自体は時間に関わらず固定)。
const STUDY_REPORT_MIN_MINUTES = 30;
const STUDY_REPORT_MAX_MINUTES = 16 * 60;

async function handleStudyReport(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  const today = dateKeyTokyo(new Date());
  if (row.studyReportDate === today) return { ok: false, error: 'already_reported_today' };

  let minutes = Math.floor(Number(body.studyMinutes)) || 0;
  if (minutes % 30 !== 0 || minutes < STUDY_REPORT_MIN_MINUTES || minutes > STUDY_REPORT_MAX_MINUTES) minutes = 0;

  const newPoints = row.points + STUDY_REPORT_MP;
  const newHp = (Number(row.hp) || 0) + STUDY_REPORT_HP;
  const newTotal = (Number(row.studyReportTotal) || 0) + 1;
  const newMinutesTotal = (Number(row.studyReportMinutesTotal) || 0) + minutes;
  await sql().query(
    'UPDATE students SET points = $1, hp = $2, study_report_date = $3, study_report_total = $4, study_report_minutes_total = $5 WHERE id = $6',
    [newPoints, newHp, today, newTotal, newMinutesTotal, id]
  );
  return { ok: true, points: newPoints, hp: newHp, studyReportTotal: newTotal, studyReportMinutesTotal: newMinutesTotal };
}

function displayGradeForId_(id, grade) {
  return String(id).trim() === '00001' ? '先生' : grade;
}

async function handleStudyReportRanking(body) {
  const myId = String(body.id || '').trim();
  const data = await sql().query('SELECT id, grade, study_report_total FROM students WHERE study_report_total > 0', []);
  const elementary = [];
  const middle = [];
  for (const d of data) {
    if (!d.id) continue;
    const total = Number(d.study_report_total) || 0;
    if (total <= 0) continue;
    const grade = d.grade || '';
    const entry = { id: d.id, total, grade };
    if (String(grade).charAt(0) === '中') middle.push(entry);
    else if (String(grade).charAt(0) === '小') elementary.push(entry);
  }
  elementary.sort((a, b) => b.total - a.total);
  middle.sort((a, b) => b.total - a.total);
  const mapFn = (r, idx) => ({ rank: idx + 1, nickname: nicknameForId(r.id), total: r.total, grade: displayGradeForId_(r.id, r.grade), isYou: r.id === myId });
  function nearby(rows) {
    const myIndex = rows.findIndex((r) => r.id === myId);
    if (myIndex === -1) return [];
    const start = Math.max(0, myIndex - 3);
    const end = Math.min(rows.length, myIndex + 4);
    const out = [];
    for (let j = start; j < end; j++) out.push(mapFn(rows[j], j));
    return out;
  }
  return {
    ok: true,
    elementary: elementary.slice(0, 50).map(mapFn),
    elementaryNearby: nearby(elementary),
    middle: middle.slice(0, 50).map(mapFn),
    middleNearby: nearby(middle),
  };
}

module.exports = { handleStudyReport, handleStudyReportRanking, STUDY_REPORT_MP, STUDY_REPORT_HP };
