// Vendor bundle — only assets needed at first paint stay eager (#343).
// I vendor pesanti (Chart.js, Html5Qrcode, Sortable) sono caricati on-demand
// da js/vendor/lazy.ts nei punti che li usano davvero; jspdf, jspdf-autotable,
// jszip (globale) e split.js non avevano consumatori e sono stati rimossi dal
// bundle di avvio.

import '@fortawesome/fontawesome-free/css/all.min.css';
