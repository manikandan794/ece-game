const { initDatabase, getDb } = require('../backend/src/config/database');

initDatabase();
const db = getDb();

db.prepare('DELETE FROM answers').run();
db.prepare('DELETE FROM teams').run();
db.prepare('DELETE FROM violations').run();
db.prepare('DELETE FROM audit_logs').run();
db.prepare("UPDATE event_state SET state = 'IDLE', current_stage_id = 1, current_question_id = NULL, timer_started_at = NULL, timer_ends_at = NULL, timer_paused_remaining_ms = NULL, is_testing_mode = 0 WHERE id = 1").run();

console.log('Database cleaned to pristine state:');
console.log('- Admins:', db.prepare('SELECT COUNT(*) as c FROM admins').get().c);
console.log('- Rounds:', db.prepare('SELECT COUNT(*) as c FROM rounds').get().c);
console.log('- Questions:', db.prepare('SELECT COUNT(*) as c FROM questions').get().c);
console.log('- Teams:', db.prepare('SELECT COUNT(*) as c FROM teams').get().c);
console.log('- Event State:', db.prepare('SELECT state FROM event_state WHERE id = 1').get().state);
