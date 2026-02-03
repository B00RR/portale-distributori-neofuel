import { vi } from 'vitest';

const z: any = {
    object: vi.fn(() => ({
        parse: vi.fn((x) => x || {}),
        shape: {},
        infer: {}
    })),
    number: vi.fn(() => ({
        min: vi.fn(() => ({
            max: vi.fn(() => ({
                default: vi.fn(() => ({}))
            }))
        }))
    })),
    boolean: vi.fn(() => ({
        default: vi.fn(() => ({}))
    })),
    string: vi.fn(() => ({
        optional: vi.fn(() => ({})),
        datetime: vi.fn(() => ({
            optional: vi.fn(() => ({}))
        }))
    })),
    infer: vi.fn()
};

export { z };
