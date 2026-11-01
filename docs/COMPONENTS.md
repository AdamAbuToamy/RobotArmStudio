# Component register

The component list is updated one part at a time from owner-provided details.

| Component | Specification |
| --- | --- |
| Controller board | ESP32-S3 N16R8 development board; Wi-Fi and Bluetooth; Arduino IDE support |
| Servo driver | PCA9685; 16-channel, 12-bit PWM; I²C interface |
| Base servo | High-torque digital servo with metal gears; product rating: 20KG |
| Shoulder servo | MG995 standard digital servo; product rating: 15KG, 180° travel |
| Elbow servo | MG995 standard digital servo; product rating: 15KG, 180° travel |
| Wrist pitch servo (up/down) | MG90S; all-metal gears |
| Wrist roll servo | MG90S; all-metal gears |
| Gripper open/close servo | MG90S; all-metal gears |

Firmware values describe commanded pulse widths, not measured angles. The small-servo release timer is not stall detection. Channel assignments and limits must be checked against the physical assembly; use the firmware and hardware notes together.
