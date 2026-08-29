import { computed } from '@angular/core';
import { readJson, STORAGE_KEYS, writeJson } from '@app/core/storage/local-storage';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

export type EditorTab = 'game' | 'code' | 'art' | 'map' | 'sound' | 'net';
/**
 * The console strip's own tabs. DOC is not one of them: the docs are a panel that opens beside the
 * editor when there is room and takes the column's place when there is not, so putting them in the
 * strip made a third console rather than a reference you can keep open while you read the console.
 */
export type ConsoleTab = 'console' | 'perf';

/**
 * Where the reference sits relative to the running game.
 *
 * - `screen` — closed. Rail, workspace, console column.
 * - `split`  — open beside the console, which keeps the game. The artboard fits both at 1602:
 *              81 rail + 697 workspace + 401 reference + 421 console.
 * - `swap`   — open in the console's place, because there is not room for both. The game is
 *              paused rather than rendered to a column nobody can see.
 */
export type ColumnMode = 'screen' | 'split' | 'swap';

interface EditorUiState {
  activeTab: EditorTab;
  /**
   * Per-tab override of the console column's collapsed state, remembered per user.
   *
   * Only what the reader has actually changed is stored, so the default below keeps working for
   * every tab they have not touched.
   */
  collapsedByTab: Partial<Record<EditorTab, boolean>>;
  consoleTab: ConsoleTab;
  referenceOpen: boolean;
  autoRun: boolean;
  viewportWidth: number;
  pipOpen: boolean;
}

/** Tabs whose right column is a tool panel; the screen floats as a viewer there. */
const PANEL_TABS: readonly EditorTab[] = ['art', 'map', 'sound', 'net'];

/**
 * Below this the reference cannot sit beside the console, so it takes its place.
 *
 * 1602 because that is the width the artboard draws both at, and its columns add up to exactly
 * the 1600 of content inside it — a threshold of 1600 would have excluded the design's own
 * screenshot of the arrangement by two pixels.
 */
export const REFERENCE_SPLIT_BREAKPOINT = 1602;

/** The console column is a fixed track, like the reference and every tab inspector. */
export const CONSOLE_WIDTH = 421;
/** The reference beside the console. On its own it takes the console's 421 instead. */
export const REFERENCE_WIDTH = 401;

/** Layout state of the editor shell (per editor route). */
export const EditorUiStore = signalStore(
  withState<EditorUiState>({
    activeTab: 'game',
    collapsedByTab: readJson<Partial<Record<EditorTab, boolean>>>(STORAGE_KEYS.editorCollapsed, {}),
    consoleTab: 'console',
    referenceOpen: readJson<boolean>(STORAGE_KEYS.editorReferenceOpen, false),
    autoRun: true,
    viewportWidth: 1280,
    pipOpen: true,
  }),
  withComputed((s) => ({
    /**
     * CODE keeps the console beside it — that is where the machine talks back while you type. The
     * other tabs are canvases and the design gives them the full width, with the runtime available
     * as the floating viewer instead. Either way the reader's own choice wins.
     */
    collapsed: computed(() => s.collapsedByTab()[s.activeTab()] ?? s.activeTab() !== 'code'),
    /** Wide enough and the reference gets a column of its own; below that it takes the console's. */
    columnMode: computed<ColumnMode>(() =>
      !s.referenceOpen()
        ? 'screen'
        : s.viewportWidth() >= REFERENCE_SPLIT_BREAKPOINT
          ? 'split'
          : 'swap',
    ),
    /** Where the runtime lives: the right column, or a floating viewer over a panel tab. */
    consoleMode: computed<'column' | 'pip'>(() =>
      PANEL_TABS.includes(s.activeTab()) ? 'pip' : 'column',
    ),
  })),
  withMethods((store) => ({
    setTab(tab: EditorTab): void {
      patchState(store, { activeTab: tab });
    },
    setConsoleTab(tab: ConsoleTab): void {
      patchState(store, { consoleTab: tab });
    },
    setReferenceOpen(referenceOpen: boolean): void {
      patchState(store, { referenceOpen });
      writeJson(STORAGE_KEYS.editorReferenceOpen, referenceOpen);
    },
    toggleReference(): void {
      this.setReferenceOpen(!store.referenceOpen());
    },
    setAutoRun(on: boolean): void {
      patchState(store, { autoRun: on });
    },
    setViewportWidth(w: number): void {
      patchState(store, { viewportWidth: w });
    },
    setPipOpen(on: boolean): void {
      patchState(store, { pipOpen: on });
    },
    togglePip(): void {
      patchState(store, { pipOpen: !store.pipOpen() });
    },
    toggleCollapsed(): void {
      const next = { ...store.collapsedByTab(), [store.activeTab()]: !store.collapsed() };
      patchState(store, { collapsedByTab: next });
      writeJson(STORAGE_KEYS.editorCollapsed, next);
    },
  })),
);
