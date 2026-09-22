#!/usr/bin/env sh
# Обновление Divinax до последней версии из ветки main и запуск.
# Аргументы передаются серверу: ./update.sh --port 8001
set -e
cd "$(dirname "$0")"

if ! command -v git >/dev/null 2>&1; then
  echo "Нужен git. В Termux: pkg install git"
  exit 1
fi

echo "Загружаю обновления…"
git fetch origin main
# npm install мог переписать package-lock.json — возвращаем его, чтобы не мешал переключению
git checkout -- package-lock.json 2>/dev/null || true
# переходим на main, даже если раньше была открыта другая ветка
if git show-ref --verify --quiet refs/heads/main; then
  git checkout main
else
  git checkout -b main --track origin/main
fi
git merge --ff-only origin/main

exec ./start.sh "$@"
