// GET /api/overview — la portada de banca en línea en una sola llamada.
//
// El dashboard del agente son 12 herramientas MCP; la portada solo necesita
// tres (cuentas, movimientos y frecuentes), así que no se reutiliza
// /api/dashboard: cargar la pantalla de entrada no puede costar doce llamadas.
//
// Exige sesión: lo que muestra son saldos con nombre y apellido, no material
// de demo abierto como el resto de la web.

import { Router } from 'express';
import { callMcpTool } from '../mcp-client.js';
import { requireSession } from '../middleware/auth.js';

const RECENT_TRANSACTIONS = 6;
// Se piden más de las que se muestran: la última transferencia es una alerta y
// puede quedar fuera de los seis renglones de la tabla.
const SCANNED_TRANSACTIONS = 20;
// Una tarjeta "por vencer" solo es noticia cuando ya está cerca el corte.
const CARD_DUE_SOON_DAYS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

export const overviewRouter = Router();

const CHANNEL_LABELS = { web: 'Vía Web', mobile: 'Vía App Móvil', widget: 'Vía Widget' };

const daysUntil = (iso) => Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS);

// Las alertas de la portada se derivan de lo que ya sabemos: la sesión anterior,
// la fecha de pago de la tarjeta y el último movimiento de salida. No hay un
// buzón de avisos en el banco simulado y no hace falta inventar uno.
//
// Las cantidades viajan como número en `amount` y nunca dentro del texto: quien
// las formatea con la moneda y el locale correctos es el cliente.
function buildAlerts({ accounts, transactions, user }) {
  const alerts = [];

  if (user?.lastLogin?.at) {
    alerts.push({
      id: 'last-login',
      level: 'info',
      title: 'Último ingreso a tu banca en línea.',
      detail: CHANNEL_LABELS[user.lastLogin.channel] ?? 'Vía Web',
      at: user.lastLogin.at,
    });
  }

  const card = accounts.find((account) => account.type === 'credit' && account.paymentDue);
  if (card) {
    const days = daysUntil(card.paymentDue);
    if (days >= 0 && days <= CARD_DUE_SOON_DAYS) {
      const when = days === 0 ? 'vence hoy' : `vence en ${days} día${days === 1 ? '' : 's'}`;
      alerts.push({
        id: 'card-due',
        level: days <= 3 ? 'critical' : 'warn',
        title: `El pago de tu ${card.name} ${when}.`,
        detail: 'Pago mínimo',
        amount: card.minimumPayment,
      });
    }
  }

  const transfer = transactions.find((tx) => tx.category === 'Transferencias' && tx.type === 'debit');
  if (transfer) {
    alerts.push({
      id: 'last-transfer',
      level: 'ok',
      title: 'Tu transferencia se realizó con éxito.',
      detail: transfer.description,
      amount: Math.abs(transfer.amount),
      at: transfer.date,
    });
  }

  return alerts;
}

overviewRouter.get('/api/overview', requireSession, async (req, res) => {
  try {
    const [accounts, scanned, favorites] = await Promise.all([
      callMcpTool('get_accounts', {}),
      callMcpTool('get_transactions', { limit: SCANNED_TRANSACTIONS }),
      callMcpTool('get_beneficiaries', {}),
    ]).then((results) => results.map((text) => JSON.parse(text)));

    const user = req.session.user;
    res.json({
      ok: true,
      data: {
        user,
        accounts,
        transactions: scanned.slice(0, RECENT_TRANSACTIONS),
        favorites,
        alerts: buildAlerts({ accounts, transactions: scanned, user }),
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[overview] error:', err);
    res.status(500).json({ ok: false, error: 'No se pudo cargar tu portada.' });
  }
});
