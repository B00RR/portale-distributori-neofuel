-- ==========================================
-- Test Database Seed Script
-- Purpose: Populate database with test data for E2E tests
-- ==========================================

-- Step 1: Create Test Users
-- Note: These will be created via Supabase Auth UI or Admin API
-- admin@neofuel.com (password: test123) - Role: admin
-- operator@neofuel.com (password: test123) - Role: operator
-- accounting@neofuel.com (password: test123) - Role: accounting
-- billing@neofuel.com (password: test123) - Role: billing

-- Step 2: Insert Test Fuel Stations
INSERT INTO fuel_stations (station_name, address, city, cap, provincia) 
VALUES 
    ('Stazione Test Nord', 'Via Test 1', 'Milano', '20100', 'MI'),
    ('Stazione Test Sud', 'Via Test 2', 'Roma', '00100', 'RM')
ON CONFLICT DO NOTHING;

-- Step 3: Assign Stations to Test Users
-- (Replace user_id with actual UUIDs after creating users in Supabase Auth)
-- Example:
-- INSERT INTO user_stations (user_id, station_id) 
-- SELECT '00000000-0000-0000-0000-000000000001', station_id 
-- FROM fuel_stations WHERE station_name = 'Stazione Test Nord';

-- Step 4: Create Test Fuel Prices
WITH test_station AS (
    SELECT station_id FROM fuel_stations WHERE station_name = 'Stazione Test Nord' LIMIT 1
)
INSERT INTO fuel_prices (station_id, fuel_type, price_buy, price_sell, effective_date)
SELECT 
    station_id,
    'benzina' as fuel_type,
    1.50 as price_buy,
    1.80 as price_sell,
    CURRENT_DATE as effective_date
FROM test_station
UNION ALL
SELECT 
    station_id,
    'gasolio',
    1.40,
    1.70,
    CURRENT_DATE
FROM test_station
ON CONFLICT DO NOTHING;

-- Step 5: Create Test Voucher Batch
WITH test_batch AS (
    INSERT INTO voucher_batches (
        customer_name, 
        total_quantity, 
        amount_per_voucher,
        expiration_date,
        created_at
    ) VALUES (
        'Test Customer',
        10,
        50.00,
        CURRENT_DATE + INTERVAL '30 days',
        NOW()
    )
    RETURNING batch_id
)
-- Step 6: Generate Test Vouchers
INSERT INTO vouchers (batch_id, code, amount, status, expiration_date)
SELECT 
    batch_id,
    'TEST' || LPAD(generate_series::text, 3, '0') as code,
    50.00 as amount,
    'active' as status,
    CURRENT_DATE + INTERVAL '30 days' as expiration_date
FROM test_batch, generate_series(1, 10);

-- Step 7: Create a redeemable test voucher for E2E
INSERT INTO vouchers (code, amount, status, expiration_date)
VALUES ('TEST123', 100.00, 'active', CURRENT_DATE + INTERVAL '90 days')
ON CONFLICT (code) DO NOTHING;

-- Step 8: Create Test Pistols (Fuel Guns)
WITH test_station AS (
    SELECT station_id FROM fuel_stations WHERE station_name = 'Stazione Test Nord' LIMIT 1
)
INSERT INTO pistole (station_id, numero_pistola, tipo_carburante, ultima_lettura)
SELECT 
    station_id,
    generate_series as numero_pistola,
    CASE 
        WHEN generate_series % 2 = 0 THEN 'benzina'
        ELSE 'gasolio'
    END as tipo_carburante,
    1000.00 * generate_series as ultima_lettura
FROM test_station, generate_series(1, 6);

-- Verification Queries
-- Run these to verify test data was created correctly:

-- SELECT * FROM fuel_stations WHERE station_name LIKE 'Stazione Test%';
-- SELECT * FROM vouchers WHERE code LIKE 'TEST%';
-- SELECT * FROM pistole WHERE station_id IN (SELECT station_id FROM fuel_stations WHERE station_name = 'Stazione Test Nord');
-- SELECT * FROM fuel_prices WHERE station_id IN (SELECT station_id FROM fuel_stations WHERE station_name LIKE 'Stazione Test%');
