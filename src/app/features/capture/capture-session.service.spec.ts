import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PhotoUploadService } from '../../core/api/photo-upload.service';
import { CameraService } from '../../core/camera/camera.service';
import { ScreenWakeLockService } from '../../core/camera/screen-wake-lock.service';
import { PRODUCER_CONFIG } from '../../core/config/producer-config';
import { CaptureSessionService } from './capture-session.service';

describe('CaptureSessionService', () => {
  const photo = new Blob(['photo'], { type: 'image/jpeg' });
  const video = {} as HTMLVideoElement;
  let camera: {
    open: ReturnType<typeof vi.fn>;
    capture: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
  let uploader: { upload: ReturnType<typeof vi.fn> };
  let wakeLock: {
    acquire: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
    state: ReturnType<typeof signal>;
  };
  let service: CaptureSessionService;
  let hidden = false;

  beforeEach(() => {
    vi.useFakeTimers();
    hidden = false;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    camera = {
      open: vi.fn().mockResolvedValue(undefined),
      capture: vi.fn().mockResolvedValue(photo),
      close: vi.fn(),
    };
    uploader = { upload: vi.fn().mockResolvedValue(undefined) };
    wakeLock = {
      acquire: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
      state: signal('active'),
    };
    TestBed.configureTestingModule({
      providers: [
        CaptureSessionService,
        { provide: CameraService, useValue: camera },
        { provide: PhotoUploadService, useValue: uploader },
        { provide: ScreenWakeLockService, useValue: wakeLock },
        { provide: PRODUCER_CONFIG, useValue: { captureIntervalMs: 30_000 } },
      ],
    });
    service = TestBed.inject(CaptureSessionService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('sends immediately and every 30 seconds using a stable session and unique request IDs', async () => {
    await service.start(video);
    expect(uploader.upload).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(29_999);
    expect(uploader.upload).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(uploader.upload).toHaveBeenCalledTimes(2);
    const [first, second] = uploader.upload.mock.calls;
    expect(first[0]).toBe(photo);
    expect(second[1]).toBe(first[1]);
    expect(second[2]).not.toBe(first[2]);
    expect(service.sentCount()).toBe(2);
  });

  it('does not open a second camera or create another timer on duplicate Start', async () => {
    await service.start(video);
    await service.start(video);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(camera.open).toHaveBeenCalledOnce();
    expect(uploader.upload).toHaveBeenCalledTimes(2);
  });

  it('skips ticks while the previous upload is pending without catching up', async () => {
    let finish!: () => void;
    uploader.upload.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const start = service.start(video);
    await vi.advanceTimersByTimeAsync(90_000);
    expect(uploader.upload).toHaveBeenCalledOnce();
    expect(service.busy()).toBe(true);
    finish();
    await start;
    expect(uploader.upload).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(uploader.upload).toHaveBeenCalledTimes(2);
  });

  it('stops new captures and releases the camera and wake lock', async () => {
    await service.start(video);
    service.stop();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(uploader.upload).toHaveBeenCalledOnce();
    expect(camera.close).toHaveBeenCalledOnce();
    expect(wakeLock.release).toHaveBeenCalledOnce();
    expect(service.active()).toBe(false);
  });

  it('blocks restart until an in-flight upload finishes and ignores its late success', async () => {
    let finish!: () => void;
    uploader.upload.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const start = service.start(video);
    await vi.advanceTimersByTimeAsync(0);
    service.stop();
    await service.start(video);
    expect(camera.open).toHaveBeenCalledOnce();
    expect(service.status()).toContain('still finishing');
    finish();
    await start;
    expect(service.sentCount()).toBe(0);
    expect(service.status()).not.toContain('still finishing');
    await service.start(video);
    expect(camera.open).toHaveBeenCalledTimes(2);
    expect(uploader.upload.mock.calls[1][1]).not.toBe(uploader.upload.mock.calls[0][1]);
  });

  it('does not upload a photo that finishes encoding after Stop', async () => {
    let finish!: (photo: Blob) => void;
    camera.capture.mockReturnValueOnce(
      new Promise<Blob>((resolve) => {
        finish = resolve;
      }),
    );
    const start = service.start(video);
    await vi.advanceTimersByTimeAsync(0);
    service.stop();
    finish(photo);
    await start;
    expect(uploader.upload).not.toHaveBeenCalled();
    expect(service.busy()).toBe(false);
  });

  it('does not send if Stop is pressed before the camera opens', async () => {
    let ready!: () => void;
    camera.open.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        ready = resolve;
      }),
    );
    const start = service.start(video);
    service.stop();
    ready();
    await start;
    await vi.advanceTimersByTimeAsync(90_000);
    expect(uploader.upload).not.toHaveBeenCalled();
    expect(wakeLock.acquire).not.toHaveBeenCalled();
  });

  it('reports permission denial without starting uploads', async () => {
    camera.open.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    await service.start(video);
    expect(service.status()).toContain('permission denied');
    expect(service.active()).toBe(false);
    await vi.advanceTimersByTimeAsync(90_000);
    expect(uploader.upload).not.toHaveBeenCalled();
  });

  it('stops after a camera frame failure', async () => {
    camera.capture.mockRejectedValue(new Error('Camera frame is not ready.'));
    await service.start(video);
    expect(service.status()).toContain('not ready');
    expect(service.active()).toBe(false);
    expect(uploader.upload).not.toHaveBeenCalled();
  });

  it('pauses on a hidden page and does not resume or catch up automatically', async () => {
    await service.start(video);
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(service.active()).toBe(false);
    expect(service.status()).toContain('Paused');
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(180_000);
    expect(uploader.upload).toHaveBeenCalledOnce();
  });

  it('waits at least a minute after HTTP 429, then captures a new photo', async () => {
    uploader.upload.mockRejectedValueOnce(new HttpErrorResponse({ status: 429 }));
    await service.start(video);
    expect(service.status()).toContain('cooldown');
    expect(service.busy()).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(uploader.upload).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(uploader.upload).toHaveBeenCalledTimes(2);
    expect(camera.capture).toHaveBeenCalledTimes(2);
    expect(uploader.upload.mock.calls[1][2]).not.toBe(uploader.upload.mock.calls[0][2]);
  });

  it.each(['120', 'http-date'])('honors a longer Retry-After value (%s)', async (value) => {
    vi.setSystemTime(new Date('2026-10-01T09:00:00Z'));
    const header = value === 'http-date' ? new Date(Date.now() + 120_000).toUTCString() : value;
    uploader.upload.mockRejectedValueOnce(
      new HttpErrorResponse({ status: 429, headers: new HttpHeaders({ 'Retry-After': header }) }),
    );
    await service.start(video);
    await vi.advanceTimersByTimeAsync(90_000);
    expect(uploader.upload).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(uploader.upload).toHaveBeenCalledTimes(2);
  });

  it('keeps a rate-limit cooldown across Stop and Start', async () => {
    uploader.upload.mockRejectedValueOnce(new HttpErrorResponse({ status: 429 }));
    await service.start(video);
    service.stop();
    await service.start(video);
    expect(camera.open).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(60_000);
    await service.start(video);
    expect(camera.open).toHaveBeenCalledTimes(2);
  });

  it('tries a fresh frame on the next tick after an analysis HTTP 502', async () => {
    uploader.upload.mockRejectedValueOnce(new HttpErrorResponse({ status: 502 }));
    await service.start(video);
    expect(service.status()).toContain('unavailable');
    expect(service.active()).toBe(true);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(uploader.upload).toHaveBeenCalledTimes(2);
    expect(service.sentCount()).toBe(1);
  });

  it.each([0, 400, 404])('stops on upload HTTP %s without replaying the POST', async (status) => {
    uploader.upload.mockRejectedValueOnce(new HttpErrorResponse({ status }));
    await service.start(video);
    expect(service.status()).toContain('Upload failed');
    expect(service.active()).toBe(false);
    await vi.advanceTimersByTimeAsync(90_000);
    expect(uploader.upload).toHaveBeenCalledOnce();
  });

  it('destroys the timer and visibility listener with its component scope', async () => {
    await service.start(video);
    TestBed.resetTestingModule();
    const calls = camera.close.mock.calls.length;
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(90_000);
    expect(camera.close).toHaveBeenCalledTimes(calls);
    expect(uploader.upload).toHaveBeenCalledOnce();
  });
});
