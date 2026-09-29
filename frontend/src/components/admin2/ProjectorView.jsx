import React, { useState, useEffect } from 'react';
import { useSocket } from '../../context/SocketContext';
import ProjectorBackdrop from '../3d/ProjectorBackdrop';
import { audioService } from '../../services/audioService';
import { api } from '../../services/api';
import { Volume2, VolumeX, Maximize, Minimize, Zap, Clock, Users, Trophy, Award, AlertTriangle, Medal, Lock } from 'lucide-react';
import ThemeToggle from '../common/ThemeToggle';

export default function ProjectorView() {
  const { eventState, remainingSec, adminStats } = useSocket();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState(null);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    audioService.setMuted(nextMuted);
  };

  // State categories
  const isQuestionActive = eventState.state === 'QUESTION_ACTIVE';
  const isQuestionLocked = eventState.state === 'QUESTION_LOCKED';
  const isTimeUp = eventState.state === 'TIME_UP';
  const isPaused = eventState.state === 'PAUSED';
  const isStopped = eventState.state === 'ROUND_STOPPED';
  const isRoundCompleted = eventState.state === 'ROUND_COMPLETED';
  const isResult = eventState.state === 'RESULT';
  const isResultComplete = eventState.state === 'RESULT_COMPLETE';
  const isShowingLeaderboard = isResult || isResultComplete;
  const isRules = eventState.state === 'RULES';
  const isDesc = eventState.state === 'DESCRIPTION';
  const isReady = eventState.state === 'READY';

  const isUrgent = isQuestionActive && remainingSec <= 5 && remainingSec > 0;

  // Sync or fetch authoritative leaderboard data when in result state
  useEffect(() => {
    if (isShowingLeaderboard) {
      if (eventState.leaderboard && eventState.leaderboard.results) {
        setLeaderboardData(eventState.leaderboard);
      } else {
        api.getLeaderboard(eventState.stage?.id).then(res => {
          if (res && res.success) {
            setLeaderboardData({
              results: res.results || [],
              hasTies: Boolean(res.tiedGroups && res.tiedGroups.length > 0),
              tiedGroups: res.tiedGroups || []
            });
          }
        }).catch(err => {
          console.error('[PROJECTOR LEADERBOARD FETCH ERROR]', err);
        });
      }
    }
  }, [isShowingLeaderboard, eventState.leaderboard, eventState.stage?.id]);

  const topThree = leaderboardData?.results ? leaderboardData.results.slice(0, 3) : [];
  const remainingTeams = leaderboardData?.results ? leaderboardData.results.slice(3) : [];

  return (
    <div className="relative w-screen h-screen min-h-screen bg-[#0a1128] text-white flex flex-col justify-between p-5 md:p-8 select-none overflow-hidden font-sans">
      {/* 3D Ambient Circuit Grid Backdrop */}
      <ProjectorBackdrop urgency={isUrgent || isTimeUp} isPaused={isPaused} />

      {/* 1. Projector Top Bar */}
      <header className="relative z-10 flex items-center justify-between border-b border-cyan-500/30 pb-3">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-2xl bg-cyan-950/90 border border-cyan-400/80 flex items-center justify-center shadow-lg shadow-cyan-500/30">
            <Zap className="w-7 h-7 text-cyan-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-mono tracking-widest text-cyan-400 font-bold">SYNEXA'26 • ECE TECHNICAL SYMPOSIUM</span>
              <span className="text-xs text-slate-400 font-mono">• RRASE COLLEGE OF ENGINEERING</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-display font-extrabold text-white tracking-wider flex items-center space-x-2">
              <span>GLITCH HUNT</span>
              {eventState.isTestingMode && (
                <span className="ml-2 text-xs px-2.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/50 text-amber-400 font-mono">
                  TESTING MODE
                </span>
              )}
            </h1>
          </div>
        </div>

        {/* Current Round / Stage Title */}
        <div className="text-center hidden md:block">
          <div className="text-[11px] font-mono text-cyan-300 tracking-widest uppercase">OFFICIAL STAGE</div>
          <div className="text-xl font-display font-bold text-white tracking-wide">
            {eventState.stage?.title || 'STANDBY ARENA'}
          </div>
        </div>

        {/* Telemetry & Controls */}
        <div className="flex items-center space-x-3">
          <ThemeToggle />

          {adminStats && (
            <div className="hidden lg:flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-[#0e1a38] border border-slate-700 text-xs font-mono text-slate-300">
              <Users className="w-4 h-4 text-cyan-400" />
              <span>{adminStats.connectedCount} TEAMS CONNECTED</span>
            </div>
          )}

          <button
            type="button"
            onClick={toggleMute}
            className="p-2.5 rounded-xl bg-[#0e1a38] border border-slate-700 hover:border-cyan-400 text-cyan-400 transition"
            title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2.5 rounded-xl bg-[#0e1a38] border border-slate-700 hover:border-cyan-400 text-cyan-400 transition"
            title="Toggle 16:9 Fullscreen"
          >
            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* 2. Main Stage Content Area */}
      <main className="relative z-10 flex-1 my-4 flex flex-col justify-center max-w-7xl mx-auto w-full overflow-hidden">
        {/* VIEW 1: ACTIVE QUESTION & COUNTDOWN / LOCKED */}
        {(isQuestionActive || isQuestionLocked || isTimeUp || isPaused) && eventState.question && (
          <div className="w-full flex flex-col justify-between space-y-5">
            {/* FIRST CORRECT LOCK BANNER (REAL-TIME BROADCAST) */}
            {isQuestionLocked && (
              <div className="projector-card p-6 md:p-8 rounded-3xl border-2 border-amber-400 bg-gradient-to-r from-amber-950/70 via-slate-900/90 to-amber-950/70 shadow-2xl shadow-amber-500/30 text-center animate-pulse">
                <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-amber-950 border border-amber-400 text-amber-300 font-mono text-sm font-bold tracking-widest uppercase mb-3">
                  <Trophy className="w-5 h-5 text-amber-400" />
                  <span>FIRST CORRECT ANSWER RECEIVED</span>
                </div>
                <h3 className="text-3xl sm:text-4xl md:text-5xl font-display font-black text-amber-300 tracking-wider">
                  🏆 {eventState.firstCorrectTeamName || 'WINNING TEAM'}
                </h3>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-sm md:text-base font-mono">
                  <span className="px-3 py-1 rounded-xl bg-slate-900 border border-amber-500/50 text-amber-200 flex items-center space-x-1.5">
                    <Lock className="w-4 h-4 text-amber-400" />
                    <span>QUESTION LOCKED</span>
                  </span>
                  <span className="px-3 py-1 rounded-xl bg-slate-900 border border-cyan-500/50 text-cyan-200 flex items-center space-x-1.5">
                    <Clock className="w-4 h-4 text-cyan-400" />
                    <span>TIME FROZEN AT {String(remainingSec).padStart(2, '0')}s</span>
                  </span>
                </div>
              </div>
            )}

            {/* Top Question HUD & Giant Countdown Timer */}
            <div className="flex flex-col lg:flex-row items-center justify-between gap-6 projector-card p-6 md:p-8 rounded-3xl">
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-3 mb-2">
                  <span className="px-3.5 py-1 rounded-xl bg-cyan-500 text-black font-display font-bold text-sm tracking-wider">
                    QUESTION {eventState.question.question_number || eventState.question.questionNumber || 1}
                  </span>
                  <span className="text-sm font-mono text-cyan-300">
                    TIME LIMIT: {eventState.question.time_limit_sec || eventState.question.timeLimitSec || 30}s
                  </span>
                  {isQuestionLocked && (
                    <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/20 border border-amber-400/60 text-amber-300 font-mono text-xs font-bold">
                      BUZZER LOCKED
                    </span>
                  )}
                </div>

                {/* HUGE QUESTION TEXT FOR LONG DISTANCE AUDITORIUM READABILITY */}
                <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-display font-bold text-white leading-tight tracking-wide">
                  {eventState.question.question_text || 'Active Symposium Challenge Question'}
                </h2>
              </div>

              {/* GIANT PROJECTOR COUNTDOWN TIMER RING */}
              <div className="shrink-0 flex flex-col items-center">
                <div className={`relative w-36 h-36 md:w-44 md:h-44 rounded-full flex items-center justify-center border-4 shadow-2xl transition-all ${
                  isQuestionLocked
                    ? 'border-amber-400 bg-amber-950/80 shadow-amber-500/50'
                    : isTimeUp
                    ? 'border-red-500 bg-red-950/80 shadow-red-500/50 animate-bounce'
                    : isUrgent
                    ? 'border-red-500 bg-red-950/70 shadow-red-500/50 animate-pulse'
                    : isPaused
                    ? 'border-amber-500 bg-amber-950/70 shadow-amber-500/40'
                    : 'border-cyan-400 bg-cyan-950/70 shadow-cyan-500/40'
                }`}>
                  <div className="text-center">
                    <span className={`font-mono font-black tracking-tight leading-none ${
                      isQuestionLocked
                        ? 'text-2xl md:text-3xl text-amber-300 font-display'
                        : isTimeUp 
                        ? 'text-3xl md:text-4xl text-red-400 font-display' 
                        : 'text-5xl md:text-6xl text-white'
                    }`}>
                      {isQuestionLocked ? 'LOCKED' : isTimeUp ? 'TIME UP' : String(remainingSec).padStart(2, '0')}
                    </span>
                    {!isTimeUp && (
                      <div className="text-[11px] font-mono uppercase tracking-widest mt-1 text-cyan-300">
                        {isQuestionLocked ? `${remainingSec}s FROZEN` : isPaused ? 'PAUSED' : 'SECONDS'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Answered teams telemetry */}
                {eventState.answerStats && (
                  <div className="mt-3 text-xs font-mono text-cyan-300 flex items-center space-x-1.5">
                    <Users className="w-3.5 h-3.5" />
                    <span>ANSWERS RECORDED: {eventState.answerStats.totalAnswered}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 4 HIGH-CONTRAST OPTION CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
              {[
                { letter: 'A', text: eventState.question.option_a || eventState.question.options?.A, border: 'border-cyan-500/50 hover:border-cyan-400', badge: 'bg-cyan-500 text-black', glow: 'shadow-cyan-500/20' },
                { letter: 'B', text: eventState.question.option_b || eventState.question.options?.B, border: 'border-pink-500/50 hover:border-pink-400', badge: 'bg-pink-500 text-white', glow: 'shadow-pink-500/20' },
                { letter: 'C', text: eventState.question.option_c || eventState.question.options?.C, border: 'border-emerald-500/50 hover:border-emerald-400', badge: 'bg-emerald-500 text-black', glow: 'shadow-emerald-500/20' },
                { letter: 'D', text: eventState.question.option_d || eventState.question.options?.D, border: 'border-amber-500/50 hover:border-amber-400', badge: 'bg-amber-500 text-black', glow: 'shadow-amber-500/20' }
              ].map((opt) => (
                <div
                  key={opt.letter}
                  className={`projector-card p-4 md:p-5 rounded-2xl border-2 ${opt.border} shadow-xl ${opt.glow} flex items-center space-x-4`}
                >
                  <div className={`w-12 h-12 md:w-14 md:h-14 rounded-xl flex items-center justify-center font-display font-extrabold text-2xl md:text-3xl shrink-0 ${opt.badge}`}>
                    {opt.letter}
                  </div>
                  <div className="text-xl md:text-2xl font-display font-semibold text-white tracking-wide truncate">
                    {opt.text || `Option ${opt.letter}`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 2: ROUND DESCRIPTION */}
        {isDesc && (
          <div className="projector-card p-8 md:p-12 rounded-3xl text-center max-w-4xl mx-auto">
            <span className="px-4 py-1.5 rounded-full bg-cyan-950 border border-cyan-400 text-cyan-300 font-mono text-sm tracking-widest uppercase">
              STAGE BRIEFING
            </span>
            <h2 className="text-4xl md:text-6xl font-display font-bold text-white mt-6 tracking-wide">
              {eventState.stage?.title || 'TECHNICAL ROUND'}
            </h2>
            <p className="text-xl font-mono text-cyan-400 mt-2">
              {eventState.stage?.subtitle || 'ECE Technical Challenge'}
            </p>
            <div className="mt-8 p-6 rounded-2xl bg-black/40 border border-slate-800 text-lg md:text-xl text-slate-200 leading-relaxed font-sans">
              {eventState.stage?.description || 'Prepare your devices and align your team.'}
            </div>
          </div>
        )}

        {/* VIEW 3: ROUND RULES */}
        {isRules && (
          <div className="projector-card p-8 md:p-12 rounded-3xl max-w-4xl mx-auto w-full">
            <div className="text-center mb-8">
              <span className="px-4 py-1.5 rounded-full bg-amber-950/70 border border-amber-400 text-amber-300 font-mono text-sm tracking-widest uppercase">
                RULES & PROTOCOLS
              </span>
              <h2 className="text-3xl md:text-5xl font-display font-bold text-white mt-4">
                {eventState.stage?.title} RULES
              </h2>
            </div>

            <div className="space-y-4">
              {Array.isArray(eventState.stage?.rules) && eventState.stage.rules.map((rule, idx) => (
                <div key={idx} className="flex items-start space-x-4 p-4 rounded-xl bg-black/40 border border-slate-800">
                  <span className="w-8 h-8 rounded-lg bg-cyan-500 text-black font-display font-bold text-lg flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <span className="text-lg md:text-xl text-slate-200 font-medium">
                    {rule}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 4: GET READY */}
        {isReady && (
          <div className="projector-card p-12 rounded-3xl text-center max-w-3xl mx-auto animate-pulse">
            <div className="w-24 h-24 rounded-3xl bg-cyan-950 border-2 border-cyan-400 flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-cyan-500/40">
              <Zap className="w-14 h-14 text-cyan-400" />
            </div>
            <h2 className="text-5xl md:text-7xl font-display font-extrabold text-cyan-300 tracking-wider">
              GET READY
            </h2>
            <p className="text-xl font-mono text-slate-300 mt-4">
              QUESTION WILL APPEAR ON THIS SCREEN IN A MOMENT
            </p>
            <p className="text-sm font-mono text-cyan-400 mt-2">
              Select Option A, B, C, or D on your mobile device.
            </p>
          </div>
        )}

        {/* VIEW 5: ROUND STOPPED */}
        {isStopped && (
          <div className="projector-card p-12 md:p-16 rounded-3xl text-center max-w-4xl mx-auto border-2 border-red-500/80 bg-red-950/40 shadow-2xl shadow-red-500/30">
            <div className="w-24 h-24 rounded-3xl bg-red-950 border-2 border-red-500 flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-red-500/40 animate-pulse">
              <AlertTriangle className="w-14 h-14 text-red-400" />
            </div>
            <div className="inline-block px-4 py-1.5 rounded-full bg-red-900/60 border border-red-500/60 text-red-300 font-mono text-xs tracking-widest uppercase mb-4">
              OPERATOR OVERRIDE
            </div>
            <h2 className="text-4xl md:text-6xl font-display font-extrabold text-white tracking-wider">
              ROUND STOPPED
            </h2>
            <p className="text-xl md:text-2xl font-display font-bold text-red-400 mt-4 tracking-wide">
              WAITING FOR OPERATOR
            </p>
            <p className="text-sm font-mono text-slate-300 mt-2">
              All participant answers and live scores have been preserved safely.
            </p>
          </div>
        )}

        {/* VIEW 6: ROUND COMPLETED */}
        {isRoundCompleted && (
          <div className="projector-card p-12 md:p-16 rounded-3xl text-center max-w-4xl mx-auto border-2 border-cyan-500/60 bg-cyan-950/30 shadow-2xl shadow-cyan-500/20">
            <div className="w-24 h-24 rounded-3xl bg-cyan-950 border-2 border-cyan-400 flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-cyan-500/40">
              <Trophy className="w-14 h-14 text-cyan-400" />
            </div>
            <div className="inline-block px-4 py-1.5 rounded-full bg-cyan-900/60 border border-cyan-400/60 text-cyan-300 font-mono text-xs tracking-widest uppercase mb-4">
              STAGE CONCLUDED
            </div>
            <h2 className="text-4xl md:text-6xl font-display font-extrabold text-white tracking-wider">
              ROUND COMPLETED
            </h2>
            <p className="text-xl md:text-2xl font-display font-bold text-cyan-300 mt-4 tracking-wide">
              RESULTS READY
            </p>
            <p className="text-sm font-mono text-slate-400 mt-2">
              Operator will broadcast official round evaluations shortly.
            </p>
          </div>
        )}

        {/* VIEW 7: COMPLETE ROUND RESULTS & LEADERBOARD (ANIMATED 16:9) */}
        {isShowingLeaderboard && (
          <div className="projector-card p-6 md:p-8 rounded-3xl max-w-6xl mx-auto w-full flex flex-col justify-between max-h-[82vh] overflow-hidden">
            {/* Header Banner & Live Countdown / Status */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-3 mb-4">
              <div className="flex items-center space-x-3">
                <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-amber-950/80 border border-amber-400/60 text-amber-300 text-xs font-mono font-bold tracking-widest uppercase">
                  <Trophy className="w-3.5 h-3.5 text-amber-400" />
                  <span>OFFICIAL ROUND EVALUATION</span>
                </div>
                {isResult && (
                  <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-950/90 border border-cyan-400/70 text-cyan-300 text-xs font-mono font-bold animate-pulse">
                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                    <span>CLOSING IN: {remainingSec}s</span>
                  </div>
                )}
                {isResultComplete && (
                  <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-950/90 border border-emerald-400/70 text-emerald-300 text-xs font-mono font-bold">
                    <span>RESULT DISPLAY COMPLETE — WAITING FOR OPERATOR</span>
                  </div>
                )}
              </div>
              <h2 className="text-2xl md:text-3xl font-display font-extrabold text-white tracking-wider">
                {eventState.stage?.title ? `${eventState.stage.title} LEADERBOARD` : 'ROUND RESULTS'}
              </h2>
            </div>

            {/* Tie-Break Notification Banner */}
            {leaderboardData?.hasTies && (
              <div className="mb-4 p-3 rounded-2xl bg-amber-950/90 border-2 border-amber-500 text-center shadow-lg shadow-amber-500/20 animate-pulse">
                <div className="flex items-center justify-center space-x-2 text-amber-300 font-display font-bold text-base md:text-lg">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                  <span>TIE DETECTED — {leaderboardData.tiedGroups?.length || 1} TIE GROUP(S) IDENTIFIED FOR TIE BREAK STAGE</span>
                </div>
              </div>
            )}

            {/* Podium for Top 3 */}
            {topThree.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                {topThree.map((t, idx) => {
                  const rankStyles = [
                    { border: 'border-amber-400 bg-gradient-to-b from-amber-950/80 to-[#0e1a38]', badge: 'bg-amber-400 text-black', title: '1ST PLACE', medal: 'text-amber-400' },
                    { border: 'border-slate-300 bg-gradient-to-b from-slate-900/80 to-[#0e1a38]', badge: 'bg-slate-300 text-black', title: '2ND PLACE', medal: 'text-slate-300' },
                    { border: 'border-amber-700 bg-gradient-to-b from-amber-950/40 to-[#0e1a38]', badge: 'bg-amber-700 text-white', title: '3RD PLACE', medal: 'text-amber-600' }
                  ][idx] || { border: 'border-slate-700', badge: 'bg-slate-700 text-white', title: `RANK ${idx + 1}`, medal: 'text-slate-400' };

                  return (
                    <div
                      key={t.teamId}
                      className={`p-4 rounded-2xl border-2 ${rankStyles.border} text-center flex flex-col justify-between shadow-xl`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className={`px-2.5 py-0.5 rounded-lg font-display font-extrabold text-xs ${rankStyles.badge}`}>
                          {rankStyles.title}
                        </span>
                        {t.isTied && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            TIED
                          </span>
                        )}
                      </div>

                      <div className="my-2">
                        <h3 className="text-xl md:text-2xl font-display font-bold text-white truncate">
                          {t.teamName}
                        </h3>
                        <p className="text-xs font-mono text-slate-300 truncate mt-0.5">
                          {t.collegeName}
                        </p>
                      </div>

                      <div className="mt-2 pt-2 border-t border-slate-700/60 flex items-center justify-between font-mono text-xs">
                        <span className="text-slate-400">SCORE:</span>
                        <span className="text-xl font-bold text-cyan-300">{t.score} PTS</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Full Ranked Table */}
            <div className="flex-1 overflow-y-auto rounded-2xl bg-[#080d19]/80 border border-slate-800 p-2">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-cyan-400 font-bold uppercase tracking-wider">
                    <th className="py-2.5 px-3">RANK</th>
                    <th className="py-2.5 px-3">TEAM NAME</th>
                    <th className="py-2.5 px-3">COLLEGE / INSTITUTION</th>
                    <th className="py-2.5 px-3 text-center">CORRECT</th>
                    <th className="py-2.5 px-3 text-right">SCORE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {leaderboardData?.results && leaderboardData.results.length > 0 ? (
                    leaderboardData.results.map((r, i) => (
                      <tr 
                        key={r.teamId}
                        className={`hover:bg-cyan-950/30 transition-colors leaderboard-row ${r.isTied ? 'bg-amber-950/20' : ''}`}
                        style={{ animationDelay: `${i * 30}ms` }}
                      >
                        <td className="py-2 px-3 font-bold text-sm">
                          <span className={`inline-block w-6 text-center ${r.rank === 1 ? 'text-amber-400' : r.rank === 2 ? 'text-slate-300' : r.rank === 3 ? 'text-amber-600' : 'text-slate-400'}`}>
                            #{r.rank}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-display font-bold text-white text-sm">
                          {r.teamName}
                          {r.isTied && (
                            <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              TIED
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-slate-300 truncate max-w-[200px]">
                          {r.collegeName}
                        </td>
                        <td className="py-2 px-3 text-center text-slate-300">
                          {r.correctCount || 0}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-cyan-300 text-sm">
                          {r.score}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400">
                        Evaluating official database answers...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* VIEW 8: IDLE / STANDBY */}
        {!isQuestionActive && !isTimeUp && !isPaused && !isDesc && !isRules && !isReady && !isShowingLeaderboard && !isStopped && !isRoundCompleted && (
          <div className="projector-card p-12 md:p-16 rounded-3xl text-center max-w-4xl mx-auto">
            <div className="w-24 h-24 rounded-3xl bg-cyan-950 border-2 border-cyan-400/80 flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-cyan-500/30">
              <Zap className="w-14 h-14 text-cyan-400 animate-pulse" />
            </div>
            <h2 className="text-5xl md:text-7xl font-display font-extrabold text-white tracking-wider">
              GLITCH HUNT
            </h2>
            <p className="text-xl md:text-2xl font-display font-bold text-cyan-400 mt-3 tracking-widest uppercase">
              DEPARTMENT OF ELECTRONICS & COMMUNICATION ENGINEERING
            </p>
            <p className="text-base font-mono text-slate-400 mt-2">
              RRASE COLLEGE OF ENGINEERING • SYNEXA'26
            </p>

            <div className="mt-10 inline-flex items-center space-x-3 px-6 py-3 rounded-2xl bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 font-mono text-sm">
              <div className="w-3 h-3 rounded-full bg-cyan-400 animate-ping" />
              <span>ARENA INITIALIZED • WAITING FOR OPERATOR START</span>
            </div>
          </div>
        )}
      </main>

      {/* 3. Projector Footer */}
      <footer className="relative z-10 flex items-center justify-between border-t border-slate-800/80 pt-3 text-xs font-mono text-slate-400">
        <div className="flex items-center space-x-3">
          <span className="text-cyan-400">SERVER-AUTHORITATIVE TIMER ACTIVE</span>
          <span>•</span>
          <span>16:9 HIGH-CONTRAST PROJECTOR OPTIMIZED</span>
        </div>
        <div>
          <span>PARTICIPANTS READ QUESTIONS ON PROJECTOR ONLY</span>
        </div>
      </footer>
    </div>
  );
}
