# Carro cuántico

**Circuito Cuántico — Nivel 1: Grover / Modo Drift**

Un minijuego web que enseña el algoritmo de búsqueda de Grover usando la
analogía de un auto que derrapa entre carriles. Es 100% frontend — HTML,
CSS y JavaScript puro, sin backend ni dependencias — y corre entero en
el navegador.

## La idea

Tu auto cuántico arranca entre `N` carriles (`N = 2ⁿ`). Uno lleva a la
meta, no sabes cuál, pero puedes usar el "derrape" (una iteración del
algoritmo de Grover) para encontrarlo en muchas menos vueltas de las que
tomaría probar uno por uno — y tienes tiempo límite desde que enciendes
el motor para lograrlo.

- **Hadamard** (botón) — enciende el motor, arranca el reloj y pone el
  auto en superposición: flota a medio camino entre todos los carriles.
- **Freno de mano / oráculo** (palanca, se arma con un clic) — al armarlo
  marca el carril correcto en secreto, sin mover nada visible todavía.
- **Volante / difusión** — girarlo solo casi no hace nada.
- **Combo (derrape)** — con el freno armado, cada toque del volante
  combina oráculo + difusión: una iteración completa de Grover que
  desliza el auto con fuerza hacia el carril correcto. La **brújula
  externa** (franja arriba de la pista) muestra qué tan "caliente" está
  tu carril actual. Repite el combo unas `√N` veces y cruza la meta
  (botón **META**) antes de que se acabe el tiempo.

La medición final se calcula con las mismas amplitudes de Grover que
mueven el drift en pantalla: se toma una muestra pesada por `|amp|²`,
igual que colapsaría un circuito cuántico real.

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
game.js       Lógica del juego: drift, carriles, brújula, temporizador y medición
assets/img/   Sprites de los controles (Hadamard, freno, volante)
```

## Controles

| Control | Acción |
|---|---|
| **Hadamard** | Enciende el motor, arranca el reloj y crea la superposición inicial |
| **Freno de mano** | Clic para armar/desarmar el oráculo (marca el carril correcto en secreto) |
| **Volante (◀ ▶)** | Con el freno armado, completa el derrape (una iteración real de Grover) |
| **META** | Cruza la meta ahora y mide el resultado (si no, se mide solo al agotarse el tiempo) |
| **↺ reiniciar** | Reinicia la ronda actual |
