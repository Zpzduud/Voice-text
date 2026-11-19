import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import {
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  ThinkingLevel,
  Type,
} from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const TRANSLATION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    mongolian: {
      type: Type.STRING,
      description: 'Clean Mongolian Cyrillic transcription of the speech or text.',
    },
    romanization: {
      type: Type.STRING,
      description: 'Latin transliteration of the Mongolian text.',
    },
    english: {
      type: Type.STRING,
      description: 'Natural, accurate English translation for a personal assistant AI.',
    },
    englishWords: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        'Distinct English words or acronyms detected inside mixed Mongolian-English speech/text (empty array if purely Mongolian).',
    },
    intent: {
      type: Type.STRING,
      description:
        'One of: schedule_event, set_reminder, weather_query, send_message, translate_request, navigation, search_query, greeting, general_command',
    },
    confidence: {
      type: Type.NUMBER,
      description: 'Confidence score between 0 and 1.',
    },
    keyTerms: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          mn: { type: Type.STRING },
          en: { type: Type.STRING },
        },
        required: ['mn', 'en'],
      },
    },
  },
  required: [
    'mongolian',
    'romanization',
    'english',
    'englishWords',
    'intent',
    'confidence',
    'keyTerms',
  ],
};

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    const ai = getGeminiClient();
    res.json({
      ok: true,
      geminiConfigured: Boolean(ai),
      timestamp: new Date().toISOString(),
    });
  });

  // Translate Mongolian Cyrillic text -> English + Assistant Intent
  app.post('/api/translate-text', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_API_KEY is not configured on the server.',
        code: 'MISSING_API_KEY',
      });
      return;
    }

    const { text, glossary } = req.body as {
      text?: string;
      glossary?: Array<{ mongolian: string; english: string }>;
    };

    if (!text || typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ error: 'Input Mongolian text is required.' });
      return;
    }

    const glossaryHint =
      Array.isArray(glossary) && glossary.length > 0
        ? `\nRespect these user glossary mappings if encountered:\n${glossary
            .slice(0, 30)
            .map((g) => `- "${g.mongolian}" => "${g.english}"`)
            .join('\n')}`
        : '';

    const startedAt = Date.now();
    const promptText = `Translate this Mongolian (or mixed Mongolian-English) utterance into natural, accurate English for a personal assistant AI:\n"${text.trim()}"${glossaryHint}`;
    const systemPrompt =
      'You are an expert Mongolian (Khalkha Cyrillic, mn-MN) to English (en-US) speech-to-translation engine for a personal assistant AI. ' +
      'Speakers frequently mix English words into Mongolian sentences (code-switching), including English nouns with Mongolian suffixes (e.g., email-ээр, meeting-ийг, file-уудыг, Slack-д) and English verbs paired with the Mongolian light verb хийх (e.g., check хийгээрэй, send хийнэ, update хийж байна), as well as Cyrillic-transliterated English loanwords (e.g., митинг, дэдлайн, линк). ' +
      'Identify any English words used in the utterance and return them cleanly in "englishWords", preserve mixed English terms in Latin script inside "mongolian" alongside standard Mongolian Cyrillic (preserving ө, ү), and continue naturally with those English words in "english". ' +
      'Accurately handle Mongolian SOV word order, agglutinative case/verb suffixes, honorific requests (-на уу/-нэ үү/-аарай), time expressions, numbers, and colloquial contractions (e.g. бнуу -> байна уу, бна -> байна).';

    const callModel = async (model: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite') => {
      return ai.models.generateContent({
        model,
        contents: promptText,
        config: {
          systemInstruction: systemPrompt,
          thinkingConfig: {
            thinkingLevel:
              model === 'gemini-4-hydrogen' ? ThinkingLevel.MEDIUM : ThinkingLevel.MINIMAL,
          },
          responseMimeType: 'application/json',
          responseSchema: TRANSLATION_SCHEMA,
        },
      });
    };

    try {
      let response;
      try {
        response = await callModel('gemini-4-hydrogen');
      } catch (primaryErr) {
        const msg = primaryErr instanceof Error ? primaryErr.message : '';
        if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('429')) {
          response = await callModel('gemini-3.1-flash-lite');
        } else {
          throw primaryErr;
        }
      }

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json({
        ...parsed,
        engine: 'gemini-text',
        isOffline: false,
        latencyMs: Date.now() - startedAt,
      });
    } catch (err) {
      let message = err instanceof Error ? err.message : 'Translation request failed';
      try {
        const parsedErr = JSON.parse(message) as { error?: { message?: string } };
        if (parsedErr?.error?.message) {
          message = parsedErr.error.message;
        }
      } catch {
        // keep original message
      }
      res.status(502).json({ error: message, code: 'UPSTREAM_ERROR' });
    }
  });

  // Transcribe & Translate recorded Mongolian audio clip -> both Mongolian Cyrillic text & English translation
  app.post('/api/translate-audio', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_API_KEY is not configured on the server.',
        code: 'MISSING_API_KEY',
      });
      return;
    }

    const { audioBase64, mimeType, glossary } = req.body as {
      audioBase64?: string;
      mimeType?: string;
      glossary?: Array<{ mongolian: string; english: string }>;
    };

    if (!audioBase64 || typeof audioBase64 !== 'string') {
      res.status(400).json({ error: 'audioBase64 is required.' });
      return;
    }

    const startedAt = Date.now();
    const audioPart = {
      inlineData: {
        mimeType: mimeType || 'audio/webm',
        data: audioBase64,
      },
    };
    const glossaryHint =
      Array.isArray(glossary) && glossary.length > 0
        ? `\nUser glossary:\n${glossary
            .slice(0, 30)
            .map((g) => `- "${g.mongolian}" => "${g.english}"`)
            .join('\n')}`
        : '';

    try {
      let mongolianTranscript = '';

      // Step 1: Dedicated speech-to-text pass tuned for Mongolian Cyrillic
      try {
        const transcribeRes = await ai.models.generateContent({
          model: 'gemini-3.5-transcribe',
          contents: {
            parts: [
              audioPart,
              {
                text: 'This audio is spoken primarily in Mongolian (mn-MN) and may contain mixed English words (code-switching). Transcribe Mongolian words accurately into standard Mongolian Cyrillic script (including ө and ү), and preserve spoken English words (such as meeting, PDF, email, Zoom, Slack) in Latin script rather than forcing them into phonetic Cyrillic. Return only the transcript without translation or extra commentary.',
              },
            ],
          },
        });
        mongolianTranscript = (transcribeRes.text ?? '').trim();
      } catch {
        // Fall through to direct multimodal audio transcription + translation below
      }

      const callMultimodalAudioTranslate = async (
        model: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite'
      ) => {
        const instruction = mongolianTranscript
          ? `Listen to the attached audio and verify/refine this draft Mongolian/code-switched transcript:\n"${mongolianTranscript}"\nReturn the accurate transcript ("mongolian" with Mongolian Cyrillic + preserved English words), any identified English words ("englishWords"), Latin romanization, accurate English translation ("english"), assistant intent, confidence, and keyTerms.${glossaryHint}`
          : `Listen carefully to the attached Mongolian (mn-MN) speech audio, which may include mixed English words (code-switching). Transcribe every spoken Mongolian word in standard Cyrillic (including ө, ү) and keep spoken English words in Latin script inside "mongolian", list those English words in "englishWords", and provide an accurate, natural English translation in "english" along with romanization, assistant intent, confidence, and keyTerms.${glossaryHint}`;

        return ai.models.generateContent({
          model,
          contents: { parts: [audioPart, { text: instruction }] },
          config: {
            systemInstruction:
              'You are an expert Mongolian (mn-MN) and Mongolian-English code-switching speech recognition and translation engine. Always output both the faithful transcript (preserving embedded English words) and an accurate natural English translation.',
            thinkingConfig: {
              thinkingLevel:
                model === 'gemini-4-hydrogen' ? ThinkingLevel.MEDIUM : ThinkingLevel.MINIMAL,
            },
            responseMimeType: 'application/json',
            responseSchema: TRANSLATION_SCHEMA,
          },
        });
      };

      let translateRes;
      try {
        translateRes = await callMultimodalAudioTranslate('gemini-4-hydrogen');
      } catch (primaryErr) {
        const msg = primaryErr instanceof Error ? primaryErr.message : '';
        if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('429')) {
          translateRes = await callMultimodalAudioTranslate('gemini-3.1-flash-lite');
        } else {
          throw primaryErr;
        }
      }

      const parsed = JSON.parse((translateRes.text ?? '{}').trim());
      const finalMn = (parsed.mongolian || mongolianTranscript || '').trim();
      if (!finalMn) {
        res.status(422).json({
          error: 'No Mongolian speech was detected in the audio recording.',
          code: 'EMPTY_SPEECH',
        });
        return;
      }

      res.json({
        ...parsed,
        mongolian: finalMn,
        engine: 'gemini-audio',
        isOffline: false,
        latencyMs: Date.now() - startedAt,
      });
    } catch (err) {
      let message = err instanceof Error ? err.message : 'Audio translation failed';
      try {
        const parsedErr = JSON.parse(message) as { error?: { message?: string } };
        if (parsedErr?.error?.message) {
          message = parsedErr.error.message;
        }
      } catch {
        // keep original message
      }
      res.status(502).json({ error: message, code: 'UPSTREAM_ERROR' });
    }
  });

  // Synthesize English translation speech via Gemini TTS
  app.post('/api/tts', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_API_KEY is not configured on the server.',
        code: 'MISSING_API_KEY',
      });
      return;
    }

    const { text, voice } = req.body as { text?: string; voice?: string };
    if (!text || !text.trim()) {
      res.status(400).json({ error: 'Text is required for speech synthesis.' });
      return;
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: text.trim(),
                speechMetadata: {
                  style: 'Clear, calm, natural personal voice assistant',
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice || 'Kore' },
            },
          },
        },
      });

      const base64Audio =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        res.status(502).json({ error: 'No audio returned from TTS model.' });
        return;
      }

      res.json({ audioBase64: base64Audio, mimeType: 'audio/wav' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'TTS synthesis failed';
      res.status(502).json({ error: message, code: 'UPSTREAM_ERROR' });
    }
  });

  // Mount Vite middleware in dev or static dist in production
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = http.createServer(app);

  // WebSocket server for real-time 16kHz PCM audio streaming via Gemini Live API
  const wss = new WebSocketServer({ server, path: '/api/live-translate' });

  wss.on('connection', (clientWs: WebSocket) => {
    const ai = getGeminiClient();
    if (!ai) {
      clientWs.send(
        JSON.stringify({
          type: 'error',
          code: 'MISSING_API_KEY',
          message:
            'GEMINI_API_KEY is not configured. Using local/offline recognition engine.',
        })
      );
      clientWs.close();
      return;
    }

    let liveSession: Awaited<ReturnType<typeof ai.live.connect>> | null = null;
    let isClosing = false;

    const sendSafe = (payload: unknown) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    clientWs.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type: 'start' | 'audio' | 'stop';
          mode?: 'live-translate' | 'live-transcribe';
          data?: string;
        };

        if (msg.type === 'start') {
          if (liveSession) {
            liveSession.close();
            liveSession = null;
          }

          const useTranscribeOnly = msg.mode === 'live-transcribe';
          if (useTranscribeOnly) {
            let accumulatedMn = '';
            liveSession = await ai.live.connect({
              model: 'gemini-3.5-transcribe-live',
              config: {
                responseModalities: [Modality.TEXT],
                inputAudioTranscription: {
                  // Empty array enables automatic multilingual detection so mixed Mongolian + English words both transcribe accurately
                  languageCodes: [],
                },
              },
              callbacks: {
                onopen: () => {
                  sendSafe({ type: 'ready', model: 'gemini-3.5-transcribe-live' });
                },
                onmessage: async (message: LiveServerMessage) => {
                  const content = message.serverContent;
                  if (content?.interimInputTranscription?.text) {
                    sendSafe({
                      type: 'interim_transcript',
                      text: `${accumulatedMn} ${content.interimInputTranscription.text}`.trim(),
                    });
                  }
                  if (content?.inputTranscription?.text) {
                    const chunkText = content.inputTranscription.text.trim();
                    if (chunkText) {
                      accumulatedMn = `${accumulatedMn} ${chunkText}`.trim();
                      sendSafe({
                        type: 'input_transcript',
                        text: chunkText,
                      });
                      try {
                        const tr = await ai.models.generateContent({
                          model: 'gemini-3.1-flash-lite',
                          contents: `Translate this Mongolian or mixed Mongolian-English utterance into concise, accurate English for a personal assistant:\n"${accumulatedMn}"`,
                          config: {
                            systemInstruction:
                              'You are a Mongolian (mn-MN) to English (en-US) translator supporting Mongolian-English code-switching. Identify English words (including words with Mongolian suffixes like email-ээр or light-verb pairs like check хийгээрэй) in "englishWords", keep them accurately in "mongolian", and continue seamlessly with them into natural "english". Return JSON matching the schema.',
                            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
                            responseMimeType: 'application/json',
                            responseSchema: TRANSLATION_SCHEMA,
                          },
                        });
                        const parsed = JSON.parse((tr.text ?? '{}').trim());
                        if (parsed.english) {
                          sendSafe({
                            type: 'output_transcript',
                            text: parsed.english,
                            fullMongolian: parsed.mongolian || accumulatedMn,
                            englishWords: Array.isArray(parsed.englishWords)
                              ? parsed.englishWords
                              : [],
                            intent: parsed.intent,
                            keyTerms: parsed.keyTerms,
                          });
                        }
                      } catch {
                        // Client falls back to REST /api/translate-text or offline engine if live translate hiccups
                      }
                    }
                  }
                },
                onerror: (err) => {
                  sendSafe({
                    type: 'error',
                    message: err?.message || 'Live transcription stream error',
                  });
                },
                onclose: () => {
                  if (!isClosing) sendSafe({ type: 'closed' });
                },
              },
            });
          } else {
            liveSession = await ai.live.connect({
              model: 'gemini-3.5-live-translate-preview',
              config: {
                responseModalities: [Modality.AUDIO],
                inputAudioTranscription: {},
                outputAudioTranscription: {},
                translationConfig: {
                  targetLanguageCode: 'en',
                  echoTargetLanguage: false,
                },
              },
              callbacks: {
                onopen: () => {
                  sendSafe({
                    type: 'ready',
                    model: 'gemini-3.5-live-translate-preview',
                  });
                },
                onmessage: (message: LiveServerMessage) => {
                  const content = message.serverContent;
                  if (content?.inputTranscription?.text) {
                    sendSafe({
                      type: 'input_transcript',
                      text: content.inputTranscription.text,
                    });
                  }
                  if (content?.outputTranscription?.text) {
                    sendSafe({
                      type: 'output_transcript',
                      text: content.outputTranscription.text,
                    });
                  }
                  for (const part of content?.modelTurn?.parts ?? []) {
                    if (part.inlineData?.data) {
                      sendSafe({ type: 'audio', data: part.inlineData.data });
                    }
                  }
                  if (content?.turnComplete) {
                    sendSafe({ type: 'turn_complete' });
                  }
                },
                onerror: (err) => {
                  sendSafe({
                    type: 'error',
                    message: err?.message || 'Live translation stream error',
                  });
                },
                onclose: () => {
                  if (!isClosing) sendSafe({ type: 'closed' });
                },
              },
            });
          }
        } else if (msg.type === 'audio' && msg.data && liveSession) {
          liveSession.sendRealtimeInput({
            audio: { data: msg.data, mimeType: 'audio/pcm;rate=16000' },
          });
        } else if (msg.type === 'stop') {
          if (liveSession) {
            liveSession.close();
            liveSession = null;
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'WebSocket processing error';
        sendSafe({ type: 'error', message });
      }
    });

    clientWs.on('close', () => {
      isClosing = true;
      if (liveSession) {
        liveSession.close();
        liveSession = null;
      }
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`MongolVoice server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
