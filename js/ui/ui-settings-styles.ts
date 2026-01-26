export const UI_SETTINGS_STYLES = `
    /* Container principale - Layout a Griglia */
    .ui-appearance-panel {
      display: grid;
      grid-template-columns: 260px 1fr; /* Sidebar fissa + Contenuto fluido */
      grid-template-rows: auto 1fr;
      gap: 24px;
      align-items: start;
    }

    /* Header - Full Width */
    .ui-header-box {
      grid-column: 1 / -1;
      background: var(--bg-surface);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-md);
      padding: 24px 28px;
      border: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .ui-header-title {
      margin: 0 0 4px 0;
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--primary-color);
    }
    .ui-header-desc {
      margin: 0;
      color: var(--text-secondary);
      font-size: 0.95rem;
      line-height: 1.5;
    }

    /* Sezioni Contenuto */
    .ui-section-box {
      background: var(--bg-surface);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-md);
      padding: 32px;
      border: 1px solid var(--border-color);
      margin-bottom: 24px;
      animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .ui-section-title {
      margin: 0 0 24px 0;
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--primary-color);
      display: flex;
      align-items: center;
      gap: 12px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border-color);
    }
    .ui-section-title i {
      color: var(--accent-color);
      background: rgba(var(--accent-rgb, 141, 198, 63), 0.1);
      padding: 8px;
      border-radius: 8px;
      font-size: 1.1rem;
    }

    /* Griglia colori */
    .ui-colors-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 24px;
    }

    /* Campo colore */
    .ui-color-field {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      background: var(--bg-body);
      transition: border-color 0.2s;
    }
    .ui-color-field:hover {
      border-color: var(--accent-color);
    }
    .ui-color-label {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .ui-color-label-text {
      font-weight: 600;
      color: var(--text-main);
      font-size: 0.95rem;
    }
    .ui-color-label-desc {
      color: var(--text-secondary);
      font-size: 0.85rem;
      line-height: 1.4;
    }
    .ui-color-controls {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .ui-color-picker {
      width: 48px;
      height: 48px;
      border: 2px solid var(--border-color);
      border-radius: 50%; /* Circolare */
      cursor: pointer;
      flex-shrink: 0;
      padding: 0;
      background: transparent;
      overflow: hidden;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .ui-color-picker:hover {
      transform: scale(1.1);
      box-shadow: var(--shadow-sm);
      border-color: var(--accent-color);
    }
    .ui-color-picker::-webkit-color-swatch-wrapper {
      padding: 0;
    }
    .ui-color-picker::-webkit-color-swatch {
      border: none;
      border-radius: 50%;
    }
    .ui-color-hex {
      flex: 1;
      min-width: 0;
      padding: 10px 14px;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      font-family: 'Courier New', monospace;
      font-size: 0.9rem;
      font-weight: 600;
      text-transform: uppercase;
      background: var(--bg-surface);
      color: var(--text-main);
      transition: all 0.2s ease;
    }
    .ui-color-hex:focus {
      outline: none;
      border-color: var(--primary-color);
      box-shadow: 0 0 0 3px rgba(10, 35, 66, 0.1);
    }

    /* Griglia tipografia */
    .ui-typography-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 24px;
    }

    /* Campi testo */
    .ui-text-fields-wrapper {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .ui-text-field {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .ui-text-label {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .ui-text-label span {
      font-weight: 600;
      color: var(--text-main);
      font-size: 0.95rem;
    }
    .ui-text-label small {
      color: var(--text-secondary);
      font-size: 0.85rem;
      line-height: 1.4;
    }
    .ui-text-input {
      width: 100%;
      padding: 12px 16px;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      font-size: 0.95rem;
      transition: all 0.2s ease;
      background: var(--bg-surface);
      color: var(--text-main);
      font-family: inherit;
    }
    .ui-text-input:focus {
      outline: none;
      border-color: var(--primary-color);
      box-shadow: 0 0 0 3px rgba(10, 35, 66, 0.1);
    }

    /* Box azioni */
    .ui-actions-box {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
      box-shadow: var(--shadow-md);
      position: sticky;
      bottom: 20px;
      z-index: 10;
    }
    .ui-actions-info {
      margin: 0;
      color: var(--text-secondary);
      font-size: 0.9rem;
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
      min-width: 200px;
    }
    .ui-actions-info i {
      color: var(--accent-color);
      font-size: 1.1rem;
    }
    .ui-actions-buttons {
      display: flex;
      gap: 12px;
    }

    /* Form pending */
    .ui-appearance-form.pending {
      opacity: 0.6;
      pointer-events: none;
      filter: grayscale(0.5);
    }

    /* Messaggio successo */
    .ui-success-message {
      background: #dcfce7;
      color: #166534;
      border: 1px solid #bbf7d0;
      padding: 16px 20px;
      border-radius: var(--radius-md);
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 600;
      box-shadow: var(--shadow-sm);
      animation: slideIn 0.3s ease;
    }
    .ui-success-message i {
      font-size: 1.2rem;
    }
    @keyframes slideIn {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* ============================================
       SIDEBAR TABS (Nuovo Layout)
       ============================================ */
    .ui-appearance-tabs {
      grid-column: 1;
      grid-row: 2;
      display: flex;
      flex-direction: column;
      gap: 6px;
      background: var(--bg-surface);
      padding: 16px;
      border-radius: var(--radius-lg);
      border: 1px solid var(--border-color);
      box-shadow: var(--shadow-sm);
      position: sticky;
      top: 20px;
      max-height: calc(100vh - 40px);
      overflow-y: auto;
    }

    .ui-appearance-tab {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      border: 1px solid transparent;
      background: transparent;
      color: var(--text-secondary);
      font-weight: 500;
      font-size: 0.95rem;
      cursor: pointer;
      border-radius: var(--radius-md);
      transition: all 0.2s ease;
      text-align: left;
      width: 100%;
    }

    .ui-appearance-tab:hover {
      color: var(--primary-color);
      background: var(--bg-body);
    }

    .ui-appearance-tab.active {
      color: var(--primary-color);
      background: var(--bg-body);
      border-color: var(--border-color);
      border-left: 4px solid var(--accent-color);
      font-weight: 600;
      box-shadow: var(--shadow-sm);
    }

    .ui-appearance-tab i {
      font-size: 1.1rem;
      width: 20px;
      text-align: center;
    }

    /* Form Content Area */
    .ui-appearance-form {
      grid-column: 2;
      grid-row: 2;
      min-width: 0;
    }

    .ui-appearance-section {
      display: none;
    }

    .ui-appearance-section.active {
      display: block;
    }

    /* Layout fields styles */
    .ui-layout-fields {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .ui-layout-field {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 16px;
      background: var(--bg-body);
      border-radius: var(--radius-md);
      border: 1px solid transparent;
    }
    .ui-layout-field:hover {
      border-color: var(--border-color);
    }

    .ui-checkbox-label {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      cursor: pointer;
      padding: 12px;
      border-radius: var(--radius-md);
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      transition: all 0.2s ease;
    }

    .ui-checkbox-label:hover {
      border-color: var(--primary-color);
    }

    .ui-checkbox-label input[type="checkbox"] {
      width: 20px;
      height: 20px;
      margin-top: 2px;
      cursor: pointer;
      accent-color: var(--primary-color);
      flex-shrink: 0;
    }

    .ui-checkbox-label-text {
      font-weight: 600;
      color: var(--text-main);
      font-size: 0.95rem;
      flex: 1;
    }

    .ui-field-desc {
      color: var(--text-secondary);
      font-size: 0.85rem;
      line-height: 1.4;
      margin-left: 32px;
    }

    .ui-section-hint {
      margin: -12px 0 24px 0;
      color: var(--text-secondary);
      font-size: 0.95rem;
      background: var(--bg-body);
      padding: 12px 16px;
      border-radius: var(--radius-md);
      border-left: 3px solid var(--accent-color);
    }

    /* Temi predefiniti */
    .ui-themes-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 24px;
      margin-top: 20px;
    }

    .ui-theme-card {
      background: var(--bg-body);
      border: 2px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 20px;
      text-align: center;
      transition: all 0.2s ease;
      cursor: pointer;
    }

    .ui-theme-card:hover {
      border-color: var(--primary-color);
      box-shadow: var(--shadow-md);
      transform: translateY(-4px);
    }
    
    .ui-theme-card.active {
      border-color: var(--accent-color);
      background: var(--bg-surface);
      box-shadow: 0 0 0 2px var(--accent-color);
    }

    .ui-theme-preview {
      display: flex;
      height: 120px;
      border-radius: var(--radius-md);
      overflow: hidden;
      margin-bottom: 16px;
      box-shadow: var(--shadow-sm);
      border: 1px solid var(--border-color);
    }

    .ui-theme-preview-sidebar {
      width: 30%;
      background: var(--bg-sidebar);
    }

    .ui-theme-preview-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      background: var(--bg-body);
    }

    .ui-theme-preview-header {
      height: 12px;
      background: var(--primary-color);
      border-radius: 4px;
      opacity: 0.2;
    }

    .ui-theme-preview-content {
      flex: 1;
      background: var(--bg-surface);
      border-radius: 4px;
      border: 1px solid var(--border-color);
    }

    .ui-theme-name {
      font-weight: 700;
      color: var(--text-main);
      margin-bottom: 4px;
    }

    .ui-theme-desc {
      font-size: 0.8rem;
      color: var(--text-secondary);
    }

    /* Sezione avanzate */
    .ui-advanced-actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 16px;
    }

    .ui-advanced-actions .menu-button {
      flex: 1;
      min-width: 200px;
    }

    /* Responsive Mobile */
    @media (max-width: 992px) {
      .ui-appearance-panel {
        grid-template-columns: 1fr;
        gap: 16px;
      }
      .ui-header-box {
        grid-column: 1;
        flex-direction: column;
        align-items: flex-start;
        gap: 16px;
      }
      .ui-appearance-tabs {
        grid-column: 1;
        grid-row: auto;
        flex-direction: row;
        overflow-x: auto;
        padding: 8px;
        position: static;
        white-space: nowrap;
        border-radius: var(--radius-md);
        max-height: none;
        box-shadow: none;
        background: transparent;
        border: none;
      }
      .ui-appearance-tab {
        width: auto;
        border-radius: 20px;
        border: 1px solid var(--border-color);
        background: var(--bg-surface);
        padding: 8px 16px;
        flex-shrink: 0;
      }
      .ui-appearance-tab.active {
        background: var(--primary-color);
        color: white;
        border-color: var(--primary-color);
        border-left: 1px solid var(--primary-color);
      }
      .ui-appearance-tab.active i {
        color: white;
      }
      .ui-appearance-form {
        grid-column: 1;
        grid-row: auto;
      }
      .ui-colors-grid,
      .ui-typography-grid {
        grid-template-columns: 1fr;
      }
      .ui-actions-box {
        position: static;
        flex-direction: column;
        align-items: stretch;
      }
      .ui-actions-buttons {
        flex-direction: column;
      }
      .ui-actions-buttons .menu-button {
        width: 100%;
      }
    }

    /* ============================================
       BUSINESS LOGIC SECTION (PREMIUM)
       ============================================ */
    .ui-business-rules-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 20px;
        margin-top: 20px;
    }

    .ui-business-rule-card {
        background: var(--bg-surface);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        padding: 24px;
        display: flex;
        gap: 20px;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        overflow: hidden;
    }

    .ui-business-rule-card:hover {
        border-color: var(--accent-color);
        box-shadow: var(--shadow-lg);
        transform: translateY(-4px);
    }

    .ui-rule-icon {
        width: 48px;
        height: 48px;
        border-radius: 12px;
        background: rgba(var(--accent-rgb, 141, 198, 63), 0.1);
        color: var(--accent-color);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.25rem;
        flex-shrink: 0;
    }

    .ui-rule-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .ui-rule-label {
        font-weight: 700;
        color: var(--primary-color);
        font-size: 1rem;
        margin: 0;
    }

    .ui-rule-desc {
        font-size: 0.85rem;
        color: var(--text-secondary);
        line-height: 1.5;
        margin: 0;
    }

    .ui-rule-control {
        margin-top: 12px;
    }

    .ui-number-input-wrapper {
        display: flex;
        align-items: center;
        gap: 8px;
        background: var(--bg-body);
        padding: 8px 12px;
        border-radius: var(--radius-md);
        border: 1px solid var(--border-color);
        transition: border-color 0.2s;
    }

    .ui-number-input-wrapper:focus-within {
        border-color: var(--primary-color);
        box-shadow: 0 0 0 3px rgba(10, 35, 66, 0.1);
    }

    .ui-rule-input {
        background: transparent;
        border: none;
        color: var(--text-main);
        font-weight: 600;
        font-size: 1rem;
        width: 100%;
        outline: none;
    }

    .ui-input-unit {
        color: var(--text-secondary);
        font-size: 0.85rem;
        font-weight: 700;
        text-transform: uppercase;
        background: var(--border-color);
        padding: 2px 8px;
        border-radius: 4px;
    }

    .ui-toggle {
        position: relative;
        display: inline-block;
        width: 48px;
        height: 24px;
    }

    .ui-toggle input {
        opacity: 0;
        width: 0;
        height: 0;
    }

    .ui-toggle-slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: var(--border-color);
        transition: .4s;
        border-radius: 24px;
    }

    .ui-toggle-slider:before {
        position: absolute;
        content: "";
        height: 18px;
        width: 18px;
        left: 3px;
        bottom: 3px;
        background-color: white;
        transition: .4s;
        border-radius: 50%;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    input:checked + .ui-toggle-slider {
        background-color: var(--accent-color);
    }

    input:checked + .ui-toggle-slider:before {
        transform: translateX(24px);
    }

    .ui-rule-actions {
        margin-top: 32px;
        display: flex;
        justify-content: flex-end;
        padding-top: 24px;
        border-top: 1px solid var(--border-color);
    }
`;
