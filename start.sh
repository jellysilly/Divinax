#!/usr/bin/env sh
# Запуск Divinax (Linux, macOS, Termux): ставит зависимости, собирает и запускает сервер.
# Аргументы передаются серверу: ./start.sh --port 8001 --listen
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Нужен Node.js 20.19+. В Termux: pkg install nodejs-lts"
  exit 1
fi

# Обновления выходят в ветке main — предупреждаем, если открыта другая
if command -v git >/dev/null 2>&1 && [ -d .git ]; then
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  if [ -n "$branch" ] && [ "$branch" != "main" ] && [ "$branch" != "HEAD" ]; then
    echo "Внимание: открыта ветка «$branch», обновления выходят в main. Обновиться: ./update.sh"
  fi
fi

# Ставим зависимости при первом запуске и после обновления package-lock.json
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  echo "Устанавливаю зависимости…"
  npm install --no-audit --no-fund
fi

# Пересобираем, если сборки нет или исходники новее
if [ ! -f dist/index.html ] || [ -n "$(find src public index.html package.json vite.config.ts -newer dist/index.html 2>/dev/null | head -n 1)" ]; then
  echo "Собираю интерфейс…"
  npm run build:web
fi

exec node server.js "$@"
