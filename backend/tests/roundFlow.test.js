const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const ioClient = require('socket.io-client');
const app = require('../src/app');
const { setupSocketIO } = require('../src/realtime/socketManager');
const { getDb } = require('../src/config/database');
const { generateToken } = require('../src/middleware/authMiddleware');
const { stateMachine, EVENT_STATES } = require('../src/realtime/stateMachine');

describe('GLITCH HUNT - Complete Round Result & Projector Leaderboard Test Suite', () => {
  let server;
  let io;
  let timerEngine;
  let PORT = 5098;
  let adminSocket;
  let projectorSocket;
  let team1Socket;
  let team2Socket;
  let team1Token;
  let team2Token;
  let adminToken;
  let testQuestion;

  before(async () => {
    stateMachine.setTestingMode(true);

    server = http.createServer(app);
    const socketSetup = setupSocketIO(server);
    io = socketSetup.io;
    timerEngine = socketSetup.timerEngine;

    await new Promise((resolve) => {
      server.listen(PORT, resolve);
    });

    const db = getDb();

    // Create 2 test teams
    db.prepare('UPDATE event_state SET first_correct_team_id = NULL, first_correct_team_name = NULL WHERE id = 1').run();
    db.prepare('DELETE FROM answers WHERE is_test_answer = 1').run();
    db.prepare('DELETE FROM teams WHERE is_test_team = 1').run();
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('first_correct_lock', 'false')").run();

    const insertTeam = db.prepare(`
      INSERT INTO teams (team_name, college_name, captain_name, member_count, username, password_hash, status, is_test_team, created_at)
      VALUES (?, ?, ?, 2, ?, 'hash', 'active', 1, ?)
    `);

    const now = new Date().toISOString();
    const t1 = insertTeam.run('Team Alpha', 'RRASE College of Eng', 'Alice', 'flow_alpha', now);
    const t2 = insertTeam.run('Team Beta', 'RRASE College of Eng', 'Bob', 'flow_beta', now);

    team1Token = generateToken({ id: t1.lastInsertRowid, role: 'team', team_name: 'Team Alpha', is_test_team: true });
    team2Token = generateToken({ id: t2.lastInsertRowid, role: 'team', team_name: 'Team Beta', is_test_team: true });
    adminToken = generateToken({ id: 1, role: 'admin_1', username: 'admin1', name: 'Master Admin' });

    // Pick or create a test question
    testQuestion = db.prepare('SELECT * FROM questions WHERE is_active = 1 LIMIT 1').get();

    // Connect admin, projector, and team sockets
    adminSocket = ioClient(`http://localhost:${PORT}`, {
      auth: { token: adminToken },
      transports: ['websocket']
    });

    projectorSocket = ioClient(`http://localhost:${PORT}`, {
      query: { role: 'projector' },
      transports: ['websocket']
    });

    team1Socket = ioClient(`http://localhost:${PORT}`, {
      auth: { token: team1Token },
      transports: ['websocket']
    });

    team2Socket = ioClient(`http://localhost:${PORT}`, {
      auth: { token: team2Token },
      transports: ['websocket']
    });

    await Promise.all([
      new Promise(r => adminSocket.on('connect', r)),
      new Promise(r => projectorSocket.on('connect', r)),
      new Promise(r => team1Socket.on('connect', r)),
      new Promise(r => team2Socket.on('connect', r))
    ]);
  });

  after(() => {
    if (adminSocket) adminSocket.disconnect();
    if (projectorSocket) projectorSocket.disconnect();
    if (team1Socket) team1Socket.disconnect();
    if (team2Socket) team2Socket.disconnect();
    if (timerEngine) timerEngine.clearTimer();
    if (server) server.close();
    stateMachine.setTestingMode(false);
    const db = getDb();
    db.prepare('UPDATE event_state SET first_correct_team_id = NULL, first_correct_team_name = NULL WHERE id = 1').run();
    db.prepare('DELETE FROM answers WHERE is_test_answer = 1').run();
    db.prepare('DELETE FROM teams WHERE is_test_team = 1').run();
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('first_correct_lock', 'true')").run();
  });

  it('Start question: user mobiles receive sanitized state without question text', async () => {
    const syncPromise = new Promise(resolve => team1Socket.once('state:sync', resolve));

    const startAck = await new Promise(resolve => {
      adminSocket.emit('admin:control', {
        action: 'START_QUESTION',
        stageId: testQuestion.round_id,
        questionId: testQuestion.id,
        durationSec: 10
      }, resolve);
    });

    assert.strictEqual(startAck.success, true);
    assert.strictEqual(startAck.state, 'QUESTION_ACTIVE');

    const teamPayload = await syncPromise;
    assert.strictEqual(teamPayload.state, 'QUESTION_ACTIVE');
    assert.strictEqual(teamPayload.question.question_text, undefined, 'User must not receive question text');
    assert.ok(teamPayload.question.options.A);
    assert.strictEqual(teamPayload.hasSubmitted, false);
  });

  it('Team 1 submits answer: receives success ack and option is recorded', async () => {
    const submitAck = await new Promise(resolve => {
      team1Socket.emit('answer:submit', {
        questionId: testQuestion.id,
        roundId: testQuestion.round_id,
        selectedOption: testQuestion.correct_option
      }, resolve);
    });

    assert.strictEqual(submitAck.success, true);
    assert.strictEqual(submitAck.selectedOption, testQuestion.correct_option);
  });

  it('Team 1 re-requesting state receives hasSubmitted: true and locked option', async () => {
    const statePromise = new Promise(resolve => team1Socket.once('state:sync', resolve));
    team1Socket.emit('state:request');

    const state = await statePromise;
    assert.strictEqual(state.hasSubmitted, true);
    assert.strictEqual(state.submittedOption, testQuestion.correct_option);
  });

  it('Team 1 duplicate submission is rejected', async () => {
    const duplicateAck = await new Promise(resolve => {
      team1Socket.emit('answer:submit', {
        questionId: testQuestion.id,
        roundId: testQuestion.round_id,
        selectedOption: 'D'
      }, resolve);
    });

    assert.strictEqual(duplicateAck.success, false);
    assert.match(duplicateAck.message, /already submitted/i);
  });

  it('Team 2 submits same correct option creating an intentional score tie', async () => {
    const submitAck = await new Promise(resolve => {
      team2Socket.emit('answer:submit', {
        questionId: testQuestion.id,
        roundId: testQuestion.round_id,
        selectedOption: testQuestion.correct_option
      }, resolve);
    });

    assert.strictEqual(submitAck.success, true);
  });

  it('End round: projector receives ROUND_COMPLETED with authoritative leaderboard and tie detection', async () => {
    const projectorSyncPromise = new Promise(resolve => projectorSocket.once('state:sync', resolve));

    const endAck = await new Promise(resolve => {
      adminSocket.emit('admin:control', { action: 'END_ROUND' }, resolve);
    });

    assert.strictEqual(endAck.success, true);
    assert.strictEqual(endAck.state, 'ROUND_COMPLETED');

    const projectorPayload = await projectorSyncPromise;
    assert.strictEqual(projectorPayload.state, 'ROUND_COMPLETED');
    assert.ok(projectorPayload.leaderboard, 'Leaderboard data must be present on projector payload');
    assert.ok(Array.isArray(projectorPayload.leaderboard.results));
    assert.strictEqual(projectorPayload.leaderboard.hasTies, true, 'Intentional tie must be detected');
    assert.ok(projectorPayload.leaderboard.tiedGroups.length > 0);
  });

  it('Show results: projector receives RESULT state with ranked podium data', async () => {
    const projectorSyncPromise = new Promise(resolve => projectorSocket.once('state:sync', resolve));

    const resultAck = await new Promise(resolve => {
      adminSocket.emit('admin:control', { action: 'SHOW_RESULTS' }, resolve);
    });

    assert.strictEqual(resultAck.success, true);
    assert.strictEqual(resultAck.state, 'RESULT');

    const projectorPayload = await projectorSyncPromise;
    assert.strictEqual(projectorPayload.state, 'RESULT');
    assert.ok(projectorPayload.leaderboard.results.length >= 2);
    // Both teams answered correctly, both should have same score and rank 1
    assert.strictEqual(projectorPayload.leaderboard.results[0].rank, 1);
    assert.strictEqual(projectorPayload.leaderboard.results[1].rank, 1);
  });
});
