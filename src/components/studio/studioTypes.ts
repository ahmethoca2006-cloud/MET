import type { LucideIcon } from 'lucide-react';
import { Image as ImageIcon, Type, Eraser, MessageSquare, SlidersHorizontal } from 'lucide-react';

export type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';

export const BLEND_MODES: { id: BlendMode; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'multiply', label: 'Multiply' },
  { id: 'screen', label: 'Screen' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'darken', label: 'Darken' },
  { id: 'lighten', label: 'Lighten' },
];

/** Maps our blend mode ids to Konva's globalCompositeOperation values. */
export const BLEND_TO_COMPOSITE: Record<BlendMode, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
};

export type StudioLayerType = 'background' | 'clean-patch' | 'text' | 'bubble-mask' | 'adjustment';

export const LAYER_TYPE_ICON: Record<StudioLayerType, LucideIcon> = {
  background: ImageIcon,
  'clean-patch': Eraser,
  text: Type,
  'bubble-mask': MessageSquare,
  adjustment: SlidersHorizontal,
};

export type TextAlign = 'left' | 'center' | 'right';

export const FONT_FAMILIES = [
  'Anime Ace', 'CC Wild Words', 'Comic Sans MS', 'Arial', 'Georgia', 'Impact',
];

export interface TextLayerData {
  content: string;
  x: number;
  y: number;
  width: number;
  fontFamily: string;
  fontSize: number;
  color: string;
  align: TextAlign;
  bold: boolean;
  italic: boolean;
  lineHeight: number;
  strokeColor: string;
  strokeWidth: number;
  rotation: number;
}

export interface StudioLayer {
  id: string;
  type: StudioLayerType;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0-1
  blendMode: BlendMode;
  /** Background layers can't be deleted, reordered below, or have opacity/blend changed. */
  isBackground?: boolean;
  /** Only present when type === 'text'. */
  text?: TextLayerData;
}

export function createBackgroundLayer(): StudioLayer {
  return {
    id: 'background',
    type: 'background',
    name: 'Background',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    isBackground: true,
  };
}

let layerCounter = 0;
export function createLayer(type: StudioLayerType, name: string): StudioLayer {
  layerCounter += 1;
  return {
    id: `layer-${Date.now()}-${layerCounter}`,
    type,
    name,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
  };
}

export function createTextLayer(x: number, y: number): StudioLayer {
  layerCounter += 1;
  return {
    id: `layer-${Date.now()}-${layerCounter}`,
    type: 'text',
    name: `Text ${layerCounter}`,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    text: {
      content: '',
      x,
      y,
      width: 240,
      fontFamily: FONT_FAMILIES[0],
      fontSize: 28,
      color: '#000000',
      align: 'center',
      bold: false,
      italic: false,
      lineHeight: 1.15,
      strokeColor: '#ffffff',
      strokeWidth: 0,
      rotation: 0,
    },
  };
}

/**
 * TypeR-style scripted lettering: a style is picked per script line by matching
 * a prefix (e.g. "!!" for SFX), then stripped before the text is placed.
 */
export interface TyperStyle {
  id: string;
  name: string;
  /** Empty prefix ("") matches any line that no other, more specific style claims first. */
  prefix: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  strokeColor: string;
  strokeWidth: number;
}

export const DEFAULT_TYPER_STYLES: TyperStyle[] = [
  { id: 'dialogue', name: 'Dialogue', prefix: '', fontFamily: FONT_FAMILIES[0], fontSize: 26, color: '#000000', bold: false, italic: false, strokeColor: '#ffffff', strokeWidth: 0 },
  { id: 'sfx', name: 'SFX', prefix: '!!', fontFamily: 'Impact', fontSize: 44, color: '#ffffff', bold: true, italic: false, strokeColor: '#000000', strokeWidth: 3 },
  { id: 'thought', name: 'Thought', prefix: '~', fontFamily: FONT_FAMILIES[0], fontSize: 24, color: '#000000', bold: false, italic: true, strokeColor: '#ffffff', strokeWidth: 0 },
];

export interface TyperLine {
  /** Index into the original script (for progress display), skipping ignored/empty lines. */
  raw: string;
  content: string;
  style: TyperStyle;
}

/**
 * Parses a pasted script into placeable lines. Lines starting with "##" are
 * ignored (notes). Longer prefixes are checked first so "!!" doesn't get
 * shadowed by an empty-prefix style.
 */
export function parseTyperScript(script: string, styles: TyperStyle[]): TyperLine[] {
  const sortedStyles = [...styles].sort((a, b) => b.prefix.length - a.prefix.length);
  return script
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('##'))
    .map(raw => {
      const style = sortedStyles.find(s => s.prefix && raw.startsWith(s.prefix))
        ?? sortedStyles.find(s => s.prefix === '')
        ?? styles[0];
      const content = style.prefix ? raw.slice(style.prefix.length).trim() : raw;
      return { raw, content, style };
    });
}
