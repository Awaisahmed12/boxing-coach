import { useCallback, useEffect, useRef, useState } from "react";
import { BoxingAnalyzer } from "../analysis/boxingAnalyzer";
import { buildCritiques } from "../analysis/critique";
import { contentRect, drawOverlay } from "../analysis/draw";
import { assessFraming, type FramingStatus } from "../analysis/framing";
import { getPoseLandmarker } from "../analysis/pose";
import { scoreSession } from "../analysis/score";
import { SubjectSelector } from "../analysis/subject";
import {
  isStraight,
  PUNCH_LABEL,
  type FrameMetrics,
  type Point,
  type PunchType,
  type SessionRecord,
} from "../analysis/types";
import { FREE_MAX_ROUNDS } from "../billing/plans";
import { TopBar } from "../components/Nav";
import { beep, bell, primeAudio, speak } from "../lib/audio";
import { navigate, routeQuery } from "../lib/router";
import { useStore } from "../state/store";
import { DRILLS, drillById } from "../training/drills";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";

type Phase = "setup" | "loading" | "framing" | "round" | "rest" | "paused" | "finishing";
type Source = "live" | "upload";

interface Live {
  phase: Phase;
  round: number;
  roundsTotal: number;
  remainingS: number;
  metrics: FrameMetrics | null;
  framing: FramingStatus | null;
  framingCountdown: number | null;
  outOfFrame: boolean;
  canSkipFraming: boolean;
}

const READY_FRAMES = 60; // ~2s of stable framing before the round starts
const OUT_OF_FRAME_FRAMES = 20; // ~0.7s grace — pivoting causes brief dips
const UI_INTERVAL_MS = 40; // ~25 Hz cap on React state updates (canvas stays 60)
const SKIP_FRAMING_AFTER_S = 5; // offer a manual start if the gate is being fussy
const DEBUG = new URLSearchParams(window.location.search).has("debug");

type FrameCallback = (now: number, meta: { mediaTime: number }) => void;
interface VideoFrameCallbacks {
  requestVideoFrameCallback?: (cb: FrameCallback) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
}
const vfcOf = (v: HTMLVideoElement) => v as HTMLVideoElement & VideoFrameCallbacks;

const fmt = (s: number) => {
  const v = Math.max(0, Math.ceil(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
};

const idle = (): Live => ({
  phase: "setup",
  round: 0,
  roundsTotal: 1,
  remainingS: 0,
  metrics: null,
  framing: null,
  framingCountdown: null,
  outOfFrame: false,
  canSkipFraming: false,
});

export function Train() {
  const { profile, pro, addSession, updateSettings } = useStore();
  const { settings } = profile;

  const [drillId, setDrillId] = useState(() => {
    const q = routeQuery().get("drill");
    const d = q ? drillById(q) : DRILLS[0];
    return d.pro && !pro ? DRILLS[0].id : d.id;
  });
  const drill = drillById(drillId);
  const [rounds, setRounds] = useState(() => (pro ? drill.rounds : FREE_MAX_ROUNDS));
  const [roundLen, setRoundLen] = useState(drill.roundLengthS);
  const [rest, setRest] = useState(drill.restS);
  const [source, setSource] = useState<Source>("live");
  const [error, setError] = useState<string | null>(null);
  const [dbg, setDbg] = useState("");
  const [live, setLive] = useState<Live>(idle);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const S = useRef({
    phase: "setup" as Phase,
    prevPhase: "round" as Phase,
    source: "live" as Source,
    round: 0,
    roundsTotal: 1,
    roundLen: 180,
    rest: 60,
    phaseEnds: 0,
    pausedRemaining: 0,
    warned: false,
    restBeeps: 0,
    raf: 0,
    vfc: 0,
    lastProcMs: -1,
    lastUiMs: -1,
    readyFrames: 0,
    badFrames: 0,
    framingSince: 0,
    startedAt: 0,
    fpsEma: 0,
    prevFrameS: -1,
    camInfo: "",
    analyzer: null as BoxingAnalyzer | null,
    subject: new SubjectSelector(),
    landmarker: null as PoseLandmarker | null,
    stream: null as MediaStream | null,
    objectUrl: null as string | null,
    wakeLock: null as { release(): Promise<void> } | null,
    finished: false,
  });

  const pickDrill = (id: string) => {
    const d = drillById(id);
    if (d.pro && !pro) return navigate("plans");
    setDrillId(id);
    setRounds(pro ? d.rounds : FREE_MAX_ROUNDS);
    setRoundLen(d.roundLengthS);
    setRest(d.restS);
  };

  const stopStream = useCallback(() => {
    const s = S.current;
    s.stream?.getTracks().forEach((t) => t.stop());
    s.stream = null;
  }, []);

  const teardown = useCallback(() => {
    const s = S.current;
    cancelAnimationFrame(s.raf);
    const video = videoRef.current;
    if (video && s.vfc) {
      vfcOf(video).cancelVideoFrameCallback?.(s.vfc);
      s.vfc = 0;
    }
    stopStream();
    if (s.objectUrl) URL.revokeObjectURL(s.objectUrl);
    s.objectUrl = null;
    void s.wakeLock?.release().catch(() => undefined);
    s.wakeLock = null;
    window.speechSynthesis?.cancel();
  }, [stopStream]);

  useEffect(() => teardown, [teardown]);

  // background tabs pause media playback and animation frames; without this
  // the stage comes back frozen/black after a tab switch
  useEffect(() => {
    const onVisibility = () => {
      const s = S.current;
      if (document.visibilityState === "visible" && s.phase !== "setup" && s.phase !== "finishing") {
        videoRef.current?.play().catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const finish = useCallback(() => {
    const s = S.current;
    if (s.finished) return;
    s.finished = true;
    s.phase = "finishing";
    setLive((l) => ({ ...l, phase: "finishing" }));
    teardown();
    const analyzer = s.analyzer;
    if (!analyzer || !analyzer.hasData()) {
      setError("Not enough of you was tracked to score the session. Make sure your head and shoulders are in frame with decent light.");
      s.phase = "setup";
      s.finished = false;
      setLive(idle());
      return;
    }
    const stats = analyzer.stats();
    const score = scoreSession(stats, drill);
    const critiques = buildCritiques(stats, drill, profile.stance);
    const byType: Partial<Record<PunchType, number>> = {};
    for (const p of stats.punches) byType[p.type] = (byType[p.type] ?? 0) + 1;
    const straights = stats.punches.filter((p) => isStraight(p.type));
    const rets = stats.punches.map((p) => p.retractionMs).filter((r): r is number => r !== null);
    const record: SessionRecord = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      startedAt: s.startedAt,
      source: s.source,
      drillId: drill.id,
      rounds: s.roundsTotal,
      roundLengthS: s.roundLen,
      activeS: stats.activeS,
      score,
      punchCount: stats.punches.length,
      byType,
      maxSpeedMph: stats.maxSpeedMph,
      avgSpeedMph: stats.punches.length
        ? stats.punches.reduce((a, p) => a + p.speedMph, 0) / stats.punches.length
        : 0,
      punchesPerMin: stats.punches.length / Math.max(stats.activeS / 60, 1 / 60),
      guardUpRatio: stats.guardUpRatio,
      avgExtensionDeg: straights.length
        ? straights.reduce((a, p) => a + p.peakElbowAngle, 0) / straights.length
        : null,
      avgRetractionMs: rets.length ? rets.reduce((a, r) => a + r, 0) / rets.length : null,
      headMovement: stats.headMovement,
      stanceWidthRatio: stats.stanceWidthRatio,
      moveCounts: stats.moveCounts,
      combos: stats.combos,
      critiques,
    };
    addSession(record);
    navigate(`session/${record.id}`);
  }, [addSession, drill, profile.stance, teardown]);

  const startRound = useCallback(
    (n: number, now: number) => {
      const s = S.current;
      s.round = n;
      s.phase = "round";
      s.phaseEnds = now + s.roundLen;
      s.warned = false;
      s.badFrames = 0;
      s.analyzer?.setRound(n);
      if (settings.sound) bell();
      if (settings.voice && pro) speak(n === 1 ? drill.cue : `Round ${n}. ${drill.cue}`, 0);
    },
    [drill.cue, pro, settings.sound, settings.voice]
  );

  // one camera/video frame: detect, score, draw. timeS is a monotonic wall
  // clock — NOT the video's currentTime/mediaTime, which doesn't advance on a
  // live iOS camera stream and froze detection after the first frame.
  const processFrame = useCallback(
    (timeS: number) => {
      const s = S.current;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2 || !s.landmarker || !s.analyzer || s.finished) return;
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) return;

      let m: FrameMetrics;
      let lm: Point[] | null = null;
      let poseCount = 0;
      try {
        // feed the video element directly — MediaPipe applies the element's
        // display orientation, which a hand-rolled canvas copy does not
        const result = s.landmarker.detectForVideo(video, performance.now());
        poseCount = result.landmarks.length;
        lm = s.subject.pick(result.landmarks); // lock onto the boxer, not a passerby
        m = s.analyzer.update(lm, timeS, vw / vh, s.phase === "round");
      } catch (e) {
        if (DEBUG) setDbg(`detect error: ${e instanceof Error ? e.message : e}`);
        return; // drop the frame — one bad detect must not kill the session
      }

      const status = assessFraming(lm);
      let framing: FramingStatus | null = null;
      let framingCountdown: number | null = null;
      if (s.phase === "framing") {
        s.readyFrames = status.ok ? s.readyFrames + 1 : 0;
        framing = status;
        framingCountdown = status.ok ? Math.max(1, Math.ceil((READY_FRAMES - s.readyFrames) / 30)) : null;
        if (s.readyFrames >= READY_FRAMES) {
          s.analyzer = new BoxingAnalyzer(profile.stance); // stats start clean at the bell
          startRound(1, timeS);
        }
      } else if (s.phase === "round") {
        s.badFrames = status.ok ? 0 : s.badFrames + 1;
      }

      const rect = contentRect(video);
      if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
      }
      const ctx = canvas.getContext("2d");
      if (ctx) drawOverlay(ctx, m, canvas.width, canvas.height, rect);

      if (DEBUG && s.prevFrameS >= 0 && timeS > s.prevFrameS) {
        const inst = 1 / (timeS - s.prevFrameS);
        s.fpsEma = s.fpsEma > 0 ? 0.9 * s.fpsEma + 0.1 * inst : inst;
      }
      s.prevFrameS = timeS;

      if (s.phase === "round" && settings.voice && pro && m.landmarks) {
        if (m.recentGuardRatio < 0.45 && m.secondsSinceLastPunch > 1.5) speak("Hands up.");
        else if (m.secondsSinceLastPunch > 10) speak("Stay busy. Throw the jab.");
      }

      // the canvas tracks every frame; React only needs a few updates a second
      const nowMs = timeS * 1000;
      if (s.lastUiMs < 0 || nowMs - s.lastUiMs >= UI_INTERVAL_MS) {
        s.lastUiMs = nowMs;
        const remaining =
          s.source === "upload"
            ? (video.duration || 0) - video.currentTime
            : s.phase === "paused"
              ? s.pausedRemaining
              : s.phaseEnds - timeS;
        setLive({
          phase: s.phase,
          round: s.round,
          roundsTotal: s.roundsTotal,
          remainingS: remaining,
          metrics: m,
          framing,
          framingCountdown,
          outOfFrame: s.phase === "round" && s.badFrames >= OUT_OF_FRAME_FRAMES,
          canSkipFraming: s.phase === "framing" && timeS - s.framingSince > SKIP_FRAMING_AFTER_S,
        });
        if (DEBUG) {
          const nose = lm?.[0];
          setDbg(
            `cam ${s.camInfo} ~${s.fpsEma.toFixed(0)}fps pose ${poseCount} ` +
              (nose ? `nose ${nose.x.toFixed(2)},${nose.y.toFixed(2)}` : "no-lm")
          );
        }
      }
    },
    [pro, profile.stance, settings.voice, startRound]
  );

  // round/rest clock — runs every animation frame regardless of camera frames
  const tick = useCallback(() => {
    const s = S.current;
    const video = videoRef.current;
    if (!video || s.finished) return;
    const now = performance.now() / 1000;

    if (s.source === "upload" && video.ended) return finish();

    if (s.phase === "round" && s.source === "live") {
      const remaining = s.phaseEnds - now;
      if (remaining <= 10 && !s.warned) {
        s.warned = true;
        if (settings.sound) beep(1);
      }
      if (remaining <= 0) {
        if (s.round >= s.roundsTotal) return finish();
        if (settings.sound) bell();
        if (s.rest > 0) {
          s.phase = "rest";
          s.phaseEnds = now + s.rest;
          s.restBeeps = 0;
          if (settings.voice && pro) speak("Rest. Breathe.", 0);
        } else startRound(s.round + 1, now);
      }
    } else if (s.phase === "rest") {
      const remaining = s.phaseEnds - now;
      if (remaining <= 3 - s.restBeeps && s.restBeeps < 3) {
        s.restBeeps++;
        if (settings.sound) beep(1);
      }
      if (remaining <= 0) startRound(s.round + 1, now);
    }

    // rAF fallback where requestVideoFrameCallback is unavailable, throttled
    // to ~33ms so we don't re-detect the same frame repeatedly
    const useVfc = typeof vfcOf(video).requestVideoFrameCallback === "function";
    if (!useVfc && !video.paused) {
      const ms = performance.now();
      if (ms - s.lastProcMs >= 33) {
        s.lastProcMs = ms;
        processFrame(ms / 1000);
      }
    }
    s.raf = requestAnimationFrame(tick);
  }, [finish, pro, processFrame, settings.sound, settings.voice, startRound]);

  // requestVideoFrameCallback fires once per presented frame, so each callback
  // is genuinely fresh — drive the analyzer off the monotonic `now` it gives
  const pumpVfc = useCallback(() => {
    const s = S.current;
    const video = videoRef.current;
    if (!video || video.ended || s.finished) return;
    // re-register before processing so a throw can't kill the chain
    s.vfc = vfcOf(video).requestVideoFrameCallback!((now) => {
      pumpVfc();
      processFrame(now / 1000);
    });
  }, [processFrame]);

  const openCamera = useCallback(
    async (facing: "user" | "environment") => {
      const s = S.current;
      const video = videoRef.current!;
      stopStream();
      s.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 1280 },
          height: { ideal: 720 },
          // higher capture rate = less under-sampling of fast punches, the
          // single biggest factor in speed accuracy
          frameRate: { ideal: 60 },
        },
        audio: false,
      });
      const st = s.stream.getVideoTracks()[0]?.getSettings();
      s.camInfo = st ? `${st.width}x${st.height}@${Math.round(st.frameRate ?? 0)}` : "";
      // unplugged/revoked camera never sets video.ended — end the session
      // instead of spinning on a frozen frame
      s.stream.getVideoTracks()[0]?.addEventListener(
        "ended",
        () => {
          if (s.phase === "round" || s.phase === "rest") finish();
        },
        { once: true }
      );
      video.srcObject = s.stream;
      await video.play();
      s.subject.reset();
    },
    [finish, stopStream]
  );

  const begin = useCallback(
    async (src: Source, file?: File) => {
      const s = S.current;
      setError(null);
      primeAudio();
      s.source = src;
      s.roundsTotal = src === "upload" ? 1 : rounds;
      s.roundLen = roundLen;
      s.rest = rest;
      s.finished = false;
      s.readyFrames = 0;
      s.badFrames = 0;
      s.lastUiMs = -1;
      s.analyzer = new BoxingAnalyzer(profile.stance);
      s.subject = new SubjectSelector();
      s.startedAt = Date.now();
      s.phase = "loading";
      setLive({ ...idle(), phase: "loading", roundsTotal: s.roundsTotal });
      const video = videoRef.current!;
      try {
        if (src === "live") {
          await openCamera(settings.camera);
        } else {
          s.objectUrl = URL.createObjectURL(file!);
          video.srcObject = null;
          video.src = s.objectUrl;
          await video.play();
        }
        s.landmarker = await getPoseLandmarker();
        try {
          s.wakeLock =
            (await (navigator as Navigator & { wakeLock?: { request(t: string): Promise<{ release(): Promise<void> }> } }).wakeLock?.request("screen")) ?? null;
        } catch {
          /* wake lock is best-effort */
        }
        const now = performance.now() / 1000;
        if (src === "live") {
          // wait for stable framing, then the bell rings on its own
          s.phase = "framing";
          s.framingSince = now;
          if (settings.voice && pro) speak("Step into frame.", 0);
        } else {
          s.round = 1;
          s.phase = "round";
          s.phaseEnds = now + (video.duration || 0);
          s.analyzer.setRound(1);
        }
        if (typeof vfcOf(video).requestVideoFrameCallback === "function") pumpVfc();
        s.raf = requestAnimationFrame(tick);
      } catch (e) {
        teardown();
        s.phase = "setup";
        setLive(idle());
        const name = e instanceof Error ? e.name : "";
        setError(
          name === "NotAllowedError"
            ? "Camera permission was denied. Allow camera access in your browser settings and try again."
            : name === "NotFoundError"
              ? "No camera found on this device. Try analyzing a video instead."
              : e instanceof Error
                ? `Couldn't start: ${e.message}`
                : "Couldn't load the pose model. Check your connection and try again."
        );
      }
    },
    [openCamera, pro, profile.stance, pumpVfc, rest, roundLen, rounds, settings.camera, settings.voice, teardown, tick]
  );

  const flipCamera = async () => {
    const next = settings.camera === "user" ? "environment" : "user";
    updateSettings({ camera: next });
    try {
      await openCamera(next);
      S.current.readyFrames = 0;
    } catch (e) {
      setError(`Couldn't switch camera: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const skipFraming = () => {
    const s = S.current;
    if (s.phase !== "framing") return;
    s.analyzer = new BoxingAnalyzer(profile.stance);
    startRound(1, performance.now() / 1000);
  };

  const togglePause = () => {
    const s = S.current;
    const now = performance.now() / 1000;
    const video = videoRef.current;
    if (s.phase === "paused") {
      s.phase = s.prevPhase;
      s.phaseEnds = now + s.pausedRemaining;
      void video?.play();
    } else if (s.phase === "round" || s.phase === "rest") {
      s.prevPhase = s.phase;
      s.pausedRemaining = s.phaseEnds - now;
      s.phase = "paused";
      if (s.source === "upload") video?.pause();
    }
  };

  const cancel = () => {
    teardown();
    S.current.phase = "setup";
    S.current.finished = false;
    setLive(idle());
  };

  const m = live.metrics;
  const inSession = live.phase !== "setup";
  const mirror = source === "live" && settings.camera === "user" && settings.mirror;
  // hold the last punch's speed rather than the live wrist speed, which
  // decays to 0 between punches and makes the number jump constantly
  const lastMph = m?.lastPunch ? m.lastPunch.speedMph : 0;
  const guard = m ? (m.guardUp.left && m.guardUp.right ? "UP" : m.guardUp.left || m.guardUp.right ? "HALF" : "DOWN") : "—";
  const moves = m ? m.moveCounts.slips + m.moveCounts.ducks + m.moveCounts.rolls : 0;
  const lastDefense = m?.lastMove && !(m.lastMove.type in PUNCH_LABEL) ? m.lastMove.type.toLowerCase() : null;

  return (
    <div className={`screen ${inSession ? "screen-live" : "with-nav"}`}>
      {!inSession && <TopBar title="Train" back="home" />}

      {!inSession && (
        <div className="setup">
          <h2>Drill</h2>
          <div className="chips">
            {DRILLS.map((d) => (
              <button
                key={d.id}
                className={`chip ${d.id === drillId ? "on" : ""} ${d.pro && !pro ? "chip-locked" : ""}`}
                onClick={() => pickDrill(d.id)}
              >
                {d.name}
                {d.pro && !pro && " 🔒"}
              </button>
            ))}
          </div>
          <p className="muted">{drill.description}</p>

          <div className="setup-grid">
            <div className="field">
              <span>Rounds {!pro && <button className="link" onClick={() => navigate("plans")}>Pro: unlimited</button>}</span>
              <div className="stepper">
                <button onClick={() => setRounds((r) => Math.max(1, r - 1))}>−</button>
                <span className="num">{rounds}</span>
                <button onClick={() => (pro ? setRounds((r) => Math.min(12, r + 1)) : navigate("plans"))}>+</button>
              </div>
            </div>
            <div className="field">
              <span>Round length</span>
              <div className="seg">
                {[60, 120, 180].map((v) => (
                  <button key={v} className={roundLen === v ? "on" : ""} onClick={() => setRoundLen(v)}>
                    {v / 60}m
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span>Rest</span>
              <div className="seg">
                {[30, 45, 60].map((v) => (
                  <button key={v} className={rest === v ? "on" : ""} onClick={() => setRest(v)}>
                    {v}s
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && <p className="error">{error}</p>}

          <div className="start-buttons">
            <button className="btn btn-primary btn-lg" onClick={() => { setSource("live"); void begin("live"); }}>
              ● Start with camera
            </button>
            <label className="btn btn-ghost btn-lg">
              ▲ Analyze a video
              <input
                type="file"
                accept="video/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setSource("upload");
                    void begin("upload", f);
                  }
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <p className="muted small">
            Set the phone anywhere your head and shoulders are in view — any angle works; side-on or 45° reads punches
            and slips best. The bell rings on its own a couple of seconds after you're in frame, and tracking stays locked
            on you if someone walks past. Using the {settings.camera === "user" ? "front" : "back"} camera — you can flip
            it once the camera is on.
          </p>
        </div>
      )}

      <div className={`stage ${inSession ? "" : "hidden"} ${live.outOfFrame ? "alert" : ""}`}>
        <video ref={videoRef} playsInline muted className={mirror ? "mirror" : ""} />
        <canvas ref={canvasRef} className={mirror ? "mirror" : ""} />

        <div className="hud-top">
          <div className="hud-round">
            {live.phase === "loading" && "LOADING COACH… (FIRST TIME ~20MB)"}
            {live.phase === "framing" && "GET IN FRAME"}
            {live.phase === "round" && (source === "upload" ? "ANALYZING" : `ROUND ${live.round} / ${live.roundsTotal}`)}
            {live.phase === "rest" && `REST · NEXT: ROUND ${live.round + 1}`}
            {live.phase === "paused" && "PAUSED"}
            {live.phase === "finishing" && "SCORING…"}
          </div>
          {(live.phase === "round" || live.phase === "rest" || live.phase === "paused") && (
            <div className={`hud-timer num ${live.phase === "rest" ? "rest" : ""}`}>{fmt(live.remainingS)}</div>
          )}
        </div>

        {live.phase === "framing" && (
          <>
            <div className={`stage-banner ${live.framing?.ok ? "ok" : ""}`}>
              {live.framing?.ok
                ? `✓ IN FRAME — STARTING IN ${live.framingCountdown ?? 2}`
                : (live.framing?.message ?? "STEP INTO VIEW")}
              {live.framing?.ok && live.framing.advice && <span className="banner-tip">{live.framing.advice}</span>}
            </div>
            <div className="stage-actions">
              <button className="btn btn-ghost" onClick={flipCamera}>⇄ Flip</button>
              {live.canSkipFraming && <button className="btn btn-ghost" onClick={skipFraming}>Start anyway</button>}
            </div>
          </>
        )}
        {live.outOfFrame && <div className="hud-notice">Out of frame — step back into view</div>}
        {live.phase === "round" && m?.lastCombo && m.secondsSinceLastPunch > 0.75 && m.secondsSinceLastPunch < 1.6 && (
          <div className="hud-combo num">{m.lastCombo}</div>
        )}
        {DEBUG && dbg && <div className="dbg-tag">{dbg}</div>}
      </div>

      {inSession && (
        <>
          <div className="hud-cards">
            <div className="hud-card">
              <div className="hud-k">SPEED</div>
              <div className="hud-v num">{lastMph.toFixed(0)}<small>mph</small></div>
              <div className="hud-s">max {m ? m.maxSpeedMph.toFixed(0) : 0}</div>
            </div>
            <div className="hud-card">
              <div className="hud-k">PUNCHES</div>
              <div className="hud-v num">{m?.punchCount ?? 0}</div>
              <div className="hud-s">{m?.lastPunch ? PUNCH_LABEL[m.lastPunch.type] : "—"}</div>
            </div>
            <div className="hud-card">
              <div className="hud-k">GUARD</div>
              <div className={`hud-v num ${guard === "UP" ? "good" : guard === "DOWN" ? "bad" : "warn"}`}>{guard}</div>
              <div className="hud-s">L {m?.guardUp.left ? "↑" : "↓"} · R {m?.guardUp.right ? "↑" : "↓"}</div>
            </div>
            <div className="hud-card">
              <div className="hud-k">DEFENSE</div>
              <div className="hud-v num">{moves}</div>
              <div className="hud-s">{lastDefense ?? "slip · duck · roll"}</div>
            </div>
          </div>
          <div className="live-controls">
            {live.phase === "framing" || live.phase === "loading" ? (
              <button className="btn btn-ghost" onClick={cancel}>✕ Cancel</button>
            ) : (
              <>
                {live.phase !== "finishing" && (
                  <button className="btn btn-ghost" onClick={togglePause}>
                    {live.phase === "paused" ? "▶ Resume" : "❚❚ Pause"}
                  </button>
                )}
                <button className="btn btn-primary" onClick={finish} disabled={live.phase === "finishing"}>
                  ■ End &amp; score
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
