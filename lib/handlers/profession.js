const { sql } = require('../db');
const { findStudent } = require('../students');

// 職業：全生徒に公開済み。レベル(と一部は7日連続ログインの称号)に応じて
// 5段階のティアがあり、ティアが上がるごとに選べる職業リストが丸ごと
// 入れ替わる(上位ティアでも下位ティアの職業が選べる訳ではない、それぞれ独立した
// リスト)。app.js側のPROFESSION_TIERS_と必ず揃えること。
const PROFESSION_JOBS_800_ = [
  'サッカー選手', '野球選手', '医師', 'YouTuber', 'ゲームクリエイター', 'パティシエ', '保育士', '看護師', '美容師', '学校の先生',
  '警察官', '消防士', 'パイロット', '獣医師', 'イラストレーター', '漫画家', 'プロゲーマー', 'バスケットボール選手', '薬剤師', '建築士',
  '宇宙飛行士', 'アイドル', '歌手', '俳優', '声優', 'ダンサー', '芸人', 'アニメーター', '小説家', '絵本作家',
  'プログラマー', 'AIエンジニア', 'ロボットエンジニア', 'Webデザイナー', '動画クリエイター', 'VTuber', 'ストリーマー', 'ゲーム実況者', 'アプリ開発者', 'CGクリエイター',
  '科学者', '研究者', '発明家', '恐竜研究者', '海洋生物学者', '天文学者', '気象予報士', '動物飼育員', '水族館スタッフ', 'ドッグトレーナー',
  'トリマー', '動物カメラマン', '農家', '漁師', '花屋', 'ケーキ屋', 'パン職人', '料理人', '寿司職人', 'カフェ店員',
  'ショコラティエ', '栄養士', 'ファッションデザイナー', 'メイクアップアーティスト', 'ネイリスト', 'モデル', 'カメラマン', 'デザイナー', '宝石デザイナー', '大工',
  '自動車整備士', 'レーシングドライバー', '電車の運転士', '新幹線の運転士', 'バス運転手', '船長', 'キャビンアテンダント', '救急救命士', '自衛官', '海上保安官',
  '弁護士', '裁判官', '公務員', '会社経営者', '起業家', '銀行員', '投資家', 'スポーツトレーナー', 'サッカー監督', '野球監督',
  'プロゴルファー', 'テニス選手', '卓球選手', 'バレーボール選手', '陸上選手', 'スケートボード選手', '将棋棋士', 'プロダーツ選手', '塾の先生', '松江塾の先生 😆',
];
const PROFESSION_CUSTOM_MAX_LENGTH_ = 10;
const PROFESSION_TIERS_ = [
  {
    level: 100, needsStreak7: false,
    jobs: ['会社員', 'フリーター'],
  },
  {
    level: 300, needsStreak7: false,
    jobs: ['会社員', '警察官', '消防士', 'パティシエ', '保育士', '教師', '看護師', 'プログラマー', 'イラストレーター', 'ダンサー', '栄養士', 'メイクアップアーティスト', '農家', '漁師', '花屋', 'パン職人', 'フリーター'],
  },
  {
    level: 500, needsStreak7: true,
    jobs: ['会社員', '警察官', '消防士', 'パティシエ', '保育士', '教師', '看護師', 'プログラマー', 'イラストレーター', 'ダンサー', '栄養士', 'メイクアップアーティスト', '農家', '漁師', '花屋', '電車の運転士', 'バス運転手', 'パン職人', '船長', '料理人', '寿司職人', 'カフェ店員', '薬剤師', '建築士', 'キャビンアテンダント', 'フリーター'],
  },
  {
    level: 800, needsStreak7: true,
    jobs: PROFESSION_JOBS_800_,
  },
  {
    level: 1000, needsStreak7: true,
    jobs: PROFESSION_JOBS_800_, allowCustom: true,
  },
];
function currentProfessionTier_(level, streak7) {
  let best = null;
  PROFESSION_TIERS_.forEach((t) => {
    if (level >= t.level && (!t.needsStreak7 || streak7)) best = t;
  });
  return best;
}

async function handleSaveProfession(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };
  const tier = currentProfessionTier_(Number(row.level) || 0, !!row.streak7TitleEarned);
  if (!tier) return { ok: false, error: 'not_eligible' };

  let profession = String(body.profession || '').trim();
  if (!tier.jobs.includes(profession)) {
    if (!tier.allowCustom) return { ok: false, error: 'invalid_profession' };
    profession = profession.slice(0, PROFESSION_CUSTOM_MAX_LENGTH_);
    if (!profession) return { ok: false, error: 'invalid_profession' };
  }
  await sql().query('UPDATE students SET desired_profession = $1 WHERE id = $2', [profession, id]);
  return { ok: true, profession };
}

module.exports = { handleSaveProfession };
