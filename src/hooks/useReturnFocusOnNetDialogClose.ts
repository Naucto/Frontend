import { NetUiBridge } from "@providers/net/NetUiBridge";
import { SpriteRendererHandle } from "@shared/canvas/RendererHandle";

import { RefObject, useEffect } from "react";

// A net.host()/net.join() dialog steals keyboard focus from the game canvas, and
// the KeyHandler only refocuses the canvas on a pointer click — so once the dialog
// closes the game is deaf to the keyboard (e.g. the tutorial's "press M" never
// registers), which reads as a hang. Return focus to the canvas whenever the
// dialog closes, whether it was cancelled or resolved into a live session.
export function useReturnFocusOnNetDialogClose(
  bridge: NetUiBridge,
  canvasRef: RefObject<SpriteRendererHandle | null>,
): void {
  useEffect(() => {
    let wasOpen = bridge.getSnapshot() !== null;

    return bridge.subscribe(() => {
      const isOpen = bridge.getSnapshot() !== null;

      if (wasOpen && !isOpen)
        canvasRef.current?.getCanvas?.()?.focus();

      wasOpen = isOpen;
    });
  }, [bridge, canvasRef]);
}
