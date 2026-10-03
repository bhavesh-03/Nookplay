import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#101217",
        foreground: "#f8f2e8",
        card: "#23262e",
        border: "#f8f2e8",
        primary: "#ff7da8",
        muted: "#b9b6b1",
        gold: "#ffe16a"
      },
      borderRadius: {
        xl: "5px",
        "2xl": "7px",
        "3xl": "9px"
      }
    }
  },
  plugins: []
} satisfies Config;
