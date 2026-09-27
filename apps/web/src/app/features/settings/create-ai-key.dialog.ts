import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { createAiKey } from '@app/shared/queries/ai-keys.queries';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  ButtonDirective,
  DialogShellComponent,
  FieldComponent,
  InputDirective,
  NoticeComponent,
  SegmentedComponent,
} from '@naucto/ui';

/**
 * The control carries strings, so the choices are named here and resolved to a day count (or null
 * for a key that never expires on its own) only when the request goes out.
 */
export type KeyExpiry = 'never' | '30' | '90' | '365';

const DAYS: Record<KeyExpiry, number | null> = { never: null, '30': 30, '90': 90, '365': 365 };

/**
 * Names a key and gives it a lifetime, then shows the token exactly once.
 *
 * The token is not retrievable afterwards — only its hash is kept — so this dialog stays open
 * until the person has had the chance to copy it, and closing it is what loses it.
 */
@Component({
  selector: 'nc-create-ai-key-dialog',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    DialogShellComponent,
    FieldComponent,
    InputDirective,
    NoticeComponent,
    SegmentedComponent,
  ],
  template: `
    <nc-dialog-shell
      *transloco="let t"
      [title]="t('ai.keys.create')"
      [lead]="token() ? undefined : t('ai.keys.expiryHint')"
    >
      @if (token(); as made) {
        <nc-notice tone="warn">
          <p class="text-body">{{ t('ai.keys.tokenOnce') }}</p>
        </nc-notice>
        <code
          class="mt-1 block max-h-32 overflow-auto border border-line bg-inset p-1.5 font-mono text-meta break-all select-all"
        >
          {{ made }}
        </code>
        <p class="mt-1 text-meta text-ink-3">{{ t('ai.keys.setupHint') }}</p>
      } @else {
        <nc-field [label]="t('ai.keys.name')" for="key-name" [hint]="t('ai.keys.nameHint')">
          <input
            ncInput
            cdkFocusInitial
            id="key-name"
            autocomplete="off"
            spellcheck="false"
            maxlength="60"
            [value]="name()"
            (input)="name.set($any($event.target).value)"
            (keydown.enter)="submit()"
          />
        </nc-field>
        <!-- No hint here: the dialog lead already says it, and twice is noise. -->
        <nc-field class="mt-1" [label]="t('ai.keys.expiry')" for="key-expiry">
          <nc-segmented
            [options]="expiries()"
            [value]="expiry()"
            (valueChange)="expiry.set($event ?? 'never')"
            size="sm"
          />
        </nc-field>
        @if (error()) {
          <nc-notice tone="danger" role="alert" class="mt-1">{{ error() }}</nc-notice>
        }
      }
      <ng-container footer>
        <button ncButton variant="ghost" (click)="ref.close(false)">
          {{ t('net.cancel') }}
        </button>
        @if (token(); as made) {
          <button ncButton variant="primary" (click)="copy(made)">
            {{ t('ai.keys.copy') }}
          </button>
          <button ncButton variant="secondary" (click)="ref.close(true)">
            {{ t('ai.keys.created') }}
          </button>
        } @else {
          <button ncButton variant="primary" [disabled]="!canCreate()" (click)="submit()">
            {{ t('ai.keys.createConfirm') }}
          </button>
        }
      </ng-container>
    </nc-dialog-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateAiKeyDialog {
  protected readonly ref = inject(DialogRef<boolean>);
  private readonly transloco = inject(TranslocoService);

  protected readonly name = signal('');
  protected readonly expiry = signal<KeyExpiry>('never');
  protected readonly token = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  private readonly busy = signal(false);

  /** A person who wants a deadline says so in days; 90 is the "I'll deal with it" middle. */
  protected readonly expiries = computed<{ value: KeyExpiry; label: string }[]>(() =>
    (Object.keys(DAYS) as KeyExpiry[]).map((value) => ({
      value,
      label:
        value === 'never'
          ? this.transloco.translate('ai.keys.expiryNever')
          : this.transloco.translate('ai.keys.expiryDays', { count: DAYS[value] }),
    })),
  );

  protected readonly canCreate = computed(() => this.name().trim().length > 0 && !this.busy());

  protected async submit(): Promise<void> {
    if (!this.canCreate()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      this.token.set(await createAiKey(this.name().trim(), DAYS[this.expiry()]));
    } catch {
      this.error.set(this.transloco.translate('ai.keys.failed'));
    } finally {
      this.busy.set(false);
    }
  }

  protected copy(token: string): void {
    void navigator.clipboard.writeText(token);
  }
}
