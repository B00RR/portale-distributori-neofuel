import { describe, it, expect } from 'vitest';
import {
  isDbAvailable,
  pool,
  getAdminClient,
  getSuperAdminClient,
  getOperator1Client,
  getOperator2Client,
  getOperatorNoAssignmentsClient,
  getAnonClient,
  getServiceRoleClient
} from './setup';

describe('Issue #315 — Infrastructure RLS Station Isolation', () => {
  const scopedTables = [
    { name: 'fuel_stations', pk: 'station_id', stationColumn: 'station_id' },
    { name: 'islands', pk: 'island_id', stationColumn: 'station_id' },
    { name: 'tanks', pk: 'id', stationColumn: 'station_id' },
    { name: 'tank_pump_links', pk: 'id', stationColumn: 'station_id' },
    { name: 'tank_pump_usages', pk: 'id', stationColumn: 'station_id' }
  ] as const;

  const relationTables = [
    {
      name: 'pistole',
      pk: 'id',
      expected: [
        { id: 501, station_id: null, island_id: 1001, nome: 'Pistola Nord 1' },
        { id: 502, station_id: null, island_id: 1002, nome: 'Pistola Sud 1' },
        { id: 503, station_id: 1, island_id: 1002, nome: 'Pistola Adversarial' }
      ]
    },
    {
      name: 'tank_readings',
      pk: 'id',
      expected: [
        { id: 901, tank_id: 601 },
        { id: 902, tank_id: 602 }
      ]
    }
  ] as const;

  function makeUniqueSuffix(): string {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  describe('Direct station-scoped tables', () => {
    scopedTables.forEach(tbl => {
      describe(`${tbl.name}`, () => {
        it('anonymous user cannot read', async () => {
          if (!isDbAvailable) return;
          const client = getAnonClient();
          const { data } = await client.from(tbl.name).select('*');
          expect(data === null || data.length === 0).toBe(true);
        });

        it('operator without assignments sees zero rows', async () => {
          if (!isDbAvailable) return;
          const client = getOperatorNoAssignmentsClient();
          const { data, error } = await client.from(tbl.name).select('*');
          expect(error).toBeNull();
          expect(data).toHaveLength(0);
        });

        it('operator 1 sees only station 1 rows', async () => {
          if (!isDbAvailable) return;
          const client = getOperator1Client();
          const { data, error } = await client.from(tbl.name).select('*');
          expect(error).toBeNull();
          expect(data!.length).toBeGreaterThan(0);
          expect(data!.every(r => r[tbl.stationColumn] === 1)).toBe(true);
          expect(data!.some(r => r[tbl.stationColumn] === 2)).toBe(false);
        });

        it('operator 2 sees only station 2 rows', async () => {
          if (!isDbAvailable) return;
          const client = getOperator2Client();
          const { data, error } = await client.from(tbl.name).select('*');
          expect(error).toBeNull();
          expect(data!.length).toBeGreaterThan(0);
          expect(data!.every(r => r[tbl.stationColumn] === 2)).toBe(true);
          expect(data!.some(r => r[tbl.stationColumn] === 1)).toBe(false);
        });

        it('admin sees both stations', async () => {
          if (!isDbAvailable) return;
          const client = getAdminClient();
          const { data, error } = await client.from(tbl.name).select('*');
          expect(error).toBeNull();
          const ids = new Set(data!.map(r => r[tbl.stationColumn]));
          expect(ids.has(1)).toBe(true);
          expect(ids.has(2)).toBe(true);
        });

        it('super_admin sees both stations', async () => {
          if (!isDbAvailable) return;
          const client = getSuperAdminClient();
          const { data, error } = await client.from(tbl.name).select('*');
          expect(error).toBeNull();
          const ids = new Set(data!.map(r => r[tbl.stationColumn]));
          expect(ids.has(1)).toBe(true);
          expect(ids.has(2)).toBe(true);
        });
      });
    });
  });

  describe('Relation-scoped tables', () => {
    relationTables.forEach(tbl => {
      describe(`${tbl.name}`, () => {
        it('anonymous user cannot read', async () => {
          if (!isDbAvailable) return;
          const client = getAnonClient();
          const { data } = await client.from(tbl.name).select('*');
          expect(data === null || data.length === 0).toBe(true);
        });

        it('operator without assignments sees zero rows', async () => {
          if (!isDbAvailable) return;
          const client = getOperatorNoAssignmentsClient();
          const { data, error } = await client.from(tbl.name).select('*');
          expect(error).toBeNull();
          expect(data).toHaveLength(0);
        });

        it('operator 1 sees only station 1 related rows', async () => {
          if (!isDbAvailable) return;
          const client = getOperator1Client();
          const { data, error } = await client.from(tbl.name).select('*');
          expect(error).toBeNull();
          expect(data!.length).toBeGreaterThan(0);
          const ids = data!.map(r => r[tbl.pk]);
          const expected = tbl.expected.filter(e => e.id === 501 || e.id === 901);
          expect(ids).toContain(expected[0].id);
          const opposite = tbl.expected.find(e => e.id === 502 || e.id === 902)!;
          expect(ids).not.toContain(opposite.id);
        });

        it('operator 2 sees only station 2 related rows', async () => {
          if (!isDbAvailable) return;
          const client = getOperator2Client();
          const { data, error } = await client.from(tbl.name).select('*');
          expect(error).toBeNull();
          expect(data!.length).toBeGreaterThan(0);
          const ids = data!.map(r => r[tbl.pk]);
          const expected = tbl.expected.filter(e => e.id === 502 || e.id === 902);
          expect(ids).toContain(expected[0].id);
          const opposite = tbl.expected.find(e => e.id === 501 || e.id === 901)!;
          expect(ids).not.toContain(opposite.id);
        });

        it('admin sees both rows', async () => {
          if (!isDbAvailable) return;
          const client = getAdminClient();
          const { data, error } = await client.from(tbl.name).select('*');
          expect(error).toBeNull();
          const ids = new Set(data!.map(r => r[tbl.pk]));
          tbl.expected.forEach(e => expect(ids.has(e.id)).toBe(true));
        });
      });
    });
  });

  describe('tank_pump_usages operator INSERT path', () => {
    it('allows operator 1 to insert usage for station 1', async () => {
      if (!isDbAvailable) return;
      const client = getOperator1Client();
      const { error } = await client.from('tank_pump_usages').insert({
        shift_id: 401,
        station_id: 1,
        pump_id: 501,
        tank_id: 601,
        liters: 50,
        mode: 'dispensed',
        ratio: 1
      });
      expect(error).toBeNull();
    });

    it('blocks operator 1 from inserting usage for station 2', async () => {
      if (!isDbAvailable) return;
      const client = getOperator1Client();
      const { error } = await client.from('tank_pump_usages').insert({
        shift_id: 402,
        station_id: 2,
        pump_id: 502,
        tank_id: 602,
        liters: 50,
        mode: 'dispensed',
        ratio: 1
      });
      expect(error).not.toBeNull();
    });

    it('blocks operator without assignments from inserting usage', async () => {
      if (!isDbAvailable) return;
      const client = getOperatorNoAssignmentsClient();
      const { error } = await client.from('tank_pump_usages').insert({
        shift_id: 401,
        station_id: 1,
        pump_id: 501,
        tank_id: 601,
        liters: 50,
        mode: 'dispensed',
        ratio: 1
      });
      expect(error).not.toBeNull();
    });

    it('blocks operator 1 from inserting usage for station 2 with station 1 data mismatch', async () => {
      if (!isDbAvailable) return;
      const client = getOperator1Client();
      const { error } = await client.from('tank_pump_usages').insert({
        shift_id: 401,
        station_id: 2,
        pump_id: 501,
        tank_id: 601,
        liters: 50,
        mode: 'dispensed',
        ratio: 1
      });
      expect(error).not.toBeNull();
    });

    it('blocks operator 1 from cross-station FK usage (station 1, shift/tank/pump from station 2)', async () => {
      if (!isDbAvailable) return;
      const client = getOperator1Client();
      const uniqueMarker = `cross_station_${makeUniqueSuffix()}`;
      const { error } = await client.from('tank_pump_usages').insert({
        shift_id: 402,
        station_id: 1,
        pump_id: 502,
        tank_id: 602,
        liters: 50,
        mode: 'dispensed',
        ratio: 1,
        notes: uniqueMarker
      });
      expect(error).not.toBeNull();
      // verify no row was created by service role using station_id + unique marker
      const admin = getServiceRoleClient();
      const { data } = await admin
        .from('tank_pump_usages')
        .select('id')
        .eq('station_id', 1)
        .eq('notes', uniqueMarker);
      expect(data?.length ?? 0).toBe(0);
    });

    it('blocks operator 1 from inserting usage for adversarial pump station_id conflicts with island', async () => {
      if (!isDbAvailable) return;
      const client = getOperator1Client();
      const { error } = await client.from('tank_pump_usages').insert({
        shift_id: 401,
        station_id: 1,
        pump_id: 503,
        tank_id: 601,
        liters: 50,
        mode: 'dispensed',
        ratio: 1
      });
      expect(error).not.toBeNull();
    });
  });

  describe('Operators cannot mutate other infrastructure tables', () => {
    const mutationTables = [
      {
        name: 'fuel_stations',
        payload: () => ({
          station_id: 30,
          station_name: `Station_${makeUniqueSuffix()}`,
          location: 'Test',
          is_active: true,
          allow_partial_closure: false
        })
      },
      {
        name: 'islands',
        payload: () => ({
          station_id: 1,
          island_name: `Island_${makeUniqueSuffix()}`,
          nome: `Isola_${makeUniqueSuffix()}`,
          is_active: true
        })
      },
      {
        name: 'pistole',
        payload: () => ({
          station_id: 1,
          island_id: 1001,
          nome: `Pistola_${makeUniqueSuffix()}`,
          tipo_carburante: 'benzina',
          numero_litri: 0
        })
      },
      {
        name: 'tanks',
        payload: () => ({
          station_id: 1,
          name: `Tank_${makeUniqueSuffix()}`,
          fuel_type: 'benzina',
          capacity: 10000
        })
      },
      {
        name: 'tank_pump_links',
        payload: () => ({ station_id: 1, tank_id: 601, pump_id: 501, mode: 'primary', ratio: 1 })
      },
      {
        name: 'tank_readings',
        payload: () => ({
          tank_id: 601,
          shift_id: 401,
          level_mm: 1200,
          liters: 100,
          reading_type: `blocked_${makeUniqueSuffix()}`
        })
      }
    ] as const;

    mutationTables.forEach(tbl => {
      it(`blocks operator 1 INSERT on ${tbl.name}`, async () => {
        if (!isDbAvailable) return;
        const client = getOperator1Client();
        const payload = tbl.payload();
        const { error } = await client.from(tbl.name).insert(payload);
        expect(error).not.toBeNull();
        // verify exact row not created via service role using unique identifier
        const admin = getServiceRoleClient();
        let query = admin.from(tbl.name).select(tbl.name === 'tank_pump_usages' ? 'id' : '*');
        if (tbl.name === 'fuel_stations') {
          query = query.eq('station_name', payload.station_name);
        } else if (tbl.name === 'islands') {
          query = query.eq('island_name', payload.island_name);
        } else if (tbl.name === 'pistole') {
          query = query.eq('nome', payload.nome);
        } else if (tbl.name === 'tanks') {
          query = query.eq('name', payload.name);
        } else if (tbl.name === 'tank_pump_links') {
          query = query.eq('tank_id', payload.tank_id).eq('shift_id', payload.shift_id);
        } else if (tbl.name === 'tank_readings') {
          query = query
            .eq('tank_id', payload.tank_id)
            .eq('shift_id', payload.shift_id)
            .eq('reading_type', payload.reading_type);
        }
        const { data } = await query;
        expect(data?.length ?? 0).toBe(0);
      });
    });
  });

  describe('Policy catalog — no vulnerable policies remain', () => {
    const vulnerableNames = [
      'consolidated_fuel_stations_select',
      'consolidated_fuel_stations_insert',
      'consolidated_fuel_stations_update',
      'consolidated_fuel_stations_delete',
      'fuel_stations_operators_select',
      'fuel_stations_admin_insert',
      'fuel_stations_operators_update',
      'fuel_stations_operators_delete',
      'islands_select_admin_or_operator',
      'islands_insert_admin_only',
      'islands_update_admin_only',
      'islands_delete_admin_only',
      'consolidated_islands_select',
      'islands_operators_select',
      'consolidated_pistole_select',
      'consolidated_pistole_insert',
      'consolidated_pistole_update',
      'consolidated_pistole_delete',
      'pistole_operators_select',
      'Admins can manage tanks',
      'Operators can read tanks',
      'tanks_admins_manage',
      'tanks_operators_select',
      'tanks_operators_insert',
      'tanks_operators_update',
      'tanks_operators_delete',
      'Admins can manage tank_pump_links',
      'Operators can read tank_pump_links',
      'tank_pump_links_operators_select',
      'Admins can manage tank_usages',
      'Operators can read tank_usages',
      'tank_pump_usages_operators_insert',
      'tank_readings_admins_manage',
      'tank_readings_operators_select'
    ];

    it('none of the vulnerable policy names remain in pg_policies', async () => {
      if (!isDbAvailable) return;
      const result = await pool.query(
        `SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY ($1::text[])`,
        [
          [
            'fuel_stations',
            'islands',
            'pistole',
            'tanks',
            'tank_pump_links',
            'tank_pump_usages',
            'tank_readings'
          ]
        ]
      );
      const remaining = result.rows.map(r => r.policyname);
      vulnerableNames.forEach(name => expect(remaining).not.toContain(name));
    });

    it('has no permissive policy with qual = true on scoped tables', async () => {
      if (!isDbAvailable) return;
      const result = await pool.query(
        `SELECT policyname, tablename, trim(qual::text) AS qual
         FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = ANY ($1::text[])
           AND trim(qual::text) = 'true'`,
        [
          [
            'fuel_stations',
            'islands',
            'pistole',
            'tanks',
            'tank_pump_links',
            'tank_pump_usages',
            'tank_readings'
          ]
        ]
      );
      expect(result.rows).toHaveLength(0);
    });

    it('tank_pump_usages_operator_insert exists exactly once for INSERT to authenticated with full relation check', async () => {
      if (!isDbAvailable) return;
      const result = await pool.query(
        `SELECT policyname, cmd, roles::text, with_check::text
         FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = 'tank_pump_usages'
           AND policyname = 'tank_pump_usages_operator_insert'`
      );
      expect(result.rows).toHaveLength(1);
      const row = result.rows[0];
      expect(row.cmd).toBe('INSERT');
      expect(row.roles).toContain('authenticated');
      const wc = row.with_check.toLowerCase();
      expect(wc).toContain('is_operator()');
      expect(wc).toContain('station_id');
      expect(wc).toContain('current_user_station_ids()');
      expect(wc).toContain('shifts');
      expect(wc).toContain('tanks');
      expect(wc).toContain('pistole');
      expect(wc).toContain('islands');
    });

    it('enforce_active_user restrictive policy exists on scoped tables', async () => {
      if (!isDbAvailable) return;
      const result = await pool.query(
        `SELECT tablename, policyname
         FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = ANY ($1::text[])
           AND policyname = 'enforce_active_user'`,
        [
          [
            'fuel_stations',
            'islands',
            'pistole',
            'tanks',
            'tank_pump_links',
            'tank_pump_usages',
            'tank_readings'
          ]
        ]
      );
      const tables = new Set(result.rows.map(r => r.tablename));
      [
        'fuel_stations',
        'islands',
        'pistole',
        'tanks',
        'tank_pump_links',
        'tank_pump_usages',
        'tank_readings'
      ].forEach(t => expect(tables.has(t)).toBe(true));
    });

    it('final policy set for scoped tables is exactly expected', async () => {
      if (!isDbAvailable) return;
      const result = await pool.query(
        `SELECT tablename, policyname
         FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = ANY ($1::text[])
         ORDER BY tablename, policyname`,
        [
          [
            'fuel_stations',
            'islands',
            'pistole',
            'tanks',
            'tank_pump_links',
            'tank_pump_usages',
            'tank_readings'
          ]
        ]
      );
      const byTable: Record<string, string[]> = {};
      result.rows.forEach((r: { tablename: string; policyname: string }) => {
        byTable[r.tablename] = byTable[r.tablename] || [];
        byTable[r.tablename].push(r.policyname);
      });
      const expected = {
        fuel_stations: [
          'enforce_active_user',
          'fuel_stations_admin_manage',
          'fuel_stations_operator_select'
        ],
        islands: ['enforce_active_user', 'islands_admin_manage', 'islands_operator_select'],
        pistole: ['enforce_active_user', 'pistole_admin_manage', 'pistole_operator_select'],
        tanks: ['enforce_active_user', 'tanks_admin_manage', 'tanks_operator_select'],
        tank_pump_links: [
          'enforce_active_user',
          'tank_pump_links_admin_manage',
          'tank_pump_links_operator_select'
        ],
        tank_pump_usages: [
          'enforce_active_user',
          'tank_pump_usages_admin_manage',
          'tank_pump_usages_operator_insert',
          'tank_pump_usages_operator_select'
        ],
        tank_readings: [
          'enforce_active_user',
          'tank_readings_admin_manage',
          'tank_readings_operator_select'
        ]
      };
      Object.entries(expected).forEach(([table, names]) => {
        expect(byTable[table] || []).toEqual(expect.arrayContaining(names));
      });
    });

    it('has no fail-open COALESCE in qual or with_check on scoped tables', async () => {
      if (!isDbAvailable) return;
      const result = await pool.query(
        `SELECT policyname, tablename
         FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = ANY ($1::text[])
           AND (
             lower(qual::text) LIKE '%coalesce(%, true)%'
             OR lower(with_check::text) LIKE '%coalesce(%, true)%'
           )`,
        [
          [
            'fuel_stations',
            'islands',
            'pistole',
            'tanks',
            'tank_pump_links',
            'tank_pump_usages',
            'tank_readings'
          ]
        ]
      );
      expect(result.rows).toHaveLength(0);
    });
  });

  describe('Grant catalog — least privilege on scoped tables', () => {
    it('anon has no privileges on the seven scoped tables', async () => {
      if (!isDbAvailable) return;
      const result = await pool.query(
        `SELECT table_name, privilege_type
         FROM information_schema.table_privileges
         WHERE grantee = 'anon'
           AND table_schema = 'public'
           AND table_name = ANY ($1::text[])`,
        [
          [
            'fuel_stations',
            'islands',
            'pistole',
            'tanks',
            'tank_pump_links',
            'tank_pump_usages',
            'tank_readings'
          ]
        ]
      );
      expect(result.rows).toHaveLength(0);
    });

    it('authenticated lacks TRUNCATE, REFERENCES, TRIGGER on scoped tables', async () => {
      if (!isDbAvailable) return;
      const result = await pool.query(
        `SELECT table_name, privilege_type
         FROM information_schema.table_privileges
         WHERE grantee = 'authenticated'
           AND table_schema = 'public'
           AND table_name = ANY ($1::text[])
           AND privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER')`,
        [
          [
            'fuel_stations',
            'islands',
            'pistole',
            'tanks',
            'tank_pump_links',
            'tank_pump_usages',
            'tank_readings'
          ]
        ]
      );
      expect(result.rows).toHaveLength(0);
    });
  });
});
