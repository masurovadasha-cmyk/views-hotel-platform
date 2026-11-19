import {useEffect,useState} from 'react';
import scope from './scope.json';
import {AdminWorkbench} from './AdminWorkbench';
import {PartnerHostWorkbench} from './PartnerHostWorkbench';
import {GuestWorkbench} from './GuestWorkbench';
import {OperationsWorkbench} from './OperationsWorkbench';
import {designAsset} from '../design-review/model';
import './workbench.css';
export function CanvaWorkbench(){
 const [id,setId]=useState(()=>{const requested=new URLSearchParams(location.search).get('screen');return scope.find(s=>s.id===requested)?.id??scope[0].id;});
 const [dark,setDark]=useState(false),[role,setRole]=useState(''),[query,setQuery]=useState(''),[reference,setReference]=useState(false);
 const screen=scope.find(s=>s.id===id)!;
 const visible=scope.filter(s=>(!role||s.area===role)&&(!query||`${s.id} ${s.title}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
 function navigate(next:string){if(scope.some(s=>s.id===next)){setId(next);setReference(false);}}
 useEffect(()=>{const url=new URL(location.href);url.searchParams.set('entry','canva-workbench');url.searchParams.set('screen',id);history.replaceState(null,'',url);},[id]);
 const props={screenId:id,onNavigate:navigate};
 return <main className={'app canvaWorkbench'+(dark?' dark':'')} lang="ru">
  <header className="workbenchHeader"><div><h1>VIEWS · Canva</h1><p>Интерактивный демо-стенд · 81 экран</p></div><div><button onClick={()=>setDark(!dark)} aria-pressed={dark}>Тёмная тема</button><a href={import.meta.env.BASE_URL}>В приложение</a></div></header>
  <p className="workbenchNotice" role="note">Только синтетические данные. Действия меняют демонстрацию в памяти, не создают реальные заказы, платежи, выплаты или документы. Доступ к роли здесь не является авторизацией. Полная приёмка экранов ещё не выполнена.</p>
  <div className="workbenchLayout"><aside><label>Поиск экрана<input value={query} onChange={e=>setQuery(e.target.value)} /></label><label>Направление<select value={role} onChange={e=>setRole(e.target.value)}><option value="">Все</option>{Array.from(new Set(scope.map(s=>s.area))).map(area=><option key={area} value={area}>{scope.find(s=>s.area===area)?.role}</option>)}</select></label>
   <p>{visible.length} из {scope.length}</p><nav aria-label="Экраны Canva">{visible.map(s=><button key={s.id} aria-current={id===s.id?'page':undefined} onClick={()=>navigate(s.id)}><small>{s.id}</small>{s.title}</button>)}</nav>
  </aside><section className="workbenchStage" aria-label="Демонстрация экрана"><header><h2>{screen.id} · {screen.title}</h2><button aria-expanded={reference} onClick={()=>setReference(!reference)}>Макет для сравнения</button></header>
   {reference&&<img className="workbenchReference" alt={`${id} ${dark?'Dark':'Light'} — исходный макет`} src={designAsset(id,dark)}/>}
   <div data-workbench-screen={id}>{screen.area==='admin'?<AdminWorkbench {...props}/>:['partner','host'].includes(screen.area)?<PartnerHostWorkbench {...props}/>:screen.area==='guest'?<GuestWorkbench {...props}/>:<OperationsWorkbench {...props}/>}</div>
  </section></div>
 </main>;
}
