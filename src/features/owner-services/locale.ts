import type {StaffLocale} from '../local-core/staff-locale';
const messages={
 title:['Услуги объекта','Obyekt xizmatlari','Property services'],
 scope:['Только чтение. Текущие заказы без данных гостей; завершённые и отменённые заказы не показаны.','Faqat ko‘rish. Mehmon ma’lumotlarisiz joriy buyurtmalar; tugallangan va bekor qilinganlar ko‘rsatilmaydi.','Read only. Current orders without guest data; completed and cancelled orders are excluded.'],
 property:['Объект','Obyekt','Property'],catalog:['Активные услуги · UZS','Faol xizmatlar · UZS','Active services · UZS'],orders:['Текущие заказы','Joriy buyurtmalar','Current orders'],
 refresh:['Обновить','Yangilash','Refresh'],next:['Следующая страница','Keyingi sahifa','Next page'],back:['Первая страница','Birinchi sahifa','First page'],loading:['Загрузка…','Yuklanmoqda…','Loading…'],empty:['Записей нет.','Yozuvlar yo‘q.','No records.'],error:['Данные недоступны. Проверьте соединение и доступ, затем обновите.','Ma’lumotlar mavjud emas. Aloqa va ruxsatni tekshirib, yangilang.','Data unavailable. Check connection and access, then refresh.'],choose:['Выберите объект','Obyektni tanlang','Choose property'],requested:['Запрошен','So‘ralgan','Requested'],accepted:['Принят','Qabul qilingan','Accepted'],in_progress:['В работе','Jarayonda','In progress'],quantity:['Количество','Miqdor','Quantity']
} as const;
export const ownerServicesText=(locale:StaffLocale,key:keyof typeof messages)=>messages[key][locale==='ru'?0:locale==='uz'?1:2];
