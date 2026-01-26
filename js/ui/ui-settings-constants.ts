export interface UiField {
    key: string;
    label: string;
    type: 'text' | 'color' | 'checkbox' | 'select' | 'password';
    cssVar?: string;
    defaultValue: string;
    description: string;
    category?: string;
    options?: { value: string; label: string }[];
}

export const UI_FIELDS: UiField[] = [
    {
        key: 'primary_color',
        label: 'Colore primario',
        type: 'color',
        cssVar: '--primary-color',
        defaultValue: '#0A2342',
        description: 'Colore di pulsanti e link principali'
    },
    {
        key: 'accent_color',
        label: 'Colore accento',
        type: 'color',
        cssVar: '--accent-color',
        defaultValue: '#8DC63F',
        description: 'Colori di evidenza e stati positivi'
    },
    {
        key: 'bg_body',
        label: 'Sfondo pagina',
        type: 'color',
        cssVar: '--bg-body',
        defaultValue: '#F4F6F8',
        description: "Background generale dell'app"
    },
    {
        key: 'bg_sidebar',
        label: 'Sfondo sidebar',
        type: 'color',
        cssVar: '--bg-sidebar',
        defaultValue: '#0A2342',
        description: 'Colonna di navigazione area admin'
    },
    {
        key: 'sidebar_hover',
        label: 'Hover sidebar',
        type: 'color',
        cssVar: '--bg-sidebar-hover',
        defaultValue: '#123561',
        description: 'Colore della voce attiva/hover'
    },
    {
        key: 'text_main',
        label: 'Colore testo',
        type: 'color',
        cssVar: '--text-main',
        defaultValue: '#333333',
        description: "Testi principali in tutta l'app"
    },
    {
        key: 'button_radius',
        label: 'Raggio bordi pulsanti',
        type: 'text',
        cssVar: '--radius-sm',
        defaultValue: '6px',
        description: 'Esempio: 6px, 999px per pill, ecc.'
    },
    {
        key: 'font_family',
        label: 'Font principale',
        type: 'text',
        defaultValue: "'Inter', 'Segoe UI', Roboto, sans-serif",
        description: "Stack di caratteri per tutta l'app"
    },
    {
        key: 'login_tagline',
        label: 'Sottotitolo login',
        type: 'text',
        defaultValue: 'Portale Distributori',
        description: 'Testo sotto il logo in schermata di login'
    },
    // Icone Admin
    {
        key: 'admin_icon_dashboard',
        label: 'Dashboard',
        type: 'text',
        defaultValue: 'fas fa-chart-line',
        description: 'Icona menu Dashboard (es: fas fa-chart-line o codice SVG)',
        category: 'icon_admin'
    },
    {
        key: 'admin_icon_stations',
        label: 'Distributori',
        type: 'text',
        defaultValue: 'fas fa-gas-pump',
        description: 'Icona menu Distributori',
        category: 'icon_admin'
    },
    {
        key: 'admin_icon_operators',
        label: 'Operatori',
        type: 'text',
        defaultValue: 'fas fa-users',
        description: 'Icona menu Operatori',
        category: 'icon_admin'
    },
    {
        key: 'admin_icon_chiusure',
        label: 'Chiusure',
        type: 'text',
        defaultValue: 'fas fa-file-invoice-dollar',
        description: 'Icona menu Chiusure',
        category: 'icon_admin'
    },
    {
        key: 'admin_icon_crediti',
        label: 'Crediti',
        type: 'text',
        defaultValue: 'fas fa-credit-card',
        description: 'Icona menu Crediti',
        category: 'icon_admin'
    },
    {
        key: 'admin_icon_fatture',
        label: 'Fatture',
        type: 'text',
        defaultValue: 'fas fa-file-invoice',
        description: 'Icona menu Fatture',
        category: 'icon_admin'
    },
    {
        key: 'admin_icon_vouchers',
        label: 'Voucher',
        type: 'text',
        defaultValue: 'fas fa-ticket-alt',
        description: 'Icona menu Voucher',
        category: 'icon_admin'
    },
    {
        key: 'admin_icon_notifiche',
        label: 'Notifiche',
        type: 'text',
        defaultValue: 'fas fa-bell',
        description: 'Icona menu Notifiche',
        category: 'icon_admin'
    },
    {
        key: 'admin_icon_settings',
        label: 'Impostazioni',
        type: 'text',
        defaultValue: 'fas fa-cog',
        description: 'Icona menu Impostazioni',
        category: 'icon_admin'
    },
    {
        key: 'admin_icon_logout',
        label: 'Esci',
        type: 'text',
        defaultValue: 'fas fa-sign-out-alt',
        description: 'Icona bottone Esci',
        category: 'icon_admin'
    },
    // Icone Operatore
    {
        key: 'operator_icon_turno',
        label: 'Apertura/Chiusura',
        type: 'text',
        defaultValue: 'fas fa-door-open',
        description: 'Icona bottone Apertura/Chiusura',
        category: 'icon_operator'
    },
    {
        key: 'operator_icon_movimenti',
        label: 'Movimenti',
        type: 'text',
        defaultValue: 'fas fa-exchange-alt',
        description: 'Icona menu Movimenti',
        category: 'icon_operator'
    },
    {
        key: 'operator_icon_crediti',
        label: 'Crediti',
        type: 'text',
        defaultValue: 'fas fa-credit-card',
        description: 'Icona sottomenu Crediti',
        category: 'icon_operator'
    },
    {
        key: 'operator_icon_voucher',
        label: 'Voucher',
        type: 'text',
        defaultValue: 'fas fa-ticket-alt',
        description: 'Icona sottomenu Voucher',
        category: 'icon_operator'
    },
    {
        key: 'operator_icon_uscite',
        label: 'Uscite',
        type: 'text',
        defaultValue: 'fas fa-hand-holding-usd',
        description: 'Icona sottomenu Uscite',
        category: 'icon_operator'
    },
    {
        key: 'operator_icon_incassi',
        label: 'Incassi',
        type: 'text',
        defaultValue: 'fas fa-cash-register',
        description: 'Icona sottomenu Incassi',
        category: 'icon_operator'
    },
    {
        key: 'operator_icon_fatture',
        label: 'Fatture',
        type: 'text',
        defaultValue: 'fas fa-file-invoice',
        description: 'Icona menu Fatture',
        category: 'icon_operator'
    },
    {
        key: 'operator_icon_prezzi',
        label: 'Prezzi',
        type: 'text',
        defaultValue: 'fas fa-tags',
        description: 'Icona menu Prezzi',
        category: 'icon_operator'
    },
    {
        key: 'operator_icon_logout',
        label: 'Esci',
        type: 'text',
        defaultValue: 'fas fa-sign-out-alt',
        description: 'Icona bottone Esci',
        category: 'icon_operator'
    },
    // Icone Azioni Distributori (Admin)
    {
        key: 'station_action_icon_edit',
        label: 'Modifica',
        type: 'text',
        defaultValue: 'fas fa-edit',
        description: 'Icona azione Modifica distributore',
        category: 'icon_station_actions'
    },
    {
        key: 'station_action_icon_prices',
        label: 'Prezzi',
        type: 'text',
        defaultValue: 'fas fa-tag',
        description: 'Icona azione Prezzi distributore',
        category: 'icon_station_actions'
    },
    {
        key: 'station_action_icon_islands',
        label: 'Isole e Pistole',
        type: 'text',
        defaultValue: 'fas fa-gas-pump',
        description: 'Icona azione Isole e Pistole',
        category: 'icon_station_actions'
    },
    {
        key: 'station_action_icon_tanks',
        label: 'Cisterne',
        type: 'text',
        defaultValue: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="1" y="7" width="22" height="11" rx="5.5" /><rect x="14" y="3" width="7" height="4" rx="1" /><rect x="4" y="18" width="3" height="3" rx="1" /><rect x="17" y="18" width="3" height="3" rx="1" /><path d="M9 15.5l2-3.5 2 3.5H9z" fill="white" /></svg>',
        description: 'Icona azione Cisterne distributore',
        category: 'icon_station_actions'
    },
    {
        key: 'station_action_icon_delete',
        label: 'Elimina',
        type: 'text',
        defaultValue: 'fas fa-trash',
        description: 'Icona azione Elimina distributore',
        category: 'icon_station_actions'
    }
];

export const ADMIN_LAYOUT_FIELDS = {
    sidebar: [
        {
            key: 'admin_sidebar_width',
            label: 'Larghezza Sidebar',
            type: 'text',
            defaultValue: '280px',
            description: 'Larghezza della sidebar (es. 280px, 20rem)'
        } as UiField,
        {
            key: 'admin_sidebar_show_header',
            label: 'Mostra Header Sidebar',
            type: 'checkbox',
            defaultValue: 'true',
            description: "Mostra/nascondi l'header della sidebar"
        } as UiField,
        {
            key: 'admin_sidebar_show_footer',
            label: 'Mostra Footer Sidebar',
            type: 'checkbox',
            defaultValue: 'true',
            description: 'Mostra/nascondi il footer con info utente'
        } as UiField
    ],
    header: [
        {
            key: 'admin_header_show_logo',
            label: 'Mostra Logo Header',
            type: 'checkbox',
            defaultValue: 'true',
            description: "Mostra/nascondi il logo nell'header"
        } as UiField,
        {
            key: 'admin_header_logo_height',
            label: 'Altezza Logo',
            type: 'text',
            defaultValue: '50px',
            description: 'Altezza del logo (es. 50px, 3rem)'
        } as UiField
    ],
    menu: [
        {
            key: 'admin_menu_show_dashboard',
            label: 'Mostra Dashboard',
            type: 'checkbox',
            defaultValue: 'true',
            description: 'Mostra/nascondi la voce menu Dashboard'
        } as UiField,
        {
            key: 'admin_menu_show_stations',
            label: 'Mostra Distributori',
            type: 'checkbox',
            defaultValue: 'true',
            description: 'Mostra/nascondi la voce menu Distributori'
        } as UiField,
        {
            key: 'admin_menu_show_operators',
            label: 'Mostra Operatori',
            type: 'checkbox',
            defaultValue: 'true',
            description: 'Mostra/nascondi la voce menu Operatori'
        } as UiField,
        {
            key: 'admin_menu_show_chiusure',
            label: 'Mostra Chiusure',
            type: 'checkbox',
            defaultValue: 'true',
            description: 'Mostra/nascondi la voce menu Chiusure'
        } as UiField,
        {
            key: 'admin_menu_show_crediti',
            label: 'Mostra Crediti',
            type: 'checkbox',
            defaultValue: 'true',
            description: 'Mostra/nascondi la voce menu Crediti'
        } as UiField,
        {
            key: 'admin_menu_show_fatture',
            label: 'Mostra Fatture',
            type: 'checkbox',
            defaultValue: 'true',
            description: 'Mostra/nascondi la voce menu Fatture'
        } as UiField,
        {
            key: 'admin_menu_show_vouchers',
            label: 'Mostra Voucher',
            type: 'checkbox',
            defaultValue: 'true',
            description: 'Mostra/nascondi la voce menu Voucher'
        } as UiField,
        {
            key: 'admin_menu_show_notifiche',
            label: 'Mostra Notifiche',
            type: 'checkbox',
            defaultValue: 'true',
            description: 'Mostra/nascondi la voce menu Notifiche'
        } as UiField
    ],
    spacing: [
        {
            key: 'admin_content_padding',
            label: 'Padding Contenuto',
            type: 'text',
            defaultValue: '24px',
            description: 'Spaziatura interna del contenuto principale (es. 24px, 1.5rem)'
        } as UiField,
        {
            key: 'admin_section_gap',
            label: 'Spaziatura Sezioni',
            type: 'text',
            defaultValue: '24px',
            description: 'Spazio tra le sezioni (es. 24px, 1.5rem)'
        } as UiField
    ]
};

export const COMPONENTS_FIELDS = {
    buttons: [
        {
            key: 'component_button_padding',
            label: 'Padding Bottoni',
            type: 'text',
            defaultValue: '12px 24px',
            description: 'Spaziatura interna bottoni (es. 12px 24px, 10px 20px)'
        } as UiField,
        {
            key: 'component_button_radius',
            label: 'Raggio Bordi Bottoni',
            type: 'text',
            defaultValue: '6px',
            description: 'Bordi arrotondati bottoni (es. 6px, 999px per pill)'
        } as UiField,
        {
            key: 'component_button_font_size',
            label: 'Dimensione Font Bottoni',
            type: 'text',
            defaultValue: '1rem',
            description: 'Dimensione testo bottoni (es. 1rem, 0.95rem)'
        } as UiField,
        {
            key: 'component_button_font_weight',
            label: 'Spessore Font Bottoni',
            type: 'select',
            defaultValue: '600',
            options: [
                { value: '400', label: 'Normale (400)' },
                { value: '500', label: 'Medio (500)' },
                { value: '600', label: 'Semi-bold (600)' },
                { value: '700', label: 'Bold (700)' }
            ],
            description: 'Spessore del testo nei bottoni'
        } as UiField
    ],
    tables: [
        {
            key: 'component_table_header_bg',
            label: 'Sfondo Header Tabelle',
            type: 'color',
            cssVar: '--table-header-bg',
            defaultValue: '#F4F6F8',
            description: "Colore di sfondo dell'header delle tabelle"
        } as UiField,
        {
            key: 'component_table_header_color',
            label: 'Colore Testo Header',
            type: 'color',
            cssVar: '--table-header-color',
            defaultValue: '#333333',
            description: "Colore del testo nell'header delle tabelle"
        } as UiField,
        {
            key: 'component_table_hover_bg',
            label: 'Sfondo Hover Righe',
            type: 'color',
            cssVar: '--table-hover-bg',
            defaultValue: '#F8FAFC',
            description: 'Colore di sfondo al passaggio del mouse sulle righe'
        } as UiField,
        {
            key: 'component_table_padding',
            label: 'Padding Celle',
            type: 'text',
            defaultValue: '16px 24px',
            description: 'Spaziatura interna celle (es. 16px 24px)'
        } as UiField
    ],
    cards: [
        {
            key: 'component_card_padding',
            label: 'Padding Card',
            type: 'text',
            defaultValue: '24px',
            description: 'Spaziatura interna card/box (es. 24px, 20px)'
        } as UiField,
        {
            key: 'component_card_radius',
            label: 'Raggio Bordi Card',
            type: 'text',
            defaultValue: '16px',
            description: 'Bordi arrotondati card (es. 16px, 12px)'
        } as UiField,
        {
            key: 'component_card_shadow',
            label: 'Intensità Ombra',
            type: 'select',
            defaultValue: 'md',
            options: [
                { value: 'none', label: 'Nessuna' },
                { value: 'sm', label: 'Piccola' },
                { value: 'md', label: 'Media (default)' },
                { value: 'lg', label: 'Grande' }
            ],
            description: "Intensità dell'ombra delle card"
        } as UiField
    ],
    modals: [
        {
            key: 'component_modal_max_width',
            label: 'Larghezza Massima Modali',
            type: 'text',
            defaultValue: '1100px',
            description: 'Larghezza massima modali (es. 1100px, 90vw)'
        } as UiField,
        {
            key: 'component_modal_padding',
            label: 'Padding Modali',
            type: 'text',
            defaultValue: '24px',
            description: 'Spaziatura interna modali (es. 24px, 20px)'
        } as UiField,
        {
            key: 'component_modal_radius',
            label: 'Raggio Bordi Modali',
            type: 'text',
            defaultValue: '16px',
            description: 'Bordi arrotondati modali (es. 16px, 12px)'
        } as UiField,
        {
            key: 'component_modal_overlay_opacity',
            label: 'Opacità Sfondo Modale',
            type: 'text',
            defaultValue: '0.6',
            description: 'Opacità dello sfondo scuro (0-1, es. 0.6)'
        } as UiField
    ]
};

export const FORMS_FIELDS = {
    inputs: [
        {
            key: 'form_input_padding',
            label: 'Padding Input',
            type: 'text',
            defaultValue: '12px 16px',
            description: 'Spaziatura interna campi input (es. 12px 16px)'
        } as UiField,
        {
            key: 'form_input_radius',
            label: 'Raggio Bordi Input',
            type: 'text',
            defaultValue: '6px',
            description: 'Bordi arrotondati campi input'
        } as UiField,
        {
            key: 'form_input_border_width',
            label: 'Spessore Bordo Input',
            type: 'text',
            defaultValue: '2px',
            description: 'Spessore del bordo (es. 2px, 1px)'
        } as UiField,
        {
            key: 'form_input_font_size',
            label: 'Dimensione Font Input',
            type: 'text',
            defaultValue: '1rem',
            description: 'Dimensione testo campi input'
        } as UiField,
        {
            key: 'form_label_font_size',
            label: 'Dimensione Font Label',
            type: 'text',
            defaultValue: '0.95rem',
            description: 'Dimensione testo etichette'
        } as UiField,
        {
            key: 'form_label_font_weight',
            label: 'Spessore Font Label',
            type: 'select',
            defaultValue: '600',
            options: [
                { value: '400', label: 'Normale (400)' },
                { value: '500', label: 'Medio (500)' },
                { value: '600', label: 'Semi-bold (600)' },
                { value: '700', label: 'Bold (700)' }
            ],
            description: 'Spessore del testo delle etichette'
        } as UiField
    ],
    layout: [
        {
            key: 'form_group_gap',
            label: 'Spaziatura Gruppi Form',
            type: 'text',
            defaultValue: '20px',
            description: 'Spazio tra i gruppi di campi (es. 20px)'
        } as UiField,
        {
            key: 'form_row_gap',
            label: 'Spaziatura Righe Form',
            type: 'text',
            defaultValue: '16px',
            description: 'Spazio tra le righe nei form a griglia'
        } as UiField
    ]
};

export const OPERATOR_LAYOUT_FIELDS = {
    header: [
        {
            key: 'operator_header_show_logo',
            label: 'Mostra Logo Header',
            type: 'checkbox',
            defaultValue: 'true',
            description: "Mostra/nascondi il logo nell'header operatore"
        } as UiField,
        {
            key: 'operator_header_logo_height',
            label: 'Altezza Logo',
            type: 'text',
            defaultValue: '40px',
            description: 'Altezza del logo (es. 40px, 2.5rem)'
        } as UiField,
        {
            key: 'operator_header_show_station_badge',
            label: 'Mostra Badge Stazione',
            type: 'checkbox',
            defaultValue: 'true',
            description: 'Mostra/nascondi il badge con il nome della stazione'
        } as UiField,
        {
            key: 'operator_header_show_logout',
            label: 'Mostra Bottone Logout',
            type: 'checkbox',
            defaultValue: 'true',
            description: "Mostra/nascondi il bottone di logout nell'header"
        } as UiField
    ],
    menu: [
        {
            key: 'operator_menu_show_turno',
            label: 'Mostra Apertura/Chiusura',
            type: 'checkbox',
            defaultValue: 'true',
            description: 'Mostra/nascondi il bottone principale Apertura/Chiusura turno'
        } as UiField,
        {
            key: 'operator_menu_show_movimenti',
            label: 'Mostra Movimenti',
            type: 'checkbox',
            defaultValue: 'true',
            description: 'Mostra/nascondi la sezione Movimenti (accordion)'
        } as UiField,
        {
            key: 'operator_menu_show_crediti',
            label: 'Mostra Crediti',
            type: 'checkbox',
            defaultValue: 'true',
            description: 'Mostra/nascondi la voce Crediti nel sottomenu Movimenti'
        } as UiField,
        {
            key: 'operator_menu_show_voucher',
            label: 'Mostra Voucher',
            type: 'checkbox',
            defaultValue: 'true',
            description: 'Mostra/nascondi la voce Voucher nel sottomenu Movimenti'
        } as UiField,
        {
            key: 'operator_menu_show_uscite',
            label: 'Mostra Uscite',
            type: 'checkbox',
            defaultValue: 'true',
            description: 'Mostra/nascondi la voce Uscite nel sottomenu Movimenti'
        } as UiField,
        {
            key: 'operator_menu_show_incassi',
            label: 'Mostra Incassi',
            type: 'checkbox',
            defaultValue: 'true',
            description: 'Mostra/nascondi la voce Incassi nel sottomenu Movimenti'
        } as UiField,
        {
            key: 'operator_menu_show_fatture',
            label: 'Mostra Fatture',
            type: 'checkbox',
            defaultValue: 'true',
            description: 'Mostra/nascondi la voce menu Fatture'
        } as UiField,
        {
            key: 'operator_menu_show_prezzi',
            label: 'Mostra Prezzi',
            type: 'checkbox',
            defaultValue: 'true',
            description: 'Mostra/nascondi la voce menu Prezzi'
        } as UiField
    ]
};

export const PREDEFINED_THEMES: Record<string, any> = {
    light: {
        name: 'Chiaro (Default)',
        primary_color: '#0A2342',
        accent_color: '#8DC63F',
        bg_body: '#F4F6F8',
        bg_sidebar: '#0A2342',
        sidebar_hover: '#123561',
        text_main: '#333333'
    },
    dark: {
        name: 'Scuro',
        primary_color: '#8DC63F',
        accent_color: '#8DC63F',
        bg_body: '#1a1a1a',
        bg_sidebar: '#0d1117',
        sidebar_hover: '#161b22',
        text_main: '#e6edf3'
    },
    blue: {
        name: 'Blu Professionale',
        primary_color: '#1e40af',
        accent_color: '#3b82f6',
        bg_body: '#f0f9ff',
        bg_sidebar: '#1e40af',
        sidebar_hover: '#2563eb',
        text_main: '#1e293b'
    },
    green: {
        name: 'Verde Naturale',
        primary_color: '#059669',
        accent_color: '#10b981',
        bg_body: '#f0fdf4',
        bg_sidebar: '#059669',
        sidebar_hover: '#047857',
        text_main: '#064e3b'
    }
};

export const DEFAULT_SETTINGS = UI_FIELDS.reduce((acc: any, field) => {
    acc[field.key] = field.defaultValue;
    return acc;
}, {});

export interface BusinessLogicField {
    key: string;
    label: string;
    type: 'number' | 'boolean' | 'select';
    defaultValue: any;
    description: string;
    unit?: string;
    icon?: string;
    options?: { value: string | number; label: string }[];
}

export const BUSINESS_LOGIC_FIELDS: BusinessLogicField[] = [
    {
        key: 'cash_error_threshold',
        label: 'Tolleranza Errore Cassa',
        type: 'number',
        defaultValue: 10,
        unit: '€',
        icon: 'fas fa-hand-holding-usd',
        description: 'Differenza massima accettata tra cassa attesa e contanti contati a chiusura turno.'
    },
    {
        key: 'max_price_limit',
        label: 'Tetto Massimo Prezzo',
        type: 'number',
        defaultValue: 2.50,
        unit: '€/L',
        icon: 'fas fa-tags',
        description: 'Soglia di sicurezza per evitare errori di battitura nei prezzi carburante.'
    },
    {
        key: 'fuel_reserve_alert_liters',
        label: 'Soglia Allerta Riserva',
        type: 'number',
        defaultValue: 2000,
        unit: 'L',
        icon: 'fas fa-oil-can',
        description: 'Livello minimo di stock in cisterna prima di attivare l\'allarme riserva.'
    },
    {
        key: 'force_close_hours_threshold',
        label: 'Scadenza Turno Aperto',
        type: 'number',
        defaultValue: 24,
        unit: 'ore',
        icon: 'fas fa-clock',
        description: 'Tempo massimo dopo il quale un turno rimasto aperto può essere forzato in chiusura.'
    },
    {
        key: 'notifications_enabled',
        label: 'Notifiche Critiche',
        type: 'boolean',
        defaultValue: true,
        icon: 'fas fa-bell',
        description: 'Abilita l\'invio di avvisi istantanei per eventi gravi di sistema.'
    },
    {
        key: 'critical_discrepancy_alert',
        label: 'Soglia Allarme Grave',
        type: 'number',
        defaultValue: 50,
        unit: '€',
        icon: 'fas fa-exclamation-triangle',
        description: 'Invia una notifica prioritaria se la discrepanza di cassa supera questo valore.'
    }
];
