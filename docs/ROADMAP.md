# Development roadmap

All stages below are work in progress unless the capability is already present in the controller. Acceptance requires recorded evidence, not only a successful simulation.

| Stage | Work | Evidence to record |
| --- | --- | --- |
| 1. Reliable mechanics | Servo fits, bearings/supports, friction, power-drop checks, cable routing, low camera mount | No binding across tested motion; stable supply at servos; repeated endpoint error measurements |
| 2. Calibrated motion | Joint axes and limits, two-point calibration, known reachable targets, IK alternatives, collision checks | Solve FK-generated targets; compare predicted and measured TCP; report failures by cause |
| 3. Repeatable sequences | Coordinated moves, acceleration/deceleration, cancellation, gripper state and holding | Repeated pick/place sequence, stop behavior and command logs |
| 4. Camera and distance | ESP32-CAM on the rotating base; distance sensor near gripper; intrinsics, extrinsics and plane calibration | Reprojection error, work-surface localization error and distance-sensor checks |
| 5. Vision-assisted picking | Detect a simple object, approach pose, re-image, correct, approach slowly, grasp, lift, verify and place | Success rate, endpoint error, time per attempt and categorized failures |
| 6. Learned perception | Fine-tune an object detector/segmenter on build-specific data; evaluate error compensation | Separate train/validation/test capture sessions; precision/recall, latency and measured improvement over baseline |

## Current mechanical work

The joints currently use direct contact between printed parts. Friction and weak servo performance were encountered during use. The owner has designed bearing mounts and plans to add bearings; installation and its effect remain to be tested.

## Current implementation

The XYZ simulator supports selecting a target point and previewing a reaching pose. IK solves the joint configuration. The planner attempts direct routes first, uses progressive Lazy PRM with A* for indirect routes, and includes an RRT-Connect fallback. These software capabilities do not establish physical positioning accuracy.

Work on the ESP32-CAM and its mounting brackets has started and is under testing. Vision-guided picking remains in development.

## Planned task loop

Observe while the arm is still → locate object → convert to robot coordinates → find grasp and approach poses → validate path → move → re-image/correct → use distance readings for final approach → grasp/lift → verify → place.

The camera identifies scene structure; a single ToF sensor does not turn a monocular camera into a full depth camera. The numerical planner needs a correct robot model and explicit obstacle geometry. No stage promises zero failures or arbitrary reachability.
