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
