-- Invoice Payment Tokens table for secure email payment links
-- These tokens allow customers to pay invoices via Stripe without logging in

CREATE TABLE IF NOT EXISTS invoice_payment_tokens (
  id SERIAL PRIMARY KEY,
  token VARCHAR(100) UNIQUE NOT NULL,
  invoice_number VARCHAR(50) NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  due_date VARCHAR(100) NOT NULL,
  period_start VARCHAR(100) NOT NULL,
  period_end VARCHAR(100) NOT NULL,
  notes TEXT,
  payment_intent_id VARCHAR(255),
  client_secret TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_payment_tokens_token ON invoice_payment_tokens(token);
CREATE INDEX IF NOT EXISTS idx_invoice_payment_tokens_status ON invoice_payment_tokens(status);
CREATE INDEX IF NOT EXISTS idx_invoice_payment_tokens_invoice_number ON invoice_payment_tokens(invoice_number);

COMMENT ON TABLE invoice_payment_tokens IS 'Stores tokens for secure invoice payment links sent via email';
