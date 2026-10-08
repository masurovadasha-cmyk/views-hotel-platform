type Env={ASSETS:{fetch:(request:Request)=>Promise<Response>}};
/** Public design preview only: never route an unknown API to the HTML shell. */
export default {
 async fetch(request:Request,env:Env):Promise<Response>{
  const path=new URL(request.url).pathname;
  if(/^\/(api|local-api|v1)(\/|$)/.test(path))return Response.json(
   {error:'PUBLIC_CORE_NOT_CONNECTED',emailConnected:false,realPayments:false},
   {status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
  const upstream=await env.ASSETS.fetch(request),response=new Response(upstream.body,upstream);
  response.headers.set('X-Content-Type-Options','nosniff');
  response.headers.set('Referrer-Policy','strict-origin-when-cross-origin');
  response.headers.set('Content-Security-Policy',"frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
  if(path==='/'||path.endsWith('.html')||path==='/release.json')response.headers.set('Cache-Control','no-store');
  return response;
 }
};
