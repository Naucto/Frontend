import { bootstrapApplication } from '@angular/platform-browser';

import { App } from './app/app';
import { appConfig } from './app/app.config';
import { reportBootFailure } from './app/core/crash/boot-failure';

bootstrapApplication(App, appConfig).catch((err: unknown) => {
  console.error(err);
  void reportBootFailure(err);
});
