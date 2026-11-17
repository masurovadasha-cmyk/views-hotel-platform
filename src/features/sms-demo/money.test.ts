import {expect,it} from 'vitest';
import {demoMoney} from './money';
it('preserves big integer minor amounts and cents',()=>{expect(demoMoney('9007199254740993','UZS')?.replace(/\s/g,'')).toBe('90071992547409,93UZS');expect(demoMoney('1','USD')).toBe('0,01 USD');});
it('rejects malformed values and unsupported currency',()=>{for(const value of ['-1','1.5','01','NaN'])expect(demoMoney(value,'UZS')).toBeNull();expect(demoMoney('100','JPY')).toBeNull();});
