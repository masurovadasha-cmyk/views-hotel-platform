'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{chromium}=require('playwright');
const android=process.argv.includes('--android'),directory=path.resolve(android?'dist-android':'dist'),prefix=android?'/views-hotel-platform/':'/',origin='https://design.views.invalid';
(async()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(directory,'design-140/manifest.json')));assert.equal(manifest.kind,'design-reference-not-runtime');assert.equal(manifest.assets.length,280);
 for(const item of manifest.assets){const bytes=fs.readFileSync(path.join(directory,'design-140',item.file));assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);}
 const browser=await chromium.launch({headless:true,executablePath:process.env.VIEWS_BROWSER_EXECUTABLE||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('views.guest.locale','en');if(location.hostname==='design.views.invalid')delete String.prototype.replaceAll;});
  await page.route('**/*',async r=>{const url=new URL(r.request().url());assert.equal(url.origin,origin);assert.ok(url.pathname.startsWith(prefix));assert.ok(!/\/(guest-api|local-api|v1|api)\//.test(url.pathname));requests.push(url.pathname);const file=path.resolve(directory,decodeURIComponent(url.pathname.slice(prefix.length))||'index.html');assert.ok(file.startsWith(directory+path.sep));await r.fulfill({path:file,contentType:{'.js':'application/javascript','.css':'text/css','.webp':'image/webp','.html':'text/html','.json':'application/json','.jpg':'image/jpeg'}[path.extname(file)]});});
  await page.goto(origin+prefix+'?api=demo&design=140&screen=SG-LA-005');const main=page.getByTestId('design-review');
  await main.getByRole('heading',{name:/SG-LA-005/}).waitFor();assert.equal(await main.locator('nav button').count(),140);
  for(const role of ['guest','dispatcher','staff','partner','host','admin']){
   await main.getByLabel('Audience',{exact:true}).selectOption(role);assert.ok(await main.locator('nav button').count()>0);
   for(const dark of [false,true]){
    if(await page.locator('[data-theme-toggle]').getAttribute('aria-pressed')!==String(dark))await page.locator('[data-theme-toggle]').click();
    await page.waitForFunction(()=>{const img=document.querySelector('.designDetail img');return img&&img.complete&&img.naturalWidth>0;});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   }
  }
  await main.getByLabel('Audience',{exact:true}).selectOption('');await main.getByLabel('Implementation',{exact:true}).selectOption('pending');assert.equal(await main.locator('nav button').count(),79); // Five newly partial H2/A1 IDs; full acceptance remains pending.
  await main.getByLabel('Find by name or screen ID',{exact:true}).fill('no-such-screen');await main.getByText('No matching screens',{exact:true}).waitFor();
  await main.getByLabel('Find by name or screen ID',{exact:true}).fill('');await main.getByLabel('Implementation',{exact:true}).selectOption('');
  for(const lang of ['ru','uz','en']){await page.locator('.guestLanguage select').selectOption(lang);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  await main.screenshot({path:'/tmp/views-015-design-'+(android?'android':'web')+'.png'});
  await main.getByRole('button',{name:'Back to application',exact:true}).click();await page.locator('.guestShell').waitFor();assert.equal(new URL(page.url()).searchParams.has('design'),false);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'pass',androidAssets:android,referenceImages:280,roles:6,themes:2,locales:3,publicWorkflowImplementation:false,imageRequests:requests.filter(p=>p.endsWith('.webp')).length}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
