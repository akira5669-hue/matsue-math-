const { sql } = require('../db');
const { dateKeyTokyo, mondayKeyTokyo, monthKeyTokyo } = require('../util');

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
// 職業(00001限定プレビューで設定可能)：設定している生徒がいれば、誰が見ても
// そのニックネームの後ろに「（職業）」が付いて表示される(本人限定表示ではない)。
function professionSuffix_(profession) {
  return profession ? `（${profession}）` : '';
}
function nicknameWithProfession_(id, profession) {
  return nicknameForId(id) + professionSuffix_(profession);
}
// students テーブルを直接SELECTしないランキング(100マス計算・読書)向けに、
// 該当idだけの職業をまとめて取得する。
async function fetchProfessionMap_(ids) {
  const uniqueIds = Array.from(new Set((ids || []).filter(Boolean)));
  if (uniqueIds.length === 0) return {};
  const rows = await sql().query('SELECT id, desired_profession FROM students WHERE id = ANY($1)', [uniqueIds]);
  const map = {};
  rows.forEach((r) => { if (r.desired_profession) map[r.id] = r.desired_profession; });
  return map;
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
  const data = await sql().query('SELECT id, level, exp, science_exp, grade, desired_profession FROM students', []);
  const rows = data
    .filter((d) => d.id)
    .map((d) => ({ id: d.id, level: Number(d.level) || 1, exp: (Number(d.exp) || 0) + (Number(d.science_exp) || 0), grade: d.grade || '', profession: d.desired_profession || '' }))
    .sort((a, b) => (b.level !== a.level ? b.level - a.level : b.exp - a.exp));
  const mapFn = (r, idx) => ({ rank: idx + 1, nickname: nicknameWithProfession_(r.id, r.profession), level: r.level, exp: r.exp, grade: displayGradeForId(r.id, r.grade), isYou: r.id === myId });
  return { ok: true, ranking: rows.slice(0, 50).map(mapFn), nearby: buildNearbyRanking(rows, myId, mapFn) };
}

async function handleRankingGrade(body) {
  const myId = String(body.id || '').trim();
  const myRows = await sql().query('SELECT grade FROM students WHERE id = $1', [myId]);
  if (!myRows.length) return { ok: false, error: 'not_found' };
  const myGrade = myRows[0].grade;
  const data = await sql().query('SELECT id, level, exp, science_exp, grade, desired_profession FROM students WHERE grade = $1', [myGrade]);
  const rows = data
    .filter((d) => d.id)
    .map((d) => ({ id: d.id, level: Number(d.level) || 1, exp: (Number(d.exp) || 0) + (Number(d.science_exp) || 0), grade: d.grade || '', profession: d.desired_profession || '' }))
    .sort((a, b) => (b.level !== a.level ? b.level - a.level : b.exp - a.exp));
  const mapFn = (r, idx) => ({ rank: idx + 1, nickname: nicknameWithProfession_(r.id, r.profession), level: r.level, exp: r.exp, grade: displayGradeForId(r.id, r.grade), isYou: r.id === myId });
  return { ok: true, grade: myGrade, ranking: rows.slice(0, 30).map(mapFn), nearby: buildNearbyRanking(rows, myId, mapFn) };
}

async function handleRankingToday(body) {
  const myId = String(body.id || '').trim();
  const todayKey = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
  const data = await sql().query('SELECT id, grade, today_stats, desired_profession FROM students WHERE today_stats IS NOT NULL', []);
  const rows = [];
  for (const d of data) {
    if (!d.id) continue;
    const stats = d.today_stats;
    if (!stats || stats.date !== todayKey || !stats.total) continue;
    rows.push({ id: d.id, correct: Number(stats.correct) || 0, total: Number(stats.total) || 0, grade: d.grade || '', profession: d.desired_profession || '' });
  }
  rows.sort((a, b) => (b.correct !== a.correct ? b.correct - a.correct : b.total - a.total));
  const top = rows.slice(0, 50).map((r, idx) => ({ rank: idx + 1, nickname: nicknameWithProfession_(r.id, r.profession), correct: r.correct, total: r.total, grade: displayGradeForId(r.id, r.grade), isYou: r.id === myId }));
  return { ok: true, ranking: top };
}

async function handleRankingPoints(body) {
  const myId = String(body.id || '').trim();
  const data = await sql().query('SELECT id, points, grade, desired_profession FROM students', []);
  const rows = data
    .filter((d) => d.id)
    .map((d) => ({ id: d.id, points: Number(d.points) || 0, grade: d.grade || '', profession: d.desired_profession || '' }))
    .sort((a, b) => b.points - a.points);
  const mapFn = (r, idx) => ({ rank: idx + 1, nickname: nicknameWithProfession_(r.id, r.profession), points: r.points, grade: displayGradeForId(r.id, r.grade), isYou: r.id === myId });
  return { ok: true, ranking: rows.slice(0, 50).map(mapFn), nearby: buildNearbyRanking(rows, myId, mapFn) };
}

async function handleRankingHp(body) {
  const myId = String(body.id || '').trim();
  const data = await sql().query('SELECT id, hp, grade, desired_profession FROM students', []);
  const rows = data
    .filter((d) => d.id)
    .map((d) => ({ id: d.id, hp: Number(d.hp) || 0, grade: d.grade || '', profession: d.desired_profession || '' }))
    .sort((a, b) => b.hp - a.hp);
  const mapFn = (r, idx) => ({ rank: idx + 1, nickname: nicknameWithProfession_(r.id, r.profession), hp: r.hp, grade: displayGradeForId(r.id, r.grade), isYou: r.id === myId });
  return { ok: true, ranking: rows.slice(0, 50).map(mapFn), nearby: buildNearbyRanking(rows, myId, mapFn) };
}

// 💎宝石・⚔️アイテム・🌍世界一周のランキング(2026-11-28 先生の指示。上位30人)。
// 名前はほかのランキングと同じニックネーム。先生(00001)が見るときだけ、本当の名前もつける。
const RANK_TOP30_ = 30;
const GEM_STAR_ = { gemRedDiamond: 5, gemBlueDiamond: 5, gemPinkDiamond: 5, gemDiamond: 4, gemRuby: 3, gemEmerald: 3, gemSapphire: 3 };
// 🔥炎の剣：赤＝アメリカ横断10周・青＝20周・紫＝30周(app.jsのFLAME_SWORDS_)。
const FLAME_RED_LAPS_ = 10;
const FLAME_BLUE_LAPS_ = 20; // 2026-11-28 先生の指示
const FLAME_PURPLE_LAPS_ = 30;
function rankRows_(rows, myId, data, fmt) {
  const nameOf = {}; data.forEach((d) => { nameOf[d.id] = d.name || ''; });
  const admin = myId === '00001';
  const mapFn = (r, idx) => ({ rank: idx + 1, nickname: nicknameWithProfession_(r.id, r.profession) + (admin && nameOf[r.id] ? '【' + nameOf[r.id] + '】' : ''), grade: displayGradeForId(r.id, r.grade), detail: fmt(r), isYou: r.id === myId });
  return { ranking: rows.slice(0, RANK_TOP30_).map(mapFn), nearby: buildNearbyRanking(rows, myId, mapFn) };
}
async function handleRankingGem(body) {
  const myId = String(body.id || '').trim();
  const data = await sql().query('SELECT id, name, grade, desired_profession, gem_items FROM students', []);
  const rows = [];
  for (const d of data) {
    if (!d.id) continue;
    let g = d.gem_items; if (typeof g === 'string') { try { g = JSON.parse(g); } catch (e) { g = {}; } }
    const c = { 5: 0, 4: 0, 3: 0 };
    Object.keys(GEM_STAR_).forEach((k) => { c[GEM_STAR_[k]] += Math.max(0, Math.floor(Number((g || {})[k]) || 0)); });
    const total = c[5] + c[4] + c[3];
    if (total > 0) rows.push({ id: d.id, grade: d.grade || '', profession: d.desired_profession || '', s5: c[5], s4: c[4], s3: c[3], total });
  }
  // ★5が多い順 → ★4 → ★3(オリンピックのメダルの数え方と同じ)
  rows.sort((a, b) => b.s5 - a.s5 || b.s4 - a.s4 || b.s3 - a.s3);
  return Object.assign({ ok: true, title: '💎 宝石ランキング（上位30位）', summary: '宝石を持っている人 ' + rows.length + '人（★5の数→★4→★3の順）', empty: 'まだ宝石を持っている人はいません。' },
    rankRows_(rows, myId, data, (r) => [r.s5 ? '★5×' + r.s5 : '', r.s4 ? '★4×' + r.s4 : '', r.s3 ? '★3×' + r.s3 : ''].filter(Boolean).join(' ') + '（計' + r.total + '個）'));
}
async function handleRankingItem(body) {
  const myId = String(body.id || '').trim();
  const data = await sql().query("SELECT id, name, grade, desired_profession, yusha_sword_count, yusha_sword_obtained, usa_crossing_run FROM students", []);
  const rows = [];
  for (const d of data) {
    if (!d.id) continue;
    let run = d.usa_crossing_run; if (typeof run === 'string') { try { run = JSON.parse(run); } catch (e) { run = {}; } }
    const laps = Number((run || {}).laps) || 0;
    const red = laps >= FLAME_RED_LAPS_ ? 1 : 0, blue = laps >= FLAME_BLUE_LAPS_ ? 1 : 0, purple = laps >= FLAME_PURPLE_LAPS_ ? 1 : 0;
    const yusha = Number(d.yusha_sword_count) || 0, yushaUsed = !yusha && d.yusha_sword_obtained ? 1 : 0;
    const score = purple * 1000 + blue * 100 + red * 10 + (yusha ? 2 : yushaUsed ? 1 : 0);
    if (score > 0) rows.push({ id: d.id, grade: d.grade || '', profession: d.desired_profession || '', red, blue, purple, yusha, yushaUsed, score });
  }
  // 炎の剣(紫→青→赤)が上、次に勇者の剣
  rows.sort((a, b) => b.score - a.score || b.yusha - a.yusha);
  return Object.assign({ ok: true, title: '⚔️ アイテムランキング（上位30位）', summary: '勇者の剣・炎の剣を持っている人 ' + rows.length + '人（炎の剣（紫→青→赤）→勇者の剣の順）', empty: 'まだ勇者の剣・炎の剣を持っている人はいません。' },
    rankRows_(rows, myId, data, (r) => [r.purple ? '🟣炎の剣（紫）' : '', r.blue ? '🔵炎の剣（青）' : '', r.red ? '🔴炎の剣（赤）' : '', r.yusha ? '🗡️勇者の剣' + (r.yusha > 1 ? '×' + r.yusha : '') : r.yushaUsed ? '🗡️勇者の剣（使用済み）' : ''].filter(Boolean).join(' ')));
}
async function handleRankingWorld(body) {
  const myId = String(body.id || '').trim();
  const data = await sql().query('SELECT id, name, grade, desired_profession, world_lap, world_country, level FROM students', []);
  const rows = [];
  for (const d of data) {
    if (!d.id) continue;
    const lap = Math.max(1, Number(d.world_lap) || 1), country = Number(d.world_country) || 0;
    if (lap <= 1 && country <= 0) continue; // まだ世界一周を始めていない
    rows.push({ id: d.id, grade: d.grade || '', profession: d.desired_profession || '', lap, country, level: Number(d.level) || 0 });
  }
  rows.sort((a, b) => b.lap - a.lap || b.country - a.country || b.level - a.level);
  return Object.assign({ ok: true, title: '🌍 世界一周ランキング（上位30位）', summary: '世界一周をしている人 ' + rows.length + '人（何周したか→今の周で進んだ国の数の順）', empty: 'まだ世界一周をしている人はいません。' },
    rankRows_(rows, myId, data, (r) => (r.lap - 1) + '周達成（' + r.lap + '周目・' + r.country + 'ヵ国）'));
}

async function handleChallengeRanking(body) {
  const myId = String(body.id || '').trim();
  // 2026-10〜、チャレンジ問題正解数ランキングは月間集計(challenge_month_total)に
  // 変更した(賢さの実の月次配布の対象にするため)。月キーが今月と違う生徒は0扱い。
  const monthKey = monthKeyTokyo(new Date());
  const data = await sql().query('SELECT id, grade, challenge_month_key, challenge_month_total, desired_profession FROM students WHERE challenge_month_total > 0', []);
  const elementary = [], middle = [];
  for (const d of data) {
    if (!d.id) continue;
    if (d.challenge_month_key !== monthKey) continue;
    const total = Number(d.challenge_month_total) || 0;
    if (total <= 0) continue;
    const grade = d.grade || '';
    const entry = { id: d.id, total, grade, profession: d.desired_profession || '' };
    if (String(grade).charAt(0) === '中') middle.push(entry);
    else if (String(grade).charAt(0) === '小') elementary.push(entry);
  }
  elementary.sort((a, b) => b.total - a.total);
  middle.sort((a, b) => b.total - a.total);
  const mapFn = (r, idx) => ({ rank: idx + 1, nickname: nicknameWithProfession_(r.id, r.profession), total: r.total, grade: displayGradeForId(r.id, r.grade), isYou: r.id === myId });
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
  const profMap = await fetchProfessionMap_(rows.map((r) => r.id));
  const mapFn = (r, idx) => ({ rank: idx + 1, nickname: nicknameWithProfession_(r.id, profMap[r.id]), timeSeconds: r.timeSeconds, grade: displayGradeForId(r.id, r.grade), isYou: r.id === myId });
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
  handleRankingGem, handleRankingItem, handleRankingWorld,
  handleRanking, handleRankingGrade, handleRankingToday, handleRankingPoints, handleRankingHp, handleChallengeRanking,
  handleHyakuMasuRanking, handleHyakuMasuHistory, nicknameForId, nicknameWithProfession_, fetchProfessionMap_,
};
