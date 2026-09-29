import { useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';

export function useAntiCheat() {
  const { role } = useAuth();
  const { reportViolation, connected } = useSocket();
  const lastReportRef = useRef(0);

  const reportWithThrottle = (type, details) => {
    const now = Date.now();
    // Throttle duplicate violations to once per 2.5 seconds
    if (now - lastReportRef.current > 2500) {
      lastReportRef.current = now;
      reportViolation(type, details);
    }
  };

  useEffect(() => {
    if (role !== 'team' || !connected) return;

    // 1. Page Visibility (Tab switch or minimize)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        reportWithThrottle('TAB_SWITCH_OR_MINIMIZE', 'User switched browser tab or minimized window');
      }
    };

    // 2. Window Blur (Focus loss with debounce to prevent touch tap false positives)
    let blurTimeout = null;
    const handleBlur = () => {
      blurTimeout = setTimeout(() => {
        if (typeof document.hasFocus === 'function' && !document.hasFocus()) {
          reportWithThrottle('WINDOW_BLUR', 'Browser window lost focus');
        }
      }, 350);
    };

    const handleFocus = () => {
      if (blurTimeout) {
        clearTimeout(blurTimeout);
        blurTimeout = null;
      }
    };

    // 3. Before Unload / Refresh
    const handleBeforeUnload = () => {
      reportWithThrottle('PAGE_REFRESH', 'User initiated browser page reload');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      if (blurTimeout) clearTimeout(blurTimeout);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [role, connected]);
}
