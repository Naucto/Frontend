import { Component } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { TooltipDirective, tooltipParagraphs } from './tooltip.directive';

@Component({
  selector: 'nc-tooltip-host',
  imports: [TooltipDirective],
  template: `
    <button type="button" ncTooltip="Kick this player" [tooltipDelay]="10">Kick</button>
  `,
})
class HostComponent {}

/** The overlay lives outside the fixture, so ask the document rather than the container. */
const panelCount = (): number => document.querySelectorAll('.cdk-overlay-pane').length;

/** Long enough for a 10 ms tooltip to have opened, short enough to keep the suite quick. */
const pastTheDelay = (): Promise<void> => new Promise((r) => setTimeout(r, 40));

describe('TooltipDirective', () => {
  it('opens after the delay and closes on mouseleave', async () => {
    await render(HostComponent);
    const trigger = screen.getByRole('button', { name: 'Kick' });

    await userEvent.hover(trigger);
    expect(panelCount()).toBe(0);

    await pastTheDelay();
    expect(panelCount()).toBe(1);

    await userEvent.unhover(trigger);
    expect(panelCount()).toBe(0);
  });

  /**
   * The defect this pins: a pointer landing on the host fires mouseenter and then focus, and each
   * armed its own timer. The second overwrote the handle of the first, so tearing the host down
   * cleared only one of the two — and the survivor attached a panel that outlived its anchor and
   * sat in the corner of every screen after it.
   */
  it('leaves nothing behind when the host is destroyed between hover and open', async () => {
    const { fixture } = await render(HostComponent);
    const trigger = screen.getByRole('button', { name: 'Kick' });

    await userEvent.hover(trigger);
    trigger.focus();

    fixture.destroy();
    await pastTheDelay();

    expect(panelCount()).toBe(0);
  });

  it('opens once when hover and focus land together', async () => {
    await render(HostComponent);
    const trigger = screen.getByRole('button', { name: 'Kick' });

    await userEvent.hover(trigger);
    trigger.focus();
    await pastTheDelay();

    expect(panelCount()).toBe(1);
  });
});

@Component({
  selector: 'nc-help-tooltip-host',
  imports: [TooltipDirective],
  template: `
    <button
      type="button"
      ncTooltip="Slots your game plays with \`sound.play_sfx(slot)\`.

Click one to fill it."
      tooltipTitle="SFX slots"
      [tooltipDelay]="10"
    >
      Help
    </button>
  `,
})
class HelpHostComponent {}

describe('TooltipPanelComponent', () => {
  it('sets a titled text as paragraphs with its identifiers in code', async () => {
    await render(HelpHostComponent);
    await userEvent.hover(screen.getByRole('button', { name: 'Help' }));
    await pastTheDelay();

    const panel = screen.getByRole('tooltip');
    expect(panel).toHaveTextContent('SFX slots');
    expect(panel.querySelectorAll('p')).toHaveLength(2);
    expect(panel.querySelector('code')).toHaveTextContent('sound.play_sfx(slot)');
    // The heading rules the whole width: it is beside the body, not inside its padding.
    const heading = panel.firstElementChild;
    expect(heading).toHaveTextContent('SFX slots');
    expect(heading?.querySelector('p')).toBeNull();
  });
});

describe('tooltipParagraphs', () => {
  it('keeps a plain line as one paragraph of one run', () => {
    expect(tooltipParagraphs('Kick this player')).toEqual([
      [{ code: false, text: 'Kick this player' }],
    ]);
  });

  it('splits on blank lines and on backticks', () => {
    expect(tooltipParagraphs('Read `a.b`.\n\n\nThen `c`')).toEqual([
      [
        { code: false, text: 'Read ' },
        { code: true, text: 'a.b' },
        { code: false, text: '.' },
      ],
      [
        { code: false, text: 'Then ' },
        { code: true, text: 'c' },
      ],
    ]);
  });
});
