// ==========================================
// TYPE DEFINITIONS - Neofuel Web App
// Definizioni TypeScript per i modelli del database
// ==========================================

import type { Json } from './core/api.js';

export interface FuelStation {
    station_id: number;
    station_name: string;
    address?: string;
    allow_partial_closure: boolean;
    created_at: string;
}

export interface User {
    user_id: number;
    email: string;
    full_name: string | null;
    role: string;
    station_id?: number | null;
    is_active: boolean | null;
    created_at: string | null;
    username?: string;
    password_hash?: string;
    created_by_auth?: string | null;
    updated_at?: string | null;
    assignedStations?: { id: number; name: string }[];
}

export interface ShiftOpeningData {
    cash_in: number;
    cash_out: number;
    pos_amount: number;
    total_amount: number;
    uta_dkv_iscard: number;
    cash_in_minus_out: number;
}

export interface ShiftClosingData {
    closure_stage: 'partial' | 'final';
    cash_collected: number;
    pos_declared: number;
    discrepancy?: number;
    // ... add more if needed later ...
}

export interface Shift {
    id: number;
    station_id: number;
    operator_id: number;
    opened_at: string;
    closed_at: string | null;
    status: string;
    opening_data: Json | null;
    closing_data: Json | null;
    updated_at: string;
    created_at: string;
    users?: {
        full_name: string | null;
    } | null;
}

export interface Island {
    island_id: number;
    station_id: number;
    nome: string;
    island_name?: string;
}

export interface Pistola {
    id: number;
    island_id: number | null;
    nome: string | null;
    tipo_carburante: string | null;
    numero_litri: number | null;
    created_at?: string | null;
    station_id?: number | null;
    tank_id?: number | null;
    islands?: {
        nome: string | null;
        station_id: number | null;
    } | null;
}

export interface Tank {
    id: number;
    station_id: number;
    name: string;
    fuel_type: string;
    capacity_liters: number;
    current_level: number;
}

export interface Voucher {
    id: string;
    batch_id: string | null;
    code: string;
    amount: number;
    status: string | null;
    expiration_date: string | null;
    redeemed_at: string | null;
    redeemed_by: string | null;
    serial_number: number | null;
    station_id: number | null;
    created_at: string;
}

export interface VoucherBatch {
    id: string; // UUID
    description: string;
    customer_name?: string;
    expiration_date?: string;
    created_at: string;
}

export interface CreditoCliente {
    id: number;
    station_id: number;
    cliente: string;
    saldo: number;
    telefono?: string;
    created_at: string;
}

export interface Customer {
    id: number;
    nome?: string;
    partita_iva?: string;
    codice_univoco_pec?: string;
    telefono?: string;
    targa?: string;
    created_at?: string;
    updated_at?: string;
}

export interface MovimentoCassa {
    id: number;
    station_id: number;
    operator_id: string;
    tipo: 'incasso' | 'uscita' | 'credito' | 'voucher';
    importo: number;
    descrizione?: string;
    created_at: string;
}

export interface Invoice {
    id: number;
    station_id: number;
    operator_id: string;
    cliente_id: number;
    customer_name: string;
    amount: number;
    payment_method: 'contanti' | 'pos' | 'bonifico';
    status: 'pending' | 'sent' | 'paid';
    invoice_number: string;
    invoice_date: string;
}

export interface PrezzoDistributore {
    id: number;
    station_id: number;
    prezzo_benzina: number;
    prezzo_gasolio: number;
    data_validita: string;
    modificato_da?: string;
}

// ==========================================
// GLOBAL INTERFACES & LIBRARIES
// ==========================================

export interface Html5QrcodeConfig {
    fps?: number;
    qrbox?: number | { width: number; height: number };
    aspectRatio?: number;
}

export type QrSuccessCallback = (decodedText: string, decodedResult: any) => void;
export type QrErrorCallback = (errorMessage: string) => void;

export interface SortableEvent {
    item: HTMLElement;
    oldIndex: number;
    newIndex: number;
}

export interface CustomWindow extends Window {
    supabase: any;
    Sortable: any;
    voucherActions: any;
    requestPasswordReset: any;
    openPaymentModal: any;
    showNotificheAdmin: any;
    Html5Qrcode: any;
    plausible: any;
    XlsxPopulate: any;
    JSZip: any;
    calculationEngine: any;
    refreshUiIcons?: () => void;
}

// Per compatibilità con file esistenti che importano Types
export const Types = {};
