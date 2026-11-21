import type { ElementRef } from '@angular/core';
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  linkedSignal,
  Optional,
  output,
  signal,
  SkipSelf,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { type Game, type TouchControl, touchControlsOf } from '@naucto/engine';
import {
  ButtonDirective,
  ChipComponent,
  DialogService,
  ErrorStateComponent,
  IconComponent,
  JoinedDirective,
  ToastService,
} from '@naucto/ui';

import { ApiError } from '../../core/api/api-errors';
import {
  type NetRequest,
  NetUiBridgeService,
  type SessionInvite,
} from '../../core/net/net-bridge.service';
import { netPermissionsOf } from '../../core/net/net-permissions';
import { ThemeService } from '../../core/theme/theme.service';
import { coarsePointer } from '../input/coarse-pointer';
import { GoodStandingAction } from '../moderation/good-standing-action';
import { HostDialogComponent, type HostDialogData } from '../netplay/host.dialog';
import { JoinDialogComponent } from '../netplay/join.dialog';
import { RuntimeHostService } from './runtime-host.service';
import { VirtualPadComponent } from './virtual-pad.component';

/**
 * The 320×180 screen with its transport. Scales to the container with integer
 * multiples when `fit` is 'integer', or to the full width when 'width'.
 */
@Component({
  selector: 'nc-game-screen',
  imports: [
    ChipComponent,
    ButtonDirective,
    IconComponent,
    JoinedDirective,
    VirtualPadComponent,
    ErrorStateComponent,
    TranslocoDirective,
  ],
  providers: [
    {
      // Reuse the runtime an ancestor provides, so everything reading that runtime sees the engine
      // this screen mounts; with no ancestor the screen owns its own.
      provide: RuntimeHostService,
      useFactory: (parent: RuntimeHostService | null): RuntimeHostService =>
        parent ?? new RuntimeHostService(),
      deps: [[new Optional(), new SkipSelf(), RuntimeHostService]],
    },
    // Each screen keeps its own netplay bridge: the editor's test rig is a second, separate client.
    NetUiBridgeService,
  ],
  templateUrl: './game-screen.component.html',
  host: { class: 'block' },
  styles: `
    /* The frame carries the controls, so it is what goes fullscreen. Its normal max-width and
       margins would letterbox it inside the fullscreen surface, so drop them and centre the
       picture; the transport is absolutely positioned against this element either way. */
    .game-frame:fullscreen {
      display: flex;
      align-items: center;
      justify-content: center;
      max-width: none;
      width: 100vw;
      height: 100vh;
      background: #000;
    }
    /*
     * Sized explicitly: a centred flex child with no width of its own would measure itself on the
     * canvas, whose width is a percentage of it.
     */
    .game-frame:fullscreen > div:first-child {
      max-width: none;
      width: 100vw;
      height: 100vh;
      aspect-ratio: auto;
    }
    .game-frame:fullscreen canvas {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameScreenComponent {
  readonly game = input.required<Game | null>();
  readonly fit = input<'width' | 'integer'>('width');
  readonly transport = input(true);
  /**
   * The tighter transport for a narrow column: a shorter band, no frame around the buttons, no
   * resolution caption.
   */
  readonly compact = input(false, { transform: booleanAttribute });
  /**
   * Lay the transport over the bottom of the picture instead of below it, on the design's scrim.
   * This is the floating viewer's treatment: a card has no room for a band, and the artboard puts
   * the controls on the game.
   */
  readonly overlay = input(false, { transform: booleanAttribute });
  readonly showFps = input(true);
  /** CPU beside the FPS badge, and the frame-step button: editor affordances, not player ones. */
  readonly debug = input(false, { transform: booleanAttribute });
  readonly autoPlay = input(false);
  /** Backend project id, needed to host or join netplay sessions. */
  readonly projectId = input<number | null>(null);
  /**
   * The session this screen was opened on. The mounted game reads it with `net.invite()`, and its
   * `net.join()` enters it straight away instead of asking the player which one.
   */
  readonly invite = input<SessionInvite | null>(null);
  /** Rooms hosted from this screen are the editor testing its own game, not the game being played. */
  readonly editorTest = input(false, { transform: booleanAttribute });
  readonly mounted = output();
  readonly inviteJoined = output();
  /** The invite leads nowhere any more: its session was left, ended, or would not let the player in. */
  readonly inviteClosed = output();
  /** True while this screen — not some other one on the page — owns the fullscreen element. */
  protected readonly isFullscreen = signal(false);
  protected readonly frameClass = computed(() =>
    this.overlay() ? 'game-frame relative' : 'game-frame relative mx-auto max-w-[1600px]',
  );
  /** The band under the screen, or the scrim across it. */
  protected readonly transportClass = computed(() => {
    if (this.overlay() || this.isFullscreen()) {
      return (
        'absolute inset-x-0 bottom-0 flex h-(--nc-h-md) items-center gap-[3px] px-0.75 ' +
        'bg-[image:var(--nc-scrim-video)]'
      );
    }
    const shape = this.compact()
      ? 'h-(--nc-h-md) gap-0.75 border-y-3 border-line px-0.75'
      : 'h-(--nc-h-xl) gap-1 border-3 border-t-0 border-line px-1';
    return `mx-auto -mt-[3px] flex max-w-[1600px] items-center bg-panel ${shape}`;
  });
  protected readonly host = inject(RuntimeHostService);
  protected readonly bridge = inject(NetUiBridgeService);
  private readonly dialogs = inject(DialogService);
  private readonly standing = inject(GoodStandingAction);
  private readonly theme = inject(ThemeService);
  private readonly toasts = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  protected readonly canvasLabel = this.transloco.translate('game.screen.canvas');
  /**
   * The invite while its session may still be entered. It ends here, before whoever gave it hears,
   * the moment the session is left, ended or refuses the player: the game may ask again within the
   * same step.
   */
  private readonly open = linkedSignal(() => this.invite());
  /** Play was pressed while the session this screen was opened on was still unknown. */
  private readonly starting = signal(false);
  protected readonly showCpu = computed(() => this.debug());
  /**
   * Hidden while idle: there is nothing to count until the game runs, and the play overlay already
   * says it is waiting.
   */
  protected readonly fpsVisible = computed(
    () => this.showFps() && this.theme.showFps() && this.host.state() !== 'idle',
  );
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly frame = viewChild.required<ElementRef<HTMLElement>>('frame');
  private readonly padZone = viewChild<VirtualPadComponent>('padZone');
  private readonly padOverlay = viewChild<VirtualPadComponent>('padOverlay');
  /**
   * The controls of the on-screen pad: those the mounted game uses, followed as its actions
   * change, and none on a device with a fine pointer, where the pad is not drawn.
   */
  protected readonly padControls = signal<readonly TouchControl[]>([]);

  constructor() {
    // Also fires when the viewer leaves fullscreen by Escape or the browser's own control, which
    // no click handler would see.
    const onFullscreenChange = (): void => {
      const mine = document.fullscreenElement === this.frame().nativeElement;
      this.isFullscreen.set(mine);
      // The click that asked for fullscreen left focus on its button; the canvas is what listens to
      // the keyboard.
      if (mine) {
        this.focus();
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    });

    effect(() => {
      const game = this.game();
      const canvas = this.canvas().nativeElement;
      if (!game) {
        return;
      }
      // A game boots synchronously in here, so whatever it reads or writes must not remount it.
      untracked(() => {
        this.bridge.permissions.set(netPermissionsOf(game));
        this.host.mount(canvas, game, {
          netUi: this.bridge,
          netPermissions: netPermissionsOf(game),
          // Nothing while in a session: what the game reads says whether its next `net.join()`
          // goes straight in.
          netInvite: () => (this.bridge.session() ? null : (this.open()?.session ?? null)),
        });
        this.mounted.emit();
        if (this.autoPlay()) {
          this.host.play();
        }
      });
    });
    effect((onCleanup) => {
      const game = this.game();
      if (!game || !coarsePointer()) {
        return;
      }
      const read = (): void => {
        this.padControls.set(touchControlsOf(game.actions));
      };
      read();
      onCleanup(game.onActionsChange(read));
    });
    // Both layouts are in the DOM at once (CSS picks one), so both are attached: TouchSource
    // hit-tests, and the hidden one can never be hit.
    effect((onCleanup) => {
      if (!this.game()) {
        return;
      }
      const roots = [this.padZone()?.element, this.padOverlay()?.element].filter(
        (element): element is HTMLElement => !!element,
      );
      const detach = roots.map((root) => this.host.attachPad(root));
      onCleanup(() => {
        for (const detachFn of detach) {
          detachFn();
        }
      });
    });
    // net.host() / net.join() from the game open the matching dialog.
    effect(() => {
      const req = this.bridge.request();
      if (!req) {
        return;
      }
      untracked(() => {
        const projectId = this.projectId();
        if (projectId === null) {
          this.bridge.cancel();
          return;
        }
        // Hosting and joining need an account. A declined sign-in has to cancel the request, or the
        // game that made it waits on it forever.
        this.standing.run(
          () => {
            const invite = this.open();
            if (invite && req.kind === 'join') {
              this.enter(invite, req, projectId);
            } else {
              this.ask(req, projectId);
            }
          },
          () => {
            this.bridge.cancel();
          },
        );
      });
    });
    // The editor's second client has only its host's room to go to, so its invite never ends.
    this.bridge.onDeparted((uuid) => {
      if (uuid === this.open()?.uuid && !this.editorTest()) {
        this.close();
      }
    });
    effect(() => {
      const invite = this.open();
      if (this.starting() && (!invite || invite.session !== undefined)) {
        untracked(() => {
          this.starting.set(false);
          this.start();
        });
      }
    });
  }

  private close(): void {
    this.open.set(null);
    this.inviteClosed.emit();
  }

  private ask(req: NetRequest, projectId: number): void {
    const ref =
      req.kind === 'host'
        ? this.dialogs.open(HostDialogComponent, {
            width: '400px',
            data: {
              bridge: this.bridge,
              projectId,
              options: req.hostOptions ?? { maxPlayers: 2 },
              editorTest: this.editorTest(),
            } satisfies HostDialogData,
          })
        : this.dialogs.open(JoinDialogComponent, {
            width: '400px',
            data: { bridge: this.bridge, projectId },
          });
    ref.closed.subscribe((ok) => {
      if (!ok) {
        this.bridge.cancel();
      }
    });
  }

  /**
   * Joins the session the screen was opened on. One that will not have the player says why and
   * gives way to the dialog, where another can be picked; for the editor's second client the
   * request ends there.
   */
  private enter(invite: SessionInvite, req: NetRequest, projectId: number): void {
    this.bridge.joinSession(invite.uuid, invite.code ?? undefined, this.editorTest()).then(
      () => {
        this.inviteJoined.emit();
      },
      (error: unknown) => {
        this.toasts.show(
          error instanceof ApiError && error.status === 404
            ? this.transloco.translate('net.invite.ended')
            : error instanceof Error
              ? error.message
              : this.transloco.translate('net.join.failed'),
          'error',
        );
        if (this.editorTest()) {
          this.bridge.cancel();
        } else {
          this.close();
          this.ask(req, projectId);
        }
      },
    );
  }

  get runtime(): RuntimeHostService {
    return this.host;
  }

  get netBridge(): NetUiBridgeService {
    return this.bridge;
  }

  /**
   * Closing hands the keyboard back to the game: the dialog returns focus to the gear, and the
   * canvas is what listens.
   */
  protected openControls(): void {
    void import('../controls/controls.dialog').then((loaded) => {
      this.dialogs.open(loaded.ControlsDialogComponent, { width: '860px' }).closed.subscribe(() => {
        this.focus();
      });
    });
  }

  focus(): void {
    this.canvas().nativeElement.focus({ preventScroll: true });
  }

  /**
   * Starting the game hands it the keyboard: the canvas is what listens, and the click left focus
   * on the button.
   */
  private start(): void {
    this.host.play();
    this.focus();
  }

  /**
   * A game opened on a session reads that session in `_init`, so it starts once the session is
   * known, which takes an account in good standing. Without one the game starts without it.
   */
  play(): void {
    const invite = this.open();
    if (invite && invite.session === undefined) {
      this.standing.run(
        () => {
          this.starting.set(true);
        },
        () => {
          this.start();
        },
      );
      return;
    }
    this.start();
  }

  /** Starts the game without the session the screen was opened on. */
  playAlone(): void {
    this.close();
    this.start();
  }

  resume(): void {
    this.host.resume();
    this.focus();
  }

  restart(): void {
    this.host.restart();
    this.focus();
  }

  /**
   * Fullscreens the frame, not the canvas, so the transport comes with the picture. Compared
   * against this screen's own frame: a page may hold several, and the document's fullscreen element
   * may belong to another.
   */
  protected fullscreen(): void {
    const frame = this.frame().nativeElement;
    if (document.fullscreenElement === frame) {
      void document.exitFullscreen();
    } else {
      void frame.requestFullscreen();
    }
  }
}
