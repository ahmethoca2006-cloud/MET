import { Settings, Users, Home, type LucideIcon } from 'lucide-react';

export type NavTabId = 'home' | 'settings' | 'teams';
export type HomeSubTabId = 'library' | 'cloud';

export interface NavTab {
  id: NavTabId;
  label: string;
  icon: LucideIcon;
}

export const NAV_TABS: NavTab[] = [
  { id: 'teams', label: 'Teams', icon: Users },
  { id: 'home', label: 'Home', icon: Home },
  { id: 'settings', label: 'Settings', icon: Settings },
];
