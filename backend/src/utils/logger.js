const fs = require('fs');
const path = require('path');

let dbInstance = null;

function setLoggerDb(db) {
  dbInstance = db;
}

function logAudit(action, actorType, actorId, details = {}, ip = '') {
  const timestamp = new Date().toISOString();
  const detailsStr = typeof details === 'string' ? details : JSON.stringify(details);
  
  console.log(`[AUDIT ${timestamp}] [${actorType}:${actorId}] ${action} - ${detailsStr}`);

  if (dbInstance) {
    try {
      const stmt = dbInstance.prepare(`
        INSERT INTO audit_logs (action, actor_type, actor_id, details, ip_address, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      stmt.run(action, actorType, String(actorId), detailsStr, ip, timestamp);
    } catch (err) {
      console.error('[LOGGER ERROR] Failed to record audit log:', err.message);
    }
  }
}

function info(msg, ...args) {
  console.log(`[INFO ${new Date().toISOString()}]`, msg, ...args);
}

function warn(msg, ...args) {
  console.warn(`[WARN ${new Date().toISOString()}]`, msg, ...args);
}

function error(msg, ...args) {
  console.error(`[ERROR ${new Date().toISOString()}]`, msg, ...args);
}

module.exports = {
  setLoggerDb,
  logAudit,
  info,
  warn,
  error
};
