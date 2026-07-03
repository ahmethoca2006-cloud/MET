import { Settings, CalendarClock, CloudCog, LayoutGrid, type LucideIcon } from 'lucide-react';

export type NavTabId = 'settings' | 'scheduler' | 'cloud' | 'library';

export interface NavTab {
  id: NavTabId;
  label: string;
  icon: LucideIcon;
}

export const NAV_TABS: NavTab[] = [
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'scheduler', label: 'Scheduler', icon: CalendarClock },
  { id: 'cloud', label: 'Cloud', icon: CloudCog },
  { id: 'library', label: 'My Library', icon: LayoutGrid },
];
