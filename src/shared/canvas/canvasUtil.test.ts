import { SpriteSheet } from "src/types/SpriteSheetType";
import {
  convertSpritesheetToIndexArray,
  hexToRGBArray,
  getRGBArraysFromPalette,
  rectangleToVertices
} from "./glUtils";

describe("Feature: Utilities (non-WebGL)", () => {
  describe("Convert a hex spritesheet string into an index Uint8Array", () => {
    test("Given a spritesheet of size 2x2 and data '0a00ff10' When I convert it Then I get [10,0,255,16]", () => {
      const spriteSheet: SpriteSheet = {
        size: { width: 2, height: 2 },
        stride: 2,
        spriteSize: { width: 1, height: 1 },
        spriteSheet: "0a00ff10"
      };

      const result = convertSpritesheetToIndexArray(spriteSheet);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(4);
      expect(Array.from(result)).toEqual([10, 0, 255, 16]);
    });
  });

  describe("Parse hex colors", () => {
    test("Given the hex '#112233' When I parse it Then I get [17,34,51,255]", () => {
      const rgba = hexToRGBArray("#112233");
      expect(rgba).toEqual([0x11, 0x22, 0x33, 255]);
    });

    test("Given the hex '#FF00AA' and alpha 128 When I parse it Then I get [255,0,170,128]", () => {
      const rgba = hexToRGBArray("#FF00AA", 128);
      expect(rgba).toEqual([255, 0, 170, 128]);
    });

    test("Given an invalid hex string When I parse it Then a ColorFormatError is thrown", () => {

      const string_list = ["shouldntwork", "1", "12345", "12345g"];
      string_list.forEach((s) => {
        expect(() => hexToRGBArray(s)).toThrow("Invalid hex color: " + s);
      });
    });
  });

  describe("Flatten palette into RGBA arrays", () => {
    test("Given a palette ['#000000','#ffffff','#123456'] When I flatten it Then I get correct RGBA with first transparent", () => {
      const palette = ["#000000", "#ffffff", "#123456"];
      const flat = getRGBArraysFromPalette(palette);
      expect(flat.length).toBe(12);
      expect(flat.slice(0, 4)).toEqual([0, 0, 0, 0]);
      expect(flat.slice(4, 8)).toEqual([255, 255, 255, 255]);
      expect(flat.slice(8, 12)).toEqual([0x12, 0x34, 0x56, 255]);
    });

    test("Given a palette and zero alpha index 2 When I flatten it Then the 3rd color is transparent", () => {
      const palette = ["#010101", "#020202", "#030303"];
      const flat = getRGBArraysFromPalette(palette, 2);
      const third = flat.slice(8, 12);
      expect(third).toEqual([3, 3, 3, 0]);
    });
  });

  describe("Generate vertices for a rectangle", () => {
    test("Given a rectangle at (10,20) size (30x40) When I convert it Then I get 6 vertices in Float32Array", () => {
      const arr = rectangleToVertices(10, 20, 30, 40);
      expect(arr).toBeInstanceOf(Float32Array);
      expect(arr.length).toBe(12);
      expect(Array.from(arr)).toEqual([
        10, 20,
        40, 20,
        10, 60,
        10, 60,
        40, 20,
        40, 60
      ]);
    });
  });
});
