import { html, css, CSSResultGroup, TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';

import { supabase } from '../../core/api.js';
import type { Json } from '../../core/api.js';
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
  totals?: {
    total_liters?: number;
    total_fuel_revenue?: number;
    fuel_revenue?: number;
    extra_revenue?: number;
    total_sold?: number;
    total_cash_collected?: number;
    expected_cash?: number;
    discrepancy?: number;
    operator_cash?: number;
    operator_pos?: number;
    operator_fleet?: number;
    self_cash_in?: number;
    self_cash_out?: number;
    self_pos?: number;
    self_fleet?: number;
    self_manager?: number;
  };
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

interface ServerTotals {
  total_liters: number;
  total_fuel_revenue: number;
  fuel_revenue: number;
  extra_revenue: number;
  total_sold: number;
  total_cash_collected: number;
  expected_cash: number;
  discrepancy: number;
  operator_cash: number;
  operator_pos: number;
  operator_fleet: number;
  self_cash_in: number;
  self_cash_out: number;
  self_pos: number;
  self_fleet: number;
  self_manager: number;
}

function emptyServerTotals(): ServerTotals {
  return {
    total_liters: 0,
    total_fuel_revenue: 0,
    fuel_revenue: 0,
    extra_revenue: 0,
    total_sold: 0,
    total_cash_collected: 0,
    expected_cash: 0,
    discrepancy: 0,
    operator_cash: 0,
    operator_pos: 0,
    operator_fleet: 0,
    self_cash_in: 0,
    self_cash_out: 0,
    self_pos: 0,
    self_fleet: 0,
    self_manager: 0
  };
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
  @state() private finalCounters: Record<number, number | null> = {};

  // Data from Step 2
  @state() private selfCashIn: string = '';
  @state() private selfCashOut: string = '';
  @state() private selfPos: string = '';
  @state() private selfFleet: string = '';
  @state() private selfManager: string = '';
  @state() private operatorCash: string = '';
  @state() private operatorPos: string = '';
  @state() private operatorUta: string = '';
  @state() private isLastOperator: boolean = true;

  // Server-computed preview
  @state() private serverTotals: ServerTotals | null = null;
  @state() private previewLoading: boolean = false;

  // UI State
  @state() private canEditClosure: boolean = false;
  @state() private isReverting: boolean = false;
  @state() private isEditingClosure: boolean = false;

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
      .btn-warning {
        background: #fffbeb;
        color: #92400e;
      }

      .btn:hover:not(:disabled) {
        transform: translateY(-2px);
        filter: brightness(0.95);
      }

      .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .preview-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 1rem;
      }

      .preview-row.highlight {
        padding-top: 1rem;
        border-top: 2px solid #e2e8f0;
        font-size: 1.25rem;
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
      this.canEditClosure = this.computeCanEditClosure(activeOpening);

      const shiftId = activeOpening.id;
      if (!shiftId) {
        this.wizardState = { mode: 'error', errorMessage: 'Turno senza ID valido.', step: 1 };
        return;
      }
      const [islandsRes, countersRes] = await Promise.all([
        supabase
          .from('islands')
          .select('island_id, nome, island_name')
          .eq('station_id', this.numericStationId)
          .order('island_id'),
        supabase
          .from('shift_pistols')
          .select('pistola_id, opened_at_counter, closed_at_counter')
          .eq('shift_id', shiftId)
      ]);

      if (islandsRes.error) {
        throw islandsRes.error;
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
      const previousClosingCounters: Record<number, number | null> = {};
      // The generated DB types don't model this legacy column selection (see
      // CLAUDE.md: repo types can lag the live DB), so the row shape is asserted.
      const counters = (countersRes.data || []) as Array<{
        pistola_id: number | string;
        opened_at_counter: number | string;
        closed_at_counter: number | string | null;
      }>;
      counters.forEach(c => {
        const pistolId = Number(c.pistola_id);
        if (!Number.isFinite(pistolId)) {
          return;
        }
        const hasClosedAt = c.closed_at_counter !== null && c.closed_at_counter !== undefined;
        const closedAtVal = hasClosedAt ? Number(c.closed_at_counter) : null;
        const openedAtVal = Number(c.opened_at_counter) || 0;

        // If a partial closure has already been registered (closed_at_counter is present),
        // use closed_at_counter as the starting baseline for the final closure stage.
        const effectiveOpening =
          hasClosedAt && Number.isFinite(closedAtVal) ? (closedAtVal as number) : openedAtVal;

        // eslint-disable-next-line security/detect-object-injection -- pistolId is a finite numeric database id.
        countersMap[pistolId] = effectiveOpening;

        if (this.isEditingClosure && hasClosedAt && Number.isFinite(closedAtVal)) {
          // eslint-disable-next-line security/detect-object-injection -- pistolId is a finite numeric database id.
          previousClosingCounters[pistolId] = closedAtVal;
        } else {
          // eslint-disable-next-line security/detect-object-injection -- pistolId is a finite numeric database id.
          previousClosingCounters[pistolId] = null;
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

  private computeCanEditClosure(shift: Shift | null): boolean {
    if (!shift?.closed_at) {
      return false;
    }
    const closedAt = new Date(shift.closed_at);
    const now = new Date();
    const diffMs = now.getTime() - closedAt.getTime();
    return diffMs >= 0 && diffMs < 60 * 60 * 1000;
  }

  private get litersByPistol(): Record<number, number> {
    const result: Record<number, number> = {};
    this.pistole.forEach(p => {
      const opening = this.openingCounters[p.id] ?? 0;
      const closing = this.finalCounters[p.id];
      if (closing === null || closing === undefined) {
        result[p.id] = 0;
        return;
      }
      result[p.id] = Math.max(0, closing - opening);
    });
    return result;
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
          <h2 style="margin:0; color: #0A2342;">
            ${this.isEditingClosure ? 'Modifica Chiusura Turno' : 'Chiusura Turno'}
          </h2>
          <div class="step-indicator">
            <div class="step-dot ${this.wizardState.step >= 1 ? 'active' : ''}"></div>
            <div class="step-dot ${this.wizardState.step >= 2 ? 'active' : ''}"></div>
            <div class="step-dot ${this.wizardState.step >= 3 ? 'active' : ''}"></div>
          </div>
        </div>
        ${
          this.canEditClosure && !this.isEditingClosure
            ? html`
              <div
                style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 1rem; border-radius: 12px; margin-bottom: 1.5rem; color: #1e40af; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap;"
              >
                <div><i class="fas fa-info-circle fa-lg" style="margin-right: 0.5rem;"></i> Questa
                  chiusura è ancora modificabile (&lt; 1 ora).
                </div>
                <div style="display: flex; gap: 0.5rem;">
                  <button
                    class="btn btn-secondary"
                    style="flex: 0 0 auto;"
                    @click=${() => (this.isEditingClosure = true)}
                  >
                    Modifica chiusura
                  </button>
                  <button
                    class="btn btn-danger"
                    style="flex: 0 0 auto;"
                    ?disabled=${this.isReverting}
                    @click=${this.handleRevertClosure}
                  >
                    ${this.isReverting ? 'Annullamento...' : 'Annulla chiusura'}
                  </button>
                </div>
              </div>
            `
            : ''
        }
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
    const isPartialCompleted = isPartiallyClosedShift(this.activeOpening);
    const liters = this.litersByPistol;

    return html`
      <div class="section-title">Step 1: Contatori Pistole</div>
      <p style="color: #64748b; font-size: 0.9rem; margin-bottom: 1.5rem;">
        Turno aperto il:
        <strong>${formatDateTimeSafe(this.activeOpening?.opened_at)}</strong>
      </p>

      ${
        isPartialCompleted
          ? html`
                    <div
                      style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 1rem; border-radius: 12px; margin-bottom: 1.5rem; color: #1e40af; display: flex; align-items: center; gap: 0.75rem;"
                    >
                      <i class="fas fa-info-circle fa-lg"></i>
                      <div>
                        Sono state registrate chiusure parziali precedenti per questo turno.
                        I contatori di partenza sono aggiornati all'ultima chiusura.
                      </div>
                    </div>
                  `
          : ''
      }

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
                    <div style="display: flex; justify-content: space-between; margin-bottom: 1rem;">
                      <span style="font-weight: 700; color: #0A2342;">${p.nome}</span>
                      <span
                        class="badge"
                        style="background: #f1f5f9; color: #475569; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem;"
                        >${p.tipo_carburante}</span
                      >
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                      <div>
                        <label>Apertura</label>
                        <div style="font-weight: 700; color: #94a3b8; font-size: 1.1rem;">
                          ${this.openingCounters[p.id]?.toFixed(2) || '0.00'}
                        </div>
                      </div>
                      <div>
                        <label>Chiusura</label>
                        <input
                          type="number"
                          name="counter_${p.id}"
                          step="0.01"
                          .value=${this.finalCounters[p.id] ?? ''}
                          @input=${(e: Event) => this.handleCounterInput(p.id, e)}
                        />
                      </div>
                    </div>
                    <div
                      style="margin-top: 0.75rem; text-align: right; font-size: 0.9rem; color: #475569;"
                    >
                      Erogati:
                      <strong style="color: #0A2342;"
                        >${liters[p.id]?.toFixed(2) || '0.00'} L</strong
                      >
                    </div>
                  </div>
                `
              )}
          `
        )}
      </div>

      <div class="btn-group">
        <button class="btn btn-secondary" @click=${() => this.emit('cancel')}>Annulla</button>
        <button class="btn btn-primary" @click=${this.handleStep1Submit}>
          Avanti <i class="fas fa-arrow-right"></i>
        </button>
      </div>
    `;
  }

  private handleCounterInput(pistolId: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const numericValue = value === '' ? null : Number(value);
    if (numericValue !== null && !Number.isFinite(numericValue)) {
      return;
    }
    this.finalCounters = {
      ...this.finalCounters,
      [pistolId]: numericValue
    };
  }

  private handleStep1Submit(): void {
    for (const [pId, closing] of Object.entries(this.finalCounters)) {
      const numericId = Number(pId);
      if (!Number.isFinite(numericId)) {
        continue;
      }
      if (closing === null || closing === undefined) {
        continue;
      }
      // eslint-disable-next-line security/detect-object-injection -- numericId is a finite numeric id parsed from a controlled record key.
      const openingCounter = this.openingCounters[numericId] ?? 0;
      if (closing < openingCounter) {
        handleError(
          new AppError(
            `Il contatore di chiusura non può essere inferiore all'apertura (pistola ${numericId})`,
            'VALIDATION_ERROR'
          ),
          'ClosureWizard.handleStep1Submit'
        );
        const input = this.renderRoot.querySelector(`input[name="counter_${numericId}"]`);
        (input as HTMLInputElement | null)?.focus();
        return;
      }
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
            <label>Incassate (€)</label>
            <input
              type="number"
              .value=${this.selfCashIn}
              @input=${(e: Event) => (this.selfCashIn = (e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="input-card">
            <label>Erogate (€)</label>
            <input
              type="number"
              .value=${this.selfCashOut}
              @input=${(e: Event) => (this.selfCashOut = (e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="input-card">
            <label>Bancomat (€)</label>
            <input
              type="number"
              .value=${this.selfPos}
              @input=${(e: Event) => (this.selfPos = (e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="input-card">
            <label>UTA/DKV (€)</label>
            <input
              type="number"
              .value=${this.selfFleet}
              @input=${(e: Event) => (this.selfFleet = (e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="input-card" style="grid-column: 1 / -1;">
            <label>ID Gestore (€)</label>
            <input
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
            <label>Contanti Reali (€)</label>
            <input
              type="number"
              .value=${this.operatorCash}
              @input=${(e: Event) => (this.operatorCash = (e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="input-card">
            <label>POS (€)</label>
            <input
              type="number"
              .value=${this.operatorPos}
              @input=${(e: Event) => (this.operatorPos = (e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="input-card" style="grid-column: 1 / -1;">
            <label>UTA/DKV Manuale (€)</label>
            <input
              type="number"
              .value=${this.operatorUta}
              @input=${(e: Event) => (this.operatorUta = (e.target as HTMLInputElement).value)}
            />
          </div>
        </div>
      </div>

      ${html`
              <div class="section-title">Tipo di chiusura</div>
              <p style="color: #64748b; font-size: 0.9rem; margin-bottom: 1rem;">
                Stai registrando la fine del tuo turno?
              </p>
              <div class="radio-group">
                <div
                  class="radio-option ${this.isLastOperator ? 'active' : ''}"
                  @click=${() => (this.isLastOperator = true)}
                >
                  <i class="fas fa-flag-checkered fa-2x" style="margin-bottom: 0.5rem; display: block;"></i>
                  <div style="font-weight: 700;">Sì</div>
                </div>
                <div
                  class="radio-option ${!this.isLastOperator ? 'active' : ''}"
                  @click=${() => (this.isLastOperator = false)}
                >
                  <i class="fas fa-clock fa-2x" style="margin-bottom: 0.5rem; display: block;"></i>
                  <div style="font-weight: 700;">No</div>
                </div>
              </div>
            `}

      <div class="btn-group">
        <button
          class="btn btn-secondary"
          @click=${() => (this.wizardState = { ...this.wizardState, step: 1 })}
        >
          Indietro
        </button>
        <button class="btn btn-primary" @click=${this.handleStep2Submit}>
          Avanti <i class="fas fa-arrow-right"></i>
        </button>
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
    // Kick off server preview without blocking the step transition.
    this.fetchServerPreview();
  }

  private async fetchServerPreview(): Promise<void> {
    const payload = this.buildPayload();
    if (!payload) {
      return;
    }
    this.previewLoading = true;
    try {
      const { data, error } = await supabase.rpc('submit_shift_closure_v2', {
        p_shift_id: payload.activeOpeningId,
        p_station_id: this.numericStationId,
        p_final_counters: payload.finalCountersJson,
        p_tank_usage: [],
        p_self_cash_in: payload.selfCashIn,
        p_self_cash_out: payload.selfCashOut,
        p_self_pos: payload.selfPos,
        p_self_fleet: payload.selfFleet,
        p_self_manager: payload.selfManager,
        p_operator_cash: payload.operatorCash,
        p_operator_pos: payload.operatorPos,
        p_operator_fleet: payload.operatorUta,
        p_closure_type: payload.isFinal ? 'final' : 'partial',
        p_preview: true
      });

      if (error) {
        throw error;
      }

      if (isRpcResult(data) && data.totals) {
        this.serverTotals = {
          ...emptyServerTotals(),
          ...data.totals,
          // Map fuel_revenue to total_fuel_revenue for backward compat
          total_fuel_revenue: data.totals.fuel_revenue ?? data.totals.total_fuel_revenue ?? 0
        };
      } else {
        this.serverTotals = null;
      }
    } catch (error: unknown) {
      logger.error('ClosureWizard', 'Server preview failed', error);
      this.serverTotals = null;
    } finally {
      this.previewLoading = false;
    }
  }

  private buildPayload(): {
    activeOpeningId: number;
    finalCountersJson: Json;
    isFinal: boolean;
    selfCashIn: number;
    selfCashOut: number;
    selfPos: number;
    selfFleet: number;
    selfManager: number;
    operatorCash: number;
    operatorPos: number;
    operatorUta: number;
  } | null {
    if (!this.activeOpening) {
      return null;
    }
    const activeOpening = this.activeOpening;
    const activeOpeningId = Number(activeOpening.id);
    if (!Number.isFinite(activeOpeningId)) {
      return null;
    }

    const isFinal = this.isLastOperator;

    // Send raw counters: null means "use opening value" on the server.
    const finalCounters: Record<number, number | null> = {};
    this.pistole.forEach(p => {
      const closing = this.finalCounters[p.id];
      if (closing === null || closing === undefined) {
        finalCounters[p.id] = null;
      } else {
        finalCounters[p.id] = closing;
      }
    });

    return {
      activeOpeningId,
      finalCountersJson: finalCounters as Json,
      isFinal,
      selfCashIn: Number(this.selfCashIn) || 0,
      selfCashOut: Number(this.selfCashOut) || 0,
      selfPos: Number(this.selfPos) || 0,
      selfFleet: Number(this.selfFleet) || 0,
      selfManager: Number(this.selfManager) || 0,
      operatorCash: Number(this.operatorCash) || 0,
      operatorPos: Number(this.operatorPos) || 0,
      operatorUta: Number(this.operatorUta) || 0
    };
  }

  private renderStep3(): TemplateResult {
    const totals = this.serverTotals ?? emptyServerTotals();
    const discrepancy = totals.discrepancy ?? 0;
    const absDiscrepancy = Math.abs(discrepancy);
    const isWarning = absDiscrepancy > 10;
    const isCritical = absDiscrepancy > 50;
    const isFinal = this.isLastOperator;

    if (this.wizardState.mode === 'submitting') {
      return html`<div style="text-align:center; padding: 3rem;">
        <i class="fas fa-spinner fa-spin fa-3x mb-4"></i>
        <p>Salvataggio...</p>
      </div>`;
    }
    return html`
      <div class="section-title">Step 3: Anteprima e Conferma</div>

      ${
        this.previewLoading
          ? html`
            <div
              style="text-align: center; padding: 2rem; color: #475569;"
            >
              <i class="fas fa-spinner fa-spin fa-2x" style="margin-bottom: 0.75rem; display: block;"></i>
              <p>Calcolo anteprima dal server...</p>
            </div>
          `
          : html`
      ${
        !this.serverTotals
          ? html`
                    <div
                      style="background: #fffbeb; border: 1px solid #fef3c7; padding: 1rem; border-radius: 12px; margin-bottom: 1.5rem; color: #92400e; display: flex; align-items: center; gap: 0.75rem;"
                    >
                      <i class="fas fa-info-circle fa-lg"></i>
                      <div>
                        <strong>Anteprima non disponibile.</strong><br />
                        I totali verranno calcolati dal server al momento del salvataggio.
                      </div>
                    </div>
                  `
          : ''
      }

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
                        ${formatEuro(10)}.
                      </div>
                    </div>
                  `
          : ''
      }

      <div
        style="background: #f8fafc; padding: 1.5rem; border-radius: 16px; margin-bottom: 2rem; border: 1px solid #e2e8f0;"
      >
        <div class="preview-row">
          <span>Totale litri:</span><strong>${totals.total_liters.toFixed(2)} L</strong>
        </div>
        <div class="preview-row">
          <span>Ricavo carburante:</span><strong>${formatEuro(totals.total_fuel_revenue)}</strong>
        </div>
        <div class="preview-row">
          <span>Ricavo extra:</span><strong>${formatEuro(totals.extra_revenue)}</strong>
        </div>
        <div class="preview-row highlight">
          <span>Totale venduto:</span><strong>${formatEuro(totals.total_sold)}</strong>
        </div>
        <div class="preview-row">
          <span>Contanti operatore:</span><strong>${formatEuro(totals.operator_cash)}</strong>
        </div>
        <div class="preview-row">
          <span>POS operatore:</span><strong>${formatEuro(totals.operator_pos)}</strong>
        </div>
        <div class="preview-row">
          <span>UTA/DKV operatore:</span><strong>${formatEuro(totals.operator_fleet)}</strong>
        </div>
        <div class="preview-row">
          <span>Self incassate:</span><strong>${formatEuro(totals.self_cash_in)}</strong>
        </div>
        <div class="preview-row">
          <span>Self erogate:</span><strong>${formatEuro(totals.self_cash_out)}</strong>
        </div>
        <div class="preview-row">
          <span>Self Bancomat:</span><strong>${formatEuro(totals.self_pos)}</strong>
        </div>
        <div class="preview-row">
          <span>Self UTA/DKV:</span><strong>${formatEuro(totals.self_fleet)}</strong>
        </div>
        <div class="preview-row">
          <span>ID Gestore:</span><strong>${formatEuro(totals.self_manager)}</strong>
        </div>
        <div class="preview-row highlight">
          <span>Contante atteso:</span><strong>${formatEuro(totals.expected_cash)}</strong>
        </div>
        <div class="preview-row highlight">
          <span>Discrepanza:</span>
          <strong style="color: ${!isWarning ? '#059669' : isCritical ? '#dc2626' : '#d97706'};">
            ${discrepancy > 0 ? '+' : ''}${formatEuro(discrepancy)}</strong
          >
        </div>
      </div>

      ${
        isFinal
          ? html`
              <div
                style="background: #fef2f2; border: 1px solid #fecaca; padding: 1rem; border-radius: 12px; margin-bottom: 1.5rem; color: #991b1b; display: flex; align-items: center; gap: 0.75rem;"
              >
                <i class="fas fa-exclamation-triangle fa-lg"></i>
                <div>
                  <strong>Chiusura Finale</strong><br />
                  Questa è l'ultima chiusura della giornata. Il distributore resterà senza turno
                  aperto fino all'apertura di domani mattina.
                </div>
              </div>
            `
          : ''
      }

      ${
        this.isEditingClosure
          ? html`
              <div class="btn-group">
                <button
                  class="btn btn-secondary"
                  @click=${() => (this.wizardState = { ...this.wizardState, step: 2 })}
                >
                  Indietro
                </button>
                <button class="btn btn-warning" @click=${this.handleConfirmClosure}>
                  Salva modifiche
                </button>
              </div>
            `
          : html`
              <div class="btn-group">
                <button
                  class="btn btn-secondary"
                  @click=${() => (this.wizardState = { ...this.wizardState, step: 2 })}
                >
                  Modifica dati
                </button>
                <button class="btn btn-primary" @click=${this.handleConfirmClosure}>
                  Conferma & Salva
                </button>
              </div>
            `
      }
    `
      }
    `;
  }

  private async handleConfirmClosure(): Promise<void> {
    const payload = this.buildPayload();
    if (!payload) {
      handleError(
        new AppError('Nessun turno aperto selezionato', 'VALIDATION_ERROR'),
        'ClosureWizard'
      );
      this.wizardState = { ...this.wizardState, mode: 'form', step: 3 };
      return;
    }

    const isFinal = payload.isFinal;
    if (isFinal) {
      const confirmFinal = window.confirm(
        "Questa è l'ultima chiusura della giornata. Il distributore resterà senza turno aperto fino all'apertura di domani mattina. Confermi?"
      );
      if (!confirmFinal) {
        return;
      }
    }

    this.wizardState = { ...this.wizardState, mode: 'submitting' };

    const {
      activeOpeningId,
      finalCountersJson,
      selfCashIn,
      selfCashOut,
      selfPos,
      selfFleet,
      selfManager,
      operatorCash,
      operatorPos,
      operatorUta
    } = payload;

    // Check if offline - queue action for later sync
    if (isOffline()) {
      try {
        await queueAction('shift_close', {
          shiftId: activeOpeningId,
          stationId: this.numericStationId,
          isFinal,
          finalCounters: finalCountersJson,
          selfCashIn,
          selfCashOut,
          selfPos,
          selfFleet,
          selfManager,
          operatorCash,
          operatorPos,
          operatorUta
        });
        Toast.show('Chiusura salvata. Verra sincronizzata quando online.', 'info');
        window.location.hash = '';
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
      const requestId = `closure_${activeOpeningId}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const { data: res, error } = await supabase.rpc('submit_shift_closure_v2', {
        p_shift_id: activeOpeningId,
        p_station_id: this.numericStationId,
        p_request_id: requestId,
        p_final_counters: finalCountersJson,
        p_tank_usage: [],
        p_self_cash_in: selfCashIn,
        p_self_cash_out: selfCashOut,
        p_self_pos: selfPos,
        p_self_fleet: selfFleet,
        p_self_manager: selfManager,
        p_operator_cash: operatorCash,
        p_operator_pos: operatorPos,
        p_operator_fleet: operatorUta,
        p_closure_type: isFinal ? 'final' : 'partial',
        p_preview: false
      });
      if (error || (res && isRpcResult(res) && !res.success)) {
        throw new Error(error?.message || getRpcError(res) || 'Errore durante la chiusura');
      }
      Toast.show(
        this.isEditingClosure ? 'Modifica della chiusura completata!' : 'Chiusura completata!',
        'success'
      );
      window.location.hash = '';
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

  async handleRevertClosure(): Promise<void> {
    if (!this.activeOpening) {
      return;
    }
    const shiftId = Number(this.activeOpening.id);
    if (!Number.isFinite(shiftId)) {
      return;
    }

    const confirmed = window.confirm(
      'Vuoi annullare questa chiusura e riaprire il turno? I contatori verranno ripristinati ai valori di apertura.'
    );
    if (!confirmed) {
      return;
    }

    this.isReverting = true;
    try {
      const { data, error } = await supabase.rpc('revert_last_closure', {
        p_shift_id: shiftId,
        p_station_id: this.numericStationId
      });
      if (error) {
        throw error;
      }
      if (isRpcResult(data) && !data.success) {
        throw new Error(getRpcError(data) || "Errore durante l'annullamento");
      }
      Toast.show('Chiusura annullata. Il turno è stato riaperto.', 'success');
      window.location.hash = '';
      setTimeout(() => window.location.reload(), 2000);
    } catch (error: unknown) {
      handleError(
        new AppError(getErrorMessage(error), 'REVERT_CLOSURE_ERROR', error),
        'ClosureWizard.handleRevertClosure'
      );
    } finally {
      this.isReverting = false;
    }
  }
}

if (!customElements.get('closure-wizard')) {
  customElements.define('closure-wizard', ClosureWizard);
}
