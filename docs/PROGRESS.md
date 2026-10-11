# VIEWS — текущая точка продолжения

## 2026-10-12 — M0d.11 native generation, APK BLOCKED
- Новый mobile-native-prebuild.cjs создаёт guest/staff Android projects только в /tmp.
- На dirty0cded39: оба Expo prebuild PASS; generated IDs/names корректны и различаются.
- Preflight/preferences tests7 PASS, diff check PASS; исходники приложения не менялись.
- SDK manager list PASS; install36/tools36/NDK27.1 завершился503, отдельный retry connection failure.
- Gradle9.3.1 wrapper download connection refused; независимые Google/Gradle HTTPS probes503.
- APK не собран, device/native IO не проверены; SDK preflight остаётся BLOCKED, KVM недоступен.
- Документация: M0D_MOBILE.md; ни TLS bypass, ни платных cloud builds, ни production действий.
- start_skill draft6acbfee482d48197bd74e4435d22391c сохранён; Save/Publish пользователем ещё не выполнены.
- Далее после восстановления загрузок: SDK install → Gradle build → native acceptance. M0 открыт.

## 2026-10-12 — M0d.10 native preflight, приёмка BLOCKED
- Добавлен mobile-android-preflight.cjs: версии из RN metadata, отсутствие SDK/components → exit1.
- На dirty93b4010: mobile tests10 PASS; реальный preflight exit1 (ожидаемый BLOCKED), diff check PASS.
- Обнаружен SDK в /workspace/android-tools/sdk; нет platform36/build-tools36.0.0/NDK27.1.12297006.
- KVM accel-check: CPU без vmx/svm; adb не смог создать ~/.android, device connection не установлен.
- Историческое software rendering failure учтено; native запуск/хранение/перезапуск НЕ проверены.
- CI запускает unit tests gate; наличие SDK не выдаётся за native acceptance.
- Инструкция/условия продолжения: M0D_MOBILE.md. Настройки установки среды не менялись.
- App/API/БД не менялись; APK/новая JS сборка не нужны для изменения диагностического скрипта.
- Далее: подходящий native runner и SDK36; прежние2 high по-прежнему блокируют выпуск.

## 2026-10-12 — M0d.9 persisted mobile preferences
- Theme/locale сохраняются в app-private JSON, guest/staff отдельно; до чтения выбор заблокирован.
- Только version/locale/theme; повреждённые/неподдерживаемые данные → ru/light, IO ошибки видны пользователю.
- Записи последовательные через temporary file/move; ошибка не блокирует последующие сохранения.
- Expo-file-system57.0.7 уже был в lock, теперь direct dependency; новых версий/пакетов нет.
- На dirty9384a69: offline frozen install/typecheck PASS; mobile tests7 PASS, palette drift check PASS.
- Финальные guest/staff Android exports/bytecode proof и diff check PASS.
- Критерии/запуск/ручной чек-лист: DECISIONS.md, M0D_MOBILE.md; native IO/device restart ещё проверить.
- Public web/APK/БД не менялись; full Core/web suites и свежий audit не запускались.
- Предыдущие2 high остаются блокерами выпуска; native device/iOS не проверены.
- Далее: приёмка хранения/интерфейса на native build; M0 остаётся открыт.

## 2026-10-12 — M0d.8 native shared palette
- @views/ui/native генерируется из tokens.css:17 цветов, светлая/тёмная темы с наследованием.
- Mobile использует общую палитру и переключатель темы ru/uz/en; default light, выбор только на сессию.
- CI --check отвергает drift; намеренное расхождение воспроизведено, после восстановления PASS.
- На dirtya06a26b: offline frozen install/typecheck PASS; profile/dependency tests3 PASS.
- Финальные guest/staff Android exports и bytecode profile proof PASS; git diff check PASS.
- Контраст fg на bg/surface обеих тем: минимум10.78:1; это не полный accessibility-аудит.
- API/БД не затронуты; новых внешних зависимостей нет. Lock меняет только внутреннюю workspace-ссылку.
- npm/GitHub503: pnpm запущен из проверенного локального кэша; отправка в GitHub недоступна.
- Риски:2 high из предыдущего audit остаются блокерами; свежий сетевой audit не выполнен.
- Инструкция/ручная проверка: M0D_MOBILE.md; native device/iOS/APK и публикация не выполнялись.
- Далее: native device acceptance и сохранение выбранной темы; M0 остаётся открыт.

## M0d.7 — UUID audit correction
- Узкий override xcode3.0.1>uuid11.1.1; остальные зависимости сохранены, новых библиотек нет.
- Критерии/решение: DECISIONS.md; запуск/риски: M0D_MOBILE.md; regression добавлен в CI.
- На dirty6507d95: до исправления buffer regression FAIL; после profile/dependency tests3 PASS.
- Frozen pnpm10.18.3 install, mobile typecheck, guest/staff Android exports и bytecode mode proof PASS.
- Prod audit exit1:2 high/0 moderate; UUID finding устранён, node-forge/braces остаются без published fix.
- Gate не ослаблен; upstream forge PR1152 и braces issue70 открыты. Выпуск заблокирован.
- Git diff check PASS. Полные web/Core suites, iOS/native device не повторялись; APK не создавался.
- Настройки установки среды прежние; публичные веб/APK и постоянная БД не менялись.
- Далее: native adapter общих UI-токенов; high blockers перепроверить перед выпуском.

## 2026-10-12 — M0d.6 Expo shell, выпуск заблокирован audit
- Добавлен apps/mobile Expo57/RN0.86/React19: guest/staff profiles с разными app IDs, ru/uz/en через shared, disconnected preview.
- React18 прежних клиентов сохранён; generated lock/peer snapshots отдельно от малого ручного среза.
- На dirty544ad7a: frozen install, workspace:check12/12, web356 tests, profile test1 PASS.
- Guest/staff Android Hermes exports PASS; APK/IPA, device/emulator, iOS и interactive Metro не проверялись.
- Найден stale guest mode в staff bundle; --clear исправляет, bytecode proof воспроизводит ошибку старого artifact и проходит для новых.
- CRM browser/Next HTTP, network187, mail15, diff check PASS; full PostgreSQL/Docker suites не повторялись.
- BLOCKER: prod audit FAIL (2 high/1 moderate), node-forge/braces в Expo CLI/Metro без patched version; CI gate сохранён.
- Инструкция/риски: M0D_MOBILE.md. Нет логина/API/платежей, native shared tokens пока не реализованы.
- start_skill draft6acbfee482d48197bd74e4435d22391c обновлён; Save/Publish не выполнены.
- Публичные веб/APK, постоянная БД и EAS cloud builds не затронуты. M0 открыт; далее устранение SDK audit blockers.

## 2026-10-12 — M0d.5 shared UI CSS
- Добавлен @views/ui: tokens.css и foundation.css; объединённые правила побайтно совпали с исходным foundation.
- Legacy CSS сохранил совместимый @import; root/CRM/Next объявляют workspace package, новые клиенты импортируют напрямую.
- CSS-only/sideEffects, без новых библиотек; manifest UI добавлен в Docker context для frozen workspace resolution.
- На dirty108e4e7: pnpm10.18.3 frozen install PASS; workspace:check10/10, web356 tests PASS.
- CRM browser9 ролей/3 языка/theme/mobile и Next HTTP6 routes/404/redirect PASS.
- Canva browser PASS:232 layout/126 contrast, минимум6.02:1,0 JS/API/external requests; не полный WCAG-аудит.
- Docker build/smoke PASS: non-root/read-only/prod deps, readiness, потеря БД503, без публичных портов.
- Network187, mail15, generator drift и diff check PASS; полный PostgreSQL suite не повторялся.
- Инструкция/ручной чек-лист/ограничения: M0D_UI.md; RN адаптер токенов ещё не реализован.
- Конфигурация среды не менялась: прежний frozen install подходит; публичные веб/APK и постоянная БД не затронуты.
- Далее Expo shell отдельным срезом; M0 открыт.

## 2026-10-12 — M0d.4 shared i18n
- Добавлен @views/shared/i18n: locales/Locale/translate и типы; прежний messages.ts совместимо реэкспортирует пакет.
- Root/CRM/Next объявляют workspace dependency; Next transpilePackages включён, без новых библиотек/версий.
- Сначала тест отсутствующего пакета падал; затем3 проверки совместимости/fallback/placeholder/prototype PASS.
- На dirty45335cb: frozen install в чистом snapshot и основном checkout PASS; workspace:check10/10, web356 tests PASS.
- Next HTTP6 routes+404/redirect и CRM browser9 ролей/3 языка/theme/mobile/noAPI PASS.
- Docker build/smoke PASS: non-root/read-only/prod deps, health/readiness, потеря БД503; shared manifest в context.
- Network187, mail15, generation drift и diff check PASS; полный PostgreSQL suite не повторялся.
- Инструкция: M0D_SHARED.md; start_skill/install_script не менялись, прежний frozen install подходит.
- Публичные веб/APK и постоянная БД не затронуты. Следующий срез packages/ui; затем Expo, M0 открыт.

## 2026-10-12 — M0d.3 Next guest/host shell
- Создан apps/web Next15.5.27/React18 Pages Router:6 SSR страниц guest/host × ru/uz/en, noindex, явный disconnected status.
- Критерии/запуск/ручной чек-лист: M0D_WEB.md; каталог, вход, бронь и тема здесь не реализованы.
- Next нужен для SSR; lock generated493 строки отдельно от ручного среза; прежние клиенты/БД не переносились.
- Prod audit выявил PostCSS: узкий override next>postcss8.5.29; повтор audit —0 известных уязвимостей.
- На dirty52cfb62: frozen install в изолированном snapshot PASS; workspace:check9/9 задач, web353 tests PASS.
- HTTP production и dev proofs:6 SSR маршрутов,3 ошибочных404, root307, локализованные ссылки/noindex — PASS.
- Исправлен формат Next config на mjs; generated next-env исключён из Git, typecheck без next-env с framework-env PASS.
- Network187, mail15, diff check PASS. Полный PostgreSQL suite/browser hydration отдельно не запускались.
- start_skill draft6acbfee482d48197bd74e4435d22391c обновлён; Save/Publish не выполнены.
- Публичные веб/APK и постоянная views_local не менялись. Далее shared/ui и Expo отдельными срезами; M0 открыт.

## 2026-10-12 — M0d.2 самостоятельный CRM shell
- Создан apps/crm React/Vite workspace:9 направлений, ru/uz/en, светлая/тёмная темы, явный disconnected preview.
- Роли/переводы/стили переиспользованы из src; нет API/логина/операционных данных, выбор роли не даёт прав.
- Lock добавляет CRM importer/peer snapshot без новых версий библиотек; старые приложения не перенесены.
- На dirty37dbd0f: clean snapshot + frozen pnpm10.18.3 install PASS; workspace:check7/7 задач, web353 tests PASS.
- CRM build/typecheck и HTTP dev loopback4174 PASS; browser9 ролей/3 языка/theme/mobile/noAPI/noJSerrors PASS.
- Browser proof сначала выявил неоднозначные labels; добавлены локализованные aria-label, повтор PASS; proof добавлен в CI.
- Network187, mail15, git diff --check PASS; PostgreSQL/Core556 отдельно не повторялся, серверная логика неизменна.
- start_skill draft6acbfee482d48197bd74e4435d22391c обновлён; Save/Publish не выполнены, восстановление новой среды не проверено.
- Инструкция/ручной чек-лист/риски: M0D_CRM.md. Постоянная БД и публичные веб/APK не менялись.
- Далее: Next.js shell отдельным срезом; Expo и packages/shared/ui ещё впереди, M0 открыт.

## 2026-10-12 — M0d.1 одноразовый dev:local
- Добавлена команда dev:local: сборка web/API, disposable PostgreSQL16, checksum migrations и synthetic seeds.
- Core и guest BFF слушают случайные loopback порты; проверяются readiness, HTML, session=false и trips401.
- Runtime без superuser/BYPASSRLS, прежние seed/изоляция/overbooking proofs выполняются при запуске.
- Email delivery adapter отсутствует явно: вход через письмо пока недоступен, внешних отправок нет.
- На dirty601562a: npm run dev:local -- --smoke и повторный smoke с checksum applier — exit0; обе сборки PASS.
- Network gate187, mail15, generator drift check, syntax и diff check PASS; полный API/UI suite не повторялся.
- Lifecycle proof PASS: readiness, trips401, SIGTERM, нет утечки контейнера; Docker --rm ожидается до5 секунд.
- start_skill сохранён в draft6acbfee482d48197bd74e4435d22391c; Save/Publish среды ещё не выполнены.
- Постоянные views_local и её state не использовались; публичного веб/APK деплоя нет.
- Инструкция/риски/ручной чек-лист: M0D_LOCAL.md; это первый M0d срез, без hot reload и оболочек Next/Expo.
- Далее: минимальные каркасы приложений отдельным срезом; M0 целиком открыт.

## 2026-10-12 — M0c.1 OpenAPI → клиент → «Мои поездки»
- Добавлен contracts/guest-trips.openapi.json для существующих Core list/detail; схема БД неизменна.
- Генерируются типы и методы; существующий GuestTrips подключён через прежний wrapper/защищённый BFF transport.
- Runtime validation, точные строковые суммы, session errors и no-store сохранены; зависимостей нет.
- Тест сначала падал без генератора; затем drift/transport/money/error checks3/3 PASS.
- На dirty1a1b506: web353 tests PASS; web/API build, network gate187, mail15 и diff check — exit0.
- Disposable PostgreSQL проверяет реальные ответы GuestTripsService по OpenAPI; guest trips7/7 и полный Core556/94 PASS, exit0.
- Генератор намеренно ограничен текущим GET-подмножеством; это первый контракт, не весь API.
- Browser/HTTP отдельно не повторялись; постоянная БД, публичные веб и APK не изменены.
- Инструкция/ручной чек-лист: M0C_OPENAPI.md. Далее M0d: dev:local и минимальные каркасы приложений.

## 2026-10-12 — M0b.3 повторяемые synthetic seeds
- Core runner применяет7 seed-блоков через checksum ledger в закрытой seed_private.
- Каждый блок и запись истории атомарны; advisory lock сериализует параллельные подключения.
- Replay пропускает неизменённый блок; изменение checksum отклоняется, прежняя история сохраняется.
- Допускается только views с маркером VIEWS_DISPOSABLE_CORE_TEST; функция не выставляет маркер сама.
- На dirty614b26d: disposable PostgreSQL16 proof —7 replay, checksum, guard, rollback, concurrent exactly-once и private schema PASS.
- node scripts/cloud-core-tests.cjs:556 tests/94 files PASS; SQL administrative proofs PASS, exit0.
- Mail acceptance15/15, network gate186, node syntax и git diff --check PASS.
- SQL миграций/seed-файлы не изменены; постоянная views_local и публичные веб/APK не затронуты.
- Граница: только disposable Core runner; legacy/persistent seed paths не переведены, Windows не проверялся.
- API/UI build не повторён: исходники приложения неизменны; HTTP/SMTP proof отдельно не запускался.
- Инструкция: M0B_MIGRATIONS.md. Далее M0c: OpenAPI → generated client → экран и contract test.

## 2026-10-12 — M0b.2 перенос PostgreSQL migrations
- Перенесены102 SQL из каталога API в db/migrations; Git распознаёт100% rename, байты/имена/manifest неизменны.
- Обновлены Linux/Windows launcher, Core/mail/proof scripts, CI loops/filters, Compose read-only mount и ссылки docs.
- Seeds/tests API и legacy D1 SQL остаются на прежних местах; существующий ledger не менялся.
- На dirtye7ebaab: manifest tests и PostgreSQL16 clean102/upgrade46→102 proof прошли, schema/ACL совпали.
- Nest build, Core556/94, HTTP laundry и guest-email/loopback SMTP — exit0; внешних писем нет.
- Почтовые/evidence tests100/100, network gate186, Compose mount/YAML, node syntax и git diff --check — pass.
- Проверены все102 SQL против исходных Git blobs; старых путей PostgreSQL в executable consumers не осталось.
- Постоянная views_local не запускалась/не изменялась; публичные веб/APK не обновлялись.
- Ограничения: Windows runtime и полный staff-mail DB proof отдельно не запускались; remote CI не подтверждён.
- Инструкция: M0B_MIGRATIONS.md. Следующий M0b.3: повторяемый synthetic seed в одноразовой БД.

## 2026-10-12 — M0b.1 checksum и clean/upgrade proof
- Добавлен db/migrations.sha256 для102 SQL; исходные SQL побайтно совпадают с6b0d67a.
- Применение вынесено из cloud-local-rehearsal в migrations.cjs; ledger и внешний advisory lock сохранены.
- Исправлена проверка BEGIN: комментарии в0079/0098 больше не блокируют запуск; hash исходников не меняется.
- Manifest tests проверяют изменение/удаление SQL и отсутствие транзакции; CI запускает manifest + DB proof.
- На dirty6b0d67a disposable PostgreSQL16: clean102 и upgrade46→102 дают одинаковую схему/ACL при views_app.
- Synthetic organization сохранена; повторный запуск0 изменений и прежние timestamps истории сохранены.
- Checksum mismatch/неизвестная история отвергаются; ошибочная0103 полностью откатывается без записи checksum.
- Проверено: manifest test, DB proof, node syntax, CI YAML, git diff --check — exit0; контейнер удалён.
- Постоянная views_local не затронута; app/UI не менялись, их предыдущие build/test результаты не перепроверялись.
- Инструкция и ограничения: M0B_MIGRATIONS.md; один checkpoint/organization не доказывает все случаи миграции данных.
- Далее M0b.2: перенос SQL в db/migrations и обновление всех путей; M0b в целом ещё открыт.

## 2026-10-12 — M0a.3c единый dependency lock
- Удалены root/API npm locks; pnpm-lock остаётся единственным, его SHA256 и manifests не изменились.
- Generated deletion9669 строк отдельно от ручного diff; прежние locks сохранены в Git до84da7d0.
- README, cloud runbook и устаревшее примечание AGENTS согласованы с pnpm frozen workspace install.
- Проверено на чистом snapshot84da7d0 без npm locks: полный frozen install,5 Turbo tasks, web350/68 pass.
- Профильные API tests20/3, mail15, network186, workspace audit0 известных уязвимостей — pass.
- Docker build и smoke pass: non-root/read-only/prod deps, health/readiness, потеря БД503; постоянная БД не затронута.
- Все executable install-пути проверены; npm global install закрепляет только pnpm, npm run остаётся совместим.
- Full Core556/94 и browser suites не повторялись: API/UI/версии неизменны; прежние результаты сохранены.
- install_script среды сохранён draft b74ec9de-e793-4fac-a736-09fd0d0b7686~cecfgdraft_6acbfee482d48197bd74e4435d22391c.
- Активация draft через Environment settings Save→Publish ещё не выполнена; восстановление нового task не проверено.
- Ограничения: внешний Cloudflare install override/remote CI не проверены; публичной публикации нет.
- Репозиторный M0a завершён. Далее M0b: перенос миграций, clean+upgrade и сохранность прежних checksum.

## 2026-10-12 — M0a.3b Docker API и отказ БД
- Docker использует workspace context, allowlist .dockerignore, pnpm10.18.3 frozen и отдельные prod deps.
- Node24.19.0 Debian slim закреплён digest; non-root runtime сохраняет совместимый /app alias.
- Добавлены api-container-smoke.cjs и build/smoke в основной CI; compose права/сети/volumes сохранены.
- Проверено на43ebc7a + dirty diff: Docker build pass; API sources test snapshot совпадают с рабочими.
- Image sha256:eba73a9ed82f482076d902e6a5e039a28dc20c4722d228b45a94ba386bbfb3de.
- Smoke: UID non-root, read-only, no dev tools, /health200, /readiness200→503 после остановки БД, /app/ops pass.
- Найден и исправлен crash от idle pg Pool error; regression сначала red, затем green; лог только постоянного кода.
- API typecheck/build и Core556/94 pass; topology17, origin11, mail15, network186 без нарушений.
- Compose render/YAML/git diff --check pass; временные smoke containers/network удалены, views_local не тронута.
- Cloud build использует имеющиеся proxy и CA через BuildKit secret; TLS/integrity сохранены, CA не в образе.
- Риски: remote CI/публикация не проверены; smoke не заменяет миграционные проверки; UI/APK не обновлялись.
- Далее M0a.3c: сверить оставшиеся install-потребители и устранить legacy npm locks; полный M0 ещё открыт.

## 2026-10-12 — M0a.3a остальные GitHub install jobs
- M0a.3 разделён: CI сейчас; Docker/legacy locks в M0a.3b, чтобы сохранить небольшой проверяемый diff.
- Все15 install jobs: pnpm10.18.3, Node24.19.0, frozen workspace; две повторные установки удалены.
- Три audit gates проверяют весь workspace; path filters дополнены pnpm lock/config, права и ветки сохранены.
- Исправлен Node24 reporter: явный TAP в egress runner и staff-email evidence командах, gate не ослаблен.
- Чистый source snapshot8358a7e + diff: frozen --ignore-scripts из apps/api установил оба проекта;5 Turbo tasks pass.
- Web350/68, Core555/93, HTTP laundry/email и loopback SMTP pass; постоянная БД не использовалась.
- Egress71/71 и валидный machine report; evidence85/85, mail15/15, network186 без нарушений.
- Workspace production audit:0 известных уязвимостей; YAML/фильтры/права/git diff --check pass.
- Повторный browser suite не запускался: код/lock неизменны, предыдущая проверка M0a.2 сохранена.
- Риски: Docker всё ещё npm без frozen lock; npm locks сохранены; внешние Cloudflare Build settings не проверены.
- Далее M0a.3b: workspace Docker context, frozen container build/smoke, затем согласованное устранение legacy locks.
- Публичной публикации нет; remote GitHub CI для этого diff ещё не подтверждён.

## 2026-10-12 — M0a.2 Turbo и основной CI
- Добавлены turbo.json, workspace:check и workspace:test:core; scripts совместимы, новых зависимостей нет.
- CI закрепляет Node24.19.0/pnpm10.18.3, frozen install; security/audit/browser checks сохранены.
- Turbo выполняет5 задач, concurrency2, cache:false; Core отдельно в disposable PostgreSQL16.
- Проверено на source snapshot addad67 + текущий dirty diff: frozen install и5/5 Turbo tasks exit0.
- Web350/68, Core555/93, mail15/15; HTTP laundry и guest-email/loopback SMTP — pass.
- Три browser suites — pass, pageErrors0; это synthetic/demo/HTTP fixtures, не проверка production.
- Network gate186 без нарушений, egress policy pass, root prod audit0 vulnerabilities; shell syntax pass.
- Команды/ограничения: M0A_WORKSPACE.md; cache и отдельный Core runner объяснены в DECISIONS.md.
- Постоянная БД и рабочие node_modules сохранены; публичные веб/APK не обновлялись.
- Риски: remote GitHub CI ещё не подтверждён; legacy workflows пока npm; M0 не завершён.
- Следующее M0a.3: перевести оставшиеся install-пути/аудит на workspace без двойных lock-источников.

## 2026-10-12 — M0a.1 импорт workspace завершён
- После «следующий шаг» согласовано исключение для generated lock; архитектура M0–M8 принята.
- Добавлены pnpm-workspace.yaml/pnpm-lock.yaml; pnpm10.18.3, Turbo2.5.8; root+apps/api.
- Все26 прежних прямых версий сохранены; Express5.2.1 объявлен явно, API @types/node22.20.5 закреплён.
- npm-lockfile синхронизированы для прежнего CI; существующие scripts не менялись.
- Проверено в отдельном source snapshot поверх fe3565c: полный frozen install, web/API build/typecheck, exit0.
- Web350/68 и Core555/93 прошли; HTTP laundry и guest-email/loopback SMTP прошли, внешних писем нет.
- Network gate186 без нарушений, mail15/15; npm ci --dry-run для root/API успешен.
- Описание/команды: M0A_WORKSPACE.md; generated lock5022 строки, остальной diff менее300 строк.
- Working node_modules и persistent views_local не менялись; публикации нет.
- M0 остаётся открыт. Следующий срез M0a.2: Turbo task graph+CI; затем M0a.3 убрать двойные install-пути.
- Риски: браузер/UI на устройствах в этом срезе не проверялся; Next/Expo/codegen/dev:local ещё не реализованы.

## 2026-10-12 — M0a preflight после «ок»
- Архитектура/план M0–M8 согласованы; M0 ещё не завершён.
- План разбиения: M0A_WORKSPACE_PLAN.md; код/зависимости рабочего дерева не менялись.
- Пробный импорт вне репозитория: pnpm10.18.3, Turbo2.5.8, два importer.
- Generated pnpm-lock:5019 строк; выходит за согласованный лимит около300 строк.
- Все26 прямых версий сохранены после pin API @types/node22.20.5 в пробном manifest.
- Проверено: pnpm import и frozen --lockfile-only --ignore-scripts, exit0; полная установка не проверена.
- Исключение для generated lockfile требует согласования; до него внедрение остановлено по правилу размера среза.
- Предлагается M0a.1 импорт/manifest, M0a.2 Turbo+CI, M0a.3 перевод оставшихся install-путей.
- Следующее: согласовать отдельный generated lock; затем полный frozen install/build/test в песочнице.
- Риски: транзитивные зависимости и install scripts ещё проверить; npm workflows пока остаются прежними.
- Постоянная БД, опубликованные web/APK и реальные интеграции не затронуты.

## 2026-10-12 — аудит и план до кода (история; «ок» получено)
- Источники: SPEC.md / ARCHITECTURE.md / DECISIONS.md; аудит: AUDIT_M0.md.
- Ветка stage7/staff-email-delivery-v1; последний код47a33cf, документацияd3c5c74; draft PR54.
- Локальная база: очередь консьержа и migration0102. Исторически web350; API554 до guard-fix, затем31 профильный тест и HTTP/BFF/browser прошли.
- Публичный preview0.15/eae64e1: Core/email/payments отключены; Canva56 partial/84 pending, PDF-приёмки нет.
- Найдены10 проблем; целевой стек и совместимый переход записаны в DECISIONS.md, пока не согласованы.
- Проверка этого шага: только документы, ссылки и git diff --check; сборки/тесты не перезапускались.
- Блокеры production: провайдеры/договоры, vault/хранение, юридические правила, операционная и нагрузочная приёмка.
- На момент аудита ожидали «ок»; затем владелец согласовал старт M0 (см. запись выше).
- После «ок»: M0a workspace/task graph; критерии: frozen install, прежние команды работают, CI проверяет API+web, persistent DB не затронута.
- Следующие частиM0 и история очереди нарушений не потеряны: DECISIONS.md и design/CANVA_140_BLOCK_17_OVERDUE_QUEUE.md.
- Работа только в ветке/локальной песочнице, без реальных секретов/платежей, reset/force-push и публикации.

## Дорожная карта и критерии приёмки
Ни одна веха не закрыта целиком. Уже работающий код переиспользовать; внешний gate нельзя заменить synthetic-тестом.
| Веха | Проверяемые критерии завершения |
|---|---|
| M0 каркас | pnpm/Turbo workspace с API/web/CRM/mobile/shared/ui; frozen install и CI build/typecheck; один генерируемый HTTP-клиент проходит contract test; все миграции clean+upgrade с прежними checksum; synthetic seed повторяем; одна команда dev:local и readiness запускают loopback sandbox без изменения views_local. |
| M1 бронирование | SMS OTP с лимитами/одноразовостью и проверкой доставки; каталог/пагинация, итоговая цена со снимком налогов/сборов; hold/expiry, EXCLUDE и гонка двух броней дают одного победителя; отмена/возврат учитывают часовой пояс и замороженную политику; unknown/late payment не создаёт двойную бронь. Внешняя SMS отдельно принята. |
| M2 финансы | Payme/Click/Uzum по подтверждённым контрактам; дубликаты/нарушенный порядок webhook не меняют деньги повторно; проводки сбалансированы; refund/partial refund/депозит/reconciliation и фолио согласованы; чек связан с операцией, retry не создаёт второй; sandbox/certification каждого провайдера и бухгалтерская приёмка. |
| M3 CRM API | Шахматка/перенос без овербукинга, заезд/выезд, задачи/инспекция, гости/сотрудники/роли; cross-tenant/property тесты; весь фонд500 доступен через страницы; очередь регистрации иностранцев со сроками/подтверждением; документ только через vault; турсбор по версионированной конфигурации и отчёт сверяются. E-mehmon/ставки «проверить». |
| M4 услуги/SLA | Единые каталог/заказ/задача и4 режима: свои/диспетчер-партнёр/API/affiliate; продавец/платёж/возврат определены; назначение по навыкам/смене/нагрузке без дублей; таймеры с календарём/паузами переживают рестарт; повтор событий не дублирует задания/эскалации; смена исполнителя атомарна; провайдерская ссылка не выдаётся за завершённый заказ. |
| M5 гость | Next.js+Expo: поиск/карта/карточка → бронь/оплата → поездка/услуга/поддержка/отмена на Core; RU/UZ/EN, Light/Dark, accessibility и offline/retry; перечень гостевых Canva ID принят по функциональности и дизайну; Android/iOS проверены на устройствах, токены защищены. |
| M6 персонал | CRM/Vite и Expo staff: свои заезды/выезды, фолио, гости/юниты, housekeeping/задачи/чек-листы/фото, закупки/склад; роли разделены сервером; полный сквозной сценарий от запроса до инспекции, дубли offline не создают повторных операций; приёмка staff/CRM Canva ID. |
| M7 хост/админ | Онбординг/проверка хоста, объекты/цены, модерация, комиссии/выплаты/споры; тест изоляции хостов; акты/сверка/идемпотентность выплат; зарплатный расчёт по версиям правил, утверждение и аудит, без автоматических незаконных удержаний; юридическая схема и бухгалтер принимают результаты. |
| M8 интеграции/запуск | iCal/каналы дедуплицируют периоды и соблюдают EXCLUDE; замки выдают/отзывают коды без логирования; threat model и проверка прав/egress, dependency scan; нагрузочный профиль на500 и план100000 с подтверждённым p95 чтения≤300мс; согласованные RPO/RTO проверены восстановлением; метрики/SLO99.9%, on-call/rollback, dry-run миграции фонда, правовой checklist и поэтапный пилот. |

Приёмка каждого среза: 3–7 критериев → тест критичной логики → код → проверки → запись до15 строк. Изменения примерно до300 строк; крупный перенос сначала разбить. Не закрывать веху по числу экранов или одному зелёному build.
