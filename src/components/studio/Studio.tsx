import { useEffect, useMemo, useRef, useState } from 'react';
import type { Page } from '../../types';
import { StudioToolbar } from './StudioToolbar';
import { StudioCanvas, type StudioCanvasHandle } from './StudioCanvas';
import { StudioPagesPanel } from './StudioPagesPanel';
import { ToolRail } from './ToolRail';
import { RightDock } from './RightDock';
import { LayersPanel } from './LayersPanel';
import { TextPanel } from './TextPanel';
import { TyperPanel } from './TyperPanel';
import {
  createBackgroundLayer, createLayer, createTextLayer, parseTyperScript,
  DEFAULT_TYPER_STYLES, type StudioLayer, type TextLayerData, type TyperStyle,
} from './studioTypes';

interface StudioProps {
  chapterName: string;
  pages: Page[];
  onBack: () => void;
}

export function Studio({ chapterName, pages, onBack }: StudioProps) {
  const canvasRef = useRef<StudioCanvasHandle>(null);
  const [activePageId, setActivePageId] = useState<string | null>(pages[0]?.id ?? null);
  const [activeTool, setActiveTool] = useState('select');
  const [showCleaned, setShowCleaned] = useState(false);
  const [fitSignal, setFitSignal] = useState(0);
  const [dockOpen, setDockOpen] = useState(true);

  // Per-page layer stacks. Each page always has a locked "Background" layer at index 0.
  const [layersByPage, setLayersByPage] = useState<Record<string, StudioLayer[]>>({});
  const [activeLayerId, setActiveLayerId] = useState<string | null>('background');
  const [dockTab, setDockTab] = useState('layers');

  // TypeR: scripted lettering — paste a script, arm it, click bubbles to stamp lines in order.
  const [typerScript, setTyperScript] = useState('');
  const [typerStyles, setTyperStyles] = useState<TyperStyle[]>(DEFAULT_TYPER_STYLES);
  const [typerIndex, setTyperIndex] = useState(0);
  const [typerArmed, setTyperArmed] = useState(false);
  const typerLines = useMemo(() => parseTyperScript(typerScript, typerStyles), [typerScript, typerStyles]);

  useEffect(() => {
    if (!pages.find(p => p.id === activePageId)) {
      setActivePageId(pages[0]?.id ?? null);
    }
  }, [pages, activePageId]);

  const activePage = pages.find(p => p.id === activePageId) ?? null;

  const layers = useMemo(() => {
    if (!activePageId) return [];
    return layersByPage[activePageId] ?? [createBackgroundLayer()];
  }, [layersByPage, activePageId]);

  function updateLayers(updater: (current: StudioLayer[]) => StudioLayer[]) {
    if (!activePageId) return;
    setLayersByPage(prev => ({
      ...prev,
      [activePageId]: updater(prev[activePageId] ?? [createBackgroundLayer()]),
    }));
  }

  function handleAddLayer() {
    const layer = createLayer('clean-patch', `Layer ${layers.length}`);
    updateLayers(current => [...current, layer]);
    setActiveLayerId(layer.id);
  }

  function selectLayer(id: string) {
    setActiveLayerId(id);
    if (layers.find(l => l.id === id)?.type === 'text') setDockTab('text');
  }

  function handleDuplicateLayer(id: string) {
    const source = layers.find(l => l.id === id);
    if (!source || source.isBackground) return;
    const copy: StudioLayer = { ...source, id: `${source.id}-copy-${Date.now()}`, name: `${source.name} copy` };
    updateLayers(current => {
      const index = current.findIndex(l => l.id === id);
      const next = [...current];
      next.splice(index + 1, 0, copy);
      return next;
    });
    setActiveLayerId(copy.id);
  }

  function handleDeleteLayer(id: string) {
    updateLayers(current => current.filter(l => l.id !== id));
    setActiveLayerId('background');
  }

  function handleMoveLayer(id: string, direction: 'up' | 'down') {
    updateLayers(current => {
      const index = current.findIndex(l => l.id === id);
      const swapWith = direction === 'up' ? index + 1 : index - 1;
      if (swapWith < 0 || swapWith >= current.length || current[swapWith].isBackground) return current;
      const next = [...current];
      [next[index], next[swapWith]] = [next[swapWith], next[index]];
      return next;
    });
  }

  function handleToggleVisible(id: string) {
    updateLayers(current => current.map(l => l.id === id ? { ...l, visible: !l.visible } : l));
  }

  function handleToggleLocked(id: string) {
    updateLayers(current => current.map(l => l.id === id ? { ...l, locked: !l.locked } : l));
  }

  function handleOpacityChange(id: string, opacity: number) {
    updateLayers(current => current.map(l => l.id === id ? { ...l, opacity } : l));
  }

  function handleBlendChange(id: string, blendMode: StudioLayer['blendMode']) {
    updateLayers(current => current.map(l => l.id === id ? { ...l, blendMode } : l));
  }

  function handleAddTextLayer(x: number, y: number) {
    const layer = createTextLayer(x, y);

    if (typerArmed && typerLines[typerIndex]) {
      const { content, style } = typerLines[typerIndex];
      layer.name = `Text: ${content.slice(0, 20)}`;
      layer.text = {
        ...layer.text!,
        content,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        color: style.color,
        bold: style.bold,
        italic: style.italic,
        strokeColor: style.strokeColor,
        strokeWidth: style.strokeWidth,
      };
      updateLayers(current => [...current, layer]);
      setActiveLayerId(layer.id);
      const nextIndex = typerIndex + 1;
      setTyperIndex(nextIndex);
      if (nextIndex >= typerLines.length) setTyperArmed(false);
      return;
    }

    updateLayers(current => [...current, layer]);
    setActiveLayerId(layer.id);
    setActiveTool('select');
    setDockTab('text');
  }

  function handleUpdateTextLayer(id: string, patch: Partial<TextLayerData>) {
    updateLayers(current => current.map(l =>
      l.id === id && l.type === 'text' && l.text ? { ...l, text: { ...l.text, ...patch } } : l
    ));
  }

  function handleCenterTextLayer(id: string) {
    canvasRef.current?.centerTextLayerInBubble(id);
  }

  const activeLayer = layers.find(l => l.id === activeLayerId) ?? null;

  const layersPanel = (
    <LayersPanel
      layers={layers}
      activeLayerId={activeLayerId}
      onSelect={selectLayer}
      onToggleVisible={handleToggleVisible}
      onToggleLocked={handleToggleLocked}
      onOpacityChange={handleOpacityChange}
      onBlendChange={handleBlendChange}
      onAdd={handleAddLayer}
      onDuplicate={handleDuplicateLayer}
      onDelete={handleDeleteLayer}
      onMove={handleMoveLayer}
    />
  );

  const pagesPanel = (
    <StudioPagesPanel pages={pages} activePageId={activePageId} onSelect={setActivePageId} orientation="vertical" />
  );

  const textPanel = activeLayer?.type === 'text' ? (
    <TextPanel layer={activeLayer} onUpdate={handleUpdateTextLayer} onCenter={handleCenterTextLayer} />
  ) : null;

  const typerPanel = (
    <TyperPanel
      script={typerScript}
      onScriptChange={setTyperScript}
      styles={typerStyles}
      onStylesChange={setTyperStyles}
      index={typerIndex}
      onIndexChange={setTyperIndex}
      armed={typerArmed}
      onArmedChange={(armed) => { setTyperArmed(armed); if (armed) setActiveTool('text'); }}
    />
  );

  return (
    <div className="fixed inset-0 lg:relative lg:inset-auto flex flex-col bg-[#0b0b0d] lg:rounded-2xl lg:overflow-hidden lg:border lg:border-hairline lg:h-[calc(100vh-8.5rem)] z-30">
      <StudioToolbar
        chapterName={chapterName}
        showCleaned={showCleaned}
        onToggleCleaned={() => setShowCleaned(v => !v)}
        onFit={() => setFitSignal(s => s + 1)}
        onBack={onBack}
        onToggleDock={() => setDockOpen(v => !v)}
        hasCleaned={!!activePage?.cleaned}
      />

      <div className="flex-1 flex min-h-0 flex-col-reverse lg:flex-row">
        <div className="lg:hidden">
          <ToolRail activeTool={activeTool} onToolChange={setActiveTool} orientation="horizontal" />
        </div>
        <div className="hidden lg:block h-full">
          <ToolRail activeTool={activeTool} onToolChange={setActiveTool} orientation="vertical" />
        </div>

        <div className="flex-1 min-h-0 min-w-0">
          <StudioCanvas
            ref={canvasRef}
            page={activePage}
            showCleaned={showCleaned}
            activeTool={activeTool}
            fitSignal={fitSignal}
            layers={layers}
            activeLayerId={activeLayerId}
            onSelectLayer={selectLayer}
            onAddTextLayer={handleAddTextLayer}
            onUpdateTextLayer={handleUpdateTextLayer}
          />
        </div>

        {dockOpen && (
          <>
            <div className="hidden lg:block h-full">
              <RightDock
                activeTab={dockTab}
                onTabChange={setDockTab}
                tabs={[
                  ...(textPanel ? [{ id: 'text', label: 'Text', content: textPanel }] : []),
                  { id: 'typer', label: 'TypeR', content: typerPanel },
                  { id: 'layers', label: 'Layers', content: layersPanel },
                  { id: 'pages', label: 'Pages', content: pagesPanel },
                ]}
              />
            </div>
            <div className="lg:hidden absolute inset-x-0 bottom-12 h-[45vh] z-10">
              <RightDock
                activeTab={dockTab}
                onTabChange={setDockTab}
                className="!w-full !border-l-0 border-t border-hairline rounded-t-2xl"
                tabs={[
                  ...(textPanel ? [{ id: 'text', label: 'Text', content: textPanel }] : []),
                  { id: 'typer', label: 'TypeR', content: typerPanel },
                  { id: 'pages', label: 'Pages', content: <StudioPagesPanel pages={pages} activePageId={activePageId} onSelect={setActivePageId} orientation="horizontal" /> },
                  { id: 'layers', label: 'Layers', content: layersPanel },
                ]}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
