import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { Music, X, Play, Pause, SkipForward, SkipBack, Upload, Volume2, VolumeX } from 'lucide-react';
import { GlassCard } from './ui';

const PANEL_MARGIN = 16;
// Clears the floating iOS-style bottom tab bar (visible up to the lg breakpoint).
const BOTTOM_CLEARANCE_MOBILE = 104;
const BOTTOM_CLEARANCE_DESKTOP = 24;

export function FloatingMusicPlayer() {
  const [isOpen, setIsOpen] = useState(false);
  const [playlist, setPlaylist] = useState<{name: string, url: string}[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [isMuted, setIsMuted] = useState(false);
  const [panelSize, setPanelSize] = useState({ width: 256, height: 230 });
  // The panel always rests at (PANEL_MARGIN, bottomClearance) — i.e. already at
  // its allowed floor/left-wall — so drag constraints (relative to that rest
  // position) only need to allow moving up/right, never further down/left.
  const [restBottom, setRestBottom] = useState(BOTTOM_CLEARANCE_MOBILE);
  const [dragConstraints, setDragConstraints] = useState({ left: 0, top: 0, right: 0, bottom: 0 });

  const audioRef = useRef<HTMLAudioElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const recomputeLayout = useCallback(() => {
    const isDesktop = window.innerWidth >= 1024;
    const bottomClearance = isDesktop ? BOTTOM_CLEARANCE_DESKTOP : BOTTOM_CLEARANCE_MOBILE;
    setRestBottom(bottomClearance);
    setDragConstraints({
      left: 0,
      top: -(window.innerHeight - panelSize.height - PANEL_MARGIN - bottomClearance),
      right: Math.max(0, window.innerWidth - panelSize.width - PANEL_MARGIN * 2),
      bottom: 0,
    });
  }, [panelSize]);

  useEffect(() => {
    recomputeLayout();
    window.addEventListener('resize', recomputeLayout);
    return () => window.removeEventListener('resize', recomputeLayout);
  }, [recomputeLayout]);

  useEffect(() => {
    if (!panelRef.current || !isOpen) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setPanelSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(panelRef.current);
    return () => observer.disconnect();
  }, [isOpen]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      const newPlaylist = filesArray.map(file => ({
        name: file.name.replace(/\.[^/.]+$/, ""),
        url: URL.createObjectURL(file)
      }));
      setPlaylist(prev => [...prev, ...newPlaylist]);
      if (!isPlaying && playlist.length === 0 && newPlaylist.length > 0) {
        setCurrentIdx(0);
      }
    }
  };

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(e => console.error(e));
      }
      setIsPlaying(!isPlaying);
    }
  };

  const nextSong = () => {
    if (playlist.length === 0) return;
    setCurrentIdx((prev) => (prev + 1) % playlist.length);
    setIsPlaying(true);
  };

  const prevSong = () => {
    if (playlist.length === 0) return;
    setCurrentIdx((prev) => (prev - 1 + playlist.length) % playlist.length);
    setIsPlaying(true);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 lg:bottom-6 left-4 sm:left-6 z-40 p-4 rounded-full bg-accent hover:opacity-90 shadow-[0_0_20px_var(--color-accent-soft)] text-white transition-all transform hover:scale-110 flex items-center gap-2 group"
        aria-label="Open music player"
      >
        <Music size={24} />
      </button>
    );
  }

  return (
    <motion.div
      ref={panelRef}
      drag
      dragConstraints={dragConstraints}
      dragMomentum={false}
      initial={{ opacity: 0, scale: 0.9, y: 50 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="fixed z-40 w-64 max-w-[calc(100vw-2rem)] overflow-hidden flex flex-col"
      style={{ left: PANEL_MARGIN, bottom: restBottom }}
    >
      <GlassCard variant="heavy" radius="2xl" className="flex flex-col overflow-hidden">
        <div className="h-10 flex items-center justify-between px-3 bg-ink/5 border-b border-hairline cursor-grab active:cursor-grabbing shrink-0">
          <div className="flex items-center gap-2 text-accent">
            <Music size={14} />
            <span className="font-bold text-xs uppercase tracking-wider">Music Player</span>
          </div>
          <button onClick={() => setIsOpen(false)} className="text-ink-muted hover:text-ink transition-colors" aria-label="Close music player">
            <X size={14} />
          </button>
        </div>

        <div className="p-3 flex flex-col gap-3">
          {/* Track Info */}
          <div className="text-center px-2">
            {playlist.length > 0 ? (
              <>
                <p className="text-ink font-bold text-xs truncate">{playlist[currentIdx]?.name}</p>
                <p className="text-accent text-[10px] mt-0.5">Track {currentIdx + 1} of {playlist.length}</p>
              </>
            ) : (
              <p className="text-ink-faint text-xs font-semibold py-1">No tracks added</p>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-4">
            <button onClick={prevSong} disabled={playlist.length === 0} className="text-ink-muted hover:text-ink disabled:opacity-30 transition-colors" aria-label="Previous track">
              <SkipBack size={18} />
            </button>
            <button
              onClick={togglePlay}
              disabled={playlist.length === 0}
              className="w-10 h-10 flex items-center justify-center bg-accent hover:opacity-90 text-white rounded-full shadow-[0_0_15px_var(--color-accent-soft)] disabled:opacity-50 transition-all active:scale-95"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-1" />}
            </button>
            <button onClick={nextSong} disabled={playlist.length === 0} className="text-ink-muted hover:text-ink disabled:opacity-30 transition-colors" aria-label="Next track">
              <SkipForward size={18} />
            </button>
          </div>

          {/* Volume */}
          <div className="flex items-center gap-2 px-1">
            <button onClick={() => setIsMuted(!isMuted)} className="text-ink-muted hover:text-ink" aria-label={isMuted ? 'Unmute' : 'Mute'}>
              {isMuted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <input
              type="range"
              min="0" max="1" step="0.01"
              value={isMuted ? 0 : volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="flex-1 h-1 bg-ink/15 rounded-lg appearance-none cursor-pointer accent-accent"
            />
          </div>

          {/* Upload Button */}
          <div className="mt-1">
             <input
               type="file" accept="audio/*" multiple id="playlist-upload" className="hidden"
               onChange={handleFileUpload}
             />
             <label htmlFor="playlist-upload" className="w-full flex items-center justify-center gap-2 bg-ink/5 hover:bg-ink/10 border border-hairline text-ink-muted py-1.5 rounded-lg cursor-pointer transition-all text-[10px] font-bold uppercase tracking-wider">
               <Upload size={12} /> Import Audio
             </label>
          </div>
        </div>

        <audio
          ref={audioRef} src={playlist[currentIdx]?.url}
          onEnded={nextSong} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)}
        />
      </GlassCard>
    </motion.div>
  );
}
