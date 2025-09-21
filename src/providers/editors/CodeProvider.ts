import { MonacoBinding } from "y-monaco";
import * as Y from "yjs";
import { AwarenessProvider } from "./AwarenessProvider";
import { editor } from "monaco-editor";

export class CodeProvider implements Disposable {
  private readonly content: Y.Text;
  private monacoBinding: MonacoBinding | undefined;
  private provider: AwarenessProvider;

  private listeners = new Set<(content: string) => void>();

  constructor(ydoc: Y.Doc, provider: AwarenessProvider) {
    this.content = ydoc.getText("monaco");
    this.content.observe(this._callListeners.bind(this));
    this.provider = provider;
  }

  [Symbol.dispose](): void {
    this.listeners.clear();
    this.content.unobserve(this._callListeners.bind(this));
    this.monacoBinding?.destroy();
  }

  private _callListeners(): void {
    const currentContent = this.content.toString();
    this.listeners.forEach((callback) => callback(currentContent));
  }

  getContent(): string {
    return this.content.toString();
  }

  observe(callback: (content: string) => void): void {
    this.listeners.add(callback);
  }

  getMonacoBinding(): MonacoBinding | undefined {
    return this.monacoBinding;
  }

  setMonacoBinding(editor: editor.IStandaloneCodeEditor): void {
    const model = editor.getModel();
    if (!model) {
      throw new Error("Editor model is null.");
    }
    this.monacoBinding = new MonacoBinding(this.content, model, new Set([editor]), this.provider.getAwareness());
  }
}
