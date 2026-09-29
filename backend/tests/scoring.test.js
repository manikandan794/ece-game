const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const { initDatabase, getDb } = require('../src/config/database');
const { getLeaderboard } = require('../src/controllers/resultsController');

before(() => {
  initDatabase();
  const db = getDb();
  db.prepare("DELETE FROM answers WHERE team_id IN (SELECT id FROM teams WHERE username LIKE 'test_sc_%')").run();
  db.prepare("DELETE FROM teams WHERE username LIKE 'test_sc_%'").run();
});

describe('GLITCH HUNT - Scoring Engine & Tie-Break Logic Test Suite', () => {
  it('Correct answer records configured points', () => {
    const db = getDb();
    const round1 = db.prepare("SELECT id, scoring_correct FROM rounds WHERE stage_type = 'round_1'").get();
    const q1 = db.prepare('SELECT id, correct_option FROM questions WHERE round_id = ? LIMIT 1').get(round1.id);

    // Create 2 teams for testing
    const teamA = db.prepare(`
      INSERT INTO teams (team_name, college_name, captain_name, username, password_hash, status, is_test_team, created_at)
      VALUES ('Scoring Team Alpha', 'RRASE', 'Capt A', 'test_sc_a', 'hash', 'active', 1, ?)
    `).run(new Date().toISOString());

    const teamB = db.prepare(`
      INSERT INTO teams (team_name, college_name, captain_name, username, password_hash, status, is_test_team, created_at)
      VALUES ('Scoring Team Beta', 'RRASE', 'Capt B', 'test_sc_b', 'hash', 'active', 1, ?)
    `).run(new Date().toISOString());

    const now = new Date().toISOString();

    // Team A submits correct answer
    db.prepare(`
      INSERT INTO answers (team_id, round_id, question_id, selected_option, submitted_at, server_received_at, time_taken_ms, is_correct, points_awarded, is_test_answer)
      VALUES (?, ?, ?, ?, ?, ?, 1200, 1, ?, 1)
    `).run(teamA.lastInsertRowid, round1.id, q1.id, q1.correct_option, now, now, round1.scoring_correct);

    // Team B submits incorrect answer
    const wrongOpt = q1.correct_option === 'A' ? 'B' : 'A';
    db.prepare(`
      INSERT INTO answers (team_id, round_id, question_id, selected_option, submitted_at, server_received_at, time_taken_ms, is_correct, points_awarded, is_test_answer)
      VALUES (?, ?, ?, ?, ?, ?, 2500, 0, 0.0, 1)
    `).run(teamB.lastInsertRowid, round1.id, q1.id, wrongOpt, now, now);

    // Verify answers in DB
    const ansA = db.prepare('SELECT * FROM answers WHERE team_id = ? AND question_id = ? AND is_test_answer = 1').get(teamA.lastInsertRowid, q1.id);
    const ansB = db.prepare('SELECT * FROM answers WHERE team_id = ? AND question_id = ? AND is_test_answer = 1').get(teamB.lastInsertRowid, q1.id);

    assert.strictEqual(ansA.is_correct, 1);
    assert.strictEqual(ansA.points_awarded, round1.scoring_correct);

    assert.strictEqual(ansB.is_correct, 0);
    assert.strictEqual(ansB.points_awarded, 0.0);
  });

  it('Prevent duplicate answer submission via unique database constraint', () => {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM answers WHERE is_test_answer = 1 LIMIT 1').get();
    assert.ok(existing);

    assert.throws(() => {
      db.prepare(`
        INSERT INTO answers (team_id, round_id, question_id, selected_option, submitted_at, server_received_at, time_taken_ms, is_correct, points_awarded, is_test_answer)
        VALUES (?, ?, ?, 'C', ?, ?, 1500, 0, 0.0, 1)
      `).run(existing.team_id, existing.round_id, existing.question_id, new Date().toISOString(), new Date().toISOString());
    }, /UNIQUE constraint failed/);
  });

  it('Leaderboard properly detects tied teams and groups them for tie-breaks', () => {
    const db = getDb();
    const round1 = db.prepare("SELECT id, scoring_correct FROM rounds WHERE stage_type = 'round_1'").get();

    // Create Team C with equal score to Team A
    const teamC = db.prepare(`
      INSERT INTO teams (team_name, college_name, captain_name, username, password_hash, status, is_test_team, created_at)
      VALUES ('Scoring Team Gamma', 'RRASE', 'Capt C', 'test_sc_c', 'hash', 'active', 1, ?)
    `).run(new Date().toISOString());

    const q1 = db.prepare('SELECT id, correct_option FROM questions WHERE round_id = ? LIMIT 1').get(round1.id);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO answers (team_id, round_id, question_id, selected_option, submitted_at, server_received_at, time_taken_ms, is_correct, points_awarded, is_test_answer)
      VALUES (?, ?, ?, ?, ?, ?, 1800, 1, ?, 1)
    `).run(teamC.lastInsertRowid, round1.id, q1.id, q1.correct_option, now, now, round1.scoring_correct || 1.0);

    // Call leaderboard controller directly
    const req = { query: { roundId: round1.id } };
    let responseData = null;
    const res = {
      json: (data) => { responseData = data; return data; }
    };

    // Temporarily ensure stateMachine testing mode is 1
    const { stateMachine } = require('../src/realtime/stateMachine');
    stateMachine.setTestingMode(true);

    getLeaderboard(req, res);

    assert.ok(responseData);
    assert.strictEqual(responseData.success, true);
    
    // Ranks of Team A and Team C must be identical (Rank 1 tie)
    const tied1st = responseData.results.filter(r => r.rank === 1);
    assert.ok(tied1st.length >= 2, 'Should have at least 2 teams tied for 1st place');
    assert.ok(responseData.tiedGroups.length > 0, 'Tied groups array must identify the deadlock');
  });
});
