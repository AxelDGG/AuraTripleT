// Un lugar con todas las rutas de la API. Si el backend cambia un contrato,
// se ve aquí y no repartido por las pantallas.

import { request } from './client';

export const login = (username, password) =>
  request('/api/auth/login', {
    method: 'POST',
    auth: false,
    body: { username, password, channel: 'mobile' },
  });

export const fetchSession = () => request('/api/auth/session');
export const logout = () => request('/api/auth/logout', { method: 'POST' }).catch(() => ({ ok: true }));

export const fetchHealth = () => request('/api/health', { timeoutMs: 8000, auth: false });
export const fetchCustomer = () => request('/api/customer');
export const fetchDashboard = () => request('/api/dashboard', { timeoutMs: 25000 });

export function fetchHistory({ folder, search, limit } = {}) {
  const params = new URLSearchParams();
  if (folder) params.set('folder', folder);
  if (search) params.set('search', search);
  if (limit) params.set('limit', String(limit));
  const query = params.toString();
  return request(`/api/history${query ? `?${query}` : ''}`);
}

export const simulateCredit = ({ productId, amount, months }) =>
  request('/api/simulate-credit', { method: 'POST', body: { productId, amount, months } });

export { streamAction, streamChat } from './sse';

export const fetchCatalog = () => request('/api/a2ui/catalog', { auth: false });
