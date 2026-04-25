// eslint-disable-next-line @typescript-eslint/no-require-imports
const FS = require('expo-file-system');
import {
  modelPath,
  modelExists,
  deleteModel,
  freeDiskBytes,
  modelsDir,
  totalModelBytes
} from '../storage';

beforeEach(() => {
  FS.__clearFiles();
  FS.__setFreeDisk(10_000_000_000);
});

describe('model/storage', () => {
  it('returns the conventional path under documents/models/', () => {
    expect(modelsDir()).toBe('file:///docs/models/');
    expect(modelPath('llama-3.2-3b-q4')).toBe('file:///docs/models/llama-3.2-3b-q4.gguf');
  });

  it('reports existence', async () => {
    FS.__setFile('file:///docs/models/llama-3.2-3b-q4.gguf', 2_000_000_000);
    await expect(modelExists('llama-3.2-3b-q4')).resolves.toBe(true);
    await expect(modelExists('missing')).resolves.toBe(false);
  });

  it('deletes', async () => {
    FS.__setFile('file:///docs/models/llama-3.2-3b-q4.gguf', 2_000_000_000);
    await deleteModel('llama-3.2-3b-q4');
    await expect(modelExists('llama-3.2-3b-q4')).resolves.toBe(false);
  });

  it('reports free disk', async () => {
    await expect(freeDiskBytes()).resolves.toBe(10_000_000_000);
  });

  it('totals installed model sizes', async () => {
    FS.__setFile('file:///docs/models/llama-3.2-1b-q4.gguf', 700_000_000);
    FS.__setFile('file:///docs/models/llama-3.2-3b-q4.gguf', 2_000_000_000);
    const total = await totalModelBytes(['llama-3.2-1b-q4', 'llama-3.2-3b-q4', 'qwen-2.5-7b-q4']);
    expect(total).toBe(2_700_000_000);
  });
});
