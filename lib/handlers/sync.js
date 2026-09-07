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
// app.js側のPOINTS_DAILY_CAP_CALC/POINTS_DAILY_CAP_WORDと必ず揃えること
// (計算問題・文章題それぞれ1日50MPまで、合計で1日100MPのPOINTS_DAILY_CAPになる)。
const POINTS_DAILY_CAP_CALC_SERVER = 50;
const POINTS_DAILY_CAP_WORD_SERVER = 50;

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

  // レベルは算数の経験値(exp)と理科の経験値(scienceExp)の合算で決まる
  // (client側のEXP_PER_LEVEL計算と同じ)。以前はscienceExpがサーバーに送られて
  // おらず、ここのクランプがexpだけを見てレベルの妥当性を判定していたため、
  // 理科モードで得たレベルアップが同期のたびに破棄される不具合があった。
  let rawExp = null, clampedExp = null, rawScienceExp = null, clampedScienceExp = null, rawLevel = null, clampedLevel = null;
  if (body.level !== undefined && body.exp !== undefined) {
    rawExp = Math.max(0, Math.floor(Number(body.exp)) || 0);
    rawScienceExp = Math.max(0, Math.floor(Number(body.scienceExp)) || 0);
    const combinedRaw = rawExp + rawScienceExp;
    const combinedClamped = Math.min(combinedRaw, ceilings.maxExp);
    // 上限を超えていた場合は、算数・理科の比率を保ったまま按分してクランプする
    const scale = combinedRaw > 0 ? combinedClamped / combinedRaw : 1;
    clampedExp = Math.floor(rawExp * scale);
    clampedScienceExp = Math.floor(rawScienceExp * scale);
    rawLevel = Math.max(1, Math.floor(Number(body.level)) || 1);
    clampedLevel = Math.max(1, Math.min(rawLevel, Math.floor((clampedExp + clampedScienceExp) / 10) + 1));
    const rowScienceExp = Number(row.scienceExp) || 0;
    const levelExpIsBehind = clampedLevel < row.level
      || (clampedLevel === row.level && (clampedExp + clampedScienceExp) < (row.exp + rowScienceExp));
    const finalLevel = levelExpIsBehind ? row.level : clampedLevel;
    const finalExp = levelExpIsBehind ? row.exp : clampedExp;
    const finalScienceExp = levelExpIsBehind ? rowScienceExp : clampedScienceExp;
    set('level', finalLevel);
    set('exp', finalExp);
    set('science_exp', finalScienceExp);
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

  // 1日のMP獲得上限のサーバー側チェック(2026-09-07〜)。以前はここでpointsを
  // 「端末申告値とサーバー保持値の大きい方」に揃えるだけで、1日にどれだけ加算して
  // よいかは一切見ていなかった。1日の獲得上限(計算50・文章題50・ミッションや
  // ダブル成功などのボーナス系は上限なし)自体は端末のlocalStorageだけで管理されて
  // いたため、同じIDを複数端末で使うと、端末ごとに「今日はまだ0MP」から数え始めて
  // しまい、台数分だけ上限を超えて稼げてしまう不具合があった(生徒からの実報告)。
  // ここではpoints_today_calc/word/bonusをサーバー側にも保持し、端末をまたいでも
  // 「大きい方」でマージしたうえで、実際にpointsへ加算してよい増分(legitDelta)を
  // そのマージ後の合計の増分だけに制限することで、端末を何台使っても1日に実際に
  // 加算されるMPの合計が上限を超えないようにする。
  const today = dateKeyTokyo(new Date());
  const serverTodayValid = row.pointsDate === today;
  const serverCalc = serverTodayValid ? row.pointsTodayCalc : 0;
  const serverWord = serverTodayValid ? row.pointsTodayWord : 0;
  const serverBonus = serverTodayValid ? row.pointsTodayBonus : 0;

  const clientTodayValid = body.pointsDate === today;
  const clientCalc = clientTodayValid ? Math.max(0, Math.floor(Number(body.pointsTodayCalc)) || 0) : 0;
  const clientWord = clientTodayValid ? Math.max(0, Math.floor(Number(body.pointsTodayWord)) || 0) : 0;
  const clientBonus = clientTodayValid ? Math.max(0, Math.floor(Number(body.pointsTodayBonus)) || 0) : 0;

  const newTodayCalc = Math.min(POINTS_DAILY_CAP_CALC_SERVER, Math.max(serverCalc, clientCalc));
  const newTodayWord = Math.min(POINTS_DAILY_CAP_WORD_SERVER, Math.max(serverWord, clientWord));
  // ボーナス系(ダブル成功・今日のミッション)は元々1日上限を経由しない設計のため、
  // 固定の上限値は設けず、端末間の二重加算だけを「大きい方」採用で防ぐ。
  const newTodayBonus = Math.max(serverBonus, clientBonus);

  const prevLegitTotal = serverTodayValid ? (row.pointsTodayCalc + row.pointsTodayWord + row.pointsTodayBonus) : 0;
  const newLegitTotal = newTodayCalc + newTodayWord + newTodayBonus;
  const legitDelta = Math.max(0, newLegitTotal - prevLegitTotal);

  // 今日のミッション(1日1回、+20MP)の達成状況も同様に端末ローカルのみの管理だった
  // ため、複数端末で2回達成扱いにできてしまっていた。MP自体はpointsTodayBonusで
  // 二重加算を防いでいるが、「今日すでに達成済みか」を端末間で共有するために
  // OR(どちらかの端末で達成していれば達成済み)でマージし、応答で返す。
  const serverMissionValid = row.missionDate === today;
  const serverMissionClaimed = serverMissionValid && !!row.missionClaimed;
  const serverMissionCorrect = serverMissionValid ? row.missionCorrect : 0;
  const clientMissionValid = body.missionDate === today;
  const clientMissionClaimed = clientMissionValid && !!body.missionClaimed;
  const clientMissionCorrect = clientMissionValid ? Math.max(0, Math.floor(Number(body.missionCorrect)) || 0) : 0;
  const newMissionClaimed = serverMissionClaimed || clientMissionClaimed;
  const newMissionCorrect = Math.max(serverMissionCorrect, clientMissionCorrect);

  const rawPoints = Math.max(0, Math.floor(points));
  const clampedPoints = Math.min(rawPoints, ceilings.maxPoints);
  const rawPointsDelta = Math.max(0, clampedPoints - row.points);
  const creditedDelta = Math.min(rawPointsDelta, legitDelta);
  const finalPoints = row.points + creditedDelta + bonusAwarded;
  set('points', finalPoints);
  set('points_date', today);
  set('points_today_calc', newTodayCalc);
  set('points_today_word', newTodayWord);
  set('points_today_bonus', newTodayBonus);
  set('mission_date', today);
  set('mission_correct', newMissionCorrect);
  set('mission_claimed', newMissionClaimed);

  const pointsWasClamped = rawPoints > clampedPoints || rawPointsDelta > creditedDelta;
  const expWasClamped = rawExp !== null && (rawExp > clampedExp || rawScienceExp > clampedScienceExp);
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
  // 宝箱・鍵・指輪(所持数)：ironWallCharges/steelArmorChargesと同じく、日常の
  // 増減(宝箱の獲得、指輪をシールドとして使った消費など)はクライアントを信頼して
  // そのままSETする(MPが直接動く購入・開封・売却は専用エンドポイントで
  // サーバー検証のうえ実行されるため、ここではその結果を追認するだけになる)。
  const TREASURE_ITEM_KEYS_ = [
    'chestBronze', 'chestSilver', 'chestGold', 'chestRainbow',
    'keyBronze', 'keySilver', 'keyGold', 'keyRainbow',
    'ringBronze', 'ringSilver', 'ringGold', 'ringRainbow',
    'ringShieldChargesSilver', 'ringShieldChargesGold', 'ringShieldChargesRainbow',
  ];
  if (body.treasureItems !== undefined && typeof body.treasureItems === 'object' && body.treasureItems !== null) {
    const items = {};
    TREASURE_ITEM_KEYS_.forEach((key) => {
      if (body.treasureItems[key] !== undefined) {
        items[key] = Math.max(0, Math.floor(Number(body.treasureItems[key])) || 0);
      }
    });
    set('treasure_items', JSON.stringify(items));
  }
  // 魔法の書の所持冊数：ironWallCharges/treasureItemsと同じく、ボス戦での消費は
  // クライアントを信頼してそのままSETする(購入時のMP消費は専用エンドポイントで
  // サーバー検証済み)。
  // app.js側のSPELLBOOKS_のidと揃えること。
  const SPELLBOOK_ELEMENTS_ = [
    'fire', 'ice', 'thunder',
    'rock', 'quake',
    'lightarrow', 'angellight', 'holyburst',
    'darkchain', 'darkwave', 'darkdragon', 'demonwave', 'darkcollapse',
  ];
  if (body.spellbooks !== undefined && typeof body.spellbooks === 'object' && body.spellbooks !== null) {
    const books = {};
    SPELLBOOK_ELEMENTS_.forEach((el) => {
      if (body.spellbooks[el] !== undefined) {
        books[el] = Math.max(0, Math.floor(Number(body.spellbooks[el])) || 0);
      }
    });
    set('spellbooks', JSON.stringify(books));
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
    // 周が変わった直後は、前の周の仲間(worldAllies)を引きずらないよう和集合ではなく
    // 申告値でそのまま置き換える(world_boss_defeatedのリセットと同じ扱い)。
    const merged = lapIncrementing ? submitted.slice() : row.worldAllies.slice();
    if (!lapIncrementing) {
      submitted.forEach((code) => { if (!merged.includes(code)) merged.push(code); });
    }
    set('world_allies', JSON.stringify(merged));
  }

  values.push(id);
  await sql().query(`UPDATE students SET ${sets.join(', ')} WHERE id = $${values.length}`, values);

  return {
    ok: true, bonusAwarded, prefectureBonusAwarded, continentBonusAwarded,
    // マージ後の「今日の状態」を呼び出し元の端末へ返す。これにより、その端末が
    // 他の端末より遅れていた場合(例: 別端末で先に今日の上限まで稼いでいた場合)でも、
    // 次の描画からは正しい残り上限・ミッション達成状況にすぐ揃う。
    pointsDate: today, pointsTodayCalc: newTodayCalc, pointsTodayWord: newTodayWord, pointsTodayBonus: newTodayBonus,
    missionDate: today, missionCorrect: newMissionCorrect, missionClaimed: newMissionClaimed,
  };
}

async function handleSaveAvatar(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_fields' };

  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  // アバター作成は2026-08-27から全生徒に開放(以前はレベル300またはMP10000が必要
  // だった)。MPの消費も無いため、ここでの条件判定は行わない。

  const sel = body.avatar;
  if (!sel || typeof sel !== 'object') return { ok: false, error: 'invalid_avatar' };

  // 写真アバター：保護者の同意(photo_avatar_consent)がある生徒だけが使える。
  // 写真は外部に公開URLを作らず、画像データそのものをこの列に保存する。avatarは
  // 本人へのログイン応答でしか返さないため、他の生徒やランキングには出ない。
  if (sel.photo !== undefined) {
    if (!row.photoAvatarConsent) return { ok: false, error: 'photo_not_allowed' };
    const photo = String(sel.photo || '');
    if (!/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(photo)) {
      return { ok: false, error: 'invalid_avatar' };
    }
    if (photo.length > 220000) return { ok: false, error: 'photo_too_large' };
    await sql().query('UPDATE students SET avatar = $1 WHERE id = $2', [JSON.stringify({ photo }), id]);
    return { ok: true };
  }

  // イラストプリセット方式(2026-08〜)：組み合わせ式のパーツではなく、完成イラストの
  // 一覧から1つ選ぶだけの形式。presetが指定されていればこちらを優先する。
  if (sel.preset !== undefined) {
    const presetId = String(sel.preset || '').trim();
    if (!/^[a-zA-Z0-9]{1,20}$/.test(presetId)) return { ok: false, error: 'invalid_avatar' };
    await sql().query('UPDATE students SET avatar = $1 WHERE id = $2', [JSON.stringify({ preset: presetId }), id]);
    return { ok: true };
  }

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
