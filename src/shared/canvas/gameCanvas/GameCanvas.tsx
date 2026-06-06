import { StyledCanvas, CanvasProps } from "@shared/canvas/Canvas";
import { KeyHandler } from "@shared/canvas/gameCanvas/KeyHandler";
import { SpriteRendererHandle } from "@shared/canvas/RendererHandle";
import { EnvData, LuaEnvironmentManager } from "@shared/luaEnvManager/LuaEnvironmentManager";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { SoundProvider } from "@providers/editors/SoundProvider";
import { MusicPlayer } from "@shared/audio/MusicPlayer";

const ENGINE_FRAME_TIME = 1000 / 60;

type GameCanvasProps = {
  canvasProps: CanvasProps;
  envData: EnvData;
  setOutput: React.Dispatch<React.SetStateAction<string>>;
  soundProvider?: SoundProvider;
  className?: string;
};

const GameCanvas = forwardRef<SpriteRendererHandle, GameCanvasProps>(
  ({ canvasProps, envData, setOutput, className, soundProvider }, ref) => {
    const spriteRendererHandleRef = useRef<SpriteRendererHandle | null>(null);
    const luaEnvManagerRef = useRef<LuaEnvironmentManager>(undefined);
    const engineIntervalRef = useRef<NodeJS.Timeout>(undefined);
    const keyHandlerRef = useRef<KeyHandler>(new KeyHandler);
    const musicPlayerRef = useRef<MusicPlayer>(undefined);

    useImperativeHandle(ref, () => spriteRendererHandleRef.current as SpriteRendererHandle, []);

    // TODO: Make this configurable from project settings
    //       Allow toggling between 60 Hz lock and delta time support in _update()
    const engineLoop = useCallback((): void => {
      if (!spriteRendererHandleRef.current)
        return;

      const luaEnvManager = luaEnvManagerRef.current;
      luaEnvManager?.update();
      luaEnvManager?.draw();
      engineIntervalRef.current = setInterval(engineLoop, ENGINE_FRAME_TIME);
      spriteRendererHandleRef.current?.draw();
    }, [luaEnvManagerRef, spriteRendererHandleRef, engineIntervalRef]);

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
      if (engineIntervalRef.current) {
        clearInterval(engineIntervalRef.current);
      }
      engineIntervalRef.current = setInterval(engineLoop, ENGINE_FRAME_TIME);

      return () => {
        if (engineIntervalRef.current) {
          clearInterval(engineIntervalRef.current);
          engineIntervalRef.current = undefined;
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
