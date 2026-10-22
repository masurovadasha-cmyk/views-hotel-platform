'use strict';
const assert=require('node:assert/strict');
module.exports=async({page,admin,oid})=>{
 await page.getByTestId('guest-services-back').click();await page.getByTestId('guest-orders-load').click();
 await page.getByTestId('guest-order-list').locator(`[data-order-summary="${oid}"]`).getByRole('button',{name:'Open order',exact:true}).click();
 const detail=page.getByTestId('guest-order-detail'),form=page.getByTestId('guest-order-detail-market-receipt');
 await form.locator('input').waitFor();assert.equal(await form.locator('button').isDisabled(),true);
 const path=`**/guest-api/services/market/${oid}/actions`,writes=[];
 let release;const held=new Promise(r=>{release=r;});let seen;const arrived=new Promise(r=>{seen=r;});
 await page.route(path,async route=>{const r=route.request();writes.push({key:r.headers()['idempotency-key'],body:r.postData()});const response=await route.fetch();assert.equal(response.status(),200);if(writes.length===1){seen();await held;await route.abort('failed');}else await route.fulfill({response});});
 await form.locator('form').evaluate(f=>f.requestSubmit());assert.equal(writes.length,0);
 await form.locator('input').check();await page.setViewportSize({width:390,height:844});
 for(const locale of ['ru','uz','en']){await page.locator('.guestLanguage select').selectOption(locale);for(let n=0;n<2;n++){await page.locator('[data-theme-toggle]').click();assert.equal(await form.locator('input').isChecked(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await detail.screenshot({path:`/tmp/views42-market-${locale}-${n}.png`});}}
 const timeout=setTimeout(()=>release(),10000);await form.locator('button').click();await arrived;
 for(const id of ['guest-order-detail-back','guest-order-detail-refresh','guest-order-detail-service','guest-service-market'])assert.equal(await page.getByTestId(id).isDisabled(),true);
 clearTimeout(timeout);release();const retry=detail.getByRole('button',{name:'Retry same operation',exact:true});await retry.waitFor();
 await page.context().setOffline(true);await page.waitForFunction(()=>!navigator.onLine);assert.equal(await retry.isDisabled(),true);await page.context().setOffline(false);await retry.click();
 await detail.getByText('Received and charged',{exact:true}).waitFor();assert.equal(await form.locator('button').count(),0);assert.equal(writes.length,2);assert.deepEqual(writes[0],writes[1]);await page.unroute(path);
 assert.deepEqual((await admin.query("SELECT (SELECT count(*)::int FROM folio_entries WHERE source_id=$1) charges,(SELECT count(*)::int FROM audit_log WHERE entity_id=$1 AND action='market.confirm_receipt') audits,(SELECT count(*)::int FROM outbox_events WHERE aggregate_id=$1 AND event_type='market.confirm_receipt') events",[oid])).rows[0],{charges:1,audits:1,events:1});
 console.log(JSON.stringify({proof:'guest_market_detail_receipt_core',result:'pass',checks:['explicit_consent','three_languages_two_themes_mobile','lost_response_same_key_body','pending_navigation_guard','offline_retry','one_folio_audit_outbox','completed_hides_action'],realPayments:false}));
};
