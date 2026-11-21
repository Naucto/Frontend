import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HeroBackdropComponent } from './hero-backdrop.component';
import { installLayoutStubs } from './testing';

describe('HeroBackdropComponent', () => {
  let fixture: ComponentFixture<HeroBackdropComponent>;
  let host: HTMLElement;
  /** The covers the backdrop asked the browser for, to be told loaded by hand. */
  let covers: HTMLImageElement[];

  const layers = (): HTMLElement[] => [...host.querySelectorAll<HTMLElement>(':scope > span')];
  const front = (): HTMLElement => layers().find((layer) => layer.classList.contains('z-[2]'))!;
  const show = (cover: string | null, clip: string | null = null): void => {
    fixture.componentRef.setInput('cover', cover);
    fixture.componentRef.setInput('clip', clip);
    fixture.detectChanges();
  };

  beforeEach(() => {
    installLayoutStubs();
    covers = [];
    vi.stubGlobal(
      'Image',
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        src = '';
        constructor() {
          covers.push(this as unknown as HTMLImageElement);
        }
      },
    );
    TestBed.resetTestingModule();
    fixture = TestBed.createComponent(HeroBackdropComponent);
    host = fixture.nativeElement as HTMLElement;
    show('/covers/1.png');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows the first cover at once, without a change to play', () => {
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(layers()).toHaveLength(2);
    expect(front().style.backgroundImage).toContain('/covers/1.png');
    expect(front().classList).not.toContain('dither-in-fine');
  });

  it('keeps the old cover in front until the next one has loaded, then dithers it in', () => {
    show('/covers/2.png');
    expect(front().style.backgroundImage).toContain('/covers/1.png');
    expect(layers().some((layer) => layer.style.backgroundImage.includes('/covers/2.png'))).toBe(
      true,
    );

    covers.at(-1)?.onload?.(new Event('load'));
    fixture.detectChanges();
    expect(front().style.backgroundImage).toContain('/covers/2.png');
    expect(front().classList).toContain('dither-in-fine');
  });

  it('drops a cover that was overtaken before it loaded', () => {
    show('/covers/2.png');
    const overtaken = covers.at(-1);
    show('/covers/3.png');
    overtaken?.onload?.(new Event('load'));
    covers.at(-1)?.onload?.(new Event('load'));
    fixture.detectChanges();

    expect(front().style.backgroundImage).toContain('/covers/3.png');
  });

  it('brings a clip to the front once it plays, from its middle', () => {
    show('/covers/2.png', '/clips/2.webm');
    const video = host.querySelector('video')!;
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
    expect(front().querySelector('video')).toBeNull();

    Object.defineProperty(video, 'duration', { value: 24 });
    video.dispatchEvent(new Event('loadedmetadata'));
    expect(video.currentTime).toBe(12);

    video.dispatchEvent(new Event('playing'));
    fixture.detectChanges();
    expect(front().querySelector('video')).toBe(video);
  });

  it('shows the cover of a clip that does not start in time', () => {
    vi.useFakeTimers();
    show('/covers/2.png', '/clips/2.webm');
    vi.advanceTimersByTime(1199);
    fixture.detectChanges();
    expect(front().style.backgroundImage).toContain('/covers/1.png');

    vi.advanceTimersByTime(1);
    fixture.detectChanges();
    expect(front().style.backgroundImage).toContain('/covers/2.png');
  });

  it('leaves the clip out where motion is reduced', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    show('/covers/2.png', '/clips/2.webm');
    expect(host.querySelector('video')).toBeNull();
  });

  it('empties the layer left underneath once the new one has fully arrived', () => {
    show('/covers/2.png');
    covers.at(-1)?.onload?.(new Event('load'));
    fixture.detectChanges();
    front().dispatchEvent(new Event('animationend'));
    fixture.detectChanges();

    const under = layers().find((layer) => !layer.classList.contains('z-[2]'));
    expect(under?.style.backgroundImage).toBe('');
  });
});
