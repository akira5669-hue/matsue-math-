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

// 実行環境のデフォルトタイムゾーン(Vercel本番はUTC)に依存しない実装。
// 旧実装はJST壁時計の文字列を実行環境のローカルタイムゾーンとして再解釈して
// いたため、Vercel(UTC)上では日本時間15時以降に日付がずれる不具合があった
// (JST 15:00〜23:59の間、mondayKeyTokyoが実際より1日進んだ月曜日を返していた)。
// ここではJSTの年月日と曜日をそれぞれ独立して正しく取得し、カレンダー計算は
// タイムゾーンに影響されないUTC基準の日数演算だけで行う。
function mondayKeyTokyo(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const jstDateStr = dt.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }); // 'YYYY-MM-DD'
  const weekdayStr = dt.toLocaleDateString('en-US', { timeZone: 'Asia/Tokyo', weekday: 'short' });
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = weekdayMap[weekdayStr]; // 0=日,1=月,...
  const diff = day === 0 ? -6 : 1 - day; // 月曜日まで戻る
  const [y, m, dd] = jstDateStr.split('-').map(Number);
  const monday = new Date(Date.UTC(y, m - 1, dd + diff));
  return monday.toISOString().slice(0, 10);
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
