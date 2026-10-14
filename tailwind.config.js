/** @type {import('tailwindcss').Config} */
export default {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-readex)", "Readex Pro", "ui-sans-serif", "system-ui"],
        display: ["var(--font-outfit)", "Outfit", "sans-serif"],
        pixel: ["var(--font-pixelify)", "Pixelify Sans", "sans-serif"],
      },
      colors: {
        navy: "var(--navy-950)",
        cyan: "var(--accent)",
        ink: "var(--text)",
      },
    },
  },
  plugins: [],
};
