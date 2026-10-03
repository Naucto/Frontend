import { ChangeDetectionStrategy, Component, inject, type OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { unwrap } from '@app/core/api/api-errors';
import { type GameSeed, SEED_KEY } from '@app/shared/docs/seed-new-game';
import { qk } from '@app/shared/queries/query-keys';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { projectControllerCreate } from '@naucto/api-client';
import { ErrorStateComponent, LcdComponent } from '@naucto/ui';
import { QueryClient } from '@tanstack/angular-query-experimental';

/** /games/new — creates a draft and jumps into the editor. */
@Component({
  selector: 'nc-new-game-page',
  imports: [LcdComponent, ErrorStateComponent, TranslocoDirective],
  template: `
    <ng-container *transloco="let t">
      @if (error(); as message) {
        <div class="flex items-center justify-center p-6">
          <nc-error-state
            [title]="t('games.createFailed')"
            [hint]="message"
            [retryLabel]="t('game.retry')"
            (retry)="create()"
          />
        </div>
      } @else {
        <nc-lcd class="mx-auto mt-6 w-[320px]">> creating a new game…</nc-lcd>
      }
    </ng-container>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewGamePage implements OnInit {
  private readonly router = inject(Router);
  private readonly qc = inject(QueryClient);
  private readonly transloco = inject(TranslocoService);
  protected readonly error = signal<string | null>(null);
  private name = this.transloco.translate('editor.game.namePlaceholder');

  private seed: string | null = null;

  ngOnInit(): void {
    // Taken once, so a retry after a failed request still creates the game the tutorial named.
    this.seed = sessionStorage.getItem(SEED_KEY);
    sessionStorage.removeItem(SEED_KEY);
    if (this.seed) this.name = (JSON.parse(this.seed) as GameSeed).name;
    void this.create();
  }

  protected async create(): Promise<void> {
    this.error.set(null);
    try {
      const project = unwrap(
        await projectControllerCreate({ body: { name: this.name, shortDesc: '' } }),
      );
      if (this.seed) sessionStorage.setItem(`${SEED_KEY}.${String(project.id)}`, this.seed);
      await this.qc.invalidateQueries({ queryKey: qk.projectsAll() });
      await this.router.navigate(['/edit', project.id], { replaceUrl: true });
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not create the game');
    }
  }
}
