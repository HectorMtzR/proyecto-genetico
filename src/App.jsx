import React, { useState, useRef, useEffect, useCallback } from 'react';
import './TSP.css';

const App = () => {
  // Estado
  const [cities, setCities] = useState([]);
  const [obstacles, setObstacles] = useState([]);
  const [population, setPopulation] = useState([]);
  const [bestRoute, setBestRoute] = useState([]);
  const [generationCount, setGenerationCount] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState('city'); // 'city' o 'obstacle'
  
  const canvasRef = useRef(null);
  // Usamos ref para mantener el estado "fresco" dentro del bucle de animación sin re-renderizar todo
  const stateRef = useRef({ cities: [], obstacles: [], population: [], isRunning: false });

  // --- NUEVO: Refs para detectar estancamiento ---
  const lastBestDistanceRef = useRef(Infinity); // Empezamos con infinito
  const stagnationCounterRef = useRef(0);       // Contador de "paciencia"

  // Sincronizar Refs
  useEffect(() => {
    stateRef.current.cities = cities;
    stateRef.current.obstacles = obstacles;
    stateRef.current.population = population;
    stateRef.current.isRunning = isRunning;
  }, [cities, obstacles, population, isRunning]);

  // --- Lógica del Canvas ---
  const handleCanvasClick = (e) => {
    if (isRunning) return; // No editar mientras corre

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (mode === 'city') {
      const newCity = { x, y };
      setCities(prev => [...prev, newCity]);
      // Limpiamos resultados previos
      setBestRoute([]);
      setPopulation([]);
      setGenerationCount(0);
    } else {
      const newObstacle = { x, y, radius: 30 }; // Radio fijo para simplificar
      setObstacles(prev => [...prev, newObstacle]);
    }
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Dibujar Obstáculos
    stateRef.current.obstacles.forEach(obs => {
      ctx.beginPath();
      ctx.arc(obs.x, obs.y, obs.radius, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.5)'; // Rojo semi-transparente
      ctx.fill();
      ctx.strokeStyle = '#b91c1c';
      ctx.stroke();
    });

    // 2. Dibujar Rutas (si hay mejor ruta)
    if (bestRoute.length > 0 && stateRef.current.cities.length > 0) {
      ctx.beginPath();
      const firstCityIdx = bestRoute[0];
      const firstCity = stateRef.current.cities[firstCityIdx];
      ctx.moveTo(firstCity.x, firstCity.y);

      for (let i = 1; i < bestRoute.length; i++) {
        const city = stateRef.current.cities[bestRoute[i]];
        ctx.lineTo(city.x, city.y);
      }
      ctx.closePath(); // Cerrar el ciclo
      ctx.strokeStyle = '#2563eb'; // Azul
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 3. Dibujar Ciudades
    stateRef.current.cities.forEach((city, index) => {
      ctx.beginPath();
      ctx.arc(city.x, city.y, 6, 0, 2 * Math.PI);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      // Opcional: Número de ciudad
      // ctx.fillText(index, city.x + 8, city.y); 
    });

  }, [bestRoute]); // Dependencia visual principal

  useEffect(() => {
    draw();
  }, [cities, obstacles, bestRoute, draw]);

  // --- Lógica de Evolución (El Bucle) ---
  const evolveStep = async () => {
    if (!stateRef.current.isRunning) return;
    if (stateRef.current.cities.length < 2) {
      setIsRunning(false);
      return;
    }

    try {
      const payload = {
        cities: stateRef.current.cities,
        obstacles: stateRef.current.obstacles,
        population: stateRef.current.population, // Enviamos población anterior (Genética)
        generations_per_step: 20 // Hacemos 20 generaciones por petición
      };

      const res = await fetch('/api/evolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      
      // --- LÓGICA DE DETECCIÓN DE PARADA ---
      const currentDistance = data.best_distance;
      const prevDistance = lastBestDistanceRef.current;

      // Definimos un umbral de mejora (epsilon). 
      // Si la mejora es menor a 0.01 pixeles, lo consideramos "igual".
      if (Math.abs(prevDistance - currentDistance) < 0.01) {
        stagnationCounterRef.current += 1;
      } else {
        // Si hubo mejora real, reseteamos la paciencia
        stagnationCounterRef.current = 0;
        lastBestDistanceRef.current = currentDistance;
      }
    
      // Actualizar estado
      setPopulation(data.population);
      setBestRoute(data.best_route);
      setGenerationCount(prev => prev + 20);

      // BUCLE: Si sigue corriendo, llamar de nuevo
      if (stagnationCounterRef.current >= 10) {
        setIsRunning(false);
        alert(`🎯 Convergencia alcanzada.\nEl algoritmo se detuvo porque no encontró mejoras en las últimas 200 generaciones.`);
      } else if (stateRef.current.isRunning) {
        // Si no hemos estancado, seguimos
        requestAnimationFrame(() => evolveStep());
      }

    } catch (error) {
      console.error("Error en evolución:", error);
      setIsRunning(false);
    }
  };

  const toggleSimulation = () => {
    if (isRunning) {
      setIsRunning(false);
    } else {
      // Al iniciar, reseteamos los contadores de estancamiento
      lastBestDistanceRef.current = Infinity;
      stagnationCounterRef.current = 0;
      
      setIsRunning(true);
      setTimeout(() => evolveStep(), 100);
    }
  };

  const clearAll = () => {
    setIsRunning(false);
    setCities([]);
    setObstacles([]);
    setPopulation([]);
    setBestRoute([]);
    setGenerationCount(0);
  };

  return (
    <div className="tsp-container">
      <div className="sidebar">
        <h2>🧬 TSP Genético</h2>
        <p>Generación: <strong>{generationCount}</strong></p>
        
        <div className="control-group">
          <label>Modo Click:</label>
          <div className="btn-group">
            <button 
              className={mode === 'city' ? 'active' : ''} 
              onClick={() => setMode('city')}>📍 Ciudad</button>
            <button 
              className={mode === 'obstacle' ? 'active' : ''} 
              onClick={() => setMode('obstacle')}>⛔ Obstáculo</button>
          </div>
        </div>

        <div className="actions">
          <button 
            className={`btn-primary ${isRunning ? 'stop' : 'start'}`} 
            onClick={toggleSimulation}>
            {isRunning ? 'Detener Evolución' : 'Iniciar Evolución'}
          </button>
          <button className="btn-secondary" onClick={clearAll}>Limpiar Tablero</button>
        </div>
        
        <div className="instructions">
          <small>
            1. Añade ciudades (puntos negros).<br/>
            2. Añade obstáculos (zonas rojas).<br/>
            3. Inicia y ve cómo el algoritmo evita el rojo.
          </small>
        </div>
      </div>

      <div className="canvas-wrapper">
        <canvas 
          ref={canvasRef} 
          width={800} 
          height={600}
          onClick={handleCanvasClick}
        />
      </div>
    </div>
  );
};

export default App;