import React, { useState, useEffect } from 'react';
import { Clock, Bell, User, Search } from 'lucide-react';

export function TopBar() {
  const [time, setTime] = useState(new Date());
  const [searchOpen, setSearchOpen] = useState(false);
  const [profile, setProfile] = useState<{name: string, avatar: string}>({ name: '', avatar: '' });

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem('team_profile') || '{}');
      if (p.name || p.avatar) {
        setProfile({ name: p.name || 'Anonymous User', avatar: p.avatar || '' });
      }
    } catch {}
    
    // Listen to changes from localstorage
    const handleStorage = () => {
      try {
        const p = JSON.parse(localStorage.getItem('team_profile') || '{}');
        setProfile({ name: p.name || 'User', avatar: p.avatar || '' });
      } catch {}
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return (
    <div className="relative w-full h-14 sm:h-16 bg-black/50 backdrop-blur-xl border-b border-purple-500/20 px-2.5 sm:px-6 flex items-center justify-between gap-2 shrink-0 z-40 sticky top-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      {/* Search & Utility */}
      <div className="flex items-center gap-4 min-w-0">
        {/* Compact icon-only trigger on narrow screens */}
        <button
          onClick={() => setSearchOpen(v => !v)}
          className="sm:hidden w-9 h-9 shrink-0 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-slate-300"
          aria-label="Search"
        >
          <Search size={16} />
        </button>
        <div className={`relative group ${searchOpen ? 'absolute left-2.5 right-2.5 top-1/2 -translate-y-1/2 z-10' : 'hidden'} sm:static sm:block sm:translate-y-0`}>
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <Search size={16} className="text-slate-500 group-focus-within:text-purple-400 transition-colors" />
          </div>
          <input
            type="text"
            placeholder="Search workspace..."
            autoFocus={searchOpen}
            onBlur={() => setSearchOpen(false)}
            className="w-full sm:w-64 bg-black/90 sm:bg-white/5 border border-white/10 hover:border-purple-500/30 focus:border-purple-500/50 rounded-xl pl-10 pr-4 py-2 text-sm text-white outline-none transition-all placeholder:text-slate-600 focus:bg-purple-950/20 focus:shadow-[0_0_15px_rgba(168,85,247,0.15)]"
          />
        </div>
      </div>

      {/* Right Side: Profile & Time */}
      <div className={`items-center gap-2 sm:gap-6 ${searchOpen ? 'hidden sm:flex' : 'flex'}`}>
        {/* Clock */}
        <div className="hidden xs:flex items-center gap-2 text-slate-300 bg-white/5 border border-white/10 px-2.5 sm:px-4 py-2 rounded-xl">
          <Clock size={16} className="text-purple-400" />
          <span className="hidden sm:inline font-mono text-sm tracking-widest">{time.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute:'2-digit' })}</span>
        </div>

        {/* Notifications */}
        <button className="relative w-9 h-9 sm:w-10 sm:h-10 shrink-0 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 hover:bg-purple-900/30 hover:border-purple-500/30 text-slate-300 hover:text-purple-300 transition-all">
          <Bell size={18} />
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-[#120D1D]"></span>
        </button>

        {/* Profile */}
        <div className="flex items-center gap-3 pl-1 sm:pr-2 sm:border-r border-white/10">
          <div className="hidden md:flex flex-col text-right items-start">
            <span className="text-sm font-bold text-white leading-none mb-1">{profile.name || "New User"}</span>
            <span className="text-[10px] text-purple-400 font-mono leading-none">Manga Team</span>
          </div>
          <div className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-full border-2 border-purple-500/30 overflow-hidden bg-purple-950/50 flex items-center justify-center p-0.5 sm:ml-2">
            {profile.avatar ? (
               <img src={profile.avatar} alt="Profile" className="w-full h-full object-cover rounded-full" />
            ) : (
               <User size={20} className="text-purple-400" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
