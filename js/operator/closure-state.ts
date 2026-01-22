// ==========================================
// CLOSURE STATE - Stato condiviso del wizard
// ==========================================
import { MovimentoCassa, Pistola, Shift } from '../types.js';

export interface ClosureState {
    step: number;
    data: any;

    // Dati del turno
    activeOpening: Shift | null;
    stationId: number | string | null;
    userId: string | null;

    // Dati caricati
    pistole: Pistola[];
    prezzi: any;
    movimenti: MovimentoCassa[];
    openingCounters: Record<number, number>;
    allowPartialClosure: boolean;
    tankLinks: any[];

    // Contatori inseriti dall'utente
    closureCounters: Record<number, number>;

    // Calcoli
    calculations: any;
}

/**
 * Stato globale del wizard di chiusura
 * Condiviso tra tutti i moduli closure-*
 */
export const closureState: ClosureState = {
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
 * Reset the shared closure wizard state to its initial defaults.
 *
 * Restores default values for all state fields (step, data, activeOpening, stationId, userId, pistole, prezzi, movimenti, openingCounters, allowPartialClosure, tankLinks, closureCounters, and calculations).
 */
export function resetClosureState(): void {
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
 * Initialize the closure wizard state with the given station, user, and active opening.
 *
 * @param stationId - Identifier of the station (number or string)
 * @param userId - Identifier of the user
 * @param activeOpening - The active opening (shift) to associate with the state
 */
export function initClosureState(stationId: number | string, userId: string, activeOpening: Shift): void {
    resetClosureState();
    closureState.stationId = stationId;
    closureState.userId = userId;
    closureState.activeOpening = activeOpening;
}

/**
 * Set the current wizard step for the closure process.
 *
 * @param step - The new step index (1-based) to set as current
 */
export function setClosureStep(step: number): void {
    closureState.step = step;
}

/**
 * Store the user-entered counters for the closure process.
 *
 * Replaces the current closure counters in the shared state with a shallow copy of the provided mapping.
 *
 * @param counters - Mapping from counter identifier to the entered numeric value
 */
export function setClosureCounters(counters: Record<number, number>): void {
    closureState.closureCounters = { ...counters };
}

/**
 * Store calculation results in the shared closure state.
 *
 * @param calculations - Computed results or summary data to save on the closure state
 */
export function setCalculations(calculations: any): void {
    closureState.calculations = calculations;
}