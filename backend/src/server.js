const path = require('path');
const fs = require('fs');

const envCandidates = [
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env')
];
for (const p of envCandidates) {
  if (fs.existsSync(p)) {
    require('dotenv').config({ path: p });
    break;
  }
}
require('dotenv').config();

const http = require('http');
const app = require('./app');
const { initDatabase } = require('./config/database');
const { setupSocketIO } = require('./realtime/socketManager');
const { getLanUrls } = require('./utils/networkUtils');

const PORT = parseInt(process.env.PORT || '5000', 10);
const HOST = process.env.HOST || '0.0.0.0';

// 1. Initialize SQLite Database
initDatabase();

// 2. Create HTTP Server & Socket.IO
const server = http.createServer(app);
const { io, timerEngine } = setupSocketIO(server);

// 3. Start Listening
server.listen(PORT, HOST, () => {
  const lan = getLanUrls(PORT);

  console.log('\n' + '='.repeat(68));
  console.log('       ⚡ GLITCH HUNT - RRASE ECE TECHNICAL SYMPOSIUM ⚡');
  console.log('='.repeat(68));
  console.log(` SERVER STATUS  : ONLINE`);
  console.log(` HOST           : ${HOST}`);
  console.log(` PORT           : ${PORT}`);
  console.log(` LOCAL IP (LAN) : ${lan.ip}`);
  console.log('-'.repeat(68));
  console.log(` 🌐 PUBLIC INTRO   : ${lan.landing}`);
  console.log(` 👑 ADMIN 1 (MASTER): ${lan.admin1}`);
  console.log(` 🎮 ADMIN 2 (LIVE)  : ${lan.admin2}`);
  console.log(` 📽️  PROJECTOR SCREEN: ${lan.projector}`);
  console.log(` 📱 USER / TEAM URL : ${lan.user}`);
  console.log(` 🔴 LIVE SCOREBOARD : ${lan.live}`);
  console.log('='.repeat(68));
  console.log(' Ready for real-time participant synchronization (up to 60+ devices)\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down GLITCH HUNT server gracefully...');
  server.close(() => {
    console.log('Server terminated cleanly.');
    process.exit(0);
  });
});

module.exports = server;
