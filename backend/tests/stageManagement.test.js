const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const app = require('../src/app');
const { initDatabase, getDb } = require('../src/config/database');

let server;
let baseUrl;
let admin1Token = '';
let admin2Token = '';
let createdTestStageId = null;

before(async () => {
  initDatabase();
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}/api`;

  // Log in Admin 1
  const a1Res = await fetch(`${baseUrl}/auth/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin1', password: 'admin123' })
  });
  const a1Data = await a1Res.json();
  admin1Token = a1Data.token;

  // Log in Admin 2
  const a2Res = await fetch(`${baseUrl}/auth/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin2', password: 'controller123' })
  });
  const a2Data = await a2Res.json();
  admin2Token = a2Data.token;
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

describe('GLITCH HUNT - Stage Description & Rule Management Test Suite', () => {
  it('1. Main Admin and Sub Admin can view all stages with descriptions and rules', async () => {
    const res = await fetch(`${baseUrl}/rounds`);
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(data.rounds.length >= 8, 'Should have at least 8 default stages');

    const round1 = data.rounds.find((r) => r.stage_number === 1);
    assert.ok(round1, 'Round 1 must exist');
    assert.ok(round1.title, 'Round 1 title exists');
    assert.ok(round1.description, 'Round 1 description exists');
    assert.ok(Array.isArray(round1.rules), 'Round 1 rules must be an array');
    assert.ok(round1.rules.length > 0, 'Round 1 must have at least one rule');
    assert.strictEqual(round1.is_enabled, 1, 'Default round should be enabled');
    assert.ok(round1.questionCount >= 0, 'questionCount attached');
  });

  it('2. Main Admin can update stage title, short description, detailed description, and multiline rules', async () => {
    const updatedRules = [
      'Rule 1: Strict silence during active audio waveform challenge',
      'Rule 2: Each team has exactly 30 seconds to lock option',
      'Rule 3: Live telemetry monitors anti-cheat heartbeat'
    ];

    const res = await fetch(`${baseUrl}/rounds/1`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${admin1Token}`
      },
      body: JSON.stringify({
        title: 'Round 1: Advanced Technical Circuitry',
        subtitle: 'Core Electronics & Logic Design (Updated)',
        description: 'Comprehensive evaluation of semiconductor physics, logic gates, and antenna design.',
        rules: updatedRules,
        scoring_correct: 2.0,
        scoring_wrong: -0.5
      })
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.round.title, 'Round 1: Advanced Technical Circuitry');
    assert.strictEqual(data.round.subtitle, 'Core Electronics & Logic Design (Updated)');
    assert.deepStrictEqual(data.round.rules, updatedRules);

    // Verify persisted in database
    const db = getDb();
    const dbRound = db.prepare('SELECT * FROM rounds WHERE id = 1').get();
    assert.strictEqual(dbRound.title, 'Round 1: Advanced Technical Circuitry');
    assert.strictEqual(dbRound.scoring_correct, 2.0);
    assert.strictEqual(dbRound.scoring_wrong, -0.5);
    const parsedDbRules = JSON.parse(dbRound.rules);
    assert.deepStrictEqual(parsedDbRules, updatedRules);
  });

  it('3. Sub Admin receives updated stage description and rules dynamically', async () => {
    const res = await fetch(`${baseUrl}/rounds/1`, {
      headers: { 'Authorization': `Bearer ${admin2Token}` }
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.round.title, 'Round 1: Advanced Technical Circuitry');
    assert.strictEqual(data.round.subtitle, 'Core Electronics & Logic Design (Updated)');
    assert.strictEqual(data.round.rules.length, 3);
    assert.strictEqual(data.round.rules[0], 'Rule 1: Strict silence during active audio waveform challenge');
  });

  it('4. Sub Admin (Admin 2) write requests are blocked with HTTP 403 Forbidden', async () => {
    // Attempt stage creation by Sub Admin
    const createRes = await fetch(`${baseUrl}/rounds`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${admin2Token}`
      },
      body: JSON.stringify({ title: 'Hacked Stage by Controller' })
    });
    assert.strictEqual(createRes.status, 403, 'Sub Admin cannot create stages');

    // Attempt stage update by Sub Admin
    const updateRes = await fetch(`${baseUrl}/rounds/1`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${admin2Token}`
      },
      body: JSON.stringify({ title: 'Hacked Title' })
    });
    assert.strictEqual(updateRes.status, 403, 'Sub Admin cannot update stages');

    // Attempt stage status toggle by Sub Admin
    const toggleRes = await fetch(`${baseUrl}/rounds/1/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${admin2Token}`
      },
      body: JSON.stringify({ is_enabled: 0 })
    });
    assert.strictEqual(toggleRes.status, 403, 'Sub Admin cannot toggle stage status');

    // Attempt stage deletion by Sub Admin
    const deleteRes = await fetch(`${baseUrl}/rounds/1`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${admin2Token}` }
    });
    assert.strictEqual(deleteRes.status, 403, 'Sub Admin cannot delete stages');
  });

  it('5. Delete safety: stages with questions cannot be destructively deleted without force flag', async () => {
    // Stage 1 has questions
    const res = await fetch(`${baseUrl}/rounds/1`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${admin1Token}` }
    });
    const data = await res.json();
    assert.strictEqual(res.status, 400);
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.hasDependentData, true);
    assert.ok(data.questionCount > 0);
    assert.match(data.message, /contains \d+ question/i);

    // Verify stage 1 still exists in database
    const db = getDb();
    const check = db.prepare('SELECT id FROM rounds WHERE id = 1').get();
    assert.ok(check, 'Stage 1 must remain intact after blocked delete');
  });

  it('6. Main Admin can safely disable a stage with questions instead of deleting', async () => {
    // Disable stage 1
    const disableRes = await fetch(`${baseUrl}/rounds/1/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${admin1Token}`
      },
      body: JSON.stringify({ is_enabled: 0 })
    });
    const disableData = await disableRes.json();
    assert.strictEqual(disableRes.status, 200);
    assert.strictEqual(disableData.success, true);
    assert.strictEqual(disableData.is_enabled, 0);

    // Verify in GET /rounds/1: is_enabled is 0, questions are 100% intact
    const getRes = await fetch(`${baseUrl}/rounds/1`);
    const getData = await getRes.json();
    assert.strictEqual(getData.round.is_enabled, 0);
    assert.ok(getData.round.questionCount > 0, 'Questions must remain intact');

    // Re-enable stage 1
    const enableRes = await fetch(`${baseUrl}/rounds/1/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${admin1Token}`
      },
      body: JSON.stringify({ is_enabled: 1 })
    });
    const enableData = await enableRes.json();
    assert.strictEqual(enableData.is_enabled, 1);
  });

  it('7. Main Admin can create a new stage and delete it safely when empty', async () => {
    // Create new stage
    const createRes = await fetch(`${baseUrl}/rounds`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${admin1Token}`
      },
      body: JSON.stringify({
        title: 'Bonus Stage: Microcontroller Duel',
        subtitle: 'Embedded Systems Quickfire',
        description: 'Rapid quiz on 8051, PIC, and ARM architecture.',
        rules: [
          'Direct hardware questions only',
          'Fastest team receives bonus multiplier'
        ],
        is_tie_break: 0,
        scoring_correct: 3.0,
        scoring_wrong: -1.0,
        is_enabled: 1
      })
    });

    const createData = await createRes.json();
    assert.strictEqual(createRes.status, 201);
    assert.strictEqual(createData.success, true);
    assert.ok(createData.round.id);
    createdTestStageId = createData.round.id;
    assert.strictEqual(createData.round.title, 'Bonus Stage: Microcontroller Duel');
    assert.strictEqual(createData.round.rules.length, 2);

    // Delete empty stage without force (should succeed because 0 questions, 0 answers)
    const delRes = await fetch(`${baseUrl}/rounds/${createdTestStageId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${admin1Token}` }
    });
    const delData = await delRes.json();
    assert.strictEqual(delRes.status, 200);
    assert.strictEqual(delData.success, true);

    // Verify stage is deleted
    const verifyRes = await fetch(`${baseUrl}/rounds/${createdTestStageId}`);
    assert.strictEqual(verifyRes.status, 404);
  });

  it('8. Forced deletion removes stage when force=true is explicitly provided', async () => {
    // Create temporary stage
    const createRes = await fetch(`${baseUrl}/rounds`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${admin1Token}`
      },
      body: JSON.stringify({
        title: 'Temporary Stage To Be Forced Deleted',
        subtitle: 'Forced delete test',
        rules: ['Sample rule']
      })
    });
    const stageData = await createRes.json();
    const tempStageId = stageData.round.id;

    // Add a question to this temporary stage
    const qRes = await fetch(`${baseUrl}/questions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${admin1Token}`
      },
      body: JSON.stringify({
        round_id: tempStageId,
        question_text: 'Temporary Question for Force Delete Test?',
        option_a: 'Alpha',
        option_b: 'Beta',
        option_c: 'Gamma',
        option_d: 'Delta',
        correct_option: 'A',
        time_limit_sec: 15
      })
    });
    assert.strictEqual(qRes.status, 201);

    // Try deleting without force -> should be rejected
    const blockedRes = await fetch(`${baseUrl}/rounds/${tempStageId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${admin1Token}` }
    });
    assert.strictEqual(blockedRes.status, 400);

    // Delete with force=true -> should succeed
    const forceRes = await fetch(`${baseUrl}/rounds/${tempStageId}?force=true`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${admin1Token}` }
    });
    const forceData = await forceRes.json();
    assert.strictEqual(forceRes.status, 200);
    assert.strictEqual(forceData.success, true);

    // Confirm deleted from DB
    const db = getDb();
    const checkStage = db.prepare('SELECT id FROM rounds WHERE id = ?').get(tempStageId);
    assert.strictEqual(checkStage, undefined);
    const checkQ = db.prepare('SELECT id FROM questions WHERE round_id = ?').all(tempStageId);
    assert.strictEqual(checkQ.length, 0);
  });
});
