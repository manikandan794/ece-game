import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ThemeProvider } from './context/ThemeContext';
import ErrorBoundary from './components/common/ErrorBoundary';
import LandingPage from './components/common/LandingPage';
import UserLogin from './components/user/UserLogin';
import UserMobileScreen from './components/user/UserMobileScreen';
import Admin1Dashboard from './components/admin1/Admin1Dashboard';
import Admin2Controller from './components/admin2/Admin2Controller';
import ProjectorView from './components/admin2/ProjectorView';
import LiveMonitor from './components/live/LiveMonitor';

function AdminDirectLogin({ expectedRole = 'admin_1', title, subtitle, accent = 'cyan', onCancel }) {
  const { loginAdmin } = useAuth();
  const [username, setUsername] = useState(expectedRole === 'admin_1' ? 'admin1' : 'admin2');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await loginAdmin(username, password);
      if (!res.success) {
        setError(res.message || 'Login failed');
      }
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const isCyan = accent === 'cyan';

  return (
    <div className="min-h-screen bg-[#070b14] flex flex-col items-center justify-center p-4">
      <div className={`bg-[#0d1527] border ${isCyan ? 'border-cyan-500/40 shadow-cyan-500/10' : 'border-pink-500/40 shadow-pink-500/10'} p-8 rounded-2xl max-w-md w-full shadow-2xl space-y-5 font-sans`}>
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-slate-900 border border-slate-700 mb-3">
            <span className="text-2xl">{isCyan ? '👑' : '🎮'}</span>
          </div>
          <h2 className="text-xl font-display font-bold text-white tracking-wide">{title}</h2>
          <p className="text-xs font-mono text-slate-400 mt-1">{subtitle}</p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-950/50 border border-red-500/50 text-red-200 text-xs font-mono text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className={`text-xs font-mono ${isCyan ? 'text-cyan-300' : 'text-pink-300'} block mb-1`}>Username</label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full p-2.5 bg-[#080d19] border border-slate-700 rounded-xl text-white font-mono text-sm focus:border-cyan-400"
            />
          </div>

          <div>
            <label className={`text-xs font-mono ${isCyan ? 'text-cyan-300' : 'text-pink-300'} block mb-1`}>Password</label>
            <input
              type="password"
              required
              autoFocus
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2.5 bg-[#080d19] border border-slate-700 rounded-xl text-white font-mono text-sm focus:border-cyan-400"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3 rounded-xl ${isCyan ? 'bg-cyan-500 hover:bg-cyan-400 text-black shadow-cyan-500/20' : 'bg-pink-500 hover:bg-pink-400 text-white shadow-pink-500/20'} font-display font-bold text-sm shadow-lg transition active:scale-98 disabled:opacity-50`}
          >
            {loading ? 'AUTHENTICATING...' : `LOG IN AS ${expectedRole === 'admin_1' ? 'ADMIN 1' : 'CONTROLLER'}`}
          </button>
        </form>

        <div className="text-center pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-mono text-slate-400 hover:text-white transition"
          >
            ← Return to Public Portal
          </button>
        </div>
      </div>
    </div>
  );
}

function AppRouter() {
  const { user, role, loading } = useAuth();
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070b14] flex items-center justify-center font-mono text-cyan-400">
        <div className="flex items-center space-x-3">
          <div className="w-3 h-3 rounded-full bg-cyan-400 animate-ping" />
          <span>LOADING SYSTEM TELEMETRY...</span>
        </div>
      </div>
    );
  }

  // Route 1: Projector Screen (Can be opened in full screen 16:9)
  if (currentPath === '/projector') {
    return <ProjectorView />;
  }

  // Route 1.5: Independent Real-Time Live Monitoring Page (/live & /live/round/:id)
  if (currentPath === '/live' || currentPath.startsWith('/live/')) {
    const roundMatch = currentPath.match(/^\/live\/round\/(\d+)/);
    const initialRoundId = roundMatch ? Number(roundMatch[1]) : null;
    return <LiveMonitor initialRoundId={initialRoundId} onNavigate={navigate} />;
  }

  // Route 2: User Mobile Screen
  if (currentPath === '/user') {
    if (role === 'team') {
      return <UserMobileScreen />;
    }
    return <UserLogin onLoginSuccess={() => navigate('/user')} />;
  }

  // Route 3: Admin 1 Master Dashboard
  if (currentPath === '/admin') {
    if (role === 'admin_1') {
      return <Admin1Dashboard />;
    }
    return (
      <AdminDirectLogin
        expectedRole="admin_1"
        title="ADMIN 1 MASTER ACCESS"
        subtitle="Please authenticate with Master Administrator credentials."
        accent="cyan"
        onCancel={() => navigate('/')}
      />
    );
  }

  // Route 4: Admin 2 Live Controller
  if (currentPath === '/controller') {
    if (role === 'admin_1' || role === 'admin_2') {
      return <Admin2Controller />;
    }
    return (
      <AdminDirectLogin
        expectedRole="admin_2"
        title="CONTROLLER ACCESS"
        subtitle="Please authenticate with Admin 2 controller credentials."
        accent="pink"
        onCancel={() => navigate('/')}
      />
    );
  }

  // Default: Landing Page with Official Launch Video & Role Portals
  return <LandingPage onNavigate={navigate} />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <SocketProvider>
            <AppRouter />
          </SocketProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
