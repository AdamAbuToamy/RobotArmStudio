# Hardware setup

## Owner-specified components

| Component | Specification |
| --- | --- |
| Controller board | ESP32-S3 N16R8 development board; Wi-Fi and Bluetooth; Arduino IDE support |
| Servo driver | PCA9685; 16-channel, 12-bit PWM; I²C interface |
| Servo power supply | 5 V / 10 A output; EU plug |
| Base servo | High-torque digital servo with metal gears; product rating: 20KG |
| Shoulder servo | MG995 standard digital servo; product rating: 15KG, 180° travel |
| Elbow servo | MG995 standard digital servo; product rating: 15KG, 180° travel |
| Wrist pitch servo (up/down) | MG90S; all-metal gears |
| Wrist roll servo | MG90S; all-metal gears |
| Gripper open/close servo | MG90S; all-metal gears |
| Camera | ESP32-CAM; work on camera and mounting brackets has started; under testing |
| Distance sensor | VL53L0X; planned for future integration |
| Printed structure material | Currently PLA; PETG is available as an alternative if use and testing show insufficient flexibility in PLA |
| Joints and bearings | Printed parts currently contact directly; bearing mounts have been designed and bearings are planned after friction and weak servo performance were encountered |

## Setup

1. Wire and verify the ESP32-S3 / PCA9685 I²C connection and the servo power distribution. Use a common signal/power ground.
2. Confirm the servo-to-channel assignment in `RobotArmStudio/RobotArmStudio.ino` against the physical arm. The current protocol handles six channels.
3. Upload the included firmware for first-time setup. Its original project expects **USB CDC On Boot disabled** for the UART USB port in use.
4. Open the local bridge and select the board's USB port. Close any Serial Monitor that holds the same port.
5. Support the arm before first initialization. Start with tested pulse limits and avoid mechanical hard stops.
6. In Settings, review joint limits, holding behavior and model calibration. Calibration is a command model; the hardware has no joint encoders in this configuration.

The UI redesign does not require a new firmware flash when the bundled v20 protocol is already working. Back up your current `data` folder before replacing application files. Do not replace your saved calibration with another robot's values.

The global software Stop is not a physical emergency-stop circuit and disconnecting the browser does not necessarily remove servo power. Holding or releasing a loaded joint changes its physical behavior.

Phone access is an in-app option. Start the regular application once, click Phone in the header, and scan its QR code. No additional phone server is started manually. Turning sharing off stops the LAN listener and stops/closes an active phone controller, while the computer app stays available. Windows may ask to allow the Python application on a private network on first use.
