"use strict";
/* =====================================================================
   Fotón Cuántico — el auto ES un fotón/qubit. Solo 2 caminos (camino 0 /
   camino 1), y los controles son compuertas cuánticas reales: NOT (X),
   Hadamard (H) y fase (Z). Como el juego solo usa esas tres compuertas,
   el estado del fotón se queda siempre en amplitudes REALES (a0, a1 con
   a0²+a1²=1, sin números complejos) -- las tres matrices son reales, así
   que esto no es una simplificación con trucos: es exactamente la misma
   física, solo que no hace falta i para describirla. Medir es tirar una
   moneda cuántica real con Math.random() pesada por esas probabilidades.

   4 niveles, cada uno habilita una compuerta más:
     1) solo X       -> flip determinista, sin azar.
     2) solo H        -> superposición + medición real (azar de verdad).
     3) H + Z          -> la fase no mueve nada sola, pero H·Z·H = X: se
                          puede recuperar el control total combinando.
     4) H + X + Z + un obstáculo -> cruzar en superposición esquiva el
                          obstáculo (no está "decidido" en qué camino
                          está hasta medir); cruzar ya colapsado en el
                          camino bloqueado es choque.
   =====================================================================*/

const CONFIG = {
  levels: [
    { id: "not", hudLabel: "Nivel 1", title: "Espejo cuántico (NOT)", gates: ["X"], driveSeconds: 5, hasObstacle: false, hasTimer: false },
    { id: "hadamard", hudLabel: "Nivel 2", title: "Superposición (Hadamard)", gates: ["H"], driveSeconds: 5, hasObstacle: false, hasTimer: false },
    { id: "interference", hudLabel: "Nivel 3", title: "La compuerta invisible (fase Z)", gates: ["H", "Z"], driveSeconds: 6, hasObstacle: false, hasTimer: false },
    { id: "free", hudLabel: "Nivel 4", title: "Pista libre", gates: ["H", "X", "Z"], driveSeconds: 9, hasObstacle: true, hasTimer: true },
  ],
  revealMs: 800,
  crashFlashMs: 350,
  carSpriteSrc: "assets/img/car_sprite.png",
};

// ---------------------------------------------------------------------
// ESTADO
// ---------------------------------------------------------------------
const state = {
  screen: "start",
  levelIndex: 0,
  q: { a0: 1, a1: 0 },     // amplitudes reales del fotón: a0²+a1²=1
  goalLane: 0,

  driving: false,
  driveDurationSec: 1,
  trackProgress: 0,        // 0..1 a lo largo de la pista
  autoFinishArmed: false,

  obstacleLane: 0,
  obstacleFrac: 0.55,
  obstaclePassed: false,

  measuring: false,
  crashed: false,
  measuredLane: null,
  lastProbs: null,
  lastWin: null,

  gateLog: [],
  crashFlashUntil: 0,
};

const particles = [];
let lastCarPos = { x: 0, y: 0 };
let lastTs = performance.now();

// ---------------------------------------------------------------------
// COMPUERTAS: matrices reales 2x2 aplicadas directo sobre (a0, a1).
// ---------------------------------------------------------------------
function clean(v) {
  return Math.abs(v) < 1e-9 ? 0 : v;
}
function applyX(q) {
  return { a0: q.a1, a1: q.a0 };
}
function applyZ(q) {
  return { a0: q.a0, a1: clean(-q.a1) };
}
function applyH(q) {
  const r = Math.SQRT1_2;
  return { a0: clean(r * (q.a0 + q.a1)), a1: clean(r * (q.a0 - q.a1)) };
}
// null si el fotón sigue en superposición -- solo "está" en un camino de
// verdad cuando toda la probabilidad quedó de un solo lado.
function definiteLane(q) {
  if (q.a0 * q.a0 > 0.999) return 0;
  if (q.a1 * q.a1 > 0.999) return 1;
  return null;
}

// ---------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------
const els = {};
function cacheEls() {
  [
    "screen-start", "game-root", "screen-result",
    "btn-play", "btn-restart", "btn-retry", "btn-next",
    "btn-gate-x", "btn-gate-h", "btn-gate-z", "btn-measure",
    "hud-level-label", "hud-level-title", "hud-goal", "hud-state",
    "hud-timer-block", "hud-timer-fill", "hud-timer-label",
    "toast",
    "result-eyebrow", "result-title", "result-text",
    "track-canvas",
  ].forEach((id) => (els[id] = document.getElementById(id)));
}

function showScreenEl(id) {
  ["screen-start", "game-root", "screen-result"].forEach((s) =>
    els[s].classList.toggle("hidden", s !== id)
  );
  state.screen = id;
  if (id === "game-root") resizeTrackCanvas(); // el canvas queda en 0x0 mientras estaba oculto
}

let toastTimer = null;
function toast(msg, kind) {
  const t = els["toast"];
  t.textContent = msg;
  t.className = "toast show" + (kind ? " " + kind : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

function setGateButtonsForLevel(lvl) {
  ["x", "h", "z"].forEach((g) => {
    const btn = els[`btn-gate-${g}`];
    const allowed = lvl.gates.includes(g.toUpperCase());
    btn.dataset.allowed = allowed ? "1" : "0";
    btn.disabled = true;
    btn.title = allowed ? "" : "No disponible en este nivel";
  });
  els["hud-timer-block"].classList.toggle("hidden", !lvl.hasTimer);
}

function setControlsEnabled(on) {
  ["x", "h", "z"].forEach((g) => {
    const btn = els[`btn-gate-${g}`];
    btn.disabled = !on || btn.dataset.allowed !== "1";
  });
  els["btn-measure"].disabled = !on;
}

function updateHud() {
  const lvl = CONFIG.levels[state.levelIndex];
  els["hud-level-label"].textContent = lvl.hudLabel;
  els["hud-level-title"].textContent = lvl.title;
  els["hud-goal"].textContent = `Camino ${state.goalLane} (${state.goalLane === 0 ? "izquierda" : "derecha"})`;
}

function updateStateReadout() {
  const p0 = state.q.a0 * state.q.a0;
  const p1 = state.q.a1 * state.q.a1;
  const sign = (amp) => (Math.abs(amp) < 0.02 ? "" : amp < 0 ? " (−)" : " (+)");
  els["hud-state"].textContent =
    `P(0)=${Math.round(p0 * 100)}%${sign(state.q.a0)} · P(1)=${Math.round(p1 * 100)}%${sign(state.q.a1)}`;
}

function updateTimerHud() {
  const frac = Math.max(0, 1 - state.trackProgress);
  els["hud-timer-fill"].style.width = `${(frac * 100).toFixed(1)}%`;
  els["hud-timer-fill"].classList.toggle("low", frac < 0.25);
  els["hud-timer-label"].textContent = `${(state.driveDurationSec * frac).toFixed(1)}s`;
}

function flashGateButton(g) {
  const btn = els[`btn-gate-${g.toLowerCase()}`];
  btn.classList.add("on");
  clearTimeout(btn._flashTimer);
  btn._flashTimer = setTimeout(() => btn.classList.remove("on"), 260);
}

// ---------------------------------------------------------------------
// FLUJO DE RONDA
// ---------------------------------------------------------------------
function nextLevelAvailable() {
  return state.levelIndex < CONFIG.levels.length - 1;
}

function resetRound(levelIndex) {
  const lvl = CONFIG.levels[levelIndex];
  state.levelIndex = levelIndex;
  state.q = { a0: 1, a1: 0 };
  state.goalLane = Math.random() < 0.5 ? 0 : 1;

  state.driving = false;
  state.driveDurationSec = lvl.driveSeconds;
  state.trackProgress = 0;
  state.autoFinishArmed = false;

  state.obstacleLane = Math.random() < 0.5 ? 0 : 1;
  state.obstaclePassed = false;

  state.measuring = false;
  state.crashed = false;
  state.measuredLane = null;
  state.lastProbs = null;

  state.gateLog = [];
  state.crashFlashUntil = 0;
  particles.length = 0;

  setGateButtonsForLevel(lvl);
  setControlsEnabled(false);
  updateHud();
  updateStateReadout();
}

function beginLevel() {
  state.driving = true;
  setControlsEnabled(true);
  toast("El fotón arrancó — aplicá compuertas y medí cuando quieras.", "good");
}

function pressGate(g) {
  const lvl = CONFIG.levels[state.levelIndex];
  if (!state.driving || state.measuring || !lvl.gates.includes(g)) return;
  if (g === "X") state.q = applyX(state.q);
  if (g === "H") state.q = applyH(state.q);
  if (g === "Z") state.q = applyZ(state.q);
  state.gateLog.push(g);
  flashGateButton(g);
  spawnGateBurst(g);
  updateStateReadout();
}

function crash() {
  state.crashed = true;
  state.measuring = true;
  state.driving = false;
  setControlsEnabled(false);
  state.crashFlashUntil = performance.now() + CONFIG.crashFlashMs;
  spawnBurst("#ff8a5a", 16, 60, 160);
  toast("¡Choque! Estabas en un camino definido justo sobre el obstáculo.", "warn");
  setTimeout(showResult, CONFIG.revealMs);
}

function measureNow() {
  if (!state.driving || state.measuring) return;
  state.measuring = true;
  state.driving = false;
  setControlsEnabled(false);
  const p1 = state.q.a1 * state.q.a1;
  state.lastProbs = { p0: 1 - p1, p1 };
  const result = Math.random() < p1 ? 1 : 0;
  state.measuredLane = result;
  state.q = result === 1 ? { a0: 0, a1: 1 } : { a0: 1, a1: 0 };
  updateStateReadout();
  toast("Midiendo…", null);
  setTimeout(showResult, CONFIG.revealMs);
}

function levelExplain(lvl, success) {
  switch (lvl.id) {
    case "not":
      return "NOT es determinista: un número impar de X te deja en el otro camino, un número par te deja igual. Nada de azar.";
    case "hadamard":
      return "Con Hadamard sola cada medición es una moneda cuántica real: no hay forma de forzar el resultado con esta única compuerta.";
    case "interference":
      return success
        ? "Esa es la interferencia cuántica: la fase Z era invisible sola, pero sumada entre dos Hadamard cambió el resultado con certeza."
        : "Pista: con H sola tenés 50%. Para asegurar el camino contrario probá H, después Z, después H de nuevo (H·Z·H = X).";
    default:
      return "En superposición un obstáculo no te frena — recién se decide todo al medir.";
  }
}

function showResult() {
  const lvl = CONFIG.levels[state.levelIndex];
  let success, title, text;

  if (state.crashed) {
    success = false;
    title = "Chocaste";
    text = `Estabas definido en el camino ${state.obstacleLane} justo donde estaba el obstáculo. ` + levelExplain(lvl, false);
  } else {
    success = state.measuredLane === state.goalLane;
    const probText = state.lastProbs
      ? `Antes de medir: P(0)=${Math.round(state.lastProbs.p0 * 100)}% · P(1)=${Math.round(state.lastProbs.p1 * 100)}%. `
      : "";
    title = success ? `Camino ${state.measuredLane} — ¡correcto!` : `Camino ${state.measuredLane} — no era`;
    text = `${probText}La meta era el camino ${state.goalLane}. ` + levelExplain(lvl, success);
  }

  state.lastWin = success;
  els["result-eyebrow"].textContent = success ? "Medición exitosa" : "Medición fallida";
  els["result-title"].textContent = title;
  els["result-text"].textContent = text;
  els["btn-next"].textContent = success
    ? nextLevelAvailable() ? "Siguiente nivel →" : "Jugar de nuevo (nivel 1)"
    : "Reintentar";

  showScreenEl("screen-result");
}

// ---------------------------------------------------------------------
// PARTÍCULAS
// ---------------------------------------------------------------------
function spawnBurst(color, count, speedMin, speedMax) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = speedMin + Math.random() * (speedMax - speedMin);
    particles.push({
      x: lastCarPos.x, y: lastCarPos.y,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      life: 1, color,
    });
  }
}
const GATE_COLORS = { X: "#ffb545", H: "#49d3ff", Z: "#ff5da2" };
function spawnGateBurst(g) {
  spawnBurst(GATE_COLORS[g] || "#ffffff", 8, 20, 60);
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

// El fotón puede estar "presente" en los dos caminos a la vez: se dibuja
// un fantasma por camino, con opacidad = probabilidad de ese camino y un
// anillo de color que marca el SIGNO de la amplitud (la fase). La fase
// no cambia la opacidad ni la posición -- por eso Z sola no se nota acá,
// solo el anillo cambia de celeste a magenta.
function drawGhost(ctx, x, y, prob, amp) {
  if (prob < 0.005) return;
  const alpha = Math.min(1, 0.18 + 0.82 * prob);
  ctx.save();
  ctx.translate(x, y);
  if (Math.abs(amp) > 0.02) {
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.strokeStyle = amp >= 0 ? "rgba(73,211,255,.85)" : "rgba(255,93,162,.9)";
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = alpha;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  drawCar(ctx, x, y, alpha);
}

function laneX(i, left, laneW) {
  return left + (i + 0.5) * laneW;
}

function trackGeometry(w, h) {
  const left = Math.max(28, w * 0.18);
  const right = w - left;
  const laneW = (right - left) / 2;
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
  const lvl = CONFIG.levels[state.levelIndex];

  ctx.fillStyle = "rgba(255,255,255,.02)";
  ctx.fillRect(left, metaY, right - left, startY - metaY);

  for (let i = 0; i <= 2; i++) {
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

  ctx.fillStyle = "rgba(255,208,80,.10)";
  ctx.fillRect(left + state.goalLane * laneW, metaY, laneW, startY - metaY);

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

  ctx.textBaseline = "top";
  for (let i = 0; i < 2; i++) {
    ctx.fillStyle = i === state.goalLane ? "rgba(255,208,80,.9)" : "rgba(255,255,255,.4)";
    ctx.fillText(`camino ${i}`, laneX(i, left, laneW), startY + 8);
  }

  if (lvl.hasObstacle) {
    const y = startY - (startY - metaY) * state.obstacleFrac;
    drawObstacle(ctx, laneX(state.obstacleLane, left, laneW), y, Math.min(laneW * 0.7, 34));
  }

  const carY = startY - (startY - metaY) * Math.min(1, state.trackProgress);
  const p0 = state.q.a0 * state.q.a0;
  const p1 = state.q.a1 * state.q.a1;
  lastCarPos = { x: p0 * laneX(0, left, laneW) + p1 * laneX(1, left, laneW), y: carY };

  ctx.lineWidth = 2;
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life) * 0.7;
    ctx.strokeStyle = p.color;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  drawGhost(ctx, laneX(0, left, laneW), carY, p0, state.q.a0);
  drawGhost(ctx, laneX(1, left, laneW), carY, p1, state.q.a1);

  if (performance.now() < state.crashFlashUntil) {
    const t = (state.crashFlashUntil - performance.now()) / CONFIG.crashFlashMs;
    ctx.fillStyle = `rgba(255,60,60,${0.22 * t})`;
    ctx.fillRect(0, 0, w, h);
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

let trackCtx, resizeTrackCanvas;

function loop(ts) {
  const dt = Math.min(0.05, (ts - lastTs) / 1000);
  lastTs = ts;

  try {
    if (state.screen === "game-root") {
      updateParticles(dt);
      const lvl = CONFIG.levels[state.levelIndex];

      if (state.driving) {
        state.trackProgress = Math.min(1, state.trackProgress + dt / state.driveDurationSec);

        if (lvl.hasObstacle && !state.obstaclePassed && state.trackProgress >= state.obstacleFrac) {
          state.obstaclePassed = true;
          const lane = definiteLane(state.q);
          if (lane !== null && lane === state.obstacleLane) {
            crash();
          } else {
            toast(lane === null ? "Cruzaste en superposición — esquivaste sin saberlo." : "Pasaste limpio por el otro camino.", "good");
          }
        }

        // Guard: sin esto, cada frame con progress>=1 volvería a llamar
        // measureNow() (que ya puso driving=false, pero el chequeo de
        // arriba corre antes de que el nuevo estado se refleje afuera).
        if (state.driving && state.trackProgress >= 1 && !state.autoFinishArmed) {
          state.autoFinishArmed = true;
          measureNow();
        }

        if (lvl.hasTimer) updateTimerHud();
      }

      renderTrack(trackCtx, els["track-canvas"].clientWidth, els["track-canvas"].clientHeight);
    }
  } catch (err) {
    console.error("loop() error:", err);
  }
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------------
// INPUT
// ---------------------------------------------------------------------
function wire() {
  els["btn-play"].addEventListener("click", () => {
    showScreenEl("game-root");
    beginLevel();
  });

  els["btn-gate-x"].addEventListener("click", () => pressGate("X"));
  els["btn-gate-h"].addEventListener("click", () => pressGate("H"));
  els["btn-gate-z"].addEventListener("click", () => pressGate("Z"));
  els["btn-measure"].addEventListener("click", () => measureNow());

  els["btn-restart"].addEventListener("click", () => {
    resetRound(state.levelIndex);
    beginLevel();
  });

  els["btn-retry"].addEventListener("click", () => {
    resetRound(state.levelIndex);
    showScreenEl("game-root");
    beginLevel();
  });

  els["btn-next"].addEventListener("click", () => {
    const won = !!state.lastWin;
    let nextIndex = state.levelIndex;
    if (won && nextLevelAvailable()) nextIndex = state.levelIndex + 1;
    else if (won) nextIndex = 0;
    resetRound(nextIndex);
    showScreenEl("game-root");
    beginLevel();
  });
}

// ---------------------------------------------------------------------
// INIT
// ---------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  cacheEls();
  ({ ctx: trackCtx, resize: resizeTrackCanvas } = setupCanvas(els["track-canvas"]));
  wire();
  resetRound(0);
  showScreenEl("screen-start");
  requestAnimationFrame((ts) => {
    lastTs = ts;
    loop(ts);
  });
});
