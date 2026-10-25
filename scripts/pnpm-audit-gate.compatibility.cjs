'use strict';
// Exercise the real transitive modules used by VIEWS, not package version labels.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createRequire}=require('node:module'),path=require('node:path');
const http=require('node:http'),zlib=require('node:zlib');
const api=createRequire(path.resolve('apps/api/package.json'));
const mobile=createRequire(path.resolve('apps/mobile/package.json'));
const expo=createRequire(mobile.resolve('expo/package.json'));
const cli=createRequire(expo.resolve('@expo/cli/package.json'));
const root=path.dirname(expo.resolve('@expo/cli/package.json'));
const plugin={packageName:'synthetic-plugin',packageRoot:'/synthetic',cliExtensions:{description:'Synthetic',entryPoint:'commands.js',commands:[{name:'inspect',title:'Inspect',environments:['cli','mcp'],parameters:[{name:'text',type:'text'},{name:'count',type:'number'},{name:'confirmed',type:'confirm'}]}]}};
test('actual Expo plugin schemas retain validation and output contracts with patched Zod',()=>{
 const {PluginSchema,DevToolsPluginOutputSchema}=require(path.join(root,'build/src/start/server/DevToolsPlugin.schema.js'));
 assert.equal(PluginSchema.safeParse(plugin).success,true);
 for(const changed of [{packageName:''},{cliExtensions:{...plugin.cliExtensions,commands:[]}},{cliExtensions:{...plugin.cliExtensions,commands:[{...plugin.cliExtensions.commands[0],environments:['invalid']}]}}])assert.equal(PluginSchema.safeParse({...plugin,...changed}).success,false);
 const outputs=[{type:'text',text:'Synthetic',level:'info'},{type:'audio',url:'https://example.invalid/audio'},{type:'image',url:'https://example.invalid/image'}];
 assert.deepEqual(DevToolsPluginOutputSchema.parse(outputs),outputs);
 assert.equal(DevToolsPluginOutputSchema.safeParse([{type:'image',url:'not-a-url'}]).success,false);
 assert.equal(DevToolsPluginOutputSchema.safeParse([{type:'text',text:'x',level:'root'}]).success,false);
});
test('actual Expo MCP registration preserves strict typed command input and environment filtering',async()=>{
 const {addMcpCapabilities}=require(path.join(root,'build/src/start/server/MCPDevToolsPluginCLIExtensions.js'));
 let registered;
 await addMcpCapabilities({registerTool(name,config,handler){registered={name,config,handler};}}, {devtoolsPluginManager:{queryPluginsAsync:async()=>[{...plugin,cliExtensions:{...plugin.cliExtensions,commands:[...plugin.cliExtensions.commands,{name:'cliOnly',title:'CLI only',environments:['cli']}]}}]}});
 assert.equal(registered.name,'synthetic-plugin');const s=registered.config.inputSchema.parameters;
 assert.deepEqual(s.parse({command:'inspect',text:'sample',count:2,confirmed:true}),{command:'inspect',text:'sample',count:2,confirmed:true});
 assert.equal(s.safeParse({command:'inspect'}).success,true);
 for(const value of [{command:'cliOnly'},{command:'inspect',count:'2'},{command:'inspect',confirmed:'true'},{command:'inspect',extra:true}])assert.equal(s.safeParse(value).success,false);
 assert.equal(typeof registered.handler,'function');
});
test('patched Zod applies declared collection bounds before walking oversized input',()=>{
 // Upstream a0ebf97 fixes constrained collections; it does not invent limits for unbounded schemas.
 const {z}=cli('zod');const result=z.array(z.string()).max(4).safeParse(Array(20000).fill(42));
 assert.equal(result.success,false);assert.equal(result.error.issues.length,1);assert.equal(result.error.issues[0].code,'too_big');
});
async function request(server,body,headers={}){return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port:server.address().port,path:'/',method:'POST',headers:{'content-type':'application/json','content-length':body.length,...headers}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,text}));});req.on('error',reject);req.end(body);});}
test('Express JSON parser accepts normal gzip and remains usable after malformed compressed input',async()=>{
 const express=api('express'),app=express();app.use(express.json());app.post('/',(req,res)=>res.json(req.body));app.use((e,req,res,next)=>res.status(e.status||400).json({error:'invalid'}));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{const valid=zlib.gzipSync(Buffer.from('{"synthetic":true}'));assert.deepEqual(await request(server,valid,{'content-encoding':'gzip'}),{status:200,text:'{"synthetic":true}'});
  await request(server,Buffer.concat([valid,Buffer.from('invalid trailing bytes')]),{'content-encoding':'gzip'});
  assert.deepEqual(await request(server,Buffer.from('{"stillAlive":true}')),{status:200,text:'{"stillAlive":true}'});
 }finally{await new Promise(r=>server.close(r));}
});
test('Nodemailer stream transport retains one explicit synthetic envelope recipient',async()=>{
 const transport=api('nodemailer').createTransport({streamTransport:true,buffer:true,newline:'unix'});
 const result=await transport.sendMail({from:{name:'VIEWS synthetic',address:'from@views.invalid'},to:[{name:'Literal display; <not-a-recipient>',address:'to@views.invalid'}],envelope:{from:'from@views.invalid',to:['to@views.invalid']},subject:'Synthetic',text:'Local compatibility proof only',disableFileAccess:true,disableUrlAccess:true});
 assert.deepEqual(result.envelope,{from:'from@views.invalid',to:['to@views.invalid']});assert.ok(Buffer.isBuffer(result.message));
});
test('Nest multer dependency survives a delayed file filter after parser teardown',{timeout:3000},async()=>{
 // Same real parser race as upstream expressjs/multer@80a2d9d, adapted to the Nest dependency path.
 const platform=createRequire(api.resolve('@nestjs/platform-express/package.json')),multer=platform('multer');
 const request=new (require('node:stream').PassThrough)();let parser,resume,calls=0;
 const rejected=new Error('Synthetic rejection'),boundary='ViewsSyntheticMultipart';
 const body=['first','second'].map(name=>`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${name}.txt"\r\nContent-Type: text/plain\r\n\r\nx`).join('\r\n');
 request.headers={'content-type':`multipart/form-data; boundary=${boundary}`,'content-length':Buffer.byteLength(body)};
 await new Promise((resolve,reject)=>{
  const middleware=multer({fileHwm:1,streamHandler(req,p){parser=p;req.pipe(p);},fileFilter(req,file,callback){if(file.fieldname==='first')resume=callback;else req.once('end',()=>setImmediate(()=>callback(rejected)));}}).any();
  middleware(request,null,error=>{try{calls++;assert.equal(error,rejected);assert.equal(typeof resume,'function');setImmediate(()=>{parser.once('close',()=>{try{assert.equal(calls,1);assert.deepEqual(request.files,[]);resolve();}catch(e){reject(e);}});resume(null,true);});}catch(e){reject(e);}});
  request.end(body);
 });
});
