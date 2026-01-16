-- ==========================================
-- EDGE FUNCTIONS VALIDATION SETUP
-- Schema e funzioni per validazione server-side
-- ==========================================

-- ============================================
-- 1. VALIDAZIONE CREAZIONE CREDITI
-- ============================================

-- Funzione per validare e creare un nuovo credito
CREATE OR REPLACE FUNCTION create_credit_validated(
    p_station_id INTEGER,
    p_operator_id UUID,
    p_cliente TEXT,
    p_importo NUMERIC,
    p_telefono TEXT DEFAULT NULL,
    p_descrizione TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_credit_id INTEGER;
    v_existing_id INTEGER;
BEGIN
    -- Validazioni
    IF p_importo <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Importo deve essere maggiore di zero');
    END IF;
    
    IF p_cliente IS NULL OR trim(p_cliente) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nome cliente obbligatorio');
    END IF;
    
    -- Verifica se esiste già un cliente con lo stesso nome
    SELECT id INTO v_existing_id
    FROM crediti_clienti
    WHERE station_id = p_station_id AND lower(trim(cliente)) = lower(trim(p_cliente))
    LIMIT 1;
    
    IF v_existing_id IS NOT NULL THEN
        -- Aggiorna cliente esistente
        UPDATE crediti_clienti
        SET saldo = saldo + p_importo,
            updated_at = NOW()
        WHERE id = v_existing_id
        RETURNING id INTO v_credit_id;
    ELSE
        -- Crea nuovo cliente
        INSERT INTO crediti_clienti (station_id, cliente, saldo, telefono, created_at)
        VALUES (p_station_id, trim(p_cliente), p_importo, p_telefono, NOW())
        RETURNING id INTO v_credit_id;
    END IF;
    
    -- Log movimento cassa
    INSERT INTO movimenti_cassa (station_id, operator_id, tipo, importo, descrizione, created_at)
    VALUES (p_station_id, p_operator_id, 'credito', p_importo, COALESCE(p_descrizione, 'Nuovo credito: ' || p_cliente), NOW());
    
    RETURN jsonb_build_object('success', true, 'credit_id', v_credit_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 2. VALIDAZIONE REDEMPTION VOUCHER
-- ============================================

CREATE OR REPLACE FUNCTION redeem_voucher_validated(
    p_voucher_code TEXT,
    p_station_id INTEGER,
    p_operator_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_voucher RECORD;
BEGIN
    -- Trova voucher con lock pessimistico per prevenire race conditions
    SELECT * INTO v_voucher
    FROM vouchers
    WHERE code = upper(trim(p_voucher_code)) OR code LIKE upper(trim(p_voucher_code)) || '%'
    FOR UPDATE  -- Lock pessimistico: blocca la riga fino alla fine della transazione
    LIMIT 1;
    
    IF v_voucher IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Voucher non trovato');
    END IF;
    
    -- Verifica stato
    IF v_voucher.status = 'redeemed' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Voucher già riscattato', 'redeemed_at', v_voucher.redeemed_at);
    END IF;
    
    IF v_voucher.status = 'expired' OR (v_voucher.expiration_date IS NOT NULL AND v_voucher.expiration_date < CURRENT_DATE) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Voucher scaduto');
    END IF;
    
    IF v_voucher.status = 'void' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Voucher annullato');
    END IF;
    
    -- Riscatta
    UPDATE vouchers
    SET status = 'redeemed', redeemed_at = NOW()
    WHERE id = v_voucher.id;
    
    -- Registra movimento
    INSERT INTO movimenti_cassa (station_id, operator_id, tipo, importo, descrizione, created_at)
    VALUES (p_station_id, p_operator_id, 'voucher', v_voucher.amount, 'Riscatto Voucher ' || v_voucher.code, NOW());
    
    RETURN jsonb_build_object('success', true, 'amount', v_voucher.amount, 'code', v_voucher.code);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. VALIDAZIONE CHIUSURA TURNO
-- ============================================

CREATE OR REPLACE FUNCTION validate_shift_closure(
    p_shift_id UUID,
    p_closing_data JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_shift RECORD;
    v_total_liters NUMERIC;
    v_counter_errors TEXT[];
BEGIN
    -- Carica shift
    SELECT * INTO v_shift FROM shifts WHERE id = p_shift_id;
    
    IF v_shift IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Turno non trovato');
    END IF;
    
    IF v_shift.closed_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Turno già chiuso');
    END IF;
    
    -- Verifica contatori (esempio: tutti devono essere >= contatori apertura)
    -- Logica specifica da implementare in base ai requisiti
    
    RETURN jsonb_build_object('success', true, 'shift_id', p_shift_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant per funzioni
GRANT EXECUTE ON FUNCTION create_credit_validated TO authenticated;
GRANT EXECUTE ON FUNCTION redeem_voucher_validated TO authenticated;
GRANT EXECUTE ON FUNCTION validate_shift_closure TO authenticated;

COMMENT ON FUNCTION create_credit_validated IS 'Validazione server-side per creazione crediti';
COMMENT ON FUNCTION redeem_voucher_validated IS 'Validazione server-side per riscatto voucher';
COMMENT ON FUNCTION validate_shift_closure IS 'Validazione server-side per chiusura turno';
