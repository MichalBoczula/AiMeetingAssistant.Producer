import { Component } from '@angular/core';
import { CapturePanel } from './features/capture/capture-panel';

@Component({
  selector: 'app-root',
  imports: [CapturePanel],
  template: '<main><app-capture-panel /></main>',
  styleUrl: './app.scss',
})
export class App {}
