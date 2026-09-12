import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

// Both the WASM runtime (copied from node_modules at install by
// scripts/copy-wasm.mjs) and the model are served with the app, so nothing
// depends on a third-party CDN at runtime.
const asset = (p: string) => new URL(import.meta.env.BASE_URL + p, document.baseURI).href;
const WASM_URL = asset("mediapipe/wasm");
// "full" tracks angled / partly-occluded limbs noticeably better than "lite"
// (fewer missed far-hand punches and phantom dragged landmarks); the cost is
// a bit of fps, which modern phones absorb.
const MODEL_URL = asset("models/pose_landmarker_full.task");

let landmarker: PoseLandmarker | null = null;
let pending: Promise<PoseLandmarker> | null = null;

async function create(delegate: "GPU" | "CPU") {
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: "VIDEO",
    numPoses: 3, // detect bystanders too so we can lock onto the boxer
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

export function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (landmarker) return Promise.resolve(landmarker);
  if (pending) return pending;
  pending = (async () => {
    try {
      landmarker = await create("GPU");
    } catch {
      // WebGL delegate is unavailable on some phones/browsers; CPU is slower but works
      landmarker = await create("CPU");
    }
    return landmarker;
  })().catch((e) => {
    pending = null; // let a later attempt retry after e.g. a network failure
    throw e;
  });
  return pending;
}

// MediaPipe pose landmark indices used by the analyzer
export const LM = {
  NOSE: 0,
  L_SHOULDER: 11,
  R_SHOULDER: 12,
  L_ELBOW: 13,
  R_ELBOW: 14,
  L_WRIST: 15,
  R_WRIST: 16,
  L_HIP: 23,
  R_HIP: 24,
  L_KNEE: 25,
  R_KNEE: 26,
  L_ANKLE: 27,
  R_ANKLE: 28,
} as const;

export const SKELETON: [number, number][] = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
];
