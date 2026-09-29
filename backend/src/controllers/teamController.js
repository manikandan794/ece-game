const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getDb } = require('../config/database');
const { logAudit } = require('../utils/logger');
const { activeTeamSockets } = require('../realtime/socketManager');

function generateUniqueCredentials(teamName) {
  // Generate clean slug from team name
  const slug = teamName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .substring(0, 8) || 'team';
  const randomSuffix = crypto.randomInt(100, 999);
  const username = `${slug}_${randomSuffix}`;
  
  // Memorable 6-character uppercase/number password: e.g. ECE942
  const passChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let password = 'ECE';
  for (let i = 0; i < 4; i++) {
    password += passChars[crypto.randomInt(0, passChars.length)];
  }

  return { username, password };
}

function getAllTeams(req, res) {
  const db = getDb();
  const isTest = req.query.isTest !== undefined ? parseInt(req.query.isTest, 10) : null;
  const search = req.query.search ? `%${req.query.search}%` : null;

  let query = 'SELECT * FROM teams WHERE 1=1';
  const params = [];

  if (isTest !== null) {
    query += ' AND is_test_team = ?';
    params.push(isTest);
  }

  if (search) {
    query += ' AND (team_name LIKE ? OR college_name LIKE ? OR captain_name LIKE ? OR username LIKE ?)';
    params.push(search, search, search, search);
  }

  query += ' ORDER BY id DESC';

  const teams = db.prepare(query).all(...params);

  // Attach connection status & violation counts
  const enriched = teams.map(t => {
    const isConnected = activeTeamSockets.has(t.id);
    const violations = db.prepare('SELECT COUNT(*) as count FROM violations WHERE team_id = ?').get(t.id).count;
    const score = db.prepare('SELECT COALESCE(SUM(points_awarded), 0) as total FROM answers WHERE team_id = ? AND is_test_answer = ?').get(t.id, t.is_test_team).total;

    return {
      ...t,
      password_hash: undefined, // Never expose hash in response
      isConnected,
      violationCount: violations,
      totalScore: score
    };
  });

  return res.json({ success: true, count: enriched.length, teams: enriched });
}

function getTeamById(req, res) {
  const db = getDb();
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id);

  if (!team) {
    return res.status(404).json({ success: false, message: 'Team not found' });
  }

  const isConnected = activeTeamSockets.has(team.id);
  const violations = db.prepare('SELECT * FROM violations WHERE team_id = ? ORDER BY id DESC').all(team.id);
  const answers = db.prepare('SELECT * FROM answers WHERE team_id = ? ORDER BY id DESC').all(team.id);

  return res.json({
    success: true,
    team: {
      ...team,
      password_hash: undefined,
      isConnected,
      violations,
      answers
    }
  });
}

function createTeam(req, res) {
  const {
    team_name,
    college_name,
    member_count = 2,
    members = '',
    captain_name,
    contact_number = '',
    email = '',
    department = 'ECE',
    year = '',
    custom_username,
    custom_password,
    is_test_team = 0
  } = req.body;

  if (!team_name || !college_name || !captain_name) {
    return res.status(400).json({ success: false, message: 'Team name, college name, and captain name are required.' });
  }

  const db = getDb();

  // Check unique team name
  const existingName = db.prepare('SELECT id FROM teams WHERE team_name = ?').get(team_name);
  if (existingName) {
    return res.status(400).json({ success: false, message: 'A team with this name already exists.' });
  }

  let { username, password } = generateUniqueCredentials(team_name);
  if (custom_username && custom_username.trim()) {
    username = custom_username.trim();
  }
  if (custom_password && custom_password.trim()) {
    password = custom_password.trim();
  }

  // Check unique username
  const existingUser = db.prepare('SELECT id FROM teams WHERE username = ?').get(username);
  if (existingUser) {
    username = `${username}_${crypto.randomInt(10, 99)}`;
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const now = new Date().toISOString();

  try {
    const insert = db.prepare(`
      INSERT INTO teams (
        team_name, college_name, member_count, members, captain_name,
        contact_number, email, department, year, username, password_hash,
        password_plain_hint, status, is_test_team, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `);

    const result = insert.run(
      team_name,
      college_name,
      Number(member_count) || 2,
      typeof members === 'string' ? members : JSON.stringify(members),
      captain_name,
      contact_number,
      email,
      department,
      year,
      username,
      passwordHash,
      password, // Plain hint for on-the-spot team credential slips
      is_test_team ? 1 : 0,
      now
    );

    logAudit('TEAM_CREATED', 'ADMIN_1', req.user ? req.user.id : 'SYSTEM', {
      team_id: result.lastInsertRowid,
      team_name,
      username
    });

    return res.status(201).json({
      success: true,
      message: 'Team registered successfully.',
      team: {
        id: result.lastInsertRowid,
        team_name,
        college_name,
        captain_name,
        username,
        password, // Returned once upon creation for slip printing/handover
        status: 'active'
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

function updateTeam(req, res) {
  const teamId = req.params.id;
  const {
    team_name,
    college_name,
    member_count,
    members,
    captain_name,
    contact_number,
    email,
    department,
    year,
    status
  } = req.body;

  const db = getDb();
  const existing = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Team not found' });
  }

  try {
    db.prepare(`
      UPDATE teams SET
        team_name = COALESCE(?, team_name),
        college_name = COALESCE(?, college_name),
        member_count = COALESCE(?, member_count),
        members = COALESCE(?, members),
        captain_name = COALESCE(?, captain_name),
        contact_number = COALESCE(?, contact_number),
        email = COALESCE(?, email),
        department = COALESCE(?, department),
        year = COALESCE(?, year),
        status = COALESCE(?, status)
      WHERE id = ?
    `).run(
      team_name,
      college_name,
      member_count,
      members,
      captain_name,
      contact_number,
      email,
      department,
      year,
      status,
      teamId
    );

    logAudit('TEAM_UPDATED', 'ADMIN_1', req.user.id, { teamId, updates: req.body });

    return res.json({ success: true, message: 'Team updated successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

function resetCredentials(req, res) {
  const teamId = req.params.id;
  const db = getDb();
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);

  if (!team) {
    return res.status(404).json({ success: false, message: 'Team not found' });
  }

  const passChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let newPassword = 'ECE';
  for (let i = 0; i < 4; i++) {
    newPassword += passChars[crypto.randomInt(0, passChars.length)];
  }
  const passwordHash = bcrypt.hashSync(newPassword, 10);

  db.prepare(`
    UPDATE teams SET password_hash = ?, password_plain_hint = ? WHERE id = ?
  `).run(passwordHash, newPassword, teamId);

  logAudit('TEAM_PASSWORD_RESET', 'ADMIN_1', req.user.id, { teamId, username: team.username });

  return res.json({
    success: true,
    message: 'Credentials reset successfully',
    credentials: {
      username: team.username,
      newPassword
    }
  });
}

function deleteTeam(req, res) {
  const teamId = req.params.id;
  const db = getDb();

  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
  if (!team) {
    return res.status(404).json({ success: false, message: 'Team not found' });
  }

  db.prepare('DELETE FROM teams WHERE id = ?').run(teamId);
  logAudit('TEAM_DELETED', 'ADMIN_1', req.user.id, { teamId, team_name: team.team_name });

  return res.json({ success: true, message: 'Team deleted successfully' });
}

function toggleTeamStatus(req, res) {
  const teamId = req.params.id;
  const { status } = req.body;

  if (!['active', 'disabled', 'disqualified'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status' });
  }

  const db = getDb();
  db.prepare('UPDATE teams SET status = ? WHERE id = ?').run(status, teamId);
  logAudit('TEAM_STATUS_CHANGED', 'ADMIN_1', req.user.id, { teamId, status });

  return res.json({ success: true, message: `Team status updated to ${status}` });
}

/**
 * Bulk generate test teams for testing mode (e.g. 10, 30, 60 teams)
 */
function generateTestTeams(req, res) {
  const count = Math.min(100, Math.max(1, Number(req.body.count) || 10));
  const db = getDb();
  const created = [];
  const now = new Date().toISOString();

  const sampleColleges = [
    'RRASE College of Engineering',
    'MIT Campus Anna University',
    'SSN College of Engineering',
    'Sri Sivasubramaniya Nadar',
    'College of Engineering Guindy',
    'PSG College of Technology',
    'Thiagarajar College of Engg'
  ];

  const insert = db.prepare(`
    INSERT INTO teams (
      team_name, college_name, member_count, members, captain_name,
      contact_number, email, department, year, username, password_hash,
      password_plain_hint, status, is_test_team, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?)
  `);

  for (let i = 1; i <= count; i++) {
    const numStr = String(i).padStart(2, '0');
    const teamName = `Test Team ${numStr}`;
    const college = sampleColleges[i % sampleColleges.length];
    const username = `test_team_${numStr}`;
    const password = `TEST${numStr}#`;
    const passwordHash = bcrypt.hashSync(password, 8);

    try {
      const res = insert.run(
        teamName,
        college,
        2,
        `Member 1, Member 2`,
        `Captain ${numStr}`,
        `98765432${numStr}`,
        `test${numStr}@rrase.edu`,
        'ECE',
        'III Year',
        username,
        passwordHash,
        password,
        now
      );

      created.push({
        id: res.lastInsertRowid,
        teamName,
        username,
        password,
        college
      });
    } catch (err) {
      // If already exists, skip
    }
  }

  logAudit('BULK_TEST_TEAMS_GENERATED', 'ADMIN_1', req.user ? req.user.id : 'SYSTEM', { count: created.length });

  return res.json({
    success: true,
    message: `Generated ${created.length} test teams successfully.`,
    count: created.length,
    sample: created.slice(0, 5)
  });
}

function clearTestTeams(req, res) {
  const db = getDb();
  const delAnswers = db.prepare('DELETE FROM answers WHERE is_test_answer = 1').run();
  const delTeams = db.prepare('DELETE FROM teams WHERE is_test_team = 1').run();

  logAudit('TEST_DATA_CLEARED', 'ADMIN_1', req.user ? req.user.id : 'SYSTEM', {
    teamsDeleted: delTeams.changes,
    answersDeleted: delAnswers.changes
  });

  return res.json({
    success: true,
    message: `Cleared ${delTeams.changes} test teams and ${delAnswers.changes} test answers.`
  });
}

module.exports = {
  getAllTeams,
  getTeamById,
  createTeam,
  updateTeam,
  resetCredentials,
  deleteTeam,
  toggleTeamStatus,
  generateTestTeams,
  clearTestTeams
};
