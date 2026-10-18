# Срез 39 — подача претензии из общей карточки

Дата: 2026-10-19 (Asia/Tashkent). Допущение: используем существующий `report_claim`, миграцию 0124 и правила направления прачечной. В этом срезе подаём претензию; ответ сотрудника и закрытие гостем пока доступны через «Открыть услугу». Новые API, таблицы, зависимости и платежи не нужны.

## Критерии до кода

1. Форма доступна на accepted/washing/ready/delivered/closed при отсутствии открытой претензии и истории короче 8 сообщений; после выезда сохраняется доступ владельца.
2. Бирка выбирается из описи, тип — из quality/missing/damaged; описание 3–500 символов без управляющих знаков. Отправка только явная; невалидная форма не отправляет POST.
3. Квитанция соответствует intakeId/revision, стадии, точной сумме/валюте и отправленной претензии. Потеря/повреждение ответа сохраняет прежние ключ и тело для ручного повтора; offline, навигация и выход защищены.
4. Реальный runtime создаёт одну запись истории/audit/outbox без изменения заказа или фолио. Открытая претензия блокирует получение/начисление; претензия после начисления не отменяет его.
5. Изменившаяся revision даёт отказ без автоповтора; ручное обновление получает актуальные данные. Проверены logout во время ожидания блокировки и отсутствие доступа после отвязки брони.
6. RU/UZ/EN, Light/Dark и 390px: форма, история и пояснения читаемы; фото и автоматическая компенсация явно недоступны.

## Проверки и границы

Исходная точка: `91dbfe39346d06180d18f06f2352ad4b3b23b0d4`. Только disposable PostgreSQL и loopback SMTP; постоянная база, публичный веб, Cloudflare и APK не затрагиваются. Восстановление pending после hard reload остаётся отдельной задачей.

- `npm test -- src/features/laundry/guest-laundry-claim.test.ts`: RED exit1, helper отсутствовал/0собранных тестов; GREEN exit0,97PASS.
- `node scripts/cloud-core-tests.cjs src/service-orders/laundry-replay.integration.test.ts`: exit0,28PASS, включая9новых проверок report_claim. Runtime views_app без super/BYPASSRLS; реальные pg_locks/blocking PID перед отзывом сессии или владельца. Resolve, отдельные stay/intake ожидания и отзыв staff scope новым набором не проверялись.
- На старом dist `VIEWS_ORDER_LIST_BROWSER_ONLY=true VIEWS_GUEST_EMAIL_HTTP_PROOF=true VIEWS_GUEST_EMAIL_BROWSER_PROOF=true node scripts/cloud-core-tests.cjs src/service-orders/laundry.integration.test.ts`: ожидаемый exit1 на отсутствии новой формы;12Core и7предшествующих HTTP/browser proofs PASS.
- `npm test`: exit0,863теста/88файлов; `npm run typecheck`: exit0. В `apps/api`: `npm run typecheck && npm run build` — exit0.
- `npm run build`: exit0, включает веб-typecheck; прежнее предупреждение Vite о размере chunk остаётся.
- `node scripts/core-network-primitive-gate.mjs`:187файлов/0findings; `node --test scripts/staff-mail.acceptance.cjs`:15PASS. `readMigrations`:124checksum PASS; SQL/маршруты/body/права/зависимости прежние. Независимое ревью SQL/клиентского контракта PASS.
- `VIEWS_GUEST_EMAIL_HTTP_PROOF=true VIEWS_GUEST_EMAIL_BROWSER_PROOF=true node scripts/cloud-core-tests.cjs src/supply src/service-orders src/staff-auth`:227Core/23файла и13предшествующих proofs PASS, затем exit1 в старом receipt-proof: текст вещи теперь есть в описи и option формы. Locator ограничен guest-laundry-detail, прежние проверки сохранены; продуктовый код не менялся.
- Повтор focused-команды со VIEWS_ORDER_LIST_BROWSER_ONLY=true на новом dist: exit0,12Core и9HTTP/browser proofs PASS. Новый claim-proof подтверждает single history/audit/outbox, тот же ключ/тело при lost/неверной бирке, неизменные заказ/фолио,409/manualGET и подачу после checkout.
- Получены6снимков RU/UZ/EN×Light/Dark×390px без overflow; RU Light/Dark иUZ Dark просмотрены. Независимое ревью формы, валидации и browser assertions PASS.
- Финальная полная браузерная цепочка: `VIEWS_GUEST_EMAIL_HTTP_PROOF=true VIEWS_GUEST_EMAIL_BROWSER_PROOF=true node scripts/cloud-core-tests.cjs src/service-orders/laundry.integration.test.ts` — exit0,12подготовительных Core-тестов и21HTTP/browser proof PASS. Общие227Core уже прошли отдельно; после исправления только locator не повторялись. Логи: `/tmp/views-block39-full.log`, `/tmp/views-block39-focused.log`, `/tmp/views-block39-browser-final.log`.

## Запуск и ручная проверка

`npm run dev:local` запускает локальную синтетическую среду; её адрес в облаке не является адресом компьютера пользователя. Не направлять тестовые фикстуры на постоянную views_local.

- В общей карточке выбрать бирку и тип проблемы, ввести описание; пустое/короткое описание не отправляется.
- После подачи проверить историю и блокировку получения; ответ/закрытие пока через «Открыть услугу».
- При неизвестном результате повторить ту же операцию; при409 вручную обновить карточку.
- Для уже начисленного заказа проверить, что претензия сохраняет начисление; фото/компенсация требуют отдельного обращения.
