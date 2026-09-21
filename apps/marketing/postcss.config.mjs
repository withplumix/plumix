// Tailwind v4 is applied through PostCSS so the theme's `css` entry compiles
// without needing access to plumix's synthesized Vite config. Vite auto-loads
// this config when processing the theme stylesheet.
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
