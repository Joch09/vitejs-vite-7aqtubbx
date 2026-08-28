import { useCallback, useEffect, useRef, useState } from 'react';

import {
  loadCatalogs,
  loadCoreMap,
  loadManifest,
  loadMetadata,
  loadTypeBundle,
} from '../data/dashboardData';

export function useDashboardData() {
  const [manifest, setManifest] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [catalogs, setCatalogs] = useState(null);
  const [coreMap, setCoreMap] = useState(null);

  const [loadingInitial, setLoadingInitial] = useState(true);
  const [error, setError] = useState(null);

  const typeCacheRef = useRef(new Map());

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        setLoadingInitial(true);
        setError(null);

        const [manifestData, metadataData, catalogsData, coreMapData] =
          await Promise.all([
            loadManifest(),
            loadMetadata(),
            loadCatalogs(),
            loadCoreMap(),
          ]);

        if (!active) return;

        setManifest(manifestData);
        setMetadata(metadataData);
        setCatalogs(catalogsData);
        setCoreMap(coreMapData);
      } catch (err) {
        if (!active) return;
        setError(err);
      } finally {
        if (active) {
          setLoadingInitial(false);
        }
      }
    }

    initialize();

    return () => {
      active = false;
    };
  }, []);

  const ensureTypeData = useCallback(
    async (typeOrId, { includeCategoryMap = false } = {}) => {
      const cacheKey = String(typeOrId);
      const cached = typeCacheRef.current.get(cacheKey);

      if (
        cached &&
        (!includeCategoryMap || cached.categoryMap)
      ) {
        return cached;
      }

      const bundle = await loadTypeBundle(typeOrId, {
        includeCategoryMap,
      });

      typeCacheRef.current.set(cacheKey, bundle);
      typeCacheRef.current.set(bundle.type.tipo_id, bundle);
      typeCacheRef.current.set(bundle.type.tipo, bundle);

      return bundle;
    },
    []
  );

  return {
    manifest,
    metadata,
    catalogs,
    coreMap,
    loadingInitial,
    error,
    ensureTypeData,
  };
}