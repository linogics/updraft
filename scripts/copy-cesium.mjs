// Copies Cesium's static runtime assets (workers, widgets, assets) into static/cesium,
// where CESIUM_BASE_URL points at runtime. Runs on postinstall.
import { cpSync, existsSync, rmSync } from 'node:fs';

const src = 'node_modules/cesium/Build/Cesium';
const dest = 'static/cesium';

if (!existsSync(src)) {
  console.warn(`[copy-cesium] ${src} not found, skipping`);
  process.exit(0);
}
rmSync(dest, { recursive: true, force: true });
for (const dir of ['Workers', 'ThirdParty', 'Assets', 'Widgets']) {
  cpSync(`${src}/${dir}`, `${dest}/${dir}`, { recursive: true });
}
console.log(`[copy-cesium] copied Cesium assets to ${dest}`);
