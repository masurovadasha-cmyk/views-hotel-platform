import {useState} from 'react';
import {operationsScreens} from './operations-data';
type Props={screenId:string;onNavigate:(id:string)=>void};
export function OperationsWorkbench({screenId,onNavigate}:Props){
 const [values,setValues]=useState<Record<string,string>>({}),[selected,setSelected]=useState<Record<string,string>>({}),[notes,setNotes]=useState<Record<string,string>>({}),[checks,setChecks]=useState<Record<string,boolean>>({}),[filter,setFilter]=useState(''),[level,setLevel]=useState(0);
 const screen=operationsScreens[screenId];if(!screen)return <p role="alert">Экран не найден.</p>;
 const rows=screen.rows??[],choice=selected[screenId]??rows[0]?.id;
 const checklist=['Безопасность проверена','Осмотр выполнен','Результат записан'];
 function execute(){if(screen.mode==='checklist'&&!checklist.every(x=>checks[x])){setNotes({...notes,[screenId]:'Заполните все пункты демонстрационного чек-листа.'});return;}
  if(screen.mode==='escalation')setLevel(x=>Math.min(3,x+1));
  setNotes({...notes,[screenId]:`Демо-действие выполнено${choice?' · '+choice:''}. Запись только в памяти; задание и выплаты на сервере не изменены.`});
 }
 return <section><h3>{screen.title}</h3><p>Локальная демонстрация. Все сотрудники, расписания и показатели синтетические.</p>
  {screen.mode==='map'&&<p>Карта и координаты не подключены. Ниже — список демонстрационных ресурсов.</p>}
  {rows.length>0&&<><label>Фильтр списка<input value={filter} onChange={e=>setFilter(e.target.value)}/></label><fieldset><legend>Выберите запись</legend>{rows.filter(r=>(r.label+' '+r.detail).toLowerCase().includes(filter.toLowerCase())).map(row=><label key={row.id}><input type="radio" name="operation-row" checked={choice===row.id} onChange={()=>setSelected({...selected,[screenId]:row.id})}/><strong>{row.label}</strong><span>{row.detail}</span></label>)}</fieldset></>}
  {screen.mode==='metrics'&&<dl><dt>Пример выполненных заданий</dt><dd>12</dd><dt>Пример соблюдения срока</dt><dd>92%</dd><dt>Денежные бонусы</dt><dd>Не рассчитаны; зарплатный модуль не подключён</dd></dl>}
  {screen.mode==='escalation'&&<p>Демонстрационный уровень: {['Сотрудник','Старший смены','Менеджер','Владелец'][level]}</p>}
  {screen.mode==='checklist'&&<fieldset><legend>Чек-лист диагностики</legend>{checklist.map(item=><label key={item}><input type="checkbox" checked={!!checks[item]} onChange={e=>setChecks({...checks,[item]:e.target.checked})}/>{item}</label>)}<p>Фото и реальный акт ремонта не создаются.</p></fieldset>}
  <form onSubmit={e=>{e.preventDefault();execute();}}>{screen.fields?.map(field=>{const key=screenId+field.key;return <label key={key}>{field.label}{field.type==='select'?<select value={values[key]??field.value} onChange={e=>setValues({...values,[key]:e.target.value})}>{field.options?.map(option=><option key={option}>{option}</option>)}</select>:<input required type={field.type??'text'} min={field.type==='number'?0:undefined} maxLength={500} value={values[key]??field.value} onChange={e=>setValues({...values,[key]:e.target.value})}/>}</label>;})}<button>{screen.action}</button></form>
  {notes[screenId]&&<p role="status">{notes[screenId]}</p>}{screen.next&&<button onClick={()=>onNavigate(screen.next!)}>Открыть связанный демо-экран</button>}
 </section>;
}
