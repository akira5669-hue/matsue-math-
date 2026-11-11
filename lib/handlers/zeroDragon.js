const { sql } = require('../db');
const { findStudent } = require('../students');
const { dateKeyTokyo } = require('../util');

// 🐉ゼロドラゴンを倒したごほうび(2026-11-11〜)：必ず種か実を1つ、ここでランダムに決めて渡す。
// 賢さの種・賢さの実・努力の種は、ずるで増やせないようにサーバーでしか増やせない(sync.jsはLEASTで小さい方だけ採用)ので、ここで足す。
// すばやさの種は端末の数がそのまま保存されるので、ここでは足さずに端末で+1する。
// 本当に倒したかはサーバーでは確かめられないので、1日ZERO_DRAGON_DAILY_MAX回までにする。app.jsと揃えること。
const ZERO_DRAGON_DAILY_MAX = 10;
// 出る確率(合計100%)：賢さの種0.3%・賢さの実3%・すばやさの種30%・努力の種66.7%(先生の指示)
const ZERO_DRAGON_SEEDS = [
  { kind: 'wisdomSeed', p: 0.003, column: 'wisdom_seed_count' },
  { kind: 'wisdomFruit', p: 0.03, column: 'wisdom_fruit_count' },
  { kind: 'speedSeed', p: 0.30, column: null },
  { kind: 'effortSeed', p: 0.667, column: 'effort_seed_count' },
];

let tablesReady = null;
function ensureTables_() {
  if (!tablesReady) {
    tablesReady = sql().query(`CREATE TABLE IF NOT EXISTS zero_dragon_rewards (
      student_id TEXT NOT NULL, ts TIMESTAMPTZ NOT NULL DEFAULT now(), day TEXT NOT NULL, kind TEXT NOT NULL)`, [])
      .catch((e) => { tablesReady = null; throw e; });
  }
  return tablesReady;
}

function rollSeed_() {
  const r = Math.random();
  let acc = 0;
  for (const s of ZERO_DRAGON_SEEDS) {
    acc += s.p;
    if (r < acc) return s;
  }
  return ZERO_DRAGON_SEEDS[ZERO_DRAGON_SEEDS.length - 1];
}

async function handleZeroDragonReward(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  await ensureTables_();
  const today = dateKeyTokyo(new Date());
  const cnt = await sql().query('SELECT COUNT(*)::int AS n FROM zero_dragon_rewards WHERE student_id = $1 AND day = $2', [id, today]);
  if ((Number(cnt[0].n) || 0) >= ZERO_DRAGON_DAILY_MAX) return { ok: false, error: 'daily_limit' };
  const seed = rollSeed_();
  await sql().query('INSERT INTO zero_dragon_rewards (student_id, day, kind) VALUES ($1, $2, $3)', [id, today, seed.kind]);
  if (seed.column) await sql().query(`UPDATE students SET ${seed.column} = ${seed.column} + 1 WHERE id = $1`, [id]);
  return { ok: true, kind: seed.kind };
}

module.exports = { handleZeroDragonReward, ZERO_DRAGON_DAILY_MAX };
