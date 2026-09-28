import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { AI_KEYS, type AiLock, type Game, readLocks } from '@naucto/engine';
import { ButtonDirective, FieldComponent, InputDirective } from '@naucto/ui';

type Kind = 'tile' | 'sprite' | 'section' | 'animation';

interface Entry {
  id: string;
  name: string;
  kind: string;
  stale: boolean;
  where: string;
}

const hex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((v) => v.toString(16).padStart(2, '0')).join('');

/** The fingerprint the backend checks: SHA-256 of palette indices (sprites) or LE u16 tiles. */
async function fingerprint(game: Game, entry: Record<string, unknown>): Promise<string | null> {
  const x = Number(entry.x),
    y = Number(entry.y),
    w = Number(entry.width),
    h = Number(entry.height);
  if (entry.kind === 'tile' || entry.kind === 'sprite') {
    const sheet = game.sheets.find((s) => s.id === entry.resourceId);
    if (!sheet || x + w > sheet.width || y + h > sheet.height) return null;
    const bytes = Uint8Array.from({ length: w * h }, (_, i) =>
      sheet.getPixel(x + (i % w), y + Math.floor(i / w)),
    );

    return hex(await crypto.subtle.digest('SHA-256', bytes));
  }
  if (entry.kind === 'section') {
    const map = game.maps.find((m) => m.id === entry.resourceId);
    if (!map || x + w > map.width || y + h > map.height) return null;
    const bytes = new Uint8Array(w * h * 2);
    for (let i = 0; i < w * h; i++) {
      const value = map.getTile(x + (i % w), y + Math.floor(i / w));
      bytes[i * 2] = value & 255;
      bytes[i * 2 + 1] = value >> 8;
    }

    return hex(await crypto.subtle.digest('SHA-256', bytes));
  }

  return null;
}

/**
 * The project's asset catalog and its locked regions, edited by people.
 *
 * What is written here is a human annotation: it names artwork so an assistant can reuse it, and
 * says nothing about who drew it. A fingerprint is recorded with each region; when the artwork
 * under it changes the entry reads as stale, and RELOCATE looks for the same pixels elsewhere on the
 * sheet, which is what a moved sprite looks like.
 */
@Component({
  selector: 'nc-asset-catalog',
  imports: [FormsModule, TranslocoDirective, ButtonDirective, FieldComponent, InputDirective],
  template: `
    <div *transloco="let t">
      <p class="text-meta text-ink-2">{{ t('ai.catalogHelp') }}</p>
      <div class="mt-1 grid grid-cols-2 gap-1">
        <nc-field [label]="t('ai.assetName')" for="ai-asset-name">
          <input ncInput id="ai-asset-name" [(ngModel)]="name" maxlength="100" />
        </nc-field>
        <nc-field [label]="t('ai.assetKind')" for="ai-asset-kind">
          <select ncInput id="ai-asset-kind" [(ngModel)]="kind">
            <option value="tile">{{ t('ai.kind.tile') }}</option>
            <option value="sprite">{{ t('ai.kind.sprite') }}</option>
            <option value="section">{{ t('ai.kind.section') }}</option>
            <option value="animation">{{ t('ai.kind.animation') }}</option>
          </select>
        </nc-field>
        @if (kind === 'animation') {
          <nc-field [label]="t('ai.frames')" for="ai-asset-frames" class="col-span-2">
            <input
              ncInput
              id="ai-asset-frames"
              [(ngModel)]="frames"
              [placeholder]="t('ai.framesHint')"
            />
          </nc-field>
          <nc-field [label]="t('ai.fps')" for="ai-asset-fps">
            <input ncInput id="ai-asset-fps" type="number" min="1" max="60" [(ngModel)]="fps" />
          </nc-field>
        } @else {
          <nc-field
            [label]="kind === 'section' ? t('ai.map') : t('ai.sheet')"
            for="ai-asset-resource"
          >
            <select ncInput id="ai-asset-resource" [(ngModel)]="resourceId">
              @if (kind === 'section') {
                @for (map of game().maps; track map.id) {
                  <option [value]="map.id">{{ map.name || map.id }}</option>
                }
              } @else {
                @for (sheet of game().sheets; track sheet.id) {
                  <option [value]="sheet.id">{{ sheet.name || sheet.id }}</option>
                }
              }
            </select>
          </nc-field>
          <nc-field [label]="t(kind === 'section' ? 'ai.tileX' : 'ai.pixelX')" for="ai-asset-x">
            <input ncInput id="ai-asset-x" type="number" min="0" [(ngModel)]="x" />
          </nc-field>
          <nc-field [label]="t(kind === 'section' ? 'ai.tileY' : 'ai.pixelY')" for="ai-asset-y">
            <input ncInput id="ai-asset-y" type="number" min="0" [(ngModel)]="y" />
          </nc-field>
          @if (kind !== 'tile') {
            <nc-field [label]="t('ai.width')" for="ai-asset-w">
              <input ncInput id="ai-asset-w" type="number" min="1" [(ngModel)]="width" />
            </nc-field>
            <nc-field [label]="t('ai.height')" for="ai-asset-h">
              <input ncInput id="ai-asset-h" type="number" min="1" [(ngModel)]="height" />
            </nc-field>
          }
          <nc-field [label]="t('ai.semantics')" for="ai-asset-semantics">
            <select ncInput id="ai-asset-semantics" [(ngModel)]="semantics">
              <option value="unconfirmed">{{ t('ai.semantic.unconfirmed') }}</option>
              <option value="walkable">{{ t('ai.semantic.walkable') }}</option>
              <option value="solid">{{ t('ai.semantic.solid') }}</option>
              <option value="hazard">{{ t('ai.semantic.hazard') }}</option>
            </select>
          </nc-field>
          <nc-field [label]="t('ai.tags')" for="ai-asset-tags">
            <input ncInput id="ai-asset-tags" [(ngModel)]="tags" [placeholder]="t('ai.tagsHint')" />
          </nc-field>
        }
      </div>
      <p class="mt-0.5 text-meta text-ink-3">{{ t('ai.catalogScope') }}</p>
      <div class="mt-1 flex flex-wrap gap-1">
        <button ncButton variant="secondary" size="sm" [disabled]="busy()" (click)="save()">
          {{ t('ai.catalogSave') }}
        </button>
        @if (kind === 'tile' || kind === 'section') {
          <button ncButton variant="ghost" size="sm" [disabled]="busy()" (click)="lock()">
            {{ t('ai.lockRegion') }}
          </button>
        }
      </div>
      @if (message()) {
        <p role="status" class="mt-0.5 text-meta">{{ message() }}</p>
      }
      <h3 class="mt-1.5 label">{{ t('ai.catalogEntries') }}</h3>
      <ul class="text-meta">
        @for (item of entries(); track item.id) {
          <li class="flex items-center gap-1 py-0.25" [attr.data-asset]="item.id">
            <span class="flex-1">
              {{ item.name }} · {{ t('ai.kind.' + item.kind) }} · {{ item.where }}
            </span>
            @if (item.stale) {
              <span class="label text-hot-ink">{{ t('ai.stale') }}</span>
              <button
                ncButton
                variant="ghost"
                size="sm"
                [disabled]="busy()"
                (click)="relocate(item.id)"
              >
                {{ t('ai.relocate') }}
              </button>
            }
            <button
              ncButton
              variant="ghost"
              size="sm"
              [disabled]="busy()"
              (click)="remove(item.id)"
            >
              {{ t('ai.remove') }}
            </button>
          </li>
        } @empty {
          <li class="text-ink-3">{{ t('ai.catalogEmpty') }}</li>
        }
      </ul>
      <h3 class="mt-1.5 label">{{ t('ai.locks') }}</h3>
      <ul class="text-meta">
        @for (lock of locks(); track lock.id) {
          <li class="flex items-center gap-1 py-0.25">
            <span class="flex-1">
              {{ lock.name }} · {{ lock.target }} {{ lock.resourceId }} ({{ lock.x }},{{ lock.y }})
              {{ lock.width }}×{{ lock.height }}
            </span>
            <button
              ncButton
              variant="ghost"
              size="sm"
              [disabled]="busy()"
              (click)="unlock(lock.id)"
            >
              {{ t('ai.unlock') }}
            </button>
          </li>
        } @empty {
          <li class="text-ink-3">{{ t('ai.locksEmpty') }}</li>
        }
      </ul>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetCatalogComponent {
  readonly game = input.required<Game>();
  private readonly i18n = inject(TranslocoService);
  protected name = '';
  protected kind: Kind = 'tile';
  protected resourceId = '0';
  protected x = 0;
  protected y = 0;
  protected width = 8;
  protected height = 8;
  protected semantics = 'unconfirmed';
  protected tags = '';
  protected frames = '';
  protected fps = 8;
  protected readonly busy = signal(false);
  protected readonly message = signal('');
  protected readonly entries = signal<Entry[]>([]);
  protected readonly locks = signal<AiLock[]>([]);

  constructor() {
    effect((onCleanup) => {
      const game = this.game();
      const catalog = game.doc.getMap<unknown>(AI_KEYS.catalog);
      const locks = game.doc.getMap<unknown>(AI_KEYS.locks);
      let pending = false;
      const refresh = (): void => {
        if (pending) return;
        pending = true;
        // Fingerprints are async; coalesce a burst of edits into one pass.
        setTimeout(() => {
          pending = false;
          void this.refresh();
        }, 150);
      };
      catalog.observe(refresh);
      locks.observe(refresh);
      game.doc.on('update', refresh);
      void this.refresh();
      onCleanup(() => {
        catalog.unobserve(refresh);
        locks.unobserve(refresh);
        game.doc.off('update', refresh);
      });
    });
  }

  private async refresh(): Promise<void> {
    const game = this.game();
    const out: Entry[] = [];
    for (const [id, raw] of game.doc.getMap<unknown>(AI_KEYS.catalog).entries()) {
      if (!raw || typeof raw !== 'object') continue;
      const entry = raw as Record<string, unknown>;
      const now = await fingerprint(game, entry);
      out.push({
        id,
        name: typeof entry.name === 'string' ? entry.name : id,
        kind: typeof entry.kind === 'string' ? entry.kind : 'sprite',
        stale: now !== null && now !== entry.contentHash,
        where:
          entry.kind === 'animation'
            ? `${String(Array.isArray(entry.frames) ? entry.frames.length : 0)} frames`
            : `${String(entry.resourceId)} (${String(entry.x)},${String(entry.y)}) ${String(entry.width)}×${String(entry.height)}`,
      });
    }
    this.entries.set(out);
    this.locks.set(readLocks(game));
  }

  private fail(key: string): never {
    throw new Error(this.i18n.translate(key));
  }

  private region(): { x: number; y: number; width: number; height: number } {
    const sprite = this.kind === 'tile' || this.kind === 'sprite';
    const width = this.kind === 'tile' ? 8 : this.width;
    const height = this.kind === 'tile' ? 8 : this.height;
    const whole = [this.x, this.y, width, height].every((v) => Number.isInteger(v) && v >= 0);
    if (!whole || width < 1 || height < 1) this.fail('ai.catalogInvalid');
    if (sprite) {
      const sheet = this.game().sheets.find((s) => s.id === this.resourceId);
      if (
        !sheet ||
        this.x % 8 ||
        this.y % 8 ||
        width % 8 ||
        height % 8 ||
        width > 64 ||
        height > 64 ||
        this.x + width > sheet.width ||
        this.y + height > sheet.height
      )
        this.fail('ai.catalogInvalid');
    } else {
      const map = this.game().maps.find((m) => m.id === this.resourceId);
      if (
        !map ||
        width > 64 ||
        height > 64 ||
        this.x + width > map.width ||
        this.y + height > map.height
      )
        this.fail('ai.catalogInvalid');
    }

    return { x: this.x, y: this.y, width, height };
  }

  private async guarded(action: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.message.set('');
    try {
      await action();
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async save(): Promise<void> {
    await this.guarded(async () => {
      const game = this.game();
      const name = this.name.trim();
      if (!name || name.length > 100) this.fail('ai.catalogInvalid');
      const catalog = game.doc.getMap<unknown>(AI_KEYS.catalog);
      let entry: Record<string, unknown>;
      if (this.kind === 'animation') {
        const frames = this.frames
          .split(',')
          .map((f) => f.trim())
          .filter(Boolean);
        const known = frames.every((id) => {
          const target = catalog.get(id) as { kind?: string } | undefined;

          return target?.kind === 'sprite' || target?.kind === 'tile';
        });
        if (!frames.length || frames.length > 64 || !known || this.fps <= 0 || this.fps > 60)
          this.fail('ai.animationInvalid');
        entry = { kind: 'animation', frames, fps: this.fps, resourceId: '', contentHash: '' };
      } else {
        const region = this.region();
        entry = { kind: this.kind, resourceId: this.resourceId, ...region };
        entry.contentHash = (await fingerprint(game, entry)) ?? this.fail('ai.catalogInvalid');
      }
      const existing = [...catalog.entries()].find(([, value]) => {
        if (!value || typeof value !== 'object') return false;
        const a = value as Record<string, unknown>;

        return this.kind !== 'animation'
          ? a.kind === this.kind &&
              a.resourceId === entry.resourceId &&
              a.x === entry.x &&
              a.y === entry.y
          : a.kind === 'animation' && a.name === name;
      });
      const id = existing?.[0] ?? crypto.randomUUID();
      const tags = this.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 30);
      game.transact(() => {
        catalog.set(id, {
          id,
          name,
          tags,
          description: '',
          semantics: this.kind === 'animation' ? 'unconfirmed' : this.semantics,
          ...entry,
        });
      });
      this.message.set(this.i18n.translate('ai.catalogSaved', { name }));
    });
  }

  protected async relocate(id: string): Promise<void> {
    await this.guarded(async () => {
      const game = this.game();
      const catalog = game.doc.getMap<unknown>(AI_KEYS.catalog);
      const entry = catalog.get(id) as Record<string, unknown> | undefined;
      if (!entry || (entry.kind !== 'tile' && entry.kind !== 'sprite'))
        this.fail('ai.relocateUnsupported');
      const sheets = game.sheets;
      const width = Number(entry.width),
        height = Number(entry.height);
      const matches: { resourceId: string; x: number; y: number }[] = [];
      for (const sheet of sheets)
        for (let y = 0; y + height <= sheet.height; y += 8)
          for (let x = 0; x + width <= sheet.width; x += 8) {
            const candidate = { ...entry, resourceId: sheet.id, x, y };
            if ((await fingerprint(game, candidate)) === entry.contentHash)
              matches.push({ resourceId: sheet.id, x, y });
            if (matches.length > 1) this.fail('ai.relocateAmbiguous');
          }
      const found = matches[0];
      if (!found) this.fail('ai.relocateMissing');
      game.transact(() => {
        catalog.set(id, { ...entry, ...found });
      });
      this.message.set(this.i18n.translate('ai.relocated'));
    });
  }

  protected async remove(id: string): Promise<void> {
    await this.guarded(async () => {
      const catalog = this.game().doc.getMap<unknown>(AI_KEYS.catalog);
      this.game().transact(() => {
        catalog.delete(id);
      });
      await Promise.resolve();
    });
  }

  protected async lock(): Promise<void> {
    await this.guarded(async () => {
      const region = this.region();
      const name = this.name.trim() || this.i18n.translate('ai.lockedRegion');
      const locks = this.game().doc.getMap<unknown>(AI_KEYS.locks);
      const id = crypto.randomUUID();
      this.game().transact(() => {
        locks.set(id, {
          id,
          name,
          target: this.kind === 'section' ? 'map' : 'sheet',
          resourceId: this.resourceId,
          ...region,
        });
      });
      await Promise.resolve();
    });
  }

  protected async unlock(id: string): Promise<void> {
    await this.guarded(async () => {
      const locks = this.game().doc.getMap<unknown>(AI_KEYS.locks);
      this.game().transact(() => {
        locks.delete(id);
      });
      await Promise.resolve();
    });
  }
}
