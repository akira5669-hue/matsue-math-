// MP交換カタログ。10MP=1円。costはクライアントの申告を信用せず、ここを唯一の正として
// 毎回サーバー側で検証する(GAS版Code.gsのGIFT_CATALOGと同じ内容)。
const GIFT_CATALOG = [
  { itemId: 'amazon300', label: 'Amazonギフト券 300円分', yen: 300, mp: 3000 },
  { itemId: 'amazon700', label: 'Amazonギフト券 700円分', yen: 700, mp: 7000 },
  { itemId: 'amazon1000', label: 'Amazonギフト券 1000円分', yen: 1000, mp: 10000 },
  { itemId: 'amazon2000', label: 'Amazonギフト券 2000円分', yen: 2000, mp: 20000 },
  { itemId: 'amazon5000', label: 'Amazonギフト券 5000円分', yen: 5000, mp: 50000 },
  { itemId: 'amazon10000', label: 'Amazonギフト券 10000円分', yen: 10000, mp: 100000 },
  { itemId: 'specialA', label: 'スペシャルグッズA（小・中学生向け）', mp: 20000 },
  { itemId: 'specialB', label: 'スペシャルグッズB（小・中学生向け）', mp: 35000 },
  { itemId: 'specialC', label: 'スペシャルグッズC（小・中学生向け）', mp: 50000 },
  { itemId: 'specialD', label: 'スペシャルグッズD（中学生向け）', mp: 35000 },
  { itemId: 'specialE', label: 'スペシャルグッズE（中学生向け）', mp: 55000 },
  { itemId: 'specialF', label: 'スペシャルグッズF（中学生向け）', mp: 75000 },
  { itemId: 'specialS', label: 'スペシャルグッズS（中学生向け）', mp: 100000 },
];
const EXCHANGE_WINDOW_TEXT = '5月1日〜3日、12月30日〜31日、1月1日';
const LOW_STOCK_THRESHOLDS = [10, 5];

function isInExchangeWindow() {
  const md = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }).slice(5); // 'MM-DD'
  if (md >= '05-01' && md <= '05-03') return true;
  if (md === '12-30' || md === '12-31') return true;
  if (md === '01-01') return true;
  return false;
}

module.exports = { GIFT_CATALOG, EXCHANGE_WINDOW_TEXT, LOW_STOCK_THRESHOLDS, isInExchangeWindow };
