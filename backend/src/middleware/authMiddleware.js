const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

// Ensure environment variables are loaded regardless of process.cwd()
const envCandidates = [
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../../.env')
];
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
    break;
  }
}
require('dotenv').config();

let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET environment variable is required in production mode. Please set JWT_SECRET in your environment or .env file.');
  }
  JWT_SECRET = 'glitch_hunt_rrase_ece_jwt_secret_change_in_prod_2026';
}

function generateToken(payload, expiresIn = '12h') {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

function verifyToken(req, res, next) {
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: 'Authentication required. No token provided.',
      code: 'NO_TOKEN'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { clockTolerance: 10 });
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ 
      success: false, 
      message: 'Invalid or expired token.',
      code: err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID'
    });
  }
}

function requireAdmin1(req, res, next) {
  verifyToken(req, res, () => {
    if (req.user && req.user.role === 'admin_1') {
      return next();
    }
    return res.status(403).json({ success: false, message: 'Access denied: Admin 1 privilege required.' });
  });
}

function requireAdmin2OrHigher(req, res, next) {
  verifyToken(req, res, () => {
    if (req.user && (req.user.role === 'admin_1' || req.user.role === 'admin_2')) {
      return next();
    }
    return res.status(403).json({ success: false, message: 'Access denied: Controller/Admin privilege required.' });
  });
}

function requireTeam(req, res, next) {
  verifyToken(req, res, () => {
    if (req.user && req.user.role === 'team') {
      return next();
    }
    return res.status(403).json({ success: false, message: 'Access denied: Team credentials required.' });
  });
}

function verifySocketToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET, { clockTolerance: 10 });
  } catch (err) {
    return null;
  }
}

module.exports = {
  JWT_SECRET,
  generateToken,
  verifyToken,
  requireAdmin1,
  requireAdmin2OrHigher,
  requireTeam,
  verifySocketToken
};
