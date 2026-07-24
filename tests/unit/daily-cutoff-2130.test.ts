/**
 * Unit tests for Issue #426: 21:30 Daily Cutoff, Realtime Badge, and Chiusura Menu Reuse
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Mock Supabase
vi.mock('../../js/core/api.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          is: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null }))
              }))
            }))
          }))
        }))
      }))
    })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(cb => {
        if (typeof cb === 'function') cb('SUBSCRIBED', null);
        return {};
      })
    })),
    removeChannel: vi.fn(() => Promise.resolve('ok')),
    rpc: vi.fn(() => Promise.resolve({ data: { success: true }, error: null }))
  }
}));

// Mock Toast
vi.mock('../../js/ui/toast.js', () => ({
  Toast: {
    show: vi.fn()
  }
}));

// Mock ui modal helpers
vi.mock('../../js/ui/ui.js', () => ({
  openModal: vi.fn(),
  closeModal: vi.fn(),
  openConfirmModal: vi.fn(() => Promise.resolve(true))
}));

describe('Issue #426 - Daily Cutoff & Chiusura Flow', () => {
  let migrationSql: string;

  beforeEach(() => {
    document.body.innerHTML = '<div id="modal-body"></div>';
    vi.clearAllMocks();
    migrationSql = readFileSync(
      resolve(__dirname, '../../sql/migrations/20260724_daily_cutoff_2130_426.sql'),
      'utf-8'
    );
  });

  describe('SQL Migration Requirements (#426)', () => {
    it('defines finalize_daily_partial_shifts with SECURITY DEFINER and empty search_path', () => {
      expect(migrationSql).toContain(
        'CREATE OR REPLACE FUNCTION public.finalize_daily_partial_shifts()'
      );
      expect(migrationSql).toContain('SECURITY DEFINER');
      expect(migrationSql).toContain("SET search_path = ''");
    });

    it('defines finalize_daily_partial_shifts_cron_guard with Europe/Rome 21:30 check', () => {
      expect(migrationSql).toContain(
        'CREATE OR REPLACE FUNCTION public.finalize_daily_partial_shifts_cron_guard()'
      );
      expect(migrationSql).toContain("to_char(timezone('Europe/Rome', now()), 'HH24:MI')");
      expect(migrationSql).toContain("'21:30'");
    });

    it('revokes execution privileges from PUBLIC, anon, authenticated for finalization functions', () => {
      expect(migrationSql).toContain(
        'REVOKE ALL ON FUNCTION public.finalize_daily_partial_shifts() FROM PUBLIC, anon, authenticated;'
      );
      expect(migrationSql).toContain(
        'REVOKE ALL ON FUNCTION public.finalize_daily_partial_shifts_cron_guard() FROM PUBLIC, anon, authenticated;'
      );
    });

    it('enables pg_cron extension explicitly and schedules cron jobs for CET and CEST idempotently', () => {
      expect(migrationSql).toContain('CREATE EXTENSION IF NOT EXISTS pg_cron;');
      expect(migrationSql).toContain('cron.unschedule(jobid)');
      expect(migrationSql).toContain("'daily_cutoff_2130_cest'");
      expect(migrationSql).toContain("'30 19 * * *'");
      expect(migrationSql).toContain("'daily_cutoff_2130_cet'");
      expect(migrationSql).toContain("'30 20 * * *'");
    });

    it('wraps migration in transaction block BEGIN and COMMIT', () => {
      expect(migrationSql).toMatch(/^BEGIN;/m);
      expect(migrationSql).toMatch(/^COMMIT;/m);
    });

    it('does NOT swallow critical cron or realtime errors', () => {
      expect(migrationSql).not.toContain('WHEN OTHERS THEN');
      expect(migrationSql).not.toContain('RAISE NOTICE');
    });

    it('includes public.shifts in supabase_realtime publication idempotently', () => {
      expect(migrationSql).toContain("pubname = 'supabase_realtime'");
      expect(migrationSql).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE public.shifts');
    });

    it('enforces partial closure for non-admins server-side in submit_shift_closure_v2', () => {
      expect(migrationSql).toContain('IF public.is_admin() THEN');
      expect(migrationSql).toContain("v_effective_closure_type := 'partial';");
    });

    it('preserves submit_shift_closure_v2 authoritative features and anti-regression contracts', () => {
      expect(migrationSql).toContain('processed_requests');
      expect(migrationSql).toContain('v_request_inserted');
      expect(migrationSql).toContain('tank_pump_usages');
      expect(migrationSql).toContain('public.get_price_at');
      expect(migrationSql).not.toContain('get_price_for_fuel_type');
      expect(migrationSql).toContain('punti_riscatti');
      expect(migrationSql).toContain('crediti_movimenti');
      expect(migrationSql).toContain("tipo = 'credito'");
      expect(migrationSql).toContain('Turno gia chiuso o non finalizzabile');
      expect(migrationSql).toContain('I contatori devono essere un oggetto JSON');
      expect(migrationSql).toContain("'computed', jsonb_build_object(");
      expect(migrationSql).not.toContain('customer_refunds');
    });

    it('filters target shifts by closed_at IS NULL and status = partial', () => {
      expect(migrationSql).toContain('WHERE closed_at IS NULL');
      expect(migrationSql).toContain("status = 'partial'");
      expect(migrationSql).not.toContain(
        "COALESCE(closing_data->>'closure_stage', '') = 'partial'"
      );
    });

    it('updates updated_at timestamp on finalization', () => {
      expect(migrationSql).toContain('updated_at = v_now_utc');
    });

    it('uses FOR UPDATE SKIP LOCKED to prevent race conditions and duplicate finalizations', () => {
      expect(migrationSql).toContain('FOR UPDATE SKIP LOCKED');
    });

    it('sets auto_finalized_at and auto_finalized_reason metadata on finalization', () => {
      expect(migrationSql).toContain("'{auto_finalized_at}'");
      expect(migrationSql).toContain("'{auto_finalized_reason}'");
      expect(migrationSql).toContain('"daily_cutoff_21_30"');
    });
  });

  describe('Realtime Subscription & Badge Update', () => {
    it('registers a single realtime subscription and cleans up old ones via layout.ts', async () => {
      const { supabase } = await import('../../js/core/api.js');
      const { setupShiftsRealtimeSubscription, unsubscribeShiftsRealtime } =
        await import('../../js/operator/layout.js');

      const handlers = {
        onNavigate: vi.fn(),
        onOpening: vi.fn(),
        onClosure: vi.fn(),
        onStationChange: vi.fn()
      };

      setupShiftsRealtimeSubscription(1, '10', handlers);
      expect(supabase.channel).toHaveBeenCalledWith('shifts_realtime_1');

      // Calling setup again for same station should be a no-op
      setupShiftsRealtimeSubscription(1, '10', handlers);
      expect(supabase.channel).toHaveBeenCalledTimes(1);

      // Switching station unsubscribes previous and creates new
      setupShiftsRealtimeSubscription(2, '10', handlers);
      expect(supabase.removeChannel).toHaveBeenCalled();
      expect(supabase.channel).toHaveBeenCalledWith('shifts_realtime_2');

      unsubscribeShiftsRealtime();
      expect(supabase.removeChannel).toHaveBeenCalledTimes(2);
    });

    it('updates opening status badge to Aperto, Parziale, or Chiuso', async () => {
      const { updateOpeningStatus } = await import('../../js/operator/opening.js');
      const { supabase } = await import('../../js/core/api.js');

      const badge = document.createElement('span');
      badge.id = 'opening-status';
      document.body.appendChild(badge);

      // Test 1: No active shift -> Chiuso
      (supabase.from as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null }))
                }))
              }))
            }))
          }))
        }))
      }));

      await updateOpeningStatus(1);
      expect(badge.textContent).toBe('Chiuso');
      expect(badge.className).toContain('status-closed');

      // Test 2: Active shift without partial closure -> Aperto
      (supabase.from as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn(() =>
                    Promise.resolve({
                      data: {
                        id: 1,
                        opened_at: new Date().toISOString(),
                        closing_data: null,
                        users: { full_name: 'Andrea' }
                      },
                      error: null
                    })
                  )
                }))
              }))
            }))
          }))
        }))
      }));

      await updateOpeningStatus(1);
      expect(badge.textContent).toBe('Aperto');
      expect(badge.className).toContain('status-open');

      // Test 3: Active shift with partial closure -> Parziale
      (supabase.from as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn(() =>
                    Promise.resolve({
                      data: {
                        id: 1,
                        opened_at: new Date().toISOString(),
                        closing_data: { closure_stage: 'partial' },
                        users: { full_name: 'Andrea' }
                      },
                      error: null
                    })
                  )
                }))
              }))
            }))
          }))
        }))
      }));

      await updateOpeningStatus(1);
      expect(badge.textContent).toBe('Parziale');
      expect(badge.className).toContain('status-partial');
    });
  });

  describe('Chiusura Menu Action & Toast Notification', () => {
    it('opens showAperturaForm when clicking Chiusura without an active shift', async () => {
      const { startClosureWizard } = await import('../../js/operator/closure.js');
      const { supabase } = await import('../../js/core/api.js');

      // No active shift
      (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null }))
                }))
              }))
            }))
          }))
        }))
      }));

      await startClosureWizard(1, 10);

      // Should render shift-opener in modal for opening
      const modalBody = document.getElementById('modal-body');
      expect(modalBody).toBeDefined();
      expect(modalBody?.querySelector('shift-opener')).not.toBeNull();
    });

    it('opens ClosureWizard when clicking Chiusura with an active shift', async () => {
      const { startClosureWizard } = await import('../../js/operator/closure.js');
      const { supabase } = await import('../../js/core/api.js');

      // Active shift present
      (supabase.from as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn(() =>
                    Promise.resolve({
                      data: {
                        id: 42,
                        opened_at: new Date().toISOString(),
                        closing_data: null
                      },
                      error: null
                    })
                  )
                }))
              }))
            }))
          }))
        }))
      }));

      await startClosureWizard(1, 10);

      const modalBody = document.getElementById('modal-body');
      expect(modalBody).toBeDefined();
      expect(modalBody?.querySelector('closure-wizard')).not.toBeNull();
    });

    it('shows success Toast once on successful shift opening', async () => {
      const { showAperturaForm } = await import('../../js/operator/opening.js');
      const { Toast } = await import('../../js/ui/toast.js');
      const { supabase } = await import('../../js/core/api.js');

      // No active shift initially
      (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null }))
                }))
              }))
            }))
          }))
        }))
      }));

      await showAperturaForm(1);

      const modalBody = document.getElementById('modal-body');
      const opener = modalBody?.querySelector('shift-opener');
      expect(opener).not.toBeNull();

      // Dispatch success event from shift-opener
      opener?.dispatchEvent(new CustomEvent('success', { detail: { shift: { id: 99 } } }));

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(Toast.show).toHaveBeenCalledWith(
        'Nuovo turno aperto — Ora puoi registrare le operazioni della nuova giornata.',
        'success',
        4000
      );
    });
  });
});
