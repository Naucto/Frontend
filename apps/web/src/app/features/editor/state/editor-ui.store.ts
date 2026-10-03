import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { EditorPrefsStore } from '../../../core/prefs/editor-prefs.store';
import { readJson, STORAGE_KEYS, writeJson } from '../../../core/storage/local-storage';

export type EditorTab = 'game' | 'code' | 'art' | 'map' | 'sound' | 'net';
/** The console strip's own tabs; the docs are a separate panel, not one of these. */
export type ConsoleTab = 'console' | 'perf';

/**
 * Where the reference sits relative to the running game.
 *
 * - `screen` — closed. Rail, workspace, console column.
 * - `split`  — open beside the console, which keeps the game.
 * - `swap`   — open in the console's place, because there is not room for both. The game is
 *              paused rather than rendered to a column nobody can see.
 */
export type ColumnMode = 'screen' | 'split' | 'swap';

interface EditorUiState {
  activeTab: EditorTab;
  consoleTab: ConsoleTab;
  referenceOpen: boolean;
  autoRun: boolean;
  viewportWidth: number;
  viewportHeight: number;
  pipOpen: boolean;
  pipWidth: number;
}

/**
 * Below this the reference cannot sit beside the console, so it takes its place; it is the window
 * width at which the artboard draws both.
 */
export const REFERENCE_SPLIT_BREAKPOINT = 1602;
/**
 * Narrower than this and the editor is not shown at all, since the alternative to saying so is a
 * layout nobody can use.
 *
 * A width rather than a device: a window dragged narrow on a desktop is in the same position as a
 * phone, and gets the same answer.
 */
export const EDITOR_MIN_WIDTH = 1024;

/**
 * The width of every panel on the right of the editor, the console among them; deliberately wider
 * than the one the artboard draws for GAME, so all of them share it.
 */
export const PANEL_WIDTH = 421;

/** The console column is a fixed track, like the reference and every tab inspector. */
export const CONSOLE_WIDTH = PANEL_WIDTH;
/** The reference's width beside the console; on its own it takes the console's track instead. */
export const REFERENCE_WIDTH = 401;

/** The floating viewer's width in the artboard, and so where it starts before it is resized. */
const PIP_DEFAULT_WIDTH = 304;

/** Under this the transport's own buttons no longer fit on the scrim, player chips already gone. */
export const PIP_MIN_WIDTH = 240;

/**
 * The most of the window the floating viewer may take.
 *
 * A share of the *area*, not of either edge: a third of the width means something quite different
 * on a 16:9 and on a 21:9, and the card keeps a fixed ratio, so one number over the area is the
 * only bound that says the same thing on both.
 */
export const PIP_MAX_AREA_SHARE = 1 / 3;

/** Layout state of the editor shell (per editor route). */
export const EditorUiStore = signalStore(
  withState<EditorUiState>(() => ({
    activeTab: 'game',
    consoleTab: 'console',
    referenceOpen: readJson<boolean>(STORAGE_KEYS.editorReferenceOpen, false),
    autoRun: inject(EditorPrefsStore).autoRun(),
    viewportWidth: 1280,
    viewportHeight: 800,
    pipOpen: false,
    pipWidth: readJson<number>(STORAGE_KEYS.editorViewerWidth, PIP_DEFAULT_WIDTH),
  })),
  withComputed((state) => {
    /**
     * Whether the reference is on screen: it shows on CODE only, and the wish to have it open is
     * kept across the other tabs.
     */
    const referenceShown = computed(() => state.activeTab() === 'code' && state.referenceOpen());

    return {
      referenceShown,
      tooNarrow: computed(() => state.viewportWidth() < EDITOR_MIN_WIDTH),
      /** Wide enough and the reference gets a column of its own; below that it takes the console's. */
      columnMode: computed<ColumnMode>(() =>
        !referenceShown()
          ? 'screen'
          : state.viewportWidth() >= REFERENCE_SPLIT_BREAKPOINT
            ? 'split'
            : 'swap',
      ),
    };
  }),
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
    setViewportWidth(width: number): void {
      patchState(store, { viewportWidth: width });
    },
    setViewportHeight(height: number): void {
      patchState(store, { viewportHeight: height });
    },
    /**
     * Floats or docks the runtime. Docked until somebody pops it out, and for this editor only:
     * the store is provided per shell, so the next game opens docked.
     */
    togglePip(): void {
      patchState(store, { pipOpen: !store.pipOpen() });
    },
    /**
     * How wide the floating viewer is, persisted across games; the caller clamps it to the window
     * it is shown in.
     */
    setPipWidth(width: number): void {
      patchState(store, { pipWidth: width });
      writeJson(STORAGE_KEYS.editorViewerWidth, width);
    },
  })),
);
