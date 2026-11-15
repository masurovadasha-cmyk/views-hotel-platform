# Автоматическое истечение hold в локальном демо

Запуск после сборки web и API:
`node scripts/cloud-core-tests.cjs --dev-local --demo-sms`.
Внутри этого процесса worker вызывает существующий expireTenantBatch для двух
организаций synthetic seed. Одна пачка до100 удержаний/организацию; следующая
итерация через1с после завершения предыдущей. Нет перекрывающихся итераций.
Ctrl+C останавливает таймер и дожидается текущей операции перед закрытием БД.

Включение закрыто без NODE_ENV=test, VIEWS_LOCAL_REHEARSAL=true,
VIEWS_DEMO_SMS=true и маркера VIEWS_DISPOSABLE_CORE_TEST в той же БД.
Обычный runtime без --demo-sms не запускает worker. Нет новой миграции, cron,
системного сервиса, внешнего подключения или расширения полномочий.

Критерии: истёкший hold отменяется и освобождает даты один раз; параллельные
expire workers не дублируют события; active hold и confirmed не меняются;
таймеры не перекрываются и корректно завершаются; ошибки не печатают payload.

Проверки:
- `node --test scripts/demo-hold-expiry.acceptance.cjs`
- `node scripts/cloud-core-tests.cjs src/guest-identity/guest-hold.integration.test.ts`
- `node scripts/cloud-core-tests.cjs --dev-local --smoke --demo-sms`

HTTP smoke искусственно делает synthetic hold просроченным в disposable БД,
запускает тот же worker, ждёт cancelled через API, проверяет отказ старому ключу
и повторное бронирование освободившихся дат. Это не ожидание реальных10минут.

Ручная проверка: в запущенном demo дать hold истечь; он должен стать cancelled,
даты снова доступны. При зависшем/ошибающемся DB проходе сроки не гарантируются.
Confirmed в интеграционном тесте — синтетическая фикстура, не тест оплаты.
Оплата/поздний callback/refund ещё не реализованы этим срезом. Нет нового UI,
публичного размещения или изменения APK.
