import dotenv from 'dotenv';

import { cleanupLiveE2EData } from '../scripts/e2e-live-seed.mjs';

dotenv.config({ quiet: true });

export default async function globalTeardown() {
  if (process.env.E2E_SUPABASE_MODE !== 'live') {
    return;
  }

  const result = await cleanupLiveE2EData();
  if (result.skipped) {
    return;
  }
  console.log(`[E2E live cleanup] completed (runId: ${result.runId})`);
}
