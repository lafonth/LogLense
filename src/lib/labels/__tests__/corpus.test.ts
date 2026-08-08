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

  // Le calcul se rattrape, la donnée non capturée jamais : ne pas savoir compter ne doit
  // pas coûter une capture.
  it('writes anyway when the length cannot be read', async () => {
    vi.mocked(redisLlen).mockRejectedValueOnce(new Error('redis down'));

    await expect(appendToCorpus(KEY, '{}')).resolves.toBe('written');
    expect(redisAppend).toHaveBeenCalledOnce();
  });

  // L'appelant sait déjà quoi faire d'une écriture perdue — les routes rendent un 503, les
  // enregistreurs avalent. Masquer l'échec ici leur retirerait le choix.
  it('lets a failed write through to the caller', async () => {
    vi.mocked(redisAppend).mockRejectedValueOnce(new Error('redis down'));

    await expect(appendToCorpus(KEY, '{}')).rejects.toThrow('redis down');
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
});
