/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Light admin theme (GG Shop India reference). Token NAMES are kept for
        // compatibility with existing usages: `dark` = page/input background,
        // `card` = raised surface (cards, modals, tables). `panel` stays the
        // dark sidebar chrome.
        admin: {
          dark: '#f1f5f9', // page + input background (light gray)
          card: '#ffffff', // cards / modals / table surfaces (white)
          panel: '#131426', // sidebar chrome (dark)
          border: '#e2e8f0', // hairline borders
          accent: '#2563eb', // primary blue — buttons, active nav, links
          muted: '#64748b', // secondary text
        },
      },
    },
  },
  plugins: [],
};
