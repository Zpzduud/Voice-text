export type EngineMode = 'auto' | 'cloud' | 'offline';

export type TranslationSourceEngine =
  | 'gemini-live'
  | 'gemini-audio'
  | 'gemini-text'
  | 'offline-cache'
  | 'offline-glossary'
  | 'offline-phrasebook'
  | 'offline-morphology';

export type AssistantIntent =
  | 'schedule_event'
  | 'set_reminder'
  | 'weather_query'
  | 'send_message'
  | 'translate_request'
  | 'navigation'
  | 'search_query'
  | 'greeting'
  | 'general_command';

export interface GlossaryEntry {
  id: string;
  mongolian: string;
  english: string;
  category: string;
  createdAt: string;
}

export interface KeyTermPair {
  mn: string;
  en: string;
}

export interface TranslationResult {
  id: string;
  mongolian: string;
  romanization: string;
  english: string;
  englishWords?: string[];
  engine: TranslationSourceEngine;
  isOffline: boolean;
  confidence: number;
  latencyMs: number;
  intent: AssistantIntent;
  keyTerms: KeyTermPair[];
  timestamp: string;
}

export interface AssistantHookPayload {
  event: 'speech.translation.completed';
  version: '1.0';
  sourceLocale: 'mn-MN';
  targetLocale: 'en-US';
  transcript: {
    mongolian: string;
    romanization: string;
    englishWords?: string[];
  };
  translation: {
    english: string;
    confidence: number;
  };
  assistantAction: {
    intent: AssistantIntent;
    entities: KeyTermPair[];
  };
  runtime: {
    engine: TranslationSourceEngine;
    offline: boolean;
    latencyMs: number;
    timestamp: string;
  };
}

export type RecognitionStatus =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'processing'
  | 'error';

export type ActiveTab = 'translator' | 'history' | 'lexicon' | 'hook';
