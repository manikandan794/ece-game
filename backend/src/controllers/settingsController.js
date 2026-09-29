const { getDb } = require('../config/database');
const { stateMachine } = require('../realtime/stateMachine');
const { getLanUrls } = require('../utils/networkUtils');
const { logAudit } = require('../utils/logger');
const { activeTeamSockets } = require('../realtime/socketManager');

function getSettings(req, res) {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settingsObj = {};
  for (const r of rows) {
    settingsObj[r.key] = r.value;
  }

  const port = process.env.PORT || 5000;
  const lanUrls = getLanUrls(port);

  return res.json({
    success: true,
    settings: settingsObj,
    isTestingMode: stateMachine.isTestingMode,
    currentState: stateMachine.currentState,
    lanUrls
  });
}

function updateSettings(req, res) {
  const { settings } = req.body;
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ success: false, message: 'Settings object required' });
  }

  const db = getDb();
  const updateStmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

  const transaction = db.transaction((entries) => {
    for (const [key, value] of entries) {
      updateStmt.run(key, String(value));
    }
  });

  try {
    transaction(Object.entries(settings));
    logAudit('SETTINGS_UPDATED', 'ADMIN_1', req.user.id, { keys: Object.keys(settings) });
    return res.json({ success: true, message: 'Settings saved successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

function toggleTestingMode(req, res) {
  const { enabled } = req.body;
  stateMachine.setTestingMode(Boolean(enabled));
  logAudit('TESTING_MODE_TOGGLED', 'ADMIN_1', req.user.id, { enabled: stateMachine.isTestingMode });

  return res.json({
    success: true,
    isTestingMode: stateMachine.isTestingMode,
    message: `Testing mode is now ${stateMachine.isTestingMode ? 'ENABLED' : 'DISABLED'}.`
  });
}

function getSystemHealth(req, res) {
  const db = getDb();
  const mem = process.memoryUsage();
  const uptimeSec = Math.floor(process.uptime());

  const teamCount = db.prepare('SELECT COUNT(*) as count FROM teams').get().count;
  const questionCount = db.prepare('SELECT COUNT(*) as count FROM questions').get().count;
  const violationCount = db.prepare('SELECT COUNT(*) as count FROM violations').get().count;

  return res.json({
    success: true,
    health: {
      uptimeSec,
      memory: {
        rssMb: Math.round(mem.rss / (1024 * 1024)),
        heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
        heapTotalMb: Math.round(mem.heapTotal / (1024 * 1024))
      },
      connectedSockets: activeTeamSockets.size,
      totalTeams: teamCount,
      totalQuestions: questionCount,
      totalViolations: violationCount,
      currentState: stateMachine.currentState,
      currentStageId: stateMachine.currentStageId,
      currentQuestionId: stateMachine.currentQuestionId
    }
  });
}

function getAuditLogs(req, res) {
  const db = getDb();
  const limit = Math.min(200, Number(req.query.limit) || 50);
  const logs = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?').all(limit);

  return res.json({ success: true, count: logs.length, logs });
}

function getViolations(req, res) {
  const db = getDb();
  const limit = Math.min(200, Number(req.query.limit) || 50);

  const violations = db.prepare(`
    SELECT v.*, t.team_name, t.college_name, t.captain_name, r.title as round_title, q.question_number
    FROM violations v
    JOIN teams t ON v.team_id = t.id
    LEFT JOIN rounds r ON v.round_id = r.id
    LEFT JOIN questions q ON v.question_id = q.id
    ORDER BY v.id DESC LIMIT ?
  `).all(limit);

  return res.json({ success: true, count: violations.length, violations });
}

module.exports = {
  getSettings,
  updateSettings,
  toggleTestingMode,
  getSystemHealth,
  getAuditLogs,
  getViolations
};
