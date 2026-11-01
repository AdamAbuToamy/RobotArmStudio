# Robot Arm Studio

> **Work in progress.** A personal 3D-printed robotic arm project by **Adam Abu Toamy**.

[العربية](README_AR.md) · [Hardware setup](docs/HARDWARE.md) · [Architecture](docs/ARCHITECTURE.md) · [Tests](TESTING.md)

## Media gallery

**All supplied media: 4 recordings.** Audio tracks have been removed. Each complete recording is provided as one compressed H.264 file without splitting, with all frames retained.

### Videos — no audio

#### 01 · 20261010_012609.mp4

https://github.com/user-attachments/assets/9a74ace3-854d-4638-b9ac-0bdbb576daa9

#### 02 · 20261010_163822.mp4

https://github.com/user-attachments/assets/d9c08058-35b5-4dc2-bd96-0c657dcb64bc

#### 03 · 20261015_194516_1.mp4

https://github.com/user-attachments/assets/d4cfe535-e3a1-4447-85e7-e06dfd3d00e5

#### 04 · VID-20261010-WA0009.mp4

https://github.com/user-attachments/assets/7fb0add1-2060-4b42-8d35-0cc9e5b18f95

[Media inventory](docs/MEDIA_SOURCES.md)

## Project and my work

I assembled a servo-driven arm using a purchased mechanical design and developed the electronics integration and Robot Arm Studio controller around it. The arm is assembled; calibration, mechanical refinement and physical testing continue.

The recovered controller source includes joint and gripper control, speed selection, pose/routine storage and replay, an Arabic/English interface, and optional phone access through a local computer. These are software capabilities; they are not a claim that every movement has been validated on hardware.

## Parts

The component list is being updated one part at a time from owner-provided details.

## Difficulties and current work

| Difficulty encountered | Recorded work / remaining status |
| --- | --- |
| Joint limits and direction mapping | Calibration and matching the interface to the physical arm; refinement continues |
| Abrupt movement | Speed controls and motion smoothing are implemented in code; physical tuning remains ongoing |
| MG90S jitter and gripper weakness | Reported during the build; no claim of a final fix or measured grasp force |
| Friction and printed-part fit | Mechanical refinement remains ongoing |
| Holding a load versus releasing servo pulses | Holding/release behavior exists in the software; release timing is not stall sensing |

## Development stages

| Stage | Status |
| --- | --- |
| Print and assemble the physical arm | Assembly reported complete; fit and stability refinement continue |
| Connect electronics and establish manual control | Implemented; shown in the original build recording |
| Add calibration, saved motions and phone access | Present in the recovered software; integration testing continues |
| Improve smoothness, grip and repeatability | In progress; no measured repeatability claimed |
| Camera / distance-sensor integration and vision-guided picking | Planned; not complete |

## Run the controller

On Windows, run `START_WINDOWS.bat`. For Linux/macOS:

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python server.py
```

The computer bridges the browser to the ESP32-S3 over USB. Optional phone control uses the same computer on the local network. Read [hardware setup](docs/HARDWARE.md) before moving the arm.

## Validation and limits

Eight existing server integration tests passed during repository preparation using simulated hardware transport. This is not a physical robot test. Joint angles and grasp force are not directly measured in this build; autonomous vision-guided picking and validated millimetre accuracy are not claimed.

## Mechanical design credit

Purchased base design: [FABRI_CREATOR on Cults3D](https://cults3d.com/en/3d-model/gadget/brazo-robotico-con-arduino-step-files-robotic-arm-guardar-reproducir-export). The original designer is credited for the mechanical model; original purchased CAD/STL files are excluded. See [attribution](ATTRIBUTION.md).
