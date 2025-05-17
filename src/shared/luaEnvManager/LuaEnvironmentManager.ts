import { LuaEnvironment } from "@lib/lua";
import { SpriteRendererHandle } from "@shared/canvas/RendererHandle";
import { KeyHandler } from "@shared/gameEngine/KeyHandler";

const ERROR_PREFIX = "Error: ";

interface EnvData {
  code: string,
  output: string
}
export type { EnvData };

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

  private readonly envData: EnvData;

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
      this._addOutput(`Error: ${error}`);
    }
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
    lua.setGlobal("sprite", (n: number, x: number, y: number, w: number, h: number) => {
      this._rendererHandle.queueSpriteDraw(n, x, y, w, h);
    });

    lua.setGlobal("clear", (n: number) => {
      this._rendererHandle.clear(n);
    });

    lua.setGlobal("print", (...args: unknown[]) => {
      const output = args.map((arg: unknown) => {
        return String(arg);
      }).join("\t");

      this._addOutput(output);
    });

    lua.setGlobal("key_pressed", (key: string) => {
      return this._keyHandler.isKeyPressed(key);
    });

    lua.setGlobal("set_col", (i1: number, i2: number) => {
      try {
        this._rendererHandle.setColor(i1, i2);
      } catch (error) {
        this._addOutput(this._getErrorMsg(error));
      }
    });

    lua.setGlobal("reset_col", () => {
      try {
        this._rendererHandle.resetColor();
      }
      catch (error) {
        this._addOutput(this._getErrorMsg(error));
      }
    });
  }

  private _getErrorMsg(error: unknown): string {
    return ERROR_PREFIX + (error instanceof Error ? error.message : String(error));
  }

  private _safeEval(code: string): void {
    try {
      this._lua.evaluate(code);
    } catch (error) {
      this._addOutput(this._getErrorMsg(error));
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
