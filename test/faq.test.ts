import axios from 'axios';
import cache from '../src/cache';
import { getFaqText, loadFaqEntries, resetFaqCache } from '../src/faq';

jest.mock('axios', () => ({
  get: jest.fn(),
}));

jest.mock('../src/cache', () => ({
  config: {
    faq_service_url: 'http://faq-service:8081/faq.json',
    faq_cache_time: 300,
    language: {
      faqCommandText: 'Static FAQ fallback',
    },
  },
}));

const mockedGet = axios.get as jest.Mock;

const sampleFaq = [
  { question: 'Как сбросить пароль?', answer: 'Нажмите «Забыли пароль».' },
  { question: 'Как удалить аккаунт?', answer: 'Напишите в поддержку.' },
];

describe('FAQ module', () => {
  beforeEach(() => {
    resetFaqCache();
    mockedGet.mockReset();
    cache.config.faq_service_url = 'http://faq-service:8081/faq.json';
  });

  it('loads entries from the FAQ service', async () => {
    mockedGet.mockResolvedValue({ data: sampleFaq });
    const entries = await loadFaqEntries();
    expect(mockedGet).toHaveBeenCalledWith(
      'http://faq-service:8081/faq.json',
      expect.any(Object)
    );
    expect(entries).toEqual(sampleFaq);
  });

  it('supports the { faq: [...] } response shape', async () => {
    mockedGet.mockResolvedValue({ data: { faq: sampleFaq } });
    const entries = await loadFaqEntries();
    expect(entries).toEqual(sampleFaq);
  });

  it('filters out malformed entries', async () => {
    mockedGet.mockResolvedValue({
      data: [sampleFaq[0], { question: 'no answer' }, null, 'junk'],
    });
    const entries = await loadFaqEntries();
    expect(entries).toEqual([sampleFaq[0]]);
  });

  it('caches entries between calls', async () => {
    mockedGet.mockResolvedValue({ data: sampleFaq });
    await loadFaqEntries();
    await loadFaqEntries();
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when no service url is configured', async () => {
    cache.config.faq_service_url = '';
    const entries = await loadFaqEntries();
    expect(entries).toEqual([]);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('formats entries as question/answer text', async () => {
    mockedGet.mockResolvedValue({ data: sampleFaq });
    const text = await getFaqText();
    expect(text).toBe(
      '*Как сбросить пароль?*\nНажмите «Забыли пароль».\n\n' +
        '*Как удалить аккаунт?*\nНапишите в поддержку.'
    );
  });

  it('falls back to static text when service is unavailable', async () => {
    mockedGet.mockRejectedValue(new Error('ECONNREFUSED'));
    const text = await getFaqText();
    expect(text).toBe('Static FAQ fallback');
  });

  it('falls back to static text when no url is configured', async () => {
    cache.config.faq_service_url = '';
    const text = await getFaqText();
    expect(text).toBe('Static FAQ fallback');
  });

  it('serves stale cached entries when a refresh fails', async () => {
    cache.config.faq_cache_time = 0.001; // expire almost immediately
    mockedGet.mockResolvedValueOnce({ data: sampleFaq });
    await loadFaqEntries();
    await new Promise((resolve) => setTimeout(resolve, 5));
    mockedGet.mockRejectedValueOnce(new Error('timeout'));
    const text = await getFaqText();
    expect(text).toContain('Как сбросить пароль?');
    cache.config.faq_cache_time = 300;
  });
});
