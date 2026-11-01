# Robot Arm Studio

> **Work in progress.** A personal 3D-printed robotic arm project by **Adam Abu Toamy**.

[العربية](README_AR.md) · [Hardware setup](docs/HARDWARE.md) · [Architecture](docs/ARCHITECTURE.md) · [Tests](TESTING.md)

## Media gallery

**All supplied media: 4 original recordings.** Every video below has its audio track removed. Video frames were copied without re-encoding. Large recordings are presented in numbered consecutive parts; all original video packets are retained.

### Videos — no audio

#### 01 · 20261010_012609.mp4

**Part 1 / 2**

https://github.com/user-attachments/assets/94390b1b-b0bf-4650-b628-1c28aed5c8d9

**Part 2 / 2**

https://github.com/user-attachments/assets/2511000a-6b38-4803-ba41-1df88276ae23

#### 02 · 20261010_163822.mp4

**Part 1 / 3**

https://github.com/user-attachments/assets/789e55f2-b3e5-430a-9eac-277c32a99121

**Part 2 / 3**

https://github.com/user-attachments/assets/4f5b65d3-af0b-4c19-b029-9fd77bc245b8

**Part 3 / 3**

https://github.com/user-attachments/assets/f68e28d5-6f75-4c38-847e-60dced0f6891

#### 03 · 20261015_194516_1.mp4

**Part 1 / 3**

https://github.com/user-attachments/assets/3ec7b10d-4ecd-4156-9a84-4e0bf144a0fe

**Part 2 / 3**

https://github.com/user-attachments/assets/6888627c-a171-4d4e-ba95-91acd07d769d

**Part 3 / 3**

https://github.com/user-attachments/assets/cf608265-d840-4ebc-ac46-4ebd5b87996a

#### 04 · VID-20261010-WA0009.mp4

https://github.com/user-attachments/assets/7fb0add1-2060-4b42-8d35-0cc9e5b18f95

[Media inventory and processing verification](docs/MEDIA_SOURCES.md)

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
