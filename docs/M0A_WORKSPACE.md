# M0a.1 — импорт зависимостей workspace

В корне pnpm-workspace.yaml: root frontend + apps/api; будущие apps/* и
packages/* подключатся после создания. Next/Expo/shared пока не созданы.
pnpm закреплён packageManager=10.18.3; Turbo2.5.8 установлен для следующего
среза task graph/CI. Ни одна бизнес-функция не переносилась.

## Воспроизведение на чистой копии

```sh
npx --yes --package=pnpm@10.18.3 pnpm install --frozen-lockfile
npm run build
npm --prefix apps/api run build
npm test
VIEWS_GUEST_EMAIL_HTTP_PROOF=true node scripts/cloud-core-tests.cjs
```

Нужны Node (проверено24.19.0), Docker для последней команды и доступ к npm.
Если домашний cache недоступен, задайте npm_config_cache и npm_config_store_dir
в доступной временной папке. Не отключать TLS/integrity. Install scripts
разрешены только esbuild — для используемых сборщиков Vite/Nest.
Runner создаёт отдельную PostgreSQL16 на случайном loopback-порту и удаляет
её после проверки. Постоянная views_local в этом шаге не изменяется.

26 прежних прямых версий сохранены. API @types/node закреплён22.20.5, чтобы
pnpm не заменял его версией root. Express5.2.1 стал явной зависимостью: main.ts
импортирует его напрямую; при pnpm транзитивный доступ приводил к MODULE_NOT_FOUND.
Это та же версия, которая уже была в npm-lock API. Turbo — единственный новый
инструмент, нужен для общего графа задач, не для runtime.

npm-lockfiles временно синхронизированы с manifest: текущие npm CI workflows
продолжают иметь согласованные входы. До M0a.3 pnpm-lock — целевой workspace
lock, npm-lock — совместимость старого CI; изменения зависимостей обновлять
согласованно, не поддерживать расходящиеся версии. Их удаление сейчас не делалось.

Generated pnpm-lock5022 строки — отдельное согласованное исключение; остальные
изменения ниже300 строк. Полный M0 остаётся открыт: Turbo tasks/CI, перенос
миграций, generated API-клиент, оболочки приложений и dev:local ещё впереди.

## Результаты
Проверенная копия исходников fe3565c + импорт manifest/locks, Node24.19.0:
frozen install и web/API builds/typecheck — exit0; web350/68, Core555/93;
HTTP laundry и guest-email с loopback SMTP — pass. Network gate186 без
нарушений, mail15/15. npm ci --dry-run проверил root/API lock-согласованность;
это не отдельная полная npm-установка. Браузерная приёмка не перезапускалась.

## M0a.2 — общий граф проверок и CI

```sh
pnpm workspace:check
pnpm workspace:test:core
```

Первая команда запускает Turbo2.5.8 с параллелизмом2: typecheck/build для
root и @views/api, root test. Существующие scripts сохранены. Вторая сначала
собирает API и запускает полный Core suite в одноразовой PostgreSQL16;
нужен Docker. Для HTTP/email доказательств добавить
`VIEWS_GUEST_EMAIL_HTTP_PROOF=true` перед второй командой (только loopback SMTP).
API `test` намеренно не зарегистрирован в Turbo: без fixture DB его integration
тесты могут пропускаться. Команда `workspace:check` не заменяет Core suite.

Все Turbo tasks пока cache:false: root build содержит Git SHA/dirty metadata,
тесты должны выполняться заново. Оптимизация кэша — отдельный срез после явного
описания входов. Для source snapshot без .git можно передать GIT_DIR/GIT_WORK_TREE;
в обычном checkout они не нужны. Зависимости в CI кэшируются средствами pnpm.

Основной ci.yml использует Node24.19.0, pnpm10.18.3 и frozen lockfile; сохраняет
root npm production audit, security gates и три браузерные проверки. Добавлены
Core suite/SMTP и mail acceptance. Другие workflows ещё используют npm: их
перевод и единый workspace audit относятся к M0a.3. Новых зависимостей нет.

## M0a.3a — остальные GitHub workflows

Все15 jobs, устанавливающие зависимости, используют pnpm10.18.3, Node24.19.0
и `pnpm install --frozen-lockfile`. Установка из apps/api также охватывает
workspace: повторные root install в production-core/staff-email удалены.
Ранее заданный `--ignore-scripts` сохранён. Jobs без установки не менялись.
Три audit gates теперь используют `pnpm audit --prod --audit-level=high`:
проверяются production dependencies всего workspace, а не только root npm lock.
В path filters добавлены pnpm-lock.yaml/pnpm-workspace.yaml; ветки, permissions,
environments, SQL fixtures и команды публикации сохранены.
Эти изменения сами по себе не запускают публикацию из рабочей feature-ветки.

M0a.3 разделён из-за размера/риска: этот срез — CI; следующий M0a.3b —
Dockerfile API и его build context, затем устранение npm-lock совместимости.
Старые npm-lockfiles пока сохранены: не считать миграцию всех install-путей
законченной. Dockerfile ещё использует npm install без frozen lock, его нельзя
перевести простой заменой команды при context=apps/api (workspace lock в корне).
Внешние настройки Cloudflare Workers Builds этим diff не изменены/не проверены.
Node24 меняет стандартный test reporter: для машинной проверки TAP формат
задан явно в egress runner и двух почтовых CI-командах. При первом запуске
71 тест прошёл, но evidence gate правильно отклонил непарсируемый отчёт;
исправление проверено повторным запуском с явным TAP, без ослабления gate.

## M0a.3b — production API container

```sh
docker build -f apps/api/Dockerfile -t views-api:local .
node scripts/api-container-smoke.cjs views-api:local
```

Контекст теперь корень workspace; .dockerignore допускает только manifests,
lock/config, исходники API и ops scripts. Node24.19.0-bookworm-slim закреплён
по digest; Debian slim выбран для той же glibc-платформы, что проверяется в CI.
pnpm10.18.3 устанавливает API с frozen lockfile и --ignore-scripts. Отдельный
production-dependencies stage исключает dev tools из runtime. Workspace links
сохранены; /app — совместимый alias для API/maintenance, процесс работает как node.
Compose сохраняет прежние сети, порты, read_only, volumes и ограничения прав.

В этой cloud-среде BuildKit cache directory должен быть writable, а npm идёт
через существующий proxy/CA. Проверенная команда (значения секретов не выводить):
```sh
BUILDX_CONFIG=/tmp/views-m0b-buildx docker build --network=host \
  --build-arg HTTP_PROXY --build-arg HTTPS_PROXY \
  --secret id=npm_ca,src="$NODE_EXTRA_CA_CERTS" \
  -f apps/api/Dockerfile -t views-api:local .
```
CA используется только как optional BuildKit secret, не копируется в слои;
TLS/integrity не отключены. Обычный CI без proxy использует первую команду.

Smoke создаёт свою internal Docker network и PostgreSQL без host ports,
проверяет /health, /readiness, UID, отсутствие dev tools и совместимость /app/ops;
после остановки БД требует503 readiness. Ресурсы удаляются по своим случайным
именам; постоянная views_local не используется. Production auth конфигурируется
одноразовым Ed25519 public key, реальные ключи не нужны. Это проверка образа,
не применения миграций или бизнес-сценариев. Main CI включает build + smoke.
Legacy npm locks пока сохранены; внешние настройки Workers Builds требуют
отдельной сверки перед удалением compatibility lockfiles (M0a.3c).
Проверка остановки БД выявила unhandled idle Pool error. DatabaseService теперь
обрабатывает это событие и логирует только DATABASE_IDLE_CONNECTION_ERROR;
pg error/client не записываются. Регрессионный test воспроизводит прежний crash.
