import { requireOptionalNativeModule } from 'expo';

/** AR-04: StoreKit's appTransactionID. Null on Android, web, Expo Go and tests. */
export type AppTransactionNative = { getAppTransactionIdAsync(): Promise<string | null> };

export const appTransactionNative =
  requireOptionalNativeModule<AppTransactionNative>('OnlySwapAppTransaction');
