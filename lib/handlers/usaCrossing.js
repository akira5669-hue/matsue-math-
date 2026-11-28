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
const { nicknameForId } = require('./ranking');

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
  // 1日1周まで(2026-11-20 先生の指示)。先生(00001)はテストのため制限なし。
  const runNow = row.usaCrossingRun || {};
  // 2026-11-22〜 平日は1日1周、土日は1日3周まで
  const dowTokyo = new Date(Date.now() + 9 * 3600 * 1000).getUTCDay();
  const lapLimit = dowTokyo === 0 || dowTokyo === 6 ? 3 : 1;
  if (id !== '00001' && String(runNow.lastLapDay || '') === dateKeyTokyo(new Date()) && (Number(runNow.lapsOnDay) || 1) >= lapLimit) return { ok: false, error: 'lap_today' };

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

// ごほうびガチャ(2026-11-19 先生の指示)：2周目からは周のごほうびがガチャ。2周目2回・3周目3回・4周目4回・5周目からは5回。
// まわせる回数の合計は達成した周から計算し(usaGachaGranted_)、まわした回数は usa_crossing_run.gachaUsed に記録する。
// (以下、もとは10周目だけのガチャとして作った：3回まわせる。)何が出るかはサーバーで決めて、回数は usa_crossing_run.gacha10 に記録する。
// 種・実はサーバーで足す(端末から増やせないため)。それ以外は端末でふやす(ほかの周のごほうびと同じ)。
const USA_GACHA_SPINS_ = 3;
function usaGachaGranted_(laps) {
  let t = 0;
  for (let L = 2; L <= laps; L++) t += Math.min(L, 5);
  return t;
}
// 2026-11-19 先生の指示：HPアップはなし。宝石は★5が1%・★4が2%・★3が3%。おにぎり・ステーキも入れる。wは出やすさ(%、合計100)。
const USA_GACHA_PRIZES_ = [
  { prize: 'gem5', w: 0.5 }, // 2026-11-28 先生の指示：★5は0.5%・★4は1%・★3は2%。へった2.5%はステーキとおにぎりへ半分ずつ
  { prize: 'gem4', w: 1 },
  { prize: 'gem3', w: 2 },
  // 2026-11-22 先生の指示：ステーキ・おにぎりはそれぞれ10%。ほかを高くした。
  // 2026-11-28 先生の指示：宝箱より鍵が出やすく(鍵30% ＞ 宝箱の合計23%)。種・実は13%で、賢さの種はガチャ全体の1%。
  { prize: 'chestRainbow', w: 3 },
  { prize: 'dragonSword', w: 8 },
  { prize: 'chestGold', w: 8 },
  { prize: 'seed', w: 13 },
  { prize: 'chestSilver', w: 12 },
  { prize: 'key', w: 30 },
  { prize: 'steak', w: 11.25 },
  { prize: 'onigiri', w: 11.25 },
];
// ごほうびガチャで「種・実」(13%)が出たときの中身の出やすさ(ガチャ全体の%)：賢さの種1・賢さの実2・すばやさの種5・努力の種5。
// (7周目のごほうびの種・実は、今までどおり4種類から同じ確率)
const USA_GACHA_SEED_W_ = { wisdomSeed: 1, wisdomFruit: 2, speedSeed: 5, effortSeed: 5 };
function pickGachaSeed_() {
  const total = USA_SEED_KINDS_.reduce((a, k) => a + (USA_GACHA_SEED_W_[k.kind] || 0), 0);
  let r = Math.random() * total;
  for (const k of USA_SEED_KINDS_) { r -= USA_GACHA_SEED_W_[k.kind] || 0; if (r < 0) return k; }
  return USA_SEED_KINDS_[USA_SEED_KINDS_.length - 1];
}
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
      const pick = pickGachaSeed_();
      seedKind = pick.kind;
      await sql().query('UPDATE students SET ' + pick.column + ' = ' + pick.column + ' + 1 WHERE id = $1', [id]);
    }
    return { ok: true, prize, seedKind, used: 0, spins: USA_GACHA_SPINS_, test: true };
  }
  const laps = Math.max(0, Math.floor(Number(run.laps)) || 0);
  // 交番に届けたメダルのお礼(medalSpins)の分もまわせる(2026-11-22〜)
  const granted = usaGachaGranted_(laps) + Math.max(0, Math.floor(Number(run.medalSpins)) || 0);
  const used = Math.max(0, Math.floor(Number(run.gachaUsed)) || 0);
  if (granted <= 0) return { ok: false, error: 'not_eligible', used, granted };
  if (used >= granted) return { ok: false, error: 'no_spins', used, granted };
  const prize = pickUsaGachaPrize_();
  const nextRun = Object.assign({}, run, { gachaUsed: used + 1 });
  let seedKind = null, rows;
  if (prize === 'seed') {
    const pick = pickGachaSeed_();
    seedKind = pick.kind;
    rows = await sql().query(
      'UPDATE students SET ' + pick.column + ' = ' + pick.column + " + 1, usa_crossing_run = $1::jsonb WHERE id = $2 AND COALESCE((usa_crossing_run->>'gachaUsed')::int, 0) = $3 RETURNING id",
      [JSON.stringify(nextRun), id, used]);
  } else {
    rows = await sql().query(
      "UPDATE students SET usa_crossing_run = $1::jsonb WHERE id = $2 AND COALESCE((usa_crossing_run->>'gachaUsed')::int, 0) = $3 RETURNING id",
      [JSON.stringify(nextRun), id, used]);
  }
  if (!rows.length) return { ok: false, error: 'busy' };
  return { ok: true, prize, seedKind, used: used + 1, granted };
}

// 🍔 26州目のレストラン(2026-11-22 先生の指示)：食事は10MP、チップは0〜100MP。MPはサーバーで引く(足りなければ食べられない)。
const USA_RESTAURANT_MEAL_MP = 10;
async function handleUsaRestaurant(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  if (!usaCrossingOpenFor_(id)) return { ok: false, error: 'forbidden' };
  const tip = Math.max(0, Math.min(100, Math.floor(Number(body.tip)) || 0));
  const cost = USA_RESTAURANT_MEAL_MP + tip;
  const rows = await sql().query('UPDATE students SET points = points - $1 WHERE id = $2 AND points >= $1 RETURNING points', [cost, id]);
  if (!rows.length) return { ok: false, error: 'insufficient_points' };
  return { ok: true, points: Number(rows[0].points) || 0, cost, tip };
}

// 🏠 13州目のホームパーティー(2026-11-22 先生の指示)：参加料10MP。お菓子でHP+50(HPは端末で足す。レストランと同じ)。
// 参加すると友達が1人ふえる。友達は、アメリカ横断をしている(したことがある)ほかの生徒で、名前はランキングと同じニックネーム(例：爆炎の刃)。
// 1周の旅で1回まで(先生00001はテストのため何回でも)。友達はusa_friendsに記録する(usa_crossing_runは端末の値で上書きされるので使わない)。
// 1周達成するたびに、友達1人につき10MPのお祝い(USA_FRIEND_MP_ × 人数、USA_FRIEND_MAX_人=100MPまで)。友達のMPは減らない。
const USA_PARTY_MP = 10;
const USA_FRIEND_MP_ = 10, USA_FRIEND_MAX_ = 10;
let usaFriendTables_ = null;
function ensureUsaFriendTables_() {
  if (!usaFriendTables_) {
    usaFriendTables_ = (async () => {
      await sql().query(`CREATE TABLE IF NOT EXISTS usa_friends (
        student_id TEXT NOT NULL, friend_id TEXT NOT NULL, lap INTEGER NOT NULL, ts TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (student_id, friend_id))`, []);
      await sql().query(`CREATE TABLE IF NOT EXISTS usa_party_log (
        student_id TEXT NOT NULL, lap INTEGER NOT NULL, ts TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (student_id, lap))`, []);
      await sql().query(`CREATE TABLE IF NOT EXISTS usa_friend_celebrate (
        student_id TEXT NOT NULL, lap INTEGER NOT NULL, friends INTEGER NOT NULL, mp INTEGER NOT NULL, ts TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (student_id, lap))`, []);
    })().catch((e) => { usaFriendTables_ = null; throw e; });
  }
  return usaFriendTables_;
}
async function usaFriendCount_(id) {
  const r = await sql().query('SELECT COUNT(*)::int AS n FROM usa_friends WHERE student_id = $1', [id]);
  return r.length ? Number(r[0].n) || 0 : 0;
}
async function handleUsaHomeParty(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  if (!usaCrossingOpenFor_(id)) return { ok: false, error: 'forbidden' };
  await ensureUsaFriendTables_();
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  if (row.points < USA_PARTY_MP) return { ok: false, error: 'insufficient_points' };
  const run = row.usaCrossingRun || {};
  const lap = Math.max(0, Math.floor(Number(run.laps)) || 0) + 1; // 今まわっている周
  // 1周の旅で1回まで(先生は何回でも)。先に記録してから10MPを引く(2回押しても1回分だけ)
  if (id !== '00001') {
    const lg = await sql().query('INSERT INTO usa_party_log (student_id, lap) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING lap', [id, lap]);
    if (!lg.length) return { ok: false, error: 'already_joined' };
  }
  const p = await sql().query('UPDATE students SET points = points - $1 WHERE id = $2 AND points >= $1 RETURNING points', [USA_PARTY_MP, id]);
  if (!p.length) {
    if (id !== '00001') await sql().query('DELETE FROM usa_party_log WHERE student_id = $1 AND lap = $2', [id, lap]);
    return { ok: false, error: 'insufficient_points' };
  }
  await logShopPurchase_(id, row, 'ホームパーティー(' + lap + '周目)', USA_PARTY_MP);
  // 友達にするのは、アメリカ横断をしている(したことがある)ほかの生徒。まだ友達でない人からランダムに1人。
  const crossing = "usa_crossing_run IS NOT NULL AND (COALESCE((usa_crossing_run->>'active')::boolean, false) OR COALESCE((usa_crossing_run->>'progress')::int, 0) > 0 OR COALESCE((usa_crossing_run->>'laps')::int, 0) > 0)";
  const pickSql = (cond) => `SELECT id FROM students WHERE id <> $1 AND id <> '00001' AND ${cond}
     AND id NOT IN (SELECT friend_id FROM usa_friends WHERE student_id = $1) ORDER BY random() LIMIT 1`;
  let f = await sql().query(pickSql(crossing), [id]);
  // 先生(00001)のテスト：12月より前はほかに横断している人がいないので、だれか1人を友達にする
  if (!f.length && id === '00001') f = await sql().query(pickSql('TRUE'), [id]);
  let friend = null;
  if (f.length) {
    const ins = await sql().query('INSERT INTO usa_friends (student_id, friend_id, lap) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING friend_id', [id, f[0].id, lap]);
    if (ins.length) friend = nicknameForId(f[0].id);
  }
  return { ok: true, points: Number(p[0].points) || 0, friend, friends: await usaFriendCount_(id), lap };
}
// 周を達成したときのお祝い。端末から達成した周(lap)を送ってもらう(同期より先に届くことがあるので、サーバーの周+1まではOK)。
async function handleUsaFriendCelebrate(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  if (!usaCrossingOpenFor_(id)) return { ok: false, error: 'forbidden' };
  await ensureUsaFriendTables_();
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  const laps = Math.max(0, Math.floor(Number((row.usaCrossingRun || {}).laps)) || 0);
  const lap = Math.floor(Number(body.lap)) || 0;
  if (lap < 1 || lap > laps + 1) return { ok: false, error: 'bad_lap' };
  const n = await usaFriendCount_(id);
  const mp = Math.min(n, USA_FRIEND_MAX_) * USA_FRIEND_MP_;
  if (!mp) return { ok: true, friends: n, mp: 0 };
  const ins = await sql().query('INSERT INTO usa_friend_celebrate (student_id, lap, friends, mp) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING mp', [id, lap, n, mp]);
  if (!ins.length) return { ok: false, error: 'already_celebrated', friends: n };
  const p = await sql().query('UPDATE students SET points = points + $1 WHERE id = $2 RETURNING points', [mp, id]);
  return { ok: true, friends: n, mp, points: p.length ? Number(p[0].points) || 0 : null };
}
// 友達のニックネームの一覧(カードの表示用)
async function handleUsaFriends(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  if (!usaCrossingOpenFor_(id)) return { ok: false, error: 'forbidden' };
  await ensureUsaFriendTables_();
  const r = await sql().query('SELECT friend_id FROM usa_friends WHERE student_id = $1 ORDER BY ts', [id]);
  return { ok: true, friends: r.map((x) => nicknameForId(x.friend_id)) };
}

module.exports = { handleUsaCrossingEntryFee, handleUsaCrossingSeed, handleUsaCrossingGacha, handleUsaRestaurant, handleUsaHomeParty, handleUsaFriendCelebrate, handleUsaFriends, USA_CROSSING_ENTRY_FEE_MP };
