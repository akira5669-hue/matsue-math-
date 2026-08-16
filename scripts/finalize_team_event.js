// 月末(9/1など)にチーム対抗経験値バトルの結果を確定し、MPを分配するスクリプト。
// 使い方: プロジェクトルートで `node scripts/finalize_team_event.js`
// ・順位に応じたチームMPプールを、チーム内で経験値上昇量に比例して分配(0人は0MP)。
// ・同点チームは同順位(1224方式)、その分だけ次の順位を飛ばす。
// ・11位以降のチームは今回の指示に含まれていないため、MP分配なし(0MP)としています。
//   もし11位以降にも配りたい場合はRANK_POOLの該当箇所を編集してから実行してください。
// ・実行すると進行中(status='active')の最新イベントを確定し、status='finished'にします。
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const envText = fs.readFileSync(envPath, 'utf8');
envText.split('\n').forEach((line) => {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/\r$/, '').replace(/^"(.*)"$/, '$1');
});
const { neon } = require('../node_modules/@neondatabase/serverless');

const RANK_POOL = { 1: 3000, 2: 2500, 3: 2000, 4: 1800, 5: 1500, 6: 1400, 7: 1300, 8: 1200, 9: 1100, 10: 1000 };
function poolForRank(rank) { return RANK_POOL[rank] || 0; }

async function main() {
  const sql = neon(process.env.DATABASE_URL);
  const events = await sql`SELECT id, name FROM team_events WHERE status = 'active' ORDER BY id DESC LIMIT 1`;
  if (!events.length) { console.log('進行中のイベントがありません'); return; }
  const event = events[0];
  console.log('finalizing event:', event.name, '(id=' + event.id + ')');

  const rows = await sql`
    SELECT t.id AS team_id, t.team_name, m.id AS member_id, m.student_id, m.start_level,
           s.name AS student_name, s.points AS current_points, s.level AS current_level
    FROM team_event_teams t
    JOIN team_event_members m ON m.team_id = t.id
    JOIN students s ON s.id = m.student_id
    WHERE t.event_id = ${event.id}
  `;

  const teamMap = new Map();
  rows.forEach((r) => {
    if (!teamMap.has(r.team_id)) teamMap.set(r.team_id, { teamId: r.team_id, teamName: r.team_name, members: [] });
    const gained = Math.max(0, (Number(r.current_level) || 0) - (Number(r.start_level) || 0));
    teamMap.get(r.team_id).members.push({
      memberId: r.member_id, studentId: r.student_id, studentName: r.student_name,
      currentPoints: Number(r.current_points) || 0, gained,
    });
  });

  const teams = Array.from(teamMap.values()).map((t) => ({
    ...t, totalGained: t.members.reduce((sum, m) => sum + m.gained, 0),
  })).sort((a, b) => b.totalGained - a.totalGained);

  let rank = 0, prevScore = null;
  teams.forEach((t, i) => {
    if (t.totalGained !== prevScore) rank = i + 1;
    t.rank = rank;
    prevScore = t.totalGained;
  });

  console.log('順位確定:');
  for (const t of teams) {
    const pool = poolForRank(t.rank);
    console.log(`${t.rank}位 ${t.teamName}（経験値+${t.totalGained * 10}）プール${pool}MP`);
    for (const m of t.members) {
      const share = t.totalGained > 0 ? Math.floor((pool * m.gained) / t.totalGained) : 0;
      m.awarded = share;
      console.log(`    ${m.studentName}(${m.studentId}) 経験値+${m.gained * 10} → ${share}MP`);
    }
  }

  for (const t of teams) {
    for (const m of t.members) {
      if (m.awarded > 0) {
        const newPoints = m.currentPoints + m.awarded;
        await sql`UPDATE students SET points = ${newPoints} WHERE id = ${m.studentId}`;
      }
      await sql`UPDATE team_event_members SET final_gain = ${m.gained}, points_awarded = ${m.awarded} WHERE id = ${m.memberId}`;
    }
  }
  await sql`UPDATE team_events SET status = 'finished' WHERE id = ${event.id}`;
  console.log('完了しました。MPを付与し、イベントをfinishedにしました。');
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
