/**
 * Utilities for identifying and handling English words inside mixed
 * Mongolian–English (code-switched) speech transcripts and text.
 */

export interface CodeSwitchParse {
  isEnglish: boolean;
  englishWord: string;
  cyrillicSuffix: string;
}

// Common English verbs frequently paired with Mongolian light verb "хийх" (e.g. "check хийгээрэй")
export const COMMON_ENGLISH_VERBS = new Set([
  'add',
  'approve',
  'archive',
  'assign',
  'backup',
  'book',
  'build',
  'call',
  'cancel',
  'change',
  'chat',
  'check',
  'clean',
  'close',
  'confirm',
  'connect',
  'copy',
  'create',
  'delete',
  'deploy',
  'download',
  'edit',
  'email',
  'explain',
  'export',
  'find',
  'fix',
  'forward',
  'highlight',
  'import',
  'install',
  'join',
  'launch',
  'list',
  'lock',
  'log',
  'login',
  'merge',
  'message',
  'move',
  'mute',
  'note',
  'open',
  'order',
  'paste',
  'pay',
  'pin',
  'ping',
  'plan',
  'post',
  'print',
  'push',
  'read',
  'record',
  'refresh',
  'remind',
  'remove',
  'rename',
  'reply',
  'report',
  'reset',
  'restart',
  'review',
  'run',
  'save',
  'schedule',
  'search',
  'send',
  'set',
  'share',
  'show',
  'sign',
  'skip',
  'slack',
  'start',
  'stop',
  'submit',
  'summarize',
  'sync',
  'tag',
  'test',
  'text',
  'translate',
  'unlock',
  'unmute',
  'update',
  'upgrade',
  'upload',
  'verify',
  'write',
  'zoom',
]);

// Standalone Mongolian Cyrillic suffixes that may attach after a space or hyphen
export const STANDALONE_MONGOLIAN_SUFFIX_RE =
  /^(ийг|ыг|г|ийн|ын|ний|ны|д|т|нд|аас|ээс|оос|өөс|аар|ээр|оор|өөр|тай|тэй|той|тайгаа|тэйгээ|тойгоо|ууд|үүд|нууд|нүүд|уудыг|үүдийг|аа|ээ|оо|өө|гаа|гээ|гоо|гөө|даа|дээ|доо|дөө)$/;

/**
 * Parses a raw token (which preserves original casing and optional hyphen)
 * to detect an embedded Latin English word and any attached Mongolian suffix.
 * Examples:
 * - "meeting" -> { isEnglish: true, englishWord: "meeting", cyrillicSuffix: "" }
 * - "email-ээр" -> { isEnglish: true, englishWord: "email", cyrillicSuffix: "ээр" }
 * - "PDF" -> { isEnglish: true, englishWord: "PDF", cyrillicSuffix: "" }
 * - "fileуудыг" -> { isEnglish: true, englishWord: "file", cyrillicSuffix: "уудыг" }
 */
export function parseMixedToken(rawToken: string): CodeSwitchParse | null {
  const cleaned = rawToken.replace(/^[.,!?;:"'()\[\]{}«»]+|[.,!?;:"'()\[\]{}«»]+$/g, '');
  if (!cleaned) return null;

  // Pattern 1: Pure English/alphanumeric token (must contain at least one ASCII letter)
  if (/^[A-Za-z][A-Za-z0-9'.+-]*$/.test(cleaned)) {
    return {
      isEnglish: true,
      englishWord: cleaned.replace(/-+$/, ''),
      cyrillicSuffix: '',
    };
  }

  // Pattern 2: English word + hyphen + Mongolian Cyrillic suffix (e.g., "email-ээр", "Slack-д", "file-уудыг")
  const hyphenMatch = cleaned.match(/^([A-Za-z][A-Za-z0-9'.+]*)-([а-яА-ЯөүӨҮёЁ]+)$/);
  if (hyphenMatch) {
    return {
      isEnglish: true,
      englishWord: hyphenMatch[1],
      cyrillicSuffix: hyphenMatch[2].toLowerCase(),
    };
  }

  // Pattern 3: English word concatenated directly with Mongolian Cyrillic suffix (e.g., "meetingийг")
  const concatMatch = cleaned.match(/^([A-Za-z][A-Za-z0-9']*)([а-яА-ЯөүӨҮёЁ]+)$/);
  if (concatMatch) {
    return {
      isEnglish: true,
      englishWord: concatMatch[1],
      cyrillicSuffix: concatMatch[2].toLowerCase(),
    };
  }

  return null;
}

/**
 * Extracts all distinct English words identified in a mixed Mongolian-English utterance.
 */
export function extractEnglishWords(text: string): string[] {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const raw of text.trim().split(/\s+/)) {
    const parsed = parseMixedToken(raw);
    if (parsed && parsed.englishWord) {
      const key = parsed.englishWord.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        words.push(parsed.englishWord);
      }
    }
  }
  return words;
}
