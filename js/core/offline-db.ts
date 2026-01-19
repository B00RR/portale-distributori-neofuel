/**
 * ==========================================
 * OFFLINE DATABASE MANAGER (IndexedDB)
 * ==========================================
 * Gestisce la persistenza locale delle operazioni effettuate offline.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const DB_NAME = 'NeofuelOfflineDB';
const DB_VERSION = 1;
const STORE_NAME = 'mutation_queue';

export interface QueuedMutation {
    id?: number;
    timestamp?: string;
    retryCount?: number;
    [key: string]: any;
}

class OfflineDB {
    private db: IDBDatabase | null = null;
    private initPromise: Promise<IDBDatabase>;

    constructor() {
        this.initPromise = this._init();
    }

    private _init(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                }
            };

            request.onsuccess = (event: Event) => {
                this.db = (event.target as IDBOpenDBRequest).result;
                resolve(this.db);
            };

            request.onerror = (event: Event) => {
                console.error('IndexedDB error:', (event.target as IDBOpenDBRequest).error);
                reject('Impossibile aprire il database offline');
            };
        });
    }

    /**
     * Aggiunge una mutazione alla coda offline
     * @param mutation - Oggetto contenente table, action, data, ecc.
     */
    async enqueue(mutation: QueuedMutation): Promise<number> {
        await this.initPromise;
        return new Promise((resolve, reject) => {
            if (!this.db) { return reject('DB non inizializzato'); }

            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

            const item = {
                ...mutation,
                timestamp: new Date().toISOString(),
                retryCount: 0
            };

            const request = store.add(item);
            request.onsuccess = () => resolve(request.result as number);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Recupera tutte le mutazioni in attesa
     */
    async getQueue(): Promise<QueuedMutation[]> {
        await this.initPromise;
        return new Promise((resolve, reject) => {
            if (!this.db) { return reject('DB non inizializzato'); }

            const transaction = this.db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result as QueuedMutation[]);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Rimuove una mutazione dalla coda per ID
     */
    async dequeue(id: number): Promise<void> {
        await this.initPromise;
        return new Promise((resolve, reject) => {
            if (!this.db) { return reject('DB non inizializzato'); }

            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Conta quanti elementi sono in coda
     */
    async getQueueCount(): Promise<number> {
        await this.initPromise;
        return new Promise((resolve) => {
            if (!this.db) { return resolve(0); }

            const transaction = this.db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.count();

            request.onsuccess = () => resolve(request.result as number);
            request.onerror = () => resolve(0);
        });
    }
}

export const offlineDB = new OfflineDB();
