import {describe,it,expect} from 'vitest';
import {queueStages,queueText,stageText,shortQueueId} from './locale';
describe('readable queue presentation',()=>{
 it('labels a literal fragment, retaining enough source characters without inventing an order number',()=>expect(shortQueueId('01234567-89ab-4000-8000-0123456789ab')).toBe('01234567…89ab'));
 it.each(['ru','uz','en'])('translates all known stages and handles unknown source codes honestly in %s',locale=>{
  for(const stage of queueStages){expect(stageText(locale,stage)).not.toBe(queueText(locale,'unknown'));expect(stageText(locale,stage).length).toBeGreaterThan(0);}
  for(const unknown of ['future_stage','constructor','__proto__','title'])expect(stageText(locale,unknown)).toBe(queueText(locale,'unknown'));
 });
});
