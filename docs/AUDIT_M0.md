# Аудит перед M0 (2026-10-12)

Статическое сопоставление текущего кода, схемы/миграций, продуктовых требований,
ADR, этапов Б, SLA-блоков и release-документов. Это не новый прогон тестов,
не полный security-аудит и не проверка внешних юридических/API-фактов.

| № / приоритет | Противоречие или пробел | Свидетельство и решение |
|---|---|---|
| 1 / критический | Публичный продукт — статический preview; локальные доказательства ошибочно можно принять за production. | release.config.json, docs/RELEASE_0_15_PREVIEW.md и PROGRESS.md: Core/email/payments отключены. Разделить локальную, внешнюю и боевую приёмку каждой вехи. |
| 2 / критический | Источники статуса расходятся: AGENTS/CODEX_START ведут к старому Stage7.26, PRODUCT_REQUIREMENTS — к Б0–Б11, API_V1/RELEASE_GATES — к Pages/D1. | Новая очередь M0–M8 в PROGRESS.md имеет приоритет; PostgreSQL Core единственный операционный источник. Исторические документы не удалять. Отдельно обновить старые ссылки в M0. |
| 3 / критический | Платёжный реестр/синтетические адаптеры не равны подключённым Payme/Click/Uzum; фискализация/выплаты не приняты. | apps/api/src/payments/payment-provider.registry.ts, docs/stages-b/03-payments-and-finance.md. Реальный договор, sandbox/certification и reconciliation — отдельные gates M2/M7. |
| 4 / критический | Требования паспорта/ПИНФЛ и регистрации требуют реального vault, политики хранения и E-mehmon; порты и тестовые документы этого не доказывают. | GuestDocumentService, compliance/provider.registry.ts, ADR0006. Токены/маски в Core, encrypted vault, scopes/retention; правовые условия «проверить». |
| 5 / высокий | Целевая структура приложений пока отсутствует: root React/Vite + NestJS, npm lockfiles, Android WebView; Next/Expo/pnpm/Turbo/shared не внедрены. | package.json, apps/api/package.json, ADR0003. Постепенное перемещение, без новой реализации финансов/брони и без смены Android-ключа в M0. |
| 6 / высокий | HTTP-контракт не един: ручные DTO/валидация/клиенты и отдельные BFF/guard allowlists. | concierge.input.ts, frontend model.ts, guest/service-order gateways, StaffSessionGuard. Недавние пропуски SLA-поля и маршрута подтверждают риск. OpenAPI/codegen плюс E2E через реальные guard/BFF. |
| 7 / высокий | Есть Redis в dev Compose, но в package.json API нет BullMQ; наличие инфраструктуры не даёт устойчивых SLA-таймеров/эскалаций. | docker-compose.production-dev.yml, apps/api/package.json, concierge-sla.ts, migration0095. Срок15мин пока фиксированная гипотеза; версия политики, рабочие часы/паузы, outbox и дедупликация — M4. |
| 8 / высокий | M0 нельзя свести к каркасу: уже102 SQL-миграции, тесты и persistent local DB. Dev Compose публикует порты без loopback-ограничения и содержит demo credential. | db/migrations, cloud/windows-local-rehearsal.cjs, docker-compose.production-dev.yml. Без reset; preserve checksum и upgrade-test, отдельная synthetic sandbox, secrets через env. |
| 9 / высокий | Масштаб фонда500 и цель100000 объектов не доказаны UI-лимитами или тестами на малых fixtures. | docs/stages-b/00-plan-and-assumptions.md, NEXT_PROGRAMMING_BLOCKS.md. Пагинация, импорт/dry-run, нагрузочный профиль, p95 и бюджет запросов до M8. |
| 10 / высокий | 140 изображений не являются140 работающими экранами; отдельные услуги не покрывают четыре режима исполнения, host/partner/payroll. | canva-140-delivery.json, CANVA_140_REMAINING_BLOCKS.md. Отдельная функциональная/визуальная приёмка; SD-GN-003 пока не общая очередь всех SLA, зарплатные удержания требуют правовой проверки. |

Материалы исследования: SPEC.md, PRODUCT_REQUIREMENTS.md, ARCHITECTURE.md,
DECISIONS.md, API_V1.md, RELEASE_GATES.md, INTEGRATIONS.md, GAP_AUDIT_STAGE0.md,
stages-b/00-plan-and-assumptions.md, 02-guest-sms-identity.md,
03-payments-and-finance.md, ADR0003/0006, блоки16–17 и реестр140 экранов.
Правовые утверждения и актуальные API поставщиков в этом шаге не проверялись.
