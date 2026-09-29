import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useAntiCheat } from '../../hooks/useAntiCheat';
import { Zap, Clock, CheckCircle, Wifi, WifiOff, LogOut, ShieldAlert, Award, AlertCircle, Trophy, Lock, XCircle } from 'lucide-react';
import ThemeToggle from '../common/ThemeToggle';

export default function UserMobileScreen() {
  const { user, logout } = useAuth();
  const { connected, eventState, remainingSec, submitAnswer } = useSocket();
  
  // Anti-cheat monitoring for focus/blur & visibility
  useAntiCheat();

  const [selectedOption, setSelectedOption] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [lastAnsweredQId, setLastAnsweredQId] = useState(null);
  const [submissionFeedback, setSubmissionFeedback] = useState(null);

  const activeQId = eventState.question?.questionId || null;

  // Automatically reset option and submission when a new question arrives
  useEffect(() => {
    if (activeQId && activeQId !== lastAnsweredQId) {
      if (eventState.hasSubmitted && eventState.submittedOption) {
        setSelectedOption(eventState.submittedOption);
      } else {
        setSelectedOption(null);
      }
      setStatusMessage('');
      setSubmissionFeedback(null);
    }
  }, [activeQId, lastAnsweredQId, eventState.hasSubmitted, eventState.submittedOption]);

  const handleSubmit = async () => {
    if (!selectedOption || eventState.hasSubmitted || submitting) return;

    setSubmitting(true);
    setStatusMessage('Recording answer on server...');

    try {
      const qId = eventState.question?.questionId;
      const sId = eventState.stage?.id;

      if (!qId) {
        setStatusMessage('No active question to submit');
        setSubmitting(false);
        return;
      }

      const res = await submitAnswer(qId, selectedOption, sId);

      if (res && res.success) {
        setLastAnsweredQId(qId);
        setSubmissionFeedback({
          isCorrect: res.isCorrect,
          isFirstCorrect: res.isFirstCorrect,
          message: res.message
        });
        setStatusMessage(res.message || 'ANSWER SUBMITTED');
      } else {
        setSubmissionFeedback({
          isCorrect: false,
          locked: res?.locked || false,
          message: res?.message || 'Submission was not accepted'
        });
        setStatusMessage(res?.message || 'Submission was not accepted');
      }
    } catch (err) {
      setStatusMessage('Submission error: ' + (err.message || 'Network error'));
    } finally {
      setSubmitting(false);
    }
  };

  const isQuestionActive = eventState.state === 'QUESTION_ACTIVE';
  const isQuestionLocked = eventState.state === 'QUESTION_LOCKED';
  const isTimeUp = eventState.state === 'TIME_UP';
  const isPaused = eventState.state === 'PAUSED';
  const isStopped = eventState.state === 'ROUND_STOPPED';
  const isRoundComplete = eventState.state === 'ROUND_COMPLETED' || eventState.state === 'RESULT' || eventState.state === 'RESULT_COMPLETE';

  const hasUserSubmitted = Boolean(
    eventState.hasSubmitted || 
    (activeQId && activeQId === lastAnsweredQId)
  );

  const isFirstCorrectWinner = Boolean(
    eventState.isFirstCorrectWinner || 
    submissionFeedback?.isFirstCorrect ||
    (eventState.firstCorrectTeamId && String(eventState.firstCorrectTeamId) === String(user?.id))
  );

  const isTeamIncorrect = Boolean(
    eventState.isCorrect === false || 
    (submissionFeedback && submissionFeedback.isCorrect === false && !submissionFeedback.locked)
  );

  const displayLockedOption = eventState.submittedOption || selectedOption || '—';

  const optionLetters = ['A', 'B', 'C', 'D'];
  const optionColors = {
    A: 'border-cyan-500/50 bg-[#0c1836] hover:bg-cyan-950/60 text-cyan-200 focus:ring-2 focus:ring-cyan-400',
    B: 'border-pink-500/50 bg-[#250d22] hover:bg-pink-950/60 text-pink-200 focus:ring-2 focus:ring-pink-400',
    C: 'border-emerald-500/50 bg-[#0d261e] hover:bg-emerald-950/60 text-emerald-200 focus:ring-2 focus:ring-emerald-400',
    D: 'border-amber-500/50 bg-[#2b1f0c] hover:bg-amber-950/60 text-amber-200 focus:ring-2 focus:ring-amber-400'
  };

  const selectedColors = {
    A: 'bg-cyan-500 text-black border-cyan-300 font-bold shadow-lg shadow-cyan-500/40 ring-2 ring-cyan-300',
    B: 'bg-pink-500 text-white border-pink-300 font-bold shadow-lg shadow-pink-500/40 ring-2 ring-pink-300',
    C: 'bg-emerald-500 text-black border-emerald-300 font-bold shadow-lg shadow-emerald-500/40 ring-2 ring-emerald-300',
    D: 'bg-amber-500 text-black border-amber-300 font-bold shadow-lg shadow-amber-500/40 ring-2 ring-amber-300'
  };

  return (
    <div className="min-h-screen bg-[#0a1128] text-white flex flex-col justify-between p-3 sm:p-5 select-none font-sans">
      {/* 1. Reconnection Notice Bar */}
      {!connected && (
        <div className="mb-2 px-3 py-2 rounded-xl bg-red-950/90 border border-red-500/80 text-red-200 text-xs font-mono flex items-center justify-between animate-pulse">
          <div className="flex items-center space-x-2">
            <WifiOff className="w-4 h-4 text-red-400 shrink-0" />
            <span>CONNECTION LOST • RECONNECTING TO SERVER...</span>
          </div>
          <span className="text-[10px] uppercase font-bold text-red-300">AUTO-RETRY</span>
        </div>
      )}

      {/* 2. Header with Team Name & Connection Status */}
      <header className="bg-[#0e1a38] border border-cyan-500/30 rounded-2xl p-3.5 shadow-xl flex items-center justify-between">
        <div className="flex items-center space-x-3 overflow-hidden">
          <div className="w-10 h-10 rounded-xl bg-cyan-950/90 border border-cyan-400/50 flex items-center justify-center shrink-0 shadow-md shadow-cyan-500/20">
            <Zap className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-1.5">
              <span className="text-xs font-mono text-cyan-400 font-bold tracking-wider">GLITCH HUNT</span>
              <span className="text-[10px] text-slate-400 font-mono">• SYNEXA'26</span>
            </div>
            <h2 className="text-base sm:text-lg font-display font-bold text-white truncate">
              {user?.teamName || user?.team_name || 'Team Participant'}
            </h2>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <ThemeToggle compact={true} />

          <div className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-mono border ${
            connected 
              ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-400 shadow-sm shadow-emerald-500/20' 
              : 'bg-red-950/80 border-red-500/60 text-red-400'
          }`}>
            {connected ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping mr-0.5" />
                <span>SYNCED</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 mr-0.5" />
                <span>OFFLINE</span>
              </>
            )}
          </div>
          <button 
            type="button"
            onClick={logout}
            title="Log Out"
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 3. Main Arena Card: STRICTLY NO QUESTION TEXT */}
      <main className="flex-1 my-4 flex flex-col justify-center max-w-md mx-auto w-full">
        {/* State 1: QUESTION ACTIVE - AND NOT SUBMITTED */}
        {isQuestionActive && eventState.question && !hasUserSubmitted && (
          <div className="bg-[#0e1a38] border border-cyan-500/40 rounded-3xl p-4 sm:p-6 shadow-2xl flex flex-col justify-between">
            {/* Top Info Bar */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
              <div className="flex items-center space-x-2">
                <span className="px-2.5 py-1 rounded-lg bg-cyan-950 border border-cyan-400/60 text-cyan-300 text-xs font-mono font-bold">
                  Q #{eventState.question.questionNumber || 1}
                </span>
                <span className="text-xs font-mono text-slate-300 font-medium">
                  {eventState.stage?.title || 'Active Round'}
                </span>
              </div>

              {/* Countdown Timer */}
              <div className={`flex items-center space-x-1.5 px-3 py-1 rounded-full font-mono text-sm font-bold border transition-colors ${
                remainingSec <= 5 
                  ? 'bg-red-950 border-red-500 text-red-400 animate-pulse' 
                  : 'bg-slate-900 border-cyan-500/40 text-cyan-300'
              }`}>
                <Clock className="w-4 h-4" />
                <span>{String(remainingSec).padStart(2, '0')}s</span>
              </div>
            </div>

            {/* Read Question from Projector Banner */}
            <div className="mb-3 p-2.5 rounded-xl bg-cyan-950/50 border border-cyan-500/30 text-center">
              <p className="text-xs font-mono text-cyan-300 flex items-center justify-center space-x-1.5">
                <span>📺 Read question from the main projector screen</span>
              </p>
            </div>

            {/* The 4 Big Option Cards */}
            <div className="grid grid-cols-1 gap-2.5 sm:gap-3 my-1">
              {optionLetters.map((opt) => {
                const isSelected = selectedOption === opt;
                const optionLabel = eventState.question.options ? eventState.question.options[opt] : `OPTION ${opt}`;

                return (
                  <button
                    key={opt}
                    type="button"
                    disabled={submitting}
                    onClick={() => setSelectedOption(opt)}
                    className={`mobile-option-btn w-full p-3.5 sm:p-4 rounded-2xl border-2 text-left flex items-center justify-between transition-all ${
                      isSelected ? selectedColors[opt] : optionColors[opt]
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <span className={`w-8 h-8 rounded-xl flex items-center justify-center font-display font-bold text-lg shrink-0 ${
                        isSelected ? 'bg-black/20 text-inherit' : 'bg-black/50 text-white'
                      }`}>
                        {opt}
                      </span>
                      <span className="font-medium truncate text-sm sm:text-base">
                        {optionLabel}
                      </span>
                    </div>

                    {isSelected && (
                      <CheckCircle className="w-5 h-5 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Submit Button */}
            <div className="mt-4 pt-3 border-t border-slate-800">
              <button
                type="button"
                disabled={!selectedOption || submitting}
                onClick={handleSubmit}
                className="w-full py-4 px-6 rounded-2xl font-display font-bold text-base sm:text-lg tracking-wider bg-gradient-to-r from-cyan-400 via-teal-400 to-cyan-500 hover:from-cyan-300 hover:to-teal-300 text-black shadow-lg shadow-cyan-500/30 active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none"
              >
                {submitting ? 'RECORDING ANSWER...' : `SUBMIT OPTION [ ${selectedOption || '—'} ]`}
              </button>
            </div>
          </div>
        )}

        {/* State 1.5: QUESTION LOCKED (FIRST CORRECT WINNER OR GLOBAL LOCK) */}
        {isQuestionLocked && (
          <div className="bg-[#0e1a38] border rounded-3xl p-6 sm:p-8 text-center shadow-2xl transition-all">
            {isFirstCorrectWinner ? (
              // Winner view
              <div className="border border-amber-400/80 rounded-2xl p-5 bg-gradient-to-b from-amber-950/40 to-transparent">
                <div className="w-16 h-16 rounded-2xl bg-amber-950/90 border border-amber-400 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-500/40 animate-bounce">
                  <Trophy className="w-9 h-9 text-amber-400" />
                </div>
                <div className="inline-block px-3 py-1 rounded-full bg-amber-950/80 border border-amber-400/60 text-amber-300 font-mono text-xs font-bold tracking-wider mb-2">
                  🏆 FIRST CORRECT
                </div>
                <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-amber-300 tracking-wider">
                  ANSWER ACCEPTED
                </h2>
                <p className="text-sm font-mono text-emerald-400 font-semibold mt-2">
                  QUESTION LOCKED
                </p>
                <div className="my-4 p-4 rounded-2xl bg-amber-950/40 border border-amber-500/30">
                  <p className="text-xs font-mono text-amber-200">
                    Option [{displayLockedOption}] recorded first!
                  </p>
                  <p className="text-[11px] font-mono text-slate-300 mt-1">
                    Timer frozen by server. Waiting for controller to advance.
                  </p>
                </div>
              </div>
            ) : isTeamIncorrect ? (
              // Wrong answer submitted view
              <div className="border border-red-500/60 rounded-2xl p-5 bg-gradient-to-b from-red-950/40 to-transparent">
                <div className="w-16 h-16 rounded-2xl bg-red-950/80 border border-red-500/70 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-red-500/30">
                  <XCircle className="w-9 h-9 text-red-400" />
                </div>
                <div className="inline-block px-3 py-1 rounded-full bg-red-950/80 border border-red-500/50 text-red-300 font-mono text-xs font-bold tracking-wider mb-2">
                  SUBMISSION RECORDED
                </div>
                <h2 className="text-2xl sm:text-3xl font-display font-bold text-red-400 tracking-wider">
                  ❌ INCORRECT
                </h2>
                <p className="text-sm font-mono text-slate-300 mt-2">
                  WAIT FOR NEXT QUESTION
                </p>
                <div className="my-4 p-4 rounded-2xl bg-red-950/30 border border-red-500/30">
                  <p className="text-xs font-mono text-red-300">
                    Option [{displayLockedOption}] was incorrect.
                  </p>
                  <p className="text-[11px] font-mono text-slate-400 mt-1">
                    {eventState.firstCorrectTeamName ? `First correct locked by ${eventState.firstCorrectTeamName}.` : 'Question locked.'}
                  </p>
                </div>
              </div>
            ) : (
              // Other teams locked out view
              <div className="border border-cyan-500/50 rounded-2xl p-5 bg-gradient-to-b from-cyan-950/30 to-transparent">
                <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-cyan-500/60 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-cyan-500/20">
                  <Lock className="w-9 h-9 text-cyan-400" />
                </div>
                <div className="inline-block px-3 py-1 rounded-full bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 font-mono text-xs font-bold tracking-wider mb-2">
                  🔒 ANSWER LOCKED
                </div>
                <h2 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-wider">
                  FIRST CORRECT ANSWER RECEIVED
                </h2>
                {eventState.firstCorrectTeamName && (
                  <div className="my-4 p-4 rounded-2xl bg-cyan-950/40 border border-cyan-500/30">
                    <p className="text-xs font-mono text-cyan-300">
                      Locked by: <span className="font-bold text-white">{eventState.firstCorrectTeamName}</span>
                    </p>
                    <p className="text-[11px] font-mono text-slate-400 mt-1">
                      Submissions are closed. Timer frozen by server.
                    </p>
                  </div>
                )}
                <p className="text-xs font-mono text-cyan-400 mt-4 animate-pulse">
                  Waiting for next question...
                </p>
              </div>
            )}
          </div>
        )}

        {/* State 2: QUESTION ACTIVE - AND ANSWER SUBMITTED (CLEAN CONFIRMATION STATE) */}
        {isQuestionActive && hasUserSubmitted && (
          <div className="bg-[#0e1a38] border border-emerald-500/50 rounded-3xl p-6 sm:p-8 text-center shadow-2xl">
            {isTeamIncorrect ? (
              <>
                <div className="w-16 h-16 rounded-2xl bg-red-950/80 border border-red-500/60 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-red-500/30">
                  <XCircle className="w-9 h-9 text-red-400" />
                </div>
                <div className="inline-block px-3 py-1 rounded-full bg-red-950/80 border border-red-500/40 text-red-300 font-mono text-xs font-bold tracking-wider mb-2">
                  ANSWER LOCKED
                </div>
                <h2 className="text-2xl sm:text-3xl font-display font-bold text-red-400 tracking-wider">
                  ❌ INCORRECT
                </h2>
                <div className="my-4 p-4 rounded-2xl bg-red-950/30 border border-red-500/30">
                  <p className="text-xs font-mono text-red-300">
                    Option [{displayLockedOption}] was incorrect.
                  </p>
                  <p className="text-[11px] font-mono text-slate-400 mt-1">
                    Your submission is locked for this question. Other teams may still answer.
                  </p>
                </div>
                <div className="flex items-center justify-center space-x-2 text-cyan-400 font-mono text-xs mt-6">
                  <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                  <span>WAIT FOR NEXT QUESTION...</span>
                </div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-2xl bg-emerald-950/90 border border-emerald-400 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/30">
                  <CheckCircle className="w-9 h-9 text-emerald-400" />
                </div>

                <div className="inline-block px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-mono text-xs font-bold tracking-wider mb-2">
                  LOCKED ON SERVER
                </div>

                <h2 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-wider">
                  ANSWER SUBMITTED
                </h2>

                <div className="my-4 p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30">
                  <p className="text-xs font-mono text-emerald-300">
                    Option [{displayLockedOption}] recorded for Question #{eventState.question?.questionNumber || 1}
                  </p>
                  <p className="text-[11px] font-mono text-slate-400 mt-1">
                    Your answer is registered. Submission window remains locked.
                  </p>
                </div>

                <div className="flex items-center justify-center space-x-2 text-cyan-400 font-mono text-xs mt-6">
                  <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                  <span>Waiting for next question...</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* State 3: TIME UP */}
        {isTimeUp && (
          <div className="bg-[#0e1a38] border border-red-500/50 rounded-3xl p-6 sm:p-8 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-red-950/80 border border-red-500/60 flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-red-400 animate-pulse" />
            </div>

            <h2 className="text-2xl sm:text-3xl font-display font-bold text-red-400 tracking-wider">
              TIME UP
            </h2>
            <p className="text-xs font-mono text-slate-300 mt-2">
              Answer submissions are closed for this question.
            </p>

            {hasUserSubmitted ? (
              <div className="mt-4 p-3.5 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 font-mono text-xs">
                ✓ Your answer [{displayLockedOption}] was recorded
              </div>
            ) : (
              <div className="mt-4 p-3.5 rounded-2xl bg-red-950/60 border border-red-500/40 text-red-300 font-mono text-xs">
                No answer was submitted in time
              </div>
            )}

            <p className="text-xs font-mono text-cyan-400 mt-6 animate-pulse">
              Waiting for next question...
            </p>
          </div>
        )}

        {/* State 4: QUESTION PAUSED */}
        {isPaused && (
          <div className="bg-[#0e1a38] border border-amber-500/50 rounded-3xl p-6 sm:p-8 text-center shadow-2xl">
            <div className="w-14 h-14 rounded-2xl bg-amber-950/70 border border-amber-500/50 flex items-center justify-center mx-auto mb-3">
              <Clock className="w-7 h-7 text-amber-400" />
            </div>

            <h2 className="text-2xl font-display font-bold text-amber-400">
              QUESTION PAUSED
            </h2>
            <p className="text-xs font-mono text-slate-300 mt-2">
              The controller has paused the countdown timer.
            </p>
            <p className="text-xs font-mono text-amber-300/80 mt-4">
              Stand by for resumption...
            </p>
          </div>
        )}

        {/* State 4.5: ROUND STOPPED */}
        {isStopped && (
          <div className="bg-[#0e1a38] border border-red-500/60 rounded-3xl p-6 sm:p-8 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-red-950/90 border border-red-500/70 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-red-500/30">
              <AlertCircle className="w-8 h-8 text-red-400 animate-pulse" />
            </div>

            <div className="inline-block px-3 py-1 rounded-full bg-red-950/80 border border-red-500/50 text-red-300 font-mono text-xs font-bold tracking-wider mb-2">
              OPERATOR HOLD
            </div>

            <h2 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-wider">
              ROUND STOPPED
            </h2>
            <p className="text-sm font-mono text-red-400 font-bold mt-2">
              SCORES PRESERVED
            </p>
            <p className="text-xs text-slate-300 mt-4 max-w-xs mx-auto leading-relaxed">
              The round has been temporarily stopped by the operator. All submitted answers remain safe. Waiting for host...
            </p>
          </div>
        )}

        {/* State 5: ROUND COMPLETED / WAITING FOR RESULT */}
        {isRoundComplete && (
          <div className="bg-[#0e1a38] border border-cyan-500/40 rounded-3xl p-6 sm:p-8 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-cyan-950/80 border border-cyan-400/60 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-cyan-500/20">
              <Award className="w-8 h-8 text-cyan-400" />
            </div>

            <h2 className="text-2xl font-display font-bold text-white tracking-wider">
              ROUND COMPLETED
            </h2>
            <p className="text-sm font-mono text-cyan-400 font-bold mt-2">
              WAITING FOR RESULT...
            </p>
            <p className="text-xs text-slate-300 mt-4 max-w-xs mx-auto leading-relaxed">
              Scores are being evaluated on the server. Watch the main projector screen for live rankings.
            </p>
          </div>
        )}

        {/* State 6: WAITING / IDLE / DESCRIPTION / RULES / READY */}
        {!isQuestionActive && !isTimeUp && !isPaused && !isStopped && !isRoundComplete && (
          <div className="bg-[#0e1a38] border border-cyan-500/30 rounded-3xl p-6 sm:p-8 text-center shadow-2xl">
            <div className="relative w-16 h-16 mx-auto mb-4">
              <div className="absolute inset-0 rounded-2xl border-2 border-cyan-500/30 animate-ping" />
              <div className="relative w-16 h-16 rounded-2xl bg-cyan-950/90 border border-cyan-400/60 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                <Zap className="w-8 h-8 text-cyan-400 animate-pulse" />
              </div>
            </div>

            <span className="px-3 py-1 rounded-full bg-cyan-950/80 border border-cyan-500/40 text-cyan-400 text-xs font-mono font-bold tracking-wider uppercase">
              {eventState.stage?.title || 'TECHNICAL SYMPOSIUM'}
            </span>

            <h2 className="text-2xl font-display font-bold text-white mt-4 tracking-wider">
              WAITING FOR HOST...
            </h2>
            <p className="text-xs font-mono text-slate-300 mt-2">
              Controller is preparing the round.
            </p>

            <div className="mt-6 p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 text-xs text-slate-300 max-w-xs mx-auto">
              💡 Look at the main auditorium projector screen. Questions will appear there.
            </div>
          </div>
        )}
      </main>

      {/* 4. Footer Telemetry */}
      <footer className="mt-2 text-center">
        <div className="inline-flex items-center space-x-1.5 text-[11px] font-mono text-slate-400">
          <ShieldAlert className="w-3.5 h-3.5 text-cyan-400" />
          <span>Anti-cheat monitoring active • Do not switch tabs</span>
        </div>
      </footer>
    </div>
  );
}
