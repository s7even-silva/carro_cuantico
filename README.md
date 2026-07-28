# Carro cuántico

**Fotón Cuántico — Hadamard, NOT y Z**

Un minijuego web pensado para secundaria: el auto **es un fotón** que puede
viajar por dos caminos (camino 0 / camino 1), y los controles son
compuertas cuánticas reales — nada de algoritmos escondidos. Todo corre en
el navegador, sin servidor: para este juego basta con un único qubit, así
que la evolución del fotón es una matriz real 2×2 que se simula exacta en
JavaScript (sin necesidad de números complejos ni de un backend en Qiskit).

## La idea

Cada nivel habilita una compuerta más:

1. **Nivel 1 — NOT (X):** el espejo cuántico. Invierte el camino del fotón,
   siempre, sin azar. Un número impar de X te deja del otro lado; un
   número par te deja igual.
2. **Nivel 2 — Hadamard (H):** reparte al fotón mitad y mitad entre los dos
   caminos (dos autos fantasma en pantalla). Al medir, la naturaleza tira
   una moneda cuántica real — no hay forma de forzar el resultado con esta
   única compuerta.
3. **Nivel 3 — fase (Z):** Z no mueve al fotón ni cambia sus
   probabilidades — solo invierte su fase (el anillo del fantasma cambia
   de celeste a magenta). Sola no hace nada visible, pero intercalada
   entre dos Hadamard (`H · Z · H = X`) recupera el control total: eso es
   interferencia cuántica.
4. **Nivel 4 — pista libre:** las tres compuertas juntas, con un obstáculo
   a mitad de pista. Cruzarlo en superposición es seguro (todavía no está
   decidido en qué camino estás); cruzarlo ya colapsado en el camino
   bloqueado es choque.

El HUD siempre muestra el estado real del fotón (`P(0)`, `P(1)` y el signo
de cada amplitud), para que se pueda seguir el efecto de cada compuerta
compuerta por compuerta.

## Cómo ejecutar el juego

No hace falta nada especial — es HTML/CSS/JS puro:

```bash
# cualquier servidor estático sirve, por ejemplo:
python -m http.server 8000
```

o directamente abrir `index.html` en el navegador.

## Estructura del proyecto

```
index.html   Marcado de las tres pantallas: inicio, juego y resultado
style.css     Estilos y animaciones
game.js        Lógica del cliente: estado del fotón, niveles, pista, HUD
assets/img/     Sprite del auto/fotón y botón de Hadamard
```

## Controles

| Control | Acción |
|---|---|
| **X (NOT)** | Invierte el camino del fotón |
| **H (Hadamard)** | Pone al fotón en superposición de los dos caminos |
| **Z (fase)** | Invierte la fase — invisible sola, importa combinada con H |
| **MEDIR** | Colapsa el fotón ahora (si no, se mide solo al llegar a la meta) |
| **↺ reiniciar** | Reinicia el nivel actual con una meta nueva |

## El modelo cuántico

Como el juego solo usa X, H y Z (las tres son matrices reales), el estado
del fotón se representa como dos amplitudes reales `(a0, a1)` con
`a0² + a1² = 1` — sin necesidad de números complejos. Medir consiste en
tirar una moneda pesada por esas probabilidades (`Math.random() < a1²`) y
colapsar el estado al resultado. Es la misma física que describiría un
circuito de Qiskit de un qubit con esas mismas compuertas, solo que no
hace falta un simulador externo para calcularla.
