import { useMemo, useState, type FormEvent } from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';
import { CORE_LEXICON, PHRASEBOOK } from '../engine/offlineLexicon';
import { translateOffline } from '../engine/offlineTranslator';
import type { GlossaryEntry } from '../types/translation';

interface OfflineLexiconPanelProps {
  customGlossary: GlossaryEntry[];
  cachedTranslations: Record<string, string>;
  onAddGlossaryEntry: (mongolian: string, english: string, category: string) => boolean;
  onRemoveGlossaryEntry: (id: string) => void;
  onClearOfflineCache: () => void;
}

export function OfflineLexiconPanel({
  customGlossary,
  cachedTranslations,
  onAddGlossaryEntry,
  onRemoveGlossaryEntry,
  onClearOfflineCache,
}: OfflineLexiconPanelProps) {
  const [newMn, setNewMn] = useState('');
  const [newEn, setNewEn] = useState('');
  const [newCategory, setNewCategory] = useState('Custom');
  const [formError, setFormError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sandboxText, setSandboxText] = useState('Уулзалтуудыг маргааш шалгаарай');

  const cachedPairs = useMemo(
    () => Object.entries(cachedTranslations),
    [cachedTranslations]
  );

  const sandboxResult = useMemo(() => {
    if (!sandboxText.trim()) return null;
    return translateOffline(sandboxText, {
      customGlossary,
      cachedTranslations,
    });
  }, [sandboxText, customGlossary, cachedTranslations]);

  const filteredPhrasebook = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return PHRASEBOOK.slice(0, 20);
    return PHRASEBOOK.filter(
      (p) =>
        p.mn.toLowerCase().includes(q) ||
        p.en.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const handleAddSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!newMn.trim() || !newEn.trim()) {
      setFormError('Both Mongolian Cyrillic and English translation are required.');
      return;
    }
    setFormError(null);
    onAddGlossaryEntry(newMn, newEn, newCategory);
    setNewMn('');
    setNewEn('');
  };

  return (
    <div className="space-y-6">
      <section className="border-b border-slate-200 pb-5">
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
          Offline Translation Lexicon & Cache
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Local phrasebook, morphological stems, custom assistant terms, and cached cloud translations available with zero internet connectivity.
        </p>
      </section>

      {/* 4-Column Offline Readiness Strip */}
      <section
        aria-label="Offline lexicon capacity"
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
      >
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Assistant Phrases</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-slate-900">
            {PHRASEBOOK.length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Morphological Stems</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-slate-900">
            {Object.keys(CORE_LEXICON).length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Custom Glossary</p>
          <p
            data-testid="custom-glossary-count"
            className="mt-1 font-mono text-2xl font-semibold text-slate-900"
          >
            {customGlossary.length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Cached Cloud Phrases</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-slate-900">
            {cachedPairs.length}
          </p>
        </div>
      </section>

      {/* Add Custom Glossary Entry & Offline Sandbox */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 items-stretch">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Add Custom Offline Term
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Custom terms take priority over built-in offline rules and guide cloud translation.
          </p>

          <form onSubmit={handleAddSubmit} className="mt-4 space-y-3">
            <div>
              <label htmlFor="glossary-mn" className="block text-xs font-medium text-slate-700">
                Mongolian (Cyrillic)
              </label>
              <input
                id="glossary-mn"
                type="text"
                value={newMn}
                onChange={(e) => {
                  setNewMn(e.target.value);
                  if (formError) setFormError(null);
                }}
                placeholder="e.g. Багийн уулзалт"
                className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label htmlFor="glossary-en" className="block text-xs font-medium text-slate-700">
                  English Translation
                </label>
                <input
                  id="glossary-en"
                  type="text"
                  value={newEn}
                  onChange={(e) => {
                    setNewEn(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="e.g. Team standup"
                  className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                />
              </div>

              <div>
                <label htmlFor="glossary-cat" className="block text-xs font-medium text-slate-700">
                  Category
                </label>
                <input
                  id="glossary-cat"
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                />
              </div>
            </div>

            {formError && (
              <p role="alert" className="text-xs font-medium text-red-600">
                {formError}
              </p>
            )}

            <button
              type="submit"
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-800 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Save to Offline Glossary</span>
            </button>
          </form>
        </section>

        {/* Instant Offline Engine Tester */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Offline Morphological Sandbox
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Test how unseen inflected Mongolian sentences resolve locally without network access.
            </p>

            <div className="mt-4">
              <label htmlFor="offline-sandbox" className="block text-xs font-medium text-slate-700">
                Test Mongolian Phrase
              </label>
              <input
                id="offline-sandbox"
                type="text"
                value={sandboxText}
                onChange={(e) => setSandboxText(e.target.value)}
                className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              />
            </div>

            {sandboxResult && (
              <div className="mt-4 border-t border-slate-100 pt-3 space-y-1.5">
                <p className="text-sm font-semibold text-slate-900">{sandboxResult.english}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-medium text-amber-700">{sandboxResult.engine}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">{sandboxResult.intent}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">{sandboxResult.latencyMs}ms</span>
                </div>
              </div>
            )}
          </div>

          {cachedPairs.length > 0 && (
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-600">
              <span>{cachedPairs.length} cloud translation(s) cached locally</span>
              <button
                type="button"
                onClick={onClearOfflineCache}
                className="font-medium text-red-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded"
              >
                Clear Cache
              </button>
            </div>
          )}
        </section>
      </div>

      {/* Custom Glossary Table */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-3.5">
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Custom Glossary Entries ({customGlossary.length})
          </h2>
        </div>

        {customGlossary.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">
            No custom glossary entries yet. Add project names, contacts, or domain terms above.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {customGlossary.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-4 px-5 py-3 text-sm"
              >
                <div className="min-w-0 flex-1 grid grid-cols-1 gap-1 sm:grid-cols-3 sm:items-center">
                  <span className="font-medium text-slate-900 truncate">{entry.mongolian}</span>
                  <span className="text-slate-700 truncate">{entry.english}</span>
                  <span className="text-xs text-slate-500">{entry.category}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveGlossaryEntry(entry.id)}
                  aria-label={`Remove glossary entry "${entry.mongolian}"`}
                  className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Built-In Phrasebook Search */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Built-in Assistant Phrasebook
          </h2>
          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <label htmlFor="phrasebook-search" className="sr-only">
              Filter built-in phrasebook
            </label>
            <input
              id="phrasebook-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter built-in phrases..."
              className="min-h-[36px] w-full rounded-lg border border-slate-300 bg-slate-50 pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {filteredPhrasebook.map((phrase) => (
            <div
              key={phrase.mn}
              className="grid grid-cols-1 gap-1 px-5 py-2.5 text-xs sm:grid-cols-12 sm:items-center sm:gap-4"
            >
              <span className="font-medium text-slate-900 sm:col-span-5">{phrase.mn}</span>
              <span className="text-slate-700 sm:col-span-5">{phrase.en}</span>
              <span className="font-mono text-slate-500 sm:col-span-2 sm:text-right">
                {phrase.category}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
