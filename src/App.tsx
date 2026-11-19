import { useState } from 'react';
import { AssistantHookPanel } from './components/AssistantHookPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { OfflineLexiconPanel } from './components/OfflineLexiconPanel';
import { TopBar } from './components/TopBar';
import { TranslatorWorkspace } from './components/TranslatorWorkspace';
import {
  buildAssistantHookPayload,
  useSpeechToTranslation,
} from './hooks/useSpeechToTranslation';
import type { ActiveTab } from './types/translation';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('translator');
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const speech = useSpeechToTranslation();

  const handleExportJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      latestEvent: speech.activeResult
        ? buildAssistantHookPayload(speech.activeResult)
        : null,
      history: speech.history.map(buildAssistantHookPayload),
      customGlossary: speech.customGlossary,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mongolvoice-session-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setExportNotice('Exported translation session JSON.');
    window.setTimeout(() => setExportNotice(null), 2500);
  };

  return (
    <div id="top" className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onExportJson={handleExportJson}
        historyCount={speech.history.length}
      />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {exportNotice && (
          <div
            role="status"
            className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-800"
          >
            {exportNotice}
          </div>
        )}

        {activeTab === 'translator' && (
          <TranslatorWorkspace
            engineMode={speech.engineMode}
            onChangeEngineMode={speech.setEngineMode}
            isOnline={speech.isOnline}
            geminiConfigured={speech.geminiConfigured}
            canUseCloud={speech.canUseCloud}
            status={speech.status}
            errorMsg={speech.errorMsg}
            onDismissError={() => speech.setErrorMsg(null)}
            statusNote={speech.statusNote}
            interimMongolian={speech.interimMongolian}
            activeResult={speech.activeResult}
            autoSpeakEnglish={speech.autoSpeakEnglish}
            onToggleAutoSpeak={() => speech.setAutoSpeakEnglish((v) => !v)}
            elapsedMs={speech.elapsedMs}
            audioLevel={speech.audioLevel}
            analyserNode={speech.analyserNode}
            onStartListening={speech.startListening}
            onStopListening={speech.stopListening}
            onTranslateText={(text) => speech.translateMongolianText(text)}
            onTranslateAudioFile={(file) => speech.translateAudioFile(file)}
            onSpeakEnglish={speech.speakEnglish}
          />
        )}

        {activeTab === 'history' && (
          <HistoryPanel
            history={speech.history}
            onSpeakEnglish={speech.speakEnglish}
            onSaveToGlossary={speech.addGlossaryEntry}
            onDeleteItem={speech.deleteHistoryItem}
            onClearHistory={speech.clearHistory}
            onJumpToTranslator={() => setActiveTab('translator')}
          />
        )}

        {activeTab === 'lexicon' && (
          <OfflineLexiconPanel
            customGlossary={speech.customGlossary}
            cachedTranslations={speech.cachedTranslations}
            onAddGlossaryEntry={speech.addGlossaryEntry}
            onRemoveGlossaryEntry={speech.removeGlossaryEntry}
            onClearOfflineCache={speech.clearOfflineCache}
          />
        )}

        {activeTab === 'hook' && (
          <AssistantHookPanel activeResult={speech.activeResult} />
        )}
      </main>
    </div>
  );
}
