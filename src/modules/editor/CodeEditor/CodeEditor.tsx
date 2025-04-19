import IEditor from "../IEditor";

import Editor, { Monaco } from '@monaco-editor/react';

import CodeTabTheme from '@modules/editor/CodeEditor/CodeTabTheme.ts';
import { Doc } from "yjs";

export class CodeEditor extends IEditor {
  constructor() {
    super();
    this.tabData = {
      title: "Code",
      icon: "code",
    };
  }

  public init(doc: Doc): void {
    throw new Error("Method not implemented.");
  }

  handleEditorChange(value: string | undefined) {
    if (!value) return;
  }

  render() {
    return (
      <Editor className="monaco"
        defaultLanguage="lua"
        beforeMount={this.editorPreMount}
        theme={CodeTabTheme.MONACO_THEME_NAME}
        onChange={this.handleEditorChange}
        value="//test"
        options={{ automaticLayout: true }} />
    );
  }
  editorPreMount(monaco: Monaco) {
    monaco.editor.defineTheme(CodeTabTheme.MONACO_THEME_NAME, CodeTabTheme.MONACO_THEME);
  }
}

