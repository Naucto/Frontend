import { LuaEnvironment } from "@lib/lua";
import { SpriteRendererHandle } from "@shared/canvas/RendererHandle";
import { KeyHandler } from "@shared/gameEngine/KeyHandler";

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
  setOutput: ((output: string) => void)
}

class LuaEnvironmentManager {
  private _lua: LuaEnvironment;
  private _rendererHandle: SpriteRendererHandle;
  private _keyHandler: KeyHandler;

  private envData: EnvData;

  private setOutput: ((output: string) => void);

  constructor({ envData, rendererHandle, setOutput, keyHandler }: ConstructorProps) {
    this._lua = new LuaEnvironment();
    this._rendererHandle = rendererHandle;
    this._injectGameAPI(this._lua);
    this.setOutput = setOutput;
    this.envData = envData;
    this._keyHandler = keyHandler;
  }

  public runCode(): void {
    this.clearOutput();
    try {
      this._lua.evaluate(this.envData.code);
    } catch (error) {
      if (error instanceof Error) {
        this._addOutput(this._getErrorMsg(error));
      }
    }
  }

  public setEnvData(envData: EnvData): void {
    this.envData = envData;
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
    this.setOutput("");
  }

  // private

  private _injectGameAPI(lua: LuaEnvironment): void {
    lua.setGlobal("sprite", this._sprite.bind(this));
    lua.setGlobal("clear", this._clear.bind(this));
    lua.setGlobal("print", this._print.bind(this));
    lua.setGlobal("key_pressed", this._keyPressed.bind(this));
    lua.setGlobal("set_col", this._setCol.bind(this));
    lua.setGlobal("reset_col", this._resetCol.bind(this));
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
    const newOutput = this.envData.output + output + "\n";
    this.setOutput(newOutput);
  }
}

export {
  LuaEnvironmentManager
};
