const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const app = require('../src/app');
const { initDatabase, getDb } = require('../src/config/database');

let server;
let baseUrl;
let admin1Token = '';
let admin2Token = '';
let teamToken = '';
let createdTeamId = null;
let createdQuestionId = null;

before(async () => {
  initDatabase();
  const db = getDb();
  db.prepare("DELETE FROM teams WHERE team_name = 'Silicon Pioneers'").run();
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}/api`;
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

describe('GLITCH HUNT - Authentication & RBAC Test Suite', () => {
  it('Admin 1 login with valid credentials succeeds', async () => {
    const res = await fetch(`${baseUrl}/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin1', password: 'admin123' })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.user.role, 'admin_1');
    assert.ok(data.token);
    admin1Token = data.token;
  });

  it('Admin login with invalid credentials fails with 401', async () => {
    const res = await fetch(`${baseUrl}/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin1', password: 'wrongpassword' })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 401);
    assert.strictEqual(data.success, false);
  });

  it('Admin 2 login succeeds with controller role', async () => {
    const res = await fetch(`${baseUrl}/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin2', password: 'controller123' })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.user.role, 'admin_2');
    admin2Token = data.token;
  });

  it('Admin 1 can create a new team with auto-generated credentials', async () => {
    const res = await fetch(`${baseUrl}/teams`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${admin1Token}`
      },
      body: JSON.stringify({
        team_name: 'Silicon Pioneers',
        college_name: 'RRASE College of Engineering',
        captain_name: 'Kavitha R',
        member_count: 3,
        members: 'Kavitha R, Naveen S, Priya M',
        department: 'ECE',
        year: 'III'
      })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 201);
    assert.strictEqual(data.success, true);
    assert.ok(data.team.username);
    assert.ok(data.team.password);
    createdTeamId = data.team.id;

    // Test Team Login with generated credentials
    const loginRes = await fetch(`${baseUrl}/auth/team/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: data.team.username,
        password: data.team.password
      })
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginRes.status, 200);
    assert.strictEqual(loginData.success, true);
    assert.strictEqual(loginData.team.teamName, 'Silicon Pioneers');
    teamToken = loginData.token;
  });

  it('RBAC Enforcement: Team cannot call Admin 1 endpoints (403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/teams`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${teamToken}`
      },
      body: JSON.stringify({
        team_name: 'Hacker Team',
        college_name: 'Unknown',
        captain_name: 'Evil'
      })
    });
    assert.strictEqual(res.status, 403);
  });

  it('Admin 2 cannot mutate Admin 1 settings (403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${admin2Token}`
      },
      body: JSON.stringify({
        settings: { event_name: 'Hacked Event' }
      })
    });
    assert.strictEqual(res.status, 403);
  });
});

describe('GLITCH HUNT - Question & Stage Management Test Suite', () => {
  it('Admin 1 can add unlimited questions to any round', async () => {
    const res = await fetch(`${baseUrl}/questions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${admin1Token}`
      },
      body: JSON.stringify({
        round_id: 1,
        question_text: 'What does MOSFET stand for?',
        option_a: 'Metal Oxide Silicon Field Effect Transistor',
        option_b: 'Metal Oxide Semiconductor Field Effect Transistor',
        option_c: 'Micro Output Semiconductor Field Effect Transistor',
        option_d: 'Modulated Optical Semiconductor Field Effect Transistor',
        correct_option: 'B',
        time_limit_sec: 25,
        explanation: 'MOSFET stands for Metal-Oxide-Semiconductor Field-Effect Transistor.'
      })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 201);
    assert.ok(data.questionId);
    createdQuestionId = data.questionId;
  });

  it('Admin 2 can read questions for live projection', async () => {
    const res = await fetch(`${baseUrl}/questions/round/1`, {
      headers: { 'Authorization': `Bearer ${admin2Token}` }
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.ok(data.questions.length >= 1);
  });

  it('All 8 configurable stages are accessible', async () => {
    const res = await fetch(`${baseUrl}/rounds`);
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.rounds.length, 8);
    assert.strictEqual(data.rounds[0].stage_type, 'round_1');
    assert.strictEqual(data.rounds[1].stage_type, 'round_2');
    assert.strictEqual(data.rounds[2].stage_type, 'tie_break_1');
    assert.strictEqual(data.rounds[7].stage_type, 'tie_break_6');
  });
});

describe('GLITCH HUNT - System Diagnostics & Settings Test Suite', () => {
  it('Settings endpoint returns college & LAN details', async () => {
    const res = await fetch(`${baseUrl}/settings`);
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.settings.college, 'RRASE COLLEGE OF ENGINEERING');
    assert.strictEqual(data.settings.department, 'Department of ECE');
    assert.strictEqual(data.settings.event_name, 'GLITCH HUNT');
    assert.ok(data.lanUrls.user);
    assert.ok(data.lanUrls.admin1);
    assert.ok(data.lanUrls.projector);
  });

  it('Admin 1 can toggle Testing Mode', async () => {
    const res = await fetch(`${baseUrl}/settings/testing-mode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${admin1Token}`
      },
      body: JSON.stringify({ enabled: true })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.isTestingMode, true);

    // Toggle back to false
    await fetch(`${baseUrl}/settings/testing-mode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${admin1Token}`
      },
      body: JSON.stringify({ enabled: false })
    });
  });

  it('Health status provides memory & socket statistics', async () => {
    const res = await fetch(`${baseUrl}/settings/health`, {
      headers: { 'Authorization': `Bearer ${admin1Token}` }
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.ok(data.health.uptimeSec >= 0);
    assert.ok(data.health.memory.heapUsedMb > 0);
  });
});
