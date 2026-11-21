import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { FloppyComponent } from './floppy.component';

/** jsdom has neither; the disk only asks them when to measure its name again. */
function installLayoutStubs(): void {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe(): void {
      return undefined;
    }
    disconnect(): void {
      return undefined;
    }
  };
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { ready: Promise.resolve() },
  });
}

function render(inputs: Record<string, unknown>): ComponentFixture<FloppyComponent> {
  const fixture = TestBed.createComponent(FloppyComponent);
  for (const [name, value] of Object.entries({ name: 'Hightide', ...inputs })) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();
  return fixture;
}

describe('FloppyComponent', () => {
  beforeEach(() => {
    installLayoutStubs();
    TestBed.resetTestingModule();
  });

  it('prints the name under the disk and raises the action it is given', () => {
    const host = render({ action: 'play', actionLabel: 'Play' }).nativeElement as HTMLElement;
    expect(host.querySelector('.title')?.textContent).toContain('Hightide');
    expect(host.querySelector('.action')?.textContent).toContain('Play');
    expect(host.querySelector('.action')?.classList).toContain('bevel-hot');
  });

  it('raises nothing when it has no action', () => {
    const host = render({}).nativeElement as HTMLElement;
    expect(host.querySelector('.action')).toBeNull();
  });

  /** A thumbnail sits in a row that already prints the name and carries the link. */
  it('is the disk alone as a thumbnail', () => {
    const host = render({ mode: 'thumb', action: 'play' }).nativeElement as HTMLElement;
    expect(host.classList).toContain('thumb');
    expect(host.querySelector('.title')).toBeNull();
    expect(host.querySelector('.action')).toBeNull();
    expect(host.querySelector('.band')).toBeNull();
  });

  it('takes its plastic from the body colour and its open state from the input', () => {
    const fixture = render({ body: 'rgb(0, 120, 153)' });
    const host = fixture.nativeElement as HTMLElement;
    expect(host.style.getPropertyValue('--floppy-body')).toBe('rgb(0, 120, 153)');
    expect(host.classList).not.toContain('open');

    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    expect(host.classList).toContain('open');
  });

  /** The lean is two custom properties the stylesheet reads; a touch never sets them. */
  it('leans toward a mouse and is eased back from where it left', () => {
    const host = render({}).nativeElement as HTMLElement;
    const pointer = (type: string, pointerType: string): void => {
      const event = new MouseEvent(type, { clientX: 10, clientY: 10 });
      Object.defineProperty(event, 'pointerType', { value: pointerType });
      host.dispatchEvent(event);
    };

    pointer('pointerenter', 'touch');
    pointer('pointermove', 'touch');
    expect(host.classList).not.toContain('tilting');
    expect(host.style.getPropertyValue('--f-x')).toBe('');

    pointer('pointerenter', 'mouse');
    pointer('pointermove', 'mouse');
    expect(host.classList).toContain('tilting');
    const lean = host.style.getPropertyValue('--f-x');
    expect(lean).not.toBe('');

    pointer('pointerleave', 'mouse');
    expect(host.classList).not.toContain('tilting');
    expect(host.style.getPropertyValue('--f-x')).toBe(lean);
  });

  it('shows the cover on the label, and the hatch when there is none', () => {
    const bare = render({}).nativeElement as HTMLElement;
    expect(bare.querySelector('.label')?.classList).toContain('no-cover');

    const covered = render({ cover: 'data:image/png;base64,AA==' }).nativeElement as HTMLElement;
    expect(covered.querySelector('.label img')).not.toBeNull();
    expect(covered.querySelector('.label')?.classList).not.toContain('no-cover');
  });

  it('draws the disk that does not exist yet as an outline that says what it makes', () => {
    const host = render({ ghost: true, action: 'new', actionLabel: 'New game' })
      .nativeElement as HTMLElement;
    expect(host.classList).toContain('ghost');
    expect(host.querySelector('.outline')).not.toBeNull();
    expect(host.querySelector('.new')?.textContent).toContain('New game');
    expect(host.querySelector('.action')).toBeNull();
  });
});
