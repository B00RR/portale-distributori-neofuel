// Vendor bundle — bundles CDN dependencies into a self-contained production build.
// Issue #4: Bundle and vend CDN dependencies for production
// These are assigned to window.* because the app code uses them as globals.

import Chart from 'chart.js/auto';
(window as any).Chart = Chart;

import { jsPDF } from 'jspdf';
(window as any).jsPDF = jsPDF;

import 'jspdf-autotable'; // patches jsPDF prototype

import * as XLSX from 'xlsx';
(window as any).XLSX = XLSX;

import * as XlsxPopulate from 'xlsx-populate';
(window as any).XlsxPopulate = XlsxPopulate;

import * as JSZip from 'jszip';
(window as any).JSZip = JSZip;

import * as Split from 'split.js';
(window as any).Split = Split;

import Sortable from 'sortablejs';
(window as any).Sortable = Sortable;

import { Html5Qrcode } from 'html5-qrcode';
(window as any).Html5Qrcode = Html5Qrcode;

import '@fortawesome/fontawesome-free/css/all.min.css';
