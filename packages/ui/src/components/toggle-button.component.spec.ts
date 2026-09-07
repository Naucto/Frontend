import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ToggleButtonComponent } from './toggle-button.component';

@Component({
  imports: [ToggleButtonComponent],
  template: `
    <nc-toggle-button [checked]="on()" [controlled]="true" (activated)="presses.set(presses() + 1)">
      X
    </nc-toggle-button>
  `,
})
class HostComponent {
  readonly on = signal(true);
  readonly presses = signal(0);
}

describe('ToggleButtonComponent', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<HostComponent>>;

  const button = (): HTMLButtonElement =>
    fixture.nativeElement.querySelector('button') as HTMLButtonElement;

  beforeEach(() => {
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('leaves a controlled button lit when the press does not change the answer', () => {
    expect(button().getAttribute('aria-checked')).toBe('true');
    button().click();
    fixture.detectChanges();
    // The binding still works out to true, so nothing rewrites it — the button must not have put
    // itself out in the meantime. This is a resolution cycling to its next value, not a switch.
    expect(fixture.componentInstance.presses()).toBe(1);
    expect(button().getAttribute('aria-checked')).toBe('true');
  });

  it('still toggles itself when it is not controlled', () => {
    const solo = TestBed.createComponent(ToggleButtonComponent);
    solo.detectChanges();
    const el = solo.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(el.getAttribute('aria-checked')).toBe('false');
    el.click();
    solo.detectChanges();
    expect(el.getAttribute('aria-checked')).toBe('true');
  });
});
