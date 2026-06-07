import { type Monaco } from "@monaco-editor/react";
import type { editor as MonacoEditor, languages, Position } from "monaco-editor";

export const LUA_MARKER_OWNER = "naucto-lua-runtime";

type LuaCompletionKind =
  | "field"
  | "function"
  | "keyword"
  | "module"
  | "snippet"
  | "value"
  | "variable";

type LuaCompletion = {
  label: string;
  detail: string;
  documentation: string;
  insertText?: string;
  kind: LuaCompletionKind;
};

type LuaSymbol = {
  label: string;
  detail: string;
  kind: Extract<LuaCompletionKind, "field" | "function" | "variable">;
};

type LuaSymbolTable = {
  globals: Map<string, LuaSymbol>;
  members: Map<string, Map<string, LuaSymbol>>;
};

const NAUCTO_COMPLETIONS: LuaCompletion[] = [
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
];

const LUA_KEYWORD_COMPLETIONS: LuaCompletion[] = [
  {
    label: "function",
    detail: "function name() ... end",
    documentation: "Defines a Lua function.",
    insertText: "function ${1:name}(${2:args})\n  ${3:-- body}\nend",
    kind: "snippet",
  },
  {
    label: "local",
    detail: "local name = value",
    documentation: "Declares a local variable.",
    insertText: "local ${1:name} = ${2:value}",
    kind: "snippet",
  },
  {
    label: "local function",
    detail: "local function name() ... end",
    documentation: "Declares a local function.",
    insertText: "local function ${1:name}(${2:args})\n  ${3:-- body}\nend",
    kind: "snippet",
  },
  {
    label: "if",
    detail: "if condition then ... end",
    documentation: "Runs code when a condition is true.",
    insertText: "if ${1:condition} then\n  ${2:-- body}\nend",
    kind: "snippet",
  },
  {
    label: "ifelse",
    detail: "if condition then ... else ... end",
    documentation: "Runs one of two blocks based on a condition.",
    insertText: "if ${1:condition} then\n  ${2:-- body}\nelse\n  ${3:-- fallback}\nend",
    kind: "snippet",
  },
  {
    label: "for",
    detail: "for i = start, stop do ... end",
    documentation: "Runs a numeric loop.",
    insertText: "for ${1:i} = ${2:1}, ${3:10} do\n  ${4:-- body}\nend",
    kind: "snippet",
  },
  {
    label: "forin",
    detail: "for key, value in pairs(table) do ... end",
    documentation: "Runs an iterator loop.",
    insertText: "for ${1:key}, ${2:value} in pairs(${3:table}) do\n  ${4:-- body}\nend",
    kind: "snippet",
  },
  {
    label: "while",
    detail: "while condition do ... end",
    documentation: "Runs while a condition is true.",
    insertText: "while ${1:condition} do\n  ${2:-- body}\nend",
    kind: "snippet",
  },
  {
    label: "repeat",
    detail: "repeat ... until condition",
    documentation: "Runs until a condition becomes true.",
    insertText: "repeat\n  ${1:-- body}\nuntil ${2:condition}",
    kind: "snippet",
  },
  {
    label: "return",
    detail: "return value",
    documentation: "Returns from the current function.",
    insertText: "return ${1:value}",
    kind: "keyword",
  },
  {
    label: "end",
    detail: "end",
    documentation: "Closes a block.",
    kind: "keyword",
  },
  {
    label: "then",
    detail: "then",
    documentation: "Starts an if block body.",
    kind: "keyword",
  },
  {
    label: "do",
    detail: "do",
    documentation: "Starts a loop or block body.",
    kind: "keyword",
  },
  {
    label: "else",
    detail: "else",
    documentation: "Starts an else block.",
    kind: "keyword",
  },
  {
    label: "elseif",
    detail: "elseif condition then",
    documentation: "Adds another branch to an if block.",
    insertText: "elseif ${1:condition} then",
    kind: "snippet",
  },
  {
    label: "true",
    detail: "boolean",
    documentation: "Lua boolean true.",
    kind: "value",
  },
  {
    label: "false",
    detail: "boolean",
    documentation: "Lua boolean false.",
    kind: "value",
  },
  {
    label: "nil",
    detail: "nil",
    documentation: "Lua nil value.",
    kind: "value",
  },
];

const LUA_BASE_COMPLETIONS: LuaCompletion[] = [
  {
    label: "print",
    detail: "print(...)",
    documentation: "Writes text to the game console.",
    insertText: "print(${1:value})",
    kind: "function",
  },
  {
    label: "pairs",
    detail: "pairs(table)",
    documentation: "Iterates over table keys and values.",
    insertText: "pairs(${1:table})",
    kind: "function",
  },
  {
    label: "ipairs",
    detail: "ipairs(table)",
    documentation: "Iterates over array-like table values.",
    insertText: "ipairs(${1:table})",
    kind: "function",
  },
  {
    label: "tonumber",
    detail: "tonumber(value)",
    documentation: "Converts a value to a number when possible.",
    insertText: "tonumber(${1:value})",
    kind: "function",
  },
  {
    label: "tostring",
    detail: "tostring(value)",
    documentation: "Converts a value to a string.",
    insertText: "tostring(${1:value})",
    kind: "function",
  },
  {
    label: "type",
    detail: "type(value)",
    documentation: "Returns the Lua type name for a value.",
    insertText: "type(${1:value})",
    kind: "function",
  },
  {
    label: "math",
    detail: "Lua math library",
    documentation: "Math functions and constants.",
    kind: "module",
  },
  {
    label: "string",
    detail: "Lua string library",
    documentation: "String helper functions.",
    kind: "module",
  },
  {
    label: "table",
    detail: "Lua table library",
    documentation: "Table helper functions.",
    kind: "module",
  },
  {
    label: "net",
    detail: "Naucto network API",
    documentation: "Network helper functions.",
    kind: "module",
  },
];

const KEY_VALUE_COMPLETIONS: LuaCompletion[] = [
  {
    label: "ArrowLeft",
    detail: "key value",
    documentation: "Keyboard key value for key_pressed.",
    kind: "value",
  },
  {
    label: "ArrowRight",
    detail: "key value",
    documentation: "Keyboard key value for key_pressed.",
    kind: "value",
  },
  {
    label: "ArrowUp",
    detail: "key value",
    documentation: "Keyboard key value for key_pressed.",
    kind: "value",
  },
  {
    label: "ArrowDown",
    detail: "key value",
    documentation: "Keyboard key value for key_pressed.",
    kind: "value",
  },
];

const MODULE_COMPLETIONS = new Map<string, LuaCompletion[]>([
  ["net", [
    {
      label: "host",
      detail: "net.host()",
      documentation: "Starts a network host.",
      insertText: "host()",
      kind: "function",
    },
    {
      label: "list",
      detail: "net.list()",
      documentation: "Lists available network sessions.",
      insertText: "list()",
      kind: "function",
    },
  ]],
  ["math", [
    { label: "abs", detail: "math.abs(x)", documentation: "Returns the absolute value.", insertText: "abs(${1:x})", kind: "function" },
    { label: "ceil", detail: "math.ceil(x)", documentation: "Rounds up.", insertText: "ceil(${1:x})", kind: "function" },
    { label: "cos", detail: "math.cos(x)", documentation: "Returns cosine.", insertText: "cos(${1:x})", kind: "function" },
    { label: "floor", detail: "math.floor(x)", documentation: "Rounds down.", insertText: "floor(${1:x})", kind: "function" },
    { label: "max", detail: "math.max(...)", documentation: "Returns the maximum value.", insertText: "max(${1:a}, ${2:b})", kind: "function" },
    { label: "min", detail: "math.min(...)", documentation: "Returns the minimum value.", insertText: "min(${1:a}, ${2:b})", kind: "function" },
    { label: "pi", detail: "math.pi", documentation: "Pi constant.", kind: "value" },
    { label: "random", detail: "math.random(min, max)", documentation: "Returns a random number.", insertText: "random(${1:min}, ${2:max})", kind: "function" },
    { label: "sin", detail: "math.sin(x)", documentation: "Returns sine.", insertText: "sin(${1:x})", kind: "function" },
    { label: "sqrt", detail: "math.sqrt(x)", documentation: "Returns square root.", insertText: "sqrt(${1:x})", kind: "function" },
  ]],
  ["string", [
    { label: "find", detail: "string.find(s, pattern)", documentation: "Finds a pattern in a string.", insertText: "find(${1:s}, ${2:pattern})", kind: "function" },
    { label: "format", detail: "string.format(format, ...)", documentation: "Formats a string.", insertText: "format(${1:format}, ${2:value})", kind: "function" },
    { label: "len", detail: "string.len(s)", documentation: "Returns string length.", insertText: "len(${1:s})", kind: "function" },
    { label: "lower", detail: "string.lower(s)", documentation: "Converts to lowercase.", insertText: "lower(${1:s})", kind: "function" },
    { label: "sub", detail: "string.sub(s, i, j)", documentation: "Returns a substring.", insertText: "sub(${1:s}, ${2:i}, ${3:j})", kind: "function" },
    { label: "upper", detail: "string.upper(s)", documentation: "Converts to uppercase.", insertText: "upper(${1:s})", kind: "function" },
  ]],
  ["table", [
    { label: "concat", detail: "table.concat(list, sep)", documentation: "Concatenates table values.", insertText: "concat(${1:list}, ${2:sep})", kind: "function" },
    { label: "insert", detail: "table.insert(list, value)", documentation: "Inserts into a table.", insertText: "insert(${1:list}, ${2:value})", kind: "function" },
    { label: "remove", detail: "table.remove(list, pos)", documentation: "Removes from a table.", insertText: "remove(${1:list}, ${2:pos})", kind: "function" },
    { label: "sort", detail: "table.sort(list)", documentation: "Sorts a table in place.", insertText: "sort(${1:list})", kind: "function" },
  ]],
]);

const LUA_KEYWORDS = [
  "and",
  "break",
  "do",
  "else",
  "elseif",
  "end",
  "for",
  "function",
  "goto",
  "if",
  "in",
  "local",
  "not",
  "or",
  "repeat",
  "return",
  "then",
  "until",
  "while",
];

const LUA_CONSTANTS = ["false", "nil", "true"];

const NAUCTO_API_NAMES = NAUCTO_COMPLETIONS
  .filter((completion) => completion.kind === "function")
  .map((completion) => completion.label);

const NAUCTO_LIFECYCLE_NAMES = ["_init", "_update", "_draw"];

const LUA_BASE_FUNCTION_NAMES = LUA_BASE_COMPLETIONS
  .filter((completion) => completion.kind === "function")
  .map((completion) => completion.label);

const LUA_MODULE_NAMES = LUA_BASE_COMPLETIONS
  .filter((completion) => completion.kind === "module")
  .map((completion) => completion.label);

let luaLanguageFeaturesRegistered = false;

function registerLuaColorization(monaco: Monaco): void {
  monaco.languages.setMonarchTokensProvider("lua", {
    defaultToken: "identifier",
    tokenPostfix: ".lua",
    keywords: LUA_KEYWORDS,
    constants: LUA_CONSTANTS,
    nauctoApi: NAUCTO_API_NAMES,
    lifecycle: NAUCTO_LIFECYCLE_NAMES,
    baseFunctions: LUA_BASE_FUNCTION_NAMES,
    modules: LUA_MODULE_NAMES,
    operators: [
      "+",
      "-",
      "*",
      "/",
      "%",
      "^",
      "#",
      "==",
      "~=",
      "<=",
      ">=",
      "<",
      ">",
      "=",
      ";",
      ":",
      ",",
      ".",
      "..",
      "...",
    ],
    symbols: /[=><!~?:&|+*/^%-]+/,
    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
    brackets: [
      { token: "delimiter.bracket", open: "{", close: "}" },
      { token: "delimiter.array", open: "[", close: "]" },
      { token: "delimiter.parenthesis", open: "(", close: ")" },
    ],
    tokenizer: {
      root: [
        { include: "@whitespace" },
        [/(local)(\s+)(function)(\s+)([A-Za-z_][A-Za-z0-9_]*)/, ["keyword.declaration", "", "keyword.declaration", "", "entity.name.function"]],
        [/(function)(\s+)([A-Za-z_][A-Za-z0-9_]*(?:[.:][A-Za-z_][A-Za-z0-9_]*)?)/, ["keyword.declaration", "", "entity.name.function"]],
        [/([A-Za-z_][A-Za-z0-9_]*)(\s*)(=)/, ["variable", "", "operator"]],
        [/(\.)([A-Za-z_][A-Za-z0-9_]*)/, ["delimiter", "variable.property"]],
        [
          /[A-Za-z_][A-Za-z0-9_]*(?=\s*\()/,
          {
            cases: {
              "@lifecycle": "naucto.lifecycle",
              "@nauctoApi": "naucto.function",
              "@baseFunctions": "support.function",
              "@default": "entity.name.function",
            },
          },
        ],
        [
          /[A-Za-z_][A-Za-z0-9_]*/,
          {
            cases: {
              "@keywords": "keyword.control",
              "@constants": "constant.language",
              "@lifecycle": "naucto.lifecycle",
              "@nauctoApi": "naucto.function",
              "@baseFunctions": "support.function",
              "@modules": "support.module",
              "@default": "identifier",
            },
          },
        ],
        [/[{}()[\]]/, "@brackets"],
        [/@symbols/, { cases: { "@operators": "operator", "@default": "delimiter" } }],
        [/\d*\.\d+([eE][-+]?\d+)?/, "number.float"],
        [/0[xX][0-9a-fA-F_]*[0-9a-fA-F]/, "number.hex"],
        [/\d+/, "number"],
        [/[;,.]/, "delimiter"],
        [/"([^"\\]|\\.)*$/, "string.invalid"],
        [/'([^'\\]|\\.)*$/, "string.invalid"],
        [/"/, "string", "@stringDouble"],
        [/'/, "string", "@stringSingle"],
      ],
      whitespace: [
        [/[ \t\r\n]+/, ""],
        [/--\[([=]*)\[/, "comment", "@comment.$1"],
        [/--.*$/, "comment"],
      ],
      comment: [
        [/[^\]]+/, "comment"],
        [/\]([=]*)\]/, { cases: { "$1==$S2": { token: "comment", next: "@pop" }, "@default": "comment" } }],
        [/./, "comment"],
      ],
      stringDouble: [
        [/[^\\"]+/, "string"],
        [/@escapes/, "string.escape"],
        [/\\./, "string.escape.invalid"],
        [/"/, "string", "@pop"],
      ],
      stringSingle: [
        [/[^\\']+/, "string"],
        [/@escapes/, "string.escape"],
        [/\\./, "string.escape.invalid"],
        [/'/, "string", "@pop"],
      ],
    },
  } satisfies languages.IMonarchLanguage);
}

function getCompletionKind(monaco: Monaco, kind: LuaCompletionKind): languages.CompletionItemKind {
  switch (kind) {
    case "field":
      return monaco.languages.CompletionItemKind.Field;
    case "keyword":
      return monaco.languages.CompletionItemKind.Keyword;
    case "module":
      return monaco.languages.CompletionItemKind.Module;
    case "snippet":
      return monaco.languages.CompletionItemKind.Snippet;
    case "value":
      return monaco.languages.CompletionItemKind.Value;
    case "variable":
      return monaco.languages.CompletionItemKind.Variable;
    default:
      return monaco.languages.CompletionItemKind.Function;
  }
}

function stripLineComment(line: string): string {
  return line.replace(/--.*$/u, "");
}

function getTextBeforePosition(model: MonacoEditor.ITextModel, position: Position): string {
  return model.getValueInRange({
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  });
}

function addGlobal(symbols: LuaSymbolTable, symbol: LuaSymbol): void {
  if (!symbols.globals.has(symbol.label)) {
    symbols.globals.set(symbol.label, symbol);
  }
}

function addMember(symbols: LuaSymbolTable, owner: string, symbol: LuaSymbol): void {
  if (!symbols.members.has(owner)) {
    symbols.members.set(owner, new Map());
  }

  symbols.members.get(owner)?.set(symbol.label, symbol);
}

function parseNames(rawNames: string): string[] {
  return rawNames
    .split(",")
    .map((name) => name.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)/u)?.[1])
    .filter((name): name is string => name !== undefined);
}

function findMatchingBrace(source: string, openBraceIndex: number): number {
  let depth = 0;

  for (let index = openBraceIndex; index < source.length; index += 1) {
    if (source[index] === "{") {
      depth += 1;
    } else if (source[index] === "}") {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  return source.length - 1;
}

function skipWhitespace(source: string, index: number): number {
  let nextIndex = index;

  while (/\s/u.test(source[nextIndex] ?? "")) {
    nextIndex += 1;
  }

  return nextIndex;
}

function readIdentifier(source: string, index: number): { identifier: string; nextIndex: number } | null {
  const match = source.slice(index).match(/^([A-Za-z_][A-Za-z0-9_]*)/u);

  if (!match) {
    return null;
  }

  return {
    identifier: match[1],
    nextIndex: index + match[1].length,
  };
}

function skipValue(source: string, index: number): number {
  let nextIndex = index;
  let depth = 0;

  while (nextIndex < source.length) {
    const char = source[nextIndex];

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      if (depth === 0) {
        return nextIndex;
      }
      depth -= 1;
    } else if (char === "," && depth === 0) {
      return nextIndex + 1;
    }

    nextIndex += 1;
  }

  return nextIndex;
}

function parseTopLevelTableFields(body: string): Array<{ name: string; nestedBody?: string }> {
  const fields: Array<{ name: string; nestedBody?: string }> = [];
  let index = 0;

  while (index < body.length) {
    index = skipWhitespace(body, index);

    if (body[index] === ",") {
      index += 1;
      continue;
    }

    const identifier = readIdentifier(body, index);
    if (!identifier) {
      index += 1;
      continue;
    }

    index = skipWhitespace(body, identifier.nextIndex);

    if (body[index] !== "=") {
      index = skipValue(body, index);
      continue;
    }

    index = skipWhitespace(body, index + 1);

    if (body[index] === "{") {
      const closeIndex = findMatchingBrace(body, index);
      fields.push({
        name: identifier.identifier,
        nestedBody: body.slice(index + 1, closeIndex),
      });
      index = closeIndex + 1;
      continue;
    }

    fields.push({ name: identifier.identifier });
    index = skipValue(body, index);
  }

  return fields;
}

function addTableMembers(symbols: LuaSymbolTable, owner: string, body: string): void {
  parseTopLevelTableFields(body).forEach((field) => {
    addMember(symbols, owner, {
      label: field.name,
      detail: `${owner}.${field.name}`,
      kind: "field",
    });

    if (field.nestedBody) {
      addTableMembers(symbols, `${owner}.${field.name}`, field.nestedBody);
    }
  });
}

function collectTableConstructors(symbols: LuaSymbolTable, sourceBeforeCursor: string): void {
  const tableStartPattern = /(?:local\s+)?([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*=\s*\{/gu;
  let match = tableStartPattern.exec(sourceBeforeCursor);

  while (match) {
    const owner = match[1];
    const openBraceIndex = tableStartPattern.lastIndex - 1;
    const closeIndex = findMatchingBrace(sourceBeforeCursor, openBraceIndex);
    addTableMembers(symbols, owner, sourceBeforeCursor.slice(openBraceIndex + 1, closeIndex));
    tableStartPattern.lastIndex = closeIndex + 1;
    match = tableStartPattern.exec(sourceBeforeCursor);
  }
}

function collectLuaSymbols(sourceBeforeCursor: string): LuaSymbolTable {
  const symbols: LuaSymbolTable = {
    globals: new Map(),
    members: new Map(),
  };
  const lines = sourceBeforeCursor.split("\n").map(stripLineComment);

  lines.forEach((line) => {
    const localFunctionMatch = line.match(/^\s*local\s+function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/u);
    if (localFunctionMatch) {
      addGlobal(symbols, {
        label: localFunctionMatch[1],
        detail: "local function",
        kind: "function",
      });
      return;
    }

    const functionMatch = line.match(/^\s*function\s+([A-Za-z_][A-Za-z0-9_]*(?:[.:][A-Za-z_][A-Za-z0-9_]*)?)\s*\(/u);
    if (functionMatch) {
      const functionName = functionMatch[1];
      const memberMatch = functionName.match(/^([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)[.:]([A-Za-z_][A-Za-z0-9_]*)$/u);

      if (memberMatch) {
        addMember(symbols, memberMatch[1], {
          label: memberMatch[2],
          detail: "function",
          kind: "function",
        });
      } else {
        addGlobal(symbols, {
          label: functionName,
          detail: "function",
          kind: "function",
        });
      }
      return;
    }

    const localMatch = line.match(/^\s*local\s+(.+?)(?:=|$)/u);
    if (localMatch) {
      parseNames(localMatch[1]).forEach((name) => {
        addGlobal(symbols, {
          label: name,
          detail: "local variable",
          kind: "variable",
        });
      });
    }

    const assignmentMatch = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/u);
    if (assignmentMatch) {
      addGlobal(symbols, {
        label: assignmentMatch[1],
        detail: "variable",
        kind: "variable",
      });
    }

    const memberAssignmentMatch = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\.([A-Za-z_][A-Za-z0-9_]*)\s*=/u);
    if (memberAssignmentMatch) {
      addMember(symbols, memberAssignmentMatch[1], {
        label: memberAssignmentMatch[2],
        detail: "table field",
        kind: "field",
      });
    }
  });

  collectTableConstructors(symbols, sourceBeforeCursor);

  return symbols;
}

function getMemberContext(model: MonacoEditor.ITextModel, position: Position): string | null {
  const linePrefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
  const match = linePrefix.match(/([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)[.:][A-Za-z0-9_]*$/u);

  return match?.[1] ?? null;
}

function getCompletionRange(model: MonacoEditor.ITextModel, position: Position): languages.CompletionItem["range"] {
  const word = model.getWordUntilPosition(position);

  return {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endColumn: word.endColumn,
  };
}

function completionToSuggestion(
  monaco: Monaco,
  completion: LuaCompletion,
  range: languages.CompletionItem["range"],
  sortPrefix: string,
): languages.CompletionItem {
  return {
    label: completion.label,
    kind: getCompletionKind(monaco, completion.kind),
    detail: completion.detail,
    documentation: completion.documentation,
    insertText: completion.insertText ?? completion.label,
    insertTextRules: completion.insertText
      ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
      : undefined,
    range,
    sortText: `${sortPrefix}${completion.label}`,
  };
}

function symbolToSuggestion(
  monaco: Monaco,
  symbol: LuaSymbol,
  range: languages.CompletionItem["range"],
  sortPrefix: string,
): languages.CompletionItem {
  return {
    label: symbol.label,
    kind: getCompletionKind(monaco, symbol.kind),
    detail: symbol.detail,
    documentation: "Found in your code before the cursor.",
    insertText: symbol.label,
    range,
    sortText: `${sortPrefix}${symbol.label}`,
  };
}

function dedupeSuggestions(suggestions: languages.CompletionItem[]): languages.CompletionItem[] {
  const seen = new Set<string>();

  return suggestions.filter((suggestion) => {
    const label = typeof suggestion.label === "string"
      ? suggestion.label
      : suggestion.label.label;

    if (seen.has(label)) {
      return false;
    }

    seen.add(label);
    return true;
  });
}

export function registerLuaLanguageFeatures(monaco: Monaco): void {
  if (luaLanguageFeaturesRegistered) {
    return;
  }

  luaLanguageFeaturesRegistered = true;
  registerLuaColorization(monaco);
  monaco.languages.registerCompletionItemProvider("lua", {
    triggerCharacters: ["_", ".", ":", "\"", "'"],
    provideCompletionItems: (model: MonacoEditor.ITextModel, position: Position) => {
      const range = getCompletionRange(model, position);
      const symbols = collectLuaSymbols(getTextBeforePosition(model, position));
      const memberContext = getMemberContext(model, position);

      if (memberContext) {
        const moduleCompletions = MODULE_COMPLETIONS.get(memberContext) ?? [];
        const memberSymbols = Array.from(symbols.members.get(memberContext)?.values() ?? []);

        return {
          suggestions: dedupeSuggestions([
            ...memberSymbols.map((symbol) => symbolToSuggestion(monaco, symbol, range, "0")),
            ...moduleCompletions.map((completion) => completionToSuggestion(monaco, completion, range, "1")),
          ]),
        };
      }

      return {
        suggestions: dedupeSuggestions([
          ...Array.from(symbols.globals.values()).map((symbol) => symbolToSuggestion(monaco, symbol, range, "0")),
          ...NAUCTO_COMPLETIONS.map((completion) => completionToSuggestion(monaco, completion, range, "1")),
          ...LUA_BASE_COMPLETIONS.map((completion) => completionToSuggestion(monaco, completion, range, "2")),
          ...LUA_KEYWORD_COMPLETIONS.map((completion) => completionToSuggestion(monaco, completion, range, "3")),
          ...KEY_VALUE_COMPLETIONS.map((completion) => completionToSuggestion(monaco, completion, range, "4")),
        ]),
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
