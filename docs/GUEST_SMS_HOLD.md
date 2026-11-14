# SMS guest hold — локальный демо-срез

Объединены SQL, API и тесты, подготовленные параллельно. Базаa900d3a/PR99.
Критерии: явный владелец quote, атомарная бронь/цена/inventory/events,
идемпотентный повтор, отказ после logout/unlink, EXCLUDE без двойных броней,
шесть попыток на три номера дают ровно три успешных hold.

POST /v1/guest-identity/sms/holds: Bearer SMS token, Idempotency-Key UUID,
body {"quoteId":"UUID персонального расчёта"}. Ответ: reservationId,
confirmationCode, status=hold, holdExpiresAt, totalMinor (строка), currency,
idempotentReplay. Повторить исходный ключ/тело при потерянном ответе.
TTL600 секунд — серверная политика демо; ttl/actor в теле запрещены.
Включение: NODE_ENV=test, VIEWS_LOCAL_REHEARSAL=true,
VIEWS_GUEST_HOLDS_PILOT_ENABLED=true и существующие SMS-флаги.

SQL0133 использует приватный журнал команд user+key, quote/profile/config locks,
повторную проверку SMS после ожидания, существующий inventory EXCLUDE и
последнюю проверку сессии после потенциальных ожиданий INSERT.
При отказе все изменения откатываются. Повтор не продлевает hold.

Запуск: после npm run build и npm --prefix apps/api run build выполнить
node scripts/cloud-core-tests.cjs --dev-local --smoke --demo-sms.
Smoke создаёт только synthetic fixtures в помеченной disposable БД, делает
HTTP hold/replay, проверяет наличие в поездках и отказ клиентскому TTL.
Другие проверки: node scripts/cloud-core-tests.cjs src/guest-identity;
node scripts/migration-upgrade-proof.cjs.

Ограничения: расчёт пока выдаёт сотрудник через guest-offer. Нет UI создания,
тестовой оплаты или полного браузерного демо. Hold не подтверждённая бронь.
Срез не включает расписание очистки истёкших hold: существующий expiry worker
нужно подключить к полному demo runtime; сам create не удаляет чужие периоды.
Повтор истёкшего hold отклоняется. После последней проверки logout и commit
могут пересечься: полная линейная атомарность logout/commit не заявляется.
Проверить вручную TTL, отображение денег/ошибок, права гостя и сотрудника.
Реальных платежей/паспортов/юридических ставок нет; public web/APK не обновлены.
