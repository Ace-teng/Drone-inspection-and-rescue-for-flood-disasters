// Optional browser acceptance: node tests/browser-acceptance.mjs
// PLAYWRIGHT_MODULE may point to an external playwright-core installation.
// All live API responses in this test are local fixtures, never the real AI platform.
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {mkdir, readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const base=process.env.UI_TEST_URL || 'http://127.0.0.1:8789';
const output=process.env.UI_SCREENSHOT_DIR || join(tmpdir(),'flood-gis-acceptance');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:process.env.UI_BROWSER_CHANNEL || 'msedge',headless:true});
const errors=[];
const imageFile=new URL('../assets/test-images/02_bridge_debris_medium.jpg',import.meta.url);
const sample=await readFile(imageFile);
const choose=async(page,name)=>{await page.locator(`.thumbnail[data-file="${name}"]`).click();await page.waitForFunction(()=>{const i=document.querySelector('#inspectionPreview');return i.complete&&i.naturalWidth>0;});};
const run=async page=>{await page.locator('#run').click();await page.waitForFunction(()=>document.querySelector('.analysis-workspace').dataset.state==='review');};
const snap=async(page,name,fullPage=false)=>page.screenshot({path:join(output,name+'.png'),fullPage});
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/experience/');await page.waitForSelector('.thumbnail');
 assert.equal(await page.locator('.thumbnail').count(),6);
 await choose(page,'02_bridge_debris_medium.jpg');
 for(const [width,height] of [[1920,1080],[1440,900],[1280,800],[390,844]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Page overflow: '+width);
   await snap(page,'workspace-'+width);if(width===390)await snap(page,'mobile-full',true);
   const bounds=await page.locator('#inspectionPreview').boundingBox();assert.ok(bounds.width>200&&bounds.height>200,'Evidence too small: '+width);
 }
 await page.setViewportSize({width:1920,height:1080});
 await page.locator('#expandImage').click();assert.equal(await page.locator('dialog').evaluate(el=>el.open),true);await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').evaluate(el=>el.open),false);
 await run(page);assert.match(await page.locator('.risk-ring').innerText(),/中风险/);assert.match(await page.locator('.risk-actions').innerText(),/复飞/);
 assert.equal(await page.locator('.step[data-phase="complete"]').count(),3);
 await page.evaluate(()=>scrollTo(0,0));await snap(page,'assessment-result');
 const beforeImage=await page.locator('#inspectionPreview').getAttribute('src');await page.locator('.evidence-select').first().click();assert.equal(await page.locator('#inspectionPreview').getAttribute('src'),beforeImage);assert.equal(await page.locator('.evidence-selected').count(),1);assert.match(await page.locator('#linkedEvidence').innerText(),/81%/);
 await page.locator('#modify').click();assert.match(await page.locator('#status').innerText(),/填写复核意见/);
 await page.locator('#reviewText').fill('人工复核：持续监测，水位上涨后复飞。');await page.locator('#modify').click();await page.waitForFunction(()=>document.querySelector('#reviewReplyPanel').style.display==='block'&&!document.querySelector('#confirm').disabled);
 await page.locator('.decision-panel').scrollIntoViewIfNeeded();await snap(page,'human-review');
 await page.locator('#cancel').click();assert.equal(await page.locator('#workorder').isVisible(),false);
 await page.locator('#confirm').click();await page.waitForFunction(()=>!document.querySelector('#approveSim').disabled);
 assert.equal(await page.locator('#confirm').isDisabled(),true);
 assert.equal(await page.locator('.step[data-phase="complete"]').count(),5);
 await page.locator('#finalNote').fill('测试审批意见：持续核验现场状态。');
 for(const id of ['approveSim','rejectSim','reflightSim']){
   await page.locator('#'+id).click();await page.waitForSelector('#undoDisposition');
   for(const locked of ['approveSim','rejectSim','reflightSim'])assert.equal(await page.locator('#'+locked).isDisabled(),true);
   assert.equal(await page.locator('#finalNote').evaluate(el=>el.readOnly),true);
   if(id==='approveSim'){await page.locator('.decision-panel').scrollIntoViewIfNeeded();await snap(page,'workorder-approval');}
   await page.locator('#undoDisposition').click();assert.equal(await page.locator('#approveSim').isEnabled(),true);
 }
 assert.ok(await page.locator('.disposition-audit li').count()>=8);
 await choose(page,'05_normal_rural_road.jpg');assert.equal(await page.locator('.decision-panel').isVisible(),false);assert.equal(await page.locator('#linkedEvidence').isVisible(),false);
 await run(page);assert.equal(await page.locator('.risk-event').count(),0);assert.match(await page.locator('.risk-ring').innerText(),/未发现/);assert.equal(await page.locator('#basinEventCount').innerText(),'00');
 await choose(page,'04_blurred_reflight_check.jpg');await run(page);assert.match(await page.locator('.risk-ring').innerText(),/待核验/);assert.match(await page.locator('.risk-actions').innerText(),/复飞/);
 await page.locator('#taskConfigTab').click();await page.locator('#task').fill('新任务，清理旧结果');assert.equal(await page.locator('.empty-assessment').isVisible(),true);assert.equal(await page.locator('#orderCount').innerText(),'0');
 await page.locator('#uploadSourceTab').click();await page.locator('#uploadFile').setInputFiles({name:'inspection.jpg',mimeType:'image/jpeg',buffer:sample});await page.waitForFunction(()=>document.querySelector('#inspectionPreview').src.startsWith('blob:'));await page.locator('#run').click();assert.match(await page.locator('#status').innerText(),/仅供预览/);assert.equal(await page.locator('.risk-event').count(),0);
 await page.route('**/assets/test-images/01_bridge_debris_high.jpg',route=>route.abort());await page.locator('.thumbnail[data-file="01_bridge_debris_high.jpg"]').click();await page.waitForSelector('.image-unavailable');await snap(page,'image-error');await page.unroute('**/assets/test-images/01_bridge_debris_high.jpg');
 await choose(page,'02_bridge_debris_medium.jpg');assert.equal(await page.locator('.image-unavailable').count(),0);
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#run').click();assert.equal(await page.locator('.empty-assessment .observation-sweep').evaluate(el=>getComputedStyle(el).animationName),'none');await page.waitForSelector('.risk-event');
 console.log('PASS: preset cases A–G, image error, upload preview, light motion, thumbnails, modal, four viewports');

 // Exercise the real-mode UI with explicit local response fixtures and request failures.
 const real=await browser.newPage({viewport:{width:1440,height:900}});real.on('pageerror',e=>errors.push(e.message));
 await real.route('**/api/image',route=>route.fulfill({contentType:'image/jpeg',body:sample}));
 await real.route('**/api/upload-config',route=>route.fulfill({json:{configured:true,maxBytes:8388608,publicUrls:true}}));
 await real.route('**/api/upload',async route=>{assert.equal(route.request().method(),'POST');await new Promise(r=>setTimeout(r,150));await route.fulfill({json:{url:'https://example.test/inspection.jpg',bytes:sample.length,driver:'test-fixture'}});});
 await real.goto(base+'/');await real.waitForSelector('.thumbnail');
 await real.locator('#uploadSourceTab').click();await real.locator('#uploadFile').setInputFiles({name:'inspection.jpg',mimeType:'image/jpeg',buffer:sample});await real.locator('#uploadBtn').click();await real.waitForFunction(()=>document.querySelector('#url').value==='https://example.test/inspection.jpg');assert.equal(await real.locator('#run').isEnabled(),true);
 await real.route('**/api/mission',route=>route.abort());await real.locator('#run').click();await real.waitForFunction(()=>document.querySelector('.empty-assessment').dataset.observation==='error');assert.equal(await real.locator('.step[data-phase="error"]').count(),1);assert.equal(await real.locator('#confirm').isDisabled(),true);
 await real.unroute('**/api/mission');await real.route('**/api/mission',route=>route.fulfill({json:{sessionId:'local-fixture',output:'not json'}}));await real.locator('#retryInspection').click();await real.waitForFunction(()=>document.querySelector('#status').textContent.includes('格式异常'));assert.equal(await real.locator('#confirm').isDisabled(),true);
 await snap(real,'mission-error');
 await real.unroute('**/api/mission');
 const assessment={assessment_summary:'本地测试响应：桥梁漂浮物，需要复核。',events:[{risk_type:'桥梁漂浮物',risk_level:'中风险',location:'测试区域，无坐标',confidence:.81,visual_evidence:'本地测试返回的文字证据。',recommended_actions:['人工核验']} ]};
 await real.route('**/api/mission',route=>route.fulfill({json:{sessionId:'local-fixture',output:JSON.stringify(assessment)}}));await real.locator('#retryInspection').click();await real.waitForSelector('.risk-event');
 await real.route('**/api/review',route=>route.fulfill({json:{output:'复核回复不是结构化研判'}}));await real.locator('#reviewText').fill('核验意见');await real.locator('#modify').click();await real.waitForFunction(()=>document.querySelector('#reviewReplyPanel').style.display==='block');assert.equal(await real.locator('#confirm').isDisabled(),true);
 await real.unroute('**/api/review');await real.route('**/api/review',route=>route.fulfill({json:{output:JSON.stringify({...assessment,assessment_summary:'已更新研判'})}}));await real.locator('#modify').click();await real.waitForFunction(()=>!document.querySelector('#confirm').disabled);
 await real.route('**/api/workorder',route=>route.fulfill({status:502,json:{error:'本地测试工单失败'}}));await real.locator('#confirm').click();await real.waitForFunction(()=>document.querySelector('.step:nth-child(5)').dataset.phase==='error');assert.equal(await real.locator('#approveSim').isDisabled(),true);
 await real.unroute('**/api/workorder');await real.route('**/api/workorder',route=>route.fulfill({json:{output:JSON.stringify({success:true,work_order_id:'WO-DEMO-123456789',status:'待人工审批'})}}));await real.locator('#confirm').click();await real.waitForFunction(()=>!document.querySelector('#approveSim').disabled);
 await real.route('**/api/disposition',route=>route.fulfill({status:502,json:{error:'本地测试审批失败'}}));await real.locator('#approveSim').click();await real.waitForFunction(()=>document.querySelector('#finalFeedback').textContent.includes('审批未完成'));assert.equal(await real.locator('#approveSim').isEnabled(),true);
 assert.deepEqual(errors,[]);
 console.log('PASS: real UI upload/request/error/review/workorder/approval fixtures; no real platform requests');console.log('Screenshots:',output);
}finally{await browser.close();}
