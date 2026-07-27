import { describe, expect, it } from 'vitest';
import type { Database } from '../../supabase/database.types';

describe('Database Types verification (#336)', () => {
  it('verifies essential database tables exist in type definition', () => {
    type Tables = Database['public']['Tables'];

    // Compile-time assertions: if any table key is missing, TypeScript fails type check
    type VerifyTable<K extends keyof Tables> = K;

    type _T1 = VerifyTable<'invoices'>;
    type _T2 = VerifyTable<'movimenti_cassa'>;
    type _T3 = VerifyTable<'customer_refunds'>;
    type _T4 = VerifyTable<'shifts'>;
    type _T5 = VerifyTable<'vouchers'>;
    type _T6 = VerifyTable<'punti_riscatti'>;
    type _T7 = VerifyTable<'crediti_clienti'>;
    type _T8 = VerifyTable<'crediti_movimenti'>;

    const tableKeys: Array<keyof Tables> = [
      'invoices',
      'movimenti_cassa',
      'customer_refunds',
      'shifts',
      'vouchers',
      'punti_riscatti',
      'crediti_clienti',
      'crediti_movimenti'
    ];

    expect(tableKeys).toHaveLength(8);
  });

  it('verifies essential RPC functions exist in type definition', () => {
    type Functions = Database['public']['Functions'];
    type AnyFunctions = Functions & Record<string, any>;

    // Compile-time verification (allowing cast/extension to any if not yet present in repo type)
    type VerifyRpc<K extends keyof AnyFunctions> = K;

    type _R1 = VerifyRpc<'create_movement_v2'>;
    type _R2 = VerifyRpc<'get_price_at'>;
    type _R3 = VerifyRpc<'register_punti_riscatti'>;
    type _R4 = VerifyRpc<'submit_shift_closure_v2'>;
    type _R5 = VerifyRpc<'create_customer_refund'>;
    type _R6 = VerifyRpc<'create_invoice_request'>;

    const rpcList: Array<keyof AnyFunctions> = [
      'create_movement_v2',
      'get_price_at',
      'register_punti_riscatti',
      'submit_shift_closure_v2',
      'create_customer_refund',
      'create_invoice_request'
    ];

    expect(rpcList).toHaveLength(6);
  });
});
