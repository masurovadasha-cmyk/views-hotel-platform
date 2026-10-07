'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawnSync}=require('child_process');
const {root}=require('../apps/api/ops/local-state.cjs').localState(),evidence=path.join(root,'evidence');
const {chromium}=require('playwright');
(async()=>{
 if(process.argv[2]!=='--ack=LOCAL_STAFF_BROWSER_TEST')throw Error('LOCAL_BROWSER_ACK_REQUIRED');
 const fixture=JSON.parse(fs.readFileSync(path.join(root,'private/staff-browser-fixture.json'),'utf8'));
 if(!/^auth-proof-[a-f0-9]+@views\.invalid$/.test(fixture.email))throw Error('SYNTHETIC_STAFF_FIXTURE_REQUIRED');
 const browser=await chromium.launch(process.platform==='win32'?{channel:'msedge',headless:true,chromiumSandbox:true}:{executablePath:process.env.VIEWS_BROWSER_EXECUTABLE||'/usr/bin/chromium',headless:true});
 const context=await browser.newContext({locale:'ru-RU',viewport:{width:1440,height:1050}}),page=await context.newPage();
 const pageErrors=[],sizes=[],paths=new Set();let leaked=false;
 page.on('pageerror',e=>pageErrors.push(e.message));page.on('request',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/local-api/'))paths.add(u.pathname);
  const h=r.headers();if(h['x-views-service-token']||h['x-views-internal-key']||h['x-views-staff-session'])leaked=true;});
 const report={schemaVersion:1,stage:'7.25',result:'fail',sourceCommit:spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).stdout.trim(),
  trackedSourceDirty:spawnSync('git',['diff','--quiet','HEAD'],{windowsHide:true}).status!==0,pageErrors,sizes,
  browser:process.platform==='win32'?'Microsoft Edge isolated profile':'Chromium Linux isolated profile',productionEnabled:false,realPayments:false,emailDeliveryUsed:false};
 try{
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
  await page.getByRole('heading',{name:'Вход в рабочую область',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Рассчитать через Core',exact:true}).count(),0);
  await page.screenshot({path:path.join(evidence,'stage725-staff-login.png'),fullPage:true});
  await page.getByLabel('Email сотрудника',{exact:true}).fill(fixture.email);
  await page.getByLabel('Пароль',{exact:true}).fill(fixture.password);
  const loginResponsePromise=page.waitForResponse(r=>r.url().endsWith('/local-api/login'));
  await page.getByRole('button',{name:'Войти',exact:true}).click();
  const loginResponse=await loginResponsePromise;
  assert.equal(loginResponse.status(),200,'STAFF_LOGIN_HTTP_'+loginResponse.status());
  await page.getByLabel('Апартамент',{exact:true}).waitFor();
  const cookie=(await context.cookies()).find(c=>c.name==='views_staff_session');assert.ok(cookie?.httpOnly&&cookie.sameSite==='Strict');
  await page.getByLabel('Апартамент',{exact:true}).selectOption({index:1});
  const day=n=>new Date(Date.now()+(260+n)*86400000).toISOString().slice(0,10);
  await page.getByLabel('Заезд',{exact:true}).fill(day(0));await page.getByLabel('Выезд',{exact:true}).fill(day(2));
  const [quoted]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/local-api/quotes')),page.getByRole('button',{name:'Рассчитать через Core',exact:true}).click()]);
  assert.equal(quoted.status(),200);assert.equal((await quoted.json()).totalMinor,'130000000');
  const [held]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/local-api/holds')),page.getByRole('button',{name:'Создать тестовый резерв',exact:true}).click()]);
  assert.equal(held.status(),200);const reservationId=(await held.json()).reservationId;
  await page.reload({waitUntil:'networkidle'});const row=page.locator('[data-reservation-id="'+reservationId+'"]');await row.waitFor();
  const reception=page.getByRole('region',{name:'Ресепшен',exact:true});
  await reception.getByRole('region',{name:'Ожидаемые заезды',exact:true}).waitFor();
  await reception.getByLabel('Дата ресепшена',{exact:true}).fill(day(0));
  const [summary]=await Promise.all([page.waitForResponse(r=>r.url().includes('/local-api/reception?day='+day(0))),reception.getByRole('button',{name:'Показать сводку',exact:true}).click()]);
  assert.equal(summary.status(),200);const board=await summary.json();assert.equal(board.day,day(0));assert.equal(board.property.timezone,'Asia/Tashkent');
  assert.ok(!board.arrivals.items.some(r=>r.reservationId===reservationId));
  const invalid=await page.evaluate(async()=>{
   const session=await(await fetch('/local-api/session',{headers:{'X-Views-Local-Workspace':'1'}})).json();
   const headers={'X-Views-Local-Workspace':'1','X-CSRF-Token':session.csrf};
   return Promise.all(['/local-api/reception?day=2034-02-30','/local-api/reception?day=today&propertyId=forged'].map(async path=>(await fetch(path,{headers})).status));
  });assert.deepEqual(invalid,[400,400]);report.reception={serverProjection:true,holdExcluded:true,invalidDateAndScopeOverrideDenied:true};
  await page.screenshot({path:path.join(evidence,'stage725-staff-workspace.png'),fullPage:true});
  for(const width of [360,390,768,1440]){
   await page.setViewportSize({width,height:1000});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const s=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));sizes.push(s);assert.ok(s.document<=width+1&&s.body<=width+1);
   if(width===390)await page.screenshot({path:path.join(evidence,'stage725-staff-mobile.png'),fullPage:true});
  }
  await row.getByRole('button',{name:'Снять резерв',exact:true}).click();await row.getByText('Отменён',{exact:true}).waitFor();
  const navigation=page.getByRole('navigation',{name:'Разделы рабочей области',exact:true});
  for(const [label,target] of [['Ресепшен и уборка','staff-reception'],['Очередь уборки','staff-cleaning'],['Бронирование','staff-booking'],['Ключи доступа','staff-security'],['Учётная запись','staff-account']]){
   await navigation.getByRole('link',{name:label,exact:true}).click();assert.equal(new URL(page.url()).hash,'#'+target);assert.equal(await page.locator('#'+target).count(),1);
  }
  assert.equal(new URL(page.url()).search,'');report.defaultLocalEntry=true;report.workspaceNavigation=true;
  // Restart only the owned local gateway. Authentication must persist in Core DB.
  const node=process.platform==='win32'?path.join(root,'tools/node-v22.23.3-win-x64/node.exe'):process.execPath;
  const launcher=path.resolve(__dirname,process.platform==='win32'?'../apps/api/ops/local-web-launch.cjs':'../apps/api/ops/cloud-local-rehearsal.cjs');
  for(const mode of process.platform==='win32'?['stop','start']:['restart-web'])assert.equal(spawnSync(node,[launcher,mode],{encoding:'utf8',windowsHide:true}).status,0);
  await page.reload({waitUntil:'networkidle'});await page.getByLabel('Апартамент',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Выйти',exact:true}).click();await page.getByRole('heading',{name:'Вход в рабочую область',exact:true}).waitFor();
  await page.reload({waitUntil:'networkidle'});await page.getByRole('heading',{name:'Вход в рабочую область',exact:true}).waitFor();
  assert.equal(await page.getByLabel('Апартамент',{exact:true}).count(),0);
  assert.deepEqual(pageErrors,[]);assert.equal(leaked,false);
  Object.assign(report,{result:'pass',checkedAt:new Date().toISOString(),passwordLogin:true,unauthenticatedWorkspaceHidden:true,
    sessionSurvivesGatewayRestart:true,reservationSurvivesReload:true,reservationReleased:true,logoutPersistsAcrossReload:true,
    serviceCredentialsExposed:false,httpOnlyCookieVerified:true,apiPaths:[...paths]});
 }catch(e){report.error=String(e.message).slice(0,400);process.exitCode=1;await page.screenshot({path:path.join(evidence,'stage725-browser-failure.png'),fullPage:true}).catch(()=>{});}
 finally{await browser.close();}
 fs.writeFileSync(path.join(evidence,'stage725-browser.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(()=>{console.error('STAFF_BROWSER_PROOF_FAILED');process.exitCode=1;});
