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
import * as XLSX from 'xlsx';
import 'xlsx-populate/browser/xlsx-populate.js';

import type {
  ChartConstructor,
  Html5QrcodeConstructor,
  SortableConstructor,
  XlsxPopulateStatic
} from '../types.js';

declare global {
  interface Window {
    Chart: ChartConstructor;
    Html5Qrcode: Html5QrcodeConstructor;
    jsPDF: typeof jsPDF;
    JSZip: typeof JSZip;
    Sortable: SortableConstructor;
    Split: typeof Split;
    XLSX: typeof XLSX;
    XlsxPopulate: XlsxPopulateStatic;
  }
}

window.Chart = Chart as unknown as ChartConstructor;
window.jsPDF = jsPDF;
window.JSZip = JSZip;
window.Sortable = Sortable as unknown as SortableConstructor;
window.Split = Split;
window.XLSX = XLSX;
window.Html5Qrcode = Html5Qrcode as unknown as Html5QrcodeConstructor;
