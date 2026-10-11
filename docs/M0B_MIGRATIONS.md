# M0b — неизменность и совместимость миграций

SQL теперь в db/migrations; db/migrations.sha256 фиксирует102 исходных
checksum. Ни один SQL не изменён. Для новой миграции добавлять новую строку
manifest, не переписывать применённые SQL/checksum.

Локальный launcher и proof используют apps/api/ops/migrations.cjs. Сохраняются
views_local_migrations(name,sha256,applied_at) и внешний advisory lock launcher.
Все известные checksum проверяются до применения новых SQL. SQL и запись
checksum коммитятся вместе; ошибка откатывает транзакцию. Комментарии перед
BEGIN допустимы (0079/0098); они остаются частью checksum.

Проверка: `node --test scripts/migration-manifest.acceptance.cjs`, затем
`node scripts/migration-upgrade-proof.cjs` (нужны зависимости API и Docker).
Proof создаёт только собственную PostgreSQL16: clean102 vs upgrade46→102,
сравнивает schema dump включая ACL, сохраняет synthetic organization и историю
при повторном запуске; проверяет checksum mismatch, неизвестную историю и rollback.
Это один исторический checkpoint, не доказательство сохранности всех бизнес-данных.
Постоянная views_local не запускается/не изменяется. Main CI выполняет эти проверки.
M0b.2: SQL перенесены без изменения102 checksum; обновлены Linux/Windows paths,
Core/mail proofs, CI loops/filters и Compose mount. Исторические ссылки в docs
переведены на новый путь. Seeds/tests пока остаются в apps/api/db; legacy D1 SQL остаётся в migrations/.
Windows проверен только синтаксически: запуск на Windows не заявляется.
Далее: повторяемый synthetic seed в одноразовой БД (M0b.3).
