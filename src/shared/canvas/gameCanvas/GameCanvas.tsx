import { StyledCanvas, CanvasHandle, CanvasProps } from "@shared/canvas/Canvas";
import { KeyHandler } from "@shared/canvas/gameCanvas/KeyHandler";
import { SpriteRendererHandle } from "@shared/canvas/RendererHandle";
import { EnvData, LuaEnvironmentManager } from "@shared/luaEnvManager/LuaEnvironmentManager";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";

type GameCanvasProps = {
  canvasProps: CanvasProps;
  envData: EnvData;
  setOutput: React.Dispatch<React.SetStateAction<string>>;
  className?: string;
};

const GameCanvas = forwardRef<SpriteRendererHandle, GameCanvasProps>(
  ({ canvasProps: { screenSize, spriteSheet, palette }, envData, setOutput, className }, ref) => {
    const spriteRendererHandleRef = useRef<CanvasHandle>(null);
    const luaEnvManagerRef = useRef<LuaEnvironmentManager>(null);
    const animationFrameRef = useRef<number>(null);
    const keyHandlerRef = useRef<KeyHandler>(new KeyHandler);

    useImperativeHandle(ref, () => spriteRendererHandleRef.current as SpriteRendererHandle, []);
    const loop = useCallback((): void => {
      if (!spriteRendererHandleRef.current) {
        return;
      }
      const luaEnvManager = luaEnvManagerRef.current;
      luaEnvManager?.update();
      luaEnvManager?.draw();
      animationFrameRef.current = requestAnimationFrame(loop);
      spriteRendererHandleRef.current?.draw();
    }, [luaEnvManagerRef, spriteRendererHandleRef, animationFrameRef]);

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
    }, []);

    useEffect(() => {
      if (!luaEnvManagerRef.current) {
        return;
      }
      const luaEnvManager = luaEnvManagerRef.current;
      luaEnvManager.setEnvData(envData);
    }, [envData.code]);

    // global init
    useEffect(() => {
      if (!spriteRendererHandleRef.current || !luaEnvManagerRef.current) {
        return;
      }
      const luaEnvManager = luaEnvManagerRef.current;

      spriteRendererHandleRef.current.clear(0);
      const isLoaded = luaEnvManager.runCode();
      if (!isLoaded) {
        return;
      }

      luaEnvManager.init();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = requestAnimationFrame(loop);

      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      };
    }, [envData.code]);

    return (
      <StyledCanvas
        ref={spriteRendererHandleRef}
        screenSize={screenSize}
        spriteSheet={spriteSheet}
        palette={palette}
        className={className}
        onKeyDown={(e) => keyHandlerRef.current?.handleKeyDown(e)}
        onKeyUp={(e) => keyHandlerRef.current?.handleKeyUp(e)}
      />
    );
  });

export default GameCanvas;
