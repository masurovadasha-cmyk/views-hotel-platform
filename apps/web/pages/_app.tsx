import type {AppProps} from 'next/app';
import '../../../src/design-system/foundation.css';
import '../styles/shell.css';
export default function App({Component,pageProps}:AppProps){return <Component {...pageProps}/>;}
