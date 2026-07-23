"use strict";
/* =====================================================================
   Circuito Cuántico — Nivel 1: Grover / Modo Drift
   =====================================================================
   El juego se conduce entre N carriles (N = 2^n, un carril por posible
   respuesta). El drift (freno de mano armado + volante) aplica una
   iteración real de Grover sobre las amplitudes (oráculo + difusión) en
   cada combo, y esas mismas amplitudes son las que se muestrean al
   cruzar la meta (o agotarse el tiempo) para decidir la medición final
   -- todo en el cliente, sin backend. No importa el orden ni la forma
   en que juegues para llegar ahí -- lo que manda es el inicio
   (Hadamard = H^n real) y el final (medición pesada por |amp|²).
   =====================================================================
   HUECO PARA TU SPRITE DEL VEHÍCULO
   ----------------------------------
   No se usa ningún sprite de auto todavía a propósito. Para conectar el
   tuyo: pon el archivo en assets/img/ y escribe la ruta abajo en
   CONFIG.carSpriteSrc (vista top-down, apuntando "hacia arriba" en su
   pose por defecto). El auto se dibuja rotado/reflejado automáticamente
   según hacia qué carril se mueve. Si lo dejas en null, se usa un auto
   de relleno dibujado a mano (drawCarPlaceholder).
   =====================================================================*/

const CONFIG = {
  levels: [2, 3, 4],             // n = qubits por nivel -> N = 2^n carriles
  comboCooldown: 550,            // ms entre iteraciones de Grover (derrapes)
  laneLerpRate: 6.5,             // qué tan rápido desliza el auto entre carriles
  secondsPerIteration: 3.0,      // presupuesto de tiempo por derrape esperado
  extraBufferIterations: 2,      // margen extra de tiempo sobre el óptimo
  revealMs: 800,                 // pausa visual tras medir antes de mostrar resultado
  carSpriteSrc: null,            // <-- HUECO: ruta a tu sprite del auto (o null)
};

// ---------------------------------------------------------------------
// ESTADO
// ---------------------------------------------------------------------
const state = {
  screen: "start",     // start | game-root | result
  levelIndex: 0,
  n: 2,
  N: 4,
  target: 0,
  amp: [],
  engineOn: false,
  iterations: 0,
  optimalIter: 1,

  // Freno de mano = interruptor "armar oráculo" (click), no algo que se
  // sostiene: con mouse solo hay un cursor, y en pantalla táctil pedir
  // que un dedo se quede quieto en el borde mientras el otro juega es
  // frágil. Clic para armar, clic de nuevo para desarmar.
  oracleArmed: false,
  comboHappenedThisArm: false,
  comboCooldownUntil: 0,

  lanePos: 1.5,          // posición continua actual del auto (para animar)
  laneTarget: 1.5,

  timeLimitMs: 0,
  roundDeadline: 0,
  measuring: false,
  autoFinishArmed: false,

  measuredIndex: null,
  lastWin: null,
};

const hints = { steerAlone: false, handbrakeAlone: false };
const particles = [];
let lastTs = performance.now();

// ---------------------------------------------------------------------
// MATEMÁTICA DE GROVER (amplitudes reales; alimentan tanto el drift en
// vivo como la medición final, todo en el cliente)
// ---------------------------------------------------------------------
function hadamardInit() {
  const a = 1 / Math.sqrt(state.N);
  state.amp = new Array(state.N).fill(a);
  state.engineOn = true;
  state.iterations = 0;
  state.timeLimitMs = (state.optimalIter + CONFIG.extraBufferIterations) * CONFIG.secondsPerIteration * 1000;
  state.roundDeadline = performance.now() + state.timeLimitMs;
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

// R óptimo real (Boyer-Brassard-Høyer-Tapp).
function bbhtOptimalIterations(n) {
  const N = 2 ** n;
  const theta = Math.asin(1 / Math.sqrt(N));
  const R = Math.round(Math.PI / 4 / theta - 0.5);
  return Math.max(1, R);
}

function resultantLane() {
  const probs = probabilities();
  let avg = 0;
  let maxP = 0;
  for (let i = 0; i < state.N; i++) {
    avg += i * probs[i];
    if (probs[i] > maxP) maxP = probs[i];
  }
  const floor = 1 / state.N;
  const certainty = Math.max(0, (maxP - floor) / (1 - floor || 1));
  return { lane: avg, certainty };
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
    "hud-timer-fill", "hud-timer-label",
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
function resetRound(n) {
  state.n = n;
  state.N = 2 ** n;
  state.target = Math.floor(Math.random() * state.N);
  state.amp = new Array(state.N).fill(0);
  state.engineOn = false;
  state.iterations = 0;
  state.optimalIter = bbhtOptimalIterations(n);
  state.oracleArmed = false;
  state.comboHappenedThisArm = false;
  state.comboCooldownUntil = 0;
  state.lanePos = (state.N - 1) / 2;
  state.laneTarget = state.lanePos;
  state.timeLimitMs = 0;
  state.roundDeadline = 0;
  state.measuring = false;
  state.autoFinishArmed = false;
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

// Se llama con cada toque del volante (dir = -1 izquierda / 1 derecha).
// Si el oráculo está armado, ese toque completa el combo (derrape real:
// oráculo + difusión = una iteración de Grover). Si no, es cosmético.
function attemptSteer(dir) {
  if (!state.engineOn || state.measuring) return;
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

  const res = resultantLane();
  state.laneTarget = res.lane;

  if (state.iterations === state.optimalIter) {
    toast(`Alineado — certeza ≈ ${(res.certainty * 100).toFixed(0)}%. ¡Cruza la meta!`, "good");
  } else if (state.iterations > state.optimalIter) {
    toast("Te pasaste de vueltas: la certeza ya está bajando.", "warn");
  }
}

// La medición final se decide con la misma matemática de Grover que ya
// se usa para el drift en vivo (state.amp / probabilities()): se toma
// una muestra pesada por |amp|² de verdad, igual que colapsaría un
// circuito real. Queda 100% en el cliente para poder jugarse standalone
// (p.ej. en GitHub Pages, sin ningún backend).
function finishRound() {
  if (!state.engineOn || state.measuring) return;
  state.measuring = true;
  setControlsEnabled(false);
  toast("Midiendo…", null);

  const probs = probabilities();
  const measuredIndex = weightedRandomIndex(probs);
  const targetBits = state.target.toString(2).padStart(state.n, "0");
  const measuredBits = measuredIndex.toString(2).padStart(state.n, "0");
  const data = {
    n: state.n,
    N: state.N,
    target_index: state.target,
    target_bits: targetBits,
    iterations: state.iterations,
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

  els["result-eyebrow"].textContent = data.success ? "Medición exitosa" : "Medición fallida";
  els["result-title"].textContent = data.success
    ? `Carril ${data.measured_index + 1} — ¡correcto!`
    : `Carril ${data.measured_index + 1} — no era`;

  if (data.success) {
    els["result-text"].textContent =
      `La superposición (${data.n} qubits, ${data.iterations} iteración(es) de Grover) ` +
      `colapsó en el carril correcto al medir. Probabilidad de éxito: ${probPct}%.`;
  } else {
    const opt = state.optimalIter;
    const tip =
      data.iterations > opt
        ? "Te pasaste de derrapes — la probabilidad ya iba de bajada."
        : data.iterations < opt
        ? "Faltaron derrapes: la probabilidad todavía no se concentraba en un carril."
        : "Mala suerte al medir — con esa probabilidad a veces falla, así es la mecánica cuántica.";
    els["result-text"].textContent =
      `El carril correcto era el ${data.target_index + 1} (bits ${data.target_bits}). ` +
      `Se hicieron ${data.iterations} derrape(s) (óptimo ≈ ${opt}) y la medición dio ${probPct}% ` +
      `de probabilidad en el carril correcto. ${tip}`;
  }

  els["btn-next"].textContent = data.success
    ? nextLevelAvailable()
      ? "Siguiente nivel →"
      : "Jugar de nuevo (nivel 1)"
    : "Reintentar";

  showScreenEl("screen-result");
}

// ---------------------------------------------------------------------
// PARTÍCULAS DE DERRAPE
// ---------------------------------------------------------------------
function spawnSkid(dir) {
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (Math.random() - 0.5) * 1.2 - dir * 0.4;
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

// El auto siempre "mira" hacia la meta (arriba); solo cambiamos su x.
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
  const metaY = h * 0.16;
  const startY = h * 0.86;
  return { left, right, laneW, metaY, startY };
}

function timeProgress() {
  if (!state.engineOn) return 0;
  if (state.measuring || state.screen !== "game-root") return 1;
  const remaining = Math.max(0, state.roundDeadline - performance.now());
  return state.timeLimitMs > 0 ? 1 - remaining / state.timeLimitMs : 0;
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

  // resaltar carril correcto/medido al revelar resultado
  if (state.measuredIndex !== null && (state.screen === "screen-result" || state.measuring)) {
    const ok = state.measuredIndex === state.target;
    ctx.fillStyle = ok ? "rgba(52,224,122,.18)" : "rgba(255,90,90,.18)";
    ctx.fillRect(left + state.measuredIndex * laneW, metaY, laneW, startY - metaY);
  }

  // fantasmas de superposición
  const probs = probabilities();
  if (state.engineOn) {
    for (let i = 0; i < state.N; i++) {
      const p = probs[i];
      if (p < 0.01) continue;
      const gx = laneX(i, left, laneW);
      const gy = startY - (startY - metaY) * 0.15;
      drawCar(ctx, gx, gy, Math.min(0.7, p * 1.4));
    }
  }

  // auto principal
  const progress = timeProgress();
  const carY = startY - (startY - metaY) * progress;
  const carX = laneX(state.lanePos, left, laneW);

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

  drawCar(ctx, carX, carY, state.engineOn ? 1 : 0.85);
}

// Brújula EXTERNA: franja horizontal separada de la pista, indica hacia
// qué carril apunta la evidencia acumulada y qué tan fuerte es la señal
// (no la posición real y secreta del objetivo -- la certeza que da el
// propio derrape, igual que en la teoría: la amplitud, no el bit).
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
    ctx.strokeStyle = "rgba(255,255,255,.2)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  const res = resultantLane();
  const nx = laneX(res.lane, left, laneW);
  const glow = 0.25 + res.certainty * 0.75;

  ctx.beginPath();
  ctx.arc(nx, midY, 5 + res.certainty * 5, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(73,211,255,${glow})`;
  ctx.shadowColor = "rgba(73,211,255,.9)";
  ctx.shadowBlur = 8 + res.certainty * 18;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = "rgba(255,255,255,.6)";
  ctx.font = MONO;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const label = res.certainty < 0.15 ? "frío" : res.certainty < 0.5 ? "tibio" : res.certainty < 0.85 ? "caliente" : "¡ahí!";
  ctx.fillText(`brújula externa · ${(res.certainty * 100).toFixed(0)}% certeza · ${label}`, left, 14);
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

let trackCtx, compassCtx, resizeTrackCanvas, resizeCompassCanvas;

function loop(ts) {
  const dt = Math.min(0.05, (ts - lastTs) / 1000);
  lastTs = ts;

  try {
    if (state.screen === "game-root") {
      updateParticles(dt);
      const rate = 1 - Math.exp(-CONFIG.laneLerpRate * dt);
      state.lanePos = lerp(state.lanePos, state.laneTarget, rate);

      if (state.engineOn && !state.measuring) {
        const remaining = updateTimerHud();
        // Se dispara UNA sola vez al agotarse el tiempo -- sin este guard,
        // cada frame con remaining<=0 volvería a llamar finishRound().
        if (remaining <= 0 && !state.autoFinishArmed) {
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

  els["btn-handbrake"].addEventListener("click", () => {
    if (!state.engineOn || state.measuring) return;
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
