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
    pipOpen: readJson<boolean>(STORAGE_KEYS.editorViewerFloating, false),
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
    /**
     * Where the runtime lives: docked in the right column, or floating over the workspace.
     *
     * The reader decides, on every tab. It used to be the tab that decided — the canvases floated
     * it and CODE and GAME did not — so on those two the control that pops it out changed the
     * stored preference and nothing moved, which is an affordance that lies.
     */
    consoleMode: computed<'column' | 'pip'>(() => (s.pipOpen() ? 'pip' : 'column')),
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
    /**
     * Whether the runtime floats over a canvas tab.
     *
     * Closed until somebody opens it, and remembered after that. It used to arrive open on every
     * canvas tab: switching from CODE to ART, MAP, SOUND or NET dropped a panel over the lower
     * right of whatever you had come to work on, and you had to dismiss it each time.
     */
    setPipOpen(on: boolean): void {
      patchState(store, { pipOpen: on });
      writeJson(STORAGE_KEYS.editorViewerFloating, on);
    },
    togglePip(): void {
      this.setPipOpen(!store.pipOpen());
    },
    toggleCollapsed(): void {
      const next = { ...store.collapsedByTab(), [store.activeTab()]: !store.collapsed() };
      patchState(store, { collapsedByTab: next });
      writeJson(STORAGE_KEYS.editorCollapsed, next);
    },
  })),
);
