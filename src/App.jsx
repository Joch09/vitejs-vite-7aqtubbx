import { useEffect, useMemo, useState } from 'react';

import { useDashboardData } from './hooks/useDashboardData';

import {
  getMapEntityValues,
  getMapValue,
  loadCategoryMap,
} from './data/dashboardData';

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

    return [
      'TODOS',
      ...Array.from(new Set(valores)),
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
      .filter((x) => x && x !== 'TODOS');

    return [
      'TODOS',
      ...Array.from(new Set(valores)),
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

        const data = await loadCategoryMap(tipo);

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
  // CATEGORÍAS DEL TIPO
  // ===========================================================================

  const categorias = useMemo(() => {
    if (tipo === 'TODOS' || !categoryMap) {
      return ['TODAS'];
    }

    const combos = Array.isArray(
      categoryMap?.indexes?.combos
    )
      ? categoryMap.indexes.combos
      : Object.values(
          categoryMap?.indexes?.combos ?? {}
        );

    const valores = combos
      .filter(
        (x) =>
          x.nivel === 'categoria' &&
          x.tipo === tipo
      )
      .map((x) => x.categoria)
      .filter(
        (x) =>
          x &&
          x !== 'TODAS'
      );

    return [
      'TODAS',
      ...Array.from(new Set(valores)),
    ];
  }, [categoryMap, tipo]);

  // ===========================================================================
  // DEFINIR QUÉ NIVEL Y QUÉ JSON CONSULTAR
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
  // VALORES POR ENTIDAD PARA FUTURO MAPA
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

  // ===========================================================================
  // TOP PROVISIONAL PARA VALIDAR EL MAPA
  // ===========================================================================

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
  // CAMBIOS DE FILTROS
  // ===========================================================================

  function cambiarEvento(value) {
    setEvento(value);
    setTipo('TODOS');
    setCategoria('TODAS');
    setCategoryMap(null);
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
        <pre>
          {loadingError.message}
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
            <div style={styles.panelHeader}>
              <div>
                <h2 style={styles.sectionTitle}>
                  Mapa de México
                </h2>

                <div style={styles.note}>
                  Vista provisional para validar
                  los datos por entidad.
                </div>
              </div>

              <div style={styles.badge}>
                {
                  medida ===
                  'incidencia'
                    ? 'Incidencia'
                    : 'Mortalidad'
                }
              </div>
            </div>

            <div style={styles.mapPlaceholder}>
              <div
                style={
                  styles.mapPlaceholderTitle
                }
              >
                MAPA
              </div>

              <div style={styles.note}>
                Aquí colocaremos el mapa
                coroplético de México en el
                siguiente bloque visual.
              </div>
            </div>
          </div>

          <div style={styles.panel}>
            <h2 style={styles.sectionTitle}>
              Verificación provisional por
              entidad
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
                  {topEntidades.map(
                    (item) => (
                      <tr
                        key={item.entity}
                      >
                        <td style={styles.td}>
                          {item.entity}
                        </td>

                        <td
                          style={
                            styles.tdRight
                          }
                        >
                          {Number(
                            item.value
                          ).toFixed(2)}
                        </td>
                      </tr>
                    )
                  )}
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
              Medida
            </h2>

            <div style={styles.measureButtons}>
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
            <div style={styles.kpiLabel}>
              {medida ===
              'incidencia'
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
                setFecha(
                  e.target.value
                )
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
              <strong>
                Categoría:
              </strong>
              <span>{categoria}</span>
            </div>

            <div style={styles.selectionRow}>
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
// ESTILOS PROVISIONALES
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
    margin:
      '0 0 14px 0',
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

  mapPlaceholder: {
    minHeight: '390px',
    marginTop: '14px',
    border:
      '2px dashed #cbd5e1',
    borderRadius: '10px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center',
    padding: '20px',
    boxSizing: 'border-box',
  },

  mapPlaceholderTitle: {
    fontSize: '42px',
    fontWeight: 700,
    color: '#cbd5e1',
    marginBottom: '10px',
  },

  measureButtons: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
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
    padding:
      '8px 0',
    borderBottom:
      '1px solid #eef2f6',
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