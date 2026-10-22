# Canva21 — возврат сборки V Market на согласование

SG-MK-004/SD-MK-002/SS-MK-001: сотрудник склада возвращает заказ из picking/ready в reserved до передачи гостю. Он обязан подтвердить, что все собранные товары физически возвращены в зону хранения, и указать причину. После этого доступны существующие предложения изменения состава; гость видит сохранённый резерв и согласует новый состав обычным способом.

Критерии: только stock.manage; picking/ready; явное returnedToStorage=true; после handover запрещено; физический остаток/резерв/сумма неизменны; старый чек-лист очищен; replay не повторяет действие; конкурентная выдача и возврат не могут оба пройти.

Migration0106: приватная SECURITY DEFINER функция с фиксированным search_path, без PUBLIC EXECUTE; проверка session/scope до replay и после блокировок брони/заказа, revision, audit/outbox. stock.manage требуется и до, и после блокировки. В market_orders очищается checklist, stage=reserved, revision+1; service_orders.status=requested.

Общий guard_service_order сохраняет исходную неизменность полей и переходы. Обратный переход accepted/in_progress→requested допускается только под владельцем приватной функции и для market_orders уже в reserved с пустым checklist. Обычный runtime не получает право обходить жизненный цикл. Новых grants/сетевых интеграций нет.

Это не возврат товара после передачи гостю и не компенсация. В picking/ready ещё нет физического списания, поэтому складское движение не создаётся. Резерв сохраняется до согласованной замены/отмены. Подтверждение сотрудника — операционная ответственность, не доказательство фото/сканирования.

## Запуск
```sh
npm run build
npm --prefix apps/api run typecheck
npm --prefix apps/api run build
npm test
VIEWS_GUEST_EMAIL_HTTP_PROOF=true VIEWS_GUEST_EMAIL_BROWSER_PROOF=true node scripts/cloud-core-tests.cjs src/service-orders
```
Только одноразовая PostgreSQL16 и synthetic-данные; постоянную views_local не сбрасывать.

Ручная проверка: начать/завершить сборку, физически вернуть товар, подтвердить операцию, сверить резерв у гостя; предложить новый состав и согласовать; начать сборку повторно — все чекбоксы должны быть сняты. Проверить RU/UZ/EN, Light/Dark, узкий экран, потерю ответа. После передачи кнопка отсутствует, API отклоняет запрос.

Ограничения: фото/партии/коды хранения и изменения уже переданного заказа остаются открыты. Полная Canva PDF-приёмка и public web/APK не включены.

Проверено на dirty1319660: все84 теста service-orders и376 web PASS, API/web typecheck/build, network187/mail15 PASS. Connected V Market browser проверяет mandatory physical confirmation, reserved у гостя, скрытую у гостя команду и снятые checkbox при повторной сборке. PostgreSQL-тест проверяет гонку с выдачей, права/replay и полный путь согласования после reset. Полный PDF/Light-Dark аудит новой формы не заявлен.
