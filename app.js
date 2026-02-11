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

const scenarios = [
  {
    name: 'Calm Morning / Starboard Side-to',
    windKts: 4,
    windDirDeg: 220,
    currentKts: 0.3,
    currentDirDeg: 15,
    start: { x: 200, y: 330, hdg: 0 },
    berth: { x: 980, y: 360, hdg: 0, length: 310, width: 44 }
  },
  {
    name: 'Crosswind Challenge / Port Side-to',
    windKts: 24,
    windDirDeg: 270,
    currentKts: 0.9,
    currentDirDeg: 175,
    start: { x: 170, y: 520, hdg: -10 },
    berth: { x: 965, y: 455, hdg: 0, length: 310, width: 44 }
  },
  {
    name: 'Quartering Wind + Current Shear',
    windKts: 18,
    windDirDeg: 315,
    currentKts: 1.1,
    currentDirDeg: 30,
    start: { x: 230, y: 185, hdg: 10 },
    berth: { x: 950, y: 250, hdg: 0, length: 310, width: 44 }
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
  throttleCmd: 0,
  rudderCmd: 0,
  thrusterCmd: 0,
  engineLag: 0,
  thrusterLag: 0
};

const PX_PER_M = 1.25;
const WATER_DENSITY = 1025;
let activeScenario = scenarios[0];
let dockingScored = false;

function degToRad(d) { return (d * Math.PI) / 180; }
function radToDeg(r) { return (r * 180) / Math.PI; }
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

function resetScenario() {
  activeScenario = scenarios[scenarioSelect.selectedIndex];
  ship.x = activeScenario.start.x;
  ship.y = activeScenario.start.y;
  ship.heading = degToRad(activeScenario.start.hdg);
  ship.vx = 0;
  ship.vy = 0;
  ship.yawRate = 0;
  ship.throttleCmd = 0;
  ship.rudderCmd = 0;
  ship.thrusterCmd = 0;
  ship.engineLag = 0;
  ship.thrusterLag = 0;
  throttleInput.value = 0;
  rudderInput.value = 0;
  thrusterInput.value = 0;
  dockingScored = false;
  scoreText.textContent = 'Score: --';
}

function setOutputs() {
  throttleOut.value = `${ship.throttleCmd.toFixed(0)}%`;
  rudderOut.value = `${ship.rudderCmd.toFixed(0)}°`;
  thrusterOut.value = `${ship.thrusterCmd.toFixed(0)}%`;
}

function worldToShipFrame(vx, vy) {
  const c = Math.cos(ship.heading);
  const s = Math.sin(ship.heading);
  return {
    u: c * vx + s * vy,
    v: -s * vx + c * vy
  };
}

function shipToWorldFrame(fx, fy) {
  const c = Math.cos(ship.heading);
  const s = Math.sin(ship.heading);
  return {
    x: c * fx - s * fy,
    y: s * fx + c * fy
  };
}

function integrate(dt) {
  const mass = ship.displacementT * 1000;
  const inertia = mass * Math.pow(ship.lengthM * 0.32, 2);

  ship.engineLag += (ship.throttleCmd - ship.engineLag) * dt * 0.35;
  ship.thrusterLag += (ship.thrusterCmd - ship.thrusterLag) * dt * 1.8;

  const velShip = worldToShipFrame(ship.vx, ship.vy);
  const speed = Math.hypot(ship.vx, ship.vy);

  const windDir = degToRad(activeScenario.windDirDeg);
  const windSpeed = activeScenario.windKts * 0.5144;
  const relWindAngle = windDir - ship.heading;
  const windLateral = Math.sin(relWindAngle) * windSpeed;
  const windLong = Math.cos(relWindAngle) * windSpeed;

  const currentDir = degToRad(activeScenario.currentDirDeg);
  const curSpeed = activeScenario.currentKts * 0.5144;
  const currentVX = Math.cos(currentDir) * curSpeed;
  const currentVY = Math.sin(currentDir) * curSpeed;

  const relVX = ship.vx - currentVX;
  const relVY = ship.vy - currentVY;
  const relShip = worldToShipFrame(relVX, relVY);

  const engineForce = ship.engineLag * 420000;
  const rudderEffect = clamp(velShip.u / 3.5, -1, 1) * ship.rudderCmd * 15000;
  const thrusterForce = ship.thrusterLag * 6800;
  const hydroDragX = -Math.sign(relShip.u) * relShip.u * relShip.u * 95000;
  const hydroDragY = -Math.sign(relShip.v) * relShip.v * relShip.v * 300000;

  const windAreaLat = ship.lengthM * (ship.draftM * 2.6);
  const windAreaLon = ship.beamM * (ship.draftM * 2.0);
  const windForceY = 0.5 * 1.225 * windAreaLat * 1.15 * windLateral * Math.abs(windLateral);
  const windForceX = 0.5 * 1.225 * windAreaLon * 0.85 * windLong * Math.abs(windLong);

  const fxShip = engineForce + hydroDragX + windForceX;
  const fyShip = thrusterForce + hydroDragY + windForceY;

  const yawRudderMoment = rudderEffect * (ship.lengthM * 0.45);
  const yawWindMoment = windForceY * (ship.lengthM * 0.17);
  const yawDamping = -ship.yawRate * Math.abs(ship.yawRate) * inertia * 0.0007;
  const yawMoment = yawRudderMoment + yawWindMoment + yawDamping;

  const forceWorld = shipToWorldFrame(fxShip, fyShip);
  const ax = forceWorld.x / mass;
  const ay = forceWorld.y / mass;
  const yawAcc = yawMoment / inertia;

  ship.vx += ax * dt;
  ship.vy += ay * dt;
  ship.yawRate += yawAcc * dt;
  ship.x += ship.vx * dt * PX_PER_M;
  ship.y += ship.vy * dt * PX_PER_M;
  ship.heading += ship.yawRate * dt;

  const boundaryDrag = 0.0008;
  ship.vx *= 1 - boundaryDrag;
  ship.vy *= 1 - boundaryDrag;

  evaluateDocking(speed);
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
  const headingErr = Math.abs(radToDeg(ship.heading) - berth.hdg);
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
    statusText.textContent = `Target: speed < 0.3 kn, heading error < 5°, lateral offset < 15 m`;
  }
}

function drawHarbor() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, '#1c5f7f');
  g.addColorStop(1, '#1d4c62');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#728088';
  ctx.fillRect(1060, 120, 100, 460);
  ctx.fillStyle = '#87939b';
  ctx.fillRect(1060, 120, 20, 460);

  const berth = activeScenario.berth;
  ctx.save();
  ctx.translate(berth.x, berth.y);
  ctx.rotate(degToRad(berth.hdg));
  ctx.strokeStyle = '#66e0ff';
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = 2;
  ctx.strokeRect(-berth.length / 2, -berth.width / 2 - 20, berth.length, berth.width + 40);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255, 166, 0, 0.4)';
  ctx.fillRect(-berth.length / 2, -berth.width / 2, berth.length, berth.width);
  ctx.restore();

  for (let i = 0; i < 50; i += 1) {
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#b8ecff';
    ctx.fillRect((i * 148) % canvas.width, (i * 37) % canvas.height, 22, 2);
  }
  ctx.globalAlpha = 1;
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

  ctx.strokeStyle = '#ff6b6b';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(shipLenPx * 0.62, 0);
  ctx.stroke();

  ctx.restore();
}

function updateInstruments() {
  const speed = Math.hypot(ship.vx, ship.vy) * 1.94384;
  const sog = speed.toFixed(2);
  const heading = ((radToDeg(ship.heading) % 360) + 360) % 360;
  const yawRateDegMin = radToDeg(ship.yawRate) * 60;

  const berth = activeScenario.berth;
  const dx = ship.x - berth.x;
  const dy = ship.y - berth.y;
  const along = Math.hypot(dx, dy) / PX_PER_M;

  const data = [
    ['Heading', `${heading.toFixed(1)}°`],
    ['Speed over Ground', `${sog} kn`],
    ['Rate of Turn', `${yawRateDegMin.toFixed(1)} °/min`],
    ['Distance to Berth C/L', `${along.toFixed(0)} m`],
    ['Wind', `${activeScenario.windKts} kn @ ${activeScenario.windDirDeg}°`],
    ['Current', `${activeScenario.currentKts} kn @ ${activeScenario.currentDirDeg}°`]
  ];

  instruments.innerHTML = data.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

function frame(ts) {
  if (!frame.last) frame.last = ts;
  const dt = Math.min((ts - frame.last) / 1000, 0.05);
  frame.last = ts;

  integrate(dt);
  drawHarbor();
  drawShip();
  updateInstruments();
  requestAnimationFrame(frame);
}

function bindControl(input, setter) {
  input.addEventListener('input', () => {
    setter(Number(input.value));
    setOutputs();
  });
}

bindControl(throttleInput, (v) => { ship.throttleCmd = v; });
bindControl(rudderInput, (v) => { ship.rudderCmd = v; });
bindControl(thrusterInput, (v) => { ship.thrusterCmd = v; });

scenarioSelect.addEventListener('change', resetScenario);
resetBtn.addEventListener('click', resetScenario);

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.key.toLowerCase() === 'w') ship.throttleCmd = clamp(ship.throttleCmd + 10, -100, 100);
  if (e.key.toLowerCase() === 's') ship.throttleCmd = clamp(ship.throttleCmd - 10, -100, 100);
  if (e.key.toLowerCase() === 'a') ship.rudderCmd = clamp(ship.rudderCmd - 5, -35, 35);
  if (e.key.toLowerCase() === 'd') ship.rudderCmd = clamp(ship.rudderCmd + 5, -35, 35);
  if (e.key.toLowerCase() === 'q') ship.thrusterCmd = clamp(ship.thrusterCmd - 10, -100, 100);
  if (e.key.toLowerCase() === 'e') ship.thrusterCmd = clamp(ship.thrusterCmd + 10, -100, 100);
  if (e.code === 'Space') {
    ship.rudderCmd = 0;
    ship.thrusterCmd = 0;
  }

  throttleInput.value = ship.throttleCmd;
  rudderInput.value = ship.rudderCmd;
  thrusterInput.value = ship.thrusterCmd;
  setOutputs();
});

resetScenario();
setOutputs();
requestAnimationFrame(frame);
