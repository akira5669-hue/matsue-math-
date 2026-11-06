const { sql } = require('../db');
const { findStudent } = require('../students');
const { dateKeyTokyo, monthKeyTokyo } = require('../util');
const { nicknameWithProfession_ } = require('./ranking');

// 計算パズル(KenKen型)のクリアでMP(2026-11-05〜)。問題は端末で作るので、サーバーでは
// 送られた答えが「たて・よこに同じ数がない」「ブロックの計算に合う」「答えが1通りに決まる問題」かを確かめる。
// MPは 3×3:1・4×4:2・5×5:4・6×6:8。1日20MPまで(2026-11-05先生の指示で変更)(ふだんの1日100MPの上限とは別)。
// 2026-11-06から全員に公開(falseにすると00001だけ)。app.jsのKEN_OPEN_ALL_と揃えること。
const KEN_OPEN_ALL = true;
const KEN_MP = { 3: 1, 4: 2, 5: 4, 6: 8 };
const KEN_DAILY_MAX = 20;
const KEN_OPS = { 3: ['+'], 4: ['+', '-'], 5: ['+', '-', '×'], 6: ['+', '-', '×', '÷'] };
// これより速いクリアはMPなし(機械的な送信よけ)
const KEN_MIN_SEC = { 3: 5, 4: 10, 5: 20, 6: 30 };

function isActive_(id) { return id === '00001' || KEN_OPEN_ALL; }

let tablesReady = null;
function ensureTables_() {
  if (!tablesReady) {
    tablesReady = sql().query(`CREATE TABLE IF NOT EXISTS ken_clears (
      id SERIAL PRIMARY KEY, ts TIMESTAMPTZ NOT NULL DEFAULT now(), student_id TEXT NOT NULL, day TEXT NOT NULL,
      size INTEGER NOT NULL, secs INTEGER NOT NULL, mp INTEGER NOT NULL DEFAULT 0)`, [])
      .then(() => sql().query('CREATE INDEX IF NOT EXISTS ken_clears_sd ON ken_clears (student_id, day)', []))
      .catch((e) => { tablesReady = null; throw e; });
  }
  return tablesReady;
}

// 解の数を数える(limit個見つかったら止める)。app.jsのkenCountSolutions_と同じ。
function kenCountSolutions_(n, owner, cages, limit) {
  const grid = Array(n * n).fill(0), rowM = Array(n).fill(0), colM = Array(n).fill(0);
  let count = 0;
  const order = [];
  cages.slice().sort((a, b) => a.cells.length - b.cells.length).forEach((cg) => { cg.cells.forEach((c) => order.push(c)); });
  function cageOk(ci) {
    const cg = cages[ci], vals = [];
    cg.cells.forEach((c) => { if (grid[c]) vals.push(grid[c]); });
    const full = vals.length === cg.cells.length, rest = cg.cells.length - vals.length;
    if (cg.op === '') return !full || vals[0] === cg.target;
    if (cg.op === '+') { const s = vals.reduce((a, b) => a + b, 0); return full ? s === cg.target : s + rest <= cg.target && s + rest * n >= cg.target; }
    if (cg.op === '×') { const p = vals.reduce((a, b) => a * b, 1); return full ? p === cg.target : cg.target % p === 0; }
    if (!full) return true;
    if (cg.op === '-') return Math.abs(vals[0] - vals[1]) === cg.target;
    return Math.max(vals[0], vals[1]) === cg.target * Math.min(vals[0], vals[1]);
  }
  function go(k) {
    if (count >= limit) return;
    if (k === order.length) { count++; return; }
    const c = order[k], y = Math.floor(c / n), x = c % n, ci = owner[c];
    for (let v = 1; v <= n; v++) {
      const bit = 1 << v;
      if ((rowM[y] & bit) || (colM[x] & bit)) continue;
      grid[c] = v; rowM[y] |= bit; colM[x] |= bit;
      if (cageOk(ci)) go(k + 1);
      grid[c] = 0; rowM[y] &= ~bit; colM[x] &= ~bit;
      if (count >= limit) return;
    }
  }
  go(0);
  return count;
}

function validClear_(n, owner, cages, grid) {
  if (!KEN_OPS[n] || !Array.isArray(owner) || !Array.isArray(cages) || !Array.isArray(grid)) return false;
  if (owner.length !== n * n || grid.length !== n * n || cages.length < 1 || cages.length > n * n) return false;
  const seen = Array(n * n).fill(false);
  for (let ci = 0; ci < cages.length; ci++) {
    const cg = cages[ci];
    if (!cg || !Array.isArray(cg.cells) || !cg.cells.length || cg.cells.length > 6) return false;
    const op = String(cg.op || '');
    if (op === '' ? cg.cells.length !== 1 : !KEN_OPS[n].includes(op)) return false;
    if ((op === '-' || op === '÷') && cg.cells.length !== 2) return false;
    if (!Number.isInteger(cg.target) || cg.target < 0) return false;
    for (const c of cg.cells) {
      if (!Number.isInteger(c) || c < 0 || c >= n * n || seen[c] || owner[c] !== ci) return false;
      seen[c] = true;
    }
  }
  if (seen.some((x) => !x)) return false;
  for (let i = 0; i < n * n; i++) if (!Number.isInteger(grid[i]) || grid[i] < 1 || grid[i] > n) return false;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) for (let k = 0; k < n; k++) {
    if (k !== x && grid[y * n + k] === grid[y * n + x]) return false;
    if (k !== y && grid[k * n + x] === grid[y * n + x]) return false;
  }
  for (const cg of cages) {
    const v = cg.cells.map((c) => grid[c]);
    let t;
    if (cg.op === '') t = v[0];
    else if (cg.op === '+') t = v.reduce((a, b) => a + b, 0);
    else if (cg.op === '×') t = v.reduce((a, b) => a * b, 1);
    else if (cg.op === '-') t = Math.abs(v[0] - v[1]);
    else t = Math.max(v[0], v[1]) % Math.min(v[0], v[1]) ? -1 : Math.max(v[0], v[1]) / Math.min(v[0], v[1]);
    if (t !== cg.target) return false;
  }
  // 1マスのブロックだらけの簡単すぎる問題は受け付けない(端末で作る問題と同じ条件)
  if (cages.filter((cg) => cg.cells.length === 1).length > Math.max(1, Math.floor(n / 2))) return false;
  return kenCountSolutions_(n, owner, cages.map((cg) => ({ cells: cg.cells, op: String(cg.op || ''), target: cg.target })), 2) === 1;
}

async function todayMp_(id, today) {
  const r = await sql().query('SELECT coalesce(sum(mp), 0)::int AS mp FROM ken_clears WHERE student_id = $1 AND day = $2', [id, today]);
  return r[0].mp;
}

async function handleKenStatus(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  await ensureTables_();
  const today = dateKeyTokyo(new Date());
  return { ok: true, active: isActive_(id), todayMp: await todayMp_(id, today), dailyMax: KEN_DAILY_MAX };
}

async function handleKenClear(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  if (!isActive_(id)) return { ok: false, error: 'not_active' };
  const n = Math.floor(Number(body.n));
  const secs = Math.max(0, Math.floor(Number(body.secs) || 0));
  if (!validClear_(n, body.owner, body.cages, body.grid)) return { ok: false, error: 'invalid' };
  await ensureTables_();
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  const today = dateKeyTokyo(new Date());
  const base = secs >= KEN_MIN_SEC[n] ? KEN_MP[n] : 0;
  // 1日の上限を超えないように、今日の合計を見てから入れる
  const ins = await sql().query(
    `INSERT INTO ken_clears (student_id, day, size, secs, mp)
     SELECT $1, $2, $3, $4, LEAST($5::int, GREATEST(0, $6::int - coalesce((SELECT sum(mp) FROM ken_clears WHERE student_id = $1 AND day = $2), 0)::int))
     RETURNING mp`,
    [id, today, n, secs, base, KEN_DAILY_MAX]
  );
  const mp = Number(ins[0].mp) || 0;
  let newTotalPoints = null;
  if (mp > 0) {
    const st = await sql().query('UPDATE students SET points = points + $1 WHERE id = $2 RETURNING points', [mp, id]);
    newTotalPoints = Number(st[0].points) || 0;
  }
  return { ok: true, mp, todayMp: await todayMp_(id, today), dailyMax: KEN_DAILY_MAX, newTotalPoints };
}

// タイムランキング(2026-11-06〜)：レベル(3×3〜6×6)ごとに、一人一人の一番速いクリアタイムで上位30位。
// 1か月ごとの勝負(毎月1日に新しくなる。上位にはご褒美の予定、2026-11-06先生の指示)。body.month(YYYY-MM)で過去の月も見られる。
// KEN_MIN_SECより速い記録(機械的な送信の疑い)は入れない。先生(00001)も「先生」として載せる(2026-11-06先生の指示)。
const KEN_RANK_SIZE = 30;
async function handleKenRanking(body) {
  const myId = String(body.id || '').trim();
  const month = /^\d{4}-\d{2}$/.test(String(body.month || '')) ? String(body.month) : monthKeyTokyo(new Date());
  await ensureTables_();
  const rows = await sql().query(
    `SELECT b.student_id, b.size, b.secs, s.grade, s.desired_profession FROM (
       SELECT DISTINCT ON (student_id, size) student_id, size, secs, ts FROM ken_clears
       WHERE day LIKE $5 AND secs >= CASE size WHEN 3 THEN $1::int WHEN 4 THEN $2::int WHEN 5 THEN $3::int ELSE $4::int END
       ORDER BY student_id, size, secs, ts) b
     JOIN students s ON s.id = b.student_id
     ORDER BY b.size, b.secs, b.ts`,
    [KEN_MIN_SEC[3], KEN_MIN_SEC[4], KEN_MIN_SEC[5], KEN_MIN_SEC[6], month + '-%']
  );
  const out = {};
  [3, 4, 5, 6].forEach((n) => {
    const list = rows.filter((r) => Number(r.size) === n);
    let rank = 0, prev = null;
    const ranked = list.map((r, i) => {
      const secs = Number(r.secs);
      if (secs !== prev) { rank = i + 1; prev = secs; }
      return { rank, secs, id: r.student_id, grade: r.student_id === '00001' ? '先生' : (r.grade || ''), nickname: nicknameWithProfession_(r.student_id, r.desired_profession) };
    });
    const pub = (r) => ({ rank: r.rank, secs: r.secs, grade: r.grade, nickname: r.nickname, isYou: r.id === myId });
    const mi = ranked.findIndex((r) => r.id === myId);
    const nearby = mi === -1 ? [] : ranked.slice(Math.max(0, mi - 3), mi + 4).map(pub);
    out[n] = { top: ranked.slice(0, KEN_RANK_SIZE).map(pub), nearby, total: ranked.length };
  });
  return { ok: true, month, ranking: out };
}

module.exports = { handleKenStatus, handleKenClear, handleKenRanking, validClear_ };
