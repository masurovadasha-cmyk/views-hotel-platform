module.exports=()=>{
 const mode=process.env.EXPO_PUBLIC_APP_MODE||'guest';
 if(!['guest','staff'].includes(mode))throw Error('INVALID_MOBILE_MODE');
 return {expo:{name:mode==='staff'?'VIEWS Staff Preview':'VIEWS Guest Preview',slug:'views-'+mode+'-preview',version:'0.1.0',platforms:['android','ios'],orientation:'portrait',
  android:{package:'uz.views.preview.'+mode},ios:{bundleIdentifier:'uz.views.preview.'+mode},extra:{preview:true,mode}}};
};
