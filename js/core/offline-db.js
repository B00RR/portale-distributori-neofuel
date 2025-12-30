/**
 * ==========================================
 * OFFLINE DATABASE MANAGER (IndexedDB)
 * ==========================================
 * Gestisce la persistenza locale delle operazioni effettuate offline.
 */

const DB_NAME = 'NeofuelOfflineDB';
const DB_VERSION = 1;
const STORE_NAME = 'mutation_queue';

class OfflineDB {
    constructor() {
        /** @type {IDBDatabase | null} */
        this.db = null;
        this.initPromise = this._init();
    }

    async _init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = (/** @type {IDBOpenDBRequest} */(event.target)).result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                }
            };

            request.onsuccess = (event) => {
                this.db = (/** @type {IDBOpenDBRequest} */(event.target)).result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                console.error("IndexedDB error:", (/** @type {IDBOpenDBRequest} */(event.target)).error);
                reject("Impossibile aprire il database offline");
            };
        });
    }

    /**
     * Aggiunge una mutazione alla coda offline
     * @param {Object} mutation - Oggetto contenente table, action, data, ecc.
     */
    async enqueue(mutation) {
        await this.initPromise;
        return new Promise((resolve, reject) => {
            if (!this.db) return reject("DB non inizializzato");

            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

            const item = {
                ...mutation,
                timestamp: new Date().toISOString(),
                retryCount: 0
            };

            const request = store.add(item);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Recupera tutte le mutazioni in attesa
     * @returns {Promise<Array<Object>>}
     */
    async getQueue() {
        await this.initPromise;
        return new Promise((resolve, reject) => {
            if (!this.db) return reject("DB non inizializzato");

            const transaction = this.db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Rimuove una mutazione dalla coda per ID
     * @param {number} id 
     */
    async dequeue(id) {
        await this.initPromise;
        return new Promise((resolve, reject) => {
            if (!this.db) return reject("DB non inizializzato");

            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Conta quanti elementi sono in coda
     * @returns {Promise<number>}
     */
    async getQueueCount() {
        await this.initPromise;
        return new Promise((resolve, reject) => {
            if (!this.db) return resolve(0);

            const transaction = this.db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.count();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(0);
        });
    }
}

export const offlineDB = new OfflineDB();
