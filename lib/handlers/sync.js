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
// app.js側のPOINTS_DAILY_CAP_CALC/POINTS_DAILY_CAP_WORDと必ず揃えること
// (計算問題・文章題それぞれ1日50MPまで、合計で1日100MPのPOINTS_DAILY_CAPになる)。
const POINTS_DAILY_CAP_CALC_SERVER = 50;
const POINTS_DAILY_CAP_WORD_SERVER = 50;
// MPの妥当性上限は、以前は「アカウント作成からの経過日数×1日100MP」で計算していたが、
// 都道府県ボーナス(300)・大陸制覇ボーナス(500×6、周回ごとにリセットされ再取得可能)・
// レアキャラ討伐ボーナス・宝箱など、1日100MPの枠に収まらないボーナス経路が多数あるため、
// 世界一周を何十周もするような長期プレイのトップ層が正当にこの上限を超えてしまい、
// それ以降のMP加算が一切反映されなくなる不具合が発生した(2026-09-16、00103ほか計14名で
// 確認)。EXPの上限を日数ベースから正解数ベース(loggedCorrectCount、サーバーが/log
// 呼び出しのたびに検証しながら積み上げる、改ざん耐性のある値)に変更した時と同じ理由・
// 同じ対処として、MPの上限も正解数ベースに変更する。既存トップ層(正解数2000〜60000件)の
// 実測MP/正解数比は0.2〜1.85程度だったため、3倍+バッファ1000であれば十分な余裕を持って
// 正当なプレイを通しつつ、正解数の少ない改ざんアカウントの水増しは引き続き弾ける。
const POINTS_LOG_BUFFER_MULTIPLIER = 3;
const POINTS_LOG_BUFFER_FLAT = 1000;

function plausibilityCeilings(row) {
  const loggedCorrectCount = Number(row.loggedCorrectCount) || 0;
  const maxAchievableExp = Math.floor(loggedCorrectCount / 10) * 10;
  return {
    maxExp: maxAchievableExp * EXP_LOG_BUFFER_MULTIPLIER + EXP_LOG_BUFFER_FLAT,
    maxPoints: loggedCorrectCount * POINTS_LOG_BUFFER_MULTIPLIER + POINTS_LOG_BUFFER_FLAT,
  };
}

const PREFECTURE_BONUS_MP = 300;
const PREFECTURE_BONUS_DEADLINE = '2026-08-31';
function isWithinPrefectureBonusWindow() {
  return dateKeyTokyo(new Date()) <= PREFECTURE_BONUS_DEADLINE;
}

// 算数・数学の単元コンプリートボーナス(2026-09-18〜、期間限定)。学年ごとに
// 「その学年+1つ下の学年」の算数・数学の全単元(CATEGORIES、app.js側のidと
// 必ず揃えること)が黒帯(段位レベル4)に到達したら、1回だけ500MPを付与する。
// このidリストはapp.js側でCATEGORIESに単元を追加・削除した場合、手動で
// 追従させる必要がある(サーバー側はCATEGORIESの定義そのものを持たないため)。
const COMPLETION_BONUS_MP = 500;
const CATEGORY_IDS_GRADE3_ = ['mulWritten3', 'largeNum3', 'clockTime3', 'clockWordProblem3', 'addSub3Digit3', 'units3', 'division3', 'boxEquation3', 'fraction3', 'fractionWordProblem3', 'wordProblemMulDiv3'];
const CATEGORY_IDS_GRADE4_ = ['round4', 'fourOps4', 'decAddSub4', 'decMul4', 'frac4', 'unit4', 'mul3x2_4', 'divRemainder4', 'div2by1_4', 'div2by2_4', 'div3by1_4', 'div3by2_4', 'div3by3_4', 'rectArea4', 'largeNum4', 'decAddSubMixed4', 'setSquareAngle4', 'timesWordProblem4', 'divWordProblem4', 'decWordProblem4', 'fracType4', 'sumDiffWordProblem4', 'lineGraphRead4', 'decPlaceValue4', 'crossTab4', 'diffFocus4', 'roundEstimateWordProblem4', 'calcRulesTricks4', 'quadShapes4', 'compositeRectArea4', 'functionTable4'];
const CATEGORY_IDS_GRADE5_ = ['decStructure5', 'volumeRect5', 'evenOdd5', 'fracAddSub5', 'decFracAddSub5', 'fracReduceConvert5', 'decMul5', 'decDiv5', 'decDivRemainder5', 'decWordProblem5', 'speedRate5', 'speedCompare5', 'speedApp5', 'unitRateWordProblem5', 'timeFraction5', 'percent5', 'percentWordProblem5', 'percentWordProblemAdvanced5', 'figureArea5', 'percentConvert5', 'multiples5', 'divisorMultipleAdvanced5', 'multiplesDivisorsWordProblem5', 'polygonAngle5', 'fracDecConvert5', 'fracDecimal5', 'average5', 'averageWordProblemAdvanced5', 'circumference5', 'figureAreaInverse5', 'prismCylinder5', 'baseAmountPercent5'];
const CATEGORY_IDS_GRADE6_ = ['fracMulDiv6', 'symmetry6', 'fracDecIntMulDiv6', 'fracWordProblem6', 'ratioWordProblem6', 'ratio6', 'scale6', 'dataValues6', 'arrangeCombine6', 'patternRelation6', 'circleArea6', 'circleSector6', 'speedFrac6', 'workMeetingPassage6', 'prismVolume6'];
const CATEGORY_IDS_J1_ = ['add2', 'sub2', 'chain3', 'mul2', 'div2', 'mixed', 'allops', 'power', 'brace', 'literal', 'notation', 'subst', 'maxof4', 'equation', 'eqWordProblem1', 'eqWordProblemAdv1', 'proportion', 'linearMul', 'polyMul', 'linearAddSub', 'planeFigure', 'planeFigureComposite1', 'solidFigure', 'coneDevelopment1', 'construction'];
const CATEGORY_IDS_J2_ = ['simul', 'simulEqWordProblem2', 'simulEqWordProblemAdv2', 'linear', 'angle', 'angleApplication2', 'congruence', 'parallelogramCondition2', 'probability', 'quartileBoxplot2', 'polyCalc2'];
const CATEGORY_IDS_J3_ = ['expand2', 'expand3', 'factor', 'sqrt', 'sqrtmd', 'quadratic', 'quadEqWordProblem3', 'quadfunc', 'similarity', 'similarRatio3', 'circleAngle', 'pythagoras', 'samplingSurvey3'];
const COMPLETION_BONUS_BY_GRADE_ = {
  '小4': { ids: CATEGORY_IDS_GRADE3_.concat(CATEGORY_IDS_GRADE4_), deadline: '2026-10-31' },
  '小5': { ids: CATEGORY_IDS_GRADE4_.concat(CATEGORY_IDS_GRADE5_), deadline: '2026-10-31' },
  '小6': { ids: CATEGORY_IDS_GRADE5_.concat(CATEGORY_IDS_GRADE6_), deadline: '2026-10-31' },
  '中1': { ids: CATEGORY_IDS_GRADE6_.concat(CATEGORY_IDS_J1_), deadline: '2026-11-30' },
  '中2': { ids: CATEGORY_IDS_J1_.concat(CATEGORY_IDS_J2_), deadline: '2026-11-30' },
  '中3': { ids: CATEGORY_IDS_J2_.concat(CATEGORY_IDS_J3_), deadline: '2026-11-30' },
};
const CATEGORY_RANK_BLACK_BELT = 4;

// 理科の単元コンプリートボーナス(2026-09-18〜、期限なし)。算数・数学と違い、
// 学年の階層内(小学:小4〜小6、中学:中1〜中3)で自分の学年以下の各学年の理科を
// 個別に(重複して)申請でき、階層をまたいだ持ち越しはない(中学生は小学理科の
// ボーナス対象外)。金額は学年ごとに固定(SCIENCE_TIER_DEFS_参照)で、達成した
// 生徒の学年に関わらず同じ額になる。
const SCIENCE_CATEGORY_IDS_GRADE4_ = ['electricCircuit4', 'season4', 'weather4', 'moonStar4', 'rainSoil4', 'confinedAirWater4', 'heatSpread4', 'waterForms4', 'bodyMovement4'];
const SCIENCE_CATEGORY_IDS_GRADE5_ = ['dissolveWays5', 'weatherChange5', 'plantGrowth5', 'animalBirth5', 'flowingWater5', 'pendulum5', 'electromagnet5'];
const SCIENCE_CATEGORY_IDS_GRADE6_ = ['combustion6', 'humanBody6', 'plantFunction6', 'foodChain6', 'landChange6', 'lever6', 'electricityUse6', 'aqueousSolution6', 'moonSun6'];
const SCIENCE_CATEGORY_IDS_J1_ = ['matterInvestigation1', 'whitePowder1', 'dissolve1', 'solubility1', 'gasProperties1', 'stateChange1', 'meltingBoiling1', 'distillation1', 'lightReflectionRefraction1', 'convexLens1', 'sound1', 'forceBasics1', 'volcano1', 'earthquake1', 'strataFossil1', 'observationClassification1', 'flowerStructure1', 'leafRootStructure1', 'nonSeedPlantClassification1', 'vertebrates1', 'invertebrates1'];
const SCIENCE_CATEGORY_IDS_J2_ = ['cellBiology2', 'photosynthesis2', 'plantWater2', 'digestion2', 'respiration2', 'stimulusResponse2', 'atmosphericPressureWind2', 'weatherObservation2', 'humidity2', 'cloudWaterCycle2', 'airMassFront2', 'atmosphericCirculation2', 'japanWeather2', 'staticElectricity2', 'circuitCurrentVoltage2', 'electricalEnergy2', 'ohmsLaw2', 'magneticFieldGeneration2', 'atomsMolecules2', 'chemicalDecomposition2', 'elementFormulaDrill2', 'chemicalCombination2', 'massConservation2', 'oxidationReduction2', 'massRatioReaction2', 'chemicalHeat2'];
const SCIENCE_CATEGORY_IDS_J3_ = ['growthReproduction3', 'evolution3', 'motion3', 'forceComposition3', 'genetics3', 'forceAction3', 'energyWork3', 'energyConservation3', 'sunObservation3', 'dailyMotionCelestial3', 'annualMotionSeason3', 'moonVenusEclipse3', 'solarSystemUniverse3', 'aqueousSolutionIon3', 'acidAlkaliSolution3', 'neutralizationSalt3', 'chemistryBattery3', 'ecosystem3', 'decomposerCarbonCycle3', 'naturalEnvironmentConservation3', 'scienceTechnologyHuman3'];
const SCIENCE_TIER_DEFS_ = {
  sci4: { ids: SCIENCE_CATEGORY_IDS_GRADE4_, mp: 100, label: '小4理科' },
  sci5: { ids: SCIENCE_CATEGORY_IDS_GRADE5_, mp: 100, label: '小5理科' },
  sci6: { ids: SCIENCE_CATEGORY_IDS_GRADE6_, mp: 100, label: '小6理科' },
  sciJ1: { ids: SCIENCE_CATEGORY_IDS_J1_, mp: 300, label: '中1理科' },
  sciJ2: { ids: SCIENCE_CATEGORY_IDS_J2_, mp: 400, label: '中2理科' },
  sciJ3: { ids: SCIENCE_CATEGORY_IDS_J3_, mp: 500, label: '中3理科' },
};
const SCIENCE_ELIGIBLE_TIERS_BY_GRADE_ = {
  '小4': ['sci4'],
  '小5': ['sci4', 'sci5'],
  '小6': ['sci4', 'sci5', 'sci6'],
  '中1': ['sciJ1'],
  '中2': ['sciJ1', 'sciJ2'],
  '中3': ['sciJ1', 'sciJ2', 'sciJ3'],
};

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
// 大陸制覇ボーナスは「1周目でまだその大陸のボーナスを受け取っていなければ」1回だけ
// 付与する(2026-09-18〜：周回上限撤廃に伴い、2周目以降はこのボーナスを付与しない
// ことにした。無制限に周回できるようになったことで、大陸ボーナス(6大陸×500MP)を
// 周回のたびに無限にファームできてしまっていたため)。worldCountryは2026-09-01の
// サイコロ方式導入後は前後に増減するため、直前値との差分(prevCount<maxCode<=
// newCount)で判定すると、閾値を何度もまたぎ直すたびに再awardされてしまう(過去に
// 実際発生したバグ)。そのため「1周目で既に受け取ったか」を専用カラム
// (world_continent_bonus)で管理し、一度受け取った大陸は二度と付与しない。
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
  const completionBonusesAwarded = []; // [{ key, label, mp }]

  // 更新するカラムをまとめて1回のUPDATEで書く
  const sets = [];
  const values = [];
  function set(col, val) { values.push(val); sets.push(`${col} = $${values.length}`); }

  // 単元別の級(3級/2級/1級/黒帯)：クライアントが生涯の出題数・正答率から計算した
  // レベル(0〜4)を、rare_defeatsと同じ「値が大きい方を採用」パターンでマージする。
  // 一度到達した級は、後で正答率が下がってもここでは失われない(モノトニック)。
  let mergedCategoryRanks = row.categoryRanks || {};
  if (body.categoryRanks !== undefined && typeof body.categoryRanks === 'object' && body.categoryRanks !== null) {
    mergedCategoryRanks = Object.assign({}, row.categoryRanks);
    Object.keys(body.categoryRanks).forEach((k) => {
      const lv = Math.max(0, Math.min(CATEGORY_RANK_BLACK_BELT, Math.floor(Number(body.categoryRanks[k])) || 0));
      if (lv > (Number(mergedCategoryRanks[k]) || 0)) mergedCategoryRanks[k] = lv;
    });
    set('category_ranks', JSON.stringify(mergedCategoryRanks));
  }
  // 00001はテスト用アカウントのため、コンプリートボーナスの判定だけ小6扱いで動作を
  // 確認できるようにする(本人の実際のgradeカラムは変更しない)。
  const effectiveGrade = (id === '00001') ? '小6' : row.grade;
  // 算数・数学のコンプリートボーナス：自分の学年に対応する単元セット(学年+1つ下の
  // 学年、全てCATEGORY_IDS_*)が全て黒帯に到達していて、期限内、かつまだ受け取って
  // いなければ1回だけ500MP付与する。判定はマージ後のcategory_ranks(サーバー保持値)
  // に対して行うため、prefecture/continentボーナスと同じ信頼レベルで安全。
  const mathBonusReq = COMPLETION_BONUS_BY_GRADE_[effectiveGrade];
  if (mathBonusReq && !row.completionBonus[effectiveGrade] && dateKeyTokyo(new Date()) <= mathBonusReq.deadline) {
    const allBlackBelt = mathBonusReq.ids.every((catId) => (Number(mergedCategoryRanks[catId]) || 0) >= CATEGORY_RANK_BLACK_BELT);
    if (allBlackBelt) {
      completionBonusesAwarded.push({ key: effectiveGrade, label: effectiveGrade + '算数・数学', mp: COMPLETION_BONUS_MP });
    }
  }
  // 理科のコンプリートボーナス：算数・数学と違い期限なし。学年の階層内(小学:小4〜
  // 小6、中学:中1〜中3)で、自分の学年以下の各学年の理科を個別に(重複して)申請
  // できる。金額は学年ごとに固定(SCIENCE_TIER_DEFS_)。
  (SCIENCE_ELIGIBLE_TIERS_BY_GRADE_[effectiveGrade] || []).forEach((tierKey) => {
    if (row.completionBonus[tierKey]) return;
    const tierDef = SCIENCE_TIER_DEFS_[tierKey];
    if (!tierDef) return;
    const allBlackBelt = tierDef.ids.every((catId) => (Number(mergedCategoryRanks[catId]) || 0) >= CATEGORY_RANK_BLACK_BELT);
    if (allBlackBelt) completionBonusesAwarded.push({ key: tierKey, label: tierDef.label, mp: tierDef.mp });
  });
  if (completionBonusesAwarded.length > 0) {
    const newCompletionBonus = Object.assign({}, row.completionBonus);
    completionBonusesAwarded.forEach((b) => { newCompletionBonus[b.key] = true; bonusAwarded += b.mp; });
    set('completion_bonus', JSON.stringify(newCompletionBonus));
  }

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

  // 大陸ボーナスは1周目のみ対象(effectiveLapは今回の同期で反映される周数)。
  const effectiveLap = lapIncrementing ? Math.max(1, Math.floor(Number(body.worldLap)) || 1) : (Number(row.worldLap) || 1);
  if (body.worldCountry !== undefined) {
    const submittedWorldCountry = Math.max(0, Math.min(WORLD_DATA_LENGTH, Math.floor(Number(body.worldCountry)) || 0));
    set('world_country', submittedWorldCountry);
    if (effectiveLap === 1) {
      const baseFlags = (row.worldContinentBonus && typeof row.worldContinentBonus === 'object') ? row.worldContinentBonus : {};
      const { bonus, newlyAwarded } = continentBonusToAward(submittedWorldCountry, baseFlags);
      continentBonusAwarded = bonus;
      bonusAwarded += continentBonusAwarded;
      if (Object.keys(newlyAwarded).length > 0) {
        set('world_continent_bonus', JSON.stringify(Object.assign({}, baseFlags, newlyAwarded)));
      }
    }
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
    completionBonusesAwarded, categoryRanks: mergedCategoryRanks,
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
