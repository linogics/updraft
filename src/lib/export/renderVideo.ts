import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  canEncodeAudio,
  canEncodeVideo,
  Mp4OutputFormat,
  Output,
  Quality
} from 'mediabunny';
import type { CaptureSession } from '#lib/cesium/capture';
import { frameTime, type StudioRange, type Timing } from './videoTiming';

/** Whether the browser can encode H.264 at this size, bitrate and frame rate. */
export function videoEncodable(width: number, height: number, bitrate: number, fps: number): Promise<boolean> {
  return canEncodeVideo('avc', { width, height, quality: new Quality({ bitrate }), frameRate: fps });
}

export function audioEncodable(): Promise<boolean> {
  return canEncodeAudio('aac');
}

export interface VideoJob {
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  range: StudioRange;
  timing: Timing;
  /** Already fitted to timing.seconds. */
  music?: AudioBuffer;
  session: CaptureSession;
  /** Moves the playback clock to t and waits until Svelte has applied it. */
  seek: (t: number) => Promise<void>;
  /** Paints the overlay for playback time t onto the frame. */
  paint: (ctx: CanvasRenderingContext2D, t: number) => void;
  onProgress: (done: number) => void;
  signal: AbortSignal;
}

/** Encodes one frame per step into an MP4. Rejects with AbortError when the signal fires. */
export async function renderVideo(job: VideoJob): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = job.width;
  canvas.height = job.height;
  const ctx = canvas.getContext('2d')!;
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });
  const video = new CanvasSource(canvas, { codec: 'avc', quality: new Quality({ bitrate: job.bitrate }) });
  output.addVideoTrack(video, { frameRate: job.fps });
  const audio = job.music ? new AudioBufferSource({ codec: 'aac', quality: new Quality({ bitrate: 128_000 }) }) : null;
  if (audio) output.addAudioTrack(audio);

  try {
    await output.start();
    if (audio && job.music) {
      await audio.add(job.music);
      audio.close();
    }

    for (let k = 0; k < job.timing.frames; k++) {
      if (job.signal.aborted) throw new DOMException('Export cancelled.', 'AbortError');
      const t = frameTime(job.range, job.timing, job.fps, k);
      await job.seek(t);
      await job.session.frame(canvas);
      job.paint(ctx, t);
      await video.add(k / job.fps, 1 / job.fps);
      job.onProgress(k + 1);
    }

    video.close();
    await output.finalize();
    return new Blob([target.buffer!], { type: 'video/mp4' });
  } catch (err) {
    await output.cancel().catch(() => {});
    throw err;
  }
}
