import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

// Every hue reads from theme variables so existing utility classes follow the dark/light theme:
// 50–100 tinted backgrounds, 200 borders, 300–500 the base hue, 600 solid fills, 700+ readable text.
const hue = (name: string) => ({
  50: `rgb(var(--${name}) / var(--soft-alpha))`,
  100: `rgb(var(--${name}) / var(--soft-alpha))`,
  200: `rgb(var(--${name}) / 0.3)`,
  300: v(name),
  400: v(name),
  500: v(name),
  600: v(`${name}-strong`),
  700: v(`${name}-text`),
  800: v(`${name}-text`),
  900: v(`${name}-text`),
});

const neutral = {
  50: v("bg-card"),
  100: v("bg-elevated"),
  200: v("border"),
  300: v("border-strong"),
  400: v("text-muted"),
  500: v("text-secondary"),
  600: v("text-secondary"),
  700: v("text-primary"),
  800: v("text-primary"),
  900: v("text-primary"),
};

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        white: v("bg-surface"),
        base: v("bg-base"),
        gray: neutral,
        slate: neutral,
        brand: hue("brand"),
        blue: hue("blue"),
        green: hue("green"),
        emerald: hue("green"),
        red: hue("red"),
        yellow: hue("yellow"),
        amber: hue("amber"),
        purple: hue("purple"),
        orange: hue("orange"),
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
