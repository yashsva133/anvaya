// ---------------------------------------------------------------------------
// Microphone level meter.
//
// The listening indicator used to be a CSS animation that ran whether or not
// anyone was speaking — which means it lied: a user with a muted or absent
// microphone saw the same bouncing bars as one who was being heard. This drives
// the bars from the actual input signal instead, so "I don't think my mic is
// working" becomes answerable by looking at the screen.
//
// It uses the SAME getUserMedia stream the recognition path already needs for a
// permission check, so it opens no second capture.
// ---------------------------------------------------------------------------

export interface MicMeter {
  /** 0..1 smoothed input level, polled by the UI on an animation frame. */
  level(): number;
  /** True when the signal has been above the speech floor recently. */
  speaking(): boolean;
  stop(): void;
}

const SMOOTHING = 0.75;
const SPEECH_FLOOR = 0.045;

/**
 * Start metering.
 *
 * Resolves with null when capture is unavailable — the caller then falls back
 * to the animated indicator rather than failing the whole voice turn.
 */
export async function startMicMeter(): Promise<MicMeter | null> {
  if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return null;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const AudioCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) {
      stream.getTracks().forEach((t) => t.stop());
      return null;
    }
    const ctx = new AudioCtor();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = SMOOTHING;
    source.connect(analyser);

    const samples = new Uint8Array(analyser.frequencyBinCount);
    let smoothed = 0;
    let lastSpeechAt = 0;

    return {
      level() {
        analyser.getByteTimeDomainData(samples);
        // RMS of the deviation from the mid-point: quiet rooms sit near zero,
        // speech near 0.2–0.4, shouting higher.
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
          const d = (samples[i] - 128) / 128;
          sum += d * d;
        }
        const rms = Math.sqrt(sum / samples.length);
        // Fast attack, slow release, so the bars respond to speech and decay
        // smoothly instead of flickering between frames.
        smoothed = rms > smoothed ? smoothed + (rms - smoothed) * 0.55 : smoothed * 0.82 + rms * 0.18;
        if (smoothed > SPEECH_FLOOR) lastSpeechAt = Date.now();
        return Math.min(1, smoothed / 0.35);
      },
      speaking() {
        return Date.now() - lastSpeechAt < 900;
      },
      stop() {
        try {
          source.disconnect();
          analyser.disconnect();
        } catch {
          /* already torn down */
        }
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close().catch(() => undefined);
      },
    };
  } catch {
    return null;
  }
}
