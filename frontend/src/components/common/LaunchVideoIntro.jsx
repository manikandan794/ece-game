import React, { useState, useRef, useEffect } from 'react';
import { Play, Zap, ChevronRight, AlertCircle } from 'lucide-react';

export default function LaunchVideoIntro({ onComplete }) {
  const videoRef = useRef(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const transitionTimerRef = useRef(null);

  // Attempt autoplay immediately upon component mount
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;
    video.defaultMuted = true;

    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setHasStarted(true);
          setAutoplayBlocked(false);
        })
        .catch((err) => {
          console.warn('[GLITCH HUNT] Autoplay prevented by browser policy:', err);
          setAutoplayBlocked(true);
        });
    }

    return () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
    };
  }, []);

  const triggerTransitionAndComplete = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);

    // Release video decoding resources
    if (videoRef.current) {
      try {
        videoRef.current.pause();
      } catch (e) {}
    }

    // 700ms smooth transition (fade to black + subtle electronic glow)
    transitionTimerRef.current = setTimeout(() => {
      if (onComplete) onComplete();
    }, 700);
  };

  const handleVideoEnded = () => {
    triggerTransitionAndComplete();
  };

  const handleManualStart = () => {
    setAutoplayBlocked(false);
    const video = videoRef.current;
    if (video) {
      video.muted = true;
      video.play()
        .then(() => setHasStarted(true))
        .catch((err) => {
          console.error('[GLITCH HUNT] Video play failed on user tap:', err);
          setVideoError(true);
        });
    }
  };

  const handleSkipIntro = () => {
    triggerTransitionAndComplete();
  };

  // Requirement 22: Video Error Fallback Launch Screen
  if (videoError) {
    return (
      <div className="fixed inset-0 z-50 bg-[#070b14] flex flex-col items-center justify-center p-6 text-center select-none font-sans">
        <div className="max-w-md w-full border border-cyan-500/40 rounded-3xl p-8 bg-[#0d1527] shadow-2xl shadow-cyan-950/70 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-400 via-pink-500 to-cyan-400 animate-pulse" />
          
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-cyan-950/80 border border-cyan-400 mb-4 shadow-lg shadow-cyan-500/30">
            <Zap className="w-8 h-8 text-cyan-400" />
          </div>

          <h1 className="text-4xl md:text-5xl font-display font-black text-white tracking-widest mb-3 glitch-text">
            GLITCH HUNT
          </h1>

          <div className="space-y-1 my-5 font-mono text-xs text-cyan-300">
            <div className="font-bold text-sm text-white">RRASE COLLEGE OF ENGINEERING</div>
            <div className="text-slate-300">DEPARTMENT OF ECE</div>
            <div className="text-pink-400 tracking-widest font-bold text-xs mt-1">SYNEXA'26</div>
          </div>

          <button
            type="button"
            onClick={triggerTransitionAndComplete}
            className="mt-6 w-full py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-display font-bold text-base tracking-wider shadow-lg shadow-cyan-500/25 active:scale-95 transition"
          >
            ENTER GLITCH HUNT
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`fixed inset-0 z-50 bg-black flex items-center justify-center overflow-hidden select-none transition-opacity duration-700 ${
        isTransitioning ? 'opacity-0 scale-[1.02] filter blur-sm' : 'opacity-100'
      }`}
    >
      {/* 1. Official Launch Video Element (16:9 full viewport responsive) */}
      <video
        ref={videoRef}
        src="/assets/glitch-hunt-launch.mp4"
        autoPlay
        muted
        playsInline
        webkit-playsinline="true"
        controls={false}
        disablePictureInPicture
        preload="auto"
        onEnded={handleVideoEnded}
        onError={() => setVideoError(true)}
        className="w-full h-full object-cover pointer-events-none"
      />

      {/* 2. Autoplay Policy Blocked Fallback Screen (Requirement 4) */}
      {autoplayBlocked && !hasStarted && (
        <div className="absolute inset-0 z-30 bg-[#070b14]/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-xl space-y-6">
            <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-cyan-950/90 border border-cyan-400/80 text-cyan-400 font-mono text-xs tracking-widest uppercase shadow-lg shadow-cyan-500/20">
              <Zap className="w-4 h-4 animate-pulse" />
              <span>ECE TECHNICAL SYMPOSIUM • SYNEXA'26</span>
            </div>

            <h1 className="text-5xl sm:text-6xl md:text-7xl font-display font-black text-white tracking-widest leading-none glitch-text">
              GLITCH HUNT
            </h1>

            <p className="text-xs sm:text-sm font-mono text-cyan-300 uppercase tracking-widest">
              Department of Electronics & Communication Engineering • RRASE College of Engineering
            </p>

            <div className="pt-4">
              <button
                type="button"
                onClick={handleManualStart}
                className="group relative inline-flex items-center space-x-3 px-10 py-5 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-500 to-cyan-400 text-black font-display font-black text-xl tracking-widest hover:scale-105 active:scale-95 shadow-2xl shadow-cyan-500/50 transition-all duration-200"
              >
                <Play className="w-6 h-6 fill-black" />
                <span>START GLITCH HUNT</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Subtle, Non-Dominant "Skip Intro" Control (Requirement 8) */}
      {!autoplayBlocked && (
        <button
          type="button"
          onClick={handleSkipIntro}
          className="absolute bottom-6 right-6 z-20 px-3.5 py-1.5 rounded-full bg-black/60 hover:bg-black/90 border border-white/20 hover:border-cyan-400 text-[11px] font-mono text-white/70 hover:text-cyan-300 backdrop-blur-md transition-all tracking-wider flex items-center space-x-1.5 opacity-60 hover:opacity-100"
          title="Skip to Role Selection"
        >
          <span>Skip Intro</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      )}

      {/* 4. Subtle Electronic Glow Transition Overlay (Requirement 7) */}
      {isTransitioning && (
        <div className="absolute inset-0 z-40 bg-gradient-to-t from-cyan-500/20 via-black to-black animate-pulse pointer-events-none" />
      )}
    </div>
  );
}
