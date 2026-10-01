import { DOCUMENT } from '@angular/common';
import { inject, Injectable, InjectionToken } from '@angular/core';

export const CAMERA_MEDIA_DEVICES = new InjectionToken<MediaDevices | undefined>(
  'CAMERA_MEDIA_DEVICES',
  { factory: () => navigator.mediaDevices },
);

@Injectable()
export class CameraService {
  private readonly devices = inject(CAMERA_MEDIA_DEVICES);
  private readonly document = inject(DOCUMENT);
  private stream: MediaStream | undefined;
  private video: HTMLVideoElement | undefined;
  private generation = 0;
  private frameWait: AbortController | undefined;

  async open(video: HTMLVideoElement): Promise<void> {
    this.close();
    const generation = this.generation;
    if (!this.devices) {
      throw new Error('Camera access requires HTTPS and a supported browser.');
    }

    const stream = await this.devices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    });

    // getUserMedia cannot cancel its permission prompt. Release a late stream after Stop.
    if (generation !== this.generation) {
      stream.getTracks().forEach((track) => track.stop());
      throw new DOMException('Camera start was cancelled.', 'AbortError');
    }

    this.stream = stream;
    this.video = video;
    this.frameWait = new AbortController();
    const signal = this.frameWait.signal;
    video.srcObject = stream;
    try {
      await video.play();
      await this.waitForFrame(video, signal);
    } catch (error) {
      if (generation === this.generation) this.close();
      throw error;
    }
  }

  async capture(): Promise<Blob> {
    const video = this.video;
    if (
      !video ||
      !this.stream?.getVideoTracks().some((track) => track.readyState === 'live') ||
      video.readyState < 2 ||
      !video.videoWidth ||
      !video.videoHeight
    ) {
      throw new Error('Camera frame is not ready. Start the camera again.');
    }

    const canvas = this.document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The browser could not capture the camera frame.');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob && blob.type === 'image/jpeg') resolve(blob);
          else reject(new Error('The browser could not create a JPEG photo.'));
        },
        'image/jpeg',
        0.9,
      );
    });
  }

  close(): void {
    this.generation++;
    this.frameWait?.abort();
    this.frameWait = undefined;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    if (this.video) this.video.srcObject = null;
    this.video = undefined;
  }

  private waitForFrame(video: HTMLVideoElement, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.reject(new DOMException('Cancelled.', 'AbortError'));
    if (video.readyState >= 2 && video.videoWidth && video.videoHeight) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        video.removeEventListener('loadeddata', ready);
        video.removeEventListener('error', failed);
        signal.removeEventListener('abort', cancelled);
      };
      const ready = () => {
        cleanup();
        resolve();
      };
      const failed = () => {
        cleanup();
        reject(new Error('Camera preview could not start.'));
      };
      const cancelled = () => {
        cleanup();
        reject(new DOMException('Cancelled.', 'AbortError'));
      };
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Camera preview timed out. Start the camera again.'));
      }, 10_000);
      video.addEventListener('loadeddata', ready, { once: true });
      video.addEventListener('error', failed, { once: true });
      signal.addEventListener('abort', cancelled, { once: true });
    });
  }
}
