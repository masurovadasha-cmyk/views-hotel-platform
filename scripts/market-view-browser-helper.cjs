'use strict';
// Explicit view transitions for older regression suites; never changes the ledger.
const durable=require('./demo-market-storage-browser-helper.cjs');
async function view(page,name){await durable.ready(page);const shop=page.getByTestId('guest-market');if(await shop.getAttribute('data-view')!==name){const nav=shop.getByTestId('market-nav-'+name);if(await nav.count())await nav.click();}await durable.ready(page);}
async function readIn(page,name,read){const previous=await page.getByTestId('guest-market').getAttribute('data-view');await view(page,name);try{return await read();}finally{if(previous&&previous!==name)await view(page,previous);}}
function action(page,name,locator){return new Proxy({}, {get(_target,method){if(['getByRole','locator','getByTestId','first','nth'].includes(method))return(...args)=>action(page,name,()=>locator()[method](...args));return async(...args)=>{await view(page,name);return locator()[method](...args);};}});}
function button(page,key,translate){const name=['Cancel demo order','Simulate fulfilment','Edit demo order'].includes(key)?'history':'basket';return action(page,name,()=>page.getByTestId('guest-market').getByRole('button',{name:translate(key),exact:true}));}
module.exports={view,readIn,action,button};
