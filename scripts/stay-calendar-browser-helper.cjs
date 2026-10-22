const assert=require('node:assert/strict');
async function setStayRange(page,scope,start,end){
 await scope.getByTestId('stay-date-range').getByRole('button').click();
 const calendar=page.getByTestId('stay-calendar');await calendar.waitFor();
 await calendar.getByTestId('stay-calendar-reset').click();
 if(start)await calendar.locator(`[data-date="${start}"]`).click();
 if(end)await calendar.locator(`[data-date="${end}"]`).click();
 assert.equal(await calendar.getByTestId('stay-calendar-save').isEnabled(),true);
 await calendar.getByTestId('stay-calendar-save').click();await calendar.waitFor({state:'hidden'});
 await page.waitForFunction(()=>!history.state?.viewsStayCalendar);
}
module.exports={setStayRange};
