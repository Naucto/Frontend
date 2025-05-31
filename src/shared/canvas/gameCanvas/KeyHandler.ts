import { KeyboardEvent } from "react";

export class KeyHandler {
  private keysPressed: Set<string>;

  constructor() {
    this.keysPressed = new Set();
  }

  public handleKeyDown<T extends HTMLElement>(event: KeyboardEvent<T>): void {
    this.keysPressed.add(event.key);
  };

  public handleKeyUp<T extends HTMLElement>(event: KeyboardEvent<T>): void {
    this.keysPressed.delete(event.key);
  };

  public isKeyPressed(key: string): boolean {
    return this.keysPressed.has(key);
  }

  public clearKeys(): void {
    this.keysPressed.clear();
  }
}
