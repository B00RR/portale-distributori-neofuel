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
 * Resetta lo stato del wizard
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
 * Imposta i dati iniziali del wizard
 */
export function initClosureState(stationId: number | string, userId: string, activeOpening: Shift): void {
    resetClosureState();
    closureState.stationId = stationId;
    closureState.userId = userId;
    closureState.activeOpening = activeOpening;
}

/**
 * Aggiorna lo step corrente
 */
export function setClosureStep(step: number): void {
    closureState.step = step;
}

/**
 * Salva i contatori di chiusura inseriti
 */
export function setClosureCounters(counters: Record<number, number>): void {
    closureState.closureCounters = { ...counters };
}

/**
 * Salva i calcoli
 */
export function setCalculations(calculations: any): void {
    closureState.calculations = calculations;
}
