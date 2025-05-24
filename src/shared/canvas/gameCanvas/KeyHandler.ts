export class KeyHandler {
  private keysPressed: Set<string>;

  constructor() {
    this.keysPressed = new Set();
  }

  public handleKeyDown(event: KeyboardEvent): void {
    this.keysPressed.add(event.key);
  };

  public handleKeyUp(event: KeyboardEvent): void {
    this.keysPressed.delete(event.key);
  };

  public isKeyPressed(key: string): boolean {
    return this.keysPressed.has(key);
  }

  public clearKeys(): void {
    this.keysPressed.clear();
  }
}
