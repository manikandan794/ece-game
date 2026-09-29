const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const app = require('../src/app');
const { initDatabase, getDb } = require('../src/config/database');
const { setupSocketIO } = require('../src/realtime/socketManager');
const { generateToken } = require('../src/middleware/authMiddleware');

let server;
let ioServer;
let baseUrl;
let admin1Token = '';
let admin2Token = '';
let teamToken = '';
let testTeamId = null;

before(async () => {
  const db = initDatabase();
  server = http.createServer(app);
  const { io } = setupSocketIO(server);
  ioServer = io;

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}/api`;

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

  // Create a test team if not exists
  let t = db.prepare("SELECT * FROM teams WHERE username = 'edit_test_team'").get();
  if (!t) {
    db.prepare(`
      INSERT INTO teams (team_name, college_name, member_count, captain_name, username, password_hash, status, is_test_team, created_at)
      VALUES ('Edit Test Team', 'College', 2, 'Captain Edit', 'edit_test_team', 'hash', 'active', 1, ?)
    `).run(new Date().toISOString());
    t = db.prepare("SELECT * FROM teams WHERE username = 'edit_test_team'").get();
  }
  testTeamId = t.id;
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

describe('GLITCH HUNT - Question Edit & Historical Data Protection Test Suite', () => {
  let unusedQuestionId = null;
  let historicalQuestionId = null;
  let sampleAnswerId = null;

  it('1. Edit unused question - successfully updates all fields', async () => {
    // 1a. Create unused question
    const createRes = await fetch(`${baseUrl}/questions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${admin1Token}`
      },
      body: JSON.stringify({
        round_id: 1,
        question_text: 'Original Unused Question Text',
        option_a: 'Original Opt A',
        option_b: 'Original Opt B',
        option_c: 'Original Opt C',
        option_d: 'Original Opt D',
        correct_option: 'A',
        time_limit_sec: 30,
        explanation: 'Original explanation'
      })
    });
    const createData = await createRes.json();
    assert.strictEqual(createRes.status, 201);
    assert.ok(createData.questionId);
    unusedQuestionId = createData.questionId;

    // 1b. Update unused question as Admin 1
    const updateRes = await fetch(`${baseUrl}/questions/${unusedQuestionId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${admin1Token}`
      },
      body: JSON.stringify({
        round_id: 1,
        question_number: 99,
        question_text: 'Brand New Edited Question Text',
        option_a: 'Edited Opt A',
        option_b: 'Edited Opt B',
        option_c: 'Edited Opt C',
        option_d: 'Edited Opt D',
        correct_option: 'B',
        time_limit_sec: 45,
        explanation: 'Updated thorough explanation',
        is_active: 1
      })
    });

    const updateData = await updateRes.json();
    assert.strictEqual(updateRes.status, 200);
    assert.strictEqual(updateData.success, true);
    assert.strictEqual(updateData.message, 'Question updated successfully');
    assert.strictEqual(updateData.question.id, unusedQuestionId);
    assert.strictEqual(updateData.question.question_text, 'Brand New Edited Question Text');
    assert.strictEqual(updateData.question.correct_option, 'B');
    assert.strictEqual(updateData.question.time_limit_sec, 45);
  });

  it('2. Updated question persists after refresh / reload', async () => {
    // Fetch directly via GET /questions/:id
    const getRes = await fetch(`${baseUrl}/questions/${unusedQuestionId}`, {
      headers: { 'Authorization': `Bearer ${admin1Token}` }
    });
    const getData = await getRes.json();
    assert.strictEqual(getRes.status, 200);
    assert.strictEqual(getData.success, true);
    assert.strictEqual(getData.question.id, unusedQuestionId);
    assert.strictEqual(getData.question.question_text, 'Brand New Edited Question Text');
    assert.strictEqual(getData.question.option_a, 'Edited Opt A');
    assert.strictEqual(getData.question.option_b, 'Edited Opt B');
    assert.strictEqual(getData.question.option_c, 'Edited Opt C');
    assert.strictEqual(getData.question.option_d, 'Edited Opt D');
    assert.strictEqual(getData.question.correct_option, 'B');
    assert.strictEqual(getData.question.time_limit_sec, 45);
    assert.strictEqual(getData.question.explanation, 'Updated thorough explanation');
    assert.strictEqual(getData.question.question_number, 99);

    // Also verify in list endpoint GET /questions
    const listRes = await fetch(`${baseUrl}/questions`, {
      headers: { 'Authorization': `Bearer ${admin1Token}` }
    });
    const listData = await listRes.json();
    const foundInList = listData.questions.find((q) => q.id === unusedQuestionId);
    assert.ok(foundInList, 'Updated question should be present in question bank list');
    assert.strictEqual(foundInList.question_text, 'Brand New Edited Question Text');
  });

  it('3. No duplicate question is created when editing (ID and count preserved)', async () => {
    const db = getDb();
    const countBefore = db.prepare('SELECT COUNT(*) as count FROM questions').get().count;

    // Perform another edit on the same question
    const updateRes = await fetch(`${baseUrl}/questions/${unusedQuestionId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${admin1Token}`
      },
      body: JSON.stringify({
        round_id: 1,
        question_text: 'Another Update To Same Question',
        option_a: 'Opt A2',
        option_b: 'Opt B2',
        option_c: 'Opt C2',
        option_d: 'Opt D2',
        correct_option: 'C',
        time_limit_sec: 25
      })
    });
    assert.strictEqual(updateRes.status, 200);

    const countAfter = db.prepare('SELECT COUNT(*) as count FROM questions').get().count;
    assert.strictEqual(countBefore, countAfter, 'Question count must remain identical; no duplicate row created');

    const checkRows = db.prepare('SELECT * FROM questions WHERE id = ?').all(unusedQuestionId);
    assert.strictEqual(checkRows.length, 1, 'Exactly one row must exist for this question ID');
  });

  it('4. Correct answer updates correctly', async () => {
    // Update correct option to 'D'
    const updateRes = await fetch(`${baseUrl}/questions/${unusedQuestionId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${admin1Token}`
      },
      body: JSON.stringify({
        round_id: 1,
        question_text: 'Another Update To Same Question',
        option_a: 'Opt A2',
        option_b: 'Opt B2',
        option_c: 'Opt C2',
        option_d: 'Opt D2',
        correct_option: 'D',
        time_limit_sec: 25
      })
    });
    assert.strictEqual(updateRes.status, 200);

    const getRes = await fetch(`${baseUrl}/questions/${unusedQuestionId}`, {
      headers: { 'Authorization': `Bearer ${admin1Token}` }
    });
    const getData = await getRes.json();
    assert.strictEqual(getData.question.correct_option, 'D', 'Correct option must be updated to D');
  });

  it('5. Time limit updates correctly', async () => {
    // Update time limit to 50 seconds
    const updateRes = await fetch(`${baseUrl}/questions/${unusedQuestionId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${admin1Token}`
      },
      body: JSON.stringify({
        round_id: 1,
        question_text: 'Another Update To Same Question',
        option_a: 'Opt A2',
        option_b: 'Opt B2',
        option_c: 'Opt C2',
        option_d: 'Opt D2',
        correct_option: 'D',
        time_limit_sec: 50
      })
    });
    assert.strictEqual(updateRes.status, 200);

    const getRes = await fetch(`${baseUrl}/questions/${unusedQuestionId}`, {
      headers: { 'Authorization': `Bearer ${admin1Token}` }
    });
    const getData = await getRes.json();
    assert.strictEqual(getData.question.time_limit_sec, 50, 'Time limit must be updated to 50 seconds');
  });

  it('6. Historical question protection works (Cannot edit questions with recorded answers)', async () => {
    const db = getDb();

    // 6a. Create a question and give it recorded event answers
    const createRes = await fetch(`${baseUrl}/questions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${admin1Token}`
      },
      body: JSON.stringify({
        round_id: 1,
        question_text: 'Historical Question With Answers',
        option_a: 'H Alpha',
        option_b: 'H Beta',
        option_c: 'H Gamma',
        option_d: 'H Delta',
        correct_option: 'A',
        time_limit_sec: 30
      })
    });
    const createData = await createRes.json();
    historicalQuestionId = createData.questionId;

    // Simulate an answer submitted during live event
    const answerResult = db.prepare(`
      INSERT INTO answers (team_id, round_id, question_id, selected_option, submitted_at, server_received_at, time_taken_ms, is_correct, points_awarded)
      VALUES (?, 1, ?, 'A', ?, ?, 5000, 1, 10.0)
    `).run(testTeamId, historicalQuestionId, new Date().toISOString(), new Date().toISOString());
    sampleAnswerId = answerResult.lastInsertRowid;

    // Verify answers count > 0
    const countCheck = db.prepare('SELECT COUNT(*) as count FROM answers WHERE question_id = ?').get(historicalQuestionId).count;
    assert.strictEqual(countCheck, 1);

    // 6b. Attempt to edit the historical question
    const attemptEditRes = await fetch(`${baseUrl}/questions/${historicalQuestionId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${admin1Token}`
      },
      body: JSON.stringify({
        round_id: 1,
        question_text: 'ILLEGALLY MODIFIED HISTORICAL TEXT',
        option_a: 'Tampered Opt',
        option_b: 'Tampered Opt',
        option_c: 'Tampered Opt',
        option_d: 'Tampered Opt',
        correct_option: 'B',
        time_limit_sec: 10
      })
    });

    const attemptData = await attemptEditRes.json();
    // Must be rejected with HTTP 400 Bad Request
    assert.strictEqual(attemptEditRes.status, 400, 'Editing a question with event history must be rejected with HTTP 400');
    assert.strictEqual(attemptData.success, false);
    assert.strictEqual(attemptData.hasEventHistory, true);
    assert.ok(attemptData.message.includes('preserve event history'));

    // 6c. Verify database question text remains intact (UNMODIFIED)
    const storedQ = db.prepare('SELECT * FROM questions WHERE id = ?').get(historicalQuestionId);
    assert.strictEqual(storedQ.question_text, 'Historical Question With Answers', 'Original question text must NOT be changed');
    assert.strictEqual(storedQ.correct_option, 'A', 'Original correct option must NOT be changed');

    // 6d. Verify historical answer remains untouched
    const storedAns = db.prepare('SELECT * FROM answers WHERE id = ?').get(sampleAnswerId);
    assert.ok(storedAns, 'Historical answer record must remain intact');
    assert.strictEqual(storedAns.points_awarded, 10.0);

    // Clean up sample answer and historical question to preserve database state
    db.prepare('DELETE FROM answers WHERE id = ?').run(sampleAnswerId);
    db.prepare('DELETE FROM questions WHERE id = ?').run(historicalQuestionId);
  });

  it('7. RBAC Protection: Sub Admin and Teams cannot edit questions (403 Forbidden)', async () => {
    // 7a. Sub Admin (admin_2) attempt
    const admin2Res = await fetch(`${baseUrl}/questions/${unusedQuestionId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${admin2Token}`
      },
      body: JSON.stringify({
        round_id: 1,
        question_text: 'Admin2 Unauthorized Attempt',
        option_a: 'A',
        option_b: 'B',
        option_c: 'C',
        option_d: 'D',
        correct_option: 'A',
        time_limit_sec: 30
      })
    });
    assert.strictEqual(admin2Res.status, 403, 'Sub Admin must receive 403 Forbidden');

    // 7b. Team user attempt
    const teamRes = await fetch(`${baseUrl}/questions/${unusedQuestionId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${teamToken}`
      },
      body: JSON.stringify({
        round_id: 1,
        question_text: 'Team Unauthorized Attempt',
        option_a: 'A',
        option_b: 'B',
        option_c: 'C',
        option_d: 'D',
        correct_option: 'A',
        time_limit_sec: 30
      })
    });
    assert.strictEqual(teamRes.status, 403, 'Team user must receive 403 Forbidden');

    // 7c. Unauthenticated attempt
    const noAuthRes = await fetch(`${baseUrl}/questions/${unusedQuestionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        round_id: 1,
        question_text: 'No Auth Attempt',
        option_a: 'A',
        option_b: 'B',
        option_c: 'C',
        option_d: 'D',
        correct_option: 'A',
        time_limit_sec: 30
      })
    });
    assert.strictEqual(noAuthRes.status, 401, 'Unauthenticated request must receive 401');

    // Clean up unused question
    const db = getDb();
    db.prepare('DELETE FROM questions WHERE id = ?').run(unusedQuestionId);
  });
});
