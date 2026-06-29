import {
  createClient as createSupabaseClient,
  type SupabaseClient,
  type SupabaseClientOptions
} from '@supabase/supabase-js';

import type { Database } from '../../supabase/database.types.js';

export type AppDatabase = Database;
export type AppSupabaseClient = SupabaseClient<Database>;

export const createClient = (
  url: string,
  key: string,
  options?: SupabaseClientOptions<'public'>
): AppSupabaseClient => createSupabaseClient<Database>(url, key, options);
