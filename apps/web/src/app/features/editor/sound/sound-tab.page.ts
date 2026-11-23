import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  ButtonDirective,
  type DockLabels,
  DockPaneDirective,
  type DockWindow,
  DockWorkspaceComponent,
  IconComponent,
  isBaseLayout,
} from '@naucto/ui';

import { HostElectionService } from '../work-session/host-election.service';
import { InstrumentEditorComponent } from './editors/instrument-editor.component';
import { PatternEditorComponent } from './editors/pattern-editor.component';
import { SfxEditorComponent } from './editors/sfx-editor.component';
import { TimelineEditorComponent } from './editors/timeline-editor.component';
import { SOUND_WINDOWS, type SoundWindow } from './sound.store';
import { SoundDeck } from './sound-deck';

const ICONS = {
  timeline: 'list',
  patterns: 'grid',
  instruments: 'sliders',
  sfx: 'zap',
} as const satisfies Record<SoundWindow, DockWindow['icon']>;

/** SOUND tab: the timeline, patterns, instruments and SFX editors, each a window of its own. */
@Component({
  selector: 'nc-sound-tab-page',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    IconComponent,
    DockWorkspaceComponent,
    DockPaneDirective,
    TimelineEditorComponent,
    PatternEditorComponent,
    InstrumentEditorComponent,
    SfxEditorComponent,
  ],
  providers: [SoundDeck],
  templateUrl: './sound-tab.page.html',
  host: { class: 'flex h-full min-h-0 flex-col', '(keydown)': 'onKey($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class SoundTabPage {
  protected readonly deck = inject(SoundDeck);
  protected readonly store = this.deck.store;
  private readonly election = inject(HostElectionService);
  private readonly transloco = inject(TranslocoService);

  private readonly windowTexts = toSignal(
    this.transloco.selectTranslateObject<Record<SoundWindow, string>>('editor.sound.window'),
  );
  private readonly dockTexts = toSignal(
    this.transloco.selectTranslateObject<Record<string, string>>('editor.sound.dock'),
  );
  protected readonly windows = computed<DockWindow[]>(() =>
    SOUND_WINDOWS.map((id) => ({
      id,
      icon: ICONS[id],
      title: this.windowTexts()?.[id] ?? id,
      peers: this.deck.presence
        .peersIn('sound', id)
        .map((peer) => ({ id: peer.clientId, name: peer.name, colour: peer.colour })),
    })),
  );
  protected readonly labels = computed<DockLabels>(() => {
    const texts = this.dockTexts() ?? {};
    const text = (key: string, title = ''): string =>
      (texts[key] ?? key).replace('{{title}}', title);
    return {
      popOut: (title) => text('popOut', title),
      dock: (title) => text('dock', title),
      addTab: text('addTab'),
      resize: text('resize'),
      fallback: text('fallback'),
      reset: text('reset'),
      empty: text('empty'),
      openHere: text('openHere'),
      floating: text('floating'),
      elsewhere: text('elsewhere'),
      drop: {
        left: text('dropLeft'),
        right: text('dropRight'),
        top: text('dropTop'),
        bottom: text('dropBottom'),
        tab: text('dropTab'),
        'edge-left': text('edgeLeft'),
        'edge-right': text('edgeRight'),
        'edge-top': text('edgeTop'),
        'edge-bottom': text('edgeBottom'),
      },
    };
  });
  private readonly openItem = computed(() => {
    switch (this.store.focus()) {
      case 'timeline':
        return `song:${String(this.store.songSlot())}`;
      case 'patterns':
        return `pattern:${String(this.store.patternSlot())}`;
      case 'instruments': {
        const id = this.deck.instrument()?.id;
        return id ? `instrument:${id}` : undefined;
      }
      case 'sfx':
        return `sfx:${String(this.store.sfxSlot())}`;
    }
  });
  protected readonly isBase = computed(() => isBaseLayout(this.store.layout(), SOUND_WINDOWS));

  constructor() {
    effect(() => {
      this.deck.presence.setView({ tab: 'sound', pane: this.store.focus(), item: this.openItem() });
    });
    effect(() => {
      if (this.election.isHost() && this.deck.library.patterns().size > 0) {
        untracked(() => {
          this.deck.library.reconcilePatternSlots();
        });
      }
    });
  }

  protected setActive(window: string | null): void {
    if (window && (SOUND_WINDOWS as readonly string[]).includes(window)) {
      this.store.setFocus(window as SoundWindow);
    }
  }

  protected onKey(event: KeyboardEvent): void {
    if ((event.target as HTMLElement | null)?.tagName === 'INPUT') {
      return;
    }
    this.deck.undo.onKey(event);
  }
}
