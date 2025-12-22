# Component Migration Guide

Questa guida mostra come trasformare codice con HTML hardcodato in componenti riusabili usando Lit.

## Prima (Codice Originale)

```javascript
// js/admin/operators.js - Versione con HTML hardcodato
export async function showOperatorsTab(container, actionsContainer) {
  showLoadingMessage(container);

  if (actionsContainer) {
    actionsContainer.innerHTML = `<button class="action-btn primary" id="add-operator-btn"><i class="fas fa-plus"></i> Nuovo Operatore</button>`;
    document.getElementById('add-operator-btn').addEventListener('click', () => openOperatorModal());
  }

  try {
    const { data: users, error } = await supabase
      .from('users')
      .select(`*, user_stations ( station_id, fuel_stations ( station_name ) )`)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!users || users.length === 0) {
      container.innerHTML = '<p>Nessun operatore trovato.</p>';
      return;
    }

    // 50+ righe di template string HTML...
    let html = `
      <div class="table-responsive">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Email</th>
              <th>Ruolo</th>
              <th>Distributore</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
    `;

    users.forEach(u => {
      const firstLink = Array.isArray(u.user_stations) ? u.user_stations[0] : u.user_stations;
      const stationName = firstLink?.fuel_stations?.station_name || '-';
      const roleLabels = { 'admin': 'Admin', 'operator': 'Operatore' };
      const roleLabel = roleLabels[u.role] || u.role || 'Operatore';

      html += `
        <tr>
          <td>${escapeHtml(u.full_name)}</td>
          <td>${escapeHtml(u.email)}</td>
          <td><span class="badge role-${u.role || 'operator'}">${roleLabel}</span></td>
          <td>${escapeHtml(stationName)}</td>
          <td>
            <button class="icon-btn edit-operator" data-id="${u.user_id}"><i class="fas fa-edit"></i></button>
            <button class="icon-btn assign-station" data-id="${u.user_id}"><i class="fas fa-map-marker-alt"></i></button>
            <button class="icon-btn delete-operator" data-id="${u.user_id}"><i class="fas fa-trash-alt"></i></button>
          </td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;

    // Devo aggiungere listener manualmente dopo il render
    container.querySelectorAll('.edit-operator').forEach(btn => {
      btn.addEventListener('click', () => openOperatorModal(btn.dataset.id));
    });
    // ... altri listener ...

  } catch (err) {
    handleError(err, 'showOperatorsTab', container);
  }
}
```

**Problemi:**
- 📉 HTML lungo e illeggibile (string concatenation)
- 🐛 Difficile fare debugging (tutto è una stringa)
- 🔄 Listener devono essere aggiunti manualmente dopo il render
- ❌ Nessuna riusabilità
- 🧪 Impossibile testare i componenti UI

---

## Dopo (Con Lit Components)

```javascript
// js/admin/operators.js - Versione con componenti
import { html, render } from 'lit';
import '../ui/components/index.js'; // Auto-register components

export async function showOperatorsTab(container, actionsContainer) {
  // Mostra loading state come componente
  render(html`<loading-state message="Caricamento operatori..."></loading-state>`, container);

  if (actionsContainer) {
    render(html`
      <button class="action-btn primary" @click="${openOperatorModal}">
        <i class="fas fa-plus"></i> Nuovo Operatore
      </button>
    `, actionsContainer);
  }

  try {
    const { data: users, error } = await supabase
      .from('users')
      .select(`*, user_stations ( station_id, fuel_stations ( station_name ) )`)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!users || users.length === 0) {
      render(html`
        <alert-box type="info">
          Nessun operatore trovato.
        </alert-box>
      `, container);
      return;
    }

    // Prepara colonne per DataTable
    const columns = [
      { key: 'full_name', label: 'Nome', sortable: true },
      { key: 'email', label: 'Email', sortable: true },
      {
        key: 'role',
        label: 'Ruolo',
        render: (row) => html`
          <span class="badge role-${row.role || 'operator'}">
            ${getRoleLabel(row.role)}
          </span>
        `
      },
      {
        key: 'station',
        label: 'Distributore',
        render: (row) => {
          const firstLink = Array.isArray(row.user_stations) ? row.user_stations[0] : row.user_stations;
          return firstLink?.fuel_stations?.station_name || '-';
        }
      },
      {
        key: 'actions',
        label: 'Azioni',
        render: (row) => html`
          <button class="icon-btn" @click="${() => openOperatorModal(row.user_id)}" title="Modifica">
            <i class="fas fa-edit"></i>
          </button>
          <button class="icon-btn" @click="${() => openAssignStationModal(row.user_id)}" title="Assegna Stazione">
            <i class="fas fa-map-marker-alt"></i>
          </button>
          <button class="icon-btn" @click="${() => deleteUser(row.user_id, container, actionsContainer)}" title="Elimina" style="color: #ff4d4d;">
            <i class="fas fa-trash-alt"></i>
          </button>
        `
      }
    ];

    // Render della tabella con il componente
    render(html`
      <data-table
        .columns="${columns}"
        .data="${users}"
        @row-click="${(e) => openOperatorModal(e.detail.row.user_id)}">
      </data-table>
    `, container);

  } catch (err) {
    render(html`
      <alert-box type="danger" dismissible>
        <strong>Errore:</strong> ${err.message}
      </alert-box>
    `, container);
    handleError(err, 'showOperatorsTab');
  }
}

function getRoleLabel(role) {
  const labels = {
    'admin': 'Admin',
    'operator': 'Operatore',
    'accounting': 'Contabilità',
    'billing': 'Fatturazione'
  };
  return labels[role] || role || 'Operatore';
}
```

**Vantaggi:**
- ✅ Codice più leggibile e manutenibile
- ✅ Event listener gestiti automaticamente (`@click`)
- ✅ Componenti riusabili (`<data-table>`, `<loading-state>`, ecc.)
- ✅ Reactive updates automatici
- ✅ Testabilità migliorata (posso testare i componenti isolatamente)
- 📦 Riduzione codice: **da ~130 righe a ~70 righe** (-46%)

---

## Testing dei Componenti

```javascript
// tests/ui/components/DataTable.test.js
import { describe, it, expect } from 'vitest';
import { fixture, html } from '@open-wc/testing';
import '../../js/ui/components/DataTable.js';

describe('DataTable', () => {
  it('renders table with data', async () => {
    const columns = [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name' }
    ];
    const data = [
      { id: 1, name: 'Mario' },
      { id: 2, name: 'Luigi' }
    ];

    const el = await fixture(html`
      <data-table .columns="${columns}" .data="${data}"></data-table>
    `);

    expect(el.shadowRoot.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('emits row-click event', async () => {
    const el = await fixture(html`<data-table .data="${[{id:1}]}"></data-table>`);
    let clicked = false;
    el.addEventListener('row-click', () => { clicked = true; });

    el.shadowRoot.querySelector('tr').click();
    expect(clicked).toBe(true);
  });
});
```

---

## Prossimi Passi

1. ✅ Test infrastructure completa
2. ✅ UI components creati (FormField, DataTable, CardBox, ecc.)
3. 🔄 Migrare progressivamente altri moduli
4. 📝 Documentare pattern per nuovi sviluppatori
