import { useTheme } from "@theme/ThemeContext"

export const Hub = () => {
  const theme = useTheme()
  return (
    <div
      style={{
        backgroundColor: theme.colors.background,
        color: theme.colors.text,
        fontFamily: theme.typography.fontFamily,
        fontSize: theme.typography.fontSize,
      }}
    >
      <h1>Hub</h1>
      <p>Welcome to the Hub!</p>
    </div>
  )
}
