import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { api } from '../../services/api';
import { audioService } from '../../services/audioService';
import { 
  Play, Pause, RotateCcw, ChevronRight, ChevronLeft, 
  Square, Volume2, VolumeX, Monitor, LogOut, Zap, 
  HelpCircle, CheckCircle, ShieldAlert, Award, ArrowRight,
  Trophy, Lock
} from 'lucide-react';
import ThemeToggle from '../common/ThemeToggle';

export default function Admin2Controller() {
  const { user, logout } = useAuth();
  const { socket, eventState, remainingSec, adminStats, sendAdminControl } = useSocket();

  const [stages, setStages] = useState([]);
  const [selectedStageId, setSelectedStageId] = useState(1);
  const [loading, setLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [message, setMessage] = useState('');

  // Fetch 8 stages from database & listen for real-time updates from Admin 1
  useEffect(() => {
    loadStages();
    if (socket) {
      socket.on('stages:updated', loadStages);
      return () => {
        socket.off('stages:updated', loadStages);
      };
    }
  }, [socket]);

  const loadStages = async () => {
    try {
      const res = await api.getRounds();
      if (res.success && res.rounds) {
        setStages(res.rounds);
      }
    } catch (e) {
      console.error('Failed to load stages:', e);
    }
  };

  const handleStageSelect = async (stageId) => {
    setSelectedStageId(stageId);
    setLoading(true);
    try {
      const res = await sendAdminControl({ action: 'SELECT_STAGE', stageId });
      if (res && res.success) {
        setMessage(`Stage switched to ${res.state}`);
      }
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action, extra = {}) => {
    setLoading(true);
    try {
      const res = await sendAdminControl({ action, ...extra });
      if (res && res.success) {
        setMessage(`Action ${action} executed successfully`);
      } else {
        setMessage(res.message || 'Action failed');
      }
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    audioService.setMuted(nextMuted);
    sendAdminControl({ action: 'SET_AUDIO', muted: nextMuted, volume });
  };

  const handleVolumeChange = (e) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    audioService.setVolume(v);
    sendAdminControl({ action: 'SET_AUDIO', muted: isMuted, volume: v });
  };

  const isQuestionActive = eventState.state === 'QUESTION_ACTIVE';
  const isQuestionLocked = eventState.state === 'QUESTION_LOCKED';
  const isPaused = eventState.state === 'PAUSED';
  const isTimeUp = eventState.state === 'TIME_UP';
  const selectedStage = stages.find(s => s.id === selectedStageId) || stages[0];

  return (
    <div className="min-h-screen bg-[#0a1128] text-white flex flex-col p-4 md:p-6 font-sans">
      {/* 1. Controller Header */}
      <header className="bg-[#0e1a38] border border-cyan-500/30 rounded-2xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-pink-950/80 border border-pink-500/50 flex items-center justify-center">
            <Zap className="w-6 h-6 text-pink-400" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono text-pink-400 font-bold tracking-wider">ADMIN 2</span>
              <span className="text-xs text-slate-500 font-mono">• LIVE CONTROLLER</span>
            </div>
            <h1 className="text-xl font-display font-bold text-white">GLITCH HUNT OPERATOR CONSOLE</h1>
          </div>
        </div>

        {/* Live Status Indicators */}
        <div className="flex items-center space-x-3">
          <ThemeToggle />

          <div className="px-3.5 py-1.5 rounded-xl bg-slate-900 border border-cyan-500/30 font-mono text-xs text-cyan-300">
            STATE: <span className="text-white font-bold">{eventState.state}</span>
          </div>

          <a
            href="/projector"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-black font-display font-bold text-sm tracking-wide shadow-md hover:from-cyan-400 hover:to-blue-500 transition"
          >
            <Monitor className="w-4 h-4" />
            <span>OPEN PROJECTOR</span>
          </a>

          <button
            onClick={logout}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
            title="Log Out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Notification Banner */}
      {message && (
        <div className="mb-4 px-4 py-2.5 rounded-xl bg-cyan-950/60 border border-cyan-500/40 text-cyan-200 text-xs font-mono flex items-center justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage('')} className="text-cyan-400 hover:text-white">✕</button>
        </div>
      )}

      {/* 2. Controller Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        {/* Left Column: 8 Selectable Stages */}
        <div className="bg-[#0d1527] border border-slate-800 rounded-2xl p-5 flex flex-col">
          <h2 className="text-sm font-mono text-cyan-400 font-bold uppercase tracking-wider mb-4 flex items-center justify-between">
            <span>SELECTABLE STAGES (8 TOTAL)</span>
            <span className="text-xs text-slate-500 font-normal">SERVER-SYNCHRONIZED</span>
          </h2>

          <div className="space-y-2.5 flex-1 overflow-y-auto">
            {stages.map((stg) => {
              const isCurrent = eventState.stage?.id === stg.id;
              const isSelected = selectedStageId === stg.id;

              return (
                <button
                  key={stg.id}
                  onClick={() => handleStageSelect(stg.id)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-center justify-between ${
                    isCurrent
                      ? 'bg-cyan-950/80 border-cyan-400 shadow-md shadow-cyan-500/20'
                      : isSelected
                      ? 'bg-slate-800/80 border-slate-600'
                      : 'bg-[#080d19] border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className={`text-[11px] font-mono px-2 py-0.5 rounded font-bold ${
                        stg.is_tie_break ? 'bg-amber-950 text-amber-400 border border-amber-500/40' : 'bg-blue-950 text-blue-400 border border-blue-500/40'
                      }`}>
                        STAGE {stg.stage_number}
                      </span>
                      {stg.is_enabled === 0 && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-500/40 font-bold">
                          DISABLED
                        </span>
                      )}
                      {isCurrent && (
                        <span className="text-[10px] font-mono text-emerald-400 flex items-center">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping mr-1" />
                          LIVE
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-display font-bold text-white mt-1 truncate">
                      {stg.title}
                    </div>
                    <div className="text-xs text-slate-400 truncate">
                      {stg.subtitle}
                    </div>
                  </div>

                  <ChevronRight className={`w-5 h-5 shrink-0 ${isCurrent ? 'text-cyan-400' : 'text-slate-600'}`} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Center Column: Stage Progression & Live Playback Controls */}
        <div className="bg-[#0d1527] border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-mono text-cyan-400 font-bold uppercase tracking-wider mb-4">
              STAGE PROGRESSION PIPELINE
            </h2>

            {/* Click -> Description -> Rules -> Ready -> Start */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button
                onClick={() => handleAction('SELECT_STAGE', { stageId: selectedStageId })}
                className="p-3 rounded-xl bg-slate-900 border border-slate-700 hover:border-cyan-400 text-xs font-mono text-slate-200 transition"
              >
                1. DESCRIPTION
              </button>

              <button
                onClick={() => handleAction('SHOW_RULES')}
                className="p-3 rounded-xl bg-slate-900 border border-slate-700 hover:border-cyan-400 text-xs font-mono text-slate-200 transition"
              >
                2. SHOW RULES
              </button>

              <button
                onClick={() => handleAction('READY')}
                className="p-3 rounded-xl bg-slate-900 border border-slate-700 hover:border-cyan-400 text-xs font-mono text-slate-200 transition"
              >
                3. READY SCREEN
              </button>

              <button
                onClick={() => handleAction('START_QUESTION')}
                className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/60 text-xs font-mono text-emerald-300 font-bold hover:bg-emerald-900 transition flex items-center justify-center space-x-1"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>4. START QUESTION</span>
              </button>
            </div>

            {/* SECTION 1: ROUND CONTROL */}
            <div className="mb-4 p-3.5 rounded-xl bg-[#080d19] border border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-cyan-400 font-bold uppercase tracking-wider flex items-center space-x-1.5">
                  <Play className="w-3.5 h-3.5" />
                  <span>ROUND CONTROL</span>
                </span>
                <span className="text-[10px] font-mono text-slate-500">STAGE LEVEL</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {/* START */}
                <button
                  onClick={() => handleAction('START_QUESTION')}
                  className="p-2.5 rounded-xl bg-cyan-950/80 border border-cyan-500/60 hover:bg-cyan-900 text-cyan-300 font-mono text-xs font-bold flex items-center justify-center space-x-1.5 transition"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>START</span>
                </button>

                {/* PAUSE */}
                <button
                  onClick={() => handleAction('PAUSE')}
                  disabled={!isQuestionActive}
                  className="p-2.5 rounded-xl bg-amber-950/80 border border-amber-500/60 hover:bg-amber-900 text-amber-300 font-mono text-xs font-bold flex items-center justify-center space-x-1.5 transition disabled:opacity-40 disabled:pointer-events-none"
                >
                  <Pause className="w-3.5 h-3.5" />
                  <span>PAUSE</span>
                </button>

                {/* RESUME */}
                <button
                  onClick={() => handleAction('RESUME')}
                  disabled={!isPaused}
                  className="p-2.5 rounded-xl bg-emerald-950/80 border border-emerald-500/60 hover:bg-emerald-900 text-emerald-300 font-mono text-xs font-bold flex items-center justify-center space-x-1.5 transition disabled:opacity-40 disabled:pointer-events-none"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>RESUME</span>
                </button>

                {/* STOP */}
                <button
                  onClick={() => {
                    if (window.confirm('STOP ROUND? This will pause active timer, alert projector & participants that round is stopped, and preserve all submitted answers.')) {
                      handleAction('STOP_ROUND');
                    }
                  }}
                  className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-500/70 hover:bg-rose-900 text-rose-300 font-mono text-xs font-bold flex items-center justify-center space-x-1.5 transition shadow-sm shadow-rose-950"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>STOP</span>
                </button>

                {/* START OVER */}
                <button
                  onClick={() => {
                    if (window.confirm('START OVER? This will reset the round pointer to Question 1 and reset timer. Previous answers remain recorded.')) {
                      handleAction('START_OVER');
                    }
                  }}
                  className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 font-mono text-xs font-bold flex items-center justify-center space-x-1.5 transition col-span-2 sm:col-span-2"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>START OVER (Q1)</span>
                </button>
              </div>
            </div>

            {/* SECTION 2: QUESTION CONTROL */}
            <div className="mb-4 p-3.5 rounded-xl bg-[#080d19] border border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-blue-400 font-bold uppercase tracking-wider flex items-center space-x-1.5">
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>QUESTION CONTROL</span>
                </span>
                <span className="text-[10px] font-mono text-slate-500">QUESTION LEVEL</span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {/* PREV Q */}
                <button
                  onClick={() => handleAction('PREV_QUESTION')}
                  className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 font-mono text-xs font-bold flex items-center justify-center space-x-1.5 transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>PREV Q</span>
                </button>

                {/* NEXT Q */}
                <button
                  onClick={() => handleAction('NEXT_QUESTION')}
                  className="p-2.5 rounded-xl bg-blue-950/80 border border-blue-500/60 hover:bg-blue-900 text-blue-300 font-mono text-xs font-bold flex items-center justify-center space-x-1.5 transition"
                >
                  <span>NEXT Q</span>
                  <ChevronRight className="w-4 h-4" />
                </button>

                {/* RESTART QUESTION */}
                <button
                  onClick={() => {
                    if (window.confirm('Restart this question? Answers for this question will be cleared and timer restarted.')) {
                      handleAction('RESTART_QUESTION');
                    }
                  }}
                  className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 font-mono text-xs flex items-center justify-center space-x-1.5 transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>RESTART Q</span>
                </button>
              </div>
            </div>

            {/* SECTION 3: ROUND FINALIZATION */}
            <div className="mb-5 p-3.5 rounded-xl bg-[#080d19] border border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-purple-400 font-bold uppercase tracking-wider flex items-center space-x-1.5">
                  <Award className="w-3.5 h-3.5" />
                  <span>ROUND FINALIZATION</span>
                </span>
                <span className="text-[10px] font-mono text-slate-500">RESULTS & COMPLETION</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* END ROUND */}
                <button
                  onClick={() => {
                    if (window.confirm('END THIS ROUND? Marks round as completed and alerts projector. System will NOT auto-advance.')) {
                      handleAction('END_ROUND');
                    }
                  }}
                  className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/60 hover:bg-rose-900 text-rose-300 font-mono text-xs font-bold flex items-center justify-center space-x-1.5 transition shadow-sm shadow-rose-950"
                >
                  <Square className="w-4 h-4" />
                  <span>END ROUND</span>
                </button>

                {/* RESULTS */}
                <button
                  onClick={() => handleAction('SHOW_RESULTS')}
                  className="p-3 rounded-xl bg-purple-950/80 border border-purple-500/70 hover:bg-purple-900 text-purple-300 font-mono text-xs font-bold flex items-center justify-center space-x-1.5 transition shadow-md shadow-purple-950/30"
                >
                  <Award className="w-4 h-4" />
                  <span>SHOW RESULTS</span>
                </button>
              </div>
            </div>

            {/* Selected Stage Live Protocol Briefing */}
            {selectedStage && (
              <div className="mb-4 p-3.5 rounded-xl bg-[#080d19] border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-cyan-400 font-bold uppercase">
                    STAGE PROTOCOL BRIEFING: {selectedStage.title}
                  </span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${selectedStage.is_enabled === 0 ? 'bg-rose-950 text-rose-400 border border-rose-500/40' : 'bg-emerald-950 text-emerald-400 border border-emerald-500/40'}`}>
                    {selectedStage.is_enabled === 0 ? 'DISABLED' : 'ENABLED'}
                  </span>
                </div>
                {selectedStage.description && (
                  <p className="text-xs text-slate-300 font-sans line-clamp-2">
                    {selectedStage.description}
                  </p>
                )}
                {Array.isArray(selectedStage.rules) && selectedStage.rules.length > 0 ? (
                  <div className="text-[11px] font-mono text-slate-400 max-h-24 overflow-y-auto space-y-1 pt-1 border-t border-slate-800/60">
                    {selectedStage.rules.map((r, i) => (
                      <div key={i} className="flex items-start space-x-1.5">
                        <span className="text-cyan-400 shrink-0 font-bold">{i + 1}.</span>
                        <span className="text-slate-300">{r}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] font-mono text-slate-500 italic">No rules configured for this stage.</div>
                )}
              </div>
            )}
          </div>

          {/* Sound Mute & Volume Controller */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button
                onClick={toggleMute}
                className={`p-2.5 rounded-xl border transition ${
                  isMuted 
                    ? 'bg-red-950/60 border-red-500/50 text-red-400' 
                    : 'bg-slate-900 border-slate-700 text-cyan-400'
                }`}
              >
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <div className="text-xs font-mono text-slate-400">
                {isMuted ? 'SOUND MUTED' : `VOLUME ${Math.round(volume * 100)}%`}
              </div>
            </div>

            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={handleVolumeChange}
              className="w-32 accent-cyan-400"
            />
          </div>
        </div>

        {/* Right Column: Live Telemetry & Question Inspector */}
        <div className="bg-[#0d1527] border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-mono text-cyan-400 font-bold uppercase tracking-wider mb-4 flex items-center justify-between">
              <span>LIVE TELEMETRY</span>
              <span className={`w-2.5 h-2.5 rounded-full ${isQuestionActive ? 'bg-emerald-400 animate-ping' : 'bg-slate-600'}`} />
            </h2>

            {/* Countdown Box */}
            <div className="p-4 rounded-xl bg-[#080d19] border border-slate-800 text-center mb-4">
              <div className="text-xs font-mono text-slate-400 uppercase">SERVER OFFICIAL TIMER</div>
              <div className={`text-4xl font-mono font-bold mt-1 ${isQuestionLocked ? 'text-amber-400' : isTimeUp ? 'text-red-400' : isQuestionActive ? 'text-cyan-400' : 'text-slate-500'}`}>
                {isQuestionLocked ? 'TIME FROZEN' : isTimeUp ? 'TIME UP' : `${remainingSec}s`}
              </div>
              {isQuestionLocked && (
                <div className="text-xs font-mono text-amber-300 mt-1 font-bold">
                  ⏸ FROZEN AT {remainingSec}s
                </div>
              )}
            </div>

            {/* FIRST CORRECT ALERT BANNER FOR ADMIN 2 */}
            {isQuestionLocked && (
              <div className="p-4 rounded-xl bg-amber-950/70 border border-amber-400/80 mb-4 shadow-lg shadow-amber-500/20 text-center animate-pulse">
                <div className="inline-flex items-center space-x-1.5 text-xs font-mono text-amber-300 font-bold uppercase tracking-wider mb-1">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span>QUESTION LOCKED</span>
                </div>
                <div className="text-base font-display font-extrabold text-white">
                  FIRST CORRECT: <span className="text-amber-300">{eventState.firstCorrectTeamName || 'TEAM'}</span>
                </div>
                <div className="text-xs font-mono text-amber-200/80 mt-1">
                  TIME FROZEN • SUBMISSIONS CLOSED
                </div>
                <div className="mt-3">
                  <button
                    onClick={() => handleAction('NEXT_QUESTION')}
                    className="w-full py-2.5 px-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-display font-bold text-xs tracking-wider transition shadow flex items-center justify-center space-x-1"
                  >
                    <span>NEXT QUESTION</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Active Question Preview */}
            {eventState.question ? (
              <div className="p-4 rounded-xl bg-[#080d19] border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-cyan-300 font-bold">
                    Q #{eventState.question.question_number}
                  </span>
                  <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-500/40">
                    CORRECT: {eventState.question.correct_option}
                  </span>
                </div>

                <p className="text-xs text-slate-200 font-medium line-clamp-3">
                  {eventState.question.question_text}
                </p>

                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                  <div className={`p-1.5 rounded border ${eventState.question.correct_option === 'A' ? 'border-emerald-500 text-emerald-300 bg-emerald-950/40' : 'border-slate-800 text-slate-400'}`}>
                    A: {eventState.question.option_a}
                  </div>
                  <div className={`p-1.5 rounded border ${eventState.question.correct_option === 'B' ? 'border-emerald-500 text-emerald-300 bg-emerald-950/40' : 'border-slate-800 text-slate-400'}`}>
                    B: {eventState.question.option_b}
                  </div>
                  <div className={`p-1.5 rounded border ${eventState.question.correct_option === 'C' ? 'border-emerald-500 text-emerald-300 bg-emerald-950/40' : 'border-slate-800 text-slate-400'}`}>
                    C: {eventState.question.option_c}
                  </div>
                  <div className={`p-1.5 rounded border ${eventState.question.correct_option === 'D' ? 'border-emerald-500 text-emerald-300 bg-emerald-950/40' : 'border-slate-800 text-slate-400'}`}>
                    D: {eventState.question.option_d}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 rounded-xl bg-[#080d19] border border-slate-800 text-center text-xs font-mono text-slate-500">
                No active question selected
              </div>
            )}
          </div>

          {/* Quick Stats */}
          {adminStats && (
            <div className="pt-4 border-t border-slate-800 grid grid-cols-2 gap-3 text-center">
              <div className="p-2.5 rounded-xl bg-black/40 border border-slate-800">
                <div className="text-base font-bold text-cyan-400 font-mono">{adminStats.answeredCount}</div>
                <div className="text-[10px] font-mono text-slate-400">ANSWERED</div>
              </div>
              <div className="p-2.5 rounded-xl bg-black/40 border border-slate-800">
                <div className="text-base font-bold text-emerald-400 font-mono">{adminStats.connectedCount}</div>
                <div className="text-[10px] font-mono text-slate-400">CONNECTED</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
