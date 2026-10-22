# M0d.5 — общие CSS-токены

Критерии: один источник цветов/размеров/тем; прежний CSS-путь совместим;
клиенты root/CRM/Next собираются; browser theme/layout/contrast проверки проходят.

`@views/ui/tokens.css` содержит исходные переменные светлой/тёмной темы,
типографику базового .app. `@views/ui/foundation.css` импортирует их и добавляет
существующие правила компонентов. CSS-правила перенесены побайтно, порядок сохранён.
`src/design-system/foundation.css` — совместимый @import. CRM/Next импортируют пакет
напрямую; root сохраняет прежний путь. Пакет без JS и зависимостей; sideEffects
явно сохраняет CSS при сборке. Изменения темы вносить в packages/ui/tokens.css.

Проверки после frozen pnpm10.18.3 install:
`pnpm workspace:check`; после сборок `node scripts/crm-shell.browser.mjs`,
`node scripts/web-shell.http.cjs`, `node scripts/canva-design.browser.cjs`.
Docker context содержит manifest UI, чтобы frozen install разрешал workspace link.

Вручную: светлая/тёмная темы гостя и CRM, фокус клавиатуры, мобильные размеры,
статусы задач, контраст текста. Browser proof проверяет выборку, не полный WCAG-аудит.
Это CSS-пакет для веба: React Native токены/адаптер ещё не реализованы.
Компоненты и каталоги переводов не переносились; backend и публичный выпуск не менялись.
Следующий срез — Expo shell; M0 ещё открыт.
