/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '../core/api.js';
import { handleError } from '../shared/error-handler.js';
import { Toast } from '../ui/toast.js';
import { showLoadingMessage, showErrorMessage, openModal, closeModal, openConfirmModal } from '../ui/ui.js';
import { escapeHtml, formatEuro } from '../utils/utils.js';

// JS Imports (not yet migrated)
// @ts-ignore
import { calculationEngine, CALCULATION_SCOPES } from '../utils/calculation-engine.js';
// @ts-ignore
import { checkOpeningStatus, updateOpeningStatus } from './opening.js';
// @ts-ignore
import {
    createWarningMessage
} from './ui-components.js';

// --- INTERFACES ---

interface TankLink {
    id: number;
    pump_id: number;
    tank_id: number;
    mode: 'auto' | 'manual';
    ratio: number;
    priority: number;
    tankName: string;
    tankFuel: string;
    pumpName: string;
    islandName: string;
}

interface TankSelection {
    tankId: number | null;
    mode: 'manual';
}

interface TankUsageRecord {
    pump_id: number;
    pump_name: string;
    tank_id: number;
    tank_name: string;
    mode: 'auto' | 'manual';
    ratio: number | null;
    liters: number | null;
}

interface ActiveOpening {
    id: number;
    opened_at?: string;
    date_time?: string;
    opening_data?: {
        uta_dkv_iscard?: number;
    };
    closing_data?: {
        closure_stage?: string;
        scontrino_self?: {
            id_gestore?: number;
        };
        dettaglio_incasso?: {
            pos_operatore?: number;
            uta_dkv_operatore?: number;
        };
    };
}

interface ClosureData {
    stationId: number | string;
    userId: string | number;
    turnoId: number;
    openingDate: string;
    pistole: any[];
    openingCounters: Record<number, number>;
    prezzoBenzina: number;
    prezzoGasolio: number;
    movimenti: any[];
    existingClosingData: any;
    partialAggregates: {
        selfManager: number;
        operatorPos: number;
        operatorUta: number;
    } | null;
    partialCompleted: boolean;
    allowPartialClosure: boolean;
    openingUtaDkvIscard: number;
    closureType: 'partial' | 'final';
    includeCounters: boolean;
    tankLinksByPump: Record<number, TankLink[]>;
    tankSelections: Record<number, TankSelection>;
    hasManualTankLinks: boolean;
    pumpLabelMap: Record<number, string>;
    litersPerPump: Record<number, number>;
    // Step 2 state
    selfCashIn?: number;
    selfCashOut?: number;
    selfPos?: number;
    selfFleet?: number;
    selfManager?: number;
    selfReceiptTotal?: number;
    cashReal?: number;
    posReal?: number;
    utaDkvReal?: number;
    notes?: string;
    // Calculated
    totalLitriBenzina?: number;
    totalLitriGasolio?: number;
    ricavoTotaleTeor?: number;
    creditsSum?: number;
    vouchersSum?: number;
    refundsSum?: number;
    extraCashSum?: number;
    totaleAtteso?: number;
    selfDeltaContante?: number;
    finalCounters?: Record<number, number>;
}

interface ClosureState {
    step: number;
    data: ClosureData;
}

// --- STATE ---

let closureState: ClosureState = {
    step: 1,
    data: {} as any
};

// --- FUNCTIONS ---

export async function startClosureWizard(stationId: number | string, userId: string | number): Promise<void> {
    try {
        openModal('Chiusura Turno');
        const modalBody = document.getElementById('modal-body');
        if (!modalBody) return;
        modalBody.innerHTML = '<p style="text-align: center; padding: 20px;">Caricamento...</p>';

        const activeOpening = await checkOpeningStatus(Number(stationId)) as ActiveOpening;
        if (!activeOpening) {
            modalBody.innerHTML = (createWarningMessage as any)(
                'Nessuna Apertura Attiva',
                'Devi prima aprire il turno prima di poterlo chiudere.',
                'Clicca su <strong>Apertura</strong> per iniziare un nuovo turno.'
            ) + '<div style="text-align: center; margin-top: 20px;"><button id="btn-close-warning" class="menu-button primary">Chiudi</button></div>';
            document.getElementById('btn-close-warning')?.addEventListener('click', () => closeModal());
            return;
        }

        const movimentiQuery = supabase
            .from('movimenti_cassa')
            .select('*')
            .eq('station_id', stationId)
            .gte('created_at', activeOpening.opened_at || activeOpening.date_time);

        const [
            openingCountersResult,
            pistoleResult,
            prezziResult,
            movimentiResult,
            stationDataResult,
            tankLinksResult
        ] = await Promise.all([
            supabase.from('shift_pistols').select('pistola_id, opened_at_counter').eq('shift_id', activeOpening.id),
            supabase.from('pistole').select('*, islands!inner(nome, station_id)').eq('islands.station_id', stationId).order('id'),
            supabase.from('prezzi_distributore').select('*').eq('station_id', stationId).order('data_validita', { ascending: false }).limit(1).maybeSingle(),
            movimentiQuery,
            supabase.from('fuel_stations').select('allow_partial_closure').eq('station_id', stationId).single(),
            supabase.from('tank_pump_links').select(`
                id, pump_id, tank_id, mode, ratio, priority, is_active,
                tanks ( id, name, fuel_type ),
                pistole ( id, nome, islands(nome) )
            `).eq('station_id', stationId).eq('is_active', true).order('pump_id')
        ]);

        // Process Counters
        const openingMap: Record<number, number> = {};
        const { data: openingCounters } = openingCountersResult;
        if (openingCounters) {
            openingCounters.forEach((c: any) => {
                const parsed = parseFloat(c.opened_at_counter);
                openingMap[c.pistola_id] = Number.isFinite(parsed) ? parsed : 0;
            });
        }

        // Process Pistole
        const { data: allPistole } = pistoleResult;
        if (!allPistole || allPistole.length === 0) {
            modalBody.innerHTML = (createWarningMessage as any)(
                'Nessuna Pistola Configurata',
                'Non ci sono pistole configurate per questa stazione.',
                ''
            ) + '<div style="text-align: center; margin-top: 20px;"><button id="btn-close-warning2" class="menu-button primary">Chiudi</button></div>';
            document.getElementById('btn-close-warning2')?.addEventListener('click', () => closeModal());
            return;
        }

        const prezzi = prezziResult.data;
        const prezzoBenzina = prezzi?.prezzo_benzina || 0;
        const prezzoGasolio = prezzi?.prezzo_gasolio || 0;

        // Dedup movements
        const movimentiRaw = movimentiResult.data || [];
        const movimentiMap = new Map();
        movimentiRaw.forEach((m: any) => {
            const dateKey = m.created_at ? new Date(m.created_at).setMilliseconds(0).toString() : '';
            const key = `${m.tipo}_${m.importo}_${dateKey}`;
            if (!movimentiMap.has(key) || (m.id && movimentiMap.get(key).id > m.id)) {
                movimentiMap.set(key, m);
            }
        });
        const movimenti = Array.from(movimentiMap.values());

        const stationData = stationDataResult.data;
        const allowPartialClosure = stationData?.allow_partial_closure !== false;

        // Process Tank Links
        const tankLinksByPump: Record<number, TankLink[]> = {};
        (tankLinksResult.data || []).forEach((link: any) => {
            if (!link?.pump_id || !link?.tank_id) return;
            const normalized: TankLink = {
                id: link.id,
                pump_id: link.pump_id,
                tank_id: link.tank_id,
                mode: link.mode || 'auto',
                ratio: Number(link.ratio) || 0,
                priority: Number(link.priority) || 1,
                tankName: link.tanks?.name || `Cisterna #${link.tank_id}`,
                tankFuel: link.tanks?.fuel_type || '',
                pumpName: link.pistole?.nome || `Pistola #${link.pump_id}`,
                islandName: link.pistole?.islands?.nome || ''
            };
            if (!tankLinksByPump[link.pump_id]) tankLinksByPump[link.pump_id] = [];
            tankLinksByPump[link.pump_id].push(normalized);
        });

        const hasManualTankLinks = Object.values(tankLinksByPump).some(list => list.some(link => link.mode === 'manual'));
        const pumpLabelMap: Record<number, string> = {};
        allPistole.forEach((p: any) => { pumpLabelMap[p.id] = p.nome || `Pistola #${p.id}`; });

        const partialCompleted = activeOpening.closing_data?.closure_stage === 'partial';
        const previousClosing = activeOpening.closing_data || {};
        const partialAggregates = partialCompleted ? {
            selfManager: Number(previousClosing?.scontrino_self?.id_gestore) || 0,
            operatorPos: Number(previousClosing?.dettaglio_incasso?.pos_operatore) || 0,
            operatorUta: Number(previousClosing?.dettaglio_incasso?.uta_dkv_operatore) || 0
        } : null;

        closureState = {
            step: 1,
            data: {
                stationId, userId, turnoId: activeOpening.id,
                openingDate: activeOpening.opened_at || activeOpening.date_time,
                pistole: allPistole, openingCounters: openingMap,
                prezzoBenzina, prezzoGasolio, movimenti,
                existingClosingData: previousClosing,
                partialAggregates, partialCompleted, allowPartialClosure,
                openingUtaDkvIscard: activeOpening.opening_data?.uta_dkv_iscard || 0,
                closureType: partialCompleted ? 'final' : (allowPartialClosure ? 'partial' : 'final'),
                includeCounters: partialCompleted,
                tankLinksByPump, tankSelections: {}, hasManualTankLinks,
                pumpLabelMap, litersPerPump: {}
            }
        };

        showClosureStep1();
    } catch (err: any) {
        handleError(err, 'startClosureWizard');
        const modalBody = document.getElementById('modal-body');
        if (modalBody) {
            modalBody.innerHTML = `<p style="color: red; padding: 20px; text-align: center;">Errore: ${escapeHtml(err.message)}</p><div style="text-align: center; margin-top: 20px;"><button id="btn-close-error" class="menu-button primary">Chiudi</button></div>`;
            document.getElementById('btn-close-error')?.addEventListener('click', () => closeModal());
        }
    }
}

function showClosureStep1(): void {
    openModal('Chiusura Turno - Step 1/3');
    const container = document.getElementById('modal-body');
    if (!container) return;

    const d = closureState.data;
    const isFinal = d.partialCompleted ? true : (!d.allowPartialClosure ? true : d.closureType === 'final');
    const showCounters = isFinal || d.includeCounters;
    const formattedDate = new Date(d.openingDate).toLocaleString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const showPartialOption = d.allowPartialClosure && !d.partialCompleted;

    container.innerHTML = `
        <div class="content-box">
            <h3><i class="fas fa-door-closed"></i> Chiusura Turno - Step 1/3</h3>
            <p class="section-subtitle">Turno aperto il: <strong>${formattedDate}</strong></p>
            ${d.partialCompleted ? '<div class="warning-message"><h3>Chiusura Parziale registrata</h3><p>Completa ora la chiusura finale.</p></div>' : ''}
            <form id="closure-step1-form">
                <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
                    <div style="display: flex; gap: 20px; justify-content: center; margin-bottom: 15px;">
                        ${showPartialOption ? `
                        <label class="radio-card ${!isFinal ? 'selected' : ''}" data-type="partial" style="flex: 1; text-align: center; padding: 15px; border: 2px solid #cbd5e1; border-radius: 8px; cursor: pointer;">
                            <input type="radio" name="closure_type" value="partial" ${!isFinal ? 'checked' : ''} style="display: none;">
                            <i class="fas fa-clock" style="font-size: 1.5rem; color: #3b82f6; margin-bottom: 8px; display: block;"></i>
                            <div style="font-weight: 600;">Parziale</div>
                        </label>` : ''}
                        <label class="radio-card ${isFinal ? 'selected' : ''}" data-type="final" style="flex: 1; text-align: center; padding: 15px; border: 2px solid #cbd5e1; border-radius: 8px; cursor: pointer;">
                            <input type="radio" name="closure_type" value="final" ${isFinal ? 'checked' : ''} style="display: none;">
                            <i class="fas fa-flag-checkered" style="font-size: 1.5rem; color: #ef4444; margin-bottom: 8px; display: block;"></i>
                            <div style="font-weight: 600;">Finale</div>
                        </label>
                    </div>
                    <div id="counters-toggle-container" style="display: ${isFinal ? 'none' : 'block'}; text-align: center;">
                        <label style="cursor: pointer;"><input type="checkbox" id="include-counters-check" ${d.includeCounters ? 'checked' : ''}> Inserisci Numeratori Pistole (Opzionale)</label>
                    </div>
                </div>
                <div id="pistole-section" style="display: ${showCounters || d.hasManualTankLinks ? 'block' : 'none'};">
                    <h4 style="margin-bottom: 15px;">Numeratori Erogatori</h4>
                    <div class="pistole-grid">
                        ${d.pistole.map(p => {
        const opening = d.openingCounters[p.id] || 0;
        const links = d.tankLinksByPump[p.id] || [];
        const manualLinks = links.filter(l => l.mode === 'manual');
        const autoLinks = links.filter(l => l.mode !== 'manual');
        const savedSelection = d.tankSelections[p.id]?.tankId;
        return `
                                <div class="pistola-card">
                                    <div class="pistola-header">
                                        <span class="pistola-name">${escapeHtml(p.nome || `Pistola #${p.id}`)}</span>
                                        <span class="pistola-island">${escapeHtml(p.islands?.nome || '')}</span>
                                    </div>
                                    <div class="form-group"><label>Apertura</label><input type="number" value="${opening}" class="big-input" disabled></div>
                                    <div class="form-group"><label>Chiusura</label><input type="number" name="counter_${p.id}" step="0.01" min="${opening}" class="big-input gun-counter-input" ${showCounters ? '' : 'disabled'}></div>
                                    ${manualLinks.length ? `
                                        <div class="form-group tank-link-panel">
                                            <label>Serbatoio</label>
                                            <select name="tank_select_${p.id}" data-pump="${p.id}" class="big-input tank-select" required>
                                                <option value="">Seleziona...</option>
                                                ${manualLinks.map(l => `<option value="${l.tank_id}" ${(savedSelection === l.tank_id || manualLinks.length === 1) ? 'selected' : ''}>${escapeHtml(l.tankName)}</option>`).join('')}
                                            </select>
                                        </div>` : ''}
                                    ${autoLinks.length ? `<div class="tank-link-panel"><p class="tank-link-title">Auto Ripartizione</p><div class="tank-link-info">${autoLinks.map(l => `<span class="badge badge-outline">${escapeHtml(l.tankName)}</span>`).join('')}</div></div>` : ''}
                                </div>`;
    }).join('')}
                    </div>
                </div>
                <div class="form-actions">
                    <button type="button" class="menu-button btn-danger" id="btn-cancel-closure">Annulla</button>
                    <button type="submit" class="menu-button primary">Avanti</button>
                </div>
            </form>
        </div>
        <style>.radio-card.selected { border-color: #3b82f6 !important; background-color: #eff6ff !important; }</style>
    `;

    const form = document.getElementById('closure-step1-form') as HTMLFormElement;
    const countersCheck = document.getElementById('include-counters-check') as HTMLInputElement;

    const updateUI = () => {
        const type = (form.querySelector('input[name="closure_type"]:checked') as HTMLInputElement)?.value || 'final';
        const include = countersCheck ? countersCheck.checked : true;
        const shouldShow = type === 'final' || include;
        (document.getElementById('counters-toggle-container') as HTMLElement).style.display = (type === 'final' || d.partialCompleted || !d.allowPartialClosure) ? 'none' : 'block';
        (document.getElementById('pistole-section') as HTMLElement).style.display = (shouldShow || d.hasManualTankLinks) ? 'block' : 'none';
        form.querySelectorAll('.gun-counter-input').forEach((i: any) => { i.required = shouldShow; i.disabled = !shouldShow; });
        form.querySelectorAll('.radio-card').forEach((c: any) => {
            c.classList.toggle('selected', c.dataset.type === type);
        });
    };

    form.querySelectorAll('input[name="closure_type"]').forEach(r => r.addEventListener('change', updateUI));
    countersCheck?.addEventListener('change', updateUI);
    document.getElementById('btn-cancel-closure')?.addEventListener('click', () => closeModal());

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const type = (d.partialCompleted || !d.allowPartialClosure ? 'final' : formData.get('closure_type')?.toString() || 'final') as 'partial' | 'final';
        const include = type === 'final' ? true : (countersCheck ? countersCheck.checked : false);

        d.closureType = type;
        d.includeCounters = include;
        const fCounters: Record<number, number> = {};
        d.pistole.forEach(p => {
            const val = formData.get(`counter_${p.id}`)?.toString();
            fCounters[p.id] = (val === '' || val === null || val === undefined) ? (d.openingCounters[p.id] || 0) : parseFloat(val);
        });
        d.finalCounters = fCounters;

        d.tankSelections = {};
        let missingSelection = null;
        for (const p of d.pistole) {
            const manualLinks = (d.tankLinksByPump[p.id] || []).filter(l => l.mode === 'manual');
            if (manualLinks.length > 0) {
                const sel = formData.get(`tank_select_${p.id}`)?.toString() || '';
                if (!sel) { missingSelection = p; break; }
                d.tankSelections[p.id] = { tankId: Number(sel), mode: 'manual' };
            }
        }

        if (missingSelection) {
            (Toast as any).show(`Seleziona il serbatoio per ${missingSelection.nome || `Pistola #${missingSelection.id}`}`, 'warning');
            return;
        }

        closureState.step = 2;
        await showClosureStep2();
    });
}

async function showClosureStep2(): Promise<void> {
    openModal('Chiusura Turno - Step 2/3');
    const container = document.getElementById('modal-body');
    if (!container) return;

    const d = closureState.data;
    let totalLB = 0, totalLG = 0, ricavoTeor = 0;
    const litersPerPump: Record<number, number> = {};

    if (d.includeCounters) {
        d.pistole.forEach(p => {
            const finalVal = d.finalCounters ? (d.finalCounters[p.id] || 0) : 0;
            const litri = Math.max(0, finalVal - (d.openingCounters[p.id] || 0));
            litersPerPump[p.id] = litri;
            if (p.tipo_carburante === 'benzina') totalLB += litri;
            else if (p.tipo_carburante === 'gasolio') totalLG += litri;
        });
        ricavoTeor = (totalLB * d.prezzoBenzina) + (totalLG * d.prezzoGasolio);
    }

    d.litersPerPump = litersPerPump;
    d.totalLitriBenzina = totalLB;
    d.totalLitriGasolio = totalLG;

    const summary = await calculationEngine.run(CALCULATION_SCOPES.CHIUSURE_MOVIMENTI, { movimenti: d.movimenti });
    d.creditsSum = Number(summary?.credits || 0);
    d.vouchersSum = Number(summary?.vouchers || 0);
    d.refundsSum = Number(summary?.refunds || 0);
    d.extraCashSum = Number(summary?.extra_cash || 0);

    const partialAgg = d.partialAggregates || { selfManager: 0, operatorPos: 0, operatorUta: 0 };
    const prevSelfManager = partialAgg.selfManager;

    container.innerHTML = `
        <div class="content-box">
            <h3><i class="fas fa-calculator"></i> Step 2/3</h3>
            <div class="summary-box">
                <div class="summary-row total"><span>Totale Atteso:</span><strong id="total-expected-display">...</strong></div>
            </div>
            <form id="closure-step2-form">
                <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <h4>Scontrino Self</h4>
                    <div class="form-row">
                        <div class="form-group"><label>Banc. Incassate</label><input type="number" name="self_cash_in" step="0.01" value="${d.selfCashIn ?? ''}" class="big-input self-input" required></div>
                        <div class="form-group"><label>Banc. Erogate</label><input type="number" name="self_cash_out" step="0.01" value="${d.selfCashOut ?? ''}" class="big-input self-input" required></div>
                    </div>
                    <div class="form-row">
                        <div class="form-group"><label>Bancomat</label><input type="number" name="self_pos" step="0.01" value="${d.selfPos ?? ''}" class="big-input self-input" required></div>
                        <div class="form-group"><label>UTA/DKV</label><input type="number" name="self_fleet" step="0.01" value="${d.selfFleet ?? ''}" class="big-input self-input" required></div>
                    </div>
                    <div class="form-group"><label>ID Gestore</label><input type="number" name="self_manager" step="0.01" value="${d.selfManager ?? ''}" class="big-input self-input" required></div>
                    <div class="summary-row"><span>Totale Self:</span><strong id="self-total-display">0,00 €</strong></div>
                </div>
                <div style="background: #fdf2f8; padding: 15px; border-radius: 8px;">
                    <h4>Operatore</h4>
                    <div class="form-row">
                        <div class="form-group"><label>Contanti</label><input type="number" name="cash_real" step="0.01" value="${d.cashReal ?? ''}" class="big-input" required></div>
                        <div class="form-group"><label>POS</label><input type="number" name="pos_real" step="0.01" value="${d.posReal ?? ''}" class="big-input" required></div>
                    </div>
                    <div class="form-group"><label>UTA/DKV Manuale</label><input type="number" name="uta_dkv_real" step="0.01" value="${d.utaDkvReal ?? ''}" class="big-input" required></div>
                    ${d.creditsSum ? `<div>Crediti: ${formatEuro(d.creditsSum)}</div>` : ''}
                    ${d.vouchersSum ? `<div>Voucher: ${formatEuro(d.vouchersSum)}</div>` : ''}
                </div>
                <div class="form-actions">
                    <button type="button" id="btn-back-step2" class="menu-button secondary">Indietro</button>
                    <button type="submit" class="menu-button primary">Avanti</button>
                </div>
            </form>
        </div>
    `;

    const form = document.getElementById('closure-step2-form') as HTMLFormElement;
    const update = async () => {
        const co = parseFloat((form.elements.namedItem('self_cash_out') as HTMLInputElement).value) || 0;
        const sp = parseFloat((form.elements.namedItem('self_pos') as HTMLInputElement).value) || 0;
        const sf = parseFloat((form.elements.namedItem('self_fleet') as HTMLInputElement).value) || 0;
        const sm = parseFloat((form.elements.namedItem('self_manager') as HTMLInputElement).value) || 0;
        const selfTotal = co + sp + sf + (sm + prevSelfManager);
        (document.getElementById('self-total-display') as HTMLElement).textContent = formatEuro(selfTotal);

        const totals = await calculationEngine.run(CALCULATION_SCOPES.CHIUSURE_TOTALE_ATTESO, {
            includeCounters: d.includeCounters,
            totalLitriBenzina: d.totalLitriBenzina,
            totalLitriGasolio: d.totalLitriGasolio,
            prezzoBenzina: d.prezzoBenzina,
            prezzoGasolio: d.prezzoGasolio,
            selfTotalVenduto: selfTotal
        });
        d.totaleAtteso = Number(totals?.totale_atteso || (d.includeCounters ? ricavoTeor : selfTotal));
        (document.getElementById('total-expected-display') as HTMLElement).textContent = formatEuro(d.totaleAtteso);
    };

    form.querySelectorAll('.self-input').forEach(i => i.addEventListener('input', update));
    update();

    document.getElementById('btn-back-step2')?.addEventListener('click', () => { closureState.step = 1; showClosureStep1(); });
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        d.selfCashIn = parseFloat(String(fd.get('self_cash_in') || '0'));
        d.selfCashOut = parseFloat(String(fd.get('self_cash_out') || '0'));
        d.selfPos = parseFloat(String(fd.get('self_pos') || '0'));
        d.selfFleet = parseFloat(String(fd.get('self_fleet') || '0'));
        d.selfManager = parseFloat(String(fd.get('self_manager') || '0'));
        d.cashReal = parseFloat(String(fd.get('cash_real') || '0'));
        d.posReal = parseFloat(String(fd.get('pos_real') || '0'));
        d.utaDkvReal = parseFloat(String(fd.get('uta_dkv_real') || '0'));
        closureState.step = 3;
        await showClosureStep3();
    });
}

async function showClosureStep3(): Promise<void> {
    openModal('Chiusura Turno - Step 3/3');
    const container = document.getElementById('modal-body');
    if (!container) return;

    const d = closureState.data;
    const partialAgg = d.partialAggregates || { selfManager: 0, operatorPos: 0, operatorUta: 0 };
    const totalPos = d.posReal! + partialAgg.operatorPos;
    const totalUta = d.utaDkvReal! + (d.openingUtaDkvIscard || 0) + partialAgg.operatorUta;
    const selfDelta = d.selfCashIn! - d.selfCashOut!;

    let expectedCash = 0;
    let cashDiff = 0;
    let discrepancy = 0;

    try {
        const { data } = await supabase.functions.invoke('calculate-closure', {
            body: {
                station_id: d.stationId, shift_id: d.turnoId,
                include_counters: d.includeCounters, allow_partial: d.allowPartialClosure,
                closing_counters: d.finalCounters,
                self_data: { cash_in: d.selfCashIn, cash_out: d.selfCashOut, pos: d.selfPos, fleet: d.selfFleet, manager: d.selfManager },
                operator_data: { cash: d.cashReal, pos: totalPos, uta: totalUta, credits: d.creditsSum, vouchers: d.vouchersSum, refunds: d.refundsSum }
            }
        });
        if (data?.success) {
            discrepancy = data.data.discrepancy;
            cashDiff = discrepancy;
            expectedCash = d.cashReal! - cashDiff;
        } else throw new Error(data?.error);
    } catch (err) {
        expectedCash = d.totaleAtteso! - totalPos - totalUta - d.selfPos! - d.creditsSum! - d.vouchersSum! + selfDelta - d.refundsSum! + (d.extraCashSum || 0);
        cashDiff = d.cashReal! - expectedCash;
        discrepancy = cashDiff;
    }

    const isValid = Math.abs(cashDiff) <= 5;

    container.innerHTML = `
        <div class="content-box">
            <h3>Conferma Finale</h3>
            ${!isValid ? `<div class="warning-message">Discrepanza significativa: ${formatEuro(discrepancy)}</div>` : ''}
            <div class="summary-box">
                <div class="summary-row"><span>Contanti Attesi:</span><strong>${formatEuro(expectedCash)}</strong></div>
                <div class="summary-row"><span>Contanti Inseriti:</span><strong>${formatEuro(d.cashReal!)}</strong></div>
                <div class="summary-row"><span>Discrepanza:</span><strong>${formatEuro(discrepancy)}</strong></div>
            </div>
            <div class="form-actions">
                <button type="button" id="btn-back-step3" class="menu-button secondary">Indietro</button>
                <button type="button" id="btn-confirm-closure" class="menu-button btn-success">Salva</button>
            </div>
        </div>
    `;

    document.getElementById('btn-back-step3')?.addEventListener('click', () => { closureState.step = 2; showClosureStep2(); });
    document.getElementById('btn-confirm-closure')?.addEventListener('click', async () => {
        if (!isValid && !(await openConfirmModal('C\'è una grossa discrepanza. Procedere?'))) return;
        if (!(await openConfirmModal('Confermi il salvataggio?'))) return;

        if (container) showLoadingMessage(container);
        try {
            const tankUsage: TankUsageRecord[] = [];
            Object.entries(d.tankLinksByPump).forEach(([pumpIdStr, links]) => {
                const pumpId = Number(pumpIdStr);
                const litri = d.litersPerPump[pumpId] || 0;
                const manual = links.filter(l => l.mode === 'manual');
                const auto = links.filter(l => l.mode !== 'manual');
                if (manual.length) {
                    const sel = d.tankSelections[pumpId]?.tankId || manual[0].tank_id;
                    const foundLink = manual.find(m => m.tank_id === sel) || manual[0];
                    if (foundLink) {
                        tankUsage.push({ pump_id: pumpId, pump_name: d.pumpLabelMap[pumpId] || `Pistola #${pumpId}`, tank_id: foundLink.tank_id, tank_name: foundLink.tankName, mode: 'manual', ratio: null, liters: litri });
                    }
                } else if (auto.length) {
                    const rTot = auto.reduce((s, linkItem) => s + (linkItem.ratio || 0), 0);
                    auto.forEach(linkItem => {
                        const share = rTot > 0 ? (litri * linkItem.ratio) / rTot : (litri / auto.length);
                        tankUsage.push({ pump_id: pumpId, pump_name: d.pumpLabelMap[pumpId] || `Pistola #${pumpId}`, tank_id: linkItem.tank_id, tank_name: linkItem.tankName, mode: 'auto', ratio: linkItem.ratio || null, liters: Number(share.toFixed(3)) });
                    });
                }
            });

            const isFinal = d.closureType === 'final';
            const dataJson = {
                litri_benzina: d.totalLitriBenzina, litri_gasolio: d.totalLitriGasolio,
                prezzo_benzina: d.prezzoBenzina, prezzo_gasolio: d.prezzoGasolio,
                ricavo_teorico: (d.totalLitriBenzina! * d.prezzoBenzina) + (d.totalLitriGasolio! * d.prezzoGasolio),
                extra_incassi: d.extraCashSum, totale_atteso: d.totaleAtteso! + (d.extraCashSum || 0),
                incasso_reale: (d.selfCashIn! - d.selfCashOut!) + d.cashReal! + d.selfPos! + totalPos + d.selfFleet! + totalUta + d.creditsSum! + d.vouchersSum!,
                closure_stage: d.closureType,
                scontrino_self: {
                    banconote_incassate: d.selfCashIn,
                    banconote_erogate: d.selfCashOut,
                    bancomat_erogati: d.selfPos,
                    transazioni_uta: d.selfFleet,
                    id_gestore: (d.selfManager || 0) + (partialAgg.selfManager || 0)
                },
                dettaglio_incasso: { contanti_operatore: d.cashReal, pos_operatore: totalPos, uta_dkv_operatore: totalUta, crediti: d.creditsSum, voucher: d.vouchersSum, rimborsi_uscite: d.refundsSum },
                discrepanza: discrepancy, is_final: isFinal, tank_usage: tankUsage
            };

            const { data: res, error } = await supabase.rpc('submit_shift_closure', {
                p_shift_id: d.turnoId, p_station_id: d.stationId, p_closing_data: dataJson,
                p_is_final: isFinal, p_final_counters: d.includeCounters ? d.finalCounters : null, p_tank_usage: tankUsage
            });

            if (error || (res && !res.success)) throw new Error(error?.message || res?.error);

            container.innerHTML = `<div class="success-message"><h3>Chiusura Salvata!</h3><button id="btn-home" class="menu-button primary">Ok</button></div>`;
            document.getElementById('btn-home')?.addEventListener('click', () => { closeModal(); updateOpeningStatus(Number(d.stationId)); });
        } catch (err: any) {
            showErrorMessage('Errore', err.message);
            showClosureStep3();
        }
    });
}
