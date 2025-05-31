import IEditor from "@modules/editor/IEditor";

import Editor, { Monaco } from "@monaco-editor/react";

import CodeTabTheme from "@modules/editor/CodeEditor/CodeTabTheme.ts";
import { Doc } from "yjs";
import { Text as YText } from "yjs";
import { WebrtcProvider } from "y-webrtc";
import { MonacoBinding } from "y-monaco";

export class CodeEditor extends IEditor {
  private provider: WebrtcProvider | null = null;
  private ydoc: Doc | null = null;
  private sharedText: YText | null = null;

  constructor() {
    super();
    this.tabData = {
      title: "Code",
      icon: "code",
    };
  }

  public init(ydoc: Doc, provider: WebrtcProvider): void {
    this.provider = provider;
    this.ydoc = ydoc;
    this.sharedText = this.ydoc.getText(this.constructor.name);
  }

  public getData(): string {
    return this.sharedText?.toString() || "";
  }

  public setData(data: string): void {
    if (this.sharedText) {
      this.sharedText.delete(0, this.sharedText.length);
      this.sharedText.insert(0, data);
    }
  }

  private onMount(editor: any) {
    if (!editor || !this.provider)
      return;

    const styleSheet = document.createElement("style");
    styleSheet.textContent = `
      .yRemoteSelection { background-color: rgba(250, 129, 0, 0.5); }
      .yRemoteSelectionHead {
          position: absolute;
          border-left: orange solid 2px;
          border-top: orange solid 2px;
          border-bottom: orange solid 2px;
          height: 100%;
          box-sizing: border-box;
        }
      .yRemoteSelectionHead::after {
          position: absolute;
          content: ' ';
          border: 3px solid orange;
          border-radius: 4px;
          left: -4px;
          top: -5px;
      };`;
    document.head.appendChild(styleSheet);
    if (!this.sharedText) return;
    new MonacoBinding(
      this.sharedText,
      editor.getModel(),
      new Set([editor]),
      this.provider.awareness
    );
    return () => {
      editor.dispose();
      document.head.removeChild(styleSheet);
    };
  }

  render() {
    return (
      <Editor className="monaco"
        defaultLanguage="lua"
        beforeMount={this.editorPreMount}
        theme={CodeTabTheme.MONACO_THEME_NAME}
        value="//test"
        onMount={(ed) => this.onMount(ed)}
        options={{ automaticLayout: true }} />
    );
  }
  editorPreMount(monaco: Monaco) {
    monaco.editor.defineTheme(CodeTabTheme.MONACO_THEME_NAME, CodeTabTheme.MONACO_THEME);
  }
}
