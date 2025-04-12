import IEditor from "@modules/editor/IEditor"

import { useTheme } from "@theme/ThemeContext"
import { TabbedComponent, TabbedComponentPage } from "@modules/editor/tab/TabbedComponent"

export class EditorManager {

    public constructor() {}

    private editors: IEditor[] = []
    public addEditor(editor: IEditor) {
        console.log("EditorManager addEditor", editor.tabData.title)
        const index = this.editors.indexOf(editor)
        if (index > -1) {
            this.editors.splice(index, 1)
        }
        this.editors.push(editor)
    }
    public removeEditor(editor: IEditor) {
        const index = this.editors.indexOf(editor)
        if (index > -1) {
            this.editors.splice(index, 1)
        }
    }
    public getEditors(): IEditor[] {
        return this.editors
    }

    render() {
        const theme = useTheme();
        return (
            <div
                style={{
                    backgroundColor: theme.colors.background,
                    color: theme.colors.text,
                    fontFamily: theme.typography.fontFamily,
                    fontSize: theme.typography.fontSize,
                }}
            >
                <div className="editor">
                    <TabbedComponent>
                        {this.editors.map((editor, index) => (
                            <TabbedComponentPage key={index} title={editor.tabData.title}>
                                {editor.render()}
                            </TabbedComponentPage>
                        ))}
                    </TabbedComponent>
                </div>
            </div>
        )
    }
}





