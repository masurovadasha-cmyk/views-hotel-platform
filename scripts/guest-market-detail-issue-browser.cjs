'use strict';
const assert=require('node:assert/strict');
module.exports=async({page,admin,oid})=>{
 const snapshot=async()=> (await admin.query("SELECT to_jsonb(o) orders,(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.id),'[]') FROM folio_entries e WHERE source_id=o.id) entries,(SELECT jsonb_agg(to_jsonb(b) ORDER BY b.item_id) FROM supply_balances b JOIN market_order_lines l ON l.item_id=b.item_id WHERE l.order_id=o.id) stock FROM service_orders o WHERE o.id=$1",[oid])).rows[0];const before=await snapshot();
 await page.getByTestId('guest-services-back').click();await page.getByTestId('guest-orders-load').click();
 await page.getByTestId('guest-order-list').locator(`[data-order-summary="${oid}"]`).getByRole('button',{name:'Open order',exact:true}).click();
 const detail=page.getByTestId('guest-order-detail'),form=page.getByTestId('guest-order-detail-market-issue');
 await form.locator('input').waitFor();assert.equal(await form.locator('button').isDisabled(),true);
 const path=`**/guest-api/services/market/${oid}/actions`,writes=[];
 let release;const held=new Promise(r=>{release=r;});let seen;const arrived=new Promise(r=>{seen=r;});
 await page.route(path,async route=>{const r=route.request();writes.push({key:r.headers()['idempotency-key'],body:r.postData()});const response=await route.fetch();assert.equal(response.status(),200);if(writes.length===1){seen();await held;await route.abort('failed');}else await route.fulfill({response});});
 await form.locator('form').evaluate(f=>f.requestSubmit());assert.equal(writes.length,0);
 await form.locator('input').fill('One juice bottle is missing');await page.setViewportSize({width:390,height:844});
 for(const locale of ['ru','uz','en']){await page.locator('.guestLanguage select').selectOption(locale);for(let n=0;n<2;n++){await page.locator('[data-theme-toggle]').click();assert.equal(await form.locator('input').inputValue(),'One juice bottle is missing');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await detail.screenshot({path:`/tmp/views44-market-${locale}-${n}.png`});}}
 const timeout=setTimeout(()=>release(),10000);await form.locator('button').click();await arrived;
 for(const id of ['guest-order-detail-back','guest-order-detail-refresh','guest-order-detail-service','guest-service-market'])assert.equal(await page.getByTestId(id).isDisabled(),true);
 clearTimeout(timeout);release();const retry=detail.getByRole('button',{name:'Retry same operation',exact:true});await retry.waitFor();
 await page.context().setOffline(true);await page.waitForFunction(()=>!navigator.onLine);assert.equal(await retry.isDisabled(),true);await page.context().setOffline(false);await retry.click();
 await detail.getByText('Awaiting warehouse response',{exact:true}).waitFor();assert.equal(await form.locator('button').count(),0);assert.equal(writes.length,2);assert.deepEqual(writes[0],writes[1]);await page.unroute(path);assert.deepEqual(await snapshot(),before);assert.equal(await page.getByTestId('guest-order-detail-market-receipt').locator('button').count(),0);
 assert.deepEqual((await admin.query("SELECT (SELECT count(*)::int FROM folio_entries WHERE source_id=$1) charges,(SELECT count(*)::int FROM audit_log WHERE entity_id=$1 AND action='market.report_issue') audits,(SELECT count(*)::int FROM outbox_events WHERE aggregate_id=$1 AND event_type='market.report_issue') events",[oid])).rows[0],{charges:0,audits:1,events:1});
 console.log(JSON.stringify({proof:'guest_market_detail_issue_core',result:'pass',checks:['explicit_note_submission','three_languages_two_themes_mobile','lost_response_same_key_body','pending_navigation_guard','offline_retry','unchanged_orders_folio_stock','one_issue_audit_outbox','open_hides_reporting_and_receipt'],realPayments:false}));
};
