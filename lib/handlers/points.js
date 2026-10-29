const { sql } = require('../db');
const { findStudent } = require('../students');
const { dateKeyTokyo, todayScopedDailyFields } = require('../util');

// 管理者(00001)がバグ等でアイテムを失った生徒に個別付与予約したものを、
// 次回アクセス時に一度だけ配布する(GAS版のtakePendingItemGrants_と同じ役割)。
async function takePendingItemGrants(id) {
  const rows = await sql().query(
    'SELECT id, item_ids FROM item_grants WHERE student_id = $1 ORDER BY id LIMIT 1',
    [id]
  );
  if (!rows.length) return [];
  const row = rows[0];
  await sql().query('DELETE FROM item_grants WHERE id = $1', [row.id]);
  return String(row.item_ids || '').split(',').map((s) => s.trim()).filter(Boolean);
}

// 先生が生徒に個別に伝えたい一度きりのお知らせ(MP補償の理由など)を、
// 次回アプリを開いた時に1回だけ表示する(pendingItemsと同じ「取り出したら消す」方式)。
async function takePendingNotice(id, row) {
  const notice = row.pendingNotice;
  if (!notice) return '';
  await sql().query('UPDATE students SET pending_notice = NULL WHERE id = $1', [id]);
  return notice;
}

// 先生がまとめて配った鍵(宝箱の鍵)を、次回アプリを開いた時に1回だけ渡す(2026-10-29〜)。
// 鍵の所持数は端末の値をそのままSETする方式(sync.js)なので、サーバーの所持数を直接増やすと
// 開きっぱなしの端末の同期で消えてしまう。そこで端末側で足してもらう。
// 古いapp.jsは受け取れない(取り出すと消えてしまう)ので、keyGrantV1を送ってきた端末にだけ渡す。
async function takePendingKeys(id) {
  const rows = await sql().query(
    `UPDATE students s SET pending_keys = NULL
       FROM (SELECT id, pending_keys FROM students WHERE id = $1 FOR UPDATE) old
     WHERE s.id = old.id AND old.pending_keys IS NOT NULL
     RETURNING old.pending_keys`,
    [id]
  );
  return rows.length ? rows[0].pending_keys : null;
}

// GAS版handleGetPoints_の移植。お詫びボーナス(APOLOGY_BONUS)は付与期間が
// 2026-08-01で終了済みのため、意図的に移植していない(常に0を返す)。
async function handleGetPoints(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  const row = await findStudent(id);
  if (!row) return { ok: false, error: 'not_found' };

  // ログイン状態を保ったままアプリを再開した場合、これまでlastLoginが更新されず
  // 「5日ログイン無しでMPリセット」が誤発動する不具合があったため、getPoints呼び出し
  // (=アプリを開いた)たびにも、その日のうち最初の1回だけlastLoginを更新する。
  const today = dateKeyTokyo(new Date());
  const lastLoginDay = row.lastLogin ? dateKeyTokyo(new Date(row.lastLogin)) : null;
  if (lastLoginDay !== today) {
    const now = new Date();
    await sql().query('UPDATE students SET last_login = $1 WHERE id = $2', [now.toISOString(), id]);
    row.lastLogin = now;
  }

  const pendingItems = await takePendingItemGrants(id);
  const pendingNotice = await takePendingNotice(id, row);
  const pendingKeys = body.keyGrantV1 ? await takePendingKeys(id) : null;

  return {
    ok: true, points: row.points, level: row.level, exp: row.exp, scienceExp: row.scienceExp, grade: row.grade, prefectureCount: row.prefectureCount, prefectureLap: row.prefectureLap,
    avatar: row.avatar, pendingItems, pendingNotice, pendingKeys, apologyBonusAwarded: 0,
    // 対象外学年の生徒に退会を促す表示(2026-10-08〜)。pendingNoticeと違い「表示したら
    // 消す」ではなく、退会するまで(=行自体が消えるまで)アプリを開くたびに毎回表示する。
    forceWithdrawNotice: !!row.forceWithdrawNotice,
    forceBlocked: !!row.forceBlocked,
    items: row.items, rareCollected: row.rareCollected, rareDefeats: row.rareDefeats, thinkerMilestone: row.thinkerMilestone, hp: row.hp,
    worldLap: row.worldLap, worldLapStartLevel: row.worldLapStartLevel, worldBossDefeated: row.worldBossDefeated, worldAllies: row.worldAllies,
    worldCountry: row.worldCountry, treasureItems: row.treasureItems,
    spellbooks: row.spellbooks, photoAvatarConsent: row.photoAvatarConsent,
    categoryRanks: row.categoryRanks, completionBonus: row.completionBonus, hpLoginBonusDate: row.hpLoginBonusDate,
    fujiSummitReached: row.fujiSummitReached, yushaSwordCount: row.yushaSwordCount, yushaSwordObtained: row.yushaSwordObtained,
    fujiStation: row.fujiStation, fujiLegStreak: row.fujiLegStreak, fujiTimeAttackStartedAt: row.fujiTimeAttackStartedAt,
    studyReportDate: row.studyReportDate, studyReportTotal: row.studyReportTotal, studyReportMinutesTotal: row.studyReportMinutesTotal,
    // 成功は一度きりの実績フラグ群。以前はここに含まれておらず、別端末からの
    // アクセス時に既に達成済みでも「未挑戦」扱いに見える不具合があった。
    fujiDescentStation: row.fujiDescentStation, fujiDescentLegStreak: row.fujiDescentLegStreak,
    fujiDescentCompleted: !!row.fujiDescentCompleted,
    ohachiCompleted: !!row.ohachiCompleted, ohachiEasyCompleted: !!row.ohachiEasyCompleted,
    usaCrossingCompleted: !!row.usaCrossingCompleted, capitalQuizCorrectTotal: row.capitalQuizCorrectTotal, capitalQuizEasyCorrectTotal: row.capitalQuizEasyCorrectTotal,
    streak7TitleEarned: !!row.streak7TitleEarned, streak15TitleEarned: !!row.streak15TitleEarned, streak30TitleEarned: !!row.streak30TitleEarned,
    wisdomSeedCount: row.wisdomSeedCount, wisdomFruitCount: row.wisdomFruitCount, effortSeedCount: row.effortSeedCount,
    usaLadyGiftPending: row.usaLadyGiftPending, diamondRingCount: row.diamondRingCount, gemItems: row.gemItems,
    ...todayScopedDailyFields(row),
  };
}

module.exports = { handleGetPoints };
