import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { App } from './app';
import { appConfig, producerConfig } from './app.config';
import { PRODUCER_CONFIG } from './core/config/producer-config';

describe('App', () => {
  it('renders the capture panel with the application configuration', async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: appConfig.providers,
    }).compileComponents();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('button')?.getAttribute('aria-label')).toBe('Start camera');
    expect(element.querySelector('.capture-interval')?.textContent).toContain('45 seconds');
    expect(TestBed.inject(PRODUCER_CONFIG)).toBe(producerConfig);
  });
});
