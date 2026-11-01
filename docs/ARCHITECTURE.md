# Architecture

```mermaid
flowchart TD
  UI["Arabic / English controller"] --> Bridge["Python USB bridge"]
  Bridge --> DB["SQLite routines and settings"]
  Bridge --> MCU["ESP32-S3"]
  MCU --> PWM["PCA9685 and servos"]
  UI --> Model["Calibrated command model"]
  Model --> Plan["XYZ preview and planner"]
  UI --> Media["Local project media"]
```

- `index.html`, `interface.css`, `interface.js`: page structure and presentation state.
- `i18n.js`: explicit Arabic/English catalogue, dynamic message translation and RTL/LTR switching.
- `controller.js`: existing serial command/state handling, manual movement, poses and playback.
- `studio.js`: keyboard controller, storage, connection and settings.
- `kinematics.js`, `planner.js`, `cartesian.js`: command calibration, numerical motion model, planning and viewer.
- `robot-view.js`: retained renderer compatibility.
- `server.py`: authenticated local bridge, one controller session, SQLite and media storage.
- `phone_access.py`, `phone-access.js`: opt-in LAN listener started and stopped by the website; independent from the always-local controller listener.
- `project-media.js`: gallery with server-authorized owner editing; paired devices have read-only media access. Previously saved IndexedDB media can still be read in direct-file mode.

Language and page changes do not issue activation or movement commands. Leaving a manual control page or losing the relevant input focus stops held manual movement. The existing timeout and protocol guards remain in force.

ESP32-CAM work and mounting-bracket development have started and are under testing. Vision-guided picking and ToF integration remain in development.

Media authorization: the local launcher uses an owner token; pairing and phone URLs issue a separate controller token. The capabilities endpoint describes the current media role. The server enforces that role on uploads/deletions, with the LAN listener always read-only for media.

Interface 43 keeps everyday commands separate from a closed Advanced settings area. Commanded pulse values and calibration angles remain available there. The WebGL simulation uses the original source triangles unchanged, with derived feature-edge strokes, pastel surface shading and a lighter dashed workspace grid. These rendering buffers do not change the kinematics, collision model or source geometry.

## XYZ simulator and path planning

The simulator lets the user choose an XYZ target and preview a reaching pose. `kinematics.js` solves inverse kinematics; `planner.js` checks direct routes first, then searches a progressive Lazy PRM roadmap with A*, validating candidate edges. RRT-Connect is a fallback. `cartesian.js` coordinates preview and physical execution. Physical execution is gated by a live connection, verified calibration and enabled joints. The model represents commanded poses; no measured endpoint accuracy is claimed.
