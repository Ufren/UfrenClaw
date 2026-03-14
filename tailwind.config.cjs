module.exports = {
  darkMode: ['class'],
  content: [
    './packages/renderer-react/**/*.html',
    './packages/renderer-react/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
