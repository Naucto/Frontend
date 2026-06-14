import { SoundProvider } from "@providers/editors/SoundProvider";
import { MusicPlayer } from "@shared/audio/MusicPlayer";
import { CanvasProps, StyledCanvas } from "@shared/canvas/Canvas";
import { KeyHandler } from "@shared/canvas/game-canvas/KeyHandler";
import { SpriteRendererHandle } from "@shared/canvas/RendererHandle";
import { EnvData, LuaEnvironmentManager } from "@shared/lua-env-manager/LuaEnvironmentManager";

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";

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
    const stopEngineLoop = useCallback((): void => {
      if (engineIntervalRef.current) {
        clearInterval(engineIntervalRef.current);
        engineIntervalRef.current = undefined;
      }
    }, []);

    const engineLoop = useCallback((): void => {
      if (!spriteRendererHandleRef.current)
        return;

      const luaEnvManager = luaEnvManagerRef.current;
      // If a frame fails (e.g. a runtime error or infinite recursion in
      // _update/_draw), halt the loop instead of re-throwing the same error
      // 60 times a second — that error storm froze/crashed the page.
      const updated = luaEnvManager?.update() ?? true;
      const drawn = updated ? (luaEnvManager?.draw() ?? true) : false;
      if (!updated || !drawn) {
        stopEngineLoop();
        return;
      }
      spriteRendererHandleRef.current?.draw();
    }, [luaEnvManagerRef, spriteRendererHandleRef, stopEngineLoop]);

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

      stopEngineLoop();
      // Don't start the per-frame loop if init() itself errored.
      if (!luaEnvManager.init()) {
        return;
      }
      engineIntervalRef.current = setInterval(engineLoop, ENGINE_FRAME_TIME);

      return stopEngineLoop;
    }, [envData.code, engineLoop, stopEngineLoop]);

    useEffect(() => {
      const canvas = spriteRendererHandleRef.current?.getCanvas?.();
      if (!canvas) {
        return;
      }

      keyHandlerRef.current.attachTo(canvas);
      return () => {
        keyHandlerRef.current.detach();
      };
    }, []);

    return (
      <StyledCanvas
        ref={spriteRendererHandleRef}
        {...canvasProps}
        className={className}
      />
    );
  });

export default GameCanvas;
