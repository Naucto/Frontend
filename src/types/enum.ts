export type EnumLike = { [k: string]: string | number };

export function enumFromName<E extends EnumLike>(
  enumClass: E,
  name: keyof E | string
): E[keyof E] {
  return enumClass[name];
}

export function enumNames<E extends EnumLike>(
  enumClass: E,
  excludeNone: boolean = true
): Array<keyof E> {
  return ((Object.keys(enumClass)
    .filter(key => Number.isNaN(Number(key)) && (!excludeNone || key !== "NONE"))) as Array<keyof E>);
}
