# CLAUDE.md

Guía para trabajar en este repositorio con Claude Code.

## Qué es este proyecto

Juego web educativo de un solo nivel ("Circuito Cuántico — Nivel 1: Grover
/ Modo Drift") que enseña el algoritmo de búsqueda de Grover mediante una
analogía de conducción: un auto en superposición conduce entre N carriles
(N = 2ⁿ) y "derrapa" hacia el carril correcto combinando oráculo (freno de
mano) + difusión (volante), contra un límite de tiempo que arranca al
encender el motor.

Frontend HTML/CSS/JS sin build ni framework (todo el estado y la lógica
del lado del cliente viven en variables globales dentro de `game.js`), pero
**el resultado de cada partida lo decide un circuito real de Qiskit**, no
JavaScript: `backend/grover_qiskit.py` arma y corre el circuito de verdad
(ancilla + oráculo + difusor) en `AerSimulator`, servido por `server.py`.

## Cómo ejecutar

Ya **no alcanza con abrir `index.html` directo** — la medición final
depende del backend de Qiskit. Hay que levantar `server.py`, que sirve los
archivos estáticos y la API en el mismo origen:

```bash
pip install qiskit qiskit-aer   # una sola vez
python server.py [puerto]        # por defecto 8731
# abrir http://localhost:8731
```

No hay proceso de build, tests automatizados ni linter configurado. Para
verificar cambios, abre el juego en el navegador con `server.py` corriendo
y prueba el flujo completo (Hadamard → armar freno → girar volante
repetidamente → cruzar la meta / botón "META"). Para probar solo la
matemática del circuito sin el juego: `python backend/grover_qiskit.py`.

## Estructura

- [index.html](index.html) — las tres pantallas (`#screen-start`,
  `#game-root`, `#screen-result`) como secciones que se muestran/ocultan
  con la clase `.hidden`.
- [game.js](game.js) — toda la lógica del cliente: matemática de Grover
  local (para feedback instantáneo del drift), estado del juego, manejo
  del DOM, dibujo en canvas y el bucle de animación. La medición final
  NUNCA se decide aquí, se le pide al backend.
- [style.css](style.css) — estilos y animaciones.
- [server.py](server.py) — servidor único (estático + API). Expone
  `POST /api/measure` (construye y corre el circuito real con Qiskit) y
  `GET /api/optimal?n=` (R óptimo, informativo).
- [backend/grover_qiskit.py](backend/grover_qiskit.py) — el circuito de
  Grover real: `build_circuit`, `optimal_iterations`, `measure`. Sigue la
  teoría al pie de la letra (H^n, ancilla en |->, oráculo con phase
  kickback vía `mcx`, difusor `2|s><s| - I`). Ojo con la convención de
  bits: Qiskit imprime los qubits en orden inverso (qubit0 a la derecha),
  así que `build_circuit` voltea la cadena del oráculo una vez para que
  `measured_bits`/`target_bits` salgan ya en notación estándar en toda la
  API — no hay que volver a voltear nada del lado de afuera.
- [assets/img/](assets/img/) — sprites de los controles (Hadamard, freno,
  volante en sus distintos estados). No hay sprite de auto todavía: ver
  `CONFIG.carSpriteSrc` en game.js.

## Arquitectura de game.js

Secciones en orden dentro del archivo:

1. **Matemática de Grover local** (`hadamardInit`, `groverIteration`,
   `bbhtOptimalIterations`, `resultantLane`) — simulación real de
   amplitudes (misma fórmula que el backend) para que el auto y la
   brújula externa reaccionen sin esperar red. `bbhtOptimalIterations`
   usa la fórmula cerrada Boyer-Brassard-Høyer-Tapp, la misma que
   `optimal_iterations()` en el backend — deben coincidir.
2. **DOM** (`cacheEls`, `showScreenEl`, `toast`, `updateHud`,
   `updateTimerHud`, `updateControlVisuals`) — helpers de UI, todos los
   elementos cacheados en el objeto `els`.
3. **Flujo de ronda/nivel** (`resetRound`, `attemptSteer`, `finishRound`)
   — `attemptSteer` es el punto central: cada toque del volante solo
   cuenta como "derrape" (iteración de Grover) si el oráculo está armado.
   `finishRound` es `async`: llama a `POST /api/measure` con
   `{n, target, iterations}` y el resultado real de Qiskit decide
   ganar/perder. Tiene tres capas de robustez porque un `fetch` sin
   servidor puede fallar de formas raras: `AbortController` (9s),
   un watchdog independiente (10s) que libera la UI pase lo que pase con
   la promesa, y un `measureToken` para que una respuesta tardía de un
   intento viejo no pise el estado de un reintento más nuevo.
4. **Canvas / render** — pista de carriles (`renderTrack`), auto (o el
   placeholder si `CONFIG.carSpriteSrc` es `null`), franja de la
   brújula externa (`renderCompass`, canvas separado arriba de la pista).
5. **Bucle de animación y listeners de eventos** al final del archivo. El
   `loop()` está envuelto en try/catch — un error de un solo frame no debe
   detener el `requestAnimationFrame` para siempre.

El estado global vive en el objeto `state` (arriba del archivo): incluye
`n`/`N` (qubits/carriles), `target`, `amp` (amplitudes), `engineOn`,
`iterations`, `oracleArmed`, `lanePos`/`laneTarget`, `roundDeadline` (fin
del límite de tiempo) y `measuring` (bloquea reintentos mientras se espera
al backend).

## Convenciones

- Idioma del proyecto: español (comentarios, strings de UI, commits).
  Mantén ese idioma al editar o añadir contenido.
- El freno de mano es un *toggle* (armado/desarmado por click), no algo
  que se sostiene — es una limitación intencional para jugar con mouse
  (un solo cursor no puede sostener dos controles a la vez).
- La medición final SIEMPRE pasa por Qiskit (`backend/grover_qiskit.py`
  vía `server.py`). No reintroducir un cálculo local que decida
  ganar/perder sin pasar por el backend, aunque cambie la mecánica de
  juego — eso fue un pedido explícito del usuario.
- Sin frameworks ni bundler en el frontend; el único requisito de
  dependencias es Python + `qiskit` + `qiskit-aer` para el backend.
