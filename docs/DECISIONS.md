# VIEWS — решения и допущения

- 2026-10-12: продолжаем существующий модульный Core, без переписывания проекта.
- Источник текущего статуса — PROGRESS.md; SPEC.md описывает продукт,
  ARCHITECTURE.md — архитектуру. Старые отчёты сохраняются как история.
- Срез — один сквозной сценарий, ориентир до 300 строк diff. Сначала 3–7
  критериев и тест критичной логики, затем код, проверка и запись до 15 строк.
- Рабочая ветка stage7/staff-email-delivery-v1 отделена от main; сохраняем её
  и текущий draft PR. Создавать новый checkout для каждого среза не требуется.
- Текущий публичный выпуск — статический preview. Новое разрешение пользователя
  ограничивает дальнейшую работу веткой и локальной песочницей; публикация,
  реальные данные, платежи и ключи не подразумеваются.
- Используем существующий TypeScript, типы и схемы. Генерация контрактов — из
  фактически доступного авторитетного источника; общего OpenAPI/codegen-контура
  пока не заявляем. Вводить его отдельным срезом, без массового рефакторинга.
- Новые зависимости — только с причиной. Общие пакеты расширяем постепенно.
- Действующие миграции не переписываем. Тесты — на disposable PostgreSQL;
  постоянную views_local не сбрасываем. Секреты не попадают в Git/чат/логи.
- 15 минут ответа консьержа — унаследованная гипотеза пилота, не договорный SLA.
  Вынос в версионированную конфигурацию остаётся задачей; новые значения не вшивать.
- Платежи, фискализация, E-mehmon, налоги и правила документов: «проверить»
  с провайдерами/юристом; отсутствие интеграции не подменять рабочей заглушкой.
- Предыдущая очередь срезов приостановлена новым запросом владельца:
  сначала аудит и согласование M0–M8, затем M0 только после «ок».

## Целевая архитектура M0–M8 — согласована ответом «ок»

Решения ниже фиксируют целевой вариант, а не уже установленный стек. После
согласования меняются через ADR с причиной, а не заново в каждом срезе.
Они уточняют ADR 0001–0006; проверенные Core-инварианты сохраняются.

| Область | Решение и причина |
|---|---|
| Репозиторий | Подтверждаем pnpm workspaces + Turborepo в существующем репозитории. Один pnpm-lock, закреплённые версии Node LTS/pnpm/Turbo выбираются и проверяются в M0. Без переписывания работающего Core. |
| API | apps/api — NestJS, модульный монолит. Доменные правила, деньги и доступность только здесь/PostgreSQL; клиенты не принимают финансовые решения. |
| Веб | apps/web — Next.js для гостя/хоста (SSR/SEO каталога); apps/crm — React/Vite для сотрудников и админа. Текущий src переносится по сценариям, не копируется в два конкурирующих приложения. |
| Мобильные | apps/mobile — React Native Expo, общие доменные модули, раздельные guest/staff build profiles и входы. Development builds/prebuild допустимы для native SDK; Expo Go не критерий готовности. WebView остаётся review-клиентом до приёмки замены. |
| Общие пакеты | packages/shared — отдельные exports contracts/validation/i18n uz/ru/en; packages/ui — токены и доступные примитивы. DOM-компоненты не навязываются React Native; общие токены, платформенные рендереры. Серверные секреты/SQL не экспортируются клиентам. |
| Контракт | OpenAPI 3.0.3 для внешнего HTTP API, совместимый /v1. Схемы публичных DTO в shared (Zod), из них OpenAPI и клиент/типы; сервер валидирует теми же схемами. Первый endpoint доказывает генерацию без дублирования. Библиотеки/версии закрепить в M0 после проверки поддержки Nest/Next/Expo. |
| Типы БД | PostgreSQL SQL-миграции — источник схемы, типы запросов генерируются из disposable БД (pgtyped-кандидат проверяется в M0). Типы БД не равны публичным DTO. Не вводим ORM, переписывающий существующие SQL-функции. |
| Миграции | Единая папка db/migrations. Перенос выполнен в M0b.2 с сохранением имён, байтов/checksum, порядка и журнала применений; runner/CI переключены вместе. Двух изменяемых копий не допускаем. |
| БД | PostgreSQL 16, UUID, bigint minor + currency; в JSON деньги строками. jsonb для переводов/снимков; timezone объекта IANA, интервалы [заезд,выезд). EXCLUDE защищает общий inventory, RLS+RBAC+property scope — доступ. |
| Очереди | Redis + BullMQ для доставки заданий, не истины. Авторитетные статусы, deadlines, inbox/outbox и дедупликация в PostgreSQL. Доставка at-least-once, обработчики идемпотентны; восстановление очередей из БД. |
| Файлы | S3-compatible private buckets, локально MinIO только для synthetic. Шифрование через vault/KMS, короткие подписанные URL, quarantine/проверка типов и размеров, сроки удаления. В прикладных таблицах токены/маски, не паспорт/ПИНФЛ/PAN. Реальное хранение и регион подтвердить до включения. |
| Язык | TypeScript для приложения, контрактов и новой orchestration-логики. SQL остаётся обязательным языком БД; существующие Java/Python/CJS build-утилиты не переписываем ради формального «одного языка». |
| Платежи | Hosted checkout, адаптеры Payme/Click/Uzum с явными capabilities. Inbox/ledger/outbox атомарны, provider transaction уникален, unknown → reconciliation. Возврат денег, корректировка фолио и возврат товара — разные операции. |
| SLA/услуги | Одна модель заказов/заданий; четыре режима исполнения задаются контрактом. Affiliate фиксирует переход/подтверждённое внешнее событие, но не выдаёт переход по ссылке за оплаченную бронь. Продавец, получатель денег и поддержка фиксируются в снимке заказа. |
| Правила стран | Версионированные конфигурации сборов/налогов/отмен/SLA с датами действия; ставки, возрастные правила и выплаты «проверить». Конфигурация замораживается на операции. Новые гипотезы не становятся production defaults. |
| Авторизация | Гость: SMS OTP, email как дополнительный адаптер. Сотрудники: отдельные приглашения/сессии, MFA привилегированным ролям. Web — HttpOnly cookie/CSRF через BFF; mobile — защищённое хранилище. Выбор роли в URL не выдаёт права. |
| Локальный запуск | После установки документированных prerequisites: одна команда pnpm dev:local запускает synthetic sandbox, миграции/seed и readiness. Loopback-only, отдельные volumes, seed идемпотентен и запрещён на persistent/live БД. |
| CI/выпуск | Frozen install, typecheck, generation-drift/contract checks, builds, SQL/tenant/financial races и E2E. Документация/статический preview не закрывают production gates. Публичный Core и платные сервисы не включаются в M0. |

### Порядок перехода без потери работающего кода
1. M0a: workspace/lockfile/task graph и CI, старые команды совместимы.
2. M0b: перенос миграций и проверка clean install + upgrade существующей схемы.
3. M0c: один OpenAPI endpoint → сгенерированный клиент → экран + contract test.
4. M0d: локальный запуск одной командой и минимальные runnable оболочки приложений.
Каждый пункт разбивается на срезы до ~300 строк; перенос файлов считать отдельно
от логических изменений и согласовывать, если общий diff выходит за лимит.
M0 не считается завершённым до приёмки всех критериев в PROGRESS.md.

### M0a — лимит среза
После запроса согласовать отдельный generated lock владелец ответил «следующий шаг»;
продолжаем этот import-срез как согласованный. Итоговый lock5022 строки, ручные
изменения до300. pnpm10.18.3/Turbo2.5.8; Express5.2.1 объявлен явно из-за
прямого runtime-импорта. npm-lock временно сохранены для старого CI;
конкретный порядок удаления — M0A_WORKSPACE_PLAN.md, запуск — M0A_WORKSPACE.md.

## M0a.2 — task graph и CI
- Сохраняем текущие scripts; Turbo объединяет web/API typecheck/build и web test.
- Core suite запускается отдельно через существующую одноразовую PostgreSQL16;
  прямой API test без БД не является приёмкой.
- До описания всех environment/Git inputs отключаем task cache; parallelism=2.
- Основной CI: Node24.19.0 + pnpm10.18.3 frozen; legacy workflows/npm audit
  остаются до M0a.3, без изменения версий и публичной публикации.

## M0a.3a — единая установка в GitHub Actions
- Установка из API выполняется для всего workspace, повторная root установка удалена.
- Сохраняем --ignore-scripts там, где он был; frozen lock обязателен в15 install jobs.
- Audit gates проверяют production зависимости всего pnpm workspace.
- Docker build context и удаление legacy locks вынесены в M0a.3b: это отдельная
  проверка контейнера; CI-миграция не объявляет весь M0a.3 завершённым.

## M0a.3b — воспроизводимый Docker API
- Контекст workspace + allowlist .dockerignore; frozen API install с pinned pnpm.
- Base Node24.19.0 Debian slim закреплён digest; runtime содержит только prod deps.
- Workspace links сохраняются, /app alias поддерживает существующий maintenance.
- Доверенный CA — optional BuildKit secret; не отключать TLS ради cloud proxy.
- Smoke проверяет production startup с одноразовой подписью и isolated PostgreSQL;
  не заменяет миграционные/финансовые tests. Legacy npm locks пока не удалены.
- Smoke выявил unhandled idle pg Pool error при остановке БД. Listener сохраняет
  процесс и пишет только постоянный код ошибки, без pg client/секретов; readiness
  продолжает проверять БД. Регрессионный тест сначала воспроизвёл падение.

## M0a.3c — устранение конкурирующих locks
- Единственный lock проекта — pnpm-lock.yaml; root/API npm locks удалены после
  проверок CI и container path. История Git сохраняет их; dependency versions не менялись.
- npm run scripts совместимы, npm ci/install для зависимостей проекта больше не поддержаны.
- Generated deletion9669 строк учтён отдельно от малого ручного diff M0a.
- Внешний Cloudflare install override не подтверждён; локальная готовность не равна публикации.

## M0b.1 — checksum и upgrade до переноса SQL
- Общая CJS-реализация извлечена из существующего launcher без смены ledger/lock.
- Manifest фиксирует102 SQL; комментарии перед BEGIN допустимы без изменения hash.
- Clean/upgrade46→102 проверяются в disposable DB с views_app; SQL переносится в M0b.2.

## M0b.3 — повторяемое заполнение disposable Core
- Seed API принимает только доверенный SQL репозитория и подключение к маркированной disposable views.
- Private checksum ledger и transaction advisory lock обеспечивают exactly-once применение каждого блока.
- Ошибка откатывает текущий блок; ранее успешные блоки сохраняются и пропускаются при повторе.
- Это тестовый bootstrap, не миграция production-данных; существующие persistent seed пути не меняются.

## M0c.1 — первый контракт OpenAPI
- Контракт guest trips описывает существующие Core GET; browser использует прежний same-origin BFF через injected transport.
- Генератор без новых зависимостей поддерживает только используемое read-only подмножество; это не универсальный OpenAPI SDK.
- Runtime validation остаётся в API wrapper; типы не заменяют проверку недоверенного JSON. БД и права не меняются.

## M0d.1 — dev:local без постоянной БД
- Переиспользуем disposable Core bootstrap и guest BFF; каждый запуск создаёт новую БД со случайными портами.
- Миграции dev используют общий checksum applier; runtime роль без superuser/BYPASSRLS.
- Первый срез — сборка, readiness, гостевой экран и graceful stop. Email adapter отсутствует явно; оболочки приложений далее.
- Не использовать cloud:start для этого сценария: он обслуживает другую, постоянную views_local.

## M0d.2 — CRM shell
- apps/crm использует уже закреплённые React18/Vite6 без новых библиотек; его задачи подхватывает Turbo.
- Справочник ролей/i18n/CSS временно импортируются из legacy src: один источник, без копий и переноса работающих сценариев.
- Каркас явно не аутентифицирован, без API; выбор роли — только навигация. Backend auth подключается отдельным срезом.

## M0d.3 — Next shell
- Next15.5.27 Pages Router выбран для SSR с существующим React18; не обновляем React остальных клиентов ради каркаса.
- Guest/host × ru/uz/en — серверные страницы с явным disconnected status, без публичной индексации или выдачи прав.
- Audit выявил PostCSS advisories: только next@15.5.27>postcss закреплён на8.5.29; итоговый prod audit без известных находок.
- Generated lock отдельно от ручного diff; shared CSS пока импортируется из legacy src, без дублирования.

## M0d.4 — общий i18n без переноса каталогов
- @views/shared/i18n — TS source export для клиентов; Next transpilePackages включён явно.
- Старый messages.ts остаётся re-export, чтобы не менять десятки потребителей одновременно.
- Семантика translate сохранена; общий locales задаёт набор ru/uz/en. Runtime зависимостей нет.
- Docker получает только manifest shared для разрешения workspace links; Core не импортирует shared.

## M0d.5 — UI tokens без смены оформления
- CSS исходного foundation разделён на tokens и foundation в @views/ui, порядок и значения не изменены.
- Legacy CSS — совместимый @import; CRM/Next импортируют workspace пакет напрямую.
- Пакет CSS-only, sideEffects сохранён; отдельная TS/build задача не нужна, клиентские сборки проверяют CSS.
- React Native адаптер токенов не заявляется готовым; перенос компонентов вне этого среза.

## M0d.6 — Expo profiles
- Expo57.0.27/RN0.86.3/React19.2.3 выбраны по bundledNativeModules официального Expo npm tarball; React18 других клиентов не меняется.
- react-dom19.2.3 объявлен в mobile для согласования optional Expo peer, чтобы pnpm не подставлял root ReactDOM18.
- Guest/staff отличаются app IDs и EXPO_PUBLIC_APP_MODE; это preview-навигация, не аутентификация или разрешения.
- EAS только конфигурация: облачные builds/подпись не выполняются. Metro export не считается APK/IPA.
- Generated dependency lock отдельно от малого ручного среза; новые native/toolchain зависимости обоснованы Expo.
- Обнаружено переиспользование guest mode в staff export при тёплом Metro cache. Build scripts используют --clear;
  regression proof проверяет Hermes App bytecode, а не только имена/хеши bundle.
- Prod audit SDK chain2 high/1 moderate без опубликованного исправления: CI audit не подавляется, выпуск блокирован.

## M0d.7 — narrow UUID security override
Use `xcode@3.0.1>uuid=11.1.1`: xcode calls the compatible CommonJS v4 API.
Acceptance: truncated v3/v5 buffers reject; valid offset writes preserve boundaries;
Xcode IDs/project serialization work; guest/staff exports retain their own mode;
audit removes GHSA-w5hq-g745-h8pq without suppressing remaining findings.
Source: https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq .
Do not patch cryptography speculatively or suppress the two remaining high findings.
Forge fix remains open: https://github.com/digitalbazaar/forge/pull/1152 ; braces:
https://github.com/micromatch/braces/issues/70 . Recheck released fixes before launch.

## M0d.8 — native color adapter
Keep web tokens.css as the palette source; generate @views/ui/native TypeScript
with `node scripts/generate-native-tokens.cjs`. CI uses --check to reject drift.
Scope: colors only; native typography, spacing and shadows remain explicit.
Acceptance: both palettes match CSS including inherited dark values; no local hex
colors in mobile App; light default with manual light/dark selection;
ru/uz/en labels; typecheck and both Android profile exports remain valid.
No new external dependencies. Manual theme choice is session-only in this shell.

## M0d.9 — mobile preferences persistence
Acceptance: all3 locales ×2 themes round-trip; malformed/unknown-version input
falls back to ru/light; queued writes preserve order and recover after failure;
controls wait for initial load; storage errors visible; both profiles build.
Promote existing Expo transitive expo-file-system57.0.7 to a direct dependency:
no new resolved package/version, needed for app-private on-device persistence.
Store only version/locale/theme, separate filenames per profile; never credentials.
Write temporary file then move; do not claim power-loss durability or native-device
acceptance from mock IO tests. No API, migration or account preference sync needed.
