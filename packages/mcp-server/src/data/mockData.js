// Datos simulados de un cliente Banorte para el reto de interfaces generativas.
// Todo el contenido es ficticio y solo para demostración.

export const customer = {
  id: 'CLT-889201',
  name: 'María Fernanda López García',
  segment: 'Preferente',
  rfc: 'LOGM910415XXX',
  email: 'maria.lopez@example.com',
  phone: '+52 81 1234 5678',
  branch: 'Sucursal Monterrey Centro',
  creditScore: 742,
  customerSince: '2016-03-12',
};

export const accounts = [
  {
    id: 'ACC-001',
    type: 'checking',
    name: 'Cuenta Nómina Banorte',
    number: '**** 4821',
    clabe: '072580001234567891',
    currency: 'MXN',
    balance: 48250.75,
    availableBalance: 47950.75,
  },
  {
    id: 'ACC-002',
    type: 'savings',
    name: 'Cuenta de Ahorro Enlace',
    number: '**** 7733',
    clabe: '072580009876543212',
    currency: 'MXN',
    balance: 125800.0,
    availableBalance: 125800.0,
    interestRate: 4.6,
  },
  {
    id: 'ACC-003',
    type: 'credit',
    name: 'Tarjeta Banorte Oro',
    number: '**** 9010',
    currency: 'MXN',
    creditLimit: 85000.0,
    balance: -23410.5,
    availableCredit: 61589.5,
    // Tasa anual ordinaria de la tarjeta: es contra lo que se compara el plan
    // de reestructura (get_card_restructure_options).
    interestRate: 45.9,
    paymentDue: '2026-09-15',
    minimumPayment: 1870.0,
    noInterestPayment: 23410.5,
  },
];

// Movimientos recientes (agosto y septiembre), escritos uno por uno: son los
// que aparecen en la demo y en las pruebas.
const recentTransactions = [
  { id: 'TX-1041', accountId: 'ACC-001', date: '2026-09-01', description: 'Depósito de nómina - TECNOSOFT SA', category: 'Ingresos', amount: 28500.0, type: 'credit' },
  { id: 'TX-1040', accountId: 'ACC-001', date: '2026-09-01', description: 'Netflix México', category: 'Entretenimiento', amount: -299.0, type: 'debit' },
  { id: 'TX-1039', accountId: 'ACC-003', date: '2026-08-31', description: 'Amazon MX - Compra en línea', category: 'Compras', amount: -1849.9, type: 'debit' },
  { id: 'TX-1038', accountId: 'ACC-001', date: '2026-08-30', description: 'HEB Cumbres - Supermercado', category: 'Supermercado', amount: -2340.55, type: 'debit' },
  { id: 'TX-1037', accountId: 'ACC-001', date: '2026-08-29', description: 'CFE - Pago de servicio', category: 'Servicios', amount: -876.0, type: 'debit' },
  { id: 'TX-1036', accountId: 'ACC-003', date: '2026-08-28', description: 'Gasolinera Pemex Valle', category: 'Transporte', amount: -1100.0, type: 'debit' },
  { id: 'TX-1035', accountId: 'ACC-001', date: '2026-08-27', description: 'Transferencia SPEI a Juan Pérez', category: 'Transferencias', amount: -3500.0, type: 'debit' },
  { id: 'TX-1034', accountId: 'ACC-001', date: '2026-08-26', description: 'Starbucks San Pedro', category: 'Restaurantes', amount: -215.0, type: 'debit' },
  { id: 'TX-1033', accountId: 'ACC-003', date: '2026-08-25', description: 'Cinépolis VIP', category: 'Entretenimiento', amount: -680.0, type: 'debit' },
  { id: 'TX-1032', accountId: 'ACC-001', date: '2026-08-24', description: 'Uber Eats', category: 'Restaurantes', amount: -389.5, type: 'debit' },
  { id: 'TX-1031', accountId: 'ACC-002', date: '2026-08-23', description: 'Intereses ganados agosto', category: 'Ingresos', amount: 482.3, type: 'credit' },
  { id: 'TX-1030', accountId: 'ACC-001', date: '2026-08-22', description: 'Farmacia Guadalajara', category: 'Salud', amount: -456.8, type: 'debit' },
  { id: 'TX-1029', accountId: 'ACC-003', date: '2026-08-21', description: 'Liverpool Monterrey', category: 'Compras', amount: -3299.0, type: 'debit' },
  { id: 'TX-1028', accountId: 'ACC-001', date: '2026-08-20', description: 'Telmex - Internet', category: 'Servicios', amount: -599.0, type: 'debit' },
  { id: 'TX-1027', accountId: 'ACC-001', date: '2026-08-19', description: 'La Nacional - Restaurante', category: 'Restaurantes', amount: -1240.0, type: 'debit' },
  { id: 'TX-1026', accountId: 'ACC-001', date: '2026-08-18', description: 'Uber viajes', category: 'Transporte', amount: -178.0, type: 'debit' },
  { id: 'TX-1025', accountId: 'ACC-002', date: '2026-08-17', description: 'Transferencia a ahorro', category: 'Ahorro', amount: 5000.0, type: 'credit' },
  { id: 'TX-1024', accountId: 'ACC-001', date: '2026-08-17', description: 'Transferencia a ahorro', category: 'Ahorro', amount: -5000.0, type: 'debit' },
  { id: 'TX-1023', accountId: 'ACC-001', date: '2026-08-16', description: 'Depósito de nómina - TECNOSOFT SA', category: 'Ingresos', amount: 28500.0, type: 'credit' },
  { id: 'TX-1022', accountId: 'ACC-001', date: '2026-08-15', description: 'Soriana Híper', category: 'Supermercado', amount: -1890.25, type: 'debit' },
  { id: 'TX-1021', accountId: 'ACC-003', date: '2026-08-14', description: 'Spotify Premium', category: 'Entretenimiento', amount: -179.0, type: 'debit' },
  { id: 'TX-1020', accountId: 'ACC-001', date: '2026-08-13', description: 'Agua y Drenaje MTY', category: 'Servicios', amount: -320.0, type: 'debit' },
  { id: 'TX-1019', accountId: 'ACC-003', date: '2026-08-12', description: 'Home Depot Valle Oriente', category: 'Hogar', amount: -2150.0, type: 'debit' },
  { id: 'TX-1018', accountId: 'ACC-001', date: '2026-08-11', description: 'Gimnasio SmartFit', category: 'Salud', amount: -549.0, type: 'debit' },
  { id: 'TX-1017', accountId: 'ACC-001', date: '2026-08-10', description: 'Oxxo Gas', category: 'Transporte', amount: -950.0, type: 'debit' },
  { id: 'TX-1016', accountId: 'ACC-001', date: '2026-08-08', description: 'Pago tarjeta Banorte Oro', category: 'Pagos TDC', amount: -8000.0, type: 'debit' },
  { id: 'TX-1015', accountId: 'ACC-003', date: '2026-08-08', description: 'Pago recibido - Gracias', category: 'Pagos TDC', amount: 8000.0, type: 'credit' },
  { id: 'TX-1014', accountId: 'ACC-001', date: '2026-08-06', description: 'Mercado Libre', category: 'Compras', amount: -1560.0, type: 'debit' },
  { id: 'TX-1013', accountId: 'ACC-001', date: '2026-08-05', description: 'Vips Garza Sada', category: 'Restaurantes', amount: -487.0, type: 'debit' },
  { id: 'TX-1012', accountId: 'ACC-001', date: '2026-08-03', description: 'HEB Cumbres - Supermercado', category: 'Supermercado', amount: -2780.4, type: 'debit' },
  { id: 'TX-1011', accountId: 'ACC-001', date: '2026-08-01', description: 'Renta departamento', category: 'Vivienda', amount: -9500.0, type: 'debit' },
  { id: 'TX-1010', accountId: 'ACC-001', date: '2026-07-31', description: 'Depósito de nómina - TECNOSOFT SA', category: 'Ingresos', amount: 28500.0, type: 'credit' },
];

// Abril a julio: la base contra la que se compara el gasto reciente
// (get_spending_trend). Mismo patrón de vida que agosto pero más contenido —
// el gasto sube poco a poco cada mes y agosto es el pico (Liverpool, Amazon,
// Home Depot, la transferencia a Juan). Cada fila: [día, cuenta, descripción,
// categoría, monto]; el mes y el id se completan abajo.
const EARLIER_MONTHS = {
  '2026-04': [
    [1, 'ACC-001', 'Renta departamento', 'Vivienda', -9500.0],
    [1, 'ACC-001', 'Netflix México', 'Entretenimiento', -299.0],
    [3, 'ACC-001', 'HEB Cumbres - Supermercado', 'Supermercado', -2410.3],
    [5, 'ACC-001', 'Vips Garza Sada', 'Restaurantes', -412.0],
    [8, 'ACC-003', 'Pago recibido - Gracias', 'Pagos TDC', 8000.0],
    [8, 'ACC-001', 'Pago tarjeta Banorte Oro', 'Pagos TDC', -8000.0],
    [10, 'ACC-001', 'Oxxo Gas', 'Transporte', -900.0],
    [11, 'ACC-001', 'Gimnasio SmartFit', 'Salud', -549.0],
    [13, 'ACC-001', 'Agua y Drenaje MTY', 'Servicios', -320.0],
    [14, 'ACC-003', 'Spotify Premium', 'Entretenimiento', -179.0],
    [15, 'ACC-001', 'Depósito de nómina - TECNOSOFT SA', 'Ingresos', 28500.0],
    [15, 'ACC-001', 'Soriana Híper', 'Supermercado', -1750.8],
    [17, 'ACC-002', 'Transferencia a ahorro', 'Ahorro', 5000.0],
    [17, 'ACC-001', 'Transferencia a ahorro', 'Ahorro', -5000.0],
    [19, 'ACC-001', 'Uber Eats', 'Restaurantes', -356.0],
    [20, 'ACC-001', 'Telmex - Internet', 'Servicios', -599.0],
    [22, 'ACC-001', 'Farmacia Guadalajara', 'Salud', -298.5],
    [23, 'ACC-002', 'Intereses ganados abril', 'Ingresos', 471.2],
    [24, 'ACC-001', 'La Nacional - Restaurante', 'Restaurantes', -680.0],
    [25, 'ACC-001', 'Mercado Libre', 'Compras', -1290.0],
    [27, 'ACC-001', 'Uber viajes', 'Transporte', -164.0],
    [28, 'ACC-001', 'HEB Cumbres - Supermercado', 'Supermercado', -2205.6],
    [29, 'ACC-001', 'CFE - Pago de servicio', 'Servicios', -812.0],
    [30, 'ACC-001', 'Depósito de nómina - TECNOSOFT SA', 'Ingresos', 28500.0],
  ],
  '2026-05': [
    [1, 'ACC-001', 'Renta departamento', 'Vivienda', -9500.0],
    [1, 'ACC-001', 'Netflix México', 'Entretenimiento', -299.0],
    [3, 'ACC-001', 'HEB Cumbres - Supermercado', 'Supermercado', -2530.45],
    [6, 'ACC-001', 'Starbucks San Pedro', 'Restaurantes', -198.0],
    [8, 'ACC-003', 'Pago recibido - Gracias', 'Pagos TDC', 8000.0],
    [8, 'ACC-001', 'Pago tarjeta Banorte Oro', 'Pagos TDC', -8000.0],
    [10, 'ACC-003', 'Gasolinera Pemex Valle', 'Transporte', -1050.0],
    [11, 'ACC-001', 'Gimnasio SmartFit', 'Salud', -549.0],
    [13, 'ACC-001', 'Agua y Drenaje MTY', 'Servicios', -320.0],
    [14, 'ACC-003', 'Spotify Premium', 'Entretenimiento', -179.0],
    [15, 'ACC-001', 'Depósito de nómina - TECNOSOFT SA', 'Ingresos', 28500.0],
    [16, 'ACC-001', 'Soriana Híper', 'Supermercado', -1820.3],
    [17, 'ACC-002', 'Transferencia a ahorro', 'Ahorro', 5000.0],
    [17, 'ACC-001', 'Transferencia a ahorro', 'Ahorro', -5000.0],
    [18, 'ACC-003', 'Cinépolis VIP', 'Entretenimiento', -540.0],
    [20, 'ACC-001', 'Telmex - Internet', 'Servicios', -599.0],
    [21, 'ACC-001', 'Uber Eats', 'Restaurantes', -402.5],
    [23, 'ACC-002', 'Intereses ganados mayo', 'Ingresos', 474.9],
    [24, 'ACC-001', 'Farmacia Guadalajara', 'Salud', -365.0],
    [26, 'ACC-003', 'Amazon MX - Compra en línea', 'Compras', -1425.0],
    [27, 'ACC-001', 'Uber viajes', 'Transporte', -210.0],
    [28, 'ACC-001', 'Vips Garza Sada', 'Restaurantes', -455.0],
    [29, 'ACC-001', 'CFE - Pago de servicio', 'Servicios', -845.0],
    [30, 'ACC-001', 'HEB Cumbres - Supermercado', 'Supermercado', -2280.0],
    [31, 'ACC-001', 'Depósito de nómina - TECNOSOFT SA', 'Ingresos', 28500.0],
  ],
  '2026-06': [
    [1, 'ACC-001', 'Renta departamento', 'Vivienda', -9500.0],
    [1, 'ACC-001', 'Netflix México', 'Entretenimiento', -299.0],
    [3, 'ACC-001', 'HEB Cumbres - Supermercado', 'Supermercado', -2610.0],
    [5, 'ACC-001', 'Uber Eats', 'Restaurantes', -378.0],
    [8, 'ACC-003', 'Pago recibido - Gracias', 'Pagos TDC', 8000.0],
    [8, 'ACC-001', 'Pago tarjeta Banorte Oro', 'Pagos TDC', -8000.0],
    [10, 'ACC-001', 'Oxxo Gas', 'Transporte', -980.0],
    [11, 'ACC-001', 'Gimnasio SmartFit', 'Salud', -549.0],
    [13, 'ACC-001', 'Agua y Drenaje MTY', 'Servicios', -320.0],
    [14, 'ACC-003', 'Spotify Premium', 'Entretenimiento', -179.0],
    [15, 'ACC-001', 'Depósito de nómina - TECNOSOFT SA', 'Ingresos', 28500.0],
    [16, 'ACC-001', 'Soriana Híper', 'Supermercado', -1935.75],
    [17, 'ACC-002', 'Transferencia a ahorro', 'Ahorro', 5000.0],
    [17, 'ACC-001', 'Transferencia a ahorro', 'Ahorro', -5000.0],
    [19, 'ACC-001', 'La Nacional - Restaurante', 'Restaurantes', -890.0],
    [20, 'ACC-001', 'Telmex - Internet', 'Servicios', -599.0],
    [21, 'ACC-003', 'Liverpool Monterrey', 'Compras', -1780.0],
    [23, 'ACC-002', 'Intereses ganados junio', 'Ingresos', 478.6],
    [24, 'ACC-001', 'Farmacia Guadalajara', 'Salud', -312.4],
    [25, 'ACC-001', 'Starbucks San Pedro', 'Restaurantes', -230.0],
    [27, 'ACC-001', 'Uber viajes', 'Transporte', -186.0],
    [28, 'ACC-003', 'Home Depot Valle Oriente', 'Hogar', -1140.0],
    [29, 'ACC-001', 'CFE - Pago de servicio', 'Servicios', -910.0],
    [30, 'ACC-001', 'HEB Cumbres - Supermercado', 'Supermercado', -2340.0],
    [30, 'ACC-001', 'Depósito de nómina - TECNOSOFT SA', 'Ingresos', 28500.0],
  ],
  '2026-07': [
    [1, 'ACC-001', 'Renta departamento', 'Vivienda', -9500.0],
    [1, 'ACC-001', 'Netflix México', 'Entretenimiento', -299.0],
    [3, 'ACC-001', 'HEB Cumbres - Supermercado', 'Supermercado', -2655.9],
    [5, 'ACC-001', 'Vips Garza Sada', 'Restaurantes', -468.0],
    [8, 'ACC-003', 'Pago recibido - Gracias', 'Pagos TDC', 8000.0],
    [8, 'ACC-001', 'Pago tarjeta Banorte Oro', 'Pagos TDC', -8000.0],
    [10, 'ACC-003', 'Gasolinera Pemex Valle', 'Transporte', -1080.0],
    [11, 'ACC-001', 'Gimnasio SmartFit', 'Salud', -549.0],
    [13, 'ACC-001', 'Agua y Drenaje MTY', 'Servicios', -320.0],
    [14, 'ACC-003', 'Spotify Premium', 'Entretenimiento', -179.0],
    [15, 'ACC-001', 'Depósito de nómina - TECNOSOFT SA', 'Ingresos', 28500.0],
    [16, 'ACC-001', 'Soriana Híper', 'Supermercado', -1988.0],
    [17, 'ACC-002', 'Transferencia a ahorro', 'Ahorro', 5000.0],
    [17, 'ACC-001', 'Transferencia a ahorro', 'Ahorro', -5000.0],
    [18, 'ACC-001', 'Uber Eats', 'Restaurantes', -415.0],
    [20, 'ACC-001', 'Telmex - Internet', 'Servicios', -599.0],
    [22, 'ACC-003', 'Cinépolis VIP', 'Entretenimiento', -620.0],
    [23, 'ACC-002', 'Intereses ganados julio', 'Ingresos', 480.1],
    [24, 'ACC-001', 'Farmacia Guadalajara', 'Salud', -402.0],
    [25, 'ACC-001', 'Mercado Libre', 'Compras', -1680.0],
    [26, 'ACC-001', 'La Nacional - Restaurante', 'Restaurantes', -1015.0],
    [27, 'ACC-001', 'Uber viajes', 'Transporte', -192.0],
    [29, 'ACC-001', 'CFE - Pago de servicio', 'Servicios', -868.0],
    [30, 'ACC-001', 'HEB Cumbres - Supermercado', 'Supermercado', -2410.0],
  ],
};

// Los ids continúan hacia atrás desde el más viejo de los recientes (TX-1010):
// el más nuevo de abril–julio es TX-1009. Se ordenan de más reciente a más
// antiguo y, dentro del mismo día, el id mayor va primero: es el mismo orden que
// devuelve Tiger (ts DESC, id DESC), así los dos repositorios coinciden fila a fila.
function earlierTransactions() {
  const rows = [];
  for (const [month, items] of Object.entries(EARLIER_MONTHS)) {
    items.forEach(([day, accountId, description, category, amount], index) => {
      rows.push({ date: `${month}-${String(day).padStart(2, '0')}`, order: index, accountId, description, category, amount });
    });
  }
  rows.sort((a, b) => b.date.localeCompare(a.date) || b.order - a.order);
  let nextId = 1009;
  return rows.map(({ order, ...row }) => ({
    id: `TX-${nextId--}`,
    accountId: row.accountId,
    date: row.date,
    description: row.description,
    category: row.category,
    amount: row.amount,
    type: row.amount < 0 ? 'debit' : 'credit',
  }));
}

export const transactions = [...recentTransactions, ...earlierTransactions()];

export const investments = [
  { id: 'INV-01', name: 'Pagaré Banorte 28 días', type: 'Pagaré', amount: 50000, rate: 9.15, maturity: '2026-09-20', gain: 351.6 },
  { id: 'INV-02', name: 'Fondo NTEGUB (Deuda Gubernamental)', type: 'Fondo de inversión', amount: 80000, rate: 8.4, maturity: null, gain: 2240.0 },
  { id: 'INV-03', name: 'Fondo NTEDIG (Renta Variable Global)', type: 'Fondo de inversión', amount: 35000, rate: 12.8, maturity: null, gain: 1493.3 },
];

export const exchangeRates = {
  base: 'MXN',
  updatedAt: '2026-09-02T09:00:00-06:00',
  rates: [
    { currency: 'USD', name: 'Dólar estadounidense', buy: 18.42, sell: 18.95 },
    { currency: 'EUR', name: 'Euro', buy: 20.1, sell: 20.78 },
    { currency: 'CAD', name: 'Dólar canadiense', buy: 13.35, sell: 13.9 },
    { currency: 'JPY', name: 'Yen japonés (x100)', buy: 12.4, sell: 12.98 },
  ],
};

export const creditProducts = [
  { id: 'CRED-AUTO', name: 'Crédito Automotriz Banorte', minRate: 12.9, maxRate: 16.5, maxMonths: 72, maxAmount: 1500000 },
  { id: 'CRED-HIPO', name: 'Crédito Hipotecario Banorte', minRate: 9.45, maxRate: 11.2, maxMonths: 240, maxAmount: 8000000 },
  { id: 'CRED-PERS', name: 'Crédito Personal Banorte', minRate: 18.9, maxRate: 32.0, maxMonths: 60, maxAmount: 500000 },
];

export const beneficiaries = [
  { id: 'BEN-01', name: 'Juan Pérez Ramírez', bank: 'BBVA México', clabe: '012580004567891234', alias: 'Juan (hermano)' },
  { id: 'BEN-02', name: 'Ana Sofía Torres', bank: 'Santander', clabe: '014580007891234567', alias: 'Ana - renta' },
  { id: 'BEN-03', name: 'Carlos Mendoza', bank: 'Banorte', clabe: '072580003216549870', alias: 'Carlos gym' },
];
