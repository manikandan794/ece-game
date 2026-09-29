const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { initDatabase, getDb } = require('../src/config/database');
const { JWT_SECRET, generateToken } = require('../src/middleware/authMiddleware');

let server;
let baseUrl;
let admin1Token = '';

before(async () => {
  initDatabase();
  const db = getDb();
  // Ensure test-specific clean slate for our registration test teams
  db.prepare("DELETE FROM teams WHERE team_name LIKE 'E2E Test Team%'").run();

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}/api`;
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  const db = getDb();
  // Clean up any test teams created by this test suite
  db.prepare("DELETE FROM teams WHERE team_name LIKE 'E2E Test Team%'").run();
});

describe('GLITCH HUNT - Team Registration Token Lifecycle & Security Test Suite', () => {
  it('1. Admin 1 login generates a valid token with role admin_1', async () => {
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

  it('2. /auth/me verifies valid admin token and returns user details', async () => {
    const res = await fetch(`${baseUrl}/auth/me`, {
      headers: { 'Authorization': `Bearer ${admin1Token}` }
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.user.username, 'admin1');
    assert.strictEqual(data.user.role, 'admin_1');
  });

  it('3. /auth/me rejects an expired token with HTTP 401', async () => {
    // Generate expired token (-10 seconds)
    const expiredToken = jwt.sign(
      { id: 1, username: 'admin1', role: 'admin_1' },
      JWT_SECRET,
      { expiresIn: '-10s' }
    );

    const res = await fetch(`${baseUrl}/auth/me`, {
      headers: { 'Authorization': `Bearer ${expiredToken}` }
    });
    const data = await res.json();
    assert.strictEqual(res.status, 401);
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.message, 'Invalid or expired token.');
    assert.strictEqual(data.code, 'TOKEN_EXPIRED');
  });

  it('4. Team registration rejects an expired token with HTTP 401 and TOKEN_EXPIRED', async () => {
    const expiredToken = jwt.sign(
      { id: 1, username: 'admin1', role: 'admin_1' },
      JWT_SECRET,
      { expiresIn: '-10s' }
    );

    const res = await fetch(`${baseUrl}/teams`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${expiredToken}`
      },
      body: JSON.stringify({
        team_name: 'E2E Test Team Expired',
        college_name: 'RRASE College of Engineering',
        captain_name: 'Expired Test Captain',
        contact_number: '9876543210'
      })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 401);
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.message, 'Invalid or expired token.');
    assert.strictEqual(data.code, 'TOKEN_EXPIRED');

    // Verify team was NOT created
    const db = getDb();
    const team = db.prepare("SELECT id FROM teams WHERE team_name = 'E2E Test Team Expired'").get();
    assert.strictEqual(team, undefined);
  });

  it('5. Team registration rejects a token signed with the wrong secret', async () => {
    const badSecretToken = jwt.sign(
      { id: 1, username: 'admin1', role: 'admin_1' },
      'completely_wrong_secret_123',
      { expiresIn: '1h' }
    );

    const res = await fetch(`${baseUrl}/teams`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${badSecretToken}`
      },
      body: JSON.stringify({
        team_name: 'E2E Test Team Bad Secret',
        college_name: 'RRASE College of Engineering',
        captain_name: 'Bad Secret Captain'
      })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 401);
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.code, 'TOKEN_INVALID');
  });

  it('6. Team registration succeeds with valid Admin 1 token and generates credentials', async () => {
    const res = await fetch(`${baseUrl}/teams`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${admin1Token}`
      },
      body: JSON.stringify({
        team_name: 'E2E Test Team Valid 1',
        college_name: 'RRASE College of Engineering',
        captain_name: 'Suresh Kumar',
        contact_number: '9876543210'
      })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 201);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.message, 'Team registered successfully.');
    assert.ok(data.team.id);
    assert.strictEqual(data.team.team_name, 'E2E Test Team Valid 1');
    assert.ok(data.team.username);
    assert.ok(data.team.password);

    // Verify database row
    const db = getDb();
    const dbTeam = db.prepare("SELECT * FROM teams WHERE team_name = 'E2E Test Team Valid 1'").get();
    assert.ok(dbTeam);
    assert.strictEqual(dbTeam.captain_name, 'Suresh Kumar');
    assert.strictEqual(dbTeam.contact_number, '9876543210');
    assert.strictEqual(dbTeam.status, 'active');
  });

  it('7. Duplicate team name registration is rejected with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/teams`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${admin1Token}`
      },
      body: JSON.stringify({
        team_name: 'E2E Test Team Valid 1', // duplicate name
        college_name: 'Another College',
        captain_name: 'Another Captain'
      })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 400);
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.message, 'A team with this name already exists.');
  });

  it('8. Re-authenticated Admin 1 can register another team', async () => {
    // Simulate re-login
    const loginRes = await fetch(`${baseUrl}/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin1', password: 'admin123' })
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginRes.status, 200);
    const freshToken = loginData.token;

    const res = await fetch(`${baseUrl}/teams`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${freshToken}`
      },
      body: JSON.stringify({
        team_name: 'E2E Test Team Valid 2',
        college_name: 'MIT Chennai',
        captain_name: 'Ananya Sharma',
        contact_number: '9123456780'
      })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 201);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.team.team_name, 'E2E Test Team Valid 2');
    assert.ok(data.team.username);
    assert.ok(data.team.password);

    // Verify team appears in GET /teams
    const getTeamsRes = await fetch(`${baseUrl}/teams`, {
      headers: { 'Authorization': `Bearer ${freshToken}` }
    });
    const getTeamsData = await getTeamsRes.json();
    assert.strictEqual(getTeamsRes.status, 200);
    const found = getTeamsData.teams.find(t => t.team_name === 'E2E Test Team Valid 2');
    assert.ok(found);
  });

  it('9. Existing real teams are preserved and unmodified', async () => {
    const db = getDb();
    const existing = db.prepare("SELECT * FROM teams WHERE team_name = 'manikandan'").get();
    assert.ok(existing, 'Real team manikandan must remain intact');
    assert.strictEqual(existing.status, 'active');
  });
});
