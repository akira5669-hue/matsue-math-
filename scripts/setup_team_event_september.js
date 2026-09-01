// 9月のチーム対抗経験値バトルを開始するスクリプト。
// 使い方: プロジェクトルートで `node scripts/setup_team_event_september.js`
// ・開始日(9月1日)に近い日に実行すること(参加者選定に「直近ログイン」を使うため)。
// ・実行すると、進行中(status='active')のイベントがあれば削除してから作り直す
//   (8月のイベントは先にscripts/finalize_team_event.jsで確定・finished化しておくこと。
//   finished化済みのイベントは削除されない)。
// ・1チームおよそ25人、上位5チームにMPが入る(6位以降は0MP)。
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const envText = fs.readFileSync(envPath, 'utf8');
envText.split('\n').forEach((line) => {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/\r$/, '').replace(/^"(.*)"$/, '$1');
});
const { neon } = require('../node_modules/@neondatabase/serverless');

const TEAM_SIZE = 29; // 約30人×8チームになるよう調整(2026-09-01、参加者238人での実績値)
const EVENT_NAME = '2026年9月 チーム対抗経験値バトル';
const EVENT_START = '2026-09-01';
const EVENT_END = '2026-09-30';
const RANK_POOL = { 1: 10000, 2: 7000, 3: 5000, 4: 3000, 5: 1000 };
const ACTIVE_WITHIN_DAYS = 10;

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const ADJ = ['稲妻', '烈火', '疾風', '氷結', '黄金', '銀河', '流星', '爆炎', '深海', '天空', '雷神', '猛虎', '不死鳥', '無敵', '閃光', '嵐', '氷河', '灼熱', '虹色', '漆黒', '白銀', '疾走', '大地', '極光', '暴風', '紫電', '轟音', '双竜', '青龍', '朱雀', '白虎', '玄武', '獅子', '鋼鉄', '真紅', '蒼天', '一撃', '無限', '超音速', '最強'];
const NOUN = ['タイガーズ', 'イーグルス', 'ドラゴンズ', 'ウルブズ', 'ファルコンズ', 'シャークス', 'ライオンズ', 'ホークス', 'フェニックス', 'サムライズ', 'レンジャーズ', 'ナイツ', 'ウォリアーズ', 'ロケッツ', 'ブレイブス', 'ハンターズ', 'ジャガーズ', 'パンサーズ', 'コブラーズ', 'グリズリーズ', 'ヴァイパーズ', 'サンダーズ', 'ストライカーズ', 'ガーディアンズ', 'クルセイダーズ', 'レジェンズ', 'タイタンズ', 'コメッツ', 'アローズ', 'ブリッツ', 'スパルタンズ', 'マーベリックス', 'ペガサス', 'キマイラ', 'グラディエーターズ', 'バイソンズ', 'コンドルズ', 'ライノーズ', 'スコーピオンズ', 'マンティコア'];

function generateTeamNames(count) {
  const shuffledAdj = shuffle(ADJ);
  const shuffledNoun = shuffle(NOUN);
  const names = [];
  for (let i = 0; i < count; i++) {
    names.push(shuffledAdj[i % shuffledAdj.length] + shuffledNoun[i % shuffledNoun.length]);
  }
  const unique = new Set(names);
  if (unique.size !== names.length) throw new Error('duplicate team names generated');
  return shuffle(names);
}

async function main() {
  const sql = neon(process.env.DATABASE_URL);
  const gradeOrder = ['小4', '小5', '小6', '中1', '中2', '中3'];

  // 進行中(まだfinalizeされていない)イベントが残っていたら削除してやり直す。
  // finished済み(確定済み)のイベントは記録として残すので触らない。
  const existing = await sql`SELECT id, name FROM team_events WHERE status = 'active'`;
  for (const e of existing) {
    await sql`DELETE FROM team_events WHERE id = ${e.id}`;
    console.log('deleted previous unfinished event:', e.name, '(id=' + e.id + ')');
  }

  // Neonのタグ付きテンプレートは${}をSQLのバインドパラメータとして展開するため、
  // interval 'N days'のような文字列リテラルの中では使えない。JS側でカットオフの
  // 日時を計算し、タイムスタンプとして比較する。
  const cutoff = new Date(Date.now() - ACTIVE_WITHIN_DAYS * 24 * 60 * 60 * 1000);
  const rows = await sql`
    SELECT id, name, grade, level FROM students
    WHERE grade = ANY(${gradeOrder})
      AND last_login IS NOT NULL
      AND last_login >= ${cutoff.toISOString()}
      AND id != '00001'
    ORDER BY id
  `;
  console.log(`participants found (${ACTIVE_WITHIN_DAYS}日以内ログイン, 管理者00001除く):`, rows.length);

  const teamCount = Math.floor(rows.length / TEAM_SIZE);
  if (teamCount < 1) { console.log('参加者が少なすぎます。処理を中止します。'); return; }
  console.log('teamCount:', teamCount);

  // レベル降順(同レベルはランダム)に並べ、teamCount人ずつの「ラウンド」に分割する。
  // 各ラウンド内で「現在の合計レベルが一番低い(かつまだ今ラウンドで受け取っていない)
  // チーム」に順番に入れていく貪欲法で、チーム人数を揃えつつ合計レベルも均等にする。
  const sorted = shuffle(rows).sort((a, b) => b.level - a.level);
  const teams = Array.from({ length: teamCount }, () => ({ totalLevel: 0, members: [], grades: new Set() }));

  for (let roundStart = 0; roundStart < sorted.length; roundStart += teamCount) {
    const slice = sorted.slice(roundStart, roundStart + teamCount);
    const takenThisRound = new Set();
    for (const student of slice) {
      const eligible = teams.filter((t) => !takenThisRound.has(t));
      const minLevel = Math.min(...eligible.map((t) => t.totalLevel));
      let candidates = eligible.filter((t) => t.totalLevel === minLevel);
      const withoutGrade = candidates.filter((t) => !t.grades.has(student.grade));
      if (withoutGrade.length > 0) candidates = withoutGrade;
      const chosen = candidates[Math.floor(Math.random() * candidates.length)];
      chosen.members.push(student);
      chosen.totalLevel += student.level;
      chosen.grades.add(student.grade);
      takenThisRound.add(chosen);
    }
  }

  const levels = teams.map((t) => t.totalLevel);
  console.log('team total levels: min=', Math.min(...levels), 'max=', Math.max(...levels), 'avg=', (levels.reduce((a, b) => a + b, 0) / levels.length).toFixed(1));
  console.log('team sizes:', teams.map((t) => t.members.length).join(','));

  const teamNames = generateTeamNames(teamCount);

  const eventRows = await sql`
    INSERT INTO team_events (name, start_date, end_date, status, rank_pool)
    VALUES (${EVENT_NAME}, ${EVENT_START}, ${EVENT_END}, 'active', ${JSON.stringify(RANK_POOL)}::jsonb)
    RETURNING id
  `;
  const eventId = eventRows[0].id;
  console.log('created team_events.id =', eventId);

  const summary = [];
  for (let i = 0; i < teams.length; i++) {
    const teamRows = await sql`
      INSERT INTO team_event_teams (event_id, team_name) VALUES (${eventId}, ${teamNames[i]}) RETURNING id
    `;
    const teamId = teamRows[0].id;
    for (const student of teams[i].members) {
      await sql`
        INSERT INTO team_event_members (team_id, student_id, start_level)
        VALUES (${teamId}, ${student.id}, ${student.level})
      `;
    }
    summary.push({
      teamName: teamNames[i],
      totalLevel: teams[i].totalLevel,
      members: teams[i].members.map((s) => `${s.name}(${s.grade} Lv.${s.level})`),
    });
  }

  console.log('teams created:', teams.length);
  summary.forEach((t, i) => console.log(`${i + 1}. ${t.teamName}（合計Lv.${t.totalLevel}）: ${t.members.join(', ')}`));
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
