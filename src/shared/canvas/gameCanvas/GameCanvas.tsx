import StyledCanvas, { CanvasHandle, CanvasProps } from "@shared/canvas/Canvas";
import { KeyHandler } from "@shared/canvas/gameCanvas/KeyHandler";
import { SpriteRendererHandle } from "@shared/canvas/RendererHandle";
import { EnvData, LuaEnvironmentManager } from "@shared/luaEnvManager/LuaEnvironmentManager";
import { forwardRef, useCallback, useEffect, useRef } from "react";

type GameCanvasProps = {
  canvasProps: CanvasProps;
  envData: EnvData;
  setOutput: (output: string) => void
  className?: string;
};

const GameCanvas = forwardRef<SpriteRendererHandle, GameCanvasProps>(({ canvasProps: { screenSize, spriteSheet, palette, className }, envData, setOutput }, ref) => {
  const spriteRendererHandleRef = useRef<CanvasHandle | null>(null);
  const luaEnvManagerRef = useRef<LuaEnvironmentManager | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const keyHandlerRef = useRef<KeyHandler>(new KeyHandler);
  const loop = useCallback((): void => {
    if (!spriteRendererHandleRef.current) {
      return;
    }
    const luaEnvManager = luaEnvManagerRef.current;
    luaEnvManager?.update();
    luaEnvManager?.draw();
    animationFrameRef.current = requestAnimationFrame(loop);
    spriteRendererHandleRef.current?.draw();
  }, [luaEnvManagerRef, spriteRendererHandleRef]);

  // init lua env
  useEffect(() => {
    if (spriteRendererHandleRef.current == null || keyHandlerRef.current == null) {
      return;
    }
    const rendererHandle = spriteRendererHandleRef.current;
    const keyHandler = keyHandlerRef.current;
    luaEnvManagerRef.current = new LuaEnvironmentManager({
      envData,
      rendererHandle,
      keyHandler,
      setOutput
    });
  }, [envData, setOutput]);

  // init key handler
  useEffect(() => {
    const spriteRenderer = spriteRendererHandleRef.current;
    if (!spriteRenderer) {
      return;
    }
    const canvas = spriteRenderer.getCanvas();
    if (!canvas) {
      return;
    }
    canvas.addEventListener("keydown", keyHandlerRef.current?.handleKeyDown.bind(keyHandlerRef.current));
    canvas.addEventListener("keyup", keyHandlerRef.current?.handleKeyUp.bind(keyHandlerRef.current));

    return () => {
      canvas.removeEventListener("keydown", keyHandlerRef.current?.handleKeyDown);
      canvas.removeEventListener("keyup", keyHandlerRef.current?.handleKeyUp);
    };
  }, []);

  // global init
  useEffect(() => {
    if (!spriteRendererHandleRef.current || !luaEnvManagerRef.current) {
      return;
    }
    const luaEnvManager = luaEnvManagerRef.current;

    spriteRendererHandleRef.current.clear(0);
    luaEnvManager.runCode();

    luaEnvManager.init();
    animationFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, []);

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

export default GameCanvas;
