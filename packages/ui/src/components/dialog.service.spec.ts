import { Dialog } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { ConfirmDialogComponent } from './confirm-dialog.component';
import { DialogService } from './dialog.service';

describe('DialogService', () => {
  let closed: Subject<boolean | string | undefined>;
  let opened: { component: unknown; data: unknown }[];
  let backdrop: unknown;
  let position: unknown;

  beforeEach(() => {
    closed = new Subject();
    opened = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Dialog,
          useValue: {
            open: (
              component: unknown,
              config: { data: unknown; backdropClass: unknown; positionStrategy?: unknown },
            ) => {
              opened.push({ component, data: config.data });
              backdrop = config.backdropClass;
              position = config.positionStrategy;
              return { closed };
            },
          },
        },
      ],
    });
  });

  const ask = (): Promise<boolean> =>
    TestBed.inject(DialogService).confirmDanger({
      title: 'Delete this sheet?',
      message: 'Its art goes with it.',
      confirmLabel: 'Delete',
    });

  it('opens the confirm dialog marked as dangerous', () => {
    void ask();
    expect(opened).toEqual([
      {
        component: ConfirmDialogComponent,
        data: {
          title: 'Delete this sheet?',
          message: 'Its art goes with it.',
          confirmLabel: 'Delete',
          danger: true,
        },
      },
    ]);
  });

  it('resolves true on the confirm button', async () => {
    const answer = ask();
    closed.next(true);
    await expect(answer).resolves.toBe(true);
  });

  it('resolves false when the dialog is dismissed', async () => {
    const answer = ask();
    closed.next(undefined);
    await expect(answer).resolves.toBe(false);
  });

  /** A field of pixels that appears at once is the flicker reduced motion asks to be spared. */
  it('lays the dither scrim, and a flat veil in its place where motion is reduced', () => {
    void ask();
    expect(backdrop).toEqual(
      expect.arrayContaining([
        'nc-dialog-backdrop',
        'motion-reduce:[mask-image:none]',
        'motion-reduce:bg-scrim/50',
        'in-data-reduce-motion:[mask-image:none]',
        'in-data-reduce-motion:bg-scrim/50',
      ]),
    );
  });

  it('leaves the centring to the overlay unless a distance from the top is asked for', () => {
    const service = TestBed.inject(DialogService);

    service.open(ConfirmDialogComponent);
    expect(position).toBeUndefined();

    service.open(ConfirmDialogComponent, { top: '96px' });
    expect(position).toBeDefined();
  });

  it('asks without the danger mark through confirm', async () => {
    const answer = TestBed.inject(DialogService).confirm({
      title: 'Publish?',
      message: 'It goes on the shelf.',
    });
    expect(opened[0]?.data).toEqual({ title: 'Publish?', message: 'It goes on the shelf.' });
    closed.next(true);
    await expect(answer).resolves.toBe(true);
  });

  it('resolves with the password that was typed, or null on a dismissal', async () => {
    const service = TestBed.inject(DialogService);
    const texts = { title: 'Delete your account?', message: 'For good.', danger: true };

    const typed = service.confirmWithPassword(texts, 'Password');
    expect(opened[0]?.data).toEqual({
      ...texts,
      friction: { kind: 'password', label: 'Password' },
    });
    closed.next('hunter2');
    await expect(typed).resolves.toBe('hunter2');

    const dismissed = service.confirmWithPassword(texts, 'Password');
    closed.next(false);
    await expect(dismissed).resolves.toBeNull();
  });
});
