# Carro cuántico

**Circuito Cuántico — Nivel 1: Grover / Modo Drift**

Un minijuego web que enseña el algoritmo de búsqueda de Grover usando la
analogía de un auto que esquiva obstáculos entre carriles. El frontend
(HTML, CSS, JS puro) corre en el navegador, pero **la medición final la
decide un circuito real de Grover corriendo en Qiskit** — no un número
inventado en JavaScript.

## La idea

Tu auto cuántico arranca entre `N` carriles (`N = 2ⁿ`). Uno lleva a la
meta, no sabes cuál, y el juego **nunca te lo dice**: solo ves una red de
obstáculos por delante (una ola por cada iteración real que necesita el
algoritmo de Grover para ese circuito) y decidís por tu cuenta cómo
esquivarla, contra un límite de tiempo que arranca al encender el motor.

- **Hadamard** (botón) — enciende el motor, arranca el reloj y revela la
  pista de obstáculos.
- **Volante** — gira siempre libre, sin condiciones. Mantenlo presionado
  para deslizarte varios carriles seguidos.
- **Freno de mano** — clic para activarlo: frena el avance por la pista
  (más tiempo para reaccionar), a costa de gastar el reloj más rápido.
- **Cada choque cuenta** — chocar un obstáculo resta una iteración real
  al circuito que corre Qiskit al medir. No hay ningún número en pantalla
  que te diga si vas por el carril correcto; la **brújula externa**
  (franja arriba de la pista) solo se ilumina más a medida que se acerca
  el resultado final (meta o fin del tiempo), nunca indica una dirección.
  Cruza la meta (o esperá a que se acabe el tiempo) para medir de verdad.

## Cómo ejecutar el juego

Ya no alcanza con abrir `index.html` directo: la medición final depende
de un backend en Python con Qiskit. Hay que instalar las dependencias una
vez y levantar el servidor incluido (sirve el juego y la API en el mismo
puerto):

```bash
pip install qiskit qiskit-aer
python server.py            # sirve en http://localhost:8731 por defecto
# (opcional) python server.py 9000   -> para elegir otro puerto
```

Luego abre `http://localhost:8731` (o el puerto que elegiste) en el
navegador.

## Estructura del proyecto

```
index.html              Marcado de las tres pantallas: inicio, juego y resultado
style.css                Estilos y animaciones
game.js                   Lógica del cliente: obstáculos, carriles, brújula, temporizador
server.py                 Servidor único: sirve el juego y la API /api/measure
backend/grover_qiskit.py  El circuito real de Grover (Qiskit + AerSimulator)
assets/img/                Sprites de los controles (Hadamard, freno, volante)
```

## Controles

| Control | Acción |
|---|---|
| **Hadamard** | Enciende el motor, arranca el reloj y revela la pista de obstáculos |
| **Volante (◀ ▶)** | Gira libre en todo momento — mantenlo presionado para varios carriles |
| **Freno de mano** | Clic para activar/desactivar el freno (avanza más lento por la pista) |
| **META** | Cruza la meta ahora y mide el resultado (si no, se mide solo al agotarse el tiempo) |
| **↺ reiniciar** | Reinicia la ronda actual |

## El backend de Qiskit

`backend/grover_qiskit.py` sigue la teoría al pie de la letra: `n` qubits
de datos + 1 ancilla, ancilla en `|->` (X + H), superposición `H^n`,
`R` iteraciones de oráculo (phase kickback vía `mcx`) + difusor
(`2|s><s| - I`), y medición. `server.py` expone eso como
`POST /api/measure`, que recibe `{n, target, iterations}` (R menos los
choques que tuviste en la pista) y devuelve el histograma real de
`AerSimulator` junto con una medición muestreada de ese histograma. Puedes
probar el circuito solo, sin el juego, con `python backend/grover_qiskit.py`.
