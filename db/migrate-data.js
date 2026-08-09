// スプレッドシート(GAS経由)の全データをNeon(Postgres)へ一括コピーするワンショット
// スクリプト。何度実行しても安全なように、実行前に対象テーブルをTRUNCATEしてから
// 入れ直す(students以外はCASCADEで追従)。
// 使い方: node db/migrate-data.js
const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvLocal();

const GAS_URL = 'https://script.google.com/macros/s/AKfycbyj3VC2qhP46U_xvWKg2KRDFZQKrI5xFUXOt_6MVOjqhPGxrYFPcXKx3coX2D5UDAYxHA/exec';
const MIGRATION_SECRET = '8cbc1a6671aa853ed0735cc2f7dc9cb9d146785d6f71c002';

function toTimestamp(v) {
  if (!v && v !== 0) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function toNum(v, fallback) {
  const n = Number(v);
  return isNaN(n) ? (fallback === undefined ? null : fallback) : n;
}
function toStr(v) {
  return (v === null || v === undefined || v === '') ? null : String(v);
}
// 古いRecords/TestPhotos等の一部行は、id列が現行の5桁0埋め形式('00124')ではなく
// 素の数値('124')のまま残っている(過去にID採番の形式が変わったため)。0埋めすれば
// 現行のstudents.idと一致するので、マッチング前に正規化する。
function normalizeId(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (/^\d{1,5}$/.test(s)) return ('00000' + s).slice(-5);
  return s;
}
function parseJsonCell(raw, fallback) {
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw);
    return (v === null || v === undefined) ? fallback : v;
  } catch (e) {
    return fallback;
  }
}
function toBool(v) {
  if (typeof v === 'boolean') return v;
  if (v === 'TRUE' || v === 'true' || v === 1) return true;
  if (v === 'FALSE' || v === 'false' || v === 0 || v === '') return false;
  return !!v;
}

async function fetchExport() {
  // GASの2段リダイレクトに追従する
  const res1 = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'migrationExport_temp', secret: MIGRATION_SECRET }),
    redirect: 'manual',
  });
  let res = res1;
  if (res1.status >= 300 && res1.status < 400) {
    const loc = res1.headers.get('location');
    res = await fetch(loc);
  }
  const json = await res.json();
  if (!json.ok) throw new Error('export failed: ' + JSON.stringify(json));
  return json;
}

async function batchInsert(sql, table, columns, rows, chunkSize) {
  chunkSize = chunkSize || 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const values = [];
    const placeholders = chunk.map((row, ri) => {
      const base = ri * columns.length;
      const ph = columns.map((_, ci) => `$${base + ci + 1}`).join(', ');
      values.push(...row);
      return `(${ph})`;
    }).join(', ');
    const stmt = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders}`;
    await sql.query(stmt, values);
    inserted += chunk.length;
  }
  return inserted;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) { console.error('DATABASE_URL が見つかりません。'); process.exit(1); }
  const sql = neon(connectionString);

  console.log('スプレッドシートからエクスポート中...');
  const data = await fetchExport();
  console.log(`students=${data.students.length}, records=${data.records.length}, testPhotos=${data.testPhotos.length}, weeklyQuiz=${data.weeklyQuiz.length}, guardians=${data.guardians.length}, gifts=${data.gifts.length}, giftCodes=${data.giftCodes.length}, itemGrants=${data.itemGrants.length}, anomalyLog=${data.anomalyLog.length}, withdrawn=${data.withdrawn.length}`);

  // 'sample01'はシート新規作成時に自動で入る見本行で、実在の生徒ではないため除外する。
  const realStudents = data.students.filter((d) => String(d[0]).trim() && String(d[0]).trim() !== 'sample01');
  const validIds = new Set(realStudents.map((d) => String(d[0]).trim()));

  console.log('既存データをクリア中...');
  await sql.query('TRUNCATE TABLE students, guardians, gift_requests, gift_codes, points_anomaly_log, withdrawn_students RESTART IDENTITY CASCADE');

  console.log('students を投入中...');
  const studentRows = realStudents
    .map((d) => [
      String(d[0]).trim(), d[1] || '', toStr(d[2]), toStr(d[3]), toTimestamp(d[4]),
      d[5] || '', toNum(d[6], 0), d[7] || '', toNum(d[8], 1), toNum(d[9], 0), toTimestamp(d[10]),
      toNum(d[11], 0), JSON.stringify(parseJsonCell(d[12], null)), toTimestamp(d[13]),
      JSON.stringify(parseJsonCell(d[14], [])), JSON.stringify(parseJsonCell(d[15], [])),
      JSON.stringify(parseJsonCell(d[16], {})), toStr(d[17]), toNum(d[18], 0),
      JSON.stringify(parseJsonCell(d[19], null)), toNum(d[20], 0), toStr(d[21]),
      toNum(d[22], 1), toNum(d[23], 100), JSON.stringify(parseJsonCell(d[24], {})),
      JSON.stringify(parseJsonCell(d[25], [])), toNum(d[27], 0),
    ]);
  const studentCols = ['id', 'name', 'password_hash', 'salt', 'created_at', 'grade', 'points', 'guardian',
    'level', 'exp', 'last_login', 'prefecture_count', 'avatar', 'apology_bonus_granted_at', 'items',
    'rare_collected', 'rare_defeats', 'thinker_milestone', 'logged_correct_count', 'today_stats', 'hp',
    'last_ranking_test_month', 'world_lap', 'world_lap_start_level', 'world_boss_defeated', 'world_allies',
    'challenge_correct_total'];
  const nStudents = await batchInsert(sql, 'students', studentCols, studentRows);
  console.log(`  -> ${nStudents}件`);

  // idを正規化(0埋め)した上でvalidIdsと突き合わせ、一致した行だけ返す。
  // 一致した行のidは正規化後の値に差し替えて返す(students.idと確実に一致させるため)。
  function filterValid(rows, idIndex, label) {
    const out = [];
    let skipped = 0;
    for (const r of rows) {
      const id = normalizeId(r[idIndex]);
      if (validIds.has(id)) {
        const copy = r.slice();
        copy[idIndex] = id;
        out.push(copy);
      } else {
        skipped++;
      }
    }
    if (skipped > 0) console.log(`  (${label}: student不在のため${skipped}件スキップ)`);
    return out;
  }

  console.log('records を投入中...');
  const recordRows = filterValid(data.records, 1, 'records')
    .map((r) => [toTimestamp(r[0]) || new Date().toISOString(), r[1], r[2] || '', r[3] || '', toBool(r[4])]);
  console.log(`  -> ${await batchInsert(sql, 'records', ['ts', 'student_id', 'name', 'category', 'correct'], recordRows)}件`);

  console.log('test_photos を投入中...');
  const testPhotoRows = filterValid(data.testPhotos, 1, 'testPhotos')
    .map((r) => [toTimestamp(r[0]) || new Date().toISOString(), r[1], r[2] || '', r[3] || '', r[4] || '', toNum(r[5], 0), toStr(r[6]), toTimestamp(r[7])]);
  console.log(`  -> ${await batchInsert(sql, 'test_photos', ['ts', 'student_id', 'name', 'test_type', 'score_tier', 'points_awarded', 'drive_file_id', 'expires_at'], testPhotoRows)}件`);

  console.log('weekly_quiz_answers を投入中...');
  const weeklyQuizRows = filterValid(data.weeklyQuiz, 1, 'weeklyQuiz')
    .map((r) => [toTimestamp(r[0]) || new Date().toISOString(), r[1], r[2] || '', r[3] || '', String(r[4]), toBool(r[5]), toNum(r[6], 0)]);
  console.log(`  -> ${await batchInsert(sql, 'weekly_quiz_answers', ['ts', 'student_id', 'name', 'grade', 'week_key', 'correct', 'points_delta'], weeklyQuizRows)}件`);

  console.log('item_grants を投入中...');
  const itemGrantRows = filterValid(data.itemGrants, 0, 'itemGrants')
    .map((r) => [r[0], r[1] || '', toTimestamp(r[2]) || new Date().toISOString()]);
  console.log(`  -> ${await batchInsert(sql, 'item_grants', ['student_id', 'item_ids', 'granted_at'], itemGrantRows)}件`);

  console.log('guardians を投入中...');
  const guardianRows = data.guardians.map((r) => [
    toTimestamp(r[0]) || new Date().toISOString(), r[1] || '',
    toStr(r[2]), toStr(r[3]), toStr(r[4]), toStr(r[5]), toStr(r[6]), toStr(r[7]), toStr(r[8]), toStr(r[9]),
  ]);
  console.log(`  -> ${await batchInsert(sql, 'guardians', ['ts', 'guardian_name', 'child_id_1', 'child_name_1', 'child_id_2', 'child_name_2', 'child_id_3', 'child_name_3', 'child_id_4', 'child_name_4'], guardianRows)}件`);

  console.log('gift_requests を投入中...');
  const giftRows = data.gifts.map((r) => [toTimestamp(r[0]) || new Date().toISOString(), toStr(r[1]), r[2] || '', r[3] || '', toNum(r[4], 0), toNum(r[5], 0), r[6] || '', toStr(r[7])]);
  console.log(`  -> ${await batchInsert(sql, 'gift_requests', ['ts', 'student_id', 'name', 'item', 'yen', 'mp', 'status', 'code'], giftRows)}件`);

  console.log('gift_codes を投入中...');
  const giftCodeRows = data.giftCodes.map((r) => [r[0] || '', r[1] || '', r[2] || '', toStr(r[3]), toTimestamp(r[4])]);
  console.log(`  -> ${await batchInsert(sql, 'gift_codes', ['item_id', 'code', 'status', 'used_by', 'used_at'], giftCodeRows)}件`);

  console.log('points_anomaly_log を投入中...');
  const anomalyRows = data.anomalyLog.map((r) => [toTimestamp(r[0]) || new Date().toISOString(), toStr(r[1]), r[2] || '', toNum(r[3], 0), toNum(r[4], 0), toNum(r[5], 0), toNum(r[6], 0), toNum(r[7], 0), toNum(r[8], 0)]);
  console.log(`  -> ${await batchInsert(sql, 'points_anomaly_log', ['ts', 'student_id', 'name', 'submitted_points', 'clamped_points', 'submitted_exp', 'clamped_exp', 'submitted_level', 'clamped_level'], anomalyRows)}件`);

  console.log('withdrawn_students を投入中...');
  const withdrawnRows = data.withdrawn.map((r) => [toTimestamp(r[0]) || new Date().toISOString(), String(r[1]).trim(), r[2] || '', r[3] || '', toNum(r[4], 0), toNum(r[5], 1), r[6] || '{}']);
  console.log(`  -> ${await batchInsert(sql, 'withdrawn_students', ['withdrawn_at', 'student_id', 'name', 'grade', 'points', 'level', 'raw_data'], withdrawnRows)}件`);

  console.log('\n移行完了！');
}

main().catch((err) => {
  console.error('\n移行に失敗しました:', err);
  process.exit(1);
});
