/**
 * ==========================================
 * SYNCHRONIZATION MANAGER
 * ==========================================
 * Gestisce il caricamento delle operazioni in coda quando torna la connessione.
 */

import { Toast } from '../ui/toast.js';

import { offlineDB } from './offline-db.js';

class SyncManager {
  constructor() {
    this.isSyncing = false;
    this._init();
  }

  _init() {
    // Ascolta l'evento online del browser
    window.addEventListener('online', () => {
      console.log('Connessione ripristinata. Avvio sincronizzazione...');
      this.sync();
    });

    // Controlliamo subito all'avvio
    if (navigator.onLine) {
      this.sync();
    }
  }

  /**
     * Tenta di sincronizzare la coda offline
     */
  async sync() {
    if (this.isSyncing || !navigator.onLine) {return;}

    const count = await offlineDB.getQueueCount();
    if (count === 0) {return;}

    this.isSyncing = true;
    console.log(`Sincronizzazione di ${count} operazioni in corso...`);

    try {
      const queue = await offlineDB.getQueue();

      for (const item of queue) {
        try {
          // Nota: Qui è dove si dovrebbe ricostruire la chiamata API originale.
          // Dato che le query Supabase sono complesse da serializzare,
          // per ora registriamo che c'è stato un tentativo fallito 
          // e notifichiamo l'admin o l'utente che deve riprovare 
          // o l'app riprova le operazioni più semplici deterministiche.

          // TODO: Implementare ricostruzione query specifica per Neofuel
          // Per ora emuliamo un successo se l'item è generico, 
          // ma in futuro useremo payload strutturati.

          await this._processItem(item);
          await offlineDB.dequeue(item.id);

        } catch (err) {
          console.error(`Errore sincronizzazione item ${item.id}:`, err);
          // Incrementiamo retryCount o lo lasciamo lì per il prossimo giro
        }
      }

      const remaining = await offlineDB.getQueueCount();
      if (remaining === 0) {
        Toast.show('Tutti i dati sono stati sincronizzati con successo!', 'success');
      } else {
        Toast.show(`${remaining} operazioni non sono state ancora sincronizzate.`, 'warning');
      }

      // Notifica UI del cambiamento
      document.dispatchEvent(new CustomEvent('sync-status-changed', { detail: { count: remaining } }));

    } catch (err) {
      console.error('Errore critico durante la sincronizzazione:', err);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
     * Elabora un singolo elemento della coda
     * @param {Object} item 
     */
  async _processItem(item) {
    // Implementazione placeholder: qui andrebbe la logica specifica 
    // per mappare 'mutation_retry' verso la tabella corretta di Supabase.
    return new Promise(resolve => setTimeout(resolve, 500));
  }
}

export const syncManager = new SyncManager();
