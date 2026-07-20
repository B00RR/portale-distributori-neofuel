import { html, css, CSSResultGroup, TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';

import { supabase } from '../../core/api.js';
import type { Json } from '../../core/api.js';
import { BusinessLogicManager } from '../../core/business-logic-manager.js';
import { type BusinessRules, DEFAULT_BUSINESS_RULES } from '../../core/business-rules-schema.js';
import { logger } from '../../core/logger.js';
import { isOffline, queueAction } from '../../core/offline-queue.js';
import { handleError, AppError } from '../../shared/error-handler.js';
import { Pistola, Island, Shift } from '../../types.js';
import { formatEuro, formatDateTimeSafe, getErrorMessage } from '../../utils/utils.js';
import { Toast } from '../toast.js';

import { BaseComponent } from './BaseComponent.js';

interface RpcResult {
  success: boolean;
  error?: string;
}

function isRpcResult(value: unknown): value is RpcResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    typeof value.success === 'boolean'
  );
}

function getRpcError(value: unknown): string | undefined {
  if (isRpcResult(value)) {
    return value.error;
  }
  return undefined;
}

function getClosingStage(data: Json | null): 'partial' | 'final' | undefined {
  if (data && typeof data === 'object' && !Array.isArray(data) && 'closure_stage' in data) {
    const stage = (data as Record<string, Json>).closure_stage;
    if (stage === 'partial' || stage === 'final') {
      return stage;
    }
  }
  return undefined;
}

function isPartiallyClosedShift(shift: Shift | null): boolean {
  return shift?.status === 'partial' || getClosingStage(shift?.closing_data ?? null) === 'partial';
}

interface ClosureWizardState {
  step: 1 | 2 | 3;
  mode: 'loading' | 'form' | 'submitting' | 'success' | 'error';
  errorMessage: string;
}

export class ClosureWizard extends BaseComponent {
  @property({ type: String }) stationId: string = '';
  @property({ type: String }) userId: string = '';
  @property({ type: String }) shiftId: string = ''; // Optional: Can be used to load specific shift

  private get numericStationId(): number {
    const value = Number(this.stationId);
    if (!Number.isFinite(value) || value <= 0) {
      return NaN;
    }
    return value;
  }

  @state() private wizardState: ClosureWizardState = {
    step: 1,
    mode: 'loading',
    errorMessage: ''
  };

  // Data from Step 1
  @state() private activeOpening: Shift | null = null;
  @state() private pistole: Pistola[] = [];
  @state() private islands: Island[] = [];
  @state() private openingCounters: Record<number, number> = {};
  @state() private finalCounters: Record<number, number> = {};
  @state() private prezzi: {
    prezzo_benzina?: number | null;
    prezzo_gasolio?: number | null;
  } | null = null;
  @state() private stationConfig: { allow_partial_closure?: boolean | null } | null = null;

  // Data from Step 2
  @state() private selfCashIn: string = '';
  @state() private selfCashOut: string = '';
  @state() private selfPos: string = '';
  @state() private selfFleet: string = '';
  @state() private selfManager: string = '';
  @state() private operatorCash: string = '';
  @state() private operatorPos: string = '';
  @state() private operatorUta: string = '';

  // Calculated Data
  @state() private totalLitriBenzina: number = 0;
  @state() private totalLitriGasolio: number = 0;
  @state() private ricavoTeorico: number = 0;

  // UI State
  @state() private closureType: 'partial' | 'final' = 'final';
  @state() private includeCounters: boolean = true;
  @state() private businessRules: BusinessRules = DEFAULT_BUSINESS_RULES;

  private get isFinalClosure(): boolean {
    return this.closureType === 'final' || isPartiallyClosedShift(this.activeOpening);
  }

  private get shouldSubmitCounters(): boolean {
    return this.isFinalClosure || this.includeCounters;
  }

  private selectClosureType(type: 'partial' | 'final'): void {
    if (isPartiallyClosedShift(this.activeOpening)) {
      this.closureType = 'final';
      this.includeCounters = true;
      return;
    }

    this.closureType = type;
    if (type === 'final') {
      this.includeCounters = true;
    }
  }

  private calculateTotalIncasso(): number {
    return (
      Number(this.selfCashIn) -
      Number(this.selfCashOut) +
      Number(this.operatorCash) +
      Number(this.selfPos) +
      Number(this.operatorPos) +
      Number(this.selfFleet) +
      Number(this.selfManager) +
      Number(this.operatorUta)
    );
  }

  static override styles: CSSResultGroup = [
    BaseComponent.styles,
    css`
      :host {
        display: block;
        max-width: 900px;
        margin: 0 auto;
        font-family: 'Inter', sans-serif;
      }

      .wizard-container {
        background: white;
        border-radius: 20px;
        padding: 2rem;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
        animation: slideUp 0.4s ease-out;
      }

      .wizard-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2rem;
        padding-bottom: 1rem;
        border-bottom: 2px solid #f1f5f9;
      }

      .step-indicator {
        display: flex;
        gap: 0.5rem;
      }

      .step-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #e2e8f0;
        transition: all 0.3s;
      }

      .step-dot.active {
        background: #8dc63f;
        transform: scale(1.3);
      }

      .section-title {
        color: #0a2342;
        font-size: 1.25rem;
        font-weight: 700;
        margin: 1.5rem 0 1rem 0;
      }

      .form-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 1.5rem;
      }

      .input-card {
        background: #f8fafc;
        padding: 1.5rem;
        border-radius: 12px;
        border: 1px solid #e2e8f0;
        transition: transform 0.2s;
      }

      .input-card:hover {
        transform: translateY(-2px);
        border-color: #cbd5e1;
      }

      label {
        display: block;
        font-weight: 600;
        color: #475569;
        margin-bottom: 0.5rem;
        font-size: 0.9rem;
      }

      input {
        width: 100%;
        padding: 0.75rem;
        border: 2px solid #e2e8f0;
        border-radius: 8px;
        font-size: 1.1rem;
        font-weight: 600;
        color: #1e293b;
        box-sizing: border-box;
      }

      input:focus {
        outline: none;
        border-color: #0a2342;
        box-shadow: 0 0 0 4px rgba(10, 35, 66, 0.1);
      }

      .radio-group {
        display: flex;
        gap: 1rem;
        margin-bottom: 2rem;
      }

      .radio-option {
        flex: 1;
        padding: 1rem;
        border: 2px solid #e2e8f0;
        border-radius: 12px;
        cursor: pointer;
        text-align: center;
        transition: all 0.2s;
      }

      .radio-option.active {
        border-color: #8dc63f;
        background: #f7fee7;
        color: #3f6212;
      }

      .btn-group {
        display: flex;
        gap: 1rem;
        margin-top: 2rem;
      }

      .btn {
        flex: 1;
        padding: 1rem;
        border-radius: 12px;
        font-weight: 700;
        font-size: 1rem;
        cursor: pointer;
        transition: all 0.2s;
        border: none;
      }

      .btn-primary {
        background: #8dc63f;
        color: white;
      }
      .btn-secondary {
        background: #f1f5f9;
        color: #475569;
      }
      .btn-danger {
        background: #fee2e2;
        color: #b91c1c;
      }

      .btn:hover:not(:disabled) {
        transform: translateY(-2px);
        filter: brightness(0.95);
      }

      .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      @keyframes slideUp {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `
  ];

  protected override firstUpdated(): void {
    this.loadInitialData();
  }

  private async loadInitialData(): Promise<void> {
    this.wizardState = { ...this.wizardState, mode: 'loading' };
    try {
      const { data: shiftResult, error: sError } = await supabase
        .from('shifts')
        .select('*, users!operator_id(full_name)')
        .eq('station_id', this.numericStationId)
        .is('closed_at', null)
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sError) {
        throw sError;
      }
      if (!shiftResult) {
        this.wizardState = {
          mode: 'error',
          errorMessage: 'Nessun turno aperto trovato per questa stazione.',
          step: 1
        };
        return;
      }
      const activeOpening = shiftResult;
      this.activeOpening = activeOpening;
      if (isPartiallyClosedShift(activeOpening)) {
        this.closureType = 'final';
        this.includeCounters = true;
      }

      const shiftId = activeOpening.id;
      if (!shiftId) {
        this.wizardState = { mode: 'error', errorMessage: 'Turno senza ID valido.', step: 1 };
        return;
      }
      const [islandsRes, prezziRes, configRes, countersRes, rules] = await Promise.all([
        supabase
          .from('islands')
          .select('island_id, nome, island_name')
          .eq('station_id', this.numericStationId)
          .order('island_id'),
        supabase
          .from('prezzi_distributore')
          .select('*')
          .eq('station_id', this.numericStationId)
          .order('data_validita', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('fuel_stations')
          .select('allow_partial_closure')
          .eq('station_id', this.numericStationId)
          .single(),
        supabase
          .from('shift_pistols')
          .select('pistola_id, opened_at_counter, closed_at_counter')
          .eq('shift_id', shiftId),
        BusinessLogicManager.loadRules()
      ]);

      if (islandsRes.error) {
        throw islandsRes.error;
      }
      if (prezziRes.error) {
        throw prezziRes.error;
      }
      if (configRes.error) {
        throw configRes.error;
      }
      if (countersRes.error) {
        throw countersRes.error;
      }

      this.islands = islandsRes.data.map(
        (
          i: { island_id: number | null; nome: string | null; island_name: string | null },
          idx: number
        ) => ({
          island_id: i.island_id ?? idx + 1,
          nome: i.nome ?? i.island_name ?? `Isola ${idx + 1}`,
          station_id: this.numericStationId
        })
      );

      this.prezzi = prezziRes.data;
      this.stationConfig = configRes.data;
      this.businessRules = rules;

      const islandIds = this.islands.map(i => i.island_id);
      const { data: pData, error: pError } = await supabase
        .from('pistole')
        .select('id, island_id, nome, tipo_carburante, numero_litri, station_id, created_at')
        .in('island_id', islandIds)
        .order('id');

      if (pError) {
        throw pError;
      }

      // Abbina il nome dell'isola lato client per evitare JOIN ambigue
      const islandMap = new Map(this.islands.map(i => [i.island_id, i.nome]));
      this.pistole = (pData ?? []).map(p => ({
        ...p,
        islands: { nome: islandMap.get(p.island_id) ?? null }
      })) as unknown as Pistola[];

      const countersMap: Record<number, number> = {};
      // The generated DB types don't model this legacy column selection (see
      // CLAUDE.md: repo types can lag the live DB), so the row shape is asserted.
      const counters = (countersRes.data || []) as Array<{
        pistola_id: number | string;
        opened_at_counter: number | string;
        closed_at_counter: number | string | null;
      }>;
      const previousClosingCounters: Record<number, number> = {};
      counters.forEach(c => {
        const pistolId = Number(c.pistola_id);
        if (!Number.isFinite(pistolId)) {
          return;
        }
        // eslint-disable-next-line security/detect-object-injection -- pistolId is a finite numeric database id.
        countersMap[pistolId] = Number(c.opened_at_counter) || 0;
        const previousClosingCounter = Number(c.closed_at_counter);
        if (c.closed_at_counter !== null && Number.isFinite(previousClosingCounter)) {
          // eslint-disable-next-line security/detect-object-injection -- pistolId is a finite numeric database id.
          previousClosingCounters[pistolId] = previousClosingCounter;
        }
      });
      this.openingCounters = countersMap;
      this.finalCounters = previousClosingCounters;
      this.wizardState = { ...this.wizardState, mode: 'form', step: 1 };
    } catch (error: unknown) {
      logger.error('closureWizard', 'Error loading ClosureWizard data:', error);
      this.wizardState = {
        mode: 'error',
        errorMessage: getErrorMessage(error) || 'Errore imprevisto',
        step: 1
      };
    }
  }

  override render(): TemplateResult {
    if (this.wizardState.mode === 'loading') {
      return this.renderLoading();
    }
    if (this.wizardState.mode === 'error') {
      return this.renderError();
    }

    return html`
      <div class="wizard-container">
        <div class="wizard-header">
          <h2 style="margin:0; color: #0A2342;">Chiusura Turno</h2>
          <div class="step-indicator">
            <div class="step-dot ${this.wizardState.step >= 1 ? 'active' : ''}"></div>
            <div class="step-dot ${this.wizardState.step >= 2 ? 'active' : ''}"></div>
            <div class="step-dot ${this.wizardState.step >= 3 ? 'active' : ''}"></div>
          </div>
        </div>
        ${this.renderStep()}
      </div>
    `;
  }

  private renderStep(): TemplateResult {
    switch (this.wizardState.step) {
      case 1:
        return this.renderStep1();
      case 2:
        return this.renderStep2();
      case 3:
        return this.renderStep3();
      default:
        return html``;
    }
  }

  private renderStep1(): TemplateResult {
    const canPartial = this.stationConfig?.allow_partial_closure !== false;
    const isPartialCompleted = isPartiallyClosedShift(this.activeOpening);
    const isFinal = this.isFinalClosure;

    return html`
      <div class="section-title">Step 1: Configurazione & Contatori</div>
      <p style="color: #64748b; font-size: 0.9rem; margin-bottom: 1.5rem;">
        Turno aperto il:
        <strong>${formatDateTimeSafe(this.activeOpening?.opened_at)}</strong>
      </p>

      ${
        isPartialCompleted
          ? html`
                    <div
                      style="background: #fffbeb; border: 1px solid #fdf2f8; padding: 1rem; border-radius: 12px; margin-bottom: 1.5rem; color: #92400e; display: flex; align-items: center; gap: 0.75rem;"
                    >
                      <i class="fas fa-info-circle fa-lg"></i>
                      <div>
                        <strong>Chiusura Parziale già registrata.</strong><br />
                        È necessario procedere con la chiusura <strong>Finale</strong>.
                      </div>
                    </div>
                  `
          : ''
      }

      <div class="radio-group" style="${isPartialCompleted ? 'display: none;' : ''}">
        ${
          canPartial
            ? html`
                        <div
                          class="radio-option ${this.closureType === 'partial' ? 'active' : ''}"
                          @click=${() => this.selectClosureType('partial')}
                        >
                          <i
                            class="fas fa-clock fa-2x"
                            style="margin-bottom: 0.5rem; display: block;"
                          ></i>
                          <div style="font-weight: 700;">Parziale</div>
                          <div style="font-size: 0.8rem; opacity: 0.8;">
                            Salva incassi senza chiudere il turno
                          </div>
                        </div>
                      `
            : ''
        }
        <div
          class="radio-option ${isFinal ? 'active' : ''}"
          @click=${() => this.selectClosureType('final')}
        >
          <i class="fas fa-flag-checkered fa-2x" style="margin-bottom: 0.5rem; display: block;"></i>
          <div style="font-weight: 700;">Finale</div>
          <div style="font-size: 0.8rem; opacity: 0.8;">Chiude definitivamente il turno</div>
        </div>
      </div>

      ${
        !isFinal
          ? html`
                    <div style="margin-bottom: 1.5rem;">
                      <label
                        style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;"
                      >
                        <input
                          type="checkbox"
                          style="width: auto;"
                          .checked=${this.includeCounters}
                          @change=${(e: Event) => (this.includeCounters = (e.target as HTMLInputElement).checked)}
                        />
                        Inserisci Numeratori Pistole (Opzionale)
                      </label>
                    </div>
                  `
          : ''
      }
      ${
        this.shouldSubmitCounters
          ? html`
                    <div class="form-grid">
                      ${this.islands.map(
                        island => html`
                        <div
                          style="grid-column: 1 / -1; font-weight: 700; color: #64748b; font-size: 0.85rem; text-transform: uppercase; margin-top: 1rem;"
                        >
                          ${island.nome}
                        </div>
                        ${this.pistole
                          .filter(p => p.island_id === island.island_id)
                          .map(
                            p => html`
                              <div class="input-card">
                                <div
                                  style="display: flex; justify-content: space-between; margin-bottom: 1rem;"
                                >
                                  <span style="font-weight: 700; color: #0A2342;">${p.nome}</span>
                                  <span
                                    class="badge"
                                    style="background: #f1f5f9; color: #475569; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem;"
                                    >${p.tipo_carburante}</span
                                  >
                                </div>
                                <div
                                  style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;"
                                >
                                  <div>
                                    <label>Apertura</label>
                                    <div
                                      style="font-weight: 700; color: #94a3b8; font-size: 1.1rem;"
                                    >
                                      ${this.openingCounters[p.id]?.toFixed(2) || '0.00'}
                                    </div>
                                  </div>
                                  <div>
                                    <label>Chiusura</label
                                    ><input
                                      type="number"
                                      name="counter_${p.id}"
                                      step="0.01"
                                      min="${Math.max(
                                        this.openingCounters[p.id] ?? 0,
                                        this.finalCounters[p.id] ?? this.openingCounters[p.id] ?? 0
                                      )}"
                                      .value=${this.finalCounters[p.id] ?? ''}
                                    />
                                  </div>
                                </div>
                              </div>
                            `
                          )}
                      `
                      )}
                    </div>
                  `
          : ''
      }

      <div class="btn-group">
        <button class="btn btn-secondary" @click=${() => this.emit('cancel')}>Annulla</button>
        <button class="btn btn-primary" @click=${this.handleStep1Submit}>
          Avanti <i class="fas fa-arrow-right"></i>
        </button>
      </div>
    `;
  }

  private handleStep1Submit(): void {
    if (this.shouldSubmitCounters) {
      const inputs = this.renderRoot.querySelectorAll('input[name^="counter_"]');
      const counters: Record<number, number> = {};
      for (const input of Array.from(inputs) as HTMLInputElement[]) {
        if (!input.value) {
          handleError(
            new AppError('Inserisci tutti i contatori', 'VALIDATION_ERROR'),
            'ClosureWizard.handleStep1Submit'
          );
          input.focus();
          return;
        }
        const pId = Number(input.name.replace('counter_', ''));
        const closingCounter = Number(input.value);
        if (!Number.isFinite(pId) || !Number.isFinite(closingCounter)) {
          handleError(
            new AppError('Inserisci un contatore valido', 'VALIDATION_ERROR'),
            'ClosureWizard.handleStep1Submit'
          );
          input.focus();
          return;
        }
        // eslint-disable-next-line security/detect-object-injection -- pId is a finite numeric id parsed from a controlled input name.
        const openingCounter = this.openingCounters[pId] ?? 0;
        // eslint-disable-next-line security/detect-object-injection -- pId is a finite numeric id parsed from a controlled input name.
        const previousClosingCounter = this.finalCounters[pId] ?? openingCounter;
        if (closingCounter < Math.max(openingCounter, previousClosingCounter)) {
          handleError(
            new AppError(
              'Il contatore di chiusura non può essere inferiore all’ultimo valore registrato',
              'VALIDATION_ERROR'
            ),
            'ClosureWizard.handleStep1Submit'
          );
          input.focus();
          return;
        }
        // eslint-disable-next-line security/detect-object-injection -- pId is a numeric id parsed from a controlled input name, written to a fresh local record
        counters[pId] = closingCounter;
      }
      this.finalCounters = counters;
      let bLitri = 0,
        gLitri = 0;
      this.pistole.forEach(p => {
        const diff = (this.finalCounters[p.id] || 0) - (this.openingCounters[p.id] || 0);
        if (p.tipo_carburante === 'benzina') {
          bLitri += Math.max(0, diff);
        }
        if (p.tipo_carburante === 'gasolio') {
          gLitri += Math.max(0, diff);
        }
      });
      this.totalLitriBenzina = bLitri;
      this.totalLitriGasolio = gLitri;
      this.ricavoTeorico =
        bLitri * (this.prezzi?.prezzo_benzina || 0) + gLitri * (this.prezzi?.prezzo_gasolio || 0);
    }
    this.wizardState = { ...this.wizardState, step: 2 };
  }

  private renderStep2(): TemplateResult {
    return html`
      <div class="section-title">Step 2: Dati Incasso</div>
      <div style="background: #f0f9ff; padding: 1.5rem; border-radius: 16px; margin-bottom: 2rem;">
        <h3 style="margin-top:0; color: #0369a1;">Scontrino Self</h3>
        <div class="form-grid">
          <div class="input-card">
            <label>Incassate (€)</label
            ><input
              type="number"
              .value=${this.selfCashIn}
              @input=${(e: Event) => (this.selfCashIn = (e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="input-card">
            <label>Erogate (€)</label
            ><input
              type="number"
              .value=${this.selfCashOut}
              @input=${(e: Event) => (this.selfCashOut = (e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="input-card">
            <label>Bancomat (€)</label
            ><input
              type="number"
              .value=${this.selfPos}
              @input=${(e: Event) => (this.selfPos = (e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="input-card">
            <label>UTA/DKV (€)</label
            ><input
              type="number"
              .value=${this.selfFleet}
              @input=${(e: Event) => (this.selfFleet = (e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="input-card" style="grid-column: 1 / -1;">
            <label>ID Gestore (€)</label
            ><input
              type="number"
              .value=${this.selfManager}
              @input=${(e: Event) => (this.selfManager = (e.target as HTMLInputElement).value)}
            />
          </div>
        </div>
      </div>
      <div style="background: #fdf2f8; padding: 1.5rem; border-radius: 16px;">
        <h3 style="margin-top:0; color: #9d174d;">Operatore</h3>
        <div class="form-grid">
          <div class="input-card">
            <label>Contanti Reali (€)</label
            ><input
              type="number"
              .value=${this.operatorCash}
              @input=${(e: Event) => (this.operatorCash = (e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="input-card">
            <label>POS (€)</label
            ><input
              type="number"
              .value=${this.operatorPos}
              @input=${(e: Event) => (this.operatorPos = (e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="input-card" style="grid-column: 1 / -1;">
            <label>UTA/DKV Manuale (€)</label
            ><input
              type="number"
              .value=${this.operatorUta}
              @input=${(e: Event) => (this.operatorUta = (e.target as HTMLInputElement).value)}
            />
          </div>
        </div>
      </div>
      <div class="btn-group">
        <button
          class="btn btn-secondary"
          @click=${() => (this.wizardState = { ...this.wizardState, step: 1 })}
        >
          Indietro
        </button>
        <button class="btn btn-primary" @click=${this.handleStep2Submit}>Avanti</button>
      </div>
    `;
  }

  private handleStep2Submit(): void {
    if (!this.operatorCash || !this.operatorPos) {
      handleError(
        new AppError('Inserisci i dati reali', 'VALIDATION_ERROR'),
        'ClosureWizard.handleStep2Submit'
      );
      return;
    }
    this.wizardState = { ...this.wizardState, step: 3 };
  }

  private renderStep3(): TemplateResult {
    const totalIncassi = this.calculateTotalIncasso();
    // Senza contatori il teorico non è calcolabile (resta 0): la "discrepanza"
    // sarebbe l'intero incasso e il warning scatterebbe sempre (#255).
    const hasTeorico = this.shouldSubmitCounters;
    const discrepancy = totalIncassi - this.ricavoTeorico;
    const absDiscrepancy = Math.abs(discrepancy);
    const isWarning = hasTeorico && absDiscrepancy > this.businessRules.cash_error_threshold;
    const isCritical = hasTeorico && absDiscrepancy > this.businessRules.critical_discrepancy_alert;

    if (this.wizardState.mode === 'submitting') {
      return html`<div style="text-align:center; padding: 3rem;">
        <i class="fas fa-spinner fa-spin fa-3x mb-4"></i>
        <p>Salvataggio...</p>
      </div>`;
    }
    return html`
      <div class="section-title">Step 3: Conferma</div>

      ${
        isWarning
          ? html`
                    <div
                      style="background: ${isCritical ? '#fef2f2' : '#fffbeb'}; border: 1px solid ${isCritical ? '#fecaca' : '#fef3c7'}; padding: 1rem; border-radius: 12px; margin-bottom: 1.5rem; color: ${isCritical ? '#991b1b' : '#92400e'}; display: flex; align-items: center; gap: 0.75rem;"
                    >
                      <i
                        class="fas ${isCritical ? 'fa-exclamation-circle' : 'fa-exclamation-triangle'} fa-lg"
                      ></i>
                      <div>
                        <strong>Attenzione: Discrepanza Rilevata</strong><br />
                        La differenza di ${formatEuro(discrepancy)} supera la soglia consentita di
                        ${formatEuro(this.businessRules.cash_error_threshold)}.
                      </div>
                    </div>
                  `
          : ''
      }

      <div
        style="background: #f8fafc; padding: 1.5rem; border-radius: 16px; margin-bottom: 2rem; border: 1px solid #e2e8f0;"
      >
        ${
          hasTeorico
            ? html`<div style="display: flex; justify-content: space-between; margin-bottom: 1rem;">
              <span>Teorico:</span><strong>${formatEuro(this.ricavoTeorico)}</strong>
            </div>`
            : ''
        }
        <div style="display: flex; justify-content: space-between; margin-bottom: 1rem;">
          <span>Reale:</span><strong>${formatEuro(totalIncassi)}</strong>
        </div>
        ${
          hasTeorico
            ? html`<div style="display: flex; justify-content: space-between; font-size: 1.25rem;">
              <span>Differenza:</span
              ><strong
                style="color: ${!isWarning ? '#059669' : isCritical ? '#dc2626' : '#d97706'};"
                >${formatEuro(discrepancy)}</strong
              >
            </div>`
            : ''
        }
      </div>
      <div class="btn-group">
        <button
          class="btn btn-secondary"
          @click=${() => (this.wizardState = { ...this.wizardState, step: 2 })}
        >
          Indietro
        </button>
        <button class="btn btn-primary" @click=${this.handleConfirmClosure}>
          Conferma & Salva
        </button>
      </div>
    `;
  }

  private async handleConfirmClosure(): Promise<void> {
    this.wizardState = { ...this.wizardState, mode: 'submitting' };

    const isFinal = this.isFinalClosure;
    const includeCounters = isFinal || this.includeCounters;
    const totalIncasso = this.calculateTotalIncasso();
    const dataJson = {
      litri_benzina: this.totalLitriBenzina,
      litri_gasolio: this.totalLitriGasolio,
      prezzo_benzina: this.prezzi?.prezzo_benzina || 0,
      prezzo_gasolio: this.prezzi?.prezzo_gasolio || 0,
      ricavo_teorico: this.ricavoTeorico,
      incasso_reale: totalIncasso,
      closure_stage: isFinal ? 'final' : 'partial',
      scontrino_self: {
        banconote_incassate: Number(this.selfCashIn),
        banconote_erogate: Number(this.selfCashOut),
        bancomat_erogati: Number(this.selfPos),
        transazioni_uta: Number(this.selfFleet),
        id_gestore: Number(this.selfManager)
      },
      dettaglio_incasso: {
        contanti_operatore: Number(this.operatorCash),
        pos_operatore: Number(this.operatorPos),
        uta_dkv_operatore: Number(this.operatorUta)
      },
      discrepanza: totalIncasso - this.ricavoTeorico,
      is_final: isFinal
    };

    if (!this.activeOpening) {
      handleError(
        new AppError('Nessun turno aperto selezionato', 'VALIDATION_ERROR'),
        'ClosureWizard'
      );
      this.wizardState = { ...this.wizardState, mode: 'form', step: 3 };
      return;
    }

    const activeOpening = this.activeOpening;
    const activeOpeningId = Number(activeOpening.id);

    // Check if offline - queue action for later sync
    if (isOffline()) {
      try {
        await queueAction('shift_close', {
          shiftId: activeOpeningId,
          stationId: this.numericStationId,
          closingData: dataJson,
          isFinal,
          finalCounters: includeCounters ? this.finalCounters : null
        });
        Toast.show('Chiusura salvata. Verrà sincronizzata quando online.', 'info');
        setTimeout(() => window.location.reload(), 2000);
      } catch (err) {
        logger.error('ClosureWizard', 'Impossibile salvare la chiusura offline', err);
        handleError(
          new AppError('Impossibile salvare la chiusura offline', 'OFFLINE_QUEUE_ERROR', err),
          'ClosureWizard'
        );
        this.wizardState = { ...this.wizardState, mode: 'form', step: 3 };
      }
      return;
    }

    try {
      const closingDataJson: Json = dataJson;
      const finalCountersJson: Json = includeCounters ? this.finalCounters : null;
      const requestId = `closure_${activeOpeningId}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const { data: res, error } = await supabase.rpc('submit_shift_closure', {
        p_shift_id: activeOpeningId,
        p_station_id: this.numericStationId,
        p_closing_data: closingDataJson,
        p_is_final: isFinal,
        p_final_counters: finalCountersJson,
        p_tank_usage: [],
        p_request_id: requestId
      });
      if (error || (res && isRpcResult(res) && !res.success)) {
        throw new Error(error?.message || getRpcError(res) || 'Errore durante la chiusura');
      }
      Toast.show('Chiusura completata!', 'success');
      setTimeout(() => window.location.reload(), 2000);
    } catch (error: unknown) {
      handleError(
        new AppError(getErrorMessage(error), 'SHIFT_CLOSURE_ERROR', error),
        'ClosureWizard'
      );
      this.wizardState = { ...this.wizardState, mode: 'form', step: 3 };
    }
  }

  private renderLoading(): TemplateResult {
    return html`<div class="wizard-container" style="text-align: center; padding: 4rem;">
      <i class="fas fa-spinner fa-spin fa-3x" style="color: #0A2342; margin-bottom: 1rem;"></i>
      <p>Caricamento...</p>
    </div>`;
  }
  private renderError(): TemplateResult {
    return html`<div class="wizard-container" style="text-align: center; color: #b91c1c;">
      <i class="fas fa-exclamation-triangle fa-4x mb-4"></i>
      <h2>Errore</h2>
      <p>${this.wizardState.errorMessage}</p>
      <button class="btn btn-primary mt-4" @click=${this.loadInitialData}>Riprova</button>
    </div>`;
  }
}

if (!customElements.get('closure-wizard')) {
  customElements.define('closure-wizard', ClosureWizard);
}
