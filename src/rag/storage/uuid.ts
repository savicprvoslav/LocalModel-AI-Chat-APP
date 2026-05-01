/**
 * RFC4122-like v4 UUID. Uses `globalThis.crypto.randomUUID` when available
 * (modern RN with new arch, modern web), falls back to a Math.random-based
 * generator otherwise. The fallback is good enough for local SQLite primary
 * keys; do not use this where collision resistance against adversaries
 * matters.
 */
export const uuid = (): string => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  // Fallback — RFC4122 v4 layout, Math.random entropy.
  const hex = (n: number): string => {
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      out.push(Math.floor(Math.random() * 16).toString(16));
    }
    return out.join('');
  };
  // 8-4-4-4-12, with version 4 nibble and variant 8/9/a/b nibble.
  const variant = ['8', '9', 'a', 'b'][Math.floor(Math.random() * 4)] ?? '8';
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
};
