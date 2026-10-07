'use strict';
// Called only by the owned disposable Core runner. Uses real Core guards,
// PostgreSQL identity, loopback gateway and Chromium; never the persistent DB.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),net=require('node:net');
const assert=require('node:assert/strict'),{randomBytes,randomUUID}=require('node:crypto');
const REPO=path.resolve(__dirname,'..'),API=path.join(REPO,'apps/api');
const apiRequire=require('node:module').createRequire(path.join(API,'package.json'));
const {createLocalGateway}=require('../apps/api/ops/local-core-gateway.cjs');
async function free(port){await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',()=>reject(Error('PROOF_PORT_OCCUPIED:'+port)));s.listen(port,'127.0.0.1',()=>s.close(resolve));});}
module.exports=async function connectedProof({admin,runtimeUrl}){
 const marker=(await admin.query("SELECT current_database() name,shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0];
 assert.equal(marker.name,'views');assert.equal(marker.marker,'VIEWS_DISPOSABLE_CORE_TEST');await free(3001);await free(4173);
 const org='10000000-0000-4000-8000-000000000001',property='10000000-0000-4000-8000-000000000002',member='74900000-0000-4000-8000-000000000001';
 const password='Synthetic proof '+randomBytes(24).toString('hex'),secret=randomBytes(32).toString('hex');
 const previous={...process.env};let app,server,browser;
 try{
  Object.assign(process.env,{NODE_ENV:'test',VIEWS_LOCAL_REHEARSAL:'true',VIEWS_ENV:'local-rehearsal',DATABASE_URL:runtimeUrl,
   VIEWS_STAFF_AUTH_PILOT_ENABLED:'true',VIEWS_STAFF_AUTH_ORGANIZATION_ID:org,VIEWS_HOUSEKEEPING_PILOT_ENABLED:'true',
   VIEWS_OWNER_INVENTORY_DRAFT_ENABLED:'false',VIEWS_PAYME_SANDBOX_ENABLED:'false',VIEWS_PAYME_MODE:'sandbox',TRUSTED_PROXY_MODE:'direct',
   GUEST_AUTH_RATE_LIMIT_SECRET:randomBytes(32).toString('hex'),VIEWS_INTERNAL_API_KEY:secret,
   VIEWS_INTERNAL_SERVICE_AUTH_MODES_JSON:'{"local-workspace":"internal_key_only"}',VIEWS_INTERNAL_SERVICE_KEYS_JSON:JSON.stringify({'local-workspace':[secret]}),
   VIEWS_INTERNAL_SERVICE_KEY_REFS_JSON:'{}',VIEWS_INTERNAL_SERVICE_SOURCE_CIDRS_JSON:'{"local-workspace":["127.0.0.1/32"]}',
   VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON:'{}',VIEWS_TRUSTED_PROXY_CIDRS_JSON:''});
  const {hashStaffPassword}=require(path.join(API,'dist/staff-auth/staff-password.js'));
  const hash=await hashStaffPassword(password);
  assert.equal((await admin.query('UPDATE staff_private.credentials SET password_hash=$1,version=version+1 WHERE membership_id=$2',[hash,member])).rowCount,1);
  const unit=randomUUID(),type=randomUUID(),task=randomUUID(),code='HTTP-'+randomBytes(3).toString('hex');
  await admin.query('INSERT INTO unit_types(id,property_id,name,max_guests) VALUES($1,$2,$3,2)',[type,property,{en:'Synthetic connected proof'}]);
  await admin.query('INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1,$2,$3,$4)',[unit,property,type,code]);
  await admin.query(`INSERT INTO reservations(id,organization_id,property_id,unit_id,confirmation_code,status,check_in_at,check_out_at,currency,cancellation_policy_snapshot,quote_snapshot)
   VALUES($1,$2,$3,$4,$5,'checked_out','2025-01-01','2025-01-02','UZS','{}','{"localStayPilot":true}')`,[task,org,property,unit,'HTTP-'+task]);
  await admin.query('INSERT INTO local_stay_turnovers(reservation_id,organization_id,property_id,unit_id) VALUES($1,$2,$3,$4)',[task,org,property,unit]);
  apiRequire('reflect-metadata');
  app=await apiRequire('@nestjs/core').NestFactory.create(require(path.join(API,'dist/app.module.js')).AppModule,{logger:false});
  // The test harness binds explicitly; production/bootstrap configuration is not replaced.
  await app.listen(3001,'127.0.0.1');
  const gateway=createLocalGateway({configuration:{fixture:{organizationId:org,propertyId:property,units:[]},internalKey:secret}});
  const root=path.join(REPO,'dist');
  server=http.createServer(async(req,res)=>{
   if(await gateway(req,res))return;
   const u=new URL(req.url,'http://127.0.0.1:4173'),file=path.resolve(root,decodeURIComponent(u.pathname.slice(1))||'index.html');
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
   res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'application/javascript','.css':'text/css','.jpg':'image/jpeg'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
  });await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(4173,'127.0.0.1',resolve);});
  browser=await require('playwright').chromium.launch({headless:true,executablePath:'/usr/bin/chromium'});
  const page=await browser.newPage({viewport:{width:390,height:1000}}),errors=[],external=[],checks=[];
  page.on('pageerror',e=>errors.push(e.name));await page.route('**/*',route=>{if(new URL(route.request().url()).origin!=='http://127.0.0.1:4173'){external.push('blocked');return route.abort();}return route.continue();});
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});await page.getByLabel('Email сотрудника',{exact:true}).fill('cleaner1@views.invalid');await page.getByLabel('Пароль',{exact:true}).fill(password);await page.getByRole('button',{name:'Войти',exact:true}).click();
  await page.locator('.housekeepingWorkspace').waitFor();const row=()=>page.locator('.housekeepingTasks li').filter({hasText:code});await row().waitFor();
  assert.equal(await page.locator('#staff-reception,#staff-booking,#staff-owner').count(),0);checks.push('password_login_resolves_scoped_housekeeper');
  const session=await (await page.request.get('http://127.0.0.1:4173/local-api/session',{headers:{'X-Views-Local-Workspace':'1'}})).json();
  const headers={'X-Views-Local-Workspace':'1','X-CSRF-Token':session.csrf};assert.equal(session.identity.role,'housekeeper');
  const queue=await (await page.request.get('http://127.0.0.1:4173/local-api/housekeeping',{headers})).json();
  assert.deepEqual(Object.keys(queue.items.find(x=>x.taskId===task)).sort(),['assignment','createdAt','taskId','unitCode']);
  assert.equal((await page.request.get('http://127.0.0.1:4173/local-api/workspace',{headers})).status(),403);
  const forged=await page.request.post('http://127.0.0.1:4173/local-api/housekeeping',{headers:{...headers,Origin:'http://127.0.0.1:4173','Idempotency-Key':randomUUID()},data:{taskId:task,action:'claim',propertyId:randomUUID()}});assert.equal(forged.status(),400);checks.push('no_guest_data_reception_or_property_override');
  await row().getByRole('button',{name:'Взять задачу',exact:true}).click();await row().getByRole('button',{name:'Вернуть в очередь',exact:true}).waitFor();
  await page.reload({waitUntil:'networkidle'});await row().getByRole('button',{name:'Вернуть в очередь',exact:true}).click();await row().getByRole('button',{name:'Взять задачу',exact:true}).click();
  await row().getByRole('button',{name:'Уборка завершена',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Отмена',exact:true}).click();
  assert.equal((await admin.query('SELECT status FROM local_stay_turnovers WHERE reservation_id=$1',[task])).rows[0].status,'pending');
  await row().getByRole('button',{name:'Уборка завершена',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Подтвердить действие',exact:true}).click();await row().waitFor({state:'detached'});
  await page.reload({waitUntil:'networkidle'});assert.equal(await row().count(),0);checks.push('claim_release_confirmation_cancel_complete_reload');
  assert.deepEqual((await admin.query('SELECT status,completed_by,assigned_membership_id FROM local_stay_turnovers WHERE reservation_id=$1',[task])).rows[0],{status:'completed',completed_by:member,assigned_membership_id:member});
  assert.equal((await admin.query("SELECT count(*)::int n FROM audit_log WHERE entity_id=$1 AND action='housekeeping.synthetic_task_changed'",[task])).rows[0].n,4);
  assert.equal((await admin.query("SELECT count(*)::int n FROM outbox_events WHERE aggregate_id=$1 AND event_type='housekeeping.synthetic_task_changed'",[task])).rows[0].n,4);checks.push('postgresql_assignment_audit_outbox_match');
  await page.getByRole('button',{name:'Выйти',exact:true}).click();await page.getByRole('button',{name:'Войти',exact:true}).waitFor();assert.equal((await page.request.get('http://127.0.0.1:4173/local-api/housekeeping',{headers})).status(),401);checks.push('logout_denies_queue');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log(JSON.stringify({stage:'7.50',result:'pass',checks,actualCoreHttp:true,actualPasswordLogin:true,disposableDatabase:true,externalRequestsSent:0,persistentAccountsChanged:false}));
 }finally{
  if(browser)await browser.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}if(app)await app.close();
  for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);
 }
};
