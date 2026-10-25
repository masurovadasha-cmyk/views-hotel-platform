import type {Locale} from './model';
const messages:Record<string,[string,string]>={
 'No saved draft':['Сохранённого черновика пока нет','Hali saqlangan qoralama yoʻq'],
 'Local service draft':['Локальный черновик услуги','Mahalliy xizmat qoralamasi'],
 'Open service draft':['Открыть черновик услуги','Xizmat qoralamasini ochish'],
 'Local draft only. Not connected to the Core catalog. No publication, orders, prices or payments. Selecting a demo admin role is not authorization.':['Только локальный черновик, не связан с каталогом Core. Нет публикации, заказов, цен и платежей. Выбор демороли администратора не является авторизацией.','Faqat mahalliy qoralama, Core katalogiga ulanmagan. Nashr, buyurtma, narx va toʻlovlar yoʻq. Demo administrator rolini tanlash avtorizatsiya emas.'],
 'Name and category':['Название и категория','Nom va toifa'],'Form fields':['Поля формы','Shakl maydonlari'],'Preview and dry run':['Предпросмотр и пробная проверка','Koʻrib chiqish va sinov'],
 'Service name':['Название услуги','Xizmat nomi'],'Code':['Код','Kod'],'Category':['Категория','Toifa'],
 'cleaning':['Уборка','Tozalash'],'concierge':['Консьерж','Konsyerj'],'maintenance':['Обслуживание','Texnik xizmat'],
 'Save local draft':['Сохранить локальный черновик','Mahalliy qoralamani saqlash'],'Saved locally':['Сохранено локально','Mahalliy saqlandi'],'Unsaved changes':['Несохранённые изменения','Saqlanmagan oʻzgarishlar'],'Revision':['Ревизия','Tahrir'],
 'Next':['Далее','Keyingi'],'Back':['Назад','Orqaga'],'Cancel':['Отмена','Bekor qilish'],'Close':['Закрыть','Yopish'],'Keep editing':['Продолжить редактирование','Tahrirlashni davom ettirish'],
 'Discard unsaved changes?':['Отменить несохранённые изменения?','Saqlanmagan oʻzgarishlar bekor qilinsinmi?'],'Discard changes':['Отменить изменения','Oʻzgarishlarni bekor qilish'],
 'Add field':['Добавить поле','Maydon qoʻshish'],'Remove field':['Удалить поле','Maydonni oʻchirish'],'Field label':['Название поля','Maydon nomi'],'Field type':['Тип поля','Maydon turi'],'Required':['Обязательное','Majburiy'],
 'text':['Текст','Matn'],'date':['Дата','Sana'],'choice':['Выбор','Tanlash'],'consent':['Согласие','Rozilik'],
 'Add option':['Добавить вариант','Variant qoʻshish'],'Remove option':['Удалить вариант','Variantni oʻchirish'],'Option':['Вариант','Variant'],'Choose an option':['Выберите вариант','Variantni tanlang'],
 'No fields yet. Add up to eight fields.':['Полей пока нет. Можно добавить до восьми.','Hozircha maydon yoʻq. Sakkiztagacha maydon qoʻshing.'],
 'Check sample answers':['Проверить пробные ответы','Namunaviy javoblarni tekshirish'],
 'Dry run passed. Nothing was submitted or ordered.':['Пробная проверка пройдена. Ничего не отправлено и не заказано.','Sinov tekshiruvi oʻtdi. Hech narsa yuborilmadi yoki buyurtma qilinmadi.'],
 'Check required answers and field formats.':['Проверьте обязательные ответы и форматы полей.','Majburiy javoblar va maydon formatlarini tekshiring.'],
 'Complete service code and all three names.':['Заполните код услуги и названия на трёх языках.','Xizmat kodi va uch tildagi nomlarni toʻldiring.'],
 'Add at least one field.':['Добавьте хотя бы одно поле.','Kamida bitta maydon qoʻshing.'],
 'Complete field labels in all three languages.':['Заполните названия полей на трёх языках.','Maydon nomlarini uch tilda toʻldiring.'],
 'Choices need two to six distinct options in all three languages.':['Для выбора нужны от двух до шести разных вариантов на трёх языках.','Tanlash uchun uch tilda ikkitadan oltitagacha turli variant kerak.'],
 'Loading local draft…':['Загрузка локального черновика…','Mahalliy qoralama yuklanmoqda…'],
 'Local data is unavailable or invalid. Saving is blocked; existing data was not reset.':['Локальные данные недоступны или повреждены. Сохранение заблокировано; прежние данные не сброшены.','Mahalliy maʼlumotlar mavjud emas yoki yaroqsiz. Saqlash bloklangan; mavjud maʼlumotlar oʻchirilmagan.'],
 'Another tab saved a newer revision. Your edits remain here. Reload the saved copy before editing further.':['Другая вкладка сохранила новую ревизию. Ваши правки остались здесь. Перед продолжением загрузите сохранённую копию.','Boshqa varaq yangi tahrirni saqladi. Oʻzgarishlaringiz shu yerda. Davom etishdan oldin saqlangan nusxani yuklang.'],
 'Reload saved copy':['Загрузить сохранённую копию','Saqlangan nusxani yuklash'],'Reload will discard unsaved edits.':['Загрузка отменит несохранённые правки.','Yuklash saqlanmagan oʻzgarishlarni bekor qiladi.'],'Reload now':['Загрузить сейчас','Hozir yuklash'],
 'Invalid draft. Check bounded fields before saving.':['Некорректный черновик. Проверьте ограничения полей.','Qoralama yaroqsiz. Maydon cheklovlarini tekshiring.'],
 'Unpublished draft':['Неопубликованный черновик','Nashr qilinmagan qoralama'],'Guest form preview':['Предпросмотр гостевой формы','Mehmon shaklini koʻrib chiqish'],
 'No price configured · UZS':['Цена не настроена · UZS','Narx sozlanmagan · UZS'],
 'Attachments, pricing, routing and publication are not available in this local draft.':['Вложения, цены, маршрутизация и публикация недоступны в локальном черновике.','Bu mahalliy qoralamada fayllar, narxlar, yoʻnaltirish va nashr mavjud emas.']
};
export const translate=(locale:Locale,key:string)=>locale==='en'?key:messages[key]?.[locale==='ru'?0:1]??key;
export const issueMessage:Record<string,string>={names:'Complete service code and all three names.',fields:'Add at least one field.',labels:'Complete field labels in all three languages.',options:'Choices need two to six distinct options in all three languages.'};
export {messages};
