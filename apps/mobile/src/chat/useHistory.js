// Historial de visualizaciones (hypertable `ui_history` de Tiger Data).
//
// Alimenta las pestañas Historial y Colecciones. La búsqueda se manda al
// servidor, que la resuelve con el índice trigram sobre el título; filtrar en
// el cliente funcionaría hoy con 20 filas y dejaría de funcionar con 2000.

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchHistory } from '../api/endpoints';

const SEARCH_DEBOUNCE_MS = 320;

export function useHistory({ folder, search, limit = 40 } = {}) {
  const [entries, setEntries] = useState([]);
  const [folders, setFolders] = useState([]);
  const [source, setSource] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Evita que una respuesta lenta de una búsqueda vieja pise a la nueva.
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestRef.current;
    setLoading(true);
    try {
      const data = await fetchHistory({ folder, search, limit });
      if (id !== requestRef.current) return;
      setEntries(data.entries ?? []);
      setFolders(data.folders ?? []);
      setSource(data.source ?? null);
      setError(null);
    } catch (err) {
      if (id !== requestRef.current) return;
      setError(err?.message ?? 'No se pudo cargar el historial.');
    } finally {
      if (id === requestRef.current) setLoading(false);
    }
  }, [folder, search, limit]);

  useEffect(() => {
    const timer = setTimeout(load, search ? SEARCH_DEBOUNCE_MS : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  // Cuando el agente archiva algo, aparece arriba sin volver a pedir la lista.
  const prepend = useCallback(
    (entry) => {
      if (!entry) return;
      setEntries((current) => [entry, ...current.filter((item) => item.id !== entry.id)]);
      setFolders((current) =>
        current.map((item) => (item.id === entry.folder ? { ...item, total: (item.total ?? 0) + 1 } : item)),
      );
    },
    [],
  );

  return { entries, folders, source, loading, error, reload: load, prepend };
}
