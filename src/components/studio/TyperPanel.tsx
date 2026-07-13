import { useMemo, useState } from 'react';
import { Target, RotateCcw } from 'lucide-react';
import { Textarea, IconButton } from '../ui';
import { cn } from '../ui/cn';
import { parseTyperScript, type TyperStyle } from './studioTypes';

interface TyperPanelProps {
  script: string;
  onScriptChange: (script: string) => void;
  styles: TyperStyle[];
  onStylesChange: (styles: TyperStyle[]) => void;
  index: number;
  onIndexChange: (index: number) => void;
  armed: boolean;
  onArmedChange: (armed: boolean) => void;
}

export function TyperPanel({
  script, onScriptChange, styles, onStylesChange, index, onIndexChange, armed, onArmedChange,
}: TyperPanelProps) {
  const [editingStyleId, setEditingStyleId] = useState<string | null>(null);
  const lines = useMemo(() => parseTyperScript(script, styles), [script, styles]);
  const current = lines[index] ?? null;
  const done = lines.length > 0 && index >= lines.length;

  function updateStyle(id: string, patch: Partial<TyperStyle>) {
    onStylesChange(styles.map(s => s.id === id ? { ...s, ...patch } : s));
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-3 h-10 shrink-0 border-b border-hairline">
        <span className="text-xs font-display font-semibold text-ink-faint uppercase tracking-wide">TypeR</span>
        <IconButton
          size="sm"
          aria-label="Reset progress"
          title="Reset progress"
          onClick={() => { onIndexChange(0); onArmedChange(false); }}
          className="!bg-transparent"
        >
          <RotateCcw size={13} />
        </IconButton>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 flex flex-col gap-3">
        <Textarea
          value={script}
          onChange={(e) => { onScriptChange(e.target.value); onIndexChange(0); }}
          placeholder={'Paste a script, one line per bubble.\nPrefix lines to pick a style, e.g.\n!! for SFX, ~ for Thought.\n## note (ignored)'}
          rows={6}
          className="!text-xs !font-mono"
        />

        <div className="flex items-center justify-between text-[11px] text-ink-faint">
          <span>{lines.length > 0 ? `Line ${Math.min(index + 1, lines.length)} / ${lines.length}` : 'No lines yet'}</span>
          {current && <span className="px-1.5 py-0.5 rounded bg-accent-soft text-accent">{current.style.name}</span>}
        </div>

        {current && (
          <div className="rounded-lg border border-hairline bg-ink/[0.03] px-2.5 py-2 text-xs text-ink truncate">
            {current.content}
          </div>
        )}
        {done && <div className="text-[11px] text-ink-faint italic">All lines placed.</div>}

        <button
          type="button"
          disabled={lines.length === 0 || done}
          onClick={() => onArmedChange(!armed)}
          className={cn(
            'flex items-center justify-center gap-2 h-9 rounded-lg text-xs font-medium border transition-colors',
            'disabled:opacity-40 disabled:pointer-events-none',
            armed ? 'bg-accent text-white border-accent' : 'bg-ink/5 border-hairline text-ink hover:bg-ink/10'
          )}
        >
          <Target size={14} />
          {armed ? 'Armed — click the canvas to place' : 'Arm placement'}
        </button>

        <div className="flex flex-col gap-2 pt-2 border-t border-hairline/60">
          <span className="text-[11px] text-ink-faint">Styles</span>
          {styles.map(style => {
            const expanded = editingStyleId === style.id;
            return (
              <div key={style.id} className="rounded-lg border border-hairline bg-ink/[0.03]">
                <button
                  type="button"
                  onClick={() => setEditingStyleId(expanded ? null : style.id)}
                  className="w-full flex items-center gap-2 px-2.5 h-9 text-left"
                >
                  <span className="text-xs font-medium text-ink flex-1 truncate">{style.name}</span>
                  {style.prefix && <span className="text-[10px] font-mono text-ink-faint">{style.prefix}</span>}
                </button>
                {expanded && (
                  <div className="px-2.5 pb-2.5 flex flex-col gap-2 border-t border-hairline/60">
                    <label className="flex items-center gap-2 text-[11px] text-ink-faint pt-2">
                      <span className="w-14 shrink-0">Prefix</span>
                      <input
                        value={style.prefix}
                        onChange={(e) => updateStyle(style.id, { prefix: e.target.value })}
                        className="flex-1 bg-ink/5 border border-hairline rounded-md px-1.5 py-1 text-ink text-[11px] font-mono"
                      />
                    </label>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 text-[11px] text-ink-faint flex-1">
                        <span className="shrink-0">Size</span>
                        <input
                          type="number"
                          min={6}
                          max={200}
                          value={style.fontSize}
                          onChange={(e) => updateStyle(style.id, { fontSize: Number(e.target.value) || style.fontSize })}
                          className="w-full bg-ink/5 border border-hairline rounded-md px-1.5 py-1 text-ink text-[11px]"
                        />
                      </label>
                      <input
                        type="color"
                        value={style.color}
                        onChange={(e) => updateStyle(style.id, { color: e.target.value })}
                        className="w-8 h-7 rounded-md border border-hairline bg-transparent"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <IconButton size="sm" active={style.bold} aria-label="Bold" onClick={() => updateStyle(style.id, { bold: !style.bold })} className="!bg-transparent !w-7 !h-7">
                        <span className="text-xs font-bold">B</span>
                      </IconButton>
                      <IconButton size="sm" active={style.italic} aria-label="Italic" onClick={() => updateStyle(style.id, { italic: !style.italic })} className="!bg-transparent !w-7 !h-7">
                        <span className="text-xs italic">I</span>
                      </IconButton>
                      <div className="w-px h-5 bg-hairline mx-1" />
                      <input
                        type="color"
                        title="Stroke color"
                        value={style.strokeColor}
                        onChange={(e) => updateStyle(style.id, { strokeColor: e.target.value })}
                        className="w-7 h-7 rounded-md border border-hairline bg-transparent"
                      />
                      <input
                        type="range"
                        min={0}
                        max={8}
                        step={0.5}
                        value={style.strokeWidth}
                        onChange={(e) => updateStyle(style.id, { strokeWidth: Number(e.target.value) })}
                        className="flex-1 accent-[var(--color-accent)]"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
