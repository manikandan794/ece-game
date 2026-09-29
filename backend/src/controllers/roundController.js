const { getDb } = require('../config/database');
const { logAudit } = require('../utils/logger');

function parseRules(rulesField) {
  if (!rulesField) return [];
  if (Array.isArray(rulesField)) {
    return rulesField.map(r => String(r).trim()).filter(Boolean);
  }
  if (typeof rulesField === 'string') {
    try {
      const parsed = JSON.parse(rulesField);
      if (Array.isArray(parsed)) {
        return parsed.map(r => String(r).trim()).filter(Boolean);
      }
    } catch (e) {
      // Not valid JSON, fallback to splitting by newline
    }
    return rulesField
      .split('\n')
      .map(r => r.trim())
      .filter(Boolean);
  }
  return [];
}

function formatRulesToString(rulesInput) {
  if (rulesInput === undefined || rulesInput === null) return null;
  const list = parseRules(rulesInput);
  return JSON.stringify(list);
}

function triggerRealtimeSync(stageId = null) {
  try {
    const { notifyStageUpdate } = require('../realtime/socketManager');
    if (typeof notifyStageUpdate === 'function') {
      notifyStageUpdate(stageId);
    }
  } catch (err) {
    // Socket manager may be uninitialized in isolated unit tests
  }
}

function getAllRounds(req, res) {
  const db = getDb();
  const rounds = db.prepare('SELECT * FROM rounds ORDER BY order_index ASC').all();

  const formatted = rounds.map(r => {
    const parsedRules = parseRules(r.rules);
    const qCount = db.prepare('SELECT COUNT(*) as count FROM questions WHERE round_id = ?').get(r.id).count;
    const aCount = db.prepare('SELECT COUNT(*) as count FROM answers WHERE round_id = ?').get(r.id).count;

    return {
      ...r,
      is_enabled: r.is_enabled !== undefined ? r.is_enabled : 1,
      rules: parsedRules,
      questionCount: qCount,
      answerCount: aCount
    };
  });

  return res.json({ success: true, count: formatted.length, rounds: formatted });
}

function getRoundById(req, res) {
  const db = getDb();
  const round = db.prepare('SELECT * FROM rounds WHERE id = ?').get(req.params.id);

  if (!round) {
    return res.status(404).json({ success: false, message: 'Round not found' });
  }

  const parsedRules = parseRules(round.rules);
  const questions = db.prepare('SELECT * FROM questions WHERE round_id = ? ORDER BY order_index ASC').all(round.id);
  const qCount = questions.length;
  const aCount = db.prepare('SELECT COUNT(*) as count FROM answers WHERE round_id = ?').get(round.id).count;

  return res.json({
    success: true,
    round: {
      ...round,
      is_enabled: round.is_enabled !== undefined ? round.is_enabled : 1,
      rules: parsedRules,
      questionCount: qCount,
      answerCount: aCount,
      questions
    }
  });
}

function createRound(req, res) {
  const {
    title,
    subtitle,
    description,
    rules,
    stage_number,
    stage_type,
    is_tie_break,
    scoring_correct,
    scoring_wrong,
    scoring_unanswered,
    order_index,
    is_enabled
  } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ success: false, message: 'Stage title is required' });
  }

  const db = getDb();

  try {
    let nextStageNum = stage_number;
    if (!nextStageNum) {
      const maxStage = db.prepare('SELECT MAX(stage_number) as maxNum FROM rounds').get();
      nextStageNum = (maxStage && maxStage.maxNum ? maxStage.maxNum : 0) + 1;
    }

    let nextOrder = order_index;
    if (!nextOrder) {
      const maxOrder = db.prepare('SELECT MAX(order_index) as maxOrder FROM rounds').get();
      nextOrder = (maxOrder && maxOrder.maxOrder ? maxOrder.maxOrder : 0) + 1;
    }

    const tieBreakVal = is_tie_break ? 1 : 0;
    const finalStageType = stage_type || (tieBreakVal ? `tie_break_${nextStageNum}` : `round_${nextStageNum}`);
    const rulesStr = formatRulesToString(rules) || '[]';
    const enabledVal = is_enabled !== undefined ? (is_enabled ? 1 : 0) : 1;

    const stmt = db.prepare(`
      INSERT INTO rounds (
        stage_number, stage_type, title, subtitle, description, rules,
        is_tie_break, scoring_correct, scoring_wrong, scoring_unanswered,
        order_index, is_enabled
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      nextStageNum,
      finalStageType,
      title.trim(),
      subtitle ? subtitle.trim() : '',
      description ? description.trim() : '',
      rulesStr,
      tieBreakVal,
      scoring_correct !== undefined ? Number(scoring_correct) : 1.0,
      scoring_wrong !== undefined ? Number(scoring_wrong) : 0.0,
      scoring_unanswered !== undefined ? Number(scoring_unanswered) : 0.0,
      nextOrder,
      enabledVal
    );

    const createdId = result.lastInsertRowid;
    const createdRound = db.prepare('SELECT * FROM rounds WHERE id = ?').get(createdId);

    const actorId = req.user ? req.user.id : '1';
    logAudit('ROUND_CREATED', 'ADMIN_1', actorId, { roundId: createdId, title });

    triggerRealtimeSync(createdId);

    return res.status(201).json({
      success: true,
      message: 'Stage created successfully',
      round: {
        ...createdRound,
        rules: parseRules(createdRound.rules),
        questionCount: 0,
        answerCount: 0
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to create stage: ' + err.message });
  }
}

function updateRound(req, res) {
  const roundId = req.params.id;
  const {
    title,
    subtitle,
    description,
    rules,
    scoring_correct,
    scoring_wrong,
    scoring_unanswered,
    status,
    is_enabled,
    order_index,
    is_tie_break
  } = req.body;

  const db = getDb();
  const existing = db.prepare('SELECT * FROM rounds WHERE id = ?').get(roundId);
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Round not found' });
  }

  const rulesStr = rules !== undefined ? formatRulesToString(rules) : existing.rules;
  const enabledVal = is_enabled !== undefined ? (is_enabled ? 1 : 0) : existing.is_enabled;
  const tieBreakVal = is_tie_break !== undefined ? (is_tie_break ? 1 : 0) : existing.is_tie_break;

  try {
    db.prepare(`
      UPDATE rounds SET
        title = COALESCE(?, title),
        subtitle = COALESCE(?, subtitle),
        description = COALESCE(?, description),
        rules = COALESCE(?, rules),
        scoring_correct = COALESCE(?, scoring_correct),
        scoring_wrong = COALESCE(?, scoring_wrong),
        scoring_unanswered = COALESCE(?, scoring_unanswered),
        status = COALESCE(?, status),
        is_enabled = COALESCE(?, is_enabled),
        order_index = COALESCE(?, order_index),
        is_tie_break = COALESCE(?, is_tie_break)
      WHERE id = ?
    `).run(
      title !== undefined ? title.trim() : null,
      subtitle !== undefined ? subtitle.trim() : null,
      description !== undefined ? description.trim() : null,
      rulesStr,
      scoring_correct !== undefined ? Number(scoring_correct) : null,
      scoring_wrong !== undefined ? Number(scoring_wrong) : null,
      scoring_unanswered !== undefined ? Number(scoring_unanswered) : null,
      status || null,
      enabledVal,
      order_index !== undefined ? Number(order_index) : null,
      tieBreakVal,
      roundId
    );

    const actorId = req.user ? req.user.id : '1';
    logAudit('ROUND_UPDATED', 'ADMIN_1', actorId, { roundId, title: title || existing.title });

    triggerRealtimeSync(Number(roundId));

    const updated = db.prepare('SELECT * FROM rounds WHERE id = ?').get(roundId);

    return res.json({
      success: true,
      message: 'Round configuration updated successfully',
      round: {
        ...updated,
        rules: parseRules(updated.rules)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

function deleteRound(req, res) {
  const roundId = req.params.id;
  const force = req.query.force === 'true' || req.query.force === true;
  const db = getDb();

  const existing = db.prepare('SELECT * FROM rounds WHERE id = ?').get(roundId);
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Stage not found' });
  }

  const qCount = db.prepare('SELECT COUNT(*) as count FROM questions WHERE round_id = ?').get(roundId).count;
  const aCount = db.prepare('SELECT COUNT(*) as count FROM answers WHERE round_id = ?').get(roundId).count;

  // Safe delete check: if stage has dependent questions or answers and force flag is not set
  if ((qCount > 0 || aCount > 0) && !force) {
    return res.status(400).json({
      success: false,
      hasDependentData: true,
      questionCount: qCount,
      answerCount: aCount,
      message: `Cannot delete stage "${existing.title}" because it contains ${qCount} question(s) and ${aCount} recorded answer(s). Please disable the stage instead or confirm forced deletion.`
    });
  }

  try {
    if (force) {
      db.prepare('DELETE FROM answers WHERE round_id = ?').run(roundId);
      db.prepare('DELETE FROM questions WHERE round_id = ?').run(roundId);
    }

    db.prepare('DELETE FROM rounds WHERE id = ?').run(roundId);

    const actorId = req.user ? req.user.id : '1';
    logAudit('ROUND_DELETED', 'ADMIN_1', actorId, { roundId, title: existing.title, force });

    triggerRealtimeSync(Number(roundId));

    return res.json({
      success: true,
      message: `Stage "${existing.title}" deleted successfully`
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to delete stage: ' + err.message });
  }
}

function toggleRoundStatus(req, res) {
  const roundId = req.params.id;
  const db = getDb();

  const existing = db.prepare('SELECT * FROM rounds WHERE id = ?').get(roundId);
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Stage not found' });
  }

  let nextEnabled;
  if (req.body && req.body.is_enabled !== undefined) {
    nextEnabled = req.body.is_enabled ? 1 : 0;
  } else {
    nextEnabled = (existing.is_enabled === 1 || existing.is_enabled === undefined) ? 0 : 1;
  }

  try {
    db.prepare('UPDATE rounds SET is_enabled = ? WHERE id = ?').run(nextEnabled, roundId);

    const actorId = req.user ? req.user.id : '1';
    logAudit('ROUND_STATUS_TOGGLED', 'ADMIN_1', actorId, { roundId, is_enabled: nextEnabled });

    triggerRealtimeSync(Number(roundId));

    return res.json({
      success: true,
      is_enabled: nextEnabled,
      message: `Stage "${existing.title}" is now ${nextEnabled ? 'enabled' : 'disabled'}`
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to toggle stage status: ' + err.message });
  }
}

module.exports = {
  getAllRounds,
  getRoundById,
  createRound,
  updateRound,
  deleteRound,
  toggleRoundStatus
};
