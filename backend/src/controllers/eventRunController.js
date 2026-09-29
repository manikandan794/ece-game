const { getDb } = require('../config/database');
const { stateMachine } = require('../realtime/stateMachine');
const { logAudit } = require('../utils/logger');

function getTodayString() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  return `${day}-${month}-${year}`;
}

function parseDateToIsoPrefix(dateStr) {
  // Accepts DD-MM-YYYY or YYYY-MM-DD
  if (!dateStr) return getTodayString();
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD -> DD-MM-YYYY
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dateStr;
  }
  return dateStr;
}

function createEventRun(req, res) {
  const db = getDb();
  let { event_name, event_date, is_test_run } = req.body;

  event_name = (event_name && event_name.trim()) || 'GLITCH HUNT 2026';
  event_date = (event_date && event_date.trim()) || getTodayString();
  const testFlag = Boolean(is_test_run) || stateMachine.isTestingMode ? 1 : 0;

  // Format date parts for ID generation: DD-MM-YYYY -> YYYY-MM-DD
  const parts = event_date.split('-');
  let yyyy = new Date().getFullYear();
  let mm = '01';
  let dd = '01';
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      yyyy = parts[0];
      mm = parts[1];
      dd = parts[2];
      event_date = `${dd}-${mm}-${yyyy}`;
    } else {
      dd = parts[0];
      mm = parts[1];
      yyyy = parts[2];
    }
  }

  const prefix = `GH-${yyyy}-${mm}-${dd}`;
  const existingToday = db.prepare('SELECT COUNT(*) as count FROM event_runs WHERE event_run_id LIKE ?').get(`${prefix}%`).count;
  const seq = String(existingToday + 1).padStart(3, '0');
  const eventRunId = `${prefix}-${seq}`;

  const now = new Date();
  const startTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  try {
    db.prepare(`
      INSERT INTO event_runs (
        event_run_id, event_date, event_name, start_time, status,
        rounds_conducted, is_test_run, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'RUNNING', '[]', ?, ?, ?)
    `).run(
      eventRunId,
      event_date,
      event_name,
      startTime,
      testFlag,
      now.toISOString(),
      now.toISOString()
    );

    // Set as active event run in event_state
    db.prepare('UPDATE event_state SET current_event_run_id = ? WHERE id = 1').run(eventRunId);
    stateMachine.currentEventRunId = eventRunId;

    logAudit('EVENT_RUN_CREATED', 'ADMIN_1', req.user.id, {
      eventRunId,
      eventDate: event_date,
      eventName: event_name,
      isTest: testFlag
    });

    const createdRun = db.prepare('SELECT * FROM event_runs WHERE event_run_id = ?').get(eventRunId);
    return res.status(201).json({
      success: true,
      message: 'Event run created successfully',
      eventRun: createdRun
    });
  } catch (err) {
    console.error('[CREATE EVENT RUN ERROR]', err);
    return res.status(500).json({ success: false, message: 'Failed to create event run: ' + err.message });
  }
}

function getEventRuns(req, res) {
  const db = getDb();
  const { date, filter } = req.query; // filter: 'all', 'real', 'test'
  const today = getTodayString();

  let query = 'SELECT * FROM event_runs WHERE 1=1';
  const params = [];

  if (date) {
    const formatted = parseDateToIsoPrefix(date);
    query += ' AND (event_date = ? OR event_date = ?)';
    params.push(date, formatted);
  }

  if (filter === 'real') {
    query += ' AND is_test_run = 0';
  } else if (filter === 'test') {
    query += ' AND is_test_run = 1';
  }

  query += ' ORDER BY id DESC';

  const eventRuns = db.prepare(query).all(...params);

  // Get distinct dates for the date picker
  const distinctDates = db.prepare('SELECT DISTINCT event_date FROM event_runs ORDER BY id DESC').all().map(r => r.event_date);

  return res.json({
    success: true,
    todayDate: today,
    availableDates: distinctDates,
    count: eventRuns.length,
    eventRuns
  });
}

function getTodayEvent(req, res) {
  const db = getDb();
  const today = getTodayString();

  // Find latest active or latest run for today
  let run = db.prepare("SELECT * FROM event_runs WHERE event_date = ? AND status = 'RUNNING' ORDER BY id DESC LIMIT 1").get(today);
  if (!run) {
    run = db.prepare("SELECT * FROM event_runs WHERE event_date = ? ORDER BY id DESC LIMIT 1").get(today);
  }
  if (!run) {
    // If no run on exact today string, get the very latest run in database
    run = db.prepare("SELECT * FROM event_runs ORDER BY id DESC LIMIT 1").get();
  }

  return res.json({
    success: true,
    todayDate: today,
    eventRun: run || null
  });
}

function calculateLeaderboardForEvent(eventRunId) {
  const db = getDb();
  const run = db.prepare('SELECT * FROM event_runs WHERE event_run_id = ?').get(eventRunId);
  if (!run) return { results: [], tiedGroups: [] };

  const isTest = run.is_test_run;

  // Get teams that answered in this run
  const teamsWithAnswers = db.prepare(`
    SELECT DISTINCT t.id, t.team_name, t.college_name, t.captain_name, t.status
    FROM teams t
    JOIN answers a ON a.team_id = t.id
    WHERE a.event_run_id = ?
  `).all(eventRunId);

  // If no team answered yet, show active teams
  const teams = teamsWithAnswers.length > 0
    ? teamsWithAnswers
    : db.prepare('SELECT id, team_name, college_name, captain_name, status FROM teams WHERE is_test_team = ?').all(isTest);

  const scoreRows = db.prepare(`
    SELECT team_id,
      SUM(points_awarded) as total_score,
      COUNT(*) as answers_count,
      SUM(is_correct) as correct_count,
      AVG(time_taken_ms) as avg_speed
    FROM answers
    WHERE event_run_id = ?
    GROUP BY team_id
  `).all(eventRunId);

  const scoreMap = new Map();
  for (const s of scoreRows) {
    scoreMap.set(s.team_id, s);
  }

  const results = teams.map(t => {
    const stats = scoreMap.get(t.id) || { total_score: 0, answers_count: 0, correct_count: 0, avg_speed: 0 };
    return {
      teamId: t.id,
      teamName: t.team_name,
      collegeName: t.college_name,
      captainName: t.captain_name,
      status: t.status,
      score: Number((stats.total_score || 0).toFixed(2)),
      answersCount: stats.answers_count || 0,
      correctCount: stats.correct_count || 0,
      wrongCount: (stats.answers_count || 0) - (stats.correct_count || 0),
      avgSpeedMs: Math.round(stats.avg_speed || 0)
    };
  });

  // Ranking calculation: Score DESC -> Correct DESC -> avgSpeed ASC
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
    return a.avgSpeedMs - b.avgSpeedMs;
  });

  let currentRank = 1;
  const tiedGroups = [];
  let currentTie = [];

  for (let i = 0; i < results.length; i++) {
    if (i > 0) {
      const prev = results[i - 1];
      const curr = results[i];
      if (curr.score === prev.score && curr.score > 0) {
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

  return { results, tiedGroups };
}

function getEventRunDetails(req, res) {
  const db = getDb();
  const eventRunId = req.params.eventRunId;

  const eventRun = db.prepare('SELECT * FROM event_runs WHERE event_run_id = ?').get(eventRunId);
  if (!eventRun) {
    return res.status(404).json({ success: false, message: 'Event run not found' });
  }

  const allRounds = db.prepare('SELECT * FROM rounds ORDER BY order_index ASC').all();

  // Inspect which rounds had answers in this event run
  const conductedRoundRows = db.prepare(`
    SELECT DISTINCT round_id, COUNT(DISTINCT question_id) as questions_conducted, COUNT(DISTINCT team_id) as teams_participated
    FROM answers
    WHERE event_run_id = ?
    GROUP BY round_id
  `).all(eventRunId);

  const conductedMap = new Map();
  for (const row of conductedRoundRows) {
    conductedMap.set(row.round_id, row);
  }

  // Parse stored conducted rounds if any
  let storedConductedIds = [];
  try {
    storedConductedIds = JSON.parse(eventRun.rounds_conducted || '[]');
  } catch (e) {
    storedConductedIds = [];
  }

  const roundHistory = [];
  let totalConductedCount = 0;
  let totalCompletedCount = 0;

  for (const round of allRounds) {
    const conductedData = conductedMap.get(round.id);
    const wasConducted = Boolean(conductedData) || storedConductedIds.includes(round.id);

    if (wasConducted) {
      totalConductedCount++;
      totalCompletedCount++;

      // Compute winner & runner-up for this specific round in this event run
      const roundScores = db.prepare(`
        SELECT team_id, SUM(points_awarded) as score, COUNT(*) as ans_cnt, SUM(is_correct) as correct_cnt, AVG(time_taken_ms) as avg_speed
        FROM answers
        WHERE round_id = ? AND event_run_id = ?
        GROUP BY team_id
        ORDER BY score DESC, correct_cnt DESC, avg_speed ASC
      `).all(round.id, eventRunId);

      let winner = null;
      let winningScore = 0;
      let runnerUp = null;

      if (roundScores.length > 0) {
        const topTeam = db.prepare('SELECT team_name, college_name FROM teams WHERE id = ?').get(roundScores[0].team_id);
        winner = topTeam ? topTeam.team_name : `Team #${roundScores[0].team_id}`;
        winningScore = roundScores[0].score;

        if (roundScores.length > 1) {
          const secondTeam = db.prepare('SELECT team_name FROM teams WHERE id = ?').get(roundScores[1].team_id);
          runnerUp = secondTeam ? secondTeam.team_name : `Team #${roundScores[1].team_id}`;
        }
      }

      // Total questions in this round
      const qCount = db.prepare('SELECT COUNT(*) as count FROM questions WHERE round_id = ?').get(round.id).count;

      roundHistory.push({
        roundId: round.id,
        stageNumber: round.stage_number,
        title: round.title,
        subtitle: round.subtitle,
        isTieBreak: Boolean(round.is_tie_break),
        status: 'COMPLETED',
        questionsCount: conductedData ? conductedData.questions_conducted : qCount,
        totalQuestionsInBank: qCount,
        teamsParticipated: conductedData ? conductedData.teams_participated : 0,
        winner: winner || 'No Submissions',
        winningScore: Number((winningScore || 0).toFixed(2)),
        runnerUp: runnerUp || '—'
      });
    } else {
      roundHistory.push({
        roundId: round.id,
        stageNumber: round.stage_number,
        title: round.title,
        subtitle: round.subtitle,
        isTieBreak: Boolean(round.is_tie_break),
        status: 'NOT CONDUCTED',
        questionsCount: 0,
        totalQuestionsInBank: db.prepare('SELECT COUNT(*) as count FROM questions WHERE round_id = ?').get(round.id).count,
        teamsParticipated: 0,
        winner: '—',
        winningScore: 0,
        runnerUp: '—'
      });
    }
  }

  // Calculate overall event leaderboard
  const { results: leaderboard, tiedGroups } = calculateLeaderboardForEvent(eventRunId);

  // Overall winner
  let finalWinner = eventRun.final_winner;
  let finalScore = eventRun.final_score;

  if (!finalWinner && leaderboard.length > 0 && leaderboard[0].score > 0) {
    finalWinner = leaderboard[0].teamName;
    finalScore = leaderboard[0].score;
  }

  const distinctTeamsCount = db.prepare('SELECT COUNT(DISTINCT team_id) as count FROM answers WHERE event_run_id = ?').get(eventRunId).count;

  const summary = {
    eventRunId: eventRun.event_run_id,
    eventDate: eventRun.event_date,
    eventName: eventRun.event_name,
    status: eventRun.status,
    totalTeams: distinctTeamsCount || leaderboard.length,
    roundsConducted: totalConductedCount,
    totalRounds: allRounds.length,
    roundsCompleted: totalCompletedCount,
    startTime: eventRun.start_time || '10:00 AM',
    endTime: eventRun.end_time || '—',
    finalWinner: finalWinner || 'Pending Round Completion',
    finalScore: Number((finalScore || 0).toFixed(2)),
    isTestRun: Boolean(eventRun.is_test_run)
  };

  return res.json({
    success: true,
    eventRun,
    summary,
    roundHistory,
    leaderboard,
    tiedGroups
  });
}

function getRoundResultDetails(req, res) {
  const db = getDb();
  const { eventRunId, roundId } = req.params;

  const eventRun = db.prepare('SELECT * FROM event_runs WHERE event_run_id = ?').get(eventRunId);
  if (!eventRun) {
    return res.status(404).json({ success: false, message: 'Event run not found' });
  }

  const round = db.prepare('SELECT * FROM rounds WHERE id = ?').get(roundId);
  if (!round) {
    return res.status(404).json({ success: false, message: 'Round not found' });
  }

  // Get total questions conducted in this round
  const totalQuestions = db.prepare('SELECT COUNT(*) as count FROM questions WHERE round_id = ?').get(roundId).count;

  // Get score and answer stats for teams in this round
  const scores = db.prepare(`
    SELECT
      a.team_id,
      t.team_name,
      t.college_name,
      t.captain_name,
      SUM(a.points_awarded) as score,
      COUNT(*) as answers_count,
      SUM(a.is_correct) as correct_count,
      AVG(a.time_taken_ms) as avg_speed
    FROM answers a
    JOIN teams t ON a.team_id = t.id
    WHERE a.round_id = ? AND a.event_run_id = ?
    GROUP BY a.team_id
    ORDER BY score DESC, correct_count DESC, avg_speed ASC
  `).all(roundId, eventRunId);

  let currentRank = 1;
  const results = scores.map((s, idx) => {
    if (idx > 0) {
      const prev = scores[idx - 1];
      if (s.score === prev.score) {
        s.rank = prev.rank;
        s.isTied = true;
      } else {
        currentRank = idx + 1;
        s.rank = currentRank;
        s.isTied = false;
      }
    } else {
      s.rank = 1;
      s.isTied = false;
    }

    return {
      rank: s.rank,
      teamId: s.team_id,
      teamName: s.team_name,
      collegeName: s.college_name,
      captainName: s.captain_name,
      score: Number((s.score || 0).toFixed(2)),
      answersCount: s.answers_count,
      correctCount: s.correct_count,
      wrongCount: s.answers_count - s.correct_count,
      avgSpeedMs: Math.round(s.avg_speed || 0),
      isTied: Boolean(s.isTied)
    };
  });

  return res.json({
    success: true,
    eventRunId,
    eventDate: eventRun.event_date,
    round: {
      id: round.id,
      stageNumber: round.stage_number,
      title: round.title,
      subtitle: round.subtitle,
      description: round.description,
      isTieBreak: Boolean(round.is_tie_break)
    },
    totalQuestions,
    teamsParticipated: results.length,
    results
  });
}

function completeEventRun(req, res) {
  const db = getDb();
  const eventRunId = req.params.eventRunId;

  const eventRun = db.prepare('SELECT * FROM event_runs WHERE event_run_id = ?').get(eventRunId);
  if (!eventRun) {
    return res.status(404).json({ success: false, message: 'Event run not found' });
  }

  const { results: leaderboard } = calculateLeaderboardForEvent(eventRunId);
  const now = new Date();
  const endTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let finalWinner = 'No Winner';
  let finalScore = 0;
  if (leaderboard.length > 0 && leaderboard[0].score > 0) {
    finalWinner = leaderboard[0].teamName;
    finalScore = leaderboard[0].score;
  }

  db.prepare(`
    UPDATE event_runs SET
      status = 'COMPLETED',
      end_time = ?,
      final_winner = ?,
      final_score = ?,
      final_rankings = ?,
      total_teams = ?,
      updated_at = ?
    WHERE event_run_id = ?
  `).run(
    endTime,
    finalWinner,
    finalScore,
    JSON.stringify(leaderboard),
    leaderboard.length,
    now.toISOString(),
    eventRunId
  );

  logAudit('EVENT_RUN_COMPLETED', 'ADMIN_1', req.user.id, {
    eventRunId,
    finalWinner,
    finalScore,
    totalTeams: leaderboard.length
  });

  const updatedRun = db.prepare('SELECT * FROM event_runs WHERE event_run_id = ?').get(eventRunId);
  return res.json({
    success: true,
    message: 'Event run completed successfully',
    eventRun: updatedRun
  });
}

function exportEventCsv(req, res) {
  const db = getDb();
  const eventRunId = req.params.eventRunId;

  const eventRun = db.prepare('SELECT * FROM event_runs WHERE event_run_id = ?').get(eventRunId);
  if (!eventRun) {
    return res.status(404).json({ success: false, message: 'Event run not found' });
  }

  // Get all answers recorded for this specific event run
  const answers = db.prepare(`
    SELECT
      a.submitted_at,
      a.selected_option,
      a.is_correct,
      a.points_awarded,
      a.time_taken_ms,
      r.stage_number,
      r.title as round_title,
      q.question_number,
      q.question_text,
      q.correct_option,
      t.id as team_id,
      t.team_name,
      t.college_name,
      t.captain_name
    FROM answers a
    JOIN rounds r ON a.round_id = r.id
    JOIN questions q ON a.question_id = q.id
    JOIN teams t ON a.team_id = t.id
    WHERE a.event_run_id = ?
    ORDER BY r.stage_number ASC, q.order_index ASC, a.submitted_at ASC
  `).all(eventRunId);

  const { results: overallLeaderboard } = calculateLeaderboardForEvent(eventRunId);
  const teamFinalRankMap = new Map();
  for (const item of overallLeaderboard) {
    teamFinalRankMap.set(item.teamId, item.rank);
  }

  const headers = [
    'Event Date',
    'Event Run ID',
    'Round Number',
    'Round Name',
    'Question Number',
    'Team ID',
    'Team Name',
    'College',
    'Selected Answer',
    'Correct Option',
    'Result',
    'Score Awarded',
    'Time Taken (ms)',
    'Final Event Rank',
    'Winner Status'
  ];

  const rows = [headers.join(',')];

  for (const a of answers) {
    const finalRank = teamFinalRankMap.get(a.team_id) || '—';
    const isWinner = finalRank === 1 ? 'WINNER' : 'PARTICIPANT';

    const row = [
      `"${eventRun.event_date}"`,
      `"${eventRun.event_run_id}"`,
      a.stage_number,
      `"${a.round_title.replace(/"/g, '""')}"`,
      a.question_number,
      a.team_id,
      `"${a.team_name.replace(/"/g, '""')}"`,
      `"${a.college_name.replace(/"/g, '""')}"`,
      `"${a.selected_option}"`,
      `"${a.correct_option}"`,
      a.is_correct ? 'CORRECT' : 'INCORRECT',
      Number(a.points_awarded).toFixed(2),
      a.time_taken_ms,
      finalRank,
      isWinner
    ];
    rows.push(row.join(','));
  }

  const csvContent = rows.join('\r\n');
  const filename = `glitch_hunt_${eventRun.event_run_id}_${eventRun.event_date}.csv`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.status(200).send(csvContent);
}

module.exports = {
  createEventRun,
  getEventRuns,
  getTodayEvent,
  getEventRunDetails,
  getRoundResultDetails,
  completeEventRun,
  exportEventCsv
};
