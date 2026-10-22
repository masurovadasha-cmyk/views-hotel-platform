# Срез38 — получение прачечной из общей карточки

Допущения: используем действующий `confirm_receipt` и миграцию0124. Владелец может получить вещи после выезда; открытая/отвеченная претензия блокирует начисление. Новые таблицы и API не нужны.

## Критерии до кода

1. Только delivered без неразрешённой претензии показывает действие. Опись, точная сумма и валюта видны до согласия; checkbox и явная отправка обязательны.
2. В API уходят только action/expectedRevision и тот же idempotency key. Клиент хранит ожидаемые сумму/валюту отдельно от тела команды и проверяет closed-квитанцию.
3. Потерянный/повреждённый ответ сохраняет pending вне очищенной карточки; ручной повтор использует тот же ключ/тело, offline и переходы защищены.
4. Реальные команды PostgreSQL дают одно точное начисление, одно событие и один audit; повтор не дублирует их. Закрытый фолио и новая претензия отклоняют операцию без начисления.
5. После отказа сервером нужен ручной GET и новое согласие; closed/прочие стадии скрывают действие. Действующий владелец после checkout может подтвердить получение.
6. RU/UZ/EN, светлая/тёмная тема и390px проверяются в браузере, включая запрет отправки без checkbox через requestSubmit.

## Границы

Локальная синтетическая БД и loopback SMTP. Это начисление в фолио, не платёж провайдеру. Pending в памяти защищён от обычной навигации; восстановление после принудительной перезагрузки остаётся отдельным срезом. Публичный веб/APK в этом срезе не публикуются.

## Запуск и проверка

Проверяемый исходник: dirty `2a141538e7bc9c836a9bafe24bae52cb75e5820f`. Среда и зависимости прежние; установка/новая конфигурация не требуются.

- `npm test -- src/features/laundry/guest-laundry-receipt.test.ts`: RED exit1, helper отсутствовал/0собранных тестов; GREEN exit0,75PASS.
- На старом dist: `VIEWS_ORDER_LIST_BROWSER_ONLY=true VIEWS_GUEST_EMAIL_HTTP_PROOF=true VIEWS_GUEST_EMAIL_BROWSER_PROOF=true node scripts/cloud-core-tests.cjs src/service-orders/laundry.integration.test.ts` — ожидаемый exit1, новая форма отсутствует;12Core и6предшествующих HTTP/browser proofs PASS.
- Финальные `npm test`: exit0,766тестов/87файлов; `npm run build`: exit0, включает typecheck; остаётся прежнее предупреждение Vite о размере chunk.
- В `apps/api`: `npm run typecheck && npm run build` — exit0. Network gate:187файлов/0findings; `node --test scripts/staff-mail.acceptance.cjs`:15PASS.
- `readMigrations` из `apps/api/ops/migrations.cjs`:124checksum PASS; SQL/маршруты/body/права/зависимости не менялись. Независимое ревью кода/контрактов/тестов, включая исправления ниже, PASS.
- Первый общий прогон:218Core PASS, затем ошибка счётчика browser proof — fixture `report_claim` попал в число confirm_receipt. Счётчики разделены; запрет любых POST без checkbox сохранён. Код приложения не менялся.
- Второй общий прогон остановился в старой проверке cleaning на первой странице. Тест теперь находит точный orderId по страницам, связывает каждый GET с DOM; в staff article добавлен только data-order-id.
- Отдельный browser прогон дошёл до закрытого фолио и выявил маскировку FOLIO_NOT_OPEN шлюзом. `npm test -- scripts/guest-email-gateway.test.mjs`: RED1failed/8passed; итоговый веб-набор включает9PASS. Allowlist расширен только этим кодом; неизвестный FOLIO_PRIVATE_SQL_DETAIL остаётся скрыт.
- Следующий общий прогон:218Core и cleaning PASS; старый staff-laundry proof остановился на проверке HTTP200 без сохранённого статуса. Добавлены безопасная диагностика и паузы теста при90запросах/60s; production limit120/60s, проверки HTTP и отсутствие автоповторов команд сохранены. Rate limit как причина того сбоя не подтверждён; независимое ревью PASS.
- Получены шесть снимков RU/UZ/EN ×Light/Dark,390px без горизонтального overflow; RU Light/Dark иUZ Dark просмотрены, опись/сумма/согласие читаемы.
- Финальный `VIEWS_GUEST_EMAIL_HTTP_PROOF=true VIEWS_GUEST_EMAIL_BROWSER_PROOF=true node scripts/cloud-core-tests.cjs src/supply src/service-orders src/staff-auth`: exit0,218Core/23файла и20HTTP/browser proofs PASS. В новом proof: одно exact bigint начисление/audit/outbox при lost→invalid→replay; новая претензия и закрытый фолио дают409 без начисления; resolved claim после checkout допускает получение. Паузы staff-laundry теста сработали; лимит приложения не менялся. Лог: `/tmp/views-block38-complete.log`.

Для локального просмотра после зелёных проверок: `npm run dev:local` создаёт новую синтетическую БД; не использовать постоянную `views_local` для этих фикстур.

## Что проверить вручную

- В общей карточке delivered сверить вещи, сумму/валюту и поставить checkbox; без него отправка недоступна.
- После подтверждения проверить closed и единственную строку фолио. При неизвестном результате повторить ту же операцию.
- При претензии открыть направление прачечной; при закрытом фолио обратиться к сотруднику. Отклонённое действие не означает получение или начисление.
