const { sql } = require('../db');
const { findStudent } = require('../students');

// アメリカ横断・理科バトル：2026年12月限定(作成中、今は00001専用プレビュー)。
// 参加料100MPを払うと、理科バトルに挑戦できる(50州をクライアント側で管理。
// 進行度自体は端末セッション限定で永続化しない、お鉢巡りの参加料と同じ方式)。
const USA_CROSSING_ENTRY_FEE_MP = 100;

async function handleUsaCrossingEntryFee(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  // 今は00001だけに見せる作成中プレビューなので、サーバー側でも管理者限定にする。
  // 将来、一般公開するときはこのチェックを外すか、12月の日付窓チェックに切り替える。
  if (id !== '00001') return { ok: false, error: 'forbidden' };

  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  if (row.points < USA_CROSSING_ENTRY_FEE_MP) return { ok: false, error: 'insufficient_points' };

  const newPoints = row.points - USA_CROSSING_ENTRY_FEE_MP;
  await sql().query('UPDATE students SET points = $1 WHERE id = $2', [newPoints, id]);
  return { ok: true, points: newPoints };
}

module.exports = { handleUsaCrossingEntryFee, USA_CROSSING_ENTRY_FEE_MP };
