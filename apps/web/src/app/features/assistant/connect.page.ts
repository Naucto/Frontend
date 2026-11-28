import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  type AiDeviceDescriptionDto,
  aiGrantsControllerApprove,
  aiGrantsControllerDeny,
  aiGrantsControllerDescribe,
} from '@naucto/api-client';
import { ButtonDirective, FieldComponent, InputDirective, NoticeComponent } from '@naucto/ui';

import { unwrap } from '../../core/api/api-errors';

type Step = 'enter' | 'confirm' | 'connected' | 'refused';

/** Eight letters in two groups, as an assistant shows them; typed in any case, with or without the dash. */
const normalise = (raw: string): string => {
  const letters = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
  return letters.length > 4 ? `${letters.slice(0, 4)}-${letters.slice(4)}` : letters;
};

/**
 * Where an assistant is connected to the account: the code it shows is typed here (or arrives in
 * the address it gave), the page says what asks, and the owner connects it or refuses. The
 * assistant, waiting on its side, gets its tokens on its next poll.
 */
@Component({
  selector: 'nc-assistant-connect-page',
  imports: [
    RouterLink,
    TranslocoDirective,
    ButtonDirective,
    FieldComponent,
    InputDirective,
    NoticeComponent,
  ],
  templateUrl: './connect.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class AssistantConnectPage {
  /** The code from the address an assistant gave, `?code=ACDE-FGHJ`. */
  readonly code = input<string>();
  protected readonly typed = linkedSignal(() => normalise(this.code() ?? ''));
  protected readonly step = signal<Step>('enter');
  protected readonly asking = signal<AiDeviceDescriptionDto | null>(null);
  protected readonly failed = signal(false);
  protected readonly busy = signal(false);
  protected readonly complete = computed(() => /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(this.typed()));

  protected type(value: string): void {
    this.typed.set(normalise(value));
    this.failed.set(false);
  }

  protected async look(): Promise<void> {
    this.busy.set(true);
    try {
      this.asking.set(unwrap(await aiGrantsControllerDescribe({ path: { code: this.typed() } })));
      this.step.set('confirm');
    } catch {
      this.failed.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  protected async answer(approve: boolean): Promise<void> {
    this.busy.set(true);
    try {
      const path = { code: this.typed() };
      unwrap(
        approve
          ? await aiGrantsControllerApprove({ path })
          : await aiGrantsControllerDeny({ path }),
      );
      this.step.set(approve ? 'connected' : 'refused');
    } catch {
      this.failed.set(true);
      this.step.set('enter');
    } finally {
      this.busy.set(false);
    }
  }
}
