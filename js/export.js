// ==========================================
// EXPORT FUNCTIONS (PDF / EXCEL)
// ==========================================
import { supabase, safeSupabaseQuery } from "./api.js";
import { formatNumberIt, formatEuro, slugifyLabel, base64ToArrayBuffer, parseNumberFlexible } from "./utils.js";

// Costanti per export
const SUMMARY_TEMPLATE_START_ROW = 42;
const ISLAND_TEMPLATE_BLOCKS = [
    {
        startRow: 9,
        endRow: 20,
        pistolaRows: 6,
        totals: [
            { type: 'gasolio', valueCell: 'O18', priceCell: 'U18', priceType: 'gasolio' },
            { type: 'benzina', valueCell: 'O19', priceCell: 'U19', priceType: 'benzina' }
        ]
    },
    {
        startRow: 21,
        endRow: 32,
        pistolaRows: 6,
        totals: [
            { type: 'gasolio', valueCell: 'O30', priceCell: 'U30', priceType: 'gasolio' },
            { type: 'benzina', valueCell: 'O31', priceCell: 'U31', priceType: 'benzina' }
        ]
    },
    {
        startRow: 33,
        endRow: 40,
        pistolaRows: 2,
        totals: [
            { type: 'totale', valueCell: 'O38', priceCell: 'U38', priceType: 'totale' }
        ]
    }
];

function inferFuelTypeFromNameExport(nomePistola = '') {
    const nome = (nomePistola || '').toString().toUpperCase();
    if (nome.includes('GPL')) return 'gpl';
    if (
        nome.includes('METANO') ||
        nome.includes('MET.') ||
        nome.includes(' MET ') ||
        nome.includes('-M') ||
        nome.includes('M-') ||
        nome.startsWith('M')
    ) return 'metano';
    if (
        nome.includes('GASOLIO') ||
        nome.includes('DIESEL') ||
        nome.includes('G-') ||
        nome.includes('-G') ||
        nome.includes(' G') ||
        nome.endsWith('G')
    ) return 'gasolio';
    if (nome.includes('B') || nome.includes('BENZINA')) return 'benzina';
    return 'benzina';
}

function fuelTypeSigla(tipo) {
    switch ((tipo || '').toLowerCase()) {
        case 'gasolio': return 'G';
        case 'benzina': return 'B';
        case 'gpl': return 'GPL';
        case 'metano': return 'M';
        default: return (tipo || '?').substring(0, 1).toUpperCase();
    }
}

function getClosureTemplateBase64() {
    if (typeof window === 'undefined') return null;
    return window.closureTemplateXlsxBase64 || null;
}

async function computeExportSummaryMetrics(adminClient, closure, stationId) {
    const safeNumber = (value) => {
        const num = parseFloat(value);
        return Number.isFinite(num) ? num : 0;
    };
    if (!adminClient || !closure || !stationId) return null;
    const turnoId = closure.turno_id;
    let openingData = null;
    const endDate = closure.date_time ? new Date(closure.date_time) : null;
    if (turnoId) {
        try {
            const { data } = await adminClient
                .from('opening_shift')
                .select('id, date_time, pos_amount, cash_in, cash_out, station_id')
                .eq('id', turnoId)
                .maybeSingle();
            openingData = data || null;
        } catch (err) {
            console.warn('Errore recupero opening_shift per export (turno_id):', err);
        }
    }
    if (!openingData) {
        try {
            let query = adminClient
                .from('opening_shift')
                .select('id, date_time, pos_amount, cash_in, cash_out, station_id')
                .eq('station_id', stationId)
                .order('date_time', { ascending: false })
                .limit(1);
            if (endDate) {
                query = query.lte('date_time', endDate.toISOString());
            }
            const { data } = await query.maybeSingle();
            openingData = data || null;
        } catch (err) {
            console.warn('Errore recupero opening_shift fallback:', err);
        }
    }
    let startDate = openingData?.date_time ? new Date(openingData.date_time) : null;
    if (!startDate && endDate) {
        const dayStart = new Date(endDate);
        dayStart.setHours(0, 0, 0, 0);
        startDate = dayStart;
    }
    const carteSelfBase = safeNumber(openingData?.pos_amount) || safeNumber(closure.carte_self);
    const startISO = startDate ? startDate.toISOString() : null;
    const endISO = endDate ? endDate.toISOString() : null;
    const fallback = {
        carteSelf: carteSelfBase,
        cartePos: Math.max(0, safeNumber(closure.incasso_pos) - carteSelfBase),
        lubrAdblue: safeNumber(closure.lubr_adblue),
        nonErogato: safeNumber(closure.non_erogato),
        crediti: safeNumber(closure.crediti)
    };
    if (!startISO) {
        return fallback;
    }
    const applyRange = (query) => {
        let q = query;
        if (startISO) q = q.gte('created_at', startISO);
        if (endISO) q = q.lte('created_at', endISO);
        return q;
    };
    try {
        const [
            { data: movimentiData },
            { data: creditiCreatiData },
            { data: creditiPagatiData }
        ] = await Promise.all([
            applyRange(adminClient
                .from('movimenti_cassa')
                .select('tipo, importo, descrizione, created_at')
                .eq('station_id', stationId)),
            applyRange(adminClient
                .from('crediti_clienti')
                .select('importo, created_at')
                .eq('station_id', stationId)),
            applyRange(adminClient
                .from('crediti_movimenti')
                .select('importo, metodo, created_at')
                .eq('station_id', stationId))
        ]);
        const normalizeList = (list) => Array.isArray(list) ? list : [];
        const movimenti = normalizeList(movimentiData);
        const creditiCreati = normalizeList(creditiCreatiData);
        const creditiPagati = normalizeList(creditiPagatiData);
        const usciteCassa = movimenti.reduce((sum, mv) => {
            const val = safeNumber(mv?.importo);
            if (val <= 0) return sum;
            const tipo = (mv?.tipo || '').toLowerCase();
            if (tipo === 'incasso' || tipo === 'voucher') return sum;
            return sum + val;
        }, 0);
        const incassiOggettistica = movimenti.reduce((sum, mv) => {
            const val = safeNumber(mv?.importo);
            if (val <= 0) return sum;
            return (mv?.tipo || '').toLowerCase() === 'incasso' ? sum + val : sum;
        }, 0);
        const rimborsi = movimenti.reduce((sum, mv) => {
            const tipo = (mv?.tipo || '').toLowerCase();
            if (tipo !== 'pagamento') return sum;
            const descr = (mv?.descrizione || '').toLowerCase();
            if (!descr) return sum;
            if (descr.includes('rimbor') || descr.includes('risarc')) {
                const val = safeNumber(mv?.importo);
                return val > 0 ? sum + val : sum;
            }
            return sum;
        }, 0);
        const deltaContanti = safeNumber(closure.cash_in_finale) - safeNumber(closure.cash_out_finale);
        const carteSelf = carteSelfBase;
        const cartePos = Math.max(0, safeNumber(closure.incasso_pos) - carteSelf);
        const nonErogato = deltaContanti - usciteCassa - rimborsi;
        const creditiPositivi = creditiCreati.reduce((sum, row) => {
            const val = safeNumber(row?.importo);
            return val > 0 ? sum + val : sum;
        }, 0);
        const creditiPagatiTot = creditiPagati.reduce((sum, row) => {
            const val = safeNumber(row?.importo);
            return val > 0 ? sum + val : sum;
        }, 0);
        const creditiNet = creditiPositivi - creditiPagatiTot;
        return {
            carteSelf,
            cartePos,
            lubrAdblue: incassiOggettistica,
            nonErogato,
            crediti: creditiNet
        };
    } catch (err) {
        console.warn('Errore calcolo metriche riepilogo export:', err);
        return fallback;
    }
}

function cloneLayout(layout) {
    return (layout || []).map(isola => ({
        id: isola.id,
        label: isola.label,
        pistole: (isola.pistole || []).map(p => ({ id: p.id, label: p.label }))
    }));
}

export function getDefaultSchemaFromLayout(layout) {
    const schema = {
        islands: (layout || []).map(isola => ({
            id: isola.id,
            label: isola.label,
            pistole: (isola.pistole || []).map(p => ({ id: p.id, label: p.label }))
        }))
    };
    return JSON.stringify(schema, null, 2);
}

export function applyCustomExportSchema(defaultLayout, lookups, schemaText) {
    if (!schemaText || !schemaText.trim()) return cloneLayout(defaultLayout);
    let schemaObj;
    try {
        schemaObj = JSON.parse(schemaText);
    } catch (err) {
        throw new Error('Schema non valido: JSON non parsabile');
    }
    if (!schemaObj || !Array.isArray(schemaObj.islands)) {
        throw new Error('Lo schema deve contenere un array "islands"');
    }
    const usedIslands = new Set();
    const finalLayout = [];
    schemaObj.islands.forEach(def => {
        if (!def) return;
        let baseIsland = null;
        if (def.id != null && lookups.islandsById[def.id]) {
            baseIsland = lookups.islandsById[def.id];
        } else if (def.match) {
            const key = def.match.toString().toLowerCase();
            baseIsland = Object.values(lookups.islandsById).find(i => (i.label || '').toLowerCase() === key) || null;
        }
        const islandEntry = {
            id: baseIsland?.id ?? def.id ?? null,
            label: def.label || baseIsland?.label || def.match || 'Isola personalizzata',
            pistole: []
        };
        if (Array.isArray(def.pistole) && def.pistole.length > 0) {
            def.pistole.forEach(pDef => {
                let pistol = null;
                if (typeof pDef === 'number' && lookups.pistoleById[pDef]) {
                    pistol = lookups.pistoleById[pDef];
                } else if (typeof pDef === 'string') {
                    pistol = lookups.pistoleByName[pDef.toLowerCase()];
                } else if (pDef && typeof pDef === 'object') {
                    if (pDef.id != null && lookups.pistoleById[pDef.id]) {
                        pistol = lookups.pistoleById[pDef.id];
                    } else if (pDef.match && lookups.pistoleByName[pDef.match.toLowerCase()]) {
                        pistol = lookups.pistoleByName[pDef.match.toLowerCase()];
                    }
                }
                if (pistol) {
                    islandEntry.pistole.push({
                        id: pistol.id,
                        label: (typeof pDef === 'object' && pDef?.label) ? pDef.label : pistol.label
                    });
                }
            });
        } else if (baseIsland) {
            islandEntry.pistole = cloneLayout([baseIsland])[0].pistole;
        }
        if (!islandEntry.pistole.length && baseIsland) {
            islandEntry.pistole = cloneLayout([baseIsland])[0].pistole;
        }
        finalLayout.push(islandEntry);
        if (baseIsland?.id != null) usedIslands.add(baseIsland.id);
    });
    defaultLayout.forEach(isola => {
        if (isola.id != null && usedIslands.has(isola.id)) return;
        const alreadyAdded = finalLayout.some(entry => entry.id === isola.id);
        if (!alreadyAdded) {
            finalLayout.push({
                id: isola.id,
                label: isola.label,
                pistole: cloneLayout([isola])[0].pistole
            });
        }
    });
    return finalLayout;
}

export async function fetchClosureExportData(closureId) {
    const adminClient = supabase;
    const { data: closure, error } = await adminClient
        .from('closing_shift')
        .select('*')
        .eq('id', closureId)
        .maybeSingle();
    if (error || !closure) {
        throw new Error(error?.message || 'Chiusura non trovata');
    }
    const stationId = closure.station_id;
    const turnoId = closure.turno_id;
    const [
        { data: stationData },
        { data: operatorData },
        { data: islandsData },
        prezziRes
    ] = await Promise.all([
        adminClient.from('fuel_stations').select('station_name').eq('station_id', stationId).maybeSingle(),
        adminClient.from('users').select('full_name, username').eq('user_id', closure.operator_id).maybeSingle(),
        adminClient.from('islands').select('id, island_id, nome, name, island_name, station_id').eq('station_id', stationId).order('nome'),
        adminClient.from('prezzi_distributore')
            .select('prezzo_benzina, prezzo_gasolio, prezzo_gpl, prezzo_metano, data_validita')
            .eq('station_id', stationId)
            .order('data_validita', { ascending: false })
            .limit(1)
            .maybeSingle()
    ]);
    const prezzi = {
        benzina: parseFloat(prezziRes.data?.prezzo_benzina) || 0,
        gasolio: parseFloat(prezziRes.data?.prezzo_gasolio) || 0,
        gpl: parseFloat(prezziRes.data?.prezzo_gpl) || 0,
        metano: parseFloat(prezziRes.data?.prezzo_metano) || 0
    };
    const summaryMetrics = await computeExportSummaryMetrics(adminClient, closure, stationId);
    const normalizedIslands = (islandsData || []).map((isola, idx) => ({
        id: isola?.island_id ?? isola?.id ?? idx + 1,
        originalId: isola?.island_id ?? isola?.id ?? idx + 1,
        label: isola?.nome ?? isola?.name ?? isola?.island_name ?? `Isola ${idx + 1}`,
        stationId: isola?.station_id ?? stationId
    }));
    const islandIds = normalizedIslands.map(i => i.id).filter(id => id != null);
    let pistoleData = [];
    if (islandIds.length > 0) {
        const { data: pistoleRows } = await adminClient
            .from('pistole')
            .select('id, nome, numero_litri, island_id')
            .in('island_id', islandIds)
            .order('nome');
        pistoleData = pistoleRows || [];
    } else {
        const { data: pistoleRows } = await adminClient
            .from('pistole')
            .select('id, nome, numero_litri, island_id')
            .order('nome');
        pistoleData = pistoleRows || [];
    }
    const aperturaMap = {};
    let aperturaRecordCount = 0;
    if (turnoId) {
        const { data: aperturaRows } = await adminClient
            .from('apertura_turno_pistole')
            .select('pistola_id, numeratore_apertura')
            .eq('turno_id', turnoId);
        (aperturaRows || []).forEach(row => {
            aperturaRecordCount++;
            aperturaMap[row.pistola_id] = parseFloat(row.numeratore_apertura) || 0;
        });
    }
    if (aperturaRecordCount === 0) {
        const pistolaIds = (pistoleData || []).map(p => p.id).filter(id => id != null);
        if (pistolaIds.length > 0) {
            let query = adminClient
                .from('chiusura_turno_pistole')
                .select('pistola_id, numeratore_chiusura, created_at')
                .in('pistola_id', pistolaIds);
            if (closure?.date_time) {
                query = query.lt('created_at', closure.date_time);
            }
            query = query.order('created_at', { ascending: false });
            const { data: numeratoriChiusura, error: chiusuraErr } = await query;
            if (chiusuraErr) {
                console.warn('Errore fallback numeratori da chiusura_turno_pistole:', chiusuraErr);
            } else {
                const latestByPistola = {};
                (numeratoriChiusura || []).forEach(row => {
                    if (latestByPistola[row.pistola_id] != null) return;
                    latestByPistola[row.pistola_id] = parseFloat(row.numeratore_chiusura) || 0;
                });
                Object.keys(latestByPistola).forEach(id => {
                    aperturaMap[Number(id)] = latestByPistola[id];
                });
            }
        }
    }
    (pistoleData || []).forEach(p => {
        if (aperturaMap[p.id] == null) {
            aperturaMap[p.id] = parseFloat(p.numero_litri) || 0;
        }
    });
    const chiusuraMap = {};
    if (turnoId) {
        const { data: chiusuraRows } = await adminClient
            .from('chiusura_turno_pistole')
            .select('pistola_id, numeratore_chiusura')
            .eq('turno_id', turnoId);
        (chiusuraRows || []).forEach(row => {
            chiusuraMap[row.pistola_id] = parseFloat(row.numeratore_chiusura) || 0;
        });
    }
    const layoutByIsland = {};
    normalizedIslands.forEach(isola => {
        layoutByIsland[isola.id] = {
            id: isola.id,
            label: isola.label,
            pistole: []
        };
    });
    pistoleData.forEach(p => {
        const targetIslandId = p.island_id ?? null;
        if (!layoutByIsland[targetIslandId]) {
            layoutByIsland[targetIslandId] = {
                id: targetIslandId,
                label: `Isola ${Object.keys(layoutByIsland).length + 1}`,
                pistole: []
            };
        }
        layoutByIsland[targetIslandId].pistole.push({
            id: p.id,
            label: p.nome || `Pistola ${p.id}`
        });
    });
    const defaultLayout = Object.values(layoutByIsland)
        .map(entry => ({
            id: entry.id,
            label: entry.label,
            pistole: (entry.pistole || []).sort((a, b) => (a.label || '').localeCompare(b.label || ''))
        }))
        .sort((a, b) => (a.label || '').localeCompare(b.label || ''));
    const metricsMap = {};
    pistoleData.forEach(p => {
        const opening = parseFloat(aperturaMap[p.id]) || 0;
        const closing = (chiusuraMap[p.id] != null ? parseFloat(chiusuraMap[p.id]) : parseFloat(p.numero_litri)) || 0;
        const tipo = inferFuelTypeFromNameExport(p.nome);
        const venduti = Math.max(0, closing - opening);
        const prezzo = prezzi[tipo] || 0;
        metricsMap[p.id] = {
            id: p.id,
            label: p.nome || `Pistola ${p.id}`,
            apertura: opening,
            chiusura: closing,
            venduti,
            tipo,
            tipoSigla: fuelTypeSigla(tipo),
            prezzo,
            totaleEuro: venduti * prezzo,
            islandId: p.island_id ?? null
        };
    });
    const lookups = {
        islandsById: {},
        pistoleById: {},
        pistoleByName: {}
    };
    defaultLayout.forEach(isola => {
        lookups.islandsById[isola.id] = {
            id: isola.id,
            label: isola.label,
            pistole: isola.pistole
        };
        (isola.pistole || []).forEach(p => {
            lookups.pistoleById[p.id] = { id: p.id, label: p.label, islandId: isola.id };
            if (p.label) {
                lookups.pistoleByName[p.label.toLowerCase()] = { id: p.id, label: p.label, islandId: isola.id };
            }
        });
    });
    const summaryDefaults = {
        self: parseFloat(closure.cash_in_finale) || 0,
        carteSelf: Number.isFinite(summaryMetrics?.carteSelf) ? summaryMetrics.carteSelf : (parseFloat(closure.carte_self) || 0),
        contanti: parseFloat(closure.incasso_contanti) || 0,
        cartePos: Number.isFinite(summaryMetrics?.cartePos) ? summaryMetrics.cartePos : (parseFloat(closure.incasso_pos) || 0),
        nonErogato: Number.isFinite(summaryMetrics?.nonErogato) ? summaryMetrics.nonErogato : (parseFloat(closure.non_erogato) || 0),
        lubrAdblue: Number.isFinite(summaryMetrics?.lubrAdblue) ? summaryMetrics.lubrAdblue : (parseFloat(closure.lubr_adblue) || 0),
        crediti: Number.isFinite(summaryMetrics?.crediti) ? summaryMetrics.crediti : (parseFloat(closure.crediti) || 0),
        utaDkv: parseFloat(closure.incasso_uta_dkv) || parseFloat(closure.uta_dkv) || 0
    };
    const closureDate = closure.date_time ? new Date(closure.date_time) : new Date();
    const meta = {
        closureId,
        stationId,
        stationName: stationData?.station_name || `#${stationId}`,
        stationSlug: slugifyLabel(stationData?.station_name || `station-${stationId}`),
        operatorName: operatorData?.full_name || operatorData?.username || `#${closure.operator_id}`,
        operatorId: closure.operator_id,
        isFinal: !!closure.is_final,
        date: closureDate,
        dateDisplay: closureDate.toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: '2-digit' }),
        dateSlug: closureDate.toISOString().slice(0, 10),
        prices: prezzi,
        turnoId
    };
    return {
        meta,
        layout: defaultLayout,
        metricsMap,
        lookups,
        summaryDefaults
    };
}

export function buildClosureTemplate(ctx, layout, summaryValues) {
    const sections = [];
    let totalLtGasolio = 0;
    let totalLtBenzina = 0;
    let totalLtAltri = 0;
    let totalEuroGasolio = 0;
    let totalEuroBenzina = 0;
    let totalEuroAltri = 0;
    layout.forEach(isola => {
        const pistoleRows = [];
        let islandLtGasolio = 0;
        let islandLtBenzina = 0;
        let islandLtAltri = 0;
        let islandEuro = 0;
        (isola.pistole || []).forEach(p => {
            const metric = ctx.metricsMap[p.id];
            if (!metric) return;
            const row = {
                ...metric,
                label: p.label || metric.label
            };
            pistoleRows.push(row);
            switch (row.tipo) {
                case 'gasolio':
                    islandLtGasolio += row.venduti;
                    islandEuro += row.totaleEuro;
                    break;
                case 'benzina':
                    islandLtBenzina += row.venduti;
                    islandEuro += row.totaleEuro;
                    break;
                default:
                    islandLtAltri += row.venduti;
                    islandEuro += row.totaleEuro;
            }
        });
        totalLtGasolio += islandLtGasolio;
        totalLtBenzina += islandLtBenzina;
        totalLtAltri += islandLtAltri;
        totalEuroGasolio += pistoleRows.filter(r => r.tipo === 'gasolio').reduce((tot, r) => tot + r.totaleEuro, 0);
        totalEuroBenzina += pistoleRows.filter(r => r.tipo === 'benzina').reduce((tot, r) => tot + r.totaleEuro, 0);
        totalEuroAltri += pistoleRows.filter(r => r.tipo !== 'benzina' && r.tipo !== 'gasolio').reduce((tot, r) => tot + r.totaleEuro, 0);
        sections.push({
            id: isola.id,
            label: isola.label || 'Isola',
            pistole: pistoleRows,
            totals: {
                ltGasolio: islandLtGasolio,
                ltBenzina: islandLtBenzina,
                ltOther: islandLtAltri,
                totalEuro: islandEuro
            }
        });
    });
    const totals = {
        ltGasolio: totalLtGasolio,
        ltBenzina: totalLtBenzina,
        ltOther: totalLtAltri,
        euroGasolio: totalEuroGasolio,
        euroBenzina: totalEuroBenzina,
        euroOther: totalEuroAltri,
        totalEuro: totalEuroGasolio + totalEuroBenzina + totalEuroAltri
    };
    return {
        meta: {
            ...ctx.meta,
            totals
        },
        sections,
        summary: summaryValues
    };
}

export function readExportSummaryValues(defaults = {}) {
    const form = document.getElementById('closure-export-summary-form');
    const readField = (name, fallback) => {
        if (!form) return fallback;
        const input = form.querySelector(`[name="${name}"]`);
        if (!input) return fallback;
        const val = parseNumberFlexible(input.value);
        return Number.isFinite(val) ? val : fallback;
    };
    return {
        self: readField('summary_self', defaults.self || 0),
        carteSelf: readField('summary_carte_self', defaults.carteSelf || 0),
        contanti: readField('summary_contanti', defaults.contanti || 0),
        cartePos: readField('summary_carte_pos', defaults.cartePos || 0),
        nonErogato: readField('summary_non_erogato', defaults.nonErogato || 0),
        lubrAdblue: readField('summary_lubr_adblue', defaults.lubrAdblue || 0),
        crediti: readField('summary_crediti', defaults.crediti || 0),
        utaDkv: readField('summary_uta_dkv', defaults.utaDkv || 0)
    };
}

export function generateClosurePdf(template) {
    const jsPDFLib = window.jspdf;
    if (!jsPDFLib || !jsPDFLib.jsPDF) {
        alert('Impossibile generare il PDF: libreria jsPDF non disponibile');
        return;
    }
    const doc = new jsPDFLib.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const drawText = (text, x, y, opts = {}) => {
        doc.text(String(text ?? ''), x, y, opts);
    };

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    drawText('DATA', 12, 18);
    drawText(template.meta.dateDisplay || '', 35, 18);
    drawText('GASOLIO €', pageWidth / 2 - 20, 18);
    drawText(formatNumberIt(template.meta.prices.gasolio || 0, 3), pageWidth / 2 + 10, 18);
    drawText('BENZINA €', pageWidth - 60, 18);
    drawText(formatNumberIt(template.meta.prices.benzina || 0, 3), pageWidth - 25, 18);

    doc.setFontSize(12);
    drawText('TOTALE GASOLIO €', 12, 28);
    drawText(formatEuro(template.meta.totals.euroGasolio || 0), 60, 28);
    drawText('TOTALE BENZINA €', pageWidth / 2 - 20, 28);
    drawText(formatEuro(template.meta.totals.euroBenzina || 0), pageWidth / 2 + 40, 28);
    drawText('VENDUTO €', pageWidth - 60, 28);
    drawText(formatEuro(template.meta.totals.totalEuro || 0), pageWidth - 25, 28);

    drawText('TOTALE GASOLIO LT', 12, 36);
    drawText(formatNumberIt(template.meta.totals.ltGasolio || 0, 2), 65, 36);
    drawText('TOTALE BENZINA LT', pageWidth / 2 - 20, 36);
    drawText(formatNumberIt(template.meta.totals.ltBenzina || 0, 2), pageWidth / 2 + 50, 36);
    drawText('LT TOTALI', pageWidth - 60, 36);
    drawText(formatNumberIt(template.meta.totals.ltGasolio + template.meta.totals.ltBenzina + template.meta.totals.ltOther, 2), pageWidth - 25, 36);

    let currentY = 50;
    const rowHeight = 8;
    const colPositions = {
        pistola: 12,
        chiusura: 40,
        dash: 70,
        apertura: 80,
        equals: 115,
        ltVenduti: 125,
        tipo: 165,
        totale: 180
    };

    const drawSeparator = () => {
        doc.setDrawColor(200);
        doc.line(12, currentY + 2, pageWidth - 12, currentY + 2);
    };

    template.sections.forEach(section => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        drawText(section.label, 12, currentY);
        currentY += rowHeight;

        doc.setFont('helvetica', 'bold');
        drawText('PISTOLA', colPositions.pistola, currentY);
        drawText('CHIUSURA', colPositions.chiusura, currentY);
        drawText('APERTURA', colPositions.apertura, currentY);
        drawText('LT VENDUTI', colPositions.ltVenduti, currentY);
        drawText('TIPO', colPositions.tipo, currentY);
        drawText('TOTALE €', colPositions.totale, currentY);
        currentY += rowHeight;
        drawSeparator();

        (section.pistole || []).forEach(p => {
            doc.setFont('helvetica', 'normal');
            drawText(p.label, colPositions.pistola, currentY);
            drawText(formatNumberIt(p.chiusura || 0, 2), colPositions.chiusura, currentY);
            drawText('-', colPositions.dash, currentY);
            drawText(formatNumberIt(p.apertura || 0, 2), colPositions.apertura, currentY);
            drawText('=', colPositions.equals, currentY);
            drawText(formatNumberIt(p.venduti || 0, 2), colPositions.ltVenduti, currentY);
            drawText(p.tipoSigla || '', colPositions.tipo, currentY);
            drawText(formatEuro(p.totaleEuro || 0), colPositions.totale, currentY);
            currentY += rowHeight;
        });

        drawSeparator();
        doc.setFont('helvetica', 'bold');
        drawText(`LT G: ${formatNumberIt(section.totals.ltGasolio || 0, 2)}`, colPositions.ltVenduti, currentY);
        drawText(`LT B: ${formatNumberIt(section.totals.ltBenzina || 0, 2)}`, colPositions.ltVenduti + 40, currentY);
        drawText(`LT altri: ${formatNumberIt(section.totals.ltOther || 0, 2)}`, colPositions.ltVenduti + 80, currentY);
        drawText(`Totale €: ${formatEuro(section.totals.totalEuro || 0)}`, colPositions.totale, currentY);
        currentY += rowHeight + 4;
        if (currentY > pageHeight - 40) {
            doc.addPage();
            currentY = 20;
        }
    });

    const summaryY = Math.min(currentY + 6, pageHeight - 30);
    const summaryFields = [
        { label: 'SELF', value: template.summary.self },
        { label: 'CARTE SELF', value: template.summary.carteSelf },
        { label: 'CONTANTI', value: template.summary.contanti },
        { label: 'CARTE POS', value: template.summary.cartePos },
        { label: 'NON EROGATO', value: template.summary.nonErogato },
        { label: 'LUBR/ADBLUE', value: template.summary.lubrAdblue },
        { label: 'CREDITI', value: template.summary.crediti },
        { label: 'UTA/DKV', value: template.summary.utaDkv }
    ];
    const summaryCols = summaryFields.length;
    const summarySpacing = (pageWidth - 24) / summaryCols;
    doc.setFont('helvetica', 'bold');
    summaryFields.forEach((field, idx) => {
        const x = 12 + idx * summarySpacing;
        drawText(field.label, x, summaryY);
        doc.setFont('helvetica', 'normal');
        drawText(formatEuro(field.value || 0), x, summaryY + 6);
        doc.setFont('helvetica', 'bold');
    });

    const filename = `chiusura_${template.meta.stationSlug}_${template.meta.dateSlug}.pdf`;
    doc.save(filename);
}

export async function generateClosureExcel(template) {
    if (!window.XlsxPopulate) {
        alert('Impossibile generare il file Excel: libreria XlsxPopulate non disponibile');
        return;
    }
    const templateBase64 = getClosureTemplateBase64();
    if (!templateBase64) {
        alert('Template export non disponibile. Carica nuovamente la pagina.');
        return;
    }
    const arrayBuffer = base64ToArrayBuffer(templateBase64);
    if (!arrayBuffer) {
        alert('Errore nella lettura del template (base64 non valido).');
        return;
    }
    let workbook;
    try {
        workbook = await XlsxPopulate.fromDataAsync(arrayBuffer);
    } catch (err) {
        console.error('Impossibile aprire il template con XlsxPopulate:', err);
        alert('Errore durante il caricamento del template Excel. Controlla la console per i dettagli.');
        return;
    }

    try {
        const sheet = workbook.sheet(0);
        const prices = template.meta.prices || {};
        const setCell = (addr, value) => {
            const cell = sheet.cell(addr);
            if (cell) cell.value(value ?? '');
        };
        setCell('C2', template.meta.dateDisplay || '');
        setCell('M2', Number(prices.gasolio) || 0);
        setCell('X2', Number(prices.benzina) || 0);
        setCell('F5', template.meta.totals.euroGasolio || 0);
        setCell('P5', template.meta.totals.euroBenzina || 0);
        setCell('U5', template.meta.totals.totalEuro || 0);
        setCell('F6', template.meta.totals.ltGasolio || 0);
        setCell('P6', template.meta.totals.ltBenzina || 0);
        setCell('U6', 'LT TOTALI');
        setCell('V6', template.meta.totals.ltGasolio + template.meta.totals.ltBenzina + template.meta.totals.ltOther);

        const sections = template.sections || [];
        const fillPistolaRow = (rowIndex, pistola) => {
            const rowLetter = (col) => `${col}${rowIndex}`;
            if (pistola) {
                setCell(rowLetter('A'), pistola.label || '');
                setCell(rowLetter('B'), pistola.chiusura || 0);
                setCell(rowLetter('G'), '-');
                setCell(rowLetter('H'), pistola.apertura || 0);
                setCell(rowLetter('M'), '=');
                setCell(rowLetter('N'), pistola.venduti || 0);
                setCell(rowLetter('S'), pistola.tipoSigla || '');
                setCell(rowLetter('T'), pistola.totaleEuro || 0);
            } else {
                setCell(rowLetter('A'), '');
                setCell(rowLetter('B'), 0);
                setCell(rowLetter('G'), '-');
                setCell(rowLetter('H'), 0);
                setCell(rowLetter('M'), '=');
                setCell(rowLetter('N'), 0);
                setCell(rowLetter('S'), '');
                setCell(rowLetter('T'), 0);
            }
        };

        const activeCount = Math.min(sections.length, ISLAND_TEMPLATE_BLOCKS.length);
        if (sections.length > ISLAND_TEMPLATE_BLOCKS.length) {
            console.warn('Numero di isole superiore al supportato dal template (max 3). L\'export includerà solo le prime 3 isole.');
        }
        ISLAND_TEMPLATE_BLOCKS.forEach((block, index) => {
            const section = sections[index];
            const isActive = index < activeCount && !!section;
            for (let r = block.startRow; r <= block.endRow; r++) {
                const row = sheet.row(r);
                if (row) row.hidden(!isActive);
            }
            if (!isActive) {
                setCell(`A${block.startRow}`, '');
                for (let i = 0; i < block.pistolaRows; i++) {
                    fillPistolaRow(block.startRow + 2 + i, null);
                }
                block.totals.forEach(t => {
                    setCell(t.valueCell, 0);
                    if (t.priceCell) {
                        if (t.priceType === 'gasolio') setCell(t.priceCell, Number(prices.gasolio) || 0);
                        else if (t.priceType === 'benzina') setCell(t.priceCell, Number(prices.benzina) || 0);
                        else setCell(t.priceCell, 0);
                    }
                });
                return;
            }

            setCell(`A${block.startRow}`, section.label || `Isola ${index + 1}`);
            const pistole = section.pistole || [];
            for (let i = 0; i < block.pistolaRows; i++) {
                fillPistolaRow(block.startRow + 2 + i, pistole[i] || null);
            }
            const typeTotals = { gasolio: 0, benzina: 0 };
            const typeTotalsEuro = { gasolio: 0, benzina: 0 };
            let islandEuro = 0;
            pistole.forEach(p => {
                if (p?.tipo === 'gasolio') typeTotals.gasolio += p.venduti || 0;
                if (p?.tipo === 'benzina') typeTotals.benzina += p.venduti || 0;
                if (p?.tipo === 'gasolio') typeTotalsEuro.gasolio += p?.totaleEuro || 0;
                if (p?.tipo === 'benzina') typeTotalsEuro.benzina += p?.totaleEuro || 0;
                islandEuro += p?.totaleEuro || 0;
            });
            block.totals.forEach(t => {
                if (t.type === 'gasolio') {
                    setCell(t.valueCell, typeTotals.gasolio || 0);
                    if (t.priceCell) setCell(t.priceCell, typeTotalsEuro.gasolio || 0);
                } else if (t.type === 'benzina') {
                    setCell(t.valueCell, typeTotals.benzina || 0);
                    if (t.priceCell) setCell(t.priceCell, typeTotalsEuro.benzina || 0);
                } else {
                    setCell(t.valueCell, (typeTotals.gasolio || 0) + (typeTotals.benzina || 0));
                    if (t.priceCell) setCell(t.priceCell, islandEuro || 0);
                }
            });
        });

        const summaryRow = SUMMARY_TEMPLATE_START_ROW;
        const summaryRows = [summaryRow, summaryRow + 1];
        summaryRows.forEach(r => {
            const row = sheet.row(r);
            if (row) row.hidden(false);
        });
        setCell(`A${summaryRow}`, 'SELF');
        setCell(`D${summaryRow}`, 'CARTE SELF');
        setCell(`G${summaryRow}`, 'CONTANTI');
        setCell(`J${summaryRow}`, 'CARTE POS');
        setCell(`M${summaryRow}`, 'NON EROGATO');
        setCell(`P${summaryRow}`, 'LUBR/ADBLUE');
        setCell(`S${summaryRow}`, 'CREDITI');
        setCell(`V${summaryRow}`, 'UTA/DKV');
        setCell(`A${summaryRow + 1}`, template.summary.self || 0);
        setCell(`D${summaryRow + 1}`, template.summary.carteSelf || 0);
        setCell(`G${summaryRow + 1}`, template.summary.contanti || 0);
        setCell(`J${summaryRow + 1}`, template.summary.cartePos || 0);
        setCell(`M${summaryRow + 1}`, template.summary.nonErogato || 0);
        setCell(`P${summaryRow + 1}`, template.summary.lubrAdblue || 0);
        setCell(`S${summaryRow + 1}`, template.summary.crediti || 0);
        setCell(`V${summaryRow + 1}`, template.summary.utaDkv || 0);
    } catch (err) {
        console.error('Errore durante la compilazione del template Excel:', err);
        alert('Errore nella compilazione del template Excel. Controlla la console per i dettagli.');
        return;
    }

    let blob;
    try {
        blob = await workbook.outputAsync({ type: 'blob' });
    } catch (err) {
        console.error('Errore generazione file Excel:', err);
        alert('Errore nella generazione del file Excel.');
        return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chiusura_${template.meta.stationSlug}_${template.meta.dateSlug}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
}
