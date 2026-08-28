import {
    getMapValue,
    loadCoreMap,
    loadManifest,
  } from './dashboardData';
  
  function assert(condition, message) {
    if (!condition) {
      throw new Error(`SELF-CHECK: ${message}`);
    }
  }
  
  export async function runDashboardDataSelfCheck() {
    const [manifest, coreMap] = await Promise.all([
      loadManifest(),
      loadCoreMap(),
    ]);
  
    assert(
      Array.isArray(manifest.tipos) && manifest.tipos.length === 9,
      'el manifest debe contener 9 tipos'
    );
  
    assert(
      Array.isArray(coreMap.indexes?.dates) &&
        coreMap.indexes.dates.length === 181,
      'mapa core debe contener 181 fechas'
    );
  
    assert(
      Array.isArray(coreMap.indexes?.entities) &&
        coreMap.indexes.entities.length === 26,
      'mapa core debe contener 25 entidades + NACIONAL'
    );
  
    const fecha = '2026-06-30';
  
    const transportCases = getMapValue({
      mapData: coreMap,
      date: fecha,
      entity: 'NACIONAL',
      event: 'Accidentes',
      type: 'Accidentes de transporte',
      category: 'TODAS',
      level: 'tipo',
      metric: 'casos',
      mode: 'acumulado',
    });
  
    const transportDeaths = getMapValue({
      mapData: coreMap,
      date: fecha,
      entity: 'NACIONAL',
      event: 'Accidentes',
      type: 'Accidentes de transporte',
      category: 'TODAS',
      level: 'tipo',
      metric: 'defunciones',
      mode: 'acumulado',
    });
  
    assert(
      transportCases === 74365,
      `Transporte nacional debe cerrar en 74,365 casos; recibido ${transportCases}`
    );
  
    assert(
      transportDeaths === 566,
      `Transporte nacional debe cerrar en 566 defunciones; recibido ${transportDeaths}`
    );
  
    return {
      ok: true,
      tipos: manifest.tipos.length,
      dias: coreMap.indexes.dates.length,
      geografias: coreMap.indexes.entities.length,
      transporteCasos: transportCases,
      transporteDefunciones: transportDeaths,
    };
  }