"use client";

import { useMemo, useState } from "react";

type EventStatus = "待复核" | "待人工确认" | "已确认" | "已驳回";

const routePoints = [
  { name: "应急指挥点", time: "09:00", x: "12%", y: "67%", kind: "base" },
  { name: "3 号桥", time: "09:08", x: "42%", y: "38%", kind: "high" },
  { name: "低洼村道", time: "09:15", x: "66%", y: "61%", kind: "medium" },
  { name: "河道弯道", time: "09:22", x: "83%", y: "28%", kind: "normal" },
];

const workflow = ["任务规划", "视觉识别", "风险研判", "人工复核", "救援工单"];

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [selected, setSelected] = useState<"bridge" | "road">("bridge");
  const [status, setStatus] = useState<Record<string, EventStatus>>({
    bridge: "待人工确认",
    road: "待复核",
  });
  const [workOrder, setWorkOrder] = useState(false);

  const preview = useMemo(() => files[0] ? URL.createObjectURL(files[0]) : "", [files]);
  const current = selected === "bridge"
    ? { id: "bridge", title: "桥涵疑似堵塞", level: "高风险", confidence: "91%", location: "3 号桥", color: "red", description: "桥孔可见漂浮物聚集，过水断面疑似受阻；上游水位持续上涨。", basis: "《桥涵汛期巡查要点》：发现桥孔漂浮物聚集、泄洪受阻时，应优先组织现场复核并实施警戒。" }
    : { id: "road", title: "村道积水", level: "中风险", confidence: "74%", location: "低洼村道", color: "amber", description: "路面积水已覆盖车行区域，暂未发现受困人员或车辆。", basis: "《道路积水处置规则》：积水影响通行时，应设置绕行提示，并持续复巡水位变化。" };

  const runMission = () => {
    setRunning(true);
    setFinished(false);
    setWorkOrder(false);
    window.setTimeout(() => { setRunning(false); setFinished(true); }, 1400);
  };

  const confirm = () => {
    setStatus((old) => ({ ...old, [current.id]: "已确认" }));
    if (current.id === "bridge") setWorkOrder(true);
  };

  return (
    <main>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">汛</span><div><strong>汛巡智眼</strong><small>Flood Response Command</small></div></div>
        <div className="mission-state"><i /> 演示场景：暴雨后乡镇巡检</div>
        <button className="quiet-button">指挥员 · 演示账号</button>
      </header>

      <section className="hero">
        <div><p className="eyebrow">AI AGENT · HUMAN IN THE LOOP</p><h1>把无人机“看见”的灾情<br /><em>转化为可执行的救援行动。</em></h1></div>
        <div className="hero-note"><b>本次任务</b><span>巡查 3 号桥、低洼村道和河道弯道</span><small>AI 提供证据与建议，人工确认后才可生成工单。</small></div>
      </section>

      <section className="grid-shell">
        <aside className="task-panel panel">
          <div className="section-title"><span>01</span><div><h2>创建巡检任务</h2><p>上传现场图片并启动总控 Agent</p></div></div>
          <label className="field-label">巡检区域</label><div className="select-like">东南大学模拟乡镇 · 防汛片区 <b>⌄</b></div>
          <label className="field-label">重点风险</label><div className="chip-row"><button className="chip active">桥涵堵塞</button><button className="chip">道路积水</button><button className="chip">人员受困</button></div>
          <label className="upload-box"><input type="file" accept="image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} /><span className="upload-icon">↥</span><b>{files.length ? `已选择 ${files.length} 张巡检图片` : "上传无人机巡检图片"}</b><small>支持 JPG、PNG；也可直接运行演示任务</small></label>
          <button className="primary-button" onClick={runMission} disabled={running}>{running ? "总控 Agent 正在研判…" : "启动巡检救援总控"}<span>→</span></button>
          <p className="demo-hint">当前为前端演示模式；接入平台后将调用 jfg0 总控工作流。</p>
        </aside>

        <section className="map-panel panel">
          <div className="map-heading"><div><p className="eyebrow">LIVE ROUTE</p><h2>模拟巡检路线</h2></div><span className="map-tag">预计 22 分钟</span></div>
          <div className="map-canvas">
            <div className="river river-a" /><div className="river river-b" /><div className="road road-a" /><div className="road road-b" />
            <svg className="route-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="12,67 42,38 66,61 83,28" /></svg>
            {routePoints.map((point, index) => <div className={`map-point ${point.kind}`} key={point.name} style={{ left: point.x, top: point.y }}><span>{index + 1}</span><div><b>{point.name}</b><small>{point.time}</small></div></div>)}
            <div className="north">N<br />↑</div><div className="map-legend"><span><i className="dot high" />高风险</span><span><i className="dot medium" />中风险</span><span><i className="route-dot" />巡检路线</span></div>
          </div>
          <div className="workflow-strip">{workflow.map((item, index) => <div className={finished || index === 0 ? "flow-item done" : "flow-item"} key={item}><span>{index + 1}</span><b>{item}</b>{index < workflow.length - 1 && <i>→</i>}</div>)}</div>
        </section>

        <aside className="status-panel panel">
          <div className="section-title"><span>02</span><div><h2>Agent 执行状态</h2><p>总控工作流 jfg0</p></div></div>
          {workflow.slice(0, 4).map((item, index) => <div className={`agent-row ${finished || index === 0 ? "ready" : ""}`} key={item}><span>{finished || index === 0 ? "✓" : index + 1}</span><div><b>{item}</b><small>{finished ? "已完成" : index === 0 ? "等待启动" : "等待任务"}</small></div></div>)}
          <div className="trace-card"><b>可追溯设计</b><p>原始图像、模型判断、知识库依据与人工操作均会留存。</p></div>
        </aside>
      </section>

      <section className="results">
        <div className="results-heading"><div><p className="eyebrow">EVIDENCE FIRST</p><h2>灾情事件与人工复核</h2></div><span className={finished ? "result-state ready" : "result-state"}>{finished ? "研判完成 · 2 个待处理事件" : "等待总控 Agent 输出"}</span></div>
        <div className="results-grid">
          <div className="event-list">
            <button className={`event-card ${selected === "bridge" ? "selected" : ""}`} onClick={() => setSelected("bridge")}><div className="event-photo bridge-photo">{preview ? <img src={preview} alt="上传的巡检图片" /> : <span>桥涵巡检影像</span>}<b>高</b></div><div><span className="event-status">{status.bridge}</span><h3>桥涵疑似堵塞</h3><p>3 号桥 · 置信度 91%</p></div><i>›</i></button>
            <button className={`event-card ${selected === "road" ? "selected" : ""}`} onClick={() => setSelected("road")}><div className="event-photo road-photo"><span>道路巡检影像</span><b>中</b></div><div><span className="event-status">{status.road}</span><h3>村道积水</h3><p>低洼村道 · 置信度 74%</p></div><i>›</i></button>
          </div>
          <article className="detail-card">
            <div className="detail-top"><span className={`risk-pill ${current.color}`}>{current.level}</span><span className="confidence">AI 置信度 {current.confidence}</span></div>
            <h2>{current.title}</h2><p className="location">◎ {current.location} · 2026-07-17 09:08</p>
            <div className="detail-block"><b>AI 识别结论</b><p>{current.description}</p></div>
            <div className="detail-block basis"><b>知识库依据</b><p>{current.basis}</p></div>
            <div className="actions"><button className="outline-button" onClick={() => setStatus((old) => ({ ...old, [current.id]: "已驳回" }))}>标记误判</button><button className="outline-button">请求复飞</button><button className="confirm-button" onClick={confirm}>确认风险并处置 →</button></div>
          </article>
          <aside className="order-card">
            <p className="eyebrow">RESCUE WORK ORDER</p><h3>{workOrder ? "救援工单已生成" : "等待人工确认"}</h3>
            <div className="order-id">{workOrder ? "WO-20260717-003" : "——"}</div>
            <dl><div><dt>处置建议</dt><dd>{workOrder ? "现场复核桥涵，布设警戒并清障" : "需先确认高风险事件"}</dd></div><div><dt>当前状态</dt><dd>{workOrder ? "待人工派发" : "未创建"}</dd></div></dl>
            <button className="report-button" disabled={!workOrder}>生成巡检报告 ↓</button>
          </aside>
        </div>
      </section>
    </main>
  );
}
