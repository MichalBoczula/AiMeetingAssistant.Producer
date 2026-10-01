import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { PRODUCER_CONFIG, ProducerConfig } from './core/config/producer-config';

export const producerConfig: ProducerConfig = Object.freeze({
  analyzeScreenshotEndpoint:
    'https://func-ai-meeting-assistant-dev-mb-btdeargfegebefhb.polandcentral-01.azurewebsites.net/api/analyze-screenshot',
  captureIntervalMs: 45_000,
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: PRODUCER_CONFIG, useValue: producerConfig },
  ],
};
