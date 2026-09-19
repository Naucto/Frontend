import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthStore } from '../auth.store';
import { OAuthService } from './oauth.service';
import { type OAuthProviderFlow } from './oauth-provider';
import { OAUTH_PROVIDERS } from './providers';

/** The runner has no DOM storage; the point of the state is that it is never written too early. */
function installSessionStorage(): { setItem: ReturnType<typeof vi.fn> } {
  const mem = new Map<string, string>();
  const setItem = vi.fn((k: string, v: string) => {
    mem.set(k, v);
  });
  const fake: Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'clear'> = {
    getItem: (k) => mem.get(k) ?? null,
    setItem,
    removeItem: (k) => {
      mem.delete(k);
    },
    clear: () => {
      mem.clear();
    },
  };
  Object.defineProperty(window, 'sessionStorage', { value: fake, configurable: true });
  return { setItem };
}

/** Stands for any provider that answers in a popup; its id is only a slot in the registry. */
const viaPopup: OAuthProviderFlow = {
  id: 'microsoft',
  label: 'Elsewhere',
  mark: 'microsoft',
  kind: 'popup',
  configured: () => true,
  start: async ({ popup }) => ({ token: await popup('https://example.test/authorize') }),
  finish: () => Promise.resolve('never'),
};

const unconfigured: OAuthProviderFlow = { ...viaPopup, id: 'github', configured: () => false };

function popupWindow(): { closed: boolean; close: ReturnType<typeof vi.fn> } {
  return { closed: false, close: vi.fn() };
}

function postFromPopup(data: unknown): void {
  window.dispatchEvent(new MessageEvent('message', { data, origin: location.origin }));
}

describe('OAuthService', () => {
  const completeOAuth = vi.fn(() => Promise.resolve());
  let storage: ReturnType<typeof installSessionStorage>;
  let popup: ReturnType<typeof popupWindow>;

  beforeEach(() => {
    vi.useFakeTimers();
    completeOAuth.mockClear();
    storage = installSessionStorage();
    popup = popupWindow();
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    TestBed.configureTestingModule({
      providers: [
        { provide: OAUTH_PROVIDERS, useValue: [viaPopup, unconfigured] },
        { provide: AuthStore, useValue: { completeOAuth } },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const service = (): OAuthService => TestBed.inject(OAuthService);

  it('completes the session once, from the message the popup posts back', async () => {
    const started = service().start(viaPopup.id);
    postFromPopup({ type: 'naucto:oauth:success', token: 'tok' });
    postFromPopup({ type: 'naucto:oauth:success', token: 'tok' });

    await expect(started).resolves.toBe('signed-in');
    expect(completeOAuth).toHaveBeenCalledTimes(1);
    expect(completeOAuth).toHaveBeenCalledWith('tok');
  });

  it('gives up when the popup is closed, and stops listening', async () => {
    const started = expect(service().start(viaPopup.id)).rejects.toThrow('popup_closed');
    popup.closed = true;
    await vi.advanceTimersByTimeAsync(500);

    await started;
    postFromPopup({ type: 'naucto:oauth:success', token: 'late' });
    await vi.advanceTimersByTimeAsync(0);
    expect(completeOAuth).not.toHaveBeenCalled();
  });

  it('gives up after two minutes and takes the popup down with it', async () => {
    const started = expect(service().start(viaPopup.id)).rejects.toThrow('popup_timeout');
    await vi.advanceTimersByTimeAsync(2 * 60_000);

    await started;
    expect(popup.close).toHaveBeenCalledTimes(1);
  });

  it('refuses a provider the server did not configure before writing any state', async () => {
    await expect(service().start(unconfigured.id)).rejects.toThrow('oauth_not_configured');

    expect(storage.setItem).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });
});
