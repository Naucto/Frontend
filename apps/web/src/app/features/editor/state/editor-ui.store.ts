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
  consoleTab: ConsoleTab;
  referenceOpen: boolean;
  autoRun: boolean;
  viewportWidth: number;
  viewportHeight: number;
  pipOpen: boolean;
  pipWidth: number;
}

/**
 * Below this the reference cannot sit beside the console, so it takes its place.
 *
 * 1602 because that is the width the artboard draws both at, and its columns add up to exactly
 * the 1600 of content inside it — a threshold of 1600 would have excluded the design's own
 * screenshot of the arrangement by two pixels.
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
 * Every panel on the right of the editor, the console among them.
 *
 * One number for the six because a tab inspector and the console are the same piece of furniture;
 * five hand-written literals had drifted to four different values. GAME's sheet draws its own at
 * 381 and this widens it, which is a decision recorded against the design rather than a correction.
 */
export const PANEL_WIDTH = 421;

/** The console column is a fixed track, like the reference and every tab inspector. */
export const CONSOLE_WIDTH = PANEL_WIDTH;
/** The reference beside the console. On its own it takes the console's 421 instead. */
export const REFERENCE_WIDTH = 401;

/** The floating viewer's width in the artboard, and so where it starts before it is resized. */
export const PIP_DEFAULT_WIDTH = 304;

/** Under this the title bar's own name and button no longer fit side by side. */
export const PIP_MIN_WIDTH = 200;

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
  withState<EditorUiState>({
    activeTab: 'game',
    consoleTab: 'console',
    referenceOpen: readJson<boolean>(STORAGE_KEYS.editorReferenceOpen, false),
    autoRun: true,
    viewportWidth: 1280,
    viewportHeight: 800,
    pipOpen: readJson<boolean>(STORAGE_KEYS.editorViewerFloating, false),
    pipWidth: readJson<number>(STORAGE_KEYS.editorViewerWidth, PIP_DEFAULT_WIDTH),
  }),
  withComputed((s) => {
    /**
     * Whether the reference is actually standing somewhere, against whether the reader would like
     * it to be.
     *
     * It belongs to CODE, beside the console, and neither has anywhere to stand on a canvas tab:
     * those draw their own inspector, and a reference arriving there is a third column about a
     * screen that is not on. The wish is kept while they are away, so it is waiting on their return.
     */
    const referenceShown = computed(() => s.activeTab() === 'code' && s.referenceOpen());

    return {
      referenceShown,
      tooNarrow: computed(() => s.viewportWidth() < EDITOR_MIN_WIDTH),
      /** Wide enough and the reference gets a column of its own; below that it takes the console's. */
      columnMode: computed<ColumnMode>(() =>
        !referenceShown()
          ? 'screen'
          : s.viewportWidth() >= REFERENCE_SPLIT_BREAKPOINT
            ? 'split'
            : 'swap',
      ),
      /**
       * Where the runtime lives: docked in the right column, or floating over the workspace.
       *
       * The reader decides, and on every tab alike — a control that pops the viewer out has to move
       * something wherever it is offered, or it is an affordance that lies.
       */
      consoleMode: computed<'column' | 'pip'>(() => (s.pipOpen() ? 'pip' : 'column')),
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
    setViewportWidth(w: number): void {
      patchState(store, { viewportWidth: w });
    },
    setViewportHeight(h: number): void {
      patchState(store, { viewportHeight: h });
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
    /**
     * How wide the floating viewer is, remembered like whether it floats at all.
     *
     * A size chosen by hand is a preference, not a window position: the corner it was dragged to
     * is where this window sits today, but how big you want to watch the game is how big you want
     * to watch it tomorrow. Clamped on read as well as on write, because the screen it was sized
     * against may not be the screen it comes back on.
     */
    setPipWidth(w: number): void {
      patchState(store, { pipWidth: w });
      writeJson(STORAGE_KEYS.editorViewerWidth, w);
    },
  })),
);
