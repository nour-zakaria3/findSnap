#!/usr/bin/env sh
# Mac/Linux: run SnapFind locally at http://localhost:4173/
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null || { echo "Install Node.js LTS from https://nodejs.org/ first."; exit 1; }
[ -d node_modules ] || npm install || exit 1
npm run build || exit 1
echo "SnapFind: http://localhost:4173/"
npx vite preview --port 4173 --strictPort --open
