CREATE TABLE IF NOT EXISTS contract_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS driver_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES contract_templates(id),
  driver_id TEXT NOT NULL,
  driver_name TEXT NOT NULL,
  driver_email TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  sent_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  signature_data TEXT,
  signed_name TEXT,
  token TEXT UNIQUE NOT NULL,
  contract_content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_contracts_driver_id ON driver_contracts(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_contracts_token ON driver_contracts(token);
CREATE INDEX IF NOT EXISTS idx_driver_contracts_status ON driver_contracts(status);
