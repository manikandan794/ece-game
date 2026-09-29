const { getLanUrls } = require('../backend/src/utils/networkUtils');

const port = process.env.PORT || 5000;
const urls = getLanUrls(port);

console.log('\n' + '='.repeat(64));
console.log('       ⚡ GLITCH HUNT - LOCAL LAN CONNECTION GUIDE ⚡');
console.log('='.repeat(64));
console.log(` SERVER LAN IP      : ${urls.ip}`);
console.log(` PORT               : ${urls.port}`);
console.log('-'.repeat(64));
console.log(` 🌐 PUBLIC INTRO    : ${urls.landing}`);
console.log(` 👑 ADMIN 1 (MASTER): ${urls.admin1}`);
console.log(` 🎮 ADMIN 2 (LIVE)  : ${urls.admin2}`);
console.log(` 📽️  PROJECTOR SCREEN: ${urls.projector}`);
console.log(` 📱 USER / TEAM URL : ${urls.user}`);
console.log('='.repeat(64));
console.log(' Ensure all devices (projector, laptops, phones) are on');
console.log(' the same Wi-Fi / Hotspot network.\n');
