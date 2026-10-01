import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, inject, Injectable, signal } from '@angular/core';

import { PhotoUploadService } from '../../core/api/photo-upload.service';
import { CameraService } from '../../core/camera/camera.service';
import { ScreenWakeLockService } from '../../core/camera/screen-wake-lock.service';
import { PRODUCER_CONFIG } from '../../core/config/producer-config';

@Injectable()
export class CaptureSessionService {
  private readonly camera = inject(CameraService);
  private readonly uploader = inject(PhotoUploadService);
  private readonly document = inject(DOCUMENT);
  private readonly config = inject(PRODUCER_CONFIG);
  readonly wakeLock = inject(ScreenWakeLockService);
  readonly active = signal(false);
  readonly busy = signal(false);
  readonly status = signal('Tap the camera to start.');
  readonly sentCount = signal(0);
  private generation = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private sessionId = '';
  private retryNotBefore = 0;
  private destroyed = false;

  constructor() {
    const onVisibilityChange = () => {
      if (this.document.hidden && this.active()) {
        this.stop('Paused. Return to this page and tap the camera to resume.');
      }
    };
    this.document.addEventListener('visibilitychange', onVisibilityChange);
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.stop();
      this.document.removeEventListener('visibilitychange', onVisibilityChange);
    });
  }

  async start(video: HTMLVideoElement): Promise<void> {
    if (this.destroyed || this.active() || this.busy()) return;
    if (this.document.hidden) {
      this.status.set('Keep this page open to start.');
      return;
    }
    if (!Number.isFinite(this.config.captureIntervalMs) || this.config.captureIntervalMs <= 0) {
      this.status.set('The capture interval must be greater than zero.');
      return;
    }
    if (Date.now() < this.retryNotBefore) {
      this.status.set('AI is busy. Wait for the cooldown before starting again.');
      return;
    }
    if (typeof crypto.randomUUID !== 'function') {
      this.status.set('Camera capture requires HTTPS and a supported browser.');
      return;
    }
    const generation = ++this.generation;
    this.sessionId = crypto.randomUUID();
    this.sentCount.set(0);
    this.active.set(true);
    this.status.set('Opening camera…');
    try {
      await this.camera.open(video);
      if (!this.isCurrent(generation)) return;
      void this.wakeLock.acquire();
      this.timer = setInterval(() => {
        void this.captureAndSend(generation);
      }, this.config.captureIntervalMs);
      await this.captureAndSend(generation);
    } catch (error) {
      if (this.isCurrent(generation)) this.stop(this.cameraErrorMessage(error));
    }
  }

  stop(message = 'Stopped. Tap the camera to start again.'): void {
    this.generation++;
    this.active.set(false);
    clearInterval(this.timer);
    this.timer = undefined;
    this.camera.close();
    this.wakeLock.release();
    this.status.set(this.busy() ? `${message} The current upload is still finishing.` : message);
    // Keep busy until the in-flight request settles; Stop cannot undo server-side work.
  }

  private isCurrent(generation: number): boolean {
    return this.active() && generation === this.generation && !this.destroyed;
  }

  private async captureAndSend(generation: number): Promise<void> {
    if (!this.isCurrent(generation) || this.busy() || Date.now() < this.retryNotBefore) return;
    this.busy.set(true);
    this.status.set('Sending photo for analysis…');
    let uploading = false;
    try {
      const photo = await this.camera.capture();
      if (!this.isCurrent(generation)) return;
      uploading = true;
      await this.uploader.upload(photo, this.sessionId, crypto.randomUUID());
      if (this.isCurrent(generation)) {
        this.sentCount.update((count) => count + 1);
        this.status.set('Photo analyzed. Waiting for the next capture.');
      }
    } catch (error) {
      // A 429 also applies when Stop was pressed while this request was in flight.
      if (error instanceof HttpErrorResponse && error.status === 429) {
        this.retryNotBefore = Date.now() + this.retryDelay(error);
      }
      if (!this.isCurrent(generation)) return;
      if (!uploading) {
        this.stop(this.cameraErrorMessage(error));
      } else if (error instanceof HttpErrorResponse && error.status === 429) {
        this.status.set('AI is busy. Capture will resume after the cooldown.');
      } else if (error instanceof HttpErrorResponse && error.status === 502) {
        this.status.set('AI analysis is unavailable. The next capture will try a new photo.');
      } else {
        // A failed connection may have reached the backend. Do not replay this POST.
        this.stop('Upload failed. Check the connection and tap the camera to start again.');
      }
    } finally {
      this.busy.set(false);
      if (!this.active() && !this.destroyed) {
        this.status.update((message) =>
          message.replace(' The current upload is still finishing.', ''),
        );
      }
    }
  }

  private retryDelay(error: HttpErrorResponse): number {
    const header = error.headers.get('Retry-After');
    if (!header) return 60_000;
    const seconds = Number(header);
    const delay = Number.isFinite(seconds) ? seconds * 1_000 : Date.parse(header) - Date.now();
    return Math.max(60_000, Number.isFinite(delay) ? delay : 60_000);
  }

  private cameraErrorMessage(error: unknown): string {
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      return 'Camera permission denied. Allow camera access and tap the camera again.';
    }
    if (error instanceof DOMException && error.name === 'NotFoundError')
      return 'No camera was found.';
    if (error instanceof DOMException && error.name === 'NotReadableError') {
      return 'The camera is unavailable or is being used by another app.';
    }
    return error instanceof Error ? error.message : 'Camera could not start. Try again.';
  }
}
