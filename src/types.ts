export interface ProcessedImage {
  id: string;
  filename: string;
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
}

/** A single manga page: the original scan plus an optional synced "cleaned" (bleached) version. */
export interface Page {
  id: string;
  order: number;
  original: ProcessedImage;
  cleaned: ProcessedImage | null;
}

export interface Chapter {
  id: string;
  name: string;
  coverUrl: string;
  pages: Page[];
}

export interface Volume {
  id: string;
  name: string;
  coverUrl: string;
  chapters: Chapter[];
}

export interface MangaSeries {
  id: string;
  title: string;
  type: "manga" | "manhwa";
  coverUrl: string;
  description: string;
  volumes: Volume[];
}

export interface Workspace {
  id: string;
  name: string;
  description: string;
  coverUrl: string;
  mangas: MangaSeries[];
}

export interface Profile {
  name: string;
  teamName: string;
  avatar: string;
}

export type AutomationTrigger =
  | { type: 'interval'; everyMs: number }
  | { type: 'onOpen' };

export type AutomationAction =
  | { type: 'reminder'; message: string }
  | { type: 'staleChapterCheck'; days: number }
  | { type: 'cloudBackup'; workspaceId: string };

export interface Automation {
  id: string;
  name: string;
  description: string;
  trigger: AutomationTrigger;
  action: AutomationAction;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
}
