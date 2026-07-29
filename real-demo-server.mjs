import { createServer } from "node:http";
import { appendFile } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { basename, join } from "node:path";

const key = process.env.BAILIAN_APP_KEY;
const api = "http://10.128.203.200:80/sfm-agent-studio/sfm-api-gateway/gateway/agent/api";
const agentCode = "c9016857-92a0-4374-a545-3bd9e1e41dd6";
const agentVersion = "1784657975331";
const workOrderAgentCode = "20cbc85b-41d2-4b10-9fe3-1a34da5b0281";
const workOrderAgentVersion = "1784545668658";
const port = Number(process.env.PORT || 8789);
const upstream = process.env.DEMO_UPSTREAM || (key ? "" : "http://127.0.0.1:8788");

const page = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>汛巡智眼｜真实智能体演示</title><style>
*{box-sizing:border-box}body{margin:0;background:#eef4f8;color:#17324d;font-family:"Microsoft YaHei",Arial,sans-serif}.bar{height:68px;background:#fff;display:flex;align-items:center;padding:0 max(5vw,28px);justify-content:space-between;border-bottom:1px solid #dce7ef}.brand{font-size:22px;font-weight:800;color:#1165d3}.tag{color:#148657;background:#e8f8ef;border-radius:20px;padding:7px 12px;font-size:13px}.hero{padding:38px max(7vw,28px);background:linear-gradient(115deg,#0b4f9e,#1474d5);color:#fff}.hero h1{margin:0;font-size:34px}.hero p{opacity:.88}.grid{max-width:1240px;margin:25px auto;display:grid;grid-template-columns:360px 1fr;gap:20px;padding:0 18px}.card{background:#fff;border-radius:14px;padding:22px;box-shadow:0 7px 24px #1b4d7420}.card h2{font-size:18px;margin:0 0 16px}.label{display:block;font-size:13px;color:#60748a;margin:16px 0 7px}input,textarea{width:100%;border:1px solid #ccdbe7;border-radius:8px;padding:11px;font:14px inherit}textarea{height:100px;resize:vertical}button{width:100%;margin-top:18px;background:#1269d4;color:white;border:0;border-radius:8px;padding:13px;font-weight:700;font-size:15px;cursor:pointer}button:disabled{background:#91afd1}.secondary{background:#fff;border:1px solid #9fb6ca;color:#315574}.review-actions{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}.review-actions button{font-size:13px}.steps{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 22px}.step{padding:8px 12px;background:#eef3f8;border-radius:18px;font-size:13px}.step.active{background:#ddebff;color:#1269d4}.status{padding:14px;border-radius:8px;background:#f3f8fc;color:#456078;line-height:1.7}.result{display:none;margin-top:16px;border-top:1px solid #e3ebf1;padding-top:16px}.event{position:relative;margin-top:12px;padding:14px;border:1px solid #d7e5ef;border-left:4px solid #e99a28;border-radius:8px;background:#fff}.event b{font-size:15px}.event p{font-size:13px;line-height:1.6;margin:8px 0}.level{float:right;padding:3px 9px;border-radius:14px;background:#fff2e5;color:#a65211;font-size:12px;font-weight:bold}.result pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f7fafc;padding:15px;border-radius:8px;line-height:1.65;color:#29455d;font-size:13px}.note{font-size:12px;color:#71849a;line-height:1.6}@media(max-width:800px){.grid{grid-template-columns:1fr}.hero h1{font-size:26px}.review-actions{grid-template-columns:1fr}}
</style><body><header class="bar"><div class="brand">汛巡智眼</div><div class="tag">● jfg0 v2.0 真实调用</div></header><section class="hero"><h1>洪涝灾害无人机巡检救援总控</h1><p>图片识别 → 风险研判 → 人工复核 → 模拟工单。AI 仅提供辅助决策，不执行真实派遣。</p></section><main class="grid"><section class="card"><h2>发起巡检任务</h2><label class="label">巡检区域</label><input value="比赛模拟片区 A 周边道路" readonly><label class="label">公网图片链接</label><input id="url" value="https://xiangyu-macau.oss-cn-hongkong.aliyuncs.com/app/szb/pc/pic/202006/09/8ede59e2-00e5-4e5d-b62c-1b945ec3e477.jpg.1"><label class="label">巡检任务</label><textarea id="task">识别道路积水、道路中断、疑似被困人员及其他明显风险；仅生成模拟研判，不执行真实派遣。</textarea><button id="run">启动真实巡检研判</button><p class="note">真实调用 jfg0 v2.0；请保持校园网连接。点击后依次展示任务规划、视觉识别、风险研判和人工复核。</p></section><section class="card"><h2>智能体执行状态</h2><div class="steps"><span class="step">任务规划</span><span class="step">视觉识别</span><span class="step">风险研判</span><span class="step">人工复核</span><span class="step">模拟工单</span></div><div id="status" class="status">尚未开始：点击左侧“启动真实巡检研判”。</div><article id="result" class="result"><h2>风险研判总览</h2><div id="summary" class="status"></div><div id="events"></div><details><summary>查看平台原始返回</summary><pre id="output"></pre></details></article><article id="review" class="result"><h2>人工复核与处置决策</h2><p class="note">AI 已给出证据与建议，请由值守人员作最终决策。本操作仅生成模拟工单，不会派遣真实人员或设备。</p><textarea id="reviewText" placeholder="如需修改，请填写：例如，修改研判：将道路积水调整为中风险，并要求复飞核验。"></textarea><div class="review-actions"><button class="secondary" id="cancel">取消处置，仅输出报告</button><button class="secondary" id="modify">提交修改研判</button><button id="confirm">确认生成模拟工单</button></div><pre id="reviewOutput"></pre></article></section></main><script>
const run=document.querySelector('#run'),status=document.querySelector('#status'),result=document.querySelector('#result'),review=document.querySelector('#review'),out=document.querySelector('#output'),summary=document.querySelector('#summary'),events=document.querySelector('#events'),reviewOut=document.querySelector('#reviewOutput'),steps=[...document.querySelectorAll('.step')];let sessionId='';
function renderOutput(raw){out.textContent=raw;let data;try{data=JSON.parse(raw)}catch{summary.textContent='平台已返回研判结果，但格式不是 JSON；请展开查看原始返回。';events.innerHTML='';return}summary.textContent=data.assessment_summary||'已完成风险研判。';const list=Array.isArray(data.events)?data.events:[];events.innerHTML=list.length?list.map((e,n)=>'<section class="event"><b>事件 '+(n+1)+'｜'+(e.risk_type||'待核验风险')+'</b><span class="level">'+(e.risk_level||'待定')+'</span><p><strong>位置：</strong>'+(e.location||'未标注')+'　<strong>置信度：</strong>'+((e.confidence??'—'))+'</p><p><strong>视觉证据：</strong>'+(e.visual_evidence||'待人工复核')+'</p><p><strong>处置建议：</strong>'+((e.recommended_actions||[]).join('；')||'继续复核')+'</p></section>').join(''):'<p class="note">未形成可确认事件，请结合原始返回进行人工复核。</p>'}
function setBusy(v){document.querySelectorAll('button').forEach(x=>x.disabled=v)}
run.onclick=async()=>{setBusy(true);result.style.display='none';review.style.display='none';steps.forEach((x,i)=>x.classList.toggle('active',i===0));status.textContent='正在创建智能体会话并执行任务规划…';let i=0;const timer=setInterval(()=>{i=Math.min(i+1,3);steps.forEach((x,n)=>x.classList.toggle('active',n<=i));status.textContent=['正在创建智能体会话并执行任务规划…','正在由视觉 Agent 分析巡检图片…','正在结合知识库进行风险研判…','正在等待人工复核结果…'][i]},25000);try{const r=await fetch('/api/mission',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({imageUrl:document.querySelector('#url').value,taskText:document.querySelector('#task').value})});const d=await r.json();if(!r.ok)throw Error(d.error||'调用失败');clearInterval(timer);sessionId=d.sessionId;steps.slice(0,4).forEach(x=>x.classList.add('active'));status.textContent='真实调用完成：已形成候选风险事件，请进行人工复核。';renderOutput(d.output);result.style.display='block';review.style.display='block'}catch(e){clearInterval(timer);status.textContent='调用失败：'+e.message}finally{setBusy(false)}};
async function reviewCall(text,action='modify'){if(!sessionId)return;setBusy(true);status.textContent=action==='cancel'?'正在向平台提交取消处置确认…':'正在携带原始图片与人工决定重新提交平台…';try{const r=await fetch('/api/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId,text,imageUrl:document.querySelector('#url').value,taskText:document.querySelector('#task').value})});const d=await r.json();if(!r.ok)throw Error(d.error||'复核提交失败');steps.forEach(x=>x.classList.add('active'));reviewOut.textContent=d.output;const panel=document.querySelector('#reviewReplyPanel');panel.style.display='block';status.textContent=action==='cancel'?'取消处置已确认：本页模拟工单已撤销，请查看下方“平台最终回复”。':'人工复核已完成：平台最终回复已在下方展开。';panel.scrollIntoView({behavior:'smooth',block:'start'})}catch(e){status.textContent=e.message==='Failed to fetch'?'复核提交未能连接本地演示服务。请刷新页面后重试；若仍失败，请检查校园网连接。':'复核失败：'+e.message}finally{setBusy(false)}}
async function workOrderCall(){setBusy(true);status.textContent='正在调用 jfg4 生成待审批模拟工单…';try{const r=await fetch('/api/workorder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({assessment:out.textContent})});const d=await r.json();if(!r.ok)throw Error(d.error||'工单生成失败');steps.forEach(x=>x.classList.add('active'));status.textContent='模拟工单已由 jfg4 生成：待人工审批，不执行真实派遣。';reviewOut.textContent=d.output}catch(e){status.textContent='工单生成失败：'+e.message}finally{setBusy(false)}}
document.querySelector('#confirm').onclick=workOrderCall;document.querySelector('#cancel').onclick=()=>{const workorder=document.querySelector('#workorder');if(workorder){workorder.style.display='none';document.querySelector('#workorderCard').innerHTML='';document.querySelector('#workorderOutput').textContent=''}const final=document.querySelector('#finalDisposition');if(final){final.style.display='none';const feedback=document.querySelector('#finalFeedback');if(feedback){feedback.style.display='none';feedback.textContent=''}final.querySelectorAll('button').forEach(x=>x.disabled=false)}const panel=document.querySelector('#reviewReplyPanel');panel.style.display='none';reviewOut.textContent='';status.textContent='取消处置已完成：本次仅保留风险研判报告，模拟工单已撤销，未提交新的平台任务。'};document.querySelector('#modify').onclick=()=>{const t=document.querySelector('#reviewText').value.trim();reviewCall(t.startsWith('修改研判：')?t:'修改研判：'+(t||'请降低风险等级并补充人工复核依据'))};
</script></body></html>`;

const publicTestImages = {"01_bridge_debris_high.jpg":"https://h.uguu.se/dSQXxsoM.jpg","02_bridge_debris_medium.jpg":"https://n.uguu.se/WBxpsHNF.jpg","03_flooded_road_high.jpg":"https://h.uguu.se/FKqCDzfn.jpg","04_blurred_reflight_check.jpg":"https://n.uguu.se/onwNsVVv.jpg","05_normal_rural_road.jpg":"https://d.uguu.se/pMXOKTAN.jpg","06_normal_bridge.jpg":"https://d.uguu.se/HYcWNrMu.jpg"};
const demoPage = page.replace('<label class="label">公网图片链接</label>', '<label class="label">测试素材（已配置公网 URL）</label><select id="localSourcePicker" style="width:100%;border:1px solid #ccdbe7;border-radius:8px;padding:10px;background:#fff;font:14px inherit"><option value="">默认洪涝航拍图</option><option value="01_bridge_debris_high.jpg">01｜桥梁杂物堆积（高风险）</option><option value="02_bridge_debris_medium.jpg">02｜桥梁杂物堆积（中风险）</option><option value="03_flooded_road_high.jpg">03｜道路积水</option><option value="04_blurred_reflight_check.jpg">04｜低清晰度，建议复飞</option><option value="05_normal_rural_road.jpg">05｜正常乡村道路</option><option value="06_normal_bridge.jpg">06｜正常桥梁</option></select><p id="localSourceHint" class="note">选择测试图后，网页会自动带入该图的公网直链；百炼可直接读取并进行真实研判。</p><label class="label">无人机巡检影像</label><img id="inspectionPreview" src="/api/image" alt="洪涝无人机巡检影像" style="width:100%;height:180px;object-fit:cover;border-radius:8px;border:1px solid #ccdbe7"><label class="label">公网图片链接</label>');

const renderedDemoPage = demoPage.replace('</script></body></html>', `</script><script>
(() => {
  const desktopStyle = document.createElement('style');
  desktopStyle.textContent = '@media (min-width:1000px){.bar{padding-left:max(7vw,72px);padding-right:max(7vw,72px)}.hero{padding:42px max(7vw,72px)}.hero h1,.hero p{max-width:1440px;margin-left:auto;margin-right:auto}.grid{max-width:1440px;grid-template-columns:minmax(430px,.92fr) minmax(0,1.58fr);gap:28px;padding:0 36px;align-items:start}.grid>.card:first-child{position:sticky;top:22px}.card{padding:28px;border-radius:18px}.grid>.card:nth-child(2){min-width:0}.event{padding:18px}.result pre{max-height:420px;overflow:auto}}@media (min-width:1600px){.grid{max-width:1540px;grid-template-columns:470px minmax(0,1fr)}}@media (min-width:801px) and (max-width:999px){.grid{grid-template-columns:400px minmax(0,1fr);gap:18px}.card{padding:20px}}';
  document.head.append(desktopStyle);
  const localSourcePicker = document.querySelector('#localSourcePicker');
  const inspectionPreview = document.querySelector('#inspectionPreview');
  const localSourceHint = document.querySelector('#localSourceHint');
  const runButtonForSource = document.querySelector('#run');
  const publicTestImages = ${JSON.stringify(publicTestImages)};
  localSourcePicker.onchange = () => {
    const selected = localSourcePicker.value;
    inspectionPreview.src = selected ? '/local-test-image/' + selected : '/api/image';
    const publicUrl = publicTestImages[selected];
    if (publicUrl) document.querySelector('#url').value = publicUrl;
    runButtonForSource.disabled = false;
    localSourceHint.textContent = selected
      ? '已自动带入该图片的公网直链。点击“启动真实巡检研判”即可由百炼读取当前图片并真实调用 jfg0。'
      : '当前显示默认洪涝航拍图。真实智能体调用使用下方的公网图片链接。';
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
      const d = await r.json(); if (!r.ok) throw Error(d.error || '工单生成失败');
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
      const data = await r.json(); if (!r.ok) throw Error(data.error || '审批记录失败');
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
      const data = await r.json(); if (!r.ok) throw Error(data.error || '撤销审批失败');
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

async function mission(body) {
  if (!key) throw new Error("本机未配置 BAILIAN_APP_KEY");
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const create = await fetch(`${api}/createSession`, { method:"POST", headers, body:JSON.stringify({ agentCode, agentVersion }) });
  const session = await create.json(); const sessionId = session?.data?.uniqueCode;
  if (!session?.success || !sessionId) throw new Error(session?.errorMsg || "创建会话失败");
  const call = await fetch(`${api}/run`, { method:"POST", headers, body:JSON.stringify({ sessionId, stream:false, delta:false, trace:false, message:{ text:body.taskText, attachments:[{ url:body.imageUrl, name:"flood-inspection.jpg" }] } }) });
  const data = await call.json(); const output = data?.data?.message?.content?.find(x=>x.type==='text')?.text?.value;
  if (!data?.success || !output) throw new Error(data?.errorMsg || "未收到智能体结果");
  return { sessionId, output };
}

async function review(body) {
  if (!key) throw new Error("本机未配置 BAILIAN_APP_KEY");
  if (!body?.sessionId || !body?.text) throw new Error("缺少会话或复核意见");
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  if (!body?.imageUrl || !body?.taskText) throw new Error("缺少原始巡检任务或图片");
  const call = await fetch(`${api}/run`, { method:"POST", headers, body:JSON.stringify({ sessionId:body.sessionId, stream:false, delta:false, trace:false, message:{ text:`${body.taskText}\n\n人工复核决定：${body.text}`, attachments:[{ url:body.imageUrl, name:"flood-inspection.jpg" }] } }) });
  const data = await call.json(); const output = data?.data?.message?.content?.find(x=>x.type==='text')?.text?.value;
  if (!data?.success || !output) throw new Error(data?.errorMsg || "未收到复核结果");
  return { output };
}

async function createWorkOrder(body) {
  if (!key) throw new Error("本机未配置 BAILIAN_APP_KEY");
  if (!body?.assessment) throw new Error("缺少已确认的风险研判结果");
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const create = await fetch(`${api}/createSession`, { method:"POST", headers, body:JSON.stringify({ agentCode:workOrderAgentCode, agentVersion:workOrderAgentVersion }) });
  const session = await create.json(); const sessionId = session?.data?.uniqueCode;
  if (!session?.success || !sessionId) throw new Error(session?.errorMsg || "创建工单会话失败");
  // Match jfg0's “组装工单请求JSON” node exactly. jfg4 validates the full
  // user message as JSON, so a natural-language prefix would make it invalid.
  let riskAssessment;
  try {
    riskAssessment = typeof body.assessment === "string" ? JSON.parse(body.assessment) : body.assessment;
  } catch {
    throw new Error("风险研判结果不是合法 JSON，无法按 jfg4 的结构化工单协议提交");
  }
  const request = {
    work_order_title: "洪涝灾害救援工单",
    risk_assessment: riskAssessment,
    human_confirmation: "确认生成工单",
    status: "待人工审批",
    operator_id: 1
  };
  const call = await fetch(`${api}/run`, { method:"POST", headers, body:JSON.stringify({ sessionId, stream:false, delta:false, trace:false, message:{ text:JSON.stringify(request), attachments:[] } }) });
  const data = await call.json(); const output = data?.data?.message?.content?.find(x=>x.type==='text')?.text?.value;
  if (!data?.success || !output) throw new Error(data?.errorMsg || "工单服务未返回结果");
  return { sessionId, output };
}

async function recordDisposition(body) {
  const allowed = new Set(["approve", "reject", "reflight", "revoke"]);
  if (!body?.workOrderId || !allowed.has(body?.decision)) throw new Error("无效的工单审批请求");
  const record = {
    workOrderId: body.workOrderId,
    decision: body.decision,
    previousDecision: body.previousDecision || null,
    note: String(body.note || "").slice(0, 500),
    decidedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
    simulationOnly: true,
    dispatchExecuted: false
  };
  await appendFile(new URL("./data/workorder-dispositions.jsonl", import.meta.url), `${JSON.stringify(record)}\n`, "utf8");
  return record;
}

createServer(async (req,res)=>{
  if(req.method==='GET'&&req.url?.startsWith('/local-test-image/')){const name=basename(req.url.slice('/local-test-image/'.length));const file=join(process.cwd(),'assets','test-images',name);if(!/\.jpg$/i.test(name)||!existsSync(file)){res.writeHead(404);return res.end('not found')}res.writeHead(200,{"Content-Type":"image/jpeg","Cache-Control":"no-store"});return createReadStream(file).pipe(res)}
  if (upstream && (req.url==='/api/image' || (req.method==='POST' && ['/api/mission','/api/review','/api/workorder'].includes(req.url)))) {
    try { let proxyBody; if(req.method==='POST'){proxyBody='';for await(const chunk of req)proxyBody+=chunk} const response = await fetch(`${upstream}${req.url}`, { method:req.method, headers:req.method==='POST'?{'Content-Type':'application/json'}:undefined, body:proxyBody }); const bytes=Buffer.from(await response.arrayBuffer()); res.writeHead(response.status,Object.fromEntries(response.headers)); return res.end(bytes); }
    catch { res.writeHead(502); return res.end('upstream unavailable'); }
  }
  if(req.method==='GET'&&req.url==='/api/image'){try{const image=await fetch('https://xiangyu-macau.oss-cn-hongkong.aliyuncs.com/app/szb/pc/pic/202006/09/8ede59e2-00e5-4e5d-b62c-1b945ec3e477.jpg.1');if(!image.ok)throw Error('image fetch failed');const bytes=Buffer.from(await image.arrayBuffer());res.writeHead(200,{"Content-Type":"image/jpeg","Content-Length":bytes.length,"Cache-Control":"no-store"});return res.end(bytes)}catch{res.writeHead(502);return res.end('image unavailable')}}
  if(req.method==='GET'){res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});return res.end(approvalDemoPage)}
  if(req.method==='POST'&&(req.url==='/api/mission'||req.url==='/api/review'||req.url==='/api/workorder'||req.url==='/api/disposition')){let raw='';req.on('data',c=>raw+=c);req.on('end',async()=>{try{const input=JSON.parse(raw);const data=await (req.url==='/api/mission'?mission(input):req.url==='/api/review'?review(input):req.url==='/api/workorder'?createWorkOrder(input):recordDisposition(input));res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify(data))}catch(e){res.writeHead(502,{"Content-Type":"application/json"});res.end(JSON.stringify({error:e.message}))}});return}
  res.writeHead(404);res.end();
}).listen(port,'127.0.0.1',()=>console.log(`真实演示页：http://127.0.0.1:${port}`));
