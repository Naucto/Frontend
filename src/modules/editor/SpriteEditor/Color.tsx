
interface Color {
    name: string;
    hex: string;
}

const colorPalette01: Color[] = [
    { name: "black", hex: "#000000" },
    { name: "dark-blue", hex: "#1D2B53" },
    { name: "dark-purple", hex: "#7E2553" },
    { name: "dark-green", hex: "#008751" },
    { name: "brown", hex: "#AB5236" },
    { name: "dark-grey", hex: "#5F574F" },
    { name: "light-grey", hex: "#C2C3C7" },
    { name: "white", hex: "#FFF1E8" },
    { name: "red", hex: "#FF004D" },
    { name: "orange", hex: "#FFA300" },
    { name: "yellow", hex: "#FFEC27" },
    { name: "green", hex: "#00E436" },
    { name: "blue", hex: "#29ADFF" },
    { name: "lavender", hex: "#83769C" },
    { name: "pink", hex: "#FF77A8" },
    { name: "peach", hex: "#FFCCAA" },
];

export type { Color };
export { colorPalette01 };