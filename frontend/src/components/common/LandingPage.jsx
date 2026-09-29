import React, { useState, useEffect } from 'react';
import LaunchVideoIntro from './LaunchVideoIntro';
import ThemeToggle from './ThemeToggle';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { 
  Zap, Monitor, Users, Shield, Award, ChevronRight, 
  Layers, Lock, Play, Cpu, Radio, Sparkles, Activity 
} from 'lucide-react';

export default function LandingPage({ onNavigate }) {
  const { loginAdmin } = useAuth();
  
  // Official Startup Flow: Launch Video plays first on fresh landing
  const [showLaunchVideo, setShowLaunchVideo] = useState(true);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminUsername, setAdminUsername] = useState('admin1');
  const [adminPassword, setAdminPassword] = useState('admin123');
  const [adminError, setAdminError] = useState('');
  const [settings, setSettings] = useState({
    college: 'RRASE COLLEGE OF ENGINEERING',
    department: 'Department of ECE',
    event_name: 'GLITCH HUNT'
  });

  useEffect(() => {
    api.getSettings().then(res => {
      if (res.success && res.settings) setSettings(res.settings);
    }).catch(() => {});
  }, []);

  const handleAdminSubmit = async (e) => {
    e.preventDefault();
    setAdminError('');
    try {
      const res = await loginAdmin(adminUsername, adminPassword);
      if (res.success) {
        if (res.user.role === 'admin_1') {
          onNavigate('/admin');
        } else {
          onNavigate('/controller');
        }
      } else {
        setAdminError(res.message || 'Login failed');
      }
    } catch (err) {
      setAdminError(err.message || 'Network error');
    }
  };

  // STEP 1: Launch Video Intro (plays exactly once on site launch)
  if (showLaunchVideo) {
    return (
      <LaunchVideoIntro onComplete={() => setShowLaunchVideo(false)} />
    );
  }

  // STEP 2: Official Role-Selection Interface (revealed immediately after video)
  return (
    <div className="min-h-screen bg-[#0a1128] text-white flex flex-col justify-between cyber-grid overflow-x-hidden font-sans transition-colors duration-300">
      {/* 1. Official Header */}
      <header className="px-4 sm:px-6 py-4 border-b border-cyan-500/20 bg-[#0e1a38]/80 backdrop-blur-md flex flex-wrap items-center justify-between gap-4 z-20 sticky top-0 shadow-lg">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-950/90 border border-cyan-400/80 flex items-center justify-center shadow-lg shadow-cyan-500/20 shrink-0">
            <Zap className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <span className="text-xs font-mono text-cyan-400 font-bold tracking-wider block">SYNEXA'26 • ECE TECHNICAL SYMPOSIUM</span>
            <div className="text-sm font-display font-bold text-white tracking-wide">RRASE COLLEGE OF ENGINEERING</div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* Day / Night Mode Toggle */}
          <ThemeToggle />

          <button
            type="button"
            onClick={() => onNavigate('/user')}
            className="px-4 py-2 rounded-xl bg-cyan-500 text-black font-display font-bold text-sm hover:bg-cyan-400 active:scale-95 transition shadow-md shadow-cyan-500/20"
          >
            TEAM LOGIN
          </button>
          <button
            type="button"
            onClick={() => setShowAdminLogin(true)}
            className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-500 text-xs font-mono text-slate-300 active:scale-95 transition"
          >
            ORGANIZER LOGIN
          </button>
        </div>
      </header>

      {/* 2. Main Role Selection Interface */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 md:p-10 flex flex-col justify-center animate-fadeIn">
        <div className="space-y-10 py-6">
          {/* Institution & Event Title Reveal */}
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-cyan-950 border border-cyan-400 text-cyan-300 font-mono text-xs tracking-widest mb-4 shadow-md shadow-cyan-500/20">
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              <span>REAL-TIME MULTI-DEVICE ARENA READY</span>
            </div>

            <h1 className="glitch-text text-6xl sm:text-7xl md:text-8xl font-display font-black text-white tracking-widest leading-none">
              GLITCH HUNT
            </h1>

            <p className="text-lg md:text-xl font-display font-bold text-cyan-400 mt-4 uppercase tracking-widest">
              DEPARTMENT OF ELECTRONICS & COMMUNICATION ENGINEERING
            </p>
            <p className="text-sm font-mono text-slate-400 mt-1">
              {settings.college}
            </p>
          </div>

          {/* Event Role Portals Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {/* Card 1: Participant Teams */}
            <div className="p-6 rounded-2xl bg-[#0d1527] border border-cyan-500/40 hover:border-cyan-400 transition-all duration-300 shadow-xl flex flex-col justify-between group">
              <div>
                <div className="w-12 h-12 rounded-xl bg-cyan-950 border border-cyan-400 flex items-center justify-center mb-4 shadow-md shadow-cyan-500/20 group-hover:scale-105 transition-transform">
                  <Users className="w-6 h-6 text-cyan-400" />
                </div>
                <h3 className="text-xl font-display font-bold text-white">PARTICIPANT MOBILE</h3>
                <p className="text-xs font-mono text-cyan-300 mt-1 font-bold">ANSWER OPTIONS ONLY</p>
                <p className="text-xs text-slate-400 mt-3 font-sans leading-relaxed">
                  Read questions on the auditorium projector screen and submit Option A, B, C, or D in real-time from your smartphone.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('/user')}
                className="mt-6 w-full py-3 rounded-xl bg-cyan-500 text-black font-display font-bold text-sm tracking-wide hover:bg-cyan-400 active:scale-95 transition shadow-lg shadow-cyan-500/20"
              >
                ENTER ARENA
              </button>
            </div>

            {/* Card 2: 16:9 Projector Screen */}
            <div className="p-6 rounded-2xl bg-[#0d1527] border border-pink-500/40 hover:border-pink-400 transition-all duration-300 shadow-xl flex flex-col justify-between group">
              <div>
                <div className="w-12 h-12 rounded-xl bg-pink-950 border border-pink-400 flex items-center justify-center mb-4 shadow-md shadow-pink-500/20 group-hover:scale-105 transition-transform">
                  <Monitor className="w-6 h-6 text-pink-400" />
                </div>
                <h3 className="text-xl font-display font-bold text-white">PROJECTOR DISPLAY</h3>
                <p className="text-xs font-mono text-pink-300 mt-1 font-bold">16:9 FULLSCREEN HUD</p>
                <p className="text-xs text-slate-400 mt-3 font-sans leading-relaxed">
                  Auditorium screen showing 3D circuit animations, authoritative question text, active options, countdown timer, and live podium standings.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('/projector')}
                className="mt-6 w-full py-3 rounded-xl bg-pink-500 text-white font-display font-bold text-sm tracking-wide hover:bg-pink-400 active:scale-95 transition shadow-lg shadow-pink-500/20"
              >
                LAUNCH PROJECTOR
              </button>
            </div>

            {/* Card 3: Live Controller */}
            <div className="p-6 rounded-2xl bg-[#0d1527] border border-amber-500/40 hover:border-amber-400 transition-all duration-300 shadow-xl flex flex-col justify-between group">
              <div>
                <div className="w-12 h-12 rounded-xl bg-amber-950 border border-amber-400 flex items-center justify-center mb-4 shadow-md shadow-amber-500/20 group-hover:scale-105 transition-transform">
                  <Play className="w-6 h-6 text-amber-400" />
                </div>
                <h3 className="text-xl font-display font-bold text-white">LIVE CONTROLLER</h3>
                <p className="text-xs font-mono text-amber-300 mt-1 font-bold">ADMIN 2 CONSOLE</p>
                <p className="text-xs text-slate-400 mt-3 font-sans leading-relaxed">
                  Control all 8 symposium stages, start questions, pause/resume timers, trigger time-up alerts, and manage event flow.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAdminLogin(true)}
                className="mt-6 w-full py-3 rounded-xl bg-amber-500 text-black font-display font-bold text-sm tracking-wide hover:bg-amber-400 active:scale-95 transition shadow-lg shadow-amber-500/20"
              >
                ACCESS CONTROLLER
              </button>
            </div>

            {/* Card 4: Live Event Monitor */}
            <div className="p-6 rounded-2xl bg-[#0d1527] border border-red-500/40 hover:border-red-400 transition-all duration-300 shadow-xl flex flex-col justify-between group">
              <div>
                <div className="w-12 h-12 rounded-xl bg-red-950/80 border border-red-500/60 flex items-center justify-center mb-4 shadow-md shadow-red-500/20 group-hover:scale-105 transition-transform">
                  <Activity className="w-6 h-6 text-red-400" />
                </div>
                <h3 className="text-xl font-display font-bold text-white flex items-center space-x-2">
                  <span>🔴 LIVE MONITOR</span>
                </h3>
                <p className="text-xs font-mono text-red-300 mt-1 font-bold">Real-time scoreboard and event progress</p>
                <p className="text-xs text-slate-400 mt-3 font-sans leading-relaxed">
                  Independent real-time monitoring of all competition rounds, active questions, buzzer locks, and live participant rankings.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('/live')}
                className="mt-6 w-full py-3 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 text-white font-display font-bold text-sm tracking-wide hover:from-red-500 hover:to-rose-500 active:scale-95 transition shadow-lg shadow-red-500/20"
              >
                OPEN LIVE MONITOR
              </button>
            </div>
          </div>

          {/* Symposium Feature Highlights */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto pt-4">
            <div className="p-4 rounded-xl bg-black/40 border border-slate-800 text-center shadow-sm">
              <div className="text-base font-bold font-mono text-cyan-400">60+ DEVICES</div>
              <div className="text-[11px] font-mono text-slate-400 mt-1">Simultaneous Real-time Sync</div>
            </div>
            <div className="p-4 rounded-xl bg-black/40 border border-slate-800 text-center shadow-sm">
              <div className="text-base font-bold font-mono text-pink-400">SERVER CLOCK</div>
              <div className="text-[11px] font-mono text-slate-400 mt-1">Server-Authoritative Timing</div>
            </div>
            <div className="p-4 rounded-xl bg-black/40 border border-slate-800 text-center shadow-sm">
              <div className="text-base font-bold font-mono text-emerald-400">ANTI-CHEAT</div>
              <div className="text-[11px] font-mono text-slate-400 mt-1">Active Visibility Tracking</div>
            </div>
            <div className="p-4 rounded-xl bg-black/40 border border-slate-800 text-center shadow-sm">
              <div className="text-base font-bold font-mono text-amber-400">LOCAL LAN</div>
              <div className="text-[11px] font-mono text-slate-400 mt-1">No Internet Needed (Offline)</div>
            </div>
          </div>
        </div>
      </main>

      {/* 3. Footer */}
      <footer className="p-6 border-t border-slate-800 text-center text-xs font-mono text-slate-500">
        <div>DEPARTMENT OF ELECTRONICS & COMMUNICATION ENGINEERING • RRASE COLLEGE OF ENGINEERING</div>
        <div className="mt-1 text-[11px] text-slate-600">GLITCH HUNT Real-time Event System • Built for Symposium 2026</div>
      </footer>

      {/* Organizer Login Modal */}
      {showAdminLogin && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0d1527] border border-cyan-500/40 rounded-2xl p-6 sm:p-8 max-w-md w-full relative shadow-2xl">
            <button
              type="button"
              onClick={() => setShowAdminLogin(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition"
            >
              ✕
            </button>

            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-xl bg-cyan-950 border border-cyan-400 flex items-center justify-center mx-auto mb-2 shadow-md shadow-cyan-500/20">
                <Lock className="w-6 h-6 text-cyan-400" />
              </div>
              <h3 className="text-xl font-display font-bold text-white">ORGANIZER AUTHENTICATION</h3>
              <p className="text-xs font-mono text-slate-400 mt-1">ADMIN 1 (Master) or ADMIN 2 (Controller)</p>
            </div>

            {adminError && (
              <div className="mb-4 p-3 rounded-xl bg-red-950/70 border border-red-500/40 text-red-300 text-xs font-mono">
                {adminError}
              </div>
            )}

            <form onSubmit={handleAdminSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-cyan-300 uppercase mb-1">Username</label>
                <input
                  type="text"
                  required
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  className="w-full p-2.5 bg-[#080d19] border border-slate-700 rounded-xl text-white font-mono text-sm focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-cyan-300 uppercase mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full p-2.5 bg-[#080d19] border border-slate-700 rounded-xl text-white font-mono text-sm focus:outline-none focus:border-cyan-400"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-black font-display font-bold text-sm tracking-wider hover:from-cyan-400 hover:to-blue-500 transition shadow-lg shadow-cyan-500/20"
              >
                LOGIN AS ADMINISTRATOR
              </button>
            </form>

            <div className="mt-6 pt-4 border-t border-slate-800 text-[11px] font-mono text-slate-500 text-center">
              Admin 1: admin1 / admin123 • Admin 2: admin2 / controller123
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
