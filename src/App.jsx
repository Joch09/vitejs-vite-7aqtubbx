import { useEffect, useMemo, useState } from 'react';

import { useDashboardData } from './hooks/useDashboardData';

import {
  getMapEntityValues,
  getMapValue,
  getMunicipalValues,
  loadCategoryMap,
  loadMunicipalCategoryMap,
  loadMunicipalCore,
  loadMunicipalGeometry,
  loadMunicipalManifest,
  loadMunicipalStatesGeometry,
} from './data/dashboardData';

// =============================================================================
// UTILIDADES MAPA MUNICIPAL
// =============================================================================

function normalizeKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

function collectCoordinates(geometry, output = []) {
  if (!geometry) return output;

  const walk = (node) => {
    if (!Array.isArray(node)) return;

    if (
      node.length >= 2 &&
      typeof node[0] === 'number' &&
      typeof node[1] === 'number'
    ) {
      output.push(node);
      return;
    }

    node.forEach(walk);
  };

  walk(geometry.coordinates);
  return output;
}

function getBounds(features) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const feature of features ?? []) {
    const coords = collectCoordinates(feature?.geometry, []);

    for (const [x, y] of coords) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }

  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxY)
  ) {
    return {
      minX: -118,
      maxX: -86,
      minY: 14,
      maxY: 33,
    };
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
  };
}

function createProjection(features, width = 1000, height = 600) {
  const bounds = getBounds(features);

  const dataWidth = Math.max(0.0001, bounds.maxX - bounds.minX);
  const dataHeight = Math.max(0.0001, bounds.maxY - bounds.minY);

  const padding = 24;

  const scale = Math.min(
    (width - padding * 2) / dataWidth,
    (height - padding * 2) / dataHeight
  );

  const projectedWidth = dataWidth * scale;
  const projectedHeight = dataHeight * scale;

  const offsetX = (width - projectedWidth) / 2;
  const offsetY = (height - projectedHeight) / 2;

  return ([x, y]) => {
    const px = offsetX + (x - bounds.minX) * scale;
    const py = offsetY + (bounds.maxY - y) * scale;

    return [px, py];
  };
}

function ringToPath(ring, project) {
  if (!Array.isArray(ring) || ring.length === 0) return '';

  return ring
    .map((coord, index) => {
      const [x, y] = project(coord);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ') + ' Z';
}

function geometryToPath(geometry, project) {
  if (!geometry) return '';

  if (geometry.type === 'Polygon') {
    return (geometry.coordinates ?? [])
      .map((ring) => ringToPath(ring, project))
      .join(' ');
  }

  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates ?? [])
      .flatMap((polygon) =>
        (polygon ?? []).map((ring) => ringToPath(ring, project))
      )
      .join(' ');
  }

  return '';
}

function quantile(sortedValues, q) {
  if (!sortedValues.length) return 0;

  const position = (sortedValues.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;

  const next = sortedValues[base + 1];

  if (next === undefined) {
    return sortedValues[base];
  }

  return sortedValues[base] + rest * (next - sortedValues[base]);
}

function buildMapScale(values) {
  const positive = values
    .map((x) => Number(x?.value ?? 0))
    .filter((x) => Number.isFinite(x) && x > 0)
    .sort((a, b) => a - b);

  const colors = [
    '#f3e5ea',
    '#dfb9c8',
    '#c989a4',
    '#a94f75',
    '#781b49',
  ];

  if (!positive.length) {
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

function getMapColor(value, scale) {
  const number = Number(value ?? 0);

  if (!Number.isFinite(number) || number <= 0) {
    return '#eef1f4';
  }

  const [b1, b2, b3, b4] = scale.breaks;

  if (number <= b1) return scale.colors[0];
  if (number <= b2) return scale.colors[1];
  if (number <= b3) return scale.colors[2];
  if (number <= b4) return scale.colors[3];

  return scale.colors[4];
}

function formatLegendNumber(value) {
  if (!Number.isFinite(value)) return '0';

  if (value < 10) {
    return String(Math.max(1, Math.round(value)));
  }

  return Math.round(value).toLocaleString('es-MX');
}

function MunicipalChoropleth({
  municipiosGeo,
  estadosGeo,
  municipalValues,
  entityCode,
}) {
  const valueByCvegeo = useMemo(() => {
    return new Map(
      (municipalValues ?? []).map((item) => [
        String(item.cvegeo),
        Number(item.value ?? 0),
      ])
    );
  }, [municipalValues]);

  const allMunicipalFeatures = municipiosGeo?.features ?? [];
  const allStateFeatures = estadosGeo?.features ?? [];

  const visibleMunicipalFeatures = useMemo(() => {
    if (!entityCode) return allMunicipalFeatures;

    return allMunicipalFeatures.filter(
      (feature) =>
        String(feature?.properties?.cve_ent ?? '').padStart(2, '0') ===
        entityCode
    );
  }, [allMunicipalFeatures, entityCode]);

  const visibleStateFeatures = useMemo(() => {
    if (!entityCode) return allStateFeatures;

    return allStateFeatures.filter(
      (feature) =>
        String(feature?.properties?.cve_ent ?? '').padStart(2, '0') ===
        entityCode
    );
  }, [allStateFeatures, entityCode]);

  const projection = useMemo(
    () => createProjection(visibleMunicipalFeatures),
    [visibleMunicipalFeatures]
  );

  const scale = useMemo(
    () => buildMapScale(municipalValues ?? []),
    [municipalValues]
  );

  const legend = useMemo(() => {
    const [b1, b2, b3, b4] = scale.breaks;

    return [
      {
        color: '#eef1f4',
        label: '0',
      },
      {
        color: scale.colors[0],
        label: `1–${formatLegendNumber(b1)}`,
      },
      {
        color: scale.colors[1],
        label: `${formatLegendNumber(b1 + 1)}–${formatLegendNumber(b2)}`,
      },
      {
        color: scale.colors[2],
        label: `${formatLegendNumber(b2 + 1)}–${formatLegendNumber(b3)}`,
      },
      {
        color: scale.colors[3],
        label: `${formatLegendNumber(b3 + 1)}–${formatLegendNumber(b4)}`,
      },
      {
        color: scale.colors[4],
        label: `>${formatLegendNumber(b4)}`,
      },
    ];
  }, [scale]);

  if (!municipiosGeo || !estadosGeo) {
    return (
      <div style={styles.mapLoading}>
        Cargando geometría municipal...
      </div>
    );
  }

  return (
    <div style={styles.municipalMapWrap}>
      <svg
        viewBox="0 0 1000 600"
        role="img"
        aria-label="Mapa municipal de casos"
        style={styles.municipalSvg}
      >
        <rect
          x="0"
          y="0"
          width="1000"
          height="600"
          fill="#ffffff"
        />

        <g>
          {visibleMunicipalFeatures.map((feature) => {
            const cvegeo = String(feature?.properties?.cvegeo ?? '');
            const value = valueByCvegeo.get(cvegeo) ?? 0;

            const municipio =
              feature?.properties?.municipio ??
              feature?.properties?.nomgeo ??
              '';

            const entidad =
              feature?.properties?.entidad ?? '';

            return (
              <path
                key={cvegeo}
                d={geometryToPath(feature.geometry, projection)}
                fill={getMapColor(value, scale)}
                fillRule="evenodd"
                stroke="#ffffff"
                strokeWidth="0.45"
                vectorEffect="non-scaling-stroke"
              >
                <title>
                  {`${entidad} — ${municipio}\nCVEGEO: ${cvegeo}\nCasos acumulados: ${Number(
                    value
                  ).toLocaleString('es-MX')}`}
                </title>
              </path>
            );
          })}
        </g>

        <g pointerEvents="none">
          {visibleStateFeatures.map((feature, index) => (
            <path
              key={
                feature?.properties?.cve_ent ??
                feature?.properties?.entidad ??
                index
              }
              d={geometryToPath(feature.geometry, projection)}
              fill="none"
              stroke="#4b5563"
              strokeWidth="1.25"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
      </svg>

      <div style={styles.mapLegend}>
        <div style={styles.mapLegendTitle}>
          Casos acumulados
        </div>

        <div style={styles.mapLegendItems}>
          {legend.map((item, index) => (
            <div
              key={`${item.label}-${index}`}
              style={styles.mapLegendItem}
            >
              <span
                style={{
                  ...styles.mapLegendSwatch,
                  background: item.color,
                }}
              />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// APP
// =============================================================================

function App() {
  const {
    manifest,
    coreMap,
    loadingInitial,
    error: loadingError,
  } = useDashboardData();

  const [evento, setEvento] = useState('TODOS');
  const [tipo, setTipo] = useState('TODOS');
  const [categoria, setCategoria] = useState('TODAS');
  const [entidad, setEntidad] = useState('NACIONAL');

  const [medida, setMedida] = useState('incidencia');
  const [fecha, setFecha] = useState('');

  const [categoryMap, setCategoryMap] = useState(null);
  const [loadingCategoryMap, setLoadingCategoryMap] = useState(false);
  const [categoryError, setCategoryError] = useState(null);

  // ---------------------------------------------------------------------------
  // MUNICIPAL
  // ---------------------------------------------------------------------------

  const [municipalManifest, setMunicipalManifest] = useState(null);
  const [municipalCore, setMunicipalCore] = useState(null);
  const [municipalCategoryMap, setMunicipalCategoryMap] = useState(null);
  const [municipiosGeo, setMunicipiosGeo] = useState(null);
  const [estadosGeo, setEstadosGeo] = useState(null);
  const [municipalLoading, setMunicipalLoading] = useState(true);
  const [municipalError, setMunicipalError] = useState(null);

  useEffect(() => {
    let active = true;

    async function cargarMunicipalBase() {
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

        if (!active) return;

        setMunicipalManifest(manifestData);
        setMunicipalCore(coreData);
        setMunicipiosGeo(municipiosData);
        setEstadosGeo(estadosData);
      } catch (err) {
        if (!active) return;
        setMunicipalError(err);
      } finally {
        if (active) {
          setMunicipalLoading(false);
        }
      }
    }

    cargarMunicipalBase();

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

    return Array.isArray(coreMap.indexes.dates)
      ? coreMap.indexes.dates
      : Object.values(coreMap.indexes.dates);
  }, [coreMap]);

  const entidades = useMemo(() => {
    if (!coreMap?.indexes?.entities) {
      return [];
    }

    return Array.isArray(coreMap.indexes.entities)
      ? coreMap.indexes.entities
      : Object.values(coreMap.indexes.entities);
  }, [coreMap]);

  const combosCore = useMemo(() => {
    if (!coreMap?.indexes?.combos) {
      return [];
    }

    return Array.isArray(coreMap.indexes.combos)
      ? coreMap.indexes.combos
      : Object.values(coreMap.indexes.combos);
  }, [coreMap]);

  // ===========================================================================
  // FECHA INICIAL = ÚLTIMA FECHA DISPONIBLE
  // ===========================================================================

  useEffect(() => {
    if (fechas.length > 0 && !fecha) {
      setFecha(fechas[fechas.length - 1]);
    }
  }, [fechas, fecha]);

  // ===========================================================================
  // EVENTOS
  // ===========================================================================

  const eventos = useMemo(() => {
    const valores = combosCore
      .filter((x) => x.nivel === 'evento')
      .map((x) => x.evento)
      .filter((x) => x && x !== 'TODOS');

    return ['TODOS', ...Array.from(new Set(valores))];
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
      .filter((x) => x && x !== 'TODOS');

    return ['TODOS', ...Array.from(new Set(valores))];
  }, [combosCore, evento]);

  // ===========================================================================
  // CARGAR MAPAS DE CATEGORÍA ESTATAL + MUNICIPAL
  // ===========================================================================

  useEffect(() => {
    let active = true;

    async function cargar() {
      if (tipo === 'TODOS') {
        setCategoryMap(null);
        setMunicipalCategoryMap(null);
        setCategoria('TODAS');
        setCategoryError(null);
        return;
      }

      try {
        setLoadingCategoryMap(true);
        setCategoryError(null);

        const [stateCategoryData, municipalCategoryData] =
          await Promise.all([
            loadCategoryMap(tipo),
            loadMunicipalCategoryMap(tipo),
          ]);

        if (!active) {
          return;
        }

        setCategoryMap(stateCategoryData);
        setMunicipalCategoryMap(municipalCategoryData);
        setCategoria('TODAS');
      } catch (err) {
        if (!active) {
          return;
        }

        setCategoryMap(null);
        setMunicipalCategoryMap(null);
        setCategoryError(err);
      } finally {
        if (active) {
          setLoadingCategoryMap(false);
        }
      }
    }

    cargar();

    return () => {
      active = false;
    };
  }, [tipo]);

  // ===========================================================================
  // CATEGORÍAS
  // ===========================================================================

  const categorias = useMemo(() => {
    if (tipo === 'TODOS' || !categoryMap) {
      return ['TODAS'];
    }

    const combos = Array.isArray(categoryMap?.indexes?.combos)
      ? categoryMap.indexes.combos
      : Object.values(categoryMap?.indexes?.combos ?? {});

    const valores = combos
      .filter(
        (x) =>
          x.nivel === 'categoria' &&
          x.tipo === tipo
      )
      .map((x) => x.categoria)
      .filter((x) => x && x !== 'TODAS');

    return ['TODAS', ...Array.from(new Set(valores))];
  }, [categoryMap, tipo]);

  // ===========================================================================
  // DEFINIR NIVEL ESTATAL
  // ===========================================================================

  const consulta = useMemo(() => {
    if (categoria !== 'TODAS' && tipo !== 'TODOS') {
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
  // DEFINIR NIVEL MUNICIPAL
  // ===========================================================================

  const consultaMunicipal = useMemo(() => {
    if (categoria !== 'TODAS' && tipo !== 'TODOS') {
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
  // ENTIDAD -> CVE_ENT PARA ENFOQUE MUNICIPAL
  // ===========================================================================

  const entidadCodigoMunicipal = useMemo(() => {
    if (entidad === 'NACIONAL' || !municipiosGeo?.features) {
      return null;
    }

    const wanted = normalizeKey(entidad);

    const match = municipiosGeo.features.find((feature) => {
      const entityName = normalizeKey(feature?.properties?.entidad);

      if (entityName === wanted) return true;

      if (
        wanted === 'MICHOACAN DE OCAMPO' &&
        entityName === 'MICHOACAN'
      ) {
        return true;
      }

      if (
        wanted === 'CIUDAD DE MEXICO' &&
        ['CDMX', 'DISTRITO FEDERAL'].includes(entityName)
      ) {
        return true;
      }

      return false;
    });

    if (!match) return null;

    return String(match?.properties?.cve_ent ?? '').padStart(2, '0');
  }, [entidad, municipiosGeo]);

  // ===========================================================================
  // MÉTRICA ESTATAL
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
  // KPI ESTATAL
  // ===========================================================================

  const valorConteo = useMemo(() => {
    if (!consulta.mapData || !fecha) {
      return null;
    }

    return getMapValue({
      mapData: consulta.mapData,
      date: fecha,
      entity: entidad,
      event: evento,
      type: tipo,
      category: categoria,
      level: consulta.level,
      metric: metricaConteo,
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

  const valorTasa = useMemo(() => {
    if (!consulta.mapData || !fecha) {
      return null;
    }

    return getMapValue({
      mapData: consulta.mapData,
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
  // VALORES ESTATALES
  // ===========================================================================

  const valoresMapa = useMemo(() => {
    if (!consulta.mapData || !fecha) {
      return [];
    }

    return getMapEntityValues({
      mapData: consulta.mapData,
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

  const topEntidades = useMemo(() => {
    return [...valoresMapa]
      .filter(
        (x) =>
          x.value !== null &&
          x.value !== undefined
      )
      .sort(
        (a, b) =>
          Number(b.value) -
          Number(a.value)
      )
      .slice(0, 10);
  }, [valoresMapa]);

  // ===========================================================================
  // VALORES MUNICIPALES
  // ===========================================================================

  const valoresMunicipales = useMemo(() => {
    if (!consultaMunicipal.mapData || !fecha) {
      return [];
    }

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
  }, [
    consultaMunicipal,
    fecha,
    evento,
    tipo,
    categoria,
    entidadCodigoMunicipal,
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
        <h1>Cargando tablero...</h1>
        <p>Preparando los datos validados.</p>
      </div>
    );
  }

  if (loadingError) {
    return (
      <div style={styles.estado}>
        <h1>Error al cargar los datos</h1>
        <pre>{loadingError.message}</pre>
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
          <div style={styles.supraTitle}>
            Vigilancia epidemiológica
          </div>

          <h1 style={styles.title}>
            Accidentes y lesiones
          </h1>
        </div>

        <div style={styles.headerInfo}>
          Datos acumulados al{' '}
          <strong>{fecha || '—'}</strong>
        </div>
      </header>

      <main style={styles.main}>
        {/* ============================================================= */}
        {/* FILTROS */}
        {/* ============================================================= */}

        <aside style={styles.sidebar}>
          <h2 style={styles.sectionTitle}>
            Filtros
          </h2>

          <label style={styles.label}>
            Evento
          </label>

          <select
            value={evento}
            onChange={(e) =>
              cambiarEvento(e.target.value)
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
            disabled={evento === 'TODOS'}
            onChange={(e) =>
              cambiarTipo(e.target.value)
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
              setCategoria(e.target.value)
            }
            style={styles.select}
          >
            {categorias.map((x) => (
              <option
                key={x}
                value={x}
              >
                {x}
              </option>
            ))}
          </select>

          {loadingCategoryMap && (
            <div style={styles.note}>
              Cargando categorías...
            </div>
          )}

          {categoryError && (
            <div style={styles.errorText}>
              {categoryError.message}
            </div>
          )}

          <label style={styles.label}>
            Entidad
          </label>

          <select
            value={entidad}
            onChange={(e) =>
              setEntidad(e.target.value)
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

          <div style={styles.geoFilterNote}>
            El filtro Entidad enfoca el mapa a los
            municipios de ocurrencia de esa entidad.
          </div>
        </aside>

        {/* ============================================================= */}
        {/* CENTRO */}
        {/* ============================================================= */}

        <section style={styles.center}>
          <div style={styles.panel}>
            <div style={styles.panelHeader}>
              <div>
                <h2 style={styles.sectionTitle}>
                  Mapa municipal de ocurrencia
                </h2>

                <div style={styles.note}>
                  Conteo acumulado de casos georreferenciables.
                  La tasa municipal no está disponible.
                </div>
              </div>

              <div style={styles.badge}>
                Conteo de casos
              </div>
            </div>

            {municipalLoading ? (
              <div style={styles.mapLoading}>
                Cargando mapa municipal...
              </div>
            ) : municipalError ? (
              <div style={styles.mapError}>
                <strong>
                  No fue posible cargar el mapa municipal.
                </strong>
                <div>
                  {municipalError.message}
                </div>
              </div>
            ) : (
              <MunicipalChoropleth
                municipiosGeo={municipiosGeo}
                estadosGeo={estadosGeo}
                municipalValues={valoresMunicipales}
                entityCode={entidadCodigoMunicipal}
              />
            )}

            <div style={styles.mapFootnote}>
              La escala de color corresponde exclusivamente a
              intervalos de visualización del conteo seleccionado.
              Municipios sin casos se muestran en gris.
            </div>
          </div>

          <div style={styles.panel}>
            <h2 style={styles.sectionTitle}>
              Verificación por entidad
            </h2>

            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>
                      Entidad
                    </th>

                    <th style={styles.thRight}>
                      Tasa acumulada
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {topEntidades.map((item) => (
                    <tr
                      key={item.entity}
                    >
                      <td style={styles.td}>
                        {item.entity}
                      </td>

                      <td style={styles.tdRight}>
                        {Number(item.value).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ============================================================= */}
        {/* PANEL DERECHO */}
        {/* ============================================================= */}

        <aside style={styles.rightPanel}>
          <div style={styles.panel}>
            <h2 style={styles.sectionTitle}>
              Medida estatal
            </h2>

            <div style={styles.measureButtons}>
              <button
                type="button"
                onClick={() =>
                  setMedida('incidencia')
                }
                style={
                  medida === 'incidencia'
                    ? styles.buttonActive
                    : styles.button
                }
              >
                Incidencia
              </button>

              <button
                type="button"
                onClick={() =>
                  setMedida('mortalidad')
                }
                style={
                  medida === 'mortalidad'
                    ? styles.buttonActive
                    : styles.button
                }
              >
                Mortalidad
              </button>
            </div>

            <div style={styles.measureNote}>
              Esta selección modifica el KPI y la tabla
              estatales. El mapa municipal permanece en
              conteo de casos.
            </div>
          </div>

          <div style={styles.kpi}>
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
                  ).toLocaleString('es-MX')}
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

          <div style={styles.panel}>
            <h2 style={styles.sectionTitle}>
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
                      fechas.length - 1
                    ]
                  : undefined
              }
              onChange={(e) =>
                setFecha(e.target.value)
              }
              style={styles.dateInput}
            />

            <div style={styles.note}>
              Periodo disponible:
              <br />

              {fechas.length > 0
                ? `${fechas[0]} a ${
                    fechas[
                      fechas.length - 1
                    ]
                  }`
                : '—'}
            </div>
          </div>

          <div style={styles.panel}>
            <h2 style={styles.sectionTitle}>
              Selección actual
            </h2>

            <div style={styles.selectionRow}>
              <strong>Evento:</strong>
              <span>{evento}</span>
            </div>

            <div style={styles.selectionRow}>
              <strong>Tipo:</strong>
              <span>{tipo}</span>
            </div>

            <div style={styles.selectionRow}>
              <strong>Categoría:</strong>
              <span>{categoria}</span>
            </div>

            <div style={styles.selectionRow}>
              <strong>Entidad:</strong>
              <span>{entidad}</span>
            </div>

            <div style={styles.selectionRow}>
              <strong>Mapa municipal:</strong>
              <span>
                {municipalManifest?.medida?.nombre ??
                  'CONTEO DE CASOS'}
              </span>
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
    borderBottom: '1px solid #d8dee6',
    padding: '18px 28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '20px',
  },

  supraTitle: {
    fontSize: '13px',
    textTransform: 'uppercase',
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
    border: '1px solid #d8dee6',
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
    border: '1px solid #d8dee6',
    borderRadius: '10px',
    padding: '18px',
  },

  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
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
    border: '1px solid #cbd5e1',
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

  geoFilterNote: {
    marginTop: '18px',
    paddingTop: '12px',
    borderTop: '1px solid #eef2f6',
    fontSize: '11px',
    lineHeight: 1.45,
    color: '#667085',
  },

  errorText: {
    marginTop: '8px',
    fontSize: '12px',
    color: '#b42318',
  },

  badge: {
    fontSize: '12px',
    fontWeight: 700,
    border: '1px solid #cbd5e1',
    borderRadius: '999px',
    padding: '6px 10px',
    whiteSpace: 'nowrap',
  },

  municipalMapWrap: {
    position: 'relative',
    marginTop: '14px',
    minHeight: '390px',
    border: '1px solid #d8dee6',
    borderRadius: '10px',
    overflow: 'hidden',
    background: '#ffffff',
  },

  municipalSvg: {
    display: 'block',
    width: '100%',
    height: 'auto',
    minHeight: '390px',
  },

  mapLegend: {
    position: 'absolute',
    left: '14px',
    bottom: '14px',
    background: 'rgba(255,255,255,0.94)',
    border: '1px solid #d8dee6',
    borderRadius: '8px',
    padding: '9px 10px',
    boxShadow: '0 2px 8px rgba(15,23,42,0.08)',
  },

  mapLegendTitle: {
    fontSize: '11px',
    fontWeight: 700,
    marginBottom: '6px',
  },

  mapLegendItems: {
    display: 'grid',
    gap: '4px',
  },

  mapLegendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '10px',
    color: '#475467',
  },

  mapLegendSwatch: {
    display: 'inline-block',
    width: '15px',
    height: '10px',
    border: '1px solid rgba(31,41,55,0.12)',
  },

  mapLoading: {
    minHeight: '390px',
    marginTop: '14px',
    border: '1px solid #d8dee6',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#667085',
    fontSize: '13px',
  },

  mapError: {
    minHeight: '180px',
    marginTop: '14px',
    border: '1px solid #f1b5ad',
    borderRadius: '10px',
    background: '#fff7f6',
    padding: '18px',
    color: '#b42318',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    justifyContent: 'center',
  },

  mapFootnote: {
    marginTop: '9px',
    fontSize: '11px',
    lineHeight: 1.45,
    color: '#667085',
  },

  measureButtons: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
  },

  measureNote: {
    marginTop: '10px',
    fontSize: '11px',
    color: '#667085',
    lineHeight: 1.4,
  },

  button: {
    minHeight: '38px',
    border: '1px solid #cbd5e1',
    background: '#ffffff',
    borderRadius: '7px',
    cursor: 'pointer',
  },

  buttonActive: {
    minHeight: '38px',
    border: '1px solid #344054',
    background: '#344054',
    color: '#ffffff',
    borderRadius: '7px',
    cursor: 'pointer',
  },

  kpi: {
    background: '#ffffff',
    border: '1px solid #d8dee6',
    borderRadius: '10px',
    padding: '20px',
    textAlign: 'center',
  },

  kpiLabel: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#667085',
    textTransform: 'uppercase',
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
    border: '1px solid #cbd5e1',
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
    borderBottom: '1px solid #eef2f6',
  },

  tableWrapper: {
    overflowX: 'auto',
  },

  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },

  th: {
    textAlign: 'left',
    borderBottom: '1px solid #d8dee6',
    padding: '9px',
  },

  thRight: {
    textAlign: 'right',
    borderBottom: '1px solid #d8dee6',
    padding: '9px',
  },

  td: {
    padding: '8px 9px',
    borderBottom: '1px solid #eef2f6',
  },

  tdRight: {
    padding: '8px 9px',
    borderBottom: '1px solid #eef2f6',
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  },

  estado: {
    padding: '40px',
    fontFamily: 'Arial, Helvetica, sans-serif',
  },
};

export default App;
