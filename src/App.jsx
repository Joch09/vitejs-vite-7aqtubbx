import { useEffect, useMemo, useState } from 'react';

// V10.1.0: selector multianual 2025/2026 y periodos desde catálogo.

import logoImssBienestar from './assets/logos/logo_imss_bienestar.png';
import logoCoordinacion from './assets/logos/logo_coordinacion_epidemiologia.png';
import logoVigilancia from './assets/logos/logo_vigilancia_epidemiologica.png';
import munecoAreaAnatomica from './assets/muneco_area_anatomica.png';

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
// ACCESO BÁSICO AL TABLERO
// =============================================================================
// Accesos de revisión. Las contraseñas no se almacenan en texto plano:
// únicamente se conservan sus hashes SHA-256 para validar en el navegador.
const ACCESS_ACCOUNTS = [
  {
    user: 'IMSSBNC001',
    passwordSha256: '7557e4ea06dcade4f47aa1ec2ad67cacd4f9577f80f2f95983fefe2c76cbbe3e',
  },
  {
    user: 'frida.sanchez',
    passwordSha256: 'bd0370be2bd69aae188c3ff3961ae71c7345108c361a14aa70001a501f7f327f',
  },
];
const ACCESS_SESSION_KEY = 'accidentes_lesiones_access';

async function sha256(value) {
  const encoded = new TextEncoder().encode(value);
  const digest = await window.crypto.subtle.digest('SHA-256', encoded);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function LoginScreen({ onLogin }) {
  const [usuario, setUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState('');
  const [validando, setValidando] = useState(false);

  async function ingresar(event) {
    event.preventDefault();
    setError('');
    setValidando(true);

    try {
      const passwordHash = await sha256(contrasena);
      const usuarioNormalizado = usuario.trim();
      const accesoCorrecto = ACCESS_ACCOUNTS.some(
        (account) =>
          account.user === usuarioNormalizado &&
          account.passwordSha256 === passwordHash
      );

      if (!accesoCorrecto) {
        setError('Usuario o contraseña incorrectos.');
        setContrasena('');
        return;
      }

      window.sessionStorage.setItem(ACCESS_SESSION_KEY, usuarioNormalizado);
      onLogin();
    } catch (err) {
      console.error('No fue posible validar el acceso:', err);
      setError('No fue posible validar el acceso. Intenta nuevamente.');
    } finally {
      setValidando(false);
    }
  }

  return (
    <div style={styles.loginPage}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800&display=swap');
        html, body, #root {
          width: 100%;
          min-width: 320px;
          min-height: 100%;
          margin: 0;
          padding: 0;
        }
        body {
          min-height: 100vh;
          background: #f1f1f1;
        }
        *, *::before, *::after {
          box-sizing: border-box;
        }
        html, body, #root, #root *, button, input {
          font-family: 'Noto Sans', Arial, Helvetica, sans-serif;
        }
      `}</style>

      <header style={styles.loginInstitutionalHeader}>
        <img
          src={logoImssBienestar}
          alt="IMSS Bienestar Servicios Públicos de Salud"
          style={styles.loginLogoImss}
        />

        <div style={styles.loginBrandRight}>
          <img
            src={logoCoordinacion}
            alt="Coordinación de Epidemiología"
            style={styles.loginLogoCoordinacion}
          />
          <div style={styles.loginVerticalDivider} />
          <img
            src={logoVigilancia}
            alt="Vigilancia Epidemiológica"
            style={styles.loginLogoVigilancia}
          />
        </div>
      </header>

      <main style={styles.loginMain}>
        <form style={styles.loginCard} onSubmit={ingresar}>
          <div style={styles.loginEyebrow}>ACCESO RESTRINGIDO</div>
          <h1 style={styles.loginTitle}>
            Vigilancia epidemiológica de accidentes y lesiones
          </h1>
          <p style={styles.loginSubtitle}>
            Ingrese las credenciales autorizadas para consultar el tablero.
          </p>

          <label style={styles.loginLabel} htmlFor="usuario-tablero">
            Usuario
          </label>
          <input
            id="usuario-tablero"
            type="text"
            autoComplete="username"
            value={usuario}
            onChange={(event) => setUsuario(event.target.value)}
            style={styles.loginInput}
            disabled={validando}
            required
          />

          <label style={styles.loginLabel} htmlFor="contrasena-tablero">
            Contraseña
          </label>
          <input
            id="contrasena-tablero"
            type="password"
            autoComplete="current-password"
            value={contrasena}
            onChange={(event) => setContrasena(event.target.value)}
            style={styles.loginInput}
            disabled={validando}
            required
          />

          {error && <div style={styles.loginError}>{error}</div>}

          <button
            type="submit"
            style={styles.loginButton}
            disabled={validando}
          >
            {validando ? 'Validando...' : 'Ingresar'}
          </button>

          <div style={styles.loginFootnote}>
            Uso exclusivo para personal autorizado.
          </div>
        </form>
      </main>
    </div>
  );
}

// =============================================================================
// PERIODOS TEMPORALES - PRODUCCIÓN V9
// =============================================================================
//
// Los cuatro modos consultan directamente los productos regenerados por
// FechaOcurrencia. Día, mes y semana son excluyentes; trimestre es acumulado.
//
// El calendario epidemiológico y las opciones de periodo se leen directamente
// de 01_catalogos.json para el año activo. Esto permite incorporar nuevos años
// sin volver a codificar meses, semanas o trimestres en React.
//
// Distribuciones complementarias conservadas en código, ocultas en UI.
// Cambiar a true si se requiere reactivarlas posteriormente.
const MOSTRAR_DISTRIBUCIONES_COMPLEMENTARIAS = false;

const ANIOS_DISPONIBLES = ['2026', '2025'];

function periodArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function formatPeriodDate(value) {
  const match = String(value ?? '').match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);
  if (!match) return String(value ?? '');

  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  );

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
  })
    .format(date)
    .replace('.', '');
}

function formatPeriodRange(item) {
  const start = formatPeriodDate(item?.inicio);
  const end = formatPeriodDate(item?.fin);
  return start && end ? `${start} – ${end}` : '—';
}

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

const MORTALITY_PROFILES_URL =
  '/data/mortalidad/00_profiles.json';

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

function getBulletNarrativePrefix(item) {
  const id = getBulletId(item);
  const indicador = normalizeText(
    item?.indicador ?? ''
  ).toLowerCase();

  if (
    id === 'sospecha_alcohol_agresor' ||
    (
      indicador.includes('alcohol') &&
      indicador.includes('agresor')
    )
  ) {
    return 'En el';
  }

  return null;
}

function buildTreemapLayout(
  items,
  x = 0,
  y = 0,
  width = 100,
  height = 100
) {
  const validItems = Array.isArray(items)
    ? items
        .filter(
          (item) =>
            Number.isFinite(
              Number(item?.value)
            ) &&
            Number(item?.value) > 0
        )
        .map((item) => ({
          ...item,
          value: Number(item.value),
        }))
        .sort(
          (a, b) =>
            b.value - a.value
        )
    : [];

  if (validItems.length === 0) {
    return [];
  }

  const total = validItems.reduce(
    (sum, item) =>
      sum + item.value,
    0
  );

  if (!(total > 0)) {
    return [];
  }

  // Para favorecer la legibilidad, distribuimos el treemap en filas
  // de 2 o 3 elementos. El área de cada bloque sigue siendo exactamente
  // proporcional a su porcentaje, pero evitamos las tiras ultradelgadas
  // que dificultaban mostrar nombre y valor.
  const rowSizes = [];
  let remaining =
    validItems.length;

  if (remaining <= 3) {
    rowSizes.push(remaining);
  } else {
    rowSizes.push(2);
    remaining -= 2;

    while (remaining > 0) {
      if (remaining <= 3) {
        rowSizes.push(remaining);
        remaining = 0;
      } else if (remaining === 4) {
        rowSizes.push(2, 2);
        remaining = 0;
      } else if (remaining === 5) {
        rowSizes.push(2, 3);
        remaining = 0;
      } else {
        rowSizes.push(3);
        remaining -= 3;
      }
    }
  }

  const rows = [];
  let cursor = 0;

  rowSizes.forEach(
    (size) => {
      if (size > 0) {
        rows.push(
          validItems.slice(
            cursor,
            cursor + size
          )
        );
        cursor += size;
      }
    }
  );

  const result = [];
  let currentY = y;

  rows.forEach(
    (row, rowIndex) => {
      const rowTotal =
        row.reduce(
          (sum, item) =>
            sum + item.value,
          0
        );

      const isLastRow =
        rowIndex ===
        rows.length - 1;

      const rowHeight =
        isLastRow
          ? y + height - currentY
          : height *
            (rowTotal / total);

      let currentX = x;

      row.forEach(
        (item, itemIndex) => {
          const isLastItem =
            itemIndex ===
            row.length - 1;

          const itemWidth =
            isLastItem
              ? x + width - currentX
              : width *
                (item.value /
                  rowTotal);

          result.push({
            ...item,
            x: currentX,
            y: currentY,
            width: itemWidth,
            height: rowHeight,
          });

          currentX += itemWidth;
        }
      );

      currentY += rowHeight;
    }
  );

  return result;
}

function getBulletNarrative(item) {
  if (item?.modo === 'nominal') {
    return null;
  }

  const id = getBulletId(item);
  const indicador = normalizeText(
    item?.indicador ?? ''
  ).toLowerCase();

  if (
    id === 'no_uso_equipo_seguridad' ||
    indicador.includes('equipo de seguridad')
  ) {
    return 'no usaban equipo de seguridad.';
  }

  if (
    id === 'sospecha_alcohol_agresor' ||
    (
      indicador.includes('alcohol') &&
      indicador.includes('agresor')
    )
  ) {
    return 'el agresor consumió alcohol.';
  }

  if (
    id === 'sospecha_consumo_alcohol' ||
    indicador.includes('consumo de alcohol') ||
    indicador.includes('alcohol')
  ) {
    return 'consumió alcohol.';
  }

  if (
    (
      indicador.includes('discapacidad') &&
      indicador.includes('preexistente')
    ) ||
    id === 'discapacidad_preexistente' ||
    id === 'discapacidad'
  ) {
    return 'con discapacidad preexistente.';
  }

  if (
    id === 'embarazo_o_puerperio' ||
    indicador.includes('embarazo') ||
    indicador.includes('puerperio')
  ) {
    return 'estaban embarazadas o en puerperio.';
  }

  if (
    id === 'agresion_repetida' ||
    indicador.includes('agresion repetida')
  ) {
    return 'fueron agresiones repetidas.';
  }

  if (
    indicador.includes('profilaxis') &&
    (
      indicador.includes('vih') ||
      indicador.includes('its')
    )
  ) {
    return 'recibió profilaxis para VIH u otras ITS.';
  }

  if (
    indicador.includes('anticoncepcion') &&
    indicador.includes('emergencia')
  ) {
    return 'recibió anticoncepción de emergencia.';
  }

  if (
    id === 'sospecha_consumo_sustancias_drogas' ||
    indicador.includes('otras drogas') ||
    indicador.includes('drogas')
  ) {
    return 'consumió otras sustancias.';
  }

  if (item?.indicador) {
    const frase = String(item.indicador)
      .trim()
      .replace(/:$/, '');

    if (frase) {
      return `${frase.charAt(0).toLowerCase()}${frase.slice(1)}.`;
    }
  }

  return null;
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

        <div style={styles.mapNotes}>
          <div style={styles.note}>
            {temporalMode === 'trimestre'
              ? `Tasa acumulada de ${valueNoun} · `
              : `Tasa de ${valueNoun} del periodo · `}
            <strong>{date || '—'}</strong>.
            {' '}Gris = sin denominador poblacional disponible.
          </div>

          <div style={styles.incidenceMapNote}>
            {measure === 'incidencia'
              ? 'Se incluyen casos que ocurrieron en entidades no concurrentes y que fueron atendidos en establecimientos de salud de IMSS-BIENESTAR.'
              : 'Se incluyen defunciones que ocurrieron en entidades no concurrentes y que fueron atendidas en establecimientos de salud de IMSS-BIENESTAR.'}
          </div>
        </div>
      </div>
    </div>
  );
}

function getMortalityBulletDisplayTitle(item, tipo, categoria) {
  const origen = String(item?.origen ?? '').trim();

  if (origen === 'lugar_cie') {
    return 'Principal lugar de ocurrencia:';
  }

  if (origen === 'cie_secundaria') {
    return 'Principal lesión asociada:';
  }

  if (tipo === 'Accidentes de transporte') {
    if (categoria === 'Peatones') {
      return 'Principal tipo de colisión:';
    }
    if (categoria === 'Bicicletas') {
      return 'Principal tipo de accidente:';
    }
    if (categoria === 'Motocicletas') {
      return 'Principal tipo de usuario:';
    }
    if (categoria === 'Vehículos de motor') {
      return 'Principal tipo de usuario o vehículo:';
    }
    return 'Principal tipo de transporte:';
  }

  if (tipo === 'Caídas') {
    return 'Principal mecanismo de caída:';
  }

  if (tipo === 'Fuerzas mecánicas y objetos') {
    if (categoria === 'Armas de fuego') {
      return 'Principal tipo de arma:';
    }
    return 'Principal mecanismo:';
  }

  if (tipo === 'Exposición a sustancias y energías') {
    if (categoria === 'Envenenamiento') {
      return 'Principal sustancia:';
    }
    if (categoria === 'Contacto con calor y sustancias calientes') {
      return 'Principal exposición:';
    }
    return 'Principal mecanismo:';
  }

  if (tipo === 'Armas de fuego y punzocortantes') {
    if (categoria === 'Armas de fuego') {
      return 'Principal tipo de arma:';
    }
    return 'Principal lugar de ocurrencia:';
  }

  if (tipo === 'Fuerza/contundente, maltrato y negligencia') {
    if (categoria === 'Negligencia y otros tipos de maltrato') {
      return 'Principal tipo de maltrato:';
    }
    return 'Principal mecanismo de agresión:';
  }

  if (tipo === 'Violencia sexual') {
    return 'Principal mecanismo:';
  }

  if (tipo === 'Otros mecanismos específicos') {
    if (String(categoria ?? '').startsWith('Sustancias')) {
      return 'Principal sustancia:';
    }
    return 'Principal exposición:';
  }

  if (tipo === 'Lesiones autoinfligidas') {
    if (categoria === 'Intoxicación') {
      return 'Principal sustancia:';
    }
    if (categoria === 'Por arma de fuego') {
      return 'Principal tipo de arma:';
    }
    if (categoria === 'Por colisión') {
      return 'Principal mecanismo de colisión:';
    }
    return 'Principal mecanismo:';
  }

  return 'Principal mecanismo:';
}

function formatProfilePercent(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '—';
  }

  return `${new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(number)}%`;
}

function AnatomicalBodyProfile({ items = [] }) {
  const itemsMap = useMemo(() => {
    const map = new Map();

    (Array.isArray(items) ? items : []).forEach((item) => {
      const id = String(item?.id ?? '').trim();
      const label = normalizeText(item?.etiqueta ?? '');

      if (id) {
        map.set(id, item);
      }

      if (label) {
        map.set(label, item);
      }
    });

    return map;
  }, [items]);

  const getItem = (id, label) =>
    itemsMap.get(id) ??
    itemsMap.get(normalizeText(label)) ??
    null;

  const slots = [
    {
      key: 'tronco',
      item: getItem('area_tronco', 'Tronco'),
      side: 'left',
      y: 33,
      line: { x1: 43, x2: 29 },
    },
    {
      key: 'multiples',
      item: getItem('area_multiples', 'Múltiples sitios'),
      side: 'left',
      y: 49,
      line: { x1: 43, x2: 29 },
    },
    {
      key: 'inferiores',
      item: getItem('area_inferiores', 'Extremidades inferiores'),
      side: 'left',
      y: 78,
      line: { x1: 44, x2: 29 },
    },
    {
      key: 'cabeza',
      item: getItem('area_cabeza', 'Cabeza y cuello'),
      side: 'right',
      y: 17,
      line: { x1: 56, x2: 71 },
    },
    {
      key: 'superiores',
      item: getItem('area_superiores', 'Extremidades superiores'),
      side: 'right',
      y: 38,
      line: { x1: 57, x2: 71 },
    },
    {
      key: 'pelvis',
      item: getItem('area_pelvis', 'Pelvis/Genitales'),
      side: 'right',
      y: 59,
      line: { x1: 55, x2: 71 },
    },
    {
      key: 'otros',
      item: getItem('area_otros', 'Otros'),
      side: 'right',
      y: 78,
      line: null,
    },
  ];

  return (
    <div style={styles.anatomicalFigure}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        style={styles.anatomicalConnectors}
      >
        <defs>
          <marker
            id="anatomical-arrow"
            markerWidth="5"
            markerHeight="5"
            refX="4.4"
            refY="2.5"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path
              d="M0,0 L5,2.5 L0,5 Z"
              fill="#8b8b8b"
            />
          </marker>
        </defs>

        {slots.map((slot) =>
          slot.line && slot.item ? (
            <g key={`line-${slot.key}`}>
              <line
                x1={slot.line.x1}
                y1={slot.y}
                x2={slot.line.x2}
                y2={slot.y}
                stroke="#8b8b8b"
                strokeWidth="0.8"
                vectorEffect="non-scaling-stroke"
                markerEnd="url(#anatomical-arrow)"
              />
              <circle
                cx={slot.line.x1}
                cy={slot.y}
                r="0.9"
                fill="#8b8b8b"
              />
            </g>
          ) : null
        )}
      </svg>

      <div style={styles.anatomicalBodyWrap}>
        <img
          src={munecoAreaAnatomica}
          alt="Esquema corporal"
          style={styles.anatomicalBodyImage}
        />
      </div>

      {slots.map((slot) => {
        if (!slot.item) {
          return null;
        }

        return (
          <div
            key={slot.key}
            style={{
              ...styles.anatomicalLabel,
              ...(slot.side === 'left'
                ? styles.anatomicalLabelLeft
                : styles.anatomicalLabelRight),
              top: `${slot.y}%`,
            }}
          >
            <div style={styles.anatomicalLabelText}>
              {slot.item.etiqueta}
            </div>
            <div style={styles.anatomicalLabelValue}>
              {formatProfilePercent(slot.item.value)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MortalityProfileBars({ items = [], compact = false }) {
  const itemsOrdenados = useMemo(
    () =>
      [...(Array.isArray(items) ? items : [])].sort(
        (a, b) =>
          (Number(b?.value) || 0) -
          (Number(a?.value) || 0)
      ),
    [items]
  );

  return (
    <div
      style={
        compact
          ? {
              ...styles.areaList,
              ...styles.mortalityOccupationList,
            }
          : styles.areaList
      }
    >
      {itemsOrdenados.map((item) => {
        const porcentaje = Number(item?.value) || 0;
        const ancho = `${Math.max(
          0,
          Math.min(100, porcentaje)
        )}%`;

        return (
          <div
            key={item?.etiqueta ?? item?.id}
            style={
              compact
                ? {
                    ...styles.areaRow,
                    ...styles.mortalityOccupationRow,
                  }
                : styles.areaRow
            }
          >
            <div
              style={
                compact
                  ? {
                      ...styles.areaTop,
                      ...styles.mortalityOccupationTop,
                    }
                  : styles.areaTop
              }
            >
              <span
                style={
                  compact
                    ? {
                        ...styles.areaLabel,
                        ...styles.mortalityOccupationLabel,
                      }
                    : styles.areaLabel
                }
              >
                {item?.etiqueta ?? '—'}
              </span>

              <strong
                style={
                  compact
                    ? {
                        ...styles.areaValue,
                        ...styles.mortalityOccupationValue,
                      }
                    : styles.areaValue
                }
              >
                {new Intl.NumberFormat('es-MX', {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 1,
                }).format(porcentaje)}%
              </strong>
            </div>

            <div
              style={
                compact
                  ? {
                      ...styles.areaTrack,
                      ...styles.mortalityOccupationTrack,
                    }
                  : styles.areaTrack
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
      })}
    </div>
  );
}


const MORTALITY_EDUCATION_COLORS = [
  '#5B162B',
  '#7B1E3A',
  '#98445D',
  '#B65F78',
  '#CE8195',
  '#DDA7B4',
  '#C2B2B7',
  '#E9D9DE',
];

function MortalityEducationPie({ items = [] }) {
  const slices = useMemo(() => {
    const normalizados = [...(Array.isArray(items) ? items : [])]
      .map((item) => ({
        ...item,
        value: Math.max(0, Number(item?.value) || 0),
      }))
      .sort((a, b) => b.value - a.value);

    const total = normalizados.reduce(
      (sum, item) => sum + item.value,
      0
    );

    let acumulado = 0;

    return normalizados.map((item, index) => {
      const startAngle =
        total > 0 ? (acumulado / total) * 360 : 0;

      acumulado += item.value;

      const endAngle =
        total > 0 ? (acumulado / total) * 360 : 0;

      return {
        ...item,
        color:
          MORTALITY_EDUCATION_COLORS[
            index % MORTALITY_EDUCATION_COLORS.length
          ],
        startAngle,
        endAngle,
      };
    });
  }, [items]);

  const positivos = slices.filter(
    (item) => item.value > 0
  );

  const polarPoint = (
    cx,
    cy,
    radius,
    angleDegrees
  ) => {
    const angle =
      ((angleDegrees - 90) * Math.PI) / 180;

    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  };

  const slicePath = (
    cx,
    cy,
    radius,
    startAngle,
    endAngle
  ) => {
    const start = polarPoint(
      cx,
      cy,
      radius,
      startAngle
    );

    const end = polarPoint(
      cx,
      cy,
      radius,
      endAngle
    );

    const largeArc =
      endAngle - startAngle > 180 ? 1 : 0;

    return [
      `M ${cx} ${cy}`,
      `L ${start.x} ${start.y}`,
      `A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`,
      'Z',
    ].join(' ');
  };

  const formatPercent = (value) =>
    `${new Intl.NumberFormat('es-MX', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }).format(value)}%`;

  return (
    <div style={styles.mortalityEducationPieWrap}>
      <div style={styles.mortalityEducationPieChart}>
        <svg
          viewBox="0 0 220 220"
          role="img"
          aria-label="Distribución porcentual de escolaridad"
          style={styles.mortalityEducationPieSvg}
        >
          {positivos.length === 1 ? (
            <circle
              cx="110"
              cy="110"
              r="94"
              fill={positivos[0].color}
              stroke="#ffffff"
              strokeWidth="2"
            >
              <title>
                {`${positivos[0]?.etiqueta ?? '—'}: ${formatPercent(
                  positivos[0].value
                )}`}
              </title>
            </circle>
          ) : (
            positivos.map((item) => (
              <path
                key={item?.etiqueta ?? item?.id}
                d={slicePath(
                  110,
                  110,
                  94,
                  item.startAngle,
                  item.endAngle
                )}
                fill={item.color}
                stroke="#ffffff"
                strokeWidth="2"
              >
                <title>
                  {`${item?.etiqueta ?? '—'}: ${formatPercent(
                    item.value
                  )}`}
                </title>
              </path>
            ))
          )}
        </svg>
      </div>

      <div style={styles.mortalityEducationLegend}>
        {slices.map((item) => (
          <div
            key={item?.etiqueta ?? item?.id}
            style={styles.mortalityEducationLegendRow}
          >
            <span
              style={{
                ...styles.mortalityEducationLegendDot,
                background: item.color,
              }}
            />

            <span style={styles.mortalityEducationLegendLabel}>
              {item?.etiqueta ?? '—'}
            </span>

            <strong style={styles.mortalityEducationLegendValue}>
              {formatPercent(item.value)}
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function MortalityPyramid({ rows = [], maxValue = 1 }) {
  return (
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

      {rows.map((fila) => {
        const hombres = Number(fila?.hombres) || 0;
        const mujeres = Number(fila?.mujeres) || 0;
        const anchoHombres = `${Math.max(
          0,
          Math.min(
            100,
            (hombres / Math.max(maxValue, 1)) * 100
          )
        )}%`;
        const anchoMujeres = `${Math.max(
          0,
          Math.min(
            100,
            (mujeres / Math.max(maxValue, 1)) * 100
          )
        )}%`;

        return (
          <div
            key={fila?.grupo}
            style={styles.pyramidRow}
          >
            <div style={styles.pyramidLeft}>
              <span style={styles.pyramidValueLeft}>
                {hombres.toLocaleString('es-MX')}
              </span>

              <div style={styles.pyramidTrackLeft}>
                <div
                  style={{
                    ...styles.pyramidBarLeft,
                    width: anchoHombres,
                  }}
                />
              </div>
            </div>

            <div style={styles.pyramidAge}>
              {fila?.grupo ?? '—'}
            </div>

            <div style={styles.pyramidRight}>
              <div style={styles.pyramidTrackRight}>
                <div
                  style={{
                    ...styles.pyramidBarRight,
                    width: anchoMujeres,
                  }}
                />
              </div>

              <span style={styles.pyramidValueRight}>
                {mujeres.toLocaleString('es-MX')}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}


// =============================================================================
// TABLA TERRITORIAL Y EXPORTACIÓN PDF
// =============================================================================

function cleanPdfText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/•/g, '-')
    .replace(/[^\x00-\xFF]/g, '?');
}

function escapePdfText(value) {
  return cleanPdfText(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapPdfText(value, maxChars = 78) {
  const words = cleanPdfText(value)
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  if (words.length === 0) {
    return [''];
  }

  const lines = [];
  let current = '';

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;

    if (candidate.length <= maxChars) {
      current = candidate;
      return;
    }

    if (current) {
      lines.push(current);
    }

    if (word.length <= maxChars) {
      current = word;
      return;
    }

    let rest = word;
    while (rest.length > maxChars) {
      lines.push(rest.slice(0, maxChars));
      rest = rest.slice(maxChars);
    }
    current = rest;
  });

  if (current) {
    lines.push(current);
  }

  return lines;
}

function latin1Bytes(value) {
  const clean = cleanPdfText(value);
  const bytes = new Uint8Array(clean.length);

  for (let index = 0; index < clean.length; index += 1) {
    bytes[index] = clean.charCodeAt(index) & 0xff;
  }

  return bytes;
}

function concatUint8Arrays(chunks) {
  const total = chunks.reduce(
    (sum, chunk) => sum + chunk.length,
    0
  );
  const result = new Uint8Array(total);
  let offset = 0;

  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.length;
  });

  return result;
}

function buildTablePdf({
  title,
  measureLabel,
  periodLabel,
  periodDetail,
  eventLabel,
  typeLabel,
  categoryLabel,
  scopeLabel,
  geographyLabel,
  countLabel,
  rateLabel,
  rows,
  source,
}) {
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const marginX = 42;
  const tableWidth = pageWidth - marginX * 2;
  const territoryWidth = 320;
  const countWidth = 86;
  const rateWidth = tableWidth - territoryWidth - countWidth;
  const rowHeight = 17;
  const headerHeight = 30;
  const maxRowsPerPage = 34;
  const totalPages = Math.max(
    1,
    Math.ceil((rows?.length ?? 0) / maxRowsPerPage)
  );

  const pages = [];

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
    const start = pageIndex * maxRowsPerPage;
    const pageRows = (rows ?? []).slice(
      start,
      start + maxRowsPerPage
    );
    const commands = [];

    const text = (value, x, y, size = 9, bold = false) => {
      commands.push(
        `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(value)}) Tj ET`
      );
    };

    const line = (x1, y1, x2, y2, width = 0.5) => {
      commands.push(
        `${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`
      );
    };

    const fillRect = (x, y, width, height, r, g, b) => {
      commands.push(
        `${r} ${g} ${b} rg ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f 0 0 0 rg`
      );
    };

    let y = pageHeight - 48;

    if (pageIndex === 0) {
      text('Vigilancia epidemiológica de accidentes y lesiones', marginX, y, 9, true);
      y -= 24;

      wrapPdfText(title, 62).slice(0, 2).forEach((lineText) => {
        text(lineText, marginX, y, 15, true);
        y -= 18;
      });

      y -= 3;
      text(`${measureLabel} · ${scopeLabel} · ${periodLabel}`, marginX, y, 9, true);
      y -= 14;
      text(periodDetail, marginX, y, 8, false);
      y -= 17;

      const selectionText = [
        `Evento: ${eventLabel}`,
        `Tipo: ${typeLabel}`,
        `Categoría: ${categoryLabel}`,
      ].join(' · ');

      wrapPdfText(selectionText, 92).slice(0, 2).forEach((lineText) => {
        text(lineText, marginX, y, 8, false);
        y -= 12;
      });

      y -= 5;
      text(
        geographyLabel === 'Entidad federativa'
          ? 'Distribución por entidad federativa'
          : 'Distribución por municipio',
        marginX,
        y,
        9,
        true
      );
      y -= 22;
    } else {
      text(title, marginX, y, 11, true);
      y -= 15;
      text(`${measureLabel} · ${scopeLabel} · ${periodLabel} · Continuación`, marginX, y, 8, false);
      y -= 23;
    }

    const tableTop = y;
    const headerBottom = tableTop - headerHeight;

    fillRect(
      marginX,
      headerBottom,
      tableWidth,
      headerHeight,
      0.93,
      0.95,
      0.94
    );

    text(
      geographyLabel,
      marginX + 8,
      headerBottom + 11,
      8,
      true
    );

    text(
      countLabel,
      marginX + territoryWidth + 8,
      headerBottom + 11,
      8,
      true
    );

    const rateHeaderParts = String(rateLabel ?? '').split(' por ');
    const rateHeaderLines =
      rateHeaderParts.length > 1
        ? [
            rateHeaderParts[0],
            `por ${rateHeaderParts.slice(1).join(' por ')}`,
          ]
        : wrapPdfText(rateLabel, 24).slice(0, 2);

    rateHeaderLines.forEach((lineText, index) => {
      text(
        lineText,
        marginX + territoryWidth + countWidth + 8,
        headerBottom + 16 - index * 9,
        7.5,
        true
      );
    });

    line(marginX, headerBottom, marginX + tableWidth, headerBottom, 0.6);
    line(marginX, tableTop, marginX + tableWidth, tableTop, 0.6);
    line(marginX + territoryWidth, headerBottom, marginX + territoryWidth, tableTop, 0.3);
    line(
      marginX + territoryWidth + countWidth,
      headerBottom,
      marginX + territoryWidth + countWidth,
      tableTop,
      0.3
    );

    let rowY = headerBottom;

    pageRows.forEach((row, rowIndex) => {
      const bottom = rowY - rowHeight;

      if (rowIndex % 2 === 1) {
        fillRect(marginX, bottom, tableWidth, rowHeight, 0.98, 0.98, 0.98);
      }

      text(row.territorio, marginX + 8, bottom + 5.5, 8, false);
      text(
        Number(row.conteo ?? 0).toLocaleString('es-MX'),
        marginX + territoryWidth + 8,
        bottom + 5.5,
        8,
        false
      );
      text(
        row.tasa === null || row.tasa === undefined
          ? '-'
          : Number(row.tasa).toFixed(2),
        marginX + territoryWidth + countWidth + 8,
        bottom + 5.5,
        8,
        false
      );

      line(marginX, bottom, marginX + tableWidth, bottom, 0.2);
      rowY = bottom;
    });

    line(marginX, rowY, marginX, tableTop, 0.3);
    line(marginX + tableWidth, rowY, marginX + tableWidth, tableTop, 0.3);
    line(marginX + territoryWidth, rowY, marginX + territoryWidth, headerBottom, 0.2);
    line(
      marginX + territoryWidth + countWidth,
      rowY,
      marginX + territoryWidth + countWidth,
      headerBottom,
      0.2
    );

    wrapPdfText(source, 105).slice(0, 2).forEach((lineText, index) => {
      text(lineText, marginX, 31 - index * 9, 6.5, false);
    });

    text(
      `Página ${pageIndex + 1} de ${totalPages}`,
      pageWidth - 110,
      22,
      7,
      false
    );

    pages.push(commands.join('\n'));
  }

  const objects = [];
  const pageObjectNumbers = [];

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

  pages.forEach((stream, index) => {
    const pageObject = 5 + index * 2;
    const contentObject = pageObject + 1;
    pageObjectNumbers.push(pageObject);

    const streamLength = latin1Bytes(stream).length;

    objects[pageObject] = [
      '<< /Type /Page',
      '/Parent 2 0 R',
      `/MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}]`,
      '/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >>',
      `/Contents ${contentObject} 0 R`,
      '>>',
    ].join(' ');

    objects[contentObject] = `<< /Length ${streamLength} >>\nstream\n${stream}\nendstream`;
  });

  objects[2] = `<< /Type /Pages /Kids [${pageObjectNumbers
    .map((number) => `${number} 0 R`)
    .join(' ')}] /Count ${pageObjectNumbers.length} >>`;

  const maxObject = objects.length - 1;
  const chunks = [latin1Bytes('%PDF-1.4\n%âãÏÓ\n')];
  const offsets = new Array(maxObject + 1).fill(0);
  let currentOffset = chunks[0].length;

  for (let objectNumber = 1; objectNumber <= maxObject; objectNumber += 1) {
    const objectBody = `${objectNumber} 0 obj\n${objects[objectNumber]}\nendobj\n`;
    const bytes = latin1Bytes(objectBody);
    offsets[objectNumber] = currentOffset;
    chunks.push(bytes);
    currentOffset += bytes.length;
  }

  const xrefOffset = currentOffset;
  const xrefLines = [
    'xref',
    `0 ${maxObject + 1}`,
    '0000000000 65535 f ',
  ];

  for (let objectNumber = 1; objectNumber <= maxObject; objectNumber += 1) {
    xrefLines.push(
      `${String(offsets[objectNumber]).padStart(10, '0')} 00000 n `
    );
  }

  const trailer = [
    ...xrefLines,
    'trailer',
    `<< /Size ${maxObject + 1} /Root 1 0 R >>`,
    'startxref',
    String(xrefOffset),
    '%%EOF',
    '',
  ].join('\n');

  chunks.push(latin1Bytes(trailer));

  return concatUint8Arrays(chunks);
}

function downloadPdfFile(bytes, filename) {
  const blob = new Blob([bytes], {
    type: 'application/pdf',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function sanitizeFilename(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]+/g, '')
    .replace(/^_+|_+$/g, '');
}

function DashboardApp({ onLogout }) {
  const [anio, setAnio] =
    useState(ANIOS_DISPONIBLES[0]);

  const {
    manifest,
    coreMap,
    loadingInitial,
    error: loadingError,
  } = useDashboardData(anio);

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
    useState('');
  const [mesTemporal, setMesTemporal] =
    useState('');
  const [semanaTemporal, setSemanaTemporal] =
    useState('');

  const [ordenTabla, setOrdenTabla] = useState({
    campo: 'territorio',
    direccion: 'asc',
  });

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

  const [
    mortalityProfiles,
    setMortalityProfiles,
  ] = useState(null);
  const [
    loadingMortalityProfiles,
    setLoadingMortalityProfiles,
  ] = useState(false);
  const [
    mortalityProfilesError,
    setMortalityProfilesError,
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
  // CAMBIO DE AÑO
  // ===========================================================================
  // Limpia únicamente los datos dependientes del año. La geometría municipal se
  // conserva porque es común a 2025 y 2026.
  useEffect(() => {
    setEvento('TODOS');
    setTipo('TODOS');
    setCategoria('TODAS');
    setEntidad('NACIONAL');
    setMedida('incidencia');

    setFecha('');
    setPeriodoConsulta('trimestre');
    setTrimestreTemporal('');
    setMesTemporal('');
    setSemanaTemporal('');

    setCategoryMap(null);
    setCategoryError(null);
    setBulletData(null);
    setProfileData(null);
    setBulletError(null);

    setMunicipalManifest(null);
    setMunicipalCore(null);
    setMunicipalCategoryMap(null);
    setMunicipalError(null);
    setMunicipalCategoryError(null);

    setMunicipalDeathsCore(null);
    setMunicipalDeathsCategoryMap(null);
    setMunicipalDeathsError(null);
    setMunicipalDeathsCategoryError(null);

    setMortalityProfiles(null);
    setMortalityProfilesError(null);
  }, [anio]);

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
          loadMunicipalManifest(anio),
          loadMunicipalCore(anio),
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
    anio,
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
          await loadMunicipalDeathsCore(anio);

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
    anio,
    nivelMapa,
    medida,
    municipalDeathsCore,
  ]);

  // ===========================================================================
  // PERFIL DESCRIPTIVO DE MORTALIDAD - SEED
  // ===========================================================================
  // Se carga únicamente cuando la persona selecciona Mortalidad. El producto
  // usa FECHAREGISTRO para conservar exactamente el universo temporal ya
  // validado para el tablero y la misma taxonomía CIE del mapa de mortalidad.

  useEffect(() => {
    let active = true;

    if (
      anio !== '2026' ||
      medida !== 'mortalidad' ||
      mortalityProfiles
    ) {
      return () => {
        active = false;
      };
    }

    async function cargarPerfilesMortalidad() {
      try {
        setLoadingMortalityProfiles(true);
        setMortalityProfilesError(null);

        const response = await fetch(
          MORTALITY_PROFILES_URL
        );

        if (!response.ok) {
          throw new Error(
            `Perfil mortalidad HTTP ${response.status}`
          );
        }

        const data = await response.json();

        if (!active) {
          return;
        }

        setMortalityProfiles(data);
      } catch (err) {
        if (!active) {
          return;
        }

        setMortalityProfiles(null);
        setMortalityProfilesError(err);
      } finally {
        if (active) {
          setLoadingMortalityProfiles(false);
        }
      }
    }

    cargarPerfilesMortalidad();

    return () => {
      active = false;
    };
  }, [
    anio,
    medida,
    mortalityProfiles,
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

  const periodosCatalogo = useMemo(() => {
    return periodArray(coreMap?._catalogs?.periods);
  }, [coreMap]);

  const opcionesTrimestre = useMemo(
    () =>
      periodosCatalogo
        .filter((item) => String(item?.tipo) === 'trimestre')
        .map((item) => ({
          value: String(item?.id ?? ''),
          label: String(item?.label ?? item?.id ?? ''),
          detail: `Acumulado: ${formatPeriodRange(item)}`,
        })),
    [periodosCatalogo]
  );

  const opcionesMes = useMemo(
    () =>
      periodosCatalogo
        .filter((item) => String(item?.tipo) === 'mes')
        .map((item) => ({
          value: String(item?.id ?? ''),
          label: String(item?.label ?? item?.id ?? ''),
        })),
    [periodosCatalogo]
  );

  const opcionesSemana = useMemo(
    () =>
      periodosCatalogo
        .filter((item) => String(item?.tipo) === 'semana')
        .map((item) => ({
          value: String(item?.id ?? ''),
          label: String(item?.label ?? item?.id ?? ''),
          detail: formatPeriodRange(item),
        })),
    [periodosCatalogo]
  );

  // ===========================================================================
  // PERIODO INICIAL = ÚLTIMO DISPONIBLE DEL AÑO ACTIVO
  // ===========================================================================

  useEffect(() => {
    if (
      fechas.length > 0 &&
      !fechas.includes(fecha)
    ) {
      setFecha(fechas[fechas.length - 1]);
    }

    if (
      opcionesTrimestre.length > 0 &&
      !opcionesTrimestre.some(
        (item) => item.value === trimestreTemporal
      )
    ) {
      setTrimestreTemporal(
        opcionesTrimestre[opcionesTrimestre.length - 1].value
      );
    }

    if (
      opcionesMes.length > 0 &&
      !opcionesMes.some(
        (item) => item.value === mesTemporal
      )
    ) {
      setMesTemporal(
        opcionesMes[opcionesMes.length - 1].value
      );
    }

    if (
      opcionesSemana.length > 0 &&
      !opcionesSemana.some(
        (item) => item.value === semanaTemporal
      )
    ) {
      setSemanaTemporal(
        opcionesSemana[opcionesSemana.length - 1].value
      );
    }
  }, [
    fechas,
    fecha,
    opcionesTrimestre,
    trimestreTemporal,
    opcionesMes,
    mesTemporal,
    opcionesSemana,
    semanaTemporal,
  ]);

  const trimestreSeleccionado = useMemo(
    () =>
      opcionesTrimestre.find(
        (item) => item.value === trimestreTemporal
      ) ??
      opcionesTrimestre[opcionesTrimestre.length - 1] ??
      { value: '', label: '—', detail: '—' },
    [opcionesTrimestre, trimestreTemporal]
  );

  const mesSeleccionado = useMemo(
    () =>
      opcionesMes.find(
        (item) => item.value === mesTemporal
      ) ??
      opcionesMes[opcionesMes.length - 1] ??
      { value: '', label: '—' },
    [opcionesMes, mesTemporal]
  );

  const semanaSeleccionada = useMemo(
    () =>
      opcionesSemana.find(
        (item) => item.value === semanaTemporal
      ) ??
      opcionesSemana[opcionesSemana.length - 1] ??
      { value: '', label: '—', detail: '—' },
    [opcionesSemana, semanaTemporal]
  );

  const periodoIdConsulta = useMemo(() => {
    if (periodoConsulta === 'trimestre') {
      return trimestreTemporal;
    }

    if (periodoConsulta === 'mes') {
      return mesTemporal;
    }

    if (periodoConsulta === 'semana') {
      return semanaTemporal;
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
      return mesSeleccionado.label;
    }

    if (periodoConsulta === 'semana') {
      return semanaSeleccionada.label;
    }

    return fecha;
  }, [
    periodoConsulta,
    trimestreSeleccionado,
    mesSeleccionado,
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
      return `${semanaSeleccionada.detail}. Semana epidemiológica oficial DGE ${anio}.`;
    }

    return 'Periodo diario no acumulado.';
  }, [
    anio,
    periodoConsulta,
    trimestreSeleccionado,
    semanaSeleccionada,
  ]);

  const entidadPerfilMortalidad = useMemo(() => {
    const disponibles =
      mortalityProfiles?.metadata?.entities;

    if (!Array.isArray(disponibles)) {
      return entidad;
    }

    const objetivo = normalizeText(entidad);
    const candidatos = new Set([objetivo]);

    const aliasesDirectos =
      ENTITY_ALIASES[objetivo] ?? [];

    aliasesDirectos.forEach((alias) =>
      candidatos.add(normalizeText(alias))
    );

    Object.entries(ENTITY_ALIASES).forEach(
      ([canonico, aliases]) => {
        const normalizados = [
          canonico,
          ...(aliases ?? []),
        ].map(normalizeText);

        if (normalizados.includes(objetivo)) {
          normalizados.forEach((item) =>
            candidatos.add(item)
          );
        }
      }
    );

    return (
      disponibles.find((item) =>
        candidatos.has(normalizeText(item))
      ) ?? entidad
    );
  }, [
    mortalityProfiles,
    entidad,
  ]);

  const perfilMortalidadActual = useMemo(() => {
    if (
      medida !== 'mortalidad' ||
      !mortalityProfiles?.data ||
      !periodoIdConsulta
    ) {
      return null;
    }

    const key = [
      periodoIdConsulta,
      entidadPerfilMortalidad,
      evento,
      tipo,
      categoria,
    ].join('|');

    return (
      mortalityProfiles.data[key] ??
      null
    );
  }, [
    medida,
    mortalityProfiles,
    periodoIdConsulta,
    entidadPerfilMortalidad,
    evento,
    tipo,
    categoria,
  ]);

  const maxEdadSexoMortalidad = useMemo(() => {
    const rows =
      perfilMortalidadActual?.edad_sexo ?? [];

    const valores = rows.flatMap((fila) => [
      Number(fila?.hombres) || 0,
      Number(fila?.mujeres) || 0,
    ]);

    return valores.length > 0
      ? Math.max(...valores, 1)
      : 1;
  }, [perfilMortalidadActual]);

  const bulletCIEMortalidad = useMemo(() => {
    if (
      medida !== 'mortalidad' ||
      categoria === 'TODAS' ||
      !perfilMortalidadActual
    ) {
      return null;
    }

    const bullet =
      perfilMortalidadActual?.bullet_cie ??
      null;

    if (
      !bullet ||
      !String(bullet?.titulo ?? '').trim() ||
      !String(bullet?.etiqueta ?? '').trim() ||
      !Number.isFinite(Number(bullet?.value))
    ) {
      return null;
    }

    return bullet;
  }, [
    medida,
    categoria,
    perfilMortalidadActual,
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
            tipo,
            anio
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
  }, [tipo, anio]);

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

        const data = await loadMunicipalCategoryMap(tipo, anio);

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
    anio,
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
          await loadMunicipalDeathsCategoryMap(tipo, anio);

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
    anio,
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
          await loadTypeBundle(tipo, { year: anio });

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
  }, [tipo, anio]);

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


  // ===========================================================================
  // TABLA TERRITORIAL - MISMA CONSULTA DEL MAPA/KPI
  // ===========================================================================

  const tituloTabla = useMemo(() => {
    if (categoria !== 'TODAS') {
      return categoria;
    }

    if (tipo !== 'TODOS') {
      return tipo;
    }

    if (evento !== 'TODOS') {
      return evento;
    }

    return 'Accidentes y lesiones';
  }, [evento, tipo, categoria]);

  const filasTablaBase = useMemo(() => {
    if (!fecha) {
      return [];
    }

    if (entidad === 'NACIONAL') {
      const tasas = new Map(
        (valoresMapa ?? []).map((item) => [
          normalizeText(item?.entity),
          item?.value,
        ])
      );
      const conteos = new Map(
        (conteosMapa ?? []).map((item) => [
          normalizeText(item?.entity),
          item?.value,
        ])
      );

      return (entidades ?? [])
        .filter((nombre) => nombre && nombre !== 'NACIONAL')
        .map((nombre) => {
          const key = normalizeText(nombre);
          const tasaRaw = tasas.get(key);
          const conteoRaw = conteos.get(key);
          const tasaNumber = Number(tasaRaw);
          const conteoNumber = Number(conteoRaw);

          return {
            id: key,
            territorio: nombre,
            conteo: Number.isFinite(conteoNumber)
              ? conteoNumber
              : 0,
            tasa:
              tasaRaw === null ||
              tasaRaw === undefined ||
              !Number.isFinite(tasaNumber)
                ? null
                : tasaNumber,
          };
        });
    }

    if (
      !entidadCodigoMunicipal ||
      !Array.isArray(municipiosGeo?.features)
    ) {
      return [];
    }

    const registros = new Map(
      (valoresMunicipales ?? []).map((item) => [
        String(item?.cvegeo ?? ''),
        item,
      ])
    );

    return municipiosGeo.features
      .filter(
        (feature) =>
          String(feature?.properties?.cve_ent ?? '').padStart(2, '0') ===
          entidadCodigoMunicipal
      )
      .map((feature) => {
        const cvegeo = String(feature?.properties?.cvegeo ?? '');
        const record = registros.get(cvegeo);
        const tasaRaw = record?.value;
        const tasaNumber = Number(tasaRaw);
        const conteoNumber = Number(record?.count ?? 0);

        return {
          id: cvegeo,
          territorio:
            feature?.properties?.municipio ?? cvegeo,
          conteo: Number.isFinite(conteoNumber)
            ? conteoNumber
            : 0,
          tasa:
            tasaRaw === null ||
            tasaRaw === undefined ||
            !Number.isFinite(tasaNumber)
              ? null
              : tasaNumber,
        };
      });
  }, [
    fecha,
    entidad,
    entidades,
    valoresMapa,
    conteosMapa,
    entidadCodigoMunicipal,
    municipiosGeo,
    valoresMunicipales,
  ]);

  const filasTabla = useMemo(() => {
    const rows = [...filasTablaBase];
    const { campo, direccion } = ordenTabla;
    const factor = direccion === 'desc' ? -1 : 1;

    rows.sort((a, b) => {
      if (campo === 'territorio') {
        return (
          String(a.territorio).localeCompare(
            String(b.territorio),
            'es',
            { sensitivity: 'base' }
          ) * factor
        );
      }

      const aValue =
        campo === 'conteo' ? Number(a.conteo ?? 0) : a.tasa;
      const bValue =
        campo === 'conteo' ? Number(b.conteo ?? 0) : b.tasa;

      const aMissing =
        aValue === null ||
        aValue === undefined ||
        !Number.isFinite(Number(aValue));
      const bMissing =
        bValue === null ||
        bValue === undefined ||
        !Number.isFinite(Number(bValue));

      if (aMissing && bMissing) {
        return String(a.territorio).localeCompare(
          String(b.territorio),
          'es',
          { sensitivity: 'base' }
        );
      }

      if (aMissing) return 1;
      if (bMissing) return -1;

      const numeric =
        (Number(aValue) - Number(bValue)) * factor;

      if (numeric !== 0) {
        return numeric;
      }

      return String(a.territorio).localeCompare(
        String(b.territorio),
        'es',
        { sensitivity: 'base' }
      );
    });

    return rows;
  }, [filasTablaBase, ordenTabla]);

  const medidaTablaLabel =
    medida === 'mortalidad'
      ? 'Mortalidad'
      : 'Incidencia';

  const conteoTablaLabel =
    medida === 'mortalidad'
      ? 'Defunciones'
      : 'Casos';

  const tasaTablaLabel =
    medida === 'mortalidad'
      ? 'Tasa de mortalidad por 10,000 habitantes'
      : 'Tasa de incidencia por 10,000 habitantes';

  const geografiaTablaLabel =
    entidad === 'NACIONAL'
      ? 'Entidad federativa'
      : 'Municipio';

  const distribucionTablaLabel =
    entidad === 'NACIONAL'
      ? 'Distribución por entidad federativa'
      : 'Distribución por municipio';

  function cambiarOrdenTabla(campo) {
    setOrdenTabla((actual) => {
      if (actual.campo === campo) {
        return {
          campo,
          direccion:
            actual.direccion === 'asc'
              ? 'desc'
              : 'asc',
        };
      }

      return {
        campo,
        direccion:
          campo === 'territorio'
            ? 'asc'
            : 'desc',
      };
    });
  }

  function indicadorOrdenTabla(campo) {
    if (ordenTabla.campo !== campo) {
      return '↕';
    }

    return ordenTabla.direccion === 'asc'
      ? '↑'
      : '↓';
  }

  function descargarTablaPdf() {
    if (filasTabla.length === 0) {
      return;
    }

    const source =
      medida === 'mortalidad'
        ? 'Fuente: Secretaría de Salud. Subsistema Epidemiológico y Estadístico de Defunciones (SEED). Información preliminar.'
        : 'Fuente: Secretaría de Salud. Dirección General de Información en Salud (DGIS). Cubos dinámicos de Accidentes y Lesiones. Información preliminar.';

    const pdf = buildTablePdf({
      title: tituloTabla,
      measureLabel: medidaTablaLabel,
      periodLabel: periodoEtiquetaConsulta,
      periodDetail: periodoDetalleConsulta,
      eventLabel: evento,
      typeLabel: tipo,
      categoryLabel: categoria,
      scopeLabel:
        entidad === 'NACIONAL'
          ? 'Nacional'
          : entidad,
      geographyLabel: geografiaTablaLabel,
      countLabel: conteoTablaLabel,
      rateLabel: tasaTablaLabel,
      rows: filasTabla,
      source,
    });

    const filenameParts = [
      'tabla',
      sanitizeFilename(tituloTabla) || 'resultados',
      medida,
      sanitizeFilename(periodoIdConsulta) || 'periodo',
      entidad === 'NACIONAL'
        ? 'nacional'
        : sanitizeFilename(entidad),
    ];

    downloadPdfFile(
      pdf,
      `${filenameParts.filter(Boolean).join('_')}.pdf`
    );
  }

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

  const tablaCargando =
    loadingInitial ||
    (
      entidad === 'NACIONAL'
        ? loadingCategoryMap
        : (
            loadingMunicipalActivo ||
            (
              categoria !== 'TODAS' &&
              !consultaMunicipal.mapData &&
              !errorMunicipalActivo
            )
          )
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
        categoria === 'Peatones' &&
        getBulletId(item) ===
          'no_uso_equipo_seguridad'
      ) {
        return false;
      }

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
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,500;1,600;1,700;1,800&display=swap');

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

        <div style={styles.titleActions}>
          <div style={styles.titleDate}>
            {periodoConsulta === 'trimestre'
              ? 'Datos acumulados · '
              : 'Datos del periodo · '}
            <strong>
              {periodoEtiquetaConsulta || '—'}
            </strong>
          </div>

          <button
            type="button"
            onClick={onLogout}
            style={styles.logoutButton}
          >
            Cerrar sesión
          </button>
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

            <div style={styles.filterDivider} />

            {medida === 'mortalidad' ? (
              anio !== '2026' ? (
                <div style={styles.sidebarEmpty}>
                  El detalle descriptivo de mortalidad está disponible para 2026.
                </div>
              ) : tipo === 'TODOS' ? (
                <div style={styles.sidebarEmpty}>
                  Selecciona un tipo y una categoría para consultar el detalle CIE de mortalidad.
                </div>
              ) : categoria === 'TODAS' ? (
                null
              ) : loadingMortalityProfiles ? (
                <div style={styles.sidebarEmpty}>
                  Cargando detalle de mortalidad...
                </div>
              ) : mortalityProfilesError ? (
                <div style={styles.sidebarError}>
                  No fue posible cargar el detalle CIE de mortalidad.
                </div>
              ) : !perfilMortalidadActual ? (
                <div style={styles.sidebarEmpty}>
                  No hay defunciones para la selección actual.
                </div>
              ) : bulletCIEMortalidad ? (
                <div style={styles.sidebarBulletGrid}>
                  <div
                    style={{
                      ...styles.sidebarBulletCard,
                      ...styles.sidebarBulletCardWide,
                    }}
                  >
                    <div style={styles.sidebarNarrativeBlock}>
                      <div style={styles.sidebarNarrativePrefix}>
                        {getMortalityBulletDisplayTitle(bulletCIEMortalidad, tipo, categoria)}
                      </div>

                      <div style={styles.sidebarNarrativeValue}>
                        {formatBulletValue(
                          bulletCIEMortalidad.value
                        )}
                      </div>

                      <div style={styles.sidebarNarrativeText}>
                        {bulletCIEMortalidad.etiqueta}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null
            ) : (
              tipo === 'TODOS' ? (
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
                      {item?.modo === 'nominal' ? (
                        <>
                          <div style={styles.sidebarBulletLabel}>
                            {getBulletDisplayLabel(item, tipo)}
                          </div>

                          <div style={styles.sidebarBulletValueNominal}>
                            {item?.text ?? '—'}
                          </div>
                        </>
                      ) : (
                        <div style={styles.sidebarNarrativeBlock}>
                          {getBulletNarrativePrefix(item) && (
                            <div style={styles.sidebarNarrativePrefix}>
                              {getBulletNarrativePrefix(item)}
                            </div>
                          )}

                          <div style={styles.sidebarNarrativeValue}>
                            {formatBulletValue(item.value)}
                          </div>

                          <div style={styles.sidebarNarrativeText}>
                            {getBulletNarrative(item)}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
            )
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
              Año
            </div>

            <select
              value={anio}
              onChange={(e) =>
                setAnio(e.target.value)
              }
              style={styles.metricEntitySelect}
            >
              {ANIOS_DISPONIBLES.map((year) => (
                <option
                  key={year}
                  value={year}
                >
                  {year}
                </option>
              ))}
            </select>

            <div style={styles.metricDivider} />

            <div style={styles.metricLabel}>
              Entidad
            </div>

            <select
              value={entidad}
              onChange={(e) =>
                setEntidad(
                  e.target.value
                )
              }
              style={styles.metricEntitySelect}
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

            <div style={styles.metricDivider} />

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
                    {opcionesTrimestre.map(
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
                    {opcionesMes.map(
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
                    {opcionesSemana.map(
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
                    oficial DGE {anio}.
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
              {medida === 'mortalidad' &&
                perfilMortalidadActual && (
                  <>
                    {' · '}
                    {Number(
                      perfilMortalidadActual.n ?? 0
                    ).toLocaleString('es-MX')}
                    {' defunciones'}
                  </>
                )}
            </div>
          </div>

          {medida === 'mortalidad' ? (
            <div style={styles.mortalityProfileGrid}>
              {anio !== '2026' ? (
                <div style={styles.profilePanelWide}>
                  <div style={styles.profileEmpty}>
                    El perfil descriptivo de mortalidad está disponible para 2026.
                  </div>
                </div>
              ) : loadingMortalityProfiles ? (
                <div style={styles.profilePanelWide}>
                  <div style={styles.profileEmpty}>
                    Cargando perfil descriptivo de mortalidad...
                  </div>
                </div>
              ) : mortalityProfilesError ? (
                <div style={styles.profilePanelWide}>
                  <div style={styles.profileEmpty}>
                    No fue posible cargar el perfil descriptivo de mortalidad.
                  </div>
                </div>
              ) : !perfilMortalidadActual ? (
                <div style={styles.profilePanelWide}>
                  <div style={styles.profileEmpty}>
                    No hay defunciones para la selección y periodo actuales.
                  </div>
                </div>
              ) : (
                <>
                  {/* --------------------------------------------------- */}
                  {/* EDAD Y SEXO - MORTALIDAD */}
                  {/* --------------------------------------------------- */}
                  <div
                    style={{
                      ...styles.profilePanel,
                      ...styles.mortalityProfilePyramid,
                    }}
                  >
                    <div style={styles.profilePanelHeader}>
                      <div>
                        <h3 style={styles.profilePanelTitle}>
                          Grupo de edad y sexo
                        </h3>

                        <div style={styles.profilePanelNote}>
                          {periodoConsulta === 'trimestre'
                            ? 'Defunciones acumuladas.'
                            : `Defunciones de ${periodoEtiquetaConsulta}.`}
                        </div>
                      </div>

                      {(perfilMortalidadActual.edad_sexo ?? [])
                        .length > 0 && (
                        <div style={styles.profileLegend}>
                          <span style={styles.profileLegendItem}>
                            <span
                              style={{
                                ...styles.profileLegendDot,
                                background: '#001D19',
                              }}
                            />
                            Hombres
                          </span>

                          <span style={styles.profileLegendItem}>
                            <span
                              style={{
                                ...styles.profileLegendDot,
                                background: '#5B162B',
                              }}
                            />
                            Mujeres
                          </span>
                        </div>
                      )}
                    </div>

                    {(perfilMortalidadActual.edad_sexo ?? [])
                      .length === 0 ? (
                      <div style={styles.profileEmpty}>
                        No hay información de edad y sexo para la selección actual.
                      </div>
                    ) : (
                      <MortalityPyramid
                        rows={
                          perfilMortalidadActual.edad_sexo
                        }
                        maxValue={
                          maxEdadSexoMortalidad
                        }
                      />
                    )}
                  </div>

                  {/* --------------------------------------------------- */}
                  {/* ESCOLARIDAD */}
                  {/* --------------------------------------------------- */}
                  <div style={styles.profilePanel}>
                    <h3 style={styles.profilePanelTitle}>
                      Escolaridad
                    </h3>
                    {(perfilMortalidadActual.escolaridad ?? [])
                      .length === 0 ? (
                      <div style={styles.profileEmpty}>
                        No hay información de escolaridad para la selección actual.
                      </div>
                    ) : (
                      <MortalityEducationPie
                        items={
                          perfilMortalidadActual.escolaridad
                        }
                      />
                    )}
                  </div>

                  {/* --------------------------------------------------- */}
                  {/* OCUPACIÓN HABITUAL */}
                  {/* --------------------------------------------------- */}
                  <div style={styles.profilePanel}>
                    <h3 style={styles.profilePanelTitle}>
                      Ocupación
                    </h3>

                    {(perfilMortalidadActual.ocupacion ?? [])
                      .length === 0 ? (
                      <div style={styles.profileEmpty}>
                        No hay información de ocupación para la selección actual.
                      </div>
                    ) : (
                      <MortalityProfileBars
                        items={
                          perfilMortalidadActual.ocupacion
                        }
                        compact
                      />
                    )}
                  </div>

                </>
              )}
            </div>
          ) : (
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
                              '#001D19',
                          }}
                        />
                        Hombres
                      </span>

                      <span style={styles.profileLegendItem}>
                        <span
                          style={{
                            ...styles.profileLegendDot,
                            background:
                              '#5B162B',
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
                <AnatomicalBodyProfile
                  items={perfilAreaAnatomica}
                />
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
                  {perfilConsecuencia.map((item) => {
                    const ancho = `${Math.max(
                      0,
                      Math.min(100, Number(item.value) || 0)
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
                            {formatProfilePercent(item.value)}
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
                  })}
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
          )}
        </section>

        {/* ============================================================= */}
        {/* TABLA TERRITORIAL DE RESULTADOS */}
        {/* ============================================================= */}

        <section style={styles.resultsSection}>
          <div style={styles.resultsHeader}>
            <div style={styles.resultsHeaderText}>
              <div style={styles.resultsEyebrow}>
                Tabla de resultados
              </div>

              <h2 style={styles.resultsTitle}>
                {tituloTabla}
              </h2>

              <div style={styles.resultsSubtitle}>
                {medidaTablaLabel} · {entidad === 'NACIONAL' ? 'Nacional' : entidad} · {periodoEtiquetaConsulta}
              </div>

              <div style={styles.resultsPeriodDetail}>
                {periodoDetalleConsulta}
              </div>

              <div style={styles.resultsScope}>
                {distribucionTablaLabel}
              </div>
            </div>

            <button
              type="button"
              onClick={descargarTablaPdf}
              disabled={tablaCargando || filasTabla.length === 0}
              style={{
                ...styles.resultsPdfButton,
                ...(tablaCargando || filasTabla.length === 0
                  ? styles.resultsPdfButtonDisabled
                  : {}),
              }}
            >
              Descargar PDF
            </button>
          </div>

          <div style={styles.resultsSelectionLine}>
            <span><strong>Evento:</strong> {evento}</span>
            <span><strong>Tipo:</strong> {tipo}</span>
            <span><strong>Categoría:</strong> {categoria}</span>
          </div>

          {tablaCargando ? (
            <div style={styles.resultsStatus}>
              Cargando tabla...
            </div>
          ) : (
            entidad !== 'NACIONAL' && errorMunicipalActivo
          ) ? (
            <div style={styles.resultsStatusError}>
              No fue posible cargar la información municipal para la selección actual.
            </div>
          ) : filasTabla.length === 0 ? (
            <div style={styles.resultsStatus}>
              No hay información territorial para la selección actual.
            </div>
          ) : (
            <>
              <div style={styles.resultsCountLine}>
                {filasTabla.length.toLocaleString('es-MX')}{' '}
                {entidad === 'NACIONAL'
                  ? 'entidades federativas'
                  : 'municipios'}
              </div>

              <div style={styles.resultsTableWrap}>
                <table style={styles.resultsTable}>
                  <thead>
                    <tr>
                      <th style={styles.resultsThTerritory}>
                        <button
                          type="button"
                          onClick={() => cambiarOrdenTabla('territorio')}
                          style={styles.resultsSortButton}
                        >
                          {geografiaTablaLabel}{' '}
                          <span style={styles.resultsSortIcon}>
                            {indicadorOrdenTabla('territorio')}
                          </span>
                        </button>
                      </th>

                      <th style={styles.resultsThNumber}>
                        <button
                          type="button"
                          onClick={() => cambiarOrdenTabla('conteo')}
                          style={styles.resultsSortButtonNumber}
                        >
                          {conteoTablaLabel}{' '}
                          <span style={styles.resultsSortIcon}>
                            {indicadorOrdenTabla('conteo')}
                          </span>
                        </button>
                      </th>

                      <th style={styles.resultsThNumber}>
                        <button
                          type="button"
                          onClick={() => cambiarOrdenTabla('tasa')}
                          style={styles.resultsSortButtonNumber}
                        >
                          {tasaTablaLabel}{' '}
                          <span style={styles.resultsSortIcon}>
                            {indicadorOrdenTabla('tasa')}
                          </span>
                        </button>
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {filasTabla.map((row) => (
                      <tr key={row.id} style={styles.resultsTr}>
                        <td style={styles.resultsTdTerritory}>
                          {row.territorio}
                        </td>

                        <td style={styles.resultsTdNumber}>
                          {Number(row.conteo ?? 0).toLocaleString('es-MX')}
                        </td>

                        <td style={styles.resultsTdNumber}>
                          {row.tasa === null || row.tasa === undefined
                            ? '—'
                            : Number(row.tasa).toLocaleString('es-MX', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={styles.resultsFootnote}>
                La tabla reproduce la selección activa del tablero. Trimestres acumulados; mes, semana epidemiológica y día corresponden exclusivamente al periodo seleccionado.
              </div>
            </>
          )}
        </section>
      </main>

      <footer style={styles.sources}>
        <div style={styles.sourcesTitle}>
          Fuentes:
        </div>

        <div style={styles.sourcesLine}>
          Secretaría de Salud. Dirección General de Información en Salud (DGIS).
          Cubos dinámicos de Accidentes y Lesiones (información preliminar).
          Casos del periodo disponible{' '}
          {fechas.length > 0
            ? `${fechas[0]} a ${fechas[fechas.length - 1]}`
            : `del año ${anio}`}.
        </div>

        <div style={styles.sourcesLine}>
          Secretaría de Salud. Subsistema Epidemiológico y Estadístico de
          Defunciones (SEED).
        </div>
      </footer>
    </div>
  );
}

function App() {
  const [autorizado, setAutorizado] = useState(() => {
    const usuarioEnSesion = window.sessionStorage.getItem(ACCESS_SESSION_KEY);
    return ACCESS_ACCOUNTS.some((account) => account.user === usuarioEnSesion);
  });

  function cerrarSesion() {
    window.sessionStorage.removeItem(ACCESS_SESSION_KEY);
    setAutorizado(false);
  }

  if (!autorizado) {
    return <LoginScreen onLogin={() => setAutorizado(true)} />;
  }

  return <DashboardApp onLogout={cerrarSesion} />;
}

// =============================================================================
// ESTILOS - PROPUESTA VISUAL INSTITUCIONAL
// =============================================================================

const styles = {
  loginPage: {
    width: '100%',
    minWidth: '320px',
    minHeight: '100vh',
    background: '#f1f1f1',
    color: '#003b35',
    fontFamily: '"Noto Sans", Arial, Helvetica, sans-serif',
  },

  loginInstitutionalHeader: {
    minHeight: '96px',
    background: '#003b35',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '32px',
    padding: '11px clamp(24px, 3.2vw, 64px)',
  },

  loginLogoImss: {
    display: 'block',
    width: 'clamp(230px, 21vw, 350px)',
    maxHeight: '72px',
    height: 'auto',
    objectFit: 'contain',
  },

  loginBrandRight: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '22px',
    minWidth: 0,
    flex: 1,
  },

  loginLogoCoordinacion: {
    display: 'block',
    width: 'clamp(225px, 23vw, 390px)',
    maxHeight: '56px',
    height: 'auto',
    objectFit: 'contain',
  },

  loginVerticalDivider: {
    width: '1px',
    height: '58px',
    background: 'rgba(255,255,255,0.32)',
  },

  loginLogoVigilancia: {
    display: 'block',
    width: 'clamp(135px, 12vw, 205px)',
    maxHeight: '66px',
    height: 'auto',
    objectFit: 'contain',
  },

  loginMain: {
    minHeight: 'calc(100vh - 96px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '38px 20px 56px',
  },

  loginCard: {
    width: '100%',
    maxWidth: '430px',
    background: '#ffffff',
    border: '1px solid #d7d7d7',
    borderRadius: '18px',
    padding: '30px 32px 28px',
    boxShadow: '0 12px 30px rgba(0, 59, 53, 0.08)',
  },

  loginEyebrow: {
    marginBottom: '8px',
    fontSize: '10px',
    fontWeight: 800,
    letterSpacing: '0.08em',
    color: '#7b1e3a',
  },

  loginTitle: {
    margin: 0,
    fontSize: '23px',
    lineHeight: 1.2,
    fontWeight: 800,
    color: '#003b35',
  },

  loginSubtitle: {
    margin: '10px 0 24px',
    fontSize: '12px',
    lineHeight: 1.5,
    color: '#667085',
  },

  loginLabel: {
    display: 'block',
    margin: '0 0 6px',
    fontSize: '12px',
    fontWeight: 800,
    color: '#5f6978',
  },

  loginInput: {
    width: '100%',
    minHeight: '44px',
    marginBottom: '15px',
    padding: '9px 12px',
    border: '1px solid #8d8d8d',
    borderRadius: '8px',
    background: '#ffffff',
    color: '#003b35',
    fontSize: '14px',
    fontWeight: 700,
    outline: 'none',
  },

  loginError: {
    margin: '-2px 0 14px',
    padding: '9px 10px',
    borderRadius: '7px',
    background: '#fff2f1',
    color: '#b42318',
    fontSize: '11px',
    fontWeight: 700,
  },

  loginButton: {
    width: '100%',
    minHeight: '44px',
    marginTop: '3px',
    border: '1px solid #003b35',
    borderRadius: '8px',
    background: '#003b35',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 800,
    cursor: 'pointer',
  },

  loginFootnote: {
    marginTop: '16px',
    textAlign: 'center',
    fontSize: '9px',
    color: '#8b929d',
  },

  titleActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },

  logoutButton: {
    minHeight: '30px',
    padding: '5px 10px',
    border: '1px solid #8d8d8d',
    borderRadius: '7px',
    background: '#ffffff',
    color: '#003b35',
    fontSize: '9px',
    fontWeight: 800,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },

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
    color: '#000000',
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

  sidebarNarrativeBlock: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    minHeight: '58px',
  },

  sidebarNarrativePrefix: {
    marginBottom: '4px',
    fontSize: '11px',
    lineHeight: 1.05,
    fontWeight: 800,
    color: '#003b35',
  },

  sidebarNarrativeValue: {
    fontSize: '23px',
    lineHeight: 1,
    fontWeight: 800,
    color: '#7b1e3a',
    fontVariantNumeric: 'tabular-nums',
  },

  sidebarNarrativeText: {
    marginTop: '7px',
    fontSize: '11px',
    lineHeight: 1.22,
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

  metricEntitySelect: {
    width: '100%',
    minHeight: '41px',
    padding: '7px 10px',
    border: '1px solid #8d8d8d',
    borderRadius: '7px',
    boxSizing: 'border-box',
    background: '#ffffff',
    color: '#003b35',
    fontSize: '13px',
    fontWeight: 700,
    outline: 'none',
    cursor: 'pointer',
  },

  metricDivider: {
    height: '1px',
    background: '#d7d7d7',
    margin: '2px 0 0',
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


  mortalityProfileGrid: {
    display: 'grid',
    gridTemplateColumns: '0.92fr 1.08fr',
    gap: '10px',
    alignItems: 'start',
  },

  mortalityProfilePyramid: {
    gridColumn: '1',
    gridRow: '1 / span 2',
    alignSelf: 'start',
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
    background: '#001D19',
    borderRadius: '3px 0 0 3px',
  },

  pyramidBarRight: {
    height: '100%',
    background: '#5B162B',
    borderRadius: '0 3px 3px 0',
  },

  pyramidAge: {
    textAlign: 'center',
    fontSize: '8px',
    fontWeight: 800,
    color: '#000000',
    whiteSpace: 'nowrap',
  },

  pyramidValueLeft: {
    textAlign: 'right',
    fontSize: '9px',
    fontWeight: 600,
    color: '#000000',
    fontVariantNumeric: 'tabular-nums',
  },

  pyramidValueRight: {
    textAlign: 'left',
    fontSize: '9px',
    fontWeight: 600,
    color: '#000000',
    fontVariantNumeric: 'tabular-nums',
  },

  anatomicalFigure: {
    position: 'relative',
    width: '100%',
    height: '330px',
    marginTop: '4px',
    overflow: 'hidden',
    borderRadius: '10px',
    background: '#ffffff',
  },

  anatomicalBodyWrap: {
    position: 'absolute',
    left: '50%',
    top: '5%',
    bottom: '4%',
    width: '24%',
    minWidth: '92px',
    maxWidth: '138px',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },

  anatomicalBodyImage: {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    objectPosition: 'center',
  },

  anatomicalConnectors: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: 2,
  },

  anatomicalLabel: {
    position: 'absolute',
    width: '27%',
    transform: 'translateY(-50%)',
    zIndex: 3,
    lineHeight: 1.12,
  },

  anatomicalLabelLeft: {
    left: '1%',
    textAlign: 'right',
  },

  anatomicalLabelRight: {
    right: '1%',
    textAlign: 'left',
  },

  anatomicalLabelText: {
    fontSize: '11.5px',
    fontWeight: 700,
    color: '#101828',
    overflowWrap: 'anywhere',
  },

  anatomicalLabelValue: {
    marginTop: '1px',
    fontSize: '11.5px',
    fontWeight: 800,
    color: '#7B1E3A',
    fontVariantNumeric: 'tabular-nums',
  },

  mortalityEducationPieWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    flexWrap: 'wrap',
    minHeight: '205px',
    padding: '4px 0 1px',
    boxSizing: 'border-box',
  },

  mortalityEducationPieChart: {
    flex: '0 1 205px',
    width: '100%',
    maxWidth: '205px',
    minWidth: '165px',
  },

  mortalityEducationPieSvg: {
    display: 'block',
    width: '100%',
    height: 'auto',
    overflow: 'visible',
  },

  mortalityEducationLegend: {
    flex: '1 1 245px',
    minWidth: '220px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },

  mortalityEducationLegendRow: {
    display: 'grid',
    gridTemplateColumns: '10px minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: '7px',
    minHeight: '17px',
  },

  mortalityEducationLegendDot: {
    width: '9px',
    height: '9px',
    borderRadius: '2px',
    display: 'inline-block',
  },

  mortalityEducationLegendLabel: {
    minWidth: 0,
    fontSize: '9.5px',
    fontWeight: 700,
    lineHeight: 1.18,
    color: '#003b35',
  },

  mortalityEducationLegendValue: {
    fontSize: '9px',
    fontWeight: 800,
    color: '#7B1E3A',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },

  areaList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '7px',
  },

  mortalityOccupationList: {
    gap: '4px',
  },

  mortalityOccupationRow: {
    minHeight: 0,
  },

  mortalityOccupationTop: {
    gap: '8px',
    marginBottom: '2px',
  },

  mortalityOccupationLabel: {
    fontSize: '9.5px',
    lineHeight: 1.12,
  },

  mortalityOccupationValue: {
    fontSize: '8.5px',
  },

  mortalityOccupationTrack: {
    height: '5px',
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

  consequenceTreemap: {
    position: 'relative',
    width: '100%',
    height: '270px',
    borderRadius: '9px',
    overflow: 'hidden',
    background: '#f8f6f2',
  },

  consequenceTreemapTile: {
    position: 'absolute',
    boxSizing: 'border-box',
    border: '2px solid #ffffff',
    background: '#7B1E3A',
    padding: '7px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-start',
    color: '#ffffff',
  },

  consequenceTreemapValue: {
    fontSize: '14px',
    lineHeight: 1,
    fontWeight: 800,
    color: '#ffffff',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },

  consequenceTreemapLabel: {
    marginTop: '5px',
    fontSize: '9px',
    lineHeight: 1.12,
    fontWeight: 700,
    color: '#ffffff',
    overflow: 'hidden',
    overflowWrap: 'anywhere',
    wordBreak: 'normal',
  },

  consequenceTreemapCompact: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '4px',
    minWidth: 0,
    width: '100%',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
  },

  consequenceTreemapCompactValue: {
    flex: '0 0 auto',
    lineHeight: 1,
    fontWeight: 800,
    color: '#ffffff',
    fontVariantNumeric: 'tabular-nums',
  },

  consequenceTreemapCompactLabel: {
    minWidth: 0,
    lineHeight: 1,
    fontWeight: 700,
    color: '#ffffff',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
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
    fontFamily:
      '"Noto Sans", Arial, Helvetica, sans-serif',
    fontSize: '8px',
    lineHeight: 1.35,
    color: '#222222',
    fontStyle: 'italic',
  },

  sourcesTitle: {
    fontFamily:
      '"Noto Sans", Arial, Helvetica, sans-serif',
    fontWeight: 800,
    fontStyle: 'italic',
  },

  sourcesLine: {
    fontFamily:
      '"Noto Sans", Arial, Helvetica, sans-serif',
    fontStyle: 'italic',
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

  mapNotes: {
    flex: '1 1 420px',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '2px',
    textAlign: 'right',
  },

  note: {
    fontSize: '9px',
    color: '#667085',
    lineHeight: 1.35,
  },

  incidenceMapNote: {
    maxWidth: '760px',
    fontFamily:
      '"Noto Sans", Arial, Helvetica, sans-serif',
    fontSize: '8.5px',
    color: '#667085',
    lineHeight: 1.3,
    fontStyle: 'italic',
  },

  resultsSection: {
    marginTop: '22px',
    border: '1px solid #d7d7d7',
    borderRadius: '14px',
    background: '#ffffff',
    overflow: 'hidden',
  },

  resultsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '24px',
    padding: '18px 20px 14px',
    borderBottom: '1px solid #ececec',
  },

  resultsHeaderText: {
    minWidth: 0,
    flex: '1 1 auto',
  },

  resultsEyebrow: {
    marginBottom: '4px',
    color: '#7b1e3a',
    fontSize: '9px',
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },

  resultsTitle: {
    margin: 0,
    color: '#003b35',
    fontSize: '20px',
    lineHeight: 1.2,
    fontWeight: 800,
  },

  resultsSubtitle: {
    marginTop: '5px',
    color: '#344054',
    fontSize: '10.5px',
    lineHeight: 1.35,
    fontWeight: 700,
  },

  resultsPeriodDetail: {
    marginTop: '2px',
    color: '#667085',
    fontSize: '9px',
    lineHeight: 1.35,
  },

  resultsScope: {
    marginTop: '8px',
    color: '#003b35',
    fontSize: '11px',
    lineHeight: 1.3,
    fontWeight: 800,
  },

  resultsPdfButton: {
    minWidth: '126px',
    minHeight: '38px',
    padding: '8px 14px',
    border: '1px solid #003b35',
    borderRadius: '8px',
    background: '#003b35',
    color: '#ffffff',
    fontSize: '10px',
    fontWeight: 800,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },

  resultsPdfButtonDisabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
  },

  resultsSelectionLine: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px 18px',
    padding: '10px 20px',
    background: '#fafafa',
    borderBottom: '1px solid #eeeeee',
    color: '#475467',
    fontSize: '9px',
    lineHeight: 1.35,
  },

  resultsCountLine: {
    padding: '9px 20px 6px',
    color: '#667085',
    fontSize: '9px',
    fontWeight: 700,
    textAlign: 'right',
  },

  resultsTableWrap: {
    margin: '0 20px',
    maxHeight: '520px',
    overflowY: 'auto',
    overflowX: 'hidden',
    border: '1px solid #e1e4e8',
    borderRadius: '9px',
  },

  resultsTable: {
    width: '100%',
    borderCollapse: 'separate',
    borderSpacing: 0,
    tableLayout: 'fixed',
    fontSize: '11.5px',
    color: '#1f2937',
  },

  resultsThTerritory: {
    position: 'sticky',
    top: 0,
    zIndex: 2,
    width: '40%',
    padding: 0,
    background: '#edf3f1',
    borderBottom: '1px solid #cfd8d5',
    textAlign: 'center',
  },

  resultsThNumber: {
    position: 'sticky',
    top: 0,
    zIndex: 2,
    width: '30%',
    padding: 0,
    background: '#edf3f1',
    borderBottom: '1px solid #cfd8d5',
    textAlign: 'center',
  },

  resultsSortButton: {
    width: '100%',
    padding: '11px 12px',
    border: 0,
    background: 'transparent',
    color: '#003b35',
    fontSize: '11.5px',
    fontWeight: 800,
    textAlign: 'center',
    cursor: 'pointer',
  },

  resultsSortButtonNumber: {
    width: '100%',
    padding: '11px 12px',
    border: 0,
    background: 'transparent',
    color: '#003b35',
    fontSize: '11.5px',
    fontWeight: 800,
    textAlign: 'center',
    cursor: 'pointer',
  },

  resultsSortIcon: {
    color: '#7b1e3a',
    fontWeight: 900,
  },

  resultsTr: {
    background: '#ffffff',
  },

  resultsTdTerritory: {
    padding: '10px 12px',
    borderBottom: '1px solid #eeeeee',
    color: '#1f2937',
    fontWeight: 600,
    textAlign: 'center',
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
  },

  resultsTdNumber: {
    padding: '10px 12px',
    borderBottom: '1px solid #eeeeee',
    color: '#1f2937',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'center',
    whiteSpace: 'nowrap',
  },

  resultsStatus: {
    minHeight: '130px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    color: '#667085',
    fontSize: '11px',
    textAlign: 'center',
  },

  resultsStatusError: {
    minHeight: '130px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    color: '#b42318',
    fontSize: '11px',
    textAlign: 'center',
  },

  resultsFootnote: {
    padding: '9px 20px 14px',
    color: '#667085',
    fontSize: '8.5px',
    lineHeight: 1.35,
    fontStyle: 'italic',
  },

  estado: {
    padding: '40px',
    fontFamily:
      '"Noto Sans", Arial, Helvetica, sans-serif',
  },
};

export default App;