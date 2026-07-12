import { useEffect, useMemo, useState } from 'react';
import logo from '../assets/logo-new.jpg';

type Phase = 'showing' | 'leaving';

interface Particle {
  id: number;
  left: string;
  top: string;
  size: number;
  x: string;
  y: string;
  duration: string;
  delay: string;
}

function makeParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, id) => {
    const angle = Math.random() * Math.PI * 2;
    const distance = 120 + Math.random() * 260;
    return {
      id,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      size: 2 + Math.random() * 4,
      x: `${Math.cos(angle) * distance}px`,
      y: `${Math.sin(angle) * distance}px`,
      duration: `${700 + Math.random() * 500}ms`,
      delay: `${Math.random() * 150}ms`,
    };
  });
}

// Pure CSS intro — no <video>, since hardware video decode has been observed to
// paint an opaque black layer over the whole page in some remote/virtualized
// display setups (VMs, browser-in-browser previews), ignoring CSS opacity entirely.
export function SplashScreen({ onFinish }: { onFinish: () => void }) {
  const [phase, setPhase] = useState<Phase>('showing');
  const particles = useMemo(() => makeParticles(48), []);

  useEffect(() => {
    const leaveTimer = setTimeout(() => setPhase('leaving'), 1300);
    const finishTimer = setTimeout(onFinish, 1300 + 950);
    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(finishTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`fixed inset-0 z-[999] bg-black overflow-hidden flex items-center justify-center ${phase === 'leaving' ? 'pointer-events-none' : ''}`}>
      <img
        src={logo}
        alt="MET"
        className={`w-20 h-20 rounded-2xl object-cover animate-splash-breathe-static transition-opacity duration-500 ${phase === 'leaving' ? 'opacity-0' : 'opacity-100'}`}
        draggable={false}
      />

      {phase === 'leaving' && (
        <div className="absolute inset-0">
          {particles.map(p => (
            <span
              key={p.id}
              className="absolute rounded-full bg-white animate-splash-particle"
              style={{
                left: p.left,
                top: p.top,
                width: p.size,
                height: p.size,
                boxShadow: '0 0 6px 1px color-mix(in srgb, var(--color-accent) 70%, white)',
                ['--particle-x' as string]: p.x,
                ['--particle-y' as string]: p.y,
                ['--particle-duration' as string]: p.duration,
                animationDelay: p.delay,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
