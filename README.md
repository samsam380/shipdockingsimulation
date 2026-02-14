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

## What's new in this version

- Azipod-based propulsion model (combined thrust + pod angle) replacing conventional rudder behavior.
- Full 360° azipod rotation control (-180° to +180° command range).
- ECDIS-style projected movement line showing near-term momentum-based track.
- Dynamic wind gusting and current drift.
- Additional low-speed maneuvering effects (bank suction near quay and shallow-water drag factor).
- Improved rotational hydrodynamic damping/stability so heading rate naturally decays after turn commands are neutralized.
- Harbor scene improvements: land masses, terminal structures, and moving background traffic vessels.

## Training scope

This is an educational and procedural familiarization tool. It does **not** replace class-approved full-mission bridge simulators, SMS procedures, pilotage requirements, or company-specific training programs.

