import type {ServiceOrder} from '../../domain/types';
import {transitionServiceOrder} from '../../domain/workflows';

export type OrderAction = 'accept'|'start'|'complete';
export type QueueView = 'open'|'progress'|'resolved';
export type QueueSort = 'priority'|'title'|'apartment';
export function orderActions(status: ServiceOrder['status']): OrderAction[] {
  return (['accept','start','complete'] as const).filter(action => {
    try { transitionServiceOrder(status, action); return true; } catch { return false; }
  });
}
export function queueOrders(orders: ServiceOrder[], view: QueueView) {
  return orders.filter(order => view === 'resolved' ? ['done','closed'].includes(order.status)
    : view === 'progress' ? ['accepted','assigned','in_progress'].includes(order.status)
    : !['done','closed','cancelled'].includes(order.status));
}
export function filterOrders(orders: ServiceOrder[], filters: {search: string; category: string; priority: string; sort: QueueSort}, locale: string) {
  const search = filters.search.trim().toLocaleLowerCase(locale);
  const priorities = {urgent:0, high:1, normal:2, low:3};
  return orders.filter(order => (!filters.category || order.category === filters.category)
    && (!filters.priority || order.priority === filters.priority)
    && (!search || [order.title,order.unit,order.guestName,order.assigneeUserId,order.id].filter(Boolean).join(' ').toLocaleLowerCase(locale).includes(search)))
    .sort((a,b) => filters.sort === 'priority' ? priorities[a.priority]-priorities[b.priority]
      : (filters.sort === 'apartment' ? a.unit ?? '' : a.title).localeCompare(filters.sort === 'apartment' ? b.unit ?? '' : b.title, locale, {numeric:true}));
}
