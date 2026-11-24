export interface V3Song {
  name: string;
  sequence: (string | null)[];
  loop: boolean;
  loopStart: number;
}
