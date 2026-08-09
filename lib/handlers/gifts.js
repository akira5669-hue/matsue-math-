const { sql } = require('../db');
const { findStudent } = require('../students');
const { GIFT_CATALOG, EXCHANGE_WINDOW_TEXT, LOW_STOCK_THRESHOLDS, isInExchangeWindow } = require('../catalog');
const { sendAdminEmail } = require('../mail');

// GAS版のnotifyAdminOfGiftDelivery_/notifyAdminOfLowStock_/notifyAdminOfOutOfStock_と
// 同じ内容の通知メール(Resend経由)。「シート」への言及はデータベースに書き換えている。
async function notifyAdminOfGiftDelivery(studentId, studentName, item, remainingStock) {
  await sendAdminEmail(
    `【松江塾計算マスター】MP交換で自動発行: ${studentName}（${studentId}）`,
    `${studentName}（ID: ${studentId}）さんに「${item.label}」（${item.mp}MP）のコードを自動発行しました。\n\n`
    + `その商品の残り在庫: ${remainingStock}枚\n\n`
    + `詳細はデータベースの gift_requests / gift_codes テーブルをご確認ください。`
  );
}
async function notifyAdminOfLowStock(item, remainingStock) {
  await sendAdminEmail(
    `【松江塾計算マスター】在庫僅少: ${item.label}`,
    `「${item.label}」の在庫コードが残り${remainingStock}枚になりました。\n\n`
    + `gift_codes テーブルに新しいコードを追加してください(item_id列に「${item.itemId}」、code列にコード、status列は空欄のままでOKです)。`
  );
}
async function notifyAdminOfOutOfStock(studentId, studentName, item) {
  await sendAdminEmail(
    `【松江塾計算マスター】在庫切れで交換失敗: ${item.label}`,
    `${studentName}（ID: ${studentId}）さんが「${item.label}」に交換しようとしましたが、在庫コードが無かったため交換できませんでした（MPは減っていません）。\n\n`
    + `gift_codes テーブルにコードを追加してください。`
  );
}

async function handleGiftCatalog() {
  return { ok: true, catalog: GIFT_CATALOG, isOpen: isInExchangeWindow(), windowText: EXCHANGE_WINDOW_TEXT };
}

// 在庫プールから未使用コードを1件取得して使用済みにする。
async function claimGiftCode(itemId, studentId) {
  const rows = await sql().query(
    "SELECT id, code FROM gift_codes WHERE item_id = $1 AND (status IS NULL OR lower(status) != 'used') ORDER BY id LIMIT 1",
    [itemId]
  );
  if (!rows.length) return null;
  const claimed = rows[0];
  await sql().query('UPDATE gift_codes SET status = $1, used_by = $2, used_at = now() WHERE id = $3', ['used', studentId, claimed.id]);
  const remainingRows = await sql().query(
    "SELECT count(*)::int AS n FROM gift_codes WHERE item_id = $1 AND (status IS NULL OR lower(status) != 'used')",
    [itemId]
  );
  return { code: claimed.code, remainingStock: remainingRows[0].n };
}

async function handleRedeemGift(body) {
  const id = String(body.id || '').trim();
  const itemId = String(body.itemId || '').trim();
  if (!id || !itemId) return { ok: false, error: 'missing_fields' };
  if (!isInExchangeWindow()) return { ok: false, error: 'out_of_period', windowText: EXCHANGE_WINDOW_TEXT };

  const item = GIFT_CATALOG.find((x) => x.itemId === itemId);
  if (!item) return { ok: false, error: 'unknown_item' };

  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  if (row.points < item.mp) return { ok: false, error: 'insufficient_points' };

  const claimed = await claimGiftCode(itemId, id);
  if (!claimed) {
    await notifyAdminOfOutOfStock(id, row.name, item);
    return { ok: false, error: 'out_of_stock' };
  }

  const remaining = row.points - item.mp;
  await sql().query('UPDATE students SET points = $1 WHERE id = $2', [remaining, id]);
  await sql().query(
    'INSERT INTO gift_requests (ts, student_id, name, item, yen, mp, status, code) VALUES (now(), $1, $2, $3, $4, $5, $6, $7)',
    [id, row.name, item.label, item.yen || null, item.mp, '発行済み', claimed.code]
  );
  await notifyAdminOfGiftDelivery(id, row.name, item, claimed.remainingStock);
  if (LOW_STOCK_THRESHOLDS.includes(claimed.remainingStock)) {
    await notifyAdminOfLowStock(item, claimed.remainingStock);
  }

  return { ok: true, remainingPoints: remaining, code: claimed.code, itemLabel: item.label };
}

// 管理者(00001)専用：アイテム・レアキャラ図鑑を指定した生徒に付与予約する。
async function handleGrantItems(body) {
  const callerId = String(body.id || '').trim();
  if (callerId !== '00001') return { ok: false, error: 'forbidden' };

  const targetId = String(body.targetId || '').trim();
  const itemIds = Array.isArray(body.itemIds) ? body.itemIds.map((s) => String(s).trim()).filter(Boolean) : [];
  if (!targetId || itemIds.length === 0) return { ok: false, error: 'missing_fields' };

  const targetRow = await findStudent(targetId);
  if (!targetRow) return { ok: false, error: 'not_found' };

  const existingRows = await sql().query('SELECT id, item_ids FROM item_grants WHERE student_id = $1 LIMIT 1', [targetId]);
  if (existingRows.length) {
    const existing = String(existingRows[0].item_ids || '').split(',').map((s) => s.trim()).filter(Boolean);
    const merged = existing.concat(itemIds.filter((x) => !existing.includes(x)));
    await sql().query('UPDATE item_grants SET item_ids = $1, granted_at = now() WHERE id = $2', [merged.join(','), existingRows[0].id]);
    return { ok: true };
  }
  await sql().query('INSERT INTO item_grants (student_id, item_ids, granted_at) VALUES ($1, $2, now())', [targetId, itemIds.join(',')]);
  return { ok: true };
}

module.exports = { handleGiftCatalog, handleRedeemGift, handleGrantItems };
