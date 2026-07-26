/**
 * 正負の数トレーニング - 生徒ログイン・学習記録API
 *
 * Students シート: id | name | passwordHash | salt | createdAt | grade | points | guardian | level | exp | lastLogin | prefectureCount
 *
 * prefectureCount: 「47都道府県制覇」特別企画。10問正解（敵を倒す）ごとに
 * 北海道(1)から沖縄(47)の順で1県ずつ達成数が増える。既存の生徒は列が
 * 空欄のままなので 0 として扱う。
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

  return { ss: ss, students: students, records: records, guardians: guardians, gifts: gifts, giftCodes: giftCodes };
}

function sha256Hex_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function findStudentRow_(sheet, id) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(id).trim()) {
      return {
        rowIndex: i + 1, id: data[i][0], name: data[i][1], passwordHash: data[i][2], salt: data[i][3],
        grade: data[i][5] || '', points: Number(data[i][6]) || 0, guardian: data[i][7] || '',
        level: Number(data[i][8]) || 1, exp: Number(data[i][9]) || 0, lastLogin: data[i][10] || null,
        prefectureCount: Number(data[i][11]) || 0
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
  } else if (action === 'getPoints') {
    return jsonOut_(handleGetPoints_(ctx, body));
  } else if (action === 'ranking') {
    return jsonOut_(handleRanking_(ctx, body));
  } else if (action === 'rankingToday') {
    return jsonOut_(handleRankingToday_(ctx, body));
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

  return { ok: true, name: row.name, points: points, pointsReset: pointsReset, level: row.level, exp: row.exp, grade: row.grade, prefectureCount: row.prefectureCount };
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
  return { ok: true, points: row.points, level: row.level, exp: row.exp, grade: row.grade, prefectureCount: row.prefectureCount };
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
  return { ok: true };
}

function dateKeyTokyo_(d) {
  return Utilities.formatDate(new Date(d), 'Asia/Tokyo', 'yyyy-MM-dd');
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

function handleSyncPoints_(ctx, body) {
  var id = String(body.id || '').trim();
  var points = Number(body.points);
  if (!id || !isFinite(points)) return { ok: false, error: 'missing_fields' };

  var row = findStudentRow_(ctx.students, id);
  if (!row) return { ok: false, error: 'not_found' };

  ctx.students.getRange(row.rowIndex, 7).setValue(Math.max(0, Math.floor(points)));

  if (body.level !== undefined && body.exp !== undefined) {
    var level = Math.max(1, Math.floor(Number(body.level)) || 1);
    var exp = Math.max(0, Math.floor(Number(body.exp)) || 0);
    ctx.students.getRange(row.rowIndex, 9, 1, 2).setValues([[level, exp]]);
  }

  if (body.prefectureCount !== undefined) {
    var prefectureCount = Math.max(0, Math.min(47, Math.floor(Number(body.prefectureCount)) || 0));
    ctx.students.getRange(row.rowIndex, 12).setValue(prefectureCount);
  }

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

function handleRanking_(ctx, body) {
  var myId = String(body.id || '').trim();
  var data = ctx.students.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var id = String(data[i][0]).trim();
    if (!id) continue;
    var level = Number(data[i][8]) || 1;
    var exp = Number(data[i][9]) || 0;
    rows.push({ id: id, level: level, exp: exp });
  }
  rows.sort(function (a, b) {
    if (b.level !== a.level) return b.level - a.level;
    return b.exp - a.exp;
  });
  var top = rows.slice(0, 50).map(function (r, idx) {
    return { rank: idx + 1, nickname: nicknameForId_(r.id), level: r.level, exp: r.exp, isYou: r.id === myId };
  });
  return { ok: true, ranking: top };
}

// 本日（日本時間）の正解数ランキング。Recordsシートから当日分だけ集計する。
function handleRankingToday_(ctx, body) {
  var myId = String(body.id || '').trim();
  var todayKey = dateKeyTokyo_(new Date());
  var data = ctx.records.getDataRange().getValues();
  var counts = {};
  for (var i = 1; i < data.length; i++) {
    if (dateKeyTokyo_(data[i][0]) !== todayKey) continue;
    var id = String(data[i][1]).trim();
    if (!id) continue;
    if (!counts[id]) counts[id] = { correct: 0, total: 0 };
    counts[id].total++;
    if (!!data[i][4]) counts[id].correct++;
  }
  var rows = Object.keys(counts).map(function (id) {
    return { id: id, correct: counts[id].correct, total: counts[id].total };
  });
  rows.sort(function (a, b) {
    if (b.correct !== a.correct) return b.correct - a.correct;
    return b.total - a.total;
  });
  var top = rows.slice(0, 50).map(function (r, idx) {
    return { rank: idx + 1, nickname: nicknameForId_(r.id), correct: r.correct, total: r.total, isYou: r.id === myId };
  });
  return { ok: true, ranking: top };
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
