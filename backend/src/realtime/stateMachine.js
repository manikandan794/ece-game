const { getDb } = require('../config/database');
const { logAudit } = require('../utils/logger');

const EVENT_STATES = {
  IDLE: 'IDLE',
  WAITING: 'WAITING',
  DESCRIPTION: 'DESCRIPTION',
  RULES: 'RULES',
  READY: 'READY',
  QUESTION_ACTIVE: 'QUESTION_ACTIVE',
  QUESTION_LOCKED: 'QUESTION_LOCKED',
  PAUSED: 'PAUSED',
  ROUND_STOPPED: 'ROUND_STOPPED',
  TIME_UP: 'TIME_UP',
  QUESTION_COMPLETED: 'QUESTION_COMPLETED',
  ROUND_COMPLETED: 'ROUND_COMPLETED',
  RESULT: 'RESULT',
  RESULT_COMPLETE: 'RESULT_COMPLETE',
  TIE_BREAK: 'TIE_BREAK',
  EVENT_COMPLETED: 'EVENT_COMPLETED'
};

const VALID_TRANSITIONS = {
  [EVENT_STATES.IDLE]: [EVENT_STATES.WAITING, EVENT_STATES.DESCRIPTION, EVENT_STATES.READY],
  [EVENT_STATES.WAITING]: [EVENT_STATES.IDLE, EVENT_STATES.DESCRIPTION, EVENT_STATES.RULES, EVENT_STATES.READY],
  [EVENT_STATES.DESCRIPTION]: [EVENT_STATES.RULES, EVENT_STATES.READY, EVENT_STATES.IDLE, EVENT_STATES.WAITING, EVENT_STATES.ROUND_STOPPED],
  [EVENT_STATES.RULES]: [EVENT_STATES.DESCRIPTION, EVENT_STATES.READY, EVENT_STATES.WAITING, EVENT_STATES.IDLE, EVENT_STATES.ROUND_STOPPED],
  [EVENT_STATES.READY]: [EVENT_STATES.RULES, EVENT_STATES.DESCRIPTION, EVENT_STATES.QUESTION_ACTIVE, EVENT_STATES.WAITING, EVENT_STATES.ROUND_STOPPED],
  [EVENT_STATES.QUESTION_ACTIVE]: [EVENT_STATES.QUESTION_LOCKED, EVENT_STATES.PAUSED, EVENT_STATES.TIME_UP, EVENT_STATES.QUESTION_COMPLETED, EVENT_STATES.ROUND_STOPPED, EVENT_STATES.ROUND_COMPLETED],
  [EVENT_STATES.QUESTION_LOCKED]: [EVENT_STATES.QUESTION_ACTIVE, EVENT_STATES.READY, EVENT_STATES.PAUSED, EVENT_STATES.TIME_UP, EVENT_STATES.QUESTION_COMPLETED, EVENT_STATES.ROUND_STOPPED, EVENT_STATES.ROUND_COMPLETED],
  [EVENT_STATES.PAUSED]: [EVENT_STATES.QUESTION_ACTIVE, EVENT_STATES.QUESTION_LOCKED, EVENT_STATES.TIME_UP, EVENT_STATES.QUESTION_COMPLETED, EVENT_STATES.ROUND_STOPPED, EVENT_STATES.ROUND_COMPLETED],
  [EVENT_STATES.ROUND_STOPPED]: [EVENT_STATES.READY, EVENT_STATES.QUESTION_ACTIVE, EVENT_STATES.QUESTION_LOCKED, EVENT_STATES.DESCRIPTION, EVENT_STATES.WAITING, EVENT_STATES.IDLE, EVENT_STATES.ROUND_COMPLETED],
  [EVENT_STATES.TIME_UP]: [EVENT_STATES.QUESTION_COMPLETED, EVENT_STATES.ROUND_COMPLETED, EVENT_STATES.QUESTION_ACTIVE, EVENT_STATES.ROUND_STOPPED],
  [EVENT_STATES.QUESTION_COMPLETED]: [EVENT_STATES.QUESTION_ACTIVE, EVENT_STATES.ROUND_COMPLETED, EVENT_STATES.READY, EVENT_STATES.TIME_UP, EVENT_STATES.ROUND_STOPPED],
  [EVENT_STATES.ROUND_COMPLETED]: [EVENT_STATES.RESULT, EVENT_STATES.TIE_BREAK, EVENT_STATES.DESCRIPTION, EVENT_STATES.WAITING, EVENT_STATES.IDLE, EVENT_STATES.READY],
  [EVENT_STATES.RESULT]: [EVENT_STATES.RESULT_COMPLETE, EVENT_STATES.ROUND_COMPLETED, EVENT_STATES.TIE_BREAK, EVENT_STATES.EVENT_COMPLETED, EVENT_STATES.DESCRIPTION, EVENT_STATES.WAITING],
  [EVENT_STATES.RESULT_COMPLETE]: [EVENT_STATES.ROUND_COMPLETED, EVENT_STATES.RESULT, EVENT_STATES.DESCRIPTION, EVENT_STATES.WAITING, EVENT_STATES.IDLE, EVENT_STATES.READY, EVENT_STATES.EVENT_COMPLETED, EVENT_STATES.TIE_BREAK],
  [EVENT_STATES.TIE_BREAK]: [EVENT_STATES.DESCRIPTION, EVENT_STATES.RULES, EVENT_STATES.READY, EVENT_STATES.QUESTION_ACTIVE, EVENT_STATES.RESULT, EVENT_STATES.ROUND_STOPPED],
  [EVENT_STATES.EVENT_COMPLETED]: [EVENT_STATES.RESULT, EVENT_STATES.IDLE, EVENT_STATES.DESCRIPTION]
};

class EventStateMachine {
  constructor() {
    this.currentState = EVENT_STATES.IDLE;
    this.currentStageId = null;
    this.currentQuestionId = null;
    this.currentEventRunId = null;
    this.timerStartedAt = null;
    this.timerEndsAt = null;
    this.timerPausedRemainingMs = null;
    this.firstCorrectTeamId = null;
    this.firstCorrectTeamName = null;
    this.questionLockedAt = null;
    this.isTestingMode = false;
    this.soundMuted = false;
    this.soundVolume = 0.8;
    this.loadPersistedState();
  }

  loadPersistedState() {
    try {
      const db = getDb();
      const row = db.prepare('SELECT * FROM event_state WHERE id = 1').get();
      if (row) {
        this.currentState = row.state || EVENT_STATES.IDLE;
        this.currentStageId = row.current_stage_id;
        this.currentQuestionId = row.current_question_id;
        this.currentEventRunId = row.current_event_run_id || null;
        this.timerStartedAt = row.timer_started_at;
        this.timerEndsAt = row.timer_ends_at;
        this.timerPausedRemainingMs = row.timer_paused_remaining_ms;
        this.firstCorrectTeamId = row.first_correct_team_id || null;
        this.firstCorrectTeamName = row.first_correct_team_name || null;
        this.questionLockedAt = row.question_locked_at || null;
        this.isTestingMode = Boolean(row.is_testing_mode);
        this.soundMuted = Boolean(row.sound_muted);
        this.soundVolume = row.sound_volume !== null ? row.sound_volume : 0.8;
      }

      if (!this.currentEventRunId) {
        const activeRun = db.prepare("SELECT event_run_id FROM event_runs WHERE status != 'completed' ORDER BY id DESC LIMIT 1").get();
        if (activeRun) {
          this.currentEventRunId = activeRun.event_run_id;
        }
      }
    } catch (err) {
      console.error('[STATE MACHINE ERROR] Failed to load persisted state:', err.message);
    }
  }

  saveState() {
    try {
      const db = getDb();
      db.prepare(`
        UPDATE event_state
        SET current_stage_id = ?,
            current_question_id = ?,
            state = ?,
            timer_started_at = ?,
            timer_ends_at = ?,
            timer_paused_remaining_ms = ?,
            first_correct_team_id = ?,
            first_correct_team_name = ?,
            question_locked_at = ?,
            is_testing_mode = ?,
            sound_muted = ?,
            sound_volume = ?,
            current_event_run_id = ?,
            updated_at = ?
        WHERE id = 1
      `).run(
        this.currentStageId,
        this.currentQuestionId,
        this.currentState,
        this.timerStartedAt,
        this.timerEndsAt,
        this.timerPausedRemainingMs,
        this.firstCorrectTeamId,
        this.firstCorrectTeamName,
        this.questionLockedAt,
        this.isTestingMode ? 1 : 0,
        this.soundMuted ? 1 : 0,
        this.soundVolume,
        this.currentEventRunId,
        new Date().toISOString()
      );
    } catch (err) {
      console.error('[STATE MACHINE ERROR] Failed to save state:', err.message);
    }
  }

  transitionTo(newState, options = {}, force = false) {
    if (!EVENT_STATES[newState]) {
      throw new Error(`Invalid state: ${newState}`);
    }

    if (!force && this.currentState !== newState) {
      const allowed = VALID_TRANSITIONS[this.currentState] || [];
      if (!allowed.includes(newState)) {
        throw new Error(`Invalid transition from ${this.currentState} to ${newState}`);
      }
    }

    const previousState = this.currentState;
    this.currentState = newState;

    const changingQuestion = options.questionId !== undefined && options.questionId !== this.currentQuestionId;

    if (options.stageId !== undefined) this.currentStageId = options.stageId;
    if (options.questionId !== undefined) this.currentQuestionId = options.questionId;
    if (options.timerStartedAt !== undefined) this.timerStartedAt = options.timerStartedAt;
    if (options.timerEndsAt !== undefined) this.timerEndsAt = options.timerEndsAt;
    if (options.timerPausedRemainingMs !== undefined) this.timerPausedRemainingMs = options.timerPausedRemainingMs;
    if (options.eventRunId !== undefined) this.currentEventRunId = options.eventRunId;

    if (options.firstCorrectTeamId !== undefined) {
      this.firstCorrectTeamId = options.firstCorrectTeamId;
    } else if (changingQuestion || newState === EVENT_STATES.READY || newState === EVENT_STATES.IDLE || newState === EVENT_STATES.DESCRIPTION) {
      this.firstCorrectTeamId = null;
    }

    if (options.firstCorrectTeamName !== undefined) {
      this.firstCorrectTeamName = options.firstCorrectTeamName;
    } else if (changingQuestion || newState === EVENT_STATES.READY || newState === EVENT_STATES.IDLE || newState === EVENT_STATES.DESCRIPTION) {
      this.firstCorrectTeamName = null;
    }

    if (options.questionLockedAt !== undefined) {
      this.questionLockedAt = options.questionLockedAt;
    } else if (changingQuestion || newState === EVENT_STATES.READY || newState === EVENT_STATES.IDLE || newState === EVENT_STATES.DESCRIPTION) {
      this.questionLockedAt = null;
    }

    this.saveState();
    logAudit('STATE_TRANSITION', 'SYSTEM', 'STATE_MACHINE', {
      from: previousState,
      to: newState,
      stageId: this.currentStageId,
      questionId: this.currentQuestionId,
      eventRunId: this.currentEventRunId,
      firstCorrectTeamId: this.firstCorrectTeamId
    });

    return {
      previousState,
      currentState: this.currentState,
      stageId: this.currentStageId,
      questionId: this.currentQuestionId,
      eventRunId: this.currentEventRunId,
      firstCorrectTeamId: this.firstCorrectTeamId,
      firstCorrectTeamName: this.firstCorrectTeamName,
      questionLockedAt: this.questionLockedAt,
      timerEndsAt: this.timerEndsAt
    };
  }

  setEventRunId(runId) {
    this.currentEventRunId = runId;
    this.saveState();
  }

  setTestingMode(enabled) {
    this.isTestingMode = Boolean(enabled);
    this.saveState();
  }

  setAudioConfig(muted, volume) {
    if (muted !== undefined) this.soundMuted = Boolean(muted);
    if (volume !== undefined) this.soundVolume = Math.max(0, Math.min(1, Number(volume)));
    this.saveState();
  }

  getFullState() {
    return {
      state: this.currentState,
      stageId: this.currentStageId,
      questionId: this.currentQuestionId,
      currentEventRunId: this.currentEventRunId,
      timerStartedAt: this.timerStartedAt,
      timerEndsAt: this.timerEndsAt,
      timerPausedRemainingMs: this.timerPausedRemainingMs,
      firstCorrectTeamId: this.firstCorrectTeamId,
      firstCorrectTeamName: this.firstCorrectTeamName,
      questionLockedAt: this.questionLockedAt,
      serverTime: Date.now(),
      isTestingMode: this.isTestingMode,
      soundMuted: this.soundMuted,
      soundVolume: this.soundVolume
    };
  }
}

const stateMachineInstance = new EventStateMachine();

module.exports = {
  EVENT_STATES,
  VALID_TRANSITIONS,
  EventStateMachine,
  stateMachine: stateMachineInstance
};
