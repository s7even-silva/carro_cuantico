# Carro cuántico

**Circuito Cuántico — Nivel 1: Grover / Modo Drift**

Un minijuego web que enseña el algoritmo de búsqueda de Grover usando la
analogía de un auto que esquiva obstáculos entre carriles. Es 100%
frontend — HTML, CSS y JavaScript puro, sin backend ni dependencias — y
corre entero en el navegador.

## La idea

Tu auto cuántico arranca entre `N` carriles (`N = 2ⁿ`). Uno lleva a la
meta, no sabes cuál, y el juego **nunca te lo dice**: solo ves una red de
obstáculos por delante (una ola por cada iteración real que necesita el
algoritmo de Grover para ese circuito) y decidís por tu cuenta cómo
esquivarla, contra un límite de tiempo que arranca al encender el motor.

- **Hadamard** (botón) — enciende el motor, arranca el reloj y revela la
  pista de obstáculos.
- **Freno de mano** — clic para activarlo: frena el avance por la pista
  (más tiempo para reaccionar) y habilita el volante al mismo tiempo. Se
  puede soltar solo con el tiempo, obligando a reactivarlo.
- **Volante** — solo gira mientras el freno está activo (es un drift
  real: primero frenás, después girás). Mantenlo presionado para
  deslizarte varios carriles seguidos.
- **Cada choque cuenta** — chocar un obstáculo resta una iteración real
  al circuito que se simula al medir. No hay ningún número en pantalla
  que te diga si vas por el carril correcto; la **brújula externa**
  (franja arriba de la pista) solo se ilumina más a medida que se acerca
  el resultado final (meta o fin del tiempo), nunca indica una dirección.
  Cruza la meta (o esperá a que se acabe el tiempo) para medir de verdad.

La medición final se calcula simulando el circuito real de Grover con las
iteraciones que sobrevivieron a los choques: se toma una muestra pesada
por `|amp|²`, igual que colapsaría un circuito cuántico real.

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
game.js       Lógica del juego: obstáculos, carriles, brújula, temporizador y medición
assets/img/   Sprites de los controles (Hadamard, freno, volante)
```

## Controles

| Control | Acción |
|---|---|
| **Hadamard** | Enciende el motor, arranca el reloj y revela la pista de obstáculos |
| **Volante (◀ ▶)** | Gira libre en todo momento — mantenlo presionado para varios carriles |
| **Freno de mano** | Clic para activar/desactivar el freno (avanza más lento por la pista) |
| **META** | Cruza la meta ahora y mide el resultado (si no, se mide solo al agotarse el tiempo) |
| **↺ reiniciar** | Reinicia la ronda actual |
