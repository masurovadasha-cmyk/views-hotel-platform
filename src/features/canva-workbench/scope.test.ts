import {expect,it} from 'vitest';
import scope from './scope.json';
import registry from '../../../docs/design/canva-140-delivery.json';
it('preserves the 81-screen pending baseline without claiming acceptance',()=>{
 expect(scope).toHaveLength(81);expect(new Set(scope.map(s=>s.id)).size).toBe(81);
 for(const entry of scope){const source=registry.screens.find(s=>s.id===entry.id);expect(source).toBeDefined();expect(source?.visualAcceptance).toBe('pending');expect(source?.functionalAcceptance).toBe('pending');}
});
