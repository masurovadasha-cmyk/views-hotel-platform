export type CanvaService={id:string;label:string;description:string;category:string;demoPriceUzs?:number;requiresPartner?:boolean};
export const canvaServices:CanvaService[]=[
 {id:"cleaning",label:"Уборка",description:"Стандартная уборка · 40 минут",category:"cleaning",demoPriceUzs:120000},
 {id:"laundry",label:"Прачечная",description:"Забор и доставка вещей",category:"laundry"},
 {id:"minimart",label:"Маркет",description:"Продукты и товары в номер",category:"minimart"},
 {id:"concierge",label:"Консьерж",description:"Помощь с планами и запросами",category:"concierge"},
 {id:"transfer",label:"Трансфер",description:"Встреча в аэропорту TAS",category:"transfer",demoPriceUzs:180000},
 {id:"rent_car",label:"Аренда авто",description:"Автомобиль на выбранные даты",category:"rent_car"},
 {id:"excursions",label:"Экскурсии",description:"Ташкент, Самарканд и другие направления",category:"excursions",requiresPartner:true},
 {id:"tickets",label:"Авиа и ж/д билеты",description:"Поиск и оформление через партнёра",category:"tickets",requiresPartner:true}
];
export const canvaOrderSteps=[
 {id:"received",label:"Запрос получен"},
 {id:"assigned",label:"Назначение сотрудника"},
 {id:"in_progress",label:"Выполняется"},
 {id:"completed",label:"Выполнено"}
] as const;
