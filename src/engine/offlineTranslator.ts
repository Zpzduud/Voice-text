import type {
  AssistantIntent,
  GlossaryEntry,
  KeyTermPair,
  TranslationResult,
} from '../types/translation';
import {
  COMMON_ENGLISH_VERBS,
  STANDALONE_MONGOLIAN_SUFFIX_RE,
  extractEnglishWords,
  parseMixedToken,
} from './codeSwitch';
import { CORE_LEXICON, PHRASEBOOK } from './offlineLexicon';
import { romanizeMongolian } from './romanize';

export interface OfflineTranslateOptions {
  customGlossary?: GlossaryEntry[];
  cachedTranslations?: Record<string, string>;
}

const COLLOQUIAL_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bбнуу\b/gi, 'байна уу'],
  [/\bбна\b/gi, 'байна'],
  [/\bюмуу\b/gi, 'юм уу'],
  [/\bбайгаамуу\b/gi, 'байгаа юм уу'],
  [/\bцаг агаар\b/gi, 'цаг_агаар'],
  [/\bэмийн сан\b/gi, 'эмийн_сан'],
  [/\bдолоо хоног\b/gi, 'долоо_хоног'],
  [/\bнисэх буудал\b/gi, 'нисэх_буудал'],
  [/\bзочид буудал\b/gi, 'зочид_буудал'],
  [/\bгэр бүл\b/gi, 'гэр_бүл'],
  [/\bдуу хоолой\b/gi, 'дуу_хоолой'],
  [/\bхүн бүр\b/gi, 'хүн_бүр'],
  [/\bучир нь\b/gi, 'учир_нь'],
];

export function normalizeMongolian(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:"'()\[\]{}«»—–-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectAssistantIntent(mongolianText: string): AssistantIntent {
  const norm = normalizeMongolian(mongolianText);
  if (
    /уулзалт|хуваарь|товло|цуцал|хойшлуул|митинг|календар|\b(meeting|calendar|schedule|appointment|zoom|event)\b/.test(
      norm
    )
  ) {
    return 'schedule_event';
  }
  if (
    /сануул|сэрүүлэг|жагсаалт|тэмдэглэл|таск|дэдлайн|\b(reminder|remind|alarm|todo|task|note|deadline)\b/.test(
      norm
    )
  ) {
    return 'set_reminder';
  }
  if (
    /цаг агаар|бороо|цас|салхи|дулаан|хүйтэн|\b(weather|forecast|rain|snow|temperature)\b/.test(
      norm
    )
  ) {
    return 'weather_query';
  }
  if (
    /имэйл|мэйл|мессеж|захиа|дуудлага|илгээ|хариу|чат|линк|\b(email|mail|message|send|reply|forward|call|slack|chat|dm|ping)\b/.test(
      norm
    )
  ) {
    return 'send_message';
  }
  if (
    /орчуул|хэл рүү|юу гэсэн үг|\b(translate|translation|meaning)\b/.test(norm)
  ) {
    return 'translate_request';
  }
  if (
    /чиглэл|зам|түгжрэл|хаана|очих|буудал|эмийн сан|гэртээ|харьж|\b(directions|traffic|route|navigate|airport|pharmacy|map)\b/.test(
      norm
    )
  ) {
    return 'navigation';
  }
  if (
    /сайн байна|өглөөний мэнд|өдрийн мэнд|оройн мэнд|баяртай|сайн уу|\b(hello|hi|good morning|goodbye)\b/.test(
      norm
    )
  ) {
    return 'greeting';
  }
  if (/(вэ|бэ|уу|үү|хэд|юу|хэзээ|яагаад)\b/.test(norm)) {
    return 'search_query';
  }
  return 'general_command';
}

interface MorphemeMatch {
  stem: string;
  englishPrefix: string;
  englishSuffix: string;
  posHint?: 'noun' | 'verb';
  isPlural?: boolean;
  isImperative?: boolean;
  isPast?: boolean;
  isFuture?: boolean;
  isNegative?: boolean;
  isConverbAnd?: boolean;
  isGenitive?: boolean;
  isReflexive?: boolean;
}

const SUFFIX_RULES: Array<{
  pattern: RegExp;
  englishPrefix: string;
  englishSuffix: string;
  posHint?: 'noun' | 'verb';
  isPlural?: boolean;
  isImperative?: boolean;
  isPast?: boolean;
  isFuture?: boolean;
  isNegative?: boolean;
  isConverbAnd?: boolean;
  isGenitive?: boolean;
  isReflexive?: boolean;
}> = [
  // Reflexive-comitative & reflexive-case endings (e.g., найзтайгаа, ажилдаа, баримтаа)
  { pattern: /(тайгаа|тэйгээ|тойгоо)$/, englishPrefix: 'with my ', englishSuffix: '', posHint: 'noun', isReflexive: true },
  { pattern: /(даа|дээ|доо|дөө|таа|тээ|тоо|төө)$/, englishPrefix: 'to my ', englishSuffix: '', posHint: 'noun', isReflexive: true },
  { pattern: /(аасaa|ээсээ|оосоо|өөсөө|аасаа)$/, englishPrefix: 'from my ', englishSuffix: '', posHint: 'noun', isReflexive: true },
  { pattern: /(аараа|ээрээ|оороо|өөрөө)$/, englishPrefix: 'by my ', englishSuffix: '', posHint: 'noun', isReflexive: true },

  // Verb polite / imperative / negative / progressive / tense
  { pattern: /(аарай|ээрэй|оорой|өөрэй)$/, englishPrefix: '', englishSuffix: '', posHint: 'verb', isImperative: true },
  { pattern: /(гаарай|гээрэй|гоорой|гөөрэй)$/, englishPrefix: '', englishSuffix: '', posHint: 'verb', isImperative: true },
  { pattern: /(аач|ээч|ооч|өөч)$/, englishPrefix: 'please ', englishSuffix: '', posHint: 'verb', isImperative: true },
  { pattern: /(гаач|гээч|гооч|гөөч)$/, englishPrefix: 'please ', englishSuffix: '', posHint: 'verb', isImperative: true },
  { pattern: /(хгүй|хгүи)$/, englishPrefix: 'will not ', englishSuffix: '', posHint: 'verb', isNegative: true },
  { pattern: /(сангүй|сэнгүй|сонгүй|сөнгүй)$/, englishPrefix: 'did not ', englishSuffix: '', posHint: 'verb', isPast: true, isNegative: true },
  { pattern: /(аагүй|ээгүй|оогүй|өөгүй)$/, englishPrefix: 'have not ', englishSuffix: 'ed', posHint: 'verb', isPast: true, isNegative: true },
  { pattern: /(гаагүй|гээгүй|гоогүй|гөөгүй)$/, englishPrefix: 'have not ', englishSuffix: 'ed', posHint: 'verb', isPast: true, isNegative: true },
  { pattern: /(лаа|лээ|лоо|лөө)$/, englishPrefix: '', englishSuffix: 'ed', posHint: 'verb', isPast: true },
  { pattern: /(сан|сэн|сон|сөн)$/, englishPrefix: '', englishSuffix: 'ed', posHint: 'verb', isPast: true },
  { pattern: /(аад|ээд|оод|өөд)$/, englishPrefix: '', englishSuffix: '', posHint: 'verb', isConverbAnd: true },
  { pattern: /(гаад|гээд|гоод|гөөд)$/, englishPrefix: '', englishSuffix: '', posHint: 'verb', isConverbAnd: true },
  { pattern: /(ж|ч)$/, englishPrefix: '', englishSuffix: 'ing', posHint: 'verb' },
  { pattern: /(на|нэ|но|нө)$/, englishPrefix: 'will ', englishSuffix: '', posHint: 'verb', isFuture: true },
  { pattern: /(даг|дэг|дог|дөг)$/, englishPrefix: '', englishSuffix: '', posHint: 'verb' },
  { pattern: /гүй$/, englishPrefix: 'no ', englishSuffix: '', isNegative: true },

  // Noun cases
  { pattern: /(аас|ээс|оос|өөс)$/, englishPrefix: 'from ', englishSuffix: '', posHint: 'noun' },
  { pattern: /(аар|ээр|оор|өөр)$/, englishPrefix: 'by ', englishSuffix: '', posHint: 'noun' },
  { pattern: /(тай|тэй|той)$/, englishPrefix: 'with ', englishSuffix: '', posHint: 'noun' },
  { pattern: /(ийг|ыг|г)$/, englishPrefix: '', englishSuffix: '', posHint: 'noun' },
  { pattern: /(ийн|ын|ний|ны)$/, englishPrefix: '', englishSuffix: "'s", posHint: 'noun', isGenitive: true },
  { pattern: /(д|т|нд)$/, englishPrefix: 'at ', englishSuffix: '', posHint: 'noun' },

  // Reflexive accusative (-аа/-ээ/-оо/-өө)
  { pattern: /(аа|ээ|оо|өө)$/, englishPrefix: 'my ', englishSuffix: '', posHint: 'noun', isReflexive: true },
  { pattern: /(гаа|гээ|гоо|гөө)$/, englishPrefix: 'my ', englishSuffix: '', posHint: 'noun', isReflexive: true },

  // Plurals
  { pattern: /(нууд|нүүд|ууд|үүд|чууд|чүүд)$/, englishPrefix: '', englishSuffix: 's', posHint: 'noun', isPlural: true },
];

const IRREGULAR_PAST: Record<string, string> = {
  write: 'wrote',
  send: 'sent',
  go: 'went',
  'go home': 'went home',
  come: 'came',
  take: 'took',
  get: 'got',
  give: 'gave',
  make: 'made',
  do: 'did',
  meet: 'met',
  read: 'read',
  drink: 'drank',
  eat: 'ate',
  speak: 'spoke',
  tell: 'told',
  say: 'said',
  know: 'knew',
  find: 'found',
  see: 'saw',
  sleep: 'slept',
  think: 'thought',
  sit: 'sat',
  set: 'set',
  run: 'ran',
  build: 'built',
  pay: 'paid',
  put: 'put',
  keep: 'kept',
};

const DOUBLE_CONSONANT_VERBS = new Set([
  'chat',
  'log',
  'pin',
  'plan',
  'run',
  'skip',
  'stop',
  'tag',
]);

function inflectEnglishVerb(base: string, suffixType: string): string {
  if (suffixType === 'ed') {
    if (IRREGULAR_PAST[base]) return IRREGULAR_PAST[base];
    if (DOUBLE_CONSONANT_VERBS.has(base)) return `${base}${base.slice(-1)}ed`;
    if (base.endsWith('e')) return `${base}d`;
    if (base.endsWith('y') && !/[aeiou]y$/.test(base)) return `${base.slice(0, -1)}ied`;
    return `${base}ed`;
  }
  if (suffixType === 'ing') {
    if (DOUBLE_CONSONANT_VERBS.has(base)) return `${base}${base.slice(-1)}ing`;
    if (base.endsWith('e') && !base.endsWith('ee')) return `${base.slice(0, -1)}ing`;
    return `${base}ing`;
  }
  return base;
}

function analyzeSuffixOnly(cyrillicSuffix: string): Omit<MorphemeMatch, 'stem'> | null {
  const s = cyrillicSuffix.toLowerCase();
  if (!s) return null;

  for (const rule of SUFFIX_RULES) {
    if (rule.pattern.test(s)) {
      const rem = s.replace(rule.pattern, '');
      if (rem === '') {
        return {
          englishPrefix: rule.englishPrefix,
          englishSuffix: rule.englishSuffix,
          posHint: rule.posHint,
          isPlural: rule.isPlural,
          isImperative: rule.isImperative,
          isPast: rule.isPast,
          isFuture: rule.isFuture,
          isNegative: rule.isNegative,
          isConverbAnd: rule.isConverbAnd,
          isGenitive: rule.isGenitive,
          isReflexive: rule.isReflexive,
        };
      }
      for (const inner of SUFFIX_RULES) {
        if (inner.pattern.test(rem) && rem.replace(inner.pattern, '') === '') {
          return {
            englishPrefix: rule.englishPrefix || inner.englishPrefix,
            englishSuffix: inner.englishSuffix || rule.englishSuffix,
            posHint: rule.posHint ?? inner.posHint,
            isPlural: rule.isPlural || inner.isPlural,
            isImperative: rule.isImperative || inner.isImperative,
            isPast: rule.isPast || inner.isPast,
            isFuture: rule.isFuture || inner.isFuture,
            isNegative: rule.isNegative || inner.isNegative,
            isConverbAnd: rule.isConverbAnd || inner.isConverbAnd,
            isGenitive: rule.isGenitive || inner.isGenitive,
            isReflexive: rule.isReflexive || inner.isReflexive,
          };
        }
      }
    }
  }
  return null;
}

function lookupStem(token: string, customMap: Map<string, string>): { en: string; pos?: string } | null {
  if (customMap.has(token)) {
    return { en: customMap.get(token)!, pos: 'noun' };
  }
  const direct = CORE_LEXICON[token];
  if (direct) {
    return { en: direct.en, pos: direct.pos };
  }
  // Check stem + 'х' infinitive form in CORE_LEXICON (e.g. уулзаж -> уулз -> уулзах)
  const withKh = `${token}х`;
  if (CORE_LEXICON[withKh]) {
    return { en: CORE_LEXICON[withKh].en, pos: CORE_LEXICON[withKh].pos };
  }
  // Handle Mongolian vowel elision when adding -а/-э/-и before suffixes (e.g. уулзаж -> уулз, орчуул+аад)
  if (token.endsWith('а') || token.endsWith('э') || token.endsWith('о') || token.endsWith('ө')) {
    const trimmed = token.slice(0, -1);
    if (CORE_LEXICON[trimmed]) {
      return { en: CORE_LEXICON[trimmed].en, pos: CORE_LEXICON[trimmed].pos };
    }
    if (CORE_LEXICON[`${trimmed}х`]) {
      return { en: CORE_LEXICON[`${trimmed}х`].en, pos: CORE_LEXICON[`${trimmed}х`].pos };
    }
  }
  // Recover vowel-final stems where long suffix absorbed final short vowel (e.g. шалга + аарай -> шалгаарай -> шалг)
  for (const v of ['а', 'э', 'о', 'ө']) {
    const restored = `${token}${v}`;
    if (CORE_LEXICON[restored]) {
      return { en: CORE_LEXICON[restored].en, pos: CORE_LEXICON[restored].pos };
    }
    if (CORE_LEXICON[`${restored}х`]) {
      return { en: CORE_LEXICON[`${restored}х`].en, pos: CORE_LEXICON[`${restored}х`].pos };
    }
  }
  return null;
}

export function analyzeMorpheme(
  token: string,
  customMap: Map<string, string>
): MorphemeMatch & { matchedEn: string | null; pos?: string } {
  const exact = lookupStem(token, customMap);
  if (exact) {
    return {
      stem: token,
      englishPrefix: '',
      englishSuffix: '',
      matchedEn: exact.en,
      pos: exact.pos,
    };
  }

  for (const rule of SUFFIX_RULES) {
    if (rule.pattern.test(token)) {
      const stripped = token.replace(rule.pattern, '');
      if (stripped.length >= 2) {
        const hit = lookupStem(stripped, customMap);
        if (hit) {
          return {
            stem: stripped,
            englishPrefix: rule.englishPrefix,
            englishSuffix: rule.englishSuffix,
            posHint: rule.posHint,
            isPlural: rule.isPlural,
            isImperative: rule.isImperative,
            isPast: rule.isPast,
            isFuture: rule.isFuture,
            isNegative: rule.isNegative,
            isConverbAnd: rule.isConverbAnd,
            isGenitive: rule.isGenitive,
            isReflexive: rule.isReflexive,
            matchedEn: hit.en,
            pos: hit.pos,
          };
        }

        // Second-pass plural/case strip (e.g., уулзалт+ууд+ыг)
        for (const inner of SUFFIX_RULES) {
          if (inner.pattern.test(stripped)) {
            const doubleStripped = stripped.replace(inner.pattern, '');
            if (doubleStripped.length >= 2) {
              const innerHit = lookupStem(doubleStripped, customMap);
              if (innerHit) {
                return {
                  stem: doubleStripped,
                  englishPrefix: rule.englishPrefix || inner.englishPrefix,
                  englishSuffix: inner.englishSuffix || rule.englishSuffix,
                  posHint: rule.posHint ?? inner.posHint,
                  isPlural: rule.isPlural || inner.isPlural,
                  isImperative: rule.isImperative || inner.isImperative,
                  isPast: rule.isPast || inner.isPast,
                  isFuture: rule.isFuture || inner.isFuture,
                  isNegative: rule.isNegative || inner.isNegative,
                  isConverbAnd: rule.isConverbAnd || inner.isConverbAnd,
                  isGenitive: rule.isGenitive || inner.isGenitive,
                  isReflexive: rule.isReflexive || inner.isReflexive,
                  matchedEn: innerHit.en,
                  pos: innerHit.pos,
                };
              }
            }
          }
        }
      }
    }
  }

  return {
    stem: token,
    englishPrefix: '',
    englishSuffix: '',
    matchedEn: null,
  };
}

function formatEnglishSentence(text: string, isQuestion: boolean): string {
  const cleaned = text
    .replace(/\s+/g, ' ')
    .replace(/\s+([?.!,])/g, '$1')
    .replace(/\bI will ([a-z])/g, 'I will $1')
    .trim();
  if (!cleaned) return '';
  const capitalized = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  if (/[.!?]$/.test(capitalized)) return capitalized;
  return capitalized + (isQuestion ? '?' : '.');
}

function diceSimilarity(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setB = new Set(tokensB);
  let overlap = 0;
  for (const t of tokensA) {
    if (setB.has(t)) overlap += 1;
  }
  return (2 * overlap) / (tokensA.length + tokensB.length);
}

function tokenizePreservingCodeSwitch(raw: string, customMap: Map<string, string>): string[] {
  // Keep Latin-Cyrillic hyphens (e.g. email-ээр, file-уудыг) while normalizing Cyrillic-Cyrillic hyphens (линк-ийг -> линкийг)
  let working = raw
    .replace(/[.,!?;:"'()\[\]{}«»—–]/g, ' ')
    .replace(/([а-яА-ЯөүӨҮёЁ])-([а-яА-ЯөүӨҮёЁ]+)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();

  for (const [pattern, replacement] of COLLOQUIAL_REPLACEMENTS) {
    working = working.replace(pattern, replacement);
  }

  // Replace multi-word custom glossary phrases case-insensitively
  const lowerWorking = working.toLowerCase();
  for (const [mnPhrase, enPhrase] of customMap.entries()) {
    if (mnPhrase.includes(' ') && lowerWorking.includes(mnPhrase)) {
      const placeholder = `__gloss_${mnPhrase.replace(/\s+/g, '_')}__`;
      const escaped = mnPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      working = working.replace(new RegExp(escaped, 'gi'), placeholder);
      customMap.set(placeholder, enPhrase);
    }
  }

  const splitTokens = working.split(' ').filter(Boolean);
  const merged: string[] = [];

  for (let i = 0; i < splitTokens.length; i += 1) {
    const curr = splitTokens[i];
    const prev = merged[merged.length - 1];
    if (prev) {
      const prevParsed = parseMixedToken(prev);
      if (
        prevParsed &&
        prevParsed.isEnglish &&
        !prevParsed.cyrillicSuffix &&
        STANDALONE_MONGOLIAN_SUFFIX_RE.test(curr.toLowerCase())
      ) {
        merged[merged.length - 1] = `${prevParsed.englishWord}-${curr.toLowerCase()}`;
        continue;
      }
    }
    merged.push(curr);
  }

  return merged;
}

interface ClauseTranslation {
  english: string;
  matchedCount: number;
  totalTokens: number;
  keyTerms: KeyTermPair[];
}

function translateClause(
  tokens: string[],
  customMap: Map<string, string>,
  isQuestion: boolean
): ClauseTranslation {
  const timeChunks: string[] = [];
  const subjectChunks: string[] = [];
  const objectChunks: string[] = [];
  const prepChunks: string[] = [];
  const verbChunks: string[] = [];
  const keyTerms: KeyTermPair[] = [];
  let matchedCount = 0;
  let hasPoliteRequest = false;
  let pendingGenitive: string | null = null;
  let hasQuestionWord = false;
  let questionWord = '';

  for (let i = 0; i < tokens.length; i += 1) {
    const rawToken = tokens[i];
    const token = rawToken.toLowerCase();

    // Numeric tokens (e.g., 9, 14:30)
    if (/^\d+([:.]\d+)?$/.test(token)) {
      const nextToken = tokens[i + 1]?.toLowerCase();
      if (nextToken && /^цаг(т|аас|ийн)?$/.test(nextToken)) {
        timeChunks.push(`at ${token} o'clock`);
        matchedCount += 2;
        i += 1;
        continue;
      }
      objectChunks.push(token);
      matchedCount += 1;
      continue;
    }

    // Polite request particles ("на уу", "нэ үү")
    if ((token === 'уу' || token === 'үү') && i > 0 && /(на|нэ|но|нө)$/.test(tokens[i - 1].toLowerCase())) {
      hasPoliteRequest = true;
      matchedCount += 1;
      continue;
    }

    // Question particles at end
    if (['уу', 'үү', 'вэ', 'бэ'].includes(token)) {
      matchedCount += 1;
      continue;
    }

    // Auxiliary "хэрэгтэй" -> "need to <verb>"
    if (token === 'хэрэгтэй' && verbChunks.length > 0) {
      const lastVerb = verbChunks.pop()!.replace(/^will\s+/, '');
      verbChunks.push(`need to ${lastVerb}`);
      matchedCount += 1;
      continue;
    }

    // Compound "чадах уу" -> "can you <verb>"
    if (/^чад/.test(token) && verbChunks.length > 0) {
      const lastVerb = verbChunks.pop()!.replace(/ing$/, '').replace(/^will\s+/, '');
      verbChunks.push(isQuestion ? `can ${subjectChunks.length ? '' : 'you '}${lastVerb}` : `can ${lastVerb}`);
      matchedCount += 1;
      continue;
    }

    // Progressive auxiliary "байна"
    if (token === 'байна' && verbChunks.length > 0) {
      const lastVerb = verbChunks.pop()!;
      const subj = subjectChunks[0]?.toLowerCase();
      const copula = subj === 'i' ? 'am' : subj === 'we' || subj === 'they' || subj === 'you' ? 'are' : 'is';
      if (lastVerb.endsWith('ing')) {
        verbChunks.push(`${copula} ${lastVerb}`);
      } else {
        verbChunks.push(lastVerb);
      }
      matchedCount += 1;
      continue;
    }

    // Postposition "руу" / "рүү" / "дээр" / "тухай" attaches to previous noun
    if ((token === 'руу' || token === 'рүү') && objectChunks.length > 0) {
      const prev = objectChunks.pop()!;
      prepChunks.push(`to ${prev}`);
      matchedCount += 1;
      continue;
    }
    if ((token === 'дээр' || token === 'тухай' || token === 'хүртэл') && objectChunks.length > 0) {
      const prev = objectChunks.pop()!;
      const prep = token === 'дээр' ? 'on' : token === 'тухай' ? 'about' : 'until';
      prepChunks.push(`${prep} ${prev}`);
      matchedCount += 1;
      continue;
    }

    // Code-switched English token handling (e.g., "PDF", "email-ээр", "send хийгээрэй")
    const mixed = parseMixedToken(rawToken);
    if (mixed && mixed.isEnglish) {
      // Check for <EnglishVerb> + Mongolian light verb "хийх" construction
      if (!mixed.cyrillicSuffix && i + 1 < tokens.length) {
        const nextRaw = tokens[i + 1];
        const nextAnalysis = analyzeMorpheme(nextRaw.toLowerCase(), customMap);
        if (
          nextAnalysis.matchedEn === 'do' &&
          nextAnalysis.pos === 'verb' &&
          COMMON_ENGLISH_VERBS.has(mixed.englishWord.toLowerCase())
        ) {
          const baseVerb = mixed.englishWord.toLowerCase();
          let formattedVerb = baseVerb;
          if (nextAnalysis.isPast) {
            formattedVerb = `${nextAnalysis.englishPrefix}${inflectEnglishVerb(baseVerb, 'ed')}`;
          } else if (nextAnalysis.englishSuffix === 'ing') {
            formattedVerb = `${nextAnalysis.englishPrefix}${inflectEnglishVerb(baseVerb, 'ing')}`;
          } else if (nextAnalysis.isFuture && hasPoliteRequest) {
            formattedVerb = baseVerb;
          } else {
            formattedVerb = `${nextAnalysis.englishPrefix}${baseVerb}`;
          }
          if (nextAnalysis.isImperative && tokens.some((t) => t.toLowerCase() === 'уу')) {
            hasPoliteRequest = true;
          }
          verbChunks.push(formattedVerb.trim());
          keyTerms.push({ mn: `${rawToken} ${nextRaw}`, en: baseVerb });
          matchedCount += 2;
          i += 1;
          continue;
        }
      }

      matchedCount += 1;
      const suffixInfo = mixed.cyrillicSuffix ? analyzeSuffixOnly(mixed.cyrillicSuffix) : null;

      if (suffixInfo?.isGenitive) {
        pendingGenitive = `${mixed.englishWord}'s`;
        keyTerms.push({ mn: rawToken, en: pendingGenitive });
        continue;
      }

      const pluralized =
        suffixInfo?.isPlural && !mixed.englishWord.endsWith('s')
          ? `${mixed.englishWord}s`
          : mixed.englishWord;
      const withGenitive = pendingGenitive ? `${pendingGenitive} ${pluralized}` : pluralized;
      pendingGenitive = null;

      let prefix = suffixInfo?.englishPrefix ?? '';
      if (prefix.startsWith('my ') && objectChunks[objectChunks.length - 1] === 'my') {
        objectChunks.pop();
      }
      const formatted = `${prefix}${withGenitive}`.trim();
      keyTerms.push({ mn: rawToken, en: formatted });

      if (
        prefix.startsWith('at ') ||
        prefix.startsWith('from ') ||
        prefix.startsWith('with ') ||
        prefix.startsWith('by ') ||
        prefix.startsWith('to my ')
      ) {
        prepChunks.push(formatted);
      } else {
        objectChunks.push(formatted);
      }
      continue;
    }

    const analysis = analyzeMorpheme(token, customMap);
    if (analysis.matchedEn) {
      matchedCount += 1;
      const baseEn = analysis.matchedEn.split(' / ')[0];
      keyTerms.push({ mn: rawToken, en: baseEn });

      if (['what', 'who', 'where', 'when', 'why', 'how'].includes(baseEn)) {
        hasQuestionWord = true;
        questionWord = baseEn;
        continue;
      }

      if (analysis.isGenitive) {
        pendingGenitive = `${baseEn}'s`;
        continue;
      }

      let formatted = baseEn;
      if (analysis.pos === 'verb' || analysis.posHint === 'verb') {
        if (analysis.isPast) {
          formatted = `${analysis.englishPrefix}${inflectEnglishVerb(baseEn, 'ed')}`;
        } else if (analysis.englishSuffix === 'ing') {
          formatted = `${analysis.englishPrefix}${inflectEnglishVerb(baseEn, 'ing')}`;
        } else if (analysis.isFuture && hasPoliteRequest) {
          formatted = baseEn;
        } else {
          formatted = `${analysis.englishPrefix}${baseEn}`;
        }
        if (analysis.isImperative && tokens.some((t) => t.toLowerCase() === 'уу')) {
          hasPoliteRequest = true;
        }
        verbChunks.push(formatted.trim());
      } else {
        const pluralized =
          analysis.englishSuffix === 's' && !baseEn.endsWith('s') ? `${baseEn}s` : baseEn;
        const withGenitive = pendingGenitive ? `${pendingGenitive} ${pluralized}` : pluralized;
        pendingGenitive = null;
        if (
          analysis.englishPrefix.startsWith('my ') &&
          objectChunks[objectChunks.length - 1] === 'my'
        ) {
          objectChunks.pop();
        }
        formatted = `${analysis.englishPrefix}${withGenitive}`.trim();

        if (analysis.pos === 'time') {
          timeChunks.push(formatted);
        } else if (
          analysis.pos === 'pronoun' &&
          ['I', 'you', 'we', 'they', 'he', 'she'].includes(baseEn) &&
          subjectChunks.length === 0
        ) {
          subjectChunks.push(formatted);
        } else if (analysis.pos === 'adv' && formatted.startsWith('at ')) {
          prepChunks.push(formatted);
        } else if (
          analysis.englishPrefix.startsWith('at ') ||
          analysis.englishPrefix.startsWith('from ') ||
          analysis.englishPrefix.startsWith('with ') ||
          analysis.englishPrefix.startsWith('by ') ||
          analysis.englishPrefix.startsWith('to my ')
        ) {
          prepChunks.push(formatted);
        } else {
          objectChunks.push(formatted);
        }
      }
    } else {
      const translit = romanizeMongolian(rawToken);
      if (pendingGenitive) {
        objectChunks.push(`${pendingGenitive} ${translit}`);
        pendingGenitive = null;
      } else {
        objectChunks.push(translit);
      }
    }
  }

  if (pendingGenitive) {
    objectChunks.push(pendingGenitive);
  }

  // Strip "will " when the sentence ends in polite imperative "-на уу / -нэ үү"
  const normalizedVerbs = verbChunks.map((v) =>
    hasPoliteRequest ? v.replace(/^will\s+/, '') : v
  );

  const orderedParts: string[] = [];
  if (hasQuestionWord && questionWord) orderedParts.push(questionWord);
  if (hasPoliteRequest && subjectChunks.length === 0) orderedParts.push('please');
  if (subjectChunks.length > 0) orderedParts.push(...subjectChunks);
  if (normalizedVerbs.length > 0) orderedParts.push(...normalizedVerbs);
  if (objectChunks.length > 0) orderedParts.push(...objectChunks);
  if (prepChunks.length > 0) orderedParts.push(...prepChunks);
  if (timeChunks.length > 0) orderedParts.push(...timeChunks);

  return {
    english: orderedParts.join(' '),
    matchedCount,
    totalTokens: tokens.length,
    keyTerms,
  };
}

export function translateOffline(
  input: string,
  options: OfflineTranslateOptions = {}
): TranslationResult {
  const start = Date.now();
  const raw = input.trim();
  const normalized = normalizeMongolian(raw);
  const romanization = romanizeMongolian(raw);
  const intent = detectAssistantIntent(raw);
  const englishWords = extractEnglishWords(raw);

  if (!normalized) {
    return {
      id: `tr-${Date.now()}`,
      mongolian: raw,
      romanization,
      english: '',
      englishWords,
      engine: 'offline-phrasebook',
      isOffline: true,
      confidence: 0,
      latencyMs: Date.now() - start,
      intent: 'general_command',
      keyTerms: [],
      timestamp: new Date().toISOString(),
    };
  }

  const customMap = new Map<string, string>();
  for (const entry of options.customGlossary ?? []) {
    const key = normalizeMongolian(entry.mongolian);
    if (key) customMap.set(key, entry.english.trim());
  }

  // 1. Check exact match in custom glossary
  if (customMap.has(normalized)) {
    return {
      id: `tr-${Date.now()}`,
      mongolian: raw,
      romanization,
      english: formatEnglishSentence(customMap.get(normalized)!, raw.includes('?')),
      englishWords,
      engine: 'offline-glossary',
      isOffline: true,
      confidence: 0.99,
      latencyMs: Math.max(1, Date.now() - start),
      intent,
      keyTerms: [{ mn: raw, en: customMap.get(normalized)! }],
      timestamp: new Date().toISOString(),
    };
  }

  // 2. Check cached cloud translations
  if (options.cachedTranslations && options.cachedTranslations[normalized]) {
    const cachedEn = options.cachedTranslations[normalized];
    return {
      id: `tr-${Date.now()}`,
      mongolian: raw,
      romanization,
      english: cachedEn,
      englishWords,
      engine: 'offline-cache',
      isOffline: true,
      confidence: 0.97,
      latencyMs: Math.max(1, Date.now() - start),
      intent,
      keyTerms: [],
      timestamp: new Date().toISOString(),
    };
  }

  // 3. Check exact or high-similarity phrasebook match (skip fuzzy match if code-switched English tokens exist)
  const inputTokens = normalized.split(' ');
  let bestPhrase: { entry: (typeof PHRASEBOOK)[number]; score: number } | null = null;
  for (const entry of PHRASEBOOK) {
    if (entry.mn === normalized) {
      return {
        id: `tr-${Date.now()}`,
        mongolian: raw,
        romanization,
        english: entry.en,
        englishWords,
        engine: 'offline-phrasebook',
        isOffline: true,
        confidence: 0.96,
        latencyMs: Math.max(1, Date.now() - start),
        intent: entry.intent,
        keyTerms: [],
        timestamp: new Date().toISOString(),
      };
    }
    if (englishWords.length === 0) {
      const phraseTokens = entry.mn.split(' ');
      const score = diceSimilarity(inputTokens, phraseTokens);
      if (score >= 0.85 && (!bestPhrase || score > bestPhrase.score)) {
        bestPhrase = { entry, score };
      }
    }
  }

  if (bestPhrase) {
    return {
      id: `tr-${Date.now()}`,
      mongolian: raw,
      romanization,
      english: bestPhrase.entry.en,
      englishWords,
      engine: 'offline-phrasebook',
      isOffline: true,
      confidence: Number(bestPhrase.score.toFixed(2)),
      latencyMs: Math.max(1, Date.now() - start),
      intent: bestPhrase.entry.intent,
      keyTerms: [],
      timestamp: new Date().toISOString(),
    };
  }

  // 4. Multi-clause Morphological + Code-Switch Analysis + SOV -> SVO Reordering
  const allTokens = tokenizePreservingCodeSwitch(raw, customMap);
  const isQuestion =
    raw.includes('?') ||
    allTokens.some((t) =>
      ['уу', 'үү', 'юу', 'вэ', 'бэ', 'хэзээ', 'хаана', 'ямар', 'хэн', 'хэд'].includes(
        t.toLowerCase()
      )
    );

  // Split into sequential clauses at Mongolian converb "-аад/-ээд/-оод/-өөд" (including "хийгээд")
  const clauses: string[][] = [[]];
  for (const token of allTokens) {
    const analysis = analyzeMorpheme(token.toLowerCase(), customMap);
    clauses[clauses.length - 1].push(token);
    if (analysis.isConverbAnd && analysis.matchedEn) {
      clauses.push([]);
    }
  }
  const nonEmptyClauses = clauses.filter((c) => c.length > 0);

  const clauseOutputs: string[] = [];
  const allKeyTerms: KeyTermPair[] = [];
  let totalMatched = 0;

  for (let idx = 0; idx < nonEmptyClauses.length; idx += 1) {
    const res = translateClause(
      nonEmptyClauses[idx],
      customMap,
      isQuestion && idx === nonEmptyClauses.length - 1
    );
    if (res.english) clauseOutputs.push(res.english);
    totalMatched += res.matchedCount;
    allKeyTerms.push(...res.keyTerms);
  }

  const coverage = allTokens.length > 0 ? totalMatched / allTokens.length : 0;
  const confidence = Number(Math.min(0.93, Math.max(0.28, coverage * 0.9)).toFixed(2));
  const english = formatEnglishSentence(clauseOutputs.join(' and '), isQuestion);

  return {
    id: `tr-${Date.now()}`,
    mongolian: raw,
    romanization,
    english: english || romanization,
    englishWords,
    engine: 'offline-morphology',
    isOffline: true,
    confidence,
    latencyMs: Math.max(1, Date.now() - start),
    intent,
    keyTerms: allKeyTerms,
    timestamp: new Date().toISOString(),
  };
}
