import { StyledCanvas, CanvasProps } from "@shared/canvas/Canvas";
import { KeyHandler } from "@shared/canvas/gameCanvas/KeyHandler";
import { SpriteRendererHandle } from "@shared/canvas/RendererHandle";
import { EnvData, LuaEnvironmentManager } from "@shared/luaEnvManager/LuaEnvironmentManager";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { SoundProvider } from "@providers/editors/SoundProvider";
import { MusicPlayer } from "@shared/audio/MusicPlayer";

type GameCanvasProps = {
  canvasProps: CanvasProps;
  envData: EnvData;
  setOutput: React.Dispatch<React.SetStateAction<string>>;
  soundProvider?: SoundProvider;
  className?: string;
};

const GameCanvas = forwardRef<SpriteRendererHandle, GameCanvasProps>(
  ({ canvasProps, envData, setOutput, className, soundProvider }, ref) => {
    const spriteRendererHandleRef = useRef<SpriteRendererHandle>(undefined);
    const luaEnvManagerRef = useRef<LuaEnvironmentManager>(undefined);
    const animationFrameRef = useRef<number>(undefined);
    const keyHandlerRef = useRef<KeyHandler>(new KeyHandler);
    const musicPlayerRef = useRef<MusicPlayer>(undefined);

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
      if (soundProvider) {
        musicPlayerRef.current = new MusicPlayer(soundProvider);
      }
      luaEnvManagerRef.current = new LuaEnvironmentManager({
        envData,
        rendererHandle,
        spriteProvider: canvasProps.sprite,
        mapProvider: canvasProps.map,
        keyHandler,
        setOutput,
        musicPlayer: musicPlayerRef.current
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
          animationFrameRef.current = undefined;
        }
      };
    }, [envData.code]);

    return (
      <StyledCanvas
        ref={spriteRendererHandleRef}
        className={className}
        onKeyDown={(e) => keyHandlerRef.current?.handleKeyDown(e)}
        onKeyUp={(e) => keyHandlerRef.current?.handleKeyUp(e)}
        {...canvasProps}
      />
    );
  });

export default GameCanvas;
