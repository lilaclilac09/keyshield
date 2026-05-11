/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Montserrat', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Deep-navy palette — visible blue, soft, elegant
        ks: {
          bg:       '#0b1226',  // page background
          surface:  '#131c39',  // cards / sidebar
          surface2: '#0e1631',  // secondary surface
          line:     '#243365',  // borders
          line2:    '#2e4585',  // emphasized borders
          primary:  '#6c8eff',  // accent blue
          accent:   '#89a8ff',  // bright accent
          text:     '#e8ecff',  // main text
          subtle:   '#8a96c2',  // subtle text
        },
      },
      borderRadius: {
        DEFAULT: '0.5rem',
      },
    },
  },
  plugins: [],
};
