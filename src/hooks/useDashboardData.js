import { useEffect, useState } from 'react';

import {
  loadCoreMap,
  loadManifest,
} from '../data/dashboardData';

// =============================================================================
// useDashboardData.js
// V10.1 - rama multianual de ocurrencia
// =============================================================================
// Carga inicial mínima:
//   - manifest de producción
//   - core nacional/estatal
//
// Categorías, bullets, perfiles y municipio siguen en carga perezosa desde
// App.jsx para no penalizar el arranque del tablero.
// =============================================================================

export function useDashboardData(year = '2026') {
  const [manifest, setManifest] = useState(null);
  const [coreMap, setCoreMap] = useState(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    async function loadInitial() {
      try {
        setLoadingInitial(true);
        setError(null);
        setManifest(null);
        setCoreMap(null);

        const [manifestData, coreMapData] = await Promise.all([
          loadManifest(year),
          loadCoreMap(year),
        ]);

        if (!active) return;

        setManifest(manifestData);
        setCoreMap(coreMapData);
      } catch (err) {
        if (!active) return;

        setManifest(null);
        setCoreMap(null);
        setError(err);
      } finally {
        if (active) {
          setLoadingInitial(false);
        }
      }
    }

    loadInitial();

    return () => {
      active = false;
    };
  }, [year]);

  return {
    manifest,
    coreMap,
    loadingInitial,
    error,
  };
}
