# Cruise Ship Docking Trainer (Browser)

A static, browser-based cruise ship docking simulator designed to run on GitHub Pages. The visual presentation remains intentionally simple, but the maneuvering model now exposes the parameters a deck officer would expect to discuss during basic ship-handling instruction.

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

## Realism model

The browser simulation is not a certified bridge simulator, but its math has been reorganized around the standard maneuvering quantities used in professional validation work:

- **3 degrees of freedom:** surge (`u`), sway (`v`), and yaw (`r`) are integrated separately, then combined with current to produce SOG/COG.
- **Ship particulars:** length, beam, draft, displacement, block coefficient, windage areas, propulsor thrust, astern effectiveness, bow-thruster thrust, lever arms, added mass, and yaw inertia.
- **Hydrodynamics:** nonlinear surge/sway damping, yaw damping, crossflow/yaw coupling, low-speed lateral motion, and actuator response lag.
- **Propulsion and steering:** twin-azipod combined thrust with 360° pod angle, astern thrust reduction, bow-thruster wash/ventilation loss at higher transverse water speed, and realistic command lag.
- **Environment:** current set/drift, apparent wind based on vessel motion, gusting, shallow-water damping, under-keel clearance, squat estimate, and bank suction/yaw moment near the quay.
- **Bridge instruments:** heading/COG, SOG/STW, surge/sway, ROT, leeway, berth offset, heading error, actual pod order, thruster loss, wind, current, depth/UKC, h/T, squat, and bank-effect percentage.

## Research basis and required parameters

The implementation follows the practical parameter groups recommended by maneuvering-simulation guidance:

- **IMO MSC.137(76), Standards for Ship Manoeuvrability:** turning-circle advance and tactical diameter, initial turning ability, zig-zag overshoot, and full-astern stopping track reach are the minimum trial-style behaviors to validate against.
- **ITTC 7.5-02-06-03, Validation of Manoeuvring Simulation Models:** model documentation should include ship particulars, wind profiles/areas, speed at control settings in deep and shallow water, thrusters/auxiliary maneuvering devices, hydrodynamic-force prediction, mathematical model structure, integration method, and simulated maneuvers.
- **MMG/Abkowitz maneuvering-model literature:** common ship-handling models represent hull, propeller, and rudder/steering forces either as whole-ship derivatives or modular component forces; this game uses a compact modular 3-DOF version suitable for real-time browser training.

## Instructor calibration checklist

For a specific vessel, replace the generic cruise-ship constants in `app.js` with values from the maneuvering booklet or sea-trial data:

1. Principal particulars: `lengthM`, `beamM`, `draftM`, `displacementT`, `blockCoefficient`.
2. Propulsion: `maxAzipodThrustN`, `maxAsternFraction`, pod lever arm, pod rotation rate/lag.
3. Bow/stern thrusters: maximum thrust, lever arms, effectiveness curves versus vessel speed.
4. Wind profile: lateral/frontal windage area and coefficients for the loaded condition.
5. Hydrodynamic coefficients: added mass, sway/yaw damping, crossflow terms, and shallow-water multipliers.
6. Environmental scenario: current set/drift, wind direction/speed/gusting, depth, UKC, quay/bank geometry.
7. Validation outcomes: 35° turning circle advance/tactical diameter, 10°/10° and 20°/20° zig-zag overshoot, stopping track reach, and pilot/officer qualitative handling review.

## Training scope

This is an educational and procedural familiarization tool. It does **not** replace class-approved full-mission bridge simulators, SMS procedures, pilotage requirements, company-specific training programs, or vessel-specific maneuvering booklets.
