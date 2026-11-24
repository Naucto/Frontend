import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { type PresenceDot, PresenceDotsComponent } from './presence-dots.component';

const people = (count: number): PresenceDot[] =>
  Array.from({ length: count }, (_, i) => ({
    id: i,
    name: `p${String(i)}`,
    colour: (['sky', 'blush', 'jade'] as const)[i % 3] ?? 'sky',
  }));

const render = (count: number): HTMLElement => {
  const fixture = TestBed.createComponent(PresenceDotsComponent);
  fixture.componentRef.setInput('peers', people(count));
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
};

describe('PresenceDotsComponent', () => {
  it('draws three dots at most, then how many more, and names everyone', () => {
    const host = render(5);

    expect(host.querySelectorAll('span.size-\\[9px\\]')).toHaveLength(3);
    expect(host.querySelector('svg')).not.toBeNull();
    expect(host.textContent.trim()).toBe('2');
    expect(host.getAttribute('role')).toBe('img');
    expect(host.getAttribute('aria-label')).toBe('p0, p1, p2, p3, p4');
  });

  it('draws nothing and says nothing with nobody there', () => {
    const host = render(0);

    expect(host.children).toHaveLength(0);
    expect(host.getAttribute('role')).toBeNull();
  });
});
