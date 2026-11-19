import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Check,
  Copy,
  Mic,
  Square,
  Upload,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';
import { SAMPLE_UTTERANCES } from '../engine/offlineLexicon';
import type {
  EngineMode,
  RecognitionStatus,
  TranslationResult,
} from '../types/translation';
import { WaveformCanvas } from './WaveformCanvas';

interface TranslatorWorkspaceProps {
  engineMode: EngineMode;
  onChangeEngineMode: (mode: EngineMode) => void;
  isOnline: boolean;
  geminiConfigured: boolean;
  canUseCloud: boolean;
  status: RecognitionStatus;
  errorMsg: string | null;
  onDismissError: () => void;
  statusNote: string;
  interimMongolian: string;
  activeResult: TranslationResult | null;
  autoSpeakEnglish: boolean;
  onToggleAutoSpeak: () => void;
  elapsedMs: number;
  audioLevel: number;
  analyserNode: AnalyserNode | null;
  onStartListening: () => void;
  onStopListening: () => void;
  onTranslateText: (text: string) => Promise<TranslationResult | null>;
  onTranslateAudioFile: (file: File) => Promise<TranslationResult | null>;
  onSpeakEnglish: (text: string) => void;
}

function formatElapsed(ms: number): string {
  const totalTenths = Math.floor(ms / 100);
  const tenths = totalTenths % 10;
  const totalSeconds = Math.floor(totalTenths / 10);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

function formatEngineLabel(engine: TranslationResult['engine']): string {
  switch (engine) {
    case 'gemini-live':
      return 'Gemini Live Stream';
    case 'gemini-audio':
      return 'Gemini Audio Transcribe';
    case 'gemini-text':
      return 'Gemini Cloud';
    case 'offline-cache':
      return 'Offline Cache';
    case 'offline-glossary':
      return 'Offline Glossary';
    case 'offline-phrasebook':
      return 'Offline Phrasebook';
    case 'offline-morphology':
      return 'Offline Morphology';
  }
}

export function TranslatorWorkspace({
  engineMode,
  onChangeEngineMode,
  isOnline,
  geminiConfigured,
  canUseCloud,
  status,
  errorMsg,
  onDismissError,
  statusNote,
  interimMongolian,
  activeResult,
  autoSpeakEnglish,
  onToggleAutoSpeak,
  elapsedMs,
  audioLevel,
  analyserNode,
  onStartListening,
  onStopListening,
  onTranslateText,
  onTranslateAudioFile,
  onSpeakEnglish,
}: TranslatorWorkspaceProps) {
  const [manualInput, setManualInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<'mn' | 'en' | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await onTranslateAudioFile(file);
  };

  const isListening = status === 'listening' || status === 'connecting';
  const isProcessing = status === 'processing';
  const effectiveOffline = engineMode === 'offline' || !canUseCloud;

  const handleManualSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) {
      setInputError('Enter a Mongolian Cyrillic phrase before translating.');
      return;
    }
    setInputError(null);
    await onTranslateText(manualInput);
  };

  const handleSampleClick = async (mongolian: string) => {
    setInputError(null);
    setManualInput(mongolian);
    await onTranslateText(mongolian);
  };

  const handleCopy = async (text: string, field: 'mn' | 'en') => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 1500);
    } catch {
      // Clipboard unavailable in restricted context
    }
  };

  const displayedMongolian =
    isListening && interimMongolian
      ? interimMongolian
      : activeResult?.mongolian || interimMongolian || '';

  return (
    <div className="space-y-6">
      {/* Page Title & Workspace Toolbar */}
      <section className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
        <div className="max-w-xl">
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Mongolian to English Speech Translator
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Real-time voice recognition (mn-MN) with automatic offline morphological fallback for your personal assistant.
          </p>
        </div>

        {/* Workspace Controls */}
        <div className="flex flex-wrap items-center gap-3 shrink-0 lg:flex-nowrap">
          <div
            role="group"
            aria-label="Translation engine mode"
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1"
          >
            {(
              [
                { id: 'auto', label: 'Auto' },
                { id: 'cloud', label: 'Cloud Live' },
                { id: 'offline', label: 'Offline Engine' },
              ] as const
            ).map((opt) => {
              const active = engineMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeEngineMode(opt.id)}
                  aria-pressed={active}
                  className={`min-h-[36px] rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                    active
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onToggleAutoSpeak}
            aria-pressed={autoSpeakEnglish}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
              autoSpeakEnglish
                ? 'border-blue-200 bg-blue-50 text-blue-800'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {autoSpeakEnglish ? (
              <Volume2 className="h-4 w-4 text-blue-700" aria-hidden="true" />
            ) : (
              <VolumeX className="h-4 w-4 text-slate-500" aria-hidden="true" />
            )}
            <span>{autoSpeakEnglish ? 'Voice Output On' : 'Voice Output Off'}</span>
          </button>
        </div>
      </section>

      {/* Connectivity & Runtime Status Line (Clean unboxed text, no pills) */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-2">
          {effectiveOffline ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-amber-700">
              <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {!isOnline
                  ? 'Network Offline · Local Engine Active'
                  : engineMode === 'offline'
                    ? 'Forced Offline Mode · Local Engine Active'
                    : 'Cloud Key Unconfigured · Local Offline Engine Active'}
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
              <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Cloud Ready · Gemini Live & Offline Cache Armed</span>
            </span>
          )}
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          <span className="text-slate-600">{statusNote}</span>
        </div>

        <div className="font-mono text-slate-500">
          {isOnline ? (geminiConfigured ? 'API Connected' : 'Local Fallback') : 'Offline Ready'}
        </div>
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div
          role="alert"
          className="flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          <p>{errorMsg}</p>
          <button
            type="button"
            onClick={onDismissError}
            className="shrink-0 text-xs font-medium text-red-700 underline hover:text-red-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Voice Capture Console */}
      <section
        aria-label="Voice capture console"
        className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            {!isListening ? (
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={onStartListening}
                  disabled={isProcessing}
                  className="inline-flex min-h-[48px] items-center gap-2.5 rounded-xl bg-blue-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                >
                  <Mic className="h-4 w-4" aria-hidden="true" />
                  <span>{isProcessing ? 'Translating Audio...' : 'Start Listening'}</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={handleFileChange}
                  className="sr-only"
                  aria-label="Upload Mongolian audio file"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessing}
                  className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  <Upload className="h-4 w-4 text-slate-500" aria-hidden="true" />
                  <span>Upload Audio</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onStopListening}
                className="inline-flex min-h-[48px] items-center gap-2.5 rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
              >
                <Square className="h-4 w-4 fill-current" aria-hidden="true" />
                <span>Stop & Translate</span>
              </button>
            )}

            <div className="flex flex-col">
              <span className="text-xs font-medium text-slate-500">
                {isListening ? 'Recording mn-MN' : isProcessing ? 'Processing' : 'Capture Timer'}
              </span>
              <span
                data-testid="capture-timer"
                className="font-mono text-lg font-semibold text-slate-900"
              >
                {formatElapsed(elapsedMs)}
              </span>
            </div>
          </div>

          <div className="flex-1 lg:max-w-md">
            <WaveformCanvas
              active={isListening}
              analyserNode={analyserNode}
              audioLevel={audioLevel}
              isOffline={effectiveOffline}
            />
          </div>
        </div>

        {/* Manual / Dictation Input + Sample Utterances */}
        <div className="mt-5 border-t border-slate-100 pt-5 space-y-4">
          <form onSubmit={handleManualSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="flex-1">
              <label htmlFor="mongolian-input" className="sr-only">
                Mongolian Cyrillic phrase or live transcript
              </label>
              <input
                id="mongolian-input"
                type="text"
                value={manualInput}
                onChange={(e) => {
                  setManualInput(e.target.value);
                  if (inputError) setInputError(null);
                }}
                placeholder="Speak via microphone or type Mongolian Cyrillic (supports mixed English, e.g. PDF file-ийг email-ээр send хийгээрэй)..."
                className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              />
              {inputError && (
                <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">
                  {inputError}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="submit"
                disabled={isProcessing}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <span>Translate</span>
                <ArrowRight className="h-4 w-4 text-slate-500" aria-hidden="true" />
              </button>
              {manualInput && (
                <button
                  type="button"
                  onClick={() => {
                    setManualInput('');
                    setInputError(null);
                  }}
                  aria-label="Clear input text"
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </form>

          {/* Deterministic Sample Assistant Utterances */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500 mr-1">
              Test assistant utterances:
            </span>
            {SAMPLE_UTTERANCES.map((sample) => (
              <button
                key={sample.id}
                type="button"
                onClick={() => handleSampleClick(sample.mongolian)}
                className="min-h-[36px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                {sample.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Bilingual Live Stream Split Panel */}
      <section
        aria-label="Speech recognition and translation output"
        className="grid grid-cols-1 gap-5 lg:grid-cols-2 items-stretch"
      >
        {/* Left Pane: Mongolian Recognition */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <div>
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3">
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-900">
                  Mongolian Speech (mn-MN)
                </h2>
                <p className="text-xs text-slate-500">Cyrillic transcript & phonetic readout</p>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(displayedMongolian, 'mn')}
                disabled={!displayedMongolian}
                aria-label="Copy Mongolian transcript"
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                {copiedField === 'mn' ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                )}
                <span>{copiedField === 'mn' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            <div className="mt-4 min-h-[120px]">
              {displayedMongolian ? (
                <div className="space-y-3">
                  <p
                    data-testid="mongolian-output"
                    className={`text-xl font-medium leading-relaxed ${
                      isListening ? 'text-slate-600 italic' : 'text-slate-900'
                    }`}
                  >
                    {displayedMongolian}
                  </p>
                  {activeResult?.romanization && !isListening && (
                    <p className="font-mono text-xs text-slate-500">
                      {activeResult.romanization}
                    </p>
                  )}
                  {activeResult?.englishWords && activeResult.englishWords.length > 0 && !isListening && (
                    <p data-testid="detected-english-words" className="text-xs text-slate-600">
                      <span className="font-medium text-slate-500 mr-1.5">
                        Mixed English detected:
                      </span>
                      <span className="font-mono font-medium text-blue-800">
                        {activeResult.englishWords.join(' · ')}
                      </span>
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-400">
                  Start listening or select a sample Mongolian phrase to capture speech recognition output.
                </p>
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
            <span>Locale: mn-MN</span>
            <span aria-hidden="true">·</span>
            <span>Script: Cyrillic</span>
            {activeResult && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono">
                  Confidence: {Math.round(activeResult.confidence * 100)}%
                </span>
              </>
            )}
          </div>
        </div>

        {/* Right Pane: English Translation + Assistant Intent */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <div>
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3">
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-900">
                  English Translation (en-US)
                </h2>
                <p className="text-xs text-slate-500">Assistant-ready normalized output</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => activeResult?.english && onSpeakEnglish(activeResult.english)}
                  disabled={!activeResult?.english}
                  aria-label="Speak English translation"
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  <Volume2 className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                  <span>Speak</span>
                </button>
                <button
                  type="button"
                  onClick={() => activeResult?.english && handleCopy(activeResult.english, 'en')}
                  disabled={!activeResult?.english}
                  aria-label="Copy English translation"
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  {copiedField === 'en' ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                  )}
                  <span>{copiedField === 'en' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            <div className="mt-4 min-h-[120px]">
              {isProcessing ? (
                <div className="space-y-2.5 animate-pulse" aria-label="Translating">
                  <div className="h-5 w-4/5 rounded bg-slate-200" />
                  <div className="h-5 w-2/3 rounded bg-slate-100" />
                </div>
              ) : activeResult?.english ? (
                <div className="space-y-4">
                  <p
                    data-testid="english-output"
                    className="text-xl font-semibold leading-relaxed text-slate-900"
                  >
                    {activeResult.english}
                  </p>

                  {/* Clean hairline key-value assistant metadata (no nested card) */}
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border-t border-slate-100 pt-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-slate-500">Assistant Intent</dt>
                      <dd data-testid="detected-intent" className="font-mono font-medium text-slate-900">
                        {activeResult.intent}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-slate-500">Latency</dt>
                      <dd className="font-mono font-medium text-slate-900">
                        {activeResult.latencyMs}ms
                      </dd>
                    </div>
                  </dl>

                  {activeResult.keyTerms && activeResult.keyTerms.length > 0 && (
                    <div className="border-t border-slate-100 pt-3 text-xs text-slate-600">
                      <span className="font-medium text-slate-500 mr-2 whitespace-nowrap">
                        Word Alignment:
                      </span>
                      {activeResult.keyTerms.slice(0, 6).map((pair, idx) => (
                        <span key={`${pair.mn}-${idx}`}>
                          {idx > 0 && (
                            <span aria-hidden="true" className="mx-1.5 text-slate-300">
                              ·
                            </span>
                          )}
                          <span className="text-slate-800">{pair.mn}</span>
                          <span aria-hidden="true" className="mx-1 text-slate-400">
                            →
                          </span>
                          <span className="font-medium text-blue-900">{pair.en}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-400">
                  English translation and assistant intent metadata will appear here in real time.
                </p>
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
            {activeResult ? (
              <>
                <span
                  data-testid="active-engine-label"
                  className={
                    activeResult.isOffline
                      ? 'font-medium text-amber-700'
                      : 'font-medium text-emerald-700'
                  }
                >
                  {formatEngineLabel(activeResult.engine)}
                </span>
                <span aria-hidden="true">·</span>
                <span>{activeResult.isOffline ? 'Executed Locally' : 'Cached for Offline'}</span>
              </>
            ) : (
              <span>Waiting for voice or text utterance</span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
