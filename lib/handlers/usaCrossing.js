const { sql } = require('../db');
const { findStudent } = require('../students');
const { dateKeyTokyo } = require('../util');
// 2026-11-19 先生の指示：12月1日〜31日は全員に公開(先生00001はいつでも)。app.jsのUSA_CROSSING_START_/END_と揃えること。
const USA_CROSSING_START_ = '2026-12-01';
const USA_CROSSING_END_ = '2026-12-31';
function usaCrossingOpenFor_(id) {
  if (id === '00001') return true;
  const today = dateKeyTokyo(new Date());
  return today >= USA_CROSSING_START_ && today <= USA_CROSSING_END_;
}
const { logShopPurchase_ } = require('./shop');

// アメリカ横断・理科バトル：2026年12月限定(作成中、今は00001専用プレビュー)。
// 参加料100MPを払うと、理科バトルに挑戦できる(50州の進み具合は2026-11-16〜サーバーにも保存し、別の端末でも続きから。
// 参加料の払い方はお鉢巡りと同じ方式)。
// 2026-11-13〜 参加料は無料(先生の指示)。0のときはMPを引かず、購入履歴にも残さない。
const USA_CROSSING_ENTRY_FEE_MP = 0;

async function handleUsaCrossingEntryFee(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  // 今は00001だけに見せる作成中プレビューなので、サーバー側でも管理者限定にする。
  // 将来、一般公開するときはこのチェックを外すか、12月の日付窓チェックに切り替える。
  if (!usaCrossingOpenFor_(id)) return { ok: false, error: 'forbidden' };

  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  if (row.points < USA_CROSSING_ENTRY_FEE_MP) return { ok: false, error: 'insufficient_points' };

  if (USA_CROSSING_ENTRY_FEE_MP <= 0) return { ok: true, points: row.points };
  const newPoints = row.points - USA_CROSSING_ENTRY_FEE_MP;
  await sql().query('UPDATE students SET points = $1 WHERE id = $2', [newPoints, id]);
  // 挑戦回数を後から追えるよう、なんでも屋の購入履歴と同じ仕組みでログに残す。
  await logShopPurchase_(id, row, 'アメリカ横断(参加料)', USA_CROSSING_ENTRY_FEE_MP);
  return { ok: true, points: newPoints };
}

// 7周目のごほうびの種・実(2026-11-16〜)。賢さの種/賢さの実/すばやさの種/努力の種から等確率で1つ。
// 6周以上達成していて(7周目の達成時はまだ6周の記録のことがあるため)、まだ受け取っていない人だけ。
const USA_SEED_KINDS_ = [
  { kind: 'wisdomSeed', column: 'wisdom_seed_count' },
  { kind: 'wisdomFruit', column: 'wisdom_fruit_count' },
  { kind: 'speedSeed', column: 'speed_seed_count' },
  { kind: 'effortSeed', column: 'effort_seed_count' },
];
async function handleUsaCrossingSeed(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  if (!usaCrossingOpenFor_(id)) return { ok: false, error: 'forbidden' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  const run = row.usaCrossingRun || {};
  if ((Number(run.laps) || 0) < 6) return { ok: false, error: 'not_eligible' };
  if (run.seed7) return { ok: false, error: 'already_claimed' };
  const pick = USA_SEED_KINDS_[Math.floor(Math.random() * USA_SEED_KINDS_.length)];
  const nextRun = Object.assign({}, run, { seed7: true, laps: Math.max(7, Number(run.laps) || 0) });
  const rows = await sql().query(
    `UPDATE students SET ${pick.column} = ${pick.column} + 1, usa_crossing_run = $1::jsonb
     WHERE id = $2 AND COALESCE((usa_crossing_run->>'seed7')::boolean, false) = false RETURNING id`,
    [JSON.stringify(nextRun), id]);
  if (!rows.length) return { ok: false, error: 'already_claimed' };
  return { ok: true, kind: pick.kind };
}

// 10周目のごほうびガチャ(2026-11-19 先生の指示)：3回まわせる。何が出るかはサーバーで決めて、回数は usa_crossing_run.gacha10 に記録する。
// 種・実はサーバーで足す(端末から増やせないため)。それ以外は端末でふやす(ほかの周のごほうびと同じ)。
const USA_GACHA_SPINS_ = 3;
// HPのごほうびはなし、宝石は全種類(2026-11-19 先生の指示)。wは出やすさ(合計100)。
const USA_GACHA_PRIZES_ = [
  { prize: 'chestRainbow', w: 7 },
  { prize: 'chestGold', w: 13 },
  { prize: 'chestSilver', w: 20 },
  { prize: 'key', w: 20 },
  { prize: 'gem', w: 13 },
  { prize: 'dragonSword', w: 13 },
  { prize: 'seed', w: 14 },
];
function pickUsaGachaPrize_() {
  const total = USA_GACHA_PRIZES_.reduce((a, p) => a + p.w, 0);
  let r = Math.random() * total;
  for (const p of USA_GACHA_PRIZES_) { r -= p.w; if (r < 0) return p.prize; }
  return USA_GACHA_PRIZES_[0].prize;
}
async function handleUsaCrossingGacha(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  if (!usaCrossingOpenFor_(id)) return { ok: false, error: 'forbidden' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  const run = row.usaCrossingRun || {};
  // 先生(00001)はテスト用に、10周していなくても何回でもまわせる(回数は数えない。2026-11-19 先生の指示)
  if (id === '00001') {
    const prize = pickUsaGachaPrize_();
    let seedKind = null;
    if (prize === 'seed') {
      const pick = USA_SEED_KINDS_[Math.floor(Math.random() * USA_SEED_KINDS_.length)];
      seedKind = pick.kind;
      await sql().query('UPDATE students SET ' + pick.column + ' = ' + pick.column + ' + 1 WHERE id = $1', [id]);
    }
    return { ok: true, prize, seedKind, used: 0, spins: USA_GACHA_SPINS_, test: true };
  }
  // 10周目の達成の直後は、サーバーの記録がまだ9周のことがあるので9以上でOK(7周目の種と同じ考え方)
  if ((Number(run.laps) || 0) < 9) return { ok: false, error: 'not_eligible' };
  const used = Math.max(0, Math.floor(Number(run.gacha10)) || 0);
  if (used >= USA_GACHA_SPINS_) return { ok: false, error: 'no_spins', used };
  const prize = pickUsaGachaPrize_();
  const nextRun = Object.assign({}, run, { gacha10: used + 1, laps: Math.max(10, Number(run.laps) || 0) });
  let seedKind = null, rows;
  if (prize === 'seed') {
    const pick = USA_SEED_KINDS_[Math.floor(Math.random() * USA_SEED_KINDS_.length)];
    seedKind = pick.kind;
    rows = await sql().query(
      'UPDATE students SET ' + pick.column + ' = ' + pick.column + " + 1, usa_crossing_run = $1::jsonb WHERE id = $2 AND COALESCE((usa_crossing_run->>'gacha10')::int, 0) = $3 RETURNING id",
      [JSON.stringify(nextRun), id, used]);
  } else {
    rows = await sql().query(
      "UPDATE students SET usa_crossing_run = $1::jsonb WHERE id = $2 AND COALESCE((usa_crossing_run->>'gacha10')::int, 0) = $3 RETURNING id",
      [JSON.stringify(nextRun), id, used]);
  }
  if (!rows.length) return { ok: false, error: 'busy' };
  return { ok: true, prize, seedKind, used: used + 1, spins: USA_GACHA_SPINS_ };
}

module.exports = { handleUsaCrossingEntryFee, handleUsaCrossingSeed, handleUsaCrossingGacha, USA_CROSSING_ENTRY_FEE_MP };
