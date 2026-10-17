import {useEffect, useState} from 'react';
import {WifiOff} from 'lucide-react';
import {translate, type Locale} from '../i18n/messages';

const messages = {
  'You are offline. Displayed data may be out of date. Check your connection before retrying an action.': {
    ru: 'Нет сети. Показанные данные могут устареть. Проверьте подключение перед повтором действия.',
    uz: 'Internet aloqasi yoʻq. Koʻrsatilgan maʼlumotlar eskirgan boʻlishi mumkin. Amalni takrorlashdan oldin ulanishni tekshiring.',
  },
};

export function ConnectionNotice({locale}: {locale: Locale}) {
  const [offline, setOffline] = useState(() => !navigator.onLine);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return offline ? <aside className="connectionNotice" role="status">
    <WifiOff size={20} aria-hidden="true"/>
    <span>{translate(messages, locale, 'You are offline. Displayed data may be out of date. Check your connection before retrying an action.')}</span>
  </aside> : null;
}
