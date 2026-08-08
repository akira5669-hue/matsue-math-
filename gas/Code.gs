/**
 * 正負の数トレーニング - 生徒ログイン・学習記録API
 *
 * Students シート: id | name | passwordHash | salt | createdAt | grade | points | guardian | level | exp | lastLogin | prefectureCount | avatar | apologyBonusGrantedAt
 * | items | rareCollected | rareDefeats | thinkerMilestone | loggedCorrectCount | todayStats | hp | lastRankingTestMonth
 * | worldLap | worldLapStartLevel | worldBossDefeated | worldAllies | (27列目: 原因不明のデータが入っていたため未使用) | challengeCorrectTotal
 *
 * worldLap/worldLapStartLevel/worldBossDefeated/worldAllies: 世界一周(ボス戦付き)。
 * 各ステージ(大陸)最後の国はボスで、30問連続正解で撃破するまで先へ進めない。
 * 2周目以降はworldLapStartLevelがその周の開始レベルになる(レベル自体はリセットしない)。
 *
 * prefectureCount: 「47都道府県制覇」特別企画。10問正解（敵を倒す）ごとに
 * 北海道(1)から沖縄(47)の順で1県ずつ達成数が増える。既存の生徒は列が
 * 空欄のままなので 0 として扱う。
 *
 * avatar: レベル300以上またはMP10000以上で作成できるアバターの選択内容
 * （{hair,face,skin,hairColor,outfitColor} のJSON文字列）。未作成の生徒は
 * 空欄のままなのでnullとして扱う。
 *
 * apologyBonusGrantedAt: ログアウト時にアイテムが消える不具合のお詫びとして、
 * APOLOGY_BONUS_START〜APOLOGY_BONUS_ENDの期間中に一度だけ全員へ
 * APOLOGY_BONUS_MPを付与する。付与済みの生徒にはこの列へ日時が入り、
 * 同じ生徒に二重付与しないようにする。
 *
 * 5日以上ログインが無かった場合、次回ログイン時にMPは0にリセットされる
 * （経験値・レベルはリセットされない）。
 * Records  シート: timestamp | id | name | category | correct
 * Guardians シート: timestamp | guardianName | childId1 | childName1 | childId2 | childName2 | childId3 | childName3 | childId4 | childName4
 * GiftRequests シート: timestamp | id | name | item | yen | mp | status | code
 * GiftCodes シート: itemId | code | status | usedBy | usedAt
 *   在庫プール方式：先生が事前にコードをGiftCodesシートへ追加（status列は
 *   空欄でOK、未使用として扱う）。交換申請時に未使用コードを1件自動で
 *   割り当て、即座に本人へ表示する（購入自体は引き続き先生が手動で行う）。
 *   在庫が無い場合は交換不成立（MPは減らない）。在庫僅少・在庫切れは
 *   管理者へ自動メール通知される。
 *
 * 新規登録は名前（漢字）・在籍学年・パスワード（数字4桁）を受け取り、
 * IDは登録順の連番（5桁・0埋め、例: 00001）を自動発行する。
 * 生徒本人・保護者のどちらも同じID・パスワードでログインできる。
 * points はクライアント側のポイントをsyncPointsで都度書き込む
 * （ランキング表示用。ニックネームはidから決定的に生成し、実名は出さない）。
 *
 * 保護者は別画面で「保護者登録」を行うが、これは記録用のみで、
 * ログイン用のID・パスワードは発行しない。保護者はログインの際も
 * 常にお子様（最大4人まで）のID・パスワードを使う。登録時に
 * 各お子様のID・パスワードが実在し一致することを検証する。
 */

var STUDENTS_SHEET = 'Students';
var RECORDS_SHEET = 'Records';
var GUARDIANS_SHEET = 'Guardians';
var GIFTS_SHEET = 'GiftRequests';
var ADMIN_EMAIL = 'akira5669@gmail.com';
var EXCHANGE_WINDOW_TEXT = '5月1日〜3日、12月30日〜31日、1月1日';

// MP(旧ポイント)交換カタログ。10MP = 1円。costはクライアントの申告を信用せず、
// ここを唯一の正として毎回サーバー側で検証する。
// 「中学生向け」等は商品名に添える説明表示のみで、交換自体は学年を問わず全員可能。
var GIFT_CATALOG = [
  { itemId: 'amazon300', label: 'Amazonギフト券 300円分', yen: 300, mp: 3000 },
  { itemId: 'amazon700', label: 'Amazonギフト券 700円分', yen: 700, mp: 7000 },
  { itemId: 'amazon1000', label: 'Amazonギフト券 1000円分', yen: 1000, mp: 10000 },
  { itemId: 'amazon2000', label: 'Amazonギフト券 2000円分', yen: 2000, mp: 20000 },
  { itemId: 'amazon5000', label: 'Amazonギフト券 5000円分', yen: 5000, mp: 50000 },
  { itemId: 'amazon10000', label: 'Amazonギフト券 10000円分', yen: 10000, mp: 100000 },
  { itemId: 'specialA', label: 'スペシャルグッズA（小・中学生向け）', mp: 20000 },
  { itemId: 'specialB', label: 'スペシャルグッズB（小・中学生向け）', mp: 35000 },
  { itemId: 'specialC', label: 'スペシャルグッズC（小・中学生向け）', mp: 50000 },
  { itemId: 'specialD', label: 'スペシャルグッズD（中学生向け）', mp: 35000 },
  { itemId: 'specialE', label: 'スペシャルグッズE（中学生向け）', mp: 55000 },
  { itemId: 'specialF', label: 'スペシャルグッズF（中学生向け）', mp: 75000 },
  { itemId: 'specialS', label: 'スペシャルグッズS（中学生向け）', mp: 100000 },
];

var GIFTCODES_SHEET = 'GiftCodes';
var ITEMGRANTS_SHEET = 'ItemGrants';
var ANOMALYLOG_SHEET = 'PointsAnomalyLog';
var WEEKLYQUIZ_SHEET = 'WeeklyQuiz';
var WITHDRAWN_SHEET = 'WithdrawnStudents';
var LOW_STOCK_THRESHOLDS = [10, 5];

// 週替わり4択クイズ(各学年、授業の大切なワードを問う)。weekKeyがその週の月曜日
// (mondayKeyTokyo_の結果)と一致する学年だけ出題される。毎週の問題・正解・選択肢は
// 先生からチャットで伝えられる内容をここへ直接書き換えてデプロイする運用。
var WEEKLY_QUIZ_CORRECT_MP_ = 30;
var WEEKLY_QUIZ_WRONG_MP_ = -100;
var WEEKLY_QUIZ_ = {
  weekKey: null, // 例: '2026-08-03'（対象週の月曜日）。nullの間は全学年「今週の問題は準備中」表示になる。
  byGrade: {
    // '小4': { question: '...', choices: ['...', '...', '...', '...'], correctIndex: 0 },
  },
  // special: 1日限定の特別クイズ(全学年共通、2問連続正解で加点)。activeDateの日だけ出題され、
  // 通常の週替わり(byGrade)より優先される。両方nullの日は「今日は問題なし」になる。
  special: {
    activeDate: '2026-08-09',
    label: '📅本日限定！特別クイズ（2問連続正解で+30ポイント）',
    questions: [
      {
        question: '今週の授業の中で話をした、数学の偏差値が55から爆上がりした生徒さんは、いくつまで上がったのでしょう。',
        choices: ['64', '69', '74', '79'],
        correctIndex: 3,
      },
      {
        question: 'その生徒さんの数学の偏差値が爆上がりした要因は！？',
        choices: ['1人で頑張ったから', '保護者の方のサポートがあったから', '図書館で勉強したから', '学校の先生に質問したから'],
        correctIndex: 1,
      },
    ],
  },
};

// テスト画像提出(ペナテスト/抜き打ちテスト/ランキングテスト)。写真はGoogleドライブへ
// 保存し、3週間経過したものは次回の提出時に自動で削除する(定期実行トリガーを使わない
// 簡易な遅延クリーンアップ)。
var TESTPHOTOS_SHEET = 'TestPhotos';
var TEST_PHOTO_DRIVE_FOLDER_NAME_ = '松江塾計算マスター_テスト画像';
var TEST_PHOTO_RETENTION_DAYS_ = 21;
var PENA_TEST_MP_PER_SHEET_ = 30;
var PENA_TEST_DAILY_CAP_MP_ = 30;
var RANKING_TEST_TIERS_ = [
  { id: '100', label: '100点', mp: 500 },
  { id: '90s', label: '90点台', mp: 400 },
  { id: '80s', label: '80点台', mp: 300 },
  { id: '70s', label: '70点台', mp: 200 },
];
// 数学ランキングテストは、まだ小学生向けには実施しないため小3〜小6は提出不可
// (中1以上のみ)。
var RANKING_TEST_BLOCKED_GRADES_ = ['小3', '小4', '小5', '小6'];

// 100マス計算チャレンジ(実際は50問)。小4〜小6限定、週1回(月〜日)まで提出可能。
// 目標タイム内にできたかはサーバー側では検証できないため、生徒の自己申告に委ねる
// (クライアント側でチェックを入れないと送信できないようにする)。達成できれば
// 一律20MP。
var HYAKUMASU_MP_ = 20;
var HYAKUMASU_ALLOWED_GRADES_ = ['小4', '小5', '小6'];
var HYAKUMASU_TARGET_TIME_LABELS_ = { '小4': '1分30秒', '小5': '1分', '小6': '45秒' };

// チャレンジ問題(小4〜中3対象)。正解数に応じて自己申告のうえ提出してもらう
// (1問=10MP、2問=20MP、3問以上=30MP)。週あたりの提出可能回数は小学生1回・中学生3回。
// countはチャレンジ問題正解数ランキング(累計)に積み上げる値。
var CHALLENGE_TEST_TIERS_ = [
  { id: '3plus', label: '3問以上正解', mp: 30, count: 3 },
  { id: '2', label: '2問正解', mp: 20, count: 2 },
  { id: '1', label: '1問正解', mp: 10, count: 1 },
];
var CHALLENGE_WEEKLY_LIMIT_ELEMENTARY_ = 1;
var CHALLENGE_WEEKLY_LIMIT_MIDDLE_ = 3;
var HYAKUMASU_WEEKLY_LIMIT_ = 1;

// testType/学年ごとの週あたり提出上限。hyakuMasuは学年問わず1回、challengeは
// 中学生(学年が「中」始まり)のみ3回、それ以外(小学生)は1回。
function weeklySubmitLimitForTestType_(testType, grade) {
  if (testType === 'hyakuMasu') return HYAKUMASU_WEEKLY_LIMIT_;
  if (testType === 'challenge') {
    return (String(grade || '').charAt(0) === '中') ? CHALLENGE_WEEKLY_LIMIT_MIDDLE_ : CHALLENGE_WEEKLY_LIMIT_ELEMENTARY_;
  }
  return 0;
}

// 交換受付期間: 5/1〜5/3、12/30〜12/31、1/1（日本時間）
function isInExchangeWindow_() {
  var md = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'MM-dd');
  if (md >= '05-01' && md <= '05-03') return true;
  if (md === '12-30' || md === '12-31') return true;
  if (md === '01-01') return true;
  return false;
}

function notifyAdminOfGiftDelivery_(studentId, studentName, item, remainingStock) {
  try {
    var subject = '【正負の数トレーニング】MP交換で自動発行: ' + studentName + '（' + studentId + '）';
    var body = studentName + '（ID: ' + studentId + '）さんに「' + item.label + '」（' + item.mp + 'MP）のコードを自動発行しました。\n\n'
      + 'その商品の残り在庫: ' + remainingStock + '枚\n\n'
      + '詳細はスプレッドシートの「' + GIFTS_SHEET + '」「' + GIFTCODES_SHEET + '」シートをご確認ください。';
    MailApp.sendEmail(ADMIN_EMAIL, subject, body);
  } catch (e) {
    // メール送信に失敗しても交換自体は成立させる
  }
}

function notifyAdminOfLowStock_(item, remainingStock) {
  try {
    var subject = '【正負の数トレーニング】在庫僅少: ' + item.label;
    var body = '「' + item.label + '」の在庫コードが残り' + remainingStock + '枚になりました。\n\n'
      + '「' + GIFTCODES_SHEET + '」シートに新しいコードを追加してください（itemId列に「' + item.itemId + '」、code列にコード、status列は空欄またはunusedのままでOKです）。';
    MailApp.sendEmail(ADMIN_EMAIL, subject, body);
  } catch (e) {
    // メール送信に失敗しても処理は続行する
  }
}

function notifyAdminOfOutOfStock_(studentId, studentName, item) {
  try {
    var subject = '【正負の数トレーニング】在庫切れで交換失敗: ' + item.label;
    var body = studentName + '（ID: ' + studentId + '）さんが「' + item.label + '」に交換しようとしましたが、在庫コードが無かったため交換できませんでした（MPは減っていません）。\n\n'
      + '「' + GIFTCODES_SHEET + '」シートにコードを追加してください。';
    MailApp.sendEmail(ADMIN_EMAIL, subject, body);
  } catch (e) {
    // メール送信に失敗しても処理は続行する
  }
}

// Apps Scriptエディタから直接実行して、メール送信の権限を許可するための関数。
// 「実行」ボタンで選んで実行し、表示される権限確認画面で許可してください。
function authorizeMailSendingTest() {
  MailApp.sendEmail(ADMIN_EMAIL, '【権限確認用】正負の数トレーニング', 'このメールが届けば、MP交換申請の通知メールも正常に送れるようになります。');
}

function getOrInitSheets_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var students = ss.getSheetByName(STUDENTS_SHEET);
  if (!students) {
    var first = ss.getSheets()[0];
    if (first.getName() === 'Sheet1' && first.getLastRow() === 0) {
      first.setName(STUDENTS_SHEET);
      students = first;
    } else {
      students = ss.insertSheet(STUDENTS_SHEET);
    }
  }
  if (students.getLastRow() === 0) {
    students.appendRow(['id', 'name', 'passwordHash', 'salt', 'createdAt', 'grade', 'points', 'guardian', 'level', 'exp', 'lastLogin']);
    students.appendRow(['sample01', '見本 太郎', '', '', '', '', 0, '', 1, 0, '']);
  }

  var records = ss.getSheetByName(RECORDS_SHEET);
  if (!records) {
    records = ss.insertSheet(RECORDS_SHEET);
  }
  if (records.getLastRow() === 0) {
    records.appendRow(['timestamp', 'id', 'name', 'category', 'correct']);
  }

  var guardians = ss.getSheetByName(GUARDIANS_SHEET);
  if (!guardians) {
    guardians = ss.insertSheet(GUARDIANS_SHEET);
  }
  if (guardians.getLastRow() === 0) {
    guardians.appendRow(['timestamp', 'guardianName', 'childId1', 'childName1', 'childId2', 'childName2', 'childId3', 'childName3', 'childId4', 'childName4']);
  }

  var gifts = ss.getSheetByName(GIFTS_SHEET);
  if (!gifts) {
    gifts = ss.insertSheet(GIFTS_SHEET);
  }
  if (gifts.getLastRow() === 0) {
    gifts.appendRow(['timestamp', 'id', 'name', 'item', 'yen', 'mp', 'status', 'code']);
  }

  var giftCodes = ss.getSheetByName(GIFTCODES_SHEET);
  if (!giftCodes) {
    giftCodes = ss.insertSheet(GIFTCODES_SHEET);
  }
  if (giftCodes.getLastRow() === 0) {
    giftCodes.appendRow(['itemId', 'code', 'status', 'usedBy', 'usedAt']);
  }

  // ItemGrants: アイテム・レアキャラ図鑑はクライアント側(localStorage)のみのデータのため、
  // ログアウト時のバグ等で消えてしまった生徒に、管理者(ID 00001)が個別に付与できるように
  // する一時保管シート。付与内容は次回ログイン/再開時に一度だけ配布し、配布後は消去する。
  var itemGrants = ss.getSheetByName(ITEMGRANTS_SHEET);
  if (!itemGrants) {
    itemGrants = ss.insertSheet(ITEMGRANTS_SHEET);
  }
  if (itemGrants.getLastRow() === 0) {
    itemGrants.appendRow(['id', 'itemIds', 'grantedAt']);
  }

  // PointsAnomalyLog: syncPoints受信時にpoints/level/expの妥当性チェック(クランプ)が
  // 実際に発動した場合、その記録をここへ残す。先生が不正なポイント水増しの発生に
  // いつでも気付けるようにするための監査ログ(通常は空のまま)。
  var anomalyLog = ss.getSheetByName(ANOMALYLOG_SHEET);
  if (!anomalyLog) {
    anomalyLog = ss.insertSheet(ANOMALYLOG_SHEET);
  }
  if (anomalyLog.getLastRow() === 0) {
    anomalyLog.appendRow(['timestamp', 'id', 'name', 'submittedPoints', 'clampedPoints', 'submittedExp', 'clampedExp', 'submittedLevel', 'clampedLevel']);
  }

  // TestPhotos: ペナテスト/抜き打ちテスト/ランキングテストの提出記録。画像本体はドライブに
  // 保存し、ここにはファイルIDと採点結果(MP)だけを残す。3週間経過後、次回提出時に
  // まとめて削除される(expiresAtを参照)。
  var testPhotos = ss.getSheetByName(TESTPHOTOS_SHEET);
  if (!testPhotos) {
    testPhotos = ss.insertSheet(TESTPHOTOS_SHEET);
  }
  if (testPhotos.getLastRow() === 0) {
    testPhotos.appendRow(['timestamp', 'id', 'name', 'testType', 'scoreTier', 'pointsAwarded', 'driveFileId', 'expiresAt']);
  }

  // WeeklyQuiz: 週替わり4択クイズ(各学年、授業の大切なワードを問う)の回答履歴。
  // 生徒1人につき週1回まで(weekKeyで判定)。不正解の場合pointsDeltaは負の値になる。
  var weeklyQuiz = ss.getSheetByName(WEEKLYQUIZ_SHEET);
  if (!weeklyQuiz) {
    weeklyQuiz = ss.insertSheet(WEEKLYQUIZ_SHEET);
  }
  if (weeklyQuiz.getLastRow() === 0) {
    weeklyQuiz.appendRow(['timestamp', 'id', 'name', 'grade', 'weekKey', 'correct', 'pointsDelta']);
  }

  // WithdrawnStudents: 退会した生徒のバックアップ。Studentsシートから行を削除する前に、
  // 復元できるよう全カラムの値をrawDataJsonへそのまま保存しておく(誤操作からの安全弁)。
  var withdrawn = ss.getSheetByName(WITHDRAWN_SHEET);
  if (!withdrawn) {
    withdrawn = ss.insertSheet(WITHDRAWN_SHEET);
  }
  if (withdrawn.getLastRow() === 0) {
    withdrawn.appendRow(['withdrawnAt', 'id', 'name', 'grade', 'points', 'level', 'rawDataJson']);
  }

  return { ss: ss, students: students, records: records, guardians: guardians, gifts: gifts, giftCodes: giftCodes, itemGrants: itemGrants, anomalyLog: anomalyLog, testPhotos: testPhotos, weeklyQuiz: weeklyQuiz, withdrawn: withdrawn };
}

function sha256Hex_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

// アイテム・図鑑(rareCollected)・レアキャラ撃破回数(rareDefeats)のようにJSONで
// シートのセルへ保存しているフィールドを安全にパースする(空セル・壊れた値はデフォルト値)。
function parseJsonCell_(raw, fallback) {
  if (!raw) return fallback;
  try {
    var v = JSON.parse(raw);
    return (v === null || v === undefined) ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

// 生徒IDが増えるにつれ、毎リクエストごとにStudentsシート全体を読んで先頭から線形
// 探索するコスト(getDataRange)が無視できなくなってきたため、「ID→行番号」の索引を
// CacheServiceにキャッシュし、通常は該当行だけをピンポイントで読むようにしている。
// 索引が古くなっていても(行の削除等で行番号がずれていても)、読んだ行のID列が
// 期待と一致するか必ず検証し、不一致なら索引を作り直して1回だけ再試行するため、
// 誤った生徒のデータを返すことはない(自己修復する)。
var STUDENT_ID_INDEX_CACHE_KEY_ = 'studentIdIndex_v1';
var STUDENT_ID_INDEX_CACHE_TTL_ = 21600; // CacheServiceの最大値(6時間)
var STUDENT_ROW_COLUMNS_ = 28; // id 〜 challengeCorrectTotal(27列目は原因不明のデータが
// 入っていたため使わず、確実に未使用の28列目を使う)

function rebuildStudentIdIndex_(sheet) {
  var lastRow = sheet.getLastRow();
  var index = {};
  if (lastRow >= 2) {
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      var id = String(ids[i][0]).trim();
      if (id) index[id] = i + 2;
    }
  }
  CacheService.getScriptCache().put(STUDENT_ID_INDEX_CACHE_KEY_, JSON.stringify(index), STUDENT_ID_INDEX_CACHE_TTL_);
  return index;
}

function getStudentIdIndex_(sheet) {
  var cached = CacheService.getScriptCache().get(STUDENT_ID_INDEX_CACHE_KEY_);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { /* 壊れていたら作り直す */ }
  }
  return rebuildStudentIdIndex_(sheet);
}

// 新規登録でシートに1行appendした直後に呼び、索引全体を作り直さずに1件だけ追記する。
function addToStudentIdIndex_(id, rowIndex) {
  var cached = CacheService.getScriptCache().get(STUDENT_ID_INDEX_CACHE_KEY_);
  var index = {};
  if (cached) { try { index = JSON.parse(cached); } catch (e) { index = {}; } }
  index[id] = rowIndex;
  CacheService.getScriptCache().put(STUDENT_ID_INDEX_CACHE_KEY_, JSON.stringify(index), STUDENT_ID_INDEX_CACHE_TTL_);
}

function buildStudentRowObject_(rowIndex, d) {
  return {
    rowIndex: rowIndex, id: d[0], name: d[1], passwordHash: d[2], salt: d[3],
    createdAt: d[4] || null,
    grade: d[5] || '', points: Number(d[6]) || 0, guardian: d[7] || '',
    level: Number(d[8]) || 1, exp: Number(d[9]) || 0, lastLogin: d[10] || null,
    prefectureCount: Number(d[11]) || 0, avatar: d[12] || null,
    apologyBonusGrantedAt: d[13] || null,
    // items/rareCollected/rareDefeats/thinkerMilestoneは、以前はクライアント側の
    // localStorageのみで管理していたため、同じIDを複数端末で使うと図鑑・アイテムの
    // 状態が端末ごとにズレてしまう不具合があった。サーバー側にも保存・同期する。
    items: parseJsonCell_(d[14], []),
    rareCollected: parseJsonCell_(d[15], []),
    rareDefeats: parseJsonCell_(d[16], {}),
    thinkerMilestone: d[17] || null,
    // 累計の正解数。handleLog_で正解のたびに1ずつ加算しておくことで、Recordsシート
    // 全体を毎回スキャンしなくても「この生徒が実際に解いた問題数」を安く参照できる
    // (syncPointsの妥当性チェックで、EXPが実際の正解数に見合っているかの検証に使う)。
    loggedCorrectCount: Number(d[18]) || 0,
    // 本日(日本時間)の正解数/出題数。{date, correct, total}。日付が変わった分は
    // handleLog_側でリセットしてから加算するので、ここでは生の値をそのまま返す。
    todayStats: parseJsonCell_(d[19], null),
    // HP: 文章題を正解するたびに+10される新ステータス。
    hp: Number(d[20]) || 0,
    // ランキングテスト(数学)を最後に提出した月(yyyy-MM)。月1回の提出制限に使う。
    // 万一過去に日付型として保存されてしまった行が残っていても比較できるよう、
    // Dateならyyyy-MM文字列に変換してから返す。
    lastRankingTestMonth: (d[21] instanceof Date) ? monthKeyTokyo_(d[21]) : (d[21] || null),
    // 世界一周: 現在の周(1周目=1)・その周の開始レベル・ステージ別ボス撃破状況・
    // 撃破済みボス(仲間)一覧。
    worldLap: Number(d[22]) || 1,
    worldLapStartLevel: Number(d[23]) || 100,
    worldBossDefeated: parseJsonCell_(d[24], {}),
    worldAllies: parseJsonCell_(d[25], []),
    // チャレンジ問題ランキング用。提出のたびに自己申告の正解数(1/2/3)を積み上げた累計値。
    // 既存の生徒は列が空欄のままなので0として扱う。
    challengeCorrectTotal: Number(d[27]) || 0
  };
}

function readStudentRowAt_(sheet, rowIndex) {
  if (!rowIndex || rowIndex < 2 || rowIndex > sheet.getLastRow()) return null;
  return sheet.getRange(rowIndex, 1, 1, STUDENT_ROW_COLUMNS_).getValues()[0];
}

function findStudentRow_(sheet, id) {
  id = String(id).trim();
  if (!id) return null;

  var index = getStudentIdIndex_(sheet);
  var rowIndex = index[id];
  if (rowIndex) {
    var d = readStudentRowAt_(sheet, rowIndex);
    if (d && String(d[0]).trim() === id) return buildStudentRowObject_(rowIndex, d);
  }

  // 索引に無い、または行がずれている(削除等で古くなった)場合は索引を作り直して1回だけ
  // 再試行する。ここで一致しなければ本当に存在しないIDとして扱う。
  index = rebuildStudentIdIndex_(sheet);
  rowIndex = index[id];
  if (!rowIndex) return null;
  var d2 = readStudentRowAt_(sheet, rowIndex);
  if (!d2 || String(d2[0]).trim() !== id) return null;
  return buildStudentRowObject_(rowIndex, d2);
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return jsonOut_({ ok: true, message: 'matsue-math API is running' });
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut_({ ok: false, error: 'bad_request' });
  }

  var action = body.action;
  var ctx = getOrInitSheets_();

  if (action === 'checkId') {
    return jsonOut_(handleCheckId_(ctx, body));
  } else if (action === 'register') {
    return jsonOut_(handleRegister_(ctx, body));
  } else if (action === 'login') {
    return jsonOut_(handleLogin_(ctx, body));
  } else if (action === 'log') {
    return jsonOut_(handleLog_(ctx, body));
  } else if (action === 'logBatch') {
    return jsonOut_(handleLogBatch_(ctx, body));
  } else if (action === 'history') {
    return jsonOut_(handleHistory_(ctx, body));
  } else if (action === 'syncPoints') {
    return jsonOut_(handleSyncPoints_(ctx, body));
  } else if (action === 'saveAvatar') {
    return jsonOut_(handleSaveAvatar_(ctx, body));
  } else if (action === 'getPoints') {
    return jsonOut_(handleGetPoints_(ctx, body));
  } else if (action === 'ranking') {
    return jsonOut_(handleRanking_(ctx, body));
  } else if (action === 'rankingToday') {
    return jsonOut_(handleRankingToday_(ctx, body));
  } else if (action === 'rankingPoints') {
    return jsonOut_(handleRankingPoints_(ctx, body));
  } else if (action === 'rankingGrade') {
    return jsonOut_(handleRankingGrade_(ctx, body));
  } else if (action === 'rankingHp') {
    return jsonOut_(handleRankingHp_(ctx, body));
  } else if (action === 'challengeRanking') {
    return jsonOut_(handleChallengeRanking_(ctx, body));
  } else if (action === 'grantItems') {
    return jsonOut_(handleGrantItems_(ctx, body));
  } else if (action === 'registerGuardian') {
    return jsonOut_(handleRegisterGuardian_(ctx, body));
  } else if (action === 'giftCatalog') {
    return jsonOut_({ ok: true, catalog: GIFT_CATALOG, isOpen: isInExchangeWindow_(), windowText: EXCHANGE_WINDOW_TEXT });
  } else if (action === 'redeemGift') {
    return jsonOut_(handleRedeemGift_(ctx, body));
  } else if (action === 'resetPassword') {
    return jsonOut_(handleResetPassword_(ctx, body));
  } else if (action === 'submitTestPhoto') {
    return jsonOut_(handleSubmitTestPhoto_(ctx, body));
  } else if (action === 'weeklyQuizGet') {
    return jsonOut_(handleWeeklyQuizGet_(ctx, body));
  } else if (action === 'weeklyQuizAnswer') {
    return jsonOut_(handleWeeklyQuizAnswer_(ctx, body));
  } else if (action === 'withdraw') {
    return jsonOut_(handleWithdraw_(ctx, body));
  }
  return jsonOut_({ ok: false, error: 'unknown_action' });
}

function handleCheckId_(ctx, body) {
  var id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  var row = findStudentRow_(ctx.students, id);
  if (!row) return { ok: true, found: false };
  return { ok: true, found: true, hasPassword: !!row.passwordHash, name: row.name };
}

// 以前はシート全体を毎回読んで最大IDを走査していたが、これはregister中ずっと
// (他の全生徒の操作をブロックする)グローバルロックを持ったまま行っていたため、
// 登録が混雑する時間帯にロック待ちが連鎖して重くなる一因になっていた。ID索引の
// キャッシュ(getStudentIdIndex_)を使えばシートを読まずに済む。
function nextStudentId_(sheet) {
  var index = getStudentIdIndex_(sheet);
  var used = {};
  var max = 0;
  for (var idStr in index) {
    if (/^\d{5}$/.test(idStr)) {
      var n = parseInt(idStr, 10);
      used[n] = true;
      if (n > max) max = n;
    }
  }
  // 退会・重複整理等で削除されたIDの欠番があれば、新規登録のたびにIDが際限なく
  // 大きくなっていくのを避けるため、最小の欠番から優先的に再利用する。
  for (var i = 1; i <= max; i++) {
    if (!used[i]) return ('00000' + i).slice(-5);
  }
  return ('00000' + (max + 1)).slice(-5);
}

function handleRegister_(ctx, body) {
  var name = String(body.name || '').trim();
  var grade = String(body.grade || '').trim();
  var guardian = String(body.guardian || '').trim();
  var password = String(body.password || '');
  if (!name || !password) return { ok: false, error: 'missing_fields' };
  if (!/^[A-Za-z0-9]{4}$/.test(password)) return { ok: false, error: 'invalid_password' };

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var id = nextStudentId_(ctx.students);
    var salt = Utilities.getUuid();
    var hash = sha256Hex_(password + salt);
    var rowIndex = ctx.students.getLastRow() + 1;
    // 先頭0埋けのIDが数値化されて消えないよう、書き込み前にA列を文字列書式にする
    ctx.students.getRange(rowIndex, 1).setNumberFormat('@').setValue(id);
    var now = new Date();
    ctx.students.getRange(rowIndex, 2, 1, 10).setValues([[name, hash, salt, now, grade, 0, guardian, 1, 0, now]]);
    addToStudentIdIndex_(id, rowIndex);
    return { ok: true, id: id, name: name };
  } finally {
    lock.releaseLock();
  }
}

var LOGIN_MAX_ATTEMPTS = 5;
var LOGIN_LOCK_SECONDS = 15 * 60;

function handleLogin_(ctx, body) {
  var id = String(body.id || '').trim();
  var password = String(body.password || '');
  if (!id || !password) return { ok: false, error: 'missing_fields' };

  var cache = CacheService.getScriptCache();
  var attemptKey = 'loginfail_' + id;
  var attempts = Number(cache.get(attemptKey)) || 0;
  if (attempts >= LOGIN_MAX_ATTEMPTS) {
    return { ok: false, error: 'locked', retryAfterMinutes: Math.ceil(LOGIN_LOCK_SECONDS / 60) };
  }

  var row = findStudentRow_(ctx.students, id);
  if (!row) return { ok: false, error: 'not_found' };
  if (!row.passwordHash) return { ok: false, error: 'no_password' };

  var hash = sha256Hex_(password + row.salt);
  if (hash !== row.passwordHash) {
    attempts++;
    cache.put(attemptKey, String(attempts), LOGIN_LOCK_SECONDS);
    if (attempts >= LOGIN_MAX_ATTEMPTS) {
      return { ok: false, error: 'locked', retryAfterMinutes: Math.ceil(LOGIN_LOCK_SECONDS / 60) };
    }
    return { ok: false, error: 'wrong_password', attemptsRemaining: LOGIN_MAX_ATTEMPTS - attempts };
  }

  cache.remove(attemptKey);

  var now = new Date();
  var points = row.points;
  var pointsReset = false;
  if (row.lastLogin) {
    var daysSince = Math.floor((now.getTime() - new Date(row.lastLogin).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince >= 5 && points > 0) {
      points = 0;
      pointsReset = true;
      ctx.students.getRange(row.rowIndex, 7).setValue(0);
    }
  }
  ctx.students.getRange(row.rowIndex, 11).setValue(now);

  row.points = points;
  var apologyBonusAwarded = maybeGrantApologyBonus_(ctx, row);
  points = row.points;

  var pendingItems = takePendingItemGrants_(ctx, id);
  return {
    ok: true, name: row.name, points: points, pointsReset: pointsReset, level: row.level, exp: row.exp, grade: row.grade,
    prefectureCount: row.prefectureCount, avatar: row.avatar, pendingItems: pendingItems, apologyBonusAwarded: apologyBonusAwarded,
    items: row.items, rareCollected: row.rareCollected, rareDefeats: row.rareDefeats, thinkerMilestone: row.thinkerMilestone, hp: row.hp,
    worldLap: row.worldLap, worldLapStartLevel: row.worldLapStartLevel, worldBossDefeated: row.worldBossDefeated, worldAllies: row.worldAllies
  };
}

// 退会処理。IDとパスワードで再認証したうえで、Studentsシートの行をWithdrawnStudentsへ
// バックアップしてから削除する(誤操作・不正からの安全弁として、復元できるようJSONで
// 全カラムを保存しておく)。関連する小規模シート(Records/TestPhotos/WeeklyQuiz/ItemGrants)
// からも該当IDの行を削除する。GiftRequests/GiftCodes/Guardiansは、MP交換の会計記録・
// 保護者登録記録として塾側に残す必要があるため削除しない。
function handleWithdraw_(ctx, body) {
  var id = String(body.id || '').trim();
  var password = String(body.password || '');
  if (!id || !password) return { ok: false, error: 'missing_fields' };

  var cache = CacheService.getScriptCache();
  var attemptKey = 'loginfail_' + id;
  var attempts = Number(cache.get(attemptKey)) || 0;
  if (attempts >= LOGIN_MAX_ATTEMPTS) {
    return { ok: false, error: 'locked', retryAfterMinutes: Math.ceil(LOGIN_LOCK_SECONDS / 60) };
  }

  var row = findStudentRow_(ctx.students, id);
  if (!row) return { ok: false, error: 'not_found' };
  if (!row.passwordHash) return { ok: false, error: 'no_password' };

  var hash = sha256Hex_(password + row.salt);
  if (hash !== row.passwordHash) {
    attempts++;
    cache.put(attemptKey, String(attempts), LOGIN_LOCK_SECONDS);
    if (attempts >= LOGIN_MAX_ATTEMPTS) {
      return { ok: false, error: 'locked', retryAfterMinutes: Math.ceil(LOGIN_LOCK_SECONDS / 60) };
    }
    return { ok: false, error: 'wrong_password', attemptsRemaining: LOGIN_MAX_ATTEMPTS - attempts };
  }
  cache.remove(attemptKey);

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    // ロック取得後にもう一度確実な行番号を取得してから削除する(索引が古い可能性への対策)
    var freshRow = findStudentRow_(ctx.students, id);
    if (!freshRow) return { ok: false, error: 'not_found' };
    var rawValues = ctx.students.getRange(freshRow.rowIndex, 1, 1, STUDENT_ROW_COLUMNS_).getValues()[0];
    ctx.withdrawn.appendRow([new Date(), id, freshRow.name, freshRow.grade, freshRow.points, freshRow.level, JSON.stringify(rawValues)]);
    var newWRow = ctx.withdrawn.getLastRow();
    ctx.withdrawn.getRange(newWRow, 2).setNumberFormat('@').setValue(id);
    ctx.students.deleteRow(freshRow.rowIndex);
    rebuildStudentIdIndex_(ctx.students);

    deleteRowsByIdColumn_(ctx.records, 2, id);
    deleteRowsByIdColumn_(ctx.testPhotos, 2, id);
    deleteRowsByIdColumn_(ctx.weeklyQuiz, 2, id);
    deleteRowsByIdColumn_(ctx.itemGrants, 1, id);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// 指定した列(1始まり)がidと一致する行を末尾から順に削除する(先頭から消すと行番号が
// ずれるため、必ず末尾から消す)。
function deleteRowsByIdColumn_(sheet, col, id) {
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  var rowsToDelete = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][col - 1]).trim() === id) rowsToDelete.push(i + 1);
  }
  for (var j = rowsToDelete.length - 1; j >= 0; j--) {
    sheet.deleteRow(rowsToDelete[j]);
  }
}

// 管理者(ID 00001)が、ログアウト時のバグ等でアイテム・レアキャラ図鑑を失った生徒に
// 個別付与するための一時保管シートから、該当IDの分を取り出して消去する
// （次回ログイン/再開時に一度だけクライアントへ配布される）。
function takePendingItemGrants_(ctx, id) {
  if (!ctx.itemGrants) return [];
  var data = ctx.itemGrants.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(id).trim()) {
      var itemIds = String(data[i][1] || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      if (itemIds.length === 0) return [];
      ctx.itemGrants.deleteRow(i + 1);
      return itemIds;
    }
  }
  return [];
}

// 管理者(ID 00001)専用：アイテム・レアキャラ図鑑を指定した生徒に付与予約する。
function handleGrantItems_(ctx, body) {
  var callerId = String(body.id || '').trim();
  if (callerId !== '00001') return { ok: false, error: 'forbidden' };

  var targetId = String(body.targetId || '').trim();
  var itemIds = Array.isArray(body.itemIds) ? body.itemIds.map(function (s) { return String(s).trim(); }).filter(Boolean) : [];
  if (!targetId || itemIds.length === 0) return { ok: false, error: 'missing_fields' };

  var targetRow = findStudentRow_(ctx.students, targetId);
  if (!targetRow) return { ok: false, error: 'not_found' };

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var data = ctx.itemGrants.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === targetId) {
        var existing = String(data[i][1] || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        var merged = existing.concat(itemIds.filter(function (x) { return existing.indexOf(x) === -1; }));
        ctx.itemGrants.getRange(i + 1, 2, 1, 2).setValues([[merged.join(','), new Date()]]);
        return { ok: true };
      }
    }
    ctx.itemGrants.appendRow([targetId, itemIds.join(','), new Date()]);
    var newRow = ctx.itemGrants.getLastRow();
    ctx.itemGrants.getRange(newRow, 1).setNumberFormat('@').setValue(targetId);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// パスワード再設定：先生がStudentsシートのpasswordHash・salt列を空にした
// IDに対してのみ、新しいパスワードを設定できる（第三者が他人のIDだけで
// 勝手に変更することはできない）。
function handleResetPassword_(ctx, body) {
  var id = String(body.id || '').trim();
  var password = String(body.password || '');
  if (!id || !password) return { ok: false, error: 'missing_fields' };
  if (!/^[A-Za-z0-9]{4}$/.test(password)) return { ok: false, error: 'invalid_password' };

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var row = findStudentRow_(ctx.students, id);
    if (!row) return { ok: false, error: 'not_found' };
    if (row.passwordHash) return { ok: false, error: 'password_already_set' };

    var salt = Utilities.getUuid();
    var hash = sha256Hex_(password + salt);
    ctx.students.getRange(row.rowIndex, 3, 1, 2).setValues([[hash, salt]]);

    var cache = CacheService.getScriptCache();
    cache.remove('loginfail_' + id);

    return { ok: true, name: row.name };
  } finally {
    lock.releaseLock();
  }
}

function handleGetPoints_(ctx, body) {
  var id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  var row = findStudentRow_(ctx.students, id);
  if (!row) return { ok: false, error: 'not_found' };
  var apologyBonusAwarded = maybeGrantApologyBonus_(ctx, row);
  var pendingItems = takePendingItemGrants_(ctx, id);
  return {
    ok: true, points: row.points, level: row.level, exp: row.exp, grade: row.grade, prefectureCount: row.prefectureCount,
    avatar: row.avatar, pendingItems: pendingItems, apologyBonusAwarded: apologyBonusAwarded,
    items: row.items, rareCollected: row.rareCollected, rareDefeats: row.rareDefeats, thinkerMilestone: row.thinkerMilestone, hp: row.hp,
    worldLap: row.worldLap, worldLapStartLevel: row.worldLapStartLevel, worldBossDefeated: row.worldBossDefeated, worldAllies: row.worldAllies
  };
}

function handleLog_(ctx, body) {
  var id = String(body.id || '').trim();
  var category = String(body.category || '');
  var correct = !!body.correct;
  if (!id || !category) return { ok: false, error: 'missing_fields' };

  var row = findStudentRow_(ctx.students, id);
  if (!row) return { ok: false, error: 'not_found' };

  ctx.records.appendRow([new Date(), id, row.name, category, correct]);
  var newRow = ctx.records.getLastRow();
  ctx.records.getRange(newRow, 2).setNumberFormat('@').setValue(id);

  if (correct) {
    ctx.students.getRange(row.rowIndex, 19).setValue(row.loggedCorrectCount + 1);
  }

  // 本日のランキングは、以前はRecordsシート全体(数十万行規模)を毎回スキャンして
  // 集計していたため表示が遅かった。ここで正解のたびに「今日の正解数/出題数」を
  // その場で加算しておくことで、ランキング表示時はStudentsシートを読むだけで済むようにする。
  var today = dateKeyTokyo_(new Date());
  var stats = (row.todayStats && row.todayStats.date === today) ? row.todayStats : { date: today, correct: 0, total: 0 };
  stats.total++;
  if (correct) stats.correct++;
  ctx.students.getRange(row.rowIndex, 20).setValue(JSON.stringify(stats));

  return { ok: true };
}

// handleLog_を1問ずつ呼ぶと、生徒がたくさん解くほどApps Scriptの実行回数(同時実行枠)を
// 大量に消費してしまう。クライアント側で数秒分まとめてキューイングし、まとめて1回の
// 実行でRecordsシートへ書き込む(実行回数を大幅に削減する)。
function handleLogBatch_(ctx, body) {
  var id = String(body.id || '').trim();
  var entries = Array.isArray(body.entries) ? body.entries : [];
  if (!id || entries.length === 0) return { ok: false, error: 'missing_fields' };

  var row = findStudentRow_(ctx.students, id);
  if (!row) return { ok: false, error: 'not_found' };

  var today = dateKeyTokyo_(new Date());
  var stats = (row.todayStats && row.todayStats.date === today) ? row.todayStats : { date: today, correct: 0, total: 0 };
  var rows = [];
  var correctCount = 0;
  var now = new Date();
  for (var i = 0; i < entries.length; i++) {
    var category = String((entries[i] && entries[i].category) || '');
    if (!category) continue;
    var correct = !!(entries[i] && entries[i].correct);
    rows.push([now, id, row.name, category, correct]);
    if (correct) correctCount++;
    stats.total++;
    if (correct) stats.correct++;
  }
  if (rows.length === 0) return { ok: true };

  var startRow = ctx.records.getLastRow() + 1;
  // 先頭0埋けのIDが数値化されて消えないよう、書き込み前にID列を文字列書式にする
  // (handleLog_の単発appendRowと同じ理由)。
  ctx.records.getRange(startRow, 2, rows.length, 1).setNumberFormat('@');
  ctx.records.getRange(startRow, 1, rows.length, 5).setValues(rows);

  if (correctCount > 0) {
    ctx.students.getRange(row.rowIndex, 19).setValue(row.loggedCorrectCount + correctCount);
  }
  ctx.students.getRange(row.rowIndex, 20).setValue(JSON.stringify(stats));

  return { ok: true, logged: rows.length };
}

function dateKeyTokyo_(d) {
  return Utilities.formatDate(new Date(d), 'Asia/Tokyo', 'yyyy-MM-dd');
}

// 47都道府県制覇ボーナス: 8月31日まで、初めて47/47を達成したタイミングで
// +300MPを自動付与する（クライアントの自己申告を信用せず、サーバー側で
// 「前回はまだ47未満だったか」を見て一度だけ付与する）。
var PREFECTURE_BONUS_MP = 300;
var PREFECTURE_BONUS_DEADLINE = '2026-08-31';
function isWithinPrefectureBonusWindow_() {
  return dateKeyTokyo_(new Date()) <= PREFECTURE_BONUS_DEADLINE;
}

// ログアウト時にアイテム・レアキャラ図鑑が消えてしまう不具合のお詫びとして、
// 2026-07-31〜2026-08-02の間にログイン/再開した生徒へ一度だけ+300MPを付与する。
var APOLOGY_BONUS_MP = 300;
var APOLOGY_BONUS_START = '2026-07-30';
var APOLOGY_BONUS_END = '2026-08-01';
function isWithinApologyBonusWindow_() {
  var today = dateKeyTokyo_(new Date());
  return today >= APOLOGY_BONUS_START && today <= APOLOGY_BONUS_END;
}
// 対象の生徒行にまだ未付与なら+300MPして記録し、実際に付与した額(0 or 300)を返す。
function maybeGrantApologyBonus_(ctx, row) {
  if (!isWithinApologyBonusWindow_() || row.apologyBonusGrantedAt) return 0;
  var newPoints = row.points + APOLOGY_BONUS_MP;
  ctx.students.getRange(row.rowIndex, 7).setValue(newPoints);
  ctx.students.getRange(row.rowIndex, 14).setValue(new Date());
  row.points = newPoints;
  row.apologyBonusGrantedAt = new Date();
  return APOLOGY_BONUS_MP;
}

function handleHistory_(ctx, body) {
  var id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };

  var row = findStudentRow_(ctx.students, id);
  if (!row) return { ok: false, error: 'not_found' };

  var data = ctx.records.getDataRange().getValues();
  var byCategory = {};
  var byDate = {};
  var total = 0, correct = 0;
  var recent = [];

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim() !== id) continue;
    var cat = data[i][3];
    var isCorrect = !!data[i][4];
    total++;
    if (isCorrect) correct++;
    if (!byCategory[cat]) byCategory[cat] = { category: cat, total: 0, correct: 0 };
    byCategory[cat].total++;
    if (isCorrect) byCategory[cat].correct++;

    var dKey = dateKeyTokyo_(data[i][0]);
    if (!byDate[dKey]) byDate[dKey] = { date: dKey, total: 0, correct: 0 };
    byDate[dKey].total++;
    if (isCorrect) byDate[dKey].correct++;

    recent.push({ timestamp: data[i][0], category: cat, correct: isCorrect });
  }

  recent.sort(function (a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });
  recent = recent.slice(0, 30);

  var todayKey = dateKeyTokyo_(new Date());
  var streak = 0;
  var cursor = new Date();
  if (!byDate[todayKey]) cursor.setDate(cursor.getDate() - 1);
  while (byDate[dateKeyTokyo_(cursor)]) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return {
    ok: true,
    name: row.name,
    total: total,
    correct: correct,
    byCategory: Object.keys(byCategory).map(function (k) { return byCategory[k]; }),
    byDate: Object.keys(byDate).map(function (k) { return byDate[k]; }),
    streak: streak,
    recent: recent
  };
}

// クライアントから送られてくるpoints/level/expを無条件に信用すると、ブラウザの
// localStorageを直接書き換えるだけで無制限に値を水増しできてしまう(実際に、作成
// 4日後のアカウントがlevel1507/exp15060/MP27300を主張していたが、記録されている
// 正解数からはlevel946程度が上限という不整合が見つかった)。
//
// EXPには本来1日あたりの上限が無い(何連勝しても際限なく増える設計)ため、最初は
// 「1日あたりの上限」でEXPもクランプしていたが、これは間違いだった。全く同じくらいの
// アカウント年齢・正解数を持つ2人の生徒を比較したところ、非常に活発な生徒(00025)は
// 正解数に対してMPは低い比率(0.18MP/問)だった一方、不正の疑いがある生徒(00124)は
// 正解数に対してMPが極端に高い比率(2.89MP/問)だった。つまり:
//   - EXPは「実際に記録されている正解数」からしか上限を決められない(日数ベースだと
//     熱心な生徒を誤って締め出してしまう)。
//   - MPは1日100MPというアプリ自身の設計上の上限があるため、引き続き日数ベースで
//     妥当(ただしダブルorハーフによる倍増や各種一時ボーナスを考慮し、バッファは
//     余裕を持たせる)。
var EXP_LOG_BUFFER_MULTIPLIER_ = 1.4; // 記録されている正解数から達成可能なEXPの上限に、通信エラー等でログに残らなかった分も見込んで4割上乗せ
var EXP_LOG_BUFFER_FLAT_ = 500; // 正解数がまだ少ない新規アカウントのための最低保証分
var POINTS_DAILY_CAP_ = 100; // クライアント側のPOINTS_DAILY_CAPと同じ値
var POINTS_BONUS_BUFFER_ = 2500; // お詫び300MP・都道府県制覇300MP・ミッション・ダブルorハーフの倍増運等をまとめて許容する上乗せ分
// loggedCorrectCountは新しく追加した列のため、導入時は既存の生徒全員をRecordsシートから
// 一括バックフィル(debugBackfillLoggedCorrectCounts、実施済み)した後にこのフラグを有効化した。
var EXP_CLAMP_ENABLED_ = true;
function plausibilityCeilings_(row) {
  var now = new Date();
  var daysSinceCreation = row.createdAt
    ? Math.max(1, Math.ceil((now.getTime() - new Date(row.createdAt).getTime()) / (1000 * 60 * 60 * 24)))
    : 1;
  var maxAchievableExp = Math.floor((Number(row.loggedCorrectCount) || 0) / 10) * 10;
  return {
    maxExp: EXP_CLAMP_ENABLED_ ? (maxAchievableExp * EXP_LOG_BUFFER_MULTIPLIER_ + EXP_LOG_BUFFER_FLAT_) : Infinity,
    maxPoints: daysSinceCreation * POINTS_DAILY_CAP_ + POINTS_BONUS_BUFFER_,
  };
}

// 世界制覇(大陸ボーナス)：都道府県制覇ボーナスと同じ考え方で、クライアントの自己申告
// (継続リスト等)を信用せず、サーバー側で保持しているlevelから導出した「制覇済み国数」の
// 遷移(前回のlevel→今回のlevel)だけを見て、大陸の制覇をまたいだ場合にのみ一度だけ+500MPを
// 付与する。新しい永続フィールドを増やさずに済むうえ、levelは既に妥当性チェック済みなので
// 改ざんの心配もない。
var WORLD_DATA_LENGTH_ = 100;
var CONTINENT_BONUS_MP_ = 500;
var CONTINENT_DEFS_ = [
  { id: 'asia', maxCode: 66 }, // 東アジア(1-6)+中東(47-55)+南アジア(56-66)
  { id: 'europe', maxCode: 28 }, // ヨーロッパ(7-28)
  { id: 'africa', maxCode: 46 }, // アフリカ(29-46)
  { id: 'northamerica', maxCode: 80 }, // 北アメリカ(69-80)
  { id: 'southamerica', maxCode: 90 }, // 南アメリカ(81-90)
  { id: 'oceania', maxCode: 100 }, // オセアニア(67-68)+太平洋の島国(91-100)
];
function worldCountForLevel_(level) {
  if (level < 100) return 0;
  return Math.min(WORLD_DATA_LENGTH_, Math.floor((level - 100) / 10) + 1);
}
function continentBonusForTransition_(prevCount, newCount) {
  var bonus = 0;
  for (var i = 0; i < CONTINENT_DEFS_.length; i++) {
    var c = CONTINENT_DEFS_[i];
    if (newCount >= c.maxCode && prevCount < c.maxCode) bonus += CONTINENT_BONUS_MP_;
  }
  return bonus;
}

function handleSyncPoints_(ctx, body) {
  var id = String(body.id || '').trim();
  var points = Number(body.points);
  if (!id || !isFinite(points)) return { ok: false, error: 'missing_fields' };

  var row = findStudentRow_(ctx.students, id);
  if (!row) return { ok: false, error: 'not_found' };
  var ceilings = plausibilityCeilings_(row);

  var bonusAwarded = 0;
  var prefectureBonusAwarded = 0;
  var continentBonusAwarded = 0;
  // 生徒の端末からの通常同期では、今サーバーに保存されている値より後退する書き込みは
  // 行わない(大きい方を採用する)。ログイン直後、端末とサーバーの値を揃える処理が完了する
  // 前に1問正解してしまうと、まだ古いローカルの値が送られてきて、先生による直接修正等を
  // 巻き戻してしまう事故が起きていたため。先生による直接修正(シートを直接書き換える別
  // ルート)はこの制限を経由しないので、不正発覚時に値を減らす操作は引き続き可能。
  if (body.prefectureCount !== undefined) {
    var prefectureCount = Math.max(0, Math.min(47, Math.floor(Number(body.prefectureCount)) || 0));
    if (prefectureCount === 47 && row.prefectureCount < 47 && isWithinPrefectureBonusWindow_()) {
      prefectureBonusAwarded = PREFECTURE_BONUS_MP;
      bonusAwarded += prefectureBonusAwarded;
    }
    ctx.students.getRange(row.rowIndex, 12).setValue(Math.max(prefectureCount, row.prefectureCount));
  }

  var rawExp = null, clampedExp = null, rawLevel = null, clampedLevel = null;
  if (body.level !== undefined && body.exp !== undefined) {
    rawExp = Math.max(0, Math.floor(Number(body.exp)) || 0);
    clampedExp = Math.min(rawExp, ceilings.maxExp);
    rawLevel = Math.max(1, Math.floor(Number(body.level)) || 1);
    clampedLevel = Math.max(1, Math.min(rawLevel, Math.floor(clampedExp / 10) + 1));
    continentBonusAwarded = continentBonusForTransition_(worldCountForLevel_(row.level), worldCountForLevel_(clampedLevel));
    bonusAwarded += continentBonusAwarded;
    var levelExpIsBehind = clampedLevel < row.level || (clampedLevel === row.level && clampedExp < row.exp);
    var finalLevel = levelExpIsBehind ? row.level : clampedLevel;
    var finalExp = levelExpIsBehind ? row.exp : clampedExp;
    ctx.students.getRange(row.rowIndex, 9, 1, 2).setValues([[finalLevel, finalExp]]);
  }

  var rawPoints = Math.max(0, Math.floor(points));
  var clampedPoints = Math.min(rawPoints, ceilings.maxPoints);
  ctx.students.getRange(row.rowIndex, 7).setValue(Math.max(clampedPoints, row.points) + bonusAwarded);

  // 実際にクランプが発動した(=送られてきた値が現実的な上限を超えていた)場合のみ、
  // 先生がいつでも確認できるよう監査ログへ記録する。通常の同期では何も記録されない。
  var pointsWasClamped = rawPoints > clampedPoints;
  var expWasClamped = rawExp !== null && rawExp > clampedExp;
  if ((pointsWasClamped || expWasClamped) && ctx.anomalyLog) {
    ctx.anomalyLog.appendRow([
      new Date(), id, row.name,
      rawPoints, clampedPoints,
      rawExp === null ? '' : rawExp, clampedExp === null ? '' : clampedExp,
      rawLevel === null ? '' : rawLevel, clampedLevel === null ? '' : clampedLevel
    ]);
  }

  // アイテム・図鑑(rareCollected)・レアキャラ撃破回数(rareDefeats)・考えるAKRの
  // 出現状態(thinkerMilestone)もサーバーへ保存し、同じIDを複数端末で使っても
  // 端末間で図鑑・アイテムがズレないようにする。points/level/expと同じ理由(端末側の
  // 同期がまだ古い状態のまま送られてくる事故)により、こちらも今の保存値との和集合・
  // 最大値でマージし、後退する書き込みは行わない。
  if (body.items !== undefined) {
    var submittedItems = Array.isArray(body.items) ? body.items : [];
    var mergedItems = row.items.slice();
    submittedItems.forEach(function (itemId) { if (mergedItems.indexOf(itemId) === -1) mergedItems.push(itemId); });
    ctx.students.getRange(row.rowIndex, 15).setValue(JSON.stringify(mergedItems));
  }
  if (body.rareCollected !== undefined) {
    var submittedRareCollected = Array.isArray(body.rareCollected) ? body.rareCollected : [];
    var mergedRareCollected = row.rareCollected.slice();
    submittedRareCollected.forEach(function (rid) { if (mergedRareCollected.indexOf(rid) === -1) mergedRareCollected.push(rid); });
    ctx.students.getRange(row.rowIndex, 16).setValue(JSON.stringify(mergedRareCollected));
  }
  if (body.rareDefeats !== undefined) {
    var submittedRareDefeats = (body.rareDefeats && typeof body.rareDefeats === 'object') ? body.rareDefeats : {};
    var mergedRareDefeats = Object.assign({}, row.rareDefeats);
    Object.keys(submittedRareDefeats).forEach(function (k) {
      var sv = Number(submittedRareDefeats[k]) || 0;
      if (sv > (Number(mergedRareDefeats[k]) || 0)) mergedRareDefeats[k] = sv;
    });
    ctx.students.getRange(row.rowIndex, 17).setValue(JSON.stringify(mergedRareDefeats));
  }
  if (body.thinkerMilestone !== undefined) {
    var thinkerRank_ = function (v) { return v === 1000 ? 2 : v === 100 ? 1 : 0; };
    var finalThinkerMilestone = thinkerRank_(body.thinkerMilestone) > thinkerRank_(row.thinkerMilestone) ? body.thinkerMilestone : row.thinkerMilestone;
    ctx.students.getRange(row.rowIndex, 18).setValue(finalThinkerMilestone || '');
  }
  if (body.hp !== undefined) {
    // HPは文章題の正解で増える一方、世界一周のボス戦で不正解になると減ることもある
    // ため、他の項目と違って「大きい方を採用」ではなく送られてきた値をそのまま
    // 採用する(最後に同期した端末の値が正)。
    var submittedHp = Math.max(0, Math.floor(Number(body.hp)) || 0);
    ctx.students.getRange(row.rowIndex, 21).setValue(submittedHp);
  }
  if (body.worldLap !== undefined && body.worldLapStartLevel !== undefined) {
    var submittedWorldLap = Math.max(1, Math.floor(Number(body.worldLap)) || 1);
    var submittedWorldLapStartLevel = Math.max(100, Math.floor(Number(body.worldLapStartLevel)) || 100);
    var currentWorldLap = Number(row.worldLap) || 1;
    if (submittedWorldLap > currentWorldLap) {
      // 周が進んだ(2周目突入等): 新しい周の情報を採用し、ボス撃破状況もリセットする。
      ctx.students.getRange(row.rowIndex, 23).setValue(submittedWorldLap);
      ctx.students.getRange(row.rowIndex, 24).setValue(submittedWorldLapStartLevel);
      if (body.worldBossDefeated !== undefined) {
        ctx.students.getRange(row.rowIndex, 25).setValue(JSON.stringify((body.worldBossDefeated && typeof body.worldBossDefeated === 'object') ? body.worldBossDefeated : {}));
      }
    } else if (submittedWorldLap === currentWorldLap && body.worldBossDefeated !== undefined) {
      var submittedWorldBossDefeated = (body.worldBossDefeated && typeof body.worldBossDefeated === 'object') ? body.worldBossDefeated : {};
      var mergedWorldBossDefeated = Object.assign({}, row.worldBossDefeated);
      Object.keys(submittedWorldBossDefeated).forEach(function (k) {
        if (submittedWorldBossDefeated[k]) mergedWorldBossDefeated[k] = true;
      });
      ctx.students.getRange(row.rowIndex, 25).setValue(JSON.stringify(mergedWorldBossDefeated));
    }
  }
  if (body.worldAllies !== undefined) {
    var submittedWorldAllies = Array.isArray(body.worldAllies) ? body.worldAllies : [];
    var mergedWorldAllies = row.worldAllies.slice();
    submittedWorldAllies.forEach(function (code) { if (mergedWorldAllies.indexOf(code) === -1) mergedWorldAllies.push(code); });
    ctx.students.getRange(row.rowIndex, 26).setValue(JSON.stringify(mergedWorldAllies));
  }

  return { ok: true, bonusAwarded: bonusAwarded, prefectureBonusAwarded: prefectureBonusAwarded, continentBonusAwarded: continentBonusAwarded };
}


// アバター作成はレベル300以上またはMP10000以上で解放される。
// クライアントの申告を信用せず、サーバー側の実際のレベル・MPで検証する。
function handleSaveAvatar_(ctx, body) {
  var id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_fields' };

  var row = findStudentRow_(ctx.students, id);
  if (!row) return { ok: false, error: 'not_found' };
  if (row.level < 300 && row.points < 10000) return { ok: false, error: 'not_unlocked' };

  var sel = body.avatar;
  if (!sel || typeof sel !== 'object') return { ok: false, error: 'invalid_avatar' };
  var keys = ['hair', 'face', 'skin', 'hairColor', 'outfitColor'];
  var clean = {};
  for (var i = 0; i < keys.length; i++) {
    var v = String(sel[keys[i]] || '').trim();
    if (!/^[a-zA-Z0-9]{1,20}$/.test(v)) return { ok: false, error: 'invalid_avatar' };
    clean[keys[i]] = v;
  }

  ctx.students.getRange(row.rowIndex, 13).setValue(JSON.stringify(clean));
  return { ok: true };
}

// ランキングには実名を出さず、idから決定的に生成した名前を表示する
var NICK_PREFIX_ = ['天使', '黒龍', '紅蓮', '氷炎', '聖なる', '漆黒', '閃光', '深淵', '疾風', '不滅', '黄金', '蒼き', '爆炎', '幻影', '雷鳴', '白銀', '真紅', '暗黒', '光輝', '無限'];
var NICK_SUFFIX_ = ['の翼', 'の刃', 'の心臓', 'の意志', 'の記憶', 'の使者', 'の守護者', 'の覇者', 'の騎士', 'の魂', 'の瞳', 'の牙', 'の王', 'の戦士', 'の炎', 'の氷', 'の雷', 'の影', 'の光', 'の剣'];

function hashStr_(s) {
  var h = 0;
  for (var i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function nicknameForId_(id) {
  var h = hashStr_(String(id));
  var prefix = NICK_PREFIX_[h % NICK_PREFIX_.length];
  var suffix = NICK_SUFFIX_[Math.floor(h / NICK_PREFIX_.length) % NICK_SUFFIX_.length];
  return prefix + suffix;
}

// ランキング上の学年表示。ID 00001(先生の管理用アカウント)だけは
// 実際の学年(中3、defaultEnabledIds等の内部処理用)ではなく「先生」と表示する。
function displayGradeForId_(id, grade) {
  return String(id).trim() === '00001' ? '先生' : grade;
}

// 上位50位のリストとは別に、自分の順位を中心とした前後3位(計最大7件)を返す。
// 自分が上位50位に入っていない場合でも、自分の順位が分かるようにするため。
function buildNearbyRanking_(rows, myId, mapFn) {
  var myIndex = -1;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].id === myId) { myIndex = i; break; }
  }
  if (myIndex === -1) return [];
  var start = Math.max(0, myIndex - 3);
  var end = Math.min(rows.length, myIndex + 4);
  var out = [];
  for (var j = start; j < end; j++) {
    out.push(mapFn(rows[j], j));
  }
  return out;
}

function handleRanking_(ctx, body) {
  var myId = String(body.id || '').trim();
  var data = ctx.students.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var id = String(data[i][0]).trim();
    if (!id) continue;
    var level = Number(data[i][8]) || 1;
    var exp = Number(data[i][9]) || 0;
    var grade = data[i][5] || '';
    rows.push({ id: id, level: level, exp: exp, grade: grade });
  }
  rows.sort(function (a, b) {
    if (b.level !== a.level) return b.level - a.level;
    return b.exp - a.exp;
  });
  var mapFn = function (r, idx) {
    return { rank: idx + 1, nickname: nicknameForId_(r.id), level: r.level, exp: r.exp, grade: displayGradeForId_(r.id, r.grade), isYou: r.id === myId };
  };
  var top = rows.slice(0, 50).map(mapFn);
  var nearby = buildNearbyRanking_(rows, myId, mapFn);
  return { ok: true, ranking: top, nearby: nearby };
}

// 学年ごとのレベル(経験値)ランキング。リクエストした生徒と同じ学年の中だけで
// 上位30位+自分の順位(前後3位)を返す。
function handleRankingGrade_(ctx, body) {
  var myId = String(body.id || '').trim();
  var myRow = findStudentRow_(ctx.students, myId);
  if (!myRow) return { ok: false, error: 'not_found' };
  var myGrade = myRow.grade;
  var data = ctx.students.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var id = String(data[i][0]).trim();
    if (!id) continue;
    var grade = data[i][5] || '';
    if (grade !== myGrade) continue;
    var level = Number(data[i][8]) || 1;
    var exp = Number(data[i][9]) || 0;
    rows.push({ id: id, level: level, exp: exp, grade: grade });
  }
  rows.sort(function (a, b) {
    if (b.level !== a.level) return b.level - a.level;
    return b.exp - a.exp;
  });
  var mapFn = function (r, idx) {
    return { rank: idx + 1, nickname: nicknameForId_(r.id), level: r.level, exp: r.exp, grade: displayGradeForId_(r.id, r.grade), isYou: r.id === myId };
  };
  var top = rows.slice(0, 30).map(mapFn);
  var nearby = buildNearbyRanking_(rows, myId, mapFn);
  return { ok: true, grade: myGrade, ranking: top, nearby: nearby };
}

// 本日（日本時間）の正解数ランキング。以前はRecordsシート全体(数十万行規模)を毎回
// スキャンしていて表示が遅かったため、handleLog_が正解のたびに加算しているStudents
// シートの「今日の正解数/出題数」列を読むだけで済むように変更した。
function handleRankingToday_(ctx, body) {
  var myId = String(body.id || '').trim();
  var todayKey = dateKeyTokyo_(new Date());
  var sdata = ctx.students.getDataRange().getValues();
  var rows = [];
  for (var j = 1; j < sdata.length; j++) {
    var id = String(sdata[j][0]).trim();
    if (!id) continue;
    var stats = parseJsonCell_(sdata[j][19], null);
    if (!stats || stats.date !== todayKey || !stats.total) continue;
    rows.push({ id: id, correct: Number(stats.correct) || 0, total: Number(stats.total) || 0, grade: sdata[j][5] || '' });
  }
  rows.sort(function (a, b) {
    if (b.correct !== a.correct) return b.correct - a.correct;
    return b.total - a.total;
  });
  var top = rows.slice(0, 50).map(function (r, idx) {
    return { rank: idx + 1, nickname: nicknameForId_(r.id), correct: r.correct, total: r.total, grade: displayGradeForId_(r.id, r.grade), isYou: r.id === myId };
  });
  return { ok: true, ranking: top };
}

// MP(ポイント)ランキング。全員が閲覧可能。
function handleRankingPoints_(ctx, body) {
  var myId = String(body.id || '').trim();
  var data = ctx.students.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var id = String(data[i][0]).trim();
    if (!id) continue;
    var points = Number(data[i][6]) || 0;
    var grade = data[i][5] || '';
    rows.push({ id: id, points: points, grade: grade });
  }
  rows.sort(function (a, b) { return b.points - a.points; });
  var mapFn = function (r, idx) {
    return { rank: idx + 1, nickname: nicknameForId_(r.id), points: r.points, grade: displayGradeForId_(r.id, r.grade), isYou: r.id === myId };
  };
  var top = rows.slice(0, 50).map(mapFn);
  var nearby = buildNearbyRanking_(rows, myId, mapFn);
  return { ok: true, ranking: top, nearby: nearby };
}

// HPランキング。全員が閲覧可能。
function handleRankingHp_(ctx, body) {
  var myId = String(body.id || '').trim();
  var data = ctx.students.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var id = String(data[i][0]).trim();
    if (!id) continue;
    var hp = Number(data[i][20]) || 0;
    var grade = data[i][5] || '';
    rows.push({ id: id, hp: hp, grade: grade });
  }
  rows.sort(function (a, b) { return b.hp - a.hp; });
  var mapFn = function (r, idx) {
    return { rank: idx + 1, nickname: nicknameForId_(r.id), hp: r.hp, grade: displayGradeForId_(r.id, r.grade), isYou: r.id === myId };
  };
  var top = rows.slice(0, 50).map(mapFn);
  var nearby = buildNearbyRanking_(rows, myId, mapFn);
  return { ok: true, ranking: top, nearby: nearby };
}

// チャレンジ問題正解数ランキング(累計、小学部/中学部を分けて集計)。0件(未提出)の
// 生徒はランキングに含めない。
function handleChallengeRanking_(ctx, body) {
  var myId = String(body.id || '').trim();
  var data = ctx.students.getDataRange().getValues();
  var elementary = [], middle = [];
  for (var i = 1; i < data.length; i++) {
    var id = String(data[i][0]).trim();
    if (!id) continue;
    var total = Number(data[i][27]) || 0;
    if (total <= 0) continue;
    var grade = data[i][5] || '';
    var entry = { id: id, total: total, grade: grade };
    if (String(grade).charAt(0) === '中') middle.push(entry);
    else if (String(grade).charAt(0) === '小') elementary.push(entry);
  }
  elementary.sort(function (a, b) { return b.total - a.total; });
  middle.sort(function (a, b) { return b.total - a.total; });
  var mapFn = function (r, idx) {
    return { rank: idx + 1, nickname: nicknameForId_(r.id), total: r.total, grade: displayGradeForId_(r.id, r.grade), isYou: r.id === myId };
  };
  return {
    ok: true,
    elementary: elementary.slice(0, 30).map(mapFn),
    elementaryNearby: buildNearbyRanking_(elementary, myId, mapFn),
    middle: middle.slice(0, 30).map(mapFn),
    middleNearby: buildNearbyRanking_(middle, myId, mapFn)
  };
}

function handleRegisterGuardian_(ctx, body) {
  var guardianName = String(body.guardianName || '').trim();
  var children = Array.isArray(body.children) ? body.children : [];
  if (!guardianName || children.length === 0 || children.length > 4) {
    return { ok: false, error: 'missing_fields' };
  }

  var cache = CacheService.getScriptCache();
  for (var i = 0; i < children.length; i++) {
    var c = children[i];
    var childId = String((c && c.id) || '').trim();
    var childPassword = String((c && c.password) || '');
    if (!childId || !childPassword) return { ok: false, error: 'missing_fields', index: i };

    var attemptKey = 'loginfail_' + childId;
    if ((Number(cache.get(attemptKey)) || 0) >= LOGIN_MAX_ATTEMPTS) {
      return { ok: false, error: 'child_locked', index: i, retryAfterMinutes: Math.ceil(LOGIN_LOCK_SECONDS / 60) };
    }

    var row = findStudentRow_(ctx.students, childId);
    if (!row || !row.passwordHash) return { ok: false, error: 'child_mismatch', index: i };
    var hash = sha256Hex_(childPassword + row.salt);
    if (hash !== row.passwordHash) {
      var attempts = (Number(cache.get(attemptKey)) || 0) + 1;
      cache.put(attemptKey, String(attempts), LOGIN_LOCK_SECONDS);
      return { ok: false, error: 'child_mismatch', index: i };
    }
  }
  children.forEach(function (c) { cache.remove('loginfail_' + String(c.id).trim()); });

  var rowValues = [new Date(), guardianName];
  for (var j = 0; j < 4; j++) {
    if (j < children.length) {
      rowValues.push(String(children[j].id).trim());
      rowValues.push(String(children[j].name || '').trim());
    } else {
      rowValues.push('', '');
    }
  }
  ctx.guardians.appendRow(rowValues);

  return { ok: true };
}

// 在庫プールから未使用コードを1件取得して使用済みにする（呼び出し側でロック済みが前提）。
// 見つからなければnullを返す。
function claimGiftCode_(ctx, itemId, studentId) {
  var data = ctx.giftCodes.getDataRange().getValues();
  var claimedRow = -1;
  var code = null;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() !== itemId) continue;
    var status = String(data[i][2] || '').trim().toLowerCase();
    if (status === 'used') continue;
    claimedRow = i + 1;
    code = data[i][1];
    break;
  }
  if (claimedRow === -1) return null;

  ctx.giftCodes.getRange(claimedRow, 3, 1, 3).setValues([['used', studentId, new Date()]]);

  var remaining = 0;
  for (var j = 1; j < data.length; j++) {
    if (String(data[j][0]).trim() !== itemId) continue;
    if (j + 1 === claimedRow) continue; // 今取得した分は除く
    var st = String(data[j][2] || '').trim().toLowerCase();
    if (st !== 'used') remaining++;
  }

  return { code: code, remainingStock: remaining };
}

function handleRedeemGift_(ctx, body) {
  var id = String(body.id || '').trim();
  var itemId = String(body.itemId || '').trim();
  if (!id || !itemId) return { ok: false, error: 'missing_fields' };
  if (!isInExchangeWindow_()) return { ok: false, error: 'out_of_period', windowText: EXCHANGE_WINDOW_TEXT };

  var item = null;
  for (var i = 0; i < GIFT_CATALOG.length; i++) {
    if (GIFT_CATALOG[i].itemId === itemId) { item = GIFT_CATALOG[i]; break; }
  }
  if (!item) return { ok: false, error: 'unknown_item' };

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var row = findStudentRow_(ctx.students, id);
    if (!row) return { ok: false, error: 'not_found' };
    if (row.points < item.mp) return { ok: false, error: 'insufficient_points' };

    var claimed = claimGiftCode_(ctx, itemId, id);
    if (!claimed) {
      notifyAdminOfOutOfStock_(id, row.name, item);
      return { ok: false, error: 'out_of_stock' };
    }

    var remaining = row.points - item.mp;
    ctx.students.getRange(row.rowIndex, 7).setValue(remaining);
    ctx.gifts.appendRow([new Date(), id, row.name, item.label, item.yen, item.mp, '発行済み', claimed.code]);
    notifyAdminOfGiftDelivery_(id, row.name, item, claimed.remainingStock);
    if (LOW_STOCK_THRESHOLDS.indexOf(claimed.remainingStock) !== -1) {
      notifyAdminOfLowStock_(item, claimed.remainingStock);
    }

    return { ok: true, remainingPoints: remaining, code: claimed.code, itemLabel: item.label };
  } finally {
    lock.releaseLock();
  }
}

// Apps Scriptエディタの関数選択ドロップダウンから「authorizeDriveAccessOnce」を選んで
// 「実行」ボタンを押すと、ドライブへの書き込み許可を求めるダイアログが表示される。
// 一度承認すれば、以降はこの関数を呼ぶ必要はない（この関数自体はテスト提出機能からは
// 呼ばれない、手動承認専用のヘルパー）。
function authorizeDriveAccessOnce() {
  var folder = getOrCreateTestPhotoFolder_();
  Logger.log('OK: ' + folder.getName() + ' (' + folder.getUrl() + ')');
}

function getOrCreateTestPhotoFolder_() {
  var folders = DriveApp.getFoldersByName(TEST_PHOTO_DRIVE_FOLDER_NAME_);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(TEST_PHOTO_DRIVE_FOLDER_NAME_);
}

function saveTestPhotoToDrive_(id, imageBase64, mimeType) {
  var folder = getOrCreateTestPhotoFolder_();
  var bytes = Utilities.base64Decode(imageBase64);
  var ext = mimeType === 'image/png' ? '.png' : '.jpg';
  var blob = Utilities.newBlob(bytes, mimeType, id + '_' + Date.now() + ext);
  var file = folder.createFile(blob);
  return file.getId();
}

// 本日(日本時間)にこの生徒がペナテスト/抜き打ちテストで既に獲得したMPの合計。
// TestPhotosシートは提出のたびに1〜2行しか増えない(Recordsシートのような大量スキャンには
// ならない)ため、毎回全件スキャンしても問題にならない。
function sumPenaPointsToday_(ctx, id, today) {
  var data = ctx.testPhotos.getDataRange().getValues();
  var sum = 0;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim() !== id) continue;
    if (data[i][3] !== 'pena') continue;
    var ts = data[i][0];
    if (!(ts instanceof Date) || dateKeyTokyo_(ts) !== today) continue;
    sum += Number(data[i][5]) || 0;
  }
  return sum;
}

function monthKeyTokyo_(d) {
  return Utilities.formatDate(new Date(d), 'Asia/Tokyo', 'yyyy-MM');
}

// その週(月曜始まり、日本時間)の月曜日をyyyy-MM-dd形式で返す。スクリプトのタイムゾーンは
// Asia/Tokyo(appsscript.json)に設定済みのため、Dateのローカルメソッドはそのまま日本時間
// として扱える。
function mondayKeyTokyo_(d) {
  var date = new Date(d);
  var day = date.getDay(); // 0=日,1=月,...,6=土
  var diff = (day === 0) ? -6 : (1 - day);
  var monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() + diff);
  return Utilities.formatDate(monday, 'Asia/Tokyo', 'yyyy-MM-dd');
}

// 100マス計算チャレンジ/チャレンジ問題の、その週(weekKey)の提出回数。TestPhotosシートは
// 提出頻度が低く件数も少ないため(sumPenaPointsToday_と同様)、毎回全件スキャンしても
// 問題にならない。
function countSubmittedTestPhotoThisWeek_(ctx, id, testType, weekKey) {
  var data = ctx.testPhotos.getDataRange().getValues();
  var count = 0;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim() !== id) continue;
    if (data[i][3] !== testType) continue;
    var ts = data[i][0];
    if (!(ts instanceof Date)) continue;
    if (mondayKeyTokyo_(ts) === weekKey) count++;
  }
  return count;
}

// 週替わりクイズにこの生徒が既にその週回答済みかどうか。WeeklyQuizシートも提出頻度が
// 低いため全件スキャンで問題ない。
function hasAnsweredWeeklyQuiz_(ctx, id, weekKey) {
  var data = ctx.weeklyQuiz.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim() !== id) continue;
    if (String(data[i][4]) !== weekKey) continue;
    return true;
  }
  return false;
}

// 3週間(TEST_PHOTO_RETENTION_DAYS_)を過ぎた提出をドライブ・シートの両方から削除する。
// 定期実行トリガーは設置の手間(手動認証)が要るため使わず、提出のたびに毎回チェックする
// 遅延クリーンアップ方式にしている。提出頻度は低いため十分間に合う想定。
function cleanupExpiredTestPhotos_(ctx) {
  var data = ctx.testPhotos.getDataRange().getValues();
  var now = new Date();
  var rowsToDelete = [];
  for (var i = 1; i < data.length; i++) {
    var expiresAt = data[i][7];
    if (expiresAt instanceof Date && expiresAt < now) {
      var fileId = data[i][6];
      if (fileId) {
        try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) { }
      }
      rowsToDelete.push(i + 1);
    }
  }
  for (var j = rowsToDelete.length - 1; j >= 0; j--) {
    ctx.testPhotos.deleteRow(rowsToDelete[j]);
  }
}

var TEST_PHOTO_TYPES_ = ['pena', 'ranking', 'hyakuMasu', 'challenge'];
// hyakuMasu/challengeは週1回まで(月〜日、日本時間)。
var WEEKLY_LIMITED_TEST_TYPES_ = ['hyakuMasu', 'challenge'];

function handleSubmitTestPhoto_(ctx, body) {
  var id = String(body.id || '').trim();
  var testType = String(body.testType || '').trim();
  var scoreTier = String(body.scoreTier || '').trim();
  var imageBase64 = body.imageBase64;
  var mimeType = String(body.mimeType || 'image/jpeg').trim();
  if (!id || !imageBase64 || TEST_PHOTO_TYPES_.indexOf(testType) === -1) {
    return { ok: false, error: 'missing_fields' };
  }
  if (mimeType !== 'image/jpeg' && mimeType !== 'image/png') mimeType = 'image/jpeg';

  var tier = null;
  if (testType === 'ranking') {
    for (var i = 0; i < RANKING_TEST_TIERS_.length; i++) {
      if (RANKING_TEST_TIERS_[i].id === scoreTier) { tier = RANKING_TEST_TIERS_[i]; break; }
    }
  } else if (testType === 'challenge') {
    for (var ci = 0; ci < CHALLENGE_TEST_TIERS_.length; ci++) {
      if (CHALLENGE_TEST_TIERS_[ci].id === scoreTier) { tier = CHALLENGE_TEST_TIERS_[ci]; break; }
    }
    if (!tier) return { ok: false, error: 'missing_fields' };
  }

  // 事前チェック(ロック不要)：失敗しやすい経路を先に弾いておき、後段のDriveアップロード
  // (ネットワークI/Oで数百ms〜数秒かかる)を無駄にロックの中で待たせないようにする。
  var precheckRow = findStudentRow_(ctx.students, id);
  if (!precheckRow) return { ok: false, error: 'not_found' };
  if (testType === 'ranking' && RANKING_TEST_BLOCKED_GRADES_.indexOf(precheckRow.grade) !== -1) {
    return { ok: false, error: 'elementary_not_allowed' };
  }
  if (testType === 'hyakuMasu' && HYAKUMASU_ALLOWED_GRADES_.indexOf(precheckRow.grade) === -1) {
    return { ok: false, error: 'grade_not_allowed' };
  }
  var currentMonth = monthKeyTokyo_(new Date());
  // ランキングテストは月1回まで。写真自体は3週間で自動削除されるため、TestPhotosの
  // 履歴をスキャンするのではなく、Studentsシートに「最後に提出した月」を別途持たせて
  // 判定する(3週間の保存期限と月1回の制限が食い違わないようにするため)。
  if (testType === 'ranking' && precheckRow.lastRankingTestMonth === currentMonth) {
    return { ok: false, error: 'already_submitted_this_month' };
  }
  var currentWeek = mondayKeyTokyo_(new Date());
  if (WEEKLY_LIMITED_TEST_TYPES_.indexOf(testType) !== -1) {
    var weeklyLimit = weeklySubmitLimitForTestType_(testType, precheckRow.grade);
    if (countSubmittedTestPhotoThisWeek_(ctx, id, testType, currentWeek) >= weeklyLimit) {
      return { ok: false, error: 'already_submitted_this_week' };
    }
  }

  // Driveへの画像アップロードはシートの読み書きと違って時間がかかるため、グローバル
  // ロックを取る前に行う(他の生徒の同時リクエストをここで待たせないため)。
  var driveFileId = saveTestPhotoToDrive_(id, imageBase64, mimeType);

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var result;
  try {
    // ロック外で読んだprecheckRowは古い可能性があるため、ロック内で再取得して確定する
    var row = findStudentRow_(ctx.students, id);
    if (!row) {
      result = { ok: false, error: 'not_found' };
    } else if (testType === 'ranking' && row.lastRankingTestMonth === currentMonth) {
      result = { ok: false, error: 'already_submitted_this_month' };
    } else if (WEEKLY_LIMITED_TEST_TYPES_.indexOf(testType) !== -1 && countSubmittedTestPhotoThisWeek_(ctx, id, testType, currentWeek) >= weeklySubmitLimitForTestType_(testType, row.grade)) {
      result = { ok: false, error: 'already_submitted_this_week' };
    } else {
      var pointsAwarded = 0;
      var tierUsed = '';
      if (testType === 'ranking') {
        if (tier) { pointsAwarded = tier.mp; tierUsed = tier.id; }
        // setNumberFormat('@')を付けないと、"2026-08"のような日付に見える文字列をシートが
        // 自動的に日付型へ変換してしまい、次回の文字列比較(===currentMonth)が常にfalseになって
        // 月1回の制限が効かなくなる不具合があった(生徒IDが数値化されてしまうのと同じ原因)。
        ctx.students.getRange(row.rowIndex, 22).setNumberFormat('@').setValue(currentMonth);
      } else if (testType === 'challenge') {
        pointsAwarded = tier.mp;
        tierUsed = tier.id;
        ctx.students.getRange(row.rowIndex, 28).setValue((row.challengeCorrectTotal || 0) + tier.count);
      } else if (testType === 'hyakuMasu') {
        pointsAwarded = HYAKUMASU_MP_;
      } else {
        var today = dateKeyTokyo_(new Date());
        var todayTotal = sumPenaPointsToday_(ctx, id, today);
        pointsAwarded = Math.max(0, Math.min(PENA_TEST_MP_PER_SHEET_, PENA_TEST_DAILY_CAP_MP_ - todayTotal));
      }

      var newTotalPoints = row.points + pointsAwarded;
      if (pointsAwarded > 0) {
        ctx.students.getRange(row.rowIndex, 7).setValue(newTotalPoints);
      }

      var now = new Date();
      var expiresAt = new Date(now.getTime() + TEST_PHOTO_RETENTION_DAYS_ * 24 * 60 * 60 * 1000);
      ctx.testPhotos.appendRow([now, id, row.name, testType, tierUsed, pointsAwarded, driveFileId, expiresAt]);

      result = { ok: true, pointsAwarded: pointsAwarded, newTotalPoints: newTotalPoints };
    }
  } finally {
    lock.releaseLock();
  }
  // Driveの掲示掃除(期限切れ写真の削除)もネットワークI/Oを伴うため、ロックの外で行う。
  cleanupExpiredTestPhotos_(ctx);
  return result;
}

function handleWeeklyQuizGet_(ctx, body) {
  var id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_fields' };
  var row = findStudentRow_(ctx.students, id);
  if (!row) return { ok: false, error: 'not_found' };

  var special = WEEKLY_QUIZ_.special;
  if (special && special.activeDate === dateKeyTokyo_(new Date())) {
    var specialKey = 'SPECIAL:' + special.activeDate;
    if (hasAnsweredWeeklyQuiz_(ctx, id, specialKey)) {
      return { ok: true, available: false, alreadyAnswered: true, special: true };
    }
    return {
      ok: true, available: true, special: true, label: special.label,
      questions: special.questions.map(function (q) { return { question: q.question, choices: q.choices }; }),
    };
  }

  var currentWeek = mondayKeyTokyo_(new Date());
  if (WEEKLY_QUIZ_.weekKey !== currentWeek) {
    return { ok: true, available: false };
  }
  var quiz = WEEKLY_QUIZ_.byGrade[row.grade];
  if (!quiz) return { ok: true, available: false };

  if (hasAnsweredWeeklyQuiz_(ctx, id, currentWeek)) {
    return { ok: true, available: false, alreadyAnswered: true };
  }
  return { ok: true, available: true, question: quiz.question, choices: quiz.choices };
}

function handleWeeklyQuizAnswer_(ctx, body) {
  var id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_fields' };

  var special = WEEKLY_QUIZ_.special;
  if (special && special.activeDate === dateKeyTokyo_(new Date()) && Array.isArray(body.choiceIndices)) {
    return handleWeeklyQuizSpecialAnswer_(ctx, id, body.choiceIndices, special);
  }

  var choiceIndex = Number(body.choiceIndex);
  if (!isFinite(choiceIndex)) return { ok: false, error: 'missing_fields' };

  var currentWeek = mondayKeyTokyo_(new Date());
  if (WEEKLY_QUIZ_.weekKey !== currentWeek) return { ok: false, error: 'no_quiz' };

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var result;
  try {
    var row = findStudentRow_(ctx.students, id);
    if (!row) {
      result = { ok: false, error: 'not_found' };
    } else {
      var quiz = WEEKLY_QUIZ_.byGrade[row.grade];
      if (!quiz) {
        result = { ok: false, error: 'no_quiz' };
      } else if (hasAnsweredWeeklyQuiz_(ctx, id, currentWeek)) {
        result = { ok: false, error: 'already_answered' };
      } else {
        var correct = (choiceIndex === quiz.correctIndex);
        var delta = correct ? WEEKLY_QUIZ_CORRECT_MP_ : WEEKLY_QUIZ_WRONG_MP_;
        var newPoints = Math.max(0, row.points + delta);
        ctx.students.getRange(row.rowIndex, 7).setValue(newPoints);
        ctx.weeklyQuiz.appendRow([new Date(), id, row.name, row.grade, currentWeek, correct, delta]);
        var newRow = ctx.weeklyQuiz.getLastRow();
        ctx.weeklyQuiz.getRange(newRow, 2).setNumberFormat('@').setValue(id);
        result = { ok: true, correct: correct, pointsDelta: delta, newTotalPoints: newPoints, correctIndex: quiz.correctIndex };
      }
    }
  } finally {
    lock.releaseLock();
  }
  return result;
}

// 1日限定の特別クイズ(2問連続正解のみ加点)の採点。両方の選択肢を同時に受け取り、
// サーバー側で一括採点することで、GASのステートレスな性質でも「1問目だけ正解した状態」
// を保存する必要がないようにしている。
function handleWeeklyQuizSpecialAnswer_(ctx, id, choiceIndices, special) {
  var specialKey = 'SPECIAL:' + special.activeDate;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var result;
  try {
    var row = findStudentRow_(ctx.students, id);
    if (!row) {
      result = { ok: false, error: 'not_found' };
    } else if (hasAnsweredWeeklyQuiz_(ctx, id, specialKey)) {
      result = { ok: false, error: 'already_answered' };
    } else {
      var correct = choiceIndices.length === special.questions.length &&
        special.questions.every(function (q, i) { return Number(choiceIndices[i]) === q.correctIndex; });
      var delta = correct ? WEEKLY_QUIZ_CORRECT_MP_ : WEEKLY_QUIZ_WRONG_MP_;
      var newPoints = Math.max(0, row.points + delta);
      ctx.students.getRange(row.rowIndex, 7).setValue(newPoints);
      ctx.weeklyQuiz.appendRow([new Date(), id, row.name, row.grade, specialKey, correct, delta]);
      var newRow = ctx.weeklyQuiz.getLastRow();
      ctx.weeklyQuiz.getRange(newRow, 2).setNumberFormat('@').setValue(id);
      result = {
        ok: true, correct: correct, pointsDelta: delta, newTotalPoints: newPoints,
        correctIndices: special.questions.map(function (q) { return q.correctIndex; }),
      };
    }
  } finally {
    lock.releaseLock();
  }
  return result;
}
