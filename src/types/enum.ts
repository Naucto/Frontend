export function enumFromName<E extends Record<string, string | number>>(

  enum_: E, name: string): enum_ is E & Record<typeof name, E[keyof E]> {
  return name in enum_;
}
