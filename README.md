# Cruise Ship Docking Trainer (Browser)

A static, browser-based cruise ship docking simulator designed to run on GitHub Pages.

## Run locally

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## Deploy on GitHub Pages

1. Push this repository to GitHub.
2. In **Settings → Pages**, select **Deploy from branch**.
3. Select your default branch and `/ (root)` folder.
4. Save and open the published URL.

## Training scope

The simulator includes:
- 2D hydrodynamic-like motion model with inertia, drag, rudder moment, wind loading, and current drift.
- Bridge controls (telegraph, rudder, bow thruster) with actuator lag.
- Multiple scenarios with environmental disturbances.
- Instrument panel and docking score envelope.

> Note: This is an educational aid and procedural familiarization tool. It does not replace class-approved full-mission bridge simulators, SMS procedures, pilotage requirements, or company-specific training.
