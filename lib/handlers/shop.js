const { sql } = require('../db');
const { findStudent } = require('../students');

// ボン・ミスコの呪いを解くための「AKRの祈り」。呪い状態自体はバトル演出用の
// フラグでクライアント側(localStorage)だけが持っており、サーバー側では
// MPの消費だけを検証・実行する(MP交換=redeemGiftと同じ、サーバー確定方式)。
const AKR_PRAYER_COST_MP = 100;

async function handleAkrPrayer(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  if (row.points < AKR_PRAYER_COST_MP) return { ok: false, error: 'insufficient_points' };

  const remaining = row.points - AKR_PRAYER_COST_MP;
  await sql().query('UPDATE students SET points = $1 WHERE id = $2', [remaining, id]);
  return { ok: true, remainingPoints: remaining };
}

// 薬草：300MPでHPを100増やせる、なんでも屋の常設アイテム。
const HERB_COST_MP = 300;
const HERB_HP_GAIN = 100;

async function handleBuyHerb(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  if (row.points < HERB_COST_MP) return { ok: false, error: 'insufficient_points' };

  const remainingPoints = row.points - HERB_COST_MP;
  const newHp = (Number(row.hp) || 0) + HERB_HP_GAIN;
  await sql().query('UPDATE students SET points = $1, hp = $2 WHERE id = $3', [remainingPoints, newHp, id]);
  return { ok: true, remainingPoints, hp: newHp };
}

// 爆裂薬草：薬草の上位版。1000MPでHPを400増やせる。
const BAKUHERB_COST_MP = 1000;
const BAKUHERB_HP_GAIN = 400;

async function handleBuyBakuHerb(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  if (row.points < BAKUHERB_COST_MP) return { ok: false, error: 'insufficient_points' };

  const remainingPoints = row.points - BAKUHERB_COST_MP;
  const newHp = (Number(row.hp) || 0) + BAKUHERB_HP_GAIN;
  await sql().query('UPDATE students SET points = $1, hp = $2 WHERE id = $3', [remainingPoints, newHp, id]);
  return { ok: true, remainingPoints, hp: newHp };
}

// 超絶薬草：爆裂薬草のさらに上位版。3000MPでHPを1500増やせる。
const CHOUHERB_COST_MP = 3000;
const CHOUHERB_HP_GAIN = 1500;

async function handleBuyChouHerb(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  if (row.points < CHOUHERB_COST_MP) return { ok: false, error: 'insufficient_points' };

  const remainingPoints = row.points - CHOUHERB_COST_MP;
  const newHp = (Number(row.hp) || 0) + CHOUHERB_HP_GAIN;
  await sql().query('UPDATE students SET points = $1, hp = $2 WHERE id = $3', [remainingPoints, newHp, id]);
  return { ok: true, remainingPoints, hp: newHp };
}

// すばやさの種：100MPで買える消費アイテム。逃げるタイプのレアキャラに
// 間違えて逃げられそうになったとき、所持していれば自動で1個消費されて
// 逃走を防ぐ(クライアント側のバトル処理で判定・消費し、syncPointsで
// 個数をサーバーに反映する。hpと同じ「クライアントを信頼して直接SET」方式)。
const SPEEDSEED_COST_MP = 100;

async function handleBuySpeedSeed(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  if (row.points < SPEEDSEED_COST_MP) return { ok: false, error: 'insufficient_points' };

  const remainingPoints = row.points - SPEEDSEED_COST_MP;
  const newCount = (Number(row.speedSeedCount) || 0) + 1;
  await sql().query('UPDATE students SET points = $1, speed_seed_count = $2 WHERE id = $3', [remainingPoints, newCount, id]);
  return { ok: true, remainingPoints, speedSeedCount: newCount };
}

// 鉄壁の盾：500MPで買える消費アイテム。ボス戦で間違えるたびに自動で1チャージ
// 消費され、そのミスのダメージが半分になる(最大3チャージ)。3回使い切ると
// 壊れて消える。すばやさの種と違い、複数個は保有できない(既に1個持っている間は
// 再購入できない)。
const IRONWALL_COST_MP = 500;
const IRONWALL_MAX_CHARGES = 3;

async function handleBuyIronWall(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  if ((Number(row.ironWallCharges) || 0) > 0) return { ok: false, error: 'already_owned' };
  if (row.points < IRONWALL_COST_MP) return { ok: false, error: 'insufficient_points' };

  const remainingPoints = row.points - IRONWALL_COST_MP;
  await sql().query('UPDATE students SET points = $1, iron_wall_charges = $2 WHERE id = $3', [remainingPoints, IRONWALL_MAX_CHARGES, id]);
  return { ok: true, remainingPoints, ironWallCharges: IRONWALL_MAX_CHARGES };
}

// 鋼の鎧：100MPで買える消費アイテム。購入日に関わらず、ボス戦以外の間違いのたびに
// 自動で1チャージ消費してHP減少を防ぐ(最大10チャージ)。鉄壁の盾と同じく
// 複数個は保有できず、10回使い切ると壊れて消える。
const STEELARMOR_COST_MP = 100;
const STEELARMOR_MAX_CHARGES = 10;

async function handleBuySteelArmor(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  if ((Number(row.steelArmorCharges) || 0) > 0) return { ok: false, error: 'already_owned' };
  if (row.points < STEELARMOR_COST_MP) return { ok: false, error: 'insufficient_points' };

  const remainingPoints = row.points - STEELARMOR_COST_MP;
  await sql().query('UPDATE students SET points = $1, steel_armor_charges = $2 WHERE id = $3', [remainingPoints, STEELARMOR_MAX_CHARGES, id]);
  return { ok: true, remainingPoints, steelArmorCharges: STEELARMOR_MAX_CHARGES };
}

// 宝箱・鍵・指輪：レアキャラを撃破すると確率で(8/29・30はイベントデーで5分の1、それ以外は20分の1)、その時
// 解いていた問題の学年に応じたティアの宝箱を手に入れる(小学生→銅、中1→銀、
// 中2→金、中3→虹色)。宝箱は対応するティアの鍵を持っていないと開けられない。
// 鍵はなんでも屋で購入(消費型)、宝箱を開けると開けたティアの指輪が手に入り、
// 指輪はなんでも屋で鍵と同額で売却できる。MPが直接動くのは鍵の購入・宝箱を
// 開けたときの報酬・指輪の売却の3つだけなので、この3つはサーバー側で残高・
// 個数を検証してから実行する(buyHerb等の他の買い物と同じ方式)。宝箱の個数
// 自体(獲得)はレアキャラ撃破という無償のイベントなので、他のコレクション系
// 項目(items/rareCollected)と同じくsync.js側でクライアントを信頼して
// 増分をマージする。
const TREASURE_TIERS = ['bronze', 'silver', 'gold', 'rainbow'];
const KEY_COST_MP = { bronze: 50, silver: 100, gold: 200, rainbow: 500 };
const RING_SELL_MP = { bronze: 50, silver: 100, gold: 200, rainbow: 500 };
const CHEST_REWARD = {
  bronze: { mp: 1, hp: 5 },
  silver: { mp: 2, hp: 10 },
  gold: { mp: 3, hp: 15 },
  rainbow: { mp: 5, hp: 20 },
};
function tierKey_(prefix, tier) {
  return prefix + tier[0].toUpperCase() + tier.slice(1);
}
function treasureCount_(items, key) {
  return Number(items && items[key]) || 0;
}

async function handleBuyTreasureKey(body) {
  const id = String(body.id || '').trim();
  const tier = String(body.tier || '');
  if (!id || TREASURE_TIERS.indexOf(tier) === -1) return { ok: false, error: 'missing_fields' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  const cost = KEY_COST_MP[tier];
  if (row.points < cost) return { ok: false, error: 'insufficient_points' };

  const items = Object.assign({}, row.treasureItems);
  const keyKey = tierKey_('key', tier);
  items[keyKey] = treasureCount_(items, keyKey) + 1;
  const remainingPoints = row.points - cost;
  await sql().query('UPDATE students SET points = $1, treasure_items = $2 WHERE id = $3', [remainingPoints, JSON.stringify(items), id]);
  return { ok: true, remainingPoints, treasureItems: items };
}

async function handleSellTreasureRing(body) {
  const id = String(body.id || '').trim();
  const tier = String(body.tier || '');
  if (!id || TREASURE_TIERS.indexOf(tier) === -1) return { ok: false, error: 'missing_fields' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  const items = Object.assign({}, row.treasureItems);
  const ringKey = tierKey_('ring', tier);
  const count = treasureCount_(items, ringKey);
  if (count <= 0) return { ok: false, error: 'no_ring' };

  items[ringKey] = count - 1;
  const remainingPoints = row.points + RING_SELL_MP[tier];
  await sql().query('UPDATE students SET points = $1, treasure_items = $2 WHERE id = $3', [remainingPoints, JSON.stringify(items), id]);
  return { ok: true, remainingPoints, treasureItems: items };
}

async function handleOpenTreasureChest(body) {
  const id = String(body.id || '').trim();
  const tier = String(body.tier || '');
  if (!id || TREASURE_TIERS.indexOf(tier) === -1) return { ok: false, error: 'missing_fields' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  const items = Object.assign({}, row.treasureItems);
  const chestKey = tierKey_('chest', tier);
  const keyKey = tierKey_('key', tier);
  const chestCount = treasureCount_(items, chestKey);
  const keyCount = treasureCount_(items, keyKey);
  if (chestCount <= 0) return { ok: false, error: 'no_chest' };
  if (keyCount <= 0) return { ok: false, error: 'no_key' };

  items[chestKey] = chestCount - 1;
  items[keyKey] = keyCount - 1;
  const ringKey = tierKey_('ring', tier);
  items[ringKey] = treasureCount_(items, ringKey) + 1;
  const reward = CHEST_REWARD[tier];
  // 宝箱を開けて得るMPは(指輪の売却と違って)1日の上限100MPの対象。1日の
  // 獲得済みMPはサーバーには保存されておらずクライアントのみが把握している
  // (計算・文章題のMP上限と同じ仕組み)ため、クライアント側で「今日まだ
  // 獲得できる分」を計算してmpGrantとして送ってもらう。ティアの本来の報酬額を
  // 超えて渡されないよう、サーバー側でもreward.mpを上限にクランプする。
  const mpGrant = Math.max(0, Math.min(reward.mp, Math.floor(Number(body.mpGrant)) || 0));
  const remainingPoints = row.points + mpGrant;
  const newHp = (Number(row.hp) || 0) + reward.hp;
  await sql().query(
    'UPDATE students SET points = $1, hp = $2, treasure_items = $3 WHERE id = $4',
    [remainingPoints, newHp, JSON.stringify(items), id]
  );
  return { ok: true, remainingPoints, hp: newHp, treasureItems: items, mpGranted: mpGrant };
}

// 魔法の書：世界一周2周目(9月〜)のボス戦専用の消費アイテム。なんでも屋で
// 100MPで購入し、対応する属性のボス戦で1冊消費して相手のHPを50減らす
// (アイスランス・サンダーは自分もHPが10減る。クライアント側のボス戦処理で
// 判定・消費し、syncPointsで冊数をサーバーに反映する他のクライアント管理
// アイテムと同じ方式)。ステージ4(大地・自然・光闇)の書は追加予定。
// 書ごとに価格が違うので、クライアントの申告ではなくここの表を必ず使う
// (app.js側のSPELLBOOKS_と揃えること)。
const SPELLBOOK_COST_MP = {
  fire: 20, ice: 30, thunder: 10,
  rock: 10, quake: 20,
  lightarrow: 10, angellight: 40, holyburst: 50,
  darkchain: 10, darkwave: 20, darkdragon: 30, demonwave: 40, darkcollapse: 50,
};
const SPELLBOOK_ELEMENTS = Object.keys(SPELLBOOK_COST_MP);

async function handleBuySpellbook(body) {
  const id = String(body.id || '').trim();
  const element = String(body.element || '');
  if (!id || SPELLBOOK_ELEMENTS.indexOf(element) === -1) return { ok: false, error: 'missing_fields' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  const cost = SPELLBOOK_COST_MP[element];
  if (row.points < cost) return { ok: false, error: 'insufficient_points' };

  const books = Object.assign({}, row.spellbooks);
  books[element] = (Number(books[element]) || 0) + 1;
  const remainingPoints = row.points - cost;
  await sql().query('UPDATE students SET points = $1, spellbooks = $2 WHERE id = $3', [remainingPoints, JSON.stringify(books), id]);
  return { ok: true, remainingPoints, spellbooks: books };
}

module.exports = {
  handleAkrPrayer, AKR_PRAYER_COST_MP,
  handleBuyHerb, HERB_COST_MP, HERB_HP_GAIN,
  handleBuyBakuHerb, BAKUHERB_COST_MP, BAKUHERB_HP_GAIN,
  handleBuyChouHerb, CHOUHERB_COST_MP, CHOUHERB_HP_GAIN,
  handleBuySpeedSeed, SPEEDSEED_COST_MP,
  handleBuyIronWall, IRONWALL_COST_MP, IRONWALL_MAX_CHARGES,
  handleBuySteelArmor, STEELARMOR_COST_MP, STEELARMOR_MAX_CHARGES,
  handleBuyTreasureKey, handleSellTreasureRing, handleOpenTreasureChest,
  TREASURE_TIERS, KEY_COST_MP, RING_SELL_MP, CHEST_REWARD,
  handleBuySpellbook, SPELLBOOK_ELEMENTS, SPELLBOOK_COST_MP,
};
