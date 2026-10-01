import { Component, ElementRef, inject, viewChild } from '@angular/core';
import { PRODUCER_CONFIG } from '../../core/config/producer-config';
import { CameraService } from '../../core/camera/camera.service';
import { ScreenWakeLockService } from '../../core/camera/screen-wake-lock.service';
import { CaptureSessionService } from './capture-session.service';

@Component({
  selector: 'app-capture-panel',
  templateUrl: './capture-panel.html',
  styleUrl: './capture-panel.scss',
  providers: [CameraService, ScreenWakeLockService, CaptureSessionService],
})
export class CapturePanel {
  protected readonly captureIntervalSeconds = inject(PRODUCER_CONFIG).captureIntervalMs / 1_000;
  protected readonly session = inject(CaptureSessionService);
  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('preview');

  protected toggleCamera(): void {
    if (this.session.active()) this.session.stop();
    else void this.session.start(this.video().nativeElement);
  }
}
