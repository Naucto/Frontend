import { LuaEnvironment } from "@lib/lua";
import { KeyHandler } from "@shared/canvas/gameCanvas/KeyHandler";
import { SpriteRendererHandle } from "@shared/canvas/RendererHandle";
import { NetAPI } from "@shared/luaEnvManager/api/NetAPI";

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
    this._setOutput = setOutput;
    this._envData = envData;
    this._keyHandler = keyHandler;

    this._lua.setGlobalWith("sprite", this._sprite.bind(this));
    this._lua.setGlobalWith("clear", this._clear.bind(this));
    this._lua.setGlobalWith("print", this._print.bind(this));
    this._lua.setGlobalWith("key_pressed", this._keyPressed.bind(this));
    this._lua.setGlobalWith("set_col", this._setCol.bind(this));
    this._lua.setGlobalWith("reset_col", this._resetCol.bind(this));
    this._lua.setGlobalWith("map", this._map.bind(this));
    this._lua.setGlobalWith("camera", this._camera.bind(this));
    this._lua.setGlobalWith("line", this._line.bind(this));
    this._lua.setGlobalWith("rect", this._drawOutlineRect.bind(this));
    this._lua.setGlobalWith("fill_rect", this._drawRect.bind(this));

    new NetAPI(this._lua);
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

  private _map(x: number, y: number): void {
    this._rendererHandle.drawMap(x, y);
  }

  private _sprite(n: number, x: number, y: number, w: number, h: number): void {
    this._rendererHandle.queueSpriteDraw(n, x, y, w, h);
  }

  private _camera(x: number, y: number): void {
    this._rendererHandle.moveCamera(x, y);
  }
  private _line(col: number, x0: number, y0: number, x1: number, y1: number): void {
    this._rendererHandle.drawLine(col, x0, y0, x1, y1);
  }

  private _drawOutlineRect(col: number, x: number, y: number, width: number, height: number): void {
    this._rendererHandle.drawOutlineRect(col, x, y, width, height);
  }

  private _drawRect(col: number, x: number, y: number, width: number, height: number): void {
    this._rendererHandle.drawRect(col, x, y, width, height);
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
