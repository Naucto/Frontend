import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { COVER_RATIO, CoverCardComponent } from './cover-card.component';

function render(inputs: Record<string, unknown>): ComponentFixture<CoverCardComponent> {
  const fixture = TestBed.createComponent(CoverCardComponent);
  for (const [name, value] of Object.entries({ name: 'Hightide', ...inputs })) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();
  return fixture;
}

describe('CoverCardComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('links the whole card and prints the name under a box of the shape of a cover', () => {
    const host = render({ link: ['/play', 7] }).nativeElement as HTMLElement;
    const link = host.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/play/7');
    expect(link?.textContent).toContain('Hightide');
    expect(host.querySelector<HTMLElement>('.relative')?.style.aspectRatio).toBe(COVER_RATIO);
  });

  it('is a still picture without a link', () => {
    const host = render({}).nativeElement as HTMLElement;
    expect(host.querySelector('a')?.hasAttribute('href')).toBe(false);
  });

  it('keeps its action hidden until it is reached', () => {
    const host = render({ action: 'play', actionLabel: 'Play' }).nativeElement as HTMLElement;
    const action = host.querySelector('.raised-sm');
    expect(action?.textContent).toContain('Play');
    expect(action?.classList).toContain('bevel-hot');
    expect(action?.classList).toContain('opacity-0');
  });

  it('offers nothing when it has no action', () => {
    const host = render({}).nativeElement as HTMLElement;
    expect(host.querySelector('.raised-sm')).toBeNull();
  });

  it('always shows the action of the game that does not exist yet', () => {
    const host = render({ ghost: true, action: 'new', actionLabel: 'New game' })
      .nativeElement as HTMLElement;
    const action = host.querySelector('.raised-sm');
    expect(action?.classList).toContain('bevel-primary');
    expect(action?.classList).not.toContain('opacity-0');
  });
});
