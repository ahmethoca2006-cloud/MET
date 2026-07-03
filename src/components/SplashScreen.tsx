import { useEffect, useState } from 'react';
import logo from '../assets/logo.jpg';

const LOADING_LINES = [
  'Waking up the ink...',
  'Stretching the speech bubbles...',
  'Sharpening the fonts...',
  'Polishing the panels...',
];

export function SplashScreen({ onFinish }: { onFinish: () => void }) {
  const [progress, setProgress] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [lineIndex, setLineIndex] = useState(0);

  useEffect(() => {
    const start = performance.now();
    // Eased, non-linear ramp so it reads as "alive" rather than a flat timer -
    // quick early gains, a believable stall around 70-90%, then a snappy finish.
    const duration = 1900;
    let raf = 0;

    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      const eased = t < 0.85 ? Math.pow(t / 0.85, 0.6) * 0.9 : 0.9 + (t - 0.85) / 0.15 * 0.1;
      setProgress(Math.min(100, Math.round(eased * 100)));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setLeaving(true);
        setTimeout(onFinish, 550);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onFinish]);

  useEffect(() => {
    const lineTimer = setInterval(() => {
      setLineIndex(i => (i + 1) % LOADING_LINES.length);
    }, 650);
    return () => clearInterval(lineTimer);
  }, []);

  return (
    <div
      className={`fixed inset-0 z-[999] flex flex-col items-center justify-center bg-base overflow-hidden transition-all duration-500 ease-out ${
        leaving ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      {/* Ambient accent gradient glow, breathing slowly behind everything */}
      <div className="absolute inset-0 -z-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full bg-accent/25 blur-[110px] animate-splash-breathe" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[260px] h-[260px] rounded-full bg-accent/15 blur-[80px] animate-splash-breathe [animation-delay:0.6s]" />
      </div>

      <div className="relative flex flex-col items-center gap-7 px-6">
        {/* Logo, with its own soft glow + gentle float */}
        <div className="relative animate-splash-float">
          <div className="absolute inset-0 rounded-full bg-accent/30 blur-3xl scale-110" />
          <img
            src={logo}
            alt="MangaAI"
            className="relative w-32 h-32 sm:w-40 sm:h-40 object-contain rounded-[28px] drop-shadow-[0_0_35px_color-mix(in_srgb,var(--color-accent)_45%,transparent)]"
            draggable={false}
          />
        </div>

        {/* Wordmark */}
        <div className="flex flex-col items-center gap-1.5">
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-ink">
            Manga<span className="text-accent">AI</span>
          </h1>
          <p className="text-[11px] font-mono tracking-[0.35em] text-accent/70 uppercase">Studio</p>
        </div>

        {/* Creative loading bar: fill + traveling shimmer + live percentage */}
        <div className="flex flex-col items-center gap-2.5 w-56 sm:w-64">
          <div className="relative w-full h-[5px] rounded-full bg-ink/10 overflow-hidden border border-hairline">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-150 ease-out relative overflow-hidden"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute inset-0 animate-splash-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent" />
            </div>
          </div>
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] font-mono text-ink-faint tracking-wider transition-opacity duration-300 truncate">
              {LOADING_LINES[lineIndex]}
            </span>
            <span className="text-[10px] font-mono text-accent tabular-nums shrink-0 pl-2">{progress}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
