# Carro cuántico

**Circuito Cuántico — Nivel 1: Grover / Modo Drift**

Un minijuego web que enseña el algoritmo de búsqueda de Grover usando la
analogía de un auto que derrapa. No hay backend ni dependencias: es HTML,
CSS y JavaScript puro que corre directo en el navegador.

## La idea

Tu auto cuántico debe encontrar una puerta escondida entre otras `N`
idénticas. No sabes cuál es la correcta, pero puedes usar el "derrape"
(una iteración del algoritmo de Grover) para encontrarla en muchas menos
vueltas de las que tomaría probar una por una.

- **Hadamard** (botón) — enciende el motor y pone el auto en superposición:
  apunta un poco a todas las puertas a la vez.
- **Freno de mano / oráculo** (palanca) — al armarlo marca la puerta
  correcta en secreto, sin mover nada visible todavía.
- **Volante / difusión** — girarlo solo casi no hace nada.
- **Combo (derrape)** — armar el freno y luego girar el volante combina
  oráculo + difusión: una iteración completa de Grover que gira el auto
  con fuerza hacia la puerta correcta. Repite el combo unas `√N` veces
  (ni una menos, ni muchas más) y acelera para medir el resultado.

## Cómo ejecutar el juego

No requiere instalación, compilación ni dependencias. Basta con abrir
[index.html](index.html) en un navegador, o servirlo con cualquier
servidor estático (recomendado para evitar restricciones del navegador
al cargar archivos locales):

```bash
# Opción 1: Python (incluido en la mayoría de sistemas)
python3 -m http.server 8000

# Opción 2: Node.js
npx serve .

# Opción 3: VS Code
# Usa la extensión "Live Server" y haz clic en "Go Live"
```

Luego abre `http://localhost:8000` (o el puerto que indique tu servidor)
en el navegador.

## Estructura del proyecto

```
index.html    Marcado de las tres pantallas: inicio, juego y resultado
style.css     Estilos y animaciones
game.js       Lógica del juego y simulación matemática de Grover
assets/img/   Sprites de los controles (Hadamard, freno, volante)
```

## Controles

| Control | Acción |
|---|---|
| **Hadamard** | Enciende el motor / crea la superposición inicial |
| **Freno de mano** | Arma el oráculo (marca la puerta correcta en secreto) |
| **Volante (◀ ▶)** | Aplica la difusión — combina con el freno armado para derrapar |
| **Acelerar** | Mide el estado y revela si encontraste la puerta correcta |
| **↺ reiniciar** | Reinicia la ronda actual |
