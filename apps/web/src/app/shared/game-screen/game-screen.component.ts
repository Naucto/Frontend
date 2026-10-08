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
  Optional,
  output,
  signal,
  SkipSelf,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { type Game } from '@naucto/engine';
import {
  ButtonDirective,
  DialogService,
  ErrorStateComponent,
  IconComponent,
  PopoverDirective,
  PopoverPanelComponent,
} from '@naucto/ui';

import { NetUiBridgeService } from '../../core/net/net-bridge.service';
import { netPermissionsOf } from '../../core/net/net-permissions';
import { ThemeService } from '../../core/theme/theme.service';
import { SignedInAction } from '../auth/signed-in-action';
import { HostDialogComponent } from '../netplay/host.dialog';
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
    ButtonDirective,
    IconComponent,
    PopoverDirective,
    PopoverPanelComponent,
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
  /** Test rig: when the mounted game calls `net.join()`, join this session straight away instead of asking the player which one. */
  readonly autoJoin = input<{ uuid: string; code: string | null } | null>(null);
  readonly mounted = output();
  /** True while this screen — not some other one on the page — owns the fullscreen element. */
  protected readonly isFullscreen = signal(false);
  protected readonly frameClass = computed(() =>
    this.overlay()
      ? 'game-frame @container relative'
      : 'game-frame @container relative mx-auto max-w-[1600px]',
  );
  /** The band under the screen, or the scrim across it. */
  protected readonly transportClass = computed(() => {
    if (this.overlay() || this.isFullscreen()) {
      return (
        'absolute inset-x-0 bottom-0 flex h-[36px] items-center gap-0.75 px-1.25 ' +
        'bg-[image:var(--nc-scrim-video)]'
      );
    }
    const shape = this.compact()
      ? 'h-[36px] gap-1.5 border-y border-line px-1.75'
      : 'h-[44px] gap-1 rounded-b-sm border border-t-0 border-line px-1';
    return `mx-auto -mt-px flex max-w-[1600px] items-center bg-panel ${shape}`;
  });
  protected readonly host = inject(RuntimeHostService);
  protected readonly bridge = inject(NetUiBridgeService);
  private readonly dialogs = inject(DialogService);
  private readonly signedIn = inject(SignedInAction);
  private readonly theme = inject(ThemeService);
  protected readonly canvasLabel = inject(TranslocoService).translate('game.screen.canvas');
  protected readonly showCpu = computed(() => this.debug());
  /** The error as the Console would print it: where, then what. */
  protected readonly errorLine = computed(() => {
    const error = this.host.error();
    if (!error) {
      return '';
    }
    const at = error.file
      ? `${error.file}${error.line === undefined ? '' : `:${String(error.line)}`} · `
      : '';
    return `${at}${error.phase}: ${error.message}`;
  });
  /**
   * Hidden while idle: there is nothing to count until the game runs, and the play overlay already
   * says it is waiting.
   */
  protected readonly fpsVisible = computed(
    () => this.showFps() && this.theme.showFps() && this.host.state() !== 'idle',
  );
  /**
   * The player slots, occupied or not. Never fewer than two, so a game nobody has joined does not
   * read as single-player; an empty seat takes the pad glyph because the keyboard is the first
   * player's.
   */
  protected readonly players = computed(() => {
    const pads = this.host.gamepadCount();
    const taken = Math.max(2, pads > 1 ? pads : 2);
    return Array.from({ length: taken }, (_, i) => ({
      slot: i + 1,
      pad: i === 0 ? pads > 0 : true,
      here: i === 0 || pads > i,
    }));
  });
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly frame = viewChild.required<ElementRef<HTMLElement>>('frame');
  private readonly padZone = viewChild<VirtualPadComponent>('padZone');
  private readonly padOverlay = viewChild<VirtualPadComponent>('padOverlay');
  protected readonly showPad = coarsePointer();
  protected readonly padList = signal<{ index: number; id: string; player: number }[]>([]);

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
        });
        this.mounted.emit();
        if (this.autoPlay()) {
          this.host.play();
        }
      });
    });
    // Both layouts are in the DOM at once (CSS picks one), so both are attached: TouchSource
    // hit-tests, and the hidden one can never be hit.
    effect((onCleanup) => {
      if (!this.game() || !this.showPad) {
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
        this.signedIn.run(
          () => {
            const target = this.autoJoin();
            if (target && req.kind === 'join') {
              void this.bridge
                .joinSession(target.uuid, target.code ?? undefined, true)
                .catch(() => {
                  this.bridge.cancel();
                });
              return;
            }
            const ref =
              req.kind === 'host'
                ? this.dialogs.open(HostDialogComponent, {
                    width: '400px',
                    data: {
                      bridge: this.bridge,
                      projectId,
                      options: req.hostOptions ?? { maxPlayers: 2 },
                    },
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
          },
          () => {
            this.bridge.cancel();
          },
        );
      });
    });
  }

  get runtime(): RuntimeHostService {
    return this.host;
  }

  get netBridge(): NetUiBridgeService {
    return this.bridge;
  }

  protected refreshPads(): void {
    this.padList.set(this.host.gamepads());
  }

  protected assign(index: number, player: number): void {
    this.host.assignGamepad(index, player);
    this.refreshPads();
  }

  focus(): void {
    this.canvas().nativeElement.focus({ preventScroll: true });
  }

  /**
   * Starting the game hands it the keyboard: the canvas is what listens, and the click left focus
   * on the button.
   */
  play(): void {
    this.host.play();
    this.focus();
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

/** No fine pointer means a touch device — the pad is the only way to play. */
function coarsePointer(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}
