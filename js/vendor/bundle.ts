// Vendor bundle — bundles CDN dependencies into a self-contained production build.
// Issue #4: Bundle and vend CDN dependencies for production
// These are assigned to window.* because the app code uses them as globals.

import '@fortawesome/fontawesome-free/css/all.min.css';
import Chart from 'chart.js/auto';
import { Html5Qrcode } from 'html5-qrcode';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable'; // patches jsPDF prototype
import * as JSZip from 'jszip';
import Sortable from 'sortablejs';
import * as Split from 'split.js';
// Excel export edits the XLSX template ZIP directly with lazy-loaded JSZip in
// js/utils/export_utils.ts; no eval-based spreadsheet vendor is imported here.

import type { ChartConstructor, Html5QrcodeConstructor, SortableConstructor } from '../types.js';

declare global {
  interface Window {
    Chart: ChartConstructor;
    Html5Qrcode: Html5QrcodeConstructor;
    jsPDF: typeof jsPDF;
    JSZip: typeof JSZip;
    Sortable: SortableConstructor;
    Split: typeof Split;
  }
}

window.Chart = Chart as unknown as ChartConstructor;
window.jsPDF = jsPDF;
window.JSZip = JSZip;
window.Sortable = Sortable as unknown as SortableConstructor;
window.Split = Split;
window.Html5Qrcode = Html5Qrcode as unknown as Html5QrcodeConstructor;
