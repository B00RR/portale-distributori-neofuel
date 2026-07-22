export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '13.0.5';
  };
  public: {
    Tables: {
      apertura_turno_pistole_deprecated: {
        Row: {
          created_at: string | null;
          id: number;
          numeratore_apertura: number | null;
          pistola_id: number | null;
          turno_id: number | null;
        };
        Insert: {
          created_at?: string | null;
          id?: number;
          numeratore_apertura?: number | null;
          pistola_id?: number | null;
          turno_id?: number | null;
        };
        Update: {
          created_at?: string | null;
          id?: number;
          numeratore_apertura?: number | null;
          pistola_id?: number | null;
          turno_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'apertura_turno_pistole_pistola_id_fkey';
            columns: ['pistola_id'];
            isOneToOne: false;
            referencedRelation: 'pistole';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'apertura_turno_pistole_turno_id_fkey';
            columns: ['turno_id'];
            isOneToOne: false;
            referencedRelation: 'opening_shift_deprecated';
            referencedColumns: ['id'];
          }
        ];
      };
      calculation_logs: {
        Row: {
          action: string;
          created_at: string;
          created_by: string | null;
          details: Json | null;
          id: string;
          module_id: string | null;
          version_id: string | null;
        };
        Insert: {
          action: string;
          created_at?: string;
          created_by?: string | null;
          details?: Json | null;
          id?: string;
          module_id?: string | null;
          version_id?: string | null;
        };
        Update: {
          action?: string;
          created_at?: string;
          created_by?: string | null;
          details?: Json | null;
          id?: string;
          module_id?: string | null;
          version_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'calculation_logs_module_id_fkey';
            columns: ['module_id'];
            isOneToOne: false;
            referencedRelation: 'calculation_modules';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'calculation_logs_module_id_fkey';
            columns: ['module_id'];
            isOneToOne: false;
            referencedRelation: 'calculation_modules_with_active';
            referencedColumns: ['module_id'];
          },
          {
            foreignKeyName: 'calculation_logs_version_id_fkey';
            columns: ['version_id'];
            isOneToOne: false;
            referencedRelation: 'calculation_modules_with_active';
            referencedColumns: ['active_version_id'];
          },
          {
            foreignKeyName: 'calculation_logs_version_id_fkey';
            columns: ['version_id'];
            isOneToOne: false;
            referencedRelation: 'calculation_versions';
            referencedColumns: ['id'];
          }
        ];
      };
      calculation_modules: {
        Row: {
          active_version_id: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          name: string;
          scope: string;
        };
        Insert: {
          active_version_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          name: string;
          scope: string;
        };
        Update: {
          active_version_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
          scope?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'calculation_modules_active_version_fk';
            columns: ['active_version_id'];
            isOneToOne: false;
            referencedRelation: 'calculation_modules_with_active';
            referencedColumns: ['active_version_id'];
          },
          {
            foreignKeyName: 'calculation_modules_active_version_fk';
            columns: ['active_version_id'];
            isOneToOne: false;
            referencedRelation: 'calculation_versions';
            referencedColumns: ['id'];
          }
        ];
      };
      calculation_tests: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          expected_output: Json | null;
          id: string;
          input_payload: Json;
          version_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          expected_output?: Json | null;
          id?: string;
          input_payload: Json;
          version_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          expected_output?: Json | null;
          id?: string;
          input_payload?: Json;
          version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'calculation_tests_version_id_fkey';
            columns: ['version_id'];
            isOneToOne: false;
            referencedRelation: 'calculation_modules_with_active';
            referencedColumns: ['active_version_id'];
          },
          {
            foreignKeyName: 'calculation_tests_version_id_fkey';
            columns: ['version_id'];
            isOneToOne: false;
            referencedRelation: 'calculation_versions';
            referencedColumns: ['id'];
          }
        ];
      };
      calculation_versions: {
        Row: {
          created_at: string;
          created_by: string | null;
          dsl: Json;
          id: string;
          metadata: Json | null;
          module_id: string;
          notes: string | null;
          published_at: string | null;
          status: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          dsl: Json;
          id?: string;
          metadata?: Json | null;
          module_id: string;
          notes?: string | null;
          published_at?: string | null;
          status?: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          dsl?: Json;
          id?: string;
          metadata?: Json | null;
          module_id?: string;
          notes?: string | null;
          published_at?: string | null;
          status?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'calculation_versions_module_id_fkey';
            columns: ['module_id'];
            isOneToOne: false;
            referencedRelation: 'calculation_modules';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'calculation_versions_module_id_fkey';
            columns: ['module_id'];
            isOneToOne: false;
            referencedRelation: 'calculation_modules_with_active';
            referencedColumns: ['module_id'];
          }
        ];
      };
      chiusura_turno_pistole_deprecated: {
        Row: {
          created_at: string | null;
          id: number;
          numeratore_chiusura: number | null;
          pistola_id: number | null;
          turno_id: number | null;
        };
        Insert: {
          created_at?: string | null;
          id?: number;
          numeratore_chiusura?: number | null;
          pistola_id?: number | null;
          turno_id?: number | null;
        };
        Update: {
          created_at?: string | null;
          id?: number;
          numeratore_chiusura?: number | null;
          pistola_id?: number | null;
          turno_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'chiusura_turno_pistole_pistola_id_fkey';
            columns: ['pistola_id'];
            isOneToOne: false;
            referencedRelation: 'pistole';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'chiusura_turno_pistole_turno_id_fkey';
            columns: ['turno_id'];
            isOneToOne: false;
            referencedRelation: 'opening_shift_deprecated';
            referencedColumns: ['id'];
          }
        ];
      };
      clienti_fatturazione: {
        Row: {
          codice_univoco_pec: string | null;
          created_at: string;
          created_by_auth: string | null;
          id: number;
          km: number | null;
          nome: string;
          partita_iva: string | null;
          targa: string | null;
          telefono: string | null;
        };
        Insert: {
          codice_univoco_pec?: string | null;
          created_at?: string;
          created_by_auth?: string | null;
          id?: number;
          km?: number | null;
          nome: string;
          partita_iva?: string | null;
          targa?: string | null;
          telefono?: string | null;
        };
        Update: {
          codice_univoco_pec?: string | null;
          created_at?: string;
          created_by_auth?: string | null;
          id?: number;
          km?: number | null;
          nome?: string;
          partita_iva?: string | null;
          targa?: string | null;
          telefono?: string | null;
        };
        Relationships: [];
      };
      closing_shift_deprecated: {
        Row: {
          cash_in_finale: number | null;
          cash_out_finale: number | null;
          date_time: string;
          id: number;
          incasso_contanti: number | null;
          incasso_lordo: number | null;
          incasso_pos: number | null;
          incasso_uta_dkv: number | null;
          is_final: boolean | null;
          non_erogato: number | null;
          operator_id: number | null;
          shift_operator_id: number | null;
          station_id: number | null;
          turno_id: number | null;
        };
        Insert: {
          cash_in_finale?: number | null;
          cash_out_finale?: number | null;
          date_time?: string;
          id?: number;
          incasso_contanti?: number | null;
          incasso_lordo?: number | null;
          incasso_pos?: number | null;
          incasso_uta_dkv?: number | null;
          is_final?: boolean | null;
          non_erogato?: number | null;
          operator_id?: number | null;
          shift_operator_id?: number | null;
          station_id?: number | null;
          turno_id?: number | null;
        };
        Update: {
          cash_in_finale?: number | null;
          cash_out_finale?: number | null;
          date_time?: string;
          id?: number;
          incasso_contanti?: number | null;
          incasso_lordo?: number | null;
          incasso_pos?: number | null;
          incasso_uta_dkv?: number | null;
          is_final?: boolean | null;
          non_erogato?: number | null;
          operator_id?: number | null;
          shift_operator_id?: number | null;
          station_id?: number | null;
          turno_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'closing_shift_operator_id_fkey';
            columns: ['operator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'closing_shift_shift_operator_id_fkey';
            columns: ['shift_operator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'closing_shift_station_id_fkey';
            columns: ['station_id'];
            isOneToOne: false;
            referencedRelation: 'fuel_stations';
            referencedColumns: ['station_id'];
          },
          {
            foreignKeyName: 'closing_shift_turno_id_fkey';
            columns: ['turno_id'];
            isOneToOne: false;
            referencedRelation: 'opening_shift_deprecated';
            referencedColumns: ['id'];
          }
        ];
      };
      crediti_clienti: {
        Row: {
          cliente: string;
          created_at: string | null;
          id: number;
          importo: number;
          saldo: number;
          shift_id: number | null;
          station_id: number | null;
          updated_at: string | null;
        };
        Insert: {
          cliente: string;
          created_at?: string | null;
          id?: number;
          importo: number;
          saldo: number;
          station_id?: number | null;
          updated_at?: string | null;
        };
        Update: {
          cliente?: string;
          created_at?: string | null;
          id?: number;
          importo?: number;
          saldo?: number;
          station_id?: number | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'crediti_clienti_shift_id_fkey';
            columns: ['shift_id'];
            isOneToOne: false;
            referencedRelation: 'shifts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'crediti_clienti_station_id_fkey';
            columns: ['station_id'];
            isOneToOne: false;
            referencedRelation: 'fuel_stations';
            referencedColumns: ['station_id'];
          }
        ];
      };
      crediti_movimenti: {
        Row: {
          cliente_id: number;
          created_at: string | null;
          id: number;
          importo: number;
          metodo: string;
          note: string | null;
          operator_id: number | null;
          shift_id: number | null;
          station_id: number | null;
          tipo: string | null;
        };
        Insert: {
          cliente_id: number;
          created_at?: string | null;
          id?: number;
          importo: number;
          metodo: string;
          note?: string | null;
          operator_id?: number | null;
          station_id?: number | null;
          tipo?: string | null;
        };
        Update: {
          cliente_id?: number;
          created_at?: string | null;
          id?: number;
          importo?: number;
          metodo?: string;
          note?: string | null;
          operator_id?: number | null;
          station_id?: number | null;
          tipo?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'crediti_movimenti_cliente_id_fkey';
            columns: ['cliente_id'];
            isOneToOne: false;
            referencedRelation: 'crediti_clienti';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'crediti_movimenti_operator_id_fkey';
            columns: ['operator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'crediti_movimenti_shift_id_fkey';
            columns: ['shift_id'];
            isOneToOne: false;
            referencedRelation: 'shifts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'crediti_movimenti_station_id_fkey';
            columns: ['station_id'];
            isOneToOne: false;
            referencedRelation: 'fuel_stations';
            referencedColumns: ['station_id'];
          }
        ];
      };
      fuel_stations: {
        Row: {
          allow_partial_closure: boolean | null;
          created_at: string | null;
          created_by_auth: string | null;
          is_active: boolean | null;
          location: string | null;
          station_id: number;
          station_name: string;
          updated_at: string | null;
        };
        Insert: {
          allow_partial_closure?: boolean | null;
          created_at?: string | null;
          created_by_auth?: string | null;
          is_active?: boolean | null;
          location?: string | null;
          station_id?: number;
          station_name: string;
          updated_at?: string | null;
        };
        Update: {
          allow_partial_closure?: boolean | null;
          created_at?: string | null;
          created_by_auth?: string | null;
          is_active?: boolean | null;
          location?: string | null;
          station_id?: number;
          station_name?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      invoice_requests: {
        Row: {
          amount: number;
          created_at: string;
          customer_name: string;
          id: number;
          notes: string | null;
          operator_id: number | null;
          shift_id: number | null;
          station_id: number | null;
          status: string | null;
        };
        Insert: {
          amount: number;
          created_at?: string;
          customer_name: string;
          id?: number;
          notes?: string | null;
          operator_id?: number | null;
          station_id?: number | null;
          status?: string | null;
        };
        Update: {
          amount?: number;
          created_at?: string;
          customer_name?: string;
          id?: number;
          notes?: string | null;
          operator_id?: number | null;
          station_id?: number | null;
          status?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'invoice_requests_operator_id_fkey';
            columns: ['operator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'invoice_requests_station_id_fkey';
            columns: ['station_id'];
            isOneToOne: false;
            referencedRelation: 'fuel_stations';
            referencedColumns: ['station_id'];
          }
        ];
      };
      invoices: {
        Row: {
          amount: number;
          cliente_id: number | null;
          created_at: string;
          customer_name: string | null;
          description: string | null;
          id: number;
          invoice_date: string;
          invoice_number: string;
          operator_id: number | null;
          payment_method: string | null;
          product_category: string | null;
          station_id: number | null;
          status: string | null;
          updated_at: string | null;
        };
        Insert: {
          amount: number;
          cliente_id?: number | null;
          created_at?: string;
          customer_name?: string | null;
          description?: string | null;
          id?: number;
          invoice_date: string;
          invoice_number: string;
          operator_id?: number | null;
          payment_method?: string | null;
          product_category?: string | null;
          station_id?: number | null;
          status?: string | null;
          updated_at?: string | null;
        };
        Update: {
          amount?: number;
          cliente_id?: number | null;
          created_at?: string;
          customer_name?: string | null;
          description?: string | null;
          id?: number;
          invoice_date?: string;
          invoice_number?: string;
          operator_id?: number | null;
          payment_method?: string | null;
          product_category?: string | null;
          station_id?: number | null;
          status?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'invoices_cliente_id_fkey';
            columns: ['cliente_id'];
            isOneToOne: false;
            referencedRelation: 'clienti_fatturazione';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoices_operator_id_fkey';
            columns: ['operator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'invoices_station_id_fkey';
            columns: ['station_id'];
            isOneToOne: false;
            referencedRelation: 'fuel_stations';
            referencedColumns: ['station_id'];
          }
        ];
      };
      islands: {
        Row: {
          created_at: string | null;
          is_active: boolean | null;
          island_id: number;
          island_name: string;
          nome: string;
          station_id: number | null;
        };
        Insert: {
          created_at?: string | null;
          is_active?: boolean | null;
          island_id?: number;
          island_name: string;
          nome: string;
          station_id?: number | null;
        };
        Update: {
          created_at?: string | null;
          is_active?: boolean | null;
          island_id?: number;
          island_name?: string;
          nome?: string;
          station_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'islands_station_id_fkey';
            columns: ['station_id'];
            isOneToOne: false;
            referencedRelation: 'fuel_stations';
            referencedColumns: ['station_id'];
          }
        ];
      };
      movimenti_cassa: {
        Row: {
          created_at: string | null;
          descrizione: string | null;
          foto_url: string | null;
          id: number;
          importo: number;
          operator_id: number;
          payment_method: string | null;
          shift_id: number | null;
          station_id: number;
          tipo: string;
        };
        Insert: {
          created_at?: string | null;
          descrizione?: string | null;
          foto_url?: string | null;
          id?: number;
          importo: number;
          operator_id: number;
          payment_method: string | null;
          shift_id: number | null;
          station_id: number;
          tipo: string;
        };
        Update: {
          created_at?: string | null;
          descrizione?: string | null;
          foto_url?: string | null;
          id?: number;
          importo?: number;
          operator_id?: number;
          station_id?: number;
          tipo?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'movimenti_cassa_operator_id_fkey';
            columns: ['operator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'movimenti_cassa_shift_id_fkey';
            columns: ['shift_id'];
            isOneToOne: false;
            referencedRelation: 'shifts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'movimenti_cassa_station_id_fkey';
            columns: ['station_id'];
            isOneToOne: false;
            referencedRelation: 'fuel_stations';
            referencedColumns: ['station_id'];
          }
        ];
      };
      notifiche: {
        Row: {
          data_creazione: string;
          id: number;
          letta: boolean;
          messaggio: string | null;
          operatore_id: number | null;
          soggetto_id: number | null;
          tipo: string;
          titolo: string | null;
        };
        Insert: {
          data_creazione?: string;
          id?: number;
          letta?: boolean;
          messaggio?: string | null;
          operatore_id?: number | null;
          soggetto_id?: number | null;
          tipo: string;
          titolo?: string | null;
        };
        Update: {
          data_creazione?: string;
          id?: number;
          letta?: boolean;
          messaggio?: string | null;
          operatore_id?: number | null;
          soggetto_id?: number | null;
          tipo?: string;
          titolo?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'notifiche_operatore_id_fkey';
            columns: ['operatore_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['user_id'];
          }
        ];
      };
      opening_shift_deprecated: {
        Row: {
          card_transactions: number | null;
          cash_in: number | null;
          cash_in_minus_out: number | null;
          cash_out: number | null;
          created_at: string | null;
          date_time: string;
          id: number;
          operator_id: number | null;
          pos_amount: number | null;
          station_id: number | null;
          total_amount: number | null;
        };
        Insert: {
          card_transactions?: number | null;
          cash_in?: number | null;
          cash_in_minus_out?: number | null;
          cash_out?: number | null;
          created_at?: string | null;
          date_time?: string;
          id?: number;
          operator_id?: number | null;
          pos_amount?: number | null;
          station_id?: number | null;
          total_amount?: number | null;
        };
        Update: {
          card_transactions?: number | null;
          cash_in?: number | null;
          cash_in_minus_out?: number | null;
          cash_out?: number | null;
          created_at?: string | null;
          date_time?: string;
          id?: number;
          operator_id?: number | null;
          pos_amount?: number | null;
          station_id?: number | null;
          total_amount?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'opening_shift_operator_id_fkey';
            columns: ['operator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'opening_shift_station_id_fkey';
            columns: ['station_id'];
            isOneToOne: false;
            referencedRelation: 'fuel_stations';
            referencedColumns: ['station_id'];
          }
        ];
      };
      operator_menu_options: {
        Row: {
          created_by_auth: string | null;
          function_key: string;
          id: number;
          label: string;
        };
        Insert: {
          created_by_auth?: string | null;
          function_key: string;
          id?: number;
          label: string;
        };
        Update: {
          created_by_auth?: string | null;
          function_key?: string;
          id?: number;
          label?: string;
        };
        Relationships: [];
      };
      pistole: {
        Row: {
          created_at: string;
          id: number;
          island_id: number;
          nome: string;
          numero_litri: number | null;
          station_id: number | null;
          tipo_carburante: string | null;
        };
        Insert: {
          created_at?: string;
          id?: number;
          island_id: number;
          nome: string;
          numero_litri?: number | null;
          station_id?: number | null;
          tipo_carburante?: string | null;
        };
        Update: {
          created_at?: string;
          id?: number;
          island_id?: number;
          nome?: string;
          numero_litri?: number | null;
          station_id?: number | null;
          tipo_carburante?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'pistole_island_fk';
            columns: ['island_id'];
            isOneToOne: false;
            referencedRelation: 'islands';
            referencedColumns: ['island_id'];
          },
          {
            foreignKeyName: 'pistole_station_id_fkey';
            columns: ['station_id'];
            isOneToOne: false;
            referencedRelation: 'fuel_stations';
            referencedColumns: ['station_id'];
          }
        ];
      };
      prezzi_distributore: {
        Row: {
          created_at: string | null;
          data_validita: string;
          id: number;
          modificato_da: number | null;
          prezzo_benzina: number | null;
          prezzo_gasolio: number | null;
          prezzo_gpl: number | null;
          prezzo_metano: number | null;
          prossima_chiusura: boolean;
          station_id: number | null;
        };
        Insert: {
          created_at?: string | null;
          data_validita: string;
          id?: number;
          modificato_da?: number | null;
          prezzo_benzina?: number | null;
          prezzo_gasolio?: number | null;
          prezzo_gpl?: number | null;
          prezzo_metano?: number | null;
          prossima_chiusura?: boolean;
          station_id?: number | null;
        };
        Update: {
          created_at?: string | null;
          data_validita?: string;
          id?: number;
          modificato_da?: number | null;
          prezzo_benzina?: number | null;
          prezzo_gasolio?: number | null;
          prezzo_gpl?: number | null;
          prezzo_metano?: number | null;
          prossima_chiusura?: boolean;
          station_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'prezzi_distributore_modificato_da_fkey';
            columns: ['modificato_da'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'prezzi_distributore_station_id_fkey';
            columns: ['station_id'];
            isOneToOne: false;
            referencedRelation: 'fuel_stations';
            referencedColumns: ['station_id'];
          }
        ];
      };
      processed_requests: {
        Row: {
          created_at: string;
          endpoint: string;
          request_id: string;
        };
        Insert: {
          created_at?: string;
          endpoint: string;
          request_id: string;
        };
        Update: {
          created_at?: string;
          endpoint?: string;
          request_id?: string;
        };
        Relationships: [];
      };
      rate_limit_attempts: {
        Row: {
          attempts: number | null;
          created_at: string | null;
          endpoint: string;
          id: number;
          identifier: string;
          last_attempt: string;
          updated_at: string | null;
          window_start: string;
        };
        Insert: {
          attempts?: number | null;
          created_at?: string | null;
          endpoint: string;
          id?: number;
          identifier: string;
          last_attempt?: string;
          updated_at?: string | null;
          window_start?: string;
        };
        Update: {
          attempts?: number | null;
          created_at?: string | null;
          endpoint?: string;
          id?: number;
          identifier?: string;
          last_attempt?: string;
          updated_at?: string | null;
          window_start?: string;
        };
        Relationships: [];
      };
      shift_pistols: {
        Row: {
          closed_at_counter: number | null;
          created_at: string;
          id: number;
          liters_dispensed: number | null;
          opened_at_counter: number;
          pistola_id: number;
          shift_id: number;
          updated_at: string;
        };
        Insert: {
          closed_at_counter?: number | null;
          created_at?: string;
          id?: number;
          liters_dispensed?: number | null;
          opened_at_counter: number;
          pistola_id: number;
          shift_id: number;
          updated_at?: string;
        };
        Update: {
          closed_at_counter?: number | null;
          created_at?: string;
          id?: number;
          liters_dispensed?: number | null;
          opened_at_counter?: number;
          pistola_id?: number;
          shift_id?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'shift_pistols_pistola_id_fkey';
            columns: ['pistola_id'];
            isOneToOne: false;
            referencedRelation: 'pistole';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'shift_pistols_shift_id_fkey';
            columns: ['shift_id'];
            isOneToOne: false;
            referencedRelation: 'shifts';
            referencedColumns: ['id'];
          }
        ];
      };
      shifts: {
        Row: {
          closed_at: string | null;
          closing_data: Json | null;
          created_at: string;
          id: number;
          opened_at: string;
          opening_data: Json | null;
          operator_id: number;
          payment_method: string | null;
          shift_id: number | null;
          station_id: number;
          status: string;
          updated_at: string;
        };
        Insert: {
          closed_at?: string | null;
          closing_data?: Json | null;
          created_at?: string;
          id?: number;
          opened_at?: string;
          opening_data?: Json | null;
          operator_id: number;
          station_id: number;
          status?: string;
          updated_at?: string;
        };
        Update: {
          closed_at?: string | null;
          closing_data?: Json | null;
          created_at?: string;
          id?: number;
          opened_at?: string;
          opening_data?: Json | null;
          operator_id?: number;
          station_id?: number;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'shifts_operator_id_fkey';
            columns: ['operator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'shifts_station_id_fkey';
            columns: ['station_id'];
            isOneToOne: false;
            referencedRelation: 'fuel_stations';
            referencedColumns: ['station_id'];
          }
        ];
      };
      tank_pump_links: {
        Row: {
          created_at: string | null;
          id: number;
          is_active: boolean | null;
          mode: string;
          notes: string | null;
          priority: number | null;
          pump_id: number;
          ratio: number | null;
          station_id: number;
          tank_id: number;
        };
        Insert: {
          created_at?: string | null;
          id?: number;
          is_active?: boolean | null;
          mode?: string;
          notes?: string | null;
          priority?: number | null;
          pump_id: number;
          ratio?: number | null;
          station_id: number;
          tank_id: number;
        };
        Update: {
          created_at?: string | null;
          id?: number;
          is_active?: boolean | null;
          mode?: string;
          notes?: string | null;
          priority?: number | null;
          pump_id?: number;
          ratio?: number | null;
          station_id?: number;
          tank_id?: number;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'tank_pump_links_pump_id_fkey';
            columns: ['pump_id'];
            isOneToOne: false;
            referencedRelation: 'pistole';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tank_pump_links_station_id_fkey';
            columns: ['station_id'];
            isOneToOne: false;
            referencedRelation: 'fuel_stations';
            referencedColumns: ['station_id'];
          },
          {
            foreignKeyName: 'tank_pump_links_tank_id_fkey';
            columns: ['tank_id'];
            isOneToOne: false;
            referencedRelation: 'tanks';
            referencedColumns: ['id'];
          }
        ];
      };
      tank_pump_usages: {
        Row: {
          created_at: string | null;
          id: number;
          liters: number | null;
          mode: string;
          pump_id: number;
          ratio: number | null;
          shift_id: number;
          station_id: number;
          tank_id: number;
        };
        Insert: {
          created_at?: string | null;
          id?: number;
          liters?: number | null;
          mode?: string;
          pump_id: number;
          ratio?: number | null;
          shift_id: number;
          station_id: number;
          tank_id: number;
        };
        Update: {
          created_at?: string | null;
          id?: number;
          liters?: number | null;
          mode?: string;
          pump_id?: number;
          ratio?: number | null;
          shift_id?: number;
          station_id?: number;
          tank_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'tank_pump_usages_pump_id_fkey';
            columns: ['pump_id'];
            isOneToOne: false;
            referencedRelation: 'pistole';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tank_pump_usages_shift_id_fkey';
            columns: ['shift_id'];
            isOneToOne: false;
            referencedRelation: 'shifts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tank_pump_usages_station_id_fkey';
            columns: ['station_id'];
            isOneToOne: false;
            referencedRelation: 'fuel_stations';
            referencedColumns: ['station_id'];
          },
          {
            foreignKeyName: 'tank_pump_usages_tank_id_fkey';
            columns: ['tank_id'];
            isOneToOne: false;
            referencedRelation: 'tanks';
            referencedColumns: ['id'];
          }
        ];
      };
      tank_readings: {
        Row: {
          created_at: string | null;
          id: number;
          level_mm: number | null;
          liters: number | null;
          reading_type: string | null;
          shift_id: number | null;
          tank_id: number | null;
        };
        Insert: {
          created_at?: string | null;
          id?: number;
          level_mm?: number | null;
          liters?: number | null;
          reading_type?: string | null;
          shift_id?: number | null;
          tank_id?: number | null;
        };
        Update: {
          created_at?: string | null;
          id?: number;
          level_mm?: number | null;
          liters?: number | null;
          reading_type?: string | null;
          shift_id?: number | null;
          tank_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'tank_readings_shift_id_fkey';
            columns: ['shift_id'];
            isOneToOne: false;
            referencedRelation: 'opening_shift_deprecated';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tank_readings_tank_id_fkey';
            columns: ['tank_id'];
            isOneToOne: false;
            referencedRelation: 'tanks';
            referencedColumns: ['id'];
          }
        ];
      };
      tanks: {
        Row: {
          capacity: number | null;
          created_at: string | null;
          fuel_type: string;
          id: number;
          name: string;
          station_id: number | null;
          updated_at: string | null;
        };
        Insert: {
          capacity?: number | null;
          created_at?: string | null;
          fuel_type: string;
          id?: number;
          name: string;
          station_id?: number | null;
          updated_at?: string | null;
        };
        Update: {
          capacity?: number | null;
          created_at?: string | null;
          fuel_type?: string;
          id?: number;
          name?: string;
          station_id?: number | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'tanks_station_id_fkey';
            columns: ['station_id'];
            isOneToOne: false;
            referencedRelation: 'fuel_stations';
            referencedColumns: ['station_id'];
          }
        ];
      };
      targhe_cliente: {
        Row: {
          cliente_id: number;
          id: number;
          targa: string;
        };
        Insert: {
          cliente_id: number;
          id?: number;
          targa: string;
        };
        Update: {
          cliente_id?: number;
          id?: number;
          targa?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'targhe_cliente_cliente_id_fkey';
            columns: ['cliente_id'];
            isOneToOne: false;
            referencedRelation: 'clienti_fatturazione';
            referencedColumns: ['id'];
          }
        ];
      };
      ui_settings: {
        Row: {
          key: string;
          updated_at: string | null;
          updated_by: number | null;
          value: string | null;
        };
        Insert: {
          key: string;
          updated_at?: string | null;
          updated_by?: number | null;
          value?: string | null;
        };
        Update: {
          key?: string;
          updated_at?: string | null;
          updated_by?: number | null;
          value?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'ui_settings_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['user_id'];
          }
        ];
      };
      user_dashboard_config: {
        Row: {
          created_at: string | null;
          grid_columns: number | null;
          kpi_layout: Json;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          grid_columns?: number | null;
          kpi_layout?: Json;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          grid_columns?: number | null;
          kpi_layout?: Json;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      user_stations: {
        Row: {
          assigned_at: string | null;
          created_by_auth: string | null;
          station_id: number;
          user_id: number;
        };
        Insert: {
          assigned_at?: string | null;
          created_by_auth?: string | null;
          station_id: number;
          user_id: number;
        };
        Update: {
          assigned_at?: string | null;
          created_by_auth?: string | null;
          station_id?: number;
          user_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'user_stations_station_id_fkey';
            columns: ['station_id'];
            isOneToOne: false;
            referencedRelation: 'fuel_stations';
            referencedColumns: ['station_id'];
          },
          {
            foreignKeyName: 'user_stations_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['user_id'];
          }
        ];
      };
      users: {
        Row: {
          created_at: string | null;
          created_by_auth: string | null;
          email: string;
          full_name: string | null;
          is_active: boolean | null;
          role: string;
          updated_at: string | null;
          user_id: number;
          username: string;
        };
        Insert: {
          created_at?: string | null;
          created_by_auth?: string | null;
          email: string;
          full_name?: string | null;
          is_active?: boolean | null;
          role: string;
          updated_at?: string | null;
          user_id?: number;
          username: string;
        };
        Update: {
          created_at?: string | null;
          created_by_auth?: string | null;
          email?: string;
          full_name?: string | null;
          is_active?: boolean | null;
          role?: string;
          updated_at?: string | null;
          user_id?: number;
          username?: string;
        };
        Relationships: [];
      };
      voucher_batches: {
        Row: {
          created_at: string;
          customer_name: string | null;
          description: string | null;
          expiration_date: string | null;
          id: string;
          station_id: number | null;
        };
        Insert: {
          created_at?: string;
          customer_name?: string | null;
          description?: string | null;
          expiration_date?: string | null;
          id?: string;
          station_id?: number | null;
        };
        Update: {
          created_at?: string;
          customer_name?: string | null;
          description?: string | null;
          expiration_date?: string | null;
          id?: string;
          station_id?: number | null;
        };
        Relationships: [];
      };
      vouchers: {
        Row: {
          amount: number;
          batch_id: string | null;
          code: string;
          created_at: string;
          expiration_date: string | null;
          id: string;
          redeemed_at: string | null;
          redeemed_by: string | null;
          serial_number: number | null;
          shift_id: number | null;
          station_id: number | null;
          status: string | null;
        };
        Insert: {
          amount: number;
          batch_id?: string | null;
          code: string;
          created_at?: string;
          expiration_date?: string | null;
          id?: string;
          redeemed_at?: string | null;
          redeemed_by?: string | null;
          serial_number?: number | null;
          station_id?: number | null;
          status?: string | null;
        };
        Update: {
          amount?: number;
          batch_id?: string | null;
          code?: string;
          created_at?: string;
          expiration_date?: string | null;
          id?: string;
          redeemed_at?: string | null;
          redeemed_by?: string | null;
          serial_number?: number | null;
          station_id?: number | null;
          status?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'vouchers_batch_id_fkey';
            columns: ['batch_id'];
            isOneToOne: false;
            referencedRelation: 'voucher_batches';
            referencedColumns: ['id'];
          }
        ];
      };
    };
    punti_riscatti: {
      Row: {
        created_at: string;
        id: number;
        importo: number;
        operator_id: number;
        shift_id: number | null;
        station_id: number;
      };
      Insert: {
        created_at?: string;
        id?: number;
        importo: number;
        operator_id: number;
        shift_id?: number | null;
        station_id: number;
      };
      Update: {
        created_at?: string;
        id?: number;
        importo?: number;
        operator_id?: number;
        shift_id?: number | null;
        station_id?: number;
      };
      Relationships: [
        {
          foreignKeyName: 'punti_riscatti_shift_id_fkey';
          columns: ['shift_id'];
          isOneToOne: false;
          referencedRelation: 'shifts';
          referencedColumns: ['id'];
        }
      ];
    };
    Views: {
      calculation_modules_with_active: {
        Row: {
          active_version_id: string | null;
          created_at: string | null;
          created_by: string | null;
          description: string | null;
          module_id: string | null;
          name: string | null;
          published_at: string | null;
          scope: string | null;
          status: string | null;
          version: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      create_credit_transaction: {
        Args: {
          p_amount: number;
          p_customer_name: string;
          p_notes: string;
          p_product: string;
          p_request_id: string;
          p_shift_id?: number | null | undefined;
          p_station_id: number;
        };
        Returns: Json;
      };
      register_credit_payment: {
        Args: {
          p_amount: number;
          p_customer_id: number;
          p_method: string;
          p_request_id: string;
          p_shift_id?: number | null | undefined;
          p_station_id: number;
        };
        Returns: Json;
      };
      admin_assign_station: {
        Args: { p_station_id?: number; p_user_id: number };
        Returns: undefined;
      };
      admin_delete_closure: { Args: { closure_id: number }; Returns: undefined };
      admin_delete_user: { Args: { p_user_id: number }; Returns: undefined };
      admin_update_price: {
        Args: {
          p_benzina: number;
          p_data_validita?: string;
          p_gasolio: number;
          p_station_id: number;
        };
        Returns: undefined;
      };
      can_write_table: { Args: { tbl: string }; Returns: boolean };
      check_rate_limit: {
        Args: {
          p_endpoint: string;
          p_identifier: string;
          p_max_attempts?: number;
          p_window_seconds?: number;
        };
        Returns: Json;
      };
      cleanup_old_rate_limits: { Args: never; Returns: number };
      create_index_if_column_exists: {
        Args: {
          p_column_name: string;
          p_index_name: string;
          p_table_reg: unknown;
        };
        Returns: undefined;
      };
      current_user_id: { Args: never; Returns: number };
      current_user_station_ids: { Args: never; Returns: number[] };
      get_current_user_id: { Args: never; Returns: number };
      is_admin: { Args: never; Returns: boolean };
      is_operator: { Args: never; Returns: boolean };
      is_station_operator: { Args: { station_id: number }; Returns: boolean };
      redeem_voucher_validated: {
        Args: {
          p_operator_id: string;
          p_request_id?: string | undefined;
          p_shift_id?: number | null | undefined;
          p_station_id: number;
          p_voucher_code: string;
        };
        Returns: Json;
      };
      open_shift: {
        Args: {
          p_station_id: number;
          p_opening_data: Json;
          p_pistol_counters: Json;
          p_tank_levels?: Json;
          p_request_id?: string;
        };
        Returns: Json;
      };
      get_last_pump_counters: {
        Args: { p_station_id: number };
        Returns: {
          pistola_id: number;
          closed_at_counter: number;
        }[];
      };
      reset_rate_limit: {
        Args: { p_endpoint: string; p_identifier: string };
        Returns: boolean;
      };
      create_movement_v2: {
        Args: {
          p_created_at?: string | undefined;
          p_descrizione: string;
          p_importo: number;
          p_operator_id: number;
          p_payment_method: string;
          p_request_id?: string | undefined;
          p_shift_id?: number | null | undefined;
          p_station_id: number;
          p_tipo: string;
        };
        Returns: Json;
      };
      get_price_at: {
        Args: { p_at?: string; p_product: string; p_station_id: number };
        Returns: number;
      };
      register_punti_riscatto: {
        Args: {
          p_importo: number;
          p_operator_id: number;
          p_request_id?: string;
          p_shift_id?: number | null | undefined;
          p_station_id: number;
        };
        Returns: Json;
      };
      submit_shift_closure_v2: {
        Args: {
          p_closure_type?: string;
          p_final_counters?: Json;
          p_operator_cash?: number;
          p_operator_fleet?: number;
          p_operator_pos?: number;
          p_preview?: boolean;
          p_request_id?: string;
          p_self_cash_in?: number;
          p_self_cash_out?: number;
          p_self_fleet?: number;
          p_self_manager?: number;
          p_self_pos?: number;
          p_shift_id: number;
          p_station_id: number;
          p_tank_usage?: Json;
        };
        Returns: Json;
      };
      revert_last_closure: {
        Args: {
          p_shift_id: number;
          p_station_id: number;
        };
        Returns: Json;
      };
      submit_shift_closure: {
        Args: {
          p_closing_data: Json;
          p_final_counters?: Json;
          p_is_final: boolean;
          p_request_id?: string;
          p_shift_id: number;
          p_station_id: number;
          p_tank_usage?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {}
  }
} as const;
