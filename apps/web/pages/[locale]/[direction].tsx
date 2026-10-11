import Head from 'next/head';
import Link from 'next/link';
import type {GetServerSideProps} from 'next';
const copy={
 ru:{guest:'Гостям',host:'Хостам',notice:'Каркас VIEWS — каталог, вход и бронирование ещё не подключены.',language:'Язык',directions:'Направления'},
 uz:{guest:'Mehmonlar uchun',host:'Xostlar uchun',notice:'VIEWS namoyishi — katalog, kirish va bron qilish hali ulanmagan.',language:'Til',directions:'Yoʻnalishlar'},
 en:{guest:'For guests',host:'For hosts',notice:'VIEWS shell — catalogue, sign-in and booking are not connected yet.',language:'Language',directions:'Directions'},
};
type Props={locale:keyof typeof copy;direction:'guest'|'host'};
export const getServerSideProps:GetServerSideProps<Props>=async({params,res})=>{
 const locale=params?.locale,direction=params?.direction;
 if(typeof locale!=='string'||!Object.hasOwn(copy,locale)||(direction!=='guest'&&direction!=='host'))return {notFound:true};
 res.setHeader('Cache-Control','no-store');
 return {props:{locale:locale as Props['locale'],direction}};
};
export default function Shell({locale,direction}:Props){
 const t=copy[locale];
 return <main className="app webShell" lang={locale}><Head><title>VIEWS · {t[direction]}</title><meta name="robots" content="noindex,nofollow"/></Head>
  <header><strong>VIEWS</strong><nav aria-label={t.language}>{(['ru','uz','en'] as const).map(l=><Link key={l} href={`/${l}/${direction}`} hrefLang={l} aria-current={l===locale?'page':undefined}>{l.toUpperCase()}</Link>)}</nav></header>
  <nav aria-label={t.directions}>{(['guest','host'] as const).map(d=><Link key={d} href={`/${locale}/${d}`} aria-current={d===direction?'page':undefined}>{t[d]}</Link>)}</nav>
  <h1>{t[direction]}</h1><p role="status">{t.notice}</p>
 </main>;
}
