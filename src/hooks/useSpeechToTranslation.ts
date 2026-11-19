import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { extractEnglishWords } from '../engine/codeSwitch';
import {
  detectAssistantIntent,
  normalizeMongolian,
  translateOffline,
} from '../engine/offlineTranslator';
import { romanizeMongolian } from '../engine/romanize';
import {
  base64ToInt16,
  calculateRmsLevel,
  downsampleFloat32,
  float32ToInt16,
  int16ToBase64,
  int16ToFloat32,
} from '../engine/pcmUtils';
import type {
  AssistantHookPayload,
  EngineMode,
  GlossaryEntry,
  RecognitionStatus,
  TranslationResult,
} from '../types/translation';

const STORAGE_HISTORY_KEY = 'mongolvoice_history_v1';
const STORAGE_GLOSSARY_KEY = 'mongolvoice_glossary_v1';
const STORAGE_CACHE_KEY = 'mongolvoice_cache_v1';

interface BrowserSpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string; confidence: number };
  }>;
}

function getSpeechRecognitionCtor(): (new () => BrowserSpeechRecognition) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function loadJsonStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function buildAssistantHookPayload(result: TranslationResult): AssistantHookPayload {
  return {
    event: 'speech.translation.completed',
    version: '1.0',
    sourceLocale: 'mn-MN',
    targetLocale: 'en-US',
    transcript: {
      mongolian: result.mongolian,
      romanization: result.romanization,
      englishWords: result.englishWords ?? [],
    },
    translation: {
      english: result.english,
      confidence: result.confidence,
    },
    assistantAction: {
      intent: result.intent,
      entities: result.keyTerms,
    },
    runtime: {
      engine: result.engine,
      offline: result.isOffline,
      latencyMs: result.latencyMs,
      timestamp: result.timestamp,
    },
  };
}

const SEED_GLOSSARY: GlossaryEntry[] = [
  {
    id: 'gloss-seed-1',
    mongolian: 'Хувийн туслах',
    english: 'Personal Assistant',
    category: 'Assistant',
    createdAt: '2026-11-19T00:00:00.000Z',
  },
  {
    id: 'gloss-seed-2',
    mongolian: 'Долоо хоногийн тайлан',
    english: 'Weekly status report',
    category: 'Work',
    createdAt: '2026-11-19T00:00:00.000Z',
  },
];

export function useSpeechToTranslation() {
  const [engineMode, setEngineMode] = useState<EngineMode>('auto');
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [geminiConfigured, setGeminiConfigured] = useState<boolean>(false);
  const [status, setStatus] = useState<RecognitionStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string>(
    'Ready for Mongolian voice input or instant utterance testing.'
  );

  const [interimMongolian, setInterimMongolian] = useState<string>('');
  const [activeResult, setActiveResult] = useState<TranslationResult | null>(null);
  const [autoSpeakEnglish, setAutoSpeakEnglish] = useState<boolean>(false);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [audioLevel, setAudioLevel] = useState<number>(0);

  const [history, setHistory] = useState<TranslationResult[]>(() =>
    loadJsonStorage<TranslationResult[]>(STORAGE_HISTORY_KEY, [])
  );
  const [customGlossary, setCustomGlossary] = useState<GlossaryEntry[]>(() =>
    loadJsonStorage<GlossaryEntry[]>(STORAGE_GLOSSARY_KEY, SEED_GLOSSARY)
  );
  const [cachedTranslations, setCachedTranslations] = useState<Record<string, string>>(() =>
    loadJsonStorage<Record<string, string>>(STORAGE_CACHE_KEY, {})
  );

  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const nextPlaybackTimeRef = useRef<number>(0);
  const liveInputBufferRef = useRef<string>('');
  const liveOutputBufferRef = useRef<string>('');

  // Keep latest state accessible in async audio callbacks
  const engineModeRef = useRef(engineMode);
  engineModeRef.current = engineMode;
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;
  const geminiConfiguredRef = useRef(geminiConfigured);
  geminiConfiguredRef.current = geminiConfigured;
  const glossaryRef = useRef(customGlossary);
  glossaryRef.current = customGlossary;
  const cacheRef = useRef(cachedTranslations);
  cacheRef.current = cachedTranslations;
  const autoSpeakRef = useRef(autoSpeakEnglish);
  autoSpeakRef.current = autoSpeakEnglish;

  // Persist localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(history.slice(0, 100)));
    } catch {
      // ignore storage quota
    }
  }, [history]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_GLOSSARY_KEY, JSON.stringify(customGlossary));
    } catch {
      // ignore storage quota
    }
  }, [customGlossary]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify(cachedTranslations));
    } catch {
      // ignore storage quota
    }
  }, [cachedTranslations]);

  // Monitor network & backend Gemini configuration
  useEffect(() => {
    const checkHealth = async () => {
      if (!navigator.onLine) {
        setIsOnline(false);
        return;
      }
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const data = (await res.json()) as { geminiConfigured?: boolean };
          setGeminiConfigured(Boolean(data.geminiConfigured));
          setIsOnline(true);
        }
      } catch {
        setIsOnline(false);
      }
    };

    checkHealth();
    const handleOnline = () => {
      setIsOnline(true);
      void checkHealth();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const canUseCloud = useMemo(() => {
    if (engineMode === 'offline') return false;
    return isOnline && geminiConfigured;
  }, [engineMode, isOnline, geminiConfigured]);

  const speakEnglish = useCallback(async (text: string) => {
    if (!text.trim()) return;

    // Try Gemini TTS if online and configured
    if (isOnlineRef.current && geminiConfiguredRef.current && engineModeRef.current !== 'offline') {
      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (res.ok) {
          const data = (await res.json()) as { audioBase64?: string };
          if (data.audioBase64) {
            const audio = new Audio(`data:audio/wav;base64,${data.audioBase64}`);
            await audio.play();
            return;
          }
        }
      } catch {
        // Fall through to offline browser speechSynthesis
      }
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  }, []);

  const recordResult = useCallback(
    (result: TranslationResult, shouldSpeak = false) => {
      setActiveResult(result);
      setHistory((prev) => [result, ...prev].slice(0, 100));

      // Cache successful cloud translations for future offline use
      if (!result.isOffline && result.mongolian && result.english) {
        const normKey = normalizeMongolian(result.mongolian);
        if (normKey) {
          setCachedTranslations((prev) => ({
            ...prev,
            [normKey]: result.english,
          }));
        }
      }

      if (shouldSpeak && result.english) {
        void speakEnglish(result.english);
      }
    },
    [speakEnglish]
  );

  const translateMongolianText = useCallback(
    async (rawText: string, forceOffline = false): Promise<TranslationResult | null> => {
      const text = rawText.trim();
      if (!text) {
        setErrorMsg('Please enter or speak a Mongolian phrase first.');
        return null;
      }

      setErrorMsg(null);
      const useOffline =
        forceOffline ||
        engineModeRef.current === 'offline' ||
        (!isOnlineRef.current && engineModeRef.current === 'auto') ||
        (!geminiConfiguredRef.current && engineModeRef.current === 'auto');

      if (!useOffline) {
        setStatus('processing');
        setStatusNote('Translating via Gemini cloud engine...');
        const controller = new AbortController();
        const timeoutId =
          engineModeRef.current === 'auto'
            ? window.setTimeout(() => controller.abort(), 5000)
            : null;

        try {
          const res = await fetch('/api/translate-text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              text,
              glossary: glossaryRef.current.map((g) => ({
                mongolian: g.mongolian,
                english: g.english,
              })),
            }),
          });
          if (timeoutId !== null) window.clearTimeout(timeoutId);

          if (res.ok) {
            const data = (await res.json()) as Partial<TranslationResult>;
            const mn = data.mongolian || text;
            const detectedEnglish =
              Array.isArray(data.englishWords) && data.englishWords.length > 0
                ? data.englishWords
                : extractEnglishWords(mn);
            const result: TranslationResult = {
              id: `tr-${Date.now()}`,
              mongolian: mn,
              romanization: data.romanization || romanizeMongolian(mn),
              english: data.english || '',
              englishWords: detectedEnglish,
              engine: 'gemini-text',
              isOffline: false,
              confidence: typeof data.confidence === 'number' ? data.confidence : 0.96,
              latencyMs: typeof data.latencyMs === 'number' ? data.latencyMs : 250,
              intent: data.intent || detectAssistantIntent(mn),
              keyTerms: Array.isArray(data.keyTerms) ? data.keyTerms : [],
              timestamp: new Date().toISOString(),
            };
            setStatus('idle');
            setStatusNote('Cloud translation completed and cached for offline reuse.');
            recordResult(result, autoSpeakRef.current);
            return result;
          }

          const errPayload = (await res.json().catch(() => ({}))) as { error?: string };
          if (engineModeRef.current === 'cloud') {
            setStatus('error');
            setErrorMsg(
              errPayload.error ||
                'Cloud translation failed. Switch to Auto or Offline Engine to continue locally.'
            );
            return null;
          }
          // In Auto mode, gracefully fall back to offline engine
        } catch (err) {
          if (timeoutId !== null) window.clearTimeout(timeoutId);
          if (engineModeRef.current === 'cloud') {
            setStatus('error');
            setErrorMsg(
              err instanceof Error
                ? err.message
                : 'Network error during cloud translation.'
            );
            return null;
          }
        }
      }

      // Offline translation path
      const offlineResult = translateOffline(text, {
        customGlossary: glossaryRef.current,
        cachedTranslations: cacheRef.current,
      });
      setStatus('idle');
      setStatusNote(
        offlineResult.engine === 'offline-cache'
          ? 'Matched from local offline cloud-cache.'
          : offlineResult.engine === 'offline-glossary'
            ? 'Matched from custom offline glossary.'
            : offlineResult.engine === 'offline-phrasebook'
              ? 'Translated offline via Mongolian phrasebook.'
              : 'Translated offline via Mongolian morphological analyzer.'
      );
      recordResult(offlineResult, autoSpeakRef.current);
      return offlineResult;
    },
    [recordResult]
  );

  const play24kPcmChunk = useCallback((base64Pcm: string) => {
    try {
      if (!outputAudioCtxRef.current) {
        outputAudioCtxRef.current = new AudioContext({ sampleRate: 24000 });
        nextPlaybackTimeRef.current = outputAudioCtxRef.current.currentTime;
      }
      const ctx = outputAudioCtxRef.current;
      const int16 = base64ToInt16(base64Pcm);
      const float32 = int16ToFloat32(int16);
      const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      const startAt = Math.max(ctx.currentTime, nextPlaybackTimeRef.current);
      source.start(startAt);
      nextPlaybackTimeRef.current = startAt + audioBuffer.duration;
    } catch {
      // Ignore audio playback errors if autoplay restricted
    }
  }, []);

  const cleanupAudioResources = useCallback(() => {
    if (timerIntervalRef.current !== null) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }
    if (inputAudioCtxRef.current) {
      void inputAudioCtxRef.current.close().catch(() => {});
      inputAudioCtxRef.current = null;
    }
    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  const stopListening = useCallback(async () => {
    // Stop MediaRecorder if active and submit audio blob for Gemini transcription if live English translation wasn't finalized
    const recorder = mediaRecorderRef.current;
    const shouldTranscribeRecorded =
      recorder &&
      recorder.state !== 'inactive' &&
      !liveOutputBufferRef.current.trim() &&
      engineModeRef.current !== 'offline' &&
      isOnlineRef.current &&
      geminiConfiguredRef.current;

    if (recorder && recorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.stop();
      });
    }
    mediaRecorderRef.current = null;

    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'stop' }));
      }
      wsRef.current.close();
      wsRef.current = null;
    }

    cleanupAudioResources();

    const capturedLiveMn = liveInputBufferRef.current.trim();
    const capturedLiveEn = liveOutputBufferRef.current.trim();
    liveInputBufferRef.current = '';
    liveOutputBufferRef.current = '';

    if (capturedLiveMn && capturedLiveEn) {
      const liveResult: TranslationResult = {
        id: `tr-${Date.now()}`,
        mongolian: capturedLiveMn,
        romanization: romanizeMongolian(capturedLiveMn),
        english: capturedLiveEn,
        englishWords: extractEnglishWords(capturedLiveMn),
        engine: 'gemini-live',
        isOffline: false,
        confidence: 0.96,
        latencyMs: Math.max(120, elapsedMs),
        intent: detectAssistantIntent(capturedLiveMn),
        keyTerms: [],
        timestamp: new Date().toISOString(),
      };
      recordResult(liveResult, autoSpeakRef.current);
      setInterimMongolian('');
      setStatus('idle');
      setStatusNote('Live Mongolian speech transcription & English translation finalized.');
      return;
    }

    if (shouldTranscribeRecorded && recordedChunksRef.current.length > 0) {
      setStatus('processing');
      setStatusNote('Transcribing & translating recorded Mongolian audio...');
      try {
        const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
        recordedChunksRef.current = [];
        const arrayBuf = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuf);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        }
        const audioBase64 = btoa(binary);

        const res = await fetch('/api/translate-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audioBase64,
            mimeType: blob.type || 'audio/webm',
            glossary: glossaryRef.current.map((g) => ({
              mongolian: g.mongolian,
              english: g.english,
            })),
          }),
        });

        if (res.ok) {
          const data = (await res.json()) as Partial<TranslationResult>;
          const mn = data.mongolian || '';
          const detectedEnglish =
            Array.isArray(data.englishWords) && data.englishWords.length > 0
              ? data.englishWords
              : extractEnglishWords(mn);
          const result: TranslationResult = {
            id: `tr-${Date.now()}`,
            mongolian: mn,
            romanization: data.romanization || romanizeMongolian(mn),
            english: data.english || '',
            englishWords: detectedEnglish,
            engine: 'gemini-audio',
            isOffline: false,
            confidence: typeof data.confidence === 'number' ? data.confidence : 0.94,
            latencyMs: typeof data.latencyMs === 'number' ? data.latencyMs : 450,
            intent: data.intent || detectAssistantIntent(mn),
            keyTerms: Array.isArray(data.keyTerms) ? data.keyTerms : [],
            timestamp: new Date().toISOString(),
          };
          setStatus('idle');
          setStatusNote('Audio recording transcribed and translated.');
          recordResult(result, autoSpeakRef.current);
          return;
        }
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus('error');
        setErrorMsg(errData.error || 'Could not transcribe audio clip.');
        return;
      } catch (err) {
        if (capturedLiveMn) {
          setInterimMongolian('');
          await translateMongolianText(capturedLiveMn);
          return;
        }
        setStatus('error');
        setErrorMsg(err instanceof Error ? err.message : 'Audio upload failed.');
        return;
      }
    }

    if (capturedLiveMn) {
      setInterimMongolian('');
      await translateMongolianText(capturedLiveMn);
      return;
    }

    setInterimMongolian('');
    setStatus('idle');
    setStatusNote('Listening stopped.');
  }, [cleanupAudioResources, elapsedMs, recordResult, translateMongolianText]);

  const startListening = useCallback(async () => {
    setErrorMsg(null);
    setInterimMongolian('');
    liveInputBufferRef.current = '';
    liveOutputBufferRef.current = '';
    recordedChunksRef.current = [];

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus('error');
      setErrorMsg(
        'Microphone capture is not supported in this browser context. Use the Mongolian sample buttons or text input below.'
      );
      return;
    }

    setStatus('connecting');
    setStatusNote('Requesting microphone access...');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      mediaStreamRef.current = stream;

      const audioCtx = new AudioContext();
      inputAudioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      source.connect(analyser);
      analyser.connect(processor);
      processor.connect(audioCtx.destination);

      // Start MediaRecorder for reliable chunked audio fallback
      if (typeof MediaRecorder !== 'undefined') {
        try {
          const recorder = new MediaRecorder(stream);
          recorder.ondataavailable = (ev) => {
            if (ev.data && ev.data.size > 0) {
              recordedChunksRef.current.push(ev.data);
            }
          };
          recorder.start(500);
          mediaRecorderRef.current = recorder;
        } catch {
          // MediaRecorder optional if Web Speech or Live WS handles stream
        }
      }

      const useCloudLive =
        engineModeRef.current !== 'offline' &&
        isOnlineRef.current &&
        geminiConfiguredRef.current;

      if (useCloudLive) {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${wsProtocol}//${window.location.host}/api/live-translate`);
        wsRef.current = ws;

        ws.onopen = () => {
          ws.send(JSON.stringify({ type: 'start', mode: 'live-transcribe' }));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string) as {
              type: string;
              text?: string;
              fullMongolian?: string;
              englishWords?: string[];
              intent?: TranslationResult['intent'];
              keyTerms?: TranslationResult['keyTerms'];
              data?: string;
              message?: string;
            };

            if (msg.type === 'ready') {
              setStatusNote('Connected to Gemini Live Mongolian transcription & translation.');
            } else if (msg.type === 'interim_transcript' && msg.text) {
              setInterimMongolian(msg.text);
            } else if (msg.type === 'input_transcript' && msg.text) {
              liveInputBufferRef.current = `${liveInputBufferRef.current} ${msg.text}`.trim();
              setInterimMongolian(liveInputBufferRef.current);
            } else if (msg.type === 'output_transcript' && msg.text) {
              if (msg.fullMongolian) {
                liveInputBufferRef.current = msg.fullMongolian;
                setInterimMongolian(msg.fullMongolian);
              }
              liveOutputBufferRef.current = msg.text;
              const mnText = liveInputBufferRef.current;
              const detectedEnglish =
                Array.isArray(msg.englishWords) && msg.englishWords.length > 0
                  ? msg.englishWords
                  : extractEnglishWords(mnText);
              setActiveResult({
                id: 'live-preview',
                mongolian: mnText,
                romanization: romanizeMongolian(mnText),
                english: liveOutputBufferRef.current,
                englishWords: detectedEnglish,
                engine: 'gemini-live',
                isOffline: false,
                confidence: 0.96,
                latencyMs: Date.now() - startTimeRef.current,
                intent: msg.intent || detectAssistantIntent(mnText),
                keyTerms: Array.isArray(msg.keyTerms) ? msg.keyTerms : [],
                timestamp: new Date().toISOString(),
              });
            } else if (msg.type === 'audio' && msg.data && autoSpeakRef.current) {
              play24kPcmChunk(msg.data);
            } else if (msg.type === 'error') {
              setStatusNote(
                msg.message || 'Live stream unavailable; capturing audio for chunk translation.'
              );
            }
          } catch {
            // ignore malformed ws frame
          }
        };
      }

      // Also attach browser SpeechRecognition (mn-MN) for real-time offline/local interim recognition
      const SpeechCtor = getSpeechRecognitionCtor();
      if (SpeechCtor) {
        try {
          const recognition = new SpeechCtor();
          recognition.lang = 'mn-MN';
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.maxAlternatives = 1;

          recognition.onresult = (event) => {
            let interim = '';
            let finalized = '';
            for (let i = event.resultIndex; i < event.results.length; i += 1) {
              const transcript = event.results[i][0].transcript;
              if (event.results[i].isFinal) {
                finalized += ` ${transcript}`;
              } else {
                interim += ` ${transcript}`;
              }
            }

            if (interim.trim()) {
              setInterimMongolian(`${liveInputBufferRef.current} ${interim}`.trim());
              // Instant offline preview while speaking if offline mode is active
              if (engineModeRef.current === 'offline' || !isOnlineRef.current) {
                const preview = translateOffline(interim.trim(), {
                  customGlossary: glossaryRef.current,
                  cachedTranslations: cacheRef.current,
                });
                setActiveResult({ ...preview, id: 'live-offline-preview' });
              }
            }

            if (finalized.trim()) {
              const combined = `${liveInputBufferRef.current} ${finalized}`.trim();
              liveInputBufferRef.current = combined;
              setInterimMongolian(combined);
              if (engineModeRef.current === 'offline' || !isOnlineRef.current) {
                void translateMongolianText(finalized.trim(), true);
              }
            }
          };

          recognition.onerror = () => {
            // Browser speech recognition may not have mn-MN offline pack; MediaRecorder / Live WS continues seamlessly
          };

          recognition.start();
          recognitionRef.current = recognition;
        } catch {
          // Ignore if SpeechRecognition cannot start concurrently
        }
      }

      processor.onaudioprocess = (event) => {
        const channel = event.inputBuffer.getChannelData(0);
        setAudioLevel(calculateRmsLevel(channel));

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const downsampled = downsampleFloat32(channel, audioCtx.sampleRate, 16000);
          const pcm16 = float32ToInt16(downsampled);
          const b64 = int16ToBase64(pcm16);
          wsRef.current.send(JSON.stringify({ type: 'audio', data: b64 }));
        }
      };

      startTimeRef.current = Date.now();
      setElapsedMs(0);
      timerIntervalRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startTimeRef.current);
      }, 100);

      setStatus('listening');
      setStatusNote(
        useCloudLive
          ? 'Listening (mn-MN) · Streaming 16kHz PCM to Gemini Live...'
          : 'Listening (mn-MN) · Local SpeechRecognition + Offline Engine active.'
      );
    } catch (err) {
      cleanupAudioResources();
      setStatus('error');
      const message =
        err instanceof Error ? err.message : 'Microphone permission denied or unavailable.';
      setErrorMsg(
        `Microphone error: ${message}. You can test the speech-to-translation pipeline with the Mongolian sample utterances, audio file upload, or text box below.`
      );
    }
  }, [cleanupAudioResources, play24kPcmChunk, translateMongolianText]);

  const translateAudioFile = useCallback(
    async (file: File): Promise<TranslationResult | null> => {
      setErrorMsg(null);
      if (engineModeRef.current === 'offline' || !isOnlineRef.current || !geminiConfiguredRef.current) {
        setStatus('error');
        setErrorMsg(
          'Audio file transcription requires Cloud/Auto mode with connectivity. In Offline mode, speak with browser SpeechRecognition or enter Mongolian text.'
        );
        return null;
      }

      setStatus('processing');
      setStatusNote(`Transcribing & translating "${file.name}"...`);

      try {
        const arrayBuf = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuf);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        }
        const audioBase64 = btoa(binary);

        const res = await fetch('/api/translate-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audioBase64,
            mimeType: file.type || 'audio/webm',
            glossary: glossaryRef.current.map((g) => ({
              mongolian: g.mongolian,
              english: g.english,
            })),
          }),
        });

        if (!res.ok) {
          const errData = (await res.json().catch(() => ({}))) as { error?: string };
          setStatus('error');
          setErrorMsg(errData.error || 'Could not transcribe and translate the uploaded audio.');
          return null;
        }

        const data = (await res.json()) as Partial<TranslationResult>;
        const mn = data.mongolian || '';
        const detectedEnglish =
          Array.isArray(data.englishWords) && data.englishWords.length > 0
            ? data.englishWords
            : extractEnglishWords(mn);
        const result: TranslationResult = {
          id: `tr-${Date.now()}`,
          mongolian: mn,
          romanization: data.romanization || romanizeMongolian(mn),
          english: data.english || '',
          englishWords: detectedEnglish,
          engine: 'gemini-audio',
          isOffline: false,
          confidence: typeof data.confidence === 'number' ? data.confidence : 0.95,
          latencyMs: typeof data.latencyMs === 'number' ? data.latencyMs : 500,
          intent: data.intent || detectAssistantIntent(mn),
          keyTerms: Array.isArray(data.keyTerms) ? data.keyTerms : [],
          timestamp: new Date().toISOString(),
        };
        setStatus('idle');
        setStatusNote('Audio file transcribed to Mongolian text and translated to English.');
        recordResult(result, autoSpeakRef.current);
        return result;
      } catch (err) {
        setStatus('error');
        setErrorMsg(err instanceof Error ? err.message : 'Audio file upload failed.');
        return null;
      }
    },
    [recordResult]
  );

  const addGlossaryEntry = useCallback(
    (mongolian: string, english: string, category: string) => {
      const mn = mongolian.trim();
      const en = english.trim();
      if (!mn || !en) return false;
      const entry: GlossaryEntry = {
        id: `gloss-${Date.now()}`,
        mongolian: mn,
        english: en,
        category: category.trim() || 'Custom',
        createdAt: new Date().toISOString(),
      };
      setCustomGlossary((prev) => [entry, ...prev]);
      return true;
    },
    []
  );

  const removeGlossaryEntry = useCallback((id: string) => {
    setCustomGlossary((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const deleteHistoryItem = useCallback((id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    setActiveResult(null);
  }, []);

  const clearOfflineCache = useCallback(() => {
    setCachedTranslations({});
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAudioResources();
      if (wsRef.current) wsRef.current.close();
    };
  }, [cleanupAudioResources]);

  return {
    engineMode,
    setEngineMode,
    isOnline,
    geminiConfigured,
    canUseCloud,
    status,
    errorMsg,
    setErrorMsg,
    statusNote,
    interimMongolian,
    activeResult,
    autoSpeakEnglish,
    setAutoSpeakEnglish,
    elapsedMs,
    audioLevel,
    analyserNode: analyserRef.current,
    history,
    customGlossary,
    cachedTranslations,
    startListening,
    stopListening,
    translateMongolianText,
    translateAudioFile,
    speakEnglish,
    addGlossaryEntry,
    removeGlossaryEntry,
    deleteHistoryItem,
    clearHistory,
    clearOfflineCache,
  };
}
