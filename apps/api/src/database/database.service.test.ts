import {EventEmitter} from 'node:events';
import {Logger} from '@nestjs/common';
import {afterEach,expect,it,vi} from 'vitest';
import {DatabaseService} from './database.service';
vi.mock('../config',()=>({loadConfig:()=>({databaseUrl:'postgresql://fixture/unused'})}));
vi.mock('pg',async()=>{
 const {EventEmitter}=await import('node:events');
 return {Pool:class extends EventEmitter{end=vi.fn()}};
});
afterEach(()=>vi.restoreAllMocks());
it('keeps the process alive on idle pool errors without logging driver secrets',()=>{
 const log=vi.spyOn(Logger.prototype,'error').mockImplementation(()=>{});
 const service=new DatabaseService();
 const pool=(service as unknown as {pool:EventEmitter}).pool;
 const error=Object.assign(new Error('sensitive connection details'),{client:{secretKey:123}});
 expect(()=>pool.emit('error',error)).not.toThrow();
 expect(log).toHaveBeenCalledExactlyOnceWith('DATABASE_IDLE_CONNECTION_ERROR');
});
