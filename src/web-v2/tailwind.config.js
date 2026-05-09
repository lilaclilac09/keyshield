/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./router/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Montserrat', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        // Institutional palette — KeyShield brand
        border: '#262626',
        muted: '#737373',
        accent: '#5b8cff',
        'accent-foreground': '#ffffff',
        card: '#0a0a0a',
        'card-foreground': '#ffffff',
      },
    },
  },
  plugins: [],
}
