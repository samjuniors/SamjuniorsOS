/**
 * sophia/vision/ScreenVisionBridge.ts
 *
 * Real-time Screen Vision for Sofia.
 * Captures the user's active screen or application window using getDisplayMedia,
 * downscales frames onto an offscreen canvas for low-latency streaming,
 * and feeds JPEG chunks into the Gemini Live multimodal API.
 */

import { controlLayer } from '../control';

export type VisionFrameCallback = (base64Jpeg: string, mimeType: string) => void;

class ScreenVisionBridge extends EventTarget {
  private mediaStream: MediaStream | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private captureIntervalId: number | null = null;
  private isCapturing = false;
  private onFrameCallback: VisionFrameCallback | null = null;

  public get active(): boolean {
    return this.isCapturing;
  }

  public registerFrameCallback(cb: VisionFrameCallback | null) {
    this.onFrameCallback = cb;
  }

  /**
   * Request display media from the browser (screen, window, or tab)
   * and start continuous frame sampling.
   */
  public async startCapture(): Promise<boolean> {
    if (this.isCapturing) return true;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      controlLayer.dispatchEvent(
        new CustomEvent('command:notification', {
          detail: {
            message: 'Screen capture is not supported in this browser.',
            level: 'error',
          },
        })
      );
      return false;
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor',
          frameRate: { ideal: 1, max: 2 },
        } as MediaTrackConstraints,
        audio: false,
      });

      // Handle user clicking "Stop Sharing" in browser chrome
      const track = this.mediaStream.getVideoTracks()[0];
      if (track) {
        track.onended = () => {
          this.stopCapture();
        };
      }

      this.videoEl = document.createElement('video');
      this.videoEl.autoplay = true;
      this.videoEl.muted = true;
      this.videoEl.playsInline = true;
      this.videoEl.srcObject = this.mediaStream;
      await this.videoEl.play();

      this.canvasEl = document.createElement('canvas');
      this.isCapturing = true;

      // Sample 1 frame every 1.5s for optimal latency & Gemini token budget
      this.captureIntervalId = window.setInterval(() => {
        this.sampleFrame();
      }, 1500);

      this.dispatchEvent(new CustomEvent('vision:state', { detail: { active: true } }));
      controlLayer.dispatchEvent(
        new CustomEvent('command:notification', {
          detail: {
            message: 'Screen Vision Active: Sofia can now see your screen.',
            level: 'success',
            duration: 3500,
          },
        })
      );

      // Immediately sample first frame
      setTimeout(() => this.sampleFrame(), 300);
      return true;
    } catch (err: unknown) {
      console.warn('[ScreenVision] User cancelled or error:', err);
      this.stopCapture();
      return false;
    }
  }

  public stopCapture() {
    if (this.captureIntervalId) {
      clearInterval(this.captureIntervalId);
      this.captureIntervalId = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.videoEl) {
      this.videoEl.pause();
      this.videoEl.srcObject = null;
      this.videoEl = null;
    }

    this.canvasEl = null;
    const wasCapturing = this.isCapturing;
    this.isCapturing = false;

    if (wasCapturing) {
      this.dispatchEvent(new CustomEvent('vision:state', { detail: { active: false } }));
      controlLayer.dispatchEvent(
        new CustomEvent('command:notification', {
          detail: {
            message: 'Screen Vision disabled.',
            level: 'info',
            duration: 2500,
          },
        })
      );
    }
  }

  public toggleCapture(): Promise<boolean> {
    if (this.isCapturing) {
      this.stopCapture();
      return Promise.resolve(false);
    }
    return this.startCapture();
  }

  private sampleFrame() {
    if (!this.isCapturing || !this.videoEl || !this.canvasEl) return;
    if (this.videoEl.videoWidth === 0 || this.videoEl.videoHeight === 0) return;

    // Scale down resolution to max 1024x768 to minimize bandwidth & latency
    const maxDimension = 1024;
    let width = this.videoEl.videoWidth;
    let height = this.videoEl.videoHeight;

    if (width > maxDimension || height > maxDimension) {
      if (width > height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
    }

    this.canvasEl.width = width;
    this.canvasEl.height = height;

    const ctx = this.canvasEl.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(this.videoEl, 0, 0, width, height);

    // Encode as high-compression JPEG
    const dataUrl = this.canvasEl.toDataURL('image/jpeg', 0.65);
    const base64Data = dataUrl.replace(/^data:image\/jpeg;base64,/, '');

    if (this.onFrameCallback) {
      this.onFrameCallback(base64Data, 'image/jpeg');
    }

    this.dispatchEvent(
      new CustomEvent('vision:frame', {
        detail: { width, height, timestamp: Date.now() },
      })
    );
  }
}

export const screenVisionBridge = new ScreenVisionBridge();
