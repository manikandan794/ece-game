const { getDb } = require('../config/database');
const { stateMachine, EVENT_STATES } = require('../realtime/stateMachine');

/**
 * GET /api/live/overview
 * Returns dynamic list of all rounds, their live status, and current event telemetry.
 * Strictly read-only for public live observer clients.
 */
function getLiveOverview(req, res) {
  try {
    const db = getDb();
    const isTest = stateMachine.isTestingMode ? 1 : 0;
    const currentState = stateMachine.getFullState();

    const rounds = db.prepare(`
      SELECT id, stage_number, stage_type, title, subtitle, description, rules, is_tie_break, scoring_correct, scoring_wrong, order_index, is_enabled
      FROM rounds
      WHERE is_enabled = 1
      ORDER BY order_index ASC
    `).all();

    // Check which rounds have answers in current event run
    const currentRunId = currentState.currentEventRunId;
    const answersQuery = currentRunId
      ? 'SELECT DISTINCT round_id FROM answers WHERE event_run_id = ? AND is_test_answer = ?'
      : 'SELECT DISTINCT round_id FROM answers WHERE is_test_answer = ?';
    const answeredRounds = (currentRunId
      ? db.prepare(answersQuery).all(currentRunId, isTest)
      : db.prepare(answersQuery).all(isTest)
    ).map(r => r.round_id);

    const formattedRounds = rounds.map(r => {
      const qCount = db.prepare('SELECT COUNT(*) as count FROM questions WHERE round_id = ? AND is_active = 1').get(r.id).count;
      
      const distinctAnsweredQCount = db.prepare(`
        SELECT COUNT(DISTINCT question_id) as count 
        FROM answers 
        WHERE round_id = ? AND is_test_answer = ? ${currentRunId ? 'AND event_run_id = ?' : ''}
      `).get(...(currentRunId ? [r.id, isTest, currentRunId] : [r.id, isTest])).count;

      let status = 'UPCOMING';
      let isLiveNow = false;

      if (currentState.stageId === r.id) {
        if (['QUESTION_ACTIVE', 'QUESTION_LOCKED', 'PAUSED', 'READY', 'DESCRIPTION', 'RULES'].includes(currentState.state)) {
          status = 'LIVE';
          isLiveNow = true;
        } else if (['ROUND_COMPLETED', 'RESULT', 'RESULT_COMPLETE'].includes(currentState.state)) {
          status = 'COMPLETED';
        } else if (currentState.state === 'ROUND_STOPPED') {
          status = 'STOPPED';
        } else {
          status = 'ACTIVE';
        }
      } else if (answeredRounds.includes(r.id)) {
        status = 'COMPLETED';
      }

      return {
        id: r.id,
        stage_number: r.stage_number,
        stageNumber: r.stage_number,
        stage_type: r.stage_type,
        stageType: r.stage_type,
        title: r.title,
        subtitle: r.subtitle,
        description: r.description,
        isTieBreak: Boolean(r.is_tie_break),
        questionCount: qCount,
        completedQuestions: distinctAnsweredQCount,
        participantCount: db.prepare(`SELECT COUNT(DISTINCT team_id) as count FROM answers WHERE round_id = ? AND is_test_answer = ?`).get(r.id, isTest).count,
        status,
        liveStatus: status,
        isLiveNow
      };
    });

    // Determine current live round details
    const activeRound = formattedRounds.find(r => r.isLiveNow) || null;

    return res.json({
      success: true,
      serverTime: Date.now(),
      currentState: currentState.state,
      currentStageId: currentState.stageId,
      activeStageId: currentState.stageId,
      currentQuestionId: currentState.questionId,
      activeEventState: currentState,
      activeRound,
      rounds: formattedRounds
    });
  } catch (err) {
    console.error('[LIVE OVERVIEW ERROR]', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve live overview: ' + err.message });
  }
}

/**
 * GET /api/live/round/:roundId
 * Returns full live dashboard details for a specific round:
 * Participating teams, ranks, scores, real-time answer statuses, and active question telemetry.
 */
function getRoundLiveDetails(req, res) {
  try {
    const db = getDb();
    const roundId = Number(req.params.roundId);
    const isTest = stateMachine.isTestingMode ? 1 : 0;
    const currentState = stateMachine.getFullState();

    const round = db.prepare('SELECT * FROM rounds WHERE id = ?').get(roundId);
    if (!round) {
      return res.status(404).json({ success: false, message: 'Round not found' });
    }

    const currentRunId = currentState.currentEventRunId;
    const isLiveNow = Boolean(
      currentState.stageId === round.id && 
      ['QUESTION_ACTIVE', 'QUESTION_LOCKED', 'PAUSED', 'READY'].includes(currentState.state)
    );

    // Total questions in this round
    const questions = db.prepare('SELECT id, question_number, time_limit_sec, is_active FROM questions WHERE round_id = ? AND is_active = 1 ORDER BY order_index ASC').all(round.id);
    const totalQuestions = questions.length;

    // Distinct questions completed so far
    const completedQCount = db.prepare(`
      SELECT COUNT(DISTINCT question_id) as count 
      FROM answers 
      WHERE round_id = ? AND is_test_answer = ? ${currentRunId ? 'AND event_run_id = ?' : ''}
    `).get(...(currentRunId ? [round.id, isTest, currentRunId] : [round.id, isTest])).count;

    // Get all registered teams
    const allTeams = db.prepare(`
      SELECT id, team_name, college_name, captain_name, status 
      FROM teams 
      WHERE is_test_team = ? AND status != 'disabled'
      ORDER BY id ASC
    `).all(isTest);

    // Query scores & stats for this round
    const scoreQuery = currentRunId
      ? `SELECT team_id, SUM(points_awarded) as round_score, COUNT(*) as attempted_count, SUM(is_correct) as correct_count, AVG(time_taken_ms) as avg_speed
         FROM answers WHERE round_id = ? AND is_test_answer = ? AND event_run_id = ? GROUP BY team_id`
      : `SELECT team_id, SUM(points_awarded) as round_score, COUNT(*) as attempted_count, SUM(is_correct) as correct_count, AVG(time_taken_ms) as avg_speed
         FROM answers WHERE round_id = ? AND is_test_answer = ? GROUP BY team_id`;

    const scoreRows = currentRunId
      ? db.prepare(scoreQuery).all(round.id, isTest, currentRunId)
      : db.prepare(scoreQuery).all(round.id, isTest);

    const scoreMap = new Map();
    for (const r of scoreRows) scoreMap.set(r.team_id, r);

    // Check answers for current active question (if currently in this round)
    const activeQuestionAnswers = new Map();
    if (currentState.stageId === round.id && currentState.questionId) {
      const currentAns = db.prepare(`
        SELECT team_id, selected_option, is_correct, is_first_correct, time_taken_ms 
        FROM answers 
        WHERE question_id = ? AND round_id = ? AND is_test_answer = ?
      `).all(currentState.questionId, round.id, isTest);
      for (const a of currentAns) {
        activeQuestionAnswers.set(a.team_id, a);
      }
    }

    // Connected socket sessions
    const { activeTeamSockets } = require('../realtime/socketManager');

    // Build team list
    const teamList = allTeams.map(t => {
      const stats = scoreMap.get(t.id) || { round_score: 0, attempted_count: 0, correct_count: 0, avg_speed: 0 };
      const currentQAns = activeQuestionAnswers.get(t.id);
      const isConnected = activeTeamSockets ? activeTeamSockets.has(t.id) : false;

      // Determine objective live status
      let liveStatus = 'WAITING';
      if (t.status === 'disqualified') {
        liveStatus = 'ELIMINATED';
      } else if (isLiveNow && currentState.questionId) {
        if (currentQAns) {
          if (currentQAns.is_first_correct || currentState.firstCorrectTeamId === t.id) {
            liveStatus = 'FIRST_CORRECT';
          } else if (currentQAns.is_correct) {
            liveStatus = 'ANSWERED';
          } else {
            liveStatus = 'INCORRECT';
          }
        } else if (currentState.state === 'QUESTION_LOCKED') {
          liveStatus = 'LOCKED';
        } else if (isConnected) {
          liveStatus = 'ACTIVE';
        } else {
          liveStatus = 'WAITING';
        }
      } else if (currentState.state === 'ROUND_COMPLETED' || currentState.state === 'RESULT' || currentState.state === 'RESULT_COMPLETE') {
        liveStatus = 'COMPLETED';
      } else if (isConnected) {
        liveStatus = 'ACTIVE';
      }

      return {
        id: t.id,
        teamId: t.id,
        team_id: t.id,
        teamName: t.team_name,
        team_name: t.team_name,
        college: t.college_name,
        collegeName: t.college_name,
        college_name: t.college_name,
        captainName: t.captain_name,
        captain_name: t.captain_name,
        teamStatus: t.status,
        qualificationStatus: t.status,
        qualification_status: t.status,
        score: Number((stats.round_score || 0).toFixed(2)),
        correctAnswers: stats.correct_count || 0,
        correct_answers: stats.correct_count || 0,
        questionsAttempted: stats.attempted_count || 0,
        questions_attempted: stats.attempted_count || 0,
        avgSpeedMs: Math.round(stats.avg_speed || 0),
        avg_speed_ms: Math.round(stats.avg_speed || 0),
        liveStatus,
        live_status: liveStatus,
        progress: `${stats.attempted_count || 0} / ${totalQuestions}`,
        currentQuestionAnswered: Boolean(currentQAns),
        currentQuestionCorrect: currentQAns ? Boolean(currentQAns.is_correct) : null,
        isFirstCorrectWinner: Boolean(currentQAns?.is_first_correct || currentState.firstCorrectTeamId === t.id)
      };
    });

    // Rank teams by score DESC, then correctAnswers DESC, then avgSpeedMs ASC
    teamList.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.correctAnswers !== a.correctAnswers) return b.correctAnswers - a.correctAnswers;
      return a.avgSpeedMs - b.avgSpeedMs;
    });

    let currentRank = 1;
    for (let i = 0; i < teamList.length; i++) {
      if (i > 0 && teamList[i].score === teamList[i - 1].score) {
        teamList[i].rank = teamList[i - 1].rank;
        teamList[i].isTied = true;
        teamList[i - 1].isTied = true;
      } else {
        currentRank = i + 1;
        teamList[i].rank = currentRank;
        teamList[i].isTied = false;
      }

      // Assign qualification status
      if (teamList[i].teamStatus === 'disqualified') {
        teamList[i].qualificationStatus = 'Eliminated';
      } else if (teamList[i].rank <= 3) {
        teamList[i].qualificationStatus = 'Qualified';
      } else {
        teamList[i].qualificationStatus = 'In Contention';
      }
    }

    // Top leader stats
    const currentLeader = teamList.length > 0 ? teamList[0].teamName : 'None';
    const highestScore = teamList.length > 0 ? teamList[0].score : 0;

    // Active Question Monitoring telemetry
    let activeQuestionTelemetry = null;
    if (isLiveNow && currentState.questionId) {
      const q = db.prepare('SELECT id, question_number, time_limit_sec, question_text, option_a, option_b, option_c, option_d FROM questions WHERE id = ?').get(currentState.questionId);
      if (q) {
        const showTextSetting = db.prepare("SELECT value FROM settings WHERE key = 'live_show_question_text'").get();
        const showText = showTextSetting && showTextSetting.value === 'true';

        let remainingSec = 0;
        if (currentState.state === 'QUESTION_LOCKED' && currentState.timerPausedRemainingMs) {
          remainingSec = Math.max(0, Math.ceil(currentState.timerPausedRemainingMs / 1000));
        } else if (currentState.timerEndsAt) {
          remainingSec = Math.max(0, Math.ceil((currentState.timerEndsAt - Date.now()) / 1000));
        }

        activeQuestionTelemetry = {
          questionId: q.id,
          questionNumber: q.question_number,
          timeLimitSec: q.time_limit_sec,
          timeRemainingSec: remainingSec,
          status: currentState.state === 'QUESTION_LOCKED' ? 'LOCKED' : (currentState.state === 'PAUSED' ? 'PAUSED' : 'LIVE'),
          isLocked: currentState.state === 'QUESTION_LOCKED',
          firstCorrectWinner: currentState.firstCorrectTeamName || null,
          firstCorrectTeamId: currentState.firstCorrectTeamId || null,
          questionText: showText ? q.question_text : null,
          isTextMasked: !showText,
          options: {
            A: q.option_a,
            B: q.option_b,
            C: q.option_c,
            D: q.option_d
          }
        };
      }
    }

    return res.json({
      success: true,
      round: {
        id: round.id,
        stageNumber: round.stage_number,
        stageType: round.stage_type,
        title: round.title,
        subtitle: round.subtitle,
        description: round.description,
        isTieBreak: Boolean(round.is_tie_break),
        scoringCorrect: round.scoring_correct,
        scoringWrong: round.scoring_wrong
      },
      stats: {
        participatingTeams: teamList.length,
        totalQuestions,
        completedQuestions: completedQCount,
        totalAnswers: db.prepare(`SELECT COUNT(*) as count FROM answers WHERE round_id = ? AND is_test_answer = ?`).get(round.id, isTest).count
      },
      leaderboard: {
        leaderTeamName: currentLeader,
        highestScore
      },
      isLiveNow,
      currentStatus: isLiveNow ? (currentState.state === 'QUESTION_LOCKED' ? 'QUESTION_LOCKED' : 'LIVE') : 'STANDBY',
      participatingTeamsCount: teamList.length,
      totalQuestions,
      completedQuestions: completedQCount,
      currentQuestionNumber: activeQuestionTelemetry ? activeQuestionTelemetry.questionNumber : null,
      currentLeader,
      highestScore,
      activeQuestion: activeQuestionTelemetry,
      teams: teamList
    });
  } catch (err) {
    console.error('[ROUND LIVE DETAILS ERROR]', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve round live details: ' + err.message });
  }
}

module.exports = {
  getLiveOverview,
  getRoundLiveDetails
};
