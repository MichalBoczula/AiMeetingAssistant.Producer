import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { PRODUCER_CONFIG, ProducerConfig } from '../../core/config/producer-config';
import { CapturePanel } from './capture-panel';

describe('CapturePanel', () => {
  async function render(captureIntervalMs: number) {
    const config: ProducerConfig = {
      analyzeScreenshotEndpoint: 'https://example.com/api/analyze-screenshot',
      captureIntervalMs,
    };
    await TestBed.configureTestingModule({
      imports: [CapturePanel],
      providers: [{ provide: PRODUCER_CONFIG, useValue: config }],
    }).compileComponents();
    const fixture = TestBed.createComponent(CapturePanel);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('keeps capture controls disabled until camera capture is implemented', async () => {
    const element = await render(45_000);
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Camera not started.');
    const buttons = [...element.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      'Take photo',
      'Start automatic capture',
      'Stop',
    ]);
    expect(buttons.every((button) => button.disabled)).toBe(true);
  });

  it('shows the configured capture interval rather than a hard-coded value', async () => {
    const element = await render(90_000);
    expect(element.querySelector('.capture-interval')?.textContent).toContain('90 seconds');
  });
});
