/**
 * Admin Notifications Module
 * Handles notification display in the admin panel
 */

import { supabase } from '../core/api.js';
import { BusinessLogicManager } from '../core/business-logic-manager.js';
import { handleError } from '../shared/error-handler.js';
import { formatNumberIt } from '../utils/utils.js';

/**
 * Display notifications in the admin panel
 * @param container - HTML element where notifications will be rendered
 */
export async function showNotificheAdmin(container: HTMLElement): Promise<void> {
    container.innerHTML = '<p class="loading-text">Controllo notifiche e allerta di sistema...</p>';

    try {
        const [rules, tanksRes, shiftsRes] = await Promise.all([
            BusinessLogicManager.loadRules(),
            supabase.from('tanks').select('name, fuel_type, liters, station_id, fuel_stations(station_name)'),
            supabase.from('shifts').select('id, created_at, status, station_id, fuel_stations(station_name)').eq('status', 'open')
        ]);

        const alerts: string[] = [];

        // 1. Check Fuel Reserves
        if (tanksRes.data) {
            tanksRes.data.forEach((t: any) => {
                const liters = t.liters || 0;
                if (liters < rules.fuel_reserve_alert_liters) {
                    alerts.push(`
                        <div class="alert-card critical">
                            <div class="alert-icon"><i class="fas fa-gas-pump"></i></div>
                            <div class="alert-content">
                                <strong>Scorta Critica: ${t.name} (${t.fuel_type})</strong>
                                <p>Presso ${t.fuel_stations?.station_name || `Stazione #${t.station_id}`}: Rimangono solo ${formatNumberIt(liters)} litri.</p>
                            </div>
                        </div>
                    `);
                }
            });
        }

        // 2. Check Stale Shifts
        if (shiftsRes.data) {
            const now = new Date().getTime();
            shiftsRes.data.forEach((s: any) => {
                const createdAt = new Date(s.created_at).getTime();
                const hoursOpen = (now - createdAt) / (1000 * 60 * 60);
                if (hoursOpen > rules.force_close_hours_threshold) {
                    alerts.push(`
                        <div class="alert-card warning">
                            <div class="alert-icon"><i class="fas fa-clock"></i></div>
                            <div class="alert-content">
                                <strong>Turno Aperto da troppo tempo</strong>
                                <p>ID #${s.id} presso ${s.fuel_stations?.station_name || `Stazione #${s.station_id}`} è aperto da ${hoursOpen.toFixed(1)} ore.</p>
                            </div>
                        </div>
                    `);
                }
            });
        }

        if (alerts.length === 0) {
            container.innerHTML = '<div class="empty-notifications"><i class="fas fa-check-circle"></i> <p>Tutto sotto controllo. Nessuna notifica critica.</p></div>';
        } else {
            container.innerHTML = `
                <div class="notifications-list">
                    <h3>Allerta di Sistema</h3>
                    ${alerts.join('')}
                </div>
            `;
        }
    } catch (err) {
        handleError(err as Error, 'showNotificheAdmin', container);
    }
}
