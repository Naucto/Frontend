import { Dialog } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { ConfirmDialogComponent } from './confirm-dialog.component';
import { DialogService } from './dialog.service';

describe('DialogService.confirmDanger', () => {
  let closed: Subject<boolean | undefined>;
  let opened: { component: unknown; data: unknown }[];

  beforeEach(() => {
    closed = new Subject();
    opened = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Dialog,
          useValue: {
            open: (component: unknown, config: { data: unknown }) => {
              opened.push({ component, data: config.data });
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
});
