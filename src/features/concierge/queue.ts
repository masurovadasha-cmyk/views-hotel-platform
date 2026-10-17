/** This path selects the server queue, never filters an already paginated list. */
export function conciergeQueueRoute(overdue:boolean,cursor?:string):string{
 if(cursor!==undefined&&!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(cursor))throw Error('INVALID_CURSOR');
 return 'service-orders/concierge'+(overdue?'/overdue':'')+(cursor?'?cursor='+encodeURIComponent(cursor):'');
}
