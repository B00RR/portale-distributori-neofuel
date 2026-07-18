// Lazy vendor loaders (#343) — i vendor pesanti (Chart.js, Html5Qrcode,
// Sortable) non stanno più nel bundle di avvio: vengono importati on-demand
// dal punto di orchestrazione che li usa e restano esposti su window.* per
// compatibilità con i renderer sincroni e con i mock dei test.
// jszip e qrcode hanno già i propri dynamic import locali (export_utils,
// vouchers_reboot); jspdf, jspdf-autotable e split.js non avevano alcun
// consumatore e non vengono più caricati affatto.

import type { ChartConstructor, Html5QrcodeConstructor, SortableConstructor } from '../types.js';

declare global {
  interface Window {
    Chart?: ChartConstructor;
    Html5Qrcode?: Html5QrcodeConstructor;
    Sortable?: SortableConstructor;
  }
}

let chartPromise: Promise<ChartConstructor> | null = null;
let sortablePromise: Promise<SortableConstructor> | null = null;
let qrcodePromise: Promise<Html5QrcodeConstructor> | null = null;

/** Carica Chart.js on-demand; riusa un global già presente (test/mock). */
export function ensureChart(): Promise<ChartConstructor> {
  if (window.Chart) {
    return Promise.resolve(window.Chart);
  }
  chartPromise ??= import('chart.js/auto').then(module => {
    const Chart = module.default as unknown as ChartConstructor;
    window.Chart = Chart;
    return Chart;
  });
  return chartPromise;
}

/** Carica Sortable on-demand; riusa un global già presente (test/mock). */
export function ensureSortable(): Promise<SortableConstructor> {
  if (window.Sortable) {
    return Promise.resolve(window.Sortable);
  }
  sortablePromise ??= import('sortablejs').then(module => {
    const Sortable = module.default as unknown as SortableConstructor;
    window.Sortable = Sortable;
    return Sortable;
  });
  return sortablePromise;
}

/** Carica Html5Qrcode on-demand; riusa un global già presente (test/mock). */
export function ensureHtml5Qrcode(): Promise<Html5QrcodeConstructor> {
  if (window.Html5Qrcode) {
    return Promise.resolve(window.Html5Qrcode);
  }
  qrcodePromise ??= import('html5-qrcode').then(module => {
    const Html5Qrcode = module.Html5Qrcode as unknown as Html5QrcodeConstructor;
    window.Html5Qrcode = Html5Qrcode;
    return Html5Qrcode;
  });
  return qrcodePromise;
}
