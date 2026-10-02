/**
 * Camera Visual Sensory Capture Adapter.
 *
 * Provides sample-gated webcam frame capture for Sophia Realtime Lab.
 * Features:
 * - Ref-counted camera stream handle (holdCamera / releaseCamera).
 * - grabSnapshot() returns base64-encoded still frame for multimodal reasoning.
 * - Zero continuous frame waste: vision inference is sample-gated, not 60fps streaming.
 */

export interface CameraSnapshot {
  mimeType: string;
  base64Data: string;
  width: number;
  height: number;
  timestamp: number;
}

let activeStream: MediaStream | null = null;
let activeVideo: HTMLVideoElement | null = null;
let holders = 0;

export async function holdCamera(previewVideoEl?: HTMLVideoElement): Promise<{
  stream: MediaStream;
  video: HTMLVideoElement;
}> {
  holders++;

  if (activeStream && activeVideo) {
    if (previewVideoEl && previewVideoEl.srcObject !== activeStream) {
      previewVideoEl.srcObject = activeStream;
      previewVideoEl.play().catch(() => {});
    }
    return { stream: activeStream, video: activeVideo };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false,
    });

    const video = previewVideoEl || document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    await video.play();

    activeStream = stream;
    activeVideo = video;
    return { stream, video };
  } catch (err: any) {
    holders = Math.max(0, holders - 1);
    throw new Error(`Camera acquisition failed: ${err.message || err}`);
  }
}

export function releaseCamera(): void {
  holders = Math.max(0, holders - 1);
  if (holders > 0) return;

  if (activeStream) {
    for (const track of activeStream.getTracks()) {
      track.stop();
    }
    activeStream = null;
  }
  if (activeVideo) {
    activeVideo.pause();
    activeVideo.srcObject = null;
    activeVideo = null;
  }
}

export function isCameraActive(): boolean {
  return activeStream !== null && activeStream.active;
}

/**
 * Capture a single still image frame from the active camera.
 */
export function grabCameraSnapshot(videoEl?: HTMLVideoElement): CameraSnapshot | null {
  const vid = videoEl || activeVideo;
  if (!vid || vid.readyState < 2) return null;

  const canvas = document.createElement('canvas');
  const width = vid.videoWidth || 640;
  const height = vid.videoHeight || 480;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(vid, 0, 0, width, height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  const base64Data = dataUrl.replace(/^data:image\/jpeg;base64,/, '');

  return {
    mimeType: 'image/jpeg',
    base64Data,
    width,
    height,
    timestamp: Date.now(),
  };
}
