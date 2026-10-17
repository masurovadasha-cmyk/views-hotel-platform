import type {AppProps} from 'next/app';
import '@views/ui/foundation.css';
import '../styles/shell.css';
export default function App({Component,pageProps}:AppProps){return <Component {...pageProps}/>;}
