import { MonacoBinding } from "y-monaco";
import * as Y from "yjs";
import { AwarenessProvider } from "./AwarenessProvider";
import { editor } from "monaco-editor";

export class CodeProvider implements Destroyable {
  private readonly _content: Y.Text;
  private _monacoBinding: MonacoBinding | undefined;
  private _provider: AwarenessProvider;

  private _listeners = new Set<RawContentListener>();

  private readonly _boundCallListeners: () => void;

  constructor(ydoc: Y.Doc, provider: AwarenessProvider) {
    this._content = ydoc.getText("monaco");
    this._boundCallListeners = this._callListeners.bind(this);
    this._content.observe(this._boundCallListeners);
    this._provider = provider;
  }

  destroy(): void {
    this._listeners.clear();
    this._content.unobserve(this._boundCallListeners);
    this._monacoBinding?.destroy();
  }

  private _callListeners(): void {
    const currentContent = this._content.toString();
    this._listeners.forEach((callback) => callback(currentContent));
  }

  getContent(): string {
    return this._content.toString();
  }

  observe(callback: RawContentListener): void {
    this._listeners.add(callback);
  }

  getMonacoBinding(): MonacoBinding | undefined {
    return this._monacoBinding;
  }

  setMonacoBinding(editor: editor.IStandaloneCodeEditor): void {
    const model = editor.getModel();
    if (!model) {
      throw new Error("Editor model is null.");
    }
    this._monacoBinding = new MonacoBinding(this._content, model, new Set([editor]), this._provider.getAwareness());
  }
}
