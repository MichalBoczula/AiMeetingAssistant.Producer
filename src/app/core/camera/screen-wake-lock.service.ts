import { Injectable, InjectionToken, inject, signal } from '@angular/core';

export const SCREEN_WAKE_LOCK = new InjectionToken<WakeLock | undefined>('SCREEN_WAKE_LOCK', {
  factory: () => navigator.wakeLock,
});

@Injectable()
export class ScreenWakeLockService {
  private readonly wakeLock = inject(SCREEN_WAKE_LOCK);
  private sentinel: WakeLockSentinel | undefined;
  private generation = 0;
  readonly state = signal<'inactive' | 'active' | 'unavailable'>('inactive');

  async acquire(): Promise<void> {
    this.release();
    const generation = this.generation;
    if (!this.wakeLock) {
      this.state.set('unavailable');
      return;
    }
    try {
      const sentinel = await this.wakeLock.request('screen');
      if (generation !== this.generation) {
        await sentinel.release();
        return;
      }
      this.sentinel = sentinel;
      this.state.set(sentinel.released ? 'unavailable' : 'active');
      sentinel.addEventListener(
        'release',
        () => {
          if (this.sentinel === sentinel) {
            this.sentinel = undefined;
            this.state.set('unavailable');
          }
        },
        { once: true },
      );
    } catch {
      if (generation === this.generation) this.state.set('unavailable');
    }
  }

  release(): void {
    this.generation++;
    const sentinel = this.sentinel;
    this.sentinel = undefined;
    this.state.set('inactive');
    if (sentinel) void sentinel.release().catch(() => undefined);
  }
}
