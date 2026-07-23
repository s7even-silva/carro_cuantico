# Carro cuántico

**Circuito Cuántico — Nivel 1: Grover / Modo Drift**

Un minijuego web que enseña el algoritmo de búsqueda de Grover usando la
analogía de un auto que derrapa entre carriles. El frontend (HTML, CSS,
JS puro) corre en el navegador, pero **la medición final la decide un
circuito real de Grover corriendo en Qiskit** — no un número inventado en
JavaScript.

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
game.js                   Lógica del cliente: drift, carriles, brújula, temporizador
server.py                 Servidor único: sirve el juego y la API /api/measure
backend/grover_qiskit.py  El circuito real de Grover (Qiskit + AerSimulator)
assets/img/                Sprites de los controles (Hadamard, freno, volante)
```

## Controles

| Control | Acción |
|---|---|
| **Hadamard** | Enciende el motor, arranca el reloj y crea la superposición inicial |
| **Freno de mano** | Clic para armar/desarmar el oráculo (marca el carril correcto en secreto) |
| **Volante (◀ ▶)** | Con el freno armado, completa el derrape (una iteración real de Grover) |
| **META** | Cruza la meta ahora y mide el resultado (si no, se mide solo al agotarse el tiempo) |
| **↺ reiniciar** | Reinicia la ronda actual |

## El backend de Qiskit

`backend/grover_qiskit.py` sigue la teoría al pie de la letra: `n` qubits
de datos + 1 ancilla, ancilla en `|->` (X + H), superposición `H^n`,
`R` iteraciones de oráculo (phase kickback vía `mcx`) + difusor
(`2|s><s| - I`), y medición. `server.py` expone eso como
`POST /api/measure`, que recibe `{n, target, iterations}` (el número de
derrapes que hiciste de verdad) y devuelve el histograma real de
`AerSimulator` junto con una medición muestreada de ese histograma. Puedes
probar el circuito solo, sin el juego, con `python backend/grover_qiskit.py`.
