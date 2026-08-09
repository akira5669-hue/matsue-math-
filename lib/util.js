const crypto = require('crypto');

// GAS側のsha256Hex_(Utilities.computeDigest(SHA_256, text, UTF_8)の16進変換)と
// 同じ標準SHA-256のUTF-8→16進なので、既存のpasswordHashとそのまま比較できる。
function sha256Hex(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

// 'sv-SE'ロケールはYYYY-MM-DD形式を返すため、日本時間の日付キー取得に流用する。
function dateKeyTokyo(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
}

function monthKeyTokyo(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }).slice(0, 7); // 'YYYY-MM'
}

function mondayKeyTokyo(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const jstStr = dt.toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' });
  const jst = new Date(jstStr.replace(' ', 'T'));
  const day = jst.getDay(); // 0=日,1=月,...
  const diff = day === 0 ? -6 : 1 - day; // 月曜日まで戻る
  jst.setDate(jst.getDate() + diff);
  return dateKeyTokyo(jst);
}

function parseJsonCell(raw, fallback) {
  if (!raw) return fallback;
  if (typeof raw === 'object') return raw; // JSONB列は既にパース済みで返る
  try {
    const v = JSON.parse(raw);
    return (v === null || v === undefined) ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

module.exports = { sha256Hex, dateKeyTokyo, monthKeyTokyo, mondayKeyTokyo, parseJsonCell };
