// Neonへの接続ヘルパー。HTTPS経由(@neondatabase/serverless)を使う。
// ローカル環境によってはPostgresの生TCP接続(5432番ポート)がブロックされることが
// あったため、Vercel Functions側でも同じHTTPSベースのドライバに統一している。
const { neon } = require('@neondatabase/serverless');

let sqlInstance = null;
function sql() {
  if (!sqlInstance) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set');
    sqlInstance = neon(connectionString);
  }
  return sqlInstance;
}

module.exports = { sql };
