import {afterAll,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {BookingWorkspaceController} from './booking-workspace.controller';
const org='10000000-0000-4000-8000-000000000001',property='10000000-0000-4000-8000-000000000002';
const actor={organizationId:org,userId:'20000000-0000-4000-8000-000000000001',membershipId:'73100000-0000-4000-8000-000000000001',requestId:'reception-test'};
const headers={'x-organization-id':org,'x-user-id':actor.userId,'x-membership-id':actor.membershipId};
const db=new DatabaseService(),controller=new BookingWorkspaceController(db),ids:string[]=[];
async function insert(status:string,start:string,end:string){
 const id=randomUUID();ids.push(id);
 await db.withActor(actor,c=>c.query(`INSERT INTO reservations(id,organization_id,property_id,unit_id,confirmation_code,status,check_in_at,check_out_at,currency,cancellation_policy_snapshot)
 VALUES($1,$2,$3,NULL,$4,$5::reservation_status,$6,$7,'UZS','{}')`,[id,org,property,'RECEPTION-'+id,status,start,end]));return id;
}
afterAll(async()=>{await db.withActor(actor,c=>c.query('DELETE FROM reservations WHERE id=ANY($1::uuid[])',[ids]));await db.onModuleDestroy();});
describe.sequential('reception projection uses property-local dates and live status',()=>{
 it('rejects invalid dates and unauthorized property/membership',async()=>{
  await expect(controller.read(headers,property,'2034-02-30')).rejects.toThrow('INVALID_RECEPTION_DAY');
  await expect(controller.read(headers,property,'0000-01-01')).rejects.toThrow('INVALID_RECEPTION_DAY');
  await expect(controller.read(headers,'50000000-0000-4000-8000-000000000001','today')).rejects.toThrow('PROPERTY_FORBIDDEN');
  await expect(controller.read(headers,randomUUID(),'today')).rejects.toThrow('PROPERTY_FORBIDDEN');
  await expect(controller.read({...headers,'x-membership-id':randomUUID()},property,'today')).rejects.toThrow('PROPERTY_FORBIDDEN');
 });
 it('separates midnight boundaries, planned departures and current stays',async()=>{
  const arrival=await insert('confirmed','2034-01-01T19:00:00Z','2034-01-04T07:00:00Z');
  const prior=await insert('confirmed','2034-01-01T18:59:00Z','2034-01-04T07:00:00Z');
  const departing=await insert('checked_in','2034-01-01T09:00:00Z','2034-01-02T18:59:00Z');
  const nextDay=await insert('checked_in','2034-01-01T09:00:00Z','2034-01-02T19:00:00Z');
  const cancelled=await insert('cancelled','2034-01-01T19:00:00Z','2034-01-04T07:00:00Z');
  const hold=await insert('hold','2034-01-01T19:00:00Z','2034-01-04T07:00:00Z');
  const result=await controller.read(headers,property,'2034-01-02');if(!('arrivals' in result))throw Error('MISSING_RECEPTION');
  const get=(group:{items:Array<{reservationId:string}>})=>group.items.map(r=>r.reservationId);
  expect(get(result.arrivals)).toContain(arrival);for(const id of [prior,cancelled,hold])expect(get(result.arrivals)).not.toContain(id);
  expect(get(result.departures)).toContain(departing);expect(get(result.departures)).not.toContain(nextDay);
  expect(get(result.staying)).toEqual(expect.arrayContaining([departing,nextDay]));
  expect(result.day).toBe('2034-01-02');
 });
 it('limits returned rows while reporting the complete count',async()=>{
  for(let i=0;i<101;i++)await insert('confirmed','2035-01-01T19:00:00Z','2035-01-04T07:00:00Z');
  const result=await controller.read(headers,property,'2035-01-02');if(!('arrivals' in result))throw Error('MISSING_RECEPTION');
  expect(result.arrivals.total).toBe(101);expect(result.arrivals.items).toHaveLength(100);expect(result.arrivals.truncated).toBe(true);
 });
 it('defaults today to the property timezone and returns empty groups explicitly',async()=>{
  const result=await controller.read(headers,property,'today');if(!('arrivals' in result))throw Error('MISSING_RECEPTION');
  const expected=await db.query("SELECT (clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date::text AS day");
  expect(result.day).toBe(expected.rows[0].day);
  const empty=await controller.read(headers,property,'2099-12-31');if(!('arrivals' in empty))throw Error('MISSING_RECEPTION');
  expect(empty.arrivals).toEqual({total:0,truncated:false,items:[]});
 });
});
