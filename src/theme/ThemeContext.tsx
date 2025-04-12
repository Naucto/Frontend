import React, { createContext, useContext } from 'react';


export const theme = {
    colors: {
        primary: "#E5D352",
        secondary: "#537D8D",
        background: "#303030",
        text: "#FFFFFF",
    },
    typography: {
        fontFamily: "'Roboto', sans-serif",
        fontSize: 16,
    },
}

type ThemeType = typeof theme;

const ThemeContext = createContext<ThemeType>(theme);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
    return (
        <ThemeContext.Provider value={theme} >
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);