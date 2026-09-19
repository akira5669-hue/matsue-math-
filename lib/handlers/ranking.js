const { sql } = require('../db');
const { dateKeyTokyo, mondayKeyTokyo } = require('../util');

const NICK_PREFIX = ['天使', '黒龍', '紅蓮', '氷炎', '聖なる', '漆黒', '閃光', '深淵', '疾風', '不滅', '黄金', '蒼き', '爆炎', '幻影', '雷鳴', '白銀', '真紅', '暗黒', '光輝', '無限'];
const NICK_SUFFIX = ['の翼', 'の刃', 'の心臓', 'の意志', 'の記憶', 'の使者', 'の守護者', 'の覇者', 'の騎士', 'の魂', 'の瞳', 'の牙', 'の王', 'の戦士', 'の炎', 'の氷', 'の雷', 'の影', 'の光', 'の剣'];

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  }
  return h;
}
function nicknameForId(id) {
  const h = hashStr(String(id));
  const prefix = NICK_PREFIX[h % NICK_PREFIX.length];
  const suffix = NICK_SUFFIX[Math.floor(h / NICK_PREFIX.length) % NICK_SUFFIX.length];
  return prefix + suffix;
}
function displayGradeForId(id, grade) {
  return String(id).trim() === '00001' ? '先生' : grade;
}
function buildNearbyRanking(rows, myId, mapFn) {
  const myIndex = rows.findIndex((r) => r.id === myId);
  if (myIndex === -1) return [];
  const start = Math.max(0, myIndex - 3);
  const end = Math.min(rows.length, myIndex + 4);
  const out = [];
  for (let j = start; j < end; j++) out.push(mapFn(rows[j], j));
  return out;
}

async function handleRanking(body) {
  const myId = String(body.id || '').trim();
  const data = await sql().query('SELECT id, level, exp, science_exp, grade FROM students', []);
  const rows = data
    .filter((d) => d.id)
    .map((d) => ({ id: d.id, level: Number(d.level) || 1, exp: (Number(d.exp) || 0) + (Number(d.science_exp) || 0), grade: d.grade || '' }))
    .sort((a, b) => (b.level !== a.level ? b.level - a.level : b.exp - a.exp));
  const mapFn = (r, idx) => ({ rank: idx + 1, nickname: nicknameForId(r.id), level: r.level, exp: r.exp, grade: displayGradeForId(r.id, r.grade), isYou: r.id === myId });
  return { ok: true, ranking: rows.slice(0, 50).map(mapFn), nearby: buildNearbyRanking(rows, myId, mapFn) };
}

async function handleRankingGrade(body) {
  const myId = String(body.id || '').trim();
  const myRows = await sql().query('SELECT grade FROM students WHERE id = $1', [myId]);
  if (!myRows.length) return { ok: false, error: 'not_found' };
  const myGrade = myRows[0].grade;
  const data = await sql().query('SELECT id, level, exp, science_exp, grade FROM students WHERE grade = $1', [myGrade]);
  const rows = data
    .filter((d) => d.id)
    .map((d) => ({ id: d.id, level: Number(d.level) || 1, exp: (Number(d.exp) || 0) + (Number(d.science_exp) || 0), grade: d.grade || '' }))
    .sort((a, b) => (b.level !== a.level ? b.level - a.level : b.exp - a.exp));
  const mapFn = (r, idx) => ({ rank: idx + 1, nickname: nicknameForId(r.id), level: r.level, exp: r.exp, grade: displayGradeForId(r.id, r.grade), isYou: r.id === myId });
  return { ok: true, grade: myGrade, ranking: rows.slice(0, 30).map(mapFn), nearby: buildNearbyRanking(rows, myId, mapFn) };
}

async function handleRankingToday(body) {
  const myId = String(body.id || '').trim();
  const todayKey = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
  const data = await sql().query('SELECT id, grade, today_stats FROM students WHERE today_stats IS NOT NULL', []);
  const rows = [];
  for (const d of data) {
    if (!d.id) continue;
    const stats = d.today_stats;
    if (!stats || stats.date !== todayKey || !stats.total) continue;
    rows.push({ id: d.id, correct: Number(stats.correct) || 0, total: Number(stats.total) || 0, grade: d.grade || '' });
  }
  rows.sort((a, b) => (b.correct !== a.correct ? b.correct - a.correct : b.total - a.total));
  const top = rows.slice(0, 50).map((r, idx) => ({ rank: idx + 1, nickname: nicknameForId(r.id), correct: r.correct, total: r.total, grade: displayGradeForId(r.id, r.grade), isYou: r.id === myId }));
  return { ok: true, ranking: top };
}

async function handleRankingPoints(body) {
  const myId = String(body.id || '').trim();
  const data = await sql().query('SELECT id, points, grade FROM students', []);
  const rows = data
    .filter((d) => d.id)
    .map((d) => ({ id: d.id, points: Number(d.points) || 0, grade: d.grade || '' }))
    .sort((a, b) => b.points - a.points);
  const mapFn = (r, idx) => ({ rank: idx + 1, nickname: nicknameForId(r.id), points: r.points, grade: displayGradeForId(r.id, r.grade), isYou: r.id === myId });
  return { ok: true, ranking: rows.slice(0, 50).map(mapFn), nearby: buildNearbyRanking(rows, myId, mapFn) };
}

async function handleRankingHp(body) {
  const myId = String(body.id || '').trim();
  const data = await sql().query('SELECT id, hp, grade FROM students', []);
  const rows = data
    .filter((d) => d.id)
    .map((d) => ({ id: d.id, hp: Number(d.hp) || 0, grade: d.grade || '' }))
    .sort((a, b) => b.hp - a.hp);
  const mapFn = (r, idx) => ({ rank: idx + 1, nickname: nicknameForId(r.id), hp: r.hp, grade: displayGradeForId(r.id, r.grade), isYou: r.id === myId });
  return { ok: true, ranking: rows.slice(0, 50).map(mapFn), nearby: buildNearbyRanking(rows, myId, mapFn) };
}

async function handleChallengeRanking(body) {
  const myId = String(body.id || '').trim();
  const data = await sql().query('SELECT id, grade, challenge_correct_total FROM students WHERE challenge_correct_total > 0', []);
  const elementary = [], middle = [];
  for (const d of data) {
    if (!d.id) continue;
    const total = Number(d.challenge_correct_total) || 0;
    if (total <= 0) continue;
    const grade = d.grade || '';
    const entry = { id: d.id, total, grade };
    if (String(grade).charAt(0) === '中') middle.push(entry);
    else if (String(grade).charAt(0) === '小') elementary.push(entry);
  }
  elementary.sort((a, b) => b.total - a.total);
  middle.sort((a, b) => b.total - a.total);
  const mapFn = (r, idx) => ({ rank: idx + 1, nickname: nicknameForId(r.id), total: r.total, grade: displayGradeForId(r.id, r.grade), isYou: r.id === myId });
  return {
    ok: true,
    elementary: elementary.slice(0, 30).map(mapFn),
    elementaryNearby: buildNearbyRanking(elementary, myId, mapFn),
    middle: middle.slice(0, 30).map(mapFn),
    middleNearby: buildNearbyRanking(middle, myId, mapFn),
  };
}

// 100マス計算チャレンジの週替わりタイムランキング(2026-09-20〜)。その週(月曜始まり)
// に提出があった生徒の中で、タイムが速い順に並べる。同じ生徒が週内に複数回
// 提出した場合(通常は週1回制限だが00001のテスト提出等を考慮)は、その週の
// ベストタイムだけを採用する。
async function handleHyakuMasuRanking(body) {
  const myId = String(body.id || '').trim();
  const currentWeek = mondayKeyTokyo(new Date());
  const data = await sql().query(
    'SELECT student_id, grade, MIN(time_seconds) AS best_time FROM hyakumasu_times WHERE week_key = $1 GROUP BY student_id, grade',
    [currentWeek]
  );
  const rows = data
    .filter((d) => d.student_id)
    .map((d) => ({ id: d.student_id, timeSeconds: Number(d.best_time) || 0, grade: d.grade || '' }))
    .sort((a, b) => a.timeSeconds - b.timeSeconds);
  const mapFn = (r, idx) => ({ rank: idx + 1, nickname: nicknameForId(r.id), timeSeconds: r.timeSeconds, grade: displayGradeForId(r.id, r.grade), isYou: r.id === myId });
  return { ok: true, weekKey: currentWeek, ranking: rows.slice(0, 30).map(mapFn), nearby: buildNearbyRanking(rows, myId, mapFn) };
}

// 100マス計算チャレンジの成長記録(生徒本人だけに表示)。過去の提出タイムを
// 日付付きで古い順に返す。
async function handleHyakuMasuHistory(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  const rows = await sql().query(
    'SELECT ts, time_seconds FROM hyakumasu_times WHERE student_id = $1 ORDER BY ts ASC',
    [id]
  );
  const history = rows.map((r) => ({ date: dateKeyTokyo(new Date(r.ts)), timeSeconds: Number(r.time_seconds) || 0 }));
  return { ok: true, history };
}

module.exports = {
  handleRanking, handleRankingGrade, handleRankingToday, handleRankingPoints, handleRankingHp, handleChallengeRanking,
  handleHyakuMasuRanking, handleHyakuMasuHistory, nicknameForId,
};
