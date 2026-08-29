import { useEffect, useMemo, useState } from 'react';

import { useDashboardData } from './hooks/useDashboardData';

import {
  getBulletValues,
  getMapEntityValues,
  getMapValue,
  getProfileSeries,
  loadCategoryMap,
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

  // ===========================================================================
  // CAMBIOS DE FILTROS
  // ===========================================================================

  function cambiarEvento(value) {
    setEvento(value);
    setTipo('TODOS');
    setCategoria('TODAS');
    setCategoryMap(null);
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
      <header style={styles.header}>
        <div>
          <div
            style={
              styles.supraTitle
            }
          >
            Vigilancia
            epidemiológica
          </div>

          <h1 style={styles.title}>
            Accidentes y lesiones
          </h1>
        </div>

        <div
          style={
            styles.headerInfo
          }
        >
          Datos acumulados al{' '}
          <strong>
            {fecha || '—'}
          </strong>
        </div>
      </header>

      <main style={styles.main}>
        {/* ============================================================= */}
        {/* FILTROS */}
        {/* ============================================================= */}

        <aside style={styles.sidebar}>
          <h2
            style={
              styles.sectionTitle
            }
          >
            Filtros
          </h2>

          <label style={styles.label}>
            Evento
          </label>

          <select
            value={evento}
            onChange={(e) =>
              cambiarEvento(
                e.target.value
              )
            }
            style={styles.select}
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

          <label style={styles.label}>
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
            style={styles.select}
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

          <label style={styles.label}>
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
            style={styles.select}
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
            <div style={styles.note}>
              Cargando
              categorías...
            </div>
          )}

          {categoryError && (
            <div
              style={
                styles.errorText
              }
            >
              {
                categoryError.message
              }
            </div>
          )}

          <label style={styles.label}>
            Entidad
          </label>

          <select
            value={entidad}
            onChange={(e) =>
              setEntidad(
                e.target.value
              )
            }
            style={styles.select}
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
        </aside>

        {/* ============================================================= */}
        {/* CENTRO */}
        {/* ============================================================= */}

        <section style={styles.center}>
          <div style={styles.panel}>
            <div
              style={
                styles.panelHeader
              }
            >
              <div>
                <h2
                  style={
                    styles.sectionTitle
                  }
                >
                  Mapa de México
                </h2>

                <div
                  style={styles.note}
                >
                  Distribución de la
                  tasa acumulada por
                  entidad.
                </div>
              </div>

              <div
                style={styles.badge}
              >
                {medida ===
                'incidencia'
                  ? 'Incidencia'
                  : 'Mortalidad'}
              </div>
            </div>

            <MexicoChoropleth
              geoData={geoData}
              geoLoading={
                geoLoading
              }
              geoError={geoError}
              entities={entidades}
              rateValues={
                valoresMapa
              }
              countValues={
                conteosMapa
              }
              selectedEntity={
                entidad
              }
              onSelectEntity={
                setEntidad
              }
              measure={medida}
              date={fecha}
            />
          </div>

          <div style={styles.panel}>
            <div
              style={
                styles.bulletHeader
              }
            >
              <div>
                <h2
                  style={
                    styles.sectionTitle
                  }
                >
                  Indicadores descriptivos
                </h2>

                <div style={styles.note}>
                  Valores acumulados para
                  la selección actual.
                </div>
              </div>

              {tipo !== 'TODOS' &&
                !loadingBullets && (
                  <div
                    style={
                      styles.bulletCount
                    }
                  >
                    {bullets.length}{' '}
                    indicadores
                  </div>
                )}
            </div>

            {tipo === 'TODOS' ? (
              <div
                style={
                  styles.bulletEmpty
                }
              >
                Selecciona un tipo para
                consultar sus indicadores
                descriptivos.
              </div>
            ) : loadingBullets ? (
              <div
                style={
                  styles.bulletEmpty
                }
              >
                Cargando indicadores...
              </div>
            ) : bulletError ? (
              <div
                style={
                  styles.bulletError
                }
              >
                <strong>
                  No fue posible cargar
                  los indicadores.
                </strong>

                <div style={styles.note}>
                  {bulletError.message}
                </div>
              </div>
            ) : bullets.length === 0 ? (
              <div
                style={
                  styles.bulletEmpty
                }
              >
                No hay indicadores para
                la selección actual.
              </div>
            ) : (
              <div
                style={
                  styles.bulletGrid
                }
              >
                {bullets.map(
                  (item, index) => (
                    <div
                      key={
                        item.indicador_id ??
                        item.indicador ??
                        index
                      }
                      style={
                        styles.bulletCard
                      }
                    >
                      <div
                        style={
                          styles.bulletValue
                        }
                      >
                        {formatBulletValue(
                          item.value
                        )}
                      </div>

                      <div
                        style={
                          styles.bulletLabel
                        }
                      >
                        {item.indicador ??
                          'Indicador'}
                      </div>

                      <div
                        style={
                          styles.bulletContext
                        }
                      >
                        {entidad}
                        {' · '}
                        {categoria}
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          <div style={styles.panel}>
            <div
              style={
                styles.profileHeader
              }
            >
              <div>
                <h2
                  style={
                    styles.sectionTitle
                  }
                >
                  Perfil por edad y sexo
                </h2>

                <div style={styles.note}>
                  Casos acumulados para
                  la selección actual.
                </div>
              </div>

              {tipo !== 'TODOS' &&
                !loadingBullets &&
                perfilEdadSexo.length >
                  0 && (
                  <div
                    style={
                      styles.profileLegend
                    }
                  >
                    <span
                      style={
                        styles.profileLegendItem
                      }
                    >
                      <span
                        style={{
                          ...styles.profileLegendDot,
                          background:
                            '#667085',
                        }}
                      />
                      Hombres
                    </span>

                    <span
                      style={
                        styles.profileLegendItem
                      }
                    >
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
              <div
                style={
                  styles.profileEmpty
                }
              >
                Selecciona un tipo para
                consultar el perfil por
                edad y sexo.
              </div>
            ) : loadingBullets ? (
              <div
                style={
                  styles.profileEmpty
                }
              >
                Cargando perfil...
              </div>
            ) : perfilEdadSexo.length ===
              0 ? (
              <div
                style={
                  styles.profileEmpty
                }
              >
                No hay información de
                edad y sexo para la
                selección actual.
              </div>
            ) : (
              <div
                style={
                  styles.pyramidWrap
                }
              >
                <div
                  style={
                    styles.pyramidHeader
                  }
                >
                  <div
                    style={
                      styles.pyramidSideHeaderLeft
                    }
                  >
                    Hombres
                  </div>

                  <div
                    style={
                      styles.pyramidAgeHeader
                    }
                  >
                    Edad
                  </div>

                  <div
                    style={
                      styles.pyramidSideHeaderRight
                    }
                  >
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
                        key={
                          fila.grupo
                        }
                        style={
                          styles.pyramidRow
                        }
                      >
                        <div
                          style={
                            styles.pyramidLeft
                          }
                        >
                          <span
                            style={
                              styles.pyramidValueLeft
                            }
                          >
                            {Number(
                              fila.hombres
                            ).toLocaleString(
                              'es-MX'
                            )}
                          </span>

                          <div
                            style={
                              styles.pyramidTrackLeft
                            }
                          >
                            <div
                              style={{
                                ...styles.pyramidBarLeft,
                                width:
                                  anchoHombres,
                              }}
                            />
                          </div>
                        </div>

                        <div
                          style={
                            styles.pyramidAge
                          }
                        >
                          {fila.grupo}
                        </div>

                        <div
                          style={
                            styles.pyramidRight
                          }
                        >
                          <div
                            style={
                              styles.pyramidTrackRight
                            }
                          >
                            <div
                              style={{
                                ...styles.pyramidBarRight,
                                width:
                                  anchoMujeres,
                              }}
                            />
                          </div>

                          <span
                            style={
                              styles.pyramidValueRight
                            }
                          >
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

          <div style={styles.panel}>
            <div
              style={
                styles.profileHeader
              }
            >
              <div>
                <h2
                  style={
                    styles.sectionTitle
                  }
                >
                  Área anatómica
                </h2>

                <div style={styles.note}>
                  Distribución porcentual
                  acumulada para la
                  selección actual.
                </div>
              </div>
            </div>

            {tipo === 'TODOS' ? (
              <div
                style={
                  styles.profileEmpty
                }
              >
                Selecciona un tipo para
                consultar el perfil por
                área anatómica.
              </div>
            ) : loadingBullets ? (
              <div
                style={
                  styles.profileEmpty
                }
              >
                Cargando perfil...
              </div>
            ) : perfilAreaAnatomica.length ===
              0 ? (
              <div
                style={
                  styles.profileEmpty
                }
              >
                No hay información de
                área anatómica para la
                selección actual.
              </div>
            ) : (
              <div
                style={
                  styles.areaList
                }
              >
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
                        style={
                          styles.areaRow
                        }
                      >
                        <div
                          style={
                            styles.areaTop
                          }
                        >
                          <span
                            style={
                              styles.areaLabel
                            }
                          >
                            {item.etiqueta}
                          </span>

                          <strong
                            style={
                              styles.areaValue
                            }
                          >
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

                        <div
                          style={
                            styles.areaTrack
                          }
                        >
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
        </section>

        {/* ============================================================= */}
        {/* PANEL DERECHO */}
        {/* ============================================================= */}

        <aside
          style={
            styles.rightPanel
          }
        >
          <div style={styles.panel}>
            <h2
              style={
                styles.sectionTitle
              }
            >
              Medida
            </h2>

            <div
              style={
                styles.measureButtons
              }
            >
              <button
                type="button"
                onClick={() =>
                  setMedida(
                    'incidencia'
                  )
                }
                style={
                  medida ===
                  'incidencia'
                    ? styles.buttonActive
                    : styles.button
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
                  medida ===
                  'mortalidad'
                    ? styles.buttonActive
                    : styles.button
                }
              >
                Mortalidad
              </button>
            </div>
          </div>

          <div style={styles.kpi}>
            <div
              style={
                styles.kpiLabel
              }
            >
              {medida ===
              'incidencia'
                ? 'Casos'
                : 'Defunciones'}
            </div>

            <div
              style={
                styles.kpiValue
              }
            >
              {valorConteo === null
                ? '—'
                : Number(
                    valorConteo
                  ).toLocaleString(
                    'es-MX'
                  )}
            </div>

            <div
              style={
                styles.kpiRate
              }
            >
              Tasa:{' '}
              {valorTasa === null
                ? 'No disponible'
                : Number(
                    valorTasa
                  ).toFixed(2)}
            </div>

            <div
              style={
                styles.kpiEntity
              }
            >
              {entidad}
            </div>
          </div>

          <div style={styles.panel}>
            <h2
              style={
                styles.sectionTitle
              }
            >
              Fecha
            </h2>

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
              style={
                styles.dateInput
              }
            />

            <div
              style={styles.note}
            >
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

          <div style={styles.panel}>
            <h2
              style={
                styles.sectionTitle
              }
            >
              Selección actual
            </h2>

            <div
              style={
                styles.selectionRow
              }
            >
              <strong>
                Evento:
              </strong>
              <span>{evento}</span>
            </div>

            <div
              style={
                styles.selectionRow
              }
            >
              <strong>
                Tipo:
              </strong>
              <span>{tipo}</span>
            </div>

            <div
              style={
                styles.selectionRow
              }
            >
              <strong>
                Categoría:
              </strong>
              <span>
                {categoria}
              </span>
            </div>

            <div
              style={
                styles.selectionRow
              }
            >
              <strong>
                Entidad:
              </strong>
              <span>{entidad}</span>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

// =============================================================================
// ESTILOS
// =============================================================================

const styles = {
  page: {
    minHeight: '100vh',
    background: '#f4f6f8',
    color: '#1f2937',
    fontFamily:
      'Arial, Helvetica, sans-serif',
  },

  header: {
    background: '#ffffff',
    borderBottom:
      '1px solid #d8dee6',
    padding: '18px 28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent:
      'space-between',
    gap: '20px',
  },

  supraTitle: {
    fontSize: '13px',
    textTransform:
      'uppercase',
    letterSpacing: '0.08em',
    color: '#667085',
    marginBottom: '4px',
  },

  title: {
    margin: 0,
    fontSize: '28px',
    fontWeight: 700,
  },

  headerInfo: {
    fontSize: '14px',
    color: '#475467',
  },

  main: {
    display: 'grid',
    gridTemplateColumns:
      '250px minmax(0, 1fr) 280px',
    gap: '18px',
    padding: '18px',
    maxWidth: '1600px',
    margin: '0 auto',
    boxSizing: 'border-box',
  },

  sidebar: {
    background: '#ffffff',
    border:
      '1px solid #d8dee6',
    borderRadius: '10px',
    padding: '18px',
    alignSelf: 'start',
  },

  rightPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  },

  center: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
    minWidth: 0,
  },

  panel: {
    background: '#ffffff',
    border:
      '1px solid #d8dee6',
    borderRadius: '10px',
    padding: '18px',
  },

  panelHeader: {
    display: 'flex',
    justifyContent:
      'space-between',
    alignItems: 'flex-start',
    gap: '15px',
  },

  sectionTitle: {
    fontSize: '17px',
    margin: '0 0 14px 0',
  },

  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: 700,
    marginTop: '16px',
    marginBottom: '6px',
  },

  select: {
    width: '100%',
    minHeight: '40px',
    padding: '8px 10px',
    border:
      '1px solid #cbd5e1',
    borderRadius: '7px',
    background: '#ffffff',
    color: '#1f2937',
    boxSizing: 'border-box',
  },

  note: {
    fontSize: '12px',
    color: '#667085',
    lineHeight: 1.45,
  },

  errorText: {
    marginTop: '8px',
    fontSize: '12px',
    color: '#b42318',
  },

  badge: {
    fontSize: '12px',
    fontWeight: 700,
    border:
      '1px solid #cbd5e1',
    borderRadius: '999px',
    padding: '6px 10px',
    whiteSpace: 'nowrap',
  },

  mapBlock: {
    marginTop: '10px',
  },

  svgWrapper: {
    position: 'relative',
    width: '100%',
    minHeight: '390px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    background:
      'linear-gradient(180deg, #ffffff 0%, #fbfcfd 100%)',
    borderRadius: '9px',
  },

  mapSvg: {
    width: '100%',
    height: 'auto',
    display: 'block',
    maxHeight: '500px',
  },

  mapStatus: {
    minHeight: '390px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center',
    color: '#667085',
    fontSize: '13px',
  },

  mapStatusError: {
    minHeight: '390px',
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
    minWidth: '180px',
    maxWidth: '240px',
    background:
      'rgba(17, 24, 39, 0.96)',
    color: '#ffffff',
    padding: '10px 12px',
    borderRadius: '8px',
    pointerEvents: 'none',
    boxShadow:
      '0 8px 22px rgba(15, 23, 42, 0.18)',
    fontSize: '12px',
  },

  tooltipTitle: {
    fontWeight: 700,
    marginBottom: '7px',
  },

  tooltipRow: {
    display: 'flex',
    justifyContent:
      'space-between',
    gap: '15px',
    marginTop: '4px',
  },

  mapFooter: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent:
      'space-between',
    alignItems: 'center',
    gap: '10px 18px',
    paddingTop: '10px',
    borderTop:
      '1px solid #eef2f6',
  },

  legend: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexWrap: 'wrap',
  },

  legendSwatch: {
    width: '19px',
    height: '10px',
    borderRadius: '2px',
    display: 'inline-block',
    border:
      '1px solid rgba(0, 0, 0, 0.05)',
  },

  legendText: {
    fontSize: '11px',
    color: '#667085',
    margin: '0 3px',
  },

  measureButtons: {
    display: 'grid',
    gridTemplateColumns:
      '1fr 1fr',
    gap: '8px',
  },

  button: {
    minHeight: '38px',
    border:
      '1px solid #cbd5e1',
    background: '#ffffff',
    borderRadius: '7px',
    cursor: 'pointer',
  },

  buttonActive: {
    minHeight: '38px',
    border:
      '1px solid #344054',
    background: '#344054',
    color: '#ffffff',
    borderRadius: '7px',
    cursor: 'pointer',
  },

  kpi: {
    background: '#ffffff',
    border:
      '1px solid #d8dee6',
    borderRadius: '10px',
    padding: '20px',
    textAlign: 'center',
  },

  kpiLabel: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#667085',
    textTransform:
      'uppercase',
    letterSpacing: '0.05em',
  },

  kpiValue: {
    fontSize: '38px',
    fontWeight: 700,
    margin: '8px 0 5px',
  },

  kpiRate: {
    fontSize: '15px',
    fontWeight: 700,
  },

  kpiEntity: {
    fontSize: '12px',
    color: '#667085',
    marginTop: '8px',
  },

  dateInput: {
    width: '100%',
    minHeight: '40px',
    padding: '8px 10px',
    border:
      '1px solid #cbd5e1',
    borderRadius: '7px',
    boxSizing: 'border-box',
    marginBottom: '10px',
  },

  selectionRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    fontSize: '12px',
    padding: '8px 0',
    borderBottom:
      '1px solid #eef2f6',
  },

  bulletHeader: {
    display: 'flex',
    justifyContent:
      'space-between',
    alignItems: 'flex-start',
    gap: '15px',
    marginBottom: '16px',
  },

  bulletCount: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#667085',
    border:
      '1px solid #d8dee6',
    borderRadius: '999px',
    padding: '5px 9px',
    whiteSpace: 'nowrap',
  },

  bulletGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(190px, 1fr))',
    gap: '12px',
  },

  bulletCard: {
    minHeight: '116px',
    border:
      '1px solid #e1e7ef',
    borderRadius: '10px',
    padding: '16px',
    background: '#fbfcfd',
    display: 'flex',
    flexDirection: 'column',
    justifyContent:
      'center',
    boxSizing: 'border-box',
  },

  bulletValue: {
    fontSize: '30px',
    lineHeight: 1,
    fontWeight: 700,
    color: '#6f263d',
    marginBottom: '10px',
    fontVariantNumeric:
      'tabular-nums',
  },

  bulletLabel: {
    fontSize: '13px',
    lineHeight: 1.35,
    fontWeight: 700,
    color: '#344054',
  },

  bulletContext: {
    marginTop: '9px',
    paddingTop: '8px',
    borderTop:
      '1px solid #eef2f6',
    fontSize: '10px',
    lineHeight: 1.3,
    color: '#98a2b3',
  },

  bulletEmpty: {
    minHeight: '145px',
    border:
      '1px dashed #cbd5e1',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '24px',
    color: '#667085',
    fontSize: '13px',
    lineHeight: 1.5,
    boxSizing: 'border-box',
  },

  bulletError: {
    minHeight: '145px',
    border:
      '1px solid #fecdca',
    background: '#fffbfa',
    borderRadius: '10px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    textAlign: 'center',
    padding: '24px',
    color: '#b42318',
    fontSize: '13px',
    boxSizing: 'border-box',
  },

  profileHeader: {
    display: 'flex',
    justifyContent:
      'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    marginBottom: '16px',
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
    fontSize: '11px',
    color: '#667085',
    whiteSpace: 'nowrap',
  },

  profileLegendDot: {
    width: '9px',
    height: '9px',
    borderRadius: '50%',
    display: 'inline-block',
  },

  profileEmpty: {
    minHeight: '145px',
    border:
      '1px dashed #cbd5e1',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '24px',
    color: '#667085',
    fontSize: '13px',
    lineHeight: 1.5,
    boxSizing: 'border-box',
  },

  pyramidWrap: {
    width: '100%',
    overflowX: 'auto',
  },

  pyramidHeader: {
    display: 'grid',
    gridTemplateColumns:
      'minmax(170px, 1fr) 64px minmax(170px, 1fr)',
    gap: '8px',
    alignItems: 'center',
    marginBottom: '8px',
    paddingBottom: '8px',
    borderBottom:
      '1px solid #eef2f6',
  },

  pyramidSideHeaderLeft: {
    textAlign: 'right',
    fontSize: '11px',
    fontWeight: 700,
    color: '#667085',
  },

  pyramidSideHeaderRight: {
    textAlign: 'left',
    fontSize: '11px',
    fontWeight: 700,
    color: '#667085',
  },

  pyramidAgeHeader: {
    textAlign: 'center',
    fontSize: '11px',
    fontWeight: 700,
    color: '#667085',
  },

  pyramidRow: {
    display: 'grid',
    gridTemplateColumns:
      'minmax(170px, 1fr) 64px minmax(170px, 1fr)',
    gap: '8px',
    alignItems: 'center',
    minHeight: '24px',
    marginBottom: '3px',
  },

  pyramidLeft: {
    display: 'grid',
    gridTemplateColumns:
      '54px minmax(100px, 1fr)',
    gap: '7px',
    alignItems: 'center',
  },

  pyramidRight: {
    display: 'grid',
    gridTemplateColumns:
      'minmax(100px, 1fr) 54px',
    gap: '7px',
    alignItems: 'center',
  },

  pyramidTrackLeft: {
    height: '16px',
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'stretch',
    background: '#f2f4f7',
    borderRadius: '3px 0 0 3px',
    overflow: 'hidden',
  },

  pyramidTrackRight: {
    height: '16px',
    display: 'flex',
    justifyContent: 'flex-start',
    alignItems: 'stretch',
    background: '#f2f4f7',
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
    fontSize: '11px',
    fontWeight: 700,
    color: '#344054',
    whiteSpace: 'nowrap',
  },

  pyramidValueLeft: {
    textAlign: 'right',
    fontSize: '10px',
    color: '#667085',
    fontVariantNumeric:
      'tabular-nums',
  },

  pyramidValueRight: {
    textAlign: 'left',
    fontSize: '10px',
    color: '#667085',
    fontVariantNumeric:
      'tabular-nums',
  },

  areaList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },

  areaRow: {
    width: '100%',
  },

  areaTop: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent:
      'space-between',
    gap: '16px',
    marginBottom: '6px',
  },

  areaLabel: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#344054',
    lineHeight: 1.35,
  },

  areaValue: {
    fontSize: '12px',
    color: '#6f263d',
    fontVariantNumeric:
      'tabular-nums',
    whiteSpace: 'nowrap',
  },

  areaTrack: {
    width: '100%',
    height: '12px',
    background: '#f2f4f7',
    borderRadius: '999px',
    overflow: 'hidden',
  },

  areaBar: {
    height: '100%',
    background: '#9b4a60',
    borderRadius: '999px',
    minWidth: '1px',
  },

  tableWrapper: {
    overflowX: 'auto',
  },

  table: {
    width: '100%',
    borderCollapse:
      'collapse',
    fontSize: '13px',
  },

  th: {
    textAlign: 'left',
    borderBottom:
      '1px solid #d8dee6',
    padding: '9px',
  },

  thRight: {
    textAlign: 'right',
    borderBottom:
      '1px solid #d8dee6',
    padding: '9px',
  },

  td: {
    padding: '8px 9px',
    borderBottom:
      '1px solid #eef2f6',
  },

  tdRight: {
    padding: '8px 9px',
    borderBottom:
      '1px solid #eef2f6',
    textAlign: 'right',
    fontVariantNumeric:
      'tabular-nums',
  },

  estado: {
    padding: '40px',
    fontFamily:
      'Arial, Helvetica, sans-serif',
  },
};

export default App;
