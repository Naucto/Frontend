import { Component, signal } from '@angular/core';
import { fireEvent, render, screen } from '@testing-library/angular';

import { MediaActionDirective } from './media-action.directive';
import { MediaFrameComponent } from './media-frame.component';

@Component({
  imports: [MediaFrameComponent, MediaActionDirective],
  template: `
    <nc-media-frame
      [src]="src()"
      alt="Cover"
      emptyLabel="No cover yet"
      [dropImages]="droppable()"
      (imageDrop)="dropped.set($event)">
      <button type="button" ncMediaAction actions>Upload</button>
    </nc-media-frame>
  `,
})
class HostComponent {
  readonly src = signal<string | null>(null);
  readonly droppable = signal(true);
  readonly dropped = signal<File | null>(null);
}

const drop = (files: File[]): void => {
  fireEvent.drop(document.querySelector('nc-media-frame')!, {
    dataTransfer: { files },
  });
};

describe('MediaFrameComponent', () => {
  it('shows its empty state until it has a picture, and its actions either way', async () => {
    const { fixture } = await render(HostComponent);
    expect(screen.getByText('No cover yet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeTruthy();

    fixture.componentInstance.src.set('data:image/png;base64,');
    await fixture.whenStable();
    expect(screen.getByRole('img', { name: 'Cover' })).toBeTruthy();
    expect(screen.queryByText('No cover yet')).toBeNull();
  });

  it('hands over the first image dropped on it, and nothing else', async () => {
    const { fixture } = await render(HostComponent);
    const text = new File(['hi'], 'notes.txt', { type: 'text/plain' });
    const image = new File(['png'], 'shot.png', { type: 'image/png' });

    drop([text]);
    expect(fixture.componentInstance.dropped()).toBeNull();
    drop([text, image]);
    expect(fixture.componentInstance.dropped()).toBe(image);
  });

  it('takes no drop unless asked to', async () => {
    const { fixture } = await render(HostComponent);
    fixture.componentInstance.droppable.set(false);
    await fixture.whenStable();
    drop([new File(['png'], 'shot.png', { type: 'image/png' })]);
    expect(fixture.componentInstance.dropped()).toBeNull();
  });
});
