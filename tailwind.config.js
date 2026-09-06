/** @type {import('tailwindcss').Config} */
export default {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
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
