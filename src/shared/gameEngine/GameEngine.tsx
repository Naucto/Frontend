import StyledCanvas, { CanvasHandle } from "@shared/canvas/Canvas";
import { SpriteRendererHandle } from "@shared/canvas/RendererHandle";
import { KeyHandler } from "@shared/gameEngine/KeyHandler";
import { EnvData, LuaEnvironmentManager } from "@shared/luaEnvManager/LuaEnvironmentManager";
import { forwardRef, useEffect, useRef, useState } from "react";
import { SpriteSheet } from "src/types/SpriteSheetType";

type EngineProps = {
  spriteSheet: SpriteSheet;
  screenSize: {
    width: number;
    height: number;
  };
  palette: Uint8Array;
  envData: EnvData;
  setOutput: (output: string) => void
  className?: string;
};

const GameEngine = forwardRef<SpriteRendererHandle, EngineProps>(({ screenSize, spriteSheet, palette, envData, setOutput, className }, ref) => {
  const spriteRendererHandleRef = useRef<CanvasHandle | null>(null);
  const [luaEnvManager, setLuaEnvManager] = useState<LuaEnvironmentManager | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const keyHandlerRef = useRef<KeyHandler>(new KeyHandler);

  useEffect(() => {
    if (spriteRendererHandleRef.current == null || keyHandlerRef.current == null) {
      return;
    }
    const rendererHandle = spriteRendererHandleRef.current;
    const keyHandler = keyHandlerRef.current;
    setLuaEnvManager(new LuaEnvironmentManager({
      envData,
      rendererHandle,
      keyHandler,
      setOutput
    }));
  }, [spriteRendererHandleRef]);

  useEffect(() => {
    const spriteRenderer = spriteRendererHandleRef.current;
    if (!spriteRenderer) {
      return;
    }
    const canvas = spriteRenderer.getCanvas();
    if (!canvas) {
      return;
    }
    canvas.addEventListener("keydown", keyHandlerRef.current?.handleKeyDown);
    canvas.addEventListener("keyup", keyHandlerRef.current?.handleKeyUp);

    return () => {
      canvas.removeEventListener("keydown", keyHandlerRef.current?.handleKeyDown);
      canvas.removeEventListener("keyup", keyHandlerRef.current?.handleKeyUp);
    };
  });

  useEffect(() => {
    if (!spriteRendererHandleRef || !spriteRendererHandleRef.current ||
      !luaEnvManager) {
      return;
    }

    spriteRendererHandleRef.current.clear(2);
    luaEnvManager.state.code = envData.code;
    luaEnvManager.runCode();
    luaEnvManager.init();

    const loop = (): void => {
      luaEnvManager.update();
      luaEnvManager.draw();
      animationFrameRef.current = requestAnimationFrame(loop);
      spriteRendererHandleRef.current?.draw();
      // keyHandlerRef.current?.clearKeys();
    };
    animationFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [spriteRendererHandleRef, luaEnvManager]);

  return (
    <StyledCanvas
      ref={spriteRendererHandleRef}
      screenSize={screenSize}
      spriteSheet={spriteSheet}
      palette={palette}
      className={className}
    />
  );
});

export default GameEngine;
