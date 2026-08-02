export class KeyHandler {
  private keysPressed: Set<string>;
  private detachListeners?: () => void;

  constructor() {
    this.keysPressed = new Set();
  }

  public attachTo(element: HTMLCanvasElement): void {
    this.detach();

    const focusCanvas = (): void => {
      element.focus();
    };

    const captureKeyDown = (event: KeyboardEvent): void => {
      if (!event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
      }

      this.keysPressed.add(event.key);
    };

    const captureKeyUp = (event: KeyboardEvent): void => {
      this.keysPressed.delete(event.key);
    };

    element.addEventListener("pointerdown", focusCanvas);
    element.addEventListener("keydown", captureKeyDown);
    element.addEventListener("keyup", captureKeyUp);
    element.addEventListener("blur", this.clearKeys);

    this.detachListeners = (): void => {
      element.removeEventListener("pointerdown", focusCanvas);
      element.removeEventListener("keydown", captureKeyDown);
      element.removeEventListener("keyup", captureKeyUp);
      element.removeEventListener("blur", this.clearKeys);
      this.clearKeys();
    };
  }

  public detach(): void {
    this.detachListeners?.();
    this.detachListeners = undefined;
  }

  public isKeyPressed(key: string): boolean {
    return this.keysPressed.has(key);
  }

  public clearKeys = (): void => {
    this.keysPressed.clear();
  };
}
