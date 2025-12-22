-- ==========================================
-- AUDIT LOG SYSTEM
-- Schema SQL per tracciare azioni amministrative
-- ==========================================

-- Tabella principale audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Chi ha eseguito l'azione
    user_id UUID REFERENCES auth.users(id),
    user_email TEXT,
    user_role TEXT,
    
    -- Cosa è stato fatto
    action TEXT NOT NULL, -- 'create', 'update', 'delete', 'login', 'logout', etc.
    entity_type TEXT NOT NULL, -- 'user', 'station', 'shift', 'voucher', 'credit', etc.
    entity_id TEXT, -- ID dell'entità modificata
    
    -- Dettagli
    old_values JSONB, -- Valori prima della modifica
    new_values JSONB, -- Valori dopo della modifica
    metadata JSONB, -- Informazioni aggiuntive (IP, user agent, etc.)
    
    -- Contesto
    station_id INTEGER REFERENCES fuel_stations(station_id),
    session_id TEXT,
    
    -- Timestamp
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indici per query veloci
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_station ON audit_logs(station_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- RLS Policies
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Solo super_admin può vedere tutti i log
CREATE POLICY "Super admin can view all audit logs"
ON audit_logs FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM users 
        WHERE users.user_id = auth.uid() 
        AND users.role = 'super_admin'
    )
);

-- Admin può vedere i log della propria stazione
CREATE POLICY "Admin can view station audit logs"
ON audit_logs FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM users 
        WHERE users.user_id = auth.uid() 
        AND users.role = 'admin'
        AND users.station_id = audit_logs.station_id
    )
);

-- Nessuno può modificare o cancellare i log (immutabilità)
-- INSERT solo via trigger o funzione server-side

-- Funzione helper per inserire log
CREATE OR REPLACE FUNCTION log_audit_event(
    p_user_id UUID,
    p_action TEXT,
    p_entity_type TEXT,
    p_entity_id TEXT DEFAULT NULL,
    p_old_values JSONB DEFAULT NULL,
    p_new_values JSONB DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL,
    p_station_id INTEGER DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_user_email TEXT;
    v_user_role TEXT;
    v_log_id UUID;
BEGIN
    -- Recupera info utente
    SELECT email, role INTO v_user_email, v_user_role
    FROM users WHERE user_id = p_user_id;
    
    -- Inserisce il log
    INSERT INTO audit_logs (
        user_id, user_email, user_role,
        action, entity_type, entity_id,
        old_values, new_values, metadata,
        station_id
    ) VALUES (
        p_user_id, v_user_email, v_user_role,
        p_action, p_entity_type, p_entity_id,
        p_old_values, p_new_values, p_metadata,
        p_station_id
    ) RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant per trigger
GRANT EXECUTE ON FUNCTION log_audit_event TO authenticated;

-- Commento tabella
COMMENT ON TABLE audit_logs IS 'Sistema di audit log per tracciare tutte le azioni amministrative';
