// Enforces the Naucto commit convention: "[PART] [TYPE] Capitalized message"
// where TYPE is one of ADD, REMOVE, UPDATE, REFACTO, CLEAN, FIX (see CONTRIBUTING.md).
// Merge/revert/fixup commits are ignored by commitlint's defaults.
const TYPES = ["ADD", "REMOVE", "UPDATE", "REFACTO", "CLEAN", "FIX"];
const HEADER = new RegExp(`^\\[[^\\]]+\\] \\[(${TYPES.join("|")})\\] [A-Z].*$`);

export default {
  plugins: [
    {
      rules: {
        "naucto-header-format": ({ header }) => [
          HEADER.test(header ?? ""),
          `Commit message must be "[PART] [TYPE] Capitalized message" with TYPE one of: ${TYPES.join(", ")}`,
        ],
      },
    },
  ],
  rules: {
    "naucto-header-format": [2, "always"],
  },
};
