import {useEffect,useRef,useState} from 'react';
import {supplyApi,supplyCount,type StockItem,type StocktakePreview,type SupplyCommand} from './supply-api';
import {supplyError,useSupplyLocale} from './SupplyWorkspaceLocale';
import {localeTags} from './staff-locale';
export function SupplyWorkspaceStocktake({propertyId,staffCsrf,stock,disabled,submit}:{propertyId:string;staffCsrf:string;stock:StockItem[];disabled:boolean;submit:(command:SupplyCommand)=>void}){
 const {locale,t}=useSupplyLocale();const [itemId,setItemId]=useState(''),[counted,setCounted]=useState(''),[reason,setReason]=useState(''),[preview,setPreview]=useState<StocktakePreview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const running=useRef(false),generation=useRef(0);useEffect(()=>()=>{generation.current++;},[]);
 const count=(value:string)=>new Intl.NumberFormat(localeTags[locale]).format(BigInt(value));
 function change(){setPreview(null);setError('');}
 async function inspect(){
  if(running.current||disabled)return;const turn=generation.current;setError('');setPreview(null);
  try{const countedQuantity=supplyCount(counted);if(!stock.some(item=>item.itemId===itemId)||!reason.trim())throw Error('SUPPLY_INPUT_INVALID');running.current=true;setBusy(true);
   const result=await supplyApi.stocktakePreview(staffCsrf,{propertyId,itemId,countedQuantity,reason:reason.trim()});if(generation.current===turn)setPreview(result);
  }catch(e){if(generation.current===turn)setError(supplyError(e));}finally{running.current=false;if(generation.current===turn)setBusy(false);}
 }
 function confirm(){if(!preview||disabled||busy)return;const {propertyId,itemId,countedQuantity,reason,expectedQuantity,expectedRevision}=preview;submit({kind:'stocktake',key:crypto.randomUUID(),body:{propertyId,itemId,countedQuantity,reason,expectedQuantity,expectedRevision}});}
 return <section className="supplyStocktake" aria-busy={busy}><h3>{t('Physical stock count')}</h3><p>{t('Count the physical stock, then review the difference. Previewing does not change stock.')}</p>
  {error&&<p role="alert" className="localError">{t(error)}</p>}
  <form data-testid="supply-stocktake-form" onSubmit={e=>{e.preventDefault();void inspect();}}><fieldset disabled={disabled||busy}>
   <label>{t('Stock item on this page')}<select required value={itemId} onChange={e=>{setItemId(e.target.value);change();}}><option value="">{t('Choose an item')}</option>{stock.map(item=><option key={item.itemId} value={item.itemId}>{item.sku} · {item.name} · {t(item.unit)}</option>)}</select></label>
   <label>{t('Physical quantity counted')}<input required inputMode="numeric" maxLength={19} pattern="0|[1-9][0-9]{0,18}" value={counted} onChange={e=>{setCounted(e.target.value);change();}}/></label>
   <label>{t('Count reason')}<input required maxLength={160} value={reason} onChange={e=>{setReason(e.target.value);change();}}/></label>
   <p>{t('Enter a nonnegative whole quantity in the item unit. Zero means no physical stock.')}</p><button data-testid="supply-stocktake-preview-button" type="submit" disabled={!itemId||!reason.trim()}>{t('Review stock count')}</button>
  </fieldset></form>
  {preview&&<div data-testid="supply-stocktake-preview"><h4>{preview.sku} · {preview.name} · {t(preview.unit)}</h4><dl><dt>{t('Recorded stock')}</dt><dd>{count(preview.expectedQuantity)}</dd><dt>{t('Physical quantity counted')}</dt><dd>{count(preview.countedQuantity)}</dd><dt>{t('Stock adjustment')}</dt><dd>{count(preview.deltaQuantity)}</dd><dt>{t('Count reason')}</dt><dd>{preview.reason}</dd></dl>
   <p>{t('Confirm only after checking the physical count. If stock changed, reload and review a new count before confirming.')}</p><button className="primary" data-testid="supply-stocktake-confirm" disabled={disabled||busy} onClick={confirm}>{t('Confirm physical count')}</button>
  </div>}
 </section>;
}
