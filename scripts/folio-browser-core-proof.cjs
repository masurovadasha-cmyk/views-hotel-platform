'use strict';
const assert=require('node:assert/strict'),{randomUUID,randomBytes,createHash}=require('node:crypto');
module.exports=async function({browser,admin,coreOrigin}){
 assert.equal((await admin.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker,'VIEWS_DISPOSABLE_CORE_TEST');
 const org='10000000-0000-4000-8000-000000000001',member='73100000-0000-4000-8000-000000000001',property=randomUUID(),reservation=randomUUID(),token=randomBytes(32).toString('hex');
 await admin.query("INSERT INTO properties(id,organization_id,name,country_code,city,timezone) VALUES($1,$2,'{\"en\":\"Synthetic folio\",\"ru\":\"Тестовое фолио\",\"uz\":\"Sinov folio\"}','UZ','Tashkent','Asia/Tashkent')",[property,org]);
 await admin.query('INSERT INTO membership_property_scopes(membership_id,property_id) VALUES($1,$2)',[member,property]);
 assert.equal((await admin.query('SELECT app.staff_auth_start($1,1,$2) ok',[member,createHash('sha256').update(token).digest('hex')])).rows[0].ok,true);
 const unit=randomUUID(),type=randomUUID();
 await admin.query("INSERT INTO unit_types(id,property_id,name,max_guests) VALUES($1,$2,'{\"en\":\"Synthetic\"}',2)",[type,property]);
 await admin.query('INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1,$2,$3,$4)',[unit,property,type,'FOLIO-'+unit]);
 const dates=['2025-01-01','2025-01-02'],snapshot={pricingSnapshot:{propertyTimezone:'Asia/Tashkent',nightlyDates:dates}};
 await admin.query("INSERT INTO reservations(id,organization_id,property_id,confirmation_code,status,check_in_at,check_out_at,currency,total_minor,cancellation_policy_snapshot,quote_snapshot,unit_id) VALUES($1,$2,$3,$4,'checked_in','2025-01-01T09:00Z','2025-01-03T07:00Z','UZS',18001,'{}',$5,$6)",[reservation,org,property,'FOLIO-'+reservation,snapshot,unit]);
 await admin.query("INSERT INTO inventory_periods(organization_id,property_id,unit_id,reservation_id,kind,source_ref,stay_period) VALUES($1,$2,$3,$4,'reservation',$5,tstzrange('2025-01-01T09:00Z','2025-01-03T07:00Z','[)'))",[org,property,unit,reservation,'folio-proof:'+reservation]);
 for(const d of dates)await admin.query("INSERT INTO reservation_price_lines(reservation_id,line_type,code,label,amount_minor,currency,metadata) VALUES($1,'night',$2,'{\"en\":\"Synthetic night\"}',10000,'UZS',$3)",[reservation,'night:'+d,{stayDate:d}]);
 await admin.query("INSERT INTO reservation_price_lines(reservation_id,line_type,code,label,amount_minor,currency,metadata) VALUES($1,'discount','synthetic-discount','{\"en\":\"Synthetic discount\"}',-1999,'UZS','{}')",[reservation]);
 const web=await require('./fixtures/folio-staff-web.cjs')({coreOrigin,organizationId:org,propertyId:property,internalKey:process.env.VIEWS_INTERNAL_API_KEY});
 const context=await browser.newContext({viewport:{width:390,height:900}}),page=await context.newPage(),errors=[],writes=[],checks=[];let phase='entry';page.setDefaultTimeout(15000);
 await context.addCookies([{name:'views_staff_session',value:token,domain:'127.0.0.1',path:'/local-api',httpOnly:true,sameSite:'Strict'}]);
 page.on('pageerror',()=>errors.push('BROWSER_JS_ERROR'));
 await page.route('**/*',r=>new URL(r.request().url()).origin===web.origin?r.continue():r.abort());
 async function call(route,method='GET',body,extra={}){return page.evaluate(async({route,method,body,extra})=>{const r=await fetch('/local-api/'+route,{method,headers:{'Content-Type':'application/json','X-Views-Local-Workspace':'1',...extra},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};},{route,method,body,extra});}
 try{
  await page.goto(web.origin+'/?staffRole=front_desk',{waitUntil:'networkidle'});await page.locator('.staffLanguage select').selectOption('en');
  const panel=page.getByTestId('folio-workspace');await panel.getByTestId('folio-open').click();await panel.getByTestId('folio-property').selectOption(property);await panel.getByRole('button',{name:'Load folios',exact:true}).click();
  await panel.getByRole('button',{name:'View folio',exact:true}).click();const detail=panel.getByTestId('folio-detail');await detail.getByTestId('folio-charge-form').waitFor();
  for(const locale of ['ru','uz','en']){await page.locator('.staffLanguage select').selectOption(locale);for(const width of [390,1280]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}}
  const session=(await call('session')).body,headers={'X-CSRF-Token':session.csrf,'Idempotency-Key':randomUUID()};
  assert.equal(session.identity.role,'front_desk');assert.equal((await call('folios/reservations/'+reservation+'/charges','POST',{kind:'service',amountMinor:'1',label:'Synthetic'})).status,403);
  assert.equal((await call('folios?propertyId='+randomUUID(),'GET',undefined,headers)).status,403);checks.push('actual_scoped_staff_session_cookie_csrf_three_languages_two_widths');
  phase='charge';const form=detail.getByTestId('folio-charge-form');await form.getByLabel('Amount, UZS',{exact:true}).fill('90071992547409.93');await form.getByLabel('Description',{exact:true}).fill('Synthetic transfer');
  const route='**/local-api/folios/reservations/'+reservation+'/charges';
  await page.route(route,async r=>{writes.push({key:r.request().headers()['idempotency-key'],body:r.request().postDataJSON()});const response=await r.fetch();assert.equal(response.status(),200);await r.abort('failed');},{times:1});
  await form.getByRole('button',{name:'Record charge',exact:true}).click();await detail.getByTestId('folio-retry').waitFor();assert.equal(await panel.getByTestId('folio-property').isDisabled(),true);
  await context.setOffline(true);assert.equal(await detail.getByTestId('folio-retry').isDisabled(),true);await context.setOffline(false);
  await page.route(route,async r=>{writes.push({key:r.request().headers()['idempotency-key'],body:r.request().postDataJSON()});await r.continue();},{times:1});await detail.getByTestId('folio-retry').click();
  await detail.getByTestId('folio-entry').waitFor();assert.deepEqual(writes[0],writes[1]);assert.equal(writes[0].body.amountMinor,'9007199254740993');
  assert.equal((await admin.query("SELECT count(*)::int n FROM folio_entries e JOIN guest_folios f ON f.id=e.folio_id WHERE f.reservation_id=$1 AND e.source_type='manual_charge'",[reservation])).rows[0].n,1);
  phase='reversal';const reversal=detail.getByTestId('folio-reversal-form');await reversal.getByRole('combobox',{name:'Entry on this page',exact:true}).selectOption({index:1});await reversal.getByLabel('Reason',{exact:true}).fill('Synthetic correction');await reversal.getByRole('button',{name:'Confirm reversal',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-testid="folio-entry"]').length===2);
  assert.equal((await admin.query('SELECT sum(e.amount_minor)::text balance FROM folio_entries e JOIN guest_folios f ON f.id=e.folio_id WHERE f.reservation_id=$1',[reservation])).rows[0].balance,'0');checks.push('bigint_charge_lost_reply_same_command_offline_and_immutable_reversal');
  phase='audit';const audit=panel.getByTestId('folio-audit');await audit.getByLabel('Completed business date',{exact:true}).fill(dates[0]);await audit.getByTestId('folio-audit-preview-button').click();await audit.getByTestId('folio-audit-preview').waitFor();
  await admin.query("UPDATE reservation_price_lines SET amount_minor=-2001 WHERE reservation_id=$1 AND line_type='discount'",[reservation]);await admin.query('UPDATE reservations SET total_minor=17999 WHERE id=$1',[reservation]);
  await audit.getByTestId('folio-audit-confirm').click();await audit.getByRole('alert').waitFor();assert.equal(await audit.getByTestId('folio-audit-preview').count(),0);
  await audit.getByTestId('folio-audit-preview-button').click();await audit.getByTestId('folio-audit-preview').waitFor();
  const auditWrites=[];await page.route('**/local-api/night-audit',async r=>{auditWrites.push({key:r.request().headers()['idempotency-key'],body:r.request().postDataJSON()});const response=await r.fetch();assert.equal(response.status(),200);await r.abort('failed');},{times:1});
  await audit.getByTestId('folio-audit-confirm').click();await audit.getByRole('alert').waitFor();await page.route('**/local-api/night-audit',async r=>{auditWrites.push({key:r.request().headers()['idempotency-key'],body:r.request().postDataJSON()});await r.continue();},{times:1});
  await audit.getByTestId('folio-audit-confirm').click();await audit.getByTestId('folio-audit-result').waitFor();assert.deepEqual(auditWrites[0],auditWrites[1]);
  const first=await admin.query("SELECT e.amount_minor::text amount FROM folio_entries e JOIN guest_folios f ON f.id=e.folio_id WHERE f.reservation_id=$1 AND e.source_type='night_audit'",[reservation]);assert.equal(first.rows.length,1);
  const replay=await call('night-audit','POST',auditWrites[0].body,{...headers,'Idempotency-Key':auditWrites[0].key});assert.equal(replay.status,200);assert.equal(replay.body.idempotentReplay,true);
  await audit.getByLabel('Completed business date',{exact:true}).fill(dates[1]);await audit.getByTestId('folio-audit-preview-button').click();await audit.getByTestId('folio-audit-confirm').click();await audit.getByTestId('folio-audit-result').waitFor();
  assert.equal((await admin.query("SELECT sum(e.amount_minor)::text total FROM folio_entries e JOIN guest_folios f ON f.id=e.folio_id WHERE f.reservation_id=$1 AND e.source_type='night_audit'",[reservation])).rows[0].total,'17999');
  checks.push('stale_night_terms_explicit_repreview_single_batch_after_lost_reply_exact_discount_two_nights');
  const saved=process.env.VIEWS_FOLIO_PILOT_ENABLED;process.env.VIEWS_FOLIO_PILOT_ENABLED='false';try{assert.equal((await call('folios/properties','GET',undefined,headers)).body.error,'FOLIO_DISABLED');}finally{process.env.VIEWS_FOLIO_PILOT_ENABLED=saved;}
  await admin.query('DELETE FROM membership_property_scopes WHERE membership_id=$1 AND property_id=$2',[member,property]);
  assert.equal((await call('night-audit','POST',auditWrites[0].body,{...headers,'Idempotency-Key':auditWrites[0].key})).status,403);checks.push('default_off_and_revoked_property_scope_blocks_replay');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'pass',proof:'folio_browser_gateway_core_postgres',checks,syntheticAuthenticatedStaffSession:true,realPayments:false}));
 }catch(e){console.error(JSON.stringify({result:'fail',proof:'folio_browser_gateway_core_postgres',phase,checks,error:e.name,frames:e.stack?.split('\n').filter(x=>x.startsWith('    at ')).slice(0,3)}));throw e;}
 finally{await context.close();await web.close();}
};
