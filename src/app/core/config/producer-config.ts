import { InjectionToken } from '@angular/core';

export interface ProducerConfig {
  readonly analyzeScreenshotEndpoint: string;
  readonly captureIntervalMs: number;
}

export const PRODUCER_CONFIG = new InjectionToken<ProducerConfig>('PRODUCER_CONFIG');
