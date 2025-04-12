import * as React from 'react';
import { SoundEditorBalise } from "@modules/editor/SoundEditor/SoundEditor"

interface SoundEditorTabProps {
}

class SoundEditorTab extends React.Component<SoundEditorTabProps> {
  constructor(props: SoundEditorTabProps) {
    super(props);
  }
  render() {
    return (
      <SoundEditorBalise/>
    );
  }
}

export {SoundEditorTab};