import axios from 'axios';
import cache from './cache';
import * as log from 'fancy-log';

export interface FaqEntry {
  question: string;
  answer: string;
}

let cachedEntries: FaqEntry[] | null = null;
let cachedAt = 0;

/**
 * Drops the in-memory FAQ cache. Used in tests.
 */
export function resetFaqCache(): void {
  cachedEntries = null;
  cachedAt = 0;
}

/**
 * Loads FAQ entries from the external FAQ service configured via
 * faq_service_url. The service must return JSON: either an array of
 * { question, answer } objects or an object with a "faq" array field.
 * Results are cached in memory for faq_cache_time seconds.
 *
 * @returns FAQ entries, empty array if no service is configured.
 */
export async function loadFaqEntries(): Promise<FaqEntry[]> {
  const url = cache.config.faq_service_url;
  if (!url) return [];
  const ttlMs = (cache.config.faq_cache_time || 300) * 1000;
  if (cachedEntries !== null && Date.now() - cachedAt < ttlMs) {
    return cachedEntries;
  }
  const { data } = await axios.get(url, { timeout: 10000 });
  const rawEntries = Array.isArray(data) ? data : data && data.faq;
  const entries = (Array.isArray(rawEntries) ? rawEntries : []).filter(
    (entry: any) =>
      entry &&
      typeof entry.question === 'string' &&
      typeof entry.answer === 'string'
  );
  cachedEntries = entries;
  cachedAt = Date.now();
  return entries;
}

/**
 * Builds the reply text for the /faq command. Falls back to stale cached
 * entries when the service is unreachable, and to the static
 * language.faqCommandText when no entries are available at all.
 *
 * @returns Formatted FAQ text.
 */
export async function getFaqText(): Promise<string> {
  let entries: FaqEntry[] = [];
  try {
    entries = await loadFaqEntries();
  } catch (error) {
    log.error('FAQ service request failed: ', error);
    entries = cachedEntries || [];
  }
  if (entries.length === 0) {
    return cache.config.language.faqCommandText;
  }
  return entries
    .map((entry) => `*${entry.question}*\n${entry.answer}`)
    .join('\n\n');
}
