import { useCallback, useEffect, useRef, useState } from "react";
import { BoxingAnalyzer } from "./analysis/boxingAnalyzer";
import { buildCritiques } from "./analysis/critique";
import { drawOverlay } from "./analysis/draw";
import { getPoseLandmarker } from "./analysis/pose";
import type { Critique, FrameMetrics } from "./analysis/types";

type Mode = "idle" | "loading" | "live" | "video" | "done";

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyzerRef = useRef<BoxingAnalyzer | null>(null);
  const rafRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<FrameMetrics | null>(null);
  const [critiques, setCritiques] = useState<Critique[]>([]);

  const stopLoop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
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
    const analyzer = new BoxingAnalyzer();
    analyzerRef.current = analyzer;
    setCritiques([]);
    let lastTs = -1;
    let lastCritiqueT = 0;

    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
      if (video.readyState >= 2 && !video.paused && !video.ended) {
        const ts = performance.now();
        if (ts > lastTs) {
          lastTs = ts;
          const result = landmarker.detectForVideo(video, ts);
          const lm = result.landmarks[0] ?? null;
          const m = analyzer.update(lm, ts / 1000);
          setMetrics(m);

          if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
            canvas.width = video.clientWidth;
            canvas.height = video.clientHeight;
          }
          const ctx = canvas.getContext("2d");
          if (ctx) drawOverlay(ctx, m, canvas.width, canvas.height);

          // refresh live coaching every 5s once there's enough data
          if (m.time - lastCritiqueT > 5 && analyzer.hasData()) {
            lastCritiqueT = m.time;
            setCritiques(buildCritiques(analyzer.stats()));
          }
        }
      }
      if (videoRef.current?.ended) {
        finishSession();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [finishSession]);

  const startLive = useCallback(async () => {
    setError(null);
    setMode("loading");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      video.src = "";
      await video.play();
      setMode("live");
      await runLoop();
    } catch (e) {
      setError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Camera access was denied. Allow camera permission and try again."
          : `Could not start camera: ${e instanceof Error ? e.message : e}`
      );
      setMode("idle");
    }
  }, [runLoop]);

  const startUpload = useCallback(
    async (file: File) => {
      setError(null);
      setMode("loading");
      try {
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        const url = URL.createObjectURL(file);
        objectUrlRef.current = url;
        const video = videoRef.current!;
        video.srcObject = null;
        video.src = url;
        await video.play();
        setMode("video");
        await runLoop();
      } catch (e) {
        setError(`Could not load video: ${e instanceof Error ? e.message : e}`);
        setMode("idle");
      }
    },
    [runLoop]
  );

  const m = metrics;
  const speed = m ? Math.max(m.speedMph.left, m.speedMph.right) : 0;
  const sessionActive = mode === "live" || mode === "video";

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
            onClick={startLive}
          >
            ● FILM LIVE
          </button>
          <label className="big-btn">
            ▲ UPLOAD VIDEO
            <input
              type="file"
              accept="video/*"
              hidden
              disabled={mode === "loading"}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) startUpload(f);
              }}
            />
          </label>
          {mode === "loading" && <p className="hint">LOADING POSE MODEL…</p>}
          {error && <p className="error">{error}</p>}
          <p className="hint">
            Film from the side or at a 45° angle with your full body in frame.
            All analysis runs on your device — no video is uploaded anywhere.
          </p>
        </div>
      ) : null}

      <main className={mode === "idle" || mode === "loading" ? "hidden" : ""}>
        <div className="stage">
          <video ref={videoRef} playsInline muted />
          <canvas ref={canvasRef} />
          {m && (
            <div className="frame-tag">
              T+{m.time.toFixed(1)}S{" "}
              {m.landmarks ? "TRACKING" : "NO BOXER DETECTED"}
            </div>
          )}
        </div>

        <div className="panels">
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

      {sessionActive && (
        <button className="stop-btn" onClick={finishSession}>
          ■ END SESSION &amp; GET FULL CRITIQUE
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
