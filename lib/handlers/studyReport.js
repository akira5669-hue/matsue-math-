const { sql } = require('../db');
const { findStudent } = require('../students');
const { dateKeyTokyo, monthKeyTokyo } = require('../util');
const { nicknameForId } = require('./ranking');

// 毎日勉強時間報告：1日1回、報告すると+1MP+1HP(1日のMP上限100に達していても
// 加算される。buyHerb等と同じくサーバー側で直接points/hpをSETする方式のため
// 通常のcalc/word日次上限の対象外)。study_report_dateで1日1回制限。
// 各回の時間はstudy_reportsテーブルに個別記録し、「本日のランキング」
// (date_key)と「今月累計のランキング」(month_key合計)の2つに使う。
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
  const monthKey = monthKeyTokyo(new Date());
  await sql().query(
    'INSERT INTO study_reports (ts, student_id, name, grade, date_key, month_key, minutes) VALUES (now(), $1, $2, $3, $4, $5, $6)',
    [id, row.name, row.grade, today, monthKey, minutes]
  );
  return { ok: true, points: newPoints, hp: newHp, studyReportTotal: newTotal, studyReportMinutesTotal: newMinutesTotal };
}

function displayGradeForId_(id, grade) {
  return String(id).trim() === '00001' ? '先生' : grade;
}

function splitAndSort_(rows, minutesOf) {
  const elementary = [];
  const middle = [];
  rows.forEach((d) => {
    if (!d.student_id) return;
    const minutes = minutesOf(d);
    if (minutes <= 0) return;
    const grade = d.grade || '';
    const entry = { id: d.student_id, minutes, grade };
    if (String(grade).charAt(0) === '中') middle.push(entry);
    else if (String(grade).charAt(0) === '小') elementary.push(entry);
  });
  elementary.sort((a, b) => b.minutes - a.minutes);
  middle.sort((a, b) => b.minutes - a.minutes);
  return { elementary, middle };
}

function buildRankingResponse_(elementary, middle, myId) {
  const mapFn = (r, idx) => ({ rank: idx + 1, nickname: nicknameForId(r.id), minutes: r.minutes, grade: displayGradeForId_(r.id, r.grade), isYou: r.id === myId });
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

// 本日のランキング：報告は1日1回のみなので、その日のstudy_reports 1件=その日の
// 勉強時間そのもの。
async function handleStudyReportRankingToday(body) {
  const myId = String(body.id || '').trim();
  const today = dateKeyTokyo(new Date());
  const rows = await sql().query('SELECT student_id, grade, minutes FROM study_reports WHERE date_key = $1', [today]);
  const { elementary, middle } = splitAndSort_(rows, (d) => Number(d.minutes) || 0);
  return buildRankingResponse_(elementary, middle, myId);
}

// 生徒本人の今月の学習カレンダー(日付→分)。自分の画面にはいつでも表示する。
async function fetchStudyCalendar_(studentId, monthKey) {
  const rows = await sql().query('SELECT date_key, minutes FROM study_reports WHERE student_id = $1 AND month_key = $2 ORDER BY date_key ASC', [studentId, monthKey]);
  return rows.map((r) => ({ date: r.date_key, minutes: Number(r.minutes) || 0 }));
}

async function handleStudyCalendar(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  const monthKey = monthKeyTokyo(new Date());
  const calendar = await fetchStudyCalendar_(id, monthKey);
  return { ok: true, monthKey, calendar };
}

// 今月累計のランキング：month_key内の全報告を生徒ごとに合計する。累計トップ3
// (小学生/中学生それぞれ)は、他の生徒にも見えるようカレンダーを添付する。
async function handleStudyReportRankingMonth(body) {
  const myId = String(body.id || '').trim();
  const monthKey = monthKeyTokyo(new Date());
  const rows = await sql().query(
    'SELECT student_id, grade, SUM(minutes) AS total_minutes FROM study_reports WHERE month_key = $1 GROUP BY student_id, grade',
    [monthKey]
  );
  const { elementary, middle } = splitAndSort_(rows, (d) => Number(d.total_minutes) || 0);
  const res = buildRankingResponse_(elementary, middle, myId);
  // res.elementary/middleはelementary/middleを同じ順序でslice(0,50).mapしたものなので、
  // 同じインデックスが同じ生徒を指す。上位3人だけカレンダーを添付する。
  for (let i = 0; i < Math.min(3, res.elementary.length); i++) {
    res.elementary[i].calendar = await fetchStudyCalendar_(elementary[i].id, monthKey);
  }
  for (let i = 0; i < Math.min(3, res.middle.length); i++) {
    res.middle[i].calendar = await fetchStudyCalendar_(middle[i].id, monthKey);
  }
  return res;
}

module.exports = { handleStudyReport, handleStudyReportRankingToday, handleStudyReportRankingMonth, handleStudyCalendar, STUDY_REPORT_MP, STUDY_REPORT_HP };
