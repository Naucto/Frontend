import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { TagInputComponent } from './tag-input.component';

describe('TagInputComponent', () => {
  it('adds on enter, dedupes, caps at max', async () => {
    const { fixture } = await render(TagInputComponent, { inputs: { tags: ['action'], max: 2 } });
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'Action{Enter}');
    expect(fixture.componentInstance.tags()).toEqual(['action']);
    await userEvent.type(input, 'puzzle,');
    expect(fixture.componentInstance.tags()).toEqual(['action', 'puzzle']);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('removes the last tag on backspace when empty', async () => {
    const { fixture } = await render(TagInputComponent, { inputs: { tags: ['a', 'b'] } });
    await userEvent.type(screen.getByRole('textbox'), '{Backspace}');
    expect(fixture.componentInstance.tags()).toEqual(['a']);
  });

  it('takes no tag and offers none to remove when disabled, in the frame of a disabled well', async () => {
    const { fixture } = await render(TagInputComponent, {
      inputs: { tags: ['a', 'b'], disabled: true },
    });
    const field = screen.getByRole('textbox');

    expect(field).toBeDisabled();
    expect(screen.queryByRole('button')).toBeNull();
    expect(field.parentElement).toHaveClass('bevel-edge-line', 'bevel-fill-transparent');
    expect(fixture.componentInstance.tags()).toEqual(['a', 'b']);
  });
});
