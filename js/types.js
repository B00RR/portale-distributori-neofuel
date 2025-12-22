// ==========================================
// TYPE DEFINITIONS - Neofuel Web App
// Definizioni TypeScript per i modelli del database
// ==========================================

/**
 * @typedef {Object} FuelStation
 * @property {number} station_id
 * @property {string} station_name
 * @property {string} [address]
 * @property {boolean} allow_partial_closure
 * @property {string} created_at
 */

/**
 * @typedef {Object} User
 * @property {string} user_id - UUID
 * @property {string} email
 * @property {string} full_name
 * @property {'admin'|'super_admin'|'operator'} role
 * @property {number} [station_id]
 * @property {boolean} is_active
 * @property {string} created_at
 */

/**
 * @typedef {Object} Shift
 * @property {string} id - UUID
 * @property {number} station_id
 * @property {string} operator_id - UUID
 * @property {string} opened_at
 * @property {string} [closed_at]
 * @property {'open'|'partial'|'closed'} status
 * @property {Object} opening_data
 * @property {Object} [closing_data]
 */

/**
 * @typedef {Object} Island
 * @property {number} island_id
 * @property {number} station_id
 * @property {string} nome
 * @property {string} [island_name]
 */

/**
 * @typedef {Object} Pistola
 * @property {number} id
 * @property {number} island_id
 * @property {string} nome
 * @property {'benzina'|'gasolio'|'gpl'|'metano'|'adblue'} tipo_carburante
 * @property {number} numero_litri
 * @property {number} [tank_id]
 */

/**
 * @typedef {Object} Tank
 * @property {number} id
 * @property {number} station_id
 * @property {string} name
 * @property {string} fuel_type
 * @property {number} capacity_liters
 * @property {number} current_level
 */

/**
 * @typedef {Object} Voucher
 * @property {string} id - UUID
 * @property {string} batch_id - UUID
 * @property {string} code
 * @property {number} amount
 * @property {'active'|'redeemed'|'expired'|'void'} status
 * @property {string} [expiration_date]
 * @property {string} [redeemed_at]
 * @property {number} serial_number
 */

/**
 * @typedef {Object} VoucherBatch
 * @property {string} id - UUID
 * @property {string} description
 * @property {string} [customer_name]
 * @property {string} [expiration_date]
 * @property {string} created_at
 */

/**
 * @typedef {Object} CreditoCliente
 * @property {number} id
 * @property {number} station_id
 * @property {string} cliente
 * @property {number} saldo
 * @property {string} [telefono]
 * @property {string} created_at
 */

/**
 * @typedef {Object} MovimentoCassa
 * @property {number} id
 * @property {number} station_id
 * @property {string} operator_id
 * @property {'incasso'|'uscita'|'credito'|'voucher'} tipo
 * @property {number} importo
 * @property {string} [descrizione]
 * @property {string} created_at
 */

/**
 * @typedef {Object} Invoice
 * @property {number} id
 * @property {number} station_id
 * @property {string} operator_id
 * @property {number} cliente_id
 * @property {string} customer_name
 * @property {number} amount
 * @property {'contanti'|'pos'|'bonifico'} payment_method
 * @property {'pending'|'sent'|'paid'} status
 * @property {string} invoice_number
 * @property {string} invoice_date
 */

/**
 * @typedef {Object} PrezzoDistributore
 * @property {number} id
 * @property {number} station_id
 * @property {number} prezzo_benzina
 * @property {number} prezzo_gasolio
 * @property {string} data_validita
 * @property {string} [modificato_da]
 */

// Export per uso come modulo
export const Types = {};
