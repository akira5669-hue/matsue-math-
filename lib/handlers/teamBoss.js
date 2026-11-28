const { sql } = require('../db');
const { findStudent } = require('../students');
const { dateKeyTokyo } = require('../util');
const { nicknameForId } = require('./ranking');

// 👹 チームボス戦(2026-12-26〜12-31、2026-11-25 先生の指示)
// ・「参加する」ボタンで申しこんでおくと、期間中の毎日 6:30〜22:30 に攻撃できる(2026-11-26 先生の指示で変更)。
// ・レベル帯ごとにボスが1体。毎日6:30に満タンの新しいボスが出る。倒したらその日は終了。
// ・攻撃は1人1日3回(3問。2026-11-26 先生の指示)。自分の学年の問題(計算・図形・文章題など)か、前にまちがえた問題。正解でダメージ(素手100、武器を使うとその武器のダメージ。最大1000)。
// ・不正解はHPが減る(レベル帯ごと)。
// ・倒したら、その日にそのボスへ与えたダメージの合計に比例してMPを分ける(2026-11-26 先生の指示)。
// 先生(00001)は期間外・時間外でもテストできる(テスト用のボスで、何回でも攻撃できる)。
const TB_START_ = '2026-12-26';
const TB_END_ = '2026-12-31';
const TB_SIGNUP_FROM_ = '2026-12-01';
const TB_OPEN_MIN_ = 6 * 60 + 30;     // 6:30
const TB_CLOSE_MIN_ = 22 * 60 + 30;   // 22:30
const TB_PER_DAY_ = 3;                 // 1人1日3問(3回攻撃)
// 2026-11-26〜 Lv1〜49 と Lv1000以上 のボスを追加(先生の指示)。山分けのMPは2026-11-26の数のまま、HPだけ2026-11-26に引き上げ(先生の指示)
const TB_TIERS_ = [
  { tier: 0, name: '🐣 ひよこ大将', minLv: 1, maxLv: 49, hp: 5000, mp: 2000, penalty: 50 },
  { tier: 1, name: '⛄ 雪だるまキング', minLv: 50, maxLv: 99, hp: 8000, mp: 3000, penalty: 100 },
  { tier: 2, name: '🎅 ブラックサンタ', minLv: 100, maxLv: 299, hp: 10000, mp: 5000, penalty: 200 },
  { tier: 3, name: '🐉 年越しドラゴン', minLv: 300, maxLv: 499, hp: 15000, mp: 7000, penalty: 300 },
  { tier: 4, name: '👹 大みそか大魔王', minLv: 500, maxLv: 999, hp: 20000, mp: 10000, penalty: 500 },
  { tier: 5, name: '🔔 除夜の鐘の魔神', minLv: 1000, maxLv: null, hp: 25000, mp: 25000, penalty: 1000 },
];
// 📖 魔法の書も使える(2026-11-26 先生の指示)。どの書もどのボスに効く。ダメージは素手100＋書のダメージ。
// 詠唱すると自分のHPが10減る(ふだんのボス戦と同じ)。1冊へる。app.jsのSPELLBOOKS_と揃えること。
const TB_BOOK_DMG_ = { thunder: 50, fire: 50, ice: 50, rock: 50, quake: 100, darkchain: 50, darkwave: 100, darkdragon: 150, demonwave: 200, darkcollapse: 300, lightarrow: 50, angellight: 200, holyburst: 300 };
const TB_BOOK_SELF_HP_ = 10;
// 武器(1回使うと1回分へる)。app.jsのTB_WEAPONS_と揃えること。
const TB_WEAPONS_ = {
  none: { dmg: 100 },
  skySpear: { dmg: 200, col: 'sky_spear_charges', field: 'skySpearCharges' },
  raidenAxe: { dmg: 300, col: 'raiden_axe_charges', field: 'raidenAxeCharges' },
  iceSword: { dmg: 500, col: 'ice_sword_charges', field: 'iceSwordCharges' },
  dragonSword: { dmg: 700, col: 'dragon_sword_count', field: 'dragonSwordCount' },
  yushaSword: { dmg: 1000, col: 'yusha_sword_count', field: 'yushaSwordCount' },
  // 🔥炎の剣(2026-11-28 先生の指示)：アメリカ横断の周回のごほうび。何度でも使える。使うたびに自分のHPがへる(HPがその数より多いときだけ)。
  // 赤10周・青20周・紫30周(app.jsのFLAME_SWORDS_と揃える)
  flameRed: { dmg: 1500, flame: true, selfHp: 300, minLevel: 1000, laps: 10 },
  flameBlue: { dmg: 2000, flame: true, selfHp: 500, minLevel: 1500, laps: 20 },
  flamePurple: { dmg: 2500, flame: true, selfHp: 700, minLevel: 2000, laps: 30 },
};

function tierForLevel_(lv) {
  lv = Number(lv) || 1;
  for (let i = TB_TIERS_.length - 1; i >= 0; i--) if (lv >= TB_TIERS_[i].minLv) return TB_TIERS_[i];
  return TB_TIERS_[0];
}
function tokyoMinutes_() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
function eventDay_(today) { return today >= TB_START_ && today <= TB_END_; }
function inWindow_() { const m = tokyoMinutes_(); return m >= TB_OPEN_MIN_ && m < TB_CLOSE_MIN_; }
// ボスの日のキー。先生が期間外・時間外にテストするときは 'test-日付'(本番のボスとは別)
function dayKeyFor_(id, today) {
  if (eventDay_(today) && inWindow_()) return today;
  return id === '00001' ? 'test-' + today : null;
}

let ready = null;
function ensureTables_() {
  if (!ready) {
    ready = sql().query(`CREATE TABLE IF NOT EXISTS team_boss_entry (
        student_id TEXT PRIMARY KEY, ts TIMESTAMPTZ NOT NULL DEFAULT now())`, [])
      .then(() => sql().query(`CREATE TABLE IF NOT EXISTS team_boss_day (
        day TEXT NOT NULL, tier INTEGER NOT NULL, hp INTEGER NOT NULL, max_hp INTEGER NOT NULL,
        defeated_at TIMESTAMPTZ, winner_id TEXT, PRIMARY KEY (day, tier))`, []))
      .then(() => sql().query(`CREATE TABLE IF NOT EXISTS team_boss_attack (
        aid BIGSERIAL PRIMARY KEY, day TEXT NOT NULL, tier INTEGER NOT NULL, student_id TEXT NOT NULL,
        weapon TEXT NOT NULL DEFAULT 'none', answered BOOLEAN NOT NULL DEFAULT false, correct BOOLEAN NOT NULL DEFAULT false,
        dmg INTEGER NOT NULL DEFAULT 0, ts TIMESTAMPTZ NOT NULL DEFAULT now())`, []))
      .then(() => sql().query('ALTER TABLE team_boss_attack ADD COLUMN IF NOT EXISTS n INTEGER NOT NULL DEFAULT 1', []))
      .then(() => sql().query('DROP INDEX IF EXISTS team_boss_attack_once', []))
      .then(() => sql().query('CREATE UNIQUE INDEX IF NOT EXISTS team_boss_attack_n ON team_boss_attack (day, student_id, n) WHERE day NOT LIKE \'test-%\'', []))
      .then(() => sql().query(`CREATE TABLE IF NOT EXISTS team_boss_payout (
        day TEXT NOT NULL, tier INTEGER NOT NULL, student_id TEXT NOT NULL, mp INTEGER NOT NULL,
        ts TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (day, tier, student_id))`, []))
      .catch((e) => { ready = null; throw e; });
  }
  return ready;
}
// 倒されるたびに、次の日からのボスのHPが1000ずつ増える(2026-11-26 先生の指示)。
// その日のHP = 最初のHP + 1000 × (前の日までに倒された回数)。倒せなかった日はふえない(その日のHPのまま次の日も満タンで出る)。
// 先生のテスト用のボス('test-日付')は、テスト用の日だけで数える。
const TB_GROW_PER_DEFEAT_ = 1000;
async function dayMaxHp_(day, t) {
  const isTest = day.indexOf('test-') === 0;
  const r = await sql().query(
    'SELECT COUNT(*)::int AS n FROM team_boss_day WHERE tier = $1 AND defeated_at IS NOT NULL AND day < $2 AND ' + (isTest ? "day LIKE 'test-%'" : "day NOT LIKE 'test-%' AND day >= $3"),
    isTest ? [t.tier, day] : [t.tier, day, TB_START_]);
  return t.hp + TB_GROW_PER_DEFEAT_ * (Number(r[0].n) || 0);
}
async function bossRow_(day, t) {
  const maxHp = await dayMaxHp_(day, t);
  await sql().query('INSERT INTO team_boss_day (day, tier, hp, max_hp) VALUES ($1, $2, $3, $3) ON CONFLICT DO NOTHING', [day, t.tier, maxHp]);
  // ボスのHPを変えたとき、その日にもう出ているボスも新しいHPにそろえる(けずった分はそのまま。倒されたボスはそのまま)。
  // 前は、その日のボスが古いHPのままで、一覧の「HP5000」とバーの「2000/2000」がちがっていた(2026-11-26 先生の指摘)。
  await sql().query('UPDATE team_boss_day SET hp = GREATEST(1, hp + ($3 - max_hp)), max_hp = $3 WHERE day = $1 AND tier = $2 AND max_hp <> $3 AND defeated_at IS NULL', [day, t.tier, maxHp]);
  const r = await sql().query('SELECT hp, max_hp, defeated_at, winner_id FROM team_boss_day WHERE day = $1 AND tier = $2', [day, t.tier]);
  return r[0];
}

async function handleTeamBossStatus(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  await ensureTables_();
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  const today = dateKeyTokyo(new Date());
  const t = tierForLevel_(row.level);
  const e = await sql().query('SELECT 1 FROM team_boss_entry WHERE student_id = $1', [id]);
  const cnt = await sql().query('SELECT COUNT(*)::int AS n FROM team_boss_entry', []);
  const day = dayKeyFor_(id, today);
  const showDay = day || (eventDay_(today) ? today : null);
  const bosses = [];
  if (showDay) {
    for (const bt of TB_TIERS_) {
      const b = await bossRow_(showDay, bt);
      const a = await sql().query('SELECT COUNT(DISTINCT student_id)::int AS n FROM team_boss_attack WHERE day = $1 AND tier = $2 AND correct AND dmg > 0', [showDay, bt.tier]);
      bosses.push({ tier: bt.tier, hp: Number(b.hp), max: Number(b.max_hp), defeated: !!b.defeated_at, hitters: Number(a[0].n) || 0, winner: b.winner_id ? nicknameForId(b.winner_id) : null });
    }
  }
  const mine = day ? await sql().query('SELECT weapon, answered, correct, dmg FROM team_boss_attack WHERE day = $1 AND student_id = $2 ORDER BY aid', [day, id]) : [];
  const pays = await sql().query('SELECT day, tier, mp FROM team_boss_payout WHERE student_id = $1 ORDER BY day', [id]);
  return {
    ok: true, today, start: TB_START_, end: TB_END_, signupFrom: TB_SIGNUP_FROM_,
    eventDay: eventDay_(today), inWindow: inWindow_(), canSignup: id === '00001' || (today >= TB_SIGNUP_FROM_ && today <= TB_END_),
    test: !!day && day.indexOf('test-') === 0,
    signedUp: e.length > 0, entries: Number(cnt[0].n) || 0, tier: t.tier, level: row.level, hp: row.hp,
    tiers: TB_TIERS_.map((x) => ({ tier: x.tier, name: x.name, minLv: x.minLv, maxLv: x.maxLv, hp: x.hp, mp: x.mp, penalty: x.penalty })),
    perDay: TB_PER_DAY_, myToday: mine, left: Math.max(0, TB_PER_DAY_ - mine.length),
    bosses, canAttack: !!day && (day.indexOf('test-') === 0 || mine.length < TB_PER_DAY_),
    payouts: pays.map((p) => ({ day: p.day, tier: Number(p.tier), mp: Number(p.mp) })),
  };
}

async function handleTeamBossSignup(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  await ensureTables_();
  const today = dateKeyTokyo(new Date());
  if (id !== '00001' && (today < TB_SIGNUP_FROM_ || today > TB_END_)) return { ok: false, error: 'closed' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  await sql().query('INSERT INTO team_boss_entry (student_id) VALUES ($1) ON CONFLICT DO NOTHING', [id]);
  return { ok: true };
}

// ① 攻撃を始める(問題を出す前に、今日の1回を使う。問題を見てからやめて出し直すことはできない)。武器もここで使う。
async function handleTeamBossStart(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  await ensureTables_();
  const today = dateKeyTokyo(new Date());
  const day = dayKeyFor_(id, today);
  if (!day) return { ok: false, error: eventDay_(today) ? 'not_in_time' : 'not_event_day' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  const e = await sql().query('SELECT 1 FROM team_boss_entry WHERE student_id = $1', [id]);
  if (!e.length) return { ok: false, error: 'not_signed_up' };
  const t = tierForLevel_(row.level);
  const b = await bossRow_(day, t);
  if (b.defeated_at) return { ok: false, error: 'defeated' };
  const bookId = /^book:/.test(String(body.weapon || '')) ? String(body.weapon).slice(5) : null;
  if (bookId && !TB_BOOK_DMG_[bookId]) return { ok: false, error: 'no_weapon' };
  const wKey = bookId ? 'book:' + bookId : (TB_WEAPONS_[body.weapon] ? body.weapon : 'none');
  const w = bookId ? { dmg: 100 + TB_BOOK_DMG_[bookId] } : TB_WEAPONS_[wKey];
  if (w.col && !((Number(row[w.field]) || 0) > 0)) return { ok: false, error: 'no_weapon' };
  if (bookId && !((Number((row.spellbooks || {})[bookId]) || 0) > 0)) return { ok: false, error: 'no_weapon' };
  if (w.flame) {
    if (id !== '00001' && (Number((row.usaCrossingRun || {}).laps) || 0) < w.laps) return { ok: false, error: 'no_weapon' };
    if ((Number(row.level) || 0) < w.minLevel) return { ok: false, error: 'flame_level' };
    if ((Number(row.hp) || 0) <= w.selfHp) return { ok: false, error: 'flame_hp' };
  }
  // 今日の何回目か。3回まで(同時に押しても、(日,生徒,回)の重なりはDBで止まる)
  const c = await sql().query('SELECT COUNT(*)::int AS n FROM team_boss_attack WHERE day = $1 AND student_id = $2', [day, id]);
  const n = (Number(c[0].n) || 0) + 1;
  if (day.indexOf('test-') !== 0 && n > TB_PER_DAY_) return { ok: false, error: 'already_attacked' };
  let ins;
  try {
    ins = await sql().query('INSERT INTO team_boss_attack (day, tier, student_id, weapon, n) VALUES ($1, $2, $3, $4, $5) RETURNING aid', [day, t.tier, id, wKey, n]);
  } catch (err) {
    return { ok: false, error: 'already_attacked' };
  }
  if (w.col) await sql().query(`UPDATE students SET ${w.col} = GREATEST(0, ${w.col} - 1) WHERE id = $1`, [id]);
  if (w.flame) await sql().query('UPDATE students SET hp = GREATEST(0, hp - $2) WHERE id = $1', [id, w.selfHp]);
  if (bookId) {
    await sql().query(`UPDATE students SET spellbooks = jsonb_set(COALESCE(spellbooks, '{}'::jsonb), ARRAY[$2::text], to_jsonb(GREATEST(0, COALESCE((spellbooks->>$2)::int, 0) - 1))),
       hp = GREATEST(0, hp - $3) WHERE id = $1`, [id, bookId, TB_BOOK_SELF_HP_]);
  }
  return { ok: true, aid: String(ins[0].aid), tier: t.tier, weapon: wKey, dmg: w.dmg, penalty: t.penalty, n, left: Math.max(0, TB_PER_DAY_ - n) };
}

// ② 答えを送る。正解ならダメージ、不正解ならHPが減る。倒したら山分け。
async function handleTeamBossAnswer(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  await ensureTables_();
  const aid = String(body.aid || '');
  if (!/^\d+$/.test(aid)) return { ok: false, error: 'bad_aid' };
  const correct = body.correct === true;
  const at = await sql().query('SELECT day, tier, weapon FROM team_boss_attack WHERE aid = $1 AND student_id = $2', [aid, id]);
  if (!at.length) return { ok: false, error: 'bad_aid' };
  const { day, weapon } = at[0];
  const tier = Number(at[0].tier);
  const t = TB_TIERS_[tier];
  const w = /^book:/.test(weapon) && TB_BOOK_DMG_[weapon.slice(5)] ? { dmg: 100 + TB_BOOK_DMG_[weapon.slice(5)] } : (TB_WEAPONS_[weapon] || TB_WEAPONS_.none);
  const dmg = correct ? Math.min(2500, w.dmg) : 0; // いちばん強い炎の剣(紫)が2500
  const up = await sql().query('UPDATE team_boss_attack SET answered = true, correct = $2, dmg = $3 WHERE aid = $1 AND NOT answered RETURNING aid', [aid, correct, dmg]);
  if (!up.length) return { ok: false, error: 'already_answered' };
  if (!correct) {
    const h = await sql().query('UPDATE students SET hp = GREATEST(0, hp - $1) WHERE id = $2 RETURNING hp', [t.penalty, id]);
    const b = await sql().query('SELECT hp, max_hp, defeated_at FROM team_boss_day WHERE day = $1 AND tier = $2', [day, tier]);
    return { ok: true, correct: false, penalty: t.penalty, hp: h.length ? Number(h[0].hp) || 0 : 0, bossHp: b.length ? Number(b[0].hp) : null, bossMax: b.length ? Number(b[0].max_hp) : null };
  }
  // ボスのHPを減らす。0にした1回だけが「倒した」になる(同時に攻撃しても山分けは1回)。
  const hit = await sql().query(
    `UPDATE team_boss_day SET hp = GREATEST(0, hp - $3),
       defeated_at = CASE WHEN hp - $3 <= 0 THEN now() ELSE NULL END,
       winner_id = CASE WHEN hp - $3 <= 0 THEN $4 ELSE NULL END
     WHERE day = $1 AND tier = $2 AND hp > 0 RETURNING hp, max_hp`, [day, tier, dmg, id]);
  if (!hit.length) {
    // 答えている間に、ほかの人が倒していた。この正解のダメージは入らない(分けまえは、倒されたときまでのダメージで決まっている)。
    await sql().query('UPDATE team_boss_attack SET dmg = 0 WHERE aid = $1', [aid]);
    const b = await sql().query('SELECT max_hp FROM team_boss_day WHERE day = $1 AND tier = $2', [day, tier]);
    const p2 = await sql().query('SELECT mp FROM team_boss_payout WHERE day = $1 AND tier = $2 AND student_id = $3', [day, tier, id]);
    const pts = await sql().query('SELECT points FROM students WHERE id = $1', [id]);
    return { ok: true, correct: true, dmg: 0, already: true, bossHp: 0, bossMax: b.length ? Number(b[0].max_hp) : t.hp, defeated: true, mp: p2.length ? Number(p2[0].mp) : 0, points: pts.length ? Number(pts[0].points) : null };
  }
  const bossHp = Number(hit[0].hp);
  const res = { ok: true, correct: true, dmg, bossHp, bossMax: Number(hit[0].max_hp), defeated: bossHp <= 0 };
  if (res.defeated) {
    const pay = await payout_(day, tier, id);
    const me = pay.list.filter((x) => x.sid === id)[0];
    res.hitters = pay.n; res.totalDmg = pay.total;
    res.myDmg = me ? me.dmg : 0; res.mp = me ? me.mp : 0;
    const pts = await sql().query('SELECT points FROM students WHERE id = $1', [id]);
    res.points = pts.length ? Number(pts[0].points) : null;
  }
  return res;
}
const NOTICE_SQL_ = "pending_notice = CASE WHEN pending_notice IS NULL OR pending_notice = '' THEN $3 ELSE pending_notice || E'\\n\\n' || $3 END";
// 倒したとき：その日にそのボスへ与えたダメージの合計に比例してMPを分ける(端数は切り捨て。2026-11-26 先生の指示)
// 例：1問正解で1000ダメージの人は、3問正解で300ダメージの人より多くもらえる。とどめの1撃もダメージに入る。
async function payout_(day, tier, selfId) {
  const t = TB_TIERS_[tier];
  const r = await sql().query('SELECT student_id, SUM(dmg)::int AS d FROM team_boss_attack WHERE day = $1 AND tier = $2 AND correct AND dmg > 0 GROUP BY student_id', [day, tier]);
  const total = r.reduce((a, x) => a + (Number(x.d) || 0), 0);
  const list = r.map((x) => ({ sid: x.student_id, dmg: Number(x.d) || 0, mp: total > 0 ? Math.floor(t.mp * (Number(x.d) || 0) / total) : 0 }));
  const label = day.indexOf('test-') === 0 ? '（テスト）' : '';
  for (const x of list) {
    const ins = await sql().query('INSERT INTO team_boss_payout (day, tier, student_id, mp) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING mp', [day, tier, x.sid, x.mp]);
    if (!ins.length) continue;
    const pct = total > 0 ? Math.round(x.dmg / total * 1000) / 10 : 0;
    const msg = '👹【チームボス戦' + label + '】' + t.name + 'を、' + list.length + '人で倒した！ あなたのダメージは合計' + x.dmg + '（みんなの' + pct + '%）。' + t.mp + 'MPをダメージの多さで分けて、' + x.mp + 'MPが入ったよ！';
    // 倒した本人には、その場で画面に出すのでお知らせは送らない
    if (x.sid === selfId) await sql().query('UPDATE students SET points = points + $2 WHERE id = $1', [x.sid, x.mp]);
    else await sql().query('UPDATE students SET points = points + $2, ' + NOTICE_SQL_ + ' WHERE id = $1', [x.sid, x.mp, msg]);
  }
  return { n: list.length, total, list };
}

module.exports = { handleTeamBossStatus, handleTeamBossSignup, handleTeamBossStart, handleTeamBossAnswer };
