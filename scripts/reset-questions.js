const { initDatabase, getDb } = require('../backend/src/config/database');

initDatabase();
const db = getDb();

db.prepare('DELETE FROM questions').run();

const round1 = db.prepare("SELECT id FROM rounds WHERE stage_type = 'round_1'").get();

const insertQ = db.prepare(`
  INSERT INTO questions (round_id, question_number, question_text, option_a, option_b, option_c, option_d, correct_option, time_limit_sec, explanation, is_active, is_test_question, order_index)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?)
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
    explanation: 'A diode is a semiconductor device that permits current flow primarily in one direction.'
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
    explanation: 'An inductor stores electrical energy in a magnetic field when electric current flows through it.'
  }
];

for (const q of sampleQuestions) {
  insertQ.run(round1.id, q.num, q.text, q.a, q.b, q.c, q.d, q.correct, q.time, q.explanation, q.num);
}

console.log('Reset questions to the 5 official ECE sample questions:');
const qs = db.prepare('SELECT id, question_number, question_text, correct_option FROM questions').all();
console.log(qs);
