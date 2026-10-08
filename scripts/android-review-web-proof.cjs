// Browser proof of bundled web assets, not Android/emulator acceptance.
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.VIEWS_BROWSER_EXECUTABLE||'/usr/bin/chromium'});
 try {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.addInitScript(()=>{delete String.prototype.replaceAll;localStorage.setItem('views.guest.locale','en');localStorage.setItem('views.staff.locale','en');});
  const errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));
  const origin='https://appassets.androidplatform.net',prefix='/views-hotel-platform/';
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.origin!==origin||!u.pathname.startsWith(prefix)){external.push({origin:u.origin,type:route.request().resourceType()});return route.abort();}
   const relative=decodeURIComponent(u.pathname.slice(prefix.length))||'index.html';
   const file=path.resolve('dist-android',relative);
   if(!file.startsWith(path.resolve('dist-android')+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
   const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg'}[path.extname(file)];
   await route.fulfill({path:file,contentType:mime});
  });
  await page.goto(origin+prefix+'?api=demo',{waitUntil:'networkidle'});
  await page.getByText('Static staging demo',{exact:false}).first().waitFor({state:'attached'});
  assert.ok((await page.locator('#root').innerText()).length>100);
  assert.ok(await page.locator('button:visible').count()>0);
  assert.equal(await page.getByRole('heading',{name:'Вход в рабочую область',exact:true}).count(),0);
  const sms=page.getByRole('button',{name:'SMS verification',exact:true});
  await sms.click();
  const smsStatus=page.getByRole('dialog',{name:'SMS verification unavailable',exact:true});
  await smsStatus.waitFor();
  assert.equal(await smsStatus.locator('input').count(),0);
  assert.equal(await smsStatus.getByRole('button',{name:'Verify',exact:true}).count(),0);
  assert.equal(await smsStatus.getByRole('button',{name:'Close',exact:true}).evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Tab');
  assert.equal(await smsStatus.getByRole('button',{name:'Close',exact:true}).evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Escape');
  assert.equal(await smsStatus.count(),0);
  assert.equal(await sms.evaluate(el=>el===document.activeElement),true);
  const photos=page.locator('.photoButton img');
  assert.equal(await photos.count(),4);
  async function verifyPhotos(){
   await page.waitForFunction(()=>{const images=[...document.querySelectorAll('.photoButton img')];return images.length===4&&images.every(img=>img.complete&&img.naturalWidth>0);});
  }
  await verifyPhotos();
  for(const width of [360,390,768,1440]){
   await page.setViewportSize({width,height:900});
   await verifyPhotos();
  }
  await page.locator('.photoButton').first().click();
  const detail=page.locator('.modalPhoto');await detail.waitFor();
  assert.ok(await detail.evaluate(img=>img.complete&&img.naturalWidth>0));
  await page.reload({waitUntil:'networkidle'});await verifyPhotos();
  await page.getByRole('button',{name:'Staff CRM',exact:true}).click();
  await page.getByRole('heading',{name:'Overview',exact:true}).waitFor();
  await page.getByRole('button',{name:'Guest App',exact:true}).click();
  await verifyPhotos();
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log(JSON.stringify({result:'pass',bundledAndroidOrigin:true,explicitDemo:true,loadedListingPhotos:4,smsHonestAndKeyboardAccessible:true,legacyStringApiAbsent:true,staffNavigation:true,detailPhotoLoaded:true,reloadPhotosLoaded:true,viewports:[360,390,768,1440],blockedImageRequests:external.length,externalRequestsSent:0,pageErrors:0,androidDeviceTested:false}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
