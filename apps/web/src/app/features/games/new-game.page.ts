import { ChangeDetectionStrategy, Component, inject, type OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { projectControllerCreate } from '@naucto/api-client';
import { ErrorStateComponent, LcdComponent } from '@naucto/ui';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { unwrap } from '../../core/api/api-errors';
import { type GameSeed, SEED_KEY } from '../../shared/docs/seed-new-game';
import { qk } from '../../shared/queries/query-keys';

/** /games/new — creates a draft and jumps into the editor. */
@Component({
  selector: 'nc-new-game-page',
  imports: [LcdComponent, ErrorStateComponent, TranslocoDirective],
  templateUrl: './new-game.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class NewGamePage implements OnInit {
  private readonly router = inject(Router);
  private readonly qc = inject(QueryClient);
  private readonly transloco = inject(TranslocoService);
  protected readonly error = signal<string | null>(null);
  private seed: string | null = null;

  ngOnInit(): void {
    // Taken once, so a retry after a failed request still creates the game the tutorial named.
    this.seed = sessionStorage.getItem(SEED_KEY);
    sessionStorage.removeItem(SEED_KEY);
    void this.create();
  }

  protected async create(): Promise<void> {
    this.error.set(null);
    try {
      // Selected, not translated: on a cold load this runs before the catalogue is in, and
      // `translate` would answer the key.
      const name = this.seed
        ? (JSON.parse(this.seed) as GameSeed).name
        : await firstValueFrom(
            this.transloco.selectTranslate<string>('editor.game.namePlaceholder'),
          );
      const project = unwrap(await projectControllerCreate({ body: { name, shortDesc: '' } }));
      if (this.seed) {
        sessionStorage.setItem(`${SEED_KEY}.${String(project.id)}`, this.seed);
      }
      await this.qc.invalidateQueries({ queryKey: qk.projectsAll() });
      await this.router.navigate(['/edit', project.id], { replaceUrl: true });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not create the game');
    }
  }
}
