const { sql } = require('../db');
const { findStudent } = require('../students');
const { dateKeyTokyo } = require('../util');

// クライアントの自己申告(points/level/exp等)をそのまま信用すると、localStorageを
// 直接書き換えるだけで無制限に値を水増しできてしまうため、記録されている正解数・
// アカウント作成日から算出した「現実的にあり得る上限」でクランプする。詳しい経緯は
// GAS版Code.gsのhandleSyncPoints_直前のコメントを参照(00025 vs 00124の比較で
// 日数ベースのEXP上限が不適切と判明し、正解数ベースに変更した経緯など)。
const EXP_LOG_BUFFER_MULTIPLIER = 1.4;
const EXP_LOG_BUFFER_FLAT = 500;
const POINTS_DAILY_CAP = 100;
const POINTS_BONUS_BUFFER = 2500;

function plausibilityCeilings(row) {
  const now = new Date();
  const daysSinceCreation = row.createdAt
    ? Math.max(1, Math.ceil((now.getTime() - new Date(row.createdAt).getTime()) / (1000 * 60 * 60 * 24)))
    : 1;
  const maxAchievableExp = Math.floor((Number(row.loggedCorrectCount) || 0) / 10) * 10;
  return {
    maxExp: maxAchievableExp * EXP_LOG_BUFFER_MULTIPLIER + EXP_LOG_BUFFER_FLAT,
    maxPoints: daysSinceCreation * POINTS_DAILY_CAP + POINTS_BONUS_BUFFER,
  };
}

const PREFECTURE_BONUS_MP = 300;
const PREFECTURE_BONUS_DEADLINE = '2026-08-31';
function isWithinPrefectureBonusWindow() {
  return dateKeyTokyo(new Date()) <= PREFECTURE_BONUS_DEADLINE;
}

const WORLD_DATA_LENGTH = 100;
const CONTINENT_BONUS_MP = 500;
const CONTINENT_DEFS = [
  { id: 'asia', maxCode: 66 },
  { id: 'europe', maxCode: 28 },
  { id: 'africa', maxCode: 46 },
  { id: 'northamerica', maxCode: 80 },
  { id: 'southamerica', maxCode: 90 },
  { id: 'oceania', maxCode: 100 },
];
// 大陸制覇ボーナスは「今の周(lap)で、まだその大陸のボーナスを受け取っていなければ」
// 1回だけ付与する。worldCountryは2026-09-01のサイコロ方式導入後は前後に増減する
// ため、直前値との差分(prevCount<maxCode<=newCount)で判定すると、閾値を何度も
// またぎ直すたびに再award されてしまう(過去に実際発生したバグ)。そのため「今の周で
// 既に受け取ったか」を専用カラム(world_continent_bonus)で管理し、一度受け取った
// 大陸は同じ周の間は二度と付与しない。周が変わったら(lapIncrementing)フラグを
// リセットし、その周でまた1回ずつ受け取れるようにする。
function continentBonusToAward(worldCountry, alreadyAwarded) {
  const newlyAwarded = {};
  let bonus = 0;
  for (const c of CONTINENT_DEFS) {
    if (worldCountry >= c.maxCode && !alreadyAwarded[c.id]) {
      bonus += CONTINENT_BONUS_MP;
      newlyAwarded[c.id] = true;
    }
  }
  return { bonus, newlyAwarded };
}

async function handleSyncPoints(body) {
  const id = String(body.id || '').trim();
  const points = Number(body.points);
  if (!id || !isFinite(points)) return { ok: false, error: 'missing_fields' };

  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  const ceilings = plausibilityCeilings(row);

  let bonusAwarded = 0;
  let prefectureBonusAwarded = 0;
  let continentBonusAwarded = 0;

  // 更新するカラムをまとめて1回のUPDATEで書く
  const sets = [];
  const values = [];
  function set(col, val) { values.push(val); sets.push(`${col} = $${values.length}`); }

  if (body.prefectureCount !== undefined) {
    const prefectureCount = Math.max(0, Math.min(47, Math.floor(Number(body.prefectureCount)) || 0));
    if (prefectureCount === 47 && row.prefectureCount < 47 && isWithinPrefectureBonusWindow()) {
      prefectureBonusAwarded = PREFECTURE_BONUS_MP;
      bonusAwarded += prefectureBonusAwarded;
    }
    set('prefecture_count', Math.max(prefectureCount, row.prefectureCount));
  }

  let rawExp = null, clampedExp = null, rawLevel = null, clampedLevel = null;
  if (body.level !== undefined && body.exp !== undefined) {
    rawExp = Math.max(0, Math.floor(Number(body.exp)) || 0);
    clampedExp = Math.min(rawExp, ceilings.maxExp);
    rawLevel = Math.max(1, Math.floor(Number(body.level)) || 1);
    clampedLevel = Math.max(1, Math.min(rawLevel, Math.floor(clampedExp / 10) + 1));
    const levelExpIsBehind = clampedLevel < row.level || (clampedLevel === row.level && clampedExp < row.exp);
    const finalLevel = levelExpIsBehind ? row.level : clampedLevel;
    const finalExp = levelExpIsBehind ? row.exp : clampedExp;
    set('level', finalLevel);
    set('exp', finalExp);
  }

  // 周(lap)が変わったかどうかを先に判定しておく(world_lap自体のSETは後段の
  // worldLapブロックで行うが、大陸ボーナスのフラグリセットはここで使う)。
  const lapIncrementing = body.worldLap !== undefined
    && Math.max(1, Math.floor(Number(body.worldLap)) || 1) > (Number(row.worldLap) || 1);

  if (body.worldCountry !== undefined) {
    const submittedWorldCountry = Math.max(0, Math.min(WORLD_DATA_LENGTH, Math.floor(Number(body.worldCountry)) || 0));
    const baseFlags = lapIncrementing ? {} : ((row.worldContinentBonus && typeof row.worldContinentBonus === 'object') ? row.worldContinentBonus : {});
    const { bonus, newlyAwarded } = continentBonusToAward(submittedWorldCountry, baseFlags);
    continentBonusAwarded = bonus;
    bonusAwarded += continentBonusAwarded;
    set('world_country', submittedWorldCountry);
    if (lapIncrementing || Object.keys(newlyAwarded).length > 0) {
      set('world_continent_bonus', JSON.stringify(Object.assign({}, baseFlags, newlyAwarded)));
    }
  } else if (lapIncrementing) {
    set('world_continent_bonus', JSON.stringify({}));
  }

  const rawPoints = Math.max(0, Math.floor(points));
  const clampedPoints = Math.min(rawPoints, ceilings.maxPoints);
  set('points', Math.max(clampedPoints, row.points) + bonusAwarded);

  const pointsWasClamped = rawPoints > clampedPoints;
  const expWasClamped = rawExp !== null && rawExp > clampedExp;
  if (pointsWasClamped || expWasClamped) {
    await sql().query(
      `INSERT INTO points_anomaly_log (ts, student_id, name, submitted_points, clamped_points, submitted_exp, clamped_exp, submitted_level, clamped_level)
       VALUES (now(), $1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, row.name, rawPoints, clampedPoints, rawExp, clampedExp, rawLevel, clampedLevel]
    );
  }

  if (body.items !== undefined) {
    const submitted = Array.isArray(body.items) ? body.items : [];
    const merged = row.items.slice();
    submitted.forEach((itemId) => { if (!merged.includes(itemId)) merged.push(itemId); });
    set('items', JSON.stringify(merged));
  }
  if (body.rareCollected !== undefined) {
    const submitted = Array.isArray(body.rareCollected) ? body.rareCollected : [];
    const merged = row.rareCollected.slice();
    submitted.forEach((rid) => { if (!merged.includes(rid)) merged.push(rid); });
    set('rare_collected', JSON.stringify(merged));
  }
  if (body.rareDefeats !== undefined) {
    const submitted = (body.rareDefeats && typeof body.rareDefeats === 'object') ? body.rareDefeats : {};
    const merged = Object.assign({}, row.rareDefeats);
    Object.keys(submitted).forEach((k) => {
      const sv = Number(submitted[k]) || 0;
      if (sv > (Number(merged[k]) || 0)) merged[k] = sv;
    });
    set('rare_defeats', JSON.stringify(merged));
  }
  if (body.thinkerMilestone !== undefined) {
    const rank = (v) => (v === 1000 ? 2 : v === 100 ? 1 : 0);
    const finalThinkerMilestone = rank(body.thinkerMilestone) > rank(row.thinkerMilestone) ? body.thinkerMilestone : row.thinkerMilestone;
    set('thinker_milestone', finalThinkerMilestone || '');
  }
  if (body.hp !== undefined) {
    set('hp', Math.max(0, Math.floor(Number(body.hp)) || 0));
  }
  if (body.speedSeedCount !== undefined) {
    set('speed_seed_count', Math.max(0, Math.floor(Number(body.speedSeedCount)) || 0));
  }
  if (body.ironWallCharges !== undefined) {
    set('iron_wall_charges', Math.max(0, Math.min(3, Math.floor(Number(body.ironWallCharges)) || 0)));
  }
  if (body.steelArmorCharges !== undefined) {
    set('steel_armor_charges', Math.max(0, Math.min(10, Math.floor(Number(body.steelArmorCharges)) || 0)));
  }
  if (body.worldLap !== undefined && body.worldLapStartLevel !== undefined) {
    const submittedWorldLap = Math.max(1, Math.floor(Number(body.worldLap)) || 1);
    const submittedWorldLapStartLevel = Math.max(100, Math.floor(Number(body.worldLapStartLevel)) || 100);
    const currentWorldLap = Number(row.worldLap) || 1;
    if (submittedWorldLap > currentWorldLap) {
      set('world_lap', submittedWorldLap);
      set('world_lap_start_level', submittedWorldLapStartLevel);
      if (body.worldBossDefeated !== undefined) {
        const wb = (body.worldBossDefeated && typeof body.worldBossDefeated === 'object') ? body.worldBossDefeated : {};
        set('world_boss_defeated', JSON.stringify(wb));
      }
    } else if (submittedWorldLap === currentWorldLap && body.worldBossDefeated !== undefined) {
      const submitted = (body.worldBossDefeated && typeof body.worldBossDefeated === 'object') ? body.worldBossDefeated : {};
      const merged = Object.assign({}, row.worldBossDefeated);
      Object.keys(submitted).forEach((k) => { if (submitted[k]) merged[k] = true; });
      set('world_boss_defeated', JSON.stringify(merged));
    }
  }
  if (body.worldAllies !== undefined) {
    const submitted = Array.isArray(body.worldAllies) ? body.worldAllies : [];
    const merged = row.worldAllies.slice();
    submitted.forEach((code) => { if (!merged.includes(code)) merged.push(code); });
    set('world_allies', JSON.stringify(merged));
  }

  values.push(id);
  await sql().query(`UPDATE students SET ${sets.join(', ')} WHERE id = $${values.length}`, values);

  return { ok: true, bonusAwarded, prefectureBonusAwarded, continentBonusAwarded };
}

async function handleSaveAvatar(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_fields' };

  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  if (row.level < 300 && row.points < 10000) return { ok: false, error: 'not_unlocked' };

  const sel = body.avatar;
  if (!sel || typeof sel !== 'object') return { ok: false, error: 'invalid_avatar' };
  const keys = ['hair', 'face', 'skin', 'hairColor', 'outfitColor'];
  const clean = {};
  for (const k of keys) {
    const v = String(sel[k] || '').trim();
    if (!/^[a-zA-Z0-9]{1,20}$/.test(v)) return { ok: false, error: 'invalid_avatar' };
    clean[k] = v;
  }

  await sql().query('UPDATE students SET avatar = $1 WHERE id = $2', [JSON.stringify(clean), id]);
  return { ok: true };
}

module.exports = { handleSyncPoints, handleSaveAvatar };
