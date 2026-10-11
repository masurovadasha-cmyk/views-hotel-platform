import {useEffect,useRef,useState} from 'react';
import {View,Text,Pressable,StyleSheet,ScrollView} from 'react-native';
import {locales,translate} from '@views/shared/i18n';
import {nativeColors} from '@views/ui/native';
import {defaults,type Preferences} from './preferences';
import {preferencesStore} from './preference-storage';
const messages={
 'Loading settings…':{ru:'Загрузка настроек…',uz:'Sozlamalar yuklanmoqda…'},
 'Settings could not be loaded or saved. Your selection works for this session.':{ru:'Не удалось загрузить или сохранить настройки. Выбор действует в этом сеансе.',uz:'Sozlamalar yuklanmadi yoki saqlanmadi. Tanlov shu seansda amal qiladi.'},
 'Theme':{ru:'Тема',uz:'Mavzu'},'Light':{ru:'Светлая',uz:'Yorugʻ'},'Dark':{ru:'Тёмная',uz:'Qorongʻi'},
 'Guest app':{ru:'Приложение гостя',uz:'Mehmon ilovasi'},'Staff app':{ru:'Приложение персонала',uz:'Xodim ilovasi'},
 'Preview: sign-in and operational data are not connected.':{ru:'Каркас: вход и рабочие данные не подключены.',uz:'Namoyish: kirish va ish maʼlumotlari ulanmagan.'},
 'Language':{ru:'Язык',uz:'Til'},
};
export default function App(){
 const [settings,setSettings]=useState<Preferences>({...defaults});
 const [ready,setReady]=useState(false);
 const [storageError,setStorageError]=useState(false);
 const latest=useRef(settings);
 const revision=useRef(0);
 useEffect(()=>{
  let active=true;
  preferencesStore.load().then(value=>{if(active){latest.current=value;setSettings(value);}})
   .catch(()=>{if(active)setStorageError(true);}).finally(()=>{if(active)setReady(true);});
  return ()=>{active=false;};
 },[]);
 const update=(patch:Partial<Preferences>)=>{
  const next={...latest.current,...patch}; latest.current=next; setSettings(next);
  const current=++revision.current;
  preferencesStore.save(next).then(()=>{if(current===revision.current)setStorageError(false);})
   .catch(()=>{if(current===revision.current)setStorageError(true);});
 };
 const {locale,theme:activeTheme}=settings;
 const colors=nativeColors[activeTheme];
 const styles=makeStyles(colors);
 const mode=process.env.EXPO_PUBLIC_APP_MODE||'guest';
 const t=(s:string)=>translate(messages,locale,s);
 if(!ready) return <View style={styles.page}><Text style={styles.notice}>{t('Loading settings…')}</Text></View>;
 return <ScrollView style={{backgroundColor:colors.bg}} contentContainerStyle={styles.page}><Text accessibilityRole="header" style={styles.brand}>VIEWS</Text>
  <Text accessibilityRole="header" style={styles.title}>{t(mode==='staff'?'Staff app':'Guest app')}</Text>
  <Text style={styles.notice}>{t('Preview: sign-in and operational data are not connected.')}</Text>
  <Text style={styles.label}>{t('Language')}</Text><View style={styles.languages}>{locales.map(l=><Pressable key={l} accessibilityRole="button" accessibilityLabel={l==='ru'?'Русский':l==='uz'?'Oʻzbekcha':'English'} accessibilityState={{selected:l===locale}} onPress={()=>update({locale:l})} style={[styles.button,l===locale&&styles.selected]}><Text style={styles.buttonText}>{l.toUpperCase()}</Text></Pressable>)}</View>
  <Text style={[styles.label,{marginTop:24}]}>{t('Theme')}</Text>
  <View style={styles.languages}>{(['light','dark'] as const).map(value=><Pressable key={value} accessibilityRole="button" accessibilityState={{selected:value===activeTheme}} onPress={()=>update({theme:value})} style={[styles.button,value===activeTheme&&styles.selected]}><Text style={styles.buttonText}>{t(value==='light'?'Light':'Dark')}</Text></Pressable>)}</View>
  {storageError&&<Text accessibilityRole="alert" style={styles.notice}>{t('Settings could not be loaded or saved. Your selection works for this session.')}</Text>}
 </ScrollView>;
}
const makeStyles=(colors:typeof nativeColors.light|typeof nativeColors.dark)=>StyleSheet.create({page:{flexGrow:1,padding:24,paddingTop:64,backgroundColor:colors.bg},brand:{fontSize:20,fontWeight:'700',color:colors.fg},title:{fontSize:28,fontWeight:'600',marginTop:24,color:colors.fg},notice:{fontSize:17,lineHeight:26,marginVertical:24,color:colors.fg},label:{fontSize:16,color:colors.fg},languages:{flexDirection:'row',flexWrap:'wrap',gap:12,marginTop:12},button:{minWidth:64,minHeight:48,padding:12,borderWidth:1,borderColor:colors.gold,borderRadius:8},selected:{backgroundColor:colors.surface},buttonText:{color:colors.fg,fontSize:16,textAlign:'center'}});
