import {ConflictException,ForbiddenException,NotFoundException} from '@nestjs/common';
import type {PoolClient} from 'pg';
import type {RequestActorContext} from '../identity/actor-context';
export async function ownerOperatingProperty(c:PoolClient,actor:RequestActorContext,id:string){
 if(!(await c.query('SELECT app.owner_inventory_authorize() allowed')).rows[0]?.allowed)throw new ForbiddenException('OWNER_INVENTORY_FORBIDDEN');
 const p=(await c.query(`SELECT p.id,p.name,p.timezone,p.status,p.country_code,o.type FROM properties p JOIN organizations o ON o.id=p.organization_id WHERE p.id=$1 AND p.organization_id=$2 FOR SHARE OF p,o`,[id,actor.organizationId])).rows[0];
 if(!p)throw new NotFoundException('INVENTORY_NOT_FOUND');
 if(p.status!=='active'||p.type!=='platform'||p.country_code!=='UZ'||p.timezone!=='Asia/Tashkent')throw new ConflictException('CALENDAR_PROPERTY_UNSUPPORTED');return p;
}
