import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api';
import { io } from 'socket.io-client';
import { 
  Trophy, Clock, Users, ArrowLeft, Maximize, Minimize, 
  Shield, CheckCircle, XCircle, Lock, AlertCircle, 
  HelpCircle, ChevronRight, Activity, Zap, Award, RefreshCw
} from 'lucide-react';
import ThemeToggle from '../common/ThemeToggle';

export default function LiveMonitor({ initialRoundId = null, onNavigate }) {
  const [rounds, setRounds] = useState([]);
  const [activeStageId, setActiveStageId] = useState(null);
  const [selectedRoundId, setSelectedRoundId] = useState(initialRoundId);
  const [roundDetails, setRoundDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  // Real-time live state via Socket.io
  const [liveEventState, setLiveEventState] = useState(null);
  const [remainingSec, setRemainingSec] = useState(0);
  const socketRef = useRef(null);

  // Sync selectedRoundId with initialRoundId when prop changes
  useEffect(() => {
    if (initialRoundId) {
      setSelectedRoundId(Number(initialRoundId));
    }
  }, [initialRoundId]);

  // Connect to Socket.IO as read-only role 'live'
  useEffect(() => {
    const rawSocketUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SOCKET_URL) || '';
    const socketUrl = rawSocketUrl ? rawSocketUrl.replace(/\/$/, '') : (typeof window !== 'undefined' ? window.location.origin : '');
    const socket = io(socketUrl, {
      auth: { role: 'live' },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 20,
      reconnectionDelay: 1000
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      // Fetch initial live state
      socket.emit('live:getState', (res) => {
        if (res && res.success && res.state) {
          setLiveEventState(res.state);
          if (res.state.remainingSec !== undefined) {
            setRemainingSec(res.state.remainingSec);
          }
          if (res.state.stage?.id) {
            setActiveStageId(res.state.stage.id);
          }
        }
      });
    });

    socket.on('state:change', (newState) => {
      setLiveEventState(newState);
      if (newState.stage?.id) {
        setActiveStageId(newState.stage.id);
      }
    });

    socket.on('timer:tick', (data) => {
      setRemainingSec(data.remainingSec);
    });

    socket.on('timer:frozen', (data) => {
      setRemainingSec(data.remainingSec);
    });

    socket.on('question:locked', (data) => {
      setLiveEventState(prev => prev ? {
        ...prev,
        state: 'QUESTION_LOCKED',
        firstCorrectTeamId: data.firstCorrectTeamId || data.winnerTeamId,
        firstCorrectTeamName: data.firstCorrectTeamName || data.winnerTeamName,
        questionLockedAt: data.lockedAt || data.serverTime
      } : null);
      if (data.remainingSec !== undefined) {
        setRemainingSec(data.remainingSec);
      }
    });

    socket.on('participant:first_correct', (data) => {
      setLiveEventState(prev => prev ? {
        ...prev,
        firstCorrectTeamId: data.firstCorrectTeamId || data.winnerTeamId || data.teamId,
        firstCorrectTeamName: data.firstCorrectTeamName || data.winnerTeamName || data.teamName
      } : null);
    });

    socket.on('stages:updated', () => {
      fetchOverview();
      if (selectedRoundId) {
        fetchRoundDetails(selectedRoundId);
      }
    });

    socket.on('answer:submitted', () => {
      // Refresh current round scores & answer status
      if (selectedRoundId) {
        fetchRoundDetails(selectedRoundId, false);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [selectedRoundId]);

  // Fetch overview (all rounds)
  const fetchOverview = async () => {
    try {
      const res = await api.getLiveOverview();
      if (res && res.success) {
        setRounds(res.rounds || []);
        setActiveStageId(res.activeStageId || null);
        if (res.activeEventState) {
          setLiveEventState(prev => prev || res.activeEventState);
        }
      }
    } catch (err) {
      console.error('[LIVE OVERVIEW ERROR]', err);
      setError('Unable to connect to live overview');
    } finally {
      setLoading(false);
      setLastRefreshed(new Date());
    }
  };

  // Fetch specific round details
  const fetchRoundDetails = async (roundId, showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await api.getLiveRoundDetails(roundId);
      if (res && res.success) {
        setRoundDetails(res);
      } else {
        setError(res?.message || 'Round not found');
      }
    } catch (err) {
      console.error('[LIVE ROUND DETAILS ERROR]', err);
      setError('Unable to load round details');
    } finally {
      if (showLoading) setLoading(false);
      setLastRefreshed(new Date());
    }
  };

  useEffect(() => {
    fetchOverview();
    const interval = setInterval(fetchOverview, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedRoundId) {
      fetchRoundDetails(selectedRoundId, true);
      const interval = setInterval(() => fetchRoundDetails(selectedRoundId, false), 3000);
      return () => clearInterval(interval);
    } else {
      setRoundDetails(null);
    }
  }, [selectedRoundId]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleSelectRound = (roundId) => {
    setSelectedRoundId(roundId);
    if (onNavigate) {
      onNavigate(`/live/round/${roundId}`);
    } else {
      window.history.pushState({}, '', `/live/round/${roundId}`);
    }
  };

  const handleBackToOverview = () => {
    setSelectedRoundId(null);
    if (onNavigate) {
      onNavigate('/live');
    } else {
      window.history.pushState({}, '', '/live');
    }
  };

  // Status badge styling helper
  const getStatusBadge = (status) => {
    switch (status) {
      case 'LIVE':
      case 'QUESTION_ACTIVE':
        return { label: '🔴 LIVE NOW', bg: 'bg-red-500/20 text-red-400 border-red-500/50 animate-pulse' };
      case 'QUESTION_LOCKED':
        return { label: '🔒 LOCKED', bg: 'bg-amber-500/20 text-amber-300 border-amber-500/50' };
      case 'COMPLETED':
        return { label: '⚪ COMPLETED', bg: 'bg-slate-800 text-slate-300 border-slate-700' };
      case 'UPCOMING':
        return { label: '🟡 UPCOMING', bg: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' };
      case 'PAUSED':
        return { label: '⏸ PAUSED', bg: 'bg-amber-500/20 text-amber-300 border-amber-500/40' };
      case 'NOT STARTED':
      default:
        return { label: 'NOT STARTED', bg: 'bg-slate-900 text-slate-400 border-slate-800' };
    }
  };

  // Team live status badge styling helper
  const getTeamStatusBadge = (status) => {
    switch (status) {
      case 'FIRST_CORRECT':
        return { label: '🏆 FIRST CORRECT', cls: 'bg-amber-500/20 text-amber-300 border-amber-400/70 font-bold shadow-sm shadow-amber-500/20' };
      case 'ANSWERED':
        return { label: '🔵 ANSWERED', cls: 'bg-blue-500/20 text-blue-300 border-blue-500/50' };
      case 'INCORRECT':
        return { label: '❌ INCORRECT', cls: 'bg-red-500/20 text-red-400 border-red-500/50' };
      case 'ACTIVE':
        return { label: '🟢 ACTIVE', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50' };
      case 'WAITING':
        return { label: '🟡 WAITING', cls: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' };
      case 'LOCKED':
        return { label: '🔒 LOCKED', cls: 'bg-slate-800 text-slate-300 border-slate-700' };
      case 'QUALIFIED':
        return { label: '🟠 QUALIFIED', cls: 'bg-orange-500/20 text-orange-300 border-orange-500/50 font-bold' };
      case 'ELIMINATED':
        return { label: '🔴 ELIMINATED', cls: 'bg-red-950/80 text-red-400 border-red-500/60' };
      case 'COMPLETED':
        return { label: '⚪ COMPLETED', cls: 'bg-slate-900 text-slate-400 border-slate-800' };
      default:
        return { label: status || '—', cls: 'bg-slate-900 text-slate-400 border-slate-800' };
    }
  };

  // Check if active round is currently selected
  const isSelectedRoundActive = selectedRoundId && activeStageId && Number(selectedRoundId) === Number(activeStageId);

  // Active question state
  const isQuestionActive = isSelectedRoundActive && liveEventState?.state === 'QUESTION_ACTIVE';
  const isQuestionLocked = isSelectedRoundActive && liveEventState?.state === 'QUESTION_LOCKED';
  const isTimeUp = isSelectedRoundActive && liveEventState?.state === 'TIME_UP';

  return (
    <div className="min-h-screen bg-[#070c18] text-white flex flex-col font-sans select-none">
      {/* 1. Universal Top Header */}
      <header className="sticky top-0 z-40 bg-[#0a1226]/95 backdrop-blur border-b border-cyan-500/30 px-4 md:px-8 py-3.5 flex items-center justify-between shadow-xl">
        <div className="flex items-center space-x-3">
          {selectedRoundId && (
            <button
              onClick={handleBackToOverview}
              className="mr-2 p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-400 hover:text-white transition flex items-center space-x-1"
              title="Back to all rounds"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-xs font-mono hidden sm:inline">ROUNDS</span>
            </button>
          )}

          <div className="w-10 h-10 rounded-xl bg-cyan-950/90 border border-cyan-400/80 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Activity className="w-5 h-5 text-cyan-400 animate-pulse" />
          </div>

          <div>
            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-mono tracking-widest text-cyan-400 font-bold uppercase">
                SYNEXA'26 • ECE DEPARTMENT
              </span>
              <span className="text-xs text-slate-500 hidden md:inline">• RRASE COLLEGE OF ENGG</span>
            </div>
            <h1 className="text-lg md:text-xl font-display font-extrabold text-white tracking-wider flex items-center space-x-2">
              <span>GLITCH HUNT</span>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 font-bold">
                LIVE EVENT MONITOR
              </span>
            </h1>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center space-x-3">
          <ThemeToggle />

          <button
            onClick={() => {
              fetchOverview();
              if (selectedRoundId) fetchRoundDetails(selectedRoundId, false);
            }}
            className="p-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-cyan-400 text-cyan-400 transition"
            title="Refresh Live Data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-cyan-400 text-cyan-400 transition"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* 2. Main Body Content */}
      <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
        {/* Error Notification */}
        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-red-950/80 border border-red-500/60 text-red-200 text-xs font-mono flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-white">✕</button>
          </div>
        )}

        {/* ========================================================
            VIEW MODE 1: LIVE LANDING PAGE (ROUND SELECTOR)
            ======================================================== */}
        {!selectedRoundId ? (
          <div>
            {/* Landing Hero Bar */}
            <div className="mb-8 p-6 md:p-8 rounded-3xl bg-gradient-to-r from-[#0b1736] via-[#0d1f4d] to-[#0b1736] border border-cyan-500/40 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <span className="px-3 py-1 rounded-full bg-cyan-950 border border-cyan-400 text-cyan-300 font-mono text-xs font-bold tracking-wider uppercase">
                  READ-ONLY LIVE EVENT OBSERVER
                </span>
                <h2 className="text-2xl md:text-4xl font-display font-extrabold text-white mt-2 tracking-wide">
                  ROUND-WISE EVENT MONITOR
                </h2>
                <p className="text-xs md:text-sm text-slate-300 mt-1 max-w-2xl font-sans leading-relaxed">
                  Real-time interactive monitoring of all technical symposium rounds, active questions, first-correct buzzer locks, and live participant standings.
                </p>
              </div>

              {activeStageId && (
                <div className="px-5 py-3 rounded-2xl bg-red-950/70 border border-red-500/60 shadow-lg shadow-red-500/20 text-center shrink-0">
                  <div className="text-[10px] font-mono text-red-300 uppercase tracking-widest flex items-center justify-center space-x-1 mb-1">
                    <span className="w-2 h-2 rounded-full bg-red-400 animate-ping inline-block" />
                    <span>NOW OPERATING</span>
                  </div>
                  <div className="text-lg font-display font-bold text-white">
                    {rounds.find(r => r.id === activeStageId)?.title || `STAGE ${activeStageId}`}
                  </div>
                </div>
              )}
            </div>

            {/* Rounds Grid */}
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-mono text-cyan-400 font-bold uppercase tracking-wider">
                AVAILABLE COMPETITION ROUNDS ({rounds.length} TOTAL)
              </h3>
              <span className="text-xs font-mono text-slate-500">
                LAST SYNCED: {lastRefreshed.toLocaleTimeString()}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5">
              {rounds.map((rnd) => {
                const isLiveNow = rnd.isLiveNow;
                const statusBadge = getStatusBadge(rnd.liveStatus);

                return (
                  <div
                    key={rnd.id}
                    onClick={() => handleSelectRound(rnd.id)}
                    className={`rounded-2xl p-5 border transition-all duration-300 cursor-pointer flex flex-col justify-between group ${
                      isLiveNow
                        ? 'bg-gradient-to-b from-[#180f2b] to-[#0d1633] border-red-500/70 shadow-xl shadow-red-500/20 ring-2 ring-red-500/40 hover:scale-[1.02]'
                        : 'bg-[#0d1633] border-slate-800 hover:border-cyan-500/50 hover:bg-[#101c3d]'
                    }`}
                  >
                    <div>
                      {/* Top Header of Card */}
                      <div className="flex items-center justify-between mb-3">
                        <span className="px-2.5 py-0.5 rounded-lg bg-black/40 border border-slate-700 text-xs font-mono text-cyan-300 font-bold">
                          STAGE {rnd.stage_number}
                        </span>

                        <span className={`text-[11px] font-mono px-2.5 py-0.5 rounded-full border font-bold ${statusBadge.bg}`}>
                          {statusBadge.label}
                        </span>
                      </div>

                      {/* Title & Subtitle */}
                      <h4 className="text-lg font-display font-bold text-white group-hover:text-cyan-300 transition">
                        {rnd.title}
                      </h4>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                        {rnd.subtitle || 'ECE Technical Challenge Stage'}
                      </p>

                      {/* Stat Metrics */}
                      <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-center text-xs font-mono">
                        <div className="p-2 rounded-xl bg-black/30 border border-slate-800">
                          <div className="text-slate-400 text-[10px]">QUESTIONS</div>
                          <div className="font-bold text-cyan-400 mt-0.5">{rnd.questionCount || 0}</div>
                        </div>
                        <div className="p-2 rounded-xl bg-black/30 border border-slate-800">
                          <div className="text-slate-400 text-[10px]">PARTICIPANTS</div>
                          <div className="font-bold text-emerald-400 mt-0.5">{rnd.participantCount || 0}</div>
                        </div>
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="mt-4 pt-2">
                      <button
                        type="button"
                        className={`w-full py-2.5 px-4 rounded-xl font-display font-bold text-xs tracking-wider flex items-center justify-center space-x-1.5 transition ${
                          isLiveNow
                            ? 'bg-red-500 hover:bg-red-400 text-white shadow-lg shadow-red-500/30'
                            : 'bg-cyan-500/10 hover:bg-cyan-500 text-cyan-300 hover:text-black border border-cyan-500/30'
                        }`}
                      >
                        <span>VIEW LIVE DASHBOARD</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* ========================================================
             VIEW MODE 2: ROUND LIVE DASHBOARD (/live/round/:id)
             ======================================================== */
          <div className="space-y-6">
            {/* Round Header Bar */}
            <div className="p-6 md:p-8 rounded-3xl bg-[#0d1633] border border-cyan-500/40 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center space-x-2 mb-2">
                  <span className="px-2.5 py-0.5 rounded-lg bg-cyan-950 border border-cyan-400 text-cyan-300 font-mono text-xs font-bold">
                    STAGE {roundDetails?.round?.stage_number || selectedRoundId}
                  </span>
                  {isSelectedRoundActive ? (
                    <span className="px-3 py-0.5 rounded-full bg-red-500/20 border border-red-500 text-red-400 font-mono text-xs font-bold flex items-center space-x-1 animate-pulse">
                      <span className="w-2 h-2 rounded-full bg-red-400" />
                      <span>LIVE NOW</span>
                    </span>
                  ) : (
                    <span className="px-3 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-mono text-xs">
                      {roundDetails?.round?.liveStatus || 'MONITORING'}
                    </span>
                  )}
                </div>

                <h2 className="text-2xl md:text-3xl font-display font-black text-white tracking-wide">
                  {roundDetails?.round?.title || 'Technical Round'}
                </h2>
                <p className="text-xs md:text-sm text-slate-300 mt-1">
                  {roundDetails?.round?.subtitle || 'ECE Technical Challenge Stage'}
                </p>
              </div>

              {/* Top Score & Current Leader Spotlight */}
              {roundDetails?.leaderboard?.highestScore !== undefined && (
                <div className="flex items-center space-x-3 p-4 rounded-2xl bg-[#091024] border border-amber-500/40 shadow-lg shrink-0">
                  <div className="w-12 h-12 rounded-xl bg-amber-950/90 border border-amber-400 flex items-center justify-center">
                    <Trophy className="w-6 h-6 text-amber-400" />
                  </div>
                  <div>
                    <div className="text-[10px] font-mono text-amber-300 uppercase tracking-widest font-bold">
                      CURRENT STAGE LEADER
                    </div>
                    <div className="text-base font-display font-extrabold text-white">
                      {roundDetails.leaderboard.leaderTeamName || 'No submissions yet'}
                    </div>
                    <div className="text-xs font-mono text-amber-400 font-bold">
                      HIGHEST SCORE: {roundDetails.leaderboard.highestScore} PTS
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Metric Stat Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
              <div className="p-4 rounded-2xl bg-[#0d1633] border border-slate-800 text-center">
                <div className="text-[11px] font-mono text-slate-400 uppercase">TEAMS</div>
                <div className="text-2xl font-display font-bold text-cyan-400 mt-1">
                  {roundDetails?.stats?.participatingTeams || 0}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#0d1633] border border-slate-800 text-center">
                <div className="text-[11px] font-mono text-slate-400 uppercase">QUESTIONS</div>
                <div className="text-2xl font-display font-bold text-white mt-1">
                  {roundDetails?.stats?.totalQuestions || 0}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#0d1633] border border-slate-800 text-center">
                <div className="text-[11px] font-mono text-slate-400 uppercase">COMPLETED</div>
                <div className="text-2xl font-display font-bold text-emerald-400 mt-1">
                  {roundDetails?.stats?.completedQuestions || 0}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#0d1633] border border-slate-800 text-center">
                <div className="text-[11px] font-mono text-slate-400 uppercase">CURRENT Q</div>
                <div className="text-2xl font-display font-bold text-amber-300 mt-1">
                  {isSelectedRoundActive && liveEventState?.question ? `#${liveEventState.question.question_number || liveEventState.question.questionNumber}` : '—'}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#0d1633] border border-slate-800 text-center">
                <div className="text-[11px] font-mono text-slate-400 uppercase">ROUND STATUS</div>
                <div className="text-sm font-mono font-bold text-cyan-300 mt-2 truncate">
                  {isSelectedRoundActive ? (liveEventState?.state || 'ACTIVE') : (roundDetails?.round?.liveStatus || 'STANDBY')}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#0d1633] border border-slate-800 text-center">
                <div className="text-[11px] font-mono text-slate-400 uppercase">ANSWERS IN</div>
                <div className="text-2xl font-display font-bold text-purple-400 mt-1">
                  {roundDetails?.stats?.totalAnswers || 0}
                </div>
              </div>
            </div>

            {/* Active Question Monitoring HUD (When question is active or locked) */}
            {isSelectedRoundActive && liveEventState?.question && (
              <div className="p-6 md:p-8 rounded-3xl bg-[#0b142d] border-2 border-cyan-500/50 shadow-2xl">
                {/* Lock banner if first correct answer received */}
                {isQuestionLocked && (
                  <div className="mb-6 p-4 rounded-2xl bg-amber-950/80 border-2 border-amber-400 shadow-xl shadow-amber-500/20 text-center animate-pulse">
                    <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-900 border border-amber-400 text-amber-300 font-mono text-xs font-bold uppercase mb-2">
                      <Trophy className="w-4 h-4 text-amber-400" />
                      <span>FIRST CORRECT ANSWER ACCEPTED</span>
                    </div>
                    <div className="text-2xl sm:text-3xl font-display font-black text-amber-300">
                      🏆 {liveEventState.firstCorrectTeamName || 'WINNING TEAM'}
                    </div>
                    <div className="mt-2 text-xs font-mono text-amber-200">
                      🔒 QUESTION LOCKED • ⏸ TIME FROZEN AT {String(remainingSec).padStart(2, '0')}s
                    </div>
                  </div>
                )}

                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="px-3 py-1 rounded-xl bg-cyan-500 text-black font-display font-bold text-xs">
                        QUESTION #{liveEventState.question.question_number || liveEventState.question.questionNumber}
                      </span>
                      <span className="text-xs font-mono text-cyan-300">
                        {isQuestionLocked ? '🔒 LOCKED ON SERVER' : isTimeUp ? '❌ TIME EXPIRED' : '🔴 ACCEPTING SUBMISSIONS'}
                      </span>
                    </div>

                    {/* Anti-cheat safe question display */}
                    <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
                      {liveEventState.question.question_text ? (
                        <p className="text-base sm:text-lg font-display font-bold text-white">
                          {liveEventState.question.question_text}
                        </p>
                      ) : (
                        <div className="flex items-center space-x-2 text-xs font-mono text-slate-400">
                          <Lock className="w-4 h-4 text-cyan-400 shrink-0" />
                          <span>Question text protected on live monitor. Read from auditorium projector screen.</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Countdown Timer Display */}
                  <div className="shrink-0 flex flex-col items-center">
                    <div className={`w-28 h-28 rounded-2xl flex flex-col items-center justify-center border-2 ${
                      isQuestionLocked 
                        ? 'border-amber-400 bg-amber-950/70 text-amber-300' 
                        : isTimeUp 
                        ? 'border-red-500 bg-red-950/70 text-red-400' 
                        : 'border-cyan-400 bg-cyan-950/70 text-cyan-300'
                    }`}>
                      <span className="text-3xl font-display font-black leading-none">
                        {isQuestionLocked ? 'LOCKED' : isTimeUp ? 'TIME UP' : `${String(remainingSec).padStart(2, '0')}s`}
                      </span>
                      <span className="text-[10px] font-mono uppercase tracking-widest mt-1">
                        {isQuestionLocked ? `${remainingSec}s FROZEN` : 'REMAINING'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Participating Teams Ranked Table */}
            <div className="bg-[#0d1633] border border-slate-800 rounded-3xl p-5 md:p-6 shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-display font-bold text-white flex items-center space-x-2">
                    <Users className="w-5 h-5 text-cyan-400" />
                    <span>PARTICIPATING TEAMS & LIVE STANDINGS</span>
                  </h3>
                  <p className="text-xs font-mono text-slate-400 mt-0.5">
                    Authoritative server score calculations & real-time question statuses
                  </p>
                </div>

                <span className="text-xs font-mono px-3 py-1 rounded-full bg-slate-900 border border-slate-700 text-cyan-300">
                  {roundDetails?.teams?.length || 0} TEAMS
                </span>
              </div>

              {/* Table Container */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                      <th className="py-3 px-3">RANK</th>
                      <th className="py-3 px-4">TEAM NAME</th>
                      <th className="py-3 px-4">COLLEGE</th>
                      <th className="py-3 px-3 text-center">SCORE</th>
                      <th className="py-3 px-3 text-center">CORRECT</th>
                      <th className="py-3 px-3 text-center">ATTEMPTED</th>
                      <th className="py-3 px-4 text-center">LIVE STATUS</th>
                      <th className="py-3 px-3 text-center">QUALIFICATION</th>
                      <th className="py-3 px-4 text-right">PROGRESS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans text-xs">
                    {roundDetails?.teams && roundDetails.teams.length > 0 ? (
                      roundDetails.teams.map((tm) => {
                        const statusBadge = getTeamStatusBadge(tm.liveStatus);
                        const isTop1 = tm.rank === 1;
                        const isTop3 = tm.rank <= 3;

                        return (
                          <tr 
                            key={tm.id}
                            className={`transition hover:bg-slate-800/40 ${
                              isTop1 ? 'bg-amber-950/20' : ''
                            }`}
                          >
                            {/* Rank */}
                            <td className="py-3.5 px-3 font-mono font-bold">
                              <div className="flex items-center space-x-1.5">
                                {isTop1 ? (
                                  <Trophy className="w-4 h-4 text-amber-400" />
                                ) : isTop3 ? (
                                  <Award className="w-4 h-4 text-cyan-400" />
                                ) : null}
                                <span className={isTop1 ? 'text-amber-400 font-extrabold text-sm' : isTop3 ? 'text-cyan-300' : 'text-slate-400'}>
                                  #{tm.rank}
                                </span>
                              </div>
                            </td>

                            {/* Team Name */}
                            <td className="py-3.5 px-4 font-display font-bold text-white text-sm">
                              {tm.team_name}
                            </td>

                            {/* College */}
                            <td className="py-3.5 px-4 text-slate-400 truncate max-w-[180px]">
                              {tm.college || '—'}
                            </td>

                            {/* Current Score */}
                            <td className="py-3.5 px-3 text-center font-mono font-extrabold text-cyan-300 text-sm">
                              {tm.score}
                            </td>

                            {/* Correct Answers */}
                            <td className="py-3.5 px-3 text-center font-mono text-emerald-400 font-bold">
                              {tm.correctAnswers}
                            </td>

                            {/* Attempted */}
                            <td className="py-3.5 px-3 text-center font-mono text-slate-300">
                              {tm.questionsAttempted}
                            </td>

                            {/* Live Status Badge */}
                            <td className="py-3.5 px-4 text-center">
                              <span className={`inline-block px-2.5 py-1 rounded-full border text-[11px] font-mono tracking-wider ${statusBadge.cls}`}>
                                {statusBadge.label}
                              </span>
                            </td>

                            {/* Qualification */}
                            <td className="py-3.5 px-3 text-center font-mono">
                              {tm.qualificationStatus === 'QUALIFIED' ? (
                                <span className="text-orange-400 font-bold">QUALIFIED</span>
                              ) : tm.qualificationStatus === 'ELIMINATED' ? (
                                <span className="text-rose-400 font-bold">ELIMINATED</span>
                              ) : (
                                <span className="text-slate-500">—</span>
                              )}
                            </td>

                            {/* Progress */}
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end space-x-2">
                                <div className="w-20 bg-slate-800 rounded-full h-2 overflow-hidden">
                                  <div 
                                    className="bg-cyan-400 h-full rounded-full transition-all duration-500" 
                                    style={{ width: `${tm.progress || 0}%` }}
                                  />
                                </div>
                                <span className="font-mono text-[10px] text-slate-400 w-8 text-right">
                                  {tm.progress || 0}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-500 font-mono text-xs">
                          No participating teams registered for this stage yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 3. Universal Read-Only Footer */}
      <footer className="border-t border-slate-800/80 bg-[#070b18] px-4 md:px-8 py-3 flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-500">
        <div>
          <span>GLITCH HUNT LIVE MONITOR • DEPARTMENT OF ECE</span>
        </div>
        <div className="flex items-center space-x-4">
          <span className="flex items-center space-x-1.5 text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>AUTHORITATIVE SERVER SYNC</span>
          </span>
          <span>STRICTLY READ-ONLY</span>
        </div>
      </footer>
    </div>
  );
}
