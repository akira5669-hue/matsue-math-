const { sql } = require('../db');
const { findStudent } = require('../students');
const { dateKeyTokyo } = require('../util');
const { logShopPurchase_ } = require('./shop');
const { nicknameWithProfession_ } = require('./ranking');

// ハロウィンイベント(2026-10-26〜10-31)。
// ・10問答えるごとにお化けが出る(トリック・オア・トリート)。なんでも屋で買った
//   お菓子を持っていれば1個渡して、お化けからごほうび(MP・HP・たまに宝箱)がもらえる。
//   持っていなければイタズラされて、次の1問だけ問題文が逆さまになる(クライアント側)。
// ・出会ったお化けは「お化け図鑑」に登録。ふつうのお化け8種類をそろえると+100MP(1回だけ)。
// ・ごくまれにレアお化け「キング・パンプキン」が出る。お菓子を渡すと虹色の宝箱。
//   出会った人はニックネームで図鑑に発表する。
// お化けの抽選・ごほうびはサーバー側で行い、出現回数は回答記録(records)の数で上限をかける。
const HALLOWEEN_START = '2026-10-26';
const HALLOWEEN_END = '2026-10-31';
const CANDY_COST_MP = 5;
const ANSWERS_PER_GHOST = 10;
const KING_CHANCE = 0.04;
const COMPLETE_BONUS_MP = 100;
const NORMAL_GHOSTS = ['obake', 'pumpkin', 'zombie', 'dracula', 'witch', 'blackcat', 'skeleton', 'bat'];
const KING_GHOST = 'king';
const CHEST_TIERS = ['bronze', 'silver', 'gold', 'rainbow'];

function isActive_(id, today) {
  return id === '00001' || (today >= HALLOWEEN_START && today <= HALLOWEEN_END);
}

let tablesReady = null;
function ensureTables_() {
  if (!tablesReady) {
    tablesReady = sql().query(`CREATE TABLE IF NOT EXISTS halloween_progress (
      student_id TEXT PRIMARY KEY, candy INTEGER NOT NULL DEFAULT 0, ghosts JSONB NOT NULL DEFAULT '{}',
      ghost_total INTEGER NOT NULL DEFAULT 0, king_count INTEGER NOT NULL DEFAULT 0,
      first_king_at TIMESTAMPTZ, complete_rewarded BOOLEAN NOT NULL DEFAULT false)`, [])
      .catch((e) => { tablesReady = null; throw e; });
  }
  return tablesReady;
}

async function getProgress_(id) {
  await sql().query('INSERT INTO halloween_progress (student_id) VALUES ($1) ON CONFLICT DO NOTHING', [id]);
  const rows = await sql().query('SELECT candy, ghosts, ghost_total, king_count, complete_rewarded FROM halloween_progress WHERE student_id = $1', [id]);
  const r = rows[0];
  return {
    candy: Number(r.candy) || 0,
    ghosts: (r.ghosts && typeof r.ghosts === 'object') ? r.ghosts : {},
    ghostTotal: Number(r.ghost_total) || 0,
    kingCount: Number(r.king_count) || 0,
    completeRewarded: !!r.complete_rewarded,
  };
}

async function kingFinders_() {
  const rows = await sql().query(
    'SELECT h.student_id, s.grade, s.desired_profession FROM halloween_progress h JOIN students s ON s.id = h.student_id WHERE h.king_count > 0 ORDER BY h.first_king_at ASC LIMIT 100',
    []
  );
  return rows.map((r) => ({ nickname: nicknameWithProfession_(r.student_id, r.desired_profession), grade: r.student_id === '00001' ? '先生' : r.grade }));
}

async function handleHalloweenStatus(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  await ensureTables_();
  const today = dateKeyTokyo(new Date());
  const p = await getProgress_(id);
  return Object.assign({ ok: true, active: isActive_(id, today), start: HALLOWEEN_START, end: HALLOWEEN_END, candyCostMp: CANDY_COST_MP, kingFinders: await kingFinders_() }, p);
}

async function handleHalloweenBuyCandy(body) {
  const id = String(body.id || '').trim();
  const qty = Math.min(10, Math.max(1, Math.floor(Number(body.qty)) || 1));
  if (!id) return { ok: false, error: 'missing_id' };
  await ensureTables_();
  if (!isActive_(id, dateKeyTokyo(new Date()))) return { ok: false, error: 'not_on_sale' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  const cost = CANDY_COST_MP * qty;
  const upd = await sql().query('UPDATE students SET points = points - $1 WHERE id = $2 AND points >= $1 RETURNING points', [cost, id]);
  if (upd.length === 0) return { ok: false, error: 'insufficient_points' };
  await getProgress_(id);
  const c = await sql().query('UPDATE halloween_progress SET candy = candy + $1 WHERE student_id = $2 RETURNING candy', [qty, id]);
  await logShopPurchase_(id, row, qty === 1 ? 'ハロウィンのお菓子' : `ハロウィンのお菓子×${qty}`, cost);
  return { ok: true, remainingPoints: Number(upd[0].points) || 0, candy: Number(c[0].candy) || 0, costMp: cost };
}

// お菓子を渡したときのごほうび：70% +10MP / 15% +15MP / 13% +10HP / 2% 宝箱。
function rollTreat_(isKing) {
  if (isKing) return { mp: 30, hp: 0, chest: 'rainbow' };
  const r = Math.random();
  if (r < 0.70) return { mp: 10, hp: 0, chest: null };
  if (r < 0.85) return { mp: 15, hp: 0, chest: null };
  if (r < 0.98) return { mp: 0, hp: 10, chest: null };
  return { mp: 0, hp: 0, chest: CHEST_TIERS[Math.floor(Math.random() * CHEST_TIERS.length)] };
}

async function handleHalloweenGhost(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  await ensureTables_();
  const today = dateKeyTokyo(new Date());
  if (!isActive_(id, today)) return { ok: false, error: 'not_active' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  const p = await getProgress_(id);

  // 出現回数の上限：イベント期間中の回答数÷10(回答の送信は数秒まとめて行うので2回分の余裕を持たせる)。
  if (id !== '00001') {
    const cnt = await sql().query(
      "SELECT count(*)::int AS n FROM records WHERE student_id = $1 AND ts >= ($2::date AT TIME ZONE 'Asia/Tokyo')",
      [id, HALLOWEEN_START]
    );
    const allowed = Math.floor((Number(cnt[0].n) || 0) / ANSWERS_PER_GHOST) + 2;
    if (p.ghostTotal >= allowed) return { ok: false, error: 'too_soon' };
  }

  const isKing = Math.random() < KING_CHANCE;
  const ghost = isKing ? KING_GHOST : NORMAL_GHOSTS[Math.floor(Math.random() * NORMAL_GHOSTS.length)];
  const ghosts = Object.assign({}, p.ghosts);
  const isNew = !ghosts[ghost];
  ghosts[ghost] = (Number(ghosts[ghost]) || 0) + 1;
  const completeNow = !p.completeRewarded && NORMAL_GHOSTS.every((g) => ghosts[g] > 0);
  await sql().query(
    `UPDATE halloween_progress SET ghosts = $1, ghost_total = ghost_total + 1,
       king_count = king_count + $2, first_king_at = CASE WHEN $2 > 0 AND first_king_at IS NULL THEN now() ELSE first_king_at END,
       complete_rewarded = complete_rewarded OR $3
     WHERE student_id = $4`,
    [JSON.stringify(ghosts), isKing ? 1 : 0, completeNow, id]
  );

  // お菓子を持っていれば1個渡す(同時に呼ばれても二重に使わないよう、減らせたときだけ)。
  const used = await sql().query('UPDATE halloween_progress SET candy = candy - 1 WHERE student_id = $1 AND candy > 0 RETURNING candy', [id]);
  const hadCandy = used.length > 0;
  const treat = hadCandy ? rollTreat_(isKing) : { mp: 0, hp: 0, chest: null };
  const bonusMp = completeNow ? COMPLETE_BONUS_MP : 0;
  const addMp = treat.mp + bonusMp;

  let st;
  if (treat.chest) {
    const key = 'chest' + treat.chest[0].toUpperCase() + treat.chest.slice(1);
    st = await sql().query(
      `UPDATE students SET points = points + $1, hp = hp + $2,
         treasure_items = jsonb_set(COALESCE(treasure_items, '{}'::jsonb), ARRAY[$3::text], to_jsonb(COALESCE((treasure_items->>$3::text)::int, 0) + 1))
       WHERE id = $4 RETURNING points, hp, treasure_items`,
      [addMp, treat.hp, key, id]
    );
  } else {
    st = await sql().query('UPDATE students SET points = points + $1, hp = hp + $2 WHERE id = $3 RETURNING points, hp, treasure_items', [addMp, treat.hp, id]);
  }
  return {
    ok: true, ghost, isKing, isNew, hadCandy, treat, completeBonusMp: bonusMp,
    candy: hadCandy ? Number(used[0].candy) || 0 : 0,
    ghosts, completeRewarded: p.completeRewarded || completeNow,
    newTotalPoints: Number(st[0].points) || 0, hp: Number(st[0].hp) || 0,
    treasureItems: (st[0].treasure_items && typeof st[0].treasure_items === 'object') ? st[0].treasure_items : null,
  };
}

module.exports = {
  handleHalloweenStatus, handleHalloweenBuyCandy, handleHalloweenGhost,
  HALLOWEEN_START, HALLOWEEN_END, CANDY_COST_MP,
};
