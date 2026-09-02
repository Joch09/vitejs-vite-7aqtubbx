import { useEffect, useMemo, useState } from 'react';

// V9.14: ajustes editoriales finales solicitados en indicadores, mapa y perfil.

import logoImssBienestar from './assets/logos/logo_imss_bienestar.png';
import logoCoordinacion from './assets/logos/logo_coordinacion_epidemiologia.png';
import logoVigilancia from './assets/logos/logo_vigilancia_epidemiologica.png';

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
  loadMunicipalDeathsCategoryMap,
  loadMunicipalDeathsCore,
  loadMunicipalGeometry,
  loadMunicipalManifest,
  loadMunicipalStatesGeometry,
  loadTypeBundle,
} from './data/dashboardData';

// =============================================================================
// PERIODOS TEMPORALES - PRODUCCIÓN V9
// =============================================================================
//
// Los cuatro modos consultan directamente los productos regenerados por
// FechaOcurrencia. Día, mes y semana son excluyentes; trimestre es acumulado.
//
// Calendario epidemiológico oficial DGE 2026:
// - SE 53: 28-dic-2025 a 03-ene-2026.
// - SE 1 inicia el 04-ene-2026.
// - Las semanas epidemiológicas corren de domingo a sábado.
//
// Distribuciones complementarias conservadas en código, ocultas en UI.
// Cambiar a true si se requiere reactivarlas posteriormente.
const MOSTRAR_DISTRIBUCIONES_COMPLEMENTARIAS = false;

const TEMPORAL_QUARTERS_2026 = [
  {
    value: 'T1',
    label: '1.er trimestre',
    detail: 'Acumulado: 01 ene – 31 mar',
  },
  {
    value: 'T2',
    label: '2.º trimestre',
    detail: 'Acumulado: 01 ene – 30 jun',
  },
];

const TEMPORAL_MONTHS_2026 = [
  { value: '2026-01', label: 'Enero 2026' },
  { value: '2026-02', label: 'Febrero 2026' },
  { value: '2026-03', label: 'Marzo 2026' },
  { value: '2026-04', label: 'Abril 2026' },
  { value: '2026-05', label: 'Mayo 2026' },
  { value: '2026-06', label: 'Junio 2026' },
];

const TEMPORAL_WEEKS_2026 = [
  {
    value: '53',
    label: 'SE 53',
    detail: '28 dic 2025 – 03 ene 2026',
  },
  {
    value: '1',
    label: 'SE 1',
    detail: '04 – 10 ene',
  },
  {
    value: '2',
    label: 'SE 2',
    detail: '11 – 17 ene',
  },
  {
    value: '3',
    label: 'SE 3',
    detail: '18 – 24 ene',
  },
  {
    value: '4',
    label: 'SE 4',
    detail: '25 – 31 ene',
  },
  {
    value: '5',
    label: 'SE 5',
    detail: '01 – 07 feb',
  },
  {
    value: '6',
    label: 'SE 6',
    detail: '08 – 14 feb',
  },
  {
    value: '7',
    label: 'SE 7',
    detail: '15 – 21 feb',
  },
  {
    value: '8',
    label: 'SE 8',
    detail: '22 – 28 feb',
  },
  {
    value: '9',
    label: 'SE 9',
    detail: '01 – 07 mar',
  },
  {
    value: '10',
    label: 'SE 10',
    detail: '08 – 14 mar',
  },
  {
    value: '11',
    label: 'SE 11',
    detail: '15 – 21 mar',
  },
  {
    value: '12',
    label: 'SE 12',
    detail: '22 – 28 mar',
  },
  {
    value: '13',
    label: 'SE 13',
    detail: '29 mar – 04 abr',
  },
  {
    value: '14',
    label: 'SE 14',
    detail: '05 – 11 abr',
  },
  {
    value: '15',
    label: 'SE 15',
    detail: '12 – 18 abr',
  },
  {
    value: '16',
    label: 'SE 16',
    detail: '19 – 25 abr',
  },
  {
    value: '17',
    label: 'SE 17',
    detail: '26 abr – 02 may',
  },
  {
    value: '18',
    label: 'SE 18',
    detail: '03 – 09 may',
  },
  {
    value: '19',
    label: 'SE 19',
    detail: '10 – 16 may',
  },
  {
    value: '20',
    label: 'SE 20',
    detail: '17 – 23 may',
  },
  {
    value: '21',
    label: 'SE 21',
    detail: '24 – 30 may',
  },
  {
    value: '22',
    label: 'SE 22',
    detail: '31 may – 06 jun',
  },
  {
    value: '23',
    label: 'SE 23',
    detail: '07 – 13 jun',
  },
  {
    value: '24',
    label: 'SE 24',
    detail: '14 – 20 jun',
  },
  {
    value: '25',
    label: 'SE 25',
    detail: '21 – 27 jun',
  },
  {
    value: '26',
    label: 'SE 26',
    detail: '28 jun – 04 jul',
  },
];

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

const MAP_COLORS_INCIDENCIA = [
  '#f7f1e8',
  '#eadcc5',
  '#dcc49d',
  '#cca971',
  '#bc955b',
  '#8f6c3e',
];

const MAP_COLORS_MORTALIDAD = [
  '#f4e9ec',
  '#e6c8d0',
  '#cf9fac',
  '#b36d80',
  '#91465c',
  '#6f263d',
];

const NO_DATA_COLOR = '#e5e7eb';

function getMapColors(measure) {
  return measure === 'incidencia'
    ? MAP_COLORS_INCIDENCIA
    : MAP_COLORS_MORTALIDAD;
}

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

function createProjection(
  features,
  padding = MAP_PADDING,
  entityCode = null
) {
  const allPoints = [];

  features.forEach((feature) => {
    collectCoordinates(
      feature?.geometry?.coordinates,
      allPoints
    );
  });

  if (allPoints.length === 0) {
    return null;
  }

  // Colima (06) incluye geometrías insulares muy alejadas del territorio
  // continental. Esas coordenadas deforman el autozoom municipal y hacen que
  // el estado se vea diminuto. Para el ENCUADRE únicamente, usamos los puntos
  // del territorio continental. Las geometrías y los datos permanecen intactos.
  const points =
    entityCode === '06'
      ? allPoints.filter(([lon]) => lon > -106)
      : allPoints;

  const projectionPoints =
    points.length > 0
      ? points
      : allPoints;

  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  projectionPoints.forEach(([lon, lat]) => {
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
    MAP_WIDTH - padding * 2;
  const usableHeight =
    MAP_HEIGHT - padding * 2;

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
  maxValue,
  colorCount
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
    !Number.isFinite(maxValue)
  ) {
    return null;
  }

  if (maxValue <= minValue) {
    return Number(value) <= 0
      ? 0
      : colorCount - 1;
  }

  const ratio =
    (Number(value) - minValue) /
    (maxValue - minValue);

  const index = Math.floor(
    Math.max(
      0,
      Math.min(0.999999, ratio)
    ) * colorCount
  );

  return Math.max(
    0,
    Math.min(
      colorCount - 1,
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

function getBulletId(item) {
  return (
    item?.id ??
    item?.indicador_id ??
    ''
  );
}

function getBulletDisplayLabel(item, tipo) {
  const id = getBulletId(item);
  const indicador = item?.indicador ?? '';

  if (
    id === 'principal_sitio_ocurrencia' ||
    indicador === 'Principal sitio de ocurrencia'
  ) {
    return 'Principal sitio de ocurrencia:';
  }

  if (
    id === 'principal_mecanismo_lesion_accidental' ||
    indicador === 'Principal mecanismo de la lesión accidental'
  ) {
    return 'Principal mecanismo de lesión accidental:';
  }

  if (
    id === 'embarazo_o_puerperio' ||
    indicador === 'Embarazo o puerperio'
  ) {
    return 'Personas que se encontraban embarazadas o en puerperio:';
  }

  if (
    id === 'sospecha_alcohol_agresor' ||
    indicador === 'Sospecha de consumo de alcohol del agresor'
  ) {
    return 'Casos en los que el agresor estaba bajo los efectos del alcohol';
  }

  if (
    id === 'sospecha_consumo_sustancias_drogas'
  ) {
    return 'Consumo de otras drogas';
  }

  if (
    id === 'sospecha_consumo_alcohol' &&
    tipo === 'Lesiones autoinfligidas'
  ) {
    return 'Consumo de alcohol';
  }

  if (
    indicador === 'Discapacidad preexistente'
  ) {
    return 'Personas con discapacidad preexistente:';
  }

  return indicador || 'Indicador';
}

function isEquipmentSentence(item) {
  return getBulletId(item) === 'no_uso_equipo_seguridad';
}

function isAccidentAlcoholSentence(item, tipo) {
  const accidentTypes = new Set([
    'Accidentes de transporte',
    'Caídas',
    'Fuerzas mecánicas y objetos',
    'Exposición a sustancias y energías',
  ]);

  return (
    getBulletId(item) === 'sospecha_consumo_alcohol' &&
    accidentTypes.has(tipo)
  );
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
  temporalMode = 'acumulado',
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

  const mapColors = useMemo(
    () => getMapColors(measure),
    [measure]
  );

  const validRates = useMemo(() => {
    return rateValues
      .filter(
        (item) =>
          item?.value !== null &&
          item?.value !== undefined
      )
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
      <div style={styles.mapHeader}>
        <div>
          <div style={styles.mapTitle}>{mapTitle}</div>
          <div style={styles.mapSubtitle}>
            {mapScope}
            {date ? ` · ${date}` : ''}
          </div>
        </div>
      </div>

      <div style={styles.svgWrapper}>
        <div
          style={styles.compassRose}
          aria-hidden="true"
          title="Rosa de los vientos"
        >
          <svg
            viewBox="0 0 88 88"
            width="100%"
            height="100%"
          >
            <circle
              cx="44"
              cy="44"
              r="27"
              fill="rgba(255,255,255,0.90)"
              stroke="#0b4f47"
              strokeWidth="1.2"
            />

            <line x1="44" y1="18" x2="44" y2="70" stroke="#98a2b3" strokeWidth="0.9" />
            <line x1="18" y1="44" x2="70" y2="44" stroke="#98a2b3" strokeWidth="0.9" />
            <line x1="26" y1="26" x2="62" y2="62" stroke="#d0d5dd" strokeWidth="0.7" />
            <line x1="62" y1="26" x2="26" y2="62" stroke="#d0d5dd" strokeWidth="0.7" />

            <polygon
              points="44,20 39.5,44 44,40.5 48.5,44"
              fill="#0b4f47"
            />
            <polygon
              points="44,68 39.5,44 44,47.5 48.5,44"
              fill="#BC955B"
            />
            <polygon
              points="68,44 44,39.5 47.5,44 44,48.5"
              fill="#667085"
            />
            <polygon
              points="20,44 44,39.5 40.5,44 44,48.5"
              fill="#667085"
            />

            <circle cx="44" cy="44" r="2.6" fill="#0b4f47" />

            <text x="44" y="10" textAnchor="middle" style={styles.compassLetter}>N</text>
            <text x="79" y="47" textAnchor="middle" style={styles.compassLetter}>E</text>
            <text x="44" y="84" textAnchor="middle" style={styles.compassLetter}>S</text>
            <text x="9" y="47" textAnchor="middle" style={styles.compassLetter}>O</text>
          </svg>
        </div>

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
                maxRate,
                mapColors.length
              );

            const fill =
              colorIndex === null
                ? NO_DATA_COLOR
                : mapColors[
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

          {mapColors.map(
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
          {temporalMode === 'trimestre'
            ? 'Tasa acumulada · '
            : 'Tasa del periodo · '}
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

function buildMunicipalScale(values, measure) {
  const positive = values
    .map((item) => Number(item?.value ?? 0))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

  const colors = getMapColors(measure).slice(1);

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

function getMunicipalColor(value, scale, measure) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return NO_DATA_COLOR;
  }

  const number = Number(value);

  if (number <= 0) {
    return getMapColors(measure)[0];
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
    return '0.00';
  }

  return new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number);
}

function MunicipalChoropleth({
  municipiosGeo,
  estadosGeo,
  values,
  entityCode,
  entityName = 'NACIONAL',
  date,
  loading,
  error,
  valueLabel = 'Tasa de incidencia',
  countLabel = 'Casos',
  valueNoun = 'incidencia',
  measure = 'incidencia',
  temporalMode = 'acumulado',
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
    () =>
      createProjection(
        visibleMunicipalFeatures,
        8,
        entityCode
      ),
    [
      visibleMunicipalFeatures,
      entityCode,
    ]
  );

  const recordByCvegeo = useMemo(() => {
    return new Map(
      (values ?? []).map((item) => [
        String(item.cvegeo),
        item,
      ])
    );
  }, [values]);

  const scale = useMemo(
    () => buildMunicipalScale(values ?? [], measure),
    [values, measure]
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
    { color: getMapColors(measure)[0], label: '0.00' },
    { color: scale.colors[0], label: `> 0 – ${formatMunicipalBreak(b1)}` },
    { color: scale.colors[1], label: `≤ ${formatMunicipalBreak(b2)}` },
    { color: scale.colors[2], label: `≤ ${formatMunicipalBreak(b3)}` },
    { color: scale.colors[3], label: `≤ ${formatMunicipalBreak(b4)}` },
    { color: scale.colors[4], label: `> ${formatMunicipalBreak(b4)}` },
    { color: NO_DATA_COLOR, label: 'Sin denominador' },
  ];

  const mapTitle =
    measure === 'mortalidad'
      ? 'Distribución de la mortalidad'
      : 'Distribución de la incidencia';

  const mapScope =
    !entityName || entityName === 'NACIONAL'
      ? 'México'
      : entityName;

  return (
    <div style={styles.mapBlock}>
      <div style={styles.mapHeader}>
        <div>
          <div style={styles.mapTitle}>{mapTitle}</div>
          <div style={styles.mapSubtitle}>
            {mapScope}
            {date ? ` · ${date}` : ''}
          </div>
        </div>
      </div>

      <div style={styles.svgWrapper}>
        <div
          style={styles.compassRose}
          aria-hidden="true"
          title="Rosa de los vientos"
        >
          <svg
            viewBox="0 0 88 88"
            width="100%"
            height="100%"
          >
            <circle
              cx="44"
              cy="44"
              r="27"
              fill="rgba(255,255,255,0.92)"
              stroke="#0b4f47"
              strokeWidth="1.2"
            />

            <line x1="44" y1="18" x2="44" y2="70" stroke="#98a2b3" strokeWidth="0.9" />
            <line x1="18" y1="44" x2="70" y2="44" stroke="#98a2b3" strokeWidth="0.9" />
            <line x1="26" y1="26" x2="62" y2="62" stroke="#d0d5dd" strokeWidth="0.7" />
            <line x1="62" y1="26" x2="26" y2="62" stroke="#d0d5dd" strokeWidth="0.7" />

            <polygon
              points="44,20 39.5,44 44,40.5 48.5,44"
              fill="#0b4f47"
            />
            <polygon
              points="44,68 39.5,44 44,47.5 48.5,44"
              fill="#BC955B"
            />
            <polygon
              points="68,44 44,39.5 47.5,44 44,48.5"
              fill="#667085"
            />
            <polygon
              points="20,44 44,39.5 40.5,44 44,48.5"
              fill="#667085"
            />

            <circle cx="44" cy="44" r="2.6" fill="#0b4f47" />

            <text x="44" y="10" textAnchor="middle" style={styles.compassLetter}>N</text>
            <text x="79" y="47" textAnchor="middle" style={styles.compassLetter}>E</text>
            <text x="44" y="84" textAnchor="middle" style={styles.compassLetter}>S</text>
            <text x="9" y="47" textAnchor="middle" style={styles.compassLetter}>O</text>
          </svg>
        </div>

        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          role="img"
          aria-label={`Mapa municipal de ${valueNoun}`}
          style={styles.mapSvg}
        >
          {municipalPaths.map(({ feature, cvegeo, path }) => {
            const record = recordByCvegeo.get(cvegeo);
            const value = record?.value ?? null;
            const count = Number(record?.count ?? 0);
            const municipio = feature?.properties?.municipio ?? 'Municipio';
            const entidadNombre = feature?.properties?.entidad ?? '';

            return (
              <path
                key={cvegeo}
                d={path}
                fill={getMunicipalColor(value, scale, measure)}
                fillRule="evenodd"
                stroke="#f8fafc"
                strokeWidth={0.2}
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
                    count,
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
              >
                <title>
                  {`${entidadNombre} · ${municipio} · ${valueLabel}: ${
                    value === null || value === undefined
                      ? 'Sin denominador'
                      : Number(value).toFixed(2)
                  } · ${countLabel}: ${count.toLocaleString('es-MX')}`}
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
              stroke="#667085"
              strokeWidth={0.8}
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
              <span>{countLabel}</span>
              <strong>
                {Number(tooltip.count ?? 0).toLocaleString('es-MX')}
              </strong>
            </div>

            <div style={styles.tooltipRow}>
              <span>{valueLabel}</span>
              <strong>
                {tooltip.value === null || tooltip.value === undefined
                  ? 'Sin denominador'
                  : Number(tooltip.value).toFixed(2)}
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
          {temporalMode === 'trimestre'
            ? `Tasa acumulada de ${valueNoun} · `
            : `Tasa de ${valueNoun} del periodo · `}
          <strong>{date || '—'}</strong>.
          {' '}Gris = sin denominador poblacional disponible.
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

  // -------------------------------------------------------------------------
  // RESOLUCIÓN TEMPORAL DE PRODUCCIÓN
  // -------------------------------------------------------------------------
  // Día, mes y semana = excluyentes.
  // Trimestre = acumulado desde el 1 de enero.
  const [periodoConsulta, setPeriodoConsulta] =
    useState('trimestre');
  const [trimestreTemporal, setTrimestreTemporal] =
    useState('T2');
  const [mesTemporal, setMesTemporal] =
    useState('2026-06');
  const [semanaTemporal, setSemanaTemporal] =
    useState('26');

  // Mapa único homologado: siempre utiliza la capa municipal.
  // NACIONAL muestra todos los municipios; al seleccionar una entidad,
  // el mismo mapa se enfoca automáticamente en sus municipios.
  const nivelMapa = 'municipal';

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

  const [municipalDeathsCore, setMunicipalDeathsCore] =
    useState(null);
  const [
    municipalDeathsCategoryMap,
    setMunicipalDeathsCategoryMap,
  ] = useState(null);
  const [
    municipalDeathsLoading,
    setMunicipalDeathsLoading,
  ] = useState(false);
  const [
    municipalDeathsError,
    setMunicipalDeathsError,
  ] = useState(null);
  const [
    municipalDeathsCategoryError,
    setMunicipalDeathsCategoryError,
  ] = useState(null);

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
  // ACTIVOS MUNICIPALES DE CASOS - PASOS 38 Y 39
  // ===========================================================================

  useEffect(() => {
    let active = true;

    // El tablero usa un único mapa municipal. Los activos se cargan una sola
    // vez y se reutilizan para NACIONAL y para el enfoque por entidad.

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
  // DEFUNCIONES MUNICIPALES - PASOS 40 Y 41
  // ===========================================================================

  useEffect(() => {
    let active = true;

    if (
      nivelMapa !== 'municipal' ||
      medida !== 'mortalidad'
    ) {
      return () => {
        active = false;
      };
    }

    if (municipalDeathsCore) {
      setMunicipalDeathsLoading(false);

      return () => {
        active = false;
      };
    }

    async function cargarDefuncionesMunicipales() {
      try {
        setMunicipalDeathsLoading(true);
        setMunicipalDeathsError(null);

        const coreData =
          await loadMunicipalDeathsCore();

        if (!active) {
          return;
        }

        setMunicipalDeathsCore(coreData);
      } catch (err) {
        if (!active) {
          return;
        }

        setMunicipalDeathsCore(null);
        setMunicipalDeathsError(err);
      } finally {
        if (active) {
          setMunicipalDeathsLoading(false);
        }
      }
    }

    cargarDefuncionesMunicipales();

    return () => {
      active = false;
    };
  }, [
    nivelMapa,
    medida,
    municipalDeathsCore,
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

  const trimestreSeleccionado = useMemo(
    () =>
      TEMPORAL_QUARTERS_2026.find(
        (item) =>
          item.value ===
          trimestreTemporal
      ) ?? TEMPORAL_QUARTERS_2026[1],
    [trimestreTemporal]
  );

  const semanaSeleccionada = useMemo(
    () =>
      TEMPORAL_WEEKS_2026.find(
        (item) =>
          item.value ===
          semanaTemporal
      ) ?? TEMPORAL_WEEKS_2026[
        TEMPORAL_WEEKS_2026.length - 1
      ],
    [semanaTemporal]
  );

  const periodoIdConsulta = useMemo(() => {
    if (periodoConsulta === 'trimestre') {
      return `2026-${trimestreTemporal}-ACUM`;
    }

    if (periodoConsulta === 'mes') {
      return mesTemporal;
    }

    if (periodoConsulta === 'semana') {
      return `2026-SE${String(semanaTemporal).padStart(2, '0')}`;
    }

    return fecha;
  }, [
    periodoConsulta,
    trimestreTemporal,
    mesTemporal,
    semanaTemporal,
    fecha,
  ]);

  const periodoEtiquetaConsulta = useMemo(() => {
    if (periodoConsulta === 'trimestre') {
      return trimestreSeleccionado.label;
    }

    if (periodoConsulta === 'mes') {
      return (
        TEMPORAL_MONTHS_2026.find(
          (item) => item.value === mesTemporal
        )?.label ?? mesTemporal
      );
    }

    if (periodoConsulta === 'semana') {
      return semanaSeleccionada.label;
    }

    return fecha;
  }, [
    periodoConsulta,
    trimestreSeleccionado,
    mesTemporal,
    semanaSeleccionada,
    fecha,
  ]);

  const periodoDetalleConsulta = useMemo(() => {
    if (periodoConsulta === 'trimestre') {
      return trimestreSeleccionado.detail;
    }

    if (periodoConsulta === 'mes') {
      return 'Periodo mensual no acumulado.';
    }

    if (periodoConsulta === 'semana') {
      return `${semanaSeleccionada.detail}. Semana epidemiológica oficial DGE 2026.`;
    }

    return 'Periodo diario no acumulado.';
  }, [
    periodoConsulta,
    trimestreSeleccionado,
    semanaSeleccionada,
  ]);

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
        medida !== 'incidencia' ||
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
    medida,
    municipalCore,
  ]);

  // ===========================================================================
  // CATEGORÍAS MUNICIPALES DE DEFUNCIONES
  // ===========================================================================

  useEffect(() => {
    let active = true;

    async function cargarCategoriaMunicipalDefunciones() {
      if (
        nivelMapa !== 'municipal' ||
        medida !== 'mortalidad' ||
        tipo === 'TODOS' ||
        !municipalDeathsCore
      ) {
        setMunicipalDeathsCategoryMap(null);
        setMunicipalDeathsCategoryError(null);
        return;
      }

      try {
        setMunicipalDeathsCategoryError(null);

        const data =
          await loadMunicipalDeathsCategoryMap(tipo);

        if (!active) {
          return;
        }

        setMunicipalDeathsCategoryMap(data);
      } catch (err) {
        if (!active) {
          return;
        }

        setMunicipalDeathsCategoryMap(null);
        setMunicipalDeathsCategoryError(err);
      }
    }

    cargarCategoriaMunicipalDefunciones();

    return () => {
      active = false;
    };
  }, [
    tipo,
    nivelMapa,
    medida,
    municipalDeathsCore,
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
    const coreActivo =
      medida === 'mortalidad'
        ? municipalDeathsCore
        : municipalCore;

    const categoryActivo =
      medida === 'mortalidad'
        ? municipalDeathsCategoryMap
        : municipalCategoryMap;

    if (
      categoria !== 'TODAS' &&
      tipo !== 'TODOS'
    ) {
      return {
        mapData: categoryActivo,
        level: 'categoria',
      };
    }

    if (tipo !== 'TODOS') {
      return {
        mapData: coreActivo,
        level: 'tipo',
      };
    }

    if (evento !== 'TODOS') {
      return {
        mapData: coreActivo,
        level: 'evento',
      };
    }

    return {
      mapData: coreActivo,
      level: 'total',
    };
  }, [
    medida,
    municipalCore,
    municipalCategoryMap,
    municipalDeathsCore,
    municipalDeathsCategoryMap,
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

  // La capa V9 usa un ID de periodo explícito. Se conserva esta variable
  // únicamente para los textos/estilos de los componentes.
  const modoConsultaDatos =
    periodoConsulta;

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
        date: periodoIdConsulta,
        entity: entidad,
        event: evento,
        type: tipo,
        category: categoria,
        level: consulta.level,
        metric:
          metricaConteo,
        mode: modoConsultaDatos,
      });
    }, [
      consulta,
      fecha,
      entidad,
      evento,
      tipo,
      categoria,
      metricaConteo,
      periodoIdConsulta,
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
        date: periodoIdConsulta,
        entity: entidad,
        event: evento,
        type: tipo,
        category: categoria,
        level: consulta.level,
        metric: metricaTasa,
        mode: modoConsultaDatos,
      });
    }, [
      consulta,
      fecha,
      entidad,
      evento,
      tipo,
      categoria,
      metricaTasa,
      periodoIdConsulta,
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
        date: periodoIdConsulta,
        event: evento,
        type: tipo,
        category: categoria,
        level: consulta.level,
        metric: metricaTasa,
        mode: modoConsultaDatos,
        includeNational: false,
      });
    }, [
      consulta,
      fecha,
      evento,
      tipo,
      categoria,
      metricaTasa,
      periodoIdConsulta,
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
        date: periodoIdConsulta,
        event: evento,
        type: tipo,
        category: categoria,
        level: consulta.level,
        metric:
          metricaConteo,
        mode: modoConsultaDatos,
        includeNational: false,
      });
    }, [
      consulta,
      fecha,
      evento,
      tipo,
      categoria,
      metricaConteo,
      periodoIdConsulta,
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
        date: periodoIdConsulta,
        event: evento,
        type: tipo,
        category: categoria,
        level: consultaMunicipal.level,
        mode: modoConsultaDatos,
        metric: metricaTasa,
        countMetric: metricaConteo,
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
    metricaTasa,
    metricaConteo,
    periodoIdConsulta,
  ]);

  const errorMunicipalActivo =
    municipalError ??
    (
      medida === 'mortalidad'
        ? (
            municipalDeathsError ??
            (
              categoria !== 'TODAS'
                ? municipalDeathsCategoryError
                : null
            )
          )
        : (
            categoria !== 'TODAS'
              ? municipalCategoryError
              : null
          )
    );

  const loadingMunicipalActivo =
    municipalLoading ||
    (
      medida === 'mortalidad' &&
      municipalDeathsLoading
    );

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
          date: periodoIdConsulta,
          entity: entidad,
          category: categoria,
          mode: modoConsultaDatos,
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
    periodoIdConsulta,
  ]);

  // ===========================================================================
  // PRESENTACIÓN ESPECÍFICA - ACCIDENTES DE TRANSPORTE
  // ===========================================================================
  //
  // Para Transporte, el nuevo producto tiene 5 series internas pero sólo
  // 3 indicadores visuales:
  //
  //   1) Rol de la persona lesionada
  //        - Conductor
  //        - Ocupante
  //        - Peatón
  //      Únicamente para Vehículos de motor y Motocicletas.
  //
  //   2) % de personas que NO usaron equipo de seguridad
  //   3) Sospecha de consumo de alcohol
  //
  // Para los demás tipos se conserva exactamente el comportamiento actual.

  const esTransporte =
    tipo === 'Accidentes de transporte';

  const esArmasPunzocortantes =
    tipo === 'Armas de fuego y punzocortantes';

  const esMaltratoNegligencia =
    tipo === 'Fuerza/contundente, maltrato y negligencia';

  const esOtrosMecanismos =
    tipo === 'Otros mecanismos específicos';

  const esAutoinfligidas =
    tipo === 'Lesiones autoinfligidas';

  const categoriaConRolTransporte =
    categoria === 'Vehículos de motor' ||
    categoria === 'Motocicletas';

  const bulletsVisibles = useMemo(() => {
    if (!esTransporte) {
      return bullets;
    }

    return bullets.filter((item) => {
      if (
        item?.grupo ===
        'rol_persona_lesionada'
      ) {
        return categoriaConRolTransporte;
      }

      const aplica =
        Array.isArray(
          item?.aplica_categorias
        )
          ? item.aplica_categorias
          : [];

      return (
        aplica.length === 0 ||
        aplica.includes(categoria)
      );
    });
  }, [
    bullets,
    esTransporte,
    categoriaConRolTransporte,
    categoria,
  ]);

  const rolTransporte = useMemo(() => {
    if (
      !esTransporte ||
      !categoriaConRolTransporte
    ) {
      return [];
    }

    return bulletsVisibles.filter(
      (item) =>
        item?.grupo ===
        'rol_persona_lesionada'
    );
  }, [
    bulletsVisibles,
    esTransporte,
    categoriaConRolTransporte,
  ]);

  const parentescoAgresor = useMemo(() => {
    return bulletsVisibles.filter(
      (item) =>
        item?.grupo ===
        'parentesco_agresor'
    );
  }, [
    bulletsVisibles,
  ]);

  const bulletsSimples = useMemo(() => {
    const visibles = bulletsVisibles.filter((item) => {
      if (
        item?.grupo ===
        'parentesco_agresor'
      ) {
        return false;
      }

      if (
        esTransporte &&
        item?.grupo ===
        'rol_persona_lesionada'
      ) {
        return false;
      }

      return true;
    });

    if (esArmasPunzocortantes) {
      const prioridad = {
        sospecha_alcohol_agresor: 1,
        embarazo_o_puerperio: 2,
        principal_sitio_ocurrencia: 3,
      };

      return [...visibles].sort((a, b) => {
        const idA =
          a?.id ??
          a?.indicador_id ??
          '';
        const idB =
          b?.id ??
          b?.indicador_id ??
          '';

        return (
          (prioridad[idA] ?? 99) -
          (prioridad[idB] ?? 99)
        );
      });
    }

    if (esMaltratoNegligencia) {
      const prioridad = {
        sospecha_alcohol_agresor: 1,
        agresion_repetida: 2,
        principal_sitio_ocurrencia: 3,
      };

      return [...visibles].sort((a, b) => {
        const idA =
          a?.id ??
          a?.indicador_id ??
          '';
        const idB =
          b?.id ??
          b?.indicador_id ??
          '';

        return (
          (prioridad[idA] ?? 99) -
          (prioridad[idB] ?? 99)
        );
      });
    }

    if (esOtrosMecanismos) {
      const prioridad = {
        sospecha_alcohol_agresor: 1,
        embarazo_o_puerperio: 2,
        principal_sitio_ocurrencia: 3,
      };

      return [...visibles].sort((a, b) => {
        const idA =
          a?.id ??
          a?.indicador_id ??
          '';
        const idB =
          b?.id ??
          b?.indicador_id ??
          '';

        return (
          (prioridad[idA] ?? 99) -
          (prioridad[idB] ?? 99)
        );
      });
    }

    if (esAutoinfligidas) {
      const prioridad = {
        principal_sitio_ocurrencia: 1,
        embarazo_o_puerperio: 2,
        sospecha_consumo_alcohol: 3,
        sospecha_consumo_sustancias_drogas: 4,
      };

      return [...visibles].sort((a, b) => {
        const idA =
          a?.id ??
          a?.indicador_id ??
          '';
        const idB =
          b?.id ??
          b?.indicador_id ??
          '';

        return (
          (prioridad[idA] ?? 99) -
          (prioridad[idB] ?? 99)
        );
      });
    }

    return visibles;
  }, [
    bulletsVisibles,
    esTransporte,
    esArmasPunzocortantes,
    esMaltratoNegligencia,
    esOtrosMecanismos,
    esAutoinfligidas,
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
          date: periodoIdConsulta,
          entity: entidad,
          category: categoria,
          mode: modoConsultaDatos,
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

      const valorOrdenEdad = (grupo) => {
        const texto = String(
          grupo ?? ''
        ).trim();

        const coincidencia =
          texto.match(/\d+/);

        if (!coincidencia) {
          return Number.NEGATIVE_INFINITY;
        }

        return Number(
          coincidencia[0]
        );
      };

      return Array.from(
        grupos.values()
      ).sort(
        (a, b) =>
          valorOrdenEdad(
            b.grupo
          ) -
          valorOrdenEdad(
            a.grupo
          )
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
    periodoIdConsulta,
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
          date: periodoIdConsulta,
          entity: entidad,
          category: categoria,
          mode: modoConsultaDatos,
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
        )
        .sort(
          (a, b) =>
            b.value - a.value
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
    periodoIdConsulta,
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
          date: periodoIdConsulta,
          entity: entidad,
          category: categoria,
          mode: modoConsultaDatos,
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
        )
        .sort(
          (a, b) =>
            b.value - a.value
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
    periodoIdConsulta,
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
          date: periodoIdConsulta,
          entity: entidad,
          category: categoria,
          mode: modoConsultaDatos,
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
    periodoIdConsulta,
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
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700;800&display=swap');

        html,
        body,
        #root {
          width: 100%;
          max-width: none !important;
          margin: 0 !important;
          padding: 0 !important;
        }

        html,
        body {
          min-width: 320px;
          min-height: 100%;
          background: #f1f1f1 !important;
        }

        body {
          display: block !important;
          place-items: initial !important;
          overflow-x: auto;
        }

        #root {
          min-height: 100vh;
          text-align: left !important;
        }

        *,
        *::before,
        *::after {
          box-sizing: border-box;
        }

        html,
        body,
        #root,
        #root *,
        button,
        input,
        select,
        textarea,
        option,
        svg,
        svg text {
          font-family:
            'Noto Sans',
            Arial,
            Helvetica,
            sans-serif !important;
        }
      `}</style>
      {/* ============================================================= */}
      {/* ENCABEZADO INSTITUCIONAL */}
      {/* ============================================================= */}

      <header style={styles.institutionalHeader}>
        <div style={styles.brandLeft}>
          <img
            src={logoImssBienestar}
            alt="IMSS Bienestar Servicios Públicos de Salud"
            style={styles.logoImssBienestar}
          />
        </div>

        <div style={styles.brandRight}>
          <img
            src={logoCoordinacion}
            alt="Coordinación de Epidemiología"
            style={styles.logoCoordinacion}
          />

          <div style={styles.verticalDivider} />

          <img
            src={logoVigilancia}
            alt="Vigilancia Epidemiológica"
            style={styles.logoVigilancia}
          />
        </div>
      </header>

      <div style={styles.titleStrip}>
        <h1 style={styles.dashboardTitle}>
          Vigilancia epidemiológica de accidentes y lesiones
        </h1>

        <div style={styles.titleDate}>
          {periodoConsulta === 'trimestre'
            ? 'Datos acumulados · '
            : 'Datos del periodo · '}
          <strong>
            {periodoEtiquetaConsulta || '—'}
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
            ) : bulletsVisibles.length === 0 ? (
              <div style={styles.sidebarEmpty}>
                No hay indicadores para la selección actual.
              </div>
            ) : (
              <div style={styles.sidebarBulletGrid}>
                {rolTransporte.length > 0 && (
                  <div
                    style={styles.sidebarRoleCard}
                  >
                    <div
                      style={styles.sidebarRoleTitle}
                    >
                      Rol de la persona lesionada
                    </div>

                    <div
                      style={styles.sidebarRoleGrid}
                    >
                      {rolTransporte.map(
                        (item, index) => (
                          <div
                            key={
                              item.id ??
                              item.indicador_id ??
                              item.indicador ??
                              index
                            }
                            style={
                              styles.sidebarRoleItem
                            }
                          >
                            <div
                              style={
                                styles.sidebarRoleLabel
                              }
                            >
                              {item.indicador}
                            </div>

                            <div
                              style={
                                styles.sidebarRoleValue
                              }
                            >
                              {formatBulletValue(
                                item.value
                              )}
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}

                {parentescoAgresor.length > 0 && (
                  <div
                    style={styles.sidebarKinshipCard}
                  >
                    <div
                      style={styles.sidebarKinshipTitle}
                    >
                      {parentescoAgresor?.[0]?.grupo_titulo ??
                        'Parentesco con el agresor'}
                    </div>

                    <div
                      style={styles.sidebarKinshipGrid}
                    >
                      {parentescoAgresor.map(
                        (item, index) => (
                          <div
                            key={
                              item.id ??
                              item.indicador_id ??
                              item.indicador ??
                              index
                            }
                            style={
                              styles.sidebarKinshipItem
                            }
                          >
                            <div
                              style={
                                styles.sidebarKinshipLabel
                              }
                            >
                              {item.indicador}
                            </div>

                            <div
                              style={
                                styles.sidebarKinshipValue
                              }
                            >
                              {formatBulletValue(
                                item.value
                              )}
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}

                {bulletsSimples.map(
                  (item, index) => (
                    <div
                      key={
                        item.id ??
                        item.indicador_id ??
                        item.indicador ??
                        index
                      }
                      style={{
                        ...styles.sidebarBulletCard,
                        ...(
                          item?.id === 'principal_mecanismo_lesion_accidental' ||
                          item?.indicador_id === 'principal_mecanismo_lesion_accidental' ||
                          item?.indicador === 'Principal mecanismo de la lesión accidental' ||
                          (
                            (esArmasPunzocortantes || esMaltratoNegligencia || esOtrosMecanismos) &&
                            (
                              item?.id === 'principal_sitio_ocurrencia' ||
                              item?.indicador_id === 'principal_sitio_ocurrencia' ||
                              item?.indicador === 'Principal sitio de ocurrencia'
                            )
                          )
                            ? styles.sidebarBulletCardWide
                            : {}
                        ),
                      }}
                    >
                      {isEquipmentSentence(item) ? (
                        <div style={styles.sidebarSentenceBlock}>
                          <span style={styles.sidebarSentenceValue}>
                            {formatBulletValue(item.value)}
                          </span>
                          <span style={styles.sidebarSentenceText}>
                            de las personas no usaban equipo de seguridad
                          </span>
                        </div>
                      ) : isAccidentAlcoholSentence(item, tipo) ? (
                        <div style={styles.sidebarSentenceBlock}>
                          <span style={styles.sidebarSentenceText}>
                            Consumo de alcohol en el
                          </span>
                          <span style={styles.sidebarSentenceValue}>
                            {formatBulletValue(item.value)}
                          </span>
                          <span style={styles.sidebarSentenceText}>
                            de los accidentados
                          </span>
                        </div>
                      ) : (
                        <>
                          <div style={styles.sidebarBulletLabel}>
                            {getBulletDisplayLabel(item, tipo)}
                          </div>

                          <div
                            style={
                              item?.modo === 'nominal'
                                ? styles.sidebarBulletValueNominal
                                : styles.sidebarBulletValue
                            }
                          >
                            {item?.modo === 'nominal'
                              ? item?.text ?? '—'
                              : formatBulletValue(
                                  item.value
                                )}
                          </div>
                        </>
                      )}
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
            {errorMunicipalActivo ? (
              <div style={styles.municipalFallbackNote}>
                <strong>No fue posible cargar el mapa municipal.</strong>
                <br />
                {errorMunicipalActivo.message}
              </div>
            ) : (
              <MunicipalChoropleth
                municipiosGeo={municipiosGeo}
                estadosGeo={estadosMunicipalesGeo}
                values={valoresMunicipales}
                entityCode={entidadCodigoMunicipal}
                entityName={entidad}
                date={periodoEtiquetaConsulta}
                loading={loadingMunicipalActivo}
                error={null}
                valueLabel={
                  medida === 'mortalidad'
                    ? 'Tasa de mortalidad'
                    : 'Tasa de incidencia'
                }
                countLabel={
                  medida === 'mortalidad'
                    ? 'Defunciones'
                    : 'Casos'
                }
                valueNoun={
                  medida === 'mortalidad'
                    ? 'mortalidad'
                    : 'incidencia'
                }
                measure={medida}
                temporalMode={modoConsultaDatos}
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
              Periodo de consulta
            </div>

            <div style={styles.temporalModeGrid}>
              <button
                type="button"
                onClick={() =>
                  setPeriodoConsulta(
                    'trimestre'
                  )
                }
                style={
                  periodoConsulta ===
                  'trimestre'
                    ? styles.temporalModeOptionActive
                    : styles.temporalModeOption
                }
              >
                Trimestre
              </button>

              <button
                type="button"
                onClick={() =>
                  setPeriodoConsulta(
                    'mes'
                  )
                }
                style={
                  periodoConsulta === 'mes'
                    ? styles.temporalModeOptionActive
                    : styles.temporalModeOption
                }
              >
                Mes
              </button>

              <button
                type="button"
                onClick={() =>
                  setPeriodoConsulta(
                    'semana'
                  )
                }
                style={
                  periodoConsulta ===
                  'semana'
                    ? styles.temporalModeOptionActive
                    : styles.temporalModeOption
                }
              >
                Semana
              </button>

              <button
                type="button"
                onClick={() =>
                  setPeriodoConsulta(
                    'dia'
                  )
                }
                style={
                  periodoConsulta === 'dia'
                    ? styles.temporalModeOptionActive
                    : styles.temporalModeOption
                }
              >
                Día
              </button>
            </div>

            <div style={styles.dateCard}>
              {periodoConsulta ===
                'trimestre' && (
                <>
                  <select
                    value={
                      trimestreTemporal
                    }
                    onChange={(e) =>
                      setTrimestreTemporal(
                        e.target.value
                      )
                    }
                    style={
                      styles.temporalSelect
                    }
                  >
                    {TEMPORAL_QUARTERS_2026.map(
                      (item) => (
                        <option
                          key={item.value}
                          value={item.value}
                        >
                          {item.label}
                        </option>
                      )
                    )}
                  </select>

                  <div
                    style={
                      styles.temporalDetail
                    }
                  >
                    {
                      trimestreSeleccionado.detail
                    }
                  </div>

                  <div
                    style={
                      styles.temporalAccumulatedBadge
                    }
                  >
                    Acumulado
                  </div>
                </>
              )}

              {periodoConsulta === 'mes' && (
                <>
                  <select
                    value={mesTemporal}
                    onChange={(e) =>
                      setMesTemporal(
                        e.target.value
                      )
                    }
                    style={
                      styles.temporalSelect
                    }
                  >
                    {TEMPORAL_MONTHS_2026.map(
                      (item) => (
                        <option
                          key={item.value}
                          value={item.value}
                        >
                          {item.label}
                        </option>
                      )
                    )}
                  </select>

                  <div
                    style={
                      styles.temporalDetail
                    }
                  >
                    Periodo mensual no
                    acumulado.
                  </div>
                </>
              )}

              {periodoConsulta ===
                'semana' && (
                <>
                  <select
                    value={semanaTemporal}
                    onChange={(e) =>
                      setSemanaTemporal(
                        e.target.value
                      )
                    }
                    style={
                      styles.temporalSelect
                    }
                  >
                    {TEMPORAL_WEEKS_2026.map(
                      (item) => (
                        <option
                          key={item.value}
                          value={item.value}
                        >
                          {item.label}
                        </option>
                      )
                    )}
                  </select>

                  <div
                    style={
                      styles.temporalDetail
                    }
                  >
                    {
                      semanaSeleccionada.detail
                    }
                    <br />
                    Semana epidemiológica
                    oficial DGE 2026.
                  </div>
                </>
              )}

              {periodoConsulta === 'dia' && (
                <>
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

                  <div
                    style={
                      styles.temporalDetail
                    }
                  >
                    Periodo diario no
                    acumulado.
                  </div>
                </>
              )}

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
                {periodoConsulta === 'trimestre'
                  ? 'Información acumulada para el trimestre seleccionado.'
                  : `Información correspondiente a ${periodoEtiquetaConsulta}.`}
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

            <div
              style={{
                ...styles.profilePanel,
                ...styles.profilePanelPyramid,
              }}
            >
              <div style={styles.profilePanelHeader}>
                <div>
                  <h3 style={styles.profilePanelTitle}>
                    Grupo de edad y sexo
                  </h3>

                  <div style={styles.profilePanelNote}>
                    {periodoConsulta === 'trimestre'
                      ? 'Casos acumulados.'
                      : `Casos de ${periodoEtiquetaConsulta}.`}
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
                Frecuencia de lesiones por área anatómica
              </h3>

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
                Consecuencia de mayor gravedad
              </h3>

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
                <div style={styles.areaList}>
                  {perfilConsecuencia.map(
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
            {/* DISTRIBUCIONES COMPLEMENTARIAS */}
            {/* --------------------------------------------------------- */}

            <div
              style={{
                ...styles.profilePanelWide,
                display: MOSTRAR_DISTRIBUCIONES_COMPLEMENTARIAS
                  ? 'block'
                  : 'none',
              }}
            >
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
    width: '100%',
    maxWidth: 'none',
    minWidth: '1180px',
    minHeight: '100vh',
    margin: 0,
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
    gap: '32px',
    padding:
      '11px clamp(28px, 3.2vw, 64px)',
    boxSizing: 'border-box',
  },

  brandLeft: {
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
    flexShrink: 0,
  },

  logoImssBienestar: {
    display: 'block',
    width: 'clamp(245px, 21vw, 355px)',
    height: 'auto',
    maxHeight: '72px',
    objectFit: 'contain',
    objectPosition: 'left center',
  },

  brandRight: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '24px',
    minWidth: 0,
    flex: 1,
  },

  logoCoordinacion: {
    display: 'block',
    width: 'clamp(250px, 23vw, 400px)',
    height: 'auto',
    maxHeight: '56px',
    objectFit: 'contain',
    objectPosition: 'right center',
  },

  verticalDivider: {
    width: '1px',
    height: '62px',
    flex: '0 0 1px',
    background: 'rgba(255,255,255,0.32)',
  },

  logoVigilancia: {
    display: 'block',
    width: 'clamp(145px, 12vw, 210px)',
    height: 'auto',
    maxHeight: '68px',
    objectFit: 'contain',
    objectPosition: 'right center',
  },

  titleStrip: {
    minHeight: '50px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '20px',
    padding:
      '7px clamp(20px, 2vw, 36px) 5px',
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
    width: '100%',
    maxWidth: 'none',
    padding:
      '10px clamp(20px, 2vw, 36px) 24px',
    margin: 0,
    boxSizing: 'border-box',
  },

  heroGrid: {
    width: '100%',
    display: 'grid',
    gridTemplateColumns:
      'clamp(290px, 18vw, 350px) minmax(620px, 1fr) clamp(235px, 15vw, 285px)',
    gap: '18px',
    alignItems: 'start',
    minWidth: '1120px',
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

  sidebarRoleCard: {
    gridColumn: '1 / -1',
    border: '1px solid #8d8d8d',
    borderRadius: '15px',
    padding: '12px 13px',
    background: '#ffffff',
    boxSizing: 'border-box',
  },

  sidebarRoleTitle: {
    marginBottom: '10px',
    fontSize: '11px',
    lineHeight: 1.2,
    fontWeight: 800,
    color: '#003b35',
  },

  sidebarRoleGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '7px',
  },

  sidebarRoleItem: {
    minWidth: 0,
    borderRadius: '10px',
    padding: '8px 5px',
    background: '#f8f6f2',
    textAlign: 'center',
  },

  sidebarRoleLabel: {
    minHeight: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '9px',
    lineHeight: 1.15,
    fontWeight: 700,
    color: '#5f5f5f',
  },

  sidebarRoleValue: {
    marginTop: '5px',
    fontSize: '18px',
    lineHeight: 1,
    fontWeight: 800,
    color: '#7b1e3a',
    fontVariantNumeric: 'tabular-nums',
  },

  sidebarKinshipCard: {
    gridColumn: '1 / -1',
    border: '1px solid #8d8d8d',
    borderRadius: '15px',
    padding: '12px 13px',
    background: '#ffffff',
    boxSizing: 'border-box',
  },

  sidebarKinshipTitle: {
    marginBottom: '10px',
    fontSize: '11px',
    lineHeight: 1.2,
    fontWeight: 800,
    color: '#003b35',
  },

  sidebarKinshipGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '7px',
  },

  sidebarKinshipItem: {
    minWidth: 0,
    borderRadius: '10px',
    padding: '8px 7px',
    background: '#f8f6f2',
    textAlign: 'center',
  },

  sidebarKinshipLabel: {
    minHeight: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '9px',
    lineHeight: 1.15,
    fontWeight: 700,
    color: '#000000',
  },

  sidebarKinshipValue: {
    marginTop: '5px',
    fontSize: '18px',
    lineHeight: 1,
    fontWeight: 800,
    color: '#7b1e3a',
    fontVariantNumeric: 'tabular-nums',
  },

  sidebarBulletCard: {
    minHeight: '82px',
    border: '1px solid #8d8d8d',
    borderRadius: '15px',
    padding: '11px 13px',
    background: '#ffffff',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-start',
  },

  sidebarBulletCardWide: {
    gridColumn: '1 / -1',
    minHeight: '88px',
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

  sidebarBulletValueNominal: {
    marginTop: '7px',
    fontSize: '19px',
    lineHeight: 1.15,
    fontWeight: 800,
    color: '#7b1e3a',
    overflowWrap: 'anywhere',
  },

  sidebarSentenceBlock: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: '3px 4px',
    lineHeight: 1.18,
  },

  sidebarSentenceValue: {
    fontSize: '22px',
    fontWeight: 800,
    color: '#7b1e3a',
    fontVariantNumeric: 'tabular-nums',
  },

  sidebarSentenceText: {
    fontSize: '11px',
    fontWeight: 800,
    color: '#003b35',
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

  temporalModeGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '6px',
  },

  temporalModeOption: {
    minHeight: '34px',
    padding: '5px 7px',
    border: '1px solid #a4a4a4',
    borderRadius: '7px',
    background: '#ffffff',
    color: '#003b35',
    fontSize: '10px',
    fontWeight: 800,
    cursor: 'pointer',
  },

  temporalModeOptionActive: {
    minHeight: '34px',
    padding: '5px 7px',
    border: '1px solid #003b35',
    borderRadius: '7px',
    background: '#003b35',
    color: '#ffffff',
    fontSize: '10px',
    fontWeight: 800,
    cursor: 'pointer',
  },

  temporalSelect: {
    width: '100%',
    minHeight: '41px',
    padding: '7px 9px',
    border: '1px solid #8d8d8d',
    borderRadius: '7px',
    boxSizing: 'border-box',
    background: '#ffffff',
    color: '#003b35',
    fontSize: '11px',
    fontWeight: 700,
    cursor: 'pointer',
  },

  temporalDetail: {
    marginTop: '6px',
    fontSize: '9px',
    lineHeight: 1.35,
    color: '#667085',
  },

  temporalAccumulatedBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    marginTop: '6px',
    minHeight: '20px',
    padding: '3px 7px',
    borderRadius: '999px',
    background: '#e8f2ef',
    color: '#003b35',
    fontSize: '8px',
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
  },

  temporalPreviewNote: {
    marginTop: '8px',
    padding: '7px 8px',
    border: '1px dashed #c7c7c7',
    borderRadius: '7px',
    background: '#fafafa',
    color: '#777777',
    fontSize: '8px',
    lineHeight: 1.35,
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
    gridTemplateColumns: '0.92fr 1.08fr',
    gap: '10px',
    alignItems: 'start',
  },

  profilePanel: {
    background: '#ffffff',
    border: '1px solid #d7d7d7',
    borderRadius: '12px',
    padding: '12px 13px',
    boxSizing: 'border-box',
  },

  profilePanelPyramid: {
    gridColumn: '1',
    gridRow: '1 / span 2',
    alignSelf: 'start',
  },

  profilePanelWide: {
    gridColumn: '1 / -1',
    background: '#ffffff',
    border: '1px solid #d7d7d7',
    borderRadius: '12px',
    padding: '12px 13px',
    boxSizing: 'border-box',
  },

  profilePanelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '10px',
    marginBottom: '7px',
  },

  profilePanelTitle: {
    margin: '0 0 3px',
    fontSize: '13px',
    fontWeight: 800,
    color: '#003b35',
  },

  profilePanelNote: {
    marginBottom: '7px',
    fontSize: '9px',
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
    maxWidth: '520px',
    margin: '2px auto 0',
  },

  pyramidHeader: {
    display: 'grid',
    gridTemplateColumns:
      'minmax(105px, 1fr) 44px minmax(105px, 1fr)',
    gap: '5px',
    alignItems: 'center',
    marginBottom: '4px',
    paddingBottom: '4px',
    borderBottom: '1px solid #eeeeee',
  },

  pyramidSideHeaderLeft: {
    textAlign: 'right',
    fontSize: '9px',
    fontWeight: 700,
    color: '#667085',
  },

  pyramidSideHeaderRight: {
    textAlign: 'left',
    fontSize: '9px',
    fontWeight: 700,
    color: '#667085',
  },

  pyramidAgeHeader: {
    textAlign: 'center',
    fontSize: '9px',
    fontWeight: 700,
    color: '#667085',
  },

  pyramidRow: {
    display: 'grid',
    gridTemplateColumns:
      'minmax(105px, 1fr) 44px minmax(105px, 1fr)',
    gap: '5px',
    alignItems: 'center',
    minHeight: '14px',
    marginBottom: 0,
  },

  pyramidLeft: {
    display: 'grid',
    gridTemplateColumns:
      '46px minmax(65px, 1fr)',
    gap: '5px',
    alignItems: 'center',
  },

  pyramidRight: {
    display: 'grid',
    gridTemplateColumns:
      'minmax(65px, 1fr) 46px',
    gap: '5px',
    alignItems: 'center',
  },

  pyramidTrackLeft: {
    height: '7px',
    display: 'flex',
    justifyContent: 'flex-end',
    background: '#f0f1f3',
    borderRadius: '3px 0 0 3px',
    overflow: 'hidden',
  },

  pyramidTrackRight: {
    height: '7px',
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
    fontSize: '8px',
    fontWeight: 800,
    color: '#003b35',
    whiteSpace: 'nowrap',
  },

  pyramidValueLeft: {
    textAlign: 'right',
    fontSize: '9px',
    fontWeight: 600,
    color: '#667085',
    fontVariantNumeric: 'tabular-nums',
  },

  pyramidValueRight: {
    textAlign: 'left',
    fontSize: '9px',
    fontWeight: 600,
    color: '#667085',
    fontVariantNumeric: 'tabular-nums',
  },

  areaList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '7px',
  },

  areaRow: {
    width: '100%',
  },

  areaTop: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '10px',
    marginBottom: '3px',
  },

  areaLabel: {
    fontSize: '10px',
    fontWeight: 700,
    color: '#003b35',
    lineHeight: 1.2,
  },

  areaValue: {
    fontSize: '9px',
    color: '#7b1e3a',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },

  areaTrack: {
    width: '100%',
    height: '7px',
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

  mapHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: '54px',
    padding: '10px 18px 8px',
    borderBottom: '1px solid #eef1f4',
    background: '#ffffff',
  },

  mapTitle: {
    fontSize: '16px',
    lineHeight: 1.2,
    fontWeight: 800,
    color: '#003b35',
    letterSpacing: '-0.15px',
  },

  mapSubtitle: {
    marginTop: '3px',
    fontSize: '9.5px',
    lineHeight: 1.3,
    fontWeight: 600,
    color: '#667085',
    textTransform: 'uppercase',
    letterSpacing: '0.35px',
  },

  compassRose: {
    position: 'absolute',
    top: '15px',
    right: '18px',
    width: '68px',
    height: '68px',
    zIndex: 4,
    pointerEvents: 'none',
    filter: 'drop-shadow(0 2px 3px rgba(15, 23, 42, 0.10))',
  },

  compassLetter: {
    fontSize: '9px',
    fontWeight: 800,
    fill: '#344054',
    fontFamily: '"Noto Sans", Arial, Helvetica, sans-serif',
  },

  svgWrapper: {
    position: 'relative',
    width: '100%',
    minHeight: '500px',
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
    maxHeight: '650px',
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
    gap: '6px 12px',
    padding: '8px 8px 5px',
    borderTop: '1px solid #f1f1f1',
  },

  legend: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    flexWrap: 'wrap',
  },

  legendSwatch: {
    width: '17px',
    height: '8px',
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