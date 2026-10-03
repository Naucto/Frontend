import type { LuaCallable } from '../vm/LuaEnvironment';

/**
 * One argument of a Lua function: what the reference says of it, and how the value Lua pushed is
 * read into the one the method takes.
 */
export interface LuaParam<T> {
  readonly name: string;
  /** The Lua type the reference shows, unions written `number|string`. */
  readonly type: string;
  readonly optional: boolean;
  /** The Lua expression a left-out argument reads as, when there is one to show. */
  readonly default?: string;
  /** How the signature writes the argument, when its name alone would not say it. */
  readonly signature?: string;
  /**
   * Reads every argument from its position on, handed to `read` as one list; only the last
   * parameter may.
   */
  readonly rest?: boolean;
  /**
   * `given` is false for an argument left off the call, true for one passed even as nil: Lua keeps
   * the two apart and some functions answer them differently. A throw names what was expected,
   * and the binding turns it into Lua's `bad argument` error.
   */
  read(value: unknown, given: boolean): T;
}

type Values<P extends readonly LuaParam<unknown>[]> = {
  -readonly [K in keyof P]: P[K] extends LuaParam<infer T> ? T : never;
};

/**
 * The public methods of `Api` that take `Args` as they stand. A method taking fewer arguments than
 * the spec reads is refused, though TypeScript lets a shorter function stand in for a longer one:
 * the argument it would drop is one the reference documents.
 */
type MethodMatching<Api, Args extends unknown[]> = {
  [Name in keyof Api]: Api[Name] extends (...taken: infer Taken) => unknown
    ? Args extends Taken
      ? Name
      : never
    : never;
}[keyof Api] &
  string;

type Method = (...values: unknown[]) => unknown;

export interface LuaFunction<Api> {
  readonly kind: 'function';
  readonly summary: string;
  readonly params: readonly LuaParam<unknown>[];
  /** The Lua type of what it returns, `number|nil` for several values; null for nothing. */
  readonly returns: string | null;
  /** Several values returned as an array reach Lua as several return values. */
  call(api: Api, values: unknown[]): unknown;
}

/** A member Lua reads rather than calls, such as a table built once per run. */
export interface LuaValue<Api> {
  readonly kind: 'value';
  readonly summary: string;
  readonly type: string;
  value(api: Api): unknown;
}

export type LuaMember<Api> = LuaFunction<Api> | LuaValue<Api>;

export interface LuaNamespace<Api> {
  readonly name: string;
  readonly members: Readonly<Record<string, LuaMember<Api>>>;
}

/** Called as `defineLuaNamespace<Api>(…)`: the members name methods of `Api`, which nothing else infers. */
export const defineLuaNamespace = <Api>(
  name: string,
  members: Record<string, LuaMember<Api>>,
): LuaNamespace<Api> => ({ name, members });

export const luaFn = <Api, const P extends readonly LuaParam<unknown>[]>(
  spec: { summary: string; params: P; returns: string | null },
  method: NoInfer<MethodMatching<Api, Values<P>>>,
): LuaFunction<Api> => ({
  kind: 'function',
  ...spec,
  call: (api, values) => (api[method] as Method).apply(api, values),
});

export const luaValue = <Api>(
  spec: { summary: string; type: string },
  method: NoInfer<MethodMatching<Api, []>>,
): LuaValue<Api> => ({
  kind: 'value',
  ...spec,
  value: (api) => (api[method] as Method).call(api),
});

/**
 * A scalar parameter, three ways: required, reading as `fallback` (the type's zero unless given)
 * when the value is missing or of another type; optional with a `default`; or optional with none,
 * reading as undefined, `defaultsTo` then describing what the function makes of that.
 */
interface ScalarParam<T> {
  (name: string, options?: { fallback?: T }): LuaParam<T>;
  (name: string, options: { default: T }): LuaParam<T>;
  (name: string, options: { optional: true; defaultsTo?: string }): LuaParam<T | undefined>;
}

interface ScalarOptions<T> {
  fallback?: T;
  default?: T;
  optional?: true;
  defaultsTo?: string;
}

const luaLiteral = (value: unknown): string =>
  typeof value === 'string' ? JSON.stringify(value) : String(value);

const scalar = <T>(
  type: string,
  zero: T,
  coerce: (value: unknown) => T | undefined,
): ScalarParam<T> =>
  ((name: string, options: ScalarOptions<T> = {}): LuaParam<T | undefined> => {
    const optional = options.optional === true || options.default !== undefined;
    const otherwise = options.default ?? options.fallback ?? (optional ? undefined : zero);
    return {
      name,
      type,
      optional,
      default: options.default === undefined ? options.defaultsTo : luaLiteral(options.default),
      read: (value) => coerce(value) ?? otherwise,
    };
  }) as ScalarParam<T>;

const finite = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const floored = (value: unknown): number | undefined => {
  const number = finite(value);
  return number === undefined ? undefined : Math.floor(number);
};

interface FunctionParam {
  (name: string): LuaParam<LuaCallable>;
  (name: string, options: { optional: true }): LuaParam<LuaCallable | undefined>;
}

export const param = {
  number: scalar('number', 0, finite),
  int: scalar('number', 0, floored),
  /**
   * A position Lua counts from 1, read as the 0-based one the host counts with. The default is
   * written as Lua writes it, so a default of 1 reads as 0.
   */
  index: (name: string, options: { default: number }): LuaParam<number> => ({
    name,
    type: 'number',
    optional: true,
    default: String(options.default),
    read: (value) => (floored(value) ?? options.default) - 1,
  }),
  /** Lua's truth: nil and false are false, anything else -- 0 and "" too -- is true. */
  bool: scalar('boolean', false, (value) =>
    value === undefined || value === null ? undefined : value !== false,
  ),
  /** A number is read as Lua writes it, as Lua's own string functions do. */
  string: scalar('string', '', (value) =>
    typeof value === 'string' ? value : typeof value === 'number' ? String(value) : undefined,
  ),
  /** A table read out of the VM is a copy: what the method changes in it stays on the host. */
  table: scalar<Readonly<Record<string, unknown>>>('table', Object.freeze({}), (value) =>
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined,
  ),
  function: ((
    name: string,
    options: { optional?: true } = {},
  ): LuaParam<LuaCallable | undefined> => ({
    name,
    type: 'function',
    optional: options.optional === true,
    read: (value) => {
      if (typeof value === 'function') {
        return value as LuaCallable;
      }
      if (options.optional && (value === undefined || value === null)) {
        return undefined;
      }
      throw new Error(`function expected, got ${value === undefined ? 'nil' : typeof value}`);
    },
  })) as FunctionParam,
  /** Passed as it stands; `type` names a union for the reference, and the method tells it apart. */
  any: (
    name: string,
    options: { type?: string; optional?: true; signature?: string } = {},
  ): LuaParam<unknown> => ({
    name,
    type: options.type ?? 'any',
    optional: options.optional === true,
    signature: options.signature,
    read: (value) => value,
  }),
  /** Lua's `...`: every argument from here on, as a list. */
  rest: (): LuaParam<unknown[]> => ({
    name: '...',
    type: 'any',
    optional: false,
    rest: true,
    read: (values) => values as unknown[],
  }),
};
