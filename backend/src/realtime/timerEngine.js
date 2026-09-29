class TimerEngine {
  constructor(ioGetter, stateMachine, onTimeUpCallback) {
    this.ioGetter = ioGetter;
    this.stateMachine = stateMachine;
    this.onTimeUp = onTimeUpCallback;
    this.intervalId = null;
    this.timeoutId = null;
  }

  startQuestionTimer(durationSec, questionId, stageId) {
    this.clearTimer();

    const durationMs = durationSec * 1000;
    const now = Date.now();
    const endsAt = now + durationMs;

    this.stateMachine.timerStartedAt = now;
    this.stateMachine.timerEndsAt = endsAt;
    this.stateMachine.timerPausedRemainingMs = null;
    this.stateMachine.saveState();

    // Set high-precision timer for expiry
    this.timeoutId = setTimeout(() => {
      this.handleTimerExpired(questionId, stageId);
    }, durationMs);

    // Heartbeat ticker every second
    this.intervalId = setInterval(() => {
      const remainingMs = Math.max(0, this.stateMachine.timerEndsAt - Date.now());
      const remainingSec = Math.ceil(remainingMs / 1000);

      const io = this.ioGetter();
      if (io) {
        io.emit('timer:tick', {
          serverTime: Date.now(),
          endsAt: this.stateMachine.timerEndsAt,
          remainingSec,
          remainingMs
        });
      }

      if (remainingMs <= 0) {
        this.clearTimer();
      }
    }, 1000);
  }

  pauseTimer() {
    if (!this.stateMachine.timerEndsAt) return;

    const remainingMs = Math.max(0, this.stateMachine.timerEndsAt - Date.now());
    this.clearTimer();

    this.stateMachine.timerPausedRemainingMs = remainingMs;
    this.stateMachine.saveState();

    const io = this.ioGetter();
    if (io) {
      io.emit('timer:paused', {
        serverTime: Date.now(),
        remainingMs,
        remainingSec: Math.ceil(remainingMs / 1000)
      });
    }
  }

  freezeTimer() {
    if (!this.stateMachine.timerEndsAt) return;

    const remainingMs = Math.max(0, this.stateMachine.timerEndsAt - Date.now());
    this.clearTimer();

    this.stateMachine.timerPausedRemainingMs = remainingMs;
    this.stateMachine.saveState();

    const io = this.ioGetter();
    if (io) {
      io.emit('timer:frozen', {
        serverTime: Date.now(),
        remainingMs,
        remainingSec: Math.ceil(remainingMs / 1000)
      });
      io.emit('timer:paused', {
        serverTime: Date.now(),
        remainingMs,
        remainingSec: Math.ceil(remainingMs / 1000),
        isFrozen: true
      });
    }
  }

  resumeTimer(questionId, stageId) {
    const remainingMs = this.stateMachine.timerPausedRemainingMs || 0;
    if (remainingMs <= 0) return;

    const now = Date.now();
    const endsAt = now + remainingMs;

    this.stateMachine.timerStartedAt = now;
    this.stateMachine.timerEndsAt = endsAt;
    this.stateMachine.timerPausedRemainingMs = null;
    this.stateMachine.saveState();

    this.timeoutId = setTimeout(() => {
      this.handleTimerExpired(questionId, stageId);
    }, remainingMs);

    this.intervalId = setInterval(() => {
      const rem = Math.max(0, this.stateMachine.timerEndsAt - Date.now());
      const remSec = Math.ceil(rem / 1000);

      const io = this.ioGetter();
      if (io) {
        io.emit('timer:tick', {
          serverTime: Date.now(),
          endsAt: this.stateMachine.timerEndsAt,
          remainingSec: remSec,
          remainingMs: rem
        });
      }

      if (rem <= 0) {
        this.clearTimer();
      }
    }, 1000);

    const io = this.ioGetter();
    if (io) {
      io.emit('timer:resumed', {
        serverTime: Date.now(),
        endsAt,
        remainingMs,
        remainingSec: Math.ceil(remainingMs / 1000)
      });
    }
  }

  handleTimerExpired(questionId, stageId) {
    this.clearTimer();
    if (typeof this.onTimeUp === 'function') {
      this.onTimeUp(questionId, stageId);
    }
  }

  clearTimer() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  startResultTimer(durationSec, stageId, onComplete) {
    this.clearTimer();

    const durationMs = Math.max(3, durationSec) * 1000;
    const now = Date.now();
    const endsAt = now + durationMs;

    this.stateMachine.timerStartedAt = now;
    this.stateMachine.timerEndsAt = endsAt;
    this.stateMachine.timerPausedRemainingMs = null;
    this.stateMachine.saveState();

    const emitTick = () => {
      const remainingMs = Math.max(0, this.stateMachine.timerEndsAt - Date.now());
      const remainingSec = Math.ceil(remainingMs / 1000);
      const io = this.ioGetter();
      if (io) {
        io.emit('timer:result_tick', {
          serverTime: Date.now(),
          endsAt: this.stateMachine.timerEndsAt,
          durationSec,
          remainingSec,
          remainingMs,
          stageId
        });
      }
      return remainingMs;
    };

    emitTick();

    this.intervalId = setInterval(() => {
      const remainingMs = emitTick();
      if (remainingMs <= 0) {
        this.clearTimer();
      }
    }, 500);

    this.timeoutId = setTimeout(() => {
      this.clearTimer();
      if (typeof onComplete === 'function') {
        onComplete(stageId);
      }
    }, durationMs);
  }

  stopResultTimer() {
    this.clearTimer();
  }

  isSubmissionAllowed() {
    if (this.stateMachine.currentState === 'QUESTION_LOCKED') {
      return false;
    }
    if (this.stateMachine.currentState !== 'QUESTION_ACTIVE') {
      return false;
    }
    if (!this.stateMachine.timerEndsAt) {
      return false;
    }
    // Allow small 800ms grace window for network transmission latency
    const gracePeriodMs = 800;
    return Date.now() <= (this.stateMachine.timerEndsAt + gracePeriodMs);
  }
}

module.exports = TimerEngine;
