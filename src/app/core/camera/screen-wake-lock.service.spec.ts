import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { SCREEN_WAKE_LOCK, ScreenWakeLockService } from './screen-wake-lock.service';

describe('ScreenWakeLockService', () => {
  function create(request?: ReturnType<typeof vi.fn>) {
    TestBed.configureTestingModule({
      providers: [
        ScreenWakeLockService,
        { provide: SCREEN_WAKE_LOCK, useValue: request ? { request } : undefined },
      ],
    });
    return TestBed.inject(ScreenWakeLockService);
  }

  it('reports unsupported wake lock without blocking camera capture', async () => {
    const service = create();
    await service.acquire();
    expect(service.state()).toBe('unavailable');
  });

  it('releases the lock when stopped and reports a system release', async () => {
    const sentinel = new EventTarget() as WakeLockSentinel;
    Object.assign(sentinel, { released: false, release: vi.fn().mockResolvedValue(undefined) });
    const service = create(vi.fn().mockResolvedValue(sentinel));
    await service.acquire();
    expect(service.state()).toBe('active');
    sentinel.dispatchEvent(new Event('release'));
    expect(service.state()).toBe('unavailable');
    await service.acquire();
    service.release();
    expect(sentinel.release).toHaveBeenCalledOnce();
    expect(service.state()).toBe('inactive');
  });

  it('releases a lock acquired after Stop instead of keeping the screen awake', async () => {
    let grant!: (sentinel: WakeLockSentinel) => void;
    const service = create(
      vi.fn().mockReturnValue(
        new Promise((resolve) => {
          grant = resolve;
        }),
      ),
    );
    const acquire = service.acquire();
    service.release();
    const sentinel = {
      release: vi.fn().mockResolvedValue(undefined),
    } as unknown as WakeLockSentinel;
    grant(sentinel);
    await acquire;
    expect(sentinel.release).toHaveBeenCalledOnce();
    expect(service.state()).toBe('inactive');
  });

  it('handles the platform refusing a wake lock', async () => {
    const service = create(vi.fn().mockRejectedValue(new Error('Low battery')));
    await service.acquire();
    expect(service.state()).toBe('unavailable');
  });
});
