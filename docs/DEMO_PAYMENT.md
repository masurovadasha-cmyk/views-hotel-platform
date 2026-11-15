# Локальная тестовая оплата SMS-брони

POST /v1/guest-identity/sms/demo-payment, Bearer SMS session,
body {"reservationId":"UUID"}. Только полная сумма из Core; клиент не задаёт
amount, provider или actor. Идемпотентность — одна demo-оплата на reservationId.
Ответ явно содержит simulation:true, paymentIntentId, amountMinor строкой,
currency, paymentStatus, bookingStatus. Контракт: guest-demo-payment.openapi.json.

Включение: NODE_ENV=test, VIEWS_LOCAL_REHEARSAL=true,
VIEWS_DEMO_PAYMENTS_ENABLED=true; SQL также требует маркер
VIEWS_DISPOSABLE_CORE_TEST. --dev-local --demo-sms включает флаг.
Обычный и production runtime не подключают симуляцию. Реальный адаптер не
регистрируется: внутреннее demo-событие проходит существующие webhook/ledger
операции в одной транзакции с подготовкой payment intent.

Права проверяются до и после блокировок и перед commit. Получатель — владелец
SMS hold, подтверждённый private hold_commands, а не совпадение телефона.
Существующие платежи других провайдеров блокируют симуляцию. Просроченный hold
отклоняется до создания платежа; повтор захваченного платежа не дублирует деньги.

Запуск после web/API build:
`node scripts/cloud-core-tests.cjs --dev-local --smoke --demo-sms`.
Smoke создаёт hold, освобождает истёкший, бронирует повторно, оплачивает и
повторяет оплату по HTTP. Положительные суммы/проводки — исключительно synthetic.
Проверки: `node scripts/cloud-core-tests.cjs src/guest-identity src/payments/payment.integration.test.ts`;
`node scripts/migration-upgrade-proof.cjs`.

Ручная приёмка: проверить simulation:true, сумму, подтверждение в поездках,
повтор, отказ чужому гостю и просроченной брони. Новый экран/кнопка пока не сделаны.
Нет внешнего callback/hosted checkout, реального списания или фискального чека.
Если срок истечёт внутри обработки, существующий механизм может вернуть
refund_pending: автоматический demo refund пока не подключён. Полная гонка
позднего внешнего callback и возвраты требуют следующего среза. Не использовать
для реальных платежей и не выдавать synthetic ledger за финансовую отчётность.
