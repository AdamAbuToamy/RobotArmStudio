# Robot Arm Studio

> **Work in progress.** A personal 3D-printed robotic arm project by **Adam Abu Toamy**.

[العربية](README_AR.md) · [Hardware setup](docs/HARDWARE.md) · [Architecture](docs/ARCHITECTURE.md) · [Tests](TESTING.md)

## Media gallery

**Original build video — play below.** Uploaded as supplied, without trimming, re-encoding, generated imagery or extracted frames.

https://github.com/user-attachments/assets/28c75aba-facb-49fb-a1cb-6b1d14c9c26e

[Original video file](docs/media/VID-20261010-WA0009.mp4) · [Media source](docs/MEDIA_SOURCES.md)

## Project and my work

I assembled a servo-driven arm using a purchased mechanical design and developed the electronics integration and Robot Arm Studio controller around it. The arm is assembled; calibration, mechanical refinement and physical testing continue.

The recovered controller source includes joint and gripper control, speed selection, pose/routine storage and replay, an Arabic/English interface, and optional phone access through a local computer. These are software capabilities; they are not a claim that every movement has been validated on hardware.

## Parts

| Component | Documented information |
| --- | --- |
| Controller | ESP32-S3 |
| Servo driver | PCA9685; firmware addresses six channels |
| Base servo | 20 kg·cm-class servo |
| Elbow servo | MG995 |
| Wrist / roll / gripper | MG90S in the recorded build |
| Servo supply | 5 V / 10 A in the recovered project documentation |
| Structure | 3D-printed parts based on a purchased design |
| ESP32-CAM and VL53L0X | Owned components; integration is planned, not presented as complete |

The exact current shoulder servo model is not confirmed. See [component evidence](docs/COMPONENTS.md). Firmware pulse settings are commands, not sensor measurements.

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
