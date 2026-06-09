import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Music, X, Play, Pause, SkipForward, SkipBack, Upload, Minimize2, Maximize2 } from 'lucide-react';

export function FloatingMusicPlayer() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [playlist, setPlaylist] = useState<{name: string, url: string}[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  useEffect(() => {
    if (!audioRef.current || !canvasRef.current || isMinimized) return;
    
    // Resume context if needed
    const setupAudio = () => {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        analyzerRef.current = audioCtxRef.current.createAnalyser();
        analyzerRef.current.fftSize = 64;
        sourceRef.current = audioCtxRef.current.createMediaElementSource(audioRef.current!);
        sourceRef.current.connect(analyzerRef.current);
        analyzerRef.current.connect(audioCtxRef.current.destination);
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
    };
    
    // Don't setup until user interaction or play
    
    let animationId: number;
    const draw = () => {
      if (!canvasRef.current || !analyzerRef.current) return;
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;
      
      const width = canvasRef.current.width;
      const height = canvasRef.current.height;
      const bufferLength = analyzerRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      analyzerRef.current.getByteFrequencyData(dataArray);
      
      ctx.clearRect(0, 0, width, height);
      
      const barWidth = (width / bufferLength) * 2.5;
      let x = 0;
      
      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * height;
        
        ctx.fillStyle = `rgb(${dataArray[i] + 100}, 50, 255)`; // Purple-ish sync
        ctx.fillRect(x, height - barHeight, barWidth, barHeight);
        
        x += barWidth + 1;
      }
      
      animationId = requestAnimationFrame(draw);
    };
    
    // Only attempt setup if playing
    if (isPlaying) {
      setupAudio();
      draw();
    }
    
    return () => cancelAnimationFrame(animationId);
  }, [isPlaying, isMinimized, isOpen]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      const newPlaylist = filesArray.map(file => ({
        name: file.name.replace(/\.[^/.]+$/, ""), // remove extension
        url: URL.createObjectURL(file)
      }));
      setPlaylist(prev => [...prev, ...newPlaylist]);
      if (!isPlaying && playlist.length === 0 && newPlaylist.length > 0) {
        // Prepare to play first uploaded
        setCurrentIdx(0);
      }
    }
  };

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        if (audioCtxRef.current?.state === 'suspended') {
            audioCtxRef.current.resume();
        }
        audioRef.current.play().catch(e => console.error("Audio playback failed", e));
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
      dragConstraints={{ left: 0, right: window.innerWidth - 300, top: 0, bottom: window.innerHeight - 200 }}
      dragMomentum={false}
      initial={{ opacity: 0, scale: 0.9, y: 50 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className={`fixed z-50 w-80 bg-black/70 backdrop-blur-xl border border-purple-500/20 shadow-[0_8px_30px_rgb(0,0,0,0.6)] rounded-3xl overflow-hidden text-right ${isMinimized ? 'h-16' : 'h-80'} flex flex-col`}
      style={{ left: 24, bottom: 24 }}
      dir="rtl"
    >
      {/* Header (Drag Handle) */}
      <div className="h-16 flex items-center justify-between px-4 bg-purple-950/30 border-b border-purple-500/20 cursor-grab active:cursor-grabbing shrink-0">
        <div className="flex items-center gap-2 text-purple-300">
          <Music size={18} />
          <span className="font-bold text-sm">مشغل الموسيقى</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsMinimized(!isMinimized)} className="text-slate-400 hover:text-white transition-colors">
            {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
          </button>
          <button onClick={() => setIsOpen(false)} className="text-red-400 hover:text-red-300 transition-colors">
            <X size={18} />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="flex-1 flex flex-col p-4 gap-4">
          {/* Visualizer & Info */}
          <div className="relative h-24 bg-black/50 rounded-2xl border border-purple-500/10 overflow-hidden flex items-center justify-center">
            <canvas ref={canvasRef} width={280} height={96} className="absolute inset-0 opacity-80" />
            
            <div className="relative z-10 text-center px-4 w-full">
              {playlist.length > 0 ? (
                <>
                  <p className="text-white font-bold text-sm truncate">{playlist[currentIdx]?.name}</p>
                  <p className="text-slate-400 text-xs">مسار {currentIdx + 1} من {playlist.length}</p>
                </>
              ) : (
                <p className="text-slate-500 text-xs font-semibold">لم يتم إضافة أي مقاطع صوتية</p>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-6">
            <button onClick={prevSong} disabled={playlist.length === 0} className="text-purple-400 hover:text-white disabled:opacity-30 transition-colors">
              <SkipForward size={24} /> {/* RTL swaps meaning of back/forward visually */}
            </button>
            <button 
              onClick={togglePlay} 
              disabled={playlist.length === 0}
              className="w-12 h-12 flex items-center justify-center bg-purple-600 hover:bg-purple-500 text-white rounded-full shadow-lg disabled:opacity-50 transition-all active:scale-95"
            >
              {isPlaying ? <Pause size={24} /> : <Play size={24} className="ml-1" />}
            </button>
            <button onClick={nextSong} disabled={playlist.length === 0} className="text-purple-400 hover:text-white disabled:opacity-30 transition-colors">
              <SkipBack size={24} />
            </button>
          </div>

          {/* Upload Button */}
          <div className="mt-auto">
             <input 
               type="file" 
               accept="audio/*" 
               multiple 
               id="playlist-upload" 
               className="hidden" 
               onChange={handleFileUpload} 
             />
             <label htmlFor="playlist-upload" className="w-full flex items-center justify-center gap-2 bg-purple-950/40 hover:bg-purple-900/40 border border-purple-500/20 text-purple-300 py-2.5 rounded-xl cursor-pointer transition-all text-xs font-bold">
               <Upload size={14} /> استيراد مقاطع صوتية
             </label>
          </div>
        </div>
      )}
      
      {/* Hidden Audio Element */}
      <audio 
        ref={audioRef} 
        src={playlist[currentIdx]?.url} 
        onEnded={nextSong}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        crossOrigin="anonymous" // required for web audio api
      />
    </motion.div>
  );
}
