/**
 * Jest mock for expo-file-system.
 * In-memory file map. Only the methods our code uses are mocked.
 */
type FileEntry = { exists: true; uri: string; size?: number };

const files = new Map<string, FileEntry>();

export const documentDirectory = 'file:///docs/';

export const makeDirectoryAsync = jest.fn(async (_path: string, _opts?: unknown) => undefined);

export const getInfoAsync = jest.fn(async (path: string) => {
  const f = files.get(path);
  if (!f) return { exists: false, uri: path };
  return f;
});

export const deleteAsync = jest.fn(async (path: string, _opts?: { idempotent?: boolean }) => {
  files.delete(path);
});

let freeDisk = 10_000_000_000;
export const getFreeDiskStorageAsync = jest.fn(async () => freeDisk);

export const __setFreeDisk = (n: number): void => {
  freeDisk = n;
};

export const __setFile = (path: string, size: number): void => {
  files.set(path, { exists: true, uri: path, size });
};

export const __clearFiles = (): void => {
  files.clear();
};

export const readAsStringAsync = jest.fn(async (_path: string, _opts?: unknown) => 'fake-content');

export const EncodingType = { Base64: 'base64', UTF8: 'utf8' } as const;

export const createDownloadResumable = jest.fn(
  (
    url: string,
    path: string,
    _opts: unknown,
    onProgress: (p: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void
  ) => ({
    downloadAsync: jest.fn(async () => {
      onProgress({ totalBytesWritten: 50, totalBytesExpectedToWrite: 100 });
      onProgress({ totalBytesWritten: 100, totalBytesExpectedToWrite: 100 });
      __setFile(path, 100);
      return { uri: path, status: 200 };
    }),
    pauseAsync: jest.fn(async () => undefined),
    savable: jest.fn(() => ({}))
  })
);
