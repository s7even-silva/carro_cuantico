# CLAUDE.md

Guía para trabajar en este repositorio con Claude Code.

## Qué es este proyecto

Juego web educativo de un solo nivel ("Circuito Cuántico — Nivel 1: Grover
/ Modo Drift") que enseña el algoritmo de búsqueda de Grover mediante una
analogía de conducción: un auto conduce entre N carriles (N = 2ⁿ) esquivando
una red de obstáculos, contra un límite de tiempo que arranca al encender
el motor. El volante solo gira mientras el freno de mano está activo (freno
real: frena el avance de la pista, y el drift completo es frenar y luego
girar) y el freno puede soltarse solo con el tiempo, obligando a
reactivarlo. El juego NUNCA revela si el carril actual es el correcto — el
jugador solo ve los obstáculos y decide; cada choque resta una iteración
real del circuito de Grover que se simula localmente al medir, así que
esquivar bien importa aunque no haya ningún número visible que delate la
respuesta durante la partida.

Es 100% frontend — HTML/CSS/JS sin build, framework ni backend. Todo el
estado y la lógica (incluida la medición final) viven en variables
globales dentro de `game.js`, lo que permite que el juego corra entero
como archivos estáticos (p. ej. GitHub Pages).

## Cómo ejecutar

Abrir [index.html](index.html) directamente en el navegador, o servirlo
con un servidor estático simple:

```bash
python3 -m http.server 8000
# luego abrir http://localhost:8000
```

No hay proceso de build, tests automatizados ni linter configurado. Para
verificar cambios, abre el juego en el navegador y prueba el flujo
completo (Hadamard → frenar y esquivar los obstáculos con el volante →
cruzar la meta / botón "META").

## Estructura

- [index.html](index.html) — las tres pantallas (`#screen-start`,
  `#game-root`, `#screen-result`) como secciones que se muestran/ocultan
  con la clase `.hidden`.
- [game.js](game.js) — toda la lógica: generación de la red de
  obstáculos, estado del juego, manejo del DOM, dibujo en canvas,
  temporizador, medición final (simulada localmente) y el bucle de
  animación.
- [style.css](style.css) — estilos y animaciones.
- [assets/img/](assets/img/) — sprites de los controles (Hadamard, freno,
  volante en sus distintos estados). No hay sprite de auto todavía: ver
  `CONFIG.carSpriteSrc` en game.js.

## Arquitectura de game.js

Secciones en orden dentro del archivo:

1. **Grover** (`bbhtOptimalIterations`, `measureLocally`,
   `weightedRandomIndex`, `generateObstacles`) — `bbhtOptimalIterations`
   da R (fórmula cerrada Boyer-Brassard-Høyer-Tapp) para saber cuántas
   "olas" de obstáculos generar. `generateObstacles` crea una ola por
   iteración real, cada una con un hueco (gap) que serpentea de una ola a
   la siguiente — no depende de `target` (nunca debe poder decodificarse
   la respuesta a partir del patrón de obstáculos). `measureLocally`
   simula el circuito completo (amplitudes reales, H^n + R iteraciones de
   oráculo/difusión con las iteraciones efectivas) y muestrea con
   `weightedRandomIndex`, igual que colapsaría un circuito real — todo en
   el cliente, sin backend.
2. **DOM** (`cacheEls`, `showScreenEl`, `toast`, `updateHud`,
   `updateTimerHud`, `updateControlVisuals`) — helpers de UI, todos los
   elementos cacheados en el objeto `els`.
3. **Flujo de ronda/nivel** (`resetRound`, `hadamardInit`, `attemptSteer`,
   `checkCollisions`, `finishRound`) — `attemptSteer` solo mueve el carril
   objetivo si `state.braking` es `true` (drift real: primero se frena,
   después se gira; sin freno, tocar el volante no hace nada). El freno
   también puede soltarse solo (`CONFIG.brakeDropChancePerSec`, chequeado
   en `loop()`), obligando a reactivarlo. `checkCollisions` corre cada
   frame: cuando el auto cruza la fracción de pista de una ola no
   visitada, revisa si el carril actual está bloqueado — si es así, resta
   1 a `state.effectiveIter` (piso en 0) y dispara partículas de choque,
   sin ningún toast ni texto (nunca se le dice al jugador si acertó).
   `finishRound` es síncrono: llama a `measureLocally(state.N,
   state.target, state.effectiveIter)` y ese resultado decide
   ganar/perder, mostrado tras una pausa visual (`CONFIG.revealMs`).
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
`trackProgress`) y `measuring` (bloquea reintentos mientras se resuelve
la medición).

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
- Sin frameworks, bundler ni backend: todo el juego (incluida la
  medición final vía `measureLocally`) debe poder correr abriendo los
  archivos estáticos directamente, sin ningún servidor de aplicación.
