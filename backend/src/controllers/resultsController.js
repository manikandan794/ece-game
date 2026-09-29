const { getDb } = require('../config/database');
const { stateMachine } = require('../realtime/stateMachine');

function getLeaderboard(req, res) {
  const db = getDb();
  const roundId = req.query.roundId ? Number(req.query.roundId) : null;
  const isTest = stateMachine.isTestingMode ? 1 : 0;

  // Get active and disqualified teams
  const teams = db.prepare('SELECT id, team_name, college_name, captain_name, status, is_test_team FROM teams WHERE is_test_team = ?').all(isTest);

  // Get scores
  const scoreQuery = roundId
    ? `SELECT team_id, SUM(points_awarded) as round_score, COUNT(*) as answers_count, SUM(is_correct) as correct_count, AVG(time_taken_ms) as avg_speed
       FROM answers WHERE round_id = ? AND is_test_answer = ? GROUP BY team_id`
    : `SELECT team_id, SUM(points_awarded) as round_score, COUNT(*) as answers_count, SUM(is_correct) as correct_count, AVG(time_taken_ms) as avg_speed
       FROM answers WHERE is_test_answer = ? GROUP BY team_id`;

  const scoreRows = roundId
    ? db.prepare(scoreQuery).all(roundId, isTest)
    : db.prepare(scoreQuery).all(isTest);

  const scoreMap = new Map();
  for (const row of scoreRows) {
    scoreMap.set(row.team_id, row);
  }

  // Combine team info with scores
  const results = teams.map(team => {
    const stats = scoreMap.get(team.id) || { round_score: 0, answers_count: 0, correct_count: 0, avg_speed: 0 };
    return {
      teamId: team.id,
      teamName: team.team_name,
      collegeName: team.college_name,
      captainName: team.captain_name,
      status: team.status,
      score: Number((stats.round_score || 0).toFixed(2)),
      answersCount: stats.answers_count || 0,
      correctCount: stats.correct_count || 0,
      avgSpeedMs: Math.round(stats.avg_speed || 0)
    };
  });

  // Sort by score DESC, then correctCount DESC, then avgSpeed ASC
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
    return a.avgSpeedMs - b.avgSpeedMs;
  });

  // Assign ranks with proper tie detection
  let currentRank = 1;
  let tiedGroups = [];
  let currentTie = [];

  for (let i = 0; i < results.length; i++) {
    if (i > 0) {
      const prev = results[i - 1];
      const curr = results[i];
      if (curr.score === prev.score) {
        curr.rank = prev.rank;
        curr.isTied = true;
        prev.isTied = true;
        currentTie.push(curr);
      } else {
        if (currentTie.length > 1) {
          tiedGroups.push([...currentTie]);
        }
        currentTie = [curr];
        currentRank = i + 1;
        curr.rank = currentRank;
        curr.isTied = false;
      }
    } else {
      results[0].rank = 1;
      results[0].isTied = false;
      currentTie = [results[0]];
    }
  }
  if (currentTie.length > 1) {
    tiedGroups.push(currentTie);
  }

  return res.json({
    success: true,
    roundId,
    totalTeams: results.length,
    results,
    tiedGroups: tiedGroups.map(group => ({
      rank: group[0].rank,
      score: group[0].score,
      teams: group.map(t => ({ teamId: t.teamId, teamName: t.teamName, collegeName: t.collegeName }))
    }))
  });
}

function exportResultsCsv(req, res) {
  const db = getDb();
  const isTest = stateMachine.isTestingMode ? 1 : 0;

  const rounds = db.prepare('SELECT id, title, stage_number FROM rounds ORDER BY order_index ASC').all();
  const teams = db.prepare('SELECT id, team_name, college_name, captain_name, contact_number, status FROM teams WHERE is_test_team = ?').all(isTest);

  // Compute each team's score per round
  const allScores = db.prepare('SELECT team_id, round_id, SUM(points_awarded) as score FROM answers WHERE is_test_answer = ? GROUP BY team_id, round_id').all(isTest);
  const teamRoundMap = new Map();
  for (const s of allScores) {
    teamRoundMap.set(`${s.team_id}_${s.round_id}`, s.score);
  }

  // Calculate overall rankings
  const ranked = teams.map(t => {
    let total = 0;
    const roundScores = {};
    for (const r of rounds) {
      const sc = teamRoundMap.get(`${t.id}_${r.id}`) || 0;
      roundScores[r.id] = sc;
      total += sc;
    }
    return { ...t, roundScores, totalScore: Number(total.toFixed(2)) };
  });

  ranked.sort((a, b) => b.totalScore - a.totalScore);
  let rank = 1;
  for (let i = 0; i < ranked.length; i++) {
    if (i > 0 && ranked[i].totalScore === ranked[i - 1].totalScore) {
      ranked[i].rank = ranked[i - 1].rank;
    } else {
      ranked[i].rank = i + 1;
    }
  }

  // Construct CSV
  let headers = ['Rank', 'Team ID', 'Team Name', 'College', 'Captain', 'Contact', 'Status'];
  for (const r of rounds) {
    headers.push(`Round ${r.stage_number} (${r.title})`);
  }
  headers.push('Total Score');

  const rows = [headers.join(',')];

  for (const item of ranked) {
    const row = [
      item.rank,
      item.id,
      `"${item.team_name.replace(/"/g, '""')}"`,
      `"${item.college_name.replace(/"/g, '""')}"`,
      `"${item.captain_name.replace(/"/g, '""')}"`,
      `"${item.contact_number || ''}"`,
      item.status
    ];

    for (const r of rounds) {
      row.push(item.roundScores[r.id] || 0);
    }
    row.push(item.totalScore);
    rows.push(row.join(','));
  }

  const csvContent = rows.join('\r\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="glitch_hunt_results_${Date.now()}.csv"`);
  return res.send(csvContent);
}

module.exports = {
  getLeaderboard,
  exportResultsCsv
};
