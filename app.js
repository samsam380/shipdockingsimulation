const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');

const scenarioSelect = document.getElementById('scenarioSelect');
const resetBtn = document.getElementById('resetBtn');
const throttleInput = document.getElementById('throttle');
const rudderInput = document.getElementById('rudder');
const thrusterInput = document.getElementById('thruster');
const throttleOut = document.getElementById('throttleOut');
const rudderOut = document.getElementById('rudderOut');
const thrusterOut = document.getElementById('thrusterOut');
const instruments = document.getElementById('instruments');
const statusText = document.getElementById('statusText');
const scoreText = document.getElementById('scoreText');
const modelNotes = document.getElementById('modelNotes');
const clueText = document.getElementById('clueText');
const answerMask = document.getElementById('answerMask');
const codewordSelect = document.getElementById('codewordSelect');
const startBruteforceBtn = document.getElementById('startBruteforceBtn');
const nextClueBtn = document.getElementById('nextClueBtn');
const attemptProgress = document.getElementById('attemptProgress');
const bruteforceStatus = document.getElementById('bruteforceStatus');
const attemptLog = document.getElementById('attemptLog');
const codewordForm = document.getElementById('codewordForm');
const newClueInput = document.getElementById('newClueInput');
const newWordInput = document.getElementById('newWordInput');
const wordBankCount = document.getElementById('wordBankCount');
const restoreWordsBtn = document.getElementById('restoreWordsBtn');
const wordBankList = document.getElementById('wordBankList');

const PX_PER_M = 1.3;
const KNOT_TO_MS = 0.514444;
const MS_TO_KNOT = 1.94384;
const AIR_DENSITY = 1.225;

const scenarios = [
  {
    name: 'Calm Morning / Starboard Side-to',
    windKts: 6,
    windDirDeg: 220,
    currentKts: 0.3,
    currentDirDeg: 15,
    gustKts: 2,
    waterDepthM: 14.5,
    bankX: 1060,
    start: { x: 180, y: 335, hdg: 2 },
    berth: { x: 960, y: 350, hdg: 0, length: 320, width: 46 },
    traffic: [
      { x: 680, y: 180, vx: 0.05, vy: 0.01, heading: 12, size: 48, type: 'ferry' },
      { x: 510, y: 560, vx: -0.03, vy: -0.01, heading: 184, size: 30, type: 'tug' }
    ]
  },
  {
    name: 'Crosswind Challenge / Port Side-to',
    windKts: 24,
    windDirDeg: 272,
    currentKts: 0.9,
    currentDirDeg: 175,
    gustKts: 5,
    waterDepthM: 12.2,
    bankX: 1060,
    start: { x: 165, y: 520, hdg: -8 },
    berth: { x: 950, y: 455, hdg: 0, length: 320, width: 46 },
    traffic: [
      { x: 470, y: 250, vx: 0.02, vy: 0.03, heading: 58, size: 42, type: 'cargo' },
      { x: 770, y: 610, vx: -0.05, vy: -0.01, heading: 192, size: 34, type: 'pilot' }
    ]
  },
  {
    name: 'Quartering Wind + Current Shear',
    windKts: 18,
    windDirDeg: 315,
    currentKts: 1.2,
    currentDirDeg: 25,
    gustKts: 4,
    waterDepthM: 10.8,
    bankX: 1060,
    start: { x: 215, y: 185, hdg: 9 },
    berth: { x: 940, y: 250, hdg: 0, length: 320, width: 46 },
    traffic: [
      { x: 450, y: 480, vx: 0.06, vy: -0.02, heading: 340, size: 36, type: 'supply' },
      { x: 705, y: 128, vx: -0.04, vy: 0.01, heading: 165, size: 28, type: 'tug' }
    ]
  }
];

for (const s of scenarios) {
  const opt = document.createElement('option');
  opt.textContent = s.name;
  scenarioSelect.append(opt);
}

const ship = {
  lengthM: 310,
  beamM: 40,
  draftM: 8.8,
  displacementT: 130000,
  blockCoefficient: 0.68,
  lateralWindAreaM2: 7600,
  frontalWindAreaM2: 1400,
  maxAzipodThrustN: 6400000,
  maxAsternFraction: 0.72,
  bowThrusterMaxN: 1100000,
  bowThrusterLeverM: 124,
  podLeverM: -104,
  x: 0,
  y: 0,
  heading: 0,
  u: 0,
  v: 0,
  vx: 0,
  vy: 0,
  yawRate: 0,
  thrustCmd: 0,
  podAngleCmd: 0,
  thrusterCmd: 0,
  thrustLag: 0,
  podAngleLag: 0,
  thrusterLag: 0,
  lastForces: null
};

let activeScenario = scenarios[0];
let traffic = [];
let dockingScored = false;

const CODEWORD_STORAGE_KEY = 'shipDockingCodewordBank';
const DEFAULT_CODEWORDS = [
  { clue: 'First light over the harbor entrance', word: 'dawn' },
  { clue: 'Small guide boat meeting a vessel outside port', word: 'pilot' },
  { clue: 'Protected water where ships wait to berth', word: 'harbor' },
  { clue: 'Floating marker that keeps the channel edge visible', word: 'buoy' },
  { clue: 'Line used to secure the ship alongside', word: 'mooring' },
  { clue: 'Sideways movement caused by wind or current', word: 'leeway' }
];

const codewordGame = {
  words: [],
  activeIndex: 0,
  isRunning: false,
  attemptIndex: 0,
  candidates: [],
  timerId: null,
  lastAttempts: []
};

function degToRad(d) { return (d * Math.PI) / 180; }
function radToDeg(r) { return (r * 180) / Math.PI; }
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
function normalizeAngleDeg(a) {
  let out = ((a + 180) % 360 + 360) % 360 - 180;
  if (out === -180) out = 180;
  return out;
}
function shortestAngleDeltaDeg(target, current) {
  return normalizeAngleDeg(target - current);
}

function worldToShipFrame(vx, vy, heading = ship.heading) {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  return { u: c * vx + s * vy, v: -s * vx + c * vy };
}

function shipToWorldFrame(fx, fy, heading = ship.heading) {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  return { x: c * fx - s * fy, y: s * fx + c * fy };
}

function getCurrentVector(scenario) {
  const currentDir = degToRad(scenario.currentDirDeg);
  const curSpeed = scenario.currentKts * KNOT_TO_MS;
  return { x: Math.cos(currentDir) * curSpeed, y: Math.sin(currentDir) * curSpeed };
}

function getWindVector(scenario, tSeconds) {
  const gust = Math.sin(tSeconds * 0.12) * scenario.gustKts + Math.sin(tSeconds * 0.031 + 1.8) * scenario.gustKts * 0.35;
  const windKtsDynamic = Math.max(0, scenario.windKts + gust);
  const windDir = degToRad(scenario.windDirDeg);
  const windSpeed = windKtsDynamic * KNOT_TO_MS;
  return { x: Math.cos(windDir) * windSpeed, y: Math.sin(windDir) * windSpeed, windKtsDynamic };
}

function effectiveMass(state) {
  const mass = state.displacementT * 1000;
  return {
    surge: mass * 1.06,
    sway: mass * 1.82,
    yaw: mass * Math.pow(state.lengthM * 0.33, 2) * 1.24
  };
}

function depthFactors(state, scenario) {
  const depthDraftRatio = scenario.waterDepthM / state.draftM;
  const shallow = clamp((2.5 - depthDraftRatio) / 1.5, 0, 1);
  const ukcM = scenario.waterDepthM - state.draftM;
  return {
    depthDraftRatio,
    ukcM,
    shallow,
    dampingMultiplier: 1 + shallow * 0.85,
    steeringMultiplier: 1 - shallow * 0.28,
    squatM: state.blockCoefficient * Math.max(0, state.u) * Math.max(0, state.u) / Math.max(0.1, 100 * ukcM / state.draftM)
  };
}

function resetScenario() {
  activeScenario = scenarios[scenarioSelect.selectedIndex];
  ship.x = activeScenario.start.x;
  ship.y = activeScenario.start.y;
  ship.heading = degToRad(activeScenario.start.hdg);
  ship.u = 0;
  ship.v = 0;
  ship.vx = 0;
  ship.vy = 0;
  ship.yawRate = 0;
  ship.thrustCmd = 0;
  ship.podAngleCmd = 0;
  ship.thrusterCmd = 0;
  ship.thrustLag = 0;
  ship.podAngleLag = 0;
  ship.thrusterLag = 0;
  ship.lastForces = null;

  traffic = activeScenario.traffic.map((v) => ({ ...v, heading: degToRad(v.heading) }));

  throttleInput.value = 0;
  rudderInput.value = 0;
  thrusterInput.value = 0;
  dockingScored = false;
  scoreText.textContent = 'Score: --';
}

function setOutputs() {
  throttleOut.value = `${ship.thrustCmd.toFixed(0)}%`;
  rudderOut.value = `${normalizeAngleDeg(ship.podAngleCmd).toFixed(0)}°`;
  rudderInput.value = normalizeAngleDeg(ship.podAngleCmd);
  thrusterOut.value = `${ship.thrusterCmd.toFixed(0)}%`;
}

function getForces(state, scenario, tSeconds) {
  const masses = effectiveMass(state);
  const depth = depthFactors(state, scenario);
  const current = getCurrentVector(scenario);
  const wind = getWindVector(scenario, tSeconds);
  const shipWaterWorld = shipToWorldFrame(state.u, state.v, state.heading);
  const groundVelocity = { x: shipWaterWorld.x + current.x, y: shipWaterWorld.y + current.y };
  const apparentWindWorld = { x: wind.x - groundVelocity.x, y: wind.y - groundVelocity.y };
  const apparentWind = worldToShipFrame(apparentWindWorld.x, apparentWindWorld.y, state.heading);

  const podAngleRad = degToRad(state.podAngleLag);
  const thrustOrder = state.thrustLag / 100;
  const thrustAvailability = thrustOrder >= 0 ? 1 : state.maxAsternFraction;
  const podForce = thrustOrder * thrustAvailability * state.maxAzipodThrustN;
  const podFx = Math.cos(podAngleRad) * podForce * depth.steeringMultiplier;
  const podFy = Math.sin(podAngleRad) * podForce * depth.steeringMultiplier;

  const transverseWaterSpeed = Math.abs(state.v + state.yawRate * state.bowThrusterLeverM);
  const thrusterVentilationLoss = clamp(transverseWaterSpeed / 2.5, 0, 0.62);
  const thrusterForce = (state.thrusterLag / 100) * state.bowThrusterMaxN * (1 - thrusterVentilationLoss) * depth.steeringMultiplier;

  const hullDampingX = depth.dampingMultiplier * (-520000 * state.u - 460000 * state.u * Math.abs(state.u));
  const hullDampingY = depth.dampingMultiplier * (-7600000 * state.v - 18500000 * state.v * Math.abs(state.v));
  const yawDampingMoment = depth.dampingMultiplier * (-masses.yaw * (0.038 * state.yawRate + 1.15 * state.yawRate * Math.abs(state.yawRate)));
  const crossflowMoment = -state.v * state.lengthM * 5200000 - state.yawRate * Math.abs(state.u) * masses.yaw * 0.015;

  const windForceX = 0.5 * AIR_DENSITY * state.frontalWindAreaM2 * 0.85 * apparentWind.u * Math.abs(apparentWind.u);
  const windForceY = 0.5 * AIR_DENSITY * state.lateralWindAreaM2 * 1.08 * apparentWind.v * Math.abs(apparentWind.v);
  const windMoment = windForceY * state.lengthM * 0.13 + windForceX * state.beamM * 0.03;

  const bankDistanceM = Math.max(8, Math.abs(scenario.bankX - state.x) / PX_PER_M);
  const bankFactor = clamp(1 - bankDistanceM / (state.beamM * 3.2), 0, 1);
  const bankDirection = Math.sign(scenario.bankX - state.x || 1);
  const bankSuction = bankDirection * bankFactor * (140000 + 320000 * state.u * Math.abs(state.u));
  const yawBankMoment = -bankDirection * bankFactor * (7.5e7 + 2.6e8 * Math.abs(state.u));

  const X = podFx + hullDampingX + windForceX;
  const Y = podFy + thrusterForce + hullDampingY + windForceY + bankSuction;
  const N =
    podFy * state.podLeverM +
    thrusterForce * state.bowThrusterLeverM +
    windMoment +
    yawDampingMoment +
    crossflowMoment +
    yawBankMoment;

  return {
    uAcc: X / masses.surge + state.v * state.yawRate,
    vAcc: Y / masses.sway - state.u * state.yawRate,
    yawAcc: N / masses.yaw,
    groundVelocity,
    current,
    windKtsDynamic: wind.windKtsDynamic,
    apparentWind,
    depth,
    bankFactor,
    thrusterVentilationLoss,
    forces: { X, Y, N }
  };
}

function stepState(state, scenario, dt, tSeconds, mutateActuators = true) {
  if (mutateActuators) {
    state.thrustLag += (state.thrustCmd - state.thrustLag) * clamp(dt / 7.5, 0, 1);
    const podDelta = shortestAngleDeltaDeg(state.podAngleCmd, state.podAngleLag);
    const maxPodStep = 2.8 * dt;
    state.podAngleLag = normalizeAngleDeg(state.podAngleLag + clamp(podDelta, -maxPodStep, maxPodStep));
    state.thrusterLag += (state.thrusterCmd - state.thrusterLag) * clamp(dt / 2.2, 0, 1);
  }

  const model = getForces(state, scenario, tSeconds);
  state.u += model.uAcc * dt;
  state.v += model.vAcc * dt;
  state.yawRate += model.yawAcc * dt;

  state.yawRate = clamp(state.yawRate, degToRad(-18 / 60), degToRad(18 / 60));
  state.u = clamp(state.u, -2.5, 5.0);
  state.v = clamp(state.v, -1.4, 1.4);
  state.heading += state.yawRate * dt;

  const current = getCurrentVector(scenario);
  const shipWaterWorld = shipToWorldFrame(state.u, state.v, state.heading);
  state.vx = shipWaterWorld.x + current.x;
  state.vy = shipWaterWorld.y + current.y;
  state.x += state.vx * dt * PX_PER_M;
  state.y += state.vy * dt * PX_PER_M;
  state.lastForces = model;
}

function integrate(dt, tSeconds) {
  stepState(ship, activeScenario, dt, tSeconds, true);

  const bouncedX = ship.x <= 20 || ship.x >= canvas.width - 20;
  const bouncedY = ship.y <= 20 || ship.y >= canvas.height - 20;
  ship.x = clamp(ship.x, 20, canvas.width - 20);
  ship.y = clamp(ship.y, 20, canvas.height - 20);
  if (bouncedX) ship.u *= -0.18;
  if (bouncedY) ship.v *= -0.18;

  for (const v of traffic) {
    v.x += v.vx;
    v.y += v.vy;
    if (v.x < 80 || v.x > canvas.width - 80) v.vx *= -1;
    if (v.y < 80 || v.y > canvas.height - 80) v.vy *= -1;
    v.heading = Math.atan2(v.vy, v.vx);
  }

  evaluateDocking(Math.hypot(ship.vx, ship.vy));
}

function getBerthOffset() {
  const berth = activeScenario.berth;
  const dx = ship.x - berth.x;
  const dy = ship.y - berth.y;
  const c = Math.cos(-degToRad(berth.hdg));
  const s = Math.sin(-degToRad(berth.hdg));
  return {
    localX: (c * dx - s * dy) / PX_PER_M,
    localY: (s * dx + c * dy) / PX_PER_M
  };
}

function evaluateDocking(speedMS) {
  const berth = activeScenario.berth;
  const { localX, localY } = getBerthOffset();
  const berthLengthM = berth.length / PX_PER_M;
  const berthWidthM = berth.width / PX_PER_M;

  const withinLong = Math.abs(localX) < berthLengthM * 0.43;
  const closeLat = Math.abs(localY) < berthWidthM * 0.62;
  const headingErr = Math.abs((((radToDeg(ship.heading) - berth.hdg) + 540) % 360) - 180);
  const speedKts = speedMS * MS_TO_KNOT;
  const lateralSpeedKts = Math.abs(ship.v) * MS_TO_KNOT;
  const rotOk = Math.abs(radToDeg(ship.yawRate) * 60) < 2.5;

  if (withinLong && closeLat && speedKts < 0.3 && lateralSpeedKts < 0.18 && headingErr < 5 && rotOk && !dockingScored) {
    const lateralScore = clamp(100 - Math.abs(localY) * 3.0, 0, 100);
    const headingScore = clamp(100 - headingErr * 10, 0, 100);
    const speedScore = clamp(100 - speedKts * 180 - lateralSpeedKts * 130, 0, 100);
    const rotScore = clamp(100 - Math.abs(radToDeg(ship.yawRate) * 60) * 22, 0, 100);
    const total = (lateralScore * 0.35 + headingScore * 0.28 + speedScore * 0.25 + rotScore * 0.12).toFixed(1);
    scoreText.textContent = `Score: ${total}/100`;
    dockingScored = true;
    statusText.textContent = Number(total) > 85
      ? 'Excellent controlled landing. Proceed with mooring lines.'
      : 'Docking achieved. Review approach profile, leeway, and rate-of-turn control.';
  } else if (!dockingScored) {
    statusText.textContent = 'Target: SOG < 0.3 kn, sideways speed < 0.18 kn, ROT < 2.5°/min, heading error < 5°.';
  }
}

function drawLandAndPort() {
  ctx.fillStyle = '#6f7f63';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(340, 0);
  ctx.lineTo(320, 120);
  ctx.lineTo(220, 180);
  ctx.lineTo(0, 220);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#73876b';
  ctx.fillRect(0, 560, 320, 140);

  ctx.fillStyle = '#5f6e56';
  for (let i = 0; i < 12; i += 1) {
    ctx.beginPath();
    ctx.arc(30 + i * 24, 190 + ((i * 21) % 40), 10 + (i % 3) * 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#8d9498';
  ctx.fillRect(1060, 100, 115, 500);
  ctx.fillStyle = '#a2a9ad';
  ctx.fillRect(1060, 100, 20, 500);

  ctx.fillStyle = '#7d878d';
  for (let i = 0; i < 5; i += 1) {
    ctx.fillRect(990 + i * 30, 120 + i * 90, 18, 40);
  }

  ctx.fillStyle = '#b6b8bb';
  for (let i = 0; i < 8; i += 1) {
    ctx.fillRect(360 + i * 62, 24 + (i % 2) * 20, 28, 18);
  }
}

function drawTrafficVessel(v) {
  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.rotate(v.heading);

  const hull = v.type === 'tug' ? '#f9a03f' : v.type === 'pilot' ? '#ffd166' : '#d7dde2';
  const beam = v.size * 0.35;

  ctx.fillStyle = hull;
  ctx.strokeStyle = '#22313f';
  ctx.beginPath();
  ctx.moveTo(v.size * 0.5, 0);
  ctx.lineTo(v.size * 0.2, beam);
  ctx.lineTo(-v.size * 0.5, beam);
  ctx.lineTo(-v.size * 0.5, -beam);
  ctx.lineTo(v.size * 0.2, -beam);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#5c6f7d';
  ctx.fillRect(-v.size * 0.2, -beam * 0.5, v.size * 0.3, beam);

  ctx.restore();
}

function drawPredictedTrack() {
  const predictionState = {
    ...ship,
    lastForces: null
  };

  ctx.save();
  ctx.strokeStyle = '#7cff9d';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(predictionState.x, predictionState.y);

  const dt = 0.6;
  for (let i = 0; i < 45; i += 1) {
    stepState(predictionState, activeScenario, dt, performance.now() / 1000 + i * dt, false);
    ctx.lineTo(predictionState.x, predictionState.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawHarbor() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, '#1f6586');
  g.addColorStop(1, '#1d4c62');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawLandAndPort();

  const berth = activeScenario.berth;
  ctx.save();
  ctx.translate(berth.x, berth.y);
  ctx.rotate(degToRad(berth.hdg));
  ctx.strokeStyle = '#66e0ff';
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = 2;
  ctx.strokeRect(-berth.length / 2, -berth.width / 2 - 20, berth.length, berth.width + 40);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255, 166, 0, 0.34)';
  ctx.fillRect(-berth.length / 2, -berth.width / 2, berth.length, berth.width);
  ctx.restore();

  for (let i = 0; i < 60; i += 1) {
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#b8ecff';
    ctx.fillRect((i * 131) % canvas.width, (i * 39 + performance.now() * 0.02) % canvas.height, 20, 2);
  }
  ctx.globalAlpha = 1;

  for (const v of traffic) drawTrafficVessel(v);
}

function drawShip() {
  const shipLenPx = ship.lengthM * PX_PER_M * 0.2;
  const shipBeamPx = ship.beamM * PX_PER_M * 0.2;

  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.heading);

  ctx.fillStyle = '#f2f4f8';
  ctx.strokeStyle = '#203040';
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(shipLenPx / 2, 0);
  ctx.lineTo(shipLenPx * 0.27, shipBeamPx / 2);
  ctx.lineTo(-shipLenPx / 2, shipBeamPx / 2);
  ctx.lineTo(-shipLenPx / 2, -shipBeamPx / 2);
  ctx.lineTo(shipLenPx * 0.27, -shipBeamPx / 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#7a8a94';
  ctx.fillRect(-shipLenPx * 0.2, -shipBeamPx * 0.18, shipLenPx * 0.34, shipBeamPx * 0.36);

  const podColor = '#56f7d0';
  const podDist = shipLenPx * 0.36;
  const podOffset = shipBeamPx * 0.26;
  const podAngle = degToRad(ship.podAngleLag);

  for (const side of [-1, 1]) {
    const y = podOffset * side;
    ctx.strokeStyle = podColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-podDist, y);
    ctx.lineTo(-podDist + Math.cos(podAngle) * 18, y + Math.sin(podAngle) * 18);
    ctx.stroke();
    ctx.fillStyle = '#4ac4a9';
    ctx.beginPath();
    ctx.arc(-podDist, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function updateInstruments(tSeconds) {
  const speedKts = Math.hypot(ship.vx, ship.vy) * MS_TO_KNOT;
  const stwKts = Math.hypot(ship.u, ship.v) * MS_TO_KNOT;
  const heading = ((radToDeg(ship.heading) % 360) + 360) % 360;
  const cog = ((radToDeg(Math.atan2(ship.vy, ship.vx)) % 360) + 360) % 360;
  const yawRateDegMin = radToDeg(ship.yawRate) * 60;
  const leeway = radToDeg(Math.atan2(ship.v, Math.max(0.05, Math.abs(ship.u)))) * Math.sign(ship.u || 1);

  const berth = activeScenario.berth;
  const { localX, localY } = getBerthOffset();
  const headingErr = normalizeAngleDeg(heading - berth.hdg);
  const depth = depthFactors(ship, activeScenario);
  const model = ship.lastForces || getForces(ship, activeScenario, tSeconds);

  const data = [
    ['Heading / COG', `${heading.toFixed(1)}° / ${cog.toFixed(1)}°`],
    ['SOG / STW', `${speedKts.toFixed(2)} kn / ${stwKts.toFixed(2)} kn`],
    ['Surge / Sway', `${(ship.u * MS_TO_KNOT).toFixed(2)} kn / ${(ship.v * MS_TO_KNOT).toFixed(2)} kn`],
    ['Rate of Turn', `${yawRateDegMin.toFixed(1)} °/min`],
    ['Leeway Angle', `${leeway.toFixed(1)}°`],
    ['Berth Offset L/T', `${localX.toFixed(0)} m / ${localY.toFixed(0)} m`],
    ['Heading Error', `${headingErr.toFixed(1)}°`],
    ['Azipod Actual', `${ship.podAngleLag.toFixed(1)}° @ ${ship.thrustLag.toFixed(0)}%`],
    ['Bow Thruster Loss', `${(model.thrusterVentilationLoss * 100).toFixed(0)}%`],
    ['Wind', `${model.windKtsDynamic.toFixed(1)} kn @ ${activeScenario.windDirDeg}°`],
    ['Current Set/Drift', `${activeScenario.currentDirDeg}° / ${activeScenario.currentKts.toFixed(1)} kn`],
    ['Depth / UKC', `${activeScenario.waterDepthM.toFixed(1)} m / ${depth.ukcM.toFixed(1)} m`],
    ['h/T / Squat', `${depth.depthDraftRatio.toFixed(2)} / ${depth.squatM.toFixed(2)} m`],
    ['Bank Effect', `${(model.bankFactor * 100).toFixed(0)}%`]
  ];

  instruments.innerHTML = data.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  if (modelNotes) {
    modelNotes.innerHTML = [
      `3-DOF model: surge, sway, yaw with added mass/inertia.`,
      `Hull: nonlinear damping + crossflow yaw coupling.`,
      `Environment: apparent wind, current set/drift, shallow-water damping, squat, bank suction.`,
      `Validation targets shown in README: IMO turning, zig-zag, and stopping criteria.`
    ].map((note) => `<li>${note}</li>`).join('');
  }
}

function normalizeCodewordWord(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9-]/g, '');
}

function createStoredCodeword(clue, word) {
  return {
    clue: clue.trim().replace(/\s+/g, ' '),
    word: normalizeCodewordWord(word)
  };
}

function getSavedCodewords() {
  const saved = localStorage.getItem(CODEWORD_STORAGE_KEY);
  if (!saved) return DEFAULT_CODEWORDS.map((item) => ({ ...item }));

  try {
    const parsed = JSON.parse(saved);
    const valid = parsed
      .map((item) => createStoredCodeword(String(item.clue || ''), String(item.word || '')))
      .filter((item) => item.clue && item.word);
    return valid.length ? valid : DEFAULT_CODEWORDS.map((item) => ({ ...item }));
  } catch (error) {
    console.warn('Could not parse saved codeword bank. Restoring defaults.', error);
    return DEFAULT_CODEWORDS.map((item) => ({ ...item }));
  }
}

function saveCodewords() {
  localStorage.setItem(CODEWORD_STORAGE_KEY, JSON.stringify(codewordGame.words));
}

function activeCodeword() {
  return codewordGame.words[codewordGame.activeIndex] || null;
}

function maskCodeword(word, reveal = false) {
  if (reveal) return word.toUpperCase();
  return word.replace(/[a-z0-9]/gi, '•').toUpperCase();
}

function makeCandidateList(targetWord) {
  const seen = new Set();
  const candidates = [];
  for (const item of codewordGame.words) {
    if (seen.has(item.word)) continue;
    seen.add(item.word);
    candidates.push(item.word);
  }
  if (targetWord && !seen.has(targetWord)) candidates.push(targetWord);
  return candidates.sort((a, b) => a.length - b.length || a.localeCompare(b));
}

function setAttemptProgress(ratio) {
  attemptProgress.style.width = `${clamp(ratio, 0, 1) * 100}%`;
}

function renderAttemptLog() {
  attemptLog.innerHTML = '';
  for (const attempt of codewordGame.lastAttempts.slice(-8).reverse()) {
    const item = document.createElement('li');
    item.className = attempt.found ? 'found-attempt' : '';
    item.textContent = attempt.found ? `✓ ${attempt.word}` : attempt.word;
    attemptLog.append(item);
  }
}

function renderWordBank() {
  wordBankList.innerHTML = '';
  wordBankCount.textContent = `${codewordGame.words.length} ${codewordGame.words.length === 1 ? 'word' : 'words'}`;

  codewordGame.words.forEach((entry, index) => {
    const item = document.createElement('li');
    if (index === codewordGame.activeIndex) item.classList.add('active-word');

    const detail = document.createElement('span');
    detail.textContent = `${entry.word.toUpperCase()} — ${entry.clue}`;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'link-button danger-link';
    remove.dataset.removeCodeword = String(index);
    remove.textContent = 'Remove';
    remove.disabled = codewordGame.words.length <= 1;

    item.append(detail, remove);
    wordBankList.append(item);
  });
}

function renderCodewordSelect() {
  codewordSelect.innerHTML = '';
  codewordGame.words.forEach((entry, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = `${index + 1}. ${entry.clue}`;
    codewordSelect.append(option);
  });
  codewordSelect.value = String(codewordGame.activeIndex);
}

function renderCodewordGame({ reveal = false } = {}) {
  const current = activeCodeword();
  if (!current) return;

  clueText.textContent = current.clue;
  answerMask.textContent = `${maskCodeword(current.word, reveal)} (${current.word.length})`;
  renderCodewordSelect();
  renderWordBank();
  renderAttemptLog();
}

function stopBruteforce(message = 'Stopped. Choose a clue or add more words to continue.') {
  window.clearInterval(codewordGame.timerId);
  codewordGame.timerId = null;
  codewordGame.isRunning = false;
  startBruteforceBtn.textContent = 'Brute Force Word Bank';
  bruteforceStatus.textContent = message;
}

function finishBruteforce(foundWord) {
  stopBruteforce(`Unlocked “${foundWord.toUpperCase()}” after ${codewordGame.attemptIndex} ${codewordGame.attemptIndex === 1 ? 'attempt' : 'attempts'}.`);
  setAttemptProgress(1);
  renderCodewordGame({ reveal: true });
}

function stepBruteforce() {
  const current = activeCodeword();
  if (!current) {
    stopBruteforce('No codeword is available. Add a clue and word to start.');
    return;
  }

  if (codewordGame.attemptIndex >= codewordGame.candidates.length) {
    stopBruteforce(`No match found after ${codewordGame.candidates.length} attempts. Add the missing word and try again.`);
    return;
  }

  const candidate = codewordGame.candidates[codewordGame.attemptIndex];
  codewordGame.attemptIndex += 1;
  const found = candidate === current.word;
  codewordGame.lastAttempts.push({ word: candidate, found });
  setAttemptProgress(codewordGame.attemptIndex / codewordGame.candidates.length);
  bruteforceStatus.textContent = `Trying ${candidate.toUpperCase()} (${codewordGame.attemptIndex}/${codewordGame.candidates.length})…`;
  renderAttemptLog();

  if (found) finishBruteforce(candidate);
}

function startBruteforce() {
  if (codewordGame.isRunning) {
    stopBruteforce('Paused brute-force drill.');
    return;
  }

  const current = activeCodeword();
  if (!current) return;

  codewordGame.isRunning = true;
  codewordGame.attemptIndex = 0;
  codewordGame.candidates = makeCandidateList(current.word);
  codewordGame.lastAttempts = [];
  startBruteforceBtn.textContent = 'Pause Brute Force';
  setAttemptProgress(0);
  renderCodewordGame();
  bruteforceStatus.textContent = `Scanning ${codewordGame.candidates.length} saved ${codewordGame.candidates.length === 1 ? 'word' : 'words'} for this clue…`;
  stepBruteforce();
  if (codewordGame.isRunning) {
    codewordGame.timerId = window.setInterval(stepBruteforce, 450);
  }
}

function chooseCodeword(index) {
  stopBruteforce('Ready: selected clue loaded.');
  codewordGame.activeIndex = clamp(index, 0, codewordGame.words.length - 1);
  codewordGame.lastAttempts = [];
  setAttemptProgress(0);
  renderCodewordGame();
}

function addCodeword(clue, word) {
  const entry = createStoredCodeword(clue, word);
  if (!entry.clue || !entry.word) {
    bruteforceStatus.textContent = 'Enter a clue and a word using letters, numbers, or hyphens.';
    return;
  }

  const existingIndex = codewordGame.words.findIndex((item) => item.word === entry.word);
  if (existingIndex >= 0) {
    codewordGame.words[existingIndex] = entry;
    codewordGame.activeIndex = existingIndex;
    bruteforceStatus.textContent = `Updated ${entry.word.toUpperCase()} and loaded it as the active clue.`;
  } else {
    codewordGame.words.push(entry);
    codewordGame.activeIndex = codewordGame.words.length - 1;
    bruteforceStatus.textContent = `Added ${entry.word.toUpperCase()} to the brute-force word bank.`;
  }

  saveCodewords();
  codewordGame.lastAttempts = [];
  setAttemptProgress(0);
  renderCodewordGame();
}

function removeCodeword(index) {
  if (codewordGame.words.length <= 1) {
    bruteforceStatus.textContent = 'Keep at least one word in the bank.';
    return;
  }

  const removed = codewordGame.words.splice(index, 1)[0];
  codewordGame.activeIndex = clamp(codewordGame.activeIndex, 0, codewordGame.words.length - 1);
  saveCodewords();
  chooseCodeword(codewordGame.activeIndex);
  bruteforceStatus.textContent = `Removed ${removed.word.toUpperCase()} from the word bank.`;
}

function restoreDefaultCodewords() {
  stopBruteforce('Defaults restored. Add your own words whenever you want.');
  codewordGame.words = DEFAULT_CODEWORDS.map((item) => ({ ...item }));
  codewordGame.activeIndex = 0;
  codewordGame.lastAttempts = [];
  saveCodewords();
  setAttemptProgress(0);
  renderCodewordGame();
}

function initCodewordGame() {
  if (!clueText) return;
  codewordGame.words = getSavedCodewords();
  renderCodewordGame();
  setAttemptProgress(0);
}

function frame(ts) {
  if (!frame.last) frame.last = ts;
  const dt = Math.min((ts - frame.last) / 1000, 0.05);
  frame.last = ts;
  const tSeconds = ts / 1000;

  integrate(dt, tSeconds);
  drawHarbor();
  drawPredictedTrack();
  drawShip();
  updateInstruments(tSeconds);
  requestAnimationFrame(frame);
}

function bindControl(input, setter) {
  input.addEventListener('input', () => {
    setter(Number(input.value));
    setOutputs();
  });
}

bindControl(throttleInput, (v) => { ship.thrustCmd = v; });
bindControl(rudderInput, (v) => { ship.podAngleCmd = normalizeAngleDeg(v); });
bindControl(thrusterInput, (v) => { ship.thrusterCmd = v; });

scenarioSelect.addEventListener('change', resetScenario);
resetBtn.addEventListener('click', resetScenario);

startBruteforceBtn.addEventListener('click', startBruteforce);
nextClueBtn.addEventListener('click', () => chooseCodeword((codewordGame.activeIndex + 1) % codewordGame.words.length));
codewordSelect.addEventListener('change', () => chooseCodeword(Number(codewordSelect.value)));
restoreWordsBtn.addEventListener('click', restoreDefaultCodewords);
codewordForm.addEventListener('submit', (event) => {
  event.preventDefault();
  addCodeword(newClueInput.value, newWordInput.value);
  codewordForm.reset();
  newClueInput.focus();
});
wordBankList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-remove-codeword]');
  if (!button) return;
  removeCodeword(Number(button.dataset.removeCodeword));
});

window.addEventListener('keydown', (e) => {
  if (e.repeat || ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName)) return;
  if (e.key.toLowerCase() === 'w') ship.thrustCmd = clamp(ship.thrustCmd + 10, -100, 100);
  if (e.key.toLowerCase() === 's') ship.thrustCmd = clamp(ship.thrustCmd - 10, -100, 100);
  if (e.key.toLowerCase() === 'a') ship.podAngleCmd = normalizeAngleDeg(ship.podAngleCmd - 5);
  if (e.key.toLowerCase() === 'd') ship.podAngleCmd = normalizeAngleDeg(ship.podAngleCmd + 5);
  if (e.key.toLowerCase() === 'q') ship.thrusterCmd = clamp(ship.thrusterCmd - 10, -100, 100);
  if (e.key.toLowerCase() === 'e') ship.thrusterCmd = clamp(ship.thrusterCmd + 10, -100, 100);
  if (e.code === 'Space') {
    ship.podAngleCmd = 0;
    ship.thrusterCmd = 0;
  }

  throttleInput.value = ship.thrustCmd;
  rudderInput.value = ship.podAngleCmd;
  thrusterInput.value = ship.thrusterCmd;
  setOutputs();
});

initCodewordGame();
resetScenario();
setOutputs();
requestAnimationFrame(frame);
