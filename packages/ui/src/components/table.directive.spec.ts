import { Component } from '@angular/core';
import { render, screen, within } from '@testing-library/angular';

import { TableDirective } from './table.directive';

@Component({
  selector: 'nc-table-host',
  imports: [TableDirective],
  template: `
    <table ncTable>
      <caption>How to play</caption>
      <thead>
        <tr>
          <th scope="col">Action</th>
          <th scope="col">Keys</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">
            Jump
            <small>Hold to jump higher</small>
          </th>
          <td>Space</td>
        </tr>
        <tr>
          <th scope="row">Dash</th>
          <td>Shift</td>
        </tr>
      </tbody>
    </table>
  `,
})
class HostComponent {}

describe('TableDirective', () => {
  it('stays a native table, named by its caption, its rows named by their first cell', async () => {
    await render(HostComponent);
    const table = screen.getByRole('table', { name: 'How to play' });

    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((head) => head.textContent),
    ).toEqual(['Action', 'Keys']);
    const jump = within(table).getByRole('row', { name: /Jump/ });
    expect(within(jump).getByRole('rowheader')).toHaveTextContent('Jump Hold to jump higher');
    expect(within(jump).getByRole('cell')).toHaveTextContent('Space');
  });

  it('draws one frame and bands every other row, with no rule under any', async () => {
    await render(HostComponent);
    const table = screen.getByRole('table');

    expect(table).toHaveClass(
      'flat-sm',
      'bevel-fill-panel',
      '[&_tbody_tr:nth-child(odd)]:bg-inset',
    );
    expect(table.className).not.toMatch(/border-[btlr]|divide/);
  });
});
