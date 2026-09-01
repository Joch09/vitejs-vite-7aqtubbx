import { useEffect, useState } from 'react';

import {
  loadCoreMap,
  loadManifest,
} from '../data/dashboardData';

// =============================================================================
// useDashboardData.js
// V9 - rama de ocurrencia
// =============================================================================
// Carga inicial mínima:
//   - manifest de producción
//   - core nacional/estatal
//
// Categorías, bullets, perfiles y municipio siguen en carga perezosa desde
// App.jsx para no penalizar el arranque del tablero.
// =============================================================================

export function useDashboardData() {
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

        const [manifestData, coreMapData] = await Promise.all([
          loadManifest(),
          loadCoreMap(),
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
  }, []);

  return {
    manifest,
    coreMap,
    loadingInitial,
    error,
  };
}
