import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Shield, Zap, AlertCircle } from 'lucide-react';
import ThemeToggle from '../common/ThemeToggle';

export default function UserLogin({ onLoginSuccess }) {
  const { loginTeam } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please enter both team username and password');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const res = await loginTeam(username.trim(), password.trim());
      if (res.success) {
        if (onLoginSuccess) onLoginSuccess();
      } else {
        setError(res.message || 'Login failed');
      }
    } catch (err) {
      setError(err.message || 'Network error connecting to event server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#0a1128] cyber-grid">
      <div className="w-full max-w-md bg-[#0e1a38] border border-cyan-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-cyan-950/50 relative overflow-hidden">
        {/* Top Glow Bar & Theme Toggle */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-cyan-400 via-pink-500 to-cyan-400 animate-pulse" />
        <div className="flex justify-end mb-2">
          <ThemeToggle />
        </div>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-cyan-950/60 border border-cyan-400/40 mb-3">
            <Zap className="w-8 h-8 text-cyan-400" />
          </div>
          <h1 className="text-3xl font-display font-bold text-white tracking-wider">GLITCH HUNT</h1>
          <p className="text-xs font-mono text-cyan-400 tracking-widest mt-1">PARTICIPANT DEVICE PORTAL</p>
          <p className="text-xs text-slate-400 mt-2">Department of ECE • RRASE College of Engineering</p>
        </div>

        {error && (
          <div className="mb-6 p-3.5 rounded-xl bg-red-950/60 border border-red-500/40 flex items-start space-x-2.5 text-red-200 text-sm">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono text-cyan-300 uppercase tracking-wider mb-1.5">
              Team Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. team_ece_01"
              required
              className="w-full px-4 py-3 bg-[#080d19] border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-cyan-300 uppercase tracking-wider mb-1.5">
              Team Password / Access Key
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-4 py-3 bg-[#080d19] border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 font-mono text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 py-3.5 px-6 rounded-xl font-display font-bold text-base tracking-wider bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black shadow-lg shadow-cyan-500/20 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {loading ? 'AUTHENTICATING...' : 'ENTER EVENT ARENA'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-800 text-center">
          <div className="flex items-center justify-center space-x-2 text-xs font-mono text-slate-500">
            <Shield className="w-4 h-4 text-slate-400" />
            <span>Single active device session enforced per team</span>
          </div>
        </div>
      </div>
    </div>
  );
}
