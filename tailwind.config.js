/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        line: "var(--line)",
        "line-2": "var(--line-2)",
        ink: "var(--ink)",
        "ink-dim": "var(--ink-dim)",
        "ink-fade": "var(--ink-fade)",
        navy: "var(--navy)",
        "navy-dim": "var(--navy-dim)",
        gold: "var(--gold)",
        warn: "var(--warn)",
        good: "var(--good)",
      },
      fontFamily: {
        body: ["IBM Plex Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
        display: ["Lora", "Georgia", "serif"],
      },
      borderRadius: {
        card: "6px",
      },
    },
  },
  plugins: [],
};
