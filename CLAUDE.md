# CLAUDE.md

Guía para trabajar en este repositorio con Claude Code.

## Qué es este proyecto

Juego web educativo de un solo nivel ("Circuito Cuántico — Nivel 1: Grover
/ Modo Drift") que enseña el algoritmo de búsqueda de Grover mediante una
analogía de conducción: un auto en superposición "derrapa" hacia la puerta
correcta combinando oráculo (freno de mano) + difusión (volante).

Es HTML/CSS/JS estático sin build ni dependencias — no hay `package.json`,
bundler ni framework. Todo el estado y la lógica viven en variables
globales dentro de `game.js`.

## Cómo ejecutar

Abrir [index.html](index.html) directamente en el navegador, o servirlo
con un servidor estático simple:

```bash
python3 -m http.server 8000
# luego abrir http://localhost:8000
```

No hay proceso de build, tests automatizados ni linter configurado. Para
verificar cambios, abre el juego en el navegador y prueba el flujo
completo (Hadamard → armar freno → girar volante repetidamente → acelerar).

## Estructura

- [index.html](index.html) — las tres pantallas (`#screen-start`,
  `#game-root`, `#screen-result`) como secciones que se muestran/ocultan
  con la clase `.hidden`.
- [game.js](game.js) — toda la lógica: matemática de Grover, estado del
  juego, manejo del DOM, dibujo en canvas y el bucle de animación.
- [style.css](style.css) — estilos y animaciones.
- [assets/img/](assets/img/) — sprites de los controles (Hadamard, freno,
  volante en sus distintos estados). No hay sprite de auto todavía: ver
  `CONFIG.carSpriteSrc` en game.js.

## Arquitectura de game.js

Secciones en orden dentro del archivo:

1. **Matemática de Grover** (`gateAngle`, `hadamardInit`, `groverIteration`,
   `computeOptimalIter`, `resultantVector`) — simulación real de amplitudes,
   no solo cosmética. `computeOptimalIter` simula la recurrencia en vez de
   usar la fórmula asintótica π/4·√N, porque esa fórmula falla para N
   pequeño.
2. **DOM** (`cacheEls`, `showScreenEl`, `toast`, `updateHud`,
   `updateControlVisuals`) — helpers de UI, todos los elementos cacheados
   en el objeto `els`.
3. **Flujo de ronda/nivel** (`resetRound`, `attemptSteer`, `accelerate`) —
   `attemptSteer` es el punto central: cada toque del volante solo cuenta
   como "derrape" (iteración de Grover) si el oráculo está armado.
4. **Canvas / render** — dibujo de la pista, el auto (o el placeholder si
   `CONFIG.carSpriteSrc` es `null`) y la brújula de amplitudes.
5. **Bucle de animación y listeners de eventos** al final del archivo.

El estado global vive en el objeto `state` (arriba del archivo): incluye
`N`, `target`, `amp` (amplitudes), `engineOn`, `iterations`,
`oracleArmed`, y el heading del auto para la animación.

## Convenciones

- Idioma del proyecto: español (comentarios, strings de UI, commits).
  Mantén ese idioma al editar o añadir contenido.
- El freno de mano es un *toggle* (armado/desarmado por click), no algo
  que se sostiene — es una limitación intencional para jugar con mouse
  (un solo cursor no puede sostener dos controles a la vez).
- Sin dependencias externas: evita introducir un bundler, framework o
  librería a menos que el usuario lo pida explícitamente.
