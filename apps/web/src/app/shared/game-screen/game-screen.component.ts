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
import { AuthStore } from '@app/core/auth/auth.store';
import { NetUiBridgeService } from '@app/core/net/net-bridge.service';
import { netPermissionsOf } from '@app/core/net/net-permissions';
import { ThemeService } from '@app/core/theme/theme.service';
import { SignInDialogComponent } from '@app/shared/auth/sign-in.dialog';
import { HostDialogComponent } from '@app/shared/netplay/host.dialog';
import { JoinDialogComponent } from '@app/shared/netplay/join.dialog';
import { type Game, type NetHostOptions } from '@naucto/engine';
import {
  ButtonDirective,
  DialogService,
  IconComponent,
  PopoverDirective,
  PopoverPanelComponent,
} from '@naucto/ui';

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
  ],
  providers: [
    {
      // Reuse the runtime an ancestor already provides — the editor shell owns one so its CODE and
      // GAME tabs read the same engine the console column mounts. Standalone hosts (the play page)
      // have no ancestor and get their own.
      provide: RuntimeHostService,
      useFactory: (parent: RuntimeHostService | null): RuntimeHostService =>
        parent ?? new RuntimeHostService(),
      deps: [[new Optional(), new SkipSelf(), RuntimeHostService]],
    },
    // Each screen keeps its own netplay bridge: the editor's test rig is a second, separate client.
    NetUiBridgeService,
  ],
  template: `
    <div
      #frame
      class="game-frame relative"
      [class.mx-auto]="!overlay()"
      [class.max-w-[1600px]]="!overlay()"
    >
      <div
        class="relative mx-auto flex max-w-[1600px] items-center justify-center overflow-hidden bg-black"
        [class.rounded-t-sm]="!overlay() && !compact()"
        [class.border]="!overlay() && !compact()"
        [class.border-line]="!overlay() && !compact()"
        [class.rounded-b-sm]="!transport() && !overlay() && !compact()"
        [class.aspect-video]="fit() === 'width'"
      >
        <canvas
          #canvas
          tabindex="0"
          role="application"
          aria-label="Game screen. Click to focus, then use the keyboard or a gamepad."
          class="pixelated block touch-none outline-none"
          [style.width]="isFullscreen() ? null : fit() === 'width' ? '100%' : null"
          [style.imageRendering]="'pixelated'"
        ></canvas>
        @if (fpsVisible()) {
          <span
            class="absolute top-1.5 left-1.5 rounded-xs border border-line-strong bg-page/80 px-1 py-0.5 font-mono text-[10px] text-jade-ink"
          >
            {{ host.fps() }} FPS
            @if (showCpu()) {
              · {{ host.cpu() }}% CPU
            }
          </span>
        }
        @if (host.state() === 'idle') {
          <button
            type="button"
            class="absolute inset-0 flex items-center justify-center bg-page/60 text-ink hover:text-gold-ink"
            (click)="play()"
            aria-label="Play"
          >
            <nc-icon name="play" [size]="48" />
          </button>
        }
        <span class="scanlines pointer-events-none absolute inset-0"></span>
        @if (showPad()) {
          <nc-virtual-pad #padOverlay [overlay]="true" class="hidden landscape:block" />
        }
      </div>
      @if (showPad()) {
        <nc-virtual-pad #padZone class="block landscape:hidden" />
      }
      @if (transport()) {
        <!-- Over the picture rather than under it when the screen is a floating card: the design
           draws the controls on a scrim across the bottom of the game, not welded to a band. -->
        <div [class]="transportClass()">
          <span
            class="flex items-center"
            [class]="compact() ? 'gap-px' : 'gap-0.5 rounded-sm border border-line bg-inset p-0.5'"
          >
            @if (host.state() === 'running') {
              <button
                ncButton
                variant="ghost"
                size="sm"
                iconOnly
                aria-label="Pause"
                (click)="host.pause()"
              >
                <nc-icon name="pause" [size]="12" />
              </button>
            } @else {
              <!-- The colour is on the glyph, not behind it. A filled hot button is how the
                   design draws a primary action like the hub's PLAY; inside a transport it draws a
                   bare pink triangle among neutral ones, and a solid pink square there reads as a
                   record button. -->
              <button
                ncButton
                variant="ghost"
                size="sm"
                iconOnly
                aria-label="Play"
                (click)="host.state() === 'paused' ? resume() : play()"
              >
                <nc-icon name="play" [size]="12" class="text-hot-ink" />
              </button>
            }
            <button
              ncButton
              variant="ghost"
              size="sm"
              iconOnly
              aria-label="Restart"
              (click)="host.restart()"
            >
              <nc-icon name="reload" [size]="12" />
            </button>
            @if (debug() && host.state() === 'paused') {
              <button
                ncButton
                variant="ghost"
                size="sm"
                iconOnly
                aria-label="Step one frame"
                (click)="host.step()"
              >
                <nc-icon name="next" [size]="12" />
              </button>
            }
          </span>
          <!-- The column already says 320×180 in its own header; repeating it here is what made the
             420px transport wrap onto four lines and collide with the buttons. -->
          @if (!compact()) {
            <span class="ml-1 hidden font-mono text-label whitespace-nowrap text-ink-4 md:inline">
              320×180 · {{ fit() === 'width' ? 'FIT TO WIDTH' : 'INTEGER SCALE' }}
            </span>
          }
          <!-- The switch belongs to the left half: the strip reads as what the game runs on, then
               who is running it, and the break goes between those two. Sitting before the switch,
               the spacer put the break inside the first half and left the switch adrift beside the
               player markers. -->
          <ng-content select="[transport-extra]" />
          <span class="flex-1"></span>
          <!-- Who is on the game, and on what: the design keeps this in the bar, not behind a popover. -->
          @for (p of players(); track p.slot) {
            <span
              class="flex items-center gap-0.5 font-mono text-label whitespace-nowrap"
              [class]="p.here ? 'text-ink-3' : 'text-ink-4'"
            >
              <nc-icon [name]="p.pad ? 'gamepad' : 'keyboard'" [size]="12" />
              P{{ p.slot }}
            </span>
          }
          <!-- Last, where the design puts it. Wedged between the switch and the player markers it
               split the people from their own labels and read as a stray glyph among captioned ones:
               every other item in that half of the strip says what it is. -->
          <button
            ncButton
            variant="ghost"
            size="sm"
            [ncPopover]="pads"
            popoverAlign="end"
            (popoverOpenChange)="refreshPads()"
            aria-label="Gamepads"
            iconOnly
          >
            <nc-icon name="gamepad" [size]="12" />
          </button>
          <ng-template #pads>
            <nc-popover-panel title="Gamepads" class="w-[280px]">
              <div class="p-1.5">
                @for (p of padList(); track p.index) {
                  <div class="flex items-center gap-1 py-0.5">
                    <span class="min-w-0 flex-1 truncate text-meta text-ink">{{ p.id }}</span>
                    @for (slot of [0, 1, 2, 3]; track slot) {
                      <button
                        type="button"
                        class="label rounded-xs border px-0.5"
                        [class]="
                          p.player === slot
                            ? 'border-gold text-gold-ink'
                            : 'border-line text-ink-3 hover:text-ink'
                        "
                        (click)="assign(p.index, slot)"
                      >
                        P{{ slot + 1 }}
                      </button>
                    }
                  </div>
                } @empty {
                  <p class="text-meta text-ink-3">No gamepad connected. Press any button on one.</p>
                }
              </div>
            </nc-popover-panel>
          </ng-template>
          <button
            ncButton
            variant="ghost"
            size="sm"
            iconOnly
            aria-label="Fullscreen"
            (click)="fullscreen()"
          >
            <nc-icon name="fullscreen" [size]="12" />
          </button>
        </div>
      }
    </div>
  `,
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
    /* Given no width of its own, this centred flex child measured itself on the canvas — whose own
       width was a percentage of it — and the picture came out at the size the canvas happened to
       be intrinsically. It takes the surface, and the canvas is fitted inside it at its own
       proportions rather than stretched to a width. */
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
  /** The editor column's transport: a 36px band, no frame around the buttons, nothing repeated
   *  from the header above it. The public game page keeps the full one. */
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
   * Test rig: when the mounted game calls `net.join()`, join this session straight away instead of
   * asking the player which one. `editorTest` tells the backend the extra client is the author's
   * own second window, so it does not count against the project's player quota.
   */
  readonly autoJoin = input<{ uuid: string; code: string | null } | null>(null);
  /**
   * On-screen pad. Defaults to "when there is no fine pointer": a phone or a tablet gets one, a
   * laptop with a touchscreen does not, because it also has a keyboard.
   */
  readonly pad = input<boolean | null>(null);
  readonly mounted = output();
  /** True while this screen — not some other one on the page — owns the fullscreen element. */
  protected readonly isFullscreen = signal(false);
  /** The band under the screen, or the scrim across it. */
  protected readonly transportClass = computed(() => {
    if (this.overlay() || this.isFullscreen())
      return (
        // Centred on one median with one gap. Bottom-aligned on a 1px gap, the strip's spacing came
        // from whatever padding each child happened to carry — a button's, the switch's, a label
        // pair's — so no two neighbours sat the same distance apart, and a 16px switch, a 12px glyph
        // and a line of text ended up on three different baselines.
        'absolute inset-x-0 bottom-0 flex h-[36px] items-center gap-0.75 px-1.25 ' +
        'bg-[image:var(--nc-scrim-video)]'
      );
    const shape = this.compact()
      ? 'h-[36px] gap-1.5 border-y border-line px-1.75'
      : 'h-[44px] gap-1 rounded-b-sm border border-t-0 border-line px-1';
    return `mx-auto -mt-px flex max-w-[1600px] items-center bg-panel ${shape}`;
  });
  protected readonly host = inject(RuntimeHostService);
  protected readonly bridge = inject(NetUiBridgeService);
  private readonly dialogs = inject(DialogService);
  private readonly auth = inject(AuthStore);
  private readonly theme = inject(ThemeService);
  protected readonly showCpu = computed(() => this.debug());
  /**
   * A frame counter reading `0 FPS` over a black screen was the only thing a game that had not
   * started yet said about itself, which read as a broken game rather than a waiting one. Nothing
   * to count until it runs; the play overlay carries the state instead.
   */
  protected readonly fpsVisible = computed(
    () => this.showFps() && this.theme.showFps() && this.host.state() !== 'idle',
  );
  /**
   * The player slots, occupied or not.
   *
   * Two are always drawn, because the strip's job is to say how many seats there are as much as who
   * is in them: with only the taken ones listed, a game nobody has joined shows a lone `P1` and
   * reads as single-player. The empty seat is drawn in the dimmer ink and takes the pad glyph — a
   * second player arrives on a controller, the keyboard being already spoken for.
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
  protected readonly showPad = computed(() => this.pad() ?? coarsePointer());
  protected readonly padList = signal<{ index: number; id: string; player: number }[]>([]);

  constructor() {
    // Also fires when the viewer leaves fullscreen by Escape or the browser's own control, which
    // no click handler would see.
    const onFullscreenChange = (): void => {
      const mine = document.fullscreenElement === this.frame().nativeElement;
      this.isFullscreen.set(mine);
      // The click that asked for fullscreen left the keyboard on the button it came from, so a
      // player who filled the screen and then pressed an arrow moved nothing.
      if (mine) this.focus();
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    });

    effect(() => {
      const game = this.game();
      const canvas = this.canvas().nativeElement;
      if (!game) return;
      this.bridge.permissions.set(netPermissionsOf(game));
      this.host.mount(canvas, game, { netUi: this.bridge, netPermissions: netPermissionsOf(game) });
      this.mounted.emit();
      if (this.autoPlay()) this.host.play();
    });
    // Both layouts are in the DOM at once (CSS picks one), so both are attached: TouchSource
    // hit-tests, and the hidden one can never be hit.
    effect((onCleanup) => {
      if (!this.game() || !this.showPad()) return;
      const roots = [this.padZone()?.element, this.padOverlay()?.element].filter(
        (e): e is HTMLElement => !!e,
      );
      const detach = roots.map((r) => this.host.attachPad(r));
      onCleanup(() => {
        for (const d of detach) d();
      });
    });
    // net.host() / net.join() from the game open the matching dialog.
    effect(() => {
      const req = this.bridge.request();
      if (!req) return;
      untracked(() => {
        const projectId = this.projectId();
        if (projectId === null) {
          this.bridge.cancel();
          return;
        }
        // Hosting and joining both need an account, and the server says so with a 401 the
        // anonymous path cannot even retry -- there is no token to refresh. Asking here, over the
        // game, keeps the runtime and the document alive; sending the reader to /sign-in would
        // tear down the very session they were opening.
        if (!this.auth.isAuthenticated()) {
          this.dialogs
            .open<SignInDialogComponent, undefined, boolean>(SignInDialogComponent, {
              width: '436px',
            })
            .closed.subscribe((signedIn) => {
              if (signedIn) this.openNetDialog(req.kind, projectId, req.hostOptions);
              else this.bridge.cancel();
            });
          return;
        }
        const target = this.autoJoin();
        if (target && req.kind === 'join') {
          void this.bridge.joinSession(target.uuid, target.code ?? undefined, true).catch(() => {
            this.bridge.cancel();
          });
          return;
        }
        this.openNetDialog(req.kind, projectId, req.hostOptions);
      });
    });
  }

  /** Opened either straight away or once the reader has signed in, which is why it has a name. */
  private openNetDialog(
    kind: 'host' | 'join',
    projectId: number,
    hostOptions: NetHostOptions | undefined,
  ): void {
    const ref =
      kind === 'host'
        ? this.dialogs.open(HostDialogComponent, {
            width: '400px',
            data: { bridge: this.bridge, projectId, options: hostOptions ?? { maxPlayers: 2 } },
          })
        : this.dialogs.open(JoinDialogComponent, {
            width: '400px',
            data: { bridge: this.bridge, projectId },
          });
    ref.closed.subscribe((ok) => {
      if (!ok) this.bridge.cancel();
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
   * Starting the game hands it the keyboard. The canvas is what listens, so without this a player
   * pressed PLAY and then pressed arrow keys at whatever the browser had focused — the button they
   * had just clicked — and the game did not move.
   */
  play(): void {
    this.host.play();
    this.focus();
  }

  resume(): void {
    this.host.resume();
    this.focus();
  }

  /**
   * The frame, not the canvas. Fullscreening the canvas alone left every control behind in the
   * document, so the game filled the screen with no transport, no exit and nothing on hover — the
   * only way back out was the browser's own Escape, which nothing on screen mentioned.
   *
   * A page may hold several of these, and this button speaks for the one it is in: what the
   * document has fullscreen is not necessarily this screen.
   */
  protected fullscreen(): void {
    const frame = this.frame().nativeElement;
    if (document.fullscreenElement === frame) void document.exitFullscreen();
    else void frame.requestFullscreen();
  }
}

/** No fine pointer means a touch device — the pad is the only way to play. */
function coarsePointer(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}
