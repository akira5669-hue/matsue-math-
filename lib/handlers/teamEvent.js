const { sql } = require('../db');
const { nicknameForId } = require('./ranking');

// チーム対抗経験値バトル：進行中イベント(status='active')を1件取得し、参加者の
// 現在levelと開始時levelスナップショットの差分を「経験値上昇量」として集計する。
// (1勝=経験値+10=1レベルアップで固定のため、level差分が経験値上昇量にそのまま比例する)
// 生徒同士に見せる名前は、他のランキング画面と同じくnicknameForId(本名ではなく
// IDから決まる固定のファンタジー風ニックネーム)を使う。
async function handleTeamEventStatus(body) {
  const id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };

  const events = await sql().query(
    `SELECT id, name, start_date, end_date FROM team_events WHERE status = 'active' ORDER BY id DESC LIMIT 1`,
    []
  );
  if (!events.length) return { ok: true, active: false };
  const event = events[0];

  const rows = await sql().query(
    `SELECT t.id AS team_id, t.team_name, m.student_id, m.start_level,
            s.grade, s.level AS current_level
     FROM team_event_teams t
     JOIN team_event_members m ON m.team_id = t.id
     JOIN students s ON s.id = m.student_id
     WHERE t.event_id = $1`,
    [event.id]
  );

  const teamMap = new Map();
  rows.forEach((row) => {
    if (!teamMap.has(row.team_id)) teamMap.set(row.team_id, { teamId: row.team_id, teamName: row.team_name, members: [] });
    const gained = Math.max(0, (Number(row.current_level) || 0) - (Number(row.start_level) || 0));
    teamMap.get(row.team_id).members.push({
      id: row.student_id, name: nicknameForId(row.student_id), grade: row.grade, gained, startLevel: Number(row.start_level) || 0,
    });
  });

  // チームリーダー：イベント開始時点(start_level)で一番レベルが高かったメンバーに
  // 👑を表示する(開始後の伸びで入れ替わらないよう、開始時点のレベルで固定する)。
  teamMap.forEach((t) => {
    let leader = t.members[0];
    t.members.forEach((m) => { if (m.startLevel > leader.startLevel) leader = m; });
    t.members.forEach((m) => { m.isLeader = m === leader; });
  });

  const allTeams = Array.from(teamMap.values()).map((t) => ({
    teamId: t.teamId,
    teamName: t.teamName,
    memberCount: t.members.length,
    totalGained: t.members.reduce((sum, m) => sum + m.gained, 0),
  })).sort((a, b) => b.totalGained - a.totalGained);

  // 同点は同順位扱いにし、その人数分だけ次の順位を飛ばす(1224方式)。
  let rank = 0;
  let prevScore = null;
  allTeams.forEach((t, i) => {
    if (t.totalGained !== prevScore) rank = i + 1;
    t.rank = rank;
    prevScore = t.totalGained;
  });

  const myTeamEntry = Array.from(teamMap.values()).find((t) => t.members.some((m) => m.id === id));
  let myTeam = null;
  if (myTeamEntry) {
    const rankInfo = allTeams.find((t) => t.teamId === myTeamEntry.teamId);
    myTeam = {
      teamId: myTeamEntry.teamId,
      teamName: myTeamEntry.teamName,
      rank: rankInfo.rank,
      totalGained: rankInfo.totalGained,
      members: myTeamEntry.members.slice().sort((a, b) => b.gained - a.gained),
    };
  }

  return {
    ok: true,
    active: true,
    event: { name: event.name, startDate: event.start_date, endDate: event.end_date },
    myTeam,
    allTeams: allTeams.map((t) => ({
      teamId: t.teamId, teamName: t.teamName, rank: t.rank, totalGained: t.totalGained, memberCount: t.memberCount,
    })),
  };
}

module.exports = { handleTeamEventStatus };
