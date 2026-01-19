// ==========================================
// TYPE DEFINITIONS - Neofuel Web App
// Definizioni TypeScript per i modelli del database
// ==========================================

export interface FuelStation {
    station_id: number;
    station_name: string;
    address?: string;
    allow_partial_closure: boolean;
    created_at: string;
}

export interface User {
    user_id: string; // UUID
    email: string;
    full_name: string;
    role: 'admin' | 'super_admin' | 'accounting' | 'billing' | 'operator' | 'full_admin';
    station_id?: number;
    is_active: boolean;
    created_at: string;
    assignedStations?: { id: number; name: string }[];
}

export interface Shift {
    id: string; // UUID
    station_id: number;
    operator_id: string; // UUID
    opened_at: string;
    closed_at?: string;
    status: 'open' | 'partial' | 'closed';
    opening_data: any;
    closing_data?: any;
}

export interface Island {
    island_id: number;
    station_id: number;
    nome: string;
    island_name?: string;
}

export interface Pistola {
    id: number;
    island_id: number;
    nome: string;
    tipo_carburante: 'benzina' | 'gasolio' | 'gpl' | 'metano' | 'adblue';
    numero_litri: number;
    tank_id?: number;
    islands?: {
        nome: string;
        station_id: number;
    };
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
    id: string; // UUID
    batch_id: string; // UUID
    code: string;
    amount: number;
    status: 'active' | 'redeemed' | 'expired' | 'void';
    expiration_date?: string;
    redeemed_at?: string;
    serial_number: number;
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
    refreshUiIcons?: () => void;
}

// Per compatibilità con file esistenti che importano Types
export const Types = {};
