-- ==========================================
-- AGGIORNAMENTO RUOLI E SICUREZZA (RBAC)
-- ==========================================

-- 1. Aggiornamento funzione is_admin per includere ruoli privilegiati
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE user_id = auth.uid()
    AND (role = 'admin' OR role = 'super_admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Creazione funzione per il ruolo Contabilità (Accounting)
CREATE OR REPLACE FUNCTION public.is_accounting()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE user_id = auth.uid()
    AND (role = 'admin' OR role = 'super_admin' OR role = 'accounting')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Creazione funzione per il ruolo Fatturazione (Billing)
CREATE OR REPLACE FUNCTION public.is_billing()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE user_id = auth.uid()
    AND (role = 'admin' OR role = 'super_admin' OR role = 'billing')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Aggiornamento Policy per SHIFTS (Turni): Accessibili ad Admin e Accounting
DROP POLICY IF EXISTS "Admins can manage shifts" ON shifts;
CREATE POLICY "Admins and Accounting can manage shifts" ON shifts
  FOR ALL USING (public.is_accounting());

-- 5. Abilitazione RLS e Policy per richieste fatture (se la tabella esiste)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename  = 'invoice_requests') THEN
        ALTER TABLE invoice_requests ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Admins and Billing can manage invoices" ON invoice_requests;
        CREATE POLICY "Admins and Billing can manage invoices" ON invoice_requests
          FOR ALL USING (public.is_billing());
    END IF;
END $$;

-- 6. Assicuriamoci che tutti possano leggere i propri ruoli
DROP POLICY IF EXISTS "Users can read own profile" ON users;
CREATE POLICY "Users can read own profile" ON users
  FOR SELECT USING (auth.uid() = user_id);

-- 7. Solo Admin possono modificare i ruoli
DROP POLICY IF EXISTS "Admins can manage all profiles" ON users;
CREATE POLICY "Admins can manage all profiles" ON users
  FOR ALL USING (public.is_admin());
