import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import { PRODUCER_CONFIG } from '../../core/config/producer-config';
import { CapturePanel } from './capture-panel';
import { CaptureSessionService } from './capture-session.service';

describe('CapturePanel', () => {
  async function render() {
    const active = signal(false);
    const session = {
      active,
      busy: signal(false),
      status: signal('Tap the camera to start.'),
      sentCount: signal(0),
      wakeLock: { state: signal('inactive') },
      start: vi.fn(async () => active.set(true)),
      stop: vi.fn(() => active.set(false)),
    };
    TestBed.configureTestingModule({
      imports: [CapturePanel],
      providers: [{ provide: PRODUCER_CONFIG, useValue: { captureIntervalMs: 90_000 } }],
    });
    TestBed.overrideComponent(CapturePanel, {
      set: { providers: [{ provide: CaptureSessionService, useValue: session }] },
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(CapturePanel);
    fixture.detectChanges();
    return { fixture, session, element: fixture.nativeElement as HTMLElement };
  }

  it('uses a single camera button to start and stop automatic capture with a live preview', async () => {
    const { fixture, session, element } = await render();
    const button = element.querySelector('button')!;
    const video = element.querySelector('video')!;
    expect(element.querySelectorAll('button')).toHaveLength(1);
    expect(video.hidden).toBe(true);
    expect(element.querySelector('.capture-interval')?.textContent).toContain('90 seconds');
    button.click();
    fixture.detectChanges();
    expect(session.start).toHaveBeenCalledWith(video);
    expect(button.getAttribute('aria-label')).toBe('Stop camera');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(video.hidden).toBe(false);
    button.click();
    fixture.detectChanges();
    expect(session.stop).toHaveBeenCalledOnce();
    expect(button.getAttribute('aria-label')).toBe('Start camera');
  });

  it('allows Stop during upload but blocks restart until that upload settles', async () => {
    const { fixture, session, element } = await render();
    session.active.set(true);
    session.busy.set(true);
    fixture.detectChanges();
    const button = element.querySelector('button')!;
    expect(button.disabled).toBe(false);
    button.click();
    fixture.detectChanges();
    expect(button.disabled).toBe(true);
  });
});
