# GLITCH HUNT — Local LAN & Hotspot Deployment Guide
**Department of ECE • RRASE College of Engineering**

This event system is engineered specifically for **offline local LAN deployment** during technical symposiums. It does not require an active internet connection, external cloud servers, or domain names.

---

## 1. Physical / Wi-Fi Network Setup

### Recommended Setup:
1. **Wi-Fi Router or High-Performance Mobile Hotspot**:
   - Set up a dedicated Wi-Fi network (e.g., SSID: `GLITCH_HUNT_EVENT`).
   - Connect the **Server Laptop** (running the application).
   - Connect the **Admin 2 Controller / Projector Laptop**.
   - Have all 50–60 participant team mobile devices connect to this same Wi-Fi network.

> [!TIP]
> A standard 5GHz Wi-Fi router easily handles 60+ lightweight WebSocket connections simultaneously.

---

## 2. Windows Firewall Configuration

If participant phones cannot load the page, ensure Windows Firewall permits inbound connections on port **5000**:

Run PowerShell as Administrator:
```powershell
New-NetFirewallRule -DisplayName "GLITCH HUNT Server (Port 5000)" -Direction Inbound -LocalPort 5000 -Protocol TCP -Action Allow
```

---

## 3. Starting the Server

In the root directory of `glitch-hunt`, double click:
```
start.bat
```
or run in PowerShell:
```powershell
cd backend
npm start
```

Upon boot, the server detects your local Wi-Fi IP and displays:
```
====================================================================
       ⚡ GLITCH HUNT - RRASE ECE TECHNICAL SYMPOSIUM ⚡
====================================================================
 SERVER STATUS  : ONLINE
 HOST           : 0.0.0.0
 PORT           : 5000
 LOCAL IP (LAN) : 192.168.1.45
--------------------------------------------------------------------
 🌐 PUBLIC INTRO   : http://192.168.1.45:5000/
 👑 ADMIN 1 (MASTER): http://192.168.1.45:5000/admin
 🎮 ADMIN 2 (LIVE)  : http://192.168.1.45:5000/controller
 📽️  PROJECTOR SCREEN: http://192.168.1.45:5000/projector
 📱 USER / TEAM URL : http://192.168.1.45:5000/user
====================================================================
```

---

## 4. Operator Workflow on Symposium Day

### 1. Admin 1 (Master Admin)
- Open `http://<SERVER-IP>:5000/admin`
- Login with `admin1` / `admin123`
- Register participating teams on the spot. Each team receives an auto-generated unique username and password.
- Print or display team credentials.
- Verify question bank and timers.

### 2. Admin 2 (Live Controller)
- Open `http://<SERVER-IP>:5000/controller`
- Login with `admin2` / `controller123`
- Connect projector display to laptop HDMI or open `http://<SERVER-IP>:5000/projector` on the projector machine.
- Select Stage (e.g. Round 1) -> Description -> Rules -> Ready -> Start Question.

### 3. Participants (Mobile Phones)
- Open `http://<SERVER-IP>:5000/user` in Chrome or Safari.
- Login with team username & password.
- Screen will display "WAITING FOR HOST...".
- When Admin 2 starts a question:
  - **Question appears on Projector.**
  - **Only Option A, B, C, D appear on Mobile.**
  - Team taps an option and hits **SUBMIT**.
