-- ============================================================================
-- DASHBOARD CUSTOMIZATION - DATABASE SCHEMA
-- ============================================================================
-- Table to store user-specific dashboard KPI configurations
-- Each user can customize which KPIs to show, their order, size, and position

CREATE TABLE IF NOT EXISTS user_dashboard_config (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  kpi_layout JSONB NOT NULL DEFAULT '[]'::jsonb,
  grid_columns INTEGER DEFAULT 4 CHECK (grid_columns >= 1 AND grid_columns <= 6),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster queries by user
CREATE INDEX IF NOT EXISTS idx_user_dashboard_config_user_id ON user_dashboard_config(user_id);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_user_dashboard_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_user_dashboard_config_updated_at
  BEFORE UPDATE ON user_dashboard_config
  FOR EACH ROW
  EXECUTE FUNCTION update_user_dashboard_config_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================
ALTER TABLE user_dashboard_config ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read their own configuration
CREATE POLICY user_dashboard_config_select_policy ON user_dashboard_config
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can only insert their own configuration
CREATE POLICY user_dashboard_config_insert_policy ON user_dashboard_config
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can only update their own configuration
CREATE POLICY user_dashboard_config_update_policy ON user_dashboard_config
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can only delete their own configuration
CREATE POLICY user_dashboard_config_delete_policy ON user_dashboard_config
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- DEFAULT CONFIGURATION
-- ============================================================================
-- Default KPI layout for new users (4 KPIs in 4-column grid)
-- 
-- kpi_layout structure:
-- [
--   {
--     "id": "venduto",           // Unique KPI identifier
--     "visible": true,            // Show/hide toggle
--     "order": 0,                 // Display order (0-based)
--     "size": "1x1",              // Card size: "1x1", "1x2", "2x1", "2x2"
--     "position": {"row": 0, "col": 0}  // Grid position (optional, for advanced layouts)
--   },
--   ...
-- ]

-- Function to get default dashboard configuration
CREATE OR REPLACE FUNCTION get_default_dashboard_config()
RETURNS JSONB AS $$
BEGIN
  RETURN '[
    {
      "id": "venduto",
      "visible": true,
      "order": 0,
      "size": "1x1",
      "position": {"row": 0, "col": 0}
    },
    {
      "id": "erogato",
      "visible": true,
      "order": 1,
      "size": "1x1",
      "position": {"row": 0, "col": 1}
    },
    {
      "id": "stazioni",
      "visible": true,
      "order": 2,
      "size": "1x1",
      "position": {"row": 0, "col": 2}
    },
    {
      "id": "alert",
      "visible": true,
      "order": 3,
      "size": "1x1",
      "position": {"row": 0, "col": 3}
    }
  ]'::jsonb;
END;
$$ LANGUAGE plpgsql;

-- Function to initialize dashboard config for a user (if not exists)
CREATE OR REPLACE FUNCTION ensure_user_dashboard_config(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO user_dashboard_config (user_id, kpi_layout, grid_columns)
  VALUES (p_user_id, get_default_dashboard_config(), 4)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- USAGE EXAMPLES
-- ============================================================================

-- Example 1: Initialize config for current user
-- SELECT ensure_user_dashboard_config(auth.uid());

-- Example 2: Get user's dashboard config (or NULL if not exists)
-- SELECT kpi_layout, grid_columns FROM user_dashboard_config WHERE user_id = auth.uid();

-- Example 3: Update user's dashboard config
-- UPDATE user_dashboard_config 
-- SET kpi_layout = '[{"id":"venduto","visible":true,"order":0,"size":"2x1"}]'::jsonb,
--     grid_columns = 3
-- WHERE user_id = auth.uid();

-- Example 4: Reset to default
-- UPDATE user_dashboard_config 
-- SET kpi_layout = get_default_dashboard_config(),
--     grid_columns = 4
-- WHERE user_id = auth.uid();

-- ============================================================================
-- NOTES
-- ============================================================================
-- 
-- KPI ID Values:
--   - "venduto"   : Venduto Oggi (Today's Sales in €)
--   - "erogato"   : Erogato Oggi (Today's Liters Dispensed)
--   - "stazioni"  : Stazioni Attive (Active Stations Count)
--   - "alert"     : Alert Cisterne (Tank Alerts / Closures Count)
-- 
-- Size Values:
--   - "1x1" : Standard card (1 column × 1 row)
--   - "1x2" : Wide card (2 columns × 1 row)
--   - "2x1" : Tall card (1 column × 2 rows)
--   - "2x2" : Large card (2 columns × 2 rows)
--
-- Future KPI IDs (extensible):
--   - "operatori" : Operatori Attivi
--   - "fatture"   : Fatture Pending
--   - "crediti"   : Crediti Totali
--   - Custom user-defined KPIs can be added by extending the catalog
