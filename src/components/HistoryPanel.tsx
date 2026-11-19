import { useMemo, useState } from 'react';
import { BookmarkPlus, Copy, Search, Trash2, Volume2 } from 'lucide-react';
import type { TranslationResult } from '../types/translation';

interface HistoryPanelProps {
  history: TranslationResult[];
  onSpeakEnglish: (text: string) => void;
  onSaveToGlossary: (mongolian: string, english: string, category: string) => void;
  onDeleteItem: (id: string) => void;
  onClearHistory: () => void;
  onJumpToTranslator: () => void;
}

type HistoryFilter = 'all' | 'cloud' | 'offline';

export function HistoryPanel({
  history,
  onSpeakEnglish,
  onSaveToGlossary,
  onDeleteItem,
  onClearHistory,
  onJumpToTranslator,
}: HistoryPanelProps) {
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [query, setQuery] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return history.filter((item) => {
      if (filter === 'cloud' && item.isOffline) return false;
      if (filter === 'offline' && !item.isOffline) return false;
      if (!q) return true;
      return (
        item.mongolian.toLowerCase().includes(q) ||
        item.english.toLowerCase().includes(q) ||
        item.intent.toLowerCase().includes(q)
      );
    });
  }, [history, filter, query]);

  const handleSave = (item: TranslationResult) => {
    onSaveToGlossary(item.mongolian, item.english, 'History');
    setSavedId(item.id);
    window.setTimeout(() => setSavedId(null), 1500);
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Translation History
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Chronological log of Mongolian-to-English speech translations persisted locally on this device.
          </p>
        </div>

        {history.length > 0 && (
          <button
            type="button"
            onClick={onClearHistory}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Clear History</span>
          </button>
        )}
      </section>

      {/* Filter & Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="group"
          aria-label="Filter translation history"
          className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 self-start"
        >
          {(
            [
              { id: 'all', label: `All (${history.length})` },
              {
                id: 'cloud',
                label: `Cloud (${history.filter((h) => !h.isOffline).length})`,
              },
              {
                id: 'offline',
                label: `Offline (${history.filter((h) => h.isOffline).length})`,
              },
            ] as const
          ).map((tab) => {
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                aria-pressed={active}
                className={`min-h-[36px] rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  active ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <label htmlFor="history-search" className="sr-only">
            Search translation history
          </label>
          <input
            id="history-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Mongolian, English, intent..."
            className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          />
        </div>
      </div>

      {/* History List / Empty State */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
          <p className="font-display text-base font-semibold text-slate-900">
            {history.length === 0 ? 'No translations recorded yet' : 'No matching entries found'}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {history.length === 0
              ? 'Capture Mongolian speech or run a sample utterance in the Translator to populate your session log.'
              : 'Adjust your search query or engine filter to view other translations.'}
          </p>
          {history.length === 0 && (
            <button
              type="button"
              onClick={onJumpToTranslator}
              className="mt-4 inline-flex min-h-[40px] items-center rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              Open Translator
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
          {filtered.map((item) => (
            <article
              key={item.id}
              className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-slate-50/70 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-medium text-slate-900">{item.mongolian}</p>
                <p className="text-sm font-semibold text-blue-900">{item.english}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className={item.isOffline ? 'font-medium text-amber-700' : 'font-medium text-emerald-700'}>
                    {item.isOffline ? 'Offline' : 'Cloud'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">{item.engine}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">{item.intent}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">{item.latencyMs}ms</span>
                  <span aria-hidden="true">·</span>
                  <time className="font-mono" dateTime={item.timestamp}>
                    {new Date(item.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </time>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onSpeakEnglish(item.english)}
                  aria-label={`Speak translation "${item.english}"`}
                  className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  <Volume2 className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(item.english)}
                  aria-label={`Copy translation "${item.english}"`}
                  className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  <Copy className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => handleSave(item)}
                  aria-label={`Save "${item.mongolian}" to offline glossary`}
                  className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  <BookmarkPlus className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                  <span>{savedId === item.id ? 'Saved' : 'Pin Offline'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteItem(item.id)}
                  aria-label={`Delete entry "${item.mongolian}"`}
                  className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
