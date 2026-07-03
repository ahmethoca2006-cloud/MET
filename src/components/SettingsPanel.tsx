import type { ChangeEvent } from 'react';
import { Sun, Moon, Laptop } from 'lucide-react';
import { useTheme, type ThemeMode } from '../contexts/ThemeContext';
import { GlassCard, Textarea, Switch } from './ui';

interface SettingsPanelProps {
  customApiKey: string;
  onApiKeyChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  zipMatchMode: 'filename' | 'index';
  onZipMatchModeChange: (mode: 'filename' | 'index') => void;
  customInstructions: string;
  onCustomInstructionsChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  translateJapanese: boolean;
  onTranslateJapaneseChange: (v: boolean) => void;
  translateSfx: boolean;
  onTranslateSfxChange: (v: boolean) => void;
  autoFitAndCenter: boolean;
  onAutoFitAndCenterChange: (v: boolean) => void;
  compressBeforeProcessing: boolean;
  onCompressBeforeProcessingChange: (v: boolean) => void;
}

const THEME_OPTIONS: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
  { mode: 'light', label: 'Light', icon: Sun },
  { mode: 'dark', label: 'Dark', icon: Moon },
  { mode: 'system', label: 'System', icon: Laptop },
];

export function SettingsPanel(props: SettingsPanelProps) {
  const { mode, setMode } = useTheme();
  const keyCount = props.customApiKey.split(/[\s,\n]+/).map(k => k.trim()).filter(Boolean).length;

  return (
    <div className="flex flex-col gap-6">
      <GlassCard className="p-6 space-y-4">
        <h3 className="text-base font-semibold text-ink font-display">Appearance</h3>
        <div className="grid grid-cols-3 gap-2">
          {THEME_OPTIONS.map(({ mode: m, label, icon: Icon }) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-medium transition-colors ${
                mode === m ? 'bg-accent-soft border-accent text-accent' : 'bg-ink/5 border-hairline text-ink-muted hover:bg-ink/10'
              }`}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="p-6 space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="text-base font-semibold text-ink font-display">Gemini API Keys</h3>
          {keyCount > 0 && (
            <span className="text-[11px] bg-accent-soft border border-accent/30 text-accent px-2.5 py-0.5 rounded-full font-mono">
              {keyCount} Key(s) Loaded
            </span>
          )}
        </div>
        <Textarea
          value={props.customApiKey}
          onChange={props.onApiKeyChange}
          placeholder="Add keys (one per line or comma-separated)..."
          className="h-28 font-mono"
        />
        <div className="space-y-1 text-[11px] text-ink-faint leading-relaxed font-mono">
          <p>✧ Multiple keys enable concurrent parallel translation across page streams.</p>
          <p>✧ Requests are routed across keys dynamically to keep rate limits healthy.</p>
        </div>
      </GlassCard>

      <GlassCard className="p-6 space-y-3">
        <h3 className="text-base font-semibold text-ink font-display">Custom Agent Prompting</h3>
        <Textarea
          value={props.customInstructions}
          onChange={props.onCustomInstructionsChange}
          placeholder="E.g., translate to Egyptian dialect, keep humor puns, keep sound effects minimal..."
          className="h-24"
        />
        <p className="text-[11px] text-ink-faint font-mono">✧ Passed directly to the Gemini model during page synthesis.</p>
      </GlassCard>

      <GlassCard className="p-6 space-y-4">
        <h3 className="text-base font-semibold text-ink font-display">Optimization Rules</h3>
        <div className="flex flex-col gap-4">
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span className="text-sm font-medium text-ink">Translate text from Japanese</span>
            <Switch checked={props.translateJapanese} onChange={props.onTranslateJapaneseChange} />
          </label>
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span className="text-sm font-medium text-ink">Analyze and translate SFX</span>
            <Switch checked={props.translateSfx} onChange={props.onTranslateSfxChange} />
          </label>
          <label className="flex items-center justify-between gap-3 cursor-pointer border-t border-hairline pt-4">
            <span className="flex flex-col">
              <span className="text-sm font-medium text-ink">Auto Flood Fill &amp; Alignment</span>
              <span className="text-[10px] text-ink-faint font-normal">Automatically align text and expand bounds to fit speech bubbles safely</span>
            </span>
            <Switch checked={props.autoFitAndCenter} onChange={props.onAutoFitAndCenterChange} />
          </label>
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span className="flex flex-col">
              <span className="text-sm font-medium text-ink">Compress Large Images</span>
              <span className="text-[10px] text-ink-faint font-normal">Pre-compress page images to boost Gemini AI analytical processing speeds</span>
            </span>
            <Switch checked={props.compressBeforeProcessing} onChange={props.onCompressBeforeProcessingChange} />
          </label>
        </div>
      </GlassCard>

      <GlassCard className="p-6 space-y-3">
        <h4 className="text-sm font-semibold text-ink">Cleaned ZIP Match Mode</h4>
        <select
          value={props.zipMatchMode}
          onChange={(e) => props.onZipMatchModeChange(e.target.value as 'filename' | 'index')}
          className="w-full bg-ink/5 border border-hairline rounded-xl p-2.5 text-sm text-ink focus:border-accent outline-none"
        >
          <option value="filename">Match by Filename (Recommended)</option>
          <option value="index">Match by Order (Index)</option>
        </select>
        <p className="text-[11px] text-ink-faint">How to map uploaded cleaned images to the original ones.</p>
      </GlassCard>
    </div>
  );
}
