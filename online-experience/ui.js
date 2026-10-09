/* 展示层渐进增强。保留既有元素、事件处理器和后端请求。 */
(() => {
  const $ = selector => document.querySelector(selector);
  const taskCard = $('.grid > .card:first-child');
  const analysisCard = $('.grid > .card:nth-child(2)');
  const preview = $('#inspectionPreview');
  if (!taskCard || !analysisCard || !preview) return;

  $('.brand').insertAdjacentHTML('afterbegin', '<span class="brand-mark" aria-hidden="true"><span></span></span>');
  $('.brand').insertAdjacentHTML('beforeend', '<span class="brand-subtitle">洪涝巡检 · 辅助决策</span>');
  const hero = $('.hero');
  const heroText = document.createElement('div');
  while (hero.firstChild) heroText.append(hero.firstChild);
  heroText.insertAdjacentHTML('afterbegin', '<div class="workspace-eyebrow">INSPECTION WORKSPACE / 巡检工作台</div>');
  hero.append(heroText);
  const mode = document.createElement('span');
  mode.className = 'workspace-mode';
  mode.textContent = '人工复核 · 模拟处置';
  hero.append(mode);
  $('.hero h1').textContent = '洪涝灾害巡检工作台';
  heroText.querySelector('p').textContent='影像识别 / 风险研判 / 人工复核 / 模拟工单';
  const brandLine=document.createElement('p');
  brandLine.className='brand-line';brandLine.textContent='看见现场，让每一次研判有据可循。';
  heroText.insertBefore(brandLine,heroText.querySelector('p'));
  hero.querySelector('.workspace-eyebrow').textContent='汛巡智眼 / FLOOD INSPECTION';
  mode.innerHTML='<span class="mode-dot" aria-hidden="true"></span><div>人机协同研判<small>人工复核 · 模拟处置</small></div>';
  taskCard.insertAdjacentHTML('afterbegin', '<div class="panel-kicker">MISSION / 任务配置</div>');

  // 将影像移至主工作区，保留原节点，因此素材切换、上传预览仍然有效。
  const imageLabel = preview.previousElementSibling;
  if (imageLabel?.classList.contains('label')) imageLabel.remove();
  const workspace = document.createElement('section');
  workspace.className = 'image-workspace';
  workspace.setAttribute('aria-label', '巡检影像工作区');
  workspace.innerHTML = '<div class="image-toolbar"><div><span class="section-index">01 / VISUAL EVIDENCE</span><h2>巡检影像</h2><p>现场证据 · 完整画幅</p></div><button type="button" class="secondary" id="expandImage">放大影像 ↗</button></div><div class="image-stage"><div class="image-failure" role="status">影像暂未加载<br>请选择左侧测试素材，或上传巡检图片</div></div><div class="image-caption"><span id="imageSourceCaption"></span><span>原图比例 · 完整显示</span></div><div class="image-principle"><span class="principle-dot" aria-hidden="true"></span>判断依据来自当前影像，风险需人工核验</div>';
  workspace.querySelector('.image-stage').prepend(preview);
  analysisCard.prepend(workspace);
  const stage = workspace.querySelector('.image-stage');
  const caption = $('#imageSourceCaption');
  const picker = $('#localSourcePicker');
  const file = $('#uploadFile');
  const sourceCaption = () => {
    if (preview.src.startsWith('blob:') && file.files?.[0]) {
      caption.textContent = '本机图片 / ' + file.files[0].name;
    } else {
      caption.textContent = '当前素材 / ' + (picker.selectedOptions[0]?.textContent || '巡检影像');
    }
  };
  preview.addEventListener('load', () => { stage.classList.remove('image-unavailable'); sourceCaption(); });
  preview.addEventListener('error', () => stage.classList.add('image-unavailable'));
  if (preview.complete && !preview.naturalWidth) stage.classList.add('image-unavailable');
  sourceCaption();
  picker.addEventListener('change', sourceCaption);

  // 将技术说明和图片直链折叠，常用输入仍然直接可见。
  const details = document.createElement('details');
  details.className = 'source-details';
  details.innerHTML = '<summary>图片链接与接入说明</summary>';
  const url = $('#url');
  const urlLabel = url.previousElementSibling;
  details.append(urlLabel, url, $('#localSourceHint'), $('#uploadHint'));
  const run = $('#run');
  run.insertAdjacentHTML('beforeend','<span class="run-arrow" aria-hidden="true">↗</span>');
  taskCard.insertBefore(details, run.nextElementSibling.nextElementSibling);
  const sourceSwitch=document.createElement('div');sourceSwitch.className='source-switch';
  sourceSwitch.innerHTML='<div class="source-tabs" role="tablist" aria-label="巡检影像来源"><button type="button" id="sampleSourceTab" role="tab" aria-selected="true" aria-controls="sampleSourcePane">样例影像</button><button type="button" id="uploadSourceTab" role="tab" aria-selected="false" aria-controls="uploadSourcePane">上传图片</button></div><div id="sampleSourcePane" role="tabpanel" aria-labelledby="sampleSourceTab"></div><div id="uploadSourcePane" role="tabpanel" aria-labelledby="uploadSourceTab" hidden></div>';
  const sampleLabel=picker.previousElementSibling;
  sampleLabel.before(sourceSwitch);
  $('#sampleSourcePane').append(sampleLabel,picker);
  $('#uploadSourcePane').append(file.previousElementSibling,file,$('#uploadBtn'));
  const selectSource=name=>{
    for(const key of ['sample','upload']){$('#'+key+'SourcePane').hidden=name!==key;$('#'+key+'SourceTab').setAttribute('aria-selected',String(name===key));}
  };
  $('#sampleSourceTab').onclick=()=>selectSource('sample');$('#uploadSourceTab').onclick=()=>selectSource('upload');
  for(const [index,key] of ['sample','upload'].entries())$('#'+key+'SourceTab').addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?1:1-index;
    const target=next?'upload':'sample';selectSource(target);$('#'+target+'SourceTab').focus();
  });
  // 原有在线体验脚本使用 run.nextElementSibling，故保留该提示节点位置。
  $('#status').setAttribute('role', 'status');
  $('#status').setAttribute('aria-live', 'polite');
  $('.steps').setAttribute('aria-label', '巡检处置流程');
  analysisCard.querySelector(':scope > h2').textContent = '研判与处置流程';
  const execution=document.createElement('section');execution.className='execution-panel';execution.setAttribute('aria-label','执行进度');
  execution.append(analysisCard.querySelector(':scope > h2'),$('.steps'),$('#status'));
  analysisCard.prepend(execution);
  analysisCard.classList.add('analysis-workspace');
  // 补齐现有表单的标签关联。
  let labelIndex = 0;
  document.querySelectorAll('label.label').forEach(label => {
    const control = label.nextElementSibling;
    if (!control?.matches('input,select,textarea')) return;
    if (!control.id) control.id = 'workspace-field-' + (++labelIndex);
    label.htmlFor = control.id;
  });

  const dialog = document.createElement('dialog');
  dialog.className = 'image-dialog';
  dialog.setAttribute('aria-labelledby', 'imageDialogTitle');
  dialog.innerHTML = '<div class="dialog-toolbar"><strong id="imageDialogTitle">巡检影像 · 原图查看</strong><button type="button" class="secondary">关闭</button></div><img alt="放大的巡检影像">';
  document.body.append(dialog);
  $('#expandImage').addEventListener('click', () => {
    dialog.querySelector('img').src = preview.src;
    dialog.showModal();
  });
  dialog.querySelector('button').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });

  // 面板高于窗口时，先让它自然滚动到底部，再停留；短面板停在顶部。
  // 两栏共用 grid 的边界，因此页面顶部与底部保持自然对齐。
  const panels = [taskCard, analysisCard];
  const updateStickyOffsets = () => {
    const containerBottom=document.querySelector('main.grid').getBoundingClientRect().bottom;
    panels.forEach(panel => {
      const height=panel.getBoundingClientRect().height;
      const base=Math.min(20, window.innerHeight-height-20);
      // 短栏小于窗口时，单纯 top:20px 无法在页尾对齐底边。
      // 临近容器末端才逐渐下移；中段仍保持顶部停留。
      const travel=Math.max(0,window.innerHeight-height-40);
      const ending=Math.min(travel,Math.max(0,window.innerHeight+travel-containerBottom));
      const top=base+ending;
      const value=top+'px';
      if(panel.style.getPropertyValue('--panel-sticky-top')!==value)panel.style.setProperty('--panel-sticky-top',value);
    });
  };
  const panelResizeObserver = new ResizeObserver(updateStickyOffsets);
  panels.forEach(panel => panelResizeObserver.observe(panel));
  window.addEventListener('resize', updateStickyOffsets);
  let scrollFrame=0;
  window.addEventListener('scroll',()=>{
    if(scrollFrame)return;
    scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;updateStickyOffsets();});
  },{passive:true});
  updateStickyOffsets();
})();
