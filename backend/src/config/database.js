const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { setLoggerDb } = require('../utils/logger');

let db = null;

function initDatabase(customDbPath = null) {
  const dbDir = path.resolve(__dirname, '../../database');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = customDbPath || path.resolve(dbDir, 'glitch_hunt.sqlite');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  setLoggerDb(db);

  createTables();
  seedInitialData();

  return db;
}

function getDb() {
  if (!db) {
    return initDatabase();
  }
  return db;
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin_1', 'admin_2')),
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_name TEXT UNIQUE NOT NULL,
      college_name TEXT NOT NULL,
      member_count INTEGER NOT NULL DEFAULT 2,
      members TEXT,
      captain_name TEXT NOT NULL,
      contact_number TEXT,
      email TEXT,
      department TEXT,
      year TEXT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      password_plain_hint TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'disqualified')),
      is_test_team INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS team_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      session_token TEXT UNIQUE NOT NULL,
      socket_id TEXT,
      ip_address TEXT,
      device_info TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_heartbeat TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stage_number INTEGER UNIQUE NOT NULL,
      stage_type TEXT NOT NULL,
      title TEXT NOT NULL,
      subtitle TEXT,
      description TEXT,
      rules TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed')),
      is_tie_break INTEGER NOT NULL DEFAULT 0,
      scoring_correct REAL NOT NULL DEFAULT 1.0,
      scoring_wrong REAL NOT NULL DEFAULT 0.0,
      scoring_unanswered REAL NOT NULL DEFAULT 0.0,
      order_index INTEGER NOT NULL,
      is_enabled INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      question_number INTEGER NOT NULL,
      question_text TEXT NOT NULL,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      option_c TEXT NOT NULL,
      option_d TEXT NOT NULL,
      correct_option TEXT NOT NULL CHECK (correct_option IN ('A', 'B', 'C', 'D')),
      time_limit_sec INTEGER NOT NULL DEFAULT 30,
      explanation TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_test_question INTEGER NOT NULL DEFAULT 0,
      order_index INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      selected_option TEXT NOT NULL CHECK (selected_option IN ('A', 'B', 'C', 'D')),
      submitted_at TEXT NOT NULL,
      server_received_at TEXT NOT NULL,
      time_taken_ms INTEGER NOT NULL DEFAULT 0,
      is_correct INTEGER NOT NULL,
      points_awarded REAL NOT NULL DEFAULT 0.0,
      is_test_answer INTEGER NOT NULL DEFAULT 0,
      UNIQUE(team_id, round_id, question_id, is_test_answer)
    );

    CREATE TABLE IF NOT EXISTS violations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      violation_type TEXT NOT NULL,
      details TEXT,
      round_id INTEGER,
      question_id INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS event_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      current_stage_id INTEGER REFERENCES rounds(id),
      current_question_id INTEGER REFERENCES questions(id),
      state TEXT NOT NULL DEFAULT 'IDLE',
      timer_started_at INTEGER,
      timer_ends_at INTEGER,
      timer_paused_remaining_ms INTEGER,
      is_testing_mode INTEGER NOT NULL DEFAULT 0,
      sound_muted INTEGER NOT NULL DEFAULT 0,
      sound_volume REAL NOT NULL DEFAULT 0.8,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS event_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_run_id TEXT UNIQUE NOT NULL,
      event_date TEXT NOT NULL,
      event_name TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      status TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('NOT_STARTED', 'RUNNING', 'COMPLETED')),
      rounds_conducted TEXT DEFAULT '[]',
      final_winner TEXT,
      final_score REAL DEFAULT 0.0,
      final_rankings TEXT DEFAULT '[]',
      total_teams INTEGER DEFAULT 0,
      is_test_run INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_teams_username ON teams(username);
    CREATE INDEX IF NOT EXISTS idx_questions_round ON questions(round_id, order_index);
    CREATE INDEX IF NOT EXISTS idx_answers_team_round ON answers(team_id, round_id);
    CREATE INDEX IF NOT EXISTS idx_violations_team ON violations(team_id);
    CREATE INDEX IF NOT EXISTS idx_event_runs_id ON event_runs(event_run_id);
    CREATE INDEX IF NOT EXISTS idx_event_runs_date ON event_runs(event_date);
  `);

  // Safe non-destructive migrations
  const roundCols = db.pragma('table_info(rounds)');
  if (!roundCols.some(c => c.name === 'is_enabled')) {
    db.exec('ALTER TABLE rounds ADD COLUMN is_enabled INTEGER NOT NULL DEFAULT 1');
  }

  const questionCols = db.pragma('table_info(questions)');
  if (!questionCols.some(c => c.name === 'version')) {
    db.exec('ALTER TABLE questions ADD COLUMN version INTEGER NOT NULL DEFAULT 1');
  }
  if (!questionCols.some(c => c.name === 'parent_question_id')) {
    db.exec('ALTER TABLE questions ADD COLUMN parent_question_id INTEGER REFERENCES questions(id)');
  }
  if (!questionCols.some(c => c.name === 'created_at')) {
    db.exec('ALTER TABLE questions ADD COLUMN created_at TEXT');
  }
  if (!questionCols.some(c => c.name === 'updated_at')) {
    db.exec('ALTER TABLE questions ADD COLUMN updated_at TEXT');
  }

  const answerCols = db.pragma('table_info(answers)');
  if (!answerCols.some(c => c.name === 'event_run_id')) {
    db.exec('ALTER TABLE answers ADD COLUMN event_run_id TEXT');
  }
  if (!answerCols.some(c => c.name === 'is_first_correct')) {
    db.exec('ALTER TABLE answers ADD COLUMN is_first_correct INTEGER NOT NULL DEFAULT 0');
  }

  const stateCols = db.pragma('table_info(event_state)');
  if (!stateCols.some(c => c.name === 'current_event_run_id')) {
    db.exec('ALTER TABLE event_state ADD COLUMN current_event_run_id TEXT');
  }
  if (!stateCols.some(c => c.name === 'first_correct_team_id')) {
    db.exec('ALTER TABLE event_state ADD COLUMN first_correct_team_id INTEGER REFERENCES teams(id)');
  }
  if (!stateCols.some(c => c.name === 'first_correct_team_name')) {
    db.exec('ALTER TABLE event_state ADD COLUMN first_correct_team_name TEXT');
  }
  if (!stateCols.some(c => c.name === 'question_locked_at')) {
    db.exec('ALTER TABLE event_state ADD COLUMN question_locked_at TEXT');
  }
}

function seedInitialData() {
  // Check if admins exist
  const adminCount = db.prepare('SELECT COUNT(*) as count FROM admins').get().count;
  if (adminCount === 0) {
    const salt = bcrypt.genSaltSync(10);
    const admin1Pass = process.env.ADMIN1_PASSWORD || 'admin123';
    const admin2Pass = process.env.ADMIN2_PASSWORD || 'controller123';

    const insertAdmin = db.prepare(`
      INSERT INTO admins (username, password_hash, role, display_name, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    insertAdmin.run('admin1', bcrypt.hashSync(admin1Pass, salt), 'admin_1', 'Master Administrator', new Date().toISOString());
    insertAdmin.run('admin2', bcrypt.hashSync(admin2Pass, salt), 'admin_2', 'Live Event Controller', new Date().toISOString());
  }

  // Check if rounds exist (8 selectable stages)
  const roundCount = db.prepare('SELECT COUNT(*) as count FROM rounds').get().count;
  if (roundCount === 0) {
    const insertRound = db.prepare(`
      INSERT INTO rounds (stage_number, stage_type, title, subtitle, description, rules, is_tie_break, scoring_correct, scoring_wrong, scoring_unanswered, order_index, is_enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    const defaultStages = [
      {
        stage_number: 1,
        stage_type: 'round_1',
        title: 'Round 1: Technical Circuitry',
        subtitle: 'Core Electronics & Fundamentals',
        description: 'Test your foundational knowledge in electronic devices, circuit theory, and communication concepts.',
        rules: JSON.stringify([
          'Read the question displayed on the main projector screen.',
          'Choose your answer using Option A, B, C, or D on your mobile device.',
          'Each question has its own countdown timer.',
          'Submissions are locked once sent. Only one attempt per question.',
          'Points: +1 for correct answer, 0 for incorrect answer.'
        ]),
        is_tie_break: 0,
        scoring_correct: 1.0,
        scoring_wrong: 0.0,
        order_index: 1
      },
      {
        stage_number: 2,
        stage_type: 'round_2',
        title: 'Round 2: Systems & Communications',
        subtitle: 'Advanced Signal Processing & Microelectronics',
        description: 'Challenge your team in communications, digital systems, antennas, and advanced hardware design.',
        rules: JSON.stringify([
          'Rapid-fire technical questions displayed on projector.',
          'Questions range between 20 to 45 seconds.',
          'Strict real-time server synchronization.',
          'Anti-cheat detection active.'
        ]),
        is_tie_break: 0,
        scoring_correct: 2.0,
        scoring_wrong: 0.0,
        order_index: 2
      },
      {
        stage_number: 3,
        stage_type: 'tie_break_1',
        title: 'Tie Break 1: Sudden Death',
        subtitle: 'Tie-Breaking Stage 1',
        description: 'High-speed tie breaker for qualifying tied teams.',
        rules: JSON.stringify(['Only tied teams participate.', 'First correct answer or highest score advances.']),
        is_tie_break: 1,
        scoring_correct: 1.0,
        scoring_wrong: -0.5,
        order_index: 3
      },
      {
        stage_number: 4,
        stage_type: 'tie_break_2',
        title: 'Tie Break 2: Critical Path',
        subtitle: 'Tie-Breaking Stage 2',
        description: 'Secondary tie-break round for remaining deadlocks.',
        rules: JSON.stringify(['Precision timing is enforced.']),
        is_tie_break: 1,
        scoring_correct: 1.0,
        scoring_wrong: 0.0,
        order_index: 4
      },
      {
        stage_number: 5,
        stage_type: 'tie_break_3',
        title: 'Tie Break 3: Silicon Duel',
        subtitle: 'Tie-Breaking Stage 3',
        description: 'Direct hardware showdown stage.',
        rules: JSON.stringify(['Speed and accuracy score.']),
        is_tie_break: 1,
        scoring_correct: 1.0,
        scoring_wrong: 0.0,
        order_index: 5
      },
      {
        stage_number: 6,
        stage_type: 'tie_break_4',
        title: 'Tie Break 4: Waveform Clash',
        subtitle: 'Tie-Breaking Stage 4',
        description: 'Signal & Wave analysis tie-breaker.',
        rules: JSON.stringify(['Tied teams only.']),
        is_tie_break: 1,
        scoring_correct: 1.0,
        scoring_wrong: 0.0,
        order_index: 6
      },
      {
        stage_number: 7,
        stage_type: 'tie_break_5',
        title: 'Tie Break 5: Quantum Gate',
        subtitle: 'Tie-Breaking Stage 5',
        description: 'Advanced tie-break stage.',
        rules: JSON.stringify(['Tied teams only.']),
        is_tie_break: 1,
        scoring_correct: 1.0,
        scoring_wrong: 0.0,
        order_index: 7
      },
      {
        stage_number: 8,
        stage_type: 'tie_break_6',
        title: 'Tie Break 6: Ultimate Glitch',
        subtitle: 'Final Tie-Breaker',
        description: 'The ultimate tie-breaking round to determine final podium rankings.',
        rules: JSON.stringify(['Final sudden death.']),
        is_tie_break: 1,
        scoring_correct: 1.0,
        scoring_wrong: 0.0,
        order_index: 8
      }
    ];

    for (const stage of defaultStages) {
      insertRound.run(
        stage.stage_number,
        stage.stage_type,
        stage.title,
        stage.subtitle,
        stage.description,
        stage.rules,
        stage.is_tie_break,
        stage.scoring_correct,
        stage.scoring_wrong,
        0.0,
        stage.order_index
      );
    }
  }

  // Check if sample questions exist (5 ECE questions for Round 1 from prompt)
  const questionCount = db.prepare('SELECT COUNT(*) as count FROM questions').get().count;
  if (questionCount === 0) {
    const round1 = db.prepare("SELECT id FROM rounds WHERE stage_type = 'round_1'").get();
    if (round1) {
      const insertQ = db.prepare(`
        INSERT INTO questions (round_id, question_number, question_text, option_a, option_b, option_c, option_d, correct_option, time_limit_sec, explanation, is_active, is_test_question, order_index)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const sampleQuestions = [
        {
          num: 1,
          text: 'Which component is commonly used to store electrical charge?',
          a: 'Resistor',
          b: 'Capacitor',
          c: 'Diode',
          d: 'Inductor',
          correct: 'B',
          time: 30,
          explanation: 'A capacitor is a passive electronic component that stores electrostatic energy in an electric field.'
        },
        {
          num: 2,
          text: 'What is the basic unit of electrical resistance?',
          a: 'Volt',
          b: 'Ampere',
          c: 'Ohm',
          d: 'Watt',
          correct: 'C',
          time: 25,
          explanation: 'The ohm (symbol: Ω) is the SI derived unit of electrical resistance.'
        },
        {
          num: 3,
          text: 'Which component primarily allows current to flow in one direction?',
          a: 'Diode',
          b: 'Capacitor',
          c: 'Resistor',
          d: 'Transformer',
          correct: 'A',
          time: 25,
          explanation: 'A diode is a semiconductor device with two terminals that permits current flow primarily in one direction.'
        },
        {
          num: 4,
          text: 'Which device is commonly used to amplify or switch electronic signals?',
          a: 'Transistor',
          b: 'Fuse',
          c: 'Capacitor',
          d: 'Resistor',
          correct: 'A',
          time: 30,
          explanation: 'A transistor is a semiconductor device used to amplify or switch electrical signals and power.'
        },
        {
          num: 5,
          text: 'Which element stores energy in a magnetic field?',
          a: 'Capacitor',
          b: 'Inductor',
          c: 'Diode',
          d: 'Resistor',
          correct: 'B',
          time: 30,
          explanation: 'An inductor (or coil) stores electrical energy in a magnetic field when electric current flows through it.'
        }
      ];

      for (const q of sampleQuestions) {
        insertQ.run(round1.id, q.num, q.text, q.a, q.b, q.c, q.d, q.correct, q.time, q.explanation, 1, 0, q.num);
      }
    }
  }

  // Check event state singleton
  const stateRow = db.prepare('SELECT id FROM event_state WHERE id = 1').get();
  if (!stateRow) {
    const round1 = db.prepare("SELECT id FROM rounds WHERE stage_type = 'round_1'").get();
    db.prepare(`
      INSERT INTO event_state (id, current_stage_id, current_question_id, state, is_testing_mode, sound_muted, sound_volume, updated_at)
      VALUES (1, ?, NULL, 'IDLE', 0, 0, 0.8, ?)
    `).run(round1 ? round1.id : null, new Date().toISOString());
  }

  // Check settings
  const defaultSettings = [
    { key: 'event_name', value: 'GLITCH HUNT' },
    { key: 'department', value: 'Department of ECE' },
    { key: 'college', value: 'RRASE COLLEGE OF ENGINEERING' },
    { key: 'symposium_name', value: 'ECE Technical Symposium' },
    { key: 'venue', value: 'Seminar Hall / Auditorium' },
    { key: 'event_date', value: 'Symposium Day' },
    { key: 'event_time', value: '10:00 AM' },
    { key: 'coordinators', value: 'Staff & Student Coordinators (Configure in Admin 1)' },
    { key: 'contact_info', value: 'Configure in Admin 1' },
    { key: 'anti_cheat_policy', value: 'WARNING' }, // 'WARNING' or 'AUTO_DISQUALIFY'
    { key: 'max_violations_allowed', value: '3' },
    { key: 'block_duplicate_sessions', value: 'true' },
    { key: 'result_duration_stage_1', value: '10' },
    { key: 'result_duration_stage_2', value: '10' },
    { key: 'result_duration_stage_3', value: '10' },
    { key: 'result_duration_stage_4', value: '10' },
    { key: 'result_duration_stage_5', value: '10' },
    { key: 'result_duration_stage_6', value: '10' },
    { key: 'result_duration_stage_7', value: '10' },
    { key: 'result_duration_stage_8', value: '10' },
    { key: 'first_correct_lock', value: 'true' },
    { key: 'live_show_question_text', value: 'false' }
  ];

  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
  `);

  for (const s of defaultSettings) {
    insertSetting.run(s.key, s.value);
  }

  // Ensure an initial active event run exists
  const runCount = db.prepare('SELECT COUNT(*) as count FROM event_runs').get().count;
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const todayStr = `${day}-${month}-${year}`;

  if (runCount === 0) {
    const initialRunId = `GH-${year}-${month}-${day}-001`;
    db.prepare(`
      INSERT INTO event_runs (event_run_id, event_date, event_name, start_time, status, rounds_conducted, is_test_run, created_at, updated_at)
      VALUES (?, ?, 'GLITCH HUNT 2026', '10:00 AM', 'RUNNING', '[]', 0, ?, ?)
    `).run(initialRunId, todayStr, now.toISOString(), now.toISOString());

    db.prepare('UPDATE event_state SET current_event_run_id = ? WHERE id = 1').run(initialRunId);
    // Link existing answers that have null event_run_id to this initial run
    db.prepare('UPDATE answers SET event_run_id = ? WHERE event_run_id IS NULL').run(initialRunId);
  } else {
    // If event_state current_event_run_id is null, set to latest active run
    const state = db.prepare('SELECT current_event_run_id FROM event_state WHERE id = 1').get();
    if (!state || !state.current_event_run_id) {
      const latestRun = db.prepare('SELECT event_run_id FROM event_runs ORDER BY id DESC LIMIT 1').get();
      if (latestRun) {
        db.prepare('UPDATE event_state SET current_event_run_id = ? WHERE id = 1').run(latestRun.event_run_id);
      }
    }
  }
}

module.exports = {
  initDatabase,
  getDb
};
