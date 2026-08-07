import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

/**
 * Guardia di regressione per #460 (REST Supabase 400 "No API key found").
 *
 * La diagnosi (verificata su produzione) ha accertato che il codice e l'env
 * Vercel sono corretti: createClient riceve la publishable key e la inietta in
 * ogni chiamata REST. Questo test blocca future regressioni che facciano partire
 * una REST senza header `apikey` (il sintomo esatto dell'issue), importando il
 * client REALE di supabase-js (non il mock del setup globale).
 */
describe('Supabase client REST apikey injection (#460)', () => {
  const fetchMock = vi.fn();
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = fetchMock;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [], error: null })
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    fetchMock.mockReset();
  });

  it('injects a non-empty apikey and Authorization header on REST calls', async () => {
    const SUPABASE_URL = 'https://ahlmgafaurossyghimxc.supabase.co';
    const PUBLISHABLE_KEY = 'sb_publishable_test';
    const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY);

    await client.from('shift_closures').select('*');

    expect(fetchMock).toHaveBeenCalled();
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    const headers = (requestInit?.headers ?? {}) as Headers;

    // L'header apikey deve essere presente e valorizzato con la chiave del client.
    expect(headers.get('apikey')).toBe(PUBLISHABLE_KEY);
    // Authorization bearer deve usare la stessa chiave (anon/publishable).
    expect(headers.get('Authorization')).toContain('Bearer');
  });

  it('does not make an unauthenticated REST call when a key is provided', async () => {
    const client = createClient('https://ahlmgafaurossyghimxc.supabase.co', 'sb_publishable_test');

    await client.from('shift_closures').select('*');

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    const headers = (requestInit?.headers ?? {}) as Headers;
    expect(headers.get('apikey')).toBeTruthy();
  });
});
