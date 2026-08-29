// =============================================================================
// dashboardData.js
// Proyecto: Tablero accidentes y lesiones
//
// Capa única de acceso a los JSON de producción.
// NO realiza cálculos epidemiológicos.
// Únicamente:
//   - carga archivos JSON
//   - interpreta estructuras compactas
//   - localiza valores previamente calculados en R
//
// Compatible con estructuras JSON serializadas por R como:
//   - arreglos []
//   - objetos con claves {"0.0": {...}, ...}
// =============================================================================

const DATA_ROOT = `${import.meta.env.BASE_URL}data`.replace(/\/+$/, '');

const jsonCache = new Map();
const indexCache = new WeakMap();

// =============================================================================
// UTILIDADES
// =============================================================================

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === 'object') {
    return Object.values(value);
  }

  return [];
}

function joinUrl(...parts) {
  return parts
    .filter(Boolean)
    .map((part, index) => {
      const text = String(part);

      if (index === 0) {
        return text.replace(/\/+$/, '');
      }

      return text.replace(/^\/+|\/+$/g, '');
    })
    .join('/');
}

async function fetchJson(relativePath) {
  const url = joinUrl(DATA_ROOT, relativePath);

  if (jsonCache.has(url)) {
    return jsonCache.get(url);
  }

  const promise = fetch(url, {
    cache: 'no-cache',
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(
        `No fue posible cargar ${relativePath}: HTTP ${response.status}`
      );
    }

    const contentType = response.headers.get('content-type') ?? '';

    if (
      !contentType.includes('application/json') &&
      !contentType.includes('text/json')
    ) {
      const texto = await response.text();

      if (texto.trim().startsWith('<')) {
        throw new Error(
          `La ruta ${relativePath} devolvió HTML en lugar de JSON.`
        );
      }

      try {
        return JSON.parse(texto);
      } catch {
        throw new Error(
          `La respuesta de ${relativePath} no contiene JSON válido.`
        );
      }
    }

    return response.json();
  });

  jsonCache.set(url, promise);

  try {
    return await promise;
  } catch (error) {
    jsonCache.delete(url);
    throw error;
  }
}

function buildLookup(values) {
  return new Map(
    asArray(values).map((value, index) => [
      String(value),
      index,
    ])
  );
}

// =============================================================================
// CACHE
// =============================================================================

export function clearDataCache() {
  jsonCache.clear();
}

// =============================================================================
// CARGA DE ARCHIVOS BASE
// =============================================================================

export async function loadManifest() {
  return fetchJson('00_manifest.json');
}

export async function loadMetadata() {
  return fetchJson('00_metadatos.json');
}

export async function loadCatalogs() {
  return fetchJson('01_catalogos.json');
}

export async function loadCoreMap() {
  return fetchJson('mapa/00_core.json');
}

// =============================================================================
// RESOLUCIÓN Y CARGA POR TIPO
// =============================================================================

export async function resolveType(typeOrId) {
  const manifest = await loadManifest();

  const wanted = String(typeOrId ?? '')
    .trim()
    .toLowerCase();

  const tipos = asArray(manifest?.tipos);

  const match = tipos.find((item) => {
    return (
      String(item?.tipo_id ?? '').toLowerCase() === wanted ||
      String(item?.tipo ?? '').toLowerCase() === wanted
    );
  });

  if (!match) {
    throw new Error(
      `Tipo no reconocido: ${typeOrId}`
    );
  }

  return match;
}

export async function loadTypeBundle(
  typeOrId,
  {
    includeCategoryMap = false,
  } = {}
) {
  const type = await resolveType(typeOrId);

  const [
    bullets,
    profiles,
    categoryMap,
  ] = await Promise.all([
    fetchJson(type.bullets),

    fetchJson(type.perfiles),

    includeCategoryMap
      ? fetchJson(type.mapa_categoria)
      : Promise.resolve(null),
  ]);

  return {
    type,
    bullets,
    profiles,
    categoryMap,
  };
}

export async function loadCategoryMap(typeOrId) {
  const type = await resolveType(typeOrId);

  return fetchJson(
    type.mapa_categoria
  );
}

// =============================================================================
// MAPA
// =============================================================================

const MAP_METRIC_KEYS = {
  casos: {
    dia: 'cd',
    acumulado: 'ca',
  },

  defunciones: {
    dia: 'dd',
    acumulado: 'da',
  },

  incidencia: {
    dia: 'id',
    acumulado: 'ia',
  },

  mortalidad: {
    dia: 'md',
    acumulado: 'ma',
  },
};

function getMapStructures(mapData) {
  const existing =
    indexCache.get(mapData) ?? {};

  if (existing.mapStructures) {
    return existing.mapStructures;
  }

  const dates = buildLookup(
    mapData?.indexes?.dates
  );

  const entities = buildLookup(
    mapData?.indexes?.entities
  );

  const comboBySignature = new Map();

  const combos = asArray(
    mapData?.indexes?.combos
  );

  combos.forEach(
    (combo, index) => {
      const signature = [
        combo?.evento,
        combo?.tipo,
        combo?.categoria,
        combo?.nivel,
      ].join('|');

      comboBySignature.set(
        signature,
        index
      );
    }
  );

  const recordByEntityCombo =
    new Map();

  const records = asArray(
    mapData?.data
  );

  for (const record of records) {
    if (!record) {
      continue;
    }

    recordByEntityCombo.set(
      `${record.e}|${record.k}`,
      record
    );
  }

  const structures = {
    dates,
    entities,
    comboBySignature,
    recordByEntityCombo,
  };

  existing.mapStructures =
    structures;

  indexCache.set(
    mapData,
    existing
  );

  return structures;
}

export function getMapValue({
  mapData,
  date,
  entity = 'NACIONAL',
  event = 'TODOS',
  type = 'TODOS',
  category = 'TODAS',
  level = 'total',
  metric = 'incidencia',
  mode = 'acumulado',
}) {
  if (!mapData) {
    return null;
  }

  const metricKey =
    MAP_METRIC_KEYS?.[metric]?.[mode];

  if (!metricKey) {
    throw new Error(
      `Métrica/modo no reconocido: ${metric}/${mode}`
    );
  }

  const {
    dates,
    entities,
    comboBySignature,
    recordByEntityCombo,
  } = getMapStructures(mapData);

  const dateIdx = dates.get(
    String(date)
  );

  const entityIdx = entities.get(
    String(entity)
  );

  const comboSignature = [
    event,
    type,
    category,
    level,
  ].join('|');

  const comboIdx =
    comboBySignature.get(
      comboSignature
    );

  if (
    dateIdx === undefined ||
    entityIdx === undefined ||
    comboIdx === undefined
  ) {
    return null;
  }

  const record =
    recordByEntityCombo.get(
      `${entityIdx}|${comboIdx}`
    );

  if (!record) {
    return null;
  }

  const serie = asArray(
    record?.[metricKey]
  );

  const value =
    serie?.[dateIdx];

  return value ?? null;
}

export function getMapEntityValues({
  mapData,
  date,
  event = 'TODOS',
  type = 'TODOS',
  category = 'TODAS',
  level = 'total',
  metric = 'incidencia',
  mode = 'acumulado',
  includeNational = false,
}) {
  if (!mapData) {
    return [];
  }

  const entities = asArray(
    mapData?.indexes?.entities
  );

  return entities
    .filter((entity) => {
      return (
        includeNational ||
        entity !== 'NACIONAL'
      );
    })
    .map((entity) => {
      return {
        entity,

        value: getMapValue({
          mapData,
          date,
          entity,
          event,
          type,
          category,
          level,
          metric,
          mode,
        }),
      };
    });
}

// =============================================================================
// BULLETS
// =============================================================================

function getBulletStructures(data) {
  const existing =
    indexCache.get(data) ?? {};

  if (existing.bulletStructures) {
    return existing.bulletStructures;
  }

  const dates = buildLookup(
    data?.indexes?.dates
  );

  const entities = buildLookup(
    data?.indexes?.entities
  );

  const categories = buildLookup(
    data?.indexes?.categories
  );

  const indicators = asArray(
    data?.indexes?.indicators
  );

  const indicatorsByIndex =
    indicators.map(
      (item, index) => ({
        ...item,
        index,
      })
    );

  const records = new Map();

  const dataRecords = asArray(
    data?.data
  );

  for (const record of dataRecords) {
    if (!record) {
      continue;
    }

    records.set(
      `${record.e}|${record.c}|${record.i}`,
      record
    );
  }

  const structures = {
    dates,
    entities,
    categories,
    indicatorsByIndex,
    records,
  };

  existing.bulletStructures =
    structures;

  indexCache.set(
    data,
    existing
  );

  return structures;
}

export function getBulletValues({
  bulletData,
  date,
  entity = 'NACIONAL',
  category = 'TODAS',
  mode = 'acumulado',
}) {
  if (!bulletData) {
    return [];
  }

  const {
    dates,
    entities,
    categories,
    indicatorsByIndex,
    records,
  } = getBulletStructures(
    bulletData
  );

  const dateIdx = dates.get(
    String(date)
  );

  const entityIdx = entities.get(
    String(entity)
  );

  const categoryIdx =
    categories.get(
      String(category)
    );

  if (
    dateIdx === undefined ||
    entityIdx === undefined ||
    categoryIdx === undefined
  ) {
    return [];
  }

  const isAccumulated =
    mode === 'acumulado';

  return indicatorsByIndex.map(
    (indicator) => {
      const record =
        records.get(
          `${entityIdx}|${categoryIdx}|${indicator.index}`
        );

      if (!record) {
        return {
          ...indicator,
          value: null,
          numerator: 0,
          denominator: 0,
        };
      }

      const valueSeries = asArray(
        isAccumulated
          ? record.va
          : record.vd
      );

      const numeratorSeries =
        asArray(
          isAccumulated
            ? record.na
            : record.nd
        );

      const denominatorSeries =
        asArray(
          isAccumulated
            ? record.da
            : record.dd
        );

      return {
        ...indicator,

        value:
          valueSeries?.[dateIdx] ??
          null,

        numerator:
          numeratorSeries?.[dateIdx] ??
          0,

        denominator:
          denominatorSeries?.[dateIdx] ??
          0,
      };
    }
  );
}

// =============================================================================
// PERFILES
// =============================================================================

function getProfileStructures(
  profileData,
  profileId
) {
  const existing =
    indexCache.get(profileData) ?? {};

  const cacheKey =
    `profile:${profileId}`;

  if (existing[cacheKey]) {
    return existing[cacheKey];
  }

  const profile =
    profileData?.profiles?.[
      profileId
    ];

  if (!profile) {
    return null;
  }

  const dates = buildLookup(
    profileData?.indexes?.dates
  );

  const entities = buildLookup(
    profileData?.indexes?.entities
  );

  const categories = buildLookup(
    profileData?.indexes?.categories
  );

  const records = new Map();

  const profileRecords =
    asArray(
      profile?.data
    );

  for (
    const record
    of profileRecords
  ) {
    if (!record) {
      continue;
    }

    const arr = asArray(
      record
    );

    const e = arr[0];
    const c = arr[1];
    const s = arr[2];

    records.set(
      `${e}|${c}|${s}`,
      arr
    );
  }

  const structures = {
    profile,
    dates,
    entities,
    categories,
    records,
  };

  existing[cacheKey] =
    structures;

  indexCache.set(
    profileData,
    existing
  );

  return structures;
}

export function getProfileSeries({
  profileData,
  profileId,
  date,
  entity = 'NACIONAL',
  category = 'TODAS',
  mode = 'acumulado',
}) {
  const structures =
    getProfileStructures(
      profileData,
      profileId
    );

  if (!structures) {
    return [];
  }

  const {
    profile,
    dates,
    entities,
    categories,
    records,
  } = structures;

  const dateIdx = dates.get(
    String(date)
  );

  const entityIdx = entities.get(
    String(entity)
  );

  const categoryIdx =
    categories.get(
      String(category)
    );

  if (
    dateIdx === undefined ||
    entityIdx === undefined ||
    categoryIdx === undefined
  ) {
    return [];
  }

  const seriesCatalog = asArray(
    profile?.series
  );

  return seriesCatalog.map(
    (series, seriesIdx) => {
      const record =
        records.get(
          `${entityIdx}|${categoryIdx}|${seriesIdx}`
        );

      if (!record) {
        return {
          ...series,
          value: null,
        };
      }

      const dayValues =
        asArray(
          record[3]
        );

      const accumulatedValues =
        asArray(
          record[4]
        );

      const selectedValues =
        mode === 'acumulado'
          ? accumulatedValues
          : dayValues;

      return {
        ...series,

        value:
          selectedValues?.[
            dateIdx
          ] ?? null,
      };
    }
  );
}