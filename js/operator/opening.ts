// ==========================================
// OPERATOR OPENING SHIFT MANAGEMENT
// Gestione apertura turno con caricamento contatori
// ==========================================
import { supabase, type Json } from '../core/api.js';
import { logger } from '../core/logger.js';
import { Shift, type CustomWindow } from '../types.js';
import { closeModal, openModal } from '../ui/ui.js';
import { setSafeHTML } from '../utils/sanitizer.js';
import { escapeHtml } from '../utils/utils.js';

import { createWarningMessage } from './ui-components.js';
// Import component to register it
import '../ui/components/ShiftOpener.js';

function getClosingStage(data: Json | null): 'partial' | 'final' | undefined {
  if (data && typeof data === 'object' && !Array.isArray(data) && 'closure_stage' in data) {
    const stage = (data as Record<string, Json>).closure_stage;
    if (stage === 'partial' || stage === 'final') {
      return stage;
    }
  }
  return undefined;
}

/**
 * Aggiorna il badge di stato apertura nel menu principale
 * @param {number | string} stationId - ID della stazione
 */
export async function updateOpeningStatus(stationId: number | string): Promise<void> {
  const badge = document.getElementById('opening-status');
  if (!badge) {
    return;
  }

  const activeOpening = await checkOpeningStatus(stationId);

  if (activeOpening) {
    const hasPartial = getClosingStage(activeOpening.closing_data) === 'partial';
    const statusLabel = hasPartial ? 'Parziale' : 'Aperto';
    badge.textContent = statusLabel;
    badge.className = `status-badge ${hasPartial ? 'status-partial' : 'status-open'}`;
    badge.title = `Aperto da ${activeOpening.users?.full_name || 'Operatore'} il ${new Date(activeOpening.opened_at).toLocaleString('it-IT')}`;
  } else {
    badge.textContent = 'Chiuso';
    badge.className = 'status-badge status-closed';
    badge.title = 'Nessuna apertura attiva';
  }
}

/**
 * Controlla se esiste un'apertura attiva per la stazione
 * @param {number | string} stationId - ID della stazione
 * @returns {Promise<Shift | null>} Dati apertura attiva o null
 */
export async function checkOpeningStatus(stationId: number | string): Promise<Shift | null> {
  try {
    // Usa la nuova tabella shifts unificata
    const { data, error } = await supabase
      .from('shifts')
      .select(
        'id, opened_at, operator_id, status, opening_data, closing_data, users!operator_id(full_name)'
      )
      .eq('station_id', Number(stationId))
      .is('closed_at', null)
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!data) {
      return null;
    }

    return data as unknown as Shift;
  } catch (err) {
    logger.error('opening', 'Errore controllo apertura:', err);
    return null;
  }
}

/**
 * Mostra il form per l'apertura turno
 * @param {number | string} stationId - ID della stazione
 */
export async function showAperturaForm(stationId: number | string): Promise<void> {
  try {
    // 1. Controlla se esiste già un'apertura attiva
    const activeOpening = await checkOpeningStatus(stationId);

    if (activeOpening) {
      const openingDate = new Date(activeOpening.opened_at).toLocaleString('it-IT');
      openModal('Apertura Già Effettuata');
      const modalBody = document.getElementById('modal-body');
      if (modalBody) {
        setSafeHTML(
          modalBody,
          createWarningMessage(
            'Apertura Già Effettuata',
            'Il turno è già stato aperto',
            `Data apertura: ${openingDate}. Devi prima chiudere il turno corrente prima di aprirne uno nuovo.`
          ) +
            '<div style="text-align: center; margin-top: 20px;"><button id="btn-close-warning" class="menu-button primary">Chiudi</button></div>'
        );

        const closeBtn = document.getElementById('btn-close-warning');
        if (closeBtn) {
          closeBtn.addEventListener('click', () => closeModal());
        }
      }
      return;
    }

    // Apri il modal e renderizza il componente
    openModal('Apertura Turno');
    const modalBody = document.getElementById('modal-body');
    if (!modalBody) {
      return;
    }

    setSafeHTML(modalBody, ''); // Pulisci modal

    const opener = document.createElement('shift-opener');
    opener.setAttribute('stationId', stationId.toString());

    // Listen for cancel event
    opener.addEventListener('cancel', () => closeModal());

    // Listen for success event
    opener.addEventListener('success', () => {
      // Il componente mostra già un messaggio di successo con reload
      // ma possiamo aggiornare lo status nel menu se necessario
      const refreshFn = (window as unknown as CustomWindow).refreshUiIcons;
      if (typeof refreshFn === 'function') {
        refreshFn();
      }
    });

    modalBody.appendChild(opener);
  } catch (err) {
    logger.error('opening', 'Errore apertura form:', err);
    openModal('Errore');
    const errorModalBody = document.getElementById('modal-body');
    if (errorModalBody) {
      const message = err instanceof Error ? err.message : 'Errore imprevisto';
      setSafeHTML(
        errorModalBody,
        `<p style="color: red; padding: 20px;">${escapeHtml(message)}</p>`
      );
    }
  }
}
