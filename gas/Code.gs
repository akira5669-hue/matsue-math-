/**
 * 正負の数トレーニング - 生徒ログイン・学習記録API
 *
 * Students シート: id | name | passwordHash | salt | createdAt | grade | points | guardian
 * Records  シート: timestamp | id | name | category | correct
 * Guardians シート: timestamp | guardianName | childId1 | childName1 | childId2 | childName2 | childId3 | childName3 | childId4 | childName4
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

// MP(旧ポイント)交換カタログ。10MP = 1円。costはクライアントの申告を信用せず、
// ここを唯一の正として毎回サーバー側で検証する。
var GIFT_CATALOG = [
  { itemId: 'amazon300', label: 'Amazonギフト券 300円分', yen: 300, mp: 3000 },
  { itemId: 'amazon500', label: 'Amazonギフト券 500円分', yen: 500, mp: 5000 },
  { itemId: 'amazon1000', label: 'Amazonギフト券 1000円分', yen: 1000, mp: 10000 },
  { itemId: 'amazon2000', label: 'Amazonギフト券 2000円分', yen: 2000, mp: 20000 },
  { itemId: 'amazon5000', label: 'Amazonギフト券 5000円分', yen: 5000, mp: 50000 },
  { itemId: 'amazon10000', label: 'Amazonギフト券 10000円分', yen: 10000, mp: 100000 },
  { itemId: 'book500', label: '図書カード 500円分', yen: 500, mp: 5000 },
  { itemId: 'book1000', label: '図書カード 1000円分', yen: 1000, mp: 10000 },
];

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
    students.appendRow(['id', 'name', 'passwordHash', 'salt', 'createdAt', 'grade', 'points', 'guardian']);
    students.appendRow(['sample01', '見本 太郎', '', '', '', '', 0, '']);
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
    gifts.appendRow(['timestamp', 'id', 'name', 'item', 'yen', 'mp', 'status']);
  }

  return { ss: ss, students: students, records: records, guardians: guardians, gifts: gifts };
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
        grade: data[i][5] || '', points: Number(data[i][6]) || 0, guardian: data[i][7] || ''
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
  } else if (action === 'ranking') {
    return jsonOut_(handleRanking_(ctx, body));
  } else if (action === 'registerGuardian') {
    return jsonOut_(handleRegisterGuardian_(ctx, body));
  } else if (action === 'giftCatalog') {
    return jsonOut_({ ok: true, catalog: GIFT_CATALOG });
  } else if (action === 'redeemGift') {
    return jsonOut_(handleRedeemGift_(ctx, body));
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
  if (!/^\d{4}$/.test(password)) return { ok: false, error: 'invalid_password' };

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var id = nextStudentId_(ctx.students);
    var salt = Utilities.getUuid();
    var hash = sha256Hex_(password + salt);
    var rowIndex = ctx.students.getLastRow() + 1;
    // 先頭0埋けのIDが数値化されて消えないよう、書き込み前にA列を文字列書式にする
    ctx.students.getRange(rowIndex, 1).setNumberFormat('@').setValue(id);
    ctx.students.getRange(rowIndex, 2, 1, 7).setValues([[name, hash, salt, new Date(), grade, 0, guardian]]);
    return { ok: true, id: id, name: name };
  } finally {
    lock.releaseLock();
  }
}

function handleLogin_(ctx, body) {
  var id = String(body.id || '').trim();
  var password = String(body.password || '');
  if (!id || !password) return { ok: false, error: 'missing_fields' };

  var row = findStudentRow_(ctx.students, id);
  if (!row) return { ok: false, error: 'not_found' };
  if (!row.passwordHash) return { ok: false, error: 'no_password' };

  var hash = sha256Hex_(password + row.salt);
  if (hash !== row.passwordHash) return { ok: false, error: 'wrong_password' };

  return { ok: true, name: row.name };
}

function handleLog_(ctx, body) {
  var id = String(body.id || '').trim();
  var category = String(body.category || '');
  var correct = !!body.correct;
  if (!id || !category) return { ok: false, error: 'missing_fields' };

  var row = findStudentRow_(ctx.students, id);
  if (!row) return { ok: false, error: 'not_found' };

  ctx.records.appendRow([new Date(), id, row.name, category, correct]);
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
    var points = Number(data[i][6]) || 0;
    rows.push({ id: id, points: points });
  }
  rows.sort(function (a, b) { return b.points - a.points; });
  var top = rows.slice(0, 50).map(function (r, idx) {
    return { rank: idx + 1, nickname: nicknameForId_(r.id), points: r.points, isYou: r.id === myId };
  });
  return { ok: true, ranking: top };
}

function handleRegisterGuardian_(ctx, body) {
  var guardianName = String(body.guardianName || '').trim();
  var children = Array.isArray(body.children) ? body.children : [];
  if (!guardianName || children.length === 0 || children.length > 4) {
    return { ok: false, error: 'missing_fields' };
  }

  for (var i = 0; i < children.length; i++) {
    var c = children[i];
    var childId = String((c && c.id) || '').trim();
    var childPassword = String((c && c.password) || '');
    if (!childId || !childPassword) return { ok: false, error: 'missing_fields', index: i };

    var row = findStudentRow_(ctx.students, childId);
    if (!row || !row.passwordHash) return { ok: false, error: 'child_mismatch', index: i };
    var hash = sha256Hex_(childPassword + row.salt);
    if (hash !== row.passwordHash) return { ok: false, error: 'child_mismatch', index: i };
  }

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

function handleRedeemGift_(ctx, body) {
  var id = String(body.id || '').trim();
  var itemId = String(body.itemId || '').trim();
  if (!id || !itemId) return { ok: false, error: 'missing_fields' };

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

    var remaining = row.points - item.mp;
    ctx.students.getRange(row.rowIndex, 7).setValue(remaining);
    ctx.gifts.appendRow([new Date(), id, row.name, item.label, item.yen, item.mp, '申請中']);

    return { ok: true, remainingPoints: remaining };
  } finally {
    lock.releaseLock();
  }
}
