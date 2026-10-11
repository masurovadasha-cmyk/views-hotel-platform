import {useState} from 'react';
import {View,Text,Pressable,StyleSheet,ScrollView} from 'react-native';
import {locales,translate,type Locale} from '@views/shared/i18n';
const messages={
 'Guest app':{ru:'Приложение гостя',uz:'Mehmon ilovasi'},'Staff app':{ru:'Приложение персонала',uz:'Xodim ilovasi'},
 'Preview: sign-in and operational data are not connected.':{ru:'Каркас: вход и рабочие данные не подключены.',uz:'Namoyish: kirish va ish maʼlumotlari ulanmagan.'},
 'Language':{ru:'Язык',uz:'Til'},
};
export default function App(){
 const [locale,setLocale]=useState<Locale>('ru');
 const mode=process.env.EXPO_PUBLIC_APP_MODE||'guest';
 const t=(s:string)=>translate(messages,locale,s);
 return <ScrollView contentContainerStyle={styles.page}><Text accessibilityRole="header" style={styles.brand}>VIEWS</Text>
  <Text accessibilityRole="header" style={styles.title}>{t(mode==='staff'?'Staff app':'Guest app')}</Text>
  <Text style={styles.notice}>{t('Preview: sign-in and operational data are not connected.')}</Text>
  <Text style={styles.label}>{t('Language')}</Text><View style={styles.languages}>{locales.map(l=><Pressable key={l} accessibilityRole="button" accessibilityLabel={l==='ru'?'Русский':l==='uz'?'Oʻzbekcha':'English'} accessibilityState={{selected:l===locale}} onPress={()=>setLocale(l)} style={[styles.button,l===locale&&styles.selected]}><Text style={styles.buttonText}>{l.toUpperCase()}</Text></Pressable>)}</View>
 </ScrollView>;
}
const styles=StyleSheet.create({page:{flexGrow:1,padding:24,paddingTop:64,backgroundColor:'#f6f5f2'},brand:{fontSize:20,fontWeight:'700',color:'#20242c'},title:{fontSize:28,fontWeight:'600',marginTop:24,color:'#20242c'},notice:{fontSize:17,lineHeight:26,marginVertical:24,color:'#20242c'},label:{fontSize:16,color:'#20242c'},languages:{flexDirection:'row',flexWrap:'wrap',gap:12,marginTop:12},button:{minWidth:64,minHeight:48,padding:12,borderWidth:1,borderColor:'#765c2f',borderRadius:8},selected:{backgroundColor:'#e5dfd3'},buttonText:{color:'#20242c',fontSize:16,textAlign:'center'}});
