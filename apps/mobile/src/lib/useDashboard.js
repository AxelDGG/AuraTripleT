// Datos del tablero.
//
// `/api/dashboard` resuelve doce herramientas MCP en paralelo y devuelve todo
// junto. Se pide una sola vez y se comparte entre las pantallas de Cuentas,
// Transferencias, Inversiones y Servicios: son vistas distintas del mismo
// estado, no cuatro cargas.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchCustomer, fetchDashboard } from '../api/endpoints';

const DashboardContext = createContext(null);

export function DashboardProvider({ children }) {
  const [data, setData] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      // El perfil llega primero porque es una sola herramienta: el saludo de la
      // franja superior no tiene por qué esperar a las doce.
      const profile = await fetchCustomer();
      setCustomer(profile.data);
      const dashboard = await fetchDashboard();
      setData(dashboard.data);
      setError(null);
    } catch (err) {
      setError(err?.message ?? 'No se pudieron cargar tus datos.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const value = useMemo(
    () => ({ data, customer, loading, refreshing, error, reload: () => load({ silent: true }) }),
    [data, customer, loading, refreshing, error, load],
  );

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) throw new Error('useDashboard debe usarse dentro de <DashboardProvider>.');
  return context;
}
