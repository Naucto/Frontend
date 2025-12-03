import { LuaEnvironment } from "@lib/lua";
import { KeyHandler } from "@shared/canvas/gameCanvas/KeyHandler";
import { SpriteRendererHandle } from "@shared/canvas/RendererHandle";

export interface EnvData {
  code: string,
  output: string
}

interface ConstructorProps {
  envData: EnvData,
  rendererHandle: SpriteRendererHandle,
  keyHandler: KeyHandler,
  /**
   * this function is used to set the envData.output only
   * @param output the output to set
   */
  setOutput: React.Dispatch<React.SetStateAction<string>>
}

// noinspection JSUnusedLocalSymbols
class LuaAPI {
  private readonly _maxLines = 100;

  constructor(
    private readonly _rendererHandle: SpriteRendererHandle,
    private readonly _keyHandler: KeyHandler,
    private readonly _setOutput: React.Dispatch<React.SetStateAction<string>>,
  ) {}

  public register(env: LuaEnvironment): void {
    for (const nativeMethodName of Object.getOwnPropertyNames(LuaAPI.prototype)) {
      if (!nativeMethodName.startsWith("$"))
        continue;

      const luaMethodName = nativeMethodName
        .substring(1)
        .replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

      env.setGlobal(luaMethodName, this[nativeMethodName as keyof LuaAPI].bind(this));
    }
  }

  public formatError(error: Error): string {
    return "Error: " + error.message;
  }

  public reportError(error: unknown): void {
    if (error instanceof Error) {
      this._addOutput(this.formatError(error));
    }
  }

  private _addOutput(output: string): void {
    this._setOutput(prev => {
      prev += output + "\n";
      const lines = prev.split("\n");
      if (lines.length >= this._maxLines) {
        lines.splice(0, lines.length - this._maxLines);
      }
      return lines.join("\n");
    });
  }

  // @ts-expect-error(2554)
  private $map = (x: number, y: number): void => {
    this._rendererHandle.drawMap(x, y);
  };

  // @ts-expect-error(2554)
  private $sprite = (n: number, x: number, y: number, w: number, h: number): void => {
    this._rendererHandle.queueSpriteDraw(n, x, y, w, h);
  };

  // @ts-expect-error(2554)
  private $camera = (x: number, y: number): void => {
    this._rendererHandle.moveCamera(x, y);
  };

  // @ts-expect-error(2554)
  private $clear = (n: number): void => {
    this._rendererHandle.clear(n);
  };

  // @ts-expect-error(2554)
  private $print = (...args: unknown[]): void => {
    const output = args.map((arg: unknown) => String(arg)).join("\t");
    this._addOutput(output);
  };

  // @ts-expect-error(2554)
  private $keyPressed = (key: string): boolean => {
    return this._keyHandler.isKeyPressed(key);
  };

  // @ts-expect-error(2554)
  private $setCol = (i1: number, i2: number): void => {
    try {
      this._rendererHandle.setColor(i1, i2);
    } catch (error) {
      this.reportError(error);
    }
  };

  // @ts-expect-error(2554)
  private $resetCol = (): void => {
    try {
      this._rendererHandle.resetColor();
    } catch (error) {
      this.reportError(error);
    }
  };
}

class LuaEnvironmentManager {
  private _lua: LuaEnvironment;
  private _luaApi: LuaAPI;
  private _envData: EnvData;
  private _setOutput: React.Dispatch<React.SetStateAction<string>>;

  constructor({ envData, rendererHandle, setOutput, keyHandler }: ConstructorProps) {
    this._lua = new LuaEnvironment();
    this._setOutput = setOutput;
    this._envData = envData;
    this._luaApi = new LuaAPI(rendererHandle, keyHandler, setOutput);
    this._luaApi.register(this._lua);
  }

  public runCode(): boolean {
    this.clearOutput();
    try {
      this._lua.evaluate(this._envData.code);
      return true;
    } catch (error) {
      if (error instanceof Error) {
        this._setOutput(this._luaApi.formatError(error));
        return false;
      }
    }
    return false;
  }

  public setEnvData(envData: EnvData): void {
    this._envData = envData;
  }

  public init(): void {
    this._safeEval("if _G._init then _G._init() end");
  }

  public update(): void {
    this._safeEval("if _G._update then _G._update() end");
  }

  public draw(): void {
    this._safeEval("if _G._draw then _G._draw() end");
  }

  public clearOutput(): void {
    this._setOutput("");
  }

  // private

  private _safeEval(code: string): void {
    try {
      this._lua.evaluate(code);
    } catch (error) {
      this._luaApi.reportError(error);
    }
  }
}

export {
  LuaEnvironmentManager
};
