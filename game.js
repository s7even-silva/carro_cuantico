"use strict";
/* =====================================================================
   Circuito Cuántico — Nivel 1: Grover / Modo Drift
   Simulación real de una iteración de Grover (oráculo + difusión)
   manejada como mecánica de derrape de auto.
   =====================================================================
   HUECO PARA TU SPRITE DEL VEHÍCULO
   ----------------------------------
   No se usa ningún sprite de auto todavía a propósito. Para conectar el
   tuyo: pon el archivo en assets/img/ (ideal: vista top-down, apuntando
   "hacia arriba" en su pose por defecto) y escribe la ruta abajo en
   CONFIG.carSpriteSrc. El auto se dibuja rotado automáticamente según
   hacia dónde apunta (drawCar / carSprite.onload). Si lo dejas en null,
   se usa un auto de relleno dibujado a mano (drawCarPlaceholder).
   =====================================================================*/

const CONFIG = {
  levels: [4, 8, 16],           // progresión de N (Nivel 1)
  comboCooldown: 650,           // ms entre iteraciones de Grover (derrapes)
  headingLerpRate: 5.5,         // qué tan rápido gira el auto hacia el rumbo
  accelDuration: 850,           // ms de animación al acelerar / medir
  carSpriteSrc: null,           // <-- HUECO: ruta a tu sprite del auto (o null)
};

// ---------------------------------------------------------------------
// ESTADO
// ---------------------------------------------------------------------
const state = {
  screen: "start",     // start | game-root | result
  levelIndex: 0,
  N: 4,
  target: 0,
  amp: [],
  engineOn: false,
  iterations: 0,
  optimalIter: 1,
  // El freno de mano es un interruptor de "armado" (click para activar/
  // desactivar), no algo que se sostiene: con mouse real solo hay un
  // cursor, así que "sostener freno + volante" a la vez es imposible de
  // probar/jugar. Armado + un toque de volante = combo (derrape).
  oracleArmed: false,
  comboHappenedThisArm: false,
  comboCooldownUntil: 0,
  carHeading: -Math.PI / 2,
  carHeadingTarget: -Math.PI / 2,
  driftFlashUntil: 0,
  accelerating: false,
  accelStart: 0,
  measuredGate: null,
};

const hints = { steerAlone: false, handbrakeAlone: false };
const particles = [];
let lastTs = performance.now();

// ---------------------------------------------------------------------
// MATEMÁTICA DE GROVER
// ---------------------------------------------------------------------
function gateAngle(i) {
  return -Math.PI / 2 + i * ((2 * Math.PI) / state.N);
}

function hadamardInit() {
  const a = 1 / Math.sqrt(state.N);
  state.amp = new Array(state.N).fill(a);
  state.engineOn = true;
  state.iterations = 0;
  setControlsEnabled(true);
  toast("Motor encendido — superposición uniforme creada.", "good");
}

function groverIteration() {
  // oráculo: invierte el signo de la puerta correcta (invisible en |amp|²)
  state.amp[state.target] *= -1;
  // difusión: inversión respecto al promedio
  const mean = state.amp.reduce((s, v) => s + v, 0) / state.N;
  state.amp = state.amp.map((v) => 2 * mean - v);
  state.iterations++;
}

function probabilities() {
  return state.amp.map((v) => v * v);
}

// Nº de derrapes (iteraciones de Grover) que maximiza la probabilidad,
// calculado simulando la recurrencia real en vez de una fórmula cerrada
// (la fórmula π/4·√N es solo asintótica y falla para N pequeño, p.ej. N=4
// necesita exactamente 1 iteración para 100%, no 2).
function computeOptimalIter(N) {
  let amp = new Array(N).fill(1 / Math.sqrt(N));
  let bestK = 0, bestP = amp[0] * amp[0];
  const cap = Math.ceil((Math.PI / 2) * Math.sqrt(N)) + 3;
  for (let k = 1; k <= cap; k++) {
    amp[0] *= -1;
    const mean = amp.reduce((s, v) => s + v, 0) / N;
    amp = amp.map((v) => 2 * mean - v);
    const p = amp[0] * amp[0];
    if (p > bestP) { bestP = p; bestK = k; } else break;
  }
  return Math.max(1, bestK);
}

function resultantVector() {
  const probs = probabilities();
  let x = 0,
    y = 0;
  for (let i = 0; i < state.N; i++) {
    const ang = gateAngle(i);
    x += probs[i] * Math.cos(ang);
    y += probs[i] * Math.sin(ang);
  }
  return { x, y, angle: Math.atan2(y, x), mag: Math.hypot(x, y) };
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
    "toast",
    "result-eyebrow", "result-title", "result-text",
    "track-canvas", "compass-canvas",
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
  els["hud-iter"].textContent = state.iterations;
  els["hud-opt"].textContent = state.optimalIter;
  els["hud-engine"].textContent = state.engineOn ? "encendido" : "apagado";
}

function updateControlVisuals() {
  els["img-hadamard"].src = state.engineOn
    ? "assets/img/btn_hadamard_on.png"
    : "assets/img/btn_hadamard_off.png";
  els["btn-hadamard"].classList.toggle("on", state.engineOn);

  els["img-lever"].src = state.oracleArmed
    ? "assets/img/lever_oraculo_on.png"
    : "assets/img/lever_oraculo_off.png";
  els["btn-handbrake"].classList.toggle("armed", state.oracleArmed);

  els["btn-accel"].classList.toggle("ready", state.engineOn && state.iterations > 0);
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
function resetRound(N) {
  state.N = N;
  state.target = Math.floor(Math.random() * N);
  state.amp = new Array(N).fill(0);
  state.engineOn = false;
  state.iterations = 0;
  state.optimalIter = computeOptimalIter(N);
  state.oracleArmed = false;
  state.comboHappenedThisArm = false;
  state.comboCooldownUntil = 0;
  state.carHeading = -Math.PI / 2;
  state.carHeadingTarget = -Math.PI / 2;
  state.accelerating = false;
  state.measuredGate = null;
  particles.length = 0;

  setControlsEnabled(false);
  setWheelVisual(0);
  updateHud();
  updateControlVisuals();
}

function nextLevelAvailable() {
  return state.levelIndex < CONFIG.levels.length - 1;
}

// Se llama con cada toque del volante (dir = -1 izquierda / 1 derecha).
// Si el oráculo está armado, ese toque completa el combo (derrape real:
// oráculo + difusión = una iteración de Grover). Si no, es cosmético.
function attemptSteer(dir) {
  if (!state.engineOn || state.accelerating) return;
  flashWheel(dir);

  if (!state.oracleArmed) {
    if (!hints.steerAlone) {
      hints.steerAlone = true;
      toast("Girar solo casi no hace nada sin el freno de mano armado.", "warn");
    }
    return;
  }

  const now = performance.now();
  if (now < state.comboCooldownUntil) return;

  state.comboCooldownUntil = now + CONFIG.comboCooldown;
  state.comboHappenedThisArm = true;
  groverIteration();
  state.driftFlashUntil = now + 500;
  spawnSkid(dir);
  updateHud();

  const res = resultantVector();
  if (res.mag > 0.05) state.carHeadingTarget = res.angle;

  if (state.iterations === state.optimalIter) {
    const p = Math.max(...probabilities());
    toast(`Alineado — probabilidad ≈ ${(p * 100).toFixed(0)}%. ¡Acelera!`, "good");
  } else if (state.iterations > state.optimalIter) {
    toast("Te pasaste de vueltas: la probabilidad ya está bajando.", "warn");
  }
}

function accelerate() {
  if (!state.engineOn || state.accelerating) return;
  const probs = probabilities();
  const measured = weightedRandomIndex(probs);
  state.measuredGate = measured;
  state.accelerating = true;
  state.accelStart = performance.now();
  state.carHeadingTarget = gateAngle(measured);
  if (state.iterations === 0) {
    toast("Midiendo sin derrapes: todas las puertas son igual de probables.", "warn");
  } else {
    toast("Midiendo…", null);
  }
}

function resolveMeasurement() {
  state.accelerating = false;
  const win = state.measuredGate === state.target;
  showResult(win);
}

function showResult(win) {
  state.lastWin = win;
  const probPct = (probabilities()[state.measuredGate] * 100).toFixed(0);
  els["result-eyebrow"].textContent = win ? "Medición exitosa" : "Medición fallida";
  els["result-title"].textContent = win
    ? `Puerta ${state.measuredGate + 1} — ¡correcta!`
    : `Puerta ${state.measuredGate + 1} — no era`;

  if (win) {
    els["result-text"].textContent =
      `Colapsaste el estado en la puerta correcta tras ${state.iterations} derrape(s) ` +
      `(óptimo ≈ ${state.optimalIter} para N=${state.N}). Probabilidad al medir: ${probPct}%.`;
  } else {
    const tip =
      state.iterations > state.optimalIter
        ? "Te pasaste de vueltas — la probabilidad ya iba de bajada."
        : state.iterations < state.optimalIter
        ? "Faltaron derrapes: la probabilidad todavía no se concentraba en una puerta."
        : "Mala suerte en la medición — con esa probabilidad a veces falla.";
    els["result-text"].textContent =
      `La puerta correcta era la ${state.target + 1}. Mediste con ${state.iterations} derrape(s) ` +
      `(óptimo ≈ ${state.optimalIter}) y ${probPct}% de probabilidad en la puerta ${state.measuredGate + 1}. ${tip}`;
  }

  els["btn-next"].textContent = win
    ? nextLevelAvailable()
      ? "Siguiente puerta →"
      : "Jugar de nuevo (N=4)"
    : "Reintentar";

  showScreenEl("screen-result");
}

// ---------------------------------------------------------------------
// PARTÍCULAS DE DERRAPE
// ---------------------------------------------------------------------
function spawnSkid(dir) {
  for (let i = 0; i < 10; i++) {
    const a = state.carHeading + Math.PI + (Math.random() - 0.5) * 1.4 - dir * 0.3;
    const speed = 40 + Math.random() * 60;
    particles.push({
      x: 0, y: 0,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      life: 1, born: performance.now(),
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

function drawCar(ctx, x, y, heading, alpha) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading + Math.PI / 2);
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

function drawGate(ctx, cx, cy, R, i) {
  const ang = gateAngle(i);
  const x = cx + Math.cos(ang) * R;
  const y = cy + Math.sin(ang) * R;

  let fill = "rgba(35,38,44,.92)";
  let stroke = "rgba(255,255,255,.22)";
  if (state.measuredGate === i && state.screen === "screen-result") {
    fill = i === state.target ? "rgba(52,224,122,.9)" : "rgba(255,90,90,.9)";
    stroke = "#fff";
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang + Math.PI / 2);
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  roundRectPath(ctx, -16, -7, 32, 14, 4);
  ctx.fill(); ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "rgba(255,255,255,.6)";
  ctx.font = MONO;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(i + 1), x, y);
}

function renderTrack(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2 + 6;
  const R = Math.min(w, h) * 0.36;

  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(207,214,224,.16)";
  ctx.lineWidth = 3;
  ctx.setLineDash([9, 11]);
  ctx.stroke();
  ctx.setLineDash([]);

  const probs = probabilities();
  if (state.engineOn) {
    for (let i = 0; i < state.N; i++) {
      const p = probs[i];
      if (p < 0.008) continue;
      const ang = gateAngle(i);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
      ctx.strokeStyle = `rgba(73,211,255,${Math.min(0.55, p * 1.3)})`;
      ctx.lineWidth = 1.5 + p * 9;
      ctx.stroke();
    }
  }

  for (let i = 0; i < state.N; i++) drawGate(ctx, cx, cy, R, i);

  let carX = cx, carY = cy;
  if (state.accelerating) {
    const t = Math.min(1, (performance.now() - state.accelStart) / CONFIG.accelDuration);
    const te = t * t * (3 - 2 * t);
    const ang = gateAngle(state.measuredGate);
    carX = cx + Math.cos(ang) * R * te;
    carY = cy + Math.sin(ang) * R * te;
    if (t >= 1) resolveMeasurement();
  }

  ctx.save();
  ctx.translate(carX, carY);
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life) * 0.5;
    ctx.strokeStyle = "#ffd98a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  drawCar(ctx, carX, carY, state.carHeading, state.engineOn ? 1 : 0.85);
}

function renderCompass(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, R = Math.max(1, Math.min(w, h) / 2 - 10);
  const probs = probabilities();

  for (let i = 0; i < state.N; i++) {
    const ang = gateAngle(i);
    const p = probs[i] || 0;
    const x1 = cx + Math.cos(ang) * (R - 7), y1 = cy + Math.sin(ang) * (R - 7);
    const x2 = cx + Math.cos(ang) * R, y2 = cy + Math.sin(ang) * R;
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = `rgba(73,211,255,${0.25 + p * 0.85})`;
    ctx.lineWidth = 1.4 + p * 4;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,.15)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,.45)";
  ctx.font = "600 9px Consolas, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("N", cx, cy - R + 9);

  const res = resultantVector();
  const mag = Math.min(1, res.mag);
  if (mag > 0.03) {
    const nx = cx + Math.cos(res.angle) * R * 0.72 * mag;
    const ny = cy + Math.sin(res.angle) * R * 0.72 * mag;
    ctx.beginPath();
    ctx.moveTo(cx, cy); ctx.lineTo(nx, ny);
    ctx.strokeStyle = "#49d3ff";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(nx, ny, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#49d3ff";
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fillStyle = state.engineOn ? "#34e07a" : "#555";
  ctx.fill();
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

function lerpAngle(a, b, t) {
  let diff = ((b - a + Math.PI) % (2 * Math.PI)) - Math.PI;
  if (diff < -Math.PI) diff += 2 * Math.PI;
  return a + diff * t;
}

let trackCtx, compassCtx, resizeTrackCanvas, resizeCompassCanvas;

function loop(ts) {
  const dt = Math.min(0.05, (ts - lastTs) / 1000);
  lastTs = ts;

  try {
    if (state.screen === "game-root") {
      updateParticles(dt);
      const rate = 1 - Math.exp(-CONFIG.headingLerpRate * dt);
      state.carHeading = lerpAngle(state.carHeading, state.carHeadingTarget, rate);

      renderTrack(trackCtx, els["track-canvas"].clientWidth, els["track-canvas"].clientHeight);
      // renderTrack() puede disparar la resolución de una medición a mitad
      // de frame (resolveMeasurement -> showResult -> oculta #game-root),
      // lo que deja el canvas del compás en 0x0 justo aquí: hay que
      // re-chequear la pantalla antes de dibujarlo.
      if (state.screen === "game-root") {
        renderCompass(compassCtx, els["compass-canvas"].clientWidth, els["compass-canvas"].clientHeight);
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
    hadamardInit();
    updateControlVisuals();
    updateHud();
  });

  // Freno de mano = interruptor "armar oráculo" (click), no algo que se
  // sostiene: con mouse solo hay un cursor, y en pantalla táctil pedir que
  // un dedo se quede quieto en un botón del borde mientras el otro juega
  // es frágil. Clic para armar, clic de nuevo para desarmar.
  els["btn-handbrake"].addEventListener("click", () => {
    if (!state.engineOn) return;
    state.oracleArmed = !state.oracleArmed;
    if (state.oracleArmed) {
      state.comboHappenedThisArm = false;
    } else if (!state.comboHappenedThisArm && !hints.handbrakeAlone) {
      hints.handbrakeAlone = true;
      toast("El freno de mano solo no mueve nada visible — combínalo con el volante.", "warn");
    }
    updateControlVisuals();
  });

  els["btn-steer-left"].addEventListener("click", () => attemptSteer(-1));
  els["btn-steer-right"].addEventListener("click", () => attemptSteer(1));

  els["btn-accel"].addEventListener("click", accelerate);

  els["btn-restart"].addEventListener("click", () => resetRound(state.N));

  els["btn-retry"].addEventListener("click", () => {
    resetRound(state.N);
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
// INIT
// ---------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  cacheEls();
  ({ ctx: trackCtx, resize: resizeTrackCanvas } = setupCanvas(els["track-canvas"]));
  ({ ctx: compassCtx, resize: resizeCompassCanvas } = setupCanvas(els["compass-canvas"]));
  wire();
  resetRound(CONFIG.levels[state.levelIndex]);
  showScreenEl("screen-start");
  requestAnimationFrame((ts) => {
    lastTs = ts;
    loop(ts);
  });
});
