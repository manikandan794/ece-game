import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { audioService } from '../services/audioService';
import { getActiveToken } from '../services/api';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [eventState, setEventState] = useState({
    state: 'IDLE',
    stage: null,
    question: null,
    hasSubmitted: false,
    submittedOption: null,
    answerStats: null,
    timer: null
  });
  const [adminStats, setAdminStats] = useState(null);
  const [recentViolations, setRecentViolations] = useState([]);
  const [serverTimeOffset, setServerTimeOffset] = useState(0);
  const [remainingSec, setRemainingSec] = useState(0);

  const socketRef = useRef(null);

  useEffect(() => {
    const token = getActiveToken();
    
    // Connect to configurable backend or fallback to same origin
    const rawSocketUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SOCKET_URL) || '';
    const socketTarget = rawSocketUrl ? rawSocketUrl.replace(/\/$/, '') : (typeof window !== 'undefined' ? window.location.origin : '');

    const socketInstance = io(socketTarget, {
      auth: { token: token || null },
      query: { role: user?.role || 'guest' },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 20,
      reconnectionDelay: 1000
    });

    socketRef.current = socketInstance;
    setSocket(socketInstance);

    socketInstance.on('connect', () => {
      setConnected(true);
      socketInstance.emit('state:request');
    });

    socketInstance.on('disconnect', () => {
      setConnected(false);
    });

    socketInstance.on('state:sync', (data) => {
      setEventState(prev => ({
        ...prev,
        ...data
      }));

      // Calculate server time offset
      if (data.timer && data.timer.serverTime) {
        const offset = data.timer.serverTime - Date.now();
        setServerTimeOffset(offset);

        if (data.timer.endsAt) {
          const rem = Math.max(0, Math.ceil((data.timer.endsAt - (Date.now() + offset)) / 1000));
          setRemainingSec(rem);
        }
      }

      // Play audio cue on state changes if sound enabled
      if (data.state === 'QUESTION_ACTIVE') {
        audioService.playTransition();
      } else if (data.state === 'TIME_UP') {
        audioService.playTimeUp();
      }
    });

    socketInstance.on('timer:tick', (data) => {
      setRemainingSec(data.remainingSec);
      // Play tick sound on projector / controllers
      if (data.remainingSec <= 5 && data.remainingSec > 0) {
        audioService.playTick(true); // Urgent tick
      } else if (data.remainingSec > 5) {
        audioService.playTick(false);
      }
    });

    socketInstance.on('timer:result_tick', (data) => {
      setRemainingSec(data.remainingSec);
    });

    socketInstance.on('timer:timeup', () => {
      setRemainingSec(0);
      audioService.playTimeUp();
    });

    socketInstance.on('timer:paused', (data) => {
      setRemainingSec(data.remainingSec);
    });

    socketInstance.on('timer:frozen', (data) => {
      setRemainingSec(data.remainingSec);
    });

    socketInstance.on('question:locked', (data) => {
      setEventState(prev => ({
        ...prev,
        state: 'QUESTION_LOCKED',
        firstCorrectTeamId: data.winnerTeamId,
        firstCorrectTeamName: data.winnerTeamName,
        winnerCollege: data.winnerCollege,
        timeTakenMs: data.timeTakenMs,
        isFirstCorrectWinner: user?.id === data.winnerTeamId
      }));
      if (data.frozenRemainingSec !== undefined) {
        setRemainingSec(data.frozenRemainingSec);
      }
      audioService.playTransition();
    });

    socketInstance.on('timer:resumed', (data) => {
      setRemainingSec(data.remainingSec);
    });

    socketInstance.on('admin:stats', (stats) => {
      setAdminStats(stats);
    });

    socketInstance.on('anticheat:alert', (alert) => {
      setRecentViolations(prev => [alert, ...prev.slice(0, 49)]);
    });

    socketInstance.on('audio:config', (cfg) => {
      audioService.setMuted(cfg.muted);
      audioService.setVolume(cfg.volume);
    });

    const handleAuthRestored = () => {
      const freshToken = getActiveToken();
      if (socketInstance) {
        socketInstance.auth = { token: freshToken || null };
        socketInstance.disconnect().connect();
      }
    };
    window.addEventListener('glitch:auth_restored', handleAuthRestored);

    return () => {
      window.removeEventListener('glitch:auth_restored', handleAuthRestored);
      socketInstance.disconnect();
    };
  }, [user]);

  // Submit Answer
  const submitAnswer = (questionId, selectedOption, roundId) => {
    return new Promise((resolve) => {
      if (!socketRef.current || !connected) {
        return resolve({ success: false, message: 'Not connected to server' });
      }
      socketRef.current.emit('answer:submit', { questionId, selectedOption, roundId }, (response) => {
        if (response && response.success) {
          setEventState(prev => ({
            ...prev,
            hasSubmitted: true,
            submittedOption: selectedOption
          }));
        }
        resolve(response);
      });
    });
  };

  // Anti-Cheat Violation
  const reportViolation = (type, details) => {
    if (socketRef.current && connected) {
      socketRef.current.emit('anticheat:violation', { type, details });
    }
  };

  // Admin Control Command
  const sendAdminControl = (payload) => {
    return new Promise((resolve) => {
      if (!socketRef.current || !connected) {
        return resolve({ success: false, message: 'Socket not connected' });
      }
      socketRef.current.emit('admin:control', payload, (response) => {
        resolve(response);
      });
    });
  };

  return (
    <SocketContext.Provider value={{
      socket,
      connected,
      eventState,
      remainingSec,
      adminStats,
      recentViolations,
      submitAnswer,
      reportViolation,
      sendAdminControl
    }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
