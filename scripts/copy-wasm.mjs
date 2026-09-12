// Copies the MediaPipe vision WASM runtime out of node_modules into public/ so
// the app serves it itself instead of depending on a third-party CDN at runtime.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const dest = join(root, "public", "mediapipe", "wasm");

if (!existsSync(src)) {
  console.error("copy-wasm: @mediapipe/tasks-vision is not installed");
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
for (const f of [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
]) {
  copyFileSync(join(src, f), join(dest, f));
}
console.log("copy-wasm: MediaPipe runtime copied to public/mediapipe/wasm");
