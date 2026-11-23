import {
  booleanAttribute,
  computed,
  Directive,
  inject,
  InjectionToken,
  input,
  type Signal,
} from '@angular/core';

/** Whether the kit controls under an element are closed. Provided by the two directives below. */
const DISABLED_SCOPE = new InjectionToken<Signal<boolean>>('nc-disabled-scope');

/**
 * Closes every kit control under the element it sits on, so a screen that may not be written says
 * so once and not on each control. It denies by default: a control added under it later is closed
 * without anybody thinking of it, and one that only looks is let through by name with
 * {@link LooksOnlyDirective}. A scope inside a closed one is closed whatever it is given.
 */
@Directive({
  selector: '[ncDisabledScope]',
  providers: [
    {
      provide: DISABLED_SCOPE,
      useFactory: (): Signal<boolean> => inject(DisabledScopeDirective).closed,
    },
  ],
})
export class DisabledScopeDirective {
  readonly ncDisabledScope = input(true, { transform: booleanAttribute });
  private readonly above = inject(DISABLED_SCOPE, { optional: true, skipSelf: true });
  readonly closed = computed(() => this.ncDisabledScope() || (this.above?.() ?? false));
}

/**
 * Lets what only looks through a closed {@link DisabledScopeDirective}: a tab strip that
 * navigates, a zoom, a transport, a tool that pans or picks.
 *
 * On a kit control it lets that control through and nothing else: what is projected into it, the
 * buttons a tab strip carries beside its tabs, stays under the scope above. On any other element
 * it lets through every control under it. A control's own `disabled` still closes it.
 */
@Directive({
  selector: '[ncLooksOnly]',
  providers: [
    {
      provide: DISABLED_SCOPE,
      useFactory: (): Signal<boolean> => inject(LooksOnlyDirective).below,
    },
  ],
})
export class LooksOnlyDirective {
  private readonly above = inject(DISABLED_SCOPE, { optional: true, skipSelf: true });
  /**
   * Set by the kit control on this element as it is built, which is before anything under it
   * reads {@link below}.
   */
  private onControl = false;
  /** What the controls under this element are told. */
  readonly below = computed(() => this.onControl && (this.above?.() ?? false));

  /** Called by the kit control that sits on the same element: the way through is then its own. */
  claim(): void {
    this.onControl = true;
  }
}

/**
 * Whether a kit control is closed: by its own `disabled`, or by the nearest scope above it unless
 * the control is let through by name. Called where the control is built, since it reads both from
 * the control's own injector.
 */
export function closedBy(own: () => boolean): Signal<boolean> {
  const looks = inject(LooksOnlyDirective, { optional: true, self: true });
  if (looks) {
    looks.claim();
    return computed(own);
  }
  const scope = inject(DISABLED_SCOPE, { optional: true });
  return computed(() => own() || (scope?.() ?? false));
}
