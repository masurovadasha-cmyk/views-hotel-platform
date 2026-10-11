import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {preview} from 'vite';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../apps/crm',import.meta.url));
const server=await preview({root,preview:{host:'127.0.0.1',port:0,strictPort:true}});
let browser;
try{
 const port=server.httpServer.address().port;
 browser=await chromium.launch({headless:true,...(existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{}),args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],api=[];
 page.setDefaultTimeout(10000);
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/\/(?:api|local-api|guest-api)\//.test(r.url()))api.push(r.url());});
 await page.goto('http://127.0.0.1:'+port);
 await page.getByText('Каркас CRM — вход и рабочие данные не подключены.',{exact:true}).waitFor();
 await page.getByLabel('Язык',{exact:true}).selectOption('en');
 assert.equal(await page.locator('html').getAttribute('lang'),'en');
 await page.getByText('CRM preview — sign-in and operational data are not connected.',{exact:true}).waitFor();
 const roles=await page.getByLabel('Work area',{exact:true}).locator('option').evaluateAll(nodes=>nodes.map(n=>n.value));
 assert.equal(roles.length,9);
 for(const role of roles){await page.getByLabel('Work area',{exact:true}).selectOption(role);await page.locator('[data-staff-role="'+role+'"]').waitFor();}
 await page.getByLabel('Dark theme',{exact:true}).check();assert.ok(await page.locator('.crmShell.dark').count());
 await page.getByLabel('Language',{exact:true}).selectOption('uz');assert.equal(await page.locator('html').getAttribute('lang'),'uz');
 await page.getByText('CRM namoyishi — kirish va ish maʼlumotlari ulanmagan.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);assert.deepEqual(api,[]);
 console.log('CRM shell PASS: 9 roles, 3 locales, dark theme, mobile width, no API calls or JS errors');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.httpServer.close(resolve));}
