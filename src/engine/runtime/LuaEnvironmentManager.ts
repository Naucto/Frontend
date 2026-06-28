import { ApiContext } from "@engine/api/ApiContext";
import { EngineModule } from "@engine/api/EngineModule";
import { GraphicsAPI } from "@engine/api/GraphicsAPI";
import { InputAPI } from "@engine/api/InputAPI";
import { MapAPI } from "@engine/api/MapAPI";
import { NetAPI } from "@engine/api/NetAPI";
import { SoundAPI } from "@engine/api/SoundAPI";
import { LuaEnvironment } from "@engine/lua/LuaEnvironment";

export interface EnvData {
  code: string,
  output: string
}

// Console-output setter — a React `useState` setter satisfies this without the
// engine having to depend on React's `Dispatch`/`SetStateAction` types.
export type OutputSetter = (value: string | ((prev: string) => string)) => void;

// The ports the app supplies; the manager owns the rest of the ApiContext (the
// Lua VM and console output).
export type EnginePorts = Omit<ApiContext, "lua" | "print">;

interface ConstructorProps {
  envData: EnvData,
  ports: EnginePorts,
  setOutput: OutputSetter
}

class LuaEnvironmentManager {
  private static readonly API_MODULES: Array<new (ctx: ApiContext) => EngineModule> = [
    GraphicsAPI,
    InputAPI,
    MapAPI,
    SoundAPI,
    NetAPI,
  ];

  private readonly _modules: EngineModule[] = [];

  private _maxLines = 100;
  private _lua: LuaEnvironment;

  private _envData: EnvData;

  private _setOutput: OutputSetter;

  constructor({ envData, ports, setOutput }: ConstructorProps) {
    this._lua = new LuaEnvironment();
    this._setOutput = setOutput;
    this._envData = envData;

    this._lua.setGlobalWith("print", this._print.bind(this));

    const ctx: ApiContext = {
      lua: this._lua,
      print: this._addOutput.bind(this),
      ...ports,
    };

    for (const Module of LuaEnvironmentManager.API_MODULES) {
      this._modules.push(new Module(ctx));
    }
  }

  // Releases the engine's API modules (e.g. NetAPI ends its multiplayer session
  // and closes the socket). Call when the canvas unmounts or the page unloads.
  destroy(): void {
    for (const module of this._modules)
      module.destroy();
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

  public init(): boolean {
    return this._safeEval("if _G._init then _G._init() end");
  }

  public update(): boolean {
    return this._safeEval("if _G._update then _G._update() end");
  }

  public draw(): boolean {
    return this._safeEval("if _G._draw then _G._draw() end");
  }

  public clearOutput(): void {
    this._setOutput("");
  }

  private _print(...args: unknown[]): void {
    const output = args.map((arg: unknown) => {
      return String(arg);
    }).join("\t");

    this._addOutput(output);
  }

  private _getErrorMsg(error: Error): string {
    return "Error: " + (error.message);
  }

  /**
   * Evaluates a fragment, reporting any failure to the console output.
   * Returns true on success, false if evaluation threw. Catches every
   * throwable (not just `Error`) so a misbehaving script — e.g. infinite
   * recursion in `_update` — can never escape the per-frame game loop.
   */
  private _safeEval(code: string): boolean {
    try {
      this._lua.evaluate(code);
      return true;
    } catch (error) {
      const message = error instanceof Error
        ? this._getErrorMsg(error)
        : "Error: " + String(error);
      this._addOutput(message);
      return false;
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
