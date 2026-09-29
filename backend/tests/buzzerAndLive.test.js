const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const ioClient = require('socket.io-client');
const app = require('../src/app');
const { initDatabase, getDb } = require('../src/config/database');
const { setupSocketIO } = require('../src/realtime/socketManager');
const { stateMachine } = require('../src/realtime/stateMachine');
const { generateToken } = require('../src/middleware/authMiddleware');

describe('GLITCH HUNT - Feature 1: First Correct Buzzer Lock & Feature 2: Live Monitor Test Suite', () => {
  let server;
  let io;
  let timerEngine;
  let baseUrl;

  let adminSocket;
  let projectorSocket;
  let liveSocket;
  let teamSockets = [];
  let testTeams = [];
  let testQuestions = [];
  let adminToken;

  before(async () => {
    initDatabase();
    stateMachine.setTestingMode(true);

    server = http.createServer(app);
    const socketSetup = setupSocketIO(server);
    io = socketSetup.io;
    timerEngine = socketSetup.timerEngine;

    await new Promise((resolve) => server.listen(0, resolve));
    const assignedPort = server.address().port;
    baseUrl = `http://localhost:${assignedPort}`;

    const db = getDb();

    // Ensure first_correct_lock is enabled (production default)
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('first_correct_lock', 'true')").run();
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('live_show_question_text', 'false')").run();

    // Clean up old test data in safe foreign-key order
    db.prepare('UPDATE event_state SET first_correct_team_id = NULL, first_correct_team_name = NULL WHERE id = 1').run();
    db.prepare('DELETE FROM answers WHERE is_test_answer = 1').run();
    db.prepare('DELETE FROM violations WHERE team_id IN (SELECT id FROM teams WHERE is_test_team = 1)').run();
    db.prepare('DELETE FROM team_sessions WHERE team_id IN (SELECT id FROM teams WHERE is_test_team = 1)').run();
    db.prepare('DELETE FROM teams WHERE is_test_team = 1').run();

    // Create 5 test teams
    const insertTeam = db.prepare(`
      INSERT INTO teams (team_name, college_name, captain_name, member_count, username, password_hash, status, is_test_team, created_at)
      VALUES (?, 'RRASE College of Engineering', ?, 2, ?, 'hash', 'active', 1, ?)
    `);

    const now = new Date().toISOString();
    for (let i = 1; i <= 5; i++) {
      const name = `Team Buzzer ${i}`;
      const user = `buzzer_team_${i}`;
      const res = insertTeam.run(name, `Captain ${i}`, user, now);
      const teamId = res.lastInsertRowid;
      const token = generateToken({ id: teamId, role: 'team', team_name: name, username: user, is_test_team: true });
      testTeams.push({ id: teamId, name, token });
    }

    adminToken = generateToken({ id: 1, role: 'admin_1', username: 'admin1', name: 'Master Admin' });

    // Fetch active test questions
    testQuestions = db.prepare('SELECT * FROM questions WHERE is_active = 1 LIMIT 3').all();

    // Connect admin, projector, and live sockets
    adminSocket = ioClient(baseUrl, {
      auth: { token: adminToken },
      transports: ['websocket']
    });

    projectorSocket = ioClient(baseUrl, {
      query: { role: 'projector' },
      transports: ['websocket']
    });

    liveSocket = ioClient(baseUrl, {
      auth: { role: 'live' },
      transports: ['websocket']
    });

    // Connect 5 team sockets
    for (const team of testTeams) {
      const ts = ioClient(baseUrl, {
        auth: { token: team.token },
        transports: ['websocket']
      });
      teamSockets.push(ts);
    }

    // Wait for all sockets to connect
    const connectPromises = [
      new Promise(r => adminSocket.on('connect', r)),
      new Promise(r => projectorSocket.on('connect', r)),
      new Promise(r => liveSocket.on('connect', r)),
      ...teamSockets.map(s => new Promise(r => s.on('connect', r)))
    ];
    await Promise.all(connectPromises);
  });

  after(async () => {
    if (adminSocket) adminSocket.disconnect();
    if (projectorSocket) projectorSocket.disconnect();
    if (liveSocket) liveSocket.disconnect();
    teamSockets.forEach(s => s && s.disconnect());
    if (timerEngine) timerEngine.clearTimer();
    if (io) io.close();
    if (server) await new Promise(r => server.close(r));
    stateMachine.setTestingMode(false);

    const db = getDb();
    db.prepare('UPDATE event_state SET first_correct_team_id = NULL, first_correct_team_name = NULL WHERE id = 1').run();
    db.prepare('DELETE FROM answers WHERE is_test_answer = 1').run();
    db.prepare('DELETE FROM violations WHERE team_id IN (SELECT id FROM teams WHERE is_test_team = 1)').run();
    db.prepare('DELETE FROM team_sessions WHERE team_id IN (SELECT id FROM teams WHERE is_test_team = 1)').run();
    db.prepare('DELETE FROM teams WHERE is_test_team = 1').run();
  });

  // ========================================================
  // FEATURE 1 TESTS: BUZZER REPLACEMENT / FIRST CORRECT LOCK
  // ========================================================

  it('Case B: Team submits wrong answer -> Only that team is marked INCORRECT and locked out, question remains OPEN for others', async () => {
    const q = testQuestions[0];
    assert.ok(q, 'Test question exists');

    // Admin starts question
    const startAck = await new Promise(resolve => {
      adminSocket.emit('admin:control', {
        action: 'START_QUESTION',
        stageId: q.round_id,
        questionId: q.id,
        durationSec: 20
      }, resolve);
    });
    assert.strictEqual(startAck.success, true);
    assert.strictEqual(stateMachine.currentState, 'QUESTION_ACTIVE');

    // Team 1 submits WRONG option
    const wrongOption = q.correct_option === 'A' ? 'B' : 'A';
    const team1Ack = await new Promise(resolve => {
      teamSockets[0].emit('answer:submit', {
        questionId: q.id,
        roundId: q.round_id,
        selectedOption: wrongOption
      }, resolve);
    });

    assert.strictEqual(team1Ack.success, true);
    assert.strictEqual(team1Ack.isCorrect, false);
    assert.strictEqual(team1Ack.isFirstCorrect, false);
    assert.match(team1Ack.message, /INCORRECT/i);

    // Global question MUST NOT lock on wrong answer
    assert.strictEqual(stateMachine.currentState, 'QUESTION_ACTIVE', 'State must remain QUESTION_ACTIVE after wrong answer');

    // Team 1 cannot submit again (locked for this question)
    const duplicateAck = await new Promise(resolve => {
      teamSockets[0].emit('answer:submit', {
        questionId: q.id,
        roundId: q.round_id,
        selectedOption: q.correct_option
      }, resolve);
    });
    assert.strictEqual(duplicateAck.success, false);
    assert.match(duplicateAck.message, /already submitted/i);

    // Other teams CAN still submit
    assert.strictEqual(timerEngine.isSubmissionAllowed(), true);
  });

  it('Case A & C: Multiple teams submit almost simultaneously -> Server determines ONE winner, question globally locks, timer freezes', async () => {
    const q = testQuestions[0];

    // Listen for question:locked events across clients
    const projectorLockPromise = new Promise(resolve => projectorSocket.once('question:locked', resolve));
    const liveLockPromise = new Promise(resolve => liveSocket.once('question:locked', resolve));
    const adminLockPromise = new Promise(resolve => adminSocket.once('question:locked', resolve));

    // Remaining teams (Team 2, 3, 4, 5) submit correct answer almost simultaneously
    const submissionPromises = [1, 2, 3, 4].map(idx => {
      return new Promise(resolve => {
        teamSockets[idx].emit('answer:submit', {
          questionId: q.id,
          roundId: q.round_id,
          selectedOption: q.correct_option
        }, ack => resolve({ index: idx, teamId: testTeams[idx].id, ack }));
      });
    });

    const results = await Promise.all(submissionPromises);

    // Verify exactly ONE team won first correct lock
    const winners = results.filter(r => r.ack.isFirstCorrect === true);
    assert.strictEqual(winners.length, 1, 'There must NEVER be two FIRST CORRECT winners for one question');

    const winner = winners[0];
    assert.strictEqual(winner.ack.success, true);
    assert.strictEqual(winner.ack.isCorrect, true);
    assert.match(winner.ack.message, /FIRST CORRECT/i);

    // Other teams that submitted almost simultaneously must be rejected with already locked
    const rejected = results.filter(r => r.index !== winner.index);
    assert.strictEqual(rejected.length, 3);
    for (const r of rejected) {
      assert.strictEqual(r.ack.success, false);
      assert.strictEqual(r.ack.locked, true);
      assert.strictEqual(r.ack.code, 'QUESTION_ALREADY_LOCKED');
      assert.match(r.ack.message, /already locked/i);
    }

    // Verify state machine transitioned to QUESTION_LOCKED
    assert.strictEqual(stateMachine.currentState, 'QUESTION_LOCKED');
    assert.strictEqual(String(stateMachine.firstCorrectTeamId), String(winner.teamId));

    // Verify timer frozen
    assert.strictEqual(timerEngine.isSubmissionAllowed(), false, 'Submissions rejected when locked');

    // Verify projector and live monitor received question:locked event
    const [projectorData, liveData, adminData] = await Promise.all([
      projectorLockPromise,
      liveLockPromise,
      adminLockPromise
    ]);

    assert.strictEqual(String(projectorData.firstCorrectTeamId), String(winner.teamId));
    assert.strictEqual(String(liveData.firstCorrectTeamId), String(winner.teamId));
    assert.strictEqual(String(adminData.firstCorrectTeamId), String(winner.teamId));
  });

  it('Late submission after question lock is rejected with QUESTION_ALREADY_LOCKED', async () => {
    const q = testQuestions[0];
    assert.strictEqual(stateMachine.currentState, 'QUESTION_LOCKED');

    // Any team trying to submit now gets rejected immediately
    const lateAck = await new Promise(resolve => {
      teamSockets[1].emit('answer:submit', {
        questionId: q.id,
        roundId: q.round_id,
        selectedOption: q.correct_option
      }, resolve);
    });

    assert.strictEqual(lateAck.success, false);
    assert.strictEqual(lateAck.locked, true);
    assert.strictEqual(lateAck.code, 'QUESTION_ALREADY_LOCKED');
    assert.match(lateAck.message, /already locked/i);
  });

  it('Admin 2 manually advances to NEXT QUESTION using existing workflow', async () => {
    const nextAck = await new Promise(resolve => {
      adminSocket.emit('admin:control', { action: 'NEXT_QUESTION' }, resolve);
    });

    assert.strictEqual(nextAck.success, true);
    assert.ok(['READY', 'ROUND_COMPLETED'].includes(stateMachine.currentState));
    assert.strictEqual(stateMachine.firstCorrectTeamId, null, 'firstCorrectTeamId must reset on next question');
  });

  // ========================================================
  // FEATURE 2 TESTS: INDEPENDENT REAL-TIME LIVE MONITORING
  // ========================================================

  it('GET /api/live/overview returns dynamic list of rounds and active round state', async () => {
    const res = await fetch(`${baseUrl}/api/live/overview`);
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.rounds));
    assert.ok(data.rounds.length >= 8, 'Must return all rounds dynamically');
    assert.ok('activeStageId' in data);
    assert.ok('activeEventState' in data);
  });

  it('GET /api/live/round/:roundId returns round details, participating teams, scores and live status', async () => {
    const res = await fetch(`${baseUrl}/api/live/round/1`);
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.round, 'Round metadata returned');
    assert.ok(data.stats, 'Round stats returned');
    assert.ok(Array.isArray(data.teams), 'Teams array returned');

    // Verify team fields required by spec
    if (data.teams.length > 0) {
      const team = data.teams[0];
      assert.ok('rank' in team);
      assert.ok('team_name' in team);
      assert.ok('college' in team);
      assert.ok('score' in team);
      assert.ok('correctAnswers' in team);
      assert.ok('questionsAttempted' in team);
      assert.ok('liveStatus' in team);
      assert.ok('qualificationStatus' in team);
    }
  });

  it('Question text is protected (hidden) on live monitor by default anti-cheat rule', async () => {
    const liveState = await new Promise(resolve => {
      liveSocket.emit('live:getState', resolve);
    });

    assert.strictEqual(liveState.success, true);
    if (liveState.state && liveState.state.question) {
      assert.strictEqual(liveState.state.question.question_text, undefined, 'Question text must be hidden from live spectators');
    }
  });

  it('Newly created round dynamically appears in /api/live/overview without server restart', async () => {
    const db = getDb();
    const insertStage = db.prepare(`
      INSERT INTO rounds (stage_number, stage_type, title, subtitle, description, is_enabled, order_index)
      VALUES (99, 'custom', 'Future AI Elimination Duel', 'Experimental Round', 'Dynamic Round Test', 1, 99)
    `);
    const stageRes = insertStage.run();
    const newStageId = stageRes.lastInsertRowid;

    const res = await fetch(`${baseUrl}/api/live/overview`);
    const data = await res.json();
    assert.strictEqual(data.success, true);

    const created = data.rounds.find(r => r.id === newStageId);
    assert.ok(created, 'Newly created round must automatically appear on live page');
    assert.strictEqual(created.title, 'Future AI Elimination Duel');

    // Clean up test round
    db.prepare('DELETE FROM rounds WHERE id = ?').run(newStageId);
  });

  it('Live socket client cannot perform admin mutations (strictly read-only security)', async () => {
    const mutateAck = await new Promise(resolve => {
      liveSocket.emit('admin:control', { action: 'START_QUESTION' }, resolve);
    });

    assert.strictEqual(mutateAck.success, false);
    assert.match(mutateAck.message, /denied|admin|forbidden/i);
  });

  it('GET /live route is reachable and returns HTTP 200 OK', async () => {
    const res = await fetch(`${baseUrl}/live`);
    assert.strictEqual(res.status, 200);
    const contentType = res.headers.get('content-type');
    assert.ok(contentType && contentType.includes('text/html'));
  });

  it('networkUtils.getLanUrls generates valid live scoreboard LAN URL', () => {
    const { getLanUrls } = require('../src/utils/networkUtils');
    const urls = getLanUrls(5000);
    assert.ok(urls.live, 'urls.live must be defined');
    assert.strictEqual(urls.live, `http://${urls.ip}:5000/live`);
    assert.ok(urls.user.endsWith('/user'));
    assert.ok(urls.projector.endsWith('/projector'));
    assert.ok(urls.admin1.endsWith('/admin'));
    assert.ok(urls.admin2.endsWith('/controller'));
  });
});
