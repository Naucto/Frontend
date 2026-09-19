import { ChangeDetectionStrategy, Component, inject, type OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { unwrap } from '@app/core/api/api-errors';
import { TranslocoDirective } from '@jsverse/transloco';
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
  protected readonly error = signal<string | null>(null);
  private name = 'Untitled game';

  ngOnInit(): void {
    // A tutorial's "copy to new game" leaves its title here; the editor picks up the code. Read
    // once, so a retry after a failed request still creates the game the tutorial named.
    this.name = sessionStorage.getItem('naucto.seed-name') ?? this.name;
    sessionStorage.removeItem('naucto.seed-name');
    void this.create();
  }

  protected async create(): Promise<void> {
    this.error.set(null);
    try {
      const project = unwrap(
        await projectControllerCreate({ body: { name: this.name, shortDesc: '' } }),
      );
      await this.qc.invalidateQueries({ queryKey: ['projects'] });
      await this.router.navigate(['/edit', project.id], { replaceUrl: true });
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not create the game');
    }
  }
}
