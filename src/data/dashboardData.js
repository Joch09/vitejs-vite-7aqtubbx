// =============================================================================
// dashboardData.js
// Proyecto: Tablero accidentes y lesiones
// V9.4.3 - perfiles 06/07 con rutas versionadas + bullets/perfiles sin cache
// =============================================================================
//
// Capa única de acceso a la rama de producción generada por los Pasos 44/45.
// React NO calcula epidemiología: sólo recupera valores precomputados en R.
//
// Fuente frontend esperada:
//   public/data/ocurrencia/
//
// Mantiene asArray() porque algunos arreglos compactos serializados por R
// pueden llegar como objetos con claves numéricas.
// =============================================================================

const DATA_ROOT = `${import.meta.env.BASE_URL}data`.replace(/\/+$/, '');
const OCCURRENCE_ROOT = 'ocurrencia';
const MUNICIPAL_GEOMETRY_ROOT = 'municipal';

// -----------------------------------------------------------------------------
// PERFILES VERSIONADOS 06 / 07
// -----------------------------------------------------------------------------
// Estos dos archivos fueron regenerados el 04-sep-2026 para incorporar
// area_anatomica. Se usan nombres nuevos para evitar que cualquier capa de
// StackBlitz/Vite/CDN entregue una copia previa con el mismo URL.
const PROFILE_FILE_OVERRIDES = {
  '06_maltrato_negligencia.json':
    '06_maltrato_negligencia_v2.json',
  '07_violencia_sexual.json':
    '07_violencia_sexual_v2.json',
};

const jsonCache = new Map();
const indexCache = new WeakMap();

function joinUrl(...parts) {
  return parts
    .filter((part) => part !== null && part !== undefined && part !== '')
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


// -----------------------------------------------------------------------------
// CARGA FRESCA DE DESCRIPTIVOS
// -----------------------------------------------------------------------------
//
// Los JSON de Indicadores descriptivos se están actualizando tipo por tipo.
// Vite/StackBlitz puede mantener vivo el módulo y, con él, jsonCache aun después
// de reemplazar un archivo dentro de public/. Para evitar que se muestre una
// versión anterior de los bullets o perfiles, éstos se solicitan sin cache y con un
// parámetro de versión único.
//
// Esto NO afecta mapas, tasas ni catálogos.
//
async function fetchJsonFresh(relativePath) {
  const baseUrl = joinUrl(DATA_ROOT, relativePath);
  const separator = baseUrl.includes('?') ? '&' : '?';
  const url = `${baseUrl}${separator}_fresh=${Date.now()}`;

  const response = await fetch(url, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(
      `No fue posible cargar ${relativePath}: HTTP ${response.status}`
    );
  }

  return response.json();
}

function occurrencePath(...parts) {
  return joinUrl(OCCURRENCE_ROOT, ...parts);
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === 'object') {
    return Object.values(value);
  }

  return [];
}

function buildLookup(values, getKey = (value) => value) {
  return new Map(
    asArray(values).map((value, index) => [String(getKey(value)), index])
  );
}

function normalizeEntityKey(value) {
  return String(value ?? '').trim().toUpperCase();
}

function getPeriodCatalog(catalogs) {
  return asArray(catalogs?.periods);
}

function getStateCatalog(catalogs) {
  return asArray(catalogs?.states);
}

function getMunicipalityCatalog(catalogs) {
  return asArray(catalogs?.municipalities);
}

function getDailyPeriodIds(catalogs) {
  return getPeriodCatalog(catalogs)
    .filter((item) => String(item?.tipo) === 'dia')
    .map((item) => String(item?.id));
}

function getStateNames(catalogs) {
  return getStateCatalog(catalogs).map((item) => String(item?.nombre ?? item?.id));
}

function enrichMapData(raw, catalogs, geography) {
  return {
    ...raw,
    indexes: {
      ...(raw?.indexes ?? {}),
      dates: getDailyPeriodIds(catalogs),
      entities: getStateNames(catalogs),
      municipalities: getMunicipalityCatalog(catalogs),
    },
    _catalogs: catalogs,
    _geography: geography,
  };
}

function enrichDescriptiveData(raw, catalogs) {
  return {
    ...raw,
    _catalogs: catalogs,
  };
}

export function clearDataCache() {
  jsonCache.clear();
}

// -----------------------------------------------------------------------------
// CARGA BASE
// -----------------------------------------------------------------------------

export async function loadManifest() {
  return fetchJson(occurrencePath('00_manifest.json'));
}

export async function loadMetadata() {
  return fetchJson(occurrencePath('02_descriptivos_manifest.json'));
}

export async function loadCatalogs() {
  return fetchJson(occurrencePath('01_catalogos.json'));
}

export async function loadCoreMap() {
  const [catalogs, raw] = await Promise.all([
    loadCatalogs(),
    fetchJson(occurrencePath('estatal', '00_core.json')),
  ]);

  return enrichMapData(raw, catalogs, 'nacional_estatal');
}

export async function resolveType(typeOrId) {
  const manifest = await loadManifest();
  const wanted = String(typeOrId ?? '').trim().toLowerCase();

  const match = asArray(manifest?.tipos).find((item) => {
    return (
      String(item?.tipo_id ?? '').toLowerCase() === wanted ||
      String(item?.tipo ?? '').toLowerCase() === wanted
    );
  });

  if (!match) {
    throw new Error(`Tipo no reconocido: ${typeOrId}`);
  }

  return match;
}

function typeFileName(type) {
  const candidate = String(type?.estatal ?? type?.municipal ?? '');
  const parts = candidate.split('/');
  return parts[parts.length - 1];
}

export async function loadTypeBundle(
  typeOrId,
  { includeCategoryMap = false } = {}
) {
  const type = await resolveType(typeOrId);
  const fileName = typeFileName(type);
  const profileFileName =
    PROFILE_FILE_OVERRIDES[fileName] ??
    fileName;

  if (!fileName) {
    throw new Error(`El tipo no tiene archivo asociado: ${typeOrId}`);
  }

  const [catalogs, bulletsRaw, profilesRaw, categoryRaw] = await Promise.all([
    loadCatalogs(),

    // IMPORTANTE:
    // Los bullets se leen siempre frescos para que un reemplazo en
    // public/data/ocurrencia/bullets/ se refleje inmediatamente en el tablero.
    fetchJsonFresh(occurrencePath('bullets', fileName)),

    // Los perfiles también se leen siempre frescos. Esto evita que
    // StackBlitz/Vite conserve en memoria una versión anterior después de
    // reemplazar archivos en public/data/ocurrencia/perfiles/.
    fetchJsonFresh(
      occurrencePath(
        'perfiles',
        profileFileName
      )
    ),

    includeCategoryMap
      ? fetchJson(occurrencePath(type.estatal))
      : Promise.resolve(null),
  ]);

  if (
    (
      fileName ===
        '06_maltrato_negligencia.json' ||
      fileName ===
        '07_violencia_sexual.json'
    ) &&
    !profilesRaw?.profiles?.area_anatomica
  ) {
    throw new Error(
      `El perfil versionado ${profileFileName} no contiene profiles.area_anatomica.`
    );
  }

  return {
    type,
    bullets: enrichDescriptiveData(bulletsRaw, catalogs),
    profiles: enrichDescriptiveData(profilesRaw, catalogs),
    categoryMap: categoryRaw
      ? enrichMapData(categoryRaw, catalogs, 'nacional_estatal')
      : null,
  };
}

export async function loadCategoryMap(typeOrId) {
  const type = await resolveType(typeOrId);
  const [catalogs, raw] = await Promise.all([
    loadCatalogs(),
    fetchJson(occurrencePath(type.estatal)),
  ]);

  return enrichMapData(raw, catalogs, 'nacional_estatal');
}

// -----------------------------------------------------------------------------
// ESTRUCTURAS COMPACTAS COMUNES
// -----------------------------------------------------------------------------

function getOccurrenceStructures(mapData) {
  const existing = indexCache.get(mapData) ?? {};

  if (existing.occurrenceStructures) {
    return existing.occurrenceStructures;
  }

  const catalogs = mapData?._catalogs ?? {};
  const periods = getPeriodCatalog(catalogs);
  const states = getStateCatalog(catalogs);
  const municipalities = getMunicipalityCatalog(catalogs);
  const combos = asArray(mapData?.indexes?.combos);

  const periodById = new Map();
  periods.forEach((item, index) => {
    periodById.set(String(item?.id), index);
  });

  const stateByKey = new Map();
  states.forEach((item, index) => {
    stateByKey.set(normalizeEntityKey(item?.id), index);
    stateByKey.set(normalizeEntityKey(item?.nombre), index);
  });

  const comboBySignature = new Map();
  combos.forEach((combo, index) => {
    const signature = [
      combo?.nivel,
      combo?.evento,
      combo?.tipo,
      combo?.categoria,
    ].join('|');
    comboBySignature.set(signature, index);
  });

  const recordByGeoCombo = new Map();
  for (const rawRecord of asArray(mapData?.data)) {
    const record = asArray(rawRecord);
    const geoIdx = Number(record?.[0]);
    const comboIdx = Number(record?.[1]);
    recordByGeoCombo.set(`${geoIdx}|${comboIdx}`, record);
  }

  const structures = {
    periods,
    states,
    municipalities,
    periodById,
    stateByKey,
    comboBySignature,
    recordByGeoCombo,
  };

  existing.occurrenceStructures = structures;
  indexCache.set(mapData, existing);

  return structures;
}

function getSparsePoint(pointsRaw, periodIdx) {
  const points = asArray(pointsRaw);

  let low = 0;
  let high = points.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const point = asArray(points[mid]);
    const pointPeriod = Number(point?.[0]);

    if (pointPeriod === periodIdx) {
      return point;
    }

    if (pointPeriod < periodIdx) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return null;
}

const METRIC_POINT_INDEX = {
  casos: 1,
  defunciones: 2,
  incidencia: 3,
  mortalidad: 4,
};

function missingMetricValue(metric, hasDenominator) {
  if (metric === 'casos' || metric === 'defunciones') {
    return 0;
  }

  return hasDenominator ? 0 : null;
}

function getPointMetric(point, metric, hasDenominator) {
  if (!point) {
    return missingMetricValue(metric, hasDenominator);
  }

  const position = METRIC_POINT_INDEX[metric];

  if (position === undefined) {
    throw new Error(`Métrica no reconocida: ${metric}`);
  }

  const raw = point?.[position];

  if (raw === null || raw === undefined) {
    return metric === 'casos' || metric === 'defunciones'
      ? 0
      : null;
  }

  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

// -----------------------------------------------------------------------------
// MAPA NACIONAL / ESTATAL
// -----------------------------------------------------------------------------

export function getMapValue({
  mapData,
  date,
  entity = 'NACIONAL',
  event = 'TODOS',
  type = 'TODOS',
  category = 'TODAS',
  level = 'total',
  metric = 'incidencia',
}) {
  if (!mapData || !date) return null;

  const {
    states,
    periodById,
    stateByKey,
    comboBySignature,
    recordByGeoCombo,
  } = getOccurrenceStructures(mapData);

  const periodIdx = periodById.get(String(date));
  const geoIdx = stateByKey.get(normalizeEntityKey(entity));
  const comboIdx = comboBySignature.get(
    [level, event, type, category].join('|')
  );

  if (
    periodIdx === undefined ||
    geoIdx === undefined ||
    comboIdx === undefined
  ) {
    return null;
  }

  const state = states[geoIdx];
  const hasDenominator = Boolean(state?.denominador);
  const record = recordByGeoCombo.get(`${geoIdx}|${comboIdx}`);
  const point = record ? getSparsePoint(record?.[2], periodIdx) : null;

  return getPointMetric(point, metric, hasDenominator);
}

export function getMapEntityValues({
  mapData,
  date,
  event = 'TODOS',
  type = 'TODOS',
  category = 'TODAS',
  level = 'total',
  metric = 'incidencia',
  includeNational = false,
}) {
  if (!mapData) return [];

  const states = getOccurrenceStructures(mapData).states;

  return states
    .filter((item) => includeNational || String(item?.id) !== 'NACIONAL')
    .map((item) => ({
      entity: String(item?.nombre ?? item?.id),
      entityId: String(item?.id),
      denominatorAvailable: Boolean(item?.denominador),
      value: getMapValue({
        mapData,
        date,
        entity: item?.id,
        event,
        type,
        category,
        level,
        metric,
      }),
    }));
}

// -----------------------------------------------------------------------------
// MAPA MUNICIPAL
// -----------------------------------------------------------------------------

export async function loadMunicipalManifest() {
  return loadManifest();
}

export async function loadMunicipalCore() {
  const [catalogs, raw] = await Promise.all([
    loadCatalogs(),
    fetchJson(occurrencePath('municipal', '00_core.json')),
  ]);

  return enrichMapData(raw, catalogs, 'municipal');
}

export async function loadMunicipalGeometry() {
  return fetchJson(joinUrl(MUNICIPAL_GEOMETRY_ROOT, 'municipios.geojson'));
}

export async function loadMunicipalStatesGeometry() {
  return fetchJson(joinUrl(MUNICIPAL_GEOMETRY_ROOT, 'estados.geojson'));
}

export async function resolveMunicipalType(typeOrId) {
  return resolveType(typeOrId);
}

export async function loadMunicipalCategoryMap(typeOrId) {
  const type = await resolveType(typeOrId);
  const [catalogs, raw] = await Promise.all([
    loadCatalogs(),
    fetchJson(occurrencePath(type.municipal)),
  ]);

  return enrichMapData(raw, catalogs, 'municipal');
}

// Compatibilidad con la V8.2: en la rama nueva casos, defunciones y tasas
// comparten el mismo cubo municipal, así que estas funciones son alias.
export async function loadMunicipalDeathsManifest() {
  return loadMunicipalManifest();
}

export async function loadMunicipalDeathsCore() {
  return loadMunicipalCore();
}

export async function resolveMunicipalDeathsType(typeOrId) {
  return resolveType(typeOrId);
}

export async function loadMunicipalDeathsCategoryMap(typeOrId) {
  return loadMunicipalCategoryMap(typeOrId);
}

export function getMunicipalValues({
  mapData,
  date,
  event = 'TODOS',
  type = 'TODOS',
  category = 'TODAS',
  level = 'total',
  metric = 'incidencia',
  countMetric = 'casos',
  entityCode = null,
}) {
  if (!mapData || !date) return [];

  const {
    municipalities,
    periodById,
    comboBySignature,
    recordByGeoCombo,
  } = getOccurrenceStructures(mapData);

  const periodIdx = periodById.get(String(date));
  const comboIdx = comboBySignature.get(
    [level, event, type, category].join('|')
  );

  if (periodIdx === undefined || comboIdx === undefined) {
    return [];
  }

  const wantedEntity =
    entityCode === null || entityCode === undefined || entityCode === ''
      ? null
      : String(entityCode).padStart(2, '0');

  return municipalities
    .map((municipality, geoIdx) => ({ municipality, geoIdx }))
    .filter(({ municipality }) => {
      if (!wantedEntity) return true;
      return String(municipality?.cve_ent ?? '').padStart(2, '0') === wantedEntity;
    })
    .map(({ municipality, geoIdx }) => {
      const hasDenominator = Boolean(municipality?.denominador);
      const record = recordByGeoCombo.get(`${geoIdx}|${comboIdx}`);
      const point = record ? getSparsePoint(record?.[2], periodIdx) : null;

      return {
        index: geoIdx,
        cvegeo: String(municipality?.cvegeo ?? ''),
        cve_ent: String(municipality?.cve_ent ?? '').padStart(2, '0'),
        cve_mun: String(municipality?.cve_mun ?? '').padStart(3, '0'),
        municipio: municipality?.municipio ?? '',
        denominatorAvailable: hasDenominator,
        population:
          municipality?.poblacion === null || municipality?.poblacion === undefined
            ? null
            : Number(municipality.poblacion),
        value: getPointMetric(point, metric, hasDenominator),
        count: getPointMetric(point, countMetric, hasDenominator),
      };
    });
}

// -----------------------------------------------------------------------------
// BULLETS
// -----------------------------------------------------------------------------

function getBulletStructures(data) {
  const existing = indexCache.get(data) ?? {};

  if (existing.bulletStructures) {
    return existing.bulletStructures;
  }

  const catalogs = data?._catalogs ?? {};
  const periodById = buildLookup(getPeriodCatalog(catalogs), (item) => item?.id);
  const entities = asArray(data?.indexes?.entities);
  const categories = asArray(data?.indexes?.categories);
  const indicators = asArray(data?.indexes?.indicators);

  const entityByValue = buildLookup(entities);

  // Los descriptivos del Paso 45 indexan entidades por clave (01..32),
  // mientras que la interfaz trabaja con nombres. Se registran ambas formas.
  getStateCatalog(catalogs).forEach((state) => {
    const stateId = String(state?.id ?? '');
    const stateName = String(state?.nombre ?? '');
    const idx = entities.findIndex((value) => String(value) === stateId);

    if (idx >= 0) {
      entityByValue.set(stateId, idx);
      entityByValue.set(stateName, idx);
    }
  });

  const categoryByValue = buildLookup(categories);

  const records = new Map();
  for (const rawRecord of asArray(data?.data)) {
    const record = asArray(rawRecord);
    records.set(`${record?.[0]}|${record?.[1]}|${record?.[2]}`, record);
  }

  const structures = {
    periodById,
    entities,
    categories,
    indicators,
    entityByValue,
    categoryByValue,
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
}) {
  if (!bulletData || !date) return [];

  const {
    periodById,
    indicators,
    entityByValue,
    categoryByValue,
    records,
  } = getBulletStructures(bulletData);

  const periodIdx = periodById.get(String(date));
  const entityIdx = entityByValue.get(String(entity));
  const categoryIdx = categoryByValue.get(String(category));

  if (
    periodIdx === undefined ||
    entityIdx === undefined ||
    categoryIdx === undefined
  ) {
    return [];
  }

  return indicators.map((indicator, indicatorIdx) => {
    const record = records.get(`${entityIdx}|${categoryIdx}|${indicatorIdx}`);
    const point = record ? getSparsePoint(record?.[3], periodIdx) : null;

    if (!point) {
      return {
        ...indicator,
        index: indicatorIdx,
        value: null,
        numerator: 0,
        denominator: 0,
      };
    }

    return {
      ...indicator,
      index: indicatorIdx,
      value:
        point?.[1] === null || point?.[1] === undefined
          ? null
          : Number(point[1]),
      numerator: Number(point?.[2] ?? 0),
      denominator: Number(point?.[3] ?? 0),
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
  if (!profile) return null;

  const catalogs = profileData?._catalogs ?? {};
  const periodById = buildLookup(getPeriodCatalog(catalogs), (item) => item?.id);
  const entities = asArray(profileData?.indexes?.entities);
  const categories = asArray(profileData?.indexes?.categories);
  const entityByValue = buildLookup(entities);

  getStateCatalog(catalogs).forEach((state) => {
    const stateId = String(state?.id ?? '');
    const stateName = String(state?.nombre ?? '');
    const idx = entities.findIndex((value) => String(value) === stateId);

    if (idx >= 0) {
      entityByValue.set(stateId, idx);
      entityByValue.set(stateName, idx);
    }
  });

  const categoryByValue = buildLookup(categories);
  const series = asArray(profile?.series);

  const records = new Map();
  for (const rawRecord of asArray(profile?.data)) {
    const record = asArray(rawRecord);
    records.set(`${record?.[0]}|${record?.[1]}|${record?.[2]}`, record);
  }

  const structures = {
    profile,
    series,
    periodById,
    entityByValue,
    categoryByValue,
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
}) {
  const structures = getProfileStructures(profileData, profileId);
  if (!structures || !date) return [];

  const {
    series,
    periodById,
    entityByValue,
    categoryByValue,
    records,
  } = structures;

  const periodIdx = periodById.get(String(date));
  const entityIdx = entityByValue.get(String(entity));
  const categoryIdx = categoryByValue.get(String(category));

  if (
    periodIdx === undefined ||
    entityIdx === undefined ||
    categoryIdx === undefined
  ) {
    return [];
  }

  return series.map((seriesItem, seriesIdx) => {
    const record = records.get(`${entityIdx}|${categoryIdx}|${seriesIdx}`);
    const point = record ? getSparsePoint(record?.[3], periodIdx) : null;

    if (!point) {
      return {
        ...seriesItem,
        value: String(seriesItem?.modo) === 'conteo' ? 0 : undefined,
      };
    }

    const raw = point?.[1];

    return {
      ...seriesItem,
      value:
        raw === null || raw === undefined
          ? String(seriesItem?.modo) === 'conteo'
            ? 0
            : undefined
          : Number(raw),
    };
  });
}
