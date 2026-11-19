import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { buildAssistantHookPayload } from '../hooks/useSpeechToTranslation';
import type { TranslationResult } from '../types/translation';

interface AssistantHookPanelProps {
  activeResult: TranslationResult | null;
}

const FALLBACK_SAMPLE: TranslationResult = {
  id: 'sample-payload',
  mongolian: 'Маргааш өглөө 9 цагт уулзалт товлоорой',
  romanization: 'Margaash öglöö 9 tsagt uulzalt tovlooroi',
  english: 'Schedule a meeting tomorrow morning at 9 o’clock.',
  engine: 'offline-phrasebook',
  isOffline: true,
  confidence: 0.96,
  latencyMs: 2,
  intent: 'schedule_event',
  keyTerms: [
    { mn: 'маргааш өглөө', en: 'tomorrow morning' },
    { mn: 'уулзалт', en: 'meeting' },
  ],
  timestamp: '2026-11-19T06:55:00.000Z',
};

const INTEGRATION_SNIPPET = `import { translateOffline } from './engine/offlineTranslator';

// 1. Subscribe to the speech-to-translation module output
function onSpeechTranslationCompleted(payload: AssistantHookPayload) {
  const { english, confidence } = payload.translation;
  const { intent, entities } = payload.assistantAction;

  // Forward normalized English command + intent to your Personal Assistant AI
  personalAssistant.handleCommand({
    text: english,
    originalMongolian: payload.transcript.mongolian,
    intent,
    entities,
    confidence,
  });
}

// 2. Direct offline call when device loses connectivity
const offlineResult = translateOffline(mongolianTranscript, {
  customGlossary,
  cachedTranslations,
});`;

export function AssistantHookPanel({ activeResult }: AssistantHookPanelProps) {
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const payload = buildAssistantHookPayload(activeResult ?? FALLBACK_SAMPLE);
  const payloadJson = JSON.stringify(payload, null, 2);

  const copyText = async (text: string, which: 'payload' | 'snippet') => {
    try {
      await navigator.clipboard.writeText(text);
      if (which === 'payload') {
        setCopiedPayload(true);
        window.setTimeout(() => setCopiedPayload(false), 1500);
      } else {
        setCopiedSnippet(true);
        window.setTimeout(() => setCopiedSnippet(false), 1500);
      }
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-6">
      <section className="border-b border-slate-200 pb-5">
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
          Personal Assistant AI Integration Hook
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Structured event contract emitted by this speech-to-translation module for downstream personal assistant reasoning and action routing.
        </p>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 items-stretch">
        {/* Live Event Payload */}
        <section className="flex flex-col rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-3.5">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900">
                {activeResult ? 'Latest Emitted Event Payload' : 'Example Event Payload'}
              </h2>
              <p className="text-xs text-slate-500">
                {activeResult ? 'Generated from your most recent utterance' : 'Run a translation to populate live data'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void copyText(payloadJson, 'payload')}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              {copiedPayload ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
              )}
              <span>{copiedPayload ? 'Copied' : 'Copy JSON'}</span>
            </button>
          </div>
          <pre
            data-testid="assistant-hook-json"
            className="flex-1 overflow-x-auto bg-slate-950 p-5 font-mono text-xs leading-relaxed text-slate-100"
          >
            {payloadJson}
          </pre>
        </section>

        {/* Integration Code Contract */}
        <section className="flex flex-col rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-3.5">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Module Integration Contract (TypeScript)
              </h2>
              <p className="text-xs text-slate-500">
                Drop-in callback & offline engine import
              </p>
            </div>
            <button
              type="button"
              onClick={() => void copyText(INTEGRATION_SNIPPET, 'snippet')}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              {copiedSnippet ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
              )}
              <span>{copiedSnippet ? 'Copied' : 'Copy Code'}</span>
            </button>
          </div>
          <pre className="flex-1 overflow-x-auto bg-slate-950 p-5 font-mono text-xs leading-relaxed text-slate-100">
            {INTEGRATION_SNIPPET}
          </pre>
        </section>
      </div>
    </div>
  );
}
