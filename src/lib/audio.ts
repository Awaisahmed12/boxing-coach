let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, durationS: number, when = 0, gain = 0.25) {
  const c = audio();
  if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, c.currentTime + when);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + when + durationS);
  osc.connect(g).connect(c.destination);
  osc.start(c.currentTime + when);
  osc.stop(c.currentTime + when + durationS);
}

/** Ring-style bell: round start / end */
export function bell() {
  tone(880, 1.2, 0, 0.3);
  tone(1320, 1.0, 0.02, 0.15);
}

/** Short beep: 10s warning, rest countdown */
export function beep(n = 1) {
  for (let i = 0; i < n; i++) tone(1000, 0.12, i * 0.2);
}

/** Unlock audio on iOS — must be called from a user gesture */
export function primeAudio() {
  audio();
}

let lastSpeakAt = 0;
let lastPhrase = "";

export function speak(text: string, minGapS = 6) {
  if (!("speechSynthesis" in window)) return;
  const now = performance.now() / 1000;
  if (now - lastSpeakAt < minGapS || (text === lastPhrase && now - lastSpeakAt < 20)) return;
  lastSpeakAt = now;
  lastPhrase = text;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.1;
  u.pitch = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}
