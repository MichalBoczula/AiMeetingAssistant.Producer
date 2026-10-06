import { provideHttpClient, HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PRODUCER_CONFIG } from '../config/producer-config';
import { PhotoUploadService } from './photo-upload.service';

describe('PhotoUploadService', () => {
  let service: PhotoUploadService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: PRODUCER_CONFIG,
          useValue: {
            analyzeScreenshotEndpoint: 'https://example.com/api/analyze-screenshot',
            captureIntervalMs: 30_000,
          },
        },
      ],
    });
    service = TestBed.inject(PhotoUploadService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('posts a JPEG with session and request IDs, leaving multipart headers to the browser', async () => {
    const result = service.upload(
      new Blob(['photo'], { type: 'image/jpeg' }),
      'session-1',
      'request-1',
    );
    const request = http.expectOne('https://example.com/api/analyze-screenshot');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.has('Content-Type')).toBe(false);
    const form = request.request.body as FormData;
    const photo = form.get('file') as File;
    expect(photo.name).toBe('photo.jpg');
    expect(photo.type).toBe('image/jpeg');
    expect(photo.size).toBe(5);
    expect(form.get('sessionId')).toBe('session-1');
    expect(form.get('requestId')).toBe('request-1');
    request.flush(
      { requestId: 'request-1', status: 'accepted' },
      { status: 202, statusText: 'Accepted' },
    );
    await result;
  });

  it.each([400, 429, 502])('passes HTTP %s to the session without retrying', async (status) => {
    const result = service.upload(new Blob(['photo'], { type: 'image/jpeg' }), 's', 'r');
    const assertion = expect(result).rejects.toMatchObject({ status });
    http
      .expectOne('https://example.com/api/analyze-screenshot')
      .flush({ errorCode: 'FAILED' }, { status, statusText: 'Failed' });
    await assertion;
  });

  it('passes a network failure without replaying the upload', async () => {
    const result = service.upload(new Blob(['photo']), 's', 'r');
    const assertion = expect(result).rejects.toBeInstanceOf(HttpErrorResponse);
    http.expectOne('https://example.com/api/analyze-screenshot').error(new ProgressEvent('error'));
    await assertion;
  });
});
