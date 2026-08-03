import { ApiContext } from "./ApiContext";
import { EngineModule } from "./EngineModule";
import { errorMessage } from "./errorMessage";

export class GraphicsAPI extends EngineModule {
  constructor(ctx: ApiContext) {
    super(ctx);
    ctx.lua.setGlobalWith("sprite", this._sprite.bind(this));
    ctx.lua.setGlobalWith("clear", this._clear.bind(this));
    ctx.lua.setGlobalWith("camera", this._camera.bind(this));
    ctx.lua.setGlobalWith("line", this._line.bind(this));
    ctx.lua.setGlobalWith("rect", this._drawOutlineRect.bind(this));
    ctx.lua.setGlobalWith("fill_rect", this._drawRect.bind(this));
    ctx.lua.setGlobalWith("set_col", this._setCol.bind(this));
    ctx.lua.setGlobalWith("reset_col", this._resetCol.bind(this));
  }

  private _sprite(
    n: number,
    x: number,
    y: number,
    w?: number,
    h?: number,
    flip_h?: boolean,
    flip_v?: boolean,
    scale?: number,
  ): void {
    this.ctx.renderer.queueSpriteDraw(n, x, y, w, h, flip_h, flip_v, scale);
  }

  private _clear(n: number): void {
    this.ctx.renderer.clear(n);
  }

  private _camera(x: number, y: number): void {
    this.ctx.renderer.moveCamera(x, y);
  }

  private _line(col: number, x0: number, y0: number, x1: number, y1: number): void {
    this.ctx.renderer.drawLine(col, x0, y0, x1, y1);
  }

  private _drawOutlineRect(col: number, x: number, y: number, width: number, height: number): void {
    this.ctx.renderer.drawOutlineRect(col, x, y, width, height);
  }

  private _drawRect(col: number, x: number, y: number, width: number, height: number): void {
    this.ctx.renderer.drawRect(col, x, y, width, height);
  }

  private _setCol(i1: number, i2: number): void {
    try {
      this.ctx.renderer.setColor(i1, i2);
    } catch (error) {
      if (error instanceof Error) {
        this.ctx.print(errorMessage(error));
      }
    }
  }

  private _resetCol(): void {
    try {
      this.ctx.renderer.resetColor();
    } catch (error) {
      if (error instanceof Error) {
        this.ctx.print(errorMessage(error));
      }
    }
  }
}
