import { type Monaco } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";

export const LUA_MARKER_OWNER = "naucto-lua-runtime";

type LuaCompletion = {
  label: string;
  detail: string;
  documentation: string;
  insertText: string;
  kind: "function" | "snippet" | "value";
};

const LUA_COMPLETIONS: LuaCompletion[] = [
  {
    label: "_init",
    detail: "function _init()",
    documentation: "Runs once when the game starts.",
    insertText: "function _init()\n  ${1:-- setup}\nend",
    kind: "snippet",
  },
  {
    label: "_update",
    detail: "function _update()",
    documentation: "Runs once per frame before drawing.",
    insertText: "function _update()\n  ${1:-- game logic}\nend",
    kind: "snippet",
  },
  {
    label: "_draw",
    detail: "function _draw()",
    documentation: "Runs once per frame after update.",
    insertText: "function _draw()\n  clear(${1:0})\n  ${2:-- drawing}\nend",
    kind: "snippet",
  },
  {
    label: "clear",
    detail: "clear(color)",
    documentation: "Clears the screen with the given palette color.",
    insertText: "clear(${1:color})",
    kind: "function",
  },
  {
    label: "sprite",
    detail: "sprite(index, x, y, width, height)",
    documentation: "Draws a sprite from the sprite sheet.",
    insertText: "sprite(${1:index}, ${2:x}, ${3:y}, ${4:1}, ${5:1})",
    kind: "function",
  },
  {
    label: "map",
    detail: "map(x, y)",
    documentation: "Draws the current map at a screen position.",
    insertText: "map(${1:x}, ${2:y})",
    kind: "function",
  },
  {
    label: "mget",
    detail: "mget(x, y)",
    documentation: "Returns the tile index at a map coordinate.",
    insertText: "mget(${1:x}, ${2:y})",
    kind: "function",
  },
  {
    label: "fget",
    detail: "fget(spriteIndex, bit)",
    documentation: "Reads sprite flags. Omit bit to read all flags.",
    insertText: "fget(${1:spriteIndex}, ${2:bit})",
    kind: "function",
  },
  {
    label: "key_pressed",
    detail: "key_pressed(key)",
    documentation: "Returns true while a keyboard key is pressed.",
    insertText: "key_pressed(\"${1:ArrowRight}\")",
    kind: "function",
  },
  {
    label: "camera",
    detail: "camera(x, y)",
    documentation: "Moves the camera offset.",
    insertText: "camera(${1:x}, ${2:y})",
    kind: "function",
  },
  {
    label: "line",
    detail: "line(color, x0, y0, x1, y1)",
    documentation: "Draws a line.",
    insertText: "line(${1:color}, ${2:x0}, ${3:y0}, ${4:x1}, ${5:y1})",
    kind: "function",
  },
  {
    label: "rect",
    detail: "rect(color, x, y, width, height)",
    documentation: "Draws a rectangle outline.",
    insertText: "rect(${1:color}, ${2:x}, ${3:y}, ${4:width}, ${5:height})",
    kind: "function",
  },
  {
    label: "fill_rect",
    detail: "fill_rect(color, x, y, width, height)",
    documentation: "Draws a filled rectangle.",
    insertText: "fill_rect(${1:color}, ${2:x}, ${3:y}, ${4:width}, ${5:height})",
    kind: "function",
  },
  {
    label: "set_col",
    detail: "set_col(from, to)",
    documentation: "Remaps one palette color to another.",
    insertText: "set_col(${1:from}, ${2:to})",
    kind: "function",
  },
  {
    label: "reset_col",
    detail: "reset_col()",
    documentation: "Resets palette remapping.",
    insertText: "reset_col()",
    kind: "function",
  },
  {
    label: "play_music",
    detail: "play_music(index)",
    documentation: "Starts a music track.",
    insertText: "play_music(${1:index})",
    kind: "function",
  },
  {
    label: "stop_music",
    detail: "stop_music()",
    documentation: "Stops the current music track.",
    insertText: "stop_music()",
    kind: "function",
  },
  {
    label: "print",
    detail: "print(...)",
    documentation: "Writes text to the game console.",
    insertText: "print(${1:value})",
    kind: "function",
  },
  {
    label: "net.host",
    detail: "net.host()",
    documentation: "Starts a network host.",
    insertText: "net.host()",
    kind: "function",
  },
  {
    label: "net.list",
    detail: "net.list()",
    documentation: "Lists available network sessions.",
    insertText: "net.list()",
    kind: "function",
  },
  {
    label: "ArrowLeft",
    detail: "key value",
    documentation: "Keyboard key value for key_pressed.",
    insertText: "ArrowLeft",
    kind: "value",
  },
  {
    label: "ArrowRight",
    detail: "key value",
    documentation: "Keyboard key value for key_pressed.",
    insertText: "ArrowRight",
    kind: "value",
  },
  {
    label: "ArrowUp",
    detail: "key value",
    documentation: "Keyboard key value for key_pressed.",
    insertText: "ArrowUp",
    kind: "value",
  },
  {
    label: "ArrowDown",
    detail: "key value",
    documentation: "Keyboard key value for key_pressed.",
    insertText: "ArrowDown",
    kind: "value",
  },
];

let luaLanguageFeaturesRegistered = false;

function getCompletionKind(monaco: Monaco, kind: LuaCompletion["kind"]): number {
  if (kind === "snippet") {
    return monaco.languages.CompletionItemKind.Snippet;
  }

  if (kind === "value") {
    return monaco.languages.CompletionItemKind.Value;
  }

  return monaco.languages.CompletionItemKind.Function;
}

export function registerLuaLanguageFeatures(monaco: Monaco): void {
  if (luaLanguageFeaturesRegistered) {
    return;
  }

  luaLanguageFeaturesRegistered = true;
  monaco.languages.registerCompletionItemProvider("lua", {
    triggerCharacters: ["_", ".", ":"],
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      return {
        suggestions: LUA_COMPLETIONS.map((completion) => ({
          label: completion.label,
          kind: getCompletionKind(monaco, completion.kind),
          detail: completion.detail,
          documentation: completion.documentation,
          insertText: completion.insertText,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        })),
      };
    },
  });
}

function parseLuaErrorLine(line: string): { lineNumber: number; message: string } | null {
  if (!line.includes("Error:")) {
    return null;
  }

  const patterns = [
    /\[string[^\]]*\]:(\d+):\s*(.+)$/u,
    /line\s+(\d+)[:\s-]+(.+)$/iu,
    /:(\d+):\s*(.+)$/u,
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (!match) {
      continue;
    }

    const lineNumber = Number(match[1]);
    if (!Number.isInteger(lineNumber) || lineNumber < 1) {
      continue;
    }

    return {
      lineNumber,
      message: match[2]?.trim() || line.trim(),
    };
  }

  return null;
}

export function getLuaErrorMarkers(
  monaco: Monaco,
  model: MonacoEditor.ITextModel,
  consoleOutput?: string,
): MonacoEditor.IMarkerData[] {
  if (!consoleOutput) {
    return [];
  }

  const markersByKey = new Map<string, MonacoEditor.IMarkerData>();
  const maxLine = model.getLineCount();

  consoleOutput
    .split("\n")
    .map(parseLuaErrorLine)
    .filter((error): error is { lineNumber: number; message: string } => error !== null)
    .forEach((error) => {
      const lineNumber = Math.min(error.lineNumber, maxLine);
      const key = `${lineNumber}:${error.message}`;

      markersByKey.set(key, {
        severity: monaco.MarkerSeverity.Error,
        message: error.message,
        startLineNumber: lineNumber,
        startColumn: 1,
        endLineNumber: lineNumber,
        endColumn: model.getLineMaxColumn(lineNumber),
      });
    });

  return Array.from(markersByKey.values());
}
