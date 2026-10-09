/* 展示与交互边界共用层：真实页面与预置案例使用相同状态约束。 */
(() => {
  const $ = s => document.querySelector(s);
  const online = document.title.includes('在线体验');
  const result = $('#result'), review = $('#review'), workorder = $('#workorder'), final = $('#finalDisposition');
  let busy = false, hasOrder = false, decision = '', orderId = '', assessmentReady = false;
  let reviewNeedsAssessment = false;
  let observationState = 'idle';
  let sourceRevision = 0, assessmentRevision = -1;
  const titles = {approve:'审批通过（模拟）',reject:'工单已驳回',reflight:'已退回复飞核验'};
  const text = (tag, value, className) => { const el = document.createElement(tag); el.textContent = value; if(className)el.className=className; return el; };

  const emptyAssessment=document.createElement('section');emptyAssessment.className='empty-assessment';
  emptyAssessment.innerHTML='<span class="section-index">02 / RISK ASSESSMENT</span><h2>风险研判</h2><div class="assessment-empty-symbol" aria-hidden="true"><span></span><i class="observation-sweep"></i><b class="observation-glyph"></b></div><h3 id="observationTitle">等待一份现场证据</h3><p id="observationDescription">选择巡检影像并启动研判。<br>风险、视觉依据与处置建议将在这里呈现。</p><button id="retryInspection" type="button" class="secondary observation-retry" hidden>重新研判</button><div class="empty-assessment-footer"><span>影像识别</span><span>风险研判</span><span>人工确认</span></div>';
  result.before(emptyAssessment);
  result.insertBefore(text('span','02 / RISK ASSESSMENT','section-index'),result.firstChild);
  result.querySelector('h2').textContent='风险研判';
  const observationResult=document.createElement('div');observationResult.className='observation-result';
  observationResult.innerHTML='<div class="assessment-empty-symbol" aria-hidden="true"><span></span><i class="observation-sweep"></i><b class="observation-glyph"></b></div><div><strong id="observationResultTitle"></strong><p id="observationResultDescription"></p></div>';
  result.querySelector('h2').after(observationResult);
  $('#retryInspection').onclick=()=>{if(!busy)$('#run').click();};
  const setText=(element,value)=>{if(element.textContent!==value)element.textContent=value;};
  const syncObservation = () => {
    emptyAssessment.dataset.observation=observationState;
    observationResult.dataset.observation=observationState;
    const states={
      idle:['等待一份现场证据','选择巡检影像并启动研判。风险、视觉依据与处置建议将在这里呈现。'],
      running:['正在分析巡检影像','正在等待研判结果。扫描动效仅表示处理中，不代表实际检测进度。'],
      error:['本次研判未完成','请结合执行状态中的原因检查图片或连接，再重新研判。']
    };
    const state=states[observationState]||states.idle;
    setText($('#observationTitle'),state[0]);setText($('#observationDescription'),state[1]);
    $('#retryInspection').hidden=observationState!=='error';$('#retryInspection').disabled=busy;
    emptyAssessment.querySelector('.observation-glyph').textContent=observationState==='error'?'!':'';
    const completedTitle=decision?'人工决定已记录':hasOrder?'工单已生成，等待审批':'研判完成，等待人工复核';
    setText($('#observationResultTitle'),completedTitle);
    setText($('#observationResultDescription'),decision?'本次模拟决定已记录；未执行真实派遣。':hasOrder?'请核对工单和审批意见，再作最终决定。':'结合视觉证据确认风险，再决定是否生成模拟工单。');
    observationResult.querySelector('.observation-glyph').textContent='✓';
  };

  const metrics = document.createElement('div'); metrics.className='assessment-metrics';
  $('#summary').before(metrics);
  let linkedEvents=[], selectedEvidence=null;
  const evidencePanel=document.createElement('section');evidencePanel.id='linkedEvidence';evidencePanel.className='linked-evidence';evidencePanel.hidden=true;
  evidencePanel.setAttribute('aria-label','当前影像的风险证据');
  $('.image-principle').before(evidencePanel);
  const evidenceAnnouncement=text('span','','sr-only');evidenceAnnouncement.setAttribute('role','status');evidencePanel.after(evidenceAnnouncement);
  const renderLinkedEvidence=()=>{
    evidencePanel.hidden=!linkedEvents.length;
    document.querySelectorAll('.risk-event').forEach((card,index)=>{
      card.classList.toggle('evidence-selected',index===selectedEvidence);
      const button=card.querySelector('.evidence-select');button.setAttribute('aria-pressed',String(index===selectedEvidence));setText(button,index===selectedEvidence?'正在查看影像证据 ✓':'查看影像证据 ↗');
    });
    const event=linkedEvents[selectedEvidence];
    if(!event){evidencePanel.replaceChildren(text('span','EVIDENCE LINK / 证据联动','section-index'),text('p','点击风险卡片，查看当前影像的判断依据。','evidence-invitation'));return;}
    const header=document.createElement('div');header.className='linked-evidence-heading';
    header.append(text('span','当前证据 · '+String(selectedEvidence+1).padStart(2,'0'),'section-index'),text('span',event.risk_level||'待核验','linked-evidence-level'));
    const fields=document.createElement('dl');
    for(const [label,value] of [['位置描述',event.location||'未提供位置描述'],['视觉依据',event.visual_evidence||'待人工复核']])fields.append(text('dt',label),text('dd',value));
    const actions=document.createElement('ul');(Array.isArray(event.recommended_actions)&&event.recommended_actions.length?event.recommended_actions:['继续人工复核']).forEach(value=>actions.append(text('li',String(value))));
    const actionValue=document.createElement('dd');actionValue.append(actions);fields.append(text('dt','核验与处置'),actionValue);
    const confidence=Number(event.confidence);const valid=event.confidence!==null&&event.confidence!==undefined&&event.confidence!==''&&Number.isFinite(confidence)&&confidence>=0&&confidence<=1;
    fields.append(text('dt','模型置信度'),text('dd',(valid?Math.round(confidence*100)+'%':'未提供')+' · 不代表实际准确率'));
    evidencePanel.replaceChildren(header,text('h3',event.risk_type||'待核验风险'),fields,text('p','依据来自本次研判结果；位置为文字描述，未在影像中精确定位。','linked-evidence-note'));
  };
  const selectEvidence=index=>{
    selectedEvidence=index;renderLinkedEvidence();evidenceAnnouncement.textContent='已展示事件 '+(index+1)+'：'+(linkedEvents[index].risk_type||'待核验风险')+'的影像证据。';
    // 窄屏影像与卡片上下排列，选中后将证据带入视野；桌面保留当前位置。
    if(window.matchMedia('(max-width:1150px)').matches)evidencePanel.scrollIntoView({block:'nearest',behavior:window.matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
  };
  const displayAssessment = () => {
    if (!assessmentReady) return;
    let data; try {data=JSON.parse($('#output').textContent);} catch {metrics.replaceChildren();linkedEvents=[];selectedEvidence=null;renderLinkedEvidence();return;}
    const events = Array.isArray(data.events)?data.events:[];
    linkedEvents=events;if(selectedEvidence!==null&&selectedEvidence>=events.length)selectedEvidence=null;
    const levels=events.map(e=>String(e.risk_level||'待核验'));
    const highest=levels.find(l=>l.includes('高'))||levels.find(l=>l.includes('中'))||levels.find(l=>l.includes('低'))||(events.length?'待核验':'未发现');
    metrics.replaceChildren(...[['候选风险事件',events.length+' 项'],['最高风险等级',highest],['当前处置状态',hasOrder?(titles[decision]||'待人工审批'):'待人工复核']].map(([label,value])=>{const cell=document.createElement('div');cell.append(text('span',label),text('strong',value));return cell;}));
    $('#events').replaceChildren(...events.map((event,index)=>{
      const card=document.createElement('section');card.className='event risk-event';
      card.dataset.risk=String(event.risk_level||'').includes('高')?'high':String(event.risk_level||'').includes('中')?'medium':String(event.risk_level||'').includes('低')?'low':'unknown';
      const heading=document.createElement('div');heading.className='risk-heading';heading.append(text('b','事件 '+String(index+1).padStart(2,'0')+'｜'+(event.risk_type||'待核验风险')),text('span',event.risk_level||'待核验','level'));card.append(heading,text('p','位置：'+(event.location||'未标注'),'risk-location'));
      // 摘要直接使用原始证据，视觉上限制行数；完整内容始终保留在联动证据区。
      card.append(text('p',event.visual_evidence||'待人工复核','risk-preview'));
      const select=text('button','查看影像证据 ↗','evidence-select');select.type='button';select.setAttribute('aria-controls','linkedEvidence');select.setAttribute('aria-label','查看事件 '+(index+1)+' '+(event.risk_type||'待核验风险')+'的影像证据');select.onclick=()=>selectEvidence(index);card.append(select);
      card.addEventListener('click',event=>{if(!event.target.closest('button')&&!window.getSelection()?.toString())selectEvidence(index);});return card;
    }));
    renderLinkedEvidence();
    if(!events.length){
      $('#events').append(text('p','本次未形成可确认风险事件，建议保留报告并持续监测。','normal-result'));
      if(!hasOrder&&$('#status').textContent.includes('候选风险事件'))$('#status').textContent='研判完成：本次未形成可确认事件，可人工复核并保留报告。';
    }
  };

  const decisionPanel=document.createElement('section');decisionPanel.className='decision-panel';
  decisionPanel.innerHTML='<div class="decision-tabs" role="tablist" aria-label="复核与工单"><button type="button" id="reviewTab" role="tab" aria-controls="reviewPane" aria-selected="true">人工复核</button><button type="button" id="orderTab" role="tab" aria-controls="orderPane" aria-selected="false">模拟工单 <span id="orderCount">0</span></button></div><div id="reviewPane" role="tabpanel" aria-labelledby="reviewTab"></div><div id="orderPane" role="tabpanel" aria-labelledby="orderTab"></div>';
  result.after(decisionPanel);$('#reviewPane').append(review);$('#orderPane').append(workorder,final);
  const emptyOrder=text('p','尚未生成工单，请先完成人工复核。','order-empty');$('#orderPane').prepend(emptyOrder);
  const audit=document.createElement('ol');audit.className='disposition-audit';audit.setAttribute('aria-label','工单处置记录');final.append(audit);
  const records=[];
  const selectTab = name => {for(const key of ['review','order']){$('#'+key+'Tab').setAttribute('aria-selected',String(name===key));$('#'+key+'Pane').hidden=name!==key;}};
  $('#reviewTab').onclick=()=>selectTab('review');$('#orderTab').onclick=()=>selectTab('order');selectTab('review');
  const renderAudit=()=>audit.replaceChildren(...records.map(r=>text('li',r)));
  const sync = () => {
    decisionPanel.hidden=!assessmentReady;emptyAssessment.hidden=assessmentReady;emptyOrder.hidden=hasOrder;$('#orderCount').textContent=hasOrder?'1':'0';
    document.querySelector('.analysis-workspace').dataset.state=busy?'busy':decision?'decided':hasOrder?'approval':assessmentReady?'review':'ready';
    syncObservation();
    $('#confirm').disabled=busy||!assessmentReady||hasOrder||reviewNeedsAssessment;
    $('#modify').disabled=busy||!assessmentReady||hasOrder;
    $('#cancel').disabled=busy||!assessmentReady||hasOrder;
    $('#run').disabled=busy;
    ['approveSim','rejectSim','reflightSim'].forEach(id=>{const button=$('#'+id),disabled=busy||!hasOrder||Boolean(decision);if(button.disabled!==disabled)button.disabled=disabled;});
    const undo=$('#undoDisposition');if(undo&&undo.disabled!==busy)undo.disabled=busy;
    $('#finalNote').readOnly=busy||Boolean(decision);
    $('#reviewText').readOnly=busy||hasOrder;
    $('#task').disabled=busy;$('#localSourcePicker').disabled=busy;$('#url').disabled=busy;$('#uploadFile').disabled=busy;
    $('#sampleSourceTab').disabled=busy;$('#uploadSourceTab').disabled=busy;
    if(!busy)document.querySelectorAll('.step').forEach((step,i)=>{step.classList.toggle('active',i<(decision?6:hasOrder?5:assessmentReady?4:0));step.setAttribute('aria-current',(!decision&&i===(hasOrder?5:assessmentReady?3:-1))?'step':'false');});
  };
  const reset = () => {
    linkedEvents=[];selectedEvidence=null;evidenceAnnouncement.textContent='';renderLinkedEvidence();
    assessmentReady=false;hasOrder=false;decision='';orderId='';reviewNeedsAssessment=false;observationState='idle';records.length=0;renderAudit();
    [result,review,workorder,final,$('#reviewReplyPanel'),$('#finalFeedback')].forEach(el=>el.style.display='none');
    ['output','summary','events','reviewOutput','workorderCard','workorderOutput','finalFeedback'].forEach(id=>$('#'+id).replaceChildren());
    $('#reviewText').value='';$('#finalNote').value='';metrics.replaceChildren();selectTab('review');sync();
  };
  const invalidate = () => {sourceRevision++;if(assessmentReady||hasOrder||observationState!=='idle'){reset();$('#status').textContent='任务输入已改变，请重新启动研判。';}};
  $('#localSourcePicker').addEventListener('change',invalidate);$('#uploadFile').addEventListener('change',invalidate);$('#url').addEventListener('input',invalidate);$('#task').addEventListener('input',invalidate);
  const originalRun=$('#run').onclick;
  $('#run').onclick=async event=>{
    if(busy)return;
    reset();busy=true;observationState='running';assessmentRevision=sourceRevision;sync();
    try{await originalRun(event);}
    catch(error){busy=false;observationState='error';$('#status').textContent='研判未完成：'+error.message;sync();}
    finally{if(!online){busy=false;assessmentReady=result.style.display==='block';observationState=assessmentReady?'completed':'error';displayAssessment();sync();}}
  };
  const originalConfirm=$('#confirm').onclick;
  $('#confirm').onclick=async event=>{if(busy||hasOrder||!assessmentReady||reviewNeedsAssessment||assessmentRevision!==sourceRevision)return;busy=true;sync();try{await originalConfirm(event);}finally{if(!online){busy=false;readOrder();sync();}}};
  const originalModify=$('#modify').onclick;
  $('#modify').onclick=async event=>{if(busy||hasOrder||!assessmentReady)return;if(!$('#reviewText').value.trim()){$('#status').textContent='请先填写复核意见。';return;}reviewNeedsAssessment=!online;busy=true;sync();try{await originalModify(event);}finally{if(!online){busy=false;sync();}}};
  const originalCancel=$('#cancel').onclick;
  $('#cancel').onclick=event=>{if(busy||hasOrder||!assessmentReady)return;originalCancel(event);sync();};
  // 在线体验原函数通过定时器结束；监听显示状态与返回内容接回状态机。
  const resultObserver=new MutationObserver(()=>{if(result.style.display==='block'){assessmentReady=true;busy=false;observationState='completed';displayAssessment();sync();}});
  resultObserver.observe(result,{attributes:true,attributeFilter:['style']});
  const readOrder = () => {
    let data;try{data=JSON.parse($('#workorderOutput').textContent);}catch{return;}
    if(!data.success||!data.work_order_id||hasOrder)return;
    hasOrder=true;orderId=String(data.work_order_id);decision='';busy=false;final.style.display='block';
    records.splice(0,records.length,'人工复核完成','模拟工单已生成 · 待人工审批');renderAudit();selectTab('order');displayAssessment();sync();
  };
  new MutationObserver(readOrder).observe($('#workorderOutput'),{childList:true,subtree:true});
  new MutationObserver(()=>{if($('#reviewReplyPanel').style.display==='block'){busy=false;sync();}}).observe($('#reviewReplyPanel'),{attributes:true,attributeFilter:['style']});
  new MutationObserver(()=>{
    if(online||!$('#reviewOutput').textContent)return;
    try{const updated=JSON.parse($('#reviewOutput').textContent);if(Array.isArray(updated.events)&&updated.assessment_summary){selectedEvidence=null;evidenceAnnouncement.textContent='';$('#output').textContent=$('#reviewOutput').textContent;$('#summary').textContent=updated.assessment_summary;reviewNeedsAssessment=false;displayAssessment();sync();}}
    catch{ /* 非结构化回复保留展示，但不能使用旧研判生成新工单。 */ }
  }).observe($('#reviewOutput'),{childList:true,subtree:true});
  // 旧全局按钮解锁函数不能解锁已经审批完毕的操作。
  new MutationObserver(sync).observe(final,{subtree:true,attributes:true,attributeFilter:['disabled']});
  const approval = async next => {
    if(busy||!hasOrder||!orderId||(next!=='revoke'&&decision)||(next==='revoke'&&!decision))return;
    busy=true;sync();const feedback=$('#finalFeedback');feedback.style.display='block';feedback.textContent='正在记录人工决定…';
    try{
      let data={decidedAt:new Date().toLocaleString('zh-CN'),note:$('#finalNote').value.trim()};
      if(!online){const response=await fetch('/api/disposition',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workOrderId:orderId,decision:next,previousDecision:decision,note:$('#finalNote').value.trim()})});data=await response.json();if(!response.ok)throw Error(data.error||'审批记录失败');}
      decision=next==='revoke'?'':next;
      const label=decision?titles[decision]:'待人工审批';
      const level=$('#workorderCard .level');if(level)level.textContent=label;
      records.push(data.decidedAt+' · '+(next==='revoke'?'撤销当前决定，恢复待审批':label));renderAudit();
      feedback.style.background=next==='reject'?'#fee2e2':next==='reflight'?'#fef3c7':'#eaf3ff';
      feedback.replaceChildren(text('strong',label),text('p','系统仅记录模拟决定，未执行真实派遣。'),text('p','审批意见：'+(data.note||'未填写'),'note'));
      if(decision){const undo=text('button','撤销当前决定，重新审批','secondary');undo.type='button';undo.id='undoDisposition';undo.onclick=()=>approval('revoke');feedback.append(undo);}
      $('#status').textContent='当前工单：'+label+'。';
      // 同步工单卡片中旧的静态“待审批”说明。
      $('#workorderCard').querySelectorAll('p').forEach(p=>{if(p.textContent.startsWith('审批状态：'))p.textContent='审批状态：'+label+'；系统未执行真实派遣。';});
      displayAssessment();
    }catch(error){feedback.textContent='审批未完成：'+error.message;}finally{busy=false;sync();}
  };
  $('#approveSim').onclick=()=>approval('approve');$('#rejectSim').onclick=()=>approval('reject');$('#reflightSim').onclick=()=>approval('reflight');
  for(const [id,label] of [['reviewText','复核意见'],['finalNote','审批意见']]){
    const field=$('#'+id);const fieldLabel=text('label',label,'label');fieldLabel.htmlFor=id;field.before(fieldLabel);
  }
  // 标准键盘操作不触发审批，只切换同一工单的显示面板。
  for(const [index,id] of ['reviewTab','orderTab'].entries())$('#'+id).addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const target=event.key==='Home'?0:event.key==='End'?1:1-index;
    selectTab(target?'order':'review');$('#'+(target?'orderTab':'reviewTab')).focus();
  });
  // 重新研判后旧会话不能继续审批；初始阶段没有可用复核操作。
  reset();
})();
