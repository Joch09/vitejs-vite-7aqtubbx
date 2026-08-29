// =============================================================================
// dashboardData.js
// Proyecto: Tablero accidentes y lesiones
//
// Capa única de acceso a los JSON de producción.
// NO contiene cálculos epidemiológicos.
// =============================================================================

const DATA_ROOT = `${import.meta.env.BASE_URL}data`.replace(/\/+$/, '');

const jsonCache = new Map();
const indexCache = new WeakMap();

function joinUrl(...parts) {
  return parts
    .filter(Boolean)
    .map((part, index) => {
      const text = String(part);
      if (index === 0) return text.replace(/\/+$/, '');
      return text.replace(/^\/+|\/+$/g, '');
    })
    .join('/');
}

async function fetchJson(relativePath) {
  const url = joinUrl(DATA_ROOT, relativePath);

  if (jsonCache.has(url)) {
    return jsonCache.get(url);
  }

  const promise = fetch(url, { cache: 'no-cache' }).then(async (response) => {
    if (!response.ok) {
      throw new Error(
        `No fue posible cargar ${relativePath}: HTTP ${response.status}`
      );
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
  return new Map(values.map((value, index) => [String(value), index]));
}

function getCompactIndexes(data) {
  if (indexCache.has(data)) {
    return indexCache.get(data);
  }

  const indexes = {
    dates: buildLookup(data?.indexes?.dates ?? []),
    entities: buildLookup(data?.indexes?.entities ?? []),
    categories: buildLookup(data?.indexes?.categories ?? []),
  };

  indexCache.set(data, indexes);
  return indexes;
}

function getRecordLookup(data, keys) {
  const existing = indexCache.get(data) ?? {};
  const cacheKey = `records:${keys.join(',')}`;

  if (existing[cacheKey]) {
    return existing[cacheKey];
  }

  const map = new Map();

  for (const record of data?.data ?? []) {
    const key = keys.map((k) => record[k]).join('|');
    map.set(key, record);
  }

  existing[cacheKey] = map;
  indexCache.set(data, existing);

  return map;
}

export function clearDataCache() {
  jsonCache.clear();
}

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

export async function resolveType(typeOrId) {
  const manifest = await loadManifest();

  const wanted = String(typeOrId ?? '').trim().toLowerCase();

  const match = (manifest.tipos ?? []).find((item) => {
    return (
      String(item.tipo_id).toLowerCase() === wanted ||
      String(item.tipo).toLowerCase() === wanted
    );
  });

  if (!match) {
    throw new Error(`Tipo no reconocido: ${typeOrId}`);
  }

  return match;
}

export async function loadTypeBundle(
  typeOrId,
  { includeCategoryMap = false } = {}
) {
  const type = await resolveType(typeOrId);

  const [bullets, profiles, categoryMap] = await Promise.all([
    fetchJson(type.bullets),
    fetchJson(type.perfiles),
    includeCategoryMap ? fetchJson(type.mapa_categoria) : Promise.resolve(null),
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
  return fetchJson(type.mapa_categoria);
}

export async function loadBullets(typeOrId) {
  const type = await resolveType(typeOrId);
  return fetchJson(type.bullets);
}

// -----------------------------------------------------------------------------
// MAPA
// -----------------------------------------------------------------------------

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
  const existing = indexCache.get(mapData) ?? {};

  if (existing.mapStructures) {
    return existing.mapStructures;
  }

  const dates = buildLookup(mapData?.indexes?.dates ?? []);
  const entities = buildLookup(mapData?.indexes?.entities ?? []);

  const comboBySignature = new Map();
  (mapData?.indexes?.combos ?? []).forEach((combo, index) => {
    const signature = [
      combo.evento,
      combo.tipo,
      combo.categoria,
      combo.nivel,
    ].join('|');
    comboBySignature.set(signature, index);
  });

  const recordByEntityCombo = new Map();

  for (const record of mapData?.data ?? []) {
    recordByEntityCombo.set(`${record.e}|${record.k}`, record);
  }

  const structures = {
    dates,
    entities,
    comboBySignature,
    recordByEntityCombo,
  };

  existing.mapStructures = structures;
  indexCache.set(mapData, existing);

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
  if (!mapData) return null;

  const metricKey = MAP_METRIC_KEYS?.[metric]?.[mode];

  if (!metricKey) {
    throw new Error(`Métrica/modo no reconocido: ${metric}/${mode}`);
  }

  const {
    dates,
    entities,
    comboBySignature,
    recordByEntityCombo,
  } = getMapStructures(mapData);

  const dateIdx = dates.get(String(date));
  const entityIdx = entities.get(String(entity));
  const comboIdx = comboBySignature.get(
    [event, type, category, level].join('|')
  );

  if (
    dateIdx === undefined ||
    entityIdx === undefined ||
    comboIdx === undefined
  ) {
    return null;
  }

  const record = recordByEntityCombo.get(`${entityIdx}|${comboIdx}`);
  if (!record) return null;

  const value = record?.[metricKey]?.[dateIdx];

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
  const entities = mapData?.indexes?.entities ?? [];

  return entities
    .filter((entity) => includeNational || entity !== 'NACIONAL')
    .map((entity) => ({
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
    }));
}

// -----------------------------------------------------------------------------
// BULLETS
// -----------------------------------------------------------------------------

function getBulletStructures(data) {
  const existing = indexCache.get(data) ?? {};

  if (existing.bulletStructures) {
    return existing.bulletStructures;
  }

  const dates = buildLookup(data?.indexes?.dates ?? []);
  const entities = buildLookup(data?.indexes?.entities ?? []);
  const categories = buildLookup(data?.indexes?.categories ?? []);

  const indicators = data?.indexes?.indicators ?? [];
  const indicatorsByIndex = indicators.map((item, index) => ({
    ...item,
    index,
  }));

  const records = new Map();

  for (const record of data?.data ?? []) {
    records.set(`${record.e}|${record.c}|${record.i}`, record);
  }

  const structures = {
    dates,
    entities,
    categories,
    indicatorsByIndex,
    records,
  };

  existing.bulletStructures = structures;
  indexCache.set(data, existing);

  return structures;
}

export function getBulletValues({
  bulletData,
  date,
  entity = 'NACIONAL',
  category = 'TODAS',
  mode = 'acumulado',
}) {
  if (!bulletData) return [];

  const {
    dates,
    entities,
    categories,
    indicatorsByIndex,
    records,
  } = getBulletStructures(bulletData);

  const dateIdx = dates.get(String(date));
  const entityIdx = entities.get(String(entity));
  const categoryIdx = categories.get(String(category));

  if (
    dateIdx === undefined ||
    entityIdx === undefined ||
    categoryIdx === undefined
  ) {
    return [];
  }

  return indicatorsByIndex.map((indicator) => {
    const record = records.get(
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

    const isAccumulated = mode === 'acumulado';

    return {
      ...indicator,
      value: (isAccumulated ? record.va : record.vd)?.[dateIdx] ?? null,
      numerator: (isAccumulated ? record.na : record.nd)?.[dateIdx] ?? 0,
      denominator: (isAccumulated ? record.da : record.dd)?.[dateIdx] ?? 0,
    };
  });
}

// -----------------------------------------------------------------------------
// PERFILES
// -----------------------------------------------------------------------------

function getProfileStructures(profileData, profileId) {
  const existing = indexCache.get(profileData) ?? {};
  const cacheKey = `profile:${profileId}`;

  if (existing[cacheKey]) {
    return existing[cacheKey];
  }

  const profile = profileData?.profiles?.[profileId];

  if (!profile) {
    return null;
  }

  const dates = buildLookup(profileData?.indexes?.dates ?? []);
  const entities = buildLookup(profileData?.indexes?.entities ?? []);
  const categories = buildLookup(profileData?.indexes?.categories ?? []);

  const records = new Map();

  for (const record of profile?.data ?? []) {
    const [e, c, s] = record;
    records.set(`${e}|${c}|${s}`, record);
  }

  const structures = {
    profile,
    dates,
    entities,
    categories,
    records,
  };

  existing[cacheKey] = structures;
  indexCache.set(profileData, existing);

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
  const structures = getProfileStructures(profileData, profileId);

  if (!structures) return [];

  const {
    profile,
    dates,
    entities,
    categories,
    records,
  } = structures;

  const dateIdx = dates.get(String(date));
  const entityIdx = entities.get(String(entity));
  const categoryIdx = categories.get(String(category));

  if (
    dateIdx === undefined ||
    entityIdx === undefined ||
    categoryIdx === undefined
  ) {
    return [];
  }

  return (profile.series ?? []).map((series, seriesIdx) => {
    const record = records.get(`${entityIdx}|${categoryIdx}|${seriesIdx}`);

    if (!record) {
      return {
        ...series,
        value: null,
      };
    }

    const dayValues = record[3];
    const accumulatedValues = record[4];

    return {
      ...series,
      value:
        (mode === 'acumulado' ? accumulatedValues : dayValues)?.[dateIdx] ??
        null,
    };
  });
}
