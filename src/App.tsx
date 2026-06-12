import { useCallback, useEffect, useRef, useState } from "react";
import { BoxingAnalyzer } from "./analysis/boxingAnalyzer";
import { buildCritiques } from "./analysis/critique";
import { drawOverlay } from "./analysis/draw";
import { assessFraming, type FramingStatus } from "./analysis/framing";
import { getPoseLandmarker } from "./analysis/pose";
import type { Critique, FrameMetrics, Point } from "./analysis/types";

type Mode = "idle" | "loading" | "setup" | "live" | "done";

const READY_FRAMES = 60; // ~2s of stable framing before the round starts
const OUT_OF_FRAME_FRAMES = 20; // ~0.7s grace — pivoting causes brief dips

// audible cue so the round start is clear even when the phone is propped up
// with the rear camera and the screen can't be seen
function beep() {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.12;
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
    osc.onended = () => void ctx.close();
  } catch {
    // sound is a nicety, never an error
  }
}

type FrameCallback = (now: number, meta: { mediaTime: number }) => void;
interface VideoFrameCallbacks {
  requestVideoFrameCallback?: (cb: FrameCallback) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
}
const vfcOf = (v: HTMLVideoElement) => v as HTMLVideoElement & VideoFrameCallbacks;

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyzerRef = useRef<BoxingAnalyzer | null>(null);
  const rafRef = useRef(0);
  const vfcRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);

  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<FrameMetrics | null>(null);
  const [critiques, setCritiques] = useState<Critique[]>([]);
  const [framing, setFraming] = useState<FramingStatus | null>(null);
  const [countdownS, setCountdownS] = useState<number | null>(null);
  const [outOfFrame, setOutOfFrame] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">("user");

  const modeRef = useRef<Mode>("idle");
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // background tabs pause media playback and animation frames; without this
  // the stage comes back frozen/black after a tab switch
  useEffect(() => {
    const onVisibility = () => {
      const video = videoRef.current;
      if (!video) return;
      const m = modeRef.current;
      if (document.visibilityState === "visible") {
        if (m === "setup" || m === "live") {
          video.play().catch(() => {});
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const stopLoop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const video = videoRef.current;
    if (video && vfcRef.current) {
      vfcOf(video).cancelVideoFrameCallback?.(vfcRef.current);
      vfcRef.current = 0;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopLoop(), [stopLoop]);

  const finishSession = useCallback(() => {
    stopLoop();
    const a = analyzerRef.current;
    if (a?.hasData()) setCritiques(buildCritiques(a.stats()));
    setMode("done");
  }, [stopLoop]);

  const runLoop = useCallback(async () => {
    const landmarker = await getPoseLandmarker();
    let analyzer = new BoxingAnalyzer();
    analyzerRef.current = analyzer;
    let sessionStarted = false;
    setCritiques([]);
    setFraming(null);
    setOutOfFrame(false);
    let lastMediaT = -1;
    let lastCritiqueT = 0;
    let readyFrames = 0;
    let badFrames = 0;

    // iOS Safari can hand WebGL the camera frame in sensor orientation while
    // displaying it rotated — landmarks then land 90° off from what the user
    // sees. Drawing through a 2D canvas always yields the displayed
    // orientation, so detection runs on exactly what's on screen.
    const work = document.createElement("canvas");
    const workCtx = work.getContext("2d");

    const processFrame = (mediaT: number) => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || !workCtx || video.readyState < 2) return;
      if (mediaT <= lastMediaT) return;
      lastMediaT = mediaT;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;

      let m;
      let lm: Point[] | null = null;
      try {
        if (work.width !== vw || work.height !== vh) {
          work.width = vw;
          work.height = vh;
        }
        workCtx.drawImage(video, 0, 0, vw, vh);
        const result = landmarker.detectForVideo(work, performance.now());
        lm = result.landmarks[0] ?? null;
        m = analyzer.update(lm, mediaT, vw / vh);
      } catch {
        return; // drop the frame — one bad detect must not kill the session
      }

      const status = assessFraming(lm);
      if (!sessionStarted) {
        // setup phase: wait for stable full-body framing, then auto-start
        readyFrames = status.ok ? readyFrames + 1 : 0;
        setFraming(status);
        setCountdownS(
          status.ok
            ? Math.max(1, Math.ceil((READY_FRAMES - readyFrames) / 30))
            : null
        );
        if (readyFrames >= READY_FRAMES) {
          sessionStarted = true;
          analyzer = new BoxingAnalyzer(); // stats start clean at the bell
          analyzerRef.current = analyzer;
          setFraming(null);
          setCountdownS(null);
          setMode("live");
          beep();
        }
      } else {
        badFrames = status.ok ? 0 : badFrames + 1;
        setOutOfFrame(badFrames >= OUT_OF_FRAME_FRAMES);
      }

      setMetrics(m);

      if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
      }
      const ctx = canvas.getContext("2d");
      if (ctx) drawOverlay(ctx, m, canvas.width, canvas.height);

      // refresh live coaching every 5s once there's enough data
      if (sessionStarted && m.time - lastCritiqueT > 5 && analyzer.hasData()) {
        lastCritiqueT = m.time;
        setCritiques(buildCritiques(analyzer.stats()));
      }
    };

    // requestVideoFrameCallback fires exactly once per presented frame with
    // its true media timestamp; rAF fires at display rate, where currentTime
    // is a continuous clock — re-detecting duplicate frames there produces
    // pure-jitter velocities, so the fallback gates on a plausible frame gap
    const useVfc =
      !!videoRef.current &&
      typeof vfcOf(videoRef.current).requestVideoFrameCallback === "function";

    const pumpVfc = () => {
      const video = videoRef.current;
      if (!video || video.ended) return;
      // re-register before processing so a throw can't kill the chain
      vfcRef.current = vfcOf(video).requestVideoFrameCallback!((_now, meta) => {
        pumpVfc();
        processFrame(meta.mediaTime);
      });
    };

    const tick = () => {
      const video = videoRef.current;
      if (!video) return;
      if (video.ended) {
        finishSession();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
      if (!useVfc && !video.paused && video.currentTime - lastMediaT >= 0.02) {
        processFrame(video.currentTime);
      }
    };

    if (useVfc) pumpVfc();
    rafRef.current = requestAnimationFrame(tick);
  }, [finishSession]);

  const startLive = useCallback(async (face: "user" | "environment") => {
    setError(null);
    setMode("loading");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: face, width: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      // unplugged/revoked camera never sets video.ended — end the session
      // instead of spinning on a frozen frame
      stream.getVideoTracks()[0]?.addEventListener("ended", finishSession, {
        once: true,
      });
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setMode("setup");
      await runLoop();
    } catch (e) {
      stopLoop(); // release the camera if the pose model failed to load
      setError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Camera access was denied. Allow camera permission and try again."
          : `Could not start camera: ${e instanceof Error ? e.message : e}`
      );
      setMode("idle");
    }
  }, [runLoop, finishSession, stopLoop]);

  // restarting the loop is the clean way to swap cameras: the media clock
  // resets with a new stream, which the frame gate would otherwise block on
  const flipCamera = useCallback(() => {
    const next = facing === "user" ? "environment" : "user";
    setFacing(next);
    stopLoop();
    startLive(next);
  }, [facing, stopLoop, startLive]);

  const m = metrics;
  const speed = m ? Math.max(m.speedMph.left, m.speedMph.right) : 0;
  const showAlertFrame = outOfFrame && mode === "live";

  return (
    <div className="app">
      <header>
        <h1>
          BOXING<span> COACH</span>
        </h1>
        <p>POSE-TRACKED TECHNIQUE ANALYSIS</p>
      </header>

      {mode === "idle" || mode === "loading" ? (
        <div className="start">
          <button
            className="big-btn"
            disabled={mode === "loading"}
            onClick={() => startLive(facing)}
          >
            ● FILM LIVE
          </button>
          {mode === "loading" && <p className="hint">LOADING POSE MODEL…</p>}
          {error && <p className="error">{error}</p>}
          <p className="hint">
            Prop your phone up side-on or at a 45° angle to where you'll work.
            The round starts automatically (with a beep) once your full body
            has been in frame for a couple of seconds. All analysis runs on
            your device — nothing is uploaded anywhere.
          </p>
        </div>
      ) : null}

      <main className={mode === "idle" || mode === "loading" ? "hidden" : ""}>
        <div className={`stage ${showAlertFrame ? "alert" : ""}`}>
          {/* front cam shows as a mirror; the overlay flips with it */}
          <video
            ref={videoRef}
            playsInline
            muted
            className={facing === "user" ? "mirror" : ""}
          />
          <canvas
            ref={canvasRef}
            className={facing === "user" ? "mirror" : ""}
          />
          {mode === "setup" && (
            <button className="flip-btn" onClick={flipCamera}>
              ⇄ FLIP CAM
            </button>
          )}
          {mode === "setup" && (
            <div className={`stage-banner ${framing?.ok ? "ok" : ""}`}>
              {framing?.ok
                ? `✓ IN FRAME — STARTING IN ${countdownS ?? 2}`
                : (framing?.message ?? "STEP INTO VIEW")}
            </div>
          )}
          {showAlertFrame && (
            <div className="stage-banner">OUT OF FRAME — STEP BACK INTO VIEW</div>
          )}
          {m && mode !== "setup" && (
            <div className="frame-tag">
              T+{m.time.toFixed(1)}S{" "}
              {m.landmarks ? "TRACKING" : "NO BOXER DETECTED"}
            </div>
          )}
        </div>

        <div className={`panels ${mode === "setup" ? "hidden" : ""}`}>
          <section className="card">
            <h2>HAND SPEED</h2>
            <div className="big">{speed.toFixed(0)} MPH</div>
            <div className="sub">
              SESSION MAX: {m ? m.maxSpeedMph.toFixed(0) : 0} MPH
              <br />
              L: {m ? m.speedMph.left.toFixed(0) : 0} R:{" "}
              {m ? m.speedMph.right.toFixed(0) : 0}
            </div>
          </section>

          <section className="card">
            <h2>PUNCHES</h2>
            <div className="big">{m ? m.punchCount : 0}</div>
            <div className="sub">
              LAST:{" "}
              {m?.lastPunch
                ? `${m.lastPunch.hand[0]} ${m.lastPunch.type} @ ${m.lastPunch.speedMph.toFixed(0)} MPH`
                : "—"}
            </div>
          </section>

          <section className="card">
            <h2>MOVEMENT</h2>
            <div className="big">
              {m
                ? m.moveCounts.slips +
                  m.moveCounts.ducks +
                  m.moveCounts.rolls +
                  m.moveCounts.pivots +
                  m.moveCounts.steps
                : 0}
            </div>
            <div className="sub">
              SLIP {m?.moveCounts.slips ?? 0} · DUCK {m?.moveCounts.ducks ?? 0} ·
              ROLL {m?.moveCounts.rolls ?? 0}
              <br />
              PIVOT {m?.moveCounts.pivots ?? 0} · STEP {m?.moveCounts.steps ?? 0}
              <br />
              LAST: {m?.lastMove ? m.lastMove.type : "—"}
            </div>
          </section>

          <section className="card">
            <h2>GUARD</h2>
            <div className={`big ${m && m.guardUp.left && m.guardUp.right ? "ok" : "alert"}`}>
              {m && m.guardUp.left && m.guardUp.right
                ? "UP"
                : m && (m.guardUp.left || m.guardUp.right)
                  ? "HALF"
                  : "DOWN"}
            </div>
            <div className="sub">
              L: {m?.guardUp.left ? "UP" : "DOWN"} · R:{" "}
              {m?.guardUp.right ? "UP" : "DOWN"}
            </div>
          </section>

          <section className="card">
            <h2>JOINT ANGLES</h2>
            <table>
              <thead>
                <tr>
                  <th>JOINT</th>
                  <th>LEFT</th>
                  <th>RIGHT</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>elbow</td>
                  <td>{m ? Math.round(m.elbowAngle.left) : 0}°</td>
                  <td>{m ? Math.round(m.elbowAngle.right) : 0}°</td>
                </tr>
                <tr>
                  <td>knee</td>
                  <td>{m ? Math.round(m.kneeAngle.left) : 0}°</td>
                  <td>{m ? Math.round(m.kneeAngle.right) : 0}°</td>
                </tr>
                <tr>
                  <td>torso tilt</td>
                  <td colSpan={2}>{m ? Math.round(m.torsoTiltDeg) : 0}°</td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>
      </main>

      {mode === "live" && (
        <button className="stop-btn" onClick={finishSession}>
          ■ END SESSION &amp; GET FULL CRITIQUE
        </button>
      )}
      {mode === "setup" && (
        <button className="stop-btn" onClick={() => window.location.reload()}>
          ✕ CANCEL
        </button>
      )}

      {(critiques.length > 0 || mode === "done") && (
        <section className="critiques">
          <h2>{mode === "done" ? "SESSION CRITIQUE" : "LIVE COACHING"}</h2>
          {critiques.length === 0 && (
            <p className="hint">
              Not enough movement captured to critique. Make sure your full
              body is visible and try a longer round.
            </p>
          )}
          {critiques.map((c, i) => (
            <div key={i} className={`critique ${c.severity}`}>
              <strong>
                {c.severity === "bad" ? "✕" : c.severity === "warn" ? "!" : "✓"}{" "}
                {c.title}
              </strong>
              <p>{c.detail}</p>
            </div>
          ))}
          {mode === "done" && (
            <button className="big-btn" onClick={() => window.location.reload()}>
              ↻ NEW SESSION
            </button>
          )}
        </section>
      )}
    </div>
  );
}
