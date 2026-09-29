const bcrypt = require('bcryptjs');
const { getDb } = require('../config/database');
const { generateToken } = require('../middleware/authMiddleware');
const { logAudit } = require('../utils/logger');

function loginAdmin(req, res) {
  const { username, password } = req.body;
  const clientIp = req.ip || req.connection.remoteAddress;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required' });
  }

  const db = getDb();
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);

  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    logAudit('ADMIN_LOGIN_FAILED', 'UNKNOWN', username, { reason: 'Bad credentials' }, clientIp);
    return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
  }

  const token = generateToken({
    id: admin.id,
    username: admin.username,
    role: admin.role,
    name: admin.display_name
  });

  logAudit('ADMIN_LOGIN_SUCCESS', admin.role.toUpperCase(), admin.id, { username }, clientIp);

  return res.json({
    success: true,
    token,
    user: {
      id: admin.id,
      username: admin.username,
      role: admin.role,
      displayName: admin.display_name
    }
  });
}

function loginTeam(req, res) {
  const { username, password } = req.body;
  const clientIp = req.ip || req.connection.remoteAddress;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Team username and password are required' });
  }

  const db = getDb();
  const team = db.prepare('SELECT * FROM teams WHERE username = ?').get(username);

  if (!team || !bcrypt.compareSync(password, team.password_hash)) {
    logAudit('TEAM_LOGIN_FAILED', 'UNKNOWN', username, { reason: 'Bad credentials' }, clientIp);
    return res.status(401).json({ success: false, message: 'Invalid team credentials' });
  }

  if (team.status === 'disabled') {
    return res.status(403).json({ success: false, message: 'This team account has been temporarily disabled by the administrator.' });
  }

  if (team.status === 'disqualified') {
    return res.status(403).json({ success: false, message: 'This team has been disqualified from the event.' });
  }

  const token = generateToken({
    id: team.id,
    username: team.username,
    role: 'team',
    team_name: team.team_name,
    college_name: team.college_name,
    is_test_team: Boolean(team.is_test_team)
  });

  logAudit('TEAM_LOGIN_SUCCESS', 'TEAM', team.id, { team_name: team.team_name }, clientIp);

  return res.json({
    success: true,
    token,
    team: {
      id: team.id,
      teamName: team.team_name,
      collegeName: team.college_name,
      captainName: team.captain_name,
      status: team.status,
      isTestTeam: Boolean(team.is_test_team)
    }
  });
}

function getMe(req, res) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }
  return res.json({ success: true, user: req.user });
}

module.exports = {
  loginAdmin,
  loginTeam,
  getMe
};
