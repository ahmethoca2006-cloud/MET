import type { LucideIcon } from 'lucide-react';
import { MousePointer2, Hand, Type, Eraser, Wand2, Scissors } from 'lucide-react';

export interface StudioTool {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Tools land here as they're implemented; unimplemented ones render disabled with a "coming soon" hint. */
  enabled: boolean;
}

export const STUDIO_TOOLS: StudioTool[] = [
  { id: 'select', label: 'Select', icon: MousePointer2, enabled: true },
  { id: 'pan', label: 'Pan', icon: Hand, enabled: true },
  { id: 'clean', label: 'Clean Brush', icon: Eraser, enabled: false },
  { id: 'bubble', label: 'Bubble Detect', icon: Wand2, enabled: false },
  { id: 'text', label: 'Text', icon: Type, enabled: false },
  { id: 'crop', label: 'Crop', icon: Scissors, enabled: false },
];
