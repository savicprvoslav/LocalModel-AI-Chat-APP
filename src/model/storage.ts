import * as FS from 'expo-file-system/legacy';

export const modelsDir = (): string => `${FS.documentDirectory}models/`;
export const modelPath = (id: string): string => `${modelsDir()}${id}.gguf`;

export const ensureModelsDir = async (): Promise<void> => {
  await FS.makeDirectoryAsync(modelsDir(), { intermediates: true });
};

export const modelExists = async (id: string): Promise<boolean> => {
  const info = await FS.getInfoAsync(modelPath(id));
  return info.exists;
};

export const deleteModel = async (id: string): Promise<void> => {
  await FS.deleteAsync(modelPath(id), { idempotent: true });
};

export const freeDiskBytes = async (): Promise<number> => FS.getFreeDiskStorageAsync();

export const totalModelBytes = async (ids: string[]): Promise<number> => {
  let total = 0;
  for (const id of ids) {
    const info = await FS.getInfoAsync(modelPath(id));
    if (info.exists && 'size' in info && typeof info.size === 'number') {
      total += info.size;
    }
  }
  return total;
};
