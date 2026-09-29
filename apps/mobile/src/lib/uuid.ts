import * as Crypto from 'expo-crypto';

/** A v4 UUID: expo-crypto on device, a Math.random fallback where it isn't there (tests). */
export function uuid(): string {
  const native = typeof Crypto.randomUUID === 'function' ? Crypto.randomUUID() : undefined;
  if (native) return native;
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
