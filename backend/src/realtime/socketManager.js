const { Server } = require('socket.io');
const { verifySocketToken } = require('../middleware/authMiddleware');
const { getDb } = require('../config/database');
const { stateMachine, EVENT_STATES } = require('./stateMachine');
const TimerEngine = require('./timerEngine');
const { logAudit } = require('../utils/logger');

let io = null;
let timerEngine = null;

// Track active connections: socketId -> { role, teamId, teamName, ip }
const activeSockets = new Map();
// Track active team sockets: teamId -> socketId
const activeTeamSockets = new Map();

function setupSocketIO(httpServer) {
  const frontendUrls = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map(u => u.trim().replace(/\/$/, '')).filter(Boolean)
    : [];

  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const normalized = origin.replace(/\/$/, '');
        if (!process.env.FRONTEND_URL || process.env.FRONTEND_URL === '*' || process.env.NODE_ENV !== 'production') {
          return callback(null, true);
        }
        if (frontendUrls.includes(normalized)) {
          return callback(null, true);
        }
        if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/.test(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`Socket.IO CORS blocked origin: ${origin}`));
      },
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingInterval: 10000,
    pingTimeout: 5000
  });

  timerEngine = new TimerEngine(
    () => io,
    stateMachine,
    (questionId, stageId) => handleTimeUp(questionId, stageId)
  );

  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token 
      ? socket.handshake.auth.token 
      : socket.handshake.query && socket.handshake.query.token;

    // Allow anonymous projector / guest / live viewer connections
    if (!token) {
      const qRole = socket.handshake.query && socket.handshake.query.role;
      const aRole = socket.handshake.auth && socket.handshake.auth.role;
      const targetRole = aRole || qRole;
      const isProjector = targetRole === 'projector';
      const isLive = targetRole === 'live';
      socket.user = {
        role: isProjector ? 'projector' : (isLive ? 'live' : 'guest'),
        id: socket.id,
        name: isProjector ? 'Projector Display' : (isLive ? 'Live Monitor' : 'Guest')
      };
      return next();
    }

    const decoded = verifySocketToken(token);
    if (!decoded) {
      return next(new Error('Authentication failed'));
    }

    socket.user = decoded;
    next();
  });

  io.on('connection', (socket) => {
    handleConnection(socket);
  });

  return { io, timerEngine };
}

function getIo() {
  return io;
}

function getTimerEngine() {
  return timerEngine;
}

function handleConnection(socket) {
  const user = socket.user;
  const ip = socket.handshake.address;

  activeSockets.set(socket.id, {
    role: user.role,
    userId: user.id,
    name: user.name || user.team_name || user.username,
    ip,
    connectedAt: Date.now()
  });

  if (user.role === 'team') {
    handleTeamJoin(socket, user, ip);
  } else if (user.role === 'admin_1') {
    socket.join('room:admin1');
    sendFullStateToSocket(socket);
    broadcastAdminStats();
  } else if (user.role === 'admin_2') {
    socket.join('room:admin2');
    socket.join('room:projector');
    sendFullStateToSocket(socket);
    broadcastAdminStats();
  } else if (user.role === 'projector') {
    socket.join('room:projector');
    sendFullStateToSocket(socket);
    broadcastAdminStats();
  } else if (user.role === 'live' || user.role === 'guest') {
    socket.join('room:live');
    sendLiveStateToSocket(socket);
  }

  // Register socket event listeners
  socket.on('disconnect', (reason) => {
    handleDisconnect(socket, reason);
  });

  socket.on('answer:submit', (data, callback) => {
    handleAnswerSubmission(socket, data, callback);
  });

  socket.on('anticheat:violation', (data) => {
    handleAntiCheatViolation(socket, data);
  });

  socket.on('admin:control', (payload, callback) => {
    handleAdminControl(socket, payload, callback);
  });

  socket.on('state:request', () => {
    if (socket.user.role === 'team') {
      sendSanitizedStateToTeam(socket, socket.user.id);
    } else if (socket.user.role === 'live' || socket.user.role === 'guest') {
      sendLiveStateToSocket(socket);
    } else {
      sendFullStateToSocket(socket);
    }
  });

  socket.on('live:getState', (callback) => {
    const rawState = stateMachine.getFullState();
    const db = getDb();
    let questionData = null;
    if (rawState.questionId) {
      const q = db.prepare('SELECT id, round_id, question_number, option_a, option_b, option_c, option_d, time_limit_sec, question_text FROM questions WHERE id = ?').get(rawState.questionId);
      if (q) {
        const showTextSetting = db.prepare("SELECT value FROM settings WHERE key = 'live_show_question_text'").get();
        const showLiveText = showTextSetting && showTextSetting.value === 'true';
        questionData = {
          id: q.id,
          round_id: q.round_id,
          question_number: q.question_number,
          option_a: q.option_a,
          option_b: q.option_b,
          option_c: q.option_c,
          option_d: q.option_d,
          time_limit_sec: q.time_limit_sec,
          isTextMasked: !showLiveText
        };
        if (showLiveText) {
          questionData.question_text = q.question_text;
        }
      }
    }

    let stageData = null;
    if (rawState.stageId) {
      stageData = db.prepare('SELECT * FROM rounds WHERE id = ?').get(rawState.stageId);
      if (stageData && stageData.rules) {
        try { stageData.rules = JSON.parse(stageData.rules); } catch (e) {}
      }
    }

    const statePayload = {
      ...rawState,
      stage: stageData,
      question: questionData,
      leaderboard: getAuthoritativeLeaderboard(rawState.stageId)
    };

    if (typeof callback === 'function') {
      callback({ success: true, state: statePayload });
    } else {
      socket.emit('live:state', statePayload);
    }
  });
}

function handleTeamJoin(socket, user, ip) {
  const db = getDb();
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(user.id);

  if (!team) {
    socket.emit('auth:error', { message: 'Team not found' });
    socket.disconnect();
    return;
  }

  if (team.status === 'disqualified') {
    socket.emit('auth:error', { message: 'Your team has been disqualified.' });
    socket.disconnect();
    return;
  }

  // Single active device check
  const existingSocketId = activeTeamSockets.get(team.id);
  if (existingSocketId && existingSocketId !== socket.id) {
    const existingSocket = io.sockets.sockets.get(existingSocketId);
    if (existingSocket) {
      // Record duplicate session violation
      recordViolation(team.id, 'MULTIPLE_DEVICE_LOGIN', `Simultaneous login attempted from IP ${ip}`, null, null);
      
      // Check block_duplicate_sessions setting
      const blockDuplicate = db.prepare("SELECT value FROM settings WHERE key = 'block_duplicate_sessions'").get();
      if (!blockDuplicate || blockDuplicate.value === 'true') {
        // Disconnect earlier session and log warning
        existingSocket.emit('session:superseded', { message: 'Another device connected with this team account.' });
        existingSocket.disconnect();
      }
    }
  }

  activeTeamSockets.set(team.id, socket.id);
  socket.join('room:teams');
  socket.join(`room:team:${team.id}`);

  // Update session record in DB
  const updateSession = db.prepare(`
    INSERT INTO team_sessions (team_id, session_token, socket_id, ip_address, device_info, is_active, last_heartbeat, created_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `);
  try {
    updateSession.run(team.id, socket.id, socket.id, ip, socket.handshake.headers['user-agent'] || 'Unknown', new Date().toISOString(), new Date().toISOString());
  } catch (err) {
    // Ignore duplicate session key
  }

  // Send team-tailored sanitized state (NO QUESTION TEXT)
  sendSanitizedStateToTeam(socket, team.id);
  broadcastAdminStats();
}

function handleDisconnect(socket, reason) {
  const session = activeSockets.get(socket.id);
  if (session && session.role === 'team') {
    if (activeTeamSockets.get(session.userId) === socket.id) {
      activeTeamSockets.delete(session.userId);
    }
  }
  activeSockets.delete(socket.id);
  broadcastAdminStats();
}

/**
 * Sends SANITIZED state to a team socket.
 * STRICTLY OMITS question_text to guarantee question is read ONLY from projector.
 */
function sendSanitizedStateToTeam(socket, teamId) {
  const db = getDb();
  const rawState = stateMachine.getFullState();

  let questionMetadata = null;
  let hasSubmitted = false;
  let submittedOption = null;

  if (rawState.questionId) {
    const q = db.prepare('SELECT id, round_id, question_number, option_a, option_b, option_c, option_d, time_limit_sec FROM questions WHERE id = ?').get(rawState.questionId);
    if (q) {
      // Check if this team already submitted
      const ans = db.prepare('SELECT selected_option, is_correct, is_first_correct FROM answers WHERE team_id = ? AND question_id = ? AND is_test_answer = ?')
        .get(teamId, q.id, rawState.isTestingMode ? 1 : 0);
      
      var isCorrect = null;
      var isFirstCorrectWinner = false;
      if (ans) {
        hasSubmitted = true;
        submittedOption = ans.selected_option;
        isCorrect = Boolean(ans.is_correct);
        isFirstCorrectWinner = Boolean(ans.is_first_correct);
      }

      // NOTE: NO question_text included here!
      questionMetadata = {
        questionId: q.id,
        roundId: q.round_id,
        questionNumber: q.question_number,
        options: {
          A: q.option_a,
          B: q.option_b,
          C: q.option_c,
          D: q.option_d
        },
        timeLimitSec: q.time_limit_sec
      };
    }
  }

  let stageMetadata = null;
  if (rawState.stageId) {
    const stage = db.prepare('SELECT id, stage_number, stage_type, title, subtitle, rules, description FROM rounds WHERE id = ?').get(rawState.stageId);
    if (stage) {
      stageMetadata = {
        id: stage.id,
        stageNumber: stage.stage_number,
        title: stage.title,
        subtitle: stage.subtitle,
        rules: stage.rules ? JSON.parse(stage.rules) : [],
        description: stage.description
      };
    }
  }

  socket.emit('state:sync', {
    state: rawState.state,
    stage: stageMetadata,
    question: questionMetadata,
    hasSubmitted,
    submittedOption,
    isCorrect,
    isFirstCorrectWinner: isFirstCorrectWinner || (rawState.firstCorrectTeamId === teamId),
    firstCorrectTeamId: rawState.firstCorrectTeamId,
    firstCorrectTeamName: rawState.firstCorrectTeamName,
    questionLockedAt: rawState.questionLockedAt,
    timer: {
      serverTime: Date.now(),
      startedAt: rawState.timerStartedAt,
      endsAt: rawState.timerEndsAt,
      pausedRemainingMs: rawState.timerPausedRemainingMs,
      isPaused: rawState.state === 'PAUSED' || rawState.state === 'QUESTION_LOCKED',
      isFrozen: rawState.state === 'QUESTION_LOCKED'
    }
  });
}

/**
 * Computes authoritative leaderboard strictly from database answers and scores
 */
function getAuthoritativeLeaderboard(roundId = null) {
  const db = getDb();
  const isTest = stateMachine.isTestingMode ? 1 : 0;
  const currentEventRunId = stateMachine.currentEventRunId;
  const teams = db.prepare('SELECT id, team_name, college_name, captain_name, status FROM teams WHERE is_test_team = ?').all(isTest);

  let scoreRows;
  if (currentEventRunId) {
    const scoreQuery = roundId
      ? `SELECT team_id, SUM(points_awarded) as round_score, COUNT(*) as answers_count, SUM(is_correct) as correct_count, AVG(time_taken_ms) as avg_speed
         FROM answers WHERE round_id = ? AND is_test_answer = ? AND event_run_id = ? GROUP BY team_id`
      : `SELECT team_id, SUM(points_awarded) as round_score, COUNT(*) as answers_count, SUM(is_correct) as correct_count, AVG(time_taken_ms) as avg_speed
         FROM answers WHERE is_test_answer = ? AND event_run_id = ? GROUP BY team_id`;
    scoreRows = roundId ? db.prepare(scoreQuery).all(roundId, isTest, currentEventRunId) : db.prepare(scoreQuery).all(isTest, currentEventRunId);
  } else {
    const scoreQuery = roundId
      ? `SELECT team_id, SUM(points_awarded) as round_score, COUNT(*) as answers_count, SUM(is_correct) as correct_count, AVG(time_taken_ms) as avg_speed
         FROM answers WHERE round_id = ? AND is_test_answer = ? GROUP BY team_id`
      : `SELECT team_id, SUM(points_awarded) as round_score, COUNT(*) as answers_count, SUM(is_correct) as correct_count, AVG(time_taken_ms) as avg_speed
         FROM answers WHERE is_test_answer = ? GROUP BY team_id`;
    scoreRows = roundId ? db.prepare(scoreQuery).all(roundId, isTest) : db.prepare(scoreQuery).all(isTest);
  }
  const scoreMap = new Map();
  for (const r of scoreRows) scoreMap.set(r.team_id, r);

  const results = teams.map(t => {
    const s = scoreMap.get(t.id) || { round_score: 0, answers_count: 0, correct_count: 0, avg_speed: 0 };
    return {
      teamId: t.id,
      teamName: t.team_name,
      collegeName: t.college_name,
      captainName: t.captain_name,
      status: t.status,
      score: Number((s.round_score || 0).toFixed(2)),
      answersCount: s.answers_count || 0,
      correctCount: s.correct_count || 0,
      avgSpeedMs: Math.round(s.avg_speed || 0)
    };
  });

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
    return a.avgSpeedMs - b.avgSpeedMs;
  });

  let currentRank = 1;
  let hasTies = false;
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
        hasTies = true;
        currentTie.push(curr);
      } else {
        if (currentTie.length > 1) tiedGroups.push([...currentTie]);
        currentTie = [curr];
        currentRank = i + 1;
        curr.rank = currentRank;
        curr.isTied = false;
      }
    } else {
      if (results.length > 0) {
        results[0].rank = 1;
        results[0].isTied = false;
        currentTie = [results[0]];
      }
    }
  }
  if (currentTie.length > 1) {
    tiedGroups.push(currentTie);
    hasTies = true;
  }

  return { results, hasTies, tiedGroups };
}

/**
 * Sends FULL state (with question_text) to projector / admin devices.
 */
function sendFullStateToSocket(socket) {
  const db = getDb();
  const rawState = stateMachine.getFullState();

  let questionData = null;
  if (rawState.questionId) {
    questionData = db.prepare('SELECT * FROM questions WHERE id = ?').get(rawState.questionId);
  }

  let stageData = null;
  if (rawState.stageId) {
    stageData = db.prepare('SELECT * FROM rounds WHERE id = ?').get(rawState.stageId);
    if (stageData && stageData.rules) {
      try {
        stageData.rules = JSON.parse(stageData.rules);
      } catch (e) {}
    }
  }

  // Answer statistics for projector / admin
  let answerStats = { totalAnswered: 0, optionCounts: { A: 0, B: 0, C: 0, D: 0 } };
  if (rawState.questionId) {
    const answers = db.prepare('SELECT selected_option FROM answers WHERE question_id = ? AND is_test_answer = ?')
      .all(rawState.questionId, rawState.isTestingMode ? 1 : 0);
    answerStats.totalAnswered = answers.length;
    for (const a of answers) {
      if (answerStats.optionCounts[a.selected_option] !== undefined) {
        answerStats.optionCounts[a.selected_option]++;
      }
    }
  }

  let leaderboardData = null;
  if (rawState.state === 'ROUND_COMPLETED' || rawState.state === 'RESULT' || rawState.state === 'TIE_BREAK') {
    leaderboardData = getAuthoritativeLeaderboard(rawState.stageId);
  }

  socket.emit('state:sync', {
    ...rawState,
    stage: stageData,
    question: questionData,
    answerStats,
    leaderboard: leaderboardData,
    firstCorrectTeamId: rawState.firstCorrectTeamId,
    firstCorrectTeamName: rawState.firstCorrectTeamName,
    questionLockedAt: rawState.questionLockedAt,
    timer: {
      serverTime: Date.now(),
      startedAt: rawState.timerStartedAt,
      endsAt: rawState.timerEndsAt,
      pausedRemainingMs: rawState.timerPausedRemainingMs,
      isPaused: rawState.state === 'PAUSED' || rawState.state === 'QUESTION_LOCKED',
      isFrozen: rawState.state === 'QUESTION_LOCKED'
    }
  });
}

/**
 * Sends LIVE monitoring state to public observer sockets.
 * STRICTLY OMITS or MASKS question_text unless live_show_question_text is enabled.
 */
function sendLiveStateToSocket(socket) {
  const db = getDb();
  const rawState = stateMachine.getFullState();

  let questionData = null;
  if (rawState.questionId) {
    const q = db.prepare('SELECT id, round_id, question_number, option_a, option_b, option_c, option_d, time_limit_sec, question_text FROM questions WHERE id = ?').get(rawState.questionId);
    if (q) {
      const showTextSetting = db.prepare("SELECT value FROM settings WHERE key = 'live_show_question_text'").get();
      const showLiveText = showTextSetting && showTextSetting.value === 'true';
      questionData = {
        id: q.id,
        round_id: q.round_id,
        question_number: q.question_number,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        time_limit_sec: q.time_limit_sec,
        question_text: showLiveText ? q.question_text : undefined,
        isTextMasked: !showLiveText
      };
    }
  }

  let stageData = null;
  if (rawState.stageId) {
    stageData = db.prepare('SELECT * FROM rounds WHERE id = ?').get(rawState.stageId);
    if (stageData && stageData.rules) {
      try { stageData.rules = JSON.parse(stageData.rules); } catch (e) {}
    }
  }

  let leaderboardData = getAuthoritativeLeaderboard(rawState.stageId);

  socket.emit('state:sync', {
    ...rawState,
    stage: stageData,
    question: questionData,
    leaderboard: leaderboardData,
    firstCorrectTeamId: rawState.firstCorrectTeamId,
    firstCorrectTeamName: rawState.firstCorrectTeamName,
    questionLockedAt: rawState.questionLockedAt,
    timer: {
      serverTime: Date.now(),
      startedAt: rawState.timerStartedAt,
      endsAt: rawState.timerEndsAt,
      pausedRemainingMs: rawState.timerPausedRemainingMs,
      isPaused: rawState.state === 'PAUSED' || rawState.state === 'QUESTION_LOCKED',
      isFrozen: rawState.state === 'QUESTION_LOCKED'
    }
  });
}

function broadcastStateChange() {
  if (!io) return;

  const rawState = stateMachine.getFullState();
  const db = getDb();

  // 1. Broadcast to Projector and Admins (FULL data with question text)
  let questionData = null;
  if (rawState.questionId) {
    questionData = db.prepare('SELECT * FROM questions WHERE id = ?').get(rawState.questionId);
  }

  let stageData = null;
  if (rawState.stageId) {
    stageData = db.prepare('SELECT * FROM rounds WHERE id = ?').get(rawState.stageId);
    if (stageData && stageData.rules) {
      try { stageData.rules = JSON.parse(stageData.rules); } catch (e) {}
    }
  }

  let leaderboardData = null;
  if (rawState.state === 'ROUND_COMPLETED' || rawState.state === 'RESULT' || rawState.state === 'TIE_BREAK') {
    leaderboardData = getAuthoritativeLeaderboard(rawState.stageId);
  }

  const fullPayload = {
    ...rawState,
    stage: stageData,
    question: questionData,
    leaderboard: leaderboardData,
    firstCorrectTeamId: rawState.firstCorrectTeamId,
    firstCorrectTeamName: rawState.firstCorrectTeamName,
    questionLockedAt: rawState.questionLockedAt,
    timer: {
      serverTime: Date.now(),
      startedAt: rawState.timerStartedAt,
      endsAt: rawState.timerEndsAt,
      pausedRemainingMs: rawState.timerPausedRemainingMs,
      isPaused: rawState.state === 'PAUSED' || rawState.state === 'QUESTION_LOCKED',
      isFrozen: rawState.state === 'QUESTION_LOCKED'
    }
  };

  io.to('room:admin1').to('room:admin2').to('room:projector').emit('state:sync', fullPayload);

  // 1.5 Broadcast to LIVE monitoring page (Question text protected unless configured)
  const showTextSetting = db.prepare("SELECT value FROM settings WHERE key = 'live_show_question_text'").get();
  const showLiveText = showTextSetting && showTextSetting.value === 'true';

  let liveQuestionData = null;
  if (questionData) {
    liveQuestionData = {
      ...questionData,
      question_text: showLiveText ? questionData.question_text : null,
      isTextMasked: !showLiveText
    };
  }

  const livePayload = {
    ...rawState,
    stage: stageData,
    question: liveQuestionData,
    leaderboard: leaderboardData || getAuthoritativeLeaderboard(rawState.stageId),
    firstCorrectTeamId: rawState.firstCorrectTeamId,
    firstCorrectTeamName: rawState.firstCorrectTeamName,
    questionLockedAt: rawState.questionLockedAt,
    timer: {
      serverTime: Date.now(),
      startedAt: rawState.timerStartedAt,
      endsAt: rawState.timerEndsAt,
      pausedRemainingMs: rawState.timerPausedRemainingMs,
      isPaused: rawState.state === 'PAUSED' || rawState.state === 'QUESTION_LOCKED',
      isFrozen: rawState.state === 'QUESTION_LOCKED'
    }
  };

  io.to('room:live').emit('state:sync', livePayload);

  // 2. Broadcast to Teams (SANITIZED: strictly NO question text)
  for (const [teamId, socketId] of activeTeamSockets.entries()) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      sendSanitizedStateToTeam(socket, teamId);
    }
  }

  broadcastAdminStats();
}

function handleAnswerSubmission(socket, data, callback) {
  const cb = typeof callback === 'function' ? callback : () => {};

  if (!socket.user || socket.user.role !== 'team') {
    return cb({ success: false, message: 'Unauthorized. Only registered teams can submit answers.' });
  }

  const teamId = socket.user.id;
  const { questionId, selectedOption, roundId } = data;

  if (!['A', 'B', 'C', 'D'].includes(selectedOption)) {
    return cb({ success: false, message: 'Invalid option selected.' });
  }

  if (stateMachine.currentState === 'QUESTION_LOCKED') {
    return cb({
      success: false,
      locked: true,
      code: 'QUESTION_ALREADY_LOCKED',
      message: 'Question is already locked. First correct answer has been received.'
    });
  }

  if (stateMachine.currentState !== 'QUESTION_ACTIVE') {
    return cb({ success: false, message: `Cannot submit answer. Question is currently ${stateMachine.currentState}.` });
  }

  if (stateMachine.currentQuestionId !== Number(questionId)) {
    return cb({ success: false, message: 'Question ID mismatch with active server question.' });
  }

  if (!timerEngine.isSubmissionAllowed()) {
    if (stateMachine.currentState === 'QUESTION_LOCKED') {
      return cb({
        success: false,
        locked: true,
        code: 'QUESTION_ALREADY_LOCKED',
        message: 'Question is already locked. First correct answer has been received.'
      });
    }
    return cb({ success: false, message: 'Time up! Answers are closed for this question.' });
  }

  const db = getDb();
  const isTesting = stateMachine.isTestingMode ? 1 : 0;
  const targetRoundId = roundId || stateMachine.currentStageId;

  // Check buzzer mode setting (default enabled)
  const lockSetting = db.prepare("SELECT value FROM settings WHERE key = 'first_correct_lock'").get();
  const isBuzzerMode = !lockSetting || lockSetting.value === 'true' || lockSetting.value === '1';

  // Fast check: If buzzer mode and question is already won by first correct answer
  if (isBuzzerMode) {
    const alreadyWon = db.prepare(`
      SELECT id, team_id FROM answers 
      WHERE question_id = ? AND round_id = ? AND is_correct = 1 AND is_test_answer = ?
      LIMIT 1
    `).get(questionId, targetRoundId, isTesting);

    if (alreadyWon) {
      return cb({
        success: false,
        locked: true,
        code: 'QUESTION_ALREADY_LOCKED',
        message: 'Question is already locked. First correct answer has been received.'
      });
    }
  }

  // Check if team already submitted
  const existing = db.prepare(`
    SELECT id FROM answers 
    WHERE team_id = ? AND round_id = ? AND question_id = ? AND is_test_answer = ?
  `).get(teamId, targetRoundId, questionId, isTesting);

  if (existing) {
    return cb({ success: false, message: 'Answer already submitted for this question.' });
  }

  // Get question details to evaluate correctness
  const question = db.prepare('SELECT correct_option FROM questions WHERE id = ?').get(questionId);
  if (!question) {
    return cb({ success: false, message: 'Question not found.' });
  }

  // Get round scoring details
  const round = db.prepare('SELECT scoring_correct, scoring_wrong FROM rounds WHERE id = ?').get(targetRoundId);
  const isCorrect = selectedOption === question.correct_option ? 1 : 0;
  const points = isCorrect ? (round ? round.scoring_correct : 1.0) : (round ? round.scoring_wrong : 0.0);

  const now = new Date().toISOString();
  const timeTakenMs = stateMachine.timerStartedAt ? Math.max(0, Date.now() - stateMachine.timerStartedAt) : 0;

  // Atomically process answer inside a database transaction to prevent any race condition
  let txResult;
  try {
    const processTx = db.transaction(() => {
      // 1. Re-check if question is already locked in event_state
      const st = db.prepare('SELECT state FROM event_state WHERE id = 1').get();
      if (st && st.state === 'QUESTION_LOCKED') {
        return { locked: true };
      }

      // 2. If buzzer mode and answer is correct, ensure no other correct answer was committed
      if (isBuzzerMode && isCorrect) {
        const raceCheck = db.prepare(`
          SELECT id FROM answers 
          WHERE question_id = ? AND round_id = ? AND is_correct = 1 AND is_test_answer = ?
          LIMIT 1
        `).get(questionId, targetRoundId, isTesting);

        if (raceCheck) {
          return { locked: true };
        }
      }

      // 3. Re-check duplicate submission for this team
      const dupCheck = db.prepare(`
        SELECT id FROM answers 
        WHERE team_id = ? AND round_id = ? AND question_id = ? AND is_test_answer = ?
      `).get(teamId, targetRoundId, questionId, isTesting);

      if (dupCheck) {
        return { duplicate: true };
      }

      const insert = db.prepare(`
        INSERT INTO answers (team_id, round_id, question_id, selected_option, submitted_at, server_received_at, time_taken_ms, is_correct, points_awarded, is_test_answer, event_run_id, is_first_correct)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const res = insert.run(
        teamId,
        targetRoundId,
        questionId,
        selectedOption,
        now,
        now,
        timeTakenMs,
        isCorrect,
        points,
        isTesting,
        stateMachine.currentEventRunId || null,
        (isBuzzerMode && isCorrect) ? 1 : 0
      );

      return {
        success: true,
        answerId: res.lastInsertRowid,
        isFirstCorrect: Boolean(isBuzzerMode && isCorrect)
      };
    });

    txResult = processTx();
  } catch (err) {
    console.error('[ANSWER SUBMISSION ERROR]', err);
    return cb({ success: false, message: 'Error recording answer: ' + err.message });
  }

  if (txResult.locked) {
    return cb({
      success: false,
      locked: true,
      code: 'QUESTION_ALREADY_LOCKED',
      message: 'Question is already locked. First correct answer has been received.'
    });
  }

  if (txResult.duplicate) {
    return cb({ success: false, message: 'Answer already submitted for this question.' });
  }

  const team = db.prepare('SELECT team_name, college_name FROM teams WHERE id = ?').get(teamId);
  const teamName = team ? team.team_name : (socket.user.name || socket.user.team_name || `Team #${teamId}`);
  const collegeName = team ? team.college_name : '';

  logAudit('ANSWER_SUBMITTED', 'TEAM', teamId, {
    questionId,
    selectedOption,
    isCorrect,
    points,
    timeTakenMs,
    isFirstCorrect: txResult.isFirstCorrect
  });

  // CASE A: FIRST VALID ANSWER IS CORRECT
  if (txResult.isFirstCorrect) {
    // 1 & 2. Change state to QUESTION_LOCKED with team info
    stateMachine.transitionTo(EVENT_STATES.QUESTION_LOCKED, {
      firstCorrectTeamId: teamId,
      firstCorrectTeamName: teamName,
      questionLockedAt: now
    }, true);

    // 3. Freeze timer immediately
    timerEngine.freezeTimer();
    const frozenRemainingSec = Math.max(0, Math.ceil((stateMachine.timerPausedRemainingMs || 0) / 1000));

    // 4 & 5. Broadcast locked event to all clients
    const lockPayload = {
      questionId: Number(questionId),
      winnerTeamId: teamId,
      firstCorrectTeamId: teamId,
      winnerTeamName: teamName,
      firstCorrectTeamName: teamName,
      winnerCollege: collegeName,
      selectedOption,
      timeTakenMs,
      frozenRemainingSec,
      serverTime: Date.now()
    };

    io.emit('question:locked', lockPayload);
    io.to('room:admin1').to('room:admin2').to('room:projector').to('room:live').emit('participant:first_correct', lockPayload);
    broadcastStateChange();

    return cb({
      success: true,
      isFirstCorrect: true,
      isCorrect: true,
      selectedOption,
      message: '🏆 FIRST CORRECT! Answer accepted and question locked.'
    });
  }

  // CASE B: TEAM SUBMITS WRONG ANSWER (OR BUZZER MODE DISABLED)
  cb({
    success: true,
    isFirstCorrect: false,
    isCorrect: Boolean(isCorrect),
    selectedOption,
    message: isCorrect ? 'Answer submitted successfully' : '❌ INCORRECT. Wait for the next question.'
  });

  // Notify projector, live, and admins
  io.to('room:admin1').to('room:admin2').to('room:projector').to('room:live').emit('participant:answered', {
    teamId,
    teamName,
    collegeName,
    questionId,
    isCorrect,
    timeTakenMs
  });

  broadcastAdminStats();
}

function handleAntiCheatViolation(socket, data) {
  if (!socket.user || socket.user.role !== 'team') return;

  const teamId = socket.user.id;
  const { type, details } = data;
  recordViolation(teamId, type, details, stateMachine.currentStageId, stateMachine.currentQuestionId);
}

function recordViolation(teamId, type, details, stageId, questionId) {
  const db = getDb();
  const now = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO violations (team_id, violation_type, details, round_id, question_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(teamId, type, details || '', stageId, questionId, now);

    const team = db.prepare('SELECT team_name FROM teams WHERE id = ?').get(teamId);
    const violationCount = db.prepare('SELECT COUNT(*) as count FROM violations WHERE team_id = ?').get(teamId).count;

    logAudit('ANTI_CHEAT_VIOLATION', 'TEAM', teamId, { type, details, count: violationCount });

    // Check policy: AUTO_DISQUALIFY if threshold reached
    const policy = db.prepare("SELECT value FROM settings WHERE key = 'anti_cheat_policy'").get();
    const maxViolations = db.prepare("SELECT value FROM settings WHERE key = 'max_violations_allowed'").get();
    const threshold = maxViolations ? parseInt(maxViolations.value, 10) : 3;

    if (policy && policy.value === 'AUTO_DISQUALIFY' && violationCount >= threshold) {
      db.prepare("UPDATE teams SET status = 'disqualified' WHERE id = ?").run(teamId);
      logAudit('TEAM_AUTO_DISQUALIFIED', 'SYSTEM', teamId, { reason: 'Violation threshold reached' });

      // Notify team and disconnect
      const teamSocketId = activeTeamSockets.get(teamId);
      if (teamSocketId) {
        const teamSocket = io.sockets.sockets.get(teamSocketId);
        if (teamSocket) {
          teamSocket.emit('auth:error', { message: 'Your team has been automatically disqualified due to anti-cheat policy violations.' });
          teamSocket.disconnect();
        }
      }
    }

    // Broadcast alert to Admin 1
    io.to('room:admin1').emit('anticheat:alert', {
      teamId,
      teamName: team ? team.team_name : `Team #${teamId}`,
      violationType: type,
      details,
      violationCount,
      timestamp: now
    });

    broadcastAdminStats();
  } catch (err) {
    console.error('[VIOLATION RECORD ERROR]', err);
  }
}

function handleTimeUp(questionId, stageId) {
  try {
    stateMachine.transitionTo(EVENT_STATES.TIME_UP);
    broadcastStateChange();
    io.emit('timer:timeup', {
      questionId,
      stageId,
      serverTime: Date.now()
    });
  } catch (err) {
    console.error('[TIME UP TRANSITION ERROR]', err.message);
  }
}

function handleAdminControl(socket, payload, callback) {
  const cb = typeof callback === 'function' ? callback : () => {};
  if (!socket.user || (socket.user.role !== 'admin_1' && socket.user.role !== 'admin_2')) {
    return cb({ success: false, message: 'Access denied: Admin credentials required.' });
  }

  const { action, stageId, questionId, durationSec } = payload;
  const db = getDb();

  try {
    switch (action) {
      case 'SELECT_STAGE': {
        const stage = db.prepare('SELECT id FROM rounds WHERE id = ?').get(stageId);
        if (!stage) return cb({ success: false, message: 'Stage not found' });

        timerEngine.clearTimer();
        stateMachine.transitionTo(EVENT_STATES.DESCRIPTION, { stageId: stage.id, questionId: null }, true);
        broadcastStateChange();
        return cb({ success: true, state: stateMachine.currentState });
      }

      case 'SHOW_RULES': {
        stateMachine.transitionTo(EVENT_STATES.RULES, {}, true);
        broadcastStateChange();
        return cb({ success: true, state: stateMachine.currentState });
      }

      case 'READY': {
        // Find first question of this stage
        const firstQ = db.prepare('SELECT id FROM questions WHERE round_id = ? AND is_active = 1 ORDER BY order_index ASC LIMIT 1').get(stateMachine.currentStageId);
        stateMachine.transitionTo(EVENT_STATES.READY, { questionId: firstQ ? firstQ.id : null }, true);
        broadcastStateChange();
        return cb({ success: true, state: stateMachine.currentState });
      }

      case 'START_QUESTION': {
        const targetStageId = stageId || stateMachine.currentStageId || 1;
        let targetQId = questionId || stateMachine.currentQuestionId;

        if (!targetQId) {
          const firstQ = db.prepare('SELECT id FROM questions WHERE round_id = ? AND is_active = 1 ORDER BY order_index ASC LIMIT 1').get(targetStageId);
          if (firstQ) {
            targetQId = firstQ.id;
          }
        }

        if (!targetQId) {
          return cb({ success: false, message: 'No question selected to start' });
        }

        const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(targetQId);
        if (!q) return cb({ success: false, message: 'Question not found' });
        if (!q.is_active) return cb({ success: false, message: 'Question is disabled and cannot be used in a live round' });

        const timeLimit = durationSec || q.time_limit_sec || 30;
        stateMachine.transitionTo(EVENT_STATES.QUESTION_ACTIVE, { questionId: q.id, stageId: q.round_id }, true);
        timerEngine.startQuestionTimer(timeLimit, q.id, q.round_id);
        broadcastStateChange();
        return cb({ 
          success: true, 
          state: stateMachine.currentState, 
          questionId: q.id, 
          stageId: q.round_id,
          timeLimit 
        });
      }

      case 'PAUSE': {
        timerEngine.pauseTimer();
        stateMachine.transitionTo(EVENT_STATES.PAUSED, {}, true);
        broadcastStateChange();
        return cb({ success: true, state: stateMachine.currentState });
      }

      case 'RESUME': {
        timerEngine.resumeTimer(stateMachine.currentQuestionId, stateMachine.currentStageId);
        stateMachine.transitionTo(EVENT_STATES.QUESTION_ACTIVE, {}, true);
        broadcastStateChange();
        return cb({ success: true, state: stateMachine.currentState });
      }

      case 'RESTART_QUESTION': {
        if (!stateMachine.currentQuestionId) return cb({ success: false, message: 'No active question to restart' });
        const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(stateMachine.currentQuestionId);
        // Clear previous answers for this question
        const isTesting = stateMachine.isTestingMode ? 1 : 0;
        db.prepare('DELETE FROM answers WHERE question_id = ? AND is_test_answer = ?').run(stateMachine.currentQuestionId, isTesting);

        timerEngine.startQuestionTimer(q.time_limit_sec || 30, q.id, stateMachine.currentStageId);
        stateMachine.transitionTo(EVENT_STATES.QUESTION_ACTIVE, { questionId: q.id }, true);
        broadcastStateChange();
        return cb({ success: true, state: stateMachine.currentState });
      }

      case 'NEXT_QUESTION': {
        timerEngine.clearTimer();
        const currentQ = db.prepare('SELECT order_index FROM questions WHERE id = ?').get(stateMachine.currentQuestionId);
        let nextQ = null;
        if (currentQ) {
          nextQ = db.prepare(`
            SELECT id FROM questions 
            WHERE round_id = ? AND is_active = 1 AND order_index > ? 
            ORDER BY order_index ASC LIMIT 1
          `).get(stateMachine.currentStageId, currentQ.order_index);
        }

        if (nextQ) {
          stateMachine.transitionTo(EVENT_STATES.READY, { questionId: nextQ.id }, true);
          broadcastStateChange();
          return cb({ success: true, nextQuestionId: nextQ.id });
        } else {
          // No more questions in this round
          stateMachine.transitionTo(EVENT_STATES.ROUND_COMPLETED, {}, true);
          broadcastStateChange();
          return cb({ success: true, roundCompleted: true });
        }
      }

      case 'PREV_QUESTION': {
        timerEngine.clearTimer();
        const currentQ = db.prepare('SELECT order_index FROM questions WHERE id = ?').get(stateMachine.currentQuestionId);
        let prevQ = null;
        if (currentQ) {
          prevQ = db.prepare(`
            SELECT id FROM questions 
            WHERE round_id = ? AND is_active = 1 AND order_index < ? 
            ORDER BY order_index DESC LIMIT 1
          `).get(stateMachine.currentStageId, currentQ.order_index);
        }

        if (prevQ) {
          stateMachine.transitionTo(EVENT_STATES.READY, { questionId: prevQ.id }, true);
          broadcastStateChange();
          return cb({ success: true, prevQuestionId: prevQ.id });
        }
        return cb({ success: false, message: 'No previous question' });
      }

      case 'STOP_ROUND': {
        timerEngine.clearTimer();
        stateMachine.transitionTo(EVENT_STATES.ROUND_STOPPED, {}, true);
        broadcastStateChange();
        io.emit('round:stopped', {
          stageId: stateMachine.currentStageId,
          message: 'ROUND STOPPED',
          serverTime: Date.now()
        });
        return cb({ success: true, state: stateMachine.currentState, message: 'ROUND STOPPED' });
      }

      case 'START_OVER': {
        timerEngine.clearTimer();
        const firstQ = db.prepare('SELECT id FROM questions WHERE round_id = ? AND is_active = 1 ORDER BY order_index ASC LIMIT 1').get(stateMachine.currentStageId);
        stateMachine.transitionTo(EVENT_STATES.READY, { 
          questionId: firstQ ? firstQ.id : null,
          timerStartedAt: null,
          timerEndsAt: null,
          timerPausedRemainingMs: null
        }, true);
        broadcastStateChange();
        return cb({ success: true, state: stateMachine.currentState, questionId: firstQ ? firstQ.id : null });
      }

      case 'END_ROUND': {
        timerEngine.clearTimer();
        stateMachine.transitionTo(EVENT_STATES.ROUND_COMPLETED, {}, true);

        // Update rounds_conducted in current event run
        if (stateMachine.currentEventRunId && stateMachine.currentStageId) {
          try {
            const run = db.prepare('SELECT rounds_conducted FROM event_runs WHERE event_run_id = ?').get(stateMachine.currentEventRunId);
            if (run && run.rounds_conducted < stateMachine.currentStageId) {
              db.prepare('UPDATE event_runs SET rounds_conducted = ?, updated_at = ? WHERE event_run_id = ?')
                .run(stateMachine.currentStageId, new Date().toISOString(), stateMachine.currentEventRunId);
            }
          } catch (e) {
            console.error('[EVENT RUN ROUNDS UPDATE ERROR]', e);
          }
        }

        broadcastStateChange();
        io.emit('round:completed', {
          stageId: stateMachine.currentStageId,
          message: 'ROUND COMPLETED — RESULTS READY',
          serverTime: Date.now()
        });
        return cb({ success: true, state: stateMachine.currentState, message: 'ROUND COMPLETED — RESULTS READY' });
      }

      case 'SHOW_RESULTS': {
        const stageId = stateMachine.currentStageId || 1;
        const settingKey = `result_duration_stage_${stageId}`;
        const settingRow = db.prepare('SELECT value FROM settings WHERE key = ?').get(settingKey);
        let durationSec = settingRow ? parseInt(settingRow.value, 10) : 10;
        if (isNaN(durationSec) || durationSec < 3) durationSec = 10;
        if (durationSec > 300) durationSec = 300;

        stateMachine.transitionTo(EVENT_STATES.RESULT, {}, true);
        broadcastStateChange();

        timerEngine.startResultTimer(durationSec, stageId, (finishedStageId) => {
          try {
            stateMachine.transitionTo(EVENT_STATES.RESULT_COMPLETE, {}, true);
            broadcastStateChange();
            io.emit('round:result_complete', {
              stageId: finishedStageId,
              message: 'RESULT DISPLAY COMPLETE — WAITING FOR OPERATOR',
              serverTime: Date.now()
            });
          } catch (err) {
            console.error('[RESULT COMPLETE ERROR]', err);
          }
        });

        return cb({ success: true, state: stateMachine.currentState, durationSec });
      }

      case 'SET_EVENT_RUN': {
        if (payload.eventRunId) {
          stateMachine.setEventRunId(payload.eventRunId);
          broadcastStateChange();
          return cb({ success: true, eventRunId: stateMachine.currentEventRunId });
        }
        return cb({ success: false, message: 'Missing eventRunId' });
      }

      case 'START_TIE_BREAK': {
        const targetStageId = stageId || 3; // Tie Break 1 default
        stateMachine.transitionTo(EVENT_STATES.DESCRIPTION, { stageId: targetStageId }, true);
        broadcastStateChange();
        return cb({ success: true, state: stateMachine.currentState });
      }

      case 'SET_AUDIO': {
        stateMachine.setAudioConfig(payload.muted, payload.volume);
        io.emit('audio:config', {
          muted: stateMachine.soundMuted,
          volume: stateMachine.soundVolume
        });
        return cb({ success: true });
      }

      default:
        return cb({ success: false, message: `Unknown admin action: ${action}` });
    }
  } catch (err) {
    console.error('[ADMIN CONTROL ERROR]', err);
    return cb({ success: false, message: err.message });
  }
}

function broadcastAdminStats() {
  if (!io) return;

  const db = getDb();
  const isTesting = stateMachine.isTestingMode ? 1 : 0;

  // Connected teams
  const totalTeams = db.prepare('SELECT COUNT(*) as count FROM teams WHERE is_test_team = ?').get(isTesting).count;
  const activeTeams = db.prepare("SELECT COUNT(*) as count FROM teams WHERE is_test_team = ? AND status = 'active'").get(isTesting).count;
  const disqualifiedTeams = db.prepare("SELECT COUNT(*) as count FROM teams WHERE is_test_team = ? AND status = 'disqualified'").get(isTesting).count;
  const connectedCount = activeTeamSockets.size;
  const disconnectedCount = Math.max(0, activeTeams - connectedCount);

  // Question progress
  let totalQuestions = 0;
  let currentQuestionNumber = 0;
  if (stateMachine.currentStageId) {
    totalQuestions = db.prepare('SELECT COUNT(*) as count FROM questions WHERE round_id = ? AND is_active = 1').get(stateMachine.currentStageId).count;
    if (stateMachine.currentQuestionId) {
      const q = db.prepare('SELECT question_number FROM questions WHERE id = ?').get(stateMachine.currentQuestionId);
      currentQuestionNumber = q ? q.question_number : 0;
    }
  }

  // Answered for current question
  let answeredCount = 0;
  if (stateMachine.currentQuestionId) {
    answeredCount = db.prepare('SELECT COUNT(*) as count FROM answers WHERE question_id = ? AND is_test_answer = ?')
      .get(stateMachine.currentQuestionId, isTesting).count;
  }

  const stats = {
    totalTeams,
    activeTeams,
    connectedCount,
    disconnectedCount,
    disqualifiedTeams,
    currentStageId: stateMachine.currentStageId,
    currentQuestionId: stateMachine.currentQuestionId,
    currentQuestionNumber,
    totalQuestions,
    answeredCount,
    currentState: stateMachine.currentState,
    isTestingMode: stateMachine.isTestingMode
  };

  io.to('room:admin1').emit('admin:stats', stats);
}

function notifyStageUpdate(stageId = null) {
  if (!io) return;
  io.emit('stages:updated', { stageId, timestamp: Date.now() });
  if (!stageId || stateMachine.currentStageId === stageId) {
    broadcastStateChange();
  }
}

module.exports = {
  setupSocketIO,
  getIo,
  getTimerEngine,
  broadcastStateChange,
  broadcastAdminStats,
  notifyStageUpdate,
  activeTeamSockets
};
