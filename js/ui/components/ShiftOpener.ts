import { html, css, CSSResultGroup, TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';

import { supabase } from '../../core/api.js';
import { logger } from '../../core/logger.js';
import { handleError } from '../../shared/error-handler.js';
import { Pistola, Tank, Island } from '../../types.js';

import { BaseComponent } from './BaseComponent.js';

interface ShiftOpenerState {
  mode: 'loading' | 'form' | 'submitting' | 'success' | 'error';
  errorMessage: string;
}

export class ShiftOpener extends BaseComponent {
  @property({ type: String }) stationId: string = '';

  @state() private state: ShiftOpenerState = {
    mode: 'loading',
    errorMessage: ''
  };

  @state() private islands: Island[] = [];
  @state() private pistole: Pistola[] = [];
  @state() private tanks: Tank[] = [];
  @state() private lastCounters: Record<number, number | null> = {};

  private get numericStationId(): number {
    const value = Number(this.stationId);
    if (!Number.isFinite(value) || value <= 0) {
      return NaN;
    }
    return value;
  }

  static override styles: CSSResultGroup = [
    BaseComponent.styles,
    css`
      :host {
        display: block;
        max-width: 800px;
        margin: 0 auto;
        font-family: 'Inter', sans-serif;
      }

      .opener-container {
        padding: 1.5rem;
        background: white;
        border-radius: 16px;
        animation: fadeIn 0.3s ease;
      }

      .form-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1.5rem;
        margin-top: 1.5rem;
      }

      @media (max-width: 600px) {
        .form-grid {
          grid-template-columns: 1fr;
        }
      }

      .input-group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      label {
        font-weight: 600;
        color: #1e293b;
        font-size: 0.95rem;
      }

      input,
      textarea {
        padding: 0.75rem 1rem;
        border: 2px solid #e2e8f0;
        border-radius: 10px;
        font-size: 1rem;
        transition: all 0.2s;
      }

      input:focus,
      textarea:focus {
        outline: none;
        border-color: #0a2342;
        box-shadow: 0 0 0 4px rgba(10, 35, 66, 0.08);
      }

      .section-title {
        grid-column: 1 / -1;
        font-size: 1.1rem;
        font-weight: 700;
        color: #0a2342;
        border-bottom: 2px solid #f1f5f9;
        padding-bottom: 0.5rem;
        margin-top: 1rem;
      }

      .btn-group {
        grid-column: 1 / -1;
        display: flex;
        gap: 1rem;
        margin-top: 2rem;
      }

      .btn {
        flex: 1;
        padding: 1rem;
        border-radius: 12px;
        font-weight: 700;
        font-size: 1.1rem;
        cursor: pointer;
        transition: all 0.2s;
        border: none;
      }

      .btn-primary {
        background: #8dc63f;
        color: white;
      }

      .btn-primary:hover {
        background: #7bb535;
        transform: translateY(-2px);
      }

      .btn-secondary {
        background: #f1f5f9;
        color: #475569;
      }

      .btn-secondary:hover {
        background: #e2e8f0;
      }

      .big-input {
        padding: 1rem !important;
        font-size: 1.25rem !important;
        font-weight: 700 !important;
        color: #0a2342 !important;
      }

      .loading-spinner {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 4rem;
        gap: 1rem;
        color: #64748b;
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
    `
  ];

  protected override firstUpdated(): void {
    this.loadInitialData();
  }

  private async loadInitialData(): Promise<void> {
    const stationId = this.numericStationId;
    if (Number.isNaN(stationId)) {
      this.state = {
        mode: 'error',
        errorMessage: 'ID stazione non valido. Ricarica la pagina o seleziona una stazione.'
      };
      return;
    }

    try {
      // 1. Parallel fetch of core station data
      const [islandsRes, tanksRes] = await Promise.all([
        supabase
          .from('islands')
          .select('island_id, nome, island_name')
          .eq('station_id', stationId)
          .order('island_id'),
        supabase.from('tanks').select('*').eq('station_id', stationId).order('name')
      ]);

      if (islandsRes.error) {
        throw islandsRes.error;
      }
      if (tanksRes.error) {
        throw tanksRes.error;
      }

      const islandsData = islandsRes.data.map(
        (i: { island_id?: number; nome?: string; island_name?: string }, idx: number) => ({
          island_id: i.island_id ?? idx + 1,
          nome: i.nome ?? i.island_name ?? `Isola ${idx + 1}`,
          station_id: stationId
        })
      ) as unknown as Island[];

      const tanksData = (tanksRes.data || []) as unknown as Tank[];

      // 2. Fetch all pistols for these islands
      const islandIds = islandsData.map(i => i.island_id);
      const { data: pistoleData, error: pError } = await supabase
        .from('pistole')
        .select('*, islands(nome)')
        .in('island_id', islandIds)
        .order('id');

      if (pError) {
        throw pError;
      }

      const pistoleList = (pistoleData || []) as unknown as Pistola[];

      // 3. Fetch smart counters (last closure values) from the dedicated RPC.
      // This replaces the previous client-side deduplication over all historical
      // shift_pistols rows and returns exactly one row per configured pump.
      const { data: newCounters, error: countersErr } = await supabase.rpc(
        'get_last_pump_counters',
        { p_station_id: stationId }
      );

      if (countersErr) {
        throw countersErr;
      }

      const counters: Record<number, number | null> = {};
      const counterRows = Array.isArray(newCounters) ? newCounters : [];
      pistoleList.forEach(p => {
        // The current counter includes any explicit admin correction. Historical
        // data is only a compatibility fallback for rows without a base value.
        const lastShift = counterRows.find(c => c.pistola_id === p.id);

        counters[p.id] = p.numero_litri ?? lastShift?.closed_at_counter ?? null;
      });

      // Batch all property and state updates into a single render cycle
      this.islands = islandsData;
      this.tanks = tanksData;
      this.pistole = pistoleList;
      this.lastCounters = counters;
      this.state = { mode: 'form', errorMessage: '' };
    } catch (error: unknown) {
      logger.error('Error loading ShiftOpener data:', error);
      this.state = {
        mode: 'error',
        errorMessage:
          error instanceof Error ? error.message : 'Errore imprevisto durante il caricamento'
      };
    }
  }

  override render(): TemplateResult {
    switch (this.state.mode) {
      case 'loading':
        return html`
          <div class="opener-container">
            <div class="loading-spinner">
              <i class="fas fa-spinner fa-spin fa-3x"></i>
              <p>Preparazione turno in corso...</p>
            </div>
          </div>
        `;

      case 'submitting':
        return html`
          <div class="opener-container">
            <div class="loading-spinner">
              <i class="fas fa-spinner fa-spin fa-3x"></i>
              <p>Apertura turno in corso...</p>
            </div>
          </div>
        `;

      case 'form':
        return this.renderForm();

      case 'error':
        return html`
          <div class="opener-container">
            <div style="text-align: center; padding: 2rem; color: #c53030;">
              <i class="fas fa-exclamation-circle fa-4x" style="margin-bottom: 1rem;"></i>
              <h2>Errore di Caricamento</h2>
              <p>${this.state.errorMessage}</p>
              <button
                class="btn btn-secondary"
                style="margin-top: 1.5rem;"
                @click=${this.loadInitialData}
              >
                Riprova
              </button>
            </div>
          </div>
        `;

      case 'success':
        return html`
          <div class="opener-container">
            <div style="text-align: center; padding: 2rem;">
              <div
                style="width: 80px; height: 80px; background: #8DC63F; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem auto; color: white;"
              >
                <i class="fas fa-check fa-3x"></i>
              </div>
              <h2 style="color: #0A2342;">Turno Aperto Correttamente!</h2>
              <p style="color: #64748b; margin-bottom: 2rem;">
                Il turno è stato registrato e i contatori sono stati salvati.
              </p>
              <button class="btn btn-primary" @click=${() => window.location.reload()}>
                Vai al Dashboard
              </button>
            </div>
          </div>
        `;

      default:
        return html`<div>Stato sconosciuto: ${this.state.mode}</div>`;
    }
  }

  private async handleFormSubmit(e: Event): Promise<void> {
    e.preventDefault();
    if (this.state.mode === 'submitting') {
      return;
    }

    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);

    this.state = { ...this.state, mode: 'submitting' };

    try {
      const stationId = this.numericStationId;
      if (Number.isNaN(stationId)) {
        throw new Error('ID stazione non valido.');
      }

      const openingData = {
        cash_in: Number(formData.get('cash_in')) || 0,
        cash_out: Number(formData.get('cash_out')) || 0,
        pos_amount: Number(formData.get('pos_amount')) || 0,
        total_amount: Number(formData.get('total_amount')) || 0,
        uta_dkv_iscard: Number(formData.get('uta_dkv_iscard')) || 0,
        cash_in_minus_out:
          (Number(formData.get('cash_in')) || 0) - (Number(formData.get('cash_out')) || 0),
        notes: String(formData.get('notes') ?? '')
      };

      // 2. Save Pistol Counters: preserve missing vs explicit zero
      const pistolCounters: Record<string, number> = {};
      const missingPistols: string[] = [];
      this.pistole.forEach(p => {
        const raw = formData.get(`p_${p.id}`);
        const trimmed = raw === null ? '' : String(raw).trim();
        if (trimmed === '') {
          missingPistols.push(`${p.nome} / ${p.tipo_carburante}`);
          return;
        }
        const value = Number(trimmed);
        if (!Number.isFinite(value) || value < 0) {
          missingPistols.push(`${p.nome} / ${p.tipo_carburante}`);
          return;
        }
        pistolCounters[p.id.toString()] = value;
      });

      if (missingPistols.length > 0) {
        throw new Error(
          `Contatore pistola obbligatorio mancante o non valido per: ${missingPistols.join(', ')}`
        );
      }

      // 3. Save Tank Levels: preserve missing vs explicit zero (issue #319)
      const tankLevels: Record<string, number> = {};
      const missingTanks: string[] = [];
      this.tanks.forEach(t => {
        const raw = formData.get(`tank_${t.id}`);
        const trimmed = raw === null ? '' : String(raw).trim();
        if (trimmed === '') {
          missingTanks.push(t.name);
          return;
        }
        const value = Number(trimmed);
        if (!Number.isFinite(value) || value < 0) {
          missingTanks.push(t.name);
          return;
        }
        tankLevels[t.id.toString()] = value;
      });

      if (missingTanks.length > 0) {
        throw new Error(
          `Livello cisterna obbligatorio mancante o non valido per: ${missingTanks.join(', ')}`
        );
      }

      const requestId = `open_${stationId}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      const { data: res, error: rpcError } = await supabase.rpc('open_shift', {
        p_station_id: stationId,
        p_opening_data: openingData,
        p_pistol_counters: pistolCounters,
        p_tank_levels: tankLevels,
        p_request_id: requestId
      });

      if (rpcError) {
        throw new Error(rpcError.message || 'Errore di connessione al database');
      }

      const resObj = res as {
        success?: boolean;
        error?: string;
        message?: string;
        shift_id?: number;
      } | null;
      if (!resObj || !resObj.success) {
        throw new Error(
          resObj?.message || resObj?.error || "Errore imprevisto durante l'apertura del turno"
        );
      }

      const shift = { id: resObj.shift_id };
      this.state = { ...this.state, mode: 'success' };
      this.emit('success', { shift });
    } catch (error: unknown) {
      handleError(error, 'ShiftOpener.openShift');
      this.state = {
        ...this.state,
        mode: 'form',
        errorMessage: error instanceof Error ? error.message : 'Errore sconosciuto'
      };
    }
  }

  private renderForm(): TemplateResult {
    return html`
      <div class="opener-container">
        <form id="apertura-form" @submit=${this.handleFormSubmit}>
          <div class="form-grid">
            <div class="section-title">Contanti & POS</div>
            <div class="input-group">
              <label>Banconote incassate (€)</label>
              <input type="number" name="cash_in" step="0.01" min="0" placeholder="0.00" />
            </div>
            <div class="input-group">
              <label>Banconote erogate (€)</label>
              <input type="number" name="cash_out" step="0.01" min="0" placeholder="0.00" />
            </div>
            <div class="input-group">
              <label>Bancomat erogati (€)</label>
              <input type="number" name="pos_amount" step="0.01" min="0" placeholder="0.00" />
            </div>
            <div class="input-group">
              <label>Uta/Dkv/Iscard (€)</label>
              <input type="number" name="uta_dkv_iscard" step="0.01" min="0" placeholder="0.00" />
            </div>

            <div class="input-group" style="grid-column: 1 / -1;">
              <label>Totale scontrino (€)</label>
              <input
                type="number"
                name="total_amount"
                step="0.01"
                min="0"
                placeholder="0.00"
                class="big-input"
              />
            </div>

            ${this.islands.map(
              island => html`
                <div
                  class="section-title"
                  style="font-size: 0.95rem; background: #f8fafc; padding: 0.4rem 0.8rem; border-radius: 6px;"
                >
                  ${island.nome}
                </div>
                ${this.pistole
                  .filter(p => p.island_id === island.island_id)
                  .map(
                    p => html`
                                  <div class="input-group">
                                    <label>${p.nome} / ${p.tipo_carburante}</label>
                                    <input
                                      type="number"
                                      name="p_${p.id}"
                                      step="0.01"
                                      min="0"
                                      .value=${this.lastCounters[p.id]?.toString() || ''}
                                      placeholder="0.00"
                                      required
                                    />
                                  </div>
                                `
                  )}
              `
            )}
            ${
              this.tanks.length > 0
                ? html`
                    <div class="section-title">Livelli Cisterne (Litri)</div>
                    ${this.tanks.map(
                      tank => html`
                                    <div class="input-group">
                                      <label>${tank.name} / ${tank.fuel_type}</label>
                                      <input
                                        type="number"
                                        name="tank_${tank.id}"
                                        step="1"
                                        min="0"
                                        placeholder="Litri attuali"
                                        required
                                      />
                                    </div>
                                  `
                    )}
                  `
                : ''
            }

            <div class="section-title">Note & Conferma</div>
            <div class="input-group" style="grid-column: 1 / -1;">
              <label>Annotazioni</label>
              <textarea
                name="notes"
                rows="3"
                placeholder="Eventuali note per questo turno..."
              ></textarea>
            </div>

            <div class="btn-group">
              <button type="button" class="btn btn-secondary" @click=${() => this.emit('cancel')}>
                Annulla
              </button>
              <button type="submit" class="btn btn-primary">Conferma Apertura</button>
            </div>
          </div>
        </form>
      </div>
    `;
  }
}

if (!customElements.get('shift-opener')) {
  customElements.define('shift-opener', ShiftOpener);
}
