import { randomUUID as nodeRandomUUID, createHash } from 'crypto';

export const randomUUID = (): string => nodeRandomUUID();

export const CryptoDigestAlgorithm = { SHA256: 'SHA-256' } as const;
export const CryptoEncoding = { HEX: 'hex' } as const;

export const digestStringAsync = async (
  _alg: string,
  data: string,
  _opts?: { encoding?: string }
): Promise<string> => createHash('sha256').update(data).digest('hex');
