// URL imports cannot be statically resolved by TypeScript; load from CDN, type-cast the module
import zodModule from 'https://cdn.jsdelivr.net/npm/zod@3.22.4/+esm';
export const z: typeof import('zod').z = (zodModule as unknown as typeof import('zod')).z;
