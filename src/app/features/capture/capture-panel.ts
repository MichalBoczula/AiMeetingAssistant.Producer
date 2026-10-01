import { Component, inject } from '@angular/core';
import { PRODUCER_CONFIG } from '../../core/config/producer-config';

@Component({
  selector: 'app-capture-panel',
  templateUrl: './capture-panel.html',
  styleUrl: './capture-panel.scss',
})
export class CapturePanel {
  protected readonly captureIntervalSeconds = inject(PRODUCER_CONFIG).captureIntervalMs / 1_000;
}
