import { createServer } from "node:http";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadTestImageCatalog, resolveCatalogImage } from "./lib/test-images.mjs";
import { AgentGatewayError, createAgentClient } from "./lib/agent-gateway.mjs";
import { dataDir, repoRoot } from "./lib/paths.mjs";
import {
  UploadError,
  buildObjectKey,
  createStorageDriver,
  describeStorage,
  maxUploadBytes,
  uploadedKeyPattern,
  validateUpload
} from "./lib/object-storage.mjs";

const key = process.env.BAILIAN_APP_KEY;
const api = process.env.BAILIAN_API_BASE || "http://10.128.203.200:80/sfm-agent-studio/sfm-api-gateway/gateway/agent/api";
const agentCode = "c9016857-92a0-4374-a545-3bd9e1e41dd6";
const agentVersion = "1784657975331";
const workOrderAgentCode = "20cbc85b-41d2-4b10-9fe3-1a34da5b0281";
const workOrderAgentVersion = "1784545668658";
const port = Number(process.env.PORT || 8789);
// 只在显式设置 DEMO_UPSTREAM 时代理：以前没有密钥就默认转发到 127.0.0.1:8788，
// 结果所有失败都变成“upstream unavailable”，把真正的原因盖掉了。
const upstream = process.env.DEMO_UPSTREAM || "";
// 默认拒绝本机地址的图片链接（平台读不到）；只有自建隧道或本地自动化测试才放行。
const allowLocalImageUrls = /^(1|true|yes|on)$/i.test(process.env.DEMO_ALLOW_LOCAL_IMAGE_URLS || "");
const agentClient = createAgentClient({ apiBase: api, appKey: key, allowLocalImageUrls });
// 上传走对象存储 driver：AccessKey 只在后端环境变量里，页面拿到的只有最终 URL。
const storage = describeStorage();
const storageDriver = createStorageDriver({ baseUrl: process.env.DEMO_PUBLIC_BASE_URL || `http://127.0.0.1:${port}` });
const runtimeDataDir = dataDir();
console.log(`[对象存储] driver=${storage.driver || "未配置"}，可用=${storage.configured ? "是" : "否"}，单张上限=${(storage.maxBytes / 1024 / 1024).toFixed(1)} MB`);
if (!storage.configured) console.warn(`[对象存储] ${storage.note}${storage.missingEnv.length ? ` 缺少：${storage.missingEnv.join("、")}` : ""}`);

const page = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>汛巡智眼｜真实智能体演示</title><style>
*{box-sizing:border-box}body{margin:0;background:#eef4f8;color:#17324d;font-family:"Microsoft YaHei",Arial,sans-serif}.bar{height:68px;background:#fff;display:flex;align-items:center;padding:0 max(5vw,28px);justify-content:space-between;border-bottom:1px solid #dce7ef}.brand{font-size:22px;font-weight:800;color:#1165d3}.tag{color:#148657;background:#e8f8ef;border-radius:20px;padding:7px 12px;font-size:13px}.hero{padding:38px max(7vw,28px);background:linear-gradient(115deg,#0b4f9e,#1474d5);color:#fff}.hero h1{margin:0;font-size:34px}.hero p{opacity:.88}.grid{max-width:1240px;margin:25px auto;display:grid;grid-template-columns:360px 1fr;gap:20px;padding:0 18px}.card{background:#fff;border-radius:14px;padding:22px;box-shadow:0 7px 24px #1b4d7420}.card h2{font-size:18px;margin:0 0 16px}.label{display:block;font-size:13px;color:#60748a;margin:16px 0 7px}input,textarea{width:100%;border:1px solid #ccdbe7;border-radius:8px;padding:11px;font:14px inherit}textarea{height:100px;resize:vertical}button{width:100%;margin-top:18px;background:#1269d4;color:white;border:0;border-radius:8px;padding:13px;font-weight:700;font-size:15px;cursor:pointer}button:disabled{background:#91afd1}.secondary{background:#fff;border:1px solid #9fb6ca;color:#315574}.review-actions{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}.review-actions button{font-size:13px}.steps{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 22px}.step{padding:8px 12px;background:#eef3f8;border-radius:18px;font-size:13px}.step.active{background:#ddebff;color:#1269d4}.status{padding:14px;border-radius:8px;background:#f3f8fc;color:#456078;line-height:1.7;white-space:pre-wrap}.result{display:none;margin-top:16px;border-top:1px solid #e3ebf1;padding-top:16px}.event{position:relative;margin-top:12px;padding:14px;border:1px solid #d7e5ef;border-left:4px solid #e99a28;border-radius:8px;background:#fff}.event b{font-size:15px}.event p{font-size:13px;line-height:1.6;margin:8px 0}.level{float:right;padding:3px 9px;border-radius:14px;background:#fff2e5;color:#a65211;font-size:12px;font-weight:bold}.result pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f7fafc;padding:15px;border-radius:8px;line-height:1.65;color:#29455d;font-size:13px}.note{font-size:12px;color:#71849a;line-height:1.6}@media(max-width:800px){.grid{grid-template-columns:1fr}.hero h1{font-size:26px}.review-actions{grid-template-columns:1fr}}
</style><body><header class="bar"><div class="brand">汛巡智眼</div><div class="tag">● jfg0 v2.0 真实调用</div></header><section class="hero"><h1>洪涝灾害无人机巡检救援总控</h1><p>图片识别 → 风险研判 → 人工复核 → 模拟工单。AI 仅提供辅助决策，不执行真实派遣。</p></section><main class="grid"><section class="card"><h2>发起巡检任务</h2><label class="label">巡检区域</label><input value="比赛模拟片区 A 周边道路" readonly><label class="label">公网图片链接</label><input id="url" value=""><label class="label">巡检任务</label><textarea id="task">识别道路积水、道路中断、疑似被困人员及其他明显风险；仅生成模拟研判，不执行真实派遣。</textarea><button id="run">启动真实巡检研判</button><p class="note">真实调用 jfg0 v2.0；请保持校园网连接。点击后依次展示任务规划、视觉识别、风险研判和人工复核。</p></section><section class="card"><h2>智能体执行状态</h2><div class="steps"><span class="step">任务规划</span><span class="step">视觉识别</span><span class="step">风险研判</span><span class="step">人工复核</span><span class="step">模拟工单</span></div><div id="status" class="status">尚未开始：点击左侧“启动真实巡检研判”。</div><article id="result" class="result"><h2>风险研判总览</h2><div id="summary" class="status"></div><div id="events"></div><details><summary>查看平台原始返回</summary><pre id="output"></pre></details></article><article id="review" class="result"><h2>人工复核与处置决策</h2><p class="note">AI 已给出证据与建议，请由值守人员作最终决策。本操作仅生成模拟工单，不会派遣真实人员或设备。</p><textarea id="reviewText" placeholder="如需修改，请填写：例如，修改研判：将道路积水调整为中风险，并要求复飞核验。"></textarea><div class="review-actions"><button class="secondary" id="cancel">取消处置，仅输出报告</button><button class="secondary" id="modify">提交修改研判</button><button id="confirm">确认生成模拟工单</button></div><pre id="reviewOutput"></pre></article></section></main><script>
const run=document.querySelector('#run'),status=document.querySelector('#status'),result=document.querySelector('#result'),review=document.querySelector('#review'),out=document.querySelector('#output'),summary=document.querySelector('#summary'),events=document.querySelector('#events'),reviewOut=document.querySelector('#reviewOutput'),steps=[...document.querySelectorAll('.step')];let sessionId='';
function renderOutput(raw){out.textContent=raw;let data;try{data=JSON.parse(raw)}catch{summary.textContent='平台已返回研判结果，但格式不是 JSON；请展开查看原始返回。';events.innerHTML='';return}summary.textContent=data.assessment_summary||'已完成风险研判。';const list=Array.isArray(data.events)?data.events:[];events.innerHTML=list.length?list.map((e,n)=>'<section class="event"><b>事件 '+(n+1)+'｜'+(e.risk_type||'待核验风险')+'</b><span class="level">'+(e.risk_level||'待定')+'</span><p><strong>位置：</strong>'+(e.location||'未标注')+'　<strong>置信度：</strong>'+((e.confidence??'—'))+'</p><p><strong>视觉证据：</strong>'+(e.visual_evidence||'待人工复核')+'</p><p><strong>处置建议：</strong>'+((e.recommended_actions||[]).join('；')||'继续复核')+'</p></section>').join(''):'<p class="note">未形成可确认事件，请结合原始返回进行人工复核。</p>'}
function setBusy(v){document.querySelectorAll('button').forEach(x=>x.disabled=v)}
// 后端返回的失败信息带 stage/hint/diagnostics，这里原样展开，方便定位是哪一段出的问题。
function failureText(d,fallback){const parts=[(d&&d.error)||fallback];if(d&&d.hint)parts.push('排查提示：'+d.hint);if(d&&d.platformFault)parts.push('判定：平台侧故障（external blocker），本地代码与本机配置无需修改。');if(d&&d.diagnostics){const bits=Object.entries(d.diagnostics).filter(([,v])=>v!==null&&v!==undefined&&v!==''&&!(Array.isArray(v)&&!v.length)).map(([k,v])=>k+'='+(typeof v==='object'?JSON.stringify(v):v));if(bits.length)parts.push('诊断信息：'+bits.join('，'))}return parts.join('\\n')}
run.onclick=async()=>{setBusy(true);result.style.display='none';review.style.display='none';steps.forEach((x,i)=>x.classList.toggle('active',i===0));status.textContent='正在创建智能体会话并执行任务规划…';let i=0;const timer=setInterval(()=>{i=Math.min(i+1,3);steps.forEach((x,n)=>x.classList.toggle('active',n<=i));status.textContent=['正在创建智能体会话并执行任务规划…','正在由视觉 Agent 分析巡检图片…','正在结合知识库进行风险研判…','正在等待人工复核结果…'][i]},25000);try{const r=await fetch('/api/mission',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({imageUrl:document.querySelector('#url').value,taskText:document.querySelector('#task').value})});const d=await r.json();if(!r.ok)throw Error(failureText(d,'调用失败'));clearInterval(timer);sessionId=d.sessionId;steps.slice(0,4).forEach(x=>x.classList.add('active'));status.textContent='真实调用完成：已形成候选风险事件，请进行人工复核。';renderOutput(d.output);result.style.display='block';review.style.display='block'}catch(e){clearInterval(timer);status.textContent='调用失败：'+e.message}finally{setBusy(false)}};
async function reviewCall(text,action='modify'){if(!sessionId)return;setBusy(true);status.textContent=action==='cancel'?'正在向平台提交取消处置确认…':'正在携带原始图片与人工决定重新提交平台…';try{const r=await fetch('/api/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId,text,imageUrl:document.querySelector('#url').value,taskText:document.querySelector('#task').value})});const d=await r.json();if(!r.ok)throw Error(failureText(d,'复核提交失败'));steps.forEach(x=>x.classList.add('active'));reviewOut.textContent=d.output;const panel=document.querySelector('#reviewReplyPanel');panel.style.display='block';status.textContent=action==='cancel'?'取消处置已确认：本页模拟工单已撤销，请查看下方“平台最终回复”。':'人工复核已完成：平台最终回复已在下方展开。';panel.scrollIntoView({behavior:'smooth',block:'start'})}catch(e){status.textContent=e.message==='Failed to fetch'?'复核提交未能连接本地演示服务。请刷新页面后重试；若仍失败，请检查校园网连接。':'复核失败：'+e.message}finally{setBusy(false)}}
async function workOrderCall(){setBusy(true);status.textContent='正在调用 jfg4 生成待审批模拟工单…';try{const r=await fetch('/api/workorder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({assessment:out.textContent})});const d=await r.json();if(!r.ok)throw Error(failureText(d,'工单生成失败'));steps.forEach(x=>x.classList.add('active'));status.textContent='模拟工单已由 jfg4 生成：待人工审批，不执行真实派遣。';reviewOut.textContent=d.output}catch(e){status.textContent='工单生成失败：'+e.message}finally{setBusy(false)}}
document.querySelector('#confirm').onclick=workOrderCall;document.querySelector('#cancel').onclick=()=>{const workorder=document.querySelector('#workorder');if(workorder){workorder.style.display='none';document.querySelector('#workorderCard').innerHTML='';document.querySelector('#workorderOutput').textContent=''}const final=document.querySelector('#finalDisposition');if(final){final.style.display='none';const feedback=document.querySelector('#finalFeedback');if(feedback){feedback.style.display='none';feedback.textContent=''}final.querySelectorAll('button').forEach(x=>x.disabled=false)}const panel=document.querySelector('#reviewReplyPanel');panel.style.display='none';reviewOut.textContent='';status.textContent='取消处置已完成：本次仅保留风险研判报告，模拟工单已撤销，未提交新的平台任务。'};document.querySelector('#modify').onclick=()=>{const t=document.querySelector('#reviewText').value.trim();return reviewCall(t.startsWith('修改研判：')?t:'修改研判：'+(t||'请降低风险等级并补充人工复核依据'))};
</script></body></html>`;

// 素材清单只在这里读取一次；网页选择器、/api/test-images 和本地预览都用同一份数据。
const catalog = loadTestImageCatalog();
for (const warning of catalog.warnings) console.warn(`[素材清单] ${warning}`);

const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const sourceOptions = [`<option value="">${escapeHtml(catalog.defaultSource.label)}</option>`]
  .concat(catalog.images.map(image => `<option value="${escapeHtml(image.file)}">${escapeHtml(image.label)}</option>`))
  .join("");

const demoPage = page
  .replace(/<input id="url" value="[^"]*">/, `<input id="url" value="${escapeHtml(catalog.defaultSource.publicUrl || "")}" placeholder="https://…（公网可访问的 JPG/PNG 直链）">`)
  .replace('<label class="label">公网图片链接</label>', `<label class="label">测试素材</label><select id="localSourcePicker" style="width:100%;border:1px solid #ccdbe7;border-radius:8px;padding:10px;background:#fff;font:14px inherit">${sourceOptions}</select><p id="localSourceHint" class="note">选择测试素材后可在本页预览。真实智能体调用需要公网可访问的直链：素材清单里配置了直链会自动带入，否则请在下方自行填写。</p><label class="label">上传本机图片（JPG/PNG）</label><input type="file" id="uploadFile" accept="image/jpeg,image/png" style="padding:9px;background:#fff"><button class="secondary" id="uploadBtn" type="button">上传并作为巡检图片</button><p id="uploadHint" class="note">上传后由后端存入对象存储，并把返回的公网直链填入下方“公网图片链接”。密钥只在后端环境变量中，不会出现在本页面。</p><label class="label">无人机巡检影像</label><img id="inspectionPreview" src="/api/image" alt="洪涝无人机巡检影像" style="width:100%;height:180px;object-fit:cover;border-radius:8px;border:1px solid #ccdbe7"><label class="label">公网图片链接</label>`);

const renderedDemoPage = demoPage.replace('</script></body></html>', `</script><script>
(() => {
  const desktopStyle = document.createElement('style');
  desktopStyle.textContent = '@media (min-width:1000px){.bar{padding-left:max(7vw,72px);padding-right:max(7vw,72px)}.hero{padding:42px max(7vw,72px)}.hero h1,.hero p{max-width:1440px;margin-left:auto;margin-right:auto}.grid{max-width:1440px;grid-template-columns:minmax(430px,.92fr) minmax(0,1.58fr);gap:28px;padding:0 36px;align-items:start}.grid>.card:first-child{position:sticky;top:22px}.card{padding:28px;border-radius:18px}.grid>.card:nth-child(2){min-width:0}.event{padding:18px}.result pre{max-height:420px;overflow:auto}}@media (min-width:1600px){.grid{max-width:1540px;grid-template-columns:470px minmax(0,1fr)}}@media (min-width:801px) and (max-width:999px){.grid{grid-template-columns:400px minmax(0,1fr);gap:18px}.card{padding:20px}}';
  document.head.append(desktopStyle);
  const localSourcePicker = document.querySelector('#localSourcePicker');
  const inspectionPreview = document.querySelector('#inspectionPreview');
  const localSourceHint = document.querySelector('#localSourceHint');
  const runButtonForSource = document.querySelector('#run');
  const urlField = document.querySelector('#url');
  // 素材与直链由后端素材清单派生，前端不再内置任何 URL 映射。
  const testImageSources = ${JSON.stringify(Object.fromEntries(catalog.images.map(image => [image.file, { label: image.label, publicUrl: image.publicUrl }])))};
  const defaultPublicUrl = ${JSON.stringify(catalog.defaultSource.publicUrl || "")};
  localSourcePicker.onchange = () => {
    const selected = localSourcePicker.value;
    inspectionPreview.src = selected ? '/local-test-image/' + encodeURIComponent(selected) : '/api/image';
    runButtonForSource.disabled = false;
    if (!selected) {
      urlField.value = defaultPublicUrl;
      localSourceHint.textContent = '当前显示默认演示图片。真实智能体调用使用下方的公网图片链接。';
      return;
    }
    const publicUrl = testImageSources[selected] && testImageSources[selected].publicUrl;
    urlField.value = publicUrl || '';
    localSourceHint.textContent = publicUrl
      ? '已带入该素材的公网直链。点击“启动真实巡检研判”即可由平台读取当前图片。'
      : '该测试素材只能在本页预览：平台需要公网可访问的直链，而本机 127.0.0.1 地址平台读不到。请为该素材配置自有对象存储直链（见 assets/test-images/test-image-catalog.json），或直接在下方填写你自己的公网 JPG/PNG 直链。';
  };
  const review = document.querySelector('#review');
  const status = document.querySelector('#status');
  const output = document.querySelector('#output');
  const buttons = [...document.querySelectorAll('button')];
  const reviewOutput = document.querySelector('#reviewOutput');
  const replyPanel = document.createElement('section');
  replyPanel.id = 'reviewReplyPanel'; replyPanel.className = 'event';
  replyPanel.style.cssText = 'display:none;border-left-color:#1674d1';
  replyPanel.innerHTML = '<b>平台最终回复</b><p class="note">以下为携带原始图片和人工复核意见后，由已发布智能体返回的结果。</p>';
  reviewOutput.parentNode.insertBefore(replyPanel, reviewOutput);
  replyPanel.append(reviewOutput);
  const card = document.createElement('article');
  card.id = 'workorder'; card.className = 'result';
  card.innerHTML = '<h2>模拟救援工单</h2><div id="workorderCard"></div><details><summary>查看 jfg4 平台原始返回</summary><pre id="workorderOutput"></pre></details>';
  review.after(card);
  document.querySelector('#confirm').onclick = async () => {
    buttons.forEach(x => x.disabled = true);
    status.textContent = '正在调用 jfg4 生成待审批模拟工单…';
    try {
      const r = await fetch('/api/workorder', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({assessment:output.textContent})});
      const d = await r.json(); if (!r.ok) throw Error(failureText(d, '工单生成失败'));
      const data = JSON.parse(d.output); if (!data.success || !data.work_order_id) throw Error(data.message || 'jfg4 未创建工单');
      document.querySelector('#workorderOutput').textContent = d.output;
      document.querySelector('#workorderCard').innerHTML = '<section class="event" style="border-left-color:#1674d1"><span class="level" style="color:#1269d4;background:#eaf3ff">'+(data.status||'待人工审批')+'</span><b>'+(data.work_order_title||'模拟救援工单')+'</b><p><strong>工单编号：</strong>'+data.work_order_id+'</p><p><strong>创建时间：</strong>'+(data.created_at||'—')+'　<strong>操作人：</strong>'+(data.operator_id||'—')+'</p><p><strong>审批状态：</strong>待有权限人员最终审批；系统未执行真实派遣。</p><p class="note">'+(data.notice||'本工单仅用于辅助决策与流程演示。')+'</p></section>';
      card.style.display = 'block';
      document.querySelectorAll('.step').forEach(x => x.classList.add('active'));
      status.textContent = '模拟工单已由 jfg4 真实生成：待人工审批，不执行真实派遣。';
    } catch (e) { status.textContent = '工单生成失败：' + e.message; }
    finally { buttons.forEach(x => x.disabled = false); }
  };
})();
</script></body></html>`);

const approvalDemoPage = renderedDemoPage.replace('</body></html>', `<script>
(() => {
  const workorder = document.querySelector('#workorder');
  const finalCard = document.createElement('article');
  finalCard.id = 'finalDisposition'; finalCard.className = 'result';
  const finalStep = document.createElement('span');
  finalStep.className = 'step'; finalStep.textContent = '最终审批';
  document.querySelector('.steps').append(finalStep);
  finalCard.innerHTML = '<h2>最终人工审批与闭环反馈</h2><p class="note">此处记录有权限人员对模拟工单的最终决定。无论何种结果，系统均不会执行真实派遣。</p><textarea id="finalNote" placeholder="可填写审批意见，例如：批准后持续监测水位；或：退回复飞补充高清影像。"></textarea><div class="review-actions"><button id="approveSim" style="background:#15803d">审批通过（模拟）</button><button id="rejectSim" style="background:#b91c1c">驳回工单</button><button id="reflightSim" style="background:#b45309">退回复飞核验</button></div><div id="finalFeedback" class="status" style="display:none;margin-top:16px"></div>';
  workorder.after(finalCard);
  let workOrderId = '';
  let activeDecision = '';
  const observer = new MutationObserver(() => {
    const text = document.querySelector('#workorderCard')?.textContent || '';
    const match = text.match(/WO-DEMO-[0-9]+/);
    if (match) { workOrderId = match[0]; finalCard.style.display = 'block'; }
  });
  observer.observe(document.querySelector('#workorderCard'), {childList:true,subtree:true});
  const choices = {
    approve: { label:'审批通过（模拟）', color:'#dcfce7', message:'本次模拟处置已批准并归档。系统仅记录批准状态；未派遣真实人员、设备或无人机。' },
    reject: { label:'工单已驳回', color:'#fee2e2', message:'本次模拟工单已驳回并归档。系统未执行任何真实派遣。' },
    reflight: { label:'已退回复飞核验', color:'#fef3c7', message:'本次模拟工单已退回复飞核验。建议补充高清影像、坐标、水文或现场核查信息后重新研判。未发起真实飞行。' }
  };
  async function decide(decision) {
    if (!workOrderId) return;
    const all = [...finalCard.querySelectorAll('button')]; all.forEach(x => x.disabled = true);
    const feedback = document.querySelector('#finalFeedback'); feedback.style.display='block'; feedback.textContent='正在记录最终人工审批结果…';
    try {
      const r = await fetch('/api/disposition', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workOrderId,decision,note:document.querySelector('#finalNote').value.trim(),previousDecision:activeDecision})});
      const data = await r.json(); if (!r.ok) throw Error(failureText(data, '审批记录失败'));
      const outcome = choices[decision];
      feedback.style.background = outcome.color;
      feedback.innerHTML = '<strong>最终反馈：'+outcome.label+'</strong><br>'+outcome.message+'<br><span class="note">记录时间：'+data.decidedAt+'；审批意见：'+(data.note || '未填写')+'</span>';
      document.querySelector('#workorderCard .level').textContent = outcome.label;
      finalStep.classList.add('active');
      activeDecision = decision;
      feedback.innerHTML += '<br><button id="undoDisposition" class="secondary" style="margin-top:14px;width:auto;padding:9px 18px">撤销“'+outcome.label+'”，重新审批</button>';
      document.querySelector('#undoDisposition').onclick = reopenDecision;
    } catch (e) { feedback.textContent='最终审批记录失败：'+e.message; all.forEach(x => x.disabled = false); }
  }
  async function reopenDecision() {
    if (!workOrderId || !activeDecision) return;
    const all = [...finalCard.querySelectorAll('button')]; all.forEach(x => x.disabled = true);
    const feedback = document.querySelector('#finalFeedback'); feedback.textContent='正在撤销当前决定，恢复待人工审批状态…';
    try {
      const r = await fetch('/api/disposition', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workOrderId,decision:'revoke',previousDecision:activeDecision,note:document.querySelector('#finalNote').value.trim()})});
      const data = await r.json(); if (!r.ok) throw Error(failureText(data, '撤销审批失败'));
      feedback.style.background='#eaf3ff';
      feedback.innerHTML='<strong>当前决定已撤销，待重新审批</strong><br>你可以重新选择审批通过、驳回工单或退回复飞核验。<br><span class="note">撤销时间：'+data.decidedAt+'；此前决定已保留在模拟审计记录中。</span>';
      document.querySelector('#workorderCard .level').textContent='待人工审批';
      activeDecision='';
      [...finalCard.querySelectorAll('#approveSim,#rejectSim,#reflightSim')].forEach(x => x.disabled = false);
    } catch (e) { feedback.textContent='撤销当前决定失败：'+e.message; all.forEach(x => x.disabled = false); }
  }
  document.querySelector('#approveSim').onclick = () => decide('approve');
  document.querySelector('#rejectSim').onclick = () => decide('reject');
  document.querySelector('#reflightSim').onclick = () => decide('reflight');
})();
</script></body></html>`);

// 上传逻辑单独一层：文件直接以原始二进制 PUT 给后端，不需要 multipart 解析依赖。
const uploadDemoPage = approvalDemoPage.replace('</body></html>', `<script>
(() => {
  const fileInput = document.querySelector('#uploadFile');
  const uploadButton = document.querySelector('#uploadBtn');
  const uploadHint = document.querySelector('#uploadHint');
  const urlField = document.querySelector('#url');
  const preview = document.querySelector('#inspectionPreview');
  const picker = document.querySelector('#localSourcePicker');
  let config = null;
  let objectUrl = '';

  const megabytes = bytes => (bytes / 1024 / 1024).toFixed(2) + ' MB';

  async function loadConfig() {
    try {
      config = await (await fetch('/api/upload-config')).json();
    } catch { config = null; }
    if (!config) { uploadHint.textContent = '无法读取上传配置：本地演示服务可能已停止。'; uploadButton.disabled = true; return; }
    if (!config.configured) {
      uploadButton.disabled = true;
      uploadHint.textContent = '对象存储尚未配置，暂时无法上传。' + config.note
        + (config.missingEnv && config.missingEnv.length ? '（缺少后端环境变量：' + config.missingEnv.join('、') + '）' : '');
      return;
    }
    uploadHint.textContent = '支持 JPG/PNG，单张不超过 ' + megabytes(config.maxBytes) + '。上传后自动填入下方公网图片链接。'
      + (config.publicUrls ? '' : '注意：当前是本地存储 driver，生成的是本机地址，平台读不到，仅供本地联调。');
  }

  fileInput.onchange = () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    preview.src = objectUrl;
    if (picker) picker.value = '';
    const tooBig = config && config.configured && file.size > config.maxBytes;
    const badType = !['image/jpeg', 'image/png'].includes(file.type);
    uploadHint.textContent = badType
      ? '只支持 JPG 和 PNG，当前文件类型是 ' + (file.type || '未知') + '。'
      : tooBig
        ? '文件 ' + megabytes(file.size) + ' 超过上限 ' + megabytes(config.maxBytes) + '，请压缩后再上传。'
        : '已选择：' + file.name + '（' + megabytes(file.size) + '）。点击“上传并作为巡检图片”。';
    uploadButton.disabled = badType || tooBig || !(config && config.configured);
  };

  uploadButton.onclick = async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) { uploadHint.textContent = '请先选择一张 JPG 或 PNG 图片。'; return; }
    const buttons = [...document.querySelectorAll('button')];
    buttons.forEach(x => x.disabled = true);
    uploadHint.textContent = '正在上传到对象存储…';
    try {
      const response = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
      const data = await response.json();
      if (!response.ok) throw Error(failureText(data, '上传失败'));
      urlField.value = data.url;
      uploadHint.textContent = '上传成功（' + megabytes(data.bytes) + '，driver=' + data.driver + '）。已填入公网图片链接，可直接启动巡检研判。';
    } catch (e) {
      uploadHint.textContent = '上传失败：' + e.message;
    } finally {
      buttons.forEach(x => x.disabled = false);
    }
  };

  loadConfig();
})();
</script></body></html>`);

// 本地输入校验单独成一类错误：这类问题该由调用方修，不该报给平台维护方。
function invalidInput(message, hint) {
  return new AgentGatewayError("input.invalid", `【input.invalid】${message}`, { hint, responseStatus: 400 });
}

async function mission(body) {
  const taskText = String(body?.taskText || "").trim();
  const imageUrl = String(body?.imageUrl || "").trim();
  if (!taskText) throw invalidInput("缺少巡检任务描述。", "请在“巡检任务”里填写要识别的风险类型。");
  if (!imageUrl) throw invalidInput("缺少公网图片链接。", "请选择测试素材并配置其公网直链，或直接填写一个公网可访问的 JPG/PNG 直链。");
  await agentClient.assertImageUsable(imageUrl);
  const { sessionId } = await agentClient.createSession({ agentCode, agentVersion });
  const { output } = await agentClient.run({ sessionId, text: taskText, attachments: [{ url: imageUrl, name: "flood-inspection.jpg" }] });
  return { sessionId, output };
}

async function review(body) {
  const text = String(body?.text || "").trim();
  const taskText = String(body?.taskText || "").trim();
  const imageUrl = String(body?.imageUrl || "").trim();
  if (!body?.sessionId) throw invalidInput("缺少会话号，无法把人工复核意见接回同一次研判。", "请先完成一次巡检研判再提交复核。");
  if (!text) throw invalidInput("缺少人工复核意见。", "请填写复核意见，或改用“取消处置，仅输出报告”。");
  if (!taskText || !imageUrl) throw invalidInput("缺少原始巡检任务或图片。", "复核需要携带原始任务与原始图片，请重新发起巡检研判。");
  await agentClient.assertImageUsable(imageUrl);
  const { output } = await agentClient.run({
    sessionId: body.sessionId,
    stage: "review",
    text: `${taskText}\n\n人工复核决定：${text}`,
    attachments: [{ url: imageUrl, name: "flood-inspection.jpg" }]
  });
  return { output };
}

async function createWorkOrder(body) {
  if (!body?.assessment) throw invalidInput("缺少已确认的风险研判结果。", "请先完成巡检研判并确认结果，再生成模拟工单。");
  // Match jfg0's “组装工单请求JSON” node exactly. jfg4 validates the full
  // user message as JSON, so a natural-language prefix would make it invalid.
  let riskAssessment;
  try {
    riskAssessment = typeof body.assessment === "string" ? JSON.parse(body.assessment) : body.assessment;
  } catch {
    throw invalidInput("风险研判结果不是合法 JSON，无法按 jfg4 的结构化工单协议提交。", "请检查上一步平台返回的原始内容是否为 JSON；若平台返回了自然语言，需要先修正工作流的输出格式。");
  }
  const request = {
    work_order_title: "洪涝灾害救援工单",
    risk_assessment: riskAssessment,
    human_confirmation: "确认生成工单",
    status: "待人工审批",
    operator_id: 1
  };
  const { sessionId } = await agentClient.createSession({ agentCode: workOrderAgentCode, agentVersion: workOrderAgentVersion, stage: "workOrder.createSession" });
  const { output } = await agentClient.run({ sessionId, stage: "workOrder.run", text: JSON.stringify(request), attachments: [] });
  return { sessionId, output };
}

let dispositionQueue = Promise.resolve();
async function recordDisposition(body) {
  // 串行校验与写入：并发点击不会在两个请求中同时读到“待审批”。
  const operation = dispositionQueue.then(() => commitDisposition(body));
  dispositionQueue = operation.catch(() => {});
  return operation;
}

async function commitDisposition(body) {
  const allowed = new Set(["approve", "reject", "reflight", "revoke"]);
  if (!body?.workOrderId || !allowed.has(body?.decision)) {
    throw invalidInput(`无效的工单审批请求：需要 workOrderId 和 decision（${[...allowed].join("/")}）。`, "这是本地校验失败，与平台无关；正常点击页面按钮不会触发。");
  }
  const logPath = join(runtimeDataDir, "workorder-dispositions.jsonl");
  let history = [];
  try {
    history = (await readFile(logPath, "utf8")).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const latest = history.findLast(record => record.workOrderId === body.workOrderId);
  const active = latest && latest.decision !== 'revoke' ? latest.decision : '';
  // 相同最终决定是幂等请求，直接返回之前的记录，不再次追加。
  if (active && body.decision === active) return { ...latest, deduplicated: true };
  const conflict = message => new AgentGatewayError('input.conflict', message, {responseStatus:409,hint:'请撤销当前决定后重新审批，或刷新查看当前工单状态。'});
  if (active && body.decision !== 'revoke') throw conflict('该工单已有最终决定，必须先撤销当前决定再重新审批。');
  if (body.decision === 'revoke' && (!active || body.previousDecision !== active)) throw conflict('当前决定不存在或已经改变，无法撤销这次审批。');
  const record = {
    workOrderId: body.workOrderId,
    decision: body.decision,
    previousDecision: body.previousDecision || null,
    note: String(body.note || "").slice(0, 500),
    decidedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
    simulationOnly: true,
    dispatchExecuted: false
  };
  // 运行期目录可用 DEMO_DATA_DIR 覆盖，自动化测试因此不会写进真实审计记录。
  await mkdir(runtimeDataDir, { recursive: true });
  await appendFile(logPath, `${JSON.stringify(record)}\n`, "utf8");
  return record;
}

const sendJson = (res, status, payload) => { res.writeHead(status, {"Content-Type":"application/json; charset=utf-8"}); res.end(JSON.stringify(payload)); };

// 图片路由必须同时支持 HEAD：图片可访问性检查（以及很多平台的取图逻辑）先发 HEAD。
const isRead = req => req.method === "GET" || req.method === "HEAD";
const sendFile = (req, res, file, contentType) => {
  res.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" });
  if (req.method === "HEAD") return res.end();
  return createReadStream(file).pipe(res);
};
const sendPlain = (res, status, text) => { res.writeHead(status, {"Content-Type":"text/plain; charset=utf-8"}); res.end(text); };

// 读取请求体，超过上限立刻停止读取，不把整张大图先收进内存再拒绝。
async function readLimitedBody(req, limitBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limitBytes) {
      req.destroy();
      throw new UploadError("upload.too_large", `【upload.too_large】上传内容超过上限 ${(limitBytes / 1024 / 1024).toFixed(2)} MB，已中断接收。`, {
        hint: "请压缩图片后重试，或调整环境变量 UPLOAD_MAX_BYTES。",
        responseStatus: 413,
        diagnostics: { limitBytes }
      });
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function handleUpload(req) {
  const limitBytes = maxUploadBytes();
  const declared = req.headers["content-type"];
  const length = Number(req.headers["content-length"]);
  if (Number.isFinite(length) && length > limitBytes) {
    throw new UploadError("upload.too_large", `【upload.too_large】图片 ${(length / 1024 / 1024).toFixed(2)} MB 超过上限 ${(limitBytes / 1024 / 1024).toFixed(2)} MB。`, {
      hint: "请压缩图片后重试，或调整环境变量 UPLOAD_MAX_BYTES。",
      responseStatus: 413,
      diagnostics: { bytes: length, limitBytes }
    });
  }
  const buffer = await readLimitedBody(req, limitBytes);
  const { contentType, extension, bytes } = validateUpload({ buffer, declaredType: declared, limitBytes });
  const objectKey = buildObjectKey({ prefix: storageDriver.prefix, extension });
  try {
    const stored = await storageDriver.put({ buffer, contentType, objectKey });
    console.log(`[上传] driver=${storageDriver.name} key=${stored.objectKey} bytes=${bytes}`);
    return { url: stored.url, objectKey: stored.objectKey, bytes, contentType, driver: storageDriver.name, publicUrl: Boolean(storageDriver.publicUrls) };
  } catch (error) {
    if (error instanceof UploadError) throw error;
    // 存储侧失败要说清是存储失败，而不是含糊的“上传失败”；driver 已给出脱敏后的原因和提示。
    throw new UploadError("upload.storage_failed", `【upload.storage_failed】写入对象存储失败：${String(error?.message || error).slice(0, 300)}`, {
      hint: error?.hint || "请检查对象存储配置（Bucket、Region、权限）与网络连通性；后端终端有完整日志。",
      responseStatus: 502,
      diagnostics: { driver: storageDriver.name, ossCode: error?.ossCode ?? null }
    });
  }
}

// 两种运行模式共用展示层，在线体验保留预置结果，真实模式保留平台调用。
const frontendDir = join(repoRoot, 'online-experience');
const workspacePage = uploadDemoPage.replace('</body>', '<link rel="stylesheet" href="/ui.css"><script src="/ui.js"></script><script src="/workspace.js"></script></body>');
const experiencePage = readFileSync(join(frontendDir, 'index.html'), 'utf8');

createServer(async (req,res)=>{
  if(isRead(req)&&['/ui.css','/ui.js','/workspace.js','/experience/ui.css','/experience/ui.js','/experience/workspace.js'].includes(req.url)){
    const name=req.url.split('/').pop();
    return sendFile(req,res,join(frontendDir,name),name.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');
  }
  if(isRead(req)&&req.url==='/experience/'){
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
    return res.end(req.method==='HEAD'?'':experiencePage);
  }
  if(isRead(req)&&req.url==='/experience'){
    res.writeHead(302,{Location:'/experience/'});return res.end();
  }
  if(isRead(req)&&req.url?.startsWith('/experience/assets/test-images/')){
    const image=resolveCatalogImage(catalog,decodeURIComponent(req.url.slice('/experience/assets/test-images/'.length).split('?')[0]));
    if(!image)return sendPlain(res,404,'素材不存在或未登记在素材清单中');
    return sendFile(req,res,image.path,image.contentType);
  }
  if(isRead(req)&&req.url?.startsWith('/local-test-image/')){
    const image=resolveCatalogImage(catalog,decodeURIComponent(req.url.slice('/local-test-image/'.length).split('?')[0]));
    if(!image)return sendPlain(res,404,'素材不存在或未登记在素材清单中');
    return sendFile(req,res,image.path,image.contentType);
  }
  if(isRead(req)&&req.url==='/api/upload-config'){
    const summary=describeStorage();
    return sendJson(res,200,{...summary,publicUrls:Boolean(storageDriver.publicUrls)});
  }
  // 本地 driver 存下来的图片：仅开发联调用，键名必须严格匹配生成规则。
  if(isRead(req)&&req.url?.startsWith('/uploaded-image/')){
    const objectKey=decodeURIComponent(req.url.slice('/uploaded-image/'.length).split('?')[0]);
    if(storageDriver.name!=='local'||!uploadedKeyPattern.test(objectKey))return sendPlain(res,404,'上传图片不存在');
    const file=join(storageDriver.root,objectKey);
    if(!existsSync(file))return sendPlain(res,404,'上传图片不存在');
    return sendFile(req,res,file,objectKey.endsWith('.png')?'image/png':'image/jpeg');
  }
  if(req.method==='POST'&&req.url==='/api/upload'){
    try{return sendJson(res,200,await handleUpload(req))}
    catch(error){
      if(typeof error?.toPayload==='function'){console.error(`[上传失败] ${error.stage}｜${error.message}`);return sendJson(res,error.responseStatus,error.toPayload())}
      console.error(`[上传失败] 未预期错误：${error?.stack||error}`);
      return sendJson(res,500,{error:'【unexpected】上传处理时发生未预期错误。',stage:'unexpected',hint:'请查看运行 npm run demo 的终端日志。',platformFault:false,externalBlocker:false});
    }
  }
  if(isRead(req)&&req.url==='/api/test-images'){
    return sendJson(res,200,{
      defaultSource:{label:catalog.defaultSource.label,publicUrl:catalog.defaultSource.publicUrl,publicUrlNote:catalog.defaultSource.publicUrlNote,overridden:catalog.defaultSource.overridden},
      images:catalog.images.map(({file,label,scenario,publicUrl,bytes,contentType})=>({file,label,scenario,publicUrl,bytes,contentType,previewUrl:`/local-test-image/${encodeURIComponent(file)}`}))
    });
  }
  if (upstream && (req.url==='/api/image' || (req.method==='POST' && ['/api/mission','/api/review','/api/workorder'].includes(req.url)))) {
    try { let proxyBody; if(req.method==='POST'){const parts=[];for await(const chunk of req)parts.push(chunk);proxyBody=Buffer.concat(parts)} const response = await fetch(`${upstream}${req.url}`, { method:req.method, headers:req.method==='POST'?{'Content-Type':'application/json'}:undefined, body:proxyBody }); const bytes=Buffer.from(await response.arrayBuffer()); res.writeHead(response.status,Object.fromEntries(response.headers)); return res.end(bytes); }
    catch { res.writeHead(502); return res.end('upstream unavailable'); }
  }
  // 默认预览图代理素材清单里的 defaultSource，源地址不再硬编码在代码里。
  if(isRead(req)&&req.url==='/api/image'){
    if(!catalog.defaultSource.publicUrl)return sendPlain(res,404,'素材清单未配置默认演示图片');
    try{const image=await fetch(catalog.defaultSource.publicUrl);if(!image.ok)throw Error(`HTTP ${image.status}`);const bytes=Buffer.from(await image.arrayBuffer());res.writeHead(200,{"Content-Type":image.headers.get('content-type')?.startsWith('image/')?image.headers.get('content-type'):'image/jpeg',"Content-Length":bytes.length,"Cache-Control":"no-store"});return res.end(bytes)}
    catch(error){console.warn(`[默认预览图] 读取失败：${error.message}`);return sendPlain(res,502,'默认演示图片当前不可访问')}
  }
  // 只有首页返回演示页。以前任何 GET 路径都回落到演示页，像 /.env.local 这类请求
  // 也会拿到 200，看起来仿佛服务在提供这些文件。
  if(req.method==='GET'&&(req.url==='/'||req.url==='/index.html'||req.url?.startsWith('/?'))){res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});return res.end(workspacePage)}
  if(req.method==='POST'&&(req.url==='/api/mission'||req.url==='/api/review'||req.url==='/api/workorder'||req.url==='/api/disposition')){
    // 按 Buffer 收集再整体解码：直接用字符串累加会把跨 chunk 切开的中文拆坏。
    const parts=[];req.on('data',c=>parts.push(c));
    req.on('end',async()=>{
      let input;
      try{input=JSON.parse(Buffer.concat(parts).toString('utf8'))}catch{return sendJson(res,400,{error:'【input.invalid】请求体不是合法 JSON。',stage:'input.invalid',hint:'请检查前端提交的数据；正常操作不会出现这个错误。',platformFault:false,externalBlocker:false})}
      try{
        const data=await (req.url==='/api/mission'?mission(input):req.url==='/api/review'?review(input):req.url==='/api/workorder'?createWorkOrder(input):recordDisposition(input));
        return sendJson(res,200,data);
      }catch(error){
        if(typeof error?.toPayload==='function'){
          // 平台侧故障和本地问题在日志里也要分开，方便判断该找谁。
          console.error(`[${error.platformFault?'平台故障':'调用失败'}] ${error.stage}｜${error.message}`);
          return sendJson(res,error.responseStatus,error.toPayload());
        }
        console.error(`[未预期错误] ${error?.stack||error?.message||error}`);
        return sendJson(res,502,{error:error?.message||'调用失败',stage:'unexpected',hint:'这是演示服务自身未预期的错误，请查看运行 npm run demo 的终端日志。',platformFault:false,externalBlocker:false});
      }
    });
    return;
  }
  res.writeHead(404);res.end();
}).on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`端口 ${port} 已被占用，本次服务未启动。浏览器可能仍在访问旧进程；请先停止旧演示服务，再运行 npm run demo。`);
  } else console.error(`演示服务启动失败：${error.message}`);
  process.exitCode = 1;
}).listen(port,'127.0.0.1',()=>{
  console.log(`真实演示页：http://127.0.0.1:${port}/`);
  console.log(`预置案例演示：http://127.0.0.1:${port}/experience/`);
  console.log('两个入口共用 online-experience 下的最新前端；修改服务代码或切换分支后请重启。');
});
