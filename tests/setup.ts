import { beforeAll, afterEach, afterAll, vi } from 'vitest';
import '@testing-library/dom';
import '@testing-library/jest-dom';
import { mockSupabase } from './mocks/supabase';

// Helper per mockare variabili d'ambiente
process.env.VITE_SUPABASE_URL = 'https://mock.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'mock-key';

// #85: Lit non offre un interruttore per il banner "dev mode" fuori da una build
// di produzione, quindi filtriamo SOLO quel messaggio specifico da console.warn
// (tutto il resto passa invariato). Installato a livello di setup, prima che i
// test importino i Web Component Lit.
const __originalConsoleWarn = console.warn.bind(console);
console.warn = (...args: unknown[]): void => {
  if (typeof args[0] === 'string' && args[0].includes('Lit is in dev mode')) {
    return;
  }
  (__originalConsoleWarn as (...a: unknown[]) => void)(...args);
};

// Definizione interfaccia estesa per Window se necessario
declare global {
    interface Window {
        supabase: any;
        Html5Qrcode: any;
        Chart: any;
    }
}

// 1. SETUP CLOBALE PRIMA DI TUTTI I TEST
beforeAll(() => {
    // Mock di window.supabase (se usato direttamente nel codice legacy)
    // Nota: I moduli importati dovrebbero usare il client iniettato, ma window.supabase è comune in legacy
    window.supabase = mockSupabase;

    // Mock Fetch API se non già supportato da JSDOM/Vitest (Node 18+ ha fetch nativo, ma fallback è utile)
    if (!globalThis.fetch) {
        globalThis.fetch = vi.fn();
    }

    // Mock LocalStorage (se ambiente JSDOM ha problemi o per reset esplicito)
    // JSDOM già lo supporta, ma a volte serve un mock pulito
    const localStorageMock = (function () {
        let store: Record<string, string> = {};
        return {
            getItem: vi.fn((key: string) => store[key] || null),
            setItem: vi.fn((key: string, value: string) => {
                store[key] = value.toString();
            }),
            removeItem: vi.fn((key: string) => {
                delete store[key];
            }),
            clear: vi.fn(() => {
                store = {};
            }),
            get length() { return Object.keys(store).length; },
            key: vi.fn((i: number) => Object.keys(store)[i] || null)
        };
    })();

    Object.defineProperty(window, 'localStorage', {
        value: localStorageMock
    });

    // Mock dipendenze esterne globali
    window.Html5Qrcode = vi.fn().mockImplementation(() => ({
        start: vi.fn(),
        stop: vi.fn(),
        clear: vi.fn(),
    }));

    window.Chart = vi.fn();
});

// 2. PULIZIA DOPO OGNI TEST
afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
});

// 3. CLEANUP FINALE
afterAll(() => {
    // opzionale: teardown
});
