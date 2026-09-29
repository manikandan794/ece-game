const { getDb } = require('../config/database');
const { logAudit } = require('../utils/logger');

function getQuestionsByRound(req, res) {
  const roundId = req.params.roundId;
  const db = getDb();

  const questions = db.prepare(`
    SELECT q.*,
      (SELECT COUNT(*) FROM answers a WHERE a.question_id = q.id) as answer_count
    FROM questions q 
    WHERE q.round_id = ? 
    ORDER BY q.order_index ASC
  `).all(roundId);

  return res.json({ success: true, count: questions.length, questions });
}

function getAllQuestions(req, res) {
  const db = getDb();
  const questions = db.prepare(`
    SELECT q.*, r.title as round_title, r.stage_number,
      (SELECT COUNT(*) FROM answers a WHERE a.question_id = q.id) as answer_count
    FROM questions q
    JOIN rounds r ON q.round_id = r.id
    ORDER BY r.stage_number ASC, q.order_index ASC
  `).all();

  return res.json({ success: true, count: questions.length, questions });
}

function getQuestionById(req, res) {
  const db = getDb();
  const question = db.prepare(`
    SELECT q.*,
      (SELECT COUNT(*) FROM answers a WHERE a.question_id = q.id) as answer_count
    FROM questions q
    WHERE q.id = ?
  `).get(req.params.id);

  if (!question) {
    return res.status(404).json({ success: false, message: 'Question not found' });
  }

  return res.json({ success: true, question });
}

function createQuestion(req, res) {
  const {
    round_id,
    question_text,
    option_a,
    option_b,
    option_c,
    option_d,
    correct_option,
    time_limit_sec = 30,
    explanation = '',
    is_active = 1,
    is_test_question = 0
  } = req.body;

  if (!round_id || !question_text || !option_a || !option_b || !option_c || !option_d || !correct_option) {
    return res.status(400).json({ success: false, message: 'All question fields (round, text, options A-D, correct option) are required.' });
  }

  const validOptions = ['A', 'B', 'C', 'D'];
  if (!validOptions.includes(correct_option.toUpperCase())) {
    return res.status(400).json({ success: false, message: 'Correct option must be A, B, C, or D.' });
  }

  const db = getDb();
  const round = db.prepare('SELECT id FROM rounds WHERE id = ?').get(round_id);
  if (!round) {
    return res.status(400).json({ success: false, message: 'Specified round does not exist.' });
  }

  // Calculate next question number and order index
  const lastQ = db.prepare('SELECT MAX(order_index) as maxOrder, MAX(question_number) as maxNum FROM questions WHERE round_id = ?').get(round_id);
  const nextOrder = (lastQ.maxOrder || 0) + 1;
  const nextNum = (lastQ.maxNum || 0) + 1;

  try {
    const insert = db.prepare(`
      INSERT INTO questions (
        round_id, question_number, question_text, option_a, option_b, option_c, option_d,
        correct_option, time_limit_sec, explanation, is_active, is_test_question, order_index
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insert.run(
      round_id,
      nextNum,
      question_text,
      option_a,
      option_b,
      option_c,
      option_d,
      correct_option.toUpperCase(),
      Number(time_limit_sec) || 30,
      explanation,
      is_active ? 1 : 0,
      is_test_question ? 1 : 0,
      nextOrder
    );

    logAudit('QUESTION_CREATED', 'ADMIN_1', req.user.id, {
      question_id: result.lastInsertRowid,
      round_id,
      question_number: nextNum
    });

    return res.status(201).json({
      success: true,
      message: 'Question added successfully',
      questionId: result.lastInsertRowid
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

function updateQuestion(req, res) {
  const qId = req.params.id;
  const {
    round_id,
    question_number,
    question_text,
    option_a,
    option_b,
    option_c,
    option_d,
    correct_option,
    time_limit_sec,
    explanation,
    is_active
  } = req.body;

  const db = getDb();
  const existing = db.prepare('SELECT * FROM questions WHERE id = ?').get(qId);
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Question not found' });
  }

  // DATA SAFETY 1: Check if question has existing answers or scoring records
  const answerCount = db.prepare('SELECT COUNT(*) as count FROM answers WHERE question_id = ?').get(qId).count;
  if (answerCount > 0) {
    return res.status(400).json({
      success: false,
      hasEventHistory: true,
      message: 'Cannot edit question: This question has existing answers or scoring records and cannot be modified to preserve event history.'
    });
  }

  // DATA SAFETY 2: Check if question is currently live in an active event
  const eventState = db.prepare('SELECT * FROM event_state WHERE id = 1').get();
  if (eventState && eventState.current_question_id === Number(qId)) {
    return res.status(400).json({
      success: false,
      isLiveQuestion: true,
      message: 'Cannot edit question: This question is currently live in an active event.'
    });
  }

  // Field validation and fallbacks
  const newRoundId = round_id !== undefined && round_id !== null ? Number(round_id) : existing.round_id;
  const newQuestionNumber = question_number !== undefined && question_number !== null && question_number !== '' 
    ? Number(question_number) 
    : existing.question_number;
  const newQuestionText = question_text !== undefined ? String(question_text).trim() : existing.question_text;
  const newOptionA = option_a !== undefined ? String(option_a).trim() : existing.option_a;
  const newOptionB = option_b !== undefined ? String(option_b).trim() : existing.option_b;
  const newOptionC = option_c !== undefined ? String(option_c).trim() : existing.option_c;
  const newOptionD = option_d !== undefined ? String(option_d).trim() : existing.option_d;
  const newCorrectOption = correct_option !== undefined ? String(correct_option).toUpperCase().trim() : existing.correct_option;
  const newTimeLimit = time_limit_sec !== undefined ? Number(time_limit_sec) : existing.time_limit_sec;
  const newExplanation = explanation !== undefined ? explanation : existing.explanation;
  const newIsActive = is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active;

  if (!newQuestionText || !newOptionA || !newOptionB || !newOptionC || !newOptionD) {
    return res.status(400).json({ success: false, message: 'Question text and all four options (A, B, C, D) are required.' });
  }

  if (!['A', 'B', 'C', 'D'].includes(newCorrectOption)) {
    return res.status(400).json({ success: false, message: 'Invalid correct_option. Must be A, B, C, or D.' });
  }

  const roundExists = db.prepare('SELECT id FROM rounds WHERE id = ?').get(newRoundId);
  if (!roundExists) {
    return res.status(400).json({ success: false, message: 'Invalid round_id. Selected round does not exist.' });
  }

  if (isNaN(newTimeLimit) || newTimeLimit <= 0) {
    return res.status(400).json({ success: false, message: 'Time limit must be a positive number.' });
  }

  try {
    db.prepare(`
      UPDATE questions SET
        round_id = ?,
        question_number = ?,
        question_text = ?,
        option_a = ?,
        option_b = ?,
        option_c = ?,
        option_d = ?,
        correct_option = ?,
        time_limit_sec = ?,
        explanation = ?,
        is_active = ?
      WHERE id = ?
    `).run(
      newRoundId,
      newQuestionNumber,
      newQuestionText,
      newOptionA,
      newOptionB,
      newOptionC,
      newOptionD,
      newCorrectOption,
      newTimeLimit,
      newExplanation,
      newIsActive,
      qId
    );

    logAudit('QUESTION_UPDATED', 'ADMIN_1', req.user.id, {
      questionId: qId,
      round_id: newRoundId,
      question_number: newQuestionNumber
    });

    const updated = db.prepare(`
      SELECT q.*,
        (SELECT COUNT(*) FROM answers a WHERE a.question_id = q.id) as answer_count
      FROM questions q
      WHERE q.id = ?
    `).get(qId);

    return res.json({
      success: true,
      message: 'Question updated successfully',
      question: updated
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

function deleteQuestion(req, res) {
  const qId = req.params.id;
  const db = getDb();

  const existing = db.prepare('SELECT * FROM questions WHERE id = ?').get(qId);
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Question not found' });
  }

  // Check for dependent records (answers, scores, history)
  const answerCount = db.prepare('SELECT COUNT(*) as count FROM answers WHERE question_id = ?').get(qId).count;

  // CASE 2: If the question has existing answers, scores, or dependent event records
  if (answerCount > 0) {
    // DO NOT physically delete the question. Safely disable/archive it.
    try {
      db.prepare('UPDATE questions SET is_active = 0 WHERE id = ?').run(qId);
      const actorId = req.user ? req.user.id : '1';
      logAudit('QUESTION_DISABLED', 'ADMIN_1', actorId, {
        questionId: qId,
        roundId: existing.round_id,
        answerCount,
        reason: 'has_event_history'
      });

      return res.json({
        success: true,
        disabled: true,
        hasEventHistory: true,
        title: 'QUESTION HAS EVENT HISTORY',
        message: 'This question has existing answers or scoring records and cannot be physically deleted. It has been disabled instead to preserve event history.',
        questionId: qId
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: 'Failed to disable question: ' + err.message
      });
    }
  }

  // CASE 1: Question has NO dependent records
  try {
    // If event_state references this question, clear pointer first
    db.prepare('UPDATE event_state SET current_question_id = NULL WHERE current_question_id = ?').run(qId);

    db.prepare('DELETE FROM questions WHERE id = ?').run(qId);
    const actorId = req.user ? req.user.id : '1';
    logAudit('QUESTION_DELETED', 'ADMIN_1', actorId, {
      questionId: qId,
      roundId: existing.round_id
    });

    return res.json({
      success: true,
      deleted: true,
      message: 'Question deleted successfully'
    });
  } catch (err) {
    // Catch foreign key constraint failure safely - never allow it to reach user as unhandled error
    if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || (err.message && err.message.includes('FOREIGN KEY'))) {
      try {
        db.prepare('UPDATE questions SET is_active = 0 WHERE id = ?').run(qId);
        const actorId = req.user ? req.user.id : '1';
        logAudit('QUESTION_DISABLED', 'ADMIN_1', actorId, {
          questionId: qId,
          roundId: existing.round_id,
          reason: 'foreign_key_constraint'
        });

        return res.json({
          success: true,
          disabled: true,
          hasEventHistory: true,
          title: 'QUESTION HAS EVENT HISTORY',
          message: 'This question has existing answers or scoring records and cannot be physically deleted. It has been disabled instead to preserve event history.',
          questionId: qId
        });
      } catch (disableErr) {
        return res.status(500).json({
          success: false,
          message: 'Failed to disable question: ' + disableErr.message
        });
      }
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to delete question: ' + err.message
    });
  }
}

function toggleQuestionStatus(req, res) {
  const qId = req.params.id;
  const db = getDb();

  const existing = db.prepare('SELECT * FROM questions WHERE id = ?').get(qId);
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Question not found' });
  }

  let nextActive;
  if (req.body && req.body.is_active !== undefined) {
    nextActive = req.body.is_active ? 1 : 0;
  } else {
    nextActive = existing.is_active === 1 ? 0 : 1;
  }

  try {
    db.prepare('UPDATE questions SET is_active = ? WHERE id = ?').run(nextActive, qId);

    const actorId = req.user ? req.user.id : '1';
    logAudit('QUESTION_STATUS_TOGGLED', 'ADMIN_1', actorId, {
      questionId: qId,
      roundId: existing.round_id,
      is_active: nextActive
    });

    return res.json({
      success: true,
      is_active: nextActive,
      message: `Question #${existing.question_number} is now ${nextActive ? 'active' : 'disabled'}`
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Failed to toggle question status: ' + err.message
    });
  }
}

function reorderQuestions(req, res) {
  const { orders } = req.body; // Array of { id, order_index, question_number }
  if (!Array.isArray(orders)) {
    return res.status(400).json({ success: false, message: 'Orders array required' });
  }

  const db = getDb();
  const updateStmt = db.prepare('UPDATE questions SET order_index = ?, question_number = ? WHERE id = ?');

  const transaction = db.transaction((list) => {
    for (const item of list) {
      updateStmt.run(item.order_index, item.question_number || item.order_index, item.id);
    }
  });

  try {
    transaction(orders);
    logAudit('QUESTIONS_REORDERED', 'ADMIN_1', req.user.id, { count: orders.length });
    return res.json({ success: true, message: 'Questions reordered successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

function createQuestionVersion(req, res) {
  const parentId = req.params.id;
  const db = getDb();

  const parent = db.prepare('SELECT * FROM questions WHERE id = ?').get(parentId);
  if (!parent) {
    return res.status(404).json({ success: false, message: 'Parent question not found' });
  }

  // Active question check
  const eventState = db.prepare('SELECT * FROM event_state WHERE id = 1').get();
  if (eventState && eventState.current_question_id === Number(parentId)) {
    return res.status(400).json({
      success: false,
      isLiveQuestion: true,
      message: 'QUESTION CURRENTLY ACTIVE: Cannot create new version while question is running in an active round.'
    });
  }

  const {
    round_id,
    question_number,
    question_text,
    option_a,
    option_b,
    option_c,
    option_d,
    correct_option,
    correct_answer,
    time_limit_sec,
    explanation,
    is_active
  } = req.body;

  const newRoundId = round_id !== undefined && round_id !== null ? Number(round_id) : parent.round_id;
  const newQuestionNumber = question_number !== undefined && question_number !== null && question_number !== ''
    ? Number(question_number)
    : parent.question_number;
  const newQuestionText = question_text !== undefined ? String(question_text).trim() : parent.question_text;
  const newOptionA = option_a !== undefined ? String(option_a).trim() : parent.option_a;
  const newOptionB = option_b !== undefined ? String(option_b).trim() : parent.option_b;
  const newOptionC = option_c !== undefined ? String(option_c).trim() : parent.option_c;
  const newOptionD = option_d !== undefined ? String(option_d).trim() : parent.option_d;
  const rawCorrect = correct_option !== undefined ? correct_option : correct_answer;
  const newCorrectOption = rawCorrect !== undefined ? String(rawCorrect).toUpperCase().trim() : parent.correct_option;
  const newTimeLimit = time_limit_sec !== undefined ? Number(time_limit_sec) : parent.time_limit_sec;
  const newExplanation = explanation !== undefined ? explanation : parent.explanation;
  const newIsActive = is_active !== undefined ? (is_active ? 1 : 0) : 1;
  const nextVersion = (parent.version || 1) + 1;

  if (!newQuestionText || !newOptionA || !newOptionB || !newOptionC || !newOptionD) {
    return res.status(400).json({ success: false, message: 'Question text and all four options (A, B, C, D) are required.' });
  }

  if (!['A', 'B', 'C', 'D'].includes(newCorrectOption)) {
    return res.status(400).json({ success: false, message: 'Invalid correct_option. Must be A, B, C, or D.' });
  }

  try {
    const now = new Date().toISOString();

    // 1. Insert new version
    const insertStmt = db.prepare(`
      INSERT INTO questions (
        round_id, question_number, question_text, option_a, option_b, option_c, option_d,
        correct_option, time_limit_sec, explanation, is_active, is_test_question, order_index,
        version, parent_question_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insertStmt.run(
      newRoundId,
      newQuestionNumber,
      newQuestionText,
      newOptionA,
      newOptionB,
      newOptionC,
      newOptionD,
      newCorrectOption,
      newTimeLimit,
      newExplanation,
      newIsActive,
      parent.is_test_question || 0,
      parent.order_index || newQuestionNumber,
      nextVersion,
      parent.id,
      now,
      now
    );

    const newQuestionId = result.lastInsertRowid;

    // 2. Mark parent question as archived/inactive so future events select the new version
    db.prepare('UPDATE questions SET is_active = 0, updated_at = ? WHERE id = ?').run(now, parent.id);

    logAudit('QUESTION_VERSION_CREATED', 'ADMIN_1', req.user ? req.user.id : '1', {
      parentQuestionId: parent.id,
      newQuestionId,
      version: nextVersion
    });

    const created = db.prepare(`
      SELECT q.*,
        (SELECT COUNT(*) FROM answers a WHERE a.question_id = q.id) as answer_count
      FROM questions q
      WHERE q.id = ?
    `).get(newQuestionId);

    return res.status(201).json({
      success: true,
      message: 'NEW QUESTION VERSION CREATED',
      question: created,
      version: nextVersion,
      parentQuestionId: parent.id
    });
  } catch (err) {
    console.error('[CREATE QUESTION VERSION ERROR]', err);
    return res.status(500).json({ success: false, message: 'Failed to create question version: ' + err.message });
  }
}

module.exports = {
  getQuestionsByRound,
  getAllQuestions,
  getQuestionById,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  toggleQuestionStatus,
  reorderQuestions,
  createQuestionVersion
};
