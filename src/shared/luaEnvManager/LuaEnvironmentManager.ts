import { LuaEnvironment } from "@lib/lua";
import { SpriteRendererHandle } from "@shared/canvas/RendererHandle";
import { KeyHandler } from "@shared/gameEngine/KeyHandler";

interface EnvData {
  code: string,
  output: string
}

interface ConstructorProps {
  envData: EnvData,
  rendererHandle: SpriteRendererHandle,
  keyHandler: KeyHandler,
  setOutput: (output: string) => void | null
}

export type { EnvData };

class LuaEnvironmentManager {
  _lua: LuaEnvironment;
  rendererHandle: SpriteRendererHandle;
  keyHandler: KeyHandler;

  public state: EnvData = {
    code: "",
    output: ""
  };

  setOutput: (output: string) => void | null;

  constructor({ envData, rendererHandle, setOutput, keyHandler }: ConstructorProps) {
    this._lua = new LuaEnvironment();
    this.rendererHandle = rendererHandle;
    this.setGlobals(this._lua);
    this.setOutput = setOutput;
    this.state = envData;
    this.keyHandler = keyHandler;
  }

  public runCode(): void {
    this.clearOutput();
    this._lua.evaluate(this.state.code);
  }

  public init(): void {
    this._lua.evaluate("if _G._init then _G._init() end");
  }

  public update(): void {
    this._lua.evaluate("if _G._update then _G._update() end");
  }

  public draw(): void {
    this._lua.evaluate("if _G._draw then _G._draw() end");
  }

  public clearOutput(): void {
    this.state.output = "";
    if (this.setOutput != null) {
      this.setOutput(this.state.output);
    }
  }

  private setGlobals(lua: LuaEnvironment): void {
    lua.setGlobal("spr", (n: number, x: number, y: number, w: number, h: number) => {
      this.rendererHandle.queueSpriteDraw(n, x, y, w, h);
    });

    lua.setGlobal("clr", (n: number) => {
      this.rendererHandle.clear(n);
    });

    lua.setGlobal("print", (...args: any) => {
      const output = args.map((arg: any) => {
        return arg.toString();
      }).join("\t");

      if (this.setOutput != null) {
        this.state.output += output + "\n";
        this.setOutput(this.state.output);
      }
    });

    lua.setGlobal("btn", (key: string) => {
      return this.keyHandler.isKeyPressed(key);
    });

    lua.setGlobal("col", (i1: number, i2: number) => {
      this.rendererHandle.setColor(i1, i2);
    });

    lua.setGlobal("reset_col", () => {
      this.rendererHandle.resetColor();
    });
  }
}

export {
  LuaEnvironmentManager
};
