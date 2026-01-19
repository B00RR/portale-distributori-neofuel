// ==========================================
// CLOSURE STATE - Stato condiviso del wizard
// ==========================================

/**
 * Stato globale del wizard di chiusura
 * Condiviso tra tutti i moduli closure-*
 */
export const closureState = {
  step: 1,
  data: {},

  // Dati del turno
  activeOpening: null,
  stationId: null,
  userId: null,

  // Dati caricati
  pistole: [],
  prezzi: null,
  movimenti: [],
  openingCounters: {},
  allowPartialClosure: false,
  tankLinks: [],

  // Contatori inseriti dall'utente
  closureCounters: {},

  // Calcoli
  calculations: null
};

/**
 * Resetta lo stato del wizard
 */
export function resetClosureState() {
  closureState.step = 1;
  closureState.data = {};
  closureState.activeOpening = null;
  closureState.stationId = null;
  closureState.userId = null;
  closureState.pistole = [];
  closureState.prezzi = null;
  closureState.movimenti = [];
  closureState.openingCounters = {};
  closureState.allowPartialClosure = false;
  closureState.tankLinks = [];
  closureState.closureCounters = {};
  closureState.calculations = null;
}

/**
 * Imposta i dati iniziali del wizard
 */
export function initClosureState(stationId, userId, activeOpening) {
  resetClosureState();
  closureState.stationId = stationId;
  closureState.userId = userId;
  closureState.activeOpening = activeOpening;
}

/**
 * Aggiorna lo step corrente
 */
export function setClosureStep(step) {
  closureState.step = step;
}

/**
 * Salva i contatori di chiusura inseriti
 */
export function setClosureCounters(counters) {
  closureState.closureCounters = { ...counters };
}

/**
 * Salva i calcoli
 */
export function setCalculations(calculations) {
  closureState.calculations = calculations;
}
