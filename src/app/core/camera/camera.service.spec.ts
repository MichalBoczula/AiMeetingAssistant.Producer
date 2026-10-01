import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAMERA_MEDIA_DEVICES, CameraService } from './camera.service';

describe('CameraService', () => {
  const stop = vi.fn();
  const stream = {
    getTracks: () => [{ stop }],
    getVideoTracks: () => [{ readyState: 'live' }],
  } as unknown as MediaStream;
  let video: HTMLVideoElement;
  let getUserMedia: ReturnType<typeof vi.fn>;
  let camera: CameraService;

  beforeEach(() => {
    stop.mockClear();
    video = {
      srcObject: null,
      readyState: 2,
      videoWidth: 1920,
      videoHeight: 1080,
      play: vi.fn().mockResolvedValue(undefined),
    } as unknown as HTMLVideoElement;
    getUserMedia = vi.fn().mockResolvedValue(stream);
    TestBed.configureTestingModule({
      providers: [CameraService, { provide: CAMERA_MEDIA_DEVICES, useValue: { getUserMedia } }],
    });
    camera = TestBed.inject(CameraService);
  });

  afterEach(() => {
    camera.close();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function pendingVideo(): HTMLVideoElement {
    return Object.assign(new EventTarget(), {
      srcObject: null,
      readyState: 0,
      videoWidth: 0,
      videoHeight: 0,
      play: vi.fn().mockResolvedValue(undefined),
    }) as unknown as HTMLVideoElement;
  }

  it('waits for the first loaded frame before allowing capture', async () => {
    vi.useFakeTimers();
    video = pendingVideo();
    const opening = camera.open(video);
    await vi.advanceTimersByTimeAsync(0);
    await expect(camera.capture()).rejects.toThrow('not ready');
    Object.assign(video, { readyState: 2, videoWidth: 1920, videoHeight: 1080 });
    video.dispatchEvent(new Event('loadeddata'));
    await opening;
    expect(video.srcObject).toBe(stream);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels a pending frame wait and clears its timer after Stop', async () => {
    vi.useFakeTimers();
    video = pendingVideo();
    const opening = camera.open(video);
    const assertion = expect(opening).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(0);
    camera.close();
    await assertion;
    expect(stop).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('times out and releases the camera when no frame arrives', async () => {
    vi.useFakeTimers();
    video = pendingVideo();
    const opening = camera.open(video);
    const assertion = expect(opening).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(stop).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
  });

  it('prefers the rear camera without audio and releases its tracks and preview', async () => {
    await camera.open(video);
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    });
    expect(video.srcObject).toBe(stream);
    camera.close();
    expect(stop).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
  });

  it('releases a stream returned after Stop instead of reopening the preview', async () => {
    let grant!: (stream: MediaStream) => void;
    getUserMedia.mockReturnValue(
      new Promise<MediaStream>((resolve) => {
        grant = resolve;
      }),
    );
    const opening = camera.open(video);
    const assertion = expect(opening).rejects.toMatchObject({ name: 'AbortError' });
    camera.close();
    grant(stream);
    await assertion;
    expect(stop).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
  });

  it('encodes the full video frame as a JPEG at 90% quality', async () => {
    await camera.open(video);
    const drawImage = vi.fn();
    const photo = new Blob(['jpeg'], { type: 'image/jpeg' });
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toBlob: vi.fn((callback: BlobCallback) => callback(photo)),
    };
    vi.spyOn(document, 'createElement').mockReturnValueOnce(canvas as unknown as HTMLCanvasElement);
    expect(await camera.capture()).toBe(photo);
    expect(canvas.width).toBe(1920);
    expect(canvas.height).toBe(1080);
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 1920, 1080);
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.9);
    camera.close();
  });

  it('rejects capture when no camera is open', async () => {
    await expect(camera.capture()).rejects.toThrow('not ready');
  });

  it('does not turn a failed camera permission request into a capture', async () => {
    getUserMedia.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    await expect(camera.open(video)).rejects.toMatchObject({ name: 'NotAllowedError' });
    expect(video.srcObject).toBeNull();
  });

  it('releases the stream if the preview fails to play', async () => {
    vi.mocked(video.play).mockRejectedValue(new Error('Playback failed'));
    await expect(camera.open(video)).rejects.toThrow('Playback failed');
    expect(stop).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
  });
});
