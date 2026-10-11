# M0d.4 — общий i18n

Критерии: один источник Locale/translate; прежние импорты совместимы;
root/CRM/Next используют workspace package; fallback/placeholder semantics
не меняются; frozen install, сборки и проверки клиентов проходят.

`packages/shared` экспортирует `@views/shared/i18n`: locales, Locale,
MessageCatalog, MessageValues, translate. Исходник TypeScript, без runtime
зависимостей. Next transpilePackages явно включает пакет. API пока его не импортирует.
`src/i18n/messages.ts` остаётся совместимым re-export; каталоги не переносились.

Команды из корня после frozen pnpm10.18.3 install:
`pnpm --filter @views/shared typecheck`, `pnpm workspace:check`.
После сборок: `node scripts/web-shell.http.cjs`, `node scripts/crm-shell.browser.mjs`.
Тест src/i18n/messages.test.ts проверяет старый export,3 языка, fallback,
нулевые значения/неизвестные placeholders и игнорирование унаследованных свойств.

Вручную: смена языка CRM и guest/host shell, проверка перевода с именем и числом.
Риски: пакет исходников рассчитан на TS-aware bundler, не на прямой require Node;
будущий API/Expo consumer требует отдельной проверки. Новых библиотек нет.
Далее packages/ui: общие дизайн-токены. Полный M0 остаётся открытым.
