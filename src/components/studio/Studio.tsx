import { useEffect, useState } from 'react';
import type { Page } from '../../types';
import { StudioToolbar } from './StudioToolbar';
import { StudioCanvas } from './StudioCanvas';
import { StudioPagesPanel } from './StudioPagesPanel';

interface StudioProps {
  chapterName: string;
  pages: Page[];
  onBack: () => void;
}

export function Studio({ chapterName, pages, onBack }: StudioProps) {
  const [activePageId, setActivePageId] = useState<string | null>(pages[0]?.id ?? null);
  const [activeTool, setActiveTool] = useState('select');
  const [showCleaned, setShowCleaned] = useState(false);
  const [fitSignal, setFitSignal] = useState(0);
  const [pagesPanelOpen, setPagesPanelOpen] = useState(true);

  useEffect(() => {
    if (!pages.find(p => p.id === activePageId)) {
      setActivePageId(pages[0]?.id ?? null);
    }
  }, [pages, activePageId]);

  const activePage = pages.find(p => p.id === activePageId) ?? null;

  return (
    <div className="fixed inset-0 lg:relative lg:inset-auto flex flex-col bg-[#0b0b0d] lg:rounded-2xl lg:overflow-hidden lg:border lg:border-hairline lg:h-[calc(100vh-8.5rem)] z-30">
      <StudioToolbar
        chapterName={chapterName}
        activeTool={activeTool}
        onToolChange={setActiveTool}
        showCleaned={showCleaned}
        onToggleCleaned={() => setShowCleaned(v => !v)}
        onFit={() => setFitSignal(s => s + 1)}
        onBack={onBack}
        onTogglePagesPanel={() => setPagesPanelOpen(v => !v)}
        hasCleaned={!!activePage?.cleaned}
      />

      <div className="flex-1 flex min-h-0 flex-col lg:flex-row">
        <div className="flex-1 min-h-0 min-w-0">
          <StudioCanvas page={activePage} showCleaned={showCleaned} activeTool={activeTool} fitSignal={fitSignal} />
        </div>

        {pagesPanelOpen && pages.length > 0 && (
          <>
            <div className="hidden lg:block h-full">
              <StudioPagesPanel pages={pages} activePageId={activePageId} onSelect={setActivePageId} orientation="vertical" />
            </div>
            <div className="lg:hidden">
              <StudioPagesPanel pages={pages} activePageId={activePageId} onSelect={setActivePageId} orientation="horizontal" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
