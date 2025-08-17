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

class LuaEnvironmentManager {
  private _maxLines = 100;
  private _lua: LuaEnvironment;
  private _rendererHandle: SpriteRendererHandle;
  private _keyHandler: KeyHandler;

  private _envData: EnvData;

  private _setOutput: React.Dispatch<React.SetStateAction<string>>;

  constructor({ envData, rendererHandle, setOutput, keyHandler }: ConstructorProps) {
    this._lua = new LuaEnvironment();
    this._rendererHandle = rendererHandle;
    this._injectGameAPI(this._lua);
    this._setOutput = setOutput;
    this._envData = envData;
    this._keyHandler = keyHandler;
  }

  public runCode(): boolean {
    this.clearOutput();
    try {
      this._lua.evaluate(this._envData.code);
      return true;
    } catch (error) {
      if (error instanceof Error) {
        this._setOutput(this._getErrorMsg(error));
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

  private _injectGameAPI(lua: LuaEnvironment): void {
    lua.setGlobal("sprite", this._sprite.bind(this));
    lua.setGlobal("clear", this._clear.bind(this));
    lua.setGlobal("print", this._print.bind(this));
    lua.setGlobal("key_pressed", this._keyPressed.bind(this));
    lua.setGlobal("set_col", this._setCol.bind(this));
    lua.setGlobal("reset_col", this._resetCol.bind(this));
    lua.setGlobal("map", this._map.bind(this));
  }

  private _map(x: number, y: number): void {
    this._rendererHandle.drawMap(x, y);
  }

  private _sprite(n: number, x: number, y: number, w: number, h: number): void {
    this._rendererHandle.queueSpriteDraw(n, x, y, w, h);
  }

  private _clear(n: number): void {
    this._rendererHandle.clear(n);
  }

  private _print(...args: unknown[]): void {
    const output = args.map((arg: unknown) => {
      return String(arg);
    }).join("\t");

    this._addOutput(output);
  }

  private _keyPressed(key: string): boolean {
    return this._keyHandler.isKeyPressed(key);
  }

  private _setCol(i1: number, i2: number): void {
    try {
      this._rendererHandle.setColor(i1, i2);
    } catch (error) {
      if (error instanceof Error) {
        this._addOutput(this._getErrorMsg(error));
      }
    }
  }

  private _resetCol(): void {
    try {
      this._rendererHandle.resetColor();
    } catch (error) {
      if (error instanceof Error) {
        this._addOutput(this._getErrorMsg(error));
      }
    }
  }

  private _getErrorMsg(error: Error): string {
    return "Error: " + (error.message);
  }

  private _safeEval(code: string): void {
    try {
      this._lua.evaluate(code);
    } catch (error) {
      if (error instanceof Error) {
        this._addOutput(this._getErrorMsg(error));
      }
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
}

export {
  LuaEnvironmentManager
};
