/**
 * 正負の数トレーニング - 生徒ログイン・学習記録API
 *
 * Students シート: id | name | passwordHash | salt | createdAt | grade | points | guardian | level | exp | lastLogin | prefectureCount | avatar | apologyBonusGrantedAt
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
var LOW_STOCK_THRESHOLDS = [10, 5];

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

  return { ss: ss, students: students, records: records, guardians: guardians, gifts: gifts, giftCodes: giftCodes, itemGrants: itemGrants, anomalyLog: anomalyLog };
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

function findStudentRow_(sheet, id) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(id).trim()) {
      return {
        rowIndex: i + 1, id: data[i][0], name: data[i][1], passwordHash: data[i][2], salt: data[i][3],
        createdAt: data[i][4] || null,
        grade: data[i][5] || '', points: Number(data[i][6]) || 0, guardian: data[i][7] || '',
        level: Number(data[i][8]) || 1, exp: Number(data[i][9]) || 0, lastLogin: data[i][10] || null,
        prefectureCount: Number(data[i][11]) || 0, avatar: data[i][12] || null,
        apologyBonusGrantedAt: data[i][13] || null,
        // items/rareCollected/rareDefeats/thinkerMilestoneは、以前はクライアント側の
        // localStorageのみで管理していたため、同じIDを複数端末で使うと図鑑・アイテムの
        // 状態が端末ごとにズレてしまう不具合があった。サーバー側にも保存・同期する。
        items: parseJsonCell_(data[i][14], []),
        rareCollected: parseJsonCell_(data[i][15], []),
        rareDefeats: parseJsonCell_(data[i][16], {}),
        thinkerMilestone: data[i][17] || null,
        // 累計の正解数。handleLog_で正解のたびに1ずつ加算しておくことで、Recordsシート
        // 全体を毎回スキャンしなくても「この生徒が実際に解いた問題数」を安く参照できる
        // (syncPointsの妥当性チェックで、EXPが実際の正解数に見合っているかの検証に使う)。
        loggedCorrectCount: Number(data[i][18]) || 0,
        // 本日(日本時間)の正解数/出題数。{date, correct, total}。日付が変わった分は
        // handleLog_側でリセットしてから加算するので、ここでは生の値をそのまま返す。
        todayStats: parseJsonCell_(data[i][19], null)
      };
    }
  }
  return null;
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

function nextStudentId_(sheet) {
  var data = sheet.getDataRange().getValues();
  var max = 0;
  for (var i = 1; i < data.length; i++) {
    var idStr = String(data[i][0]).trim();
    if (/^\d{5}$/.test(idStr)) {
      var n = parseInt(idStr, 10);
      if (n > max) max = n;
    }
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
    items: row.items, rareCollected: row.rareCollected, rareDefeats: row.rareDefeats, thinkerMilestone: row.thinkerMilestone
  };
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
    items: row.items, rareCollected: row.rareCollected, rareDefeats: row.rareDefeats, thinkerMilestone: row.thinkerMilestone
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

function handleSyncPoints_(ctx, body) {
  var id = String(body.id || '').trim();
  var points = Number(body.points);
  if (!id || !isFinite(points)) return { ok: false, error: 'missing_fields' };

  var row = findStudentRow_(ctx.students, id);
  if (!row) return { ok: false, error: 'not_found' };
  var ceilings = plausibilityCeilings_(row);

  var bonusAwarded = 0;
  if (body.prefectureCount !== undefined) {
    var prefectureCount = Math.max(0, Math.min(47, Math.floor(Number(body.prefectureCount)) || 0));
    if (prefectureCount === 47 && row.prefectureCount < 47 && isWithinPrefectureBonusWindow_()) {
      bonusAwarded = PREFECTURE_BONUS_MP;
    }
    ctx.students.getRange(row.rowIndex, 12).setValue(prefectureCount);
  }

  var rawPoints = Math.max(0, Math.floor(points));
  var clampedPoints = Math.min(rawPoints, ceilings.maxPoints);
  ctx.students.getRange(row.rowIndex, 7).setValue(clampedPoints + bonusAwarded);

  var rawExp = null, clampedExp = null, rawLevel = null, clampedLevel = null;
  if (body.level !== undefined && body.exp !== undefined) {
    rawExp = Math.max(0, Math.floor(Number(body.exp)) || 0);
    clampedExp = Math.min(rawExp, ceilings.maxExp);
    rawLevel = Math.max(1, Math.floor(Number(body.level)) || 1);
    clampedLevel = Math.max(1, Math.min(rawLevel, Math.floor(clampedExp / 10) + 1));
    ctx.students.getRange(row.rowIndex, 9, 1, 2).setValues([[clampedLevel, clampedExp]]);
  }

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
  // 端末間で図鑑・アイテムがズレないようにする。クライアント側で既にマージ済みの
  // 状態を送ってくる想定なので、そのままJSONで書き込む。
  if (body.items !== undefined) {
    ctx.students.getRange(row.rowIndex, 15).setValue(JSON.stringify(Array.isArray(body.items) ? body.items : []));
  }
  if (body.rareCollected !== undefined) {
    ctx.students.getRange(row.rowIndex, 16).setValue(JSON.stringify(Array.isArray(body.rareCollected) ? body.rareCollected : []));
  }
  if (body.rareDefeats !== undefined) {
    ctx.students.getRange(row.rowIndex, 17).setValue(JSON.stringify((body.rareDefeats && typeof body.rareDefeats === 'object') ? body.rareDefeats : {}));
  }
  if (body.thinkerMilestone !== undefined) {
    ctx.students.getRange(row.rowIndex, 18).setValue(body.thinkerMilestone || '');
  }

  return { ok: true, bonusAwarded: bonusAwarded };
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
