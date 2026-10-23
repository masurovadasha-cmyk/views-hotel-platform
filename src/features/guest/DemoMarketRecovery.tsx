import type {Locale} from '../../i18n/messages';
import {translate} from '../../i18n/messages';
import messages from './market-translations.json';
function download(raw:string,name:string){const url=URL.createObjectURL(new Blob([raw],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
type Props={locale:Locale;loading:boolean;busy:boolean;blocked:boolean;conflict:boolean;raw:string;legacy:string|null;legacySources:string[];error:string;resolveConflict:()=>Promise<boolean>};
export function DemoMarketRecovery(p:Props){
 const t=(key:string)=>translate(messages,p.locale,key);
 return <div data-testid="demo-market-storage" data-ready={!p.loading&&!p.busy} data-conflict={p.conflict} data-blocked={p.blocked}>
  <p>{t('Demo data is saved on this browser or app installation. Tabs on the same origin share it. Clearing app or browser data removes it; other devices and preview origins are separate.')}</p>
  {p.loading&&<p role="status">{t('Loading saved demo data…')}</p>}
  {p.error==='storage'&&<p role="alert">{t('Demo storage is unavailable or invalid. No change was confirmed. Restore storage access and reload; existing data has not been reset.')}</p>}
  {p.error==='changed'&&<p role="alert">{t('Another view changed the demo data. Your action was not applied. Review the refreshed state and try again.')}</p>}
  {p.conflict&&<section data-testid="demo-market-storage-conflict"><h3>{t('Two demo histories need your review')}</h3>
   <p>{t('This tab has an older separate history. No histories were merged or overwritten. Download both copies before choosing the saved device history; the old copy will remain archived.')}</p>
   <details><summary>{t('View saved device JSON')}</summary><textarea readOnly rows={6} aria-label={t('View saved device JSON')} value={p.raw} style={{width:'100%'}}/></details>
   {p.legacy!==null&&<details><summary>{t('View old tab JSON')}</summary><textarea readOnly rows={6} aria-label={t('View old tab JSON')} value={p.legacy} style={{width:'100%'}}/></details>}
   <button onClick={()=>download(p.raw,'views-demo-device.json')}>{t('Download saved device history')}</button>
   {p.legacy!==null&&<button onClick={()=>download(p.legacy!,'views-demo-old-tab.json')}>{t('Download old tab history')}</button>}
   <button data-testid="demo-market-resolve-conflict" disabled={p.busy} onClick={()=>void p.resolveConflict()}>{t('Use saved device history and archive old tab copy')}</button>
  </section>}
  {!!p.legacySources.length&&<details data-testid="demo-market-archives"><summary>{t('Preserved old tab copies')}</summary>{p.legacySources.map((raw,i)=><details key={i}><summary>{t('View old tab JSON')} {i+1}</summary><textarea readOnly rows={6} aria-label={t('View old tab JSON')+' '+(i+1)} value={raw} style={{width:'100%'}}/><button onClick={()=>download(raw,`views-demo-old-tab-${i+1}.json`)}>{t('Download old tab history')} {i+1}</button></details>)}</details>}
 </div>;
}
