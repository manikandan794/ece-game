import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showReauthModal, setShowReauthModal] = useState(false);
  const [reauthUsername, setReauthUsername] = useState('admin1');
  const [reauthPassword, setReauthPassword] = useState('');
  const [reauthError, setReauthError] = useState('');
  const [reauthLoading, setReauthLoading] = useState(false);

  // Validate session on mount
  useEffect(() => {
    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    const isAdminPath = path.startsWith('/admin') || path.startsWith('/controller');
    const isTeamPath = path.startsWith('/user');

    const adminToken = localStorage.getItem('glitch_admin_token') || localStorage.getItem('glitch_token');
    const adminUser = localStorage.getItem('glitch_admin_user') || localStorage.getItem('glitch_user');
    const teamToken = localStorage.getItem('glitch_team_token');
    const teamUser = localStorage.getItem('glitch_team_user');

    let token = null;
    let storedUser = null;

    if (isAdminPath) {
      token = adminToken;
      storedUser = adminUser;
    } else if (isTeamPath) {
      token = teamToken;
      storedUser = teamUser;
    } else {
      token = adminToken || teamToken;
      storedUser = adminUser || teamUser;
    }

    if (!token || !storedUser) {
      setLoading(false);
      return;
    }

    // Check client-side expiration from JWT payload if possible
    let isExpired = false;
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
          isExpired = true;
        }
      }
    } catch (e) {
      isExpired = true;
    }

    if (isExpired) {
      if (isAdminPath) {
        localStorage.removeItem('glitch_admin_token');
        localStorage.removeItem('glitch_admin_user');
        localStorage.removeItem('glitch_token');
        localStorage.removeItem('glitch_user');
      } else {
        localStorage.removeItem('glitch_team_token');
        localStorage.removeItem('glitch_team_user');
      }
      setUser(null);
      setLoading(false);
      return;
    }

    // Verify token with backend
    api.getMe()
      .then((res) => {
        if (res.success && res.user) {
          try {
            const parsed = JSON.parse(storedUser);
            setUser({ ...parsed, ...res.user });
            if (res.user.username && (res.user.role === 'admin_1' || res.user.role === 'admin_2')) {
              setReauthUsername(res.user.username);
            }
          } catch (e) {
            setUser(res.user);
          }
        } else {
          if (isAdminPath) {
            localStorage.removeItem('glitch_admin_token');
            localStorage.removeItem('glitch_admin_user');
            localStorage.removeItem('glitch_token');
            localStorage.removeItem('glitch_user');
          } else {
            localStorage.removeItem('glitch_team_token');
            localStorage.removeItem('glitch_team_user');
          }
          setUser(null);
        }
      })
      .catch(() => {
        // Token invalid on backend
        if (isAdminPath) {
          localStorage.removeItem('glitch_admin_token');
          localStorage.removeItem('glitch_admin_user');
          localStorage.removeItem('glitch_token');
          localStorage.removeItem('glitch_user');
        } else {
          localStorage.removeItem('glitch_team_token');
          localStorage.removeItem('glitch_team_user');
        }
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // Listen for auth expired events from api.js
  useEffect(() => {
    const handleAuthExpired = (event) => {
      const path = typeof window !== 'undefined' ? window.location.pathname : '';
      const isAdminPath = path.startsWith('/admin') || path.startsWith('/controller');

      if (isAdminPath) {
        let uname = 'admin1';
        try {
          const stored = localStorage.getItem('glitch_admin_user') || localStorage.getItem('glitch_user');
          const parsed = JSON.parse(stored || '{}');
          if (parsed.username) uname = parsed.username;
        } catch (e) {}

        setReauthUsername(uname);
        setReauthPassword('');
        setReauthError('Admin session expired. Please log in again.');
        setShowReauthModal(true);
      } else {
        logout();
      }
    };

    window.addEventListener('glitch:auth_expired', handleAuthExpired);
    return () => window.removeEventListener('glitch:auth_expired', handleAuthExpired);
  }, []);

  const loginAdmin = async (username, password) => {
    const res = await api.loginAdmin(username, password);
    if (res.success && res.token) {
      localStorage.setItem('glitch_admin_token', res.token);
      localStorage.setItem('glitch_admin_user', JSON.stringify(res.user));
      // Maintain backward-compatible shared keys
      localStorage.setItem('glitch_token', res.token);
      localStorage.setItem('glitch_user', JSON.stringify(res.user));
      setUser(res.user);
      setReauthUsername(res.user.username || username);
      setShowReauthModal(false);
      window.dispatchEvent(new CustomEvent('glitch:auth_restored', { detail: { role: res.user.role } }));
    }
    return res;
  };

  const loginTeam = async (username, password) => {
    const res = await api.loginTeam(username, password);
    if (res.success && res.token) {
      const teamUser = {
        ...res.team,
        role: 'team',
        username
      };
      localStorage.setItem('glitch_team_token', res.token);
      localStorage.setItem('glitch_team_user', JSON.stringify(teamUser));
      setUser(teamUser);
      window.dispatchEvent(new CustomEvent('glitch:auth_restored', { detail: { role: 'team' } }));
    }
    return res;
  };

  const logout = () => {
    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    if (path.startsWith('/admin') || path.startsWith('/controller')) {
      localStorage.removeItem('glitch_admin_token');
      localStorage.removeItem('glitch_admin_user');
      localStorage.removeItem('glitch_token');
      localStorage.removeItem('glitch_user');
    } else if (path.startsWith('/user')) {
      localStorage.removeItem('glitch_team_token');
      localStorage.removeItem('glitch_team_user');
    } else {
      localStorage.removeItem('glitch_admin_token');
      localStorage.removeItem('glitch_admin_user');
      localStorage.removeItem('glitch_team_token');
      localStorage.removeItem('glitch_team_user');
      localStorage.removeItem('glitch_token');
      localStorage.removeItem('glitch_user');
    }
    setUser(null);
    setShowReauthModal(false);
  };

  const handleReauthSubmit = async (e) => {
    e.preventDefault();
    setReauthError('');
    setReauthLoading(true);
    try {
      const res = await loginAdmin(reauthUsername, reauthPassword);
      if (res.success) {
        setShowReauthModal(false);
        setReauthPassword('');
      } else {
        setReauthError(res.message || 'Authentication failed. Please check password.');
      }
    } catch (err) {
      setReauthError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setReauthLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      role: user?.role, 
      loading, 
      loginAdmin, 
      loginTeam, 
      logout,
      showReauthModal,
      setShowReauthModal
    }}>
      {children}

      {/* Cybernetic Re-Authentication Modal */}
      {showReauthModal && (
        <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#0d1527] border border-amber-500/50 rounded-2xl p-6 max-w-md w-full shadow-2xl shadow-amber-500/10 space-y-4">
            <div className="flex items-center space-x-3 text-amber-400">
              <div className="w-10 h-10 rounded-xl bg-amber-950/80 border border-amber-500/60 flex items-center justify-center shrink-0">
                <span className="text-xl">⚠️</span>
              </div>
              <div>
                <h3 className="text-lg font-display font-bold text-white tracking-wide">ADMIN SESSION EXPIRED</h3>
                <span className="text-xs font-mono text-amber-300">AUTHENTICATION REQUIRED</span>
              </div>
            </div>

            <p className="text-xs text-slate-300 font-sans leading-relaxed">
              Your administrator session has expired. Please enter your password to re-authenticate and resume your work without losing form progress.
            </p>

            {reauthError && (
              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs font-mono">
                {reauthError}
              </div>
            )}

            <form onSubmit={handleReauthSubmit} className="space-y-3 font-sans">
              <div>
                <label className="text-xs font-mono text-cyan-300 block mb-1">Username</label>
                <input
                  type="text"
                  required
                  value={reauthUsername}
                  onChange={(e) => setReauthUsername(e.target.value)}
                  className="w-full p-2.5 bg-[#080d19] border border-slate-700 rounded-xl text-white font-mono text-sm focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="text-xs font-mono text-cyan-300 block mb-1">Password</label>
                <input
                  type="password"
                  required
                  autoFocus
                  placeholder="Enter administrator password"
                  value={reauthPassword}
                  onChange={(e) => setReauthPassword(e.target.value)}
                  className="w-full p-2.5 bg-[#080d19] border border-slate-700 rounded-xl text-white font-mono text-sm focus:border-cyan-400"
                />
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={logout}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 text-xs font-mono text-slate-400 hover:text-white transition"
                >
                  Log Out
                </button>

                <button
                  type="submit"
                  disabled={reauthLoading}
                  className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-display font-bold text-sm shadow-md shadow-cyan-500/20 transition disabled:opacity-50"
                >
                  {reauthLoading ? 'Verifying...' : 'Re-Authenticate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
