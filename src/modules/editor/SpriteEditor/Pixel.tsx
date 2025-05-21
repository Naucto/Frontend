const nbColors = 32;

export class Pixel {
    constructor(
      public x: number,
      public y: number,
      public color: number
    ) {
        if (color < 0 || color >= nbColors) {
            throw new Error("Color must be between 0 and " + nbColors);
        }
    }
  }