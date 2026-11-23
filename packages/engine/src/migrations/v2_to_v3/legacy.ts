export interface V2Song {
  name: string;
  sequence: (string | null)[];
  loop: boolean;
  loopStart: number;
}
