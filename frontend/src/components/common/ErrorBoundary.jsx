import React from 'react';
import { AlertTriangle, RefreshCw, Zap } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ARENA ERROR BOUNDARY CAUGHT]', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0a1128] text-white flex flex-col items-center justify-center p-6 text-center select-none font-sans">
          <div className="w-16 h-16 rounded-2xl bg-red-950/80 border border-red-500/60 flex items-center justify-center mb-5 shadow-lg shadow-red-500/20 animate-pulse">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>

          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-400 text-xs font-mono mb-3">
            <Zap className="w-3.5 h-3.5" />
            <span>GLITCH HUNT • SYSTEM TELEMETRY</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-display font-bold text-white mb-2">
            DISPLAY INTERFACE RECOVERED
          </h1>
          <p className="text-sm font-mono text-slate-300 max-w-md mx-auto mb-6">
            The telemetry interface encountered an unexpected rendering condition. The connection to the server remains synchronized.
          </p>

          <button
            type="button"
            onClick={this.handleReset}
            className="inline-flex items-center space-x-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-display font-bold text-base shadow-lg shadow-cyan-500/30 active:scale-95 transition"
          >
            <RefreshCw className="w-4 h-4" />
            <span>RE-SYNCHRONIZE ARENA</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
