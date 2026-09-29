const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const app = require('../src/app');
const { getDb } = require('../src/config/database');
const { EventStateMachine } = require('../src/realtime/stateMachine');
const TimerEngine = require('../src/realtime/timerEngine');

describe('GLITCH HUNT - Date-Wise Event History, Round Lifecycle & Question Versioning Test Suite', () => {
  let server;
  let port;
  let admin1Token;
  let admin2Token;
  let baseUrl;
  let stateMachine;
  let timerEngine;
  let db;
  let sampleQ;

  before(async () => {
    db = getDb();
    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}/api`;
        resolve();
      });
    });

    // Login Admin 1
    const res1 = await fetch(`${baseUrl}/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin1', password: 'admin123' })
    });
    const d1 = await res1.json();
    admin1Token = d1.token;

    // Login Admin 2
    const res2 = await fetch(`${baseUrl}/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin2', password: 'controller123' })
    });
    const d2 = await res2.json();
    admin2Token = d2.token;

    sampleQ = db.prepare('SELECT id, round_id FROM questions WHERE is_active = 1 LIMIT 1').get();

    stateMachine = new EventStateMachine();
    timerEngine = new TimerEngine(() => null, stateMachine, () => {});
  });

  after(() => {
    if (server) server.close();
    if (timerEngine) timerEngine.clearTimer();
  });

  // ==========================================
  // 1. DATE-WISE EVENT RUNS & HISTORY
  // ==========================================
  describe('1. Date-Wise Event Runs & History', () => {
    let createdRunId;

    it('Main Admin can fetch today’s event run or auto-create one', async () => {
      const res = await fetch(`${baseUrl}/events/today`, {
        headers: { Authorization: `Bearer ${admin1Token}` }
      });
      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.success, true);
      assert.ok(data.eventRun);
      assert.ok(data.eventRun.event_run_id);
    });

    it('Main Admin can create a dedicated Event Run with custom metadata', async () => {
      const testRunId = `GH-TEST-${Date.now()}`;
      const payload = {
        event_run_id: testRunId,
        event_name: 'Synexa 2026 Afternoon Championship',
        event_date: '2026-09-15',
        is_test_mode: 0,
        notes: 'Official afternoon session'
      };

      const res = await fetch(`${baseUrl}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${admin1Token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      assert.strictEqual(res.status, 201);
      assert.strictEqual(data.success, true);
      assert.ok(data.eventRun.event_run_id);
      createdRunId = data.eventRun.event_run_id;
    });

    it('Sub Admin (admin2) cannot create an Event Run (RBAC enforcement)', async () => {
      const res = await fetch(`${baseUrl}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${admin2Token}`
        },
        body: JSON.stringify({ event_run_id: 'FORBIDDEN_RUN' })
      });
      assert.strictEqual(res.status, 403);
    });

    it('Fetch Event Runs filtered by date', async () => {
      const res = await fetch(`${baseUrl}/events?date=2026-09-15`, {
        headers: { Authorization: `Bearer ${admin1Token}` }
      });
      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.eventRuns));
      assert.ok(data.eventRuns.some(r => r.event_run_id === createdRunId));
    });

    it('Event Run details returns round breakdowns and isolated leaderboard', async () => {
      const res = await fetch(`${baseUrl}/events/${createdRunId}`, {
        headers: { Authorization: `Bearer ${admin1Token}` }
      });
      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.success, true);
      assert.ok(data.eventRun);
      assert.ok(Array.isArray(data.roundHistory));
      assert.ok(Array.isArray(data.leaderboard));
    });

    it('Event Run CSV export returns text/csv with date-scoped filename', async () => {
      const res = await fetch(`${baseUrl}/events/${createdRunId}/export/csv`, {
        headers: { Authorization: `Bearer ${admin1Token}` }
      });
      assert.strictEqual(res.status, 200);
      const contentType = res.headers.get('content-type');
      assert.ok(contentType.includes('text/csv'));
      const text = await res.text();
      assert.ok(text.includes('Event Date,Event Run ID,Round Number,Round Name,Question Number,Team ID,Team Name,College'));
    });
  });

  // ==========================================
  // 2. ADMIN 2 ROUND LIFECYCLE & TIMER STATES
  // ==========================================
  describe('2. Admin 2 Round Lifecycle & Timer States', () => {
    it('State machine transitions cleanly to ROUND_STOPPED and preserves context', () => {
      stateMachine.currentStageId = sampleQ ? sampleQ.round_id : null;
      stateMachine.currentQuestionId = sampleQ ? sampleQ.id : null;
      stateMachine.transitionTo('QUESTION_ACTIVE', {
        stageId: sampleQ ? sampleQ.round_id : null,
        questionId: sampleQ ? sampleQ.id : null
      }, true);

      assert.strictEqual(stateMachine.currentState, 'QUESTION_ACTIVE');

      // Operator triggers STOP
      const stopped = stateMachine.transitionTo('ROUND_STOPPED');
      assert.ok(stopped);
      assert.strictEqual(stateMachine.currentState, 'ROUND_STOPPED');
      assert.strictEqual(stateMachine.currentStageId, sampleQ ? sampleQ.round_id : null);
    });

    it('State machine allows RESUME from ROUND_STOPPED to QUESTION_ACTIVE', () => {
      assert.strictEqual(stateMachine.currentState, 'ROUND_STOPPED');
      const resumed = stateMachine.transitionTo('QUESTION_ACTIVE');
      assert.ok(resumed);
      assert.strictEqual(stateMachine.currentState, 'QUESTION_ACTIVE');
    });

    it('State machine transitions to ROUND_COMPLETED and then RESULT', () => {
      const completed = stateMachine.transitionTo('ROUND_COMPLETED');
      assert.ok(completed);
      assert.strictEqual(stateMachine.currentState, 'ROUND_COMPLETED');

      // Operator triggers SHOW RESULTS
      const resultState = stateMachine.transitionTo('RESULT');
      assert.ok(resultState);
      assert.strictEqual(stateMachine.currentState, 'RESULT');
    });

    it('TimerEngine runs result timer with stage duration and triggers completion callback', async () => {
      let completedCalled = false;
      const durationSec = 3; // Minimum test duration

      await new Promise((resolve) => {
        timerEngine.startResultTimer(durationSec, sampleQ ? sampleQ.round_id : 1, (stageId) => {
          completedCalled = true;
          stateMachine.transitionTo('RESULT_COMPLETE');
          resolve();
        });
      });

      assert.strictEqual(completedCalled, true);
      assert.strictEqual(stateMachine.currentState, 'RESULT_COMPLETE');
    });
  });

  // ==========================================
  // 3. QUESTION VERSIONING & SAFE ARCHIVING
  // ==========================================
  describe('3. Question Versioning & Safe Archiving', () => {
    let historicalQuestionId;

    before(() => {
      // Clear live question pointer so question is not considered actively running
      db.prepare("UPDATE event_state SET current_question_id = NULL, state = 'IDLE' WHERE id = 1").run();

      // Find a question that already has answers in the database
      const answeredQ = db.prepare('SELECT question_id FROM answers LIMIT 1').get();
      if (answeredQ) {
        historicalQuestionId = answeredQ.question_id;
      } else {
        const existingQ = db.prepare('SELECT id FROM questions WHERE is_active = 1 LIMIT 1').get();
        if (existingQ) {
          historicalQuestionId = existingQ.id;
          const team = db.prepare('SELECT id FROM teams LIMIT 1').get();
          if (team) {
            const now = new Date().toISOString();
            db.prepare(`
              INSERT INTO answers (team_id, question_id, round_id, selected_option, is_correct, points_awarded, time_taken_ms, submitted_at, server_received_at)
              VALUES (?, ?, 1, 'A', 1, 2, 1000, ?, ?)
            `).run(team.id, historicalQuestionId, now, now);
          }
        }
      }
    });

    it('Creating a new version clones question, links parent, and archives parent', async () => {
      const res = await fetch(`${baseUrl}/questions/${historicalQuestionId}/version`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${admin1Token}`
        },
        body: JSON.stringify({
          question_text: 'Updated Versioned Question Text for Next Event Run',
          option_a: 'Modified Option A',
          option_b: 'Modified Option B',
          option_c: 'Modified Option C',
          option_d: 'Modified Option D',
          correct_option: 'B',
          time_limit_sec: 45
        })
      });

      const data = await res.json();
      assert.strictEqual(res.status, 201);
      assert.strictEqual(data.success, true);
      assert.ok(data.question);
      assert.strictEqual(data.question.parent_question_id, historicalQuestionId);
      assert.ok(data.question.version >= 2);
      assert.strictEqual(data.question.question_text, 'Updated Versioned Question Text for Next Event Run');

      // Verify parent was archived and not deleted
      const parentQ = db.prepare('SELECT id, is_active FROM questions WHERE id = ?').get(historicalQuestionId);
      assert.ok(parentQ);
      assert.strictEqual(parentQ.is_active, 0, 'Parent question must be deactivated to preserve historical accuracy');

      // Verify historical answers are completely intact
      const answers = db.prepare('SELECT count(*) as count FROM answers WHERE question_id = ?').get(historicalQuestionId);
      assert.ok(answers.count > 0, 'Historical answers must not be deleted or corrupted');
    });

    it('Cannot edit or version a question that is currently active on live projector', async () => {
      const activeQ = db.prepare('SELECT id FROM questions WHERE is_active = 1 LIMIT 1').get();
      if (activeQ) {
        // Mark as active in database event_state
        db.prepare('UPDATE event_state SET current_question_id = ? WHERE id = 1').run(activeQ.id);

        const res = await fetch(`${baseUrl}/questions/${activeQ.id}/version`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${admin1Token}`
          },
          body: JSON.stringify({ question_text: 'Attempted live version' })
        });

        const data = await res.json();
        assert.strictEqual(res.status, 400);
        assert.strictEqual(data.success, false);
        assert.ok(data.message.includes('CURRENTLY ACTIVE'));

        // Reset state
        db.prepare('UPDATE event_state SET current_question_id = NULL WHERE id = 1').run();
      }
    });
  });
});
