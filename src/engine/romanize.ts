const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'ye',
  ё: 'yo',
  ж: 'j',
  з: 'z',
  и: 'i',
  й: 'i',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  ө: 'ö',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ү: 'ü',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ъ: '',
  ы: 'y',
  ь: 'i',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

export function romanizeMongolian(text: string): string {
  if (!text) return '';
  let result = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const lower = ch.toLowerCase();
    const mapped = CYRILLIC_TO_LATIN[lower];
    if (mapped !== undefined) {
      if (ch !== lower && mapped.length > 0) {
        result += mapped.charAt(0).toUpperCase() + mapped.slice(1);
      } else {
        result += mapped;
      }
    } else {
      result += ch;
    }
  }
  return result.replace(/\s+/g, ' ').trim();
}
