import test from 'node:test';
import assert from 'node:assert/strict';
import { extractEnglishWords, parseMixedToken } from './codeSwitch';
import {
  detectAssistantIntent,
  normalizeMongolian,
  translateOffline,
} from './offlineTranslator';
import { romanizeMongolian } from './romanize';

test('romanizeMongolian transliterates Mongolian Cyrillic accurately', () => {
  assert.equal(romanizeMongolian('Сайн байна уу'), 'Sain baina uu');
  assert.equal(romanizeMongolian('Улаанбаатар'), 'Ulaanbaatar');
  assert.equal(romanizeMongolian('Өглөөний мэнд'), 'Öglöönii mend');
});

test('normalizeMongolian strips punctuation and normalizes whitespace', () => {
  assert.equal(
    normalizeMongolian('  Өнөөдөр, Улаанбаатарт цаг агаар ямар байна вэ?! '),
    'өнөөдөр улаанбаатарт цаг агаар ямар байна вэ'
  );
});

test('translateOffline resolves exact phrasebook matches with high confidence', () => {
  const res = translateOffline('Маргааш өглөө 9 цагт уулзалт товлоорой');
  assert.equal(res.isOffline, true);
  assert.equal(res.engine, 'offline-phrasebook');
  assert.equal(res.intent, 'schedule_event');
  assert.match(res.english, /Schedule a meeting tomorrow morning at 9/i);
  assert.ok(res.confidence >= 0.9);
});

test('translateOffline prioritizes custom glossary entries over built-in rules', () => {
  const res = translateOffline('Амарсанаа', {
    customGlossary: [
      {
        id: 'g1',
        mongolian: 'Амарсанаа',
        english: 'Amarsanaa (Product Lead)',
        category: 'Contacts',
        createdAt: '2026-11-19T00:00:00Z',
      },
    ],
  });
  assert.equal(res.engine, 'offline-glossary');
  assert.equal(res.english, 'Amarsanaa (Product Lead).');
});

test('translateOffline uses cached cloud translations when available offline', () => {
  const res = translateOffline('Төслийн тайланг маргааш илгээнэ үү', {
    cachedTranslations: {
      'төслийн тайланг маргааш илгээнэ үү': 'Please send the project report tomorrow.',
    },
  });
  assert.equal(res.engine, 'offline-cache');
  assert.equal(res.english, 'Please send the project report tomorrow.');
});

test('translateOffline handles morphological suffixes and SOV->SVO reordering for unseen sentences', () => {
  const res = translateOffline('Уулзалтуудыг маргааш шалгаарай');
  assert.equal(res.engine, 'offline-morphology');
  assert.equal(res.intent, 'schedule_event');
  assert.match(res.english, /Check meetings tomorrow/i);
});

test('detectAssistantIntent classifies personal assistant commands accurately', () => {
  assert.equal(detectAssistantIntent('Миний сануулга жагсаалтыг шалгаарай'), 'set_reminder');
  assert.equal(detectAssistantIntent('Өнөөдөр цаг агаар ямар байна вэ?'), 'weather_query');
  assert.equal(detectAssistantIntent('Шинэ имэйл илгээгээрэй'), 'send_message');
  assert.equal(detectAssistantIntent('Хамгийн ойрын эмийн сан хаана байна вэ?'), 'navigation');
  assert.equal(detectAssistantIntent('Маргааш 9 цагт Zoom meeting товлоорой'), 'schedule_event');
  assert.equal(detectAssistantIntent('Slack дээр message send хийгээрэй'), 'send_message');
});

test('translateOffline handles multi-clause converbs, reflexive endings, and genitive modifiers', () => {
  const emailRes = translateOffline('Энэ баримтыг орчуулаад илгээгээрэй');
  assert.match(emailRes.english, /Translate this document and send/i);

  const meetingRes = translateOffline('Өнөөдөр би найзтайгаа уулзана');
  assert.match(meetingRes.english, /I will meet with my friend today/i);

  const genitiveRes = translateOffline('Маргаашийн уулзалтыг шалгаарай');
  assert.match(genitiveRes.english, /Check tomorrow's meeting/i);

  const progressiveRes = translateOffline('Би ажиллаж байна');
  assert.match(progressiveRes.english, /I am working/i);
});

test('codeSwitch utilities identify mixed English tokens with attached Mongolian suffixes', () => {
  assert.deepEqual(parseMixedToken('PDF'), {
    isEnglish: true,
    englishWord: 'PDF',
    cyrillicSuffix: '',
  });
  assert.deepEqual(parseMixedToken('email-ээр'), {
    isEnglish: true,
    englishWord: 'email',
    cyrillicSuffix: 'ээр',
  });
  assert.deepEqual(parseMixedToken('meetingийг'), {
    isEnglish: true,
    englishWord: 'meeting',
    cyrillicSuffix: 'ийг',
  });
  assert.deepEqual(
    extractEnglishWords('Энэ PDF file-ийг email-ээр send хийгээрэй'),
    ['PDF', 'file', 'email', 'send']
  );
});

test('translateOffline handles mixed Mongolian-English code-switching accurately', () => {
  const mixedSend = translateOffline('Энэ PDF file-ийг email-ээр send хийгээрэй');
  assert.deepEqual(mixedSend.englishWords, ['PDF', 'file', 'email', 'send']);
  assert.equal(mixedSend.intent, 'send_message');
  assert.match(mixedSend.english, /Send this PDF file by email/i);

  const mixedProg = translateOffline('Би одоо report-оо update хийж байна');
  assert.deepEqual(mixedProg.englishWords, ['report', 'update']);
  assert.match(mixedProg.english, /I am updating my report now/i);

  const mixedMulti = translateOffline('File уудыг check хийгээд, Slack-д upload хийнэ үү');
  assert.deepEqual(mixedMulti.englishWords, ['File', 'check', 'Slack', 'upload']);
  assert.match(mixedMulti.english, /Check Files and please upload at Slack/i);

  const mixedSchedule = translateOffline('Маргааш 9 цагт Zoom meeting товлоорой');
  assert.deepEqual(mixedSchedule.englishWords, ['Zoom', 'meeting']);
  assert.equal(mixedSchedule.intent, 'schedule_event');
  assert.match(mixedSchedule.english, /Schedule Zoom meeting tomorrow at 9 o'clock/i);

  const cyrillicLoanwords = translateOffline('Дэдлайн маргааш тул линк-ийг чат руу илгээнэ үү');
  assert.equal(cyrillicLoanwords.intent, 'set_reminder');
  assert.match(cyrillicLoanwords.english, /send/i);
  assert.match(cyrillicLoanwords.english, /link/i);
  assert.match(cyrillicLoanwords.english, /to chat/i);
});
