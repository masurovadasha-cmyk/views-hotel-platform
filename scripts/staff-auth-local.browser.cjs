'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawnSync}=require('child_process');
const root=path.join(process.env.LOCALAPPDATA||'','VIEWS-Staging'),evidence=path.join(root,'evidence');
const {chromium}=require(path.join(root,'tools/browser-tests/node_modules/playwright'));
(async()=>{
 if(process.platform!=='win32'||process.argv[2]!=='--ack=LOCAL_STAFF_BROWSER_TEST')throw Error('LOCAL_BROWSER_ACK_REQUIRED');
 const fixture=JSON.parse(fs.readFileSync(path.join(root,'private/staff-browser-fixture.json'),'utf8'));
 if(!/^auth-proof-[a-f0-9]+@views\.invalid$/.test(fixture.email))throw Error('SYNTHETIC_STAFF_FIXTURE_REQUIRED');
 const browser=await chromium.launch({channel:'msedge',headless:true,chromiumSandbox:true});
 const context=await browser.newContext({locale:'ru-RU',viewport:{width:1440,height:1050}}),page=await context.newPage();
 const pageErrors=[],sizes=[],paths=new Set();let leaked=false;
 page.on('pageerror',e=>pageErrors.push(e.message));page.on('request',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/local-api/'))paths.add(u.pathname);
  const h=r.headers();if(h['x-views-service-token']||h['x-views-internal-key']||h['x-views-staff-session'])leaked=true;});
 const report={schemaVersion:1,stage:'7.25',result:'fail',sourceCommit:spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).stdout.trim(),
  trackedSourceDirty:spawnSync('git',['diff','--quiet','HEAD'],{windowsHide:true}).status!==0,pageErrors,sizes,
  browser:'Microsoft Edge isolated profile',productionEnabled:false,realPayments:false,emailDeliveryUsed:false};
 try{
  await page.goto('http://127.0.0.1:4173/?api=local-core',{waitUntil:'networkidle'});
  await page.getByRole('heading',{name:'Вход в рабочую область',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Рассчитать через Core',exact:true}).count(),0);
  await page.screenshot({path:path.join(evidence,'stage725-staff-login.png'),fullPage:true});
  await page.getByLabel('Email сотрудника',{exact:true}).fill(fixture.email);
  await page.getByLabel('Пароль',{exact:true}).fill(fixture.password);
  await page.getByRole('button',{name:'Войти',exact:true}).click();
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
  await page.screenshot({path:path.join(evidence,'stage725-staff-workspace.png'),fullPage:true});
  for(const width of [360,390,768,1440]){
   await page.setViewportSize({width,height:1000});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const s=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));sizes.push(s);assert.ok(s.document<=width+1&&s.body<=width+1);
   if(width===390)await page.screenshot({path:path.join(evidence,'stage725-staff-mobile.png'),fullPage:true});
  }
  await row.getByRole('button',{name:'Снять резерв',exact:true}).click();await row.getByText('Отменён',{exact:true}).waitFor();
  // Restart only the owned local gateway. Authentication must persist in Core DB.
  const node=path.join(root,'tools/node-v22.23.3-win-x64/node.exe'),launcher=path.resolve(__dirname,'../apps/api/ops/local-web-launch.cjs');
  for(const mode of ['stop','start'])assert.equal(spawnSync(node,[launcher,mode],{encoding:'utf8',windowsHide:true}).status,0);
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
