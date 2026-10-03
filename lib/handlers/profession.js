const { sql } = require('../db');
const { findStudent } = require('../students');

// なりたい職業：00001限定プレビュー。7日連続ログインの称号とレベル1000の
// 両方を達成した時だけ設定できる(両方ともサーバー側の実測値で再検証する)。
const PROFESSION_MAX_LENGTH = 20;

async function handleSaveProfession(body) {
  const id = String(body.id || '').trim();
  if (id !== '00001') return { ok: false, error: 'forbidden' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  if (!row.streak7TitleEarned || (Number(row.level) || 0) < 1000) return { ok: false, error: 'not_eligible' };

  const profession = String(body.profession || '').trim().slice(0, PROFESSION_MAX_LENGTH);
  await sql().query('UPDATE students SET desired_profession = $1 WHERE id = $2', [profession, id]);
  return { ok: true, profession };
}

module.exports = { handleSaveProfession };
