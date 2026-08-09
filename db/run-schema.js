// スキーマ(db/schema.sql)をNeonデータベースへ適用するワンショットスクリプト。
// ローカルのネットワークがPostgresの生TCP接続(5432番ポート)をブロックしていたため、
// HTTPS経由で動作するNeonのサーバーレスドライバを使っている。
// 使い方: node db/run-schema.js
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

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL が見つかりません。.env.local を確認してください。');
    process.exit(1);
  }
  const sql = neon(connectionString);
  const raw = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  // コメント行を除去してから ';' で文単位に分割する(このDDLには文字列リテラル中の
  // ';' が無いため、単純な分割で問題ない)。
  const withoutComments = raw
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  const statements = withoutComments
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  console.log(`${statements.length}個の文を実行します...`);
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const label = stmt.slice(0, 60).replace(/\s+/g, ' ');
    process.stdout.write(`[${i + 1}/${statements.length}] ${label}... `);
    await sql.query(stmt);
    console.log('OK');
  }
  console.log('スキーマの適用に成功しました。');
}

main().catch((err) => {
  console.error('\nスキーマ適用に失敗しました:', err);
  process.exit(1);
});
