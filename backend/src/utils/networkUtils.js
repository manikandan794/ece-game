const os = require('os');

/**
 * Automatically detects the server's local network (LAN) IPv4 address.
 * Prioritizes Wi-Fi / Ethernet adapters over virtual/loopback adapters.
 */
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Filter out IPv6 and internal loopback addresses (127.0.0.1)
      if (iface.family === 'IPv4' && !iface.internal) {
        // Exclude common virtual adapters (VMware, VirtualBox, WSL, etc.)
        const lowerName = name.toLowerCase();
        const isVirtual = lowerName.includes('virtual') ||
                          lowerName.includes('vmware') ||
                          lowerName.includes('vbox') ||
                          lowerName.includes('docker') ||
                          lowerName.includes('wsl');
        
        candidates.push({
          name,
          address: iface.address,
          isVirtual,
          isWifi: lowerName.includes('wi-fi') || lowerName.includes('wireless') || lowerName.includes('wlan'),
          isEthernet: lowerName.includes('ethernet') || lowerName.includes('eth')
        });
      }
    }
  }

  // Sort candidates: physical Wi-Fi/Ethernet first, non-virtual second, any IPv4 third
  candidates.sort((a, b) => {
    if (a.isWifi && !b.isWifi) return -1;
    if (!a.isWifi && b.isWifi) return 1;
    if (a.isEthernet && !b.isEthernet) return -1;
    if (!a.isEthernet && b.isEthernet) return 1;
    if (!a.isVirtual && b.isVirtual) return -1;
    if (a.isVirtual && !b.isVirtual) return 1;
    return 0;
  });

  return candidates.length > 0 ? candidates[0].address : 'localhost';
}

function getLanUrls(port = 5000) {
  const ip = getLocalIpAddress();
  return {
    ip,
    port,
    base: `http://${ip}:${port}`,
    admin1: `http://${ip}:${port}/admin`,
    admin2: `http://${ip}:${port}/controller`,
    projector: `http://${ip}:${port}/projector`,
    live: `http://${ip}:${port}/live`,
    user: `http://${ip}:${port}/user`,
    landing: `http://${ip}:${port}/`
  };
}

module.exports = {
  getLocalIpAddress,
  getLanUrls
};
