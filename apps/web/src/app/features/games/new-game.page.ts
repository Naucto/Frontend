import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { unwrap } from '@app/core/api/api-errors';
import { projectControllerCreate } from '@naucto/api-client';
import { LcdComponent } from '@naucto/ui';
import { QueryClient } from '@tanstack/angular-query-experimental';

/** /games/new — creates a draft and jumps into the editor. */
@Component({
  selector: 'nc-new-game-page',
  imports: [LcdComponent],
  template: `
    <nc-lcd class="mx-auto mt-6 w-[320px]">> creating a new game…</nc-lcd>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewGamePage implements OnInit {
  private readonly router = inject(Router);
  private readonly qc = inject(QueryClient);

  ngOnInit(): void {
    void this.create();
  }

  private async create(): Promise<void> {
    // A tutorial's "copy to new game" leaves its title here; the editor picks up the code.
    const name = sessionStorage.getItem('naucto.seed-name') ?? 'Untitled game';
    sessionStorage.removeItem('naucto.seed-name');
    const project = unwrap(await projectControllerCreate({ body: { name, shortDesc: '' } }));
    await this.qc.invalidateQueries({ queryKey: ['projects'] });
    await this.router.navigate(['/edit', project.id], { replaceUrl: true });
  }
}
