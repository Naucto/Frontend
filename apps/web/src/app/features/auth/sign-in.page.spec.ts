import { By } from '@angular/platform-browser';
import { AuthStore } from '@app/core/auth/auth.store';
import { SignInFormComponent } from '@app/shared/auth/sign-in-form.component';
import { testProviders } from '@app/testing/providers';
import { render } from '@testing-library/angular';
import { describe, expect, it } from 'vitest';

import { SignInPage } from './sign-in.page';

function nextReceivedFor(next: string | undefined): Promise<string | undefined> {
  return render(SignInPage, {
    inputs: { next },
    providers: [...testProviders(), { provide: AuthStore, useValue: {} }],
  }).then(({ fixture }) => {
    const form = fixture.debugElement.query(By.directive(SignInFormComponent));
    return (form.componentInstance as SignInFormComponent).next();
  });
}

describe('SignInPage, post-login redirect', () => {
  it('falls back to /hub for a protocol-relative target', async () => {
    expect(await nextReceivedFor('//evil.example')).toBe('/hub');
  });

  it('falls back to /hub for an absolute URL', async () => {
    expect(await nextReceivedFor('https://evil.example')).toBe('/hub');
  });

  it('falls back to /hub for a non-path scheme', async () => {
    expect(await nextReceivedFor('javascript:alert(1)')).toBe('/hub');
  });

  it('falls back to /hub when nothing was asked for', async () => {
    expect(await nextReceivedFor(undefined)).toBe('/hub');
  });

  it('keeps a same-origin path', async () => {
    expect(await nextReceivedFor('/games')).toBe('/games');
  });
});
