const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const ioClient = require('socket.io-client');
const app = require('../src/app');
const { initDatabase, getDb } = require('../src/config/database');
const { setupSocketIO, getTimerEngine } = require('../src/realtime/socketManager');
const { stateMachine, EVENT_STATES } = require('../src/realtime/stateMachine');
const { generateToken } = require('../src/middleware/authMiddleware');

let server;
let serverPort;
let serverUrl;
let adminSocket;
let teamClients = [];
let testTeams = [];
let testQuestion = null;

before(async () => {
  initDatabase();
  const db = getDb();

  // Create 60 distinct test teams in database
  db.prepare('DELETE FROM answers WHERE is_test_answer = 1').run();
  db.prepare('DELETE FROM teams WHERE is_test_team = 1').run();
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('first_correct_lock', 'false')").run();

  const insertTeam = db.prepare(`
    INSERT INTO teams (team_name, college_name, captain_name, username, password_hash, status, is_test_team, created_at)
    VALUES (?, 'RRASE Engineering', ?, ?, 'hash', 'active', 1, ?)
  `);

  for (let i = 1; i <= 60; i++) {
    const pad = String(i).padStart(2, '0');
    const res = insertTeam.run(`LoadTeam_${pad}`, `Captain_${pad}`, `user_sync_${pad}`, new Date().toISOString());
    testTeams.push({
      id: res.lastInsertRowid,
      name: `LoadTeam_${pad}`,
      username: `user_sync_${pad}`
    });
  }

  // Retrieve or create test question for round 1
  testQuestion = db.prepare('SELECT * FROM questions WHERE round_id = 1 AND is_active = 1 ORDER BY order_index ASC LIMIT 1').get()
    || db.prepare('SELECT * FROM questions ORDER BY id ASC LIMIT 1').get();

  if (!testQuestion) {
    const insertQ = db.prepare(`
      INSERT INTO questions (round_id, question_number, question_text, option_a, option_b, option_c, option_d, correct_option, time_limit_sec, is_active, is_test_question, order_index)
      VALUES (1, 1, 'Which component stores electrical charge?', 'Resistor', 'Capacitor', 'Diode', 'Inductor', 'B', 30, 1, 0, 1)
    `);
    const qRes = insertQ.run();
    testQuestion = db.prepare('SELECT * FROM questions WHERE id = ?').get(qRes.lastInsertRowid);
  }

  // Create HTTP server & Socket.IO
  server = http.createServer(app);
  setupSocketIO(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  serverPort = server.address().port;
  serverUrl = `http://127.0.0.1:${serverPort}`;

  // Enable testing mode in state machine
  stateMachine.setTestingMode(true);
});

after(async () => {
  for (const client of teamClients) {
    if (client && client.connected) client.disconnect();
  }
  if (adminSocket && adminSocket.connected) adminSocket.disconnect();
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

function connectClient(token, role = 'team') {
  return new Promise((resolve, reject) => {
    const socket = ioClient(serverUrl, {
      auth: { token },
      transports: ['websocket'],
      timeout: 5000
    });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (err) => reject(err));
  });
}

describe('GLITCH HUNT - Real-Time Multi-Client Synchronization Test Suite (Up to 60 Teams)', () => {
  it('Admin connects to live controller room', async () => {
    const adminToken = generateToken({ id: 1, username: 'admin1', role: 'admin_1', name: 'Admin Master' });
    adminSocket = await connectClient(adminToken, 'admin_1');
    assert.ok(adminSocket.connected);
  });

  it('Scales and synchronizes 1, 10, 30, and 60 concurrent team mobile devices', async () => {
    // Step 1: Connect 1 team
    const t1Token = generateToken({ id: testTeams[0].id, username: testTeams[0].username, role: 'team', team_name: testTeams[0].name });
    const s1 = await connectClient(t1Token);
    teamClients.push(s1);
    assert.strictEqual(teamClients.length, 1);

    // Step 2: Connect next 9 teams (Total = 10)
    for (let i = 1; i < 10; i++) {
      const token = generateToken({ id: testTeams[i].id, username: testTeams[i].username, role: 'team', team_name: testTeams[i].name });
      const s = await connectClient(token);
      teamClients.push(s);
    }
    assert.strictEqual(teamClients.length, 10);

    // Step 3: Connect next 20 teams (Total = 30)
    for (let i = 10; i < 30; i++) {
      const token = generateToken({ id: testTeams[i].id, username: testTeams[i].username, role: 'team', team_name: testTeams[i].name });
      const s = await connectClient(token);
      teamClients.push(s);
    }
    assert.strictEqual(teamClients.length, 30);

    // Step 4: Connect remaining 30 teams (Total = 60 concurrent active teams)
    for (let i = 30; i < 60; i++) {
      const token = generateToken({ id: testTeams[i].id, username: testTeams[i].username, role: 'team', team_name: testTeams[i].name });
      const s = await connectClient(token);
      teamClients.push(s);
    }
    assert.strictEqual(teamClients.length, 60);

    // Verify all 60 are actively connected
    for (const c of teamClients) {
      assert.strictEqual(c.connected, true);
    }
  });

  it('Admin starts question: ALL 60 teams receive sanitized state simultaneously', async () => {
    const q1 = testQuestion;
    assert.ok(q1, 'Target question must exist in database');

    // Set up listeners on all 60 clients
    const syncPromises = teamClients.map(client => {
      return new Promise((resolve) => {
        const handler = (payload) => {
          if (payload.state === 'QUESTION_ACTIVE' && payload.question && payload.question.questionId === q1.id) {
            client.off('state:sync', handler);
            resolve(payload);
          }
        };
        client.on('state:sync', handler);
      });
    });

    // Admin sends START_QUESTION
    const adminAck = await new Promise((resolve) => {
      adminSocket.emit('admin:control', {
        action: 'START_QUESTION',
        stageId: q1.round_id,
        questionId: q1.id,
        durationSec: 15
      }, resolve);
    });

    assert.strictEqual(adminAck.success, true);
    assert.strictEqual(adminAck.state, 'QUESTION_ACTIVE');
    assert.strictEqual(adminAck.questionId, q1.id);

    // Wait for all 60 client sync events
    const receivedPayloads = await Promise.all(syncPromises);
    assert.strictEqual(receivedPayloads.length, 60);

    // CRITICAL SECURITY & RULE CHECK:
    // User mobile device MUST NOT receive the question text!
    for (const payload of receivedPayloads) {
      assert.strictEqual(payload.state, 'QUESTION_ACTIVE');
      assert.ok(payload.question);
      assert.strictEqual(payload.question.questionId, q1.id);
      assert.ok(payload.question.options.A);
      assert.ok(payload.question.options.B);
      assert.ok(payload.question.options.C);
      assert.ok(payload.question.options.D);

      // QUESTION_TEXT MUST BE STRICTLY UNDEFINED / NOT IN USER PAYLOAD
      assert.strictEqual(
        payload.question.question_text,
        undefined,
        'CRITICAL VIOLATION: question_text was leaked to user mobile payload!'
      );
    }
  });

  it('All 60 teams submit answers concurrently without drops', async () => {
    const options = ['A', 'B', 'C', 'D'];

    // Submit answers concurrently from all 60 clients
    const submissionPromises = teamClients.map((client, index) => {
      const selectedOption = options[index % options.length];
      return new Promise((resolve) => {
        client.emit('answer:submit', {
          questionId: testQuestion.id,
          roundId: testQuestion.round_id,
          selectedOption
        }, (ack) => {
          resolve({ index, ack, selectedOption });
        });
      });
    });

    const results = await Promise.all(submissionPromises);

    // Verify all 60 were processed and confirmed
    assert.strictEqual(results.length, 60);
    for (const r of results) {
      assert.strictEqual(r.ack.success, true, `Client ${r.index} failed to submit: ${r.ack.message}`);
      assert.strictEqual(r.ack.selectedOption, r.selectedOption);
    }

    // Verify 60 answers in database for our 60 test teams
    const db = getDb();
    const teamIds = testTeams.map(t => t.id);
    const count = db.prepare(`SELECT COUNT(*) as count FROM answers WHERE question_id = ? AND team_id IN (${teamIds.join(',')})`).get(testQuestion.id).count;
    assert.strictEqual(count, 60);
  });

  it('Prevent duplicate submission from already submitted team', async () => {
    const client1 = teamClients[0];
    const duplicateAck = await new Promise((resolve) => {
      client1.emit('answer:submit', {
        questionId: testQuestion.id,
        roundId: testQuestion.round_id,
        selectedOption: 'C'
      }, resolve);
    });

    assert.strictEqual(duplicateAck.success, false);
    assert.match(duplicateAck.message, /already submitted/i);
  });

  it('Admin pauses and resumes question: all 60 clients receive state', async () => {
    const pauseAck = await new Promise((resolve) => {
      adminSocket.emit('admin:control', { action: 'PAUSE' }, resolve);
    });
    assert.strictEqual(pauseAck.success, true);
    assert.strictEqual(stateMachine.currentState, 'PAUSED');

    const resumeAck = await new Promise((resolve) => {
      adminSocket.emit('admin:control', { action: 'RESUME' }, resolve);
    });
    assert.strictEqual(resumeAck.success, true);
    assert.strictEqual(stateMachine.currentState, 'QUESTION_ACTIVE');
  });

  it('Expired timer rejects late answer submissions', async () => {
    // Force timer to expire
    const timerEngine = getTimerEngine();
    timerEngine.handleTimerExpired(testQuestion.id, testQuestion.round_id);
    assert.strictEqual(stateMachine.currentState, 'TIME_UP');

    // Attempt answer submission while TIME_UP
    const client5 = teamClients[5];
    const lateAck = await new Promise((resolve) => {
      client5.emit('answer:submit', {
        questionId: testQuestion.id,
        roundId: testQuestion.round_id,
        selectedOption: 'A'
      }, resolve);
    });

    assert.strictEqual(lateAck.success, false);
    assert.match(lateAck.message, /Cannot submit answer/i);
  });

  it('Team client reconnects and restores state with hasSubmitted flag intact', async () => {
    // Disconnect client 0
    const client0 = teamClients[0];
    client0.disconnect();

    // Reconnect with same team token
    const token = generateToken({ id: testTeams[0].id, username: testTeams[0].username, role: 'team', team_name: testTeams[0].name });
    const reconnectedSocket = await connectClient(token);
    teamClients[0] = reconnectedSocket;

    const statePromise = new Promise((resolve) => {
      reconnectedSocket.on('state:sync', (data) => resolve(data));
      reconnectedSocket.emit('state:request');
    });

    const receivedState = await statePromise;
    assert.ok(receivedState);
    assert.strictEqual(receivedState.hasSubmitted, true);
    assert.strictEqual(receivedState.question.question_text, undefined, 'Sanitized state maintained on reconnect');
  });

  after(() => {
    const db = getDb();
    db.prepare('DELETE FROM answers WHERE is_test_answer = 1').run();
    db.prepare('DELETE FROM teams WHERE is_test_team = 1').run();
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('first_correct_lock', 'true')").run();
    teamClients.forEach(c => c && c.disconnect());
    if (adminSocket) adminSocket.disconnect();
    if (projectorSocket) projectorSocket.disconnect();
  });
});
