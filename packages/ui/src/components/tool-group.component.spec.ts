import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { ToolGroupComponent, type ToolItem } from './tool-group.component';

const items: ToolItem[] = [
  { value: 'pen', icon: 'edit', label: 'Pen' },
  { value: 'fill', icon: 'paint-bucket', label: 'Fill' },
  { value: 'pick', icon: 'drop', label: 'Pick' },
];

describe('ToolGroupComponent', () => {
  it('takes the tool pressed', async () => {
    const { fixture } = await render(ToolGroupComponent, { inputs: { items, value: 'pen' } });

    await userEvent.click(screen.getByRole('radio', { name: 'Fill' }));

    expect(fixture.componentInstance.value()).toBe('fill');
  });

  it('takes no tool when disabled', async () => {
    const { fixture } = await render(ToolGroupComponent, {
      inputs: { items, value: 'pen', disabled: true },
    });

    await userEvent.click(screen.getByRole('radio', { name: 'Fill' }));

    expect(fixture.componentInstance.value()).toBe('pen');
    for (const tool of screen.getAllByRole('radio')) {
      expect(tool).toBeDisabled();
    }
  });

  it('closes one tool and leaves the others, and the arrow keys step over it', async () => {
    const { fixture } = await render(ToolGroupComponent, {
      inputs: {
        items: items.map((item) => ({ ...item, disabled: item.value === 'fill' })),
        value: 'pen',
      },
    });

    expect(screen.getByRole('radio', { name: 'Fill' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Pick' })).toBeEnabled();

    screen.getByRole('radio', { name: 'Pen' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(fixture.componentInstance.value()).toBe('pick');
    await userEvent.keyboard('{ArrowRight}');
    expect(fixture.componentInstance.value()).toBe('pen');
    await userEvent.keyboard('{ArrowLeft}');
    expect(fixture.componentInstance.value()).toBe('pick');
  });
});
