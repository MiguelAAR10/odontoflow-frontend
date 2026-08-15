/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui"] },
      colors: {
        navy: "#071e3a",
        cyan: "#08afd0",
        ink: "#10213f",
      },
    },
  },
  plugins: [],
};
