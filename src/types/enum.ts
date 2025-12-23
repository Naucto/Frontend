export type EnumLike = { [k: string]: string | number };

export function enumFromName<E extends EnumLike>(
  enumClass: E,
  name: keyof E | string
): E[keyof E] {
  return enumClass[name];
}
