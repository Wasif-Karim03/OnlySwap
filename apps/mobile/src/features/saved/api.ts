import { createRpc, type RpcClient } from '@/lib/rpc';
import { getSupabase } from '@/lib/supabase';

import type { SavedItem } from './SavedScreen';

const rpc = createRpc(() => getSupabase() as unknown as RpcClient);

/** Saved items with the price when saved (P6-SAVE-01, `get_saved`). */
export const getSaved = () => rpc<SavedItem[]>('get_saved');
