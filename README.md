# ⚡ GLITCH HUNT — RRASE ECE Technical Symposium Event System

A real-time, server-authoritative technical event and quiz system created for **GLITCH HUNT**, organized by the **Department of Electronics & Communication Engineering (ECE)** at **RRASE College of Engineering**.

---

## 🌟 Key Features

1. **Strict Question Protection on Mobile**:
   - **Participants' phones NEVER display the question text.**
   - Mobiles display **Options Only** (`[ OPTION A ]` through `[ OPTION D ]`), minimal status info, and lock confirmations.
   - Questions are projected on the main 16:9 auditorium projector screen.
2. **Server-Authoritative Real-Time Synchronization**:
   - Built on Socket.IO with sub-100ms broadcasting.
   - Server clock is the source of truth; zero reliance on local client device clocks.
   - Rigorously tested for **up to 60+ simultaneous team devices**.
3. **Cinematic 3D WebGL Experience**:
   - Features the **official RRASE College campus photo** with 3D depth, parallax, and electrical particle dust.
   - 3D Electronic Circuit Motherboard showcasing DIP microchips, capacitors, resistors, antennas, moving electrical signals, and glitch transitions.
4. **Three Distinct Role Interfaces**:
   - **Admin 1 (Master Admin)**: Full CRUD on teams, on-the-spot credential generation, unlimited questions, 8 customizable stages, scoring, tie-break management, live participant telemetry grid, and CSV export.
   - **Admin 2 (Live Controller)**: 8 selectable stages (`Description` ➔ `Rules` ➔ `Ready` ➔ `Start`), live playback (`Start`, `Pause`, `Resume`, `Next`, `Prev`, `Restart`, `End Round`), and audio mute/volume controls.
   - **User / Team**: Ultra-fast, lightweight mobile interface optimized for low latency and zero lag on any smartphone.
5. **Anti-Cheat Monitoring Engine**:
   - Actively monitors tab switches (`visibilityState`), focus loss (`blur`), reloads, and simultaneous multi-device logins.
   - Logs security incidents in real time to the Admin 1 control room.
6. **Procedural Web Audio Engine**:
   - High-tech radar ticks for countdown, electronic alarm for TIME UP, glitch bursts, and ambient cyber drone for the projector.
   - Zero external audio files required.
7. **Offline Local LAN / Hotspot Ready**:
   - Zero external internet or domain required.
   - Automatic server LAN IP detection prints direct URLs upon startup.

---

## 🚀 Quick Start (Windows)

### Option 1: One-Click Launch
Double-click `start.bat` in the project root.

### Option 2: Terminal Commands
```powershell
# 1. Navigate to backend
cd backend

# 2. Install dependencies (if not already installed)
npm install

# 3. Start server
npm start
```

---

## 🌐 URLs & Access Endpoints

Once the server is running on your LAN (e.g. at IP `192.168.1.50`):

| Portal | URL | Description |
|---|---|---|
| **Public Intro & Hub** | `http://<SERVER-IP>:5000/` | 3D Campus Discovery & 3D Circuit Glitch Intro |
| **User / Team Mobile** | `http://<SERVER-IP>:5000/user` | Lightweight option selection screen (No Question Text) |
| **Projector Screen** | `http://<SERVER-IP>:5000/projector` | 16:9 Fullscreen display for auditorium projector |
| **Admin 1 (Master)** | `http://<SERVER-IP>:5000/admin` | Master control room, teams, questions, settings, CSV export |
| **Admin 2 (Controller)**| `http://<SERVER-IP>:5000/controller`| 8-stage live controller and playback controls |

### Default Credentials:
- **Admin 1 (Master)**: `admin1` / `admin123`
- **Admin 2 (Controller)**: `admin2` / `controller123`
- **Teams**: Registered by Admin 1 on the spot (unique auto-generated credentials).

---

## 🧪 Automated Testing Suite

The project includes an automated test suite verifying REST APIs, RBAC authorization, scoring, duplicate answer rejection, and **60 concurrent client Socket.IO synchronization**:

To run the complete test suite:
```powershell
cd backend
npm test
```

### Test Coverage Summary:
- `api.test.js`: Admin 1, Admin 2, Team authentication, token security, and question CRUD.
- `scoring.test.js`: Positive/negative marks, unique answer constraint, and tie detection logic.
- `loadSync.test.js`: Spawns 60 simulated Socket.IO clients, verifies synchronized countdown, validates **question redaction on mobile devices**, concurrent answer submissions, pause/resume, and late-submission rejection.

---

## 🛠️ Technology Stack

- **Backend**: Node.js, Express, Socket.IO, Better-SQLite3, JSONWebToken, BcryptJS
- **Frontend**: React 18, Vite, Three.js, Tailwind CSS, Lucide Icons, Canvas-Confetti
- **Audio**: Web Audio API Synthesizer
- **Database**: SQLite with WAL (Write-Ahead Logging)
- **Deployment**: Local LAN / Wi-Fi Hotspot (Node.js)

---

## 📁 Project Structure

```
glitch-hunt/
├── backend/
│   ├── src/
│   │   ├── config/database.js         # SQLite schema, tables & sample ECE questions
│   │   ├── controllers/               # Auth, Teams, Questions, Rounds, Results, Settings
│   │   ├── middleware/                # JWT verification & RBAC access guards
│   │   ├── realtime/
│   │   │   ├── stateMachine.js        # 13-state server authoritative state machine
│   │   │   ├── socketManager.js       # Socket.IO broadcasting & question redaction
│   │   │   └── timerEngine.js         # Countdown ticker & deadline validator
│   │   ├── utils/networkUtils.js      # Automatic LAN IP detector
│   │   ├── app.js                     # Express app with SPA dist serving
│   │   └── server.js                  # Bootstrap & LAN URL banner
│   ├── tests/                         # Node test runner suite (22 tests)
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── public/assets/
│   │   └── rrase_college.webp         # Official RRASE College Campus photo
│   ├── src/
│   │   ├── components/
│   │   │   ├── 3d/                    # 3D Campus Parallax & 3D Circuit Motherboard
│   │   │   ├── admin1/                # Admin 1 Master Control Room
│   │   │   ├── admin2/                # Admin 2 Live Controller & Projector Screen
│   │   │   └── user/                  # Lightweight Team Mobile Screen (Options Only)
│   │   ├── context/                   # AuthContext & SocketContext
│   │   ├── services/                  # REST API client & Web Audio synthesizer
│   │   └── App.jsx
│   ├── package.json
│   └── vite.config.js
├── docs/
│   ├── LAN_SETUP_GUIDE.md             # Complete step-by-step router & firewall guide
│   └── ARCHITECTURE.md                # In-depth technical architecture
├── scripts/
│   ├── show-ip.js                     # Prints current LAN IP & active links
│   ├── start-windows.bat              # Batch launcher
│   └── start-windows.ps1              # PowerShell launcher
├── start.bat                          # One-click Windows launch script
└── README.md
```

---

## 🏆 Symposium Administration Tips

1. **Pre-Event Test Mode**: Admin 1 can enable **Testing Mode** from the dashboard. This allows dry-running rounds and generating 10 or 60 simulated teams without polluting official live symposium data.
2. **On-the-Spot Registration**: As teams arrive at the registration desk, click **Register New Team**. An instant username (e.g. `pioneers_842`) and memorable password (e.g. `ECE9K4`) are generated for the participant.
3. **Exporting Scores**: After Round 1, Round 2, or Tie-Breaks, navigate to **Results & Export** in Admin 1 and click **Export CSV Report** for immediate certificate or prize distribution.
