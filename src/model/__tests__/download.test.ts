// eslint-disable-next-line @typescript-eslint/no-require-imports
const FS = require('expo-file-system');
import { downloadModel } from '../download';
import { CATALOG } from '../catalog';

beforeEach(() => {
  FS.__clearFiles();
  FS.__setFreeDisk(10_000_000_000);
});

describe('model/download', () => {
  it('reports progress and completes when SHA check is skipped', async () => {
    const entry = { ...CATALOG[0]!, sizeBytes: 100 };
    const progress: number[] = [];
    await downloadModel(entry, { onProgress: (p) => progress.push(p), skipShaCheck: true });
    expect(progress.length).toBeGreaterThanOrEqual(2);
    expect(progress[progress.length - 1]).toBe(1);
  });

  it('throws if free disk is insufficient', async () => {
    FS.__setFreeDisk(50);
    const entry = { ...CATALOG[0]!, sizeBytes: 100 };
    await expect(downloadModel(entry, { skipShaCheck: true })).rejects.toThrow(/free disk/i);
  });

  it('throws on SHA mismatch when sha check enabled', async () => {
    const entry = { ...CATALOG[0]!, sha256: 'WRONG_HASH', sizeBytes: 100 };
    await expect(downloadModel(entry, { skipShaCheck: false })).rejects.toThrow(/sha-256/i);
  });

  it('skips SHA verification when catalog entry has no sha256', async () => {
    const entry = { ...CATALOG[0]!, sizeBytes: 100 };
    delete (entry as { sha256?: string }).sha256;
    await expect(downloadModel(entry, { skipShaCheck: false })).resolves.toBeDefined();
  });
});
