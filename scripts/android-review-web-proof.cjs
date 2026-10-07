// Browser proof of bundled web assets, not Android/emulator acceptance.
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.VIEWS_BROWSER_EXECUTABLE||'/usr/bin/chromium'});
 try {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));
  const origin='https://appassets.androidplatform.net',prefix='/views-hotel-platform/';
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.origin!==origin||!u.pathname.startsWith(prefix)){external.push({origin:u.origin,type:route.request().resourceType()});return route.abort();}
   const relative=decodeURIComponent(u.pathname.slice(prefix.length))||'index.html';
   const file=path.resolve('dist',relative);
   if(!file.startsWith(path.resolve('dist')+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
   const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)];
   await route.fulfill({path:file,contentType:mime});
  });
  await page.goto(origin+prefix+'?api=demo',{waitUntil:'networkidle'});
  await page.getByText('Static staging demo',{exact:false}).first().waitFor({state:'attached'});
  assert.ok((await page.locator('#root').innerText()).length>100);
  assert.ok(await page.locator('button:visible').count()>0);
  assert.equal(await page.getByRole('heading',{name:'Вход в рабочую область',exact:true}).count(),0);
  assert.deepEqual(errors,[]);assert.ok(external.every(r=>r.type==='image'&&r.origin==='https://a0.muscache.com'));
  console.log(JSON.stringify({result:'pass',bundledAndroidOrigin:true,explicitDemo:true,blockedImageRequests:external.length,externalRequestsSent:0,pageErrors:0,androidDeviceTested:false}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
