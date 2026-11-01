# Component register

The component list is updated one part at a time from owner-provided details.

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
| Joints and bearings | Printed parts currently contact directly; mounts have been designed for 623ZZ bearings (3 × 10 × 4 mm), with installation planned after friction and weak servo performance were encountered |

Firmware values describe commanded pulse widths, not measured angles. The small-servo release timer is not stall detection. Channel assignments and limits must be checked against the physical assembly; use the firmware and hardware notes together.
