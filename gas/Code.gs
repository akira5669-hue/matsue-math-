/**
 * 正負の数トレーニング - 生徒ログイン・学習記録API
 *
 * Students シート: id | name | passwordHash | salt | createdAt
 * Records  シート: timestamp | id | name | category | correct
 *
 * 新規登録は名前（漢字）とパスワード（数字4桁）のみを受け取り、
 * IDは登録順の連番（5桁・0埋め、例: 00001）を自動発行する。
 * 生徒本人・保護者のどちらも同じID・パスワードでログインできる。
 */

var STUDENTS_SHEET = 'Students';
var RECORDS_SHEET = 'Records';

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
    students.appendRow(['id', 'name', 'passwordHash', 'salt', 'createdAt']);
    students.appendRow(['sample01', '見本 太郎', '', '', '']);
  }

  var records = ss.getSheetByName(RECORDS_SHEET);
  if (!records) {
    records = ss.insertSheet(RECORDS_SHEET);
  }
  if (records.getLastRow() === 0) {
    records.appendRow(['timestamp', 'id', 'name', 'category', 'correct']);
  }

  return { ss: ss, students: students, records: records };
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
      return { rowIndex: i + 1, id: data[i][0], name: data[i][1], passwordHash: data[i][2], salt: data[i][3] };
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
    ctx.students.getRange(rowIndex, 2, 1, 4).setValues([[name, hash, salt, new Date()]]);
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

function handleHistory_(ctx, body) {
  var id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };

  var row = findStudentRow_(ctx.students, id);
  if (!row) return { ok: false, error: 'not_found' };

  var data = ctx.records.getDataRange().getValues();
  var byCategory = {};
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
    recent.push({ timestamp: data[i][0], category: cat, correct: isCorrect });
  }

  recent.sort(function (a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });
  recent = recent.slice(0, 30);

  return {
    ok: true,
    name: row.name,
    total: total,
    correct: correct,
    byCategory: Object.keys(byCategory).map(function (k) { return byCategory[k]; }),
    recent: recent
  };
}
