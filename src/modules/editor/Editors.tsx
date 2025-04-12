import { SoundEditorTab } from "@modules/editor/tab/SoundEditorTab"
import { CodeEditorTab } from "@modules/editor/tab/CodeEditorTab"
import { MapEditorTab } from "./tab/MapEditorTab"
import { SpriteEditorTab } from "./tab/SpriteEditorTab"
import { useTheme } from "@theme/ThemeContext"
import { TabbedComponent, TabbedComponentPage } from "@modules/editor/tab/TabbedComponent"

export const Editors = () => {
    const theme = useTheme()
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
                    <TabbedComponentPage title="Code">
                        <CodeEditorTab />
                    </TabbedComponentPage>
                    <TabbedComponentPage title="Sprite">
                        <SpriteEditorTab />
                    </TabbedComponentPage>
                    <TabbedComponentPage title="Map">
                        <MapEditorTab />
                    </TabbedComponentPage>
                    <TabbedComponentPage title="Sound">
                        <SoundEditorTab />
                    </TabbedComponentPage>
                    
                </TabbedComponent>
            </div>
        </div>
    )
}





