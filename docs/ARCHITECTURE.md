# GLITCH HUNT — Technical Architecture Document
**Department of ECE • RRASE College of Engineering**

---

## 1. System Topology

```
                   +-----------------------------------------------+
                   |           CENTRAL EVENT SERVER                |
                   |   - Node.js + Express HTTP Engine             |
                   |   - Socket.IO Real-Time Synchronization       |
                   |   - SQLite Database (WAL Mode)                |
                   |   - Server-Authoritative Timer & Clock        |
                   +-----------------------------------------------+
                                 /         |         \
                                /          |          \
      Full Question Payload    /           |           \  Sanitized Payload
      (Question + 4 Options)  /            |            \ (Options ONLY - NO Question Text)
                             v             v             v
             +--------------------+ +-------------+ +--------------------+
             |   PROJECTOR HUD    | |   ADMIN 1   | | PARTICIPANT PHONES |
             |   - 16:9 Screen    | |   MASTER    | | - 50-60 Devices    |
             |   - 3D Circuit     | | - Full CRUD | | - Fast DOM         |
             |   - Giant Timer    | | - Anti-Cheat| | - Large Buttons    |
             |   - Web Audio Ticks| | - CSV Export| | - Focus Tracker    |
             +--------------------+ +-------------+ +--------------------+
```

---

## 2. Server-Authoritative State Machine

The event lifecycle is strictly governed by 13 discrete states:

```
[ IDLE ]
   |
[ WAITING ] <---------> [ DESCRIPTION ]
   |                           |
   +------------------> [ RULES ]
                           |
                        [ READY ]
                           |
                     [ QUESTION_ACTIVE ] <-----> [ PAUSED ]
                           |
                        [ TIME_UP ]
                           |
                     [ QUESTION_COMPLETED ]
                           |
                     [ ROUND_COMPLETED ]
                           |
                     [ RESULT ] <-------------> [ TIE_BREAK ]
                           |
                     [ EVENT_COMPLETED ]
```

### State Transition Validation:
- Any unauthorized state jump (e.g. `QUESTION_ACTIVE` directly to `EVENT_COMPLETED`) is rejected by the transition validator.
- The state is persisted in SQLite (`event_state` table), ensuring automatic recovery if the server or a browser refreshes.

---

## 3. Real-Time Synchronization & Question Redaction

### Why User Mobile Does Not Receive Question Text:
To maintain strict symposium integrity and prevent participants from screenshotting, OCR-processing, or searching questions, **question text is never transmitted to participant sockets**:

```javascript
// Server socketManager.js payload to room:teams
socket.emit('state:sync', {
  state: 'QUESTION_ACTIVE',
  question: {
    questionId: q.id,
    roundId: q.round_id,
    questionNumber: q.question_number,
    options: { A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d },
    timeLimitSec: q.time_limit_sec
  }
  // NOTICE: q.question_text is strictly excluded!
});
```

The question text is transmitted **only** to `room:projector` and `room:admin`.

---

## 4. Server-Authoritative Clock & Timer Engine

Client clocks often diverge or drift. In GLITCH HUNT:
1. When Admin starts a question, the server records:
   - `timerStartedAt = Date.now()`
   - `timerEndsAt = Date.now() + durationSec * 1000`
2. Every second, the server broadcasts a `timer:tick` heartbeat with `endsAt` and `serverTime`.
3. Clients calculate remaining time using their offset from `serverTime`:
   $$\text{Remaining} = \max\left(0, \left\lceil\frac{\text{endsAt} - (\text{Date.now()} + \text{offset})}{1000}\right\rceil\right)$$
4. Any answer received after `serverTime > endsAt + 800ms` is rejected with `Time up!`.

---

## 5. Anti-Cheat Monitoring Architecture

The system implements browser-level session telemetry:
1. **Page Visibility API (`document.visibilityState`)**: Detects when a participant minimizes the browser or switches to another tab.
2. **Focus Telemetry (`window.onblur`)**: Detects when focus leaves the browser arena.
3. **Session Enforcement**: Each team account enforces a single active device. A secondary device login is flagged and can supersede or be blocked according to configured event policy.
4. **Violation Log**: All events are committed to the `violations` table in SQLite and streamed to Admin 1 in real time.
