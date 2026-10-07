/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        paper: '#EEF1F0',
        ink: '#10201E',
        panel: '#FFFFFF',
        line: '#D3DBD9',
        muted: '#5E6F6C',
        volt: '#0E7C66',
        decimal: '#D6322B',
        wheel: '#1B2F2C',
      },
    },
  },
  plugins: [],
};
