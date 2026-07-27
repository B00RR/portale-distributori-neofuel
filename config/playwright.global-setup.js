import dotenv from 'dotenv';

import { seedLiveE2EData } from '../scripts/e2e-live-seed.mjs';

dotenv.config({ quiet: true });

export default async function globalSetup() {
  if (process.env.E2E_SUPABASE_MODE !== 'live') {
    return;
  }

  const result = await seedLiveE2EData();
  if (result.skipped) {
    return;
  }
  console.log(`[E2E live seed] ready (runId: ${result.runId})`);
}
