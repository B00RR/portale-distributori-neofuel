# 🚀 Roadmap Miglioramenti - Neofuel Web App

> Documento di riferimento per miglioramenti futuri (creato: 09/12/2025)

---

## 📋 Indice

1. [Architettura & Qualità Codice](#architettura--qualità-codice)
2. [Performance](#performance)
3. [UX/UI Improvements](#uxui-improvements)
4. [Security & Robustness](#security--robustness)
5. [Developer Experience](#developer-experience)
6. [Features Aggiuntive](#features-aggiuntive)
7. [Priorità Consigliate](#priorità-consigliate)

---

## 🏗️ Architettura & Qualità Codice

### 1.1 Modularizzazione
**Problema attuale**: `admin.js` ha 2100+ righe - difficile da mantenere

**Soluzione proposta**:
```
js/admin/
  ├── dashboard.js          # Logica dashboard
  ├── closures.js           # Gestione chiusure
  ├── invoices.js           # Gestione fatture
  ├── stations.js           # Gestione distributori
  ├── operators.js          # Gestione operatori
  └── shared/
      ├── queries.js        # Query Supabase riutilizzabili
      ├── formatters.js     # formatEuro, formatDate, etc.
      ├── validators.js     # Validazione input
      └── ui-helpers.js     # showLoadingMessage, showErrorMessage
```

**Benefici**:
- 📦 Codice più organizzato e navigabile
- 🔄 Riutilizzo funzioni comuni
- 🧪 Testing più semplice
- 👥 Collaborazione team facilitata

---

### 1.2 State Management Centralizzato
**Problema**: Variabili globali sparse (`currentAdminTab`, `currentStationFilter`)

**Soluzione**:
```javascript
// js/shared/state.js
export const AppState = {
  currentTab: 'dashboard',
  filters: {
    station: null,
    dateFrom: null,
    dateTo: null
  },
  user: null,
  
  get(key) {
    return this[key];
  },
  
  set(key, value) {
    this[key] = value;
    this._notifyListeners(key, value);
  },
  
  _listeners: {},
  
  subscribe(key, callback) {
    if (!this._listeners[key]) this._listeners[key] = [];
    this._listeners[key].push(callback);
  },
  
  _notifyListeners(key, value) {
    if (this._listeners[key]) {
      this._listeners[key].forEach(fn => fn(value));
    }
  }
};

// Uso:
AppState.subscribe('filters', (newFilters) => {
  console.log('Filtri aggiornati:', newFilters);
  refreshCurrentTab();
});
```

**Benefici**:
- 🎯 Singola fonte di verità
- 🔔 Reactive updates
- 🐛 Debug più semplice

---

### 1.3 Error Handling Centralizzato
**Problema**: `try/catch` ripetuti, alert() sparsi

**Soluzione**:
```javascript
// js/shared/error-handler.js
export class AppError extends Error {
  constructor(message, code, originalError) {
    super(message);
    this.code = code;
    this.originalError = originalError;
  }
}

export function handleError(error, context = '') {
  console.error(`[${context}]`, error);
  
  // Log to monitoring service (future: Sentry integration)
  // logToSentry(error, context);
  
  let userMessage = 'Si è verificato un errore';
  
  if (error.code === 'PGRST116') {
    userMessage = 'Dati non trovati';
  } else if (error.message?.includes('network')) {
    userMessage = 'Errore di connessione';
  } else if (error instanceof AppError) {
    userMessage = error.message;
  }
  
  showToast(userMessage, 'error');
}

// Uso:
try {
  const { data, error } = await supabase.from('shifts').select();
  if (error) throw error;
  return data;
} catch (err) {
  handleError(err, 'showChiusureTab');
  return [];
}
```

---

## ⚡ Performance

### 2.1 Lazy Loading / Code Splitting
**Obiettivo**: Caricare solo il codice necessario

**Implementazione**:
```javascript
// Invece di importare tutto all'inizio:
// import { showDashboard, showChiusure, showFatture ... } from './admin.js';

// Carica on-demand:
async function loadAdminTab(tab) {
  currentAdminTab = tab;
  
  let module;
  switch(tab) {
    case 'dashboard':
      module = await import('./admin/dashboard.js');
      break;
    case 'shifts':
      module = await import('./admin/closures.js');
      break;
    // ...
  }
  
  module.render(container, currentStationFilter);
}
```

**Stima risparmio**: ~40-60% JavaScript iniziale

---

### 2.2 Virtual Scrolling per Tabelle Grandi
**Problema**: Rendering di 500 righe rallenta la pagina

**Soluzione**: [tanstack/virtual](https://tanstack.com/virtual)
```javascript
import { useVirtualizer } from '@tanstack/virtual-core';

function renderLargeTable(rows) {
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainer,
    estimateSize: () => 50, // altezza riga
    overscan: 5
  });
  
  // Renderizza solo righe visibili + overscan
}
```

**Benefici**:
- ⚡ Render istantaneo anche con 10k+ righe
- 💾 Memoria ridotta

---

### 2.3 Debouncing per Ricerca/Filtri
**Implementazione**:
```javascript
// js/shared/utils.js
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Uso:
const searchInput = document.querySelector('#search');
const debouncedSearch = debounce((query) => {
  performSearch(query);
}, 300);

searchInput.addEventListener('input', (e) => {
  debouncedSearch(e.target.value);
});
```

---

### 2.4 Caching Intelligente
**Implementazione**:
```javascript
// js/shared/cache.js
const CACHE_TTL = {
  stations: 10 * 60 * 1000,      // 10 min
  operators: 10 * 60 * 1000,     // 10 min
  closures: 2 * 60 * 1000,       // 2 min
  realtime: 30 * 1000            // 30 sec
};

export class Cache {
  static get(key) {
    const cached = JSON.parse(localStorage.getItem(`cache_${key}`));
    if (cached && Date.now() - cached.timestamp < (CACHE_TTL[key] || 60000)) {
      return cached.data;
    }
    return null;
  }
  
  static set(key, data) {
    localStorage.setItem(`cache_${key}`, JSON.stringify({
      data,
      timestamp: Date.now()
    }));
  }
  
  static invalidate(key) {
    localStorage.removeItem(`cache_${key}`);
  }
  
  static clear() {
    Object.keys(localStorage)
      .filter(k => k.startsWith('cache_'))
      .forEach(k => localStorage.removeItem(k));
  }
}

// Uso:
async function getStations() {
  const cached = Cache.get('stations');
  if (cached) return cached;
  
  const { data } = await supabase.from('fuel_stations').select();
  Cache.set('stations', data);
  return data;
}
```

---

## 🎨 UX/UI Improvements

### 3.1 Skeleton Loaders
**Sostituire**: "Caricamento..." generico

**Con**:
```html
<!-- style.css -->
<style>
.skeleton {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: loading 1.5s ease-in-out infinite;
  border-radius: 4px;
}

@keyframes loading {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.skeleton-row {
  display: flex;
  gap: 12px;
  padding: 16px;
}

.skeleton-cell {
  height: 20px;
  flex: 1;
  background: #e0e0e0;
  border-radius: 4px;
}
</style>

<!-- HTML -->
<div class="skeleton-table">
  <div class="skeleton-row">
    <div class="skeleton-cell"></div>
    <div class="skeleton-cell"></div>
    <div class="skeleton-cell"></div>
  </div>
  <!-- Ripeti 5-10 volte -->
</div>
```

---

### 3.2 Toast Notifications System
**Problema**: `alert()` è invasivo e blocca l'UI

**Soluzione**:
```javascript
// js/shared/toast.js
export class Toast {
  static show(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <i class="fas fa-${this._getIcon(type)}"></i>
      <span>${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
  
  static _getIcon(type) {
    return {
      success: 'check-circle',
      error: 'exclamation-circle',
      warning: 'exclamation-triangle',
      info: 'info-circle'
    }[type] || 'info-circle';
  }
}

// style.css
.toast {
  position: fixed;
  top: 20px;
  right: 20px;
  padding: 16px 24px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  display: flex;
  align-items: center;
  gap: 12px;
  transform: translateX(400px);
  transition: transform 0.3s ease;
  z-index: 10000;
}

.toast.show {
  transform: translateX(0);
}

.toast-success { background: #10b981; color: white; }
.toast-error { background: #ef4444; color: white; }
.toast-warning { background: #f59e0b; color: white; }
.toast-info { background: #3b82f6; color: white; }

// Uso:
Toast.show('Chiusura salvata con successo!', 'success');
Toast.show('Errore di connessione', 'error');
```

---

### 3.3 Loading States per Bottoni
```html
<!-- HTML -->
<button class="btn primary" id="save-btn">
  <span class="btn-spinner" style="display: none;">
    <i class="fas fa-spinner fa-spin"></i>
  </span>
  <span class="btn-text">Salva</span>
</button>

<script>
async function saveData() {
  const btn = document.getElementById('save-btn');
  btn.disabled = true;
  btn.querySelector('.btn-spinner').style.display = 'inline-block';
  btn.querySelector('.btn-text').textContent = 'Salvataggio...';
  
  try {
    await performSave();
    Toast.show('Salvato!', 'success');
  } catch (err) {
    handleError(err);
  } finally {
    btn.disabled = false;
    btn.querySelector('.btn-spinner').style.display = 'none';
    btn.querySelector('.btn-text').textContent = 'Salva';
  }
}
</script>
```

---

### 3.4 Breadcrumbs Navigation
```html
<!-- HTML -->
<nav class="breadcrumbs">
  <a href="#" data-tab="dashboard">Dashboard</a>
  <i class="fas fa-chevron-right"></i>
  <a href="#" data-tab="shifts">Chiusure</a>
  <i class="fas fa-chevron-right"></i>
  <span>Dettaglio #123</span>
</nav>

<!-- style.css -->
.breadcrumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  color: #64748b;
  margin-bottom: 16px;
}

.breadcrumbs a {
  color: #3b82f6;
  text-decoration: none;
}

.breadcrumbs a:hover {
  text-decoration: underline;
}

.breadcrumbs i {
  font-size: 0.7rem;
}
```

---

### 3.5 Search & Advanced Filters
```html
<!-- Barra ricerca + filtri -->
<div class="search-filters">
  <input type="text" class="search-input" placeholder="🔍 Cerca...">
  
  <div class="filter-chips">
    <button class="chip" data-filter="today">Oggi</button>
    <button class="chip" data-filter="week">Questa settimana</button>
    <button class="chip active" data-filter="all">Tutto</button>
  </div>
  
  <button class="filter-advanced" id="advanced-filters-btn">
    <i class="fas fa-filter"></i> Filtri avanzati
  </button>
</div>

<!-- Modal filtri avanzati -->
<div class="modal" id="advanced-filters-modal" style="display: none;">
  <div class="modal-content">
    <h3>Filtri Avanzati</h3>
    <div class="form-group">
      <label>Data da:</label>
      <input type="date" name="date_from">
    </div>
    <div class="form-group">
      <label>Data a:</label>
      <input type="date" name="date_to">
    </div>
    <div class="form-group">
      <label>Stazione:</label>
      <select name="station_id">
        <option value="">Tutte</option>
        <!-- ... -->
      </select>
    </div>
    <button class="btn primary">Applica</button>
  </div>
</div>
```

---

### 3.6 Dark Mode Toggle
```javascript
// js/shared/theme.js
export class ThemeManager {
  static init() {
    const saved = localStorage.getItem('theme') || 'light';
    this.setTheme(saved);
  }
  
  static setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }
  
  static toggle() {
    const current = document.documentElement.getAttribute('data-theme');
    this.setTheme(current === 'dark' ? 'light' : 'dark');
  }
}

// style.css
:root[data-theme="dark"] {
  --bg-primary: #1a1a1a;
  --text-primary: #e5e5e5;
  --border-color: #333;
  /* ... */
}

:root[data-theme="light"] {
  --bg-primary: #ffffff;
  --text-primary: #1a1a1a;
  --border-color: #e0e0e0;
  /* ... */
}

body {
  background: var(--bg-primary);
  color: var(--text-primary);
}
```

---

### 3.7 Micro-animations
```css
/* Hover effects sulle card */
.kpi-card {
  transition: all 0.2s ease;
}

.kpi-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 24px rgba(0,0,0,0.1);
}

/* Transizioni smooth tra tab */
.admin-content-area {
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Button ripple effect */
.btn {
  position: relative;
  overflow: hidden;
}

.btn::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  border-radius: 50%;
  background: rgba(255,255,255,0.5);
  transform: translate(-50%, -50%);
  transition: width 0.6s, height 0.6s;
}

.btn:active::after {
  width: 300px;
  height: 300px;
}
```

---

## 🔒 Security & Robustness

### 4.1 Input Validation Estesa
```javascript
// js/shared/validators.js
export const Validators = {
  email(value) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(value) || 'Email non valida';
  },
  
  phone(value) {
    const re = /^[\d\s\-\+\(\)]{8,}$/;
    return re.test(value) || 'Telefono non valido';
  },
  
  partitaIva(value) {
    const re = /^\d{11}$/;
    return re.test(value) || 'Partita IVA deve essere 11 cifre';
  },
  
  required(value) {
    return (value && value.trim().length > 0) || 'Campo obbligatorio';
  },
  
  min(minValue) {
    return (value) => Number(value) >= minValue || `Minimo: ${minValue}`;
  },
  
  max(maxValue) {
    return (value) => Number(value) <= maxValue || `Massimo: ${maxValue}`;
  }
};

// Uso:
function validateInvoiceForm(formData) {
  const errors = {};
  
  const emailResult = Validators.email(formData.email);
  if (emailResult !== true) errors.email = emailResult;
  
  const phoneResult = Validators.phone(formData.phone);
  if (phoneResult !== true) errors.phone = phoneResult;
  
  return Object.keys(errors).length === 0 ? null : errors;
}
```

---

### 4.2 Rate Limiting Client-Side
```javascript
// js/shared/rate-limiter.js
export class RateLimiter {
  constructor(maxRequests, windowMs) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = new Map();
  }
  
  canProceed(key) {
    const now = Date.now();
    const userRequests = this.requests.get(key) || [];
    
    // Rimuovi richieste fuori dalla finestra
    const validRequests = userRequests.filter(t => now - t < this.windowMs);
    
    if (validRequests.length >= this.maxRequests) {
      return false;
    }
    
    validRequests.push(now);
    this.requests.set(key, validRequests);
    return true;
  }
}

// Uso:
const apiLimiter = new RateLimiter(10, 60000); // 10 req/min

async function saveInvoice() {
  if (!apiLimiter.canProceed('invoice_save')) {
    Toast.show('Troppe richieste, riprova tra poco', 'warning');
    return;
  }
  
  // Procedi...
}
```

---

### 4.3 CSRF Protection (Backend)
```typescript
// supabase/functions/protected-action/index.ts
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  // Verifica CSRF token
  const csrfToken = req.headers.get('X-CSRF-Token');
  const sessionToken = req.headers.get('Authorization');
  
  if (!csrfToken || !isValidCSRF(csrfToken, sessionToken)) {
    return new Response('CSRF validation failed', { status: 403 });
  }
  
  // Procedi con la logica...
});
```

---

## 🛠️ Developer Experience

### 5.1 TypeScript Migration
```typescript
// types/database.ts
export interface Shift {
  id: number;
  station_id: number;
  operator_id: number;
  status: 'open' | 'closed';
  created_at: string;
  closed_at: string | null;
  closing_data: ClosingData | null;
}

export interface ClosingData {
  ricavo_teorico: number;
  dettaglio_incasso: {
    contanti_operatore: number;
    pos_operatore: number;
    crediti: number;
    voucher: number;
  };
  scontrino_self?: {
    banconote_erogate: number;
    banconote_incassate: number;
    bancomat_erogati: number;
  };
}

// Uso:
async function getShifts(): Promise<Shift[]> {
  const { data, error } = await supabase
    .from('shifts')
    .select<'*', Shift>('*');
    
  if (error) throw error;
  return data;
}
```

---

### 5.2 Build System (Vite)
```javascript
// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: './index.html',
        admin: './admin.html',
        operator: './operator.html'
      }
    }
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:54321' // Supabase local
    }
  }
});
```

**Setup**:
```bash
npm install -D vite
npm install -D @vitejs/plugin-legacy  # Per IE11 se necessario
```

**Package.json**:
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

---

### 5.3 Unit Testing
```javascript
// tests/formatters.test.js
import { describe, it, expect } from 'vitest';
import { formatEuro, formatDate } from '../js/shared/formatters.js';

describe('formatEuro', () => {
  it('formats correctly with decimals', () => {
    expect(formatEuro(1234.56)).toBe('€ 1.234,56');
  });
  
  it('handles zero', () => {
    expect(formatEuro(0)).toBe('€ 0,00');
  });
  
  it('handles negative values', () => {
    expect(formatEuro(-100)).toBe('€ -100,00');
  });
});

describe('formatDate', () => {
  it('formats Italian date correctly', () => {
    const date = new Date('2025-12-09T10:30:00');
    expect(formatDate(date)).toBe('09/12/2025');
  });
});
```

**Setup**:
```bash
npm install -D vitest
```

```json
// package.json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "coverage": "vitest --coverage"
  }
}
```

---

### 5.4 ESLint + Prettier
```javascript
// .eslintrc.js
module.exports = {
  env: {
    browser: true,
    es2021: true
  },
  extends: [
    'eslint:recommended',
    'prettier'
  ],
  rules: {
    'no-console': 'warn',
    'no-unused-vars': 'warn',
    'prefer-const': 'error'
  }
};

// .prettierrc.js
module.exports = {
  semi: true,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'es5',
  printWidth: 100
};
```

**Pre-commit hook** (Husky):
```bash
npm install -D husky lint-staged
npx husky init
```

```json
// package.json
{
  "lint-staged": {
    "*.js": [
      "eslint --fix",
      "prettier --write"
    ]
  }
}
```

---

## 📊 Features Aggiuntive

### 6.1 Export CSV
```javascript
// js/shared/exporters.js
export class CSVExporter {
  static download(data, filename) {
    const csv = this.toCSV(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}.csv`;
    link.click();
  }
  
  static toCSV(data) {
    if (!data.length) return '';
    
    const headers = Object.keys(data[0]);
    const rows = data.map(row => 
      headers.map(h => {
        const value = row[h] ?? '';
        return `"${String(value).replace(/"/g, '""')}"`;
      }).join(',')
    );
    
    return [headers.join(','), ...rows].join('\n');
  }
}

// Uso:
const closures = await getClosures();
const exportData = closures.map(c => ({
  Data: new Date(c.closed_at).toLocaleDateString('it-IT'),
  Stazione: c.fuel_stations?.station_name,
  Operatore: c.users?.full_name,
  Totale: c.closing_data?.ricavo_teorico
}));

CSVExporter.download(exportData, 'chiusure_export');
```

---

### 6.2 Push Notifications
```javascript
// js/shared/notifications.js
export class NotificationManager {
  static async requestPermission() {
    if (!('Notification' in window)) {
      console.warn('Browser non supporta notifiche');
      return false;
    }
    
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  
  static async send(title, options = {}) {
    if (Notification.permission !== 'granted') {
      return;
    }
    
    const notification = new Notification(title, {
      icon: '/logo.png',
      badge: '/badge.png',
      ...options
    });
    
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  }
  
  static async notifyLowTank(tankName, level) {
    await this.send('⚠️ Alert Cisterna', {
      body: `${tankName}: Livello basso (${level}%)`,
      tag: 'tank-alert',
      requireInteraction: true
    });
  }
}

// Uso (in background check):
setInterval(async () => {
  const tanks = await checkTankLevels();
  tanks.forEach(tank => {
    if (tank.level < 20) {
      NotificationManager.notifyLowTank(tank.name, tank.level);
    }
  });
}, 5 * 60 * 1000); // Ogni 5 minuti
```

---

### 6.3 Advanced Analytics Dashboard
```javascript
// Integrazione Chart.js per grafici avanzati
import Chart from 'chart.js/auto';

function renderSalesChart(data) {
  const ctx = document.getElementById('sales-chart').getContext('2d');
  
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => d.date),
      datasets: [
        {
          label: 'Vendite Benzina',
          data: data.map(d => d.benzina),
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          tension: 0.4
        },
        {
          label: 'Vendite Gasolio',
          data: data.map(d => d.gasolio),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
        },
        tooltip: {
          mode: 'index',
          intersect: false,
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value) => formatEuro(value)
          }
        }
      }
    }
  });
}

// Comparazione periodi
function renderComparisonChart(current, previous) {
  const ctx = document.getElementById('comparison-chart').getContext('2d');
  
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'],
      datasets: [
        {
          label: 'Settimana Corrente',
          data: current,
          backgroundColor: '#10b981'
        },
        {
          label: 'Settimana Precedente',
          data: previous,
          backgroundColor: '#cbd5e1'
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: 'Confronto Settimanale'
        }
      }
    }
  });
}
```

---

### 6.4 Audit Log System
```sql
-- Migration: create audit_logs table
CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(user_id),
  action TEXT NOT NULL, -- 'create', 'update', 'delete', 'login', etc.
  resource TEXT NOT NULL, -- 'shift', 'invoice', 'station', etc.
  resource_id TEXT,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource, resource_id);

-- RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (is_admin());
```

```javascript
// js/shared/audit.js
export class AuditLogger {
  static async log(action, resource, resourceId, details = {}) {
    try {
      await supabase.from('audit_logs').insert({
        action,
        resource,
        resource_id: resourceId?.toString(),
        details,
        ip_address: await this._getIPAddress(),
        user_agent: navigator.userAgent
      });
    } catch (err) {
      console.error('Audit log failed:', err);
    }
  }
  
  static async _getIPAddress() {
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const data = await res.json();
      return data.ip;
    } catch {
      return null;
    }
  }
}

// Uso:
async function deleteStation(stationId) {
  const station = await getStation(stationId);
  
  await supabase.from('fuel_stations').delete().eq('station_id', stationId);
  
  await AuditLogger.log('delete', 'station', stationId, {
    station_name: station.station_name,
    deleted_at: new Date().toISOString()
  });
}
```

---

### 6.5 Internationalization (i18n)
```javascript
// js/shared/i18n.js
const translations = {
  it: {
    dashboard: 'Dashboard',
    closures: 'Chiusure',
    invoices: 'Fatture',
    save: 'Salva',
    cancel: 'Annulla',
    error_generic: 'Si è verificato un errore',
    success_saved: 'Salvato con successo'
  },
  en: {
    dashboard: 'Dashboard',
    closures: 'Closures',
    invoices: 'Invoices',
    save: 'Save',
    cancel: 'Cancel',
    error_generic: 'An error occurred',
    success_saved: 'Saved successfully'
  }
};

export class I18n {
  static currentLang = localStorage.getItem('lang') || 'it';
  
  static t(key) {
    return translations[this.currentLang][key] || key;
  }
  
  static setLanguage(lang) {
    this.currentLang = lang;
    localStorage.setItem('lang', lang);
    this.refresh();
  }
  
  static refresh() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      el.textContent = this.t(key);
    });
  }
}

// HTML:
<button data-i18n="save">Salva</button>
<h1 data-i18n="dashboard">Dashboard</h1>

// Init:
I18n.refresh();
```

---

## 🎯 Priorità Consigliate

### ⭐ Quick Wins (1-2 settimane)
**Impatto Alto, Sforzo Basso**





- [ ] **Debounce su Filtri** (2h)
  - Riduce chiamate API inutili
  - Performance migliorata



- [ ] **Breadcrumbs** (3h)
  - Migliore orientamento navigazione
  - Soprattutto su mobile

**Totale stima**: ~12 ore

---

### 🚀 High Impact (2-4 settimane)
**Impatto Alto, Sforzo Medio**



- [ ] **Caching LocalStorage** (1 giorno)
  - Riduzione chiamate API
  - Offline-first capabilities

- [ ] **Virtual Scrolling** (1-2 giorni)
  - Tabelle grandi performanti
  - Necessario se dataset cresce

- [ ] **Advanced Filters UI** (2 giorni)
  - Date range picker
  - Multi-select filters
  - Search bar

- [ ] **Error Handling Centralizzato** (1 giorno)
  - Gestione errori uniforme
  - Logging centralizzato

**Totale stima**: 7-10 giorni

---

### 🏗️ Strategic (1-3 mesi)
**Impatto Strategico, Effort Alto**

- [ ] **TypeScript Migration** (2-3 settimane)
  - Type safety
  - Meno bug in produzione
  - Migliore DX

- [ ] **Build System (Vite)** (1 settimana)
  - HMR durante development
  - Bundling ottimizzato
  - Tree-shaking

- [ ] **Testing Suite** (2-3 settimane)
  - Unit tests per logica critica
  - Integration tests
  - E2E tests (Playwright)



- [ ] **Audit Log System** (1 settimana)
  - Tracciabilità azioni
  - Compliance
  - Debug facilitato

- [ ] **PWA Support** (1 settimana)
  - Service Worker
  - Offline capabilities
  - App-like experience

**Totale stima**: 8-12 settimane

---

### 🎨 Nice to Have (Ongoing)

- [ ] Dark Mode
- [ ] Internationalization (i18n)
- [ ] Push Notifications
- [ ] CSV Export
- [ ] Print Optimization
- [ ] Accessibility (A11y) audit
- [ ] SEO optimization (se pubblico)

---

## 📝 Note Implementazione

### Approccio Consigliato

1. **Incrementale**: Non riscrivere tutto insieme
2. **Test-Driven**: Ogni feature nuova con test
3. **Feature Flags**: Deploy graduale nuove funzionalità
4. **Backward Compatible**: Non rompere esistente
5. **Documentazione**: Aggiorna docs ad ogni change

### Metriche di Successo

Prima di iniziare qualsiasi miglioramento, stabilire:

- **Performance**: Lighthouse score target (>90)
- **Error Rate**: <1% errori utente
- **Load Time**: Dashboard <2s
- **Code Coverage**: >70% con test
- **Bundle Size**: <500KB (gzipped)

---

## 🔗 Risorse Utili

### Librerie Consigliate

- **UI Components**: [Headless UI](https://headlessui.com/)
- **Charts**: [Chart.js](https://www.chartjs.org/) (già in uso), [Apache ECharts](https://echarts.apache.org/)
- **Date Picker**: [Flatpickr](https://flatpickr.js.org/)
- **Virtual Scrolling**: [TanStack Virtual](https://tanstack.com/virtual)
- **Toast**: [Sonner](https://sonner.emilkowal.ski/)
- **Testing**: [Vitest](https://vitest.dev/), [Playwright](https://playwright.dev/)
- **Build**: [Vite](https://vitejs.dev/)

### Learning Resources

- [MDN Web Docs](https://developer.mozilla.org/)
- [web.dev Performance](https://web.dev/performance/)
- [Supabase Docs](https://supabase.com/docs)

---

**Documento aggiornato**: 09/12/2025  
**Prossimo Review**: Da pianificare
