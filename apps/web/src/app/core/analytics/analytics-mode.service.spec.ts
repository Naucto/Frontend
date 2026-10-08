import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { FeaturesService } from '../config/features.service';
import { AnalyticsModeService } from './analytics-mode.service';
import { BrowserAccountService } from './browser-account.service';
import { ConsentStore } from './consent.store';

describe('AnalyticsModeService', () => {
  const consent = signal<'unknown' | 'granted' | 'denied'>('granted');
  const analytics = signal(true);
  const suspended = signal(false);

  const mode = (): string => TestBed.inject(AnalyticsModeService).mode();

  beforeEach(() => {
    TestBed.resetTestingModule();
    consent.set('granted');
    analytics.set(true);
    suspended.set(false);
    TestBed.configureTestingModule({
      providers: [
        { provide: ConsentStore, useValue: { status: consent } },
        { provide: FeaturesService, useValue: { analytics } },
        { provide: BrowserAccountService, useValue: { suspended } },
      ],
    });
  });

  it('reports under the visitor with consent', () => {
    expect(mode()).toBe('consented');
  });

  it('reports anonymously before a choice, after a refusal, and while suspended', () => {
    consent.set('unknown');
    expect(mode()).toBe('anonymous');
    consent.set('denied');
    expect(mode()).toBe('anonymous');
    consent.set('granted');
    suspended.set(true);
    expect(mode()).toBe('anonymous');
  });

  it('reports nothing with analytics off', () => {
    analytics.set(false);

    expect(mode()).toBe('off');
  });
});
