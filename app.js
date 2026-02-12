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

const PX_PER_M = 1.3;

const scenarios = [
  {
    name: 'Calm Morning / Starboard Side-to',
    windKts: 6,
    windDirDeg: 220,
    currentKts: 0.3,
    currentDirDeg: 15,
    gustKts: 2,
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
  x: 0,
  y: 0,
  heading: 0,
  vx: 0,
  vy: 0,
  yawRate: 0,
  thrustCmd: 0,
  podAngleCmd: 0,
  thrusterCmd: 0,
  thrustLag: 0,
  podAngleLag: 0,
  thrusterLag: 0
};

let activeScenario = scenarios[0];
let traffic = [];
let dockingScored = false;

function degToRad(d) { return (d * Math.PI) / 180; }
function radToDeg(r) { return (r * 180) / Math.PI; }
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

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

function resetScenario() {
  activeScenario = scenarios[scenarioSelect.selectedIndex];
  ship.x = activeScenario.start.x;
  ship.y = activeScenario.start.y;
  ship.heading = degToRad(activeScenario.start.hdg);
  ship.vx = 0;
  ship.vy = 0;
  ship.yawRate = 0;
  ship.thrustCmd = 0;
  ship.podAngleCmd = 0;
  ship.thrusterCmd = 0;
  ship.thrustLag = 0;
  ship.podAngleLag = 0;
  ship.thrusterLag = 0;

  traffic = activeScenario.traffic.map((v) => ({ ...v, heading: degToRad(v.heading) }));

  throttleInput.value = 0;
  rudderInput.value = 0;
  thrusterInput.value = 0;
  dockingScored = false;
  scoreText.textContent = 'Score: --';
}

function setOutputs() {
  throttleOut.value = `${ship.thrustCmd.toFixed(0)}%`;
  rudderOut.value = `${ship.podAngleCmd.toFixed(0)}°`;
  thrusterOut.value = `${ship.thrusterCmd.toFixed(0)}%`;
}

function getForces(state, scenario, tSeconds) {
  const mass = state.displacementT * 1000;
  const inertia = mass * Math.pow(state.lengthM * 0.33, 2);

  const gust = Math.sin(tSeconds * 0.12) * scenario.gustKts;
  const windKtsDynamic = scenario.windKts + gust;

  const windDir = degToRad(scenario.windDirDeg);
  const windSpeed = windKtsDynamic * 0.5144;
  const relWindAngle = windDir - state.heading;
  const windLateral = Math.sin(relWindAngle) * windSpeed;
  const windLong = Math.cos(relWindAngle) * windSpeed;

  const currentDir = degToRad(scenario.currentDirDeg);
  const curSpeed = scenario.currentKts * 0.5144;
  const currentVX = Math.cos(currentDir) * curSpeed;
  const currentVY = Math.sin(currentDir) * curSpeed;

  const relVX = state.vx - currentVX;
  const relVY = state.vy - currentVY;
  const relShip = worldToShipFrame(relVX, relVY, state.heading);

  const podAngleRad = degToRad(state.podAngleLag);
  const podForce = state.thrustLag * 480000;
  const podFx = Math.cos(podAngleRad) * podForce;
  const podFy = Math.sin(podAngleRad) * podForce;

  const thrusterForce = state.thrusterLag * 7800;

  const hydroDragX = -Math.sign(relShip.u) * relShip.u * relShip.u * 98000;
  const hydroDragY = -Math.sign(relShip.v) * relShip.v * relShip.v * 320000;

  const windAreaLat = state.lengthM * (state.draftM * 2.9);
  const windAreaLon = state.beamM * (state.draftM * 2.2);
  const windForceY = 0.5 * 1.225 * windAreaLat * 1.18 * windLateral * Math.abs(windLateral);
  const windForceX = 0.5 * 1.225 * windAreaLon * 0.85 * windLong * Math.abs(windLong);

  const berthX = scenario.berth.x;
  const distToPier = Math.max(20, Math.abs(berthX + 140 - state.x));
  const bankFactor = clamp(1 - distToPier / 280, 0, 1);
  const bankSuction = bankFactor * -62000 * Math.sign(relShip.v || 1);
  const yawBankMoment = bankFactor * -3.4e7 * Math.sign(relShip.v || 1);

  const shallowFactor = clamp(1 - (state.y / canvas.height), 0, 1) * 0.2;
  const squatDrag = -Math.sign(relShip.u) * shallowFactor * relShip.u * relShip.u * 25000;

  const fxShip = podFx + hydroDragX + windForceX + squatDrag;
  const fyShip = podFy + thrusterForce + hydroDragY + windForceY + bankSuction;

  const podMoment = podFy * (state.lengthM * 0.35);
  const windMoment = windForceY * (state.lengthM * 0.17);
  const yawDamping = -state.yawRate * Math.abs(state.yawRate) * inertia * 0.0008;
  const yawMoment = podMoment + windMoment + yawDamping + yawBankMoment;

  const forceWorld = shipToWorldFrame(fxShip, fyShip, state.heading);
  return {
    ax: forceWorld.x / mass,
    ay: forceWorld.y / mass,
    yawAcc: yawMoment / inertia,
    windKtsDynamic
  };
}

function integrate(dt, tSeconds) {
  ship.thrustLag += (ship.thrustCmd - ship.thrustLag) * dt * 0.32;
  ship.podAngleLag += (ship.podAngleCmd - ship.podAngleLag) * dt * 0.9;
  ship.thrusterLag += (ship.thrusterCmd - ship.thrusterLag) * dt * 1.8;

  const { ax, ay, yawAcc } = getForces(ship, activeScenario, tSeconds);

  ship.vx += ax * dt;
  ship.vy += ay * dt;
  ship.yawRate += yawAcc * dt;
  ship.x += ship.vx * dt * PX_PER_M;
  ship.y += ship.vy * dt * PX_PER_M;
  ship.heading += ship.yawRate * dt;

  ship.vx *= 0.999;
  ship.vy *= 0.999;

  ship.x = clamp(ship.x, 20, canvas.width - 20);
  ship.y = clamp(ship.y, 20, canvas.height - 20);

  for (const v of traffic) {
    v.x += v.vx;
    v.y += v.vy;
    if (v.x < 80 || v.x > canvas.width - 80) v.vx *= -1;
    if (v.y < 80 || v.y > canvas.height - 80) v.vy *= -1;
    v.heading = Math.atan2(v.vy, v.vx);
  }

  evaluateDocking(Math.hypot(ship.vx, ship.vy));
}

function evaluateDocking(speedMS) {
  const berth = activeScenario.berth;
  const dx = ship.x - berth.x;
  const dy = ship.y - berth.y;
  const c = Math.cos(-degToRad(berth.hdg));
  const s = Math.sin(-degToRad(berth.hdg));
  const localX = c * dx - s * dy;
  const localY = s * dx + c * dy;

  const withinLong = Math.abs(localX) < berth.length * 0.43;
  const closeLat = Math.abs(localY) < berth.width * 0.62;
  const headingErr = Math.abs((((radToDeg(ship.heading) - berth.hdg) + 540) % 360) - 180);
  const speedKts = speedMS * 1.94384;

  if (withinLong && closeLat && speedKts < 0.3 && headingErr < 5 && !dockingScored) {
    const lateralScore = clamp(100 - Math.abs(localY) * 2.2, 0, 100);
    const headingScore = clamp(100 - headingErr * 10, 0, 100);
    const speedScore = clamp(100 - speedKts * 180, 0, 100);
    const total = (lateralScore * 0.45 + headingScore * 0.35 + speedScore * 0.2).toFixed(1);
    scoreText.textContent = `Score: ${total}/100`;
    dockingScored = true;
    statusText.textContent = Number(total) > 85
      ? 'Excellent controlled landing. Proceed with mooring lines.'
      : 'Docking achieved. Review approach profile and force balancing.';
  } else if (!dockingScored) {
    statusText.textContent = 'Target: speed < 0.3 kn, heading error < 5°, lateral offset < 15 m';
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
    x: ship.x,
    y: ship.y,
    heading: ship.heading,
    vx: ship.vx,
    vy: ship.vy,
    yawRate: ship.yawRate,
    thrustLag: ship.thrustLag,
    podAngleLag: ship.podAngleLag,
    thrusterLag: ship.thrusterLag
  };

  ctx.save();
  ctx.strokeStyle = '#7cff9d';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(predictionState.x, predictionState.y);

  const dt = 0.4;
  for (let i = 0; i < 45; i += 1) {
    const { ax, ay, yawAcc } = getForces(predictionState, activeScenario, i * dt);
    predictionState.vx += ax * dt;
    predictionState.vy += ay * dt;
    predictionState.yawRate += yawAcc * dt;
    predictionState.x += predictionState.vx * dt * PX_PER_M;
    predictionState.y += predictionState.vy * dt * PX_PER_M;
    predictionState.heading += predictionState.yawRate * dt;
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
  const speedKts = Math.hypot(ship.vx, ship.vy) * 1.94384;
  const heading = ((radToDeg(ship.heading) % 360) + 360) % 360;
  const yawRateDegMin = radToDeg(ship.yawRate) * 60;

  const berth = activeScenario.berth;
  const dx = ship.x - berth.x;
  const dy = ship.y - berth.y;
  const distM = Math.hypot(dx, dy) / PX_PER_M;
  const { windKtsDynamic } = getForces(ship, activeScenario, tSeconds);

  const data = [
    ['Heading', `${heading.toFixed(1)}°`],
    ['SOG', `${speedKts.toFixed(2)} kn`],
    ['Rate of Turn', `${yawRateDegMin.toFixed(1)} °/min`],
    ['Distance to Berth C/L', `${distM.toFixed(0)} m`],
    ['Azipod Angle', `${ship.podAngleLag.toFixed(1)}°`],
    ['Wind', `${windKtsDynamic.toFixed(1)} kn @ ${activeScenario.windDirDeg}°`],
    ['Current', `${activeScenario.currentKts.toFixed(1)} kn @ ${activeScenario.currentDirDeg}°`]
  ];

  instruments.innerHTML = data.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
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
bindControl(rudderInput, (v) => { ship.podAngleCmd = v; });
bindControl(thrusterInput, (v) => { ship.thrusterCmd = v; });

scenarioSelect.addEventListener('change', resetScenario);
resetBtn.addEventListener('click', resetScenario);

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.key.toLowerCase() === 'w') ship.thrustCmd = clamp(ship.thrustCmd + 10, -100, 100);
  if (e.key.toLowerCase() === 's') ship.thrustCmd = clamp(ship.thrustCmd - 10, -100, 100);
  if (e.key.toLowerCase() === 'a') ship.podAngleCmd = clamp(ship.podAngleCmd - 5, -35, 35);
  if (e.key.toLowerCase() === 'd') ship.podAngleCmd = clamp(ship.podAngleCmd + 5, -35, 35);
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

resetScenario();
setOutputs();
requestAnimationFrame(frame);
