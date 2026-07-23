"""
Circuito de Grover real (Qiskit) que respalda las mediciones del juego.

Implementación alineada con la teoría:
  1. Inicialización:  |psi_0> = |0>^n (x) |0>
  2. Ancilla en |->:   X, H sobre el qubit auxiliar
  3. Superposición:    H^n sobre el registro principal -> |s>
  4. Repetir R veces:
        a) Oráculo U_f (phase kickback, marca |w> con -1)
        b) Difusor  G = 2|s><s| - I  (inversión respecto a la media)
  5. Medir el registro principal

No importa qué camino siga el juego para llegar hasta aquí (carriles,
combos de drift, en el orden que sea): esta es la fuente de verdad para
"el inicio y el final" -- construir el circuito real y medirlo de verdad
en el simulador, no una probabilidad inventada a mano.
"""
import numpy as np
from qiskit import QuantumCircuit, transpile
from qiskit_aer import AerSimulator

_SIM = AerSimulator()


def optimal_iterations(n: int) -> int:
    """R óptimo (Boyer-Brassard-Høyer-Tapp): round((pi/4)/theta - 1/2)."""
    N = 2 ** n
    theta = np.arcsin(1 / np.sqrt(N))
    R = int(round((np.pi / 4) / theta - 0.5))
    return max(R, 1)


def _oracle(qc: QuantumCircuit, n: int, oracle_bits: str) -> None:
    """U_f: |x>|-> -> (-1)^f(x) |x>|-> vía mcx sobre la ancilla."""
    zero_positions = [i for i, bit in enumerate(oracle_bits) if bit == "0"]
    for q in zero_positions:
        qc.x(q)
    qc.mcx(list(range(n)), n)
    for q in zero_positions:
        qc.x(q)


def _diffuser(qc: QuantumCircuit, n: int) -> None:
    """G = 2|s><s| - I sobre los n qubits de datos."""
    qc.h(range(n))
    qc.x(range(n))
    qc.h(n - 1)
    qc.mcx(list(range(n - 1)), n - 1)
    qc.h(n - 1)
    qc.x(range(n))
    qc.h(range(n))


def build_circuit(n: int, target_index: int, iterations: int) -> QuantumCircuit:
    """
    n qubits de datos + 1 ancilla. target_index es el carril correcto,
    0..2**n-1, en notación binaria estándar (MSB primero, la que se usa
    para mostrarlo). Qiskit lee/imprime los qubits en el orden inverso
    (qubit0 a la derecha), así que la cadena que arma al oráculo se
    voltea una vez aquí -- el resto del juego nunca necesita saberlo,
    measured_bits en measure() ya sale en notación estándar.
    """
    oracle_bits = format(target_index, f"0{n}b")[::-1]
    qc = QuantumCircuit(n + 1, n)
    qc.x(n)             # ancilla: |0> -> |1>
    qc.h(range(n + 1))  # Hadamard a todo -> ancilla queda en |->
    qc.barrier()

    for _ in range(iterations):
        _oracle(qc, n, oracle_bits)
        qc.barrier()
        _diffuser(qc, n)
        qc.barrier()

    qc.measure(range(n), range(n))
    return qc


def measure(n: int, target_index: int, iterations: int, shots: int = 256) -> dict:
    """
    Construye y corre el circuito real en AerSimulator; devuelve el
    histograma (notación estándar) y una medición muestreada de ese
    histograma real -- una tirada de verdad, no elegida a dedo.
    """
    qc = build_circuit(n, target_index, iterations)
    compiled = transpile(qc, _SIM)
    result = _SIM.run(compiled, shots=shots).result()
    counts = result.get_counts()

    keys = list(counts.keys())
    weights = np.array([counts[k] for k in keys], dtype=float)
    weights /= weights.sum()
    measured_bits = str(np.random.choice(keys, p=weights))
    measured_index = int(measured_bits, 2)
    target_bits = format(target_index, f"0{n}b")

    return {
        "n": n,
        "N": 2 ** n,
        "target_index": target_index,
        "target_bits": target_bits,
        "iterations": iterations,
        "measured_index": measured_index,
        "measured_bits": measured_bits,
        "success": measured_index == target_index,
        "counts": counts,
        "success_probability": counts.get(target_bits, 0) / shots,
    }


if __name__ == "__main__":
    for n in (2, 3, 4):
        R = optimal_iterations(n)
        target = (2 ** n) // 3  # cualquier carril, no necesariamente simétrico
        out = measure(n, target, R)
        print(f"n={n} N={out['N']} target={out['target_bits']} R={R} "
              f"-> medido={out['measured_bits']} success={out['success']} "
              f"p_exito~{out['success_probability']:.2f}")
