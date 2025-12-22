import { html } from 'lit';
import '../../../js/ui/components/DataTable.js';

export default {
    title: 'Components/DataTable',
    component: 'data-table',
};

const sampleColumns = [
    { key: 'id', label: 'ID', sortable: true },
    { key: 'name', label: 'Nome', sortable: true },
    { key: 'email', label: 'Email', sortable: true },
    { key: 'role', label: 'Ruolo', sortable: false },
    { key: 'status', label: 'Stato', sortable: true }
];

const sampleData = [
    { id: 1, name: 'Mario Rossi', email: 'mario@example.com', role: 'Admin', status: 'Attivo' },
    { id: 2, name: 'Luigi Verdi', email: 'luigi@example.com', role: 'Operatore', status: 'Attivo' },
    { id: 3, name: 'Anna Bianchi', email: 'anna@example.com', role: 'Contabile', status: 'Sospeso' },
    { id: 4, name: 'Paolo Neri', email: 'paolo@example.com', role: 'Operatore', status: 'Attivo' },
    { id: 5, name: 'Sara Gialli', email: 'sara@example.com', role: 'Admin', status: 'Attivo' }
];

export const Default = () => {
    const table = document.createElement('data-table');
    table.columns = sampleColumns;
    table.data = sampleData;

    table.addEventListener('row-click', (e) => {
        console.log('Row clicked:', e.detail);
    });

    return table;
};

export const Empty = () => {
    const table = document.createElement('data-table');
    table.columns = sampleColumns;
    table.data = [];
    return table;
};

export const Loading = () => {
    const table = document.createElement('data-table');
    table.columns = sampleColumns;
    table.data = [];
    table.loading = true;
    return table;
};

export const LargeDataset = () => {
    const largeData = Array.from({ length: 50 }, (_, i) => ({
        id: i + 1,
        name: `Utente ${i + 1}`,
        email: `user${i + 1}@example.com`,
        role: ['Admin', 'Operatore', 'Contabile'][i % 3],
        status: i % 5 === 0 ? 'Sospeso' : 'Attivo'
    }));

    const table = document.createElement('data-table');
    table.columns = sampleColumns;
    table.data = largeData;
    return table;
};
