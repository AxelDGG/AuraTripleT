-- Norte AI · Seed del cliente demo para Tiger Data.
-- ARCHIVO GENERADO por packages/mcp-server/scripts/build-seed.js — no editar a mano.
-- Datos 100% sintéticos: ningún dato real ni PII.

BEGIN;

INSERT INTO customers (id, name, segment, rfc, email, phone, branch, credit_score, customer_since) VALUES
  ('CLT-889201', 'María Fernanda López García', 'Preferente', 'LOGM910415XXX', 'maria.lopez@example.com', '+52 81 1234 5678', 'Sucursal Monterrey Centro', 742, '2016-03-12')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, segment = EXCLUDED.segment, rfc = EXCLUDED.rfc, email = EXCLUDED.email, phone = EXCLUDED.phone, branch = EXCLUDED.branch, credit_score = EXCLUDED.credit_score, customer_since = EXCLUDED.customer_since;

INSERT INTO accounts (id, customer_id, type, name, number, clabe, currency, balance, available_balance, interest_rate, credit_limit, available_credit, payment_due, minimum_payment, no_interest_payment) VALUES
  ('ACC-001', 'CLT-889201', 'checking', 'Cuenta Nómina Banorte', '**** 4821', '072580001234567891', 'MXN', 48250.75, 47950.75, NULL, NULL, NULL, NULL, NULL, NULL),
  ('ACC-002', 'CLT-889201', 'savings', 'Cuenta de Ahorro Enlace', '**** 7733', '072580009876543212', 'MXN', 125800, 125800, 4.6, NULL, NULL, NULL, NULL, NULL),
  ('ACC-003', 'CLT-889201', 'credit', 'Tarjeta Banorte Oro', '**** 9010', NULL, 'MXN', -23410.5, NULL, NULL, 85000, 61589.5, '2026-09-15', 1870, 23410.5)
ON CONFLICT (id) DO UPDATE SET customer_id = EXCLUDED.customer_id, type = EXCLUDED.type, name = EXCLUDED.name, number = EXCLUDED.number, clabe = EXCLUDED.clabe, currency = EXCLUDED.currency, balance = EXCLUDED.balance, available_balance = EXCLUDED.available_balance, interest_rate = EXCLUDED.interest_rate, credit_limit = EXCLUDED.credit_limit, available_credit = EXCLUDED.available_credit, payment_due = EXCLUDED.payment_due, minimum_payment = EXCLUDED.minimum_payment, no_interest_payment = EXCLUDED.no_interest_payment;

INSERT INTO beneficiaries (id, customer_id, name, bank, clabe, alias) VALUES
  ('BEN-01', 'CLT-889201', 'Juan Pérez Ramírez', 'BBVA México', '012580004567891234', 'Juan (hermano)'),
  ('BEN-02', 'CLT-889201', 'Ana Sofía Torres', 'Santander', '014580007891234567', 'Ana - renta'),
  ('BEN-03', 'CLT-889201', 'Carlos Mendoza', 'Banorte', '072580003216549870', 'Carlos gym')
ON CONFLICT (id) DO UPDATE SET customer_id = EXCLUDED.customer_id, name = EXCLUDED.name, bank = EXCLUDED.bank, clabe = EXCLUDED.clabe, alias = EXCLUDED.alias;

INSERT INTO credit_products (id, name, min_rate, max_rate, max_months, max_amount) VALUES
  ('CRED-AUTO', 'Crédito Automotriz Banorte', 12.9, 16.5, 72, 1500000),
  ('CRED-HIPO', 'Crédito Hipotecario Banorte', 9.45, 11.2, 240, 8000000),
  ('CRED-PERS', 'Crédito Personal Banorte', 18.9, 32, 60, 500000)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, min_rate = EXCLUDED.min_rate, max_rate = EXCLUDED.max_rate, max_months = EXCLUDED.max_months, max_amount = EXCLUDED.max_amount;

INSERT INTO investments (id, customer_id, name, type, amount, rate, maturity, gain) VALUES
  ('INV-01', 'CLT-889201', 'Pagaré Banorte 28 días', 'Pagaré', 50000, 9.15, '2026-09-20', 351.6),
  ('INV-02', 'CLT-889201', 'Fondo NTEGUB (Deuda Gubernamental)', 'Fondo de inversión', 80000, 8.4, NULL, 2240),
  ('INV-03', 'CLT-889201', 'Fondo NTEDIG (Renta Variable Global)', 'Fondo de inversión', 35000, 12.8, NULL, 1493.3)
ON CONFLICT (id) DO UPDATE SET customer_id = EXCLUDED.customer_id, name = EXCLUDED.name, type = EXCLUDED.type, amount = EXCLUDED.amount, rate = EXCLUDED.rate, maturity = EXCLUDED.maturity, gain = EXCLUDED.gain;

INSERT INTO exchange_rates (currency, base, name, buy, sell, updated_at, ord) VALUES
  ('USD', 'MXN', 'Dólar estadounidense', 18.42, 18.95, '2026-09-02T09:00:00-06:00', 0),
  ('EUR', 'MXN', 'Euro', 20.1, 20.78, '2026-09-02T09:00:00-06:00', 1),
  ('CAD', 'MXN', 'Dólar canadiense', 13.35, 13.9, '2026-09-02T09:00:00-06:00', 2),
  ('JPY', 'MXN', 'Yen japonés (x100)', 12.4, 12.98, '2026-09-02T09:00:00-06:00', 3)
ON CONFLICT (currency) DO UPDATE SET base = EXCLUDED.base, name = EXCLUDED.name, buy = EXCLUDED.buy, sell = EXCLUDED.sell, updated_at = EXCLUDED.updated_at, ord = EXCLUDED.ord;

INSERT INTO holdings (symbol, name, exchange, units, price, change_pct) VALUES
  ('AAPL', 'Apple Inc.', 'NASDAQ', 104, 232.15, 0.7),
  ('AMZN', 'Amazon.com', 'NASDAQ', 12, 186.4, 0.81),
  ('MSFT', 'Microsoft', 'NASDAQ', 41, 421.3, 0.49),
  ('NVDA', 'NVIDIA', 'NASDAQ', 16, 128.55, 2.12)
ON CONFLICT (symbol) DO UPDATE SET name = EXCLUDED.name, exchange = EXCLUDED.exchange, units = EXCLUDED.units, price = EXCLUDED.price, change_pct = EXCLUDED.change_pct;

INSERT INTO watchlist (symbol, name, exchange, price, change_pct, views) VALUES
  ('SPOT', 'Spotify', 'NYSE', 342.18, 1.63, 980),
  ('AMZN', 'Amazon', 'NASDAQ', 186.4, 0.81, 910),
  ('MSFT', 'MSFT', 'NASDAQ', 421.3, 0.49, 870),
  ('NVDA', 'NVDA', 'NASDAQ', 128.55, 2.12, 840),
  ('AAPL', 'Apple', 'NASDAQ', 232.15, 0.7, 800),
  ('TSLA', 'Tesla', 'NASDAQ', 248.9, -1.84, 760),
  ('META', 'Meta Platforms', 'NASDAQ', 512.7, -0.62, 640),
  ('GOOGL', 'Alphabet', 'NASDAQ', 168.2, 1.12, 610)
ON CONFLICT (symbol) DO UPDATE SET name = EXCLUDED.name, exchange = EXCLUDED.exchange, price = EXCLUDED.price, change_pct = EXCLUDED.change_pct, views = EXCLUDED.views;

INSERT INTO transactions (id, ts, account_id, description, category, amount, type) VALUES
  ('TX-1041', '2026-09-01T12:00:00-06:00', 'ACC-001', 'Depósito de nómina - TECNOSOFT SA', 'Ingresos', 28500, 'credit'),
  ('TX-1040', '2026-09-01T12:00:00-06:00', 'ACC-001', 'Netflix México', 'Entretenimiento', -299, 'debit'),
  ('TX-1039', '2026-08-31T12:00:00-06:00', 'ACC-003', 'Amazon MX - Compra en línea', 'Compras', -1849.9, 'debit'),
  ('TX-1038', '2026-08-30T12:00:00-06:00', 'ACC-001', 'HEB Cumbres - Supermercado', 'Supermercado', -2340.55, 'debit'),
  ('TX-1037', '2026-08-29T12:00:00-06:00', 'ACC-001', 'CFE - Pago de servicio', 'Servicios', -876, 'debit'),
  ('TX-1036', '2026-08-28T12:00:00-06:00', 'ACC-003', 'Gasolinera Pemex Valle', 'Transporte', -1100, 'debit'),
  ('TX-1035', '2026-08-27T12:00:00-06:00', 'ACC-001', 'Transferencia SPEI a Juan Pérez', 'Transferencias', -3500, 'debit'),
  ('TX-1034', '2026-08-26T12:00:00-06:00', 'ACC-001', 'Starbucks San Pedro', 'Restaurantes', -215, 'debit'),
  ('TX-1033', '2026-08-25T12:00:00-06:00', 'ACC-003', 'Cinépolis VIP', 'Entretenimiento', -680, 'debit'),
  ('TX-1032', '2026-08-24T12:00:00-06:00', 'ACC-001', 'Uber Eats', 'Restaurantes', -389.5, 'debit'),
  ('TX-1031', '2026-08-23T12:00:00-06:00', 'ACC-002', 'Intereses ganados agosto', 'Ingresos', 482.3, 'credit'),
  ('TX-1030', '2026-08-22T12:00:00-06:00', 'ACC-001', 'Farmacia Guadalajara', 'Salud', -456.8, 'debit'),
  ('TX-1029', '2026-08-21T12:00:00-06:00', 'ACC-003', 'Liverpool Monterrey', 'Compras', -3299, 'debit'),
  ('TX-1028', '2026-08-20T12:00:00-06:00', 'ACC-001', 'Telmex - Internet', 'Servicios', -599, 'debit'),
  ('TX-1027', '2026-08-19T12:00:00-06:00', 'ACC-001', 'La Nacional - Restaurante', 'Restaurantes', -1240, 'debit'),
  ('TX-1026', '2026-08-18T12:00:00-06:00', 'ACC-001', 'Uber viajes', 'Transporte', -178, 'debit'),
  ('TX-1025', '2026-08-17T12:00:00-06:00', 'ACC-002', 'Transferencia a ahorro', 'Ahorro', 5000, 'credit'),
  ('TX-1024', '2026-08-17T12:00:00-06:00', 'ACC-001', 'Transferencia a ahorro', 'Ahorro', -5000, 'debit'),
  ('TX-1023', '2026-08-16T12:00:00-06:00', 'ACC-001', 'Depósito de nómina - TECNOSOFT SA', 'Ingresos', 28500, 'credit'),
  ('TX-1022', '2026-08-15T12:00:00-06:00', 'ACC-001', 'Soriana Híper', 'Supermercado', -1890.25, 'debit'),
  ('TX-1021', '2026-08-14T12:00:00-06:00', 'ACC-003', 'Spotify Premium', 'Entretenimiento', -179, 'debit'),
  ('TX-1020', '2026-08-13T12:00:00-06:00', 'ACC-001', 'Agua y Drenaje MTY', 'Servicios', -320, 'debit'),
  ('TX-1019', '2026-08-12T12:00:00-06:00', 'ACC-003', 'Home Depot Valle Oriente', 'Hogar', -2150, 'debit'),
  ('TX-1018', '2026-08-11T12:00:00-06:00', 'ACC-001', 'Gimnasio SmartFit', 'Salud', -549, 'debit'),
  ('TX-1017', '2026-08-10T12:00:00-06:00', 'ACC-001', 'Oxxo Gas', 'Transporte', -950, 'debit'),
  ('TX-1016', '2026-08-08T12:00:00-06:00', 'ACC-001', 'Pago tarjeta Banorte Oro', 'Pagos TDC', -8000, 'debit'),
  ('TX-1015', '2026-08-08T12:00:00-06:00', 'ACC-003', 'Pago recibido - Gracias', 'Pagos TDC', 8000, 'credit'),
  ('TX-1014', '2026-08-06T12:00:00-06:00', 'ACC-001', 'Mercado Libre', 'Compras', -1560, 'debit'),
  ('TX-1013', '2026-08-05T12:00:00-06:00', 'ACC-001', 'Vips Garza Sada', 'Restaurantes', -487, 'debit'),
  ('TX-1012', '2026-08-03T12:00:00-06:00', 'ACC-001', 'HEB Cumbres - Supermercado', 'Supermercado', -2780.4, 'debit'),
  ('TX-1011', '2026-08-01T12:00:00-06:00', 'ACC-001', 'Renta departamento', 'Vivienda', -9500, 'debit'),
  ('TX-1010', '2026-07-31T12:00:00-06:00', 'ACC-001', 'Depósito de nómina - TECNOSOFT SA', 'Ingresos', 28500, 'credit')
ON CONFLICT (id, ts) DO UPDATE SET account_id = EXCLUDED.account_id, description = EXCLUDED.description, category = EXCLUDED.category, amount = EXCLUDED.amount, type = EXCLUDED.type;

COMMIT;
