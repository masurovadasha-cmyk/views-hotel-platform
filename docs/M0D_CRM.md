# M0d.2 — отдельный каркас CRM

`apps/crm` — React/Vite workspace. Он переиспользует справочник ролей, переводы
и CSS существующего интерфейса из src, без копирования бизнес-логики. Этот временный
импорт будет заменён packages/shared и packages/ui отдельным срезом.

После `pnpm install --frozen-lockfile` (pnpm10.18.3):
- `pnpm --filter @views/crm dev` — локальный dev сервер, порт4174, только loopback.
- `pnpm --filter @views/crm typecheck` и `pnpm --filter @views/crm build`.
- `pnpm --filter @views/crm preview` — просмотр собранного приложения, тот же порт.
- `node scripts/crm-shell.browser.mjs` — Chromium proof после сборки; нужен Playwright/Chromium.
Общая команда workspace:check также проверяет типы и сборку CRM; CI запускает browser proof.

Это явно обозначенный каркас: нет входа, задач, настоящих данных и API-запросов.
Выбор направления меняет заголовок и описание, не разрешения. Старые веб/APK и
sandbox dev:local не переключаются на этот интерфейс. Next/Expo ещё не созданы.

Проверить вручную: языки ru/uz/en,9 направлений (включая закупщика/склад), тёмную
тему, клавиатурный фокус и мобильную ширину. Настройки пока хранятся только в памяти.
Риск: относительные импорты зависят от legacy src; это осознанный переходный этап.
Миграции БД не нужны; новых версий библиотек нет, lock добавляет CRM importer и peer snapshot.
