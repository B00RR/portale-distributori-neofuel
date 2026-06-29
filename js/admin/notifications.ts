/**
 * Admin Notifications Module
 * Handles notification display in the admin panel
 */

import { supabase } from '../core/api.js';
import { BusinessLogicManager } from '../core/business-logic-manager.js';
import { handleError } from '../shared/error-handler.js';
import { formatNumberIt } from '../utils/utils.js';

interface TankRow {
  id: number;
  name: string;
  fuel_type: string;
  station_id?: number;
  fuel_stations?: { station_name?: string };
}

interface TankReadingRow {
  tank_id: number | null;
  liters: number | null;
  created_at: string | null;
}

interface ShiftRow {
  id: number;
  created_at: string;
  status: string;
  station_id?: number;
  fuel_stations?: { station_name?: string };
}

/**
 * Display notifications in the admin panel
 * @param container - HTML element where notifications will be rendered
 */
export async function showNotificheAdmin(container: HTMLElement): Promise<void> {
  const loading = document.createElement('p');
  loading.className = 'loading-text';
  loading.textContent = 'Controllo notifiche e allerta di sistema...';
  container.innerHTML = '';
  container.appendChild(loading);

  try {
    const [rules, tanksRes, shiftsRes] = await Promise.all([
      BusinessLogicManager.loadRules(),
      supabase.from('tanks').select('id, name, fuel_type, station_id, fuel_stations(station_name)'),
      supabase
        .from('shifts')
        .select('id, created_at, status, station_id, fuel_stations(station_name)')
        .eq('status', 'open')
    ]);

    // Check if notifications are globally enabled
    if (!rules.notifications_enabled) {
      container.innerHTML = '';
      const empty = document.createElement('div');
      empty.className = 'empty-notifications';

      const icon = document.createElement('i');
      icon.className = 'fas fa-bell-slash';
      icon.style.color = 'var(--text-secondary)';
      icon.style.fontSize = '2rem';
      icon.style.marginBottom = '1rem';
      empty.appendChild(icon);

      const p = document.createElement('p');
      p.textContent = 'Le notifiche critiche sono disabilitate nelle impostazioni.';
      empty.appendChild(p);

      container.appendChild(empty);
      return;
    }

    const alerts: HTMLElement[] = [];
    const errors: string[] = [];

    // Check for query errors
    if (tanksRes.error) {
      errors.push(
        'Impossibile caricare i dati dei serbatoi: ' +
          (tanksRes.error.message || 'Errore sconosciuto')
      );
    }
    if (shiftsRes.error) {
      errors.push(
        'Impossibile caricare i dati dei turni: ' +
          (shiftsRes.error.message || 'Errore sconosciuto')
      );
    }

    // 1. Check Fuel Reserves
    // The `tanks` table has no `liters` column; current liters come from the
    // most recent `tank_readings` row per tank (same source as the dashboard).
    const latestLitersByTank: Record<number, number> = {};
    const tankRows = (tanksRes.data || []) as TankRow[];
    if (tankRows.length > 0) {
      const tankIds = tankRows.map(t => t.id);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { data: readings } = await supabase
        .from('tank_readings')
        .select('tank_id, liters, created_at')
        .in('tank_id', tankIds)
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: false });
      for (const r of (readings || []) as TankReadingRow[]) {
        if (r.tank_id === null) {
          continue;
        }
        if (!(r.tank_id in latestLitersByTank)) {
          latestLitersByTank[r.tank_id] = r.liters || 0;
        }
      }
    }

    if (tanksRes.data) {
      tankRows.forEach(t => {
        const liters = latestLitersByTank[t.id] || 0;
        if (liters < rules.fuel_reserve_alert_liters) {
          const stationName = t.fuel_stations?.station_name || 'Stazione #' + String(t.station_id);
          alerts.push(
            createAlertCard(
              'critical',
              'fa-gas-pump',
              'Scorta Critica: ' + t.name + ' (' + t.fuel_type + ')',
              'Presso ' + stationName + ': Rimangono solo ' + formatNumberIt(liters) + ' litri.'
            )
          );
        }
      });
    }

    // 2. Check Stale Shifts
    if (shiftsRes.data) {
      const now = new Date().getTime();
      (shiftsRes.data as ShiftRow[]).forEach(s => {
        const createdAt = new Date(s.created_at).getTime();
        const hoursOpen = (now - createdAt) / (1000 * 60 * 60);
        if (hoursOpen > rules.force_close_hours_threshold) {
          const stationName = s.fuel_stations?.station_name || 'Stazione #' + String(s.station_id);
          alerts.push(
            createAlertCard(
              'warning',
              'fa-clock',
              'Turno Aperto da troppo tempo',
              'ID #' +
                String(s.id) +
                ' presso ' +
                stationName +
                ' è aperto da ' +
                hoursOpen.toFixed(1) +
                ' ore.'
            )
          );
        }
      });
    }

    container.innerHTML = '';

    // If there are errors, show them as critical alerts
    if (errors.length > 0) {
      const list = document.createElement('div');
      list.className = 'notifications-list';

      const title = document.createElement('h3');
      title.textContent = 'Allerta di Sistema';
      list.appendChild(title);

      errors.forEach(errorMsg => {
        list.appendChild(
          createAlertCard('critical', 'fa-exclamation-triangle', 'Errore di Caricamento', errorMsg)
        );
      });

      alerts.forEach(alert => list.appendChild(alert));
      container.appendChild(list);
    } else if (alerts.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-notifications';

      const icon = document.createElement('i');
      icon.className = 'fas fa-check-circle';
      empty.appendChild(icon);

      empty.appendChild(document.createTextNode(' '));

      const p = document.createElement('p');
      p.textContent = 'Tutto sotto controllo. Nessuna notifica critica.';
      empty.appendChild(p);

      container.appendChild(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'notifications-list';

      const title = document.createElement('h3');
      title.textContent = 'Allerta di Sistema';
      list.appendChild(title);

      alerts.forEach(alert => list.appendChild(alert));
      container.appendChild(list);
    }
  } catch (err) {
    handleError(err as Error, 'showNotificheAdmin', container);
  }
}

function createAlertCard(
  severity: 'critical' | 'warning',
  iconClass: string,
  titleText: string,
  bodyText: string
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'alert-card ' + severity;

  const iconWrap = document.createElement('div');
  iconWrap.className = 'alert-icon';
  const icon = document.createElement('i');
  icon.className = 'fas ' + iconClass;
  iconWrap.appendChild(icon);

  const content = document.createElement('div');
  content.className = 'alert-content';

  const strong = document.createElement('strong');
  strong.textContent = titleText;

  const p = document.createElement('p');
  p.textContent = bodyText;

  content.appendChild(strong);
  content.appendChild(p);

  card.appendChild(iconWrap);
  card.appendChild(content);

  return card;
}
