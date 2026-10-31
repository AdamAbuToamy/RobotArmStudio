# Validation — 2026-10-25

The interface is work in progress. No physical serial port or robot was used for these checks. Motion transport in browser tests is simulated; these results do not validate motor direction, limits, mechanics, calibration, camera alignment or stopping distance.

## Results

- 16 browser regression checks passed on the local version and the GitHub export: six rendered and selectable joint diagrams in the light interface, a simple everyday screen with closed advanced controls, visible designer credit and a detailed bilingual project story, source geometry preservation and picking/camera rotation in the sketch workspace, Arabic/English pages and phone layout, no automatic activation, explicit connection, held-motion release/Escape/navigation stop, routine storage/edit/replay, calibration preservation, authenticated media storage, phone sharing from the interface, reduced-motion animation behavior, read-only visitor galleries, and no uncaught browser errors.
- 8 server integration tests passed: pairing and assets, routine storage, media authorization/ranges/deletion, upload rejection/cleanup, optional phone listener lifecycle and controller disconnection, API origin/input checks, separate paired credentials and server-enforced owner-only media mutations on both desktop and LAN listeners.
- Firmware, kinematics.js and planner.js match the recovered Fix39 baseline byte for byte. See release-validation.json.
- The public export excludes original STL/STEP/mesh assets and private runtime data. Its 3D view is a schematic, not the original robot geometry.
- At the time of these 25 October checks no actual build photos or videos were included. Update, 1 November: real historical media has since been added; see docs/MEDIA_SOURCES.md. Test images remain temporary fixtures, separate from project media.

## Reproduce

Install the Python dependencies from requirements.txt. From this application directory:

```sh
python -m unittest discover -s tests -v
```

For optional development browser tests, install Playwright in a development environment (`npm install --no-save playwright` and `npx playwright install chromium`), then run:

```sh
node tests/browser.cjs
```

Alternatively set BROWSER_EXECUTABLE to an installed compatible Chromium binary. The test starts its own temporary local server on port 8876 and uses a temporary database; the port must be free. Browser dependencies are not required to run the controller normally.

## الاختبار الفعلي المتبقي

اجتازت الواجهة 16 فحصًا للمتصفح و8 فحوص للخادم بالمحاكاة. يلزم اختبار اتجاه كل محرك وحدوده، المعايرة، وثبات الاتصال والتوقف على الروبوت الحقيقي قبل اعتماد الحركة. الصور والفيديو الفعليان مطلوبان لإكمال توثيق البناء.
