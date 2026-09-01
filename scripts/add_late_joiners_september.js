// 9月のチーム対抗経験値バトルの最終編成用スクリプト(9/5の夜に実行する想定)。
// 使い方: プロジェクトルートで `node scripts/add_late_joiners_september.js`
// ・進行中(status='active')の最新イベントを対象にする。
// ・「新しく登録した」または「最近また遊び始めた(復帰した)」生徒のうち、
//   まだどのチームにも入っていない人を、そのつど一番人数が少ないチームへ
//   追加していく(できるだけ均等になるように)。
// ・対象条件: 直近7日以内にログインしている(今週さわった) かつ 00001以外。
//   1回実行すれば十分だが、複数回実行しても既にチームに入っている生徒は
//   スキップされるので安全(重複追加はしない)。
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const envText = fs.readFileSync(envPath, 'utf8');
envText.split('\n').forEach((line) => {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/\r$/, '').replace(/^"(.*)"$/, '$1');
});
const { neon } = require('../node_modules/@neondatabase/serverless');

const ACTIVE_WITHIN_DAYS = 7;

async function main() {
  const sql = neon(process.env.DATABASE_URL);

  const events = await sql`SELECT id, name FROM team_events WHERE status = 'active' ORDER BY id DESC LIMIT 1`;
  if (!events.length) { console.log('進行中のイベントがありません'); return; }
  const event = events[0];
  console.log('対象イベント:', event.name, '(id=' + event.id + ')');

  // 既存チームと、それぞれの現在の人数を取得(できるだけ均等に追加するため)。
  const teams = await sql`
    SELECT t.id, t.team_name, COUNT(m.id) AS member_count
    FROM team_event_teams t
    LEFT JOIN team_event_members m ON m.team_id = t.id
    WHERE t.event_id = ${event.id}
    GROUP BY t.id, t.team_name
    ORDER BY t.id
  `;
  if (!teams.length) { console.log('この イベントにはチームがありません'); return; }
  console.log('既存チーム:', teams.map((t) => `${t.team_name}(${t.member_count}人)`).join(', '));

  const cutoff = new Date(Date.now() - ACTIVE_WITHIN_DAYS * 24 * 60 * 60 * 1000);
  const candidates = await sql`
    SELECT s.id, s.name, s.grade, s.level, s.last_login
    FROM students s
    WHERE s.id != '00001'
      AND s.last_login IS NOT NULL
      AND s.last_login >= ${cutoff.toISOString()}
      AND NOT EXISTS (
        SELECT 1 FROM team_event_members m
        JOIN team_event_teams t ON t.id = m.team_id
        WHERE m.student_id = s.id AND t.event_id = ${event.id}
      )
    ORDER BY s.id
  `;
  console.log(`追加対象候補(直近${ACTIVE_WITHIN_DAYS}日以内ログイン、未所属):`, candidates.length, '人');
  if (candidates.length === 0) { console.log('追加対象がいないため、何もしません。'); return; }

  // 現在の人数を保持しつつ、毎回「一番少ないチーム」に1人ずつ振り分ける。
  const teamState = teams.map((t) => ({ id: t.id, name: t.team_name, count: Number(t.member_count) }));
  const summary = [];
  for (const c of candidates) {
    teamState.sort((a, b) => a.count - b.count);
    const target = teamState[0];
    await sql`
      INSERT INTO team_event_members (team_id, student_id, start_level)
      VALUES (${target.id}, ${c.id}, ${c.level})
    `;
    target.count++;
    summary.push(`${c.name}(${c.id}, ${c.grade}, Lv.${c.level}) → ${target.name}`);
  }

  console.log('\n追加結果:');
  summary.forEach((line) => console.log('  ' + line));
  console.log('\n追加後のチーム人数:', teamState.map((t) => `${t.name}(${t.count}人)`).join(', '));
  console.log(`\n完了: ${summary.length}人を追加しました。`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
