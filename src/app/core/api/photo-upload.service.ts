import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { PRODUCER_CONFIG } from '../config/producer-config';

@Injectable({ providedIn: 'root' })
export class PhotoUploadService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(PRODUCER_CONFIG);

  upload(photo: Blob, sessionId: string, requestId: string): Promise<void> {
    const form = new FormData();
    form.append('file', photo, 'photo.jpg');
    form.append('sessionId', sessionId);
    form.append('requestId', requestId);
    // The browser sets multipart Content-Type with the correct boundary.
    return firstValueFrom(this.http.post(this.config.analyzeScreenshotEndpoint, form)).then(
      () => undefined,
    );
  }
}
