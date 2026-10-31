# Component evidence

| Item | Evidence / status |
| --- | --- |
| ESP32-S3 | Current recovered firmware and project documentation |
| PCA9685 | Current firmware: I²C address 0x40; six channels |
| Base servo | TD-8120MG 20 kg·cm class, reported in October build conversation |
| Other servos | MG995 and MG90S; exact current shoulder model not resolved |
| Servo supply | 5 V / 10 A in recovered v43 documentation |
| ESP32-CAM | Owned; vision integration described as future work |
| VL53L0X | Owned according to May conversation; current physical installation unverified |
| Mechanical model | Purchased FABRI_CREATOR design, adapted for this build |

Firmware values describe commanded pulse widths, not measured angles. The small-servo release timer is not stall detection. Channel assignments and limits must be checked against the physical assembly; use the firmware and hardware notes together.
