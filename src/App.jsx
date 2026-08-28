import { useEffect, useState } from 'react';
import { runDashboardDataSelfCheck } from './data/dashboardDataSelfCheck';

function App() {
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    runDashboardDataSelfCheck()
      .then(setResultado)
      .catch(setError);
  }, []);

  if (error) {
    return (
      <div style={{ padding: '30px', fontFamily: 'Arial' }}>
        <h1>Prueba de datos: ERROR</h1>
        <pre>{error.message}</pre>
      </div>
    );
  }

  if (!resultado) {
    return (
      <div style={{ padding: '30px', fontFamily: 'Arial' }}>
        <h1>Validando datos...</h1>
      </div>
    );
  }

  return (
    <div style={{ padding: '30px', fontFamily: 'Arial' }}>
      <h1>Prueba de datos: OK</h1>

      <p>Tipos: {resultado.tipos}</p>
      <p>Días: {resultado.dias}</p>
      <p>Geografías: {resultado.geografias}</p>
      <p>Casos de transporte: {resultado.transporteCasos.toLocaleString()}</p>
      <p>
        Defunciones de transporte:{' '}
        {resultado.transporteDefunciones.toLocaleString()}
      </p>
    </div>
  );
}

export default App;