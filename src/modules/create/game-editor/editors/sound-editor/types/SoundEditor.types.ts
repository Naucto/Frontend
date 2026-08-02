import { MusicData } from "../Music";

export interface InstrumentButtonsProps {
  instruments: Map<string, string>;
  currentInstrument: string;
  onInstrumentSelect: (instrument: string) => void;
  customInstruments: Set<string>;
  onEdit?: (instrument: string) => void;
  onDelete?: (instrument: string) => void;
}

export interface MusicSelectionButtonsProps {
  musics: MusicData[];
  selectedMusicIndex: number;
  onMusicSelect: (index: number) => void;
}

export interface ControlButtonsProps {
  isPlaying: boolean;
  onPlay: () => void;
  onStop: () => void;
  onClear: () => void;
}

export interface ProgressBarProps {
  progress: number;
  onSeek: (position: number) => void;
  totalLength: number;
  maxLength: number;
}

