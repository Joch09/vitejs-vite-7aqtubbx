import { useEffect, useMemo, useState } from 'react';

import { useDashboardData } from './hooks/useDashboardData';

import {
  getBulletValues,
  getMapEntityValues,
  getMapValue,
  getMunicipalValues,
  getProfileSeries,
  loadCategoryMap,
  loadMunicipalCategoryMap,
  loadMunicipalCore,
  loadMunicipalGeometry,
  loadMunicipalManifest,
  loadMunicipalStatesGeometry,
  loadTypeBundle,
} from './data/dashboardData';

// =============================================================================
// GEOMETRÍA DEL MAPA
// =============================================================================
//
// Para esta primera integración visual no se agrega ninguna librería externa.
// El GeoJSON se consulta directamente y React lo convierte a SVG.
//
// Una vez validado visualmente en StackBlitz, podemos guardar esta geometría
// dentro de public/data para eliminar la dependencia externa.
//
const MEXICO_GEOJSON_URL =
  'https://raw.githubusercontent.com/angelnmara/geojson/master/mexicoHigh.json';

const MAP_WIDTH = 900;
const MAP_HEIGHT = 520;
const MAP_PADDING = 20;

const MAP_COLORS = [
  '#f4e9ec',
  '#e6c8d0',
  '#cf9fac',
  '#b36d80',
  '#91465c',
  '#6f263d',
];

const NO_DATA_COLOR = '#e5e7eb';

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

const ENTITY_ALIASES = {
  'CIUDAD DE MEXICO': [
    'CIUDAD DE MEXICO',
    'CDMX',
    'DISTRITO FEDERAL',
  ],
  MEXICO: [
    'MEXICO',
    'ESTADO DE MEXICO',
  ],
  COAHUILA: [
    'COAHUILA',
    'COAHUILA DE ZARAGOZA',
  ],
  MICHOACAN: [
    'MICHOACAN',
    'MICHOACAN DE OCAMPO',
  ],
  VERACRUZ: [
    'VERACRUZ',
    'VERACRUZ DE IGNACIO DE LA LLAVE',
  ],
  QUERETARO: [
    'QUERETARO',
    'QUERETARO DE ARTEAGA',
  ],
};

function resolveFeatureEntity(featureName, availableEntities) {
  const normalizedFeature = normalizeText(featureName);

  const byNormalized = new Map(
    availableEntities.map((name) => [
      normalizeText(name),
      name,
    ])
  );

  if (byNormalized.has(normalizedFeature)) {
    return byNormalized.get(normalizedFeature);
  }

  const aliasList =
    ENTITY_ALIASES[normalizedFeature] ?? [];

  for (const alias of aliasList) {
    if (byNormalized.has(alias)) {
      return byNormalized.get(alias);
    }
  }

  for (const [normalizedEntity, original] of byNormalized) {
    if (
      normalizedEntity === normalizedFeature ||
      normalizedEntity.startsWith(
        `${normalizedFeature} `
      ) ||
      normalizedFeature.startsWith(
        `${normalizedEntity} `
      )
    ) {
      return original;
    }
  }

  return null;
}

function collectCoordinates(coords, target) {
  if (!Array.isArray(coords)) {
    return;
  }

  if (
    coords.length >= 2 &&
    typeof coords[0] === 'number' &&
    typeof coords[1] === 'number'
  ) {
    target.push(coords);
    return;
  }

  coords.forEach((item) =>
    collectCoordinates(item, target)
  );
}

function createProjection(features) {
  const points = [];

  features.forEach((feature) => {
    collectCoordinates(
      feature?.geometry?.coordinates,
      points
    );
  });

  if (points.length === 0) {
    return null;
  }

  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  points.forEach(([lon, lat]) => {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  });

  const midLat = (minLat + maxLat) / 2;
  const cosLat =
    Math.cos((midLat * Math.PI) / 180) || 1;

  const minX = minLon * cosLat;
  const maxX = maxLon * cosLat;
  const minY = -maxLat;
  const maxY = -minLat;

  const rawWidth = maxX - minX;
  const rawHeight = maxY - minY;

  const usableWidth =
    MAP_WIDTH - MAP_PADDING * 2;
  const usableHeight =
    MAP_HEIGHT - MAP_PADDING * 2;

  const scale = Math.min(
    usableWidth / rawWidth,
    usableHeight / rawHeight
  );

  const projectedWidth = rawWidth * scale;
  const projectedHeight = rawHeight * scale;

  const offsetX =
    (MAP_WIDTH - projectedWidth) / 2;
  const offsetY =
    (MAP_HEIGHT - projectedHeight) / 2;

  return ([lon, lat]) => {
    const rawX = lon * cosLat;
    const rawY = -lat;

    const x =
      offsetX + (rawX - minX) * scale;

    const y =
      offsetY + (rawY - minY) * scale;

    return [x, y];
  };
}

function ringToPath(ring, project) {
  if (!Array.isArray(ring) || ring.length === 0) {
    return '';
  }

  return ring
    .map((point, index) => {
      const [x, y] = project(point);
      return `${
        index === 0 ? 'M' : 'L'
      }${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ')
    .concat(' Z');
}

function geometryToPath(geometry, project) {
  if (!geometry || !project) {
    return '';
  }

  if (geometry.type === 'Polygon') {
    return geometry.coordinates
      .map((ring) =>
        ringToPath(ring, project)
      )
      .join(' ');
  }

  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates
      .flatMap((polygon) =>
        polygon.map((ring) =>
          ringToPath(ring, project)
        )
      )
      .join(' ');
  }

  return '';
}

function getColorIndex(
  value,
  minValue,
  maxValue
) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return null;
  }

  if (
    !Number.isFinite(minValue) ||
    !Number.isFinite(maxValue) ||
    maxValue <= minValue
  ) {
    return MAP_COLORS.length - 1;
  }

  const ratio =
    (Number(value) - minValue) /
    (maxValue - minValue);

  const index = Math.floor(
    Math.max(
      0,
      Math.min(0.999999, ratio)
    ) * MAP_COLORS.length
  );

  return Math.max(
    0,
    Math.min(
      MAP_COLORS.length - 1,
      index
    )
  );
}

function formatBulletValue(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '—';
  }

  return `${new Intl.NumberFormat(
    'es-MX',
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }
  ).format(number)}%`;
}

function MexicoChoropleth({
  geoData,
  geoLoading,
  geoError,
  entities,
  rateValues,
  countValues,
  selectedEntity,
  onSelectEntity,
  measure,
  date,
}) {
  const [tooltip, setTooltip] =
    useState(null);

  const features = useMemo(() => {
    if (!Array.isArray(geoData?.features)) {
      return [];
    }

    return geoData.features;
  }, [geoData]);

  const projection = useMemo(
    () => createProjection(features),
    [features]
  );

  const rateByEntity = useMemo(() => {
    const map = new Map();

    rateValues.forEach((item) => {
      map.set(
        normalizeText(item.entity),
        item.value
      );
    });

    return map;
  }, [rateValues]);

  const countByEntity = useMemo(() => {
    const map = new Map();

    countValues.forEach((item) => {
      map.set(
        normalizeText(item.entity),
        item.value
      );
    });

    return map;
  }, [countValues]);

  const validRates = useMemo(() => {
    return rateValues
      .map((item) => Number(item.value))
      .filter((value) =>
        Number.isFinite(value)
      );
  }, [rateValues]);

  const minRate =
    validRates.length > 0
      ? Math.min(...validRates)
      : NaN;

  const maxRate =
    validRates.length > 0
      ? Math.max(...validRates)
      : NaN;

  if (geoLoading) {
    return (
      <div style={styles.mapStatus}>
        Cargando geometría del mapa...
      </div>
    );
  }

  if (geoError) {
    return (
      <div style={styles.mapStatusError}>
        <strong>
          No fue posible cargar el mapa.
        </strong>
        <div style={styles.note}>
          {geoError.message}
        </div>
      </div>
    );
  }

  if (
    features.length === 0 ||
    !projection
  ) {
    return (
      <div style={styles.mapStatus}>
        Sin geometría disponible.
      </div>
    );
  }

  return (
    <div style={styles.mapBlock}>
      <div style={styles.svgWrapper}>
        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          role="img"
          aria-label="Mapa coroplético de México por entidad federativa"
          style={styles.mapSvg}
        >
          {features.map((feature) => {
            const featureName =
              feature?.properties?.name ??
              feature?.id ??
              'Entidad';

            const resolvedEntity =
              resolveFeatureEntity(
                featureName,
                entities
              );

            const normalizedResolved =
              normalizeText(
                resolvedEntity ??
                  featureName
              );

            const rate =
              rateByEntity.has(
                normalizedResolved
              )
                ? rateByEntity.get(
                    normalizedResolved
                  )
                : null;

            const count =
              countByEntity.has(
                normalizedResolved
              )
                ? countByEntity.get(
                    normalizedResolved
                  )
                : null;

            const colorIndex =
              getColorIndex(
                rate,
                minRate,
                maxRate
              );

            const fill =
              colorIndex === null
                ? NO_DATA_COLOR
                : MAP_COLORS[
                    colorIndex
                  ];

            const isSelected =
              resolvedEntity &&
              normalizeText(
                selectedEntity
              ) ===
                normalizeText(
                  resolvedEntity
                );

            const path =
              geometryToPath(
                feature.geometry,
                projection
              );

            return (
              <path
                key={
                  feature.id ??
                  featureName
                }
                d={path}
                fill={fill}
                fillRule="evenodd"
                stroke={
                  isSelected
                    ? '#111827'
                    : '#ffffff'
                }
                strokeWidth={
                  isSelected ? 2.3 : 1.1
                }
                vectorEffect="non-scaling-stroke"
                style={{
                  cursor:
                    resolvedEntity
                      ? 'pointer'
                      : 'default',
                  transition:
                    'fill 120ms ease, opacity 120ms ease',
                }}
                onMouseMove={(event) => {
                  const svg =
                    event.currentTarget
                      .ownerSVGElement;

                  const rect =
                    svg.getBoundingClientRect();

                  setTooltip({
                    x:
                      event.clientX -
                      rect.left +
                      12,
                    y:
                      event.clientY -
                      rect.top +
                      12,
                    featureName,
                    entity:
                      resolvedEntity ??
                      featureName,
                    rate,
                    count,
                    hasDashboardEntity:
                      Boolean(
                        resolvedEntity
                      ),
                  });
                }}
                onMouseLeave={() =>
                  setTooltip(null)
                }
                onClick={() => {
                  if (resolvedEntity) {
                    onSelectEntity(
                      resolvedEntity
                    );
                  }
                }}
              >
                <title>
                  {resolvedEntity ??
                    featureName}
                </title>
              </path>
            );
          })}
        </svg>

        {tooltip && (
          <div
            style={{
              ...styles.tooltip,
              left: tooltip.x,
              top: tooltip.y,
            }}
          >
            <div
              style={
                styles.tooltipTitle
              }
            >
              {tooltip.entity}
            </div>

            {tooltip.hasDashboardEntity ? (
              <>
                <div
                  style={
                    styles.tooltipRow
                  }
                >
                  <span>
                    {measure ===
                    'incidencia'
                      ? 'Casos'
                      : 'Defunciones'}
                  </span>
                  <strong>
                    {tooltip.count ===
                      null ||
                    tooltip.count ===
                      undefined
                      ? '—'
                      : Number(
                          tooltip.count
                        ).toLocaleString(
                          'es-MX'
                        )}
                  </strong>
                </div>

                <div
                  style={
                    styles.tooltipRow
                  }
                >
                  <span>Tasa</span>
                  <strong>
                    {tooltip.rate ===
                      null ||
                    tooltip.rate ===
                      undefined
                      ? 'No disponible'
                      : Number(
                          tooltip.rate
                        ).toFixed(2)}
                  </strong>
                </div>
              </>
            ) : (
              <div style={styles.note}>
                Sin información para la
                selección actual.
              </div>
            )}
          </div>
        )}
      </div>

      <div style={styles.mapFooter}>
        <div style={styles.legend}>
          <span style={styles.legendText}>
            Menor tasa
          </span>

          {MAP_COLORS.map(
            (color, index) => (
              <span
                key={color}
                title={`Nivel ${
                  index + 1
                }`}
                style={{
                  ...styles.legendSwatch,
                  background: color,
                }}
              />
            )
          )}

          <span style={styles.legendText}>
            Mayor tasa
          </span>

          <span
            style={{
              ...styles.legendSwatch,
              background:
                NO_DATA_COLOR,
              marginLeft: '10px',
            }}
          />

          <span style={styles.legendText}>
            Sin tasa
          </span>
        </div>

        <div style={styles.note}>
          Tasa acumulada al{' '}
          <strong>{date || '—'}</strong>.
          Selecciona una entidad en el mapa
          para actualizar el KPI.
        </div>
      </div>
    </div>
  );
}


// =============================================================================
// MAPA MUNICIPAL
// =============================================================================
//
// Se mantiene intacto MexicoChoropleth como respaldo visual estatal.
// El mapa municipal consume exclusivamente los conteos precalculados del
// Paso 38 y las geometrías locales desplegadas por el Paso 39.
// =============================================================================

function quantile(sortedValues, q) {
  if (!sortedValues.length) {
    return 0;
  }

  const position = (sortedValues.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  const next = sortedValues[base + 1];

  if (next === undefined) {
    return sortedValues[base];
  }

  return sortedValues[base] + rest * (next - sortedValues[base]);
}

function buildMunicipalScale(values) {
  const positive = values
    .map((item) => Number(item?.value ?? 0))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

  const colors = MAP_COLORS.slice(1);

  if (positive.length === 0) {
    return {
      breaks: [0, 0, 0, 0],
      colors,
    };
  }

  return {
    breaks: [
      quantile(positive, 0.2),
      quantile(positive, 0.4),
      quantile(positive, 0.6),
      quantile(positive, 0.8),
    ],
    colors,
  };
}

function getMunicipalColor(value, scale) {
  const number = Number(value ?? 0);

  if (!Number.isFinite(number) || number <= 0) {
    return NO_DATA_COLOR;
  }

  const [b1, b2, b3, b4] = scale.breaks;

  if (number <= b1) return scale.colors[0];
  if (number <= b2) return scale.colors[1];
  if (number <= b3) return scale.colors[2];
  if (number <= b4) return scale.colors[3];

  return scale.colors[4];
}

function formatMunicipalBreak(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '0';
  }

  return Math.max(1, Math.round(number)).toLocaleString('es-MX');
}

function MunicipalChoropleth({
  municipiosGeo,
  estadosGeo,
  values,
  entityCode,
  date,
  loading,
  error,
}) {
  const [tooltip, setTooltip] = useState(null);

  const allMunicipalFeatures = useMemo(() => {
    return Array.isArray(municipiosGeo?.features)
      ? municipiosGeo.features
      : [];
  }, [municipiosGeo]);

  const allStateFeatures = useMemo(() => {
    return Array.isArray(estadosGeo?.features)
      ? estadosGeo.features
      : [];
  }, [estadosGeo]);

  const visibleMunicipalFeatures = useMemo(() => {
    if (!entityCode) {
      return allMunicipalFeatures;
    }

    return allMunicipalFeatures.filter((feature) => {
      return (
        String(feature?.properties?.cve_ent ?? '').padStart(2, '0') ===
        entityCode
      );
    });
  }, [allMunicipalFeatures, entityCode]);

  const visibleStateFeatures = useMemo(() => {
    if (!entityCode) {
      return allStateFeatures;
    }

    return allStateFeatures.filter((feature) => {
      return (
        String(feature?.properties?.cve_ent ?? '').padStart(2, '0') ===
        entityCode
      );
    });
  }, [allStateFeatures, entityCode]);

  const projection = useMemo(
    () => createProjection(visibleMunicipalFeatures),
    [visibleMunicipalFeatures]
  );

  const valueByCvegeo = useMemo(() => {
    return new Map(
      (values ?? []).map((item) => [
        String(item.cvegeo),
        Number(item.value ?? 0),
      ])
    );
  }, [values]);

  const scale = useMemo(
    () => buildMunicipalScale(values ?? []),
    [values]
  );

  const municipalPaths = useMemo(() => {
    if (!projection) {
      return [];
    }

    return visibleMunicipalFeatures.map((feature) => ({
      feature,
      cvegeo: String(feature?.properties?.cvegeo ?? ''),
      path: geometryToPath(feature.geometry, projection),
    }));
  }, [
    visibleMunicipalFeatures,
    projection,
  ]);

  const statePaths = useMemo(() => {
    if (!projection) {
      return [];
    }

    return visibleStateFeatures.map((feature, index) => ({
      feature,
      index,
      path: geometryToPath(feature.geometry, projection),
    }));
  }, [
    visibleStateFeatures,
    projection,
  ]);

  if (loading) {
    return (
      <div style={styles.mapStatus}>
        Cargando mapa municipal...
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.mapStatusError}>
        <strong>No fue posible cargar el mapa municipal.</strong>
        <div style={styles.note}>{error.message}</div>
      </div>
    );
  }

  if (visibleMunicipalFeatures.length === 0 || !projection) {
    return (
      <div style={styles.mapStatus}>
        Sin geometría municipal disponible para la selección actual.
      </div>
    );
  }

  const [b1, b2, b3, b4] = scale.breaks;

  const legend = [
    { color: NO_DATA_COLOR, label: '0' },
    { color: scale.colors[0], label: `1–${formatMunicipalBreak(b1)}` },
    { color: scale.colors[1], label: `≤ ${formatMunicipalBreak(b2)}` },
    { color: scale.colors[2], label: `≤ ${formatMunicipalBreak(b3)}` },
    { color: scale.colors[3], label: `≤ ${formatMunicipalBreak(b4)}` },
    { color: scale.colors[4], label: `> ${formatMunicipalBreak(b4)}` },
  ];

  return (
    <div style={styles.mapBlock}>
      <div style={styles.svgWrapper}>
        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          role="img"
          aria-label="Mapa municipal de casos"
          style={styles.mapSvg}
        >
          {municipalPaths.map(({ feature, cvegeo, path }) => {
            const value = valueByCvegeo.get(cvegeo) ?? 0;
            const municipio = feature?.properties?.municipio ?? 'Municipio';
            const entidadNombre = feature?.properties?.entidad ?? '';

            return (
              <path
                key={cvegeo}
                d={path}
                fill={getMunicipalColor(value, scale)}
                fillRule="evenodd"
                stroke="#ffffff"
                strokeWidth={0.45}
                vectorEffect="non-scaling-stroke"
                style={{
                  cursor: 'default',
                  transition: 'fill 120ms ease',
                }}
                onMouseMove={(event) => {
                  const svg = event.currentTarget.ownerSVGElement;
                  const rect = svg.getBoundingClientRect();

                  setTooltip({
                    x: event.clientX - rect.left + 12,
                    y: event.clientY - rect.top + 12,
                    entidad: entidadNombre,
                    municipio,
                    cvegeo,
                    value,
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
              >
                <title>
                  {`${entidadNombre} · ${municipio} · ${Number(
                    value
                  ).toLocaleString('es-MX')} casos`}
                </title>
              </path>
            );
          })}

          {statePaths.map(({ feature, index, path }) => (
            <path
              key={
                feature?.properties?.cve_ent ??
                feature?.properties?.entidad ??
                index
              }
              d={path}
              fill="none"
              stroke="#344054"
              strokeWidth={1.25}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          ))}
        </svg>

        {tooltip && (
          <div
            style={{
              ...styles.tooltip,
              left: tooltip.x,
              top: tooltip.y,
            }}
          >
            <div style={styles.tooltipTitle}>
              {tooltip.municipio}
            </div>

            <div style={styles.tooltipRow}>
              <span>Entidad</span>
              <strong>{tooltip.entidad || '—'}</strong>
            </div>

            <div style={styles.tooltipRow}>
              <span>CVEGEO</span>
              <strong>{tooltip.cvegeo}</strong>
            </div>

            <div style={styles.tooltipRow}>
              <span>Casos</span>
              <strong>
                {Number(tooltip.value).toLocaleString('es-MX')}
              </strong>
            </div>
          </div>
        )}
      </div>

      <div style={styles.mapFooter}>
        <div style={styles.legend}>
          {legend.map((item, index) => (
            <span
              key={`${item.label}-${index}`}
              style={styles.municipalLegendItem}
            >
              <span
                style={{
                  ...styles.legendSwatch,
                  background: item.color,
                }}
              />
              <span style={styles.legendText}>{item.label}</span>
            </span>
          ))}
        </div>

        <div style={styles.note}>
          Conteo acumulado de casos georreferenciables al{' '}
          <strong>{date || '—'}</strong>. Sin tasa municipal.
        </div>
      </div>
    </div>
  );
}

function App() {
  const {
    manifest,
    coreMap,
    loadingInitial,
    error: loadingError,
  } = useDashboardData();

  const [evento, setEvento] =
    useState('TODOS');
  const [tipo, setTipo] =
    useState('TODOS');
  const [categoria, setCategoria] =
    useState('TODAS');
  const [entidad, setEntidad] =
    useState('NACIONAL');

  const [medida, setMedida] =
    useState('incidencia');
  const [fecha, setFecha] =
    useState('');
  const [nivelMapa, setNivelMapa] =
    useState('estatal');

  const [
    categoryMap,
    setCategoryMap,
  ] = useState(null);

  const [
    loadingCategoryMap,
    setLoadingCategoryMap,
  ] = useState(false);

  const [
    categoryError,
    setCategoryError,
  ] = useState(null);

  const [
    bulletData,
    setBulletData,
  ] = useState(null);

  const [
    loadingBullets,
    setLoadingBullets,
  ] = useState(false);

  const [
    bulletError,
    setBulletError,
  ] = useState(null);

  const [
    profileData,
    setProfileData,
  ] = useState(null);

  const [geoData, setGeoData] =
    useState(null);
  const [geoLoading, setGeoLoading] =
    useState(true);
  const [geoError, setGeoError] =
    useState(null);

  const [municipalManifest, setMunicipalManifest] =
    useState(null);
  const [municipalCore, setMunicipalCore] =
    useState(null);
  const [municipalCategoryMap, setMunicipalCategoryMap] =
    useState(null);
  const [municipiosGeo, setMunicipiosGeo] =
    useState(null);
  const [estadosMunicipalesGeo, setEstadosMunicipalesGeo] =
    useState(null);
  const [municipalLoading, setMunicipalLoading] =
    useState(true);
  const [municipalError, setMunicipalError] =
    useState(null);
  const [municipalCategoryError, setMunicipalCategoryError] =
    useState(null);

  // ===========================================================================
  // GEOMETRÍA DEL MAPA
  // ===========================================================================

  useEffect(() => {
    let active = true;

    async function cargarGeoJSON() {
      try {
        setGeoLoading(true);
        setGeoError(null);

        const response = await fetch(
          MEXICO_GEOJSON_URL
        );

        if (!response.ok) {
          throw new Error(
            `GeoJSON HTTP ${response.status}`
          );
        }

        const data =
          await response.json();

        if (!active) {
          return;
        }

        setGeoData(data);
      } catch (err) {
        if (!active) {
          return;
        }

        setGeoData(null);
        setGeoError(err);
      } finally {
        if (active) {
          setGeoLoading(false);
        }
      }
    }

    cargarGeoJSON();

    return () => {
      active = false;
    };
  }, []);

  // ===========================================================================
  // ACTIVOS MUNICIPALES LOCALES - PASOS 38 Y 39
  // ===========================================================================

  useEffect(() => {
    let active = true;

    // El tablero funcional inicia en mapa estatal.
    // Los activos municipales sólo se cargan cuando el usuario solicita
    // explícitamente la vista Municipal.
    if (nivelMapa !== 'municipal') {
      return () => {
        active = false;
      };
    }

    // Evitar volver a descargar/parsear 6+ MB de geometría si ya se cargó.
    if (
      municipalCore &&
      municipiosGeo &&
      estadosMunicipalesGeo
    ) {
      setMunicipalLoading(false);

      return () => {
        active = false;
      };
    }

    async function cargarMapaMunicipalBase() {
      try {
        setMunicipalLoading(true);
        setMunicipalError(null);

        const [
          manifestData,
          coreData,
          municipiosData,
          estadosData,
        ] = await Promise.all([
          loadMunicipalManifest(),
          loadMunicipalCore(),
          loadMunicipalGeometry(),
          loadMunicipalStatesGeometry(),
        ]);

        if (!active) {
          return;
        }

        setMunicipalManifest(manifestData);
        setMunicipalCore(coreData);
        setMunicipiosGeo(municipiosData);
        setEstadosMunicipalesGeo(estadosData);
      } catch (err) {
        if (!active) {
          return;
        }

        setMunicipalManifest(null);
        setMunicipalCore(null);
        setMunicipiosGeo(null);
        setEstadosMunicipalesGeo(null);
        setMunicipalError(err);
      } finally {
        if (active) {
          setMunicipalLoading(false);
        }
      }
    }

    cargarMapaMunicipalBase();

    return () => {
      active = false;
    };
  }, [
    nivelMapa,
    municipalCore,
    municipiosGeo,
    estadosMunicipalesGeo,
  ]);

  // ===========================================================================
  // CATÁLOGOS BASE
  // ===========================================================================

  const fechas = useMemo(() => {
    if (!coreMap?.indexes?.dates) {
      return [];
    }

    return Array.isArray(
      coreMap.indexes.dates
    )
      ? coreMap.indexes.dates
      : Object.values(
          coreMap.indexes.dates
        );
  }, [coreMap]);

  const entidades = useMemo(() => {
    if (!coreMap?.indexes?.entities) {
      return [];
    }

    return Array.isArray(
      coreMap.indexes.entities
    )
      ? coreMap.indexes.entities
      : Object.values(
          coreMap.indexes.entities
        );
  }, [coreMap]);

  const combosCore = useMemo(() => {
    if (!coreMap?.indexes?.combos) {
      return [];
    }

    return Array.isArray(
      coreMap.indexes.combos
    )
      ? coreMap.indexes.combos
      : Object.values(
          coreMap.indexes.combos
        );
  }, [coreMap]);

  // ===========================================================================
  // FECHA INICIAL = ÚLTIMA FECHA DISPONIBLE
  // ===========================================================================

  useEffect(() => {
    if (
      fechas.length > 0 &&
      !fecha
    ) {
      setFecha(
        fechas[
          fechas.length - 1
        ]
      );
    }
  }, [fechas, fecha]);

  // ===========================================================================
  // EVENTOS
  // ===========================================================================

  const eventos = useMemo(() => {
    const valores = combosCore
      .filter(
        (x) =>
          x.nivel === 'evento'
      )
      .map((x) => x.evento)
      .filter(
        (x) =>
          x &&
          x !== 'TODOS'
      );

    return [
      'TODOS',
      ...Array.from(
        new Set(valores)
      ),
    ];
  }, [combosCore]);

  // ===========================================================================
  // TIPOS SEGÚN EVENTO
  // ===========================================================================

  const tipos = useMemo(() => {
    if (evento === 'TODOS') {
      return ['TODOS'];
    }

    const valores = combosCore
      .filter(
        (x) =>
          x.nivel === 'tipo' &&
          x.evento === evento
      )
      .map((x) => x.tipo)
      .filter(
        (x) =>
          x &&
          x !== 'TODOS'
      );

    return [
      'TODOS',
      ...Array.from(
        new Set(valores)
      ),
    ];
  }, [combosCore, evento]);

  // ===========================================================================
  // CARGAR MAPA DE CATEGORÍAS CUANDO SE SELECCIONA TIPO
  // ===========================================================================

  useEffect(() => {
    let active = true;

    async function cargar() {
      if (tipo === 'TODOS') {
        setCategoryMap(null);
        setCategoria('TODAS');
        setCategoryError(null);
        return;
      }

      try {
        setLoadingCategoryMap(true);
        setCategoryError(null);

        const data =
          await loadCategoryMap(
            tipo
          );

        if (!active) {
          return;
        }

        setCategoryMap(data);
        setCategoria('TODAS');
      } catch (err) {
        if (!active) {
          return;
        }

        setCategoryMap(null);
        setCategoryError(err);
      } finally {
        if (active) {
          setLoadingCategoryMap(
            false
          );
        }
      }
    }

    cargar();

    return () => {
      active = false;
    };
  }, [tipo]);

  // ===========================================================================
  // CATEGORÍAS MUNICIPALES DEL TIPO SELECCIONADO
  // ===========================================================================

  useEffect(() => {
    let active = true;

    async function cargarCategoriaMunicipal() {
      if (
        nivelMapa !== 'municipal' ||
        tipo === 'TODOS' ||
        !municipalCore
      ) {
        setMunicipalCategoryMap(null);
        setMunicipalCategoryError(null);
        return;
      }

      try {
        setMunicipalCategoryError(null);

        const data = await loadMunicipalCategoryMap(tipo);

        if (!active) {
          return;
        }

        setMunicipalCategoryMap(data);
      } catch (err) {
        if (!active) {
          return;
        }

        setMunicipalCategoryMap(null);
        setMunicipalCategoryError(err);
      }
    }

    cargarCategoriaMunicipal();

    return () => {
      active = false;
    };
  }, [
    tipo,
    nivelMapa,
    municipalCore,
  ]);

  // ===========================================================================
  // BULLETS DEL TIPO SELECCIONADO
  // ===========================================================================
  //
  // Se usa loadTypeBundle(), que ya existe en dashboardData.js.
  // Así este App.jsx NO necesita ningún cambio adicional en la capa de datos.

  useEffect(() => {
    let active = true;

    async function cargarBullets() {
      if (tipo === 'TODOS') {
        setBulletData(null);
        setProfileData(null);
        setBulletError(null);
        setLoadingBullets(false);
        return;
      }

      try {
        setLoadingBullets(true);
        setBulletError(null);
        setBulletData(null);
        setProfileData(null);

        const bundle =
          await loadTypeBundle(tipo);

        if (!active) {
          return;
        }

        setBulletData(
          bundle?.bullets ?? null
        );

        setProfileData(
          bundle?.profiles ?? null
        );
      } catch (err) {
        if (!active) {
          return;
        }

        setBulletData(null);
        setProfileData(null);
        setBulletError(err);
      } finally {
        if (active) {
          setLoadingBullets(false);
        }
      }
    }

    cargarBullets();

    return () => {
      active = false;
    };
  }, [tipo]);

  // ===========================================================================
  // CATEGORÍAS DEL TIPO
  // ===========================================================================

  const categorias = useMemo(() => {
    if (
      tipo === 'TODOS' ||
      !categoryMap
    ) {
      return ['TODAS'];
    }

    const combos = Array.isArray(
      categoryMap?.indexes?.combos
    )
      ? categoryMap.indexes.combos
      : Object.values(
          categoryMap?.indexes
            ?.combos ?? {}
        );

    const valores = combos
      .filter(
        (x) =>
          x.nivel ===
            'categoria' &&
          x.tipo === tipo
      )
      .map(
        (x) => x.categoria
      )
      .filter(
        (x) =>
          x &&
          x !== 'TODAS'
      );

    return [
      'TODAS',
      ...Array.from(
        new Set(valores)
      ),
    ];
  }, [categoryMap, tipo]);

  // ===========================================================================
  // DEFINIR QUÉ NIVEL Y QUÉ JSON CONSULTAR
  // ===========================================================================

  const consulta = useMemo(() => {
    if (
      categoria !== 'TODAS' &&
      tipo !== 'TODOS'
    ) {
      return {
        mapData: categoryMap,
        level: 'categoria',
      };
    }

    if (tipo !== 'TODOS') {
      return {
        mapData: coreMap,
        level: 'tipo',
      };
    }

    if (evento !== 'TODOS') {
      return {
        mapData: coreMap,
        level: 'evento',
      };
    }

    return {
      mapData: coreMap,
      level: 'total',
    };
  }, [
    coreMap,
    categoryMap,
    evento,
    tipo,
    categoria,
  ]);

  const consultaMunicipal = useMemo(() => {
    if (
      categoria !== 'TODAS' &&
      tipo !== 'TODOS'
    ) {
      return {
        mapData: municipalCategoryMap,
        level: 'categoria',
      };
    }

    if (tipo !== 'TODOS') {
      return {
        mapData: municipalCore,
        level: 'tipo',
      };
    }

    if (evento !== 'TODOS') {
      return {
        mapData: municipalCore,
        level: 'evento',
      };
    }

    return {
      mapData: municipalCore,
      level: 'total',
    };
  }, [
    municipalCore,
    municipalCategoryMap,
    evento,
    tipo,
    categoria,
  ]);

  // ===========================================================================
  // MÉTRICA SELECCIONADA
  // ===========================================================================

  const metricaTasa =
    medida === 'incidencia'
      ? 'incidencia'
      : 'mortalidad';

  const metricaConteo =
    medida === 'incidencia'
      ? 'casos'
      : 'defunciones';

  // ===========================================================================
  // VALORES DEL KPI
  // ===========================================================================

  const valorConteo =
    useMemo(() => {
      if (
        !consulta.mapData ||
        !fecha
      ) {
        return null;
      }

      return getMapValue({
        mapData:
          consulta.mapData,
        date: fecha,
        entity: entidad,
        event: evento,
        type: tipo,
        category: categoria,
        level: consulta.level,
        metric:
          metricaConteo,
        mode: 'acumulado',
      });
    }, [
      consulta,
      fecha,
      entidad,
      evento,
      tipo,
      categoria,
      metricaConteo,
    ]);

  const valorTasa =
    useMemo(() => {
      if (
        !consulta.mapData ||
        !fecha
      ) {
        return null;
      }

      return getMapValue({
        mapData:
          consulta.mapData,
        date: fecha,
        entity: entidad,
        event: evento,
        type: tipo,
        category: categoria,
        level: consulta.level,
        metric: metricaTasa,
        mode: 'acumulado',
      });
    }, [
      consulta,
      fecha,
      entidad,
      evento,
      tipo,
      categoria,
      metricaTasa,
    ]);

  // ===========================================================================
  // VALORES POR ENTIDAD PARA MAPA
  // ===========================================================================

  const valoresMapa =
    useMemo(() => {
      if (
        !consulta.mapData ||
        !fecha
      ) {
        return [];
      }

      return getMapEntityValues({
        mapData:
          consulta.mapData,
        date: fecha,
        event: evento,
        type: tipo,
        category: categoria,
        level: consulta.level,
        metric: metricaTasa,
        mode: 'acumulado',
        includeNational: false,
      });
    }, [
      consulta,
      fecha,
      evento,
      tipo,
      categoria,
      metricaTasa,
    ]);

  const conteosMapa =
    useMemo(() => {
      if (
        !consulta.mapData ||
        !fecha
      ) {
        return [];
      }

      return getMapEntityValues({
        mapData:
          consulta.mapData,
        date: fecha,
        event: evento,
        type: tipo,
        category: categoria,
        level: consulta.level,
        metric:
          metricaConteo,
        mode: 'acumulado',
        includeNational: false,
      });
    }, [
      consulta,
      fecha,
      evento,
      tipo,
      categoria,
      metricaConteo,
    ]);

  // ===========================================================================
  // VALORES MUNICIPALES
  // ===========================================================================

  const entidadCodigoMunicipal = useMemo(() => {
    if (
      entidad === 'NACIONAL' ||
      !Array.isArray(municipiosGeo?.features)
    ) {
      return null;
    }

    const match = municipiosGeo.features.find((feature) => {
      const nombreGeo = feature?.properties?.entidad;
      const entidadDashboard = resolveFeatureEntity(
        nombreGeo,
        entidades
      );

      return (
        entidadDashboard &&
        normalizeText(entidadDashboard) === normalizeText(entidad)
      );
    });

    if (!match) {
      return null;
    }

    return String(match?.properties?.cve_ent ?? '').padStart(2, '0');
  }, [entidad, entidades, municipiosGeo]);

  const valoresMunicipales = useMemo(() => {
    if (
      nivelMapa !== 'municipal' ||
      !consultaMunicipal.mapData ||
      !fecha
    ) {
      return [];
    }

    try {
      return getMunicipalValues({
        mapData: consultaMunicipal.mapData,
        date: fecha,
        event: evento,
        type: tipo,
        category: categoria,
        level: consultaMunicipal.level,
        mode: 'acumulado',
        entityCode: entidadCodigoMunicipal,
      });
    } catch (error) {
      console.error(
        'Error al interpretar mapa municipal:',
        error
      );

      return [];
    }
  }, [
    consultaMunicipal,
    fecha,
    evento,
    tipo,
    categoria,
    entidadCodigoMunicipal,
    nivelMapa,
  ]);

  const errorMunicipalActivo =
    municipalError ??
    (categoria !== 'TODAS' ? municipalCategoryError : null);

  // ===========================================================================
  // INDICADORES DESCRIPTIVOS
  // ===========================================================================

  const bullets = useMemo(() => {
    if (
      tipo === 'TODOS' ||
      !bulletData ||
      !fecha
    ) {
      return [];
    }

    try {
      const values =
        getBulletValues({
          bulletData,
          date: fecha,
          entity: entidad,
          category: categoria,
          mode: 'acumulado',
        });

      return Array.isArray(values)
        ? values
        : [];
    } catch (error) {
      console.error(
        'Error al interpretar bullets:',
        error
      );

      return [];
    }
  }, [
    bulletData,
    tipo,
    fecha,
    entidad,
    categoria,
  ]);

  const perfilEdadSexo = useMemo(() => {
    if (
      tipo === 'TODOS' ||
      !profileData ||
      !fecha
    ) {
      return [];
    }

    try {
      const series =
        getProfileSeries({
          profileData,
          profileId: 'edad_sexo',
          date: fecha,
          entity: entidad,
          category: categoria,
          mode: 'acumulado',
        });

      if (!Array.isArray(series)) {
        return [];
      }

      const grupos = new Map();

      series.forEach((item) => {
        const etiqueta = String(
          item?.etiqueta ?? ''
        ).trim();

        const id = String(
          item?.id ?? ''
        ).toLowerCase();

        let sexo = null;

        if (
          id.endsWith('_hombre') ||
          / HOMBRE$/i.test(etiqueta)
        ) {
          sexo = 'HOMBRE';
        } else if (
          id.endsWith('_mujer') ||
          / MUJER$/i.test(etiqueta)
        ) {
          sexo = 'MUJER';
        }

        if (!sexo) {
          return;
        }

        const grupo = etiqueta
          .replace(
            /\s+(HOMBRE|MUJER)$/i,
            ''
          )
          .trim();

        if (!grupo) {
          return;
        }

        if (!grupos.has(grupo)) {
          grupos.set(grupo, {
            grupo,
            hombres: 0,
            mujeres: 0,
          });
        }

        const fila =
          grupos.get(grupo);

        const value =
          Number(item?.value);

        const conteo =
          Number.isFinite(value)
            ? value
            : 0;

        if (sexo === 'HOMBRE') {
          fila.hombres = conteo;
        } else {
          fila.mujeres = conteo;
        }
      });

      return Array.from(
        grupos.values()
      );
    } catch (error) {
      console.error(
        'Error al interpretar perfil edad-sexo:',
        error
      );

      return [];
    }
  }, [
    profileData,
    tipo,
    fecha,
    entidad,
    categoria,
  ]);

  const maxEdadSexo = useMemo(() => {
    const valores =
      perfilEdadSexo.flatMap(
        (fila) => [
          Number(fila.hombres) || 0,
          Number(fila.mujeres) || 0,
        ]
      );

    return valores.length > 0
      ? Math.max(...valores, 1)
      : 1;
  }, [perfilEdadSexo]);

  const perfilAreaAnatomica = useMemo(() => {
    if (
      tipo === 'TODOS' ||
      !profileData ||
      !fecha
    ) {
      return [];
    }

    try {
      const series =
        getProfileSeries({
          profileData,
          profileId: 'area_anatomica',
          date: fecha,
          entity: entidad,
          category: categoria,
          mode: 'acumulado',
        });

      if (!Array.isArray(series)) {
        return [];
      }

      return series
        .map((item) => ({
          id:
            item?.id ??
            item?.etiqueta,
          etiqueta:
            String(
              item?.etiqueta ??
                item?.id ??
                ''
            ).trim(),
          value:
            Number(item?.value),
        }))
        .filter(
          (item) =>
            item.etiqueta &&
            Number.isFinite(
              item.value
            )
        );
    } catch (error) {
      console.error(
        'Error al interpretar perfil de área anatómica:',
        error
      );

      return [];
    }
  }, [
    profileData,
    tipo,
    fecha,
    entidad,
    categoria,
  ]);

  const perfilConsecuencia = useMemo(() => {
    if (
      tipo === 'TODOS' ||
      !profileData ||
      !fecha
    ) {
      return [];
    }

    try {
      const series =
        getProfileSeries({
          profileData,
          profileId: 'consecuencia',
          date: fecha,
          entity: entidad,
          category: categoria,
          mode: 'acumulado',
        });

      if (!Array.isArray(series)) {
        return [];
      }

      return series
        .map((item) => ({
          id:
            item?.id ??
            item?.etiqueta,
          etiqueta:
            String(
              item?.etiqueta ??
                item?.id ??
                ''
            ).trim(),
          value:
            Number(item?.value),
        }))
        .filter(
          (item) =>
            item.etiqueta &&
            Number.isFinite(
              item.value
            )
        );
    } catch (error) {
      console.error(
        'Error al interpretar perfil de consecuencia:',
        error
      );

      return [];
    }
  }, [
    profileData,
    tipo,
    fecha,
    entidad,
    categoria,
  ]);

  const distribucionesComplementarias = useMemo(() => {
    if (
      tipo === 'TODOS' ||
      !profileData ||
      !fecha
    ) {
      return [];
    }

    try {
      const series =
        getProfileSeries({
          profileData,
          profileId: 'distribuciones',
          date: fecha,
          entity: entidad,
          category: categoria,
          mode: 'acumulado',
        });

      if (!Array.isArray(series)) {
        return [];
      }

      const grupos = new Map();

      series.forEach((item) => {
        const distribucion = String(
          item?.distribucion ??
            'Distribución complementaria'
        ).trim();

        const etiqueta = String(
          item?.etiqueta ??
            item?.id ??
            ''
        ).trim();

        const value =
          Number(item?.value);

        if (
          !etiqueta ||
          !Number.isFinite(value)
        ) {
          return;
        }

        if (!grupos.has(distribucion)) {
          grupos.set(distribucion, []);
        }

        grupos.get(distribucion).push({
          id:
            item?.id ??
            `${distribucion}-${etiqueta}`,
          etiqueta,
          value,
        });
      });

      return Array.from(
        grupos.entries()
      ).map(
        ([titulo, items]) => ({
          titulo,
          items,
        })
      );
    } catch (error) {
      console.error(
        'Error al interpretar distribuciones complementarias:',
        error
      );

      return [];
    }
  }, [
    profileData,
    tipo,
    fecha,
    entidad,
    categoria,
  ]);

  // ===========================================================================
  // CAMBIOS DE FILTROS
  // ===========================================================================

  function cambiarEvento(value) {
    setEvento(value);
    setTipo('TODOS');
    setCategoria('TODAS');
    setCategoryMap(null);
    setMunicipalCategoryMap(null);
    setMunicipalCategoryError(null);
    setBulletData(null);
    setProfileData(null);
    setBulletError(null);
  }

  function cambiarTipo(value) {
    setTipo(value);
    setCategoria('TODAS');
  }

  // ===========================================================================
  // ESTADOS
  // ===========================================================================

  if (loadingInitial) {
    return (
      <div style={styles.estado}>
        <h1>
          Cargando tablero...
        </h1>
        <p>
          Preparando los datos
          validados.
        </p>
      </div>
    );
  }

  if (loadingError) {
    return (
      <div style={styles.estado}>
        <h1>
          Error al cargar los
          datos
        </h1>
        <pre>
          {
            loadingError.message
          }
        </pre>
      </div>
    );
  }

  // ===========================================================================
  // RENDER
  // ===========================================================================

  return (
    <div style={styles.page}>
      {/* ============================================================= */}
      {/* ENCABEZADO INSTITUCIONAL */}
      {/* ============================================================= */}

      <header style={styles.institutionalHeader}>
        <div style={styles.brandLeft}>
          <div style={styles.brandSymbol}>
            IMSS
          </div>

          <div>
            <div style={styles.brandName}>
              IMSS BIENESTAR
            </div>

            <div style={styles.brandSub}>
              SERVICIOS PÚBLICOS DE SALUD
            </div>
          </div>
        </div>

        <div style={styles.brandRight}>
          <div style={styles.coordinationBrand}>
            <div style={styles.coordinationIcon}>
              ◉
            </div>

            <div>
              <div style={styles.coordinationText}>
                COORDINACIÓN DE
              </div>

              <div style={styles.coordinationText}>
                EPIDEMIOLOGÍA
              </div>
            </div>
          </div>

          <div style={styles.verticalDivider} />

          <div style={styles.surveillanceBrand}>
            <div style={styles.surveillanceShield}>
              VE
            </div>

            <div style={styles.surveillanceText}>
              VIGILANCIA
              <br />
              EPIDEMIOLÓGICA
            </div>
          </div>
        </div>
      </header>

      <div style={styles.titleStrip}>
        <h1 style={styles.dashboardTitle}>
          Vigilancia epidemiológica de accidentes y lesiones
        </h1>

        <div style={styles.titleDate}>
          Datos acumulados al{' '}
          <strong>
            {fecha || '—'}
          </strong>
        </div>
      </div>

      <main style={styles.dashboardBody}>
        {/* ============================================================= */}
        {/* PRIMERA VISTA: FILTROS + MAPA + KPI */}
        {/* ============================================================= */}

        <section style={styles.heroGrid}>
          {/* ----------------------------------------------------------- */}
          {/* COLUMNA IZQUIERDA */}
          {/* ----------------------------------------------------------- */}

          <aside style={styles.filterCard}>
            <label style={styles.filterLabel}>
              Evento
            </label>

            <select
              value={evento}
              onChange={(e) =>
                cambiarEvento(
                  e.target.value
                )
              }
              style={styles.filterSelect}
            >
              {eventos.map((x) => (
                <option
                  key={x}
                  value={x}
                >
                  {x}
                </option>
              ))}
            </select>

            <label style={styles.filterLabel}>
              Tipo
            </label>

            <select
              value={tipo}
              disabled={
                evento === 'TODOS'
              }
              onChange={(e) =>
                cambiarTipo(
                  e.target.value
                )
              }
              style={styles.filterSelect}
            >
              {tipos.map((x) => (
                <option
                  key={x}
                  value={x}
                >
                  {x}
                </option>
              ))}
            </select>

            <label style={styles.filterLabel}>
              Categoría
            </label>

            <select
              value={categoria}
              disabled={
                tipo === 'TODOS' ||
                loadingCategoryMap
              }
              onChange={(e) =>
                setCategoria(
                  e.target.value
                )
              }
              style={styles.filterSelect}
            >
              {categorias.map(
                (x) => (
                  <option
                    key={x}
                    value={x}
                  >
                    {x}
                  </option>
                )
              )}
            </select>

            {loadingCategoryMap && (
              <div style={styles.statusNote}>
                Cargando categorías...
              </div>
            )}

            {categoryError && (
              <div style={styles.errorText}>
                {categoryError.message}
              </div>
            )}

            <label style={styles.filterLabel}>
              Entidad
            </label>

            <select
              value={entidad}
              onChange={(e) =>
                setEntidad(
                  e.target.value
                )
              }
              style={styles.filterSelect}
            >
              {entidades.map((x) => (
                <option
                  key={x}
                  value={x}
                >
                  {x}
                </option>
              ))}
            </select>

            <div style={styles.filterDivider} />

            <div style={styles.miniSectionTitle}>
              Indicadores descriptivos
            </div>

            {tipo === 'TODOS' ? (
              <div style={styles.sidebarEmpty}>
                Selecciona un tipo para consultar sus indicadores.
              </div>
            ) : loadingBullets ? (
              <div style={styles.sidebarEmpty}>
                Cargando indicadores...
              </div>
            ) : bulletError ? (
              <div style={styles.sidebarError}>
                {bulletError.message}
              </div>
            ) : bullets.length === 0 ? (
              <div style={styles.sidebarEmpty}>
                No hay indicadores para la selección actual.
              </div>
            ) : (
              <div style={styles.sidebarBulletGrid}>
                {bullets.map(
                  (item, index) => (
                    <div
                      key={
                        item.indicador_id ??
                        item.indicador ??
                        index
                      }
                      style={styles.sidebarBulletCard}
                    >
                      <div style={styles.sidebarBulletLabel}>
                        {item.indicador ??
                          'Indicador'}
                      </div>

                      <div style={styles.sidebarBulletValue}>
                        {formatBulletValue(
                          item.value
                        )}
                      </div>

                      <div style={styles.sidebarBulletCaption}>
                        de los registros seleccionados
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </aside>

          {/* ----------------------------------------------------------- */}
          {/* MAPA */}
          {/* ----------------------------------------------------------- */}

          <section style={styles.mapStage}>
            <div style={styles.mapModeBar}>
              <div style={styles.mapModeSelector}>
                <button
                  type="button"
                  onClick={() => setNivelMapa('estatal')}
                  style={
                    nivelMapa === 'estatal'
                      ? styles.mapModeOptionActive
                      : styles.mapModeOption
                  }
                >
                  Estatal
                </button>

                <button
                  type="button"
                  onClick={() => setNivelMapa('municipal')}
                  style={
                    nivelMapa === 'municipal'
                      ? styles.mapModeOptionActive
                      : styles.mapModeOption
                  }
                >
                  Municipal
                </button>
              </div>

              <div style={styles.mapModeNote}>
                {nivelMapa === 'municipal'
                  ? 'Municipal: conteo de casos'
                  : medida === 'incidencia'
                    ? 'Estatal: tasa de incidencia'
                    : 'Estatal: tasa de mortalidad'}
              </div>
            </div>

            {nivelMapa === 'municipal' ? (
              errorMunicipalActivo ? (
                <div>
                  <div style={styles.municipalFallbackNote}>
                    El mapa municipal no pudo cargarse. Se conserva abajo el
                    mapa estatal funcional como respaldo.
                    <br />
                    {errorMunicipalActivo.message}
                  </div>

                  <MexicoChoropleth
                    geoData={geoData}
                    geoLoading={geoLoading}
                    geoError={geoError}
                    entities={entidades}
                    rateValues={valoresMapa}
                    countValues={conteosMapa}
                    selectedEntity={entidad}
                    onSelectEntity={setEntidad}
                    measure={medida}
                    date={fecha}
                  />
                </div>
              ) : (
                <MunicipalChoropleth
                  municipiosGeo={municipiosGeo}
                  estadosGeo={estadosMunicipalesGeo}
                  values={valoresMunicipales}
                  entityCode={entidadCodigoMunicipal}
                  date={fecha}
                  loading={municipalLoading}
                  error={null}
                />
              )
            ) : (
              <MexicoChoropleth
                geoData={geoData}
                geoLoading={geoLoading}
                geoError={geoError}
                entities={entidades}
                rateValues={valoresMapa}
                countValues={conteosMapa}
                selectedEntity={entidad}
                onSelectEntity={setEntidad}
                measure={medida}
                date={fecha}
              />
            )}
          </section>

          {/* ----------------------------------------------------------- */}
          {/* COLUMNA DERECHA */}
          {/* ----------------------------------------------------------- */}

          <aside style={styles.metricRail}>
            <div style={styles.metricLabel}>
              Medida
            </div>

            <div style={styles.measureSelector}>
              <button
                type="button"
                onClick={() =>
                  setMedida(
                    'incidencia'
                  )
                }
                style={
                  medida === 'incidencia'
                    ? styles.measureOptionActive
                    : styles.measureOption
                }
              >
                Incidencia
              </button>

              <button
                type="button"
                onClick={() =>
                  setMedida(
                    'mortalidad'
                  )
                }
                style={
                  medida === 'mortalidad'
                    ? styles.measureOptionActive
                    : styles.measureOption
                }
              >
                Mortalidad
              </button>
            </div>

            <div style={styles.kpiCard}>
              <div style={styles.kpiLabel}>
                {medida === 'incidencia'
                  ? 'Casos'
                  : 'Defunciones'}
              </div>

              <div style={styles.kpiValue}>
                {valorConteo === null
                  ? '—'
                  : Number(
                      valorConteo
                    ).toLocaleString(
                      'es-MX'
                    )}
              </div>

              <div style={styles.kpiRate}>
                Tasa:{' '}
                {valorTasa === null
                  ? 'No disponible'
                  : Number(
                      valorTasa
                    ).toFixed(2)}
              </div>

              <div style={styles.kpiEntity}>
                {entidad}
              </div>
            </div>

            <div style={styles.metricLabel}>
              Fecha de corte
            </div>

            <div style={styles.dateCard}>
              <input
                type="date"
                value={fecha}
                min={
                  fechas.length > 0
                    ? fechas[0]
                    : undefined
                }
                max={
                  fechas.length > 0
                    ? fechas[
                        fechas.length -
                          1
                      ]
                    : undefined
                }
                onChange={(e) =>
                  setFecha(
                    e.target.value
                  )
                }
                onClick={(e) => {
                  if (
                    typeof e.currentTarget.showPicker ===
                    'function'
                  ) {
                    e.currentTarget.showPicker();
                  }
                }}
                style={styles.dateInput}
              />

              <div style={styles.dateRange}>
                Periodo disponible:
                <br />
                {fechas.length > 0
                  ? `${fechas[0]} a ${
                      fechas[
                        fechas.length -
                          1
                      ]
                    }`
                  : '—'}
              </div>
            </div>
          </aside>
        </section>

        {/* ============================================================= */}
        {/* PERFILES DESCRIPTIVOS */}
        {/* ============================================================= */}

        <section style={styles.profileSection}>
          <div style={styles.profileSectionHeader}>
            <div>
              <h2 style={styles.profileSectionTitle}>
                Perfil descriptivo
              </h2>

              <div style={styles.profileSectionSubtitle}>
                Información acumulada para la selección actual.
              </div>
            </div>

            <div style={styles.selectionPill}>
              {entidad} · {categoria}
            </div>
          </div>

          <div style={styles.profileGrid}>
            {/* --------------------------------------------------------- */}
            {/* EDAD Y SEXO */}
            {/* --------------------------------------------------------- */}

            <div style={styles.profilePanelWide}>
              <div style={styles.profilePanelHeader}>
                <div>
                  <h3 style={styles.profilePanelTitle}>
                    Perfil por edad y sexo
                  </h3>

                  <div style={styles.profilePanelNote}>
                    Casos acumulados.
                  </div>
                </div>

                {tipo !== 'TODOS' &&
                  !loadingBullets &&
                  perfilEdadSexo.length >
                    0 && (
                    <div style={styles.profileLegend}>
                      <span style={styles.profileLegendItem}>
                        <span
                          style={{
                            ...styles.profileLegendDot,
                            background:
                              '#667085',
                          }}
                        />
                        Hombres
                      </span>

                      <span style={styles.profileLegendItem}>
                        <span
                          style={{
                            ...styles.profileLegendDot,
                            background:
                              '#9b4a60',
                          }}
                        />
                        Mujeres
                      </span>
                    </div>
                  )}
              </div>

              {tipo === 'TODOS' ? (
                <div style={styles.profileEmpty}>
                  Selecciona un tipo para consultar el perfil por edad y sexo.
                </div>
              ) : loadingBullets ? (
                <div style={styles.profileEmpty}>
                  Cargando perfil...
                </div>
              ) : perfilEdadSexo.length === 0 ? (
                <div style={styles.profileEmpty}>
                  No hay información de edad y sexo para la selección actual.
                </div>
              ) : (
                <div style={styles.pyramidWrap}>
                  <div style={styles.pyramidHeader}>
                    <div style={styles.pyramidSideHeaderLeft}>
                      Hombres
                    </div>

                    <div style={styles.pyramidAgeHeader}>
                      Edad
                    </div>

                    <div style={styles.pyramidSideHeaderRight}>
                      Mujeres
                    </div>
                  </div>

                  {perfilEdadSexo.map(
                    (fila) => {
                      const anchoHombres =
                        `${Math.max(
                          0,
                          Math.min(
                            100,
                            (Number(
                              fila.hombres
                            ) /
                              maxEdadSexo) *
                              100
                          )
                        )}%`;

                      const anchoMujeres =
                        `${Math.max(
                          0,
                          Math.min(
                            100,
                            (Number(
                              fila.mujeres
                            ) /
                              maxEdadSexo) *
                              100
                          )
                        )}%`;

                      return (
                        <div
                          key={fila.grupo}
                          style={styles.pyramidRow}
                        >
                          <div style={styles.pyramidLeft}>
                            <span style={styles.pyramidValueLeft}>
                              {Number(
                                fila.hombres
                              ).toLocaleString(
                                'es-MX'
                              )}
                            </span>

                            <div style={styles.pyramidTrackLeft}>
                              <div
                                style={{
                                  ...styles.pyramidBarLeft,
                                  width:
                                    anchoHombres,
                                }}
                              />
                            </div>
                          </div>

                          <div style={styles.pyramidAge}>
                            {fila.grupo}
                          </div>

                          <div style={styles.pyramidRight}>
                            <div style={styles.pyramidTrackRight}>
                              <div
                                style={{
                                  ...styles.pyramidBarRight,
                                  width:
                                    anchoMujeres,
                                }}
                              />
                            </div>

                            <span style={styles.pyramidValueRight}>
                              {Number(
                                fila.mujeres
                              ).toLocaleString(
                                'es-MX'
                              )}
                            </span>
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              )}
            </div>

            {/* --------------------------------------------------------- */}
            {/* ÁREA ANATÓMICA */}
            {/* --------------------------------------------------------- */}

            <div style={styles.profilePanel}>
              <h3 style={styles.profilePanelTitle}>
                Área anatómica
              </h3>

              <div style={styles.profilePanelNote}>
                Distribución porcentual acumulada.
              </div>

              {tipo === 'TODOS' ? (
                <div style={styles.profileEmpty}>
                  Selecciona un tipo para consultar el perfil por área anatómica.
                </div>
              ) : loadingBullets ? (
                <div style={styles.profileEmpty}>
                  Cargando perfil...
                </div>
              ) : perfilAreaAnatomica.length === 0 ? (
                <div style={styles.profileEmpty}>
                  No hay información de área anatómica para la selección actual.
                </div>
              ) : (
                <div style={styles.areaList}>
                  {perfilAreaAnatomica.map(
                    (item) => {
                      const ancho =
                        `${Math.max(
                          0,
                          Math.min(
                            100,
                            item.value
                          )
                        )}%`;

                      return (
                        <div
                          key={item.id}
                          style={styles.areaRow}
                        >
                          <div style={styles.areaTop}>
                            <span style={styles.areaLabel}>
                              {item.etiqueta}
                            </span>

                            <strong style={styles.areaValue}>
                              {new Intl.NumberFormat(
                                'es-MX',
                                {
                                  minimumFractionDigits:
                                    0,
                                  maximumFractionDigits:
                                    1,
                                }
                              ).format(
                                item.value
                              )}
                              %
                            </strong>
                          </div>

                          <div style={styles.areaTrack}>
                            <div
                              style={{
                                ...styles.areaBar,
                                width: ancho,
                              }}
                            />
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              )}
            </div>

            {/* --------------------------------------------------------- */}
            {/* CONSECUENCIA */}
            {/* --------------------------------------------------------- */}

            <div style={styles.profilePanel}>
              <h3 style={styles.profilePanelTitle}>
                Consecuencia
              </h3>

              <div style={styles.profilePanelNote}>
                Distribución porcentual acumulada.
              </div>

              {tipo === 'TODOS' ? (
                <div style={styles.profileEmpty}>
                  Selecciona un tipo para consultar el perfil de consecuencia.
                </div>
              ) : loadingBullets ? (
                <div style={styles.profileEmpty}>
                  Cargando perfil...
                </div>
              ) : perfilConsecuencia.length === 0 ? (
                <div style={styles.profileEmpty}>
                  No hay información de consecuencia para la selección actual.
                </div>
              ) : (
                <div style={styles.consequenceGrid}>
                  {perfilConsecuencia.map(
                    (item) => (
                      <div
                        key={item.id}
                        style={styles.consequenceCard}
                      >
                        <div style={styles.consequenceValue}>
                          {new Intl.NumberFormat(
                            'es-MX',
                            {
                              minimumFractionDigits:
                                0,
                              maximumFractionDigits:
                                1,
                            }
                          ).format(
                            item.value
                          )}
                          %
                        </div>

                        <div style={styles.consequenceLabel}>
                          {item.etiqueta}
                        </div>

                        <div style={styles.consequenceTrack}>
                          <div
                            style={{
                              ...styles.consequenceBar,
                              width: `${Math.max(
                                0,
                                Math.min(
                                  100,
                                  item.value
                                )
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>

            {/* --------------------------------------------------------- */}
            {/* DISTRIBUCIONES COMPLEMENTARIAS */}
            {/* --------------------------------------------------------- */}

            <div style={styles.profilePanelWide}>
              <h3 style={styles.profilePanelTitle}>
                Distribuciones complementarias
              </h3>

              <div style={styles.profilePanelNote}>
                Perfiles adicionales acumulados.
              </div>

              {tipo === 'TODOS' ? (
                <div style={styles.profileEmpty}>
                  Selecciona un tipo para consultar sus distribuciones complementarias.
                </div>
              ) : loadingBullets ? (
                <div style={styles.profileEmpty}>
                  Cargando perfiles...
                </div>
              ) : distribucionesComplementarias.length === 0 ? (
                <div style={styles.profileEmpty}>
                  No hay distribuciones complementarias para la selección actual.
                </div>
              ) : (
                <div style={styles.distributionGrid}>
                  {distribucionesComplementarias.map(
                    (grupo) => (
                      <div
                        key={grupo.titulo}
                        style={styles.distributionBlock}
                      >
                        <h4 style={styles.distributionTitle}>
                          {grupo.titulo}
                        </h4>

                        <div style={styles.distributionList}>
                          {grupo.items.map(
                            (item) => (
                              <div
                                key={item.id}
                                style={styles.distributionRow}
                              >
                                <div style={styles.distributionTop}>
                                  <span style={styles.distributionLabel}>
                                    {item.etiqueta}
                                  </span>

                                  <strong style={styles.distributionValue}>
                                    {new Intl.NumberFormat(
                                      'es-MX',
                                      {
                                        minimumFractionDigits:
                                          0,
                                        maximumFractionDigits:
                                          1,
                                      }
                                    ).format(
                                      item.value
                                    )}
                                    %
                                  </strong>
                                </div>

                                <div style={styles.distributionTrack}>
                                  <div
                                    style={{
                                      ...styles.distributionBar,
                                      width: `${Math.max(
                                        0,
                                        Math.min(
                                          100,
                                          item.value
                                        )
                                      )}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer style={styles.sources}>
        <div style={styles.sourcesTitle}>
          Fuentes:
        </div>

        <div>
          Secretaría de Salud. Dirección General de Información en Salud (DGIS).
          Cubos dinámicos de Accidentes y Lesiones (información preliminar).
          Casos acumulados del 01 de enero al 30 de junio de 2026.
        </div>

        <div>
          Secretaría de Salud. Subsistema Epidemiológico y Estadístico de
          Defunciones (SEED).
        </div>
      </footer>
    </div>
  );
}

// =============================================================================
// ESTILOS - PROPUESTA VISUAL INSTITUCIONAL
// =============================================================================

const styles = {
  page: {
    minHeight: '100vh',
    background: '#f1f1f1',
    color: '#003c36',
    fontFamily:
      '"Noto Sans", Arial, Helvetica, sans-serif',
  },

  institutionalHeader: {
    minHeight: '96px',
    background: '#003b35',
    color: '#ffffff',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '28px',
    padding: '12px 54px',
    boxSizing: 'border-box',
  },

  brandLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '13px',
  },

  brandSymbol: {
    width: '44px',
    height: '44px',
    border: '2px solid #ffffff',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 800,
    letterSpacing: '0.03em',
  },

  brandName: {
    fontSize: '21px',
    lineHeight: 1,
    fontWeight: 800,
    letterSpacing: '0.01em',
    whiteSpace: 'nowrap',
  },

  brandSub: {
    marginTop: '7px',
    color: '#d1a04f',
    fontSize: '12px',
    fontWeight: 800,
    letterSpacing: '0.04em',
    whiteSpace: 'nowrap',
  },

  brandRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
  },

  coordinationBrand: {
    display: 'flex',
    alignItems: 'center',
    gap: '11px',
    color: '#d1a04f',
  },

  coordinationIcon: {
    width: '47px',
    height: '47px',
    border: '2px solid #d1a04f',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '25px',
    fontWeight: 700,
  },

  coordinationText: {
    fontFamily: 'Georgia, serif',
    fontSize: '18px',
    lineHeight: 1.05,
    fontWeight: 700,
    letterSpacing: '0.01em',
    textAlign: 'right',
    whiteSpace: 'nowrap',
  },

  verticalDivider: {
    width: '1px',
    alignSelf: 'stretch',
    minHeight: '62px',
    background: 'rgba(255,255,255,0.32)',
  },

  surveillanceBrand: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minWidth: '96px',
  },

  surveillanceShield: {
    width: '38px',
    height: '38px',
    border: '2px solid #ffffff',
    borderRadius: '18px 18px 11px 11px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    fontWeight: 800,
  },

  surveillanceText: {
    marginTop: '3px',
    fontSize: '9px',
    lineHeight: 1.05,
    fontWeight: 800,
    textAlign: 'center',
    letterSpacing: '0.02em',
  },

  titleStrip: {
    minHeight: '50px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '20px',
    padding: '7px 18px 5px',
    boxSizing: 'border-box',
  },

  dashboardTitle: {
    margin: 0,
    fontSize: '22px',
    lineHeight: 1.1,
    fontWeight: 800,
    color: '#003b35',
  },

  titleDate: {
    fontSize: '11px',
    color: '#667085',
    whiteSpace: 'nowrap',
  },

  dashboardBody: {
    padding: '10px 28px 20px',
    maxWidth: '1500px',
    margin: '0 auto',
    boxSizing: 'border-box',
  },

  heroGrid: {
    display: 'grid',
    gridTemplateColumns:
      'minmax(315px, 355px) minmax(520px, 1fr) 190px',
    gap: '16px',
    alignItems: 'start',
    minWidth: '1060px',
  },

  filterCard: {
    background: '#ffffff',
    border: '1px solid #d7d7d7',
    borderRadius: '15px',
    padding: '12px',
    boxSizing: 'border-box',
  },

  filterLabel: {
    display: 'block',
    margin: '0 7px 6px',
    fontSize: '13px',
    fontWeight: 800,
    color: '#808080',
  },

  filterSelect: {
    width: '100%',
    minHeight: '41px',
    padding: '7px 12px',
    marginBottom: '11px',
    border: '1px solid #8d8d8d',
    borderRadius: '7px',
    background: '#ffffff',
    color: '#003b35',
    fontSize: '15px',
    fontWeight: 700,
    boxSizing: 'border-box',
    outline: 'none',
  },

  filterDivider: {
    height: '1px',
    background: '#9d9d9d',
    margin: '5px 0 14px',
  },

  miniSectionTitle: {
    margin: '0 4px 10px',
    color: '#003b35',
    fontSize: '12px',
    fontWeight: 800,
  },

  statusNote: {
    margin: '-7px 4px 8px',
    fontSize: '10px',
    color: '#667085',
  },

  errorText: {
    margin: '-7px 4px 8px',
    fontSize: '10px',
    color: '#b42318',
  },

  sidebarBulletGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
  },

  sidebarBulletCard: {
    minHeight: '92px',
    border: '1px solid #8d8d8d',
    borderRadius: '15px',
    padding: '11px 13px',
    background: '#ffffff',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },

  sidebarBulletLabel: {
    fontSize: '11px',
    lineHeight: 1.2,
    fontWeight: 800,
    color: '#003b35',
  },

  sidebarBulletValue: {
    marginTop: '7px',
    fontSize: '23px',
    lineHeight: 1,
    fontWeight: 800,
    color: '#7b1e3a',
    fontVariantNumeric: 'tabular-nums',
  },

  sidebarBulletCaption: {
    marginTop: '3px',
    fontSize: '9px',
    lineHeight: 1.15,
    color: '#777777',
  },

  sidebarEmpty: {
    minHeight: '80px',
    border: '1px dashed #c7c7c7',
    borderRadius: '11px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '14px',
    boxSizing: 'border-box',
    color: '#777777',
    fontSize: '11px',
    lineHeight: 1.4,
  },

  sidebarError: {
    minHeight: '80px',
    border: '1px solid #fecdca',
    background: '#fffbfa',
    borderRadius: '11px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '14px',
    boxSizing: 'border-box',
    color: '#b42318',
    fontSize: '11px',
  },

  mapStage: {
    minHeight: '430px',
    background: '#ffffff',
    borderRadius: '5px',
    padding: '0',
    overflow: 'hidden',
  },

  mapModeBar: {
    minHeight: '36px',
    padding: '5px 8px',
    boxSizing: 'border-box',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '10px',
    borderBottom: '1px solid #eeeeee',
    background: '#ffffff',
  },

  mapModeSelector: {
    display: 'flex',
    gap: '5px',
  },

  mapModeOption: {
    minHeight: '26px',
    padding: '3px 10px',
    border: '1px solid #b7b7b7',
    borderRadius: '999px',
    background: '#ffffff',
    color: '#003b35',
    fontSize: '10px',
    fontWeight: 800,
    cursor: 'pointer',
  },

  mapModeOptionActive: {
    minHeight: '26px',
    padding: '3px 10px',
    border: '1px solid #003b35',
    borderRadius: '999px',
    background: '#003b35',
    color: '#ffffff',
    fontSize: '10px',
    fontWeight: 800,
    cursor: 'pointer',
  },

  mapModeNote: {
    fontSize: '9px',
    color: '#667085',
    textAlign: 'right',
  },

  municipalFallbackNote: {
    margin: '8px',
    padding: '8px 10px',
    border: '1px solid #fecdca',
    borderRadius: '7px',
    background: '#fffbfa',
    color: '#b42318',
    fontSize: '10px',
    lineHeight: 1.35,
  },

  municipalLegendItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
  },

  metricRail: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    paddingTop: '8px',
  },

  metricLabel: {
    margin: '0 5px',
    fontSize: '13px',
    fontWeight: 800,
    color: '#808080',
  },

  measureSelector: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },

  measureOption: {
    minHeight: '41px',
    border: '1px solid #8d8d8d',
    borderRadius: '7px',
    background: '#ffffff',
    color: '#003b35',
    fontSize: '14px',
    fontWeight: 800,
    cursor: 'pointer',
  },

  measureOptionActive: {
    minHeight: '41px',
    border: '1px solid #003b35',
    borderRadius: '7px',
    background: '#003b35',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 800,
    cursor: 'pointer',
  },

  kpiCard: {
    marginTop: '8px',
    background: '#ffffff',
    border: '1px solid #e1e1e1',
    borderRadius: '16px',
    padding: '14px 12px',
    textAlign: 'left',
    boxSizing: 'border-box',
  },

  kpiLabel: {
    fontSize: '11px',
    color: '#687386',
    fontWeight: 800,
  },

  kpiValue: {
    marginTop: '5px',
    fontSize: '25px',
    lineHeight: 1,
    fontWeight: 800,
    color: '#7b1e3a',
    fontVariantNumeric: 'tabular-nums',
  },

  kpiRate: {
    marginTop: '7px',
    fontSize: '11px',
    fontWeight: 800,
    color: '#003b35',
  },

  kpiEntity: {
    marginTop: '7px',
    fontSize: '9px',
    color: '#7d8590',
    textTransform: 'uppercase',
  },

  dateCard: {
    background: '#ffffff',
    padding: '0',
  },

  dateInput: {
    width: '100%',
    minHeight: '41px',
    padding: '7px 10px',
    border: '1px solid #8d8d8d',
    borderRadius: '7px',
    boxSizing: 'border-box',
    background: '#ffffff',
    color: '#003b35',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
    colorScheme: 'light',
  },

  dateRange: {
    marginTop: '7px',
    fontSize: '9px',
    lineHeight: 1.35,
    color: '#777777',
  },

  profileSection: {
    marginTop: '22px',
  },

  profileSectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: '18px',
    marginBottom: '10px',
    padding: '0 4px',
  },

  profileSectionTitle: {
    margin: 0,
    fontSize: '19px',
    fontWeight: 800,
    color: '#003b35',
  },

  profileSectionSubtitle: {
    marginTop: '2px',
    fontSize: '10px',
    color: '#777777',
  },

  selectionPill: {
    border: '1px solid #c6c6c6',
    borderRadius: '999px',
    background: '#ffffff',
    padding: '6px 10px',
    fontSize: '9px',
    color: '#667085',
    maxWidth: '340px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  profileGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '14px',
    alignItems: 'start',
  },

  profilePanel: {
    background: '#ffffff',
    border: '1px solid #d7d7d7',
    borderRadius: '14px',
    padding: '16px',
    boxSizing: 'border-box',
  },

  profilePanelWide: {
    gridColumn: '1 / -1',
    background: '#ffffff',
    border: '1px solid #d7d7d7',
    borderRadius: '14px',
    padding: '16px',
    boxSizing: 'border-box',
  },

  profilePanelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '14px',
    marginBottom: '12px',
  },

  profilePanelTitle: {
    margin: '0 0 5px',
    fontSize: '14px',
    fontWeight: 800,
    color: '#003b35',
  },

  profilePanelNote: {
    marginBottom: '12px',
    fontSize: '10px',
    color: '#667085',
  },

  profileEmpty: {
    minHeight: '110px',
    border: '1px dashed #d0d5dd',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '18px',
    color: '#667085',
    fontSize: '11px',
    lineHeight: 1.45,
    boxSizing: 'border-box',
  },

  profileLegend: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },

  profileLegendItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    fontSize: '10px',
    color: '#667085',
    whiteSpace: 'nowrap',
  },

  profileLegendDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    display: 'inline-block',
  },

  pyramidWrap: {
    width: '100%',
    maxWidth: '760px',
    margin: '0 auto',
  },

  pyramidHeader: {
    display: 'grid',
    gridTemplateColumns:
      'minmax(170px, 1fr) 58px minmax(170px, 1fr)',
    gap: '7px',
    alignItems: 'center',
    marginBottom: '6px',
    paddingBottom: '7px',
    borderBottom: '1px solid #eeeeee',
  },

  pyramidSideHeaderLeft: {
    textAlign: 'right',
    fontSize: '10px',
    fontWeight: 700,
    color: '#667085',
  },

  pyramidSideHeaderRight: {
    textAlign: 'left',
    fontSize: '10px',
    fontWeight: 700,
    color: '#667085',
  },

  pyramidAgeHeader: {
    textAlign: 'center',
    fontSize: '10px',
    fontWeight: 700,
    color: '#667085',
  },

  pyramidRow: {
    display: 'grid',
    gridTemplateColumns:
      'minmax(170px, 1fr) 58px minmax(170px, 1fr)',
    gap: '7px',
    alignItems: 'center',
    minHeight: '22px',
    marginBottom: '2px',
  },

  pyramidLeft: {
    display: 'grid',
    gridTemplateColumns:
      '52px minmax(90px, 1fr)',
    gap: '6px',
    alignItems: 'center',
  },

  pyramidRight: {
    display: 'grid',
    gridTemplateColumns:
      'minmax(90px, 1fr) 52px',
    gap: '6px',
    alignItems: 'center',
  },

  pyramidTrackLeft: {
    height: '14px',
    display: 'flex',
    justifyContent: 'flex-end',
    background: '#f0f1f3',
    borderRadius: '3px 0 0 3px',
    overflow: 'hidden',
  },

  pyramidTrackRight: {
    height: '14px',
    display: 'flex',
    justifyContent: 'flex-start',
    background: '#f0f1f3',
    borderRadius: '0 3px 3px 0',
    overflow: 'hidden',
  },

  pyramidBarLeft: {
    height: '100%',
    background: '#667085',
    borderRadius: '3px 0 0 3px',
  },

  pyramidBarRight: {
    height: '100%',
    background: '#9b4a60',
    borderRadius: '0 3px 3px 0',
  },

  pyramidAge: {
    textAlign: 'center',
    fontSize: '10px',
    fontWeight: 800,
    color: '#003b35',
    whiteSpace: 'nowrap',
  },

  pyramidValueLeft: {
    textAlign: 'right',
    fontSize: '9px',
    color: '#667085',
    fontVariantNumeric: 'tabular-nums',
  },

  pyramidValueRight: {
    textAlign: 'left',
    fontSize: '9px',
    color: '#667085',
    fontVariantNumeric: 'tabular-nums',
  },

  areaList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '11px',
  },

  areaRow: {
    width: '100%',
  },

  areaTop: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '14px',
    marginBottom: '5px',
  },

  areaLabel: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#003b35',
    lineHeight: 1.3,
  },

  areaValue: {
    fontSize: '10px',
    color: '#7b1e3a',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },

  areaTrack: {
    width: '100%',
    height: '10px',
    background: '#f0f1f3',
    borderRadius: '999px',
    overflow: 'hidden',
  },

  areaBar: {
    height: '100%',
    background: '#a54861',
    borderRadius: '999px',
    minWidth: '1px',
  },

  consequenceGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(155px, 1fr))',
    gap: '9px',
  },

  consequenceCard: {
    border: '1px solid #dedede',
    borderRadius: '10px',
    padding: '12px',
    background: '#ffffff',
    minHeight: '96px',
    boxSizing: 'border-box',
  },

  consequenceValue: {
    fontSize: '23px',
    fontWeight: 800,
    color: '#7b1e3a',
    lineHeight: 1,
    marginBottom: '7px',
    fontVariantNumeric: 'tabular-nums',
  },

  consequenceLabel: {
    fontSize: '10px',
    lineHeight: 1.25,
    fontWeight: 700,
    color: '#003b35',
    minHeight: '27px',
  },

  consequenceTrack: {
    width: '100%',
    height: '7px',
    marginTop: '10px',
    background: '#f0f1f3',
    borderRadius: '999px',
    overflow: 'hidden',
  },

  consequenceBar: {
    height: '100%',
    background: '#a54861',
    borderRadius: '999px',
    minWidth: '1px',
  },

  distributionGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '12px',
  },

  distributionBlock: {
    border: '1px solid #dedede',
    borderRadius: '11px',
    padding: '13px',
    background: '#ffffff',
  },

  distributionTitle: {
    margin: '0 0 12px',
    fontSize: '12px',
    color: '#003b35',
    fontWeight: 800,
    textAlign: 'center',
  },

  distributionList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },

  distributionRow: {
    width: '100%',
  },

  distributionTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: '12px',
    marginBottom: '5px',
  },

  distributionLabel: {
    fontSize: '10px',
    lineHeight: 1.3,
    color: '#003b35',
    fontWeight: 600,
  },

  distributionValue: {
    fontSize: '10px',
    color: '#7b1e3a',
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
  },

  distributionTrack: {
    width: '100%',
    height: '9px',
    background: '#f0f1f3',
    borderRadius: '999px',
    overflow: 'hidden',
  },

  distributionBar: {
    height: '100%',
    background: '#a54861',
    borderRadius: '999px',
    minWidth: '1px',
  },

  sources: {
    margin: '8px 28px 14px',
    paddingTop: '5px',
    borderTop: '1px solid #bdbdbd',
    fontSize: '8px',
    lineHeight: 1.35,
    color: '#222222',
    fontStyle: 'italic',
  },

  sourcesTitle: {
    fontWeight: 800,
  },

  // -------------------------------------------------------------------
  // MAPA
  // -------------------------------------------------------------------

  mapBlock: {
    width: '100%',
  },

  svgWrapper: {
    position: 'relative',
    width: '100%',
    minHeight: '400px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    background: '#ffffff',
  },

  mapSvg: {
    width: '100%',
    height: 'auto',
    display: 'block',
    maxHeight: '500px',
  },

  mapStatus: {
    minHeight: '400px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center',
    color: '#667085',
    fontSize: '12px',
  },

  mapStatusError: {
    minHeight: '400px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '8px',
    textAlign: 'center',
    color: '#b42318',
    padding: '20px',
  },

  tooltip: {
    position: 'absolute',
    zIndex: 10,
    minWidth: '170px',
    maxWidth: '230px',
    background: 'rgba(17, 24, 39, 0.96)',
    color: '#ffffff',
    padding: '9px 11px',
    borderRadius: '7px',
    pointerEvents: 'none',
    boxShadow:
      '0 8px 22px rgba(15, 23, 42, 0.18)',
    fontSize: '11px',
  },

  tooltipTitle: {
    fontWeight: 800,
    marginBottom: '6px',
  },

  tooltipRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '14px',
    marginTop: '4px',
  },

  mapFooter: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px 14px',
    padding: '9px 8px 4px',
    borderTop: '1px solid #eeeeee',
  },

  legend: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    flexWrap: 'wrap',
  },

  legendSwatch: {
    width: '18px',
    height: '9px',
    borderRadius: '2px',
    display: 'inline-block',
    border: '1px solid rgba(0,0,0,0.05)',
  },

  legendText: {
    fontSize: '9px',
    color: '#667085',
    margin: '0 3px',
  },

  note: {
    fontSize: '9px',
    color: '#667085',
    lineHeight: 1.35,
  },

  estado: {
    padding: '40px',
    fontFamily:
      '"Noto Sans", Arial, Helvetica, sans-serif',
  },
};

export default App;
