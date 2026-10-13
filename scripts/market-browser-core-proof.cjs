'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
module.exports=async function({browser,page,api,admin,identity,coreOrigin}){
 page.setDefaultTimeout(15000);
 const org='10000000-0000-4000-8000-000000000001',property='10000000-0000-4000-8000-000000000002';
 const profile=randomUUID(),unit=randomUUID(),type=randomUUID(),reservation='ffffffff-ffff-4fff-8fff-'+randomUUID().slice(-12),water=randomUUID(),coffee=randomUUID(),juice=randomUUID();
 await admin.query("INSERT INTO guest_profiles(id,user_id,organization_id,first_name,last_name) VALUES($1,$2,$3,'Synthetic','Market')",[profile,identity.profile.userId,org]);
 await admin.query("INSERT INTO unit_types(id,property_id,name,max_guests) VALUES($1,$2,'{}',2)",[type,property]);
 await admin.query("INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1,$2,$3,'Market 201')",[unit,property,type]);
 await admin.query("INSERT INTO reservations(id,organization_id,property_id,unit_id,primary_guest_id,confirmation_code,status,check_in_at,check_out_at,currency,total_minor,cancellation_policy_snapshot) VALUES($1,$2,$3,$4,$5,'MARKET-BROWSER','checked_in',now()-interval '1 day',now()+interval '5 days','UZS',0,'{}')",[reservation,org,property,unit,profile]);
 for(const [id,name,price,quantity] of [[water,'Water',1200000,3],[coffee,'Coffee',8500000,2],[juice,'Juice',2000000,3]]){
  await admin.query("INSERT INTO supply_items(id,organization_id,property_id,sku,name,unit) VALUES($1,$2,$3,$4,$5,'piece')",[id,org,property,'BROWSER-'+name.toUpperCase(),name]);
  await admin.query('INSERT INTO supply_balances(organization_id,property_id,item_id,quantity) VALUES($1,$2,$3,$4)',[org,property,id,quantity]);
  await admin.query("INSERT INTO service_catalog(id,organization_id,property_id,code,name,currency,price_minor,active,execution_kind) VALUES($1,$2,$3,$1::uuid::text,jsonb_build_object('en',$4::text,'ru',$4::text,'uz',$4::text),'UZS',$5,true,'market')",[id,org,property,name,price]);
  await admin.query("INSERT INTO market_products(service_id,organization_id,property_id,currency,item_id) VALUES($1,$2,$3,'UZS',$1)",[id,org,property]);
 }
 await page.reload();await page.locator(`[data-reservation-id="${reservation}"]`).getByRole('button',{name:'View trip',exact:true}).click();
 const guest=page.getByTestId('guest-market-core');await guest.getByRole('button',{name:'Open V Market',exact:true}).click();
 const catalogue=await api('services/market/catalog?reservationId='+reservation);assert.equal(catalogue.status,200,JSON.stringify(catalogue.body));
 await guest.locator(`[data-product-id="${water}"]`).getByLabel('Quantity',{exact:true}).fill('2');await guest.locator(`[data-product-id="${coffee}"]`).getByLabel('Quantity',{exact:true}).fill('1');
 assert.equal(await guest.getByRole('button',{name:'Order and reserve',exact:true}).isDisabled(),true);
 await guest.getByLabel('I accept the items, total and charge after receipt',{exact:true}).check();
 assert.equal((await api('services/market','POST',{}, {'Idempotency-Key':randomUUID()})).status,403);
 const keys=[];await page.route('**/guest-api/services/market',async r=>{keys.push(r.request().headers()['idempotency-key']);const response=await r.fetch();assert.equal(response.status(),200);await r.abort('failed');},{times:1});
 await guest.getByRole('button',{name:'Order and reserve',exact:true}).click();await guest.getByText('No confirmation received. Retry the same operation to check its outcome.',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Back to trips',exact:true}).isDisabled(),true);
 await page.context().setOffline(true);await guest.locator('button:disabled').filter({hasText:/^Retry same operation$/}).waitFor();assert.equal(await guest.getByRole('button',{name:'Retry same operation',exact:true}).isDisabled(),true);await page.context().setOffline(false);
 await page.route('**/guest-api/services/market',async r=>{keys.push(r.request().headers()['idempotency-key']);await r.continue();},{times:1});await guest.getByRole('button',{name:'Retry same operation',exact:true}).click();
 await guest.getByTestId('market-stage').getByText('Stock reserved',{exact:true}).waitFor();assert.equal(keys[0],keys[1]);
 const rows=(await admin.query('SELECT id,total_minor::text FROM service_orders WHERE reservation_id=$1',[reservation])).rows;assert.equal(rows.length,1);let oid=rows[0].id;assert.equal(rows[0].total_minor,'10900000');
 const listed=(await api('services/market?reservationId='+reservation)).body.items[0];assert.equal(listed.lines.some(l=>'itemId' in l),false);
 assert.equal((await api('services/market/catalog?reservationId='+reservation)).body.items.find(i=>i.id===water).availableQuantity,'1');
 const originalId=oid;
 await guest.locator(`[data-market-order="${oid}"]`).getByRole('button',{name:'Change order items',exact:true}).click();
 await guest.getByTestId('market-replacement').waitFor();
 assert.equal(await guest.locator(`[data-product-id="${coffee}"]`).getByLabel('Quantity',{exact:true}).getAttribute('max'),'2');
 await guest.locator(`[data-product-id="${water}"]`).getByLabel('Quantity',{exact:true}).fill('1');
 await guest.locator(`[data-product-id="${coffee}"]`).getByLabel('Quantity',{exact:true}).fill('2');
 assert.equal(await guest.getByRole('button',{name:'Confirm new items and total',exact:true}).isDisabled(),true);
 assert.equal((await admin.query('SELECT stage FROM market_orders WHERE order_id=$1',[originalId])).rows[0].stage,'reserved');
 await guest.getByLabel('I accept the items, total and charge after receipt',{exact:true}).check();
 const replacementKeys=[];
 await page.route(`**/guest-api/services/market/${originalId}/actions`,async r=>{replacementKeys.push(r.request().headers()['idempotency-key']);const response=await r.fetch();assert.equal(response.status(),200);await r.abort('failed');},{times:1});
 await guest.getByRole('button',{name:'Confirm new items and total',exact:true}).click();
 await guest.getByText('No confirmation received. Retry the same operation to check its outcome.',{exact:true}).waitFor();
 assert.equal(await guest.getByRole('button',{name:'Keep original order',exact:true}).isDisabled(),true);
 await page.route(`**/guest-api/services/market/${originalId}/actions`,async r=>{replacementKeys.push(r.request().headers()['idempotency-key']);await r.continue();},{times:1});
 await guest.getByRole('button',{name:'Retry same operation',exact:true}).click();
 await guest.getByText('Replaced by order:',{exact:false}).waitFor();assert.equal(replacementKeys[0],replacementKeys[1]);
 const replacementRows=(await admin.query('SELECT o.id,o.total_minor::text FROM service_orders o JOIN market_orders m ON m.order_id=o.id WHERE m.replaces_order_id=$1',[originalId])).rows;
 assert.equal(replacementRows.length,1);oid=replacementRows[0].id;assert.equal(replacementRows[0].total_minor,'18200000');
 assert.equal((await admin.query('SELECT count(*)::int n FROM service_orders WHERE reservation_id=$1',[reservation])).rows[0].n,2);
 assert.equal((await admin.query('SELECT total_minor::text FROM service_orders WHERE id=$1',[originalId])).rows[0].total_minor,'10900000');
 let gc=guest.locator(`[data-market-order="${oid}"]`);const web=await require('./fixtures/folio-staff-web.cjs')({coreOrigin,organizationId:org,propertyId:property,internalKey:process.env.VIEWS_INTERNAL_API_KEY});
 let context;
 try{
  context=await browser.newContext({viewport:{width:390,height:844}});await context.addCookies([{name:'views_staff_session',value:'b1'.repeat(32),domain:'127.0.0.1',path:'/local-api',httpOnly:true,sameSite:'Strict'}]);
  const warehouse=await context.newPage();warehouse.setDefaultTimeout(15000);await warehouse.goto(web.origin+'/?staffRole=warehouse');await warehouse.locator('.staffLanguage select').selectOption('en');
  const staff=warehouse.getByTestId('staff-market-core');await staff.getByRole('button',{name:'Open V Market',exact:true}).click();let sc=staff.locator(`[data-market-order="${oid}"]`);await sc.getByText('Unit: Market 201',{exact:true}).waitFor();
  const reduction=sc.getByTestId('quantity-proposal');
  await reduction.getByLabel('Product to reduce',{exact:true}).selectOption(coffee);
  await reduction.getByLabel('Reduced quantity',{exact:true}).fill('0');
  await reduction.getByLabel('Reason for reduction',{exact:true}).fill('Coffee is unavailable; please review the remaining basket');
  await reduction.getByRole('button',{name:'Propose reduction',exact:true}).click();
  await sc.getByTestId('market-proposal').getByText('Reduced quantity proposal',{exact:true}).waitFor();
  await guest.getByRole('button',{name:'Refresh',exact:true}).click();
  await gc.getByTestId('market-proposal').getByText('Reduced quantity proposal',{exact:true}).waitFor();
  assert.equal(await gc.getByRole('button',{name:'Accept reduction',exact:true}).isDisabled(),true);
  assert.equal(await gc.getByTestId('market-proposal').locator('li').count(),1);
  assert.match(await gc.getByTestId('market-proposal').locator('li').innerText(),/Water/);
  assert.equal((await admin.query('SELECT total_minor::text FROM service_orders WHERE id=$1',[oid])).rows[0].total_minor,'18200000');
  await gc.getByRole('button',{name:'Decline reduction',exact:true}).click();
  await gc.getByText('Substitution declined',{exact:true}).waitFor();
  await staff.getByRole('button',{name:'Refresh',exact:true}).click();
  await sc.getByTestId('quantity-proposal').waitFor();
  async function propose(){
   await sc.getByLabel('Product to replace',{exact:true}).selectOption(water);
   await sc.getByLabel('Replacement product',{exact:true}).selectOption(juice);
   await sc.getByLabel('Reason for guest (3–500 characters)',{exact:true}).fill('Juice is offered instead of water');
   await sc.getByRole('button',{name:'Send proposal',exact:true}).click();
   await sc.getByText('Awaiting substitution consent',{exact:true}).waitFor();
  }
  await propose();assert.equal(await sc.getByRole('button',{name:'Start picking',exact:true}).count(),0);
  await guest.getByRole('button',{name:'Refresh',exact:true}).click();await gc.getByText('Awaiting substitution consent',{exact:true}).waitFor();
  assert.equal(await gc.getByRole('button',{name:'Accept substitution',exact:true}).isDisabled(),true);
  // Synthetic clock proof: expire only this fixture's proposal, without waiting 15 minutes.
  await admin.query("UPDATE market_orders SET proposal=jsonb_set(proposal,'{expiresAt}',to_jsonb(now()-interval '1 minute')) WHERE order_id=$1",[oid]);
  await gc.getByLabel('I accept the complete proposed basket and total',{exact:true}).check();
  await gc.getByRole('button',{name:'Accept substitution',exact:true}).click();
  await guest.getByText('This attempt was rejected. Refresh: price, stock or state may have changed.',{exact:true}).waitFor();
  assert.equal((await admin.query('SELECT stage FROM market_orders WHERE order_id=$1',[oid])).rows[0].stage,'reserved');
  await gc.getByRole('button',{name:'Decline substitution',exact:true}).click();await guest.getByText('Substitution declined',{exact:true}).waitFor();
  await staff.getByRole('button',{name:'Refresh',exact:true}).click();await sc.getByText('Substitution declined',{exact:true}).waitFor();await propose();
  await guest.getByRole('button',{name:'Refresh',exact:true}).click();await gc.getByText('Awaiting substitution consent',{exact:true}).waitFor();
  const proposedOrder=oid,proposalKeys=[];
  await gc.getByLabel('I accept the complete proposed basket and total',{exact:true}).check();
  await page.route(`**/guest-api/services/market/${oid}/actions`,async r=>{proposalKeys.push(r.request().headers()['idempotency-key']);const response=await r.fetch();assert.equal(response.status(),200);await r.abort('failed');},{times:1});
  await gc.getByRole('button',{name:'Accept substitution',exact:true}).click();
  await guest.getByText('No confirmation received. Retry the same operation to check its outcome.',{exact:true}).waitFor();
  await page.route(`**/guest-api/services/market/${oid}/actions`,async r=>{proposalKeys.push(r.request().headers()['idempotency-key']);await r.continue();},{times:1});
  await guest.getByRole('button',{name:'Retry same operation',exact:true}).click();await gc.getByText('Substitution accepted',{exact:true}).waitFor();assert.equal(proposalKeys[0],proposalKeys[1]);
  const successors=(await admin.query('SELECT order_id FROM market_orders WHERE replaces_order_id=$1',[proposedOrder])).rows;assert.equal(successors.length,1);oid=successors[0].order_id;
  gc=guest.locator(`[data-market-order="${oid}"]`);await staff.getByRole('button',{name:'Refresh',exact:true}).click();sc=staff.locator(`[data-market-order="${oid}"]`);
  await sc.getByRole('button',{name:'Start picking',exact:true}).click();await sc.getByTestId('market-stage').getByText('Being picked',{exact:true}).waitFor();assert.equal(await sc.getByRole('button',{name:'Finish picking',exact:true}).isDisabled(),true);
  for(const label of ['Items and quantities checked','Expiry dates checked','Packaging checked'])await sc.getByLabel(label,{exact:true}).check();
  await sc.getByRole('button',{name:'Finish picking',exact:true}).click();
  const reopen=sc.getByTestId('market-reopen');await reopen.getByLabel('Reason for reopening (visible to guest)',{exact:true}).fill('All picked goods returned for agreement');
  assert.equal(await reopen.getByRole('button',{name:'Reopen for agreement',exact:true}).isDisabled(),true);
  await reopen.getByLabel('All goods are back in storage and have not been handed to the guest',{exact:true}).check();
  await reopen.getByRole('button',{name:'Reopen for agreement',exact:true}).click();await sc.getByTestId('market-stage').getByText('Stock reserved',{exact:true}).waitFor();
  assert.equal((await admin.query('SELECT checklist FROM market_orders WHERE order_id=$1',[oid])).rows[0].checklist,null);
  await guest.getByRole('button',{name:'Refresh',exact:true}).click();await gc.getByTestId('market-stage').getByText('Stock reserved',{exact:true}).waitFor();
  assert.equal(await gc.getByTestId('market-reopen').count(),0);
  const guestHistory=gc.getByTestId('market-reopen-history'),staffHistory=sc.getByTestId('market-reopen-history');
  await guestHistory.getByText('All picked goods returned for agreement',{exact:true}).waitFor();
  assert.equal(await guestHistory.locator('li').count(),1);
  assert.equal(await guestHistory.locator('time').getAttribute('datetime'),await staffHistory.locator('time').getAttribute('datetime'));

  await sc.getByRole('button',{name:'Start picking',exact:true}).click();await sc.getByTestId('market-stage').getByText('Being picked',{exact:true}).waitFor();
  assert.equal(await sc.getByRole('button',{name:'Finish picking',exact:true}).isDisabled(),true);
  for(const label of ['Items and quantities checked','Expiry dates checked','Packaging checked'])await sc.getByLabel(label,{exact:true}).check();
  const countedItems=(await admin.query('SELECT l.item_id,b.quantity::text FROM market_order_lines l JOIN supply_balances b ON b.item_id=l.item_id WHERE l.order_id=$1',[oid])).rows;
  for(const item of countedItems){
   const result=await warehouse.evaluate(async({item,property,key})=>{const session=await(await fetch('/local-api/session',{headers:{'X-Views-Local-Workspace':'1'}})).json();const headers={'Content-Type':'application/json','X-Views-Local-Workspace':'1','X-CSRF-Token':session.csrf,'Idempotency-Key':key};const body={propertyId:property,itemId:item.item_id,countedQuantity:item.quantity,reason:'Synthetic market lot count',lots:[{lotCode:'MARKET-BROWSER',expiresOn:'2028-01-01',quantity:item.quantity}]};const preview=await fetch('/local-api/supply/stocktake/preview',{method:'POST',headers,body:JSON.stringify(body)});if(!preview.ok)return preview.status;const p=await preview.json();return(await fetch('/local-api/supply/stocktake/confirm',{method:'POST',headers,body:JSON.stringify({...body,expectedQuantity:p.expectedQuantity,expectedRevision:p.expectedRevision})})).status;},{item,property,key:randomUUID()});assert.equal(result,200);
  }
  await sc.getByRole('button',{name:'Finish picking',exact:true}).click();
  await sc.getByLabel('Use counted lots',{exact:true}).check();
  assert.equal(await sc.getByRole('button',{name:'Confirm handover',exact:true}).isDisabled(),true);
  const lotSelectors=sc.getByTestId('market-counted-lot');assert.equal(await lotSelectors.count(),countedItems.length);
  for(const select of await lotSelectors.all())await select.selectOption({index:1});
  await sc.getByLabel('Order physically handed to guest',{exact:true}).check();
  await lotSelectors.first().selectOption('');assert.equal(await sc.getByRole('button',{name:'Confirm handover',exact:true}).isDisabled(),true);await lotSelectors.first().selectOption({index:1});
  await sc.getByRole('button',{name:'Confirm handover',exact:true}).click();await sc.getByTestId('market-stage').getByText('Handed over — confirm receipt',{exact:true}).waitFor();
  assert.equal((await admin.query("SELECT count(*)::int n FROM supply_movements WHERE reference=$1 AND lot_allocation->>'lotCode'='MARKET-BROWSER'",['V Market '+oid])).rows[0].n,countedItems.length);
  assert.equal((await admin.query('SELECT quantity::text FROM supply_balances WHERE item_id=$1',[water])).rows[0].quantity,'3');assert.equal((await admin.query('SELECT count(*)::int n FROM folio_entries WHERE source_id=$1',[oid])).rows[0].n,0);
  await guest.getByRole('button',{name:'Refresh',exact:true}).click();
  await gc.getByLabel('Describe missing or damaged goods (3–1000 characters)',{exact:true}).fill('One juice bottle is missing');
  await gc.getByRole('button',{name:'Report an issue',exact:true}).click();await gc.getByText('Awaiting warehouse response',{exact:true}).waitFor();
  assert.equal(await gc.getByRole('button',{name:'Confirm receipt and charge',exact:true}).count(),0);
  await staff.getByRole('button',{name:'Refresh',exact:true}).click();
  await sc.getByLabel('Reply to guest: findings and next steps',{exact:true}).fill('The missing juice is available at reception');
  await sc.getByRole('button',{name:'Send response',exact:true}).click();await sc.getByText('Warehouse responded',{exact:true}).waitFor();
  assert.equal((await admin.query('SELECT count(*)::int n FROM folio_entries WHERE source_id=$1',[oid])).rows[0].n,0);
  assert.equal((await admin.query('SELECT quantity::text FROM supply_balances WHERE item_id=$1',[water])).rows[0].quantity,'3');
  await guest.getByRole('button',{name:'Refresh',exact:true}).click();await gc.getByText('The missing juice is available at reception',{exact:true}).waitFor();await gc.getByLabel('All items received. I confirm the stated charge',{exact:true}).check();await gc.getByRole('button',{name:'Confirm receipt and charge',exact:true}).click();await gc.getByTestId('market-stage').getByText('Received and charged',{exact:true}).waitFor();
  assert.deepEqual((await admin.query('SELECT amount_minor::text FROM folio_entries WHERE source_id=$1',[oid])).rows,[{amount_minor:'19000000'}]);
  await staff.getByRole('button',{name:'Refresh',exact:true}).click();
  const returns=sc.getByTestId('market-returns');await returns.getByLabel('Returned product',{exact:true}).selectOption(coffee);
  await returns.getByLabel('Quantity',{exact:true}).fill('1');await returns.getByLabel('Return reason (3–500 characters)',{exact:true}).fill('Coffee physically returned');
  await returns.getByLabel('Goods physically received from guest',{exact:true}).check();await returns.getByRole('button',{name:'Receive into quarantine',exact:true}).click();
  await returns.getByText('Quarantined',{exact:false}).waitFor();
  assert.equal((await admin.query('SELECT quantity::text FROM supply_balances WHERE item_id=$1',[coffee])).rows[0].quantity,'0');
  const receipt=(await admin.query('SELECT id FROM market_returns WHERE order_id=$1',[oid])).rows[0].id,inspection=sc.locator(`[data-return-id="${receipt}"]`);
  await inspection.getByLabel('Inspection or disposal note (3–500 characters)',{exact:true}).fill('Sealed package and storage checked');
  assert.equal(await inspection.getByRole('button',{name:'Return to available stock',exact:true}).isDisabled(),true);
  for(const label of ['Factory seal intact','Expiry checked','Quality and storage conditions checked'])await inspection.getByLabel(label,{exact:true}).check();
  await inspection.getByLabel('Returned label matches the issued lot',{exact:false}).check();
  await inspection.getByRole('button',{name:'Return to available stock',exact:true}).click();await inspection.getByText('Restocked',{exact:false}).waitFor();
  await inspection.getByText('Inspection completed',{exact:true}).waitFor();
  assert.equal((await admin.query("SELECT i.lot_allocation->>'lotCode' code FROM supply_movements m JOIN supply_movements i ON i.id=m.return_source_issue_id WHERE m.market_return_id=$1",[receipt])).rows[0].code,'MARKET-BROWSER');
  assert.equal(await inspection.getByTestId('return-timeline').locator('time').count(),2);
  await guest.getByRole('button',{name:'Refresh',exact:true}).click();
  const guestTimeline=gc.locator(`[data-return-id="${receipt}"]`).getByTestId('return-timeline');
  await guestTimeline.getByText('Inspection completed',{exact:true}).waitFor();
  const guestTimes=await guestTimeline.locator('time').evaluateAll(nodes=>nodes.map(n=>n.dateTime)),staffTimes=await inspection.getByTestId('return-timeline').locator('time').evaluateAll(nodes=>nodes.map(n=>n.dateTime));
  if(JSON.stringify(guestTimes)!==JSON.stringify(staffTimes))console.log(JSON.stringify({proof:'return_timeline_mismatch',guestTimes,staffTimes}));
  assert.deepEqual(guestTimes,staffTimes);
  assert.equal((await admin.query('SELECT quantity::text FROM supply_balances WHERE item_id=$1',[coffee])).rows[0].quantity,'1');
  assert.equal((await admin.query('SELECT count(*)::int n FROM market_credits WHERE order_id=$1',[oid])).rows[0].n,0);
  for(const [view,timeline,role] of [[page,guestTimeline,'guest'],[warehouse,inspection.getByTestId('return-timeline'),'warehouse']]){
   await view.setViewportSize({width:390,height:844});
   for(const dark of [true,false]){
    if(Boolean(await view.locator('.app.dark').count())!==dark)await view.locator('[data-theme-toggle]').click();
    assert.equal(Boolean(await view.locator('.app.dark').count()),dark);
    assert.equal(await timeline.locator('time').count(),2);
    assert.equal(await view.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await timeline.screenshot({path:`/tmp/views-return-${role}-${dark?'dark':'light'}.png`});
   }
  }

  const financeContext=await browser.newContext({viewport:{width:390,height:844}});
  try{
   await financeContext.addCookies([{name:'views_staff_session',value:'a4'.repeat(32),domain:'127.0.0.1',path:'/local-api',httpOnly:true,sameSite:'Strict'}]);
   const accountant=await financeContext.newPage();await accountant.goto(web.origin+'/?staffRole=accountant');await accountant.locator('.staffLanguage select').selectOption('en');
   const finance=accountant.getByTestId('market-finance');await finance.getByRole('button',{name:'Open charged orders',exact:true}).click();const fc=finance.locator(`[data-credit-order="${oid}"]`);
   await fc.getByLabel('Credit amount, UZS',{exact:true}).fill('85000');await fc.getByLabel('Reason for guest (3–500 characters)',{exact:true}).fill('Credit for returned coffee');
   await fc.getByLabel('I confirm reducing the charge by this amount',{exact:true}).check();
   const creditKeys=[];await accountant.route(`**/local-api/service-orders/market/${oid}/credits`,async r=>{creditKeys.push(r.request().headers()['idempotency-key']);const response=await r.fetch();assert.equal(response.status(),200);await r.abort('failed');},{times:1});
   await fc.getByRole('button',{name:'Record folio credit',exact:true}).click();await finance.getByText('No confirmation received. Retry the same operation to check its outcome.',{exact:true}).waitFor();
   await accountant.route(`**/local-api/service-orders/market/${oid}/credits`,async r=>{creditKeys.push(r.request().headers()['idempotency-key']);await r.continue();},{times:1});
   await finance.getByRole('button',{name:'Retry same operation',exact:true}).click();await fc.getByTestId('market-credit-summary').waitFor();assert.equal(creditKeys[0],creditKeys[1]);
   assert.equal((await admin.query('SELECT count(*)::int n FROM market_credits WHERE order_id=$1',[oid])).rows[0].n,1);
   assert.equal((await admin.query('SELECT sum(e.amount_minor)::text total FROM folio_entries e JOIN guest_folios f ON f.id=e.folio_id WHERE f.reservation_id=$1',[reservation])).rows[0].total,'10500000');
   assert.equal((await admin.query('SELECT quantity::text FROM supply_balances WHERE item_id=$1',[coffee])).rows[0].quantity,'1');
   await guest.getByRole('button',{name:'Refresh',exact:true}).click();await gc.getByTestId('market-credit-summary').getByText('Credit for returned coffee',{exact:false}).waitFor();
   for(const language of ['ru','uz','en']){await accountant.locator('.staffLanguage select').selectOption(language);assert.equal(await accountant.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
   await finance.screenshot({path:'/tmp/views-market-finance.png'});
  }finally{await financeContext.close();}
  for(const language of ['ru','uz','en']){await page.locator('.guestLanguage select').selectOption(language);await warehouse.locator('.staffLanguage select').selectOption(language);for(const p of [page,warehouse])assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  await guest.screenshot({path:'/tmp/views-market-guest.png'});await staff.screenshot({path:'/tmp/views-market-staff.png'});
  console.log(JSON.stringify({proof:'market_browser_core',result:'pass',checks:['consented_cart','lost_reply_same_key_one_order','csrf','offline','navigation_guard','stock_reserved','replacement_consent_own_reserve_lost_reply_one_successor','warehouse_proposal_expiry_decline_and_guest_consent_same_key','warehouse_pick_checklist_handover','counted_lots_complete_selection_clear_and_movement_provenance','stock_issue','issue_blocks_receipt','warehouse_answer_no_financial_or_stock_change','guest_receipt_single_folio','private_item_id_stripped','quarantine_inspection_restock_no_credit','return_confirmed_issued_lot_provenance','accountant_credit_same_key_no_stock_or_payment','three_languages_mobile'],publicEnabled:false}));
 }finally{if(context)await context.close();await web.close();}
};
