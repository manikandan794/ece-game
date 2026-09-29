const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const ioClient = require('socket.io-client');
const app = require('../src/app');
const { initDatabase, getDb } = require('../src/config/database');
const { setupSocketIO } = require('../src/realtime/socketManager');

let server;
let ioServer;
let baseUrl;
let socketUrl;
let admin1Token = '';
let admin2Token = '';
let teamToken = '';
let teamId = null;

before(async () => {
  const db = initDatabase();
  server = http.createServer(app);
  const { io } = setupSocketIO(server);
  ioServer = io;

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}/api`;
  socketUrl = `http://127.0.0.1:${port}`;

  // Log in admin 1
  const a1Res = await fetch(`${baseUrl}/auth/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin1', password: 'admin123' })
  });
  const a1Data = await a1Res.json();
  admin1Token = a1Data.token;

  // Log in admin 2
  const a2Res = await fetch(`${baseUrl}/auth/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin2', password: 'controller123' })
  });
  const a2Data = await a2Res.json();
  admin2Token = a2Data.token;

  // Create a dedicated test team if not exists
  let t = db.prepare("SELECT * FROM teams WHERE username = 'q_safety_team'").get();
  if (!t) {
    db.prepare(`
      INSERT INTO teams (team_name, college_name, member_count, captain_name, username, password_hash, status, is_test_team, created_at)
      VALUES ('Question Safety Team', 'Test College', 2, 'Captain Test', 'q_safety_team', 'hash', 'active', 1, ?)
    `).run(new Date().toISOString());
    t = db.prepare("SELECT * FROM teams WHERE username = 'q_safety_team'").get();
  }
  teamId = t.id;

  const { generateToken } = require('../src/middleware/authMiddleware');
  teamToken = generateToken({ id: t.id, team_name: t.team_name, username: t.username, role: 'team' });
});

after(async () => {
  if (ioServer) {
    ioServer.close();
  }
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

describe('GLITCH HUNT - Question Safety & Foreign Key Regression Test Suite', () => {
  let unusedQuestionId = null;
  let historyQuestionId = null;
  let sampleAnswerId = null;

  it('1. Delete unused question -> successful physical deletion', async () => {
    // Create an unused question
    const createRes = await fetch(`${baseUrl}/questions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${admin1Token}`
      },
      body: JSON.stringify({
        round_id: 1,
        question_text: 'Temporary Unused Question for Delete Test',
        option_a: 'Alpha',
        option_b: 'Beta',
        option_c: 'Gamma',
        option_d: 'Delta',
        correct_option: 'A',
        time_limit_sec: 20
      })
    });
    const createData = await createRes.json();
    assert.strictEqual(createRes.status, 201);
    assert.ok(createData.questionId);
    unusedQuestionId = createData.questionId;

    // Delete unused question as Admin 1
    const delRes = await fetch(`${baseUrl}/questions/${unusedQuestionId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${admin1Token}` }
    });
    const delData = await delRes.json();

    assert.strictEqual(delRes.status, 200);
    assert.strictEqual(delData.success, true);
    assert.strictEqual(delData.deleted, true);

    // Verify row is physically gone
    const db = getDb();
    const row = db.prepare('SELECT * FROM questions WHERE id = ?').get(unusedQuestionId);
    assert.strictEqual(row, undefined);
  });

  it('2. Delete question with answers -> safely disabled to preserve event history', async () => {
    const db = getDb();

    // Create a question that will have event history
    const createRes = await fetch(`${baseUrl}/questions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${admin1Token}`
      },
      body: JSON.stringify({
        round_id: 1,
        question_text: 'Question with Historical Answers',
        option_a: 'Opt A',
        option_b: 'Opt B',
        option_c: 'Opt C',
        option_d: 'Opt D',
        correct_option: 'B',
        time_limit_sec: 30
      })
    });
    const createData = await createRes.json();
    assert.strictEqual(createRes.status, 201);
    historyQuestionId = createData.questionId;

    // Insert an answer referencing this question
    const now = new Date().toISOString();
    const ansResult = db.prepare(`
      INSERT INTO answers (team_id, round_id, question_id, selected_option, submitted_at, server_received_at, time_taken_ms, is_correct, points_awarded, is_test_answer)
      VALUES (?, 1, ?, 'B', ?, ?, 2500, 1, 2.0, 1)
    `).run(teamId, historyQuestionId, now, now);
    sampleAnswerId = ansResult.lastInsertRowid;

    // Attempt to DELETE the question
    const delRes = await fetch(`${baseUrl}/questions/${historyQuestionId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${admin1Token}` }
    });
    const delData = await delRes.json();

    assert.strictEqual(delRes.status, 200);
    assert.strictEqual(delData.success, true);
    assert.strictEqual(delData.disabled, true);
    assert.strictEqual(delData.hasEventHistory, true);
    assert.strictEqual(delData.title, 'QUESTION HAS EVENT HISTORY');
    assert.ok(delData.message.includes('cannot be physically deleted'));

    // Question row must still exist in SQLite with is_active = 0
    const qRow = db.prepare('SELECT * FROM questions WHERE id = ?').get(historyQuestionId);
    assert.ok(qRow);
    assert.strictEqual(qRow.is_active, 0);
  });

  it('3. Delete question with scores -> safely disabled, question preserved', async () => {
    const db = getDb();
    const qRow = db.prepare('SELECT * FROM questions WHERE id = ?').get(historyQuestionId);
    assert.ok(qRow, 'Question must still exist');
    assert.strictEqual(qRow.is_active, 0, 'Question must be marked disabled');
  });

  it('4. Historical answers remain intact after deletion attempt', async () => {
    const db = getDb();
    const ans = db.prepare('SELECT * FROM answers WHERE id = ?').get(sampleAnswerId);
    assert.ok(ans, 'Answer record must not be cascade-deleted');
    assert.strictEqual(ans.question_id, historyQuestionId);
    assert.strictEqual(ans.team_id, teamId);
    assert.strictEqual(ans.selected_option, 'B');
    assert.strictEqual(ans.is_correct, 1);
  });

  it('5. Historical scores remain intact', async () => {
    const db = getDb();
    const ans = db.prepare('SELECT points_awarded FROM answers WHERE id = ?').get(sampleAnswerId);
    assert.strictEqual(ans.points_awarded, 2.0, 'Points awarded must be preserved exactly');
  });

  it('6. Disabled question cannot be used in live round', async () => {
    // Connect socket client as controller
    const socket = ioClient(socketUrl, {
      auth: { token: admin2Token },
      transports: ['websocket']
    });

    await new Promise((resolve) => {
      socket.on('connect', resolve);
    });

    // Attempt START_QUESTION on disabled question
    const startResult = await new Promise((resolve) => {
      socket.emit('admin:control', {
        action: 'START_QUESTION',
        stageId: 1,
        questionId: historyQuestionId
      }, resolve);
    });

    assert.strictEqual(startResult.success, false);
    assert.ok(startResult.message.includes('disabled'));

    socket.disconnect();
  });

  it('7. Admin can see disabled question in Question Bank with answer_count', async () => {
    const res = await fetch(`${baseUrl}/questions`, {
      headers: { 'Authorization': `Bearer ${admin1Token}` }
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);

    const found = data.questions.find(q => q.id === historyQuestionId);
    assert.ok(found, 'Disabled question must be visible in admin question list');
    assert.strictEqual(found.is_active, 0);
    assert.ok(found.answer_count >= 1);
  });

  it('8. Restore/enable works without altering historical answers or scores', async () => {
    const restoreRes = await fetch(`${baseUrl}/questions/${historyQuestionId}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${admin1Token}`
      },
      body: JSON.stringify({ is_active: 1 })
    });
    const restoreData = await restoreRes.json();
    assert.strictEqual(restoreRes.status, 200);
    assert.strictEqual(restoreData.success, true);
    assert.strictEqual(restoreData.is_active, 1);

    // Verify row is active
    const db = getDb();
    const qRow = db.prepare('SELECT * FROM questions WHERE id = ?').get(historyQuestionId);
    assert.strictEqual(qRow.is_active, 1);

    // Verify answers & scores untouched
    const ans = db.prepare('SELECT * FROM answers WHERE id = ?').get(sampleAnswerId);
    assert.ok(ans);
    assert.strictEqual(ans.points_awarded, 2.0);
  });

  it('9. No SQLITE_CONSTRAINT_FOREIGNKEY reaches frontend when deleting a question with history or foreign keys', async () => {
    const db = getDb();
    // Create a question
    const createRes = await fetch(`${baseUrl}/questions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${admin1Token}`
      },
      body: JSON.stringify({
        round_id: 1,
        question_text: 'Constraint Safety Test Question',
        option_a: 'A',
        option_b: 'B',
        option_c: 'C',
        option_d: 'D',
        correct_option: 'A',
        time_limit_sec: 30
      })
    });
    const { questionId } = await createRes.json();

    // Also point event_state to it to test event_state foreign key as well
    db.prepare('UPDATE event_state SET current_question_id = ? WHERE id = 1').run(questionId);

    // Add answer record
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO answers (team_id, round_id, question_id, selected_option, submitted_at, server_received_at, time_taken_ms, is_correct, points_awarded, is_test_answer)
      VALUES (?, 1, ?, 'A', ?, ?, 1000, 1, 1.0, 0)
    `).run(teamId, questionId, now, now);

    const delRes = await fetch(`${baseUrl}/questions/${questionId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${admin1Token}` }
    });
    const delData = await delRes.json();

    assert.strictEqual(delRes.status, 200);
    assert.strictEqual(delData.success, true);
    assert.strictEqual(delData.disabled, true);
    assert.strictEqual(delData.title, 'QUESTION HAS EVENT HISTORY');
    assert.strictEqual(delData.hasEventHistory, true);

    // Verify row still exists and is disabled
    const qRow = db.prepare('SELECT * FROM questions WHERE id = ?').get(questionId);
    assert.ok(qRow);
    assert.strictEqual(qRow.is_active, 0);

    // Verify answers remain intact
    const ansCount = db.prepare('SELECT COUNT(*) as count FROM answers WHERE question_id = ?').get(questionId).count;
    assert.strictEqual(ansCount, 1);
  });

  it('10. Main Admin only can perform delete and status toggle (RBAC enforcement)', async () => {
    // Admin 2 (Controller) attempting delete -> 403 Forbidden
    const a2Del = await fetch(`${baseUrl}/questions/${historyQuestionId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${admin2Token}` }
    });
    assert.strictEqual(a2Del.status, 403);

    // Team attempting delete -> 403 Forbidden
    const teamDel = await fetch(`${baseUrl}/questions/${historyQuestionId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${teamToken}` }
    });
    assert.strictEqual(teamDel.status, 403);

    // Admin 2 attempting status toggle -> 403 Forbidden
    const a2Status = await fetch(`${baseUrl}/questions/${historyQuestionId}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${admin2Token}`
      },
      body: JSON.stringify({ is_active: 0 })
    });
    assert.strictEqual(a2Status.status, 403);

    // Team attempting status toggle -> 403 Forbidden
    const teamStatus = await fetch(`${baseUrl}/questions/${historyQuestionId}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${teamToken}`
      },
      body: JSON.stringify({ is_active: 0 })
    });
    assert.strictEqual(teamStatus.status, 403);
  });
});
