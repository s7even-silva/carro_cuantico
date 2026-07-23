"use strict";
/* =====================================================================
   Circuito Cuántico — Nivel 1: Grover / Modo Drift
   =====================================================================
   Pista de carriles (N = 2^n) con una red de obstáculos que se genera
   con el mismo número de "olas" que iteraciones reales de Grover tiene
   el circuito (R, fórmula Boyer-Brassard-Høyer-Tapp), evocando el ritmo
   de bloques repetidos (oráculo + difusor, barrera, oráculo + difusor...)
   del diagrama real del circuito -- un gráfico chico junto al HUD
   (renderCircuitDiagram) muestra ese mismo patrón: un carril por qubit +
   ancilla, y un bloque naranja/verde (oráculo/difusor) por cada
   iteración real. El volante solo gira mientras el freno está activo (es
   un drift real: primero frenás, después girás) y el freno puede
   soltarse solo por chance, obligando a reactivarlo. El juego nunca dice
   si vas por el carril correcto: solo ves los obstáculos y decides. Cada
   choque resta una iteración "efectiva" -- esa es la que de verdad se
   simula (amplitudes reales de Grover) al llegar a la meta o agotarse el
   tiempo, todo en el cliente, sin backend -- esquivar bien importa, pero
   nunca se muestra un número que delate el carril correcto mientras se
   juega.
   =====================================================================
   SPRITE DEL VEHÍCULO
   --------------------
   CONFIG.carSpriteSrc apunta a assets/img/car_sprite.png (vista top-down,
   sin fondo). Se dibuja siempre "de frente" sin rotar. Si se pone en
   null, se usa un auto de relleno dibujado a mano (drawCarPlaceholder).
   =====================================================================*/

const CONFIG = {
  levels: [2, 3, 4],             // n = qubits por nivel -> N = 2^n carriles
  laneLerpRate: 9,                // qué tan rápido desliza el auto entre carriles
  secondsPerIteration: 3.0,       // presupuesto de tiempo por ola de obstáculos
  extraBufferIterations: 2,       // margen extra de tiempo sobre el óptimo
  revealMs: 800,                  // pausa visual tras medir antes de mostrar resultado
  carSpriteSrc: "assets/img/car_sprite.png",
  steerRepeatMs: 130,             // repetición al mantener presionado el volante
  brakeFactor: 0.42,              // qué tanto frena el avance por la pista al frenar
  gapFraction: 0.28,              // fracción de carriles libres en cada ola (mínimo 2)
  brakeDropChancePerSec: 0.16,    // probabilidad por segundo de que el freno se suelte solo
};

// ---------------------------------------------------------------------
// ESTADO
// ---------------------------------------------------------------------
const state = {
  screen: "start",     // start | game-root | result
  levelIndex: 0,
  n: 2,
  N: 4,
  target: 0,            // secreto: nunca se muestra hasta el resultado final
  engineOn: false,

  optimalIter: 1,       // R real (Boyer-Brassard-Høyer-Tapp)
  collisions: 0,
  effectiveIter: 1,      // R menos los choques -- lo que de verdad se simula al medir

  braking: false,        // freno de mano reusado como freno real (frena el avance)

  lanePos: 1.5,           // posición continua del auto (para animar el deslizamiento)
  laneTarget: 1,

  obstacles: [],          // olas generadas por generateObstacles()

  timeLimitMs: 0,
  roundDeadline: 0,
  courseDurationSec: 1,
  trackProgress: 0,       // 0..1, avanza según courseDurationSec (lo frena el freno)

  measuring: false,
  autoFinishArmed: false,
  crashFlashUntil: 0,

  measuredIndex: null,
  lastWin: null,
};

const particles = [];
let lastTs = performance.now();

// ---------------------------------------------------------------------
// MATEMÁTICA DE GROVER: bbhtOptimalIterations alimenta el HUD y genera
// la pista de obstáculos; measureLocally simula el circuito completo
// (amplitudes reales, oráculo + difusión) con las iteraciones efectivas
// para decidir la medición final -- todo en el cliente, sin backend.
// ---------------------------------------------------------------------
function bbhtOptimalIterations(n) {
  const N = 2 ** n;
  const theta = Math.asin(1 / Math.sqrt(N));
  const R = Math.round(Math.PI / 4 / theta - 0.5);
  return Math.max(1, R);
}

// Simula H^n + R iteraciones de oráculo/difusión sobre N amplitudes
// reales y devuelve una medición pesada por |amp|², igual que colapsaría
// un circuito real de Grover con ese mismo número de iteraciones.
function measureLocally(N, target, iterations) {
  let amp = new Array(N).fill(1 / Math.sqrt(N));
  for (let k = 0; k < iterations; k++) {
    amp[target] *= -1;
    const mean = amp.reduce((s, v) => s + v, 0) / N;
    amp = amp.map((v) => 2 * mean - v);
  }
  const probs = amp.map((v) => v * v);
  return { probs, measuredIndex: weightedRandomIndex(probs) };
}

function weightedRandomIndex(weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return Math.floor(Math.random() * weights.length);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

// Genera la red de obstáculos: una ola por cada iteración real de Grover
// (R), separadas a lo largo de la pista como los bloques repetidos del
// diagrama del circuito. Cada ola bloquea todos los carriles salvo un
// hueco (gap) que serpentea de una ola a la siguiente -- el jugador debe
// verlo y esquivar, el juego no marca cuál es el "correcto".
function generateObstacles() {
  const N = state.N;
  const R = state.optimalIter;
  const gapW = Math.max(2, Math.min(N, Math.round(N * CONFIG.gapFraction)));
  const waves = [];
  let center = Math.floor(Math.random() * N);
  for (let r = 0; r < R; r++) {
    center += Math.floor(Math.random() * 5) - 2; // serpentea -2..+2 carriles
    center = Math.max(Math.floor(gapW / 2), Math.min(N - 1 - Math.floor(gapW / 2), center));
    const gapStart = Math.max(0, Math.min(N - gapW, center - Math.floor(gapW / 2)));
    const blocked = new Set();
    for (let i = 0; i < N; i++) {
      if (i < gapStart || i >= gapStart + gapW) blocked.add(i);
    }
    waves.push({
      frac: (r + 1) / (R + 1), // posición 0..1 a lo largo de la pista
      gapStart, gapW, blocked,
      passed: false,
    });
  }
  return waves;
}

// ---------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------
const els = {};
function cacheEls() {
  [
    "screen-start", "game-root", "screen-result",
    "btn-play", "btn-restart", "btn-retry", "btn-next",
    "btn-hadamard", "img-hadamard",
    "btn-handbrake", "img-lever",
    "btn-steer-left", "btn-steer-right", "img-wheel",
    "btn-accel",
    "hud-n", "hud-iter", "hud-opt", "hud-engine",
    "hud-timer-fill", "hud-timer-label",
    "toast",
    "result-eyebrow", "result-title", "result-text",
    "track-canvas", "compass-canvas", "circuit-canvas",
    "server-warning", "server-warning-url",
  ].forEach((id) => (els[id] = document.getElementById(id)));
}

function showScreenEl(id) {
  ["screen-start", "game-root", "screen-result"].forEach((s) =>
    els[s].classList.toggle("hidden", s !== id)
  );
  state.screen = id;
  // los canvas quedan en 0x0 mientras #game-root tiene display:none;
  // hay que recalcular su tamaño justo al volverse visibles.
  if (id === "game-root") {
    resizeTrackCanvas();
    resizeCompassCanvas();
    resizeCircuitCanvas();
  }
}

let toastTimer = null;
function toast(msg, kind) {
  const t = els["toast"];
  t.textContent = msg;
  t.className = "toast show" + (kind ? " " + kind : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

function setControlsEnabled(on) {
  els["btn-handbrake"].disabled = !on;
  els["btn-steer-left"].disabled = !on;
  els["btn-steer-right"].disabled = !on;
  els["btn-accel"].disabled = !on;
}

function updateHud() {
  els["hud-n"].textContent = state.N;
  els["hud-iter"].textContent = state.collisions;
  els["hud-opt"].textContent = state.optimalIter;
  els["hud-engine"].textContent = state.engineOn ? "encendido" : "apagado";
}

function updateTimerHud() {
  if (!state.engineOn) {
    els["hud-timer-fill"].style.width = "0%";
    els["hud-timer-label"].textContent = "--";
    return;
  }
  const remaining = Math.max(0, state.roundDeadline - performance.now());
  const frac = state.timeLimitMs > 0 ? remaining / state.timeLimitMs : 0;
  els["hud-timer-fill"].style.width = `${(frac * 100).toFixed(1)}%`;
  els["hud-timer-fill"].classList.toggle("low", frac < 0.25);
  els["hud-timer-label"].textContent = `${(remaining / 1000).toFixed(1)}s`;
  return remaining;
}

function updateControlVisuals() {
  els["img-hadamard"].src = state.engineOn
    ? "assets/img/btn_hadamard_on.png"
    : "assets/img/btn_hadamard_off.png";
  els["btn-hadamard"].classList.toggle("on", state.engineOn);

  els["img-lever"].src = state.braking
    ? "assets/img/lever_oraculo_on.png"
    : "assets/img/lever_oraculo_off.png";
  els["btn-handbrake"].classList.toggle("braking", state.braking);

  els["btn-accel"].classList.toggle("ready", state.engineOn);
}

function setWheelVisual(dir) {
  els["img-wheel"].src =
    dir < 0
      ? "assets/img/wheel_izquierda.png"
      : dir > 0
      ? "assets/img/wheel_derecha.png"
      : "assets/img/wheel_neutro.png";
}
let wheelResetTimer = null;
function flashWheel(dir) {
  setWheelVisual(dir);
  clearTimeout(wheelResetTimer);
  wheelResetTimer = setTimeout(() => setWheelVisual(0), 320);
}

// ---------------------------------------------------------------------
// FLUJO DE RONDA / NIVEL
// ---------------------------------------------------------------------
function resetRound(n) {
  state.n = n;
  state.N = 2 ** n;
  state.target = Math.floor(Math.random() * state.N);
  state.engineOn = false;
  state.optimalIter = bbhtOptimalIterations(n);
  state.collisions = 0;
  state.effectiveIter = state.optimalIter;
  state.braking = false;
  state.lanePos = (state.N - 1) / 2;
  state.laneTarget = Math.round(state.lanePos);
  state.obstacles = [];
  state.timeLimitMs = 0;
  state.roundDeadline = 0;
  state.courseDurationSec = 1;
  state.trackProgress = 0;
  state.measuring = false;
  state.autoFinishArmed = false;
  state.crashFlashUntil = 0;
  state.measuredIndex = null;
  particles.length = 0;

  setControlsEnabled(false);
  setWheelVisual(0);
  updateHud();
  updateTimerHud();
  updateControlVisuals();
}

function nextLevelAvailable() {
  return state.levelIndex < CONFIG.levels.length - 1;
}

function hadamardInit() {
  state.engineOn = true;
  state.collisions = 0;
  state.effectiveIter = state.optimalIter;
  state.obstacles = generateObstacles();
  state.trackProgress = 0;
  state.timeLimitMs = (state.optimalIter + CONFIG.extraBufferIterations) * CONFIG.secondsPerIteration * 1000;
  state.roundDeadline = performance.now() + state.timeLimitMs;
  state.courseDurationSec = state.timeLimitMs / 1000;
  setControlsEnabled(true);
  toast("Motor encendido — esquiva los obstáculos hasta la meta.", "good");
}

// El volante solo responde con el freno activo -- es un drift real:
// primero frenás, después girás. Sin freno, tocar el volante no hace nada.
function attemptSteer(dir) {
  if (!state.engineOn || state.measuring || !state.braking) return;
  const next = Math.max(0, Math.min(state.N - 1, state.laneTarget + dir));
  if (next !== state.laneTarget) spawnDust(dir);
  state.laneTarget = next;
  flashWheel(dir);
}

let steerHoldTimer = null;
function startSteerHold(dir) {
  attemptSteer(dir);
  clearInterval(steerHoldTimer);
  steerHoldTimer = setInterval(() => attemptSteer(dir), CONFIG.steerRepeatMs);
}
function stopSteerHold() {
  clearInterval(steerHoldTimer);
  steerHoldTimer = null;
}

function checkCollisions() {
  for (const wave of state.obstacles) {
    if (wave.passed) continue;
    if (state.trackProgress < wave.frac) continue;
    wave.passed = true;
    const lane = Math.max(0, Math.min(state.N - 1, Math.round(state.lanePos)));
    if (wave.blocked.has(lane)) {
      state.collisions++;
      state.effectiveIter = Math.max(0, state.effectiveIter - 1);
      state.crashFlashUntil = performance.now() + 350;
      spawnCrash();
      updateHud();
    }
  }
}

// La medición final simula el circuito completo con las iteraciones
// efectivas (R menos los choques) y toma una muestra pesada por |amp|²,
// igual que colapsaría un circuito real de Grover. Queda 100% en el
// cliente para poder jugarse standalone (p.ej. en GitHub Pages).
function finishRound() {
  if (!state.engineOn || state.measuring) return;
  state.measuring = true;
  setControlsEnabled(false);
  toast("Midiendo…", null);

  const { probs, measuredIndex } = measureLocally(state.N, state.target, state.effectiveIter);
  const targetBits = state.target.toString(2).padStart(state.n, "0");
  const measuredBits = measuredIndex.toString(2).padStart(state.n, "0");
  const data = {
    n: state.n,
    N: state.N,
    target_index: state.target,
    target_bits: targetBits,
    iterations: state.effectiveIter,
    measured_index: measuredIndex,
    measured_bits: measuredBits,
    success: measuredIndex === state.target,
    success_probability: probs[state.target],
  };

  state.measuring = false;
  state.measuredIndex = measuredIndex;
  state.laneTarget = measuredIndex; // el auto se desliza al carril medido
  setTimeout(() => showResult(data), CONFIG.revealMs);
}

function showResult(data) {
  state.lastWin = data.success;
  const probPct = (data.success_probability * 100).toFixed(0);
  const crashNote = state.collisions > 0
    ? `${state.collisions} choque(s) te costaron precisión (quedaron ${data.iterations} de ${state.optimalIter} iteraciones).`
    : `esquivaste todo — corriste las ${data.iterations} iteraciones completas.`;

  els["result-eyebrow"].textContent = data.success ? "Medición exitosa" : "Medición fallida";
  els["result-title"].textContent = data.success
    ? `Carril ${data.measured_index + 1} — ¡correcto!`
    : `Carril ${data.measured_index + 1} — no era`;

  if (data.success) {
    els["result-text"].textContent =
      `La superposición (${data.n} qubits) colapsó en el carril correcto al medir; ${crashNote} ` +
      `Probabilidad de éxito: ${probPct}%.`;
  } else {
    els["result-text"].textContent =
      `El carril correcto era el ${data.target_index + 1} (bits ${data.target_bits}). Se midió ${probPct}% ` +
      `de probabilidad ahí; ${crashNote}`;
  }

  els["btn-next"].textContent = data.success
    ? nextLevelAvailable()
      ? "Siguiente nivel →"
      : "Jugar de nuevo (nivel 1)"
    : "Reintentar";

  showScreenEl("screen-result");
}

// ---------------------------------------------------------------------
// PARTÍCULAS
// ---------------------------------------------------------------------
function spawnCrash() {
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 100;
    particles.push({
      x: 0, y: 0,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      life: 1, color: "#ff8a5a",
    });
  }
}
function spawnDust(dir) {
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (Math.random() - 0.5) * 0.6 - dir * 0.3;
    const speed = 20 + Math.random() * 30;
    particles.push({
      x: 0, y: 0,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      life: 0.6, color: "#7fb8cc",
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.life -= dt / 0.5;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// ---------------------------------------------------------------------
// DIBUJO
// ---------------------------------------------------------------------
const MONO = "600 11px Consolas, 'SFMono-Regular', ui-monospace, monospace";
let carSprite = null;
if (CONFIG.carSpriteSrc) {
  carSprite = new Image();
  carSprite.src = CONFIG.carSpriteSrc;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCarPlaceholder(ctx, scale) {
  ctx.save();
  ctx.scale(scale, scale);
  ctx.fillStyle = "#49d3ff";
  ctx.strokeStyle = "#062330";
  ctx.lineWidth = 2;
  roundRectPath(ctx, -10, -16, 20, 32, 7);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = "rgba(6,35,48,.85)";
  roundRectPath(ctx, -6, -8, 12, 10, 3);
  ctx.fill();
  ctx.fillStyle = "#0b1116";
  [[-12, -11], [8, -11], [-12, 7], [8, 7]].forEach(([wx, wy]) => {
    roundRectPath(ctx, wx, wy, 4, 10, 2);
    ctx.fill();
  });
  ctx.restore();
}

function drawCar(ctx, x, y, alpha) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = alpha;
  if (carSprite && carSprite.complete && carSprite.naturalWidth) {
    const s = 34 / carSprite.naturalWidth;
    ctx.drawImage(
      carSprite,
      (-carSprite.naturalWidth * s) / 2,
      (-carSprite.naturalHeight * s) / 2,
      carSprite.naturalWidth * s,
      carSprite.naturalHeight * s
    );
  } else {
    drawCarPlaceholder(ctx, 1);
  }
  ctx.restore();
}

function laneX(i, left, laneW) {
  return left + (i + 0.5) * laneW;
}

function trackGeometry(w, h) {
  const left = Math.max(24, w * 0.08);
  const right = w - left;
  const laneW = (right - left) / state.N;
  const metaY = h * 0.1;
  const startY = h * 0.9;
  return { left, right, laneW, metaY, startY };
}

function drawObstacle(ctx, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(255,90,90,.28)";
  ctx.strokeStyle = "rgba(255,138,90,.85)";
  ctx.lineWidth = 2;
  roundRectPath(ctx, -size / 2, -size / 2, size, size, 5);
  ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-size * 0.22, -size * 0.22);
  ctx.lineTo(size * 0.22, size * 0.22);
  ctx.moveTo(size * 0.22, -size * 0.22);
  ctx.lineTo(-size * 0.22, size * 0.22);
  ctx.strokeStyle = "rgba(255,180,150,.9)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function renderTrack(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  const { left, right, laneW, metaY, startY } = trackGeometry(w, h);

  // asfalto
  ctx.fillStyle = "rgba(255,255,255,.02)";
  ctx.fillRect(left, metaY, right - left, startY - metaY);

  // carriles
  for (let i = 0; i <= state.N; i++) {
    const x = left + i * laneW;
    ctx.beginPath();
    ctx.moveTo(x, metaY);
    ctx.lineTo(x, startY);
    ctx.strokeStyle = "rgba(207,214,224,.16)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 10]);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // meta
  ctx.beginPath();
  ctx.moveTo(left, metaY);
  ctx.lineTo(right, metaY);
  ctx.strokeStyle = "rgba(52,224,122,.55)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "rgba(52,224,122,.85)";
  ctx.font = MONO;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText("META", (left + right) / 2, metaY - 6);

  // números de carril
  ctx.fillStyle = "rgba(255,255,255,.4)";
  ctx.textBaseline = "top";
  for (let i = 0; i < state.N; i++) {
    ctx.fillText(String(i + 1), laneX(i, left, laneW), startY + 8);
  }

  // red de obstáculos (una ola por iteración real de Grover)
  if (state.engineOn) {
    const obSize = Math.min(laneW * 0.72, 30);
    for (const wave of state.obstacles) {
      const y = startY - (startY - metaY) * wave.frac;
      for (const i of wave.blocked) {
        drawObstacle(ctx, laneX(i, left, laneW), y, obSize);
      }
    }
  }

  // resaltar carril correcto/medido al revelar resultado
  if (state.measuredIndex !== null && (state.screen === "screen-result" || state.measuring)) {
    const ok = state.measuredIndex === state.target;
    ctx.fillStyle = ok ? "rgba(52,224,122,.18)" : "rgba(255,90,90,.18)";
    ctx.fillRect(left + state.measuredIndex * laneW, metaY, laneW, startY - metaY);
  }

  // auto principal
  const carY = startY - (startY - metaY) * Math.min(1, state.trackProgress);
  const carX = laneX(state.lanePos, left, laneW);

  ctx.save();
  ctx.translate(carX, carY);
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life) * 0.6;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  drawCar(ctx, carX, carY, state.engineOn ? 1 : 0.85);

  // destello rojo al chocar
  if (performance.now() < state.crashFlashUntil) {
    const t = (state.crashFlashUntil - performance.now()) / 350;
    ctx.fillStyle = `rgba(255,60,60,${0.22 * t})`;
    ctx.fillRect(0, 0, w, h);
  }
}

// Brújula EXTERNA: franja separada de la pista. Nunca indica un carril
// ni un porcentaje de certeza -- solo se ilumina cada vez más a medida
// que te acercás al resultado final (meta o se acaba el tiempo), como
// una tensión ambiental, sin delatar si vas bien o mal.
function renderCompass(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  const left = Math.max(24, w * 0.08);
  const right = w - left;
  const laneW = (right - left) / state.N;
  const midY = h / 2;

  ctx.beginPath();
  ctx.moveTo(left, midY);
  ctx.lineTo(right, midY);
  ctx.strokeStyle = "rgba(255,255,255,.14)";
  ctx.lineWidth = 2;
  ctx.stroke();

  for (let i = 0; i <= state.N; i++) {
    const x = left + i * laneW;
    ctx.beginPath();
    ctx.moveTo(x, midY - 6);
    ctx.lineTo(x, midY + 6);
    ctx.strokeStyle = "rgba(255,255,255,.18)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  const remaining = state.timeLimitMs > 0 ? Math.max(0, state.roundDeadline - performance.now()) / state.timeLimitMs : 1;
  const proximity = state.engineOn ? Math.max(state.trackProgress, 1 - remaining) : 0;
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / (260 - proximity * 160));
  const glow = state.engineOn ? proximity * (0.5 + 0.5 * pulse) : 0;

  const grad = ctx.createLinearGradient(left, 0, right, 0);
  grad.addColorStop(0, "rgba(73,211,255,0)");
  grad.addColorStop(0.5, `rgba(73,211,255,${0.12 + glow * 0.55})`);
  grad.addColorStop(1, "rgba(73,211,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(left, midY - 16, right - left, 32);

  ctx.fillStyle = "rgba(255,255,255,.55)";
  ctx.font = MONO;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("brújula externa", left, 14);
}

// Gráfico chico del circuito: un carril por qubit de datos + la ancilla,
// con un bloque naranja (oráculo) y uno verde (difusor) por cada
// iteración real -- el mismo patrón que genera la red de obstáculos.
function renderCircuitDiagram(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  const wires = state.n + 1;
  const padY = 6;
  const wireGap = wires > 1 ? (h - padY * 2) / (wires - 1) : 0;
  const padX = 5;

  ctx.strokeStyle = "rgba(255,255,255,.3)";
  ctx.lineWidth = 1;
  for (let i = 0; i < wires; i++) {
    const y = padY + i * wireGap;
    ctx.beginPath();
    ctx.moveTo(padX, y);
    ctx.lineTo(w - padX, y);
    ctx.stroke();
  }

  let x = padX + 8;
  ctx.fillStyle = "rgba(73,211,255,.9)";
  for (let i = 0; i < wires; i++) {
    const y = padY + i * wireGap;
    roundRectPath(ctx, x - 3, y - 3, 6, 6, 1.5);
    ctx.fill();
  }
  x += 12;

  const R = Math.max(1, state.optimalIter);
  const avail = Math.max(4, w - padX - 4 - x);
  const blockW = Math.max(4, avail / (R * 2.4));
  const blockH = h - padY * 2 + 6;

  for (let r = 0; r < R; r++) {
    ctx.fillStyle = "rgba(255,138,90,.55)";
    ctx.fillRect(x, padY - 3, blockW, blockH);
    x += blockW * 1.15;
    ctx.fillStyle = "rgba(52,224,122,.5)";
    ctx.fillRect(x, padY - 3, blockW, blockH);
    x += blockW * 1.25;
  }
}

// ---------------------------------------------------------------------
// CANVAS SETUP + LOOP
// ---------------------------------------------------------------------
function setupCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize);
  return { ctx, resize };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

let trackCtx, compassCtx, circuitCtx, resizeTrackCanvas, resizeCompassCanvas, resizeCircuitCanvas;

function loop(ts) {
  const dt = Math.min(0.05, (ts - lastTs) / 1000);
  lastTs = ts;

  try {
    if (state.screen === "game-root") {
      updateParticles(dt);
      const rate = 1 - Math.exp(-CONFIG.laneLerpRate * dt);
      state.lanePos = lerp(state.lanePos, state.laneTarget, rate);

      if (state.engineOn && !state.measuring) {
        if (state.braking && Math.random() < CONFIG.brakeDropChancePerSec * dt) {
          state.braking = false;
          updateControlVisuals();
          toast("¡El freno se soltó! Actívalo de nuevo para girar.", "warn");
        }
        const brakeMul = state.braking ? CONFIG.brakeFactor : 1;
        state.trackProgress = Math.min(1, state.trackProgress + (dt / state.courseDurationSec) * brakeMul);
        checkCollisions();

        const remaining = updateTimerHud();
        // Se dispara UNA sola vez al agotarse el tiempo o al llegar a la
        // meta -- sin este guard, cada frame con la condición cumplida
        // volvería a llamar finishRound().
        if ((remaining <= 0 || state.trackProgress >= 1) && !state.autoFinishArmed) {
          state.autoFinishArmed = true;
          finishRound();
        }
      }

      renderTrack(trackCtx, els["track-canvas"].clientWidth, els["track-canvas"].clientHeight);
      // finishRound() nunca oculta #game-root de inmediato (el resultado se
      // muestra tras un setTimeout), así que el compás siempre tiene tamaño
      // válido aquí.
      if (state.screen === "game-root") {
        renderCompass(compassCtx, els["compass-canvas"].clientWidth, els["compass-canvas"].clientHeight);
        renderCircuitDiagram(circuitCtx, els["circuit-canvas"].clientWidth, els["circuit-canvas"].clientHeight);
      }
    }
  } catch (err) {
    // un fallo de un frame no debe congelar el juego entero (rAF nunca
    // más se reprograma si esta función lanza sin capturarlo).
    console.error("loop() error:", err);
  }
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------------
// INPUT
// ---------------------------------------------------------------------
function wire() {
  els["btn-play"].addEventListener("click", () => showScreenEl("game-root"));

  els["btn-hadamard"].addEventListener("click", () => {
    if (state.engineOn) return;
    hadamardInit();
    updateControlVisuals();
    updateHud();
  });

  // Freno de mano: freno real (frena el avance por la pista mientras se
  // mantiene armado), no algo ligado al oráculo -- toggle por clic, no
  // por sostener, para que funcione igual con mouse que con pantalla táctil.
  els["btn-handbrake"].addEventListener("click", () => {
    if (!state.engineOn || state.measuring) return;
    state.braking = !state.braking;
    updateControlVisuals();
  });

  els["btn-steer-left"].addEventListener("pointerdown", (e) => { e.preventDefault(); startSteerHold(-1); });
  els["btn-steer-right"].addEventListener("pointerdown", (e) => { e.preventDefault(); startSteerHold(1); });
  ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => {
    els["btn-steer-left"].addEventListener(ev, stopSteerHold);
    els["btn-steer-right"].addEventListener(ev, stopSteerHold);
  });

  els["btn-accel"].addEventListener("click", finishRound);

  els["btn-restart"].addEventListener("click", () => resetRound(state.n));

  els["btn-retry"].addEventListener("click", () => {
    resetRound(state.n);
    showScreenEl("game-root");
  });

  els["btn-next"].addEventListener("click", () => {
    const won = !!state.lastWin;
    if (won && nextLevelAvailable()) {
      state.levelIndex++;
    } else if (won) {
      state.levelIndex = 0;
    }
    resetRound(CONFIG.levels[state.levelIndex]);
    showScreenEl("game-root");
  });
}

// ---------------------------------------------------------------------
// SALUD DEL BACKEND
// ---------------------------------------------------------------------
// Error recurrente en la práctica: el jugador corre "python -m
// http.server" (el módulo genérico de Python) en vez de "python
// server.py" -- la página carga bien (sirve los mismos archivos
// estáticos) pero /api/measure no existe, así que recién se entera del
// problema al final de la partida, al intentar medir. Esto lo detecta
// apenas carga la página y lo avisa de entrada, sin esperar a jugar.
async function checkBackendHealth() {
  els["server-warning-url"].textContent = location.origin + "/";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);
  try {
    const resp = await fetch("/api/optimal?n=2", { signal: controller.signal });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const data = await resp.json();
    if (typeof data.R !== "number") throw new Error("respuesta inesperada");
  } catch (err) {
    console.warn("checkBackendHealth: el backend de Qiskit no respondió como se esperaba —", err.message);
    els["server-warning"].classList.remove("hidden");
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------
// INIT
// ---------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  cacheEls();
  ({ ctx: trackCtx, resize: resizeTrackCanvas } = setupCanvas(els["track-canvas"]));
  ({ ctx: compassCtx, resize: resizeCompassCanvas } = setupCanvas(els["compass-canvas"]));
  ({ ctx: circuitCtx, resize: resizeCircuitCanvas } = setupCanvas(els["circuit-canvas"]));
  wire();
  resetRound(CONFIG.levels[state.levelIndex]);
  showScreenEl("screen-start");
  checkBackendHealth();
  requestAnimationFrame((ts) => {
    lastTs = ts;
    loop(ts);
  });
});
