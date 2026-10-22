# M0d.3 — Next.js guest/host shell

Критерии: самостоятельный workspace build/typecheck; серверный HTML гостя/хоста
на ru/uz/en;404 неизвестных языка/направления; явный disconnected preview;
старые веб/CRM/API без изменений; HTTP проверка собранного приложения.

Next15.5.27 добавлен для SSR; Pages Router сохраняет совместимость с React18
без обновления существующих приложений. Это минимальная оболочка, не перенос
каталога или авторизации. Нет платежей, настоящих данных или входа.

Запуск после frozen pnpm10.18.3 install из корня:
- `pnpm --filter @views/web dev` — loopback4175; `/ru/guest` и `/ru/host`.
- `pnpm --filter @views/web typecheck`, `pnpm --filter @views/web build`.
- `pnpm --filter @views/web start` — сервер собранного приложения.
- `node scripts/web-shell.http.cjs` —6 SSR страниц,3 неизвестных маршрута404,
  redirect корня, noindex и ссылки навигации; сервер поднимается на случайном порту.
`workspace:check` включает Next; CI запускает HTTP proof после общей сборки.
`NEXT_TELEMETRY_DISABLED=1` передаётся через Turbo для отключения telemetry.

Аудит выявил уязвимый PostCSS, закреплённый Next; узкий override
`next@15.5.27>postcss=8.5.29` устраняет находки без замены зависимостей остальных приложений.
Generated lock учитывается отдельно от малого ручного среза.

Вручную: переходы guest/host и языков, клавиатурный фокус, мобильная ширина.
Browser/hydration proof пока не добавлен; HTTP proof проверяет именно серверный HTML.
Страницы noindex: это каркас, не опубликованный SEO-каталог. Авторизация, настоящие
объекты, тема и интеграция Core здесь не реализованы. Старые публичные веб/APK не меняются.
