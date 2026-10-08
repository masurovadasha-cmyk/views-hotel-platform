'use strict';
// Actual browser -> authenticated cookie/CSRF BFF -> Core -> disposable PostgreSQL.
const assert=require('node:assert/strict'),{randomUUID,randomBytes,createHash}=require('node:crypto');
module.exports=async function({browser,admin,coreOrigin}){
 assert.equal((await admin.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker,'VIEWS_DISPOSABLE_CORE_TEST');
 const org='10000000-0000-4000-8000-000000000001',property=randomUUID(),contexts=[],checks=[],errors=[],writes=[];let phase='setup';
 await admin.query("INSERT INTO properties(id,organization_id,name,country_code,city,timezone) VALUES($1,$2,'{\"en\":\"Synthetic supply\",\"ru\":\"Тестовый склад\",\"uz\":\"Sinov ombori\"}','UZ','Tashkent','Asia/Tashkent')",[property,org]);
 async function identity(role){
  const user=randomUUID(),member=randomUUID(),token=randomBytes(32).toString('hex');
  await admin.query("INSERT INTO users(id,email,display_name,status) VALUES($1,$2,$3,'active')",[user,'supply-browser-'+user+'@views.invalid','Synthetic '+role]);
  await admin.query("INSERT INTO organization_memberships(id,organization_id,user_id,role_id,status) SELECT $1,$2,$3,id,'active' FROM roles WHERE code=$4",[member,org,user,role]);
  await admin.query('INSERT INTO membership_property_scopes(membership_id,property_id) VALUES($1,$2)',[member,property]);
  await admin.query("INSERT INTO staff_private.credentials(membership_id,password_hash,verification_channel) VALUES($1,$2,'local_fixture')",[member,'scrypt-v1$131072$8$1$'+'00'.repeat(16)+'$'+'00'.repeat(64)]);
  assert.equal((await admin.query('SELECT app.staff_auth_start($1,1,$2) ok',[member,createHash('sha256').update(token).digest('hex')])).rows[0].ok,true);
  return {member,token,role};
 }
 const buyer=await identity('procurement'),warehouse=await identity('warehouse');
 const web=await require('./fixtures/folio-staff-web.cjs')({coreOrigin,organizationId:org,propertyId:property,internalKey:process.env.VIEWS_INTERNAL_API_KEY});
 async function open(person){
  const context=await browser.newContext({viewport:{width:390,height:900}});contexts.push(context);const page=await context.newPage();page.setDefaultTimeout(15000);
  await context.addCookies([{name:'views_staff_session',value:person.token,domain:'127.0.0.1',path:'/local-api',httpOnly:true,sameSite:'Strict'}]);
  page.on('pageerror',()=>errors.push('BROWSER_JS_ERROR'));await page.route('**/*',r=>new URL(r.request().url()).origin===web.origin?r.continue():r.abort());
  await page.goto(web.origin+'/?staffRole='+person.role,{waitUntil:'networkidle'});await page.locator('.staffLanguage select').selectOption('en');
  const panel=page.getByTestId('supply-'+person.role);await panel.getByTestId('supply-open').click();await panel.getByTestId('supply-property').selectOption(property);await panel.getByRole('button',{name:'Load supply data',exact:true}).click();
  return {context,page,panel};
 }
 async function call(page,route,method='GET',body,headers={}){return page.evaluate(async({route,method,body,headers})=>{const r=await fetch('/local-api/'+route,{method,headers:{'Content-Type':'application/json','X-Views-Local-Workspace':'1',...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};},{route,method,body,headers});}
 async function session(page,role){const result=await call(page,'session');assert.equal(result.status,200);assert.equal(result.body.identity.role,role);return {'X-CSRF-Token':result.body.csrf,'Idempotency-Key':randomUUID()};}
 try{
  phase='buyer';const buying=await open(buyer),buyerHeaders=await session(buying.page,'procurement');
  const itemForm=buying.panel.getByTestId('supply-item-form');await itemForm.waitFor();
  assert.equal((await call(buying.page,'supply/items','POST',{propertyId:property,sku:'DENIED',name:'Synthetic',unit:'piece'})).status,403);
  await itemForm.getByLabel('SKU',{exact:true}).fill('TOWEL');await itemForm.getByLabel('Item name',{exact:true}).fill('Synthetic towel');await itemForm.getByRole('button',{name:'Create catalogue item',exact:true}).click();
  await buying.panel.getByTestId('supply-order-form').getByRole('combobox',{name:'Catalogue item',exact:true}).locator('option').filter({hasText:'TOWEL'}).waitFor({state:'attached'});
  const item=(await admin.query("SELECT id FROM supply_items WHERE property_id=$1 AND sku='TOWEL'",[property])).rows[0];assert.ok(item);
  const orderForm=buying.panel.getByTestId('supply-order-form');await orderForm.getByLabel('Order reference',{exact:true}).fill('Synthetic purchase 1');await orderForm.getByRole('combobox',{name:'Catalogue item',exact:true}).selectOption(item.id);await orderForm.getByLabel('Quantity in the selected unit',{exact:true}).fill('10');await orderForm.getByRole('button',{name:'Record purchase order',exact:true}).click();
  await buying.panel.getByTestId('supply-order').waitFor();const order=(await admin.query('SELECT id FROM supply_orders WHERE property_id=$1',[property])).rows[0];assert.ok(order);
  assert.equal((await call(buying.page,'supply/orders/'+order.id+'/receive','POST',{},buyerHeaders)).status,403);
  assert.equal((await call(buying.page,'supply/stock/issue','POST',{propertyId:property,itemId:item.id,quantity:'1',reference:'Denied'},buyerHeaders)).status,403);
  assert.equal((await call(buying.page,'supply/stock?propertyId='+randomUUID(),'GET',undefined,buyerHeaders)).body.error,'PROPERTY_FORBIDDEN');
  assert.equal((await admin.query('SELECT count(*)::int n FROM supply_movements WHERE item_id=$1',[item.id])).rows[0].n,0);
  checks.push('buyer_catalogue_and_order_actual_core_cookie_csrf_without_stock_mutation');
  phase='warehouse';const storing=await open(warehouse),warehouseHeaders=await session(storing.page,'warehouse');await storing.panel.getByTestId('supply-order').waitFor();
  assert.equal((await call(storing.page,'supply/items','POST',{propertyId:property,sku:'DENIED',name:'Synthetic',unit:'piece'},warehouseHeaders)).status,403);
  assert.equal((await call(storing.page,'supply/orders','POST',{propertyId:property,reference:'Denied',lines:[{itemId:item.id,quantity:'1'}]},warehouseHeaders)).status,403);
  assert.equal(await storing.panel.getByTestId('supply-item-form').count(),0);assert.equal(await storing.panel.getByTestId('supply-order-form').count(),0);
  for(const current of [buying,storing])for(const locale of ['ru','uz','en']){await current.page.locator('.staffLanguage select').selectOption(locale);for(const width of [390,1280]){await current.page.setViewportSize({width,height:1000});assert.ok(await current.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}}
  await storing.panel.getByRole('button',{name:'Review goods receipt',exact:true}).click();await storing.panel.getByTestId('supply-receipt-preview').waitFor();
  assert.equal((await admin.query('SELECT count(*)::int n FROM supply_movements WHERE item_id=$1',[item.id])).rows[0].n,0);
  const receiveRoute='**/local-api/supply/orders/'+order.id+'/receive';
  await storing.page.route(receiveRoute,async route=>{writes.push({key:route.request().headers()['idempotency-key'],body:route.request().postDataJSON()});const response=await route.fetch();assert.equal(response.status(),200);await route.abort('failed');},{times:1});
  await storing.panel.getByTestId('supply-receive-confirm').click();await storing.panel.getByTestId('supply-retry').waitFor();assert.equal(await storing.panel.getByTestId('supply-property').isDisabled(),true);
  await storing.context.setOffline(true);assert.equal(await storing.panel.getByTestId('supply-retry').isDisabled(),true);await storing.context.setOffline(false);
  await storing.page.route(receiveRoute,async route=>{writes.push({key:route.request().headers()['idempotency-key'],body:route.request().postDataJSON()});await route.continue();},{times:1});
  await storing.panel.getByTestId('supply-retry').click();await storing.panel.getByTestId('supply-movement').waitFor();assert.deepEqual(writes[0],writes[1]);
  assert.equal((await admin.query("SELECT count(*)::int n FROM supply_movements WHERE item_id=$1 AND kind='receipt'",[item.id])).rows[0].n,1);
  assert.equal((await admin.query('SELECT quantity::text quantity FROM supply_balances WHERE item_id=$1',[item.id])).rows[0].quantity,'10');
  const replay=await call(storing.page,'supply/orders/'+order.id+'/receive','POST',writes[0].body,{...warehouseHeaders,'Idempotency-Key':writes[0].key});assert.equal(replay.status,200);assert.equal(replay.body.idempotentReplay,true);
  checks.push('warehouse_explicit_receipt_lost_reply_same_key_one_movement_three_languages_two_widths');
  phase='issue';let issue=storing.panel.getByTestId('supply-issue-form');await issue.getByRole('combobox',{name:'Stock item on this page',exact:true}).selectOption(item.id);await issue.getByLabel('Quantity in the selected unit',{exact:true}).fill('11');await issue.getByLabel('Issue reference or destination',{exact:true}).fill('Synthetic insufficient issue');await issue.getByRole('button',{name:'Confirm stock issue',exact:true}).click();await storing.panel.getByRole('alert').waitFor();
  assert.equal((await admin.query('SELECT quantity::text quantity FROM supply_balances WHERE item_id=$1',[item.id])).rows[0].quantity,'10');assert.equal((await admin.query('SELECT count(*)::int n FROM supply_movements WHERE item_id=$1',[item.id])).rows[0].n,1);
  assert.equal(await storing.panel.getByTestId('supply-retry').count(),0);await storing.panel.getByRole('button',{name:'Load supply data',exact:true}).click();issue=storing.panel.getByTestId('supply-issue-form');await issue.getByRole('combobox',{name:'Stock item on this page',exact:true}).selectOption(item.id);await issue.getByLabel('Quantity in the selected unit',{exact:true}).fill('3');await issue.getByLabel('Issue reference or destination',{exact:true}).fill('Synthetic room 101');await issue.getByRole('button',{name:'Confirm stock issue',exact:true}).click();
  await storing.page.waitForFunction(()=>document.querySelectorAll('[data-testid="supply-movement"]').length===2);
  assert.equal((await admin.query('SELECT quantity::text quantity FROM supply_balances WHERE item_id=$1',[item.id])).rows[0].quantity,'7');
  assert.equal((await admin.query("SELECT count(*)::int n FROM audit_log WHERE entity_id=$1 AND action='supply.item_created'",[item.id])).rows[0].n,1);
  checks.push('insufficient_stock_atomic_rejection_then_physical_issue_exact_balance_and_audit');
  phase='isolation';await buying.page.goto(web.origin+'/?staffRole=warehouse',{waitUntil:'networkidle'});await buying.page.locator('.staffRoleMismatch').waitFor();assert.equal(await buying.page.getByTestId('supply-warehouse').count(),0);
  const saved=process.env.VIEWS_SUPPLY_PILOT_ENABLED;process.env.VIEWS_SUPPLY_PILOT_ENABLED='false';try{assert.equal((await call(storing.page,'supply/properties','GET',undefined,warehouseHeaders)).body.error,'SUPPLY_DISABLED');}finally{if(saved===undefined)delete process.env.VIEWS_SUPPLY_PILOT_ENABLED;else process.env.VIEWS_SUPPLY_PILOT_ENABLED=saved;}
  await admin.query('DELETE FROM membership_property_scopes WHERE membership_id=$1 AND property_id=$2',[warehouse.member,property]);
  assert.equal((await call(storing.page,'supply/orders/'+order.id+'/receive','POST',{}, {...warehouseHeaders,'Idempotency-Key':writes[0].key})).status,404);
  assert.equal((await call(storing.page,'supply/stock?propertyId='+property,'GET',undefined,warehouseHeaders)).body.error,'PROPERTY_FORBIDDEN');checks.push('cross_role_write_denial_url_cannot_change_role_default_off_and_scope_revocation');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'pass',proof:'supply_browser_gateway_core_postgres',checks,syntheticAuthenticatedStaffSessions:true,realSupplierOrders:false,realPayments:false}));
 }catch(e){console.error(JSON.stringify({result:'fail',proof:'supply_browser_gateway_core_postgres',phase,checks,error:e.name,frames:e.stack?.split('\n').filter(x=>x.startsWith('    at ')).slice(0,3)}));throw e;}
 finally{for(const context of contexts)await context.close();await web.close();}
};
