export default {
  // TypeScript 文件
  "packages/{main,preload,renderer-react}/**/*.{ts,tsx}": [
    "npm run lint",
    "npm run format",
  ],

  // JavaScript 文件
  "packages/{main,preload,renderer-react}/**/*.{js,jsx,mjs}": [
    "npm run format",
  ],

  // JSON 文件
  "**/*.json": ["npm run format"],

  // CSS/SCSS 文件
  "packages/renderer-react/src/**/*.{css,scss,less}": ["npm run format"],

  // Markdown 文件
  "**/*.md": ["npm run format"],
};
