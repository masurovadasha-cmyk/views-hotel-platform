import {describe,it,expect} from 'vitest';
import {initialOrders} from '../../data/demo';
import {filterOrders,orderActions,queueOrders} from './staff-queue';
import type {ServiceOrder} from '../../domain/types';
const order=(fields: Partial<ServiceOrder>)=>({...initialOrders[0],...fields});
describe('staff queue presentation',()=>{
  it('keeps terminal and cancelled work out of the open queue',()=>{
    const orders=['new','done','closed','cancelled','waiting','in_progress'].map((status,index)=>order({id:String(index),status:status as ServiceOrder['status']}));
    expect(queueOrders(orders,'open').map(o=>o.status)).toEqual(['new','waiting','in_progress']);
    expect(queueOrders(orders,'resolved').map(o=>o.status)).toEqual(['done','closed']);
    expect(queueOrders(orders,'progress').map(o=>o.status)).toEqual(['in_progress']);
  });
  it('combines search and filters without mutating or introducing non-visible orders',()=>{
    const orders=[order({id:'a',title:'Clean apartment',unit:'12',category:'cleaning',priority:'high'}),order({id:'b',title:'Clean apartment',unit:'2',category:'cleaning',priority:'urgent'}),order({id:'c',title:'Other',guestName:'Мария',category:'maintenance',priority:'low'})];
    expect(filterOrders(orders,{search:' apartment ',category:'cleaning',priority:'',sort:'priority'},'en').map(o=>o.id)).toEqual(['b','a']);
    expect(filterOrders(orders,{search:'МАРИЯ',category:'',priority:'low',sort:'title'},'ru').map(o=>o.id)).toEqual(['c']);
    expect(filterOrders(orders,{search:'',category:'cleaning',priority:'',sort:'apartment'},'en').map(o=>o.id)).toEqual(['b','a']);
    expect(filterOrders(orders.slice(0,1),{search:'Other',category:'',priority:'',sort:'priority'},'en')).toEqual([]);
    expect(orders.map(o=>o.id)).toEqual(['a','b','c']);
  });
  it('only exposes actions accepted by the actual workflow',()=>{
    expect(orderActions('new')).toEqual(['accept','start']);
    expect(orderActions('in_progress')).toEqual(['complete']);
    expect(orderActions('done')).toEqual([]);
    expect(orderActions('cancelled')).toEqual([]);
  });
});
