/** Background music for a video export, decoded once and then fitted to the video length. */

const RATE = 48_000;
/** Fade out at the end, seconds. */
const FADE_S = 2;

export async function decodeMusic(file: File): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, 1, RATE);
  return ctx.decodeAudioData(await file.arrayBuffer());
}

/** Plays the track from the start, looping if it is shorter, and fades it out at the end. */
export function renderMusic(src: AudioBuffer, seconds: number): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * RATE), RATE);
  const source = ctx.createBufferSource();
  source.buffer = src;
  source.loop = true;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(1, Math.max(0, seconds - FADE_S));
  gain.gain.linearRampToValueAtTime(0, seconds);
  source.connect(gain).connect(ctx.destination);
  source.start(0);
  source.stop(seconds);
  return ctx.startRendering();
}
