# CLAUDE.md

Guía para trabajar en este repositorio con Claude Code.

## Qué es este proyecto

Juego web educativo de un solo nivel ("Circuito Cuántico — Nivel 1: Grover
/ Modo Drift") que enseña el algoritmo de búsqueda de Grover mediante una
analogía de conducción: un auto en superposición conduce entre N carriles
(N = 2ⁿ) y "derrapa" hacia el carril correcto combinando oráculo (freno de
mano) + difusión (volante), contra un límite de tiempo que arranca al
encender el motor.

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
completo (Hadamard → armar freno → girar volante repetidamente → cruzar
la meta / botón "META").

## Estructura

- [index.html](index.html) — las tres pantallas (`#screen-start`,
  `#game-root`, `#screen-result`) como secciones que se muestran/ocultan
  con la clase `.hidden`.
- [game.js](game.js) — toda la lógica: matemática de Grover, estado del
  juego, manejo del DOM, dibujo en canvas, temporizador, medición final
  y el bucle de animación.
- [style.css](style.css) — estilos y animaciones.
- [assets/img/](assets/img/) — sprites de los controles (Hadamard, freno,
  volante en sus distintos estados). No hay sprite de auto todavía: ver
  `CONFIG.carSpriteSrc` en game.js.

## Arquitectura de game.js

Secciones en orden dentro del archivo:

1. **Matemática de Grover** (`hadamardInit`, `groverIteration`,
   `bbhtOptimalIterations`, `resultantLane`, `probabilities`,
   `weightedRandomIndex`) — simulación real de amplitudes. Estas mismas
   amplitudes alimentan tanto el drift visual en vivo como la medición
   final (`finishRound` muestrea `probabilities()` con
   `weightedRandomIndex`, igual que colapsaría un circuito real).
   `bbhtOptimalIterations` usa la fórmula cerrada
   Boyer-Brassard-Høyer-Tapp para el R óptimo.
2. **DOM** (`cacheEls`, `showScreenEl`, `toast`, `updateHud`,
   `updateTimerHud`, `updateControlVisuals`) — helpers de UI, todos los
   elementos cacheados en el objeto `els`.
3. **Flujo de ronda/nivel** (`resetRound`, `attemptSteer`, `finishRound`,
   `showResult`) — `attemptSteer` es el punto central: cada toque del
   volante solo cuenta como "derrape" (iteración de Grover) si el
   oráculo está armado. `finishRound` es síncrono: toma la medición de
   `probabilities()` y llama a `showResult` tras una pausa visual
   (`CONFIG.revealMs`).
4. **Canvas / render** — pista de carriles (`renderTrack`), auto (o el
   placeholder si `CONFIG.carSpriteSrc` es `null`), franja de la
   brújula externa (`renderCompass`, canvas separado arriba de la pista).
5. **Bucle de animación y listeners de eventos** al final del archivo. El
   `loop()` está envuelto en try/catch — un error de un solo frame no debe
   detener el `requestAnimationFrame` para siempre.

El estado global vive en el objeto `state` (arriba del archivo): incluye
`n`/`N` (qubits/carriles), `target`, `amp` (amplitudes), `engineOn`,
`iterations`, `oracleArmed`, `lanePos`/`laneTarget`, `roundDeadline` (fin
del límite de tiempo) y `measuring` (bloquea reintentos mientras se
resuelve la medición).

## Convenciones

- Idioma del proyecto: español (comentarios, strings de UI, commits).
  Mantén ese idioma al editar o añadir contenido.
- El freno de mano es un *toggle* (armado/desarmado por click), no algo
  que se sostiene — es una limitación intencional para jugar con mouse
  (un solo cursor no puede sostener dos controles a la vez).
- Sin frameworks, bundler ni backend: todo el juego (incluida la
  medición final) debe poder correr abriendo los archivos estáticos
  directamente, sin ningún servidor de aplicación.
