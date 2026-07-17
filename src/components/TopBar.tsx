import { useEffect, useState } from 'react';
import { Bell, User, Sun, Moon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { IconButton } from './ui';
import { useTeamAuth, profileFromSession } from '../lib/teamAuth';
import { unreadCount, subscribeToNotifications } from '../lib/notifications';
import { getMyOwnedTeam, getMyMembership } from '../lib/teams';
import { NotificationsPanel } from './NotificationsPanel';
import { Skeleton } from './ui';
import { playNotificationSound } from '../lib/notifySound';
import { swalToast } from '../lib/swalTheme';
import logo from '../assets/logo-new.jpg';

export function TopBar() {
  const { resolvedTheme, toggleTheme } = useTheme();
  const { session } = useTeamAuth();
  const profile = profileFromSession(session);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [teamName, setTeamName] = useState<string | null>(null);
  const [loadingTeam, setLoadingTeam] = useState(true);

  const refreshUnread = () => { if (session) unreadCount().then(setUnread); };
  useEffect(refreshUnread, [session]);

  useEffect(() => {
    if (!session) { setLoadingTeam(false); return; }
    setLoadingTeam(true);
    (async () => {
      const owned = await getMyOwnedTeam();
      if (owned) { setTeamName(owned.name); return; }
      const membership = await getMyMembership();
      setTeamName(membership?.team.name ?? null);
    })().finally(() => setLoadingTeam(false));
  }, [session]);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) return;
    const unsubscribe = subscribeToNotifications(userId, n => {
      setUnread(u => u + 1);
      playNotificationSound();
      swalToast({ icon: 'info', title: n.title, text: n.body || undefined });
    });
    return unsubscribe;
  }, [session]);

  return (
    <div className="liquid-glass-bar w-full h-14 sm:h-16 rounded-b-[22px] lg:rounded-none border border-hairline border-t-0 lg:border-x-0 px-2.5 sm:px-6 flex items-center justify-between gap-2 shrink-0 z-40 sticky top-0">
      {/* Brand */}
      <div className="flex items-center gap-2.5 min-w-0 shrink-0">
        <img
          src={logo}
          alt="MET"
          className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl object-cover shrink-0 ring-1 ring-hairline shadow-[0_0_16px_color-mix(in_srgb,var(--color-accent)_30%,transparent)]"
          draggable={false}
        />
        <span className="hidden md:inline font-display text-sm font-bold text-ink tracking-tight truncate">
          Manga<span className="text-accent">Editing Tool</span>
        </span>
      </div>

      {/* Right Side: Theme toggle, Notifications + Profile */}
      <div className="flex items-center gap-1.5 xs:gap-2 sm:gap-3 shrink-0">
        <div className="flex items-center gap-0.5 xs:gap-1 bg-ink/5 border border-hairline rounded-full p-1">
          {/* Theme toggle */}
          <IconButton
            size="sm"
            onClick={toggleTheme}
            className="!bg-transparent !border-0 hover:!bg-ink/8"
            aria-label={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {resolvedTheme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </IconButton>

          {/* Notifications */}
          <IconButton
            size="sm"
            aria-label="Notifications"
            onClick={() => setNotifOpen(true)}
            className="relative !bg-transparent !border-0 hover:!bg-accent-soft hover:!text-accent"
          >
            <Bell size={16} />
            {unread > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger rounded-full ring-2 ring-[var(--color-surface)]"></span>}
          </IconButton>
        </div>

        {/* Profile */}
        <div className="flex items-center gap-2.5 bg-ink/5 border border-hairline rounded-full pl-1 pr-1 sm:pr-3.5 py-1">
          <div className="hidden md:flex flex-col text-right items-start gap-1">
            <span className="text-sm font-bold text-ink leading-none">{profile.name || 'Team Member'}</span>
            {loadingTeam ? (
              <Skeleton className="h-2.5 w-16" />
            ) : teamName ? (
              <span className="text-[10px] text-ink-faint leading-none truncate max-w-[9rem]">{teamName}</span>
            ) : null}
          </div>
          <div className="w-8 h-8 sm:w-9 sm:h-9 shrink-0 rounded-full border-2 border-accent/30 overflow-hidden bg-accent-soft flex items-center justify-center p-0.5">
            {profile.avatar ? (
               <img src={profile.avatar} alt="Profile" className="w-full h-full object-cover rounded-full" />
            ) : (
               <User size={18} className="text-accent" />
            )}
          </div>
        </div>
      </div>

      <NotificationsPanel open={notifOpen} onClose={() => setNotifOpen(false)} onChanged={refreshUnread} />
    </div>
  );
}
