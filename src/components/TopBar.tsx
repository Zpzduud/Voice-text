import type { ActiveTab } from '../types/translation';

interface TopBarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onExportJson: () => void;
  historyCount: number;
}

const NAV_ITEMS: Array<{ id: ActiveTab; label: string }> = [
  { id: 'translator', label: 'Translator' },
  { id: 'history', label: 'History' },
  { id: 'lexicon', label: 'Offline Lexicon' },
  { id: 'hook', label: 'Assistant Hook' },
];

export function TopBar({
  activeTab,
  onSelectTab,
  onExportJson,
  historyCount,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-4 py-3.5 sm:px-6">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            onSelectTab('translator');
          }}
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
        >
          MongolVoice
        </a>

        {/* Zone 2: 4 clean single-line navigation buttons */}
        <nav aria-label="Primary navigation" className="flex items-center gap-4 overflow-x-auto sm:gap-7">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            const label =
              item.id === 'history' && historyCount > 0
                ? `${item.label} (${historyCount})`
                : item.label;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`border-b-2 py-2 text-sm font-medium whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-t ${
                  isActive
                    ? 'border-blue-700 text-blue-700'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onExportJson}
            className="min-h-[40px] rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            Export JSON
          </button>
        </div>
      </div>
    </header>
  );
}
