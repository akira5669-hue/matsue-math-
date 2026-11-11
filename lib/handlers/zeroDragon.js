const { sql } = require('../db');
const { findStudent } = require('../students');
const { dateKeyTokyo } = require('../util');
const { SPELLBOOK_ELEMENTS } = require('./shop');

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
      .then(() => sql().query(`CREATE TABLE IF NOT EXISTS zero_dragon_ufo (
        student_id TEXT NOT NULL, ts TIMESTAMPTZ NOT NULL DEFAULT now(), day TEXT NOT NULL, book TEXT NOT NULL DEFAULT '')`, []))
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

// 🛸UFOキャッチャーガチャ(ドラゴン専用、2026-11-11〜)：ゼロドラゴンを倒すたびに1回できる(倒した記録 zero_dragon_rewards の数 − 遊んだ数)。
// タイミングよく押してキャッチできたら、魔法の書を1冊(どれかはここでランダムに決める。13種類から同じ確率)。
// キャッチできたかは端末で決める(サーバーでは確かめられない)。書の冊数は端末で+1して、いつもの同期で保存する(なんでも屋で買った書と同じ)。
async function ufoPlaysLeft_(id, today) {
  const a = await sql().query('SELECT COUNT(*)::int AS n FROM zero_dragon_rewards WHERE student_id = $1 AND day = $2', [id, today]);
  const b = await sql().query('SELECT COUNT(*)::int AS n FROM zero_dragon_ufo WHERE student_id = $1 AND day = $2', [id, today]);
  return Math.max(0, (Number(a[0].n) || 0) - (Number(b[0].n) || 0));
}
async function handleZeroDragonUfoStatus(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  await ensureTables_();
  return { ok: true, playsLeft: await ufoPlaysLeft_(id, dateKeyTokyo(new Date())) };
}
async function handleZeroDragonUfoPlay(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  await ensureTables_();
  const today = dateKeyTokyo(new Date());
  if ((await ufoPlaysLeft_(id, today)) <= 0) return { ok: false, error: 'no_play' };
  const book = body.caught === true ? SPELLBOOK_ELEMENTS[Math.floor(Math.random() * SPELLBOOK_ELEMENTS.length)] : '';
  await sql().query('INSERT INTO zero_dragon_ufo (student_id, day, book) VALUES ($1, $2, $3)', [id, today, book]);
  return { ok: true, book, playsLeft: await ufoPlaysLeft_(id, today) };
}

module.exports = { handleZeroDragonReward, handleZeroDragonUfoStatus, handleZeroDragonUfoPlay, ZERO_DRAGON_DAILY_MAX };
