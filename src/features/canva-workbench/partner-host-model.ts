export const partnerHostTitles:Record<string,string>={
 'SP-MK-001':'Доставка в #235','SP-TX-001':'Новый трансфер','SP-TX-002':'Трансфер TX-809',
 'SP-CR-001':'Проверка водителя','SP-CR-002':'Выдача CR-601','SP-CR-003':'Приём автомобиля',
 'SP-EX-001':'Мои группы','SP-EX-002':'Участники экскурсии','SP-TK-001':'Заявка на выписку','SP-TK-002':'Выписка и изменения',
 'SP-GN-001':'Входящие заказы','SP-GN-002':'Принять заказ','SP-GN-003':'Исполнение заказа','SP-GN-004':'Акты и выплаты',
 'SP-GN-005':'Календарь партнёра','SP-GN-006':'Портал партнёра',
 'SH-GN-001':'Услуги объекта','SH-GN-002':'Цена и комиссия','SH-GN-003':'Заказы гостей','SH-GN-004':'Доход от услуг'
};
export const partnerHostIds=Object.keys(partnerHostTitles);
export function validSchedule(date:string,start:string,end:string){return /^\d{4}-\d{2}-\d{2}$/.test(date)&&/^\d{2}:\d{2}$/.test(start)&&/^\d{2}:\d{2}$/.test(end)&&start<end;}
export function validInspection(km:string,charge:string){return /^\d{1,7}$/.test(km)&&/^\d{1,3}$/.test(charge)&&Number(charge)<=100;}
