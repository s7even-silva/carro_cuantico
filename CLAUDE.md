# CLAUDE.md

Guía para trabajar en este repositorio con Claude Code.

## Qué es este proyecto

Juego web educativo de un solo nivel ("Circuito Cuántico — Nivel 1: Grover
/ Modo Drift") que enseña el algoritmo de búsqueda de Grover mediante una
analogía de conducción: un auto conduce entre N carriles (N = 2ⁿ) esquivando
una red de obstáculos, contra un límite de tiempo que arranca al encender
el motor. El volante gira libre en todo momento (sin combos ni condiciones)
y el freno de mano es un freno real (frena el avance de la pista a cambio
de gastar el reloj más rápido). El juego NUNCA revela si el carril actual
es el correcto — el jugador solo ve los obstáculos y decide; cada choque
resta una iteración real del circuito de Grover que se corre en Qiskit al
medir, así que esquivar bien importa aunque no haya ningún número visible
que delate la respuesta durante la partida.

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
y prueba el flujo completo (Hadamard → esquivar los obstáculos con el
volante → cruzar la meta / botón "META"). Para probar solo la matemática
del circuito sin el juego: `python backend/grover_qiskit.py`.

## Estructura

- [index.html](index.html) — las tres pantallas (`#screen-start`,
  `#game-root`, `#screen-result`) como secciones que se muestran/ocultan
  con la clase `.hidden`.
- [game.js](game.js) — toda la lógica del cliente: generación de la red
  de obstáculos, estado del juego, manejo del DOM, dibujo en canvas y el
  bucle de animación. La medición final NUNCA se decide aquí, se le pide
  al backend.
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

1. **Grover mínimo** (`bbhtOptimalIterations`, `generateObstacles`) — el
   frontend ya no simula amplitudes; solo necesita R (fórmula cerrada
   Boyer-Brassard-Høyer-Tapp, la misma que `optimal_iterations()` en el
   backend — deben coincidir) para saber cuántas "olas" de obstáculos
   generar. `generateObstacles` crea una ola por iteración real, cada una
   con un hueco (gap) que serpentea de una ola a la siguiente — no
   depende del `target` (nunca debe poder decodificarse la respuesta a
   partir del patrón de obstáculos).
2. **DOM** (`cacheEls`, `showScreenEl`, `toast`, `updateHud`,
   `updateTimerHud`, `updateControlVisuals`) — helpers de UI, todos los
   elementos cacheados en el objeto `els`.
3. **Flujo de ronda/nivel** (`resetRound`, `hadamardInit`, `attemptSteer`,
   `checkCollisions`, `finishRound`) — `attemptSteer` solo mueve el carril
   objetivo si `state.braking` es `true` (drift real: primero se frena,
   después se gira; sin freno, tocar el volante no hace nada). El freno
   también puede soltarse solo (`CONFIG.brakeDropChancePerSec`, chequeado
   en `loop()`), obligando a reactivarlo. `checkCollisions`
   corre cada frame: cuando el auto cruza la fracción de pista de una ola
   no visitada, revisa si el carril actual está bloqueado — si es así,
   resta 1 a `state.effectiveIter` (piso en 0) y dispara partículas de
   choque, sin ningún toast ni texto (nunca se le dice al jugador si
   acertó). `finishRound` es `async`: llama a `POST /api/measure` con
   `{n, target, iterations: state.effectiveIter}` y el resultado real de
   Qiskit decide ganar/perder. Tiene tres capas de robustez porque un
   `fetch` sin servidor puede fallar de formas raras: `AbortController`
   (9s), un watchdog independiente (10s) que libera la UI pase lo que
   pase con la promesa, y un `measureToken` para que una respuesta tardía
   de un intento viejo no pise el estado de un reintento más nuevo.
4. **Canvas / render** — pista de carriles con los obstáculos
   (`renderTrack`), auto (o el placeholder si `CONFIG.carSpriteSrc` es
   `null`), franja de la brújula externa (`renderCompass`, canvas
   separado arriba de la pista) — es solo un brillo ambiental atado a
   `trackProgress`/tiempo restante, nunca apunta a un carril ni muestra
   un porcentaje. `renderCircuitDiagram` (canvas chico en el HUD) dibuja
   el mismo patrón que usa `generateObstacles`: un carril por qubit +
   ancilla y un bloque naranja/verde (oráculo/difusor) por cada iteración
   real (R) — es puramente ilustrativo, no interactivo.
5. **Bucle de animación y listeners de eventos** al final del archivo. El
   `loop()` está envuelto en try/catch — un error de un solo frame no debe
   detener el `requestAnimationFrame` para siempre. El volante usa
   `pointerdown`/`pointerup` con un intervalo (`CONFIG.steerRepeatMs`)
   para poder mantenerlo presionado y desplazarse varios carriles.

El estado global vive en el objeto `state` (arriba del archivo): incluye
`n`/`N` (qubits/carriles), `target` (secreto), `engineOn`, `optimalIter`
(R real), `collisions`/`effectiveIter`, `braking`, `lanePos`/`laneTarget`,
`obstacles` (olas generadas), `trackProgress` (0..1, lo frena `braking`),
`roundDeadline` (fin del límite de tiempo, independiente de
`trackProgress`) y `measuring` (bloquea reintentos mientras se espera al
backend).

## Convenciones

- Idioma del proyecto: español (comentarios, strings de UI, commits).
  Mantén ese idioma al editar o añadir contenido.
- El freno de mano es un *toggle* (click), no algo que se sostiene — es
  una limitación intencional para jugar con mouse (un solo cursor no
  puede sostener dos controles a la vez). Hace de freno real (frena
  `trackProgress`) Y habilita el volante al mismo tiempo — `attemptSteer`
  no hace nada si `state.braking` es `false`.
- **Nunca revelar correctness durante la partida**: nada de toasts,
  texto ni HUD que indique "vas bien"/"certeza X%"/"alineado" mientras
  se juega — fue un pedido explícito del usuario. El único momento en que
  se puede mostrar esa información es la pantalla de resultado, después
  de medir.
- El patrón de obstáculos (`generateObstacles`) no debe depender de
  `target` — si el patrón codificara la respuesta, estaría violando la
  regla anterior por la puerta de atrás.
- La medición final SIEMPRE pasa por Qiskit (`backend/grover_qiskit.py`
  vía `server.py`). No reintroducir un cálculo local que decida
  ganar/perder sin pasar por el backend, aunque cambie la mecánica de
  juego.
- Sin frameworks ni bundler en el frontend; el único requisito de
  dependencias es Python + `qiskit` + `qiskit-aer` para el backend.
