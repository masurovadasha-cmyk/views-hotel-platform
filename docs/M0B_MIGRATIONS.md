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

## M0b.3 — повторяемые synthetic seeds
`node scripts/cloud-core-tests.cjs` (Docker и установленные API dependencies) создаёт
собственный PostgreSQL16, применяет102 миграции, затем7 seed-блоков через
`apps/api/ops/synthetic-seed.cjs`. Повтор каждого блока с тем же SHA256 ничего не
меняет; другой checksum отклоняется. Каждый блок и ledger коммитятся атомарно.
Два подключения сериализуются transaction advisory lock. Ledger находится в
seed_private, без USAGE для views_app. Разрешена только БД views с маркером
VIEWS_DISPOSABLE_CORE_TEST; функция не создаёт этот маркер.

Встроенный `scripts/synthetic-seed-proof.cjs` проверяет replay всех7 блоков,
изменение checksum, отказ без маркера, rollback ошибочного SQL и конкурентное
применение одного блока ровно один раз. Затем runner выполняет полный Core suite
и удаляет только собственный контейнер. Не направлять его на постоянную БД.

Ограничения: только доверенные SQL репозитория; это не SQL sandbox. Атомарность
на блок, а не на всю последовательность. Legacy/persistent seed пути не менялись.
Новых зависимостей нет. Вручную при изменении fixtures проверить, что их данные
остаются синтетическими и CI запускает этот runner. Следующий этап — M0c.
