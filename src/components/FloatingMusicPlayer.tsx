import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Music, X, Play, Pause, SkipForward, SkipBack, Upload, Volume2, VolumeX } from 'lucide-react';

export function FloatingMusicPlayer() {
  const [isOpen, setIsOpen] = useState(false);
  const [playlist, setPlaylist] = useState<{name: string, url: string}[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [isMuted, setIsMuted] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement>(null);

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
        className="fixed bottom-6 left-6 z-50 p-4 rounded-full bg-purple-600 hover:bg-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.4)] text-white transition-all transform hover:scale-110 flex items-center gap-2 group"
      >
        <Music size={24} />
      </button>
    );
  }

  return (
    <motion.div 
      drag
      dragConstraints={{ left: 0, right: window.innerWidth - 250, top: 0, bottom: window.innerHeight - 150 }}
      dragMomentum={false}
      initial={{ opacity: 0, scale: 0.9, y: 50 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="fixed z-50 w-64 bg-black/80 backdrop-blur-xl border border-purple-500/20 shadow-[0_8px_30px_rgb(0,0,0,0.6)] rounded-2xl overflow-hidden flex flex-col liquid-glass-heavy"
      style={{ left: 24, bottom: 24 }}
    >
      <div className="h-10 flex items-center justify-between px-3 bg-purple-950/30 border-b border-purple-500/20 cursor-grab active:cursor-grabbing shrink-0">
        <div className="flex items-center gap-2 text-purple-300">
          <Music size={14} />
          <span className="font-bold text-xs uppercase tracking-wider">Music Player</span>
        </div>
        <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white transition-colors">
          <X size={14} />
        </button>
      </div>

      <div className="p-3 flex flex-col gap-3">
        {/* Track Info */}
        <div className="text-center px-2">
          {playlist.length > 0 ? (
            <>
              <p className="text-white font-bold text-xs truncate">{playlist[currentIdx]?.name}</p>
              <p className="text-purple-400 text-[10px] mt-0.5">Track {currentIdx + 1} of {playlist.length}</p>
            </>
          ) : (
            <p className="text-slate-500 text-xs font-semibold py-1">No tracks added</p>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4">
          <button onClick={prevSong} disabled={playlist.length === 0} className="text-slate-400 hover:text-white disabled:opacity-30 transition-colors">
            <SkipBack size={18} />
          </button>
          <button 
            onClick={togglePlay} 
            disabled={playlist.length === 0}
            className="w-10 h-10 flex items-center justify-center bg-purple-600 hover:bg-purple-500 text-white rounded-full shadow-[0_0_15px_rgba(168,85,247,0.3)] disabled:opacity-50 transition-all active:scale-95"
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-1" />}
          </button>
          <button onClick={nextSong} disabled={playlist.length === 0} className="text-slate-400 hover:text-white disabled:opacity-30 transition-colors">
            <SkipForward size={18} />
          </button>
        </div>

        {/* Volume */}
        <div className="flex items-center gap-2 px-1">
          <button onClick={() => setIsMuted(!isMuted)} className="text-slate-400 hover:text-white">
            {isMuted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          <input 
            type="range" 
            min="0" max="1" step="0.01" 
            value={isMuted ? 0 : volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="flex-1 h-1 bg-purple-950 rounded-lg appearance-none cursor-pointer accent-purple-500"
          />
        </div>

        {/* Upload Button */}
        <div className="mt-1">
           <input 
             type="file" accept="audio/*" multiple id="playlist-upload" className="hidden" 
             onChange={handleFileUpload} 
           />
           <label htmlFor="playlist-upload" className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/5 text-slate-300 py-1.5 rounded-lg cursor-pointer transition-all text-[10px] font-bold uppercase tracking-wider">
             <Upload size={12} /> Import Audio
           </label>
        </div>
      </div>
      
      <audio 
        ref={audioRef} src={playlist[currentIdx]?.url} 
        onEnded={nextSong} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)}
      />
    </motion.div>
  );
}
