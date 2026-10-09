import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ConsentStore } from '../../core/analytics/consent.store';
import { FeaturesService } from '../../core/config/features.service';
import { COOKIE_NAMES, readCookie } from '../../core/storage/cookies';
import { testProviders } from '../../testing/providers';
import { ConsentBannerComponent } from './consent-banner.component';

@Component({ template: '' })
class BlankPage {}

const ROUTES = [
  { path: '', component: BlankPage },
  { path: 'oauth/callback', component: BlankPage },
];

const clearCookies = (): void => {
  for (const name of Object.values(COOKIE_NAMES)) {
    document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
};

describe('ConsentBannerComponent', () => {
  const analytics = signal(true);

  const showAt = async (url: string): Promise<void> => {
    await render(ConsentBannerComponent, {
      providers: [...testProviders(ROUTES), { provide: FeaturesService, useValue: { analytics } }],
    });
    await TestBed.inject(Router).navigateByUrl(url);
  };

  beforeEach(() => {
    clearCookies();
    analytics.set(true);
  });

  afterEach(() => {
    clearCookies();
  });

  it('waits for the first navigation before asking', async () => {
    await render(ConsentBannerComponent, {
      providers: [...testProviders(ROUTES), { provide: FeaturesService, useValue: { analytics } }],
    });

    expect(screen.queryByRole('region', { name: 'Usage analytics' })).toBeNull();
  });

  it('asks with both answers equally easy to give', async () => {
    await showAt('/');

    const refuse = await screen.findByRole('button', { name: 'Refuse' });
    const accept = screen.getByRole('button', { name: 'Accept' });
    expect(refuse.getAttribute('data-variant')).toBe(accept.getAttribute('data-variant'));
    expect(refuse.className).toBe(accept.className);
  });

  it('records a refusal and stops asking', async () => {
    await showAt('/');

    await userEvent.click(await screen.findByRole('button', { name: 'Refuse' }));

    expect(TestBed.inject(ConsentStore).status()).toBe('denied');
    expect(screen.queryByRole('region', { name: 'Usage analytics' })).toBeNull();
    expect(readCookie(COOKIE_NAMES.visitor)).toBeNull();
  });

  it('records an acceptance, creating the visitor cookie', async () => {
    await showAt('/');

    await userEvent.click(await screen.findByRole('button', { name: 'Accept' }));

    expect(TestBed.inject(ConsentStore).status()).toBe('granted');
    expect(readCookie(COOKIE_NAMES.visitor)).not.toBeNull();
  });

  it('never shows in an OAuth callback', async () => {
    await showAt('/oauth/callback');

    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
  });

  it('never shows while analytics is off', async () => {
    analytics.set(false);

    await showAt('/');

    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
  });
});
