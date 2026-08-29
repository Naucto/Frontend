import type { ElementRef } from '@angular/core';
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
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
import { NetUiBridgeService } from '@app/core/net/net-bridge.service';
import { netPermissionsOf } from '@app/core/net/net-permissions';
import { HostDialogComponent } from '@app/shared/netplay/host.dialog';
import { JoinDialogComponent } from '@app/shared/netplay/join.dialog';
import type { Game } from '@naucto/engine';
import {
  ButtonDirective,
  DialogService,
  IconComponent,
  PopoverDirective,
  PopoverPanelComponent,
} from '@naucto/ui';

import { RuntimeHostService } from './runtime-host.service';

/**
 * The 320×180 screen with its transport. Scales to the container with integer
 * multiples when `fit` is 'integer', or to the full width when 'width'.
 */
@Component({
  selector: 'nc-game-screen',
  imports: [ButtonDirective, IconComponent, PopoverDirective, PopoverPanelComponent],
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
      class="relative mx-auto flex max-w-[1600px] items-center justify-center overflow-hidden rounded-t-sm border border-line bg-black"
      [class.rounded-b-sm]="!transport()"
      [class.aspect-video]="fit() === 'width'"
    >
      <canvas
        #canvas
        tabindex="0"
        role="application"
        aria-label="Game screen. Click to focus, then use the keyboard or a gamepad."
        class="pixelated block touch-none outline-none"
        [style.width]="fit() === 'width' ? '100%' : null"
        [style.imageRendering]="'pixelated'"
      ></canvas>
      <span class="scanlines pointer-events-none absolute inset-0"></span>
      @if (showFps()) {
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
          (click)="host.play()"
          aria-label="Play"
        >
          <nc-icon name="play" [size]="48" />
        </button>
      }
    </div>
    @if (transport()) {
      <div
        class="mx-auto -mt-px flex max-w-[1600px] items-center bg-panel"
        [class]="
          compact()
            ? 'h-[36px] gap-1.5 border-y border-line px-1.75'
            : 'h-[44px] gap-1 rounded-b-sm border border-t-0 border-line px-1'
        "
      >
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
            <button
              ncButton
              variant="run"
              size="sm"
              iconOnly
              aria-label="Play"
              (click)="host.state() === 'paused' ? host.resume() : host.play()"
            >
              <nc-icon name="play" [size]="12" />
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
        <span class="flex-1"></span>
        <!-- Who is on the game, and on what: the design keeps this in the bar, not behind a popover. -->
        @for (p of players(); track p.slot) {
          <span class="flex items-center gap-0.5 font-mono text-label whitespace-nowrap text-ink-3">
            <nc-icon [name]="p.pad ? 'gamepad' : 'keyboard'" [size]="12" />
            P{{ p.slot }}
          </span>
        }
        <ng-content select="[transport-extra]" />
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
          <nc-icon name="expand" [size]="12" />
        </button>
      </div>
    }
  `,
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameScreenComponent {
  readonly game = input.required<Game | null>();
  readonly fit = input<'width' | 'integer'>('width');
  readonly transport = input(true);
  /** The editor column's transport: a 36px band, no frame around the buttons, nothing repeated
   *  from the header above it. The public game page keeps the full one. */
  readonly compact = input(false, { transform: booleanAttribute });
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
  readonly mounted = output();
  protected readonly host = inject(RuntimeHostService);
  protected readonly bridge = inject(NetUiBridgeService);
  private readonly dialogs = inject(DialogService);
  protected readonly showCpu = computed(() => this.debug());
  /** Occupied player slots: the local keyboard, then one per connected pad. */
  protected readonly players = computed(() => {
    const pads = this.host.gamepadCount();
    return [
      { slot: 1, pad: pads > 0 },
      ...Array.from({ length: Math.max(0, pads - 1) }, (_, i) => ({ slot: i + 2, pad: true })),
    ];
  });
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  protected readonly padList = signal<{ index: number; id: string; player: number }[]>([]);

  constructor() {
    effect(() => {
      const game = this.game();
      const canvas = this.canvas().nativeElement;
      if (!game) return;
      this.bridge.permissions.set(netPermissionsOf(game));
      this.host.mount(canvas, game, { netUi: this.bridge, netPermissions: netPermissionsOf(game) });
      this.mounted.emit();
      if (this.autoPlay()) this.host.play();
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
        const target = this.autoJoin();
        if (target && req.kind === 'join') {
          void this.bridge.joinSession(target.uuid, target.code ?? undefined, true).catch(() => {
            this.bridge.cancel();
          });
          return;
        }
        const ref =
          req.kind === 'host'
            ? this.dialogs.open(HostDialogComponent, {
                data: {
                  bridge: this.bridge,
                  projectId,
                  options: req.hostOptions ?? { maxPlayers: 2 },
                },
              })
            : this.dialogs.open(JoinDialogComponent, { data: { bridge: this.bridge, projectId } });
        ref.closed.subscribe((ok) => {
          if (!ok) this.bridge.cancel();
        });
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

  protected fullscreen(): void {
    void this.canvas().nativeElement.requestFullscreen();
  }
}
