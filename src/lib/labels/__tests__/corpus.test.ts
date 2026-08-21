import { beforeEach, describe, expect, it, vi } from 'vitest';
import { redisAppend, redisLlen } from '@/lib/redis';
import { appendToCorpus, CORPUS_MONTH_CAP, hasCorpusRoom } from '../corpus';

vi.mock('@/lib/redis', () => ({
  redisAppend: vi.fn(async () => 1),
  redisLlen: vi.fn(async () => 0),
}));

const KEY = 'labels:comparability:2026-08';

describe('appendToCorpus', () => {
  beforeEach(() => {
    vi.mocked(redisAppend).mockClear();
    vi.mocked(redisLlen).mockClear();
  });

  it('writes while the month is under the cap', async () => {
    vi.mocked(redisLlen).mockResolvedValueOnce(CORPUS_MONTH_CAP - 1);

    await expect(appendToCorpus(KEY, '{}')).resolves.toBe('written');
    expect(redisAppend).toHaveBeenCalledWith(KEY, '{}');
  });

  it('refuses to write once the month is full', async () => {
    vi.mocked(redisLlen).mockResolvedValueOnce(CORPUS_MONTH_CAP);

    await expect(appendToCorpus(KEY, '{}')).resolves.toBe('full');
    expect(redisAppend).not.toHaveBeenCalled();
  });

  // Écrire ce qu'on n'a pas su compter retirerait la borne exactement quand elle sert.
  it('refuses to write when the length cannot be read', async () => {
    vi.mocked(redisLlen).mockRejectedValueOnce(new Error('redis down'));

    await expect(appendToCorpus(KEY, '{}')).resolves.toBe('full');
    expect(redisAppend).not.toHaveBeenCalled();
  });

  // L'appelant n'a rien à réessayer, mais il doit savoir : les routes rendent un 503 sur
  // `'failed'` comme sur `'full'`, les enregistreurs ignorent le retour.
  it('reports a failed write instead of throwing', async () => {
    vi.mocked(redisAppend).mockRejectedValueOnce(new Error('redis down'));

    await expect(appendToCorpus(KEY, '{}')).resolves.toBe('failed');
  });
});

describe('hasCorpusRoom', () => {
  beforeEach(() => {
    vi.mocked(redisLlen).mockClear();
  });

  it('measures the month once, whatever the batch writes afterwards', async () => {
    vi.mocked(redisLlen).mockResolvedValueOnce(12);

    await expect(hasCorpusRoom(KEY)).resolves.toBe(true);
    expect(redisLlen).toHaveBeenCalledOnce();
  });

  it('closes the month at the cap, not one write later', async () => {
    vi.mocked(redisLlen).mockResolvedValueOnce(CORPUS_MONTH_CAP);

    await expect(hasCorpusRoom(KEY)).resolves.toBe(false);
  });

  // Le plafond borne une clé que rien ne purge : un compteur illisible ferme, il n'ouvre pas.
  it('refuses when the length cannot be read', async () => {
    vi.mocked(redisLlen).mockRejectedValueOnce(new Error('redis down'));

    await expect(hasCorpusRoom(KEY)).resolves.toBe(false);
  });
});
