const vehicleCharts=[];
const storageCharts=[];
const MONTHS=['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
const CHART_THEME={surface:'#ffffff',text:'#132c35',muted:'#70828a',line:'#dbe4e7',split:'#e7edef',inactive:'#b7c4c8',accent:'#187985',orange:'#e58d56',violet:'#725ee9',green:'#2b9a75',zoomFill:'rgba(24,121,133,.12)'};
const HISTORY_COLORS=['#d8e1e2','#c7d4d6','#b5c6c9','#a2b8bb','#8da9ad','#73999e','#56868c','#36777e'];
const BRAND_COLORS={'宁德时代':'#187985','比亚迪':'#e58d56','LG化学':'#725ee9','松下':'#2b9a75','三星SDI':'#cf6578','SKI':'#4386b7','国轩高科':'#b88d3d','中航锂电':'#728b58','远景':'#4b9ba2','蜂巢能源':'#a66aae','亿纬锂能':'#d27652','欣旺达':'#639878','PEVE':'#8d7aa5','其他':'#cbd6d9'};
const KPI_CODES={'国内新能源乘用车零售':'EV','国内新能源商用车':'CV','欧洲新能源车':'EU','全球动力电池装机':'BT','新增运行功率':'GW','新增运行容量':'ES'};
const baseTip={trigger:'axis',confine:true,backgroundColor:CHART_THEME.surface,borderColor:CHART_THEME.line,borderWidth:1,padding:10,shadowBlur:24,shadowColor:'rgba(19,44,53,.12)',textStyle:{color:CHART_THEME.text}};
const axisLine={lineStyle:{color:CHART_THEME.line}};
const axisText={color:CHART_THEME.muted};
const splitLine={lineStyle:{color:CHART_THEME.split}};

function makeChart(id,option,bucket){
  const element=document.getElementById(id);
  if(!element)return null;
  const chart=echarts.init(element);
  chart.setOption(option);
  bucket.push(chart);
  return chart;
}

function changeText(value){
  if(value==null)return '<span class="chg-value muted">—</span>';
  const cls=value>=0?'up':'down';
  return `<span class="chg-value ${cls}">${value>=0?'↗':'↘'} ${Math.abs(value).toFixed(1)}%</span>`;
}

function kpi(label,period,value,unit,yoy,ytd){
  const code=KPI_CODES[label]||'DT';
  return `<article class="kpi"><div class="kpi-top"><span class="kpi-icon">${code}</span><span class="kpi-period">${period}</span></div><div class="label">${label}</div><div class="val">${value}<span class="unit">${unit}</span></div><div class="chg"><span>当月同比 ${changeText(yoy)}</span>${ytd==null?'':`<span>累计同比 ${changeText(ytd)}</span>`}</div></article>`;
}

function formatTime(value){
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'—':date.toLocaleString('zh-CN',{hour12:false});
}

function renderSourceStatus(){
  const meta=typeof DASHBOARD_META==='object'?DASHBOARD_META:{};
  const catalog=meta.sourceCatalog||{};
  const statuses=meta.sources||{};
  const names=Object.keys(catalog);
  const ready=names.filter(name=>statuses[name]&&statuses[name].latestPeriod).length;
  document.getElementById('source-ready-count').textContent=ready;
  document.getElementById('source-total-count').textContent=names.length;
  document.getElementById('data-status-text').textContent=`${ready}/${names.length} 个公开源正常 · 生成于 ${formatTime(meta.generatedAt)}`;
  document.getElementById('source-list').innerHTML=names.map(name=>{
    const source=catalog[name]||{};
    const status=statuses[name]||{};
    return `<div class="source-item"><span class="source-name">${source.label||name}</span><span class="source-detail">最新数据期：${status.latestPeriod||'尚未成功'}<br>最近成功：${formatTime(status.lastSuccessAt)}</span></div>`;
  }).join('');
}

function seasonalOptions(rows,field,unit){
  const years=[...new Set(rows.map(row=>row.year))].sort();
  const latest=years[years.length-1];
  const series=years.map((year,index)=>{
    const values=new Array(12).fill(null);
    rows.filter(row=>row.year===year).forEach(row=>{values[row.month-1]=row[field]??null;});
    const hot=year===latest;
    const color=hot?CHART_THEME.accent:HISTORY_COLORS[index%HISTORY_COLORS.length];
    return {name:year+'年',type:'line',data:values,connectNulls:false,symbol:'circle',symbolSize:hot?6:4,lineStyle:{width:hot?3.2:1.8,color},itemStyle:{color},emphasis:{focus:'series'},z:hot?10:1};
  });
  return {tooltip:{...baseTip,valueFormatter:value=>value==null?'—':Number(value).toFixed(1)+unit},legend:{top:0,right:0,type:'scroll',textStyle:axisText,inactiveColor:CHART_THEME.inactive,itemWidth:16,itemHeight:9},grid:{left:52,right:18,top:38,bottom:30},xAxis:{type:'category',data:MONTHS,boundaryGap:false,axisLine,axisLabel:axisText},yAxis:{type:'value',scale:true,splitLine,axisLabel:axisText},series};
}

function cumulativeYoy(rows,field){
  const byYear={};
  rows.forEach(row=>{if(row[field]!=null)(byYear[row.year]||(byYear[row.year]={}))[row.month]=row[field];});
  const result={};
  rows.forEach(row=>{
    const current=byYear[row.year];
    const previous=byYear[row.year-1];
    if(!current||!previous){result[row.ym]=null;return;}
    let currentSum=0,previousSum=0;
    for(let month=1;month<=row.month;month++){if(current[month]!=null)currentSum+=current[month];if(previous[month]!=null)previousSum+=previous[month];}
    result[row.ym]=previousSum?((currentSum/previousSum-1)*100):null;
  });
  return result;
}

function seasonalWithGrowth(rows,field,unit,yoyField,ytdField){
  const option=seasonalOptions(rows,field,unit);
  const byPeriod=Object.fromEntries(rows.map(row=>[row.ym,row]));
  const derivedYtd=cumulativeYoy(rows,field);
  option.tooltip={...baseTip,formatter:params=>{
    if(!params.length)return '';
    const month=params[0].dataIndex+1;
    let output=params[0].axisValue+'<br>';
    params.forEach(param=>{
      const year=Number.parseInt(param.seriesName,10);
      const row=byPeriod[`${year}-${String(month).padStart(2,'0')}`];
      const previous=byPeriod[`${year-1}-${String(month).padStart(2,'0')}`];
      const value=row?row[field]:null;
      const yoy=yoyField&&row&&row[yoyField]!=null?row[yoyField]:(value!=null&&previous&&previous[field]?((value/previous[field]-1)*100):null);
      const ytd=ytdField&&row&&row[ytdField]!=null?row[ytdField]:(row?derivedYtd[row.ym]:null);
      output+=`${param.marker}${param.seriesName}：${value==null?'—':Number(value).toFixed(1)+unit}`;
      if(previous)output+=`　<span style="color:${CHART_THEME.muted}">同比 ${yoy==null?'—':(yoy>=0?'+':'')+yoy.toFixed(1)+'%'} · 累计 ${ytd==null?'—':(ytd>=0?'+':'')+ytd.toFixed(1)+'%'}</span>`;
      output+='<br>';
    });
    return output;
  }};
  return option;
}

function latestRow(rows,field){
  for(let index=rows.length-1;index>=0;index--)if(rows[index][field]!=null)return rows[index];
  return null;
}

function renderVehicle(){
  DATA.forEach(row=>{row.cvPen=row.cvTotal>0&&row.nevCv!=null?+(row.nevCv/row.cvTotal*100).toFixed(2):null;});
  const cvYtd=cumulativeYoy(DATA,'nevCv');
  DATA.forEach(row=>{row.cvYtd=cvYtd[row.ym];});

  makeChart('pv-retail',seasonalWithGrowth(DATA,'nevPv','万辆','nevPvYoY','nevPvYtd'),vehicleCharts);
  makeChart('pv-retail-pen',seasonalOptions(DATA,'nevPvPen','%'),vehicleCharts);
  makeChart('pv-wholesale',seasonalWithGrowth(DATA,'nevWhole','万辆'),vehicleCharts);
  makeChart('pv-wholesale-pen',seasonalOptions(DATA,'nevWholePen','%'),vehicleCharts);
  makeChart('cv-sales',seasonalWithGrowth(DATA,'nevCv','万辆','nevCvYoY','cvYtd'),vehicleCharts);
  makeChart('cv-pen',seasonalOptions(DATA,'cvPen','%'),vehicleCharts);

  const periods=EUROPE.months;
  const bevPen=EUROPE.bev.map((value,index)=>value!=null&&EUROPE.total[index]?+(value/EUROPE.total[index]*100).toFixed(1):null);
  makeChart('eu-structure',{tooltip:{...baseTip,formatter:params=>{let output=params[0].axisValue+'<br>';params.forEach(param=>{const unit=param.seriesName==='BEV渗透率'?'%':'万辆';output+=`${param.marker}${param.seriesName}：${param.value==null?'—':Number(param.value).toFixed(1)+unit}<br>`;});return output;}},legend:{top:0,left:'center',textStyle:axisText,inactiveColor:CHART_THEME.inactive},grid:{left:52,right:56,top:48,bottom:54},xAxis:{type:'category',data:periods,axisLine,axisLabel:{...axisText,hideOverlap:true}},yAxis:[{type:'value',name:'万辆',scale:true,splitLine,axisLabel:axisText,nameTextStyle:axisText},{type:'value',name:'%',position:'right',splitLine:{show:false},axisLabel:{...axisText,formatter:'{value}%'},nameTextStyle:axisText}],dataZoom:[{type:'inside'},{type:'slider',height:16,bottom:8,borderColor:CHART_THEME.line,fillerColor:CHART_THEME.zoomFill}],series:[{name:'BEV',type:'bar',stack:'eu',data:EUROPE.bev,itemStyle:{color:CHART_THEME.accent,borderRadius:[3,3,0,0]}},{name:'PHEV',type:'bar',stack:'eu',data:EUROPE.phev,itemStyle:{color:CHART_THEME.violet,borderRadius:[3,3,0,0]}},{name:'BEV渗透率',type:'line',yAxisIndex:1,smooth:true,showSymbol:false,data:bevPen,lineStyle:{width:2.4,color:CHART_THEME.orange}}]},vehicleCharts);

  const europeRows=periods.map((period,index)=>({ym:period,year:Number(period.slice(0,4)),month:Number(period.slice(5,7)),value:EUROPE.total[index],yoy:EUROPE.yoy[index],ytd:EUROPE.ytd[index]}));
  makeChart('eu-sales',seasonalWithGrowth(europeRows,'value','万辆','yoy','ytd'),vehicleCharts);

  const sne=P1.sne;
  const sneRows=sne.months.map((period,index)=>({ym:period,year:Number(period.slice(0,4)),month:Number(period.slice(5,7)),value:sne.total[index]}));
  makeChart('sne-total',seasonalWithGrowth(sneRows,'value',' GWh'),vehicleCharts);
  const lastIndex=sne.months.length-1;
  const brands=sne.brands.slice().sort((a,b)=>{if(a==='其他')return 1;if(b==='其他')return -1;return (sne.shares[b][lastIndex]||0)-(sne.shares[a][lastIndex]||0);});
  makeChart('sne-share',{tooltip:{...baseTip,formatter:params=>{let output=params[0].axisValue+'<br>';params.filter(param=>param.value!=null).sort((a,b)=>b.value-a.value).forEach(param=>{output+=`${param.marker}${param.seriesName}：${Number(param.value).toFixed(1)}%<br>`;});return output;}},legend:{top:0,left:'center',type:'scroll',textStyle:{...axisText,fontSize:10},inactiveColor:CHART_THEME.inactive,itemWidth:13,itemHeight:8},grid:{left:44,right:14,top:42,bottom:52},xAxis:{type:'category',data:sne.months,axisLine,axisLabel:{...axisText,hideOverlap:true,showMaxLabel:true}},yAxis:{type:'value',scale:true,axisLabel:{...axisText,formatter:'{value}%'},splitLine},dataZoom:[{type:'inside',startValue:'2023-01'},{type:'slider',height:14,bottom:6,startValue:'2023-01',borderColor:CHART_THEME.line,fillerColor:CHART_THEME.zoomFill}],series:brands.map(brand=>{const color=BRAND_COLORS[brand]||CHART_THEME.muted;return {name:brand,type:'line',smooth:true,symbol:'none',connectNulls:true,data:sne.shares[brand].map(value=>value==null?null:+(value*100).toFixed(2)),lineStyle:{width:1.8,color},itemStyle:{color},emphasis:{focus:'series'}};})},vehicleCharts);

  document.getElementById('vehicle-range').textContent=`${DATA[0].ym} ~ ${DATA[DATA.length-1].ym}`;
  const pv=latestRow(DATA,'nevPv');
  const cv=latestRow(DATA,'nevCv');
  const euIndex=EUROPE.total.map(value=>value!=null).lastIndexOf(true);
  const sneIndex=sne.total.map(value=>value!=null).lastIndexOf(true);
  const sneYoy=sneIndex>=12&&sne.total[sneIndex-12]?((sne.total[sneIndex]/sne.total[sneIndex-12]-1)*100):null;
  const sneYtd=cumulativeYoy(sneRows,'value')[sneRows[sneIndex].ym];
  document.getElementById('vehicle-kpis').innerHTML=[
    kpi('国内新能源乘用车零售',pv.ym,pv.nevPv.toFixed(1),'万辆',pv.nevPvYoY,pv.nevPvYtd),
    kpi('国内新能源商用车',cv.ym,cv.nevCv.toFixed(1),'万辆',cv.nevCvYoY,cv.cvYtd),
    kpi('欧洲新能源车',EUROPE.months[euIndex],EUROPE.total[euIndex].toFixed(1),'万辆',EUROPE.yoy[euIndex],EUROPE.ytd[euIndex]),
    kpi('全球动力电池装机',sne.months[sneIndex],sne.total[sneIndex].toFixed(1),'GWh',sneYoy,sneYtd)
  ].join('');

  const columns=[['ym','月份',0],['nevPv','乘用车零售(万辆)',1],['nevPvPen','零售渗透率(%)',1],['nevWhole','乘用车批发(万辆)',1],['nevWholePen','批发渗透率(%)',1],['nevCv','新能源商用车(万辆)',1],['cvPen','商用车渗透率(%)',1]];
  const head='<thead><tr>'+columns.map(column=>`<th>${column[1]}</th>`).join('')+'</tr></thead>';
  const body='<tbody>'+DATA.slice().reverse().map(row=>'<tr>'+columns.map(column=>`<td>${column[0]==='ym'?row.ym:(row[column[0]]==null?'—':Number(row[column[0]]).toFixed(column[2]))}</td>`).join('')+'</tr>').join('')+'</tbody>';
  document.getElementById('domestic-table').innerHTML=head+body;
  document.getElementById('domestic-row-count').textContent=DATA.length;
}

function lastPeriod(byYear){
  const years=Object.keys(byYear).sort();
  for(let yi=years.length-1;yi>=0;yi--){for(let month=11;month>=0;month--)if(byYear[years[yi]][month]!=null)return {year:years[yi],month:month+1,value:byYear[years[yi]][month]};}
  return null;
}

function storageYoy(byYear,point){
  const previous=byYear[String(Number(point.year)-1)];
  const value=previous&&previous[point.month-1];
  return value?((point.value/value-1)*100):null;
}

function storageYtd(byYear,point){
  const current=byYear[point.year]||[];
  const previous=byYear[String(Number(point.year)-1)]||[];
  let currentSum=0,previousSum=0;
  for(let index=0;index<point.month;index++){if(current[index]!=null)currentSum+=current[index];if(previous[index]!=null)previousSum+=previous[index];}
  return previousSum?((currentSum/previousSum-1)*100):null;
}

function renderStorage(){
  function converted(source){const output={};Object.keys(source).forEach(year=>{output[year]=source[year].map(value=>value==null?null:+(value/1000).toFixed(3));});return output;}
  function chartOptions(byYear,unit){
    const years=Object.keys(byYear).sort();
    const latest=years[years.length-1];
    return {tooltip:{...baseTip,valueFormatter:value=>value==null?'—':Number(value).toFixed(2)+unit},legend:{top:0,right:0,type:'scroll',textStyle:axisText,inactiveColor:CHART_THEME.inactive,itemWidth:16,itemHeight:9},grid:{left:56,right:18,top:38,bottom:30},xAxis:{type:'category',data:MONTHS,boundaryGap:false,axisLine,axisLabel:axisText},yAxis:{type:'value',scale:true,splitLine,axisLabel:axisText},series:years.map((year,index)=>{const hot=year===latest;const color=hot?CHART_THEME.accent:HISTORY_COLORS[index%HISTORY_COLORS.length];return {name:year+'年',type:'line',data:byYear[year],connectNulls:false,symbol:'circle',symbolSize:hot?6:4,lineStyle:{width:hot?3.2:1.8,color},itemStyle:{color},emphasis:{focus:'series'},z:hot?10:1};})};
  }
  const power=converted(P2.usPower);
  const energy=converted(P2.usEnergy);
  makeChart('us-power',chartOptions(power,' GW'),storageCharts);
  makeChart('us-energy',chartOptions(energy,' GWh'),storageCharts);

  const powerPoint=lastPeriod(power);
  const energyPoint=lastPeriod(energy);
  document.getElementById('storage-range').textContent=`${Object.keys(power).sort()[0]}-01 ~ ${powerPoint.year}-${String(powerPoint.month).padStart(2,'0')}`;
  document.getElementById('storage-kpis').innerHTML=[
    kpi('新增运行功率',`${powerPoint.year}-${String(powerPoint.month).padStart(2,'0')}`,powerPoint.value.toFixed(2),'GW',storageYoy(power,powerPoint),storageYtd(power,powerPoint)),
    kpi('新增运行容量',`${energyPoint.year}-${String(energyPoint.month).padStart(2,'0')}`,energyPoint.value.toFixed(2),'GWh',storageYoy(energy,energyPoint),storageYtd(energy,energyPoint))
  ].join('');

  const sum=values=>{let total=0,found=false;values.forEach(value=>{if(value!=null){total+=value;found=true;}});return found?total:null;};
  const years=Object.keys(power).sort().reverse();
  const head='<thead><tr><th>年份</th><th>新增功率(GW)</th><th>新增容量(GWh)</th></tr></thead>';
  const body='<tbody>'+years.map(year=>{const last=lastPeriod({[year]:power[year]});const label=last&&last.month<12?`${year}年1-${last.month}月`:year;const p=sum(power[year]);const e=sum(energy[year]);return `<tr><td>${label}</td><td>${p==null?'—':p.toFixed(2)}</td><td>${e==null?'—':e.toFixed(2)}</td></tr>`;}).join('')+'</tbody>';
  document.getElementById('us-storage-table').innerHTML=head+body;
}

function showTab(name){
  document.querySelectorAll('.tabpane').forEach(panel=>panel.classList.toggle('active',panel.id==='tab-'+name));
  document.querySelectorAll('.tab').forEach(button=>{const active=button.dataset.tab===name;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));});
  document.querySelectorAll('[data-nav-tab]').forEach(button=>button.classList.toggle('active',button.dataset.navTab===name));
  if(name==='storage'&&!storageRendered){renderStorage();storageRendered=true;}
  const charts=name==='storage'?storageCharts:vehicleCharts;
  setTimeout(()=>charts.forEach(chart=>chart.resize()),0);
}

const sourceButton=document.getElementById('source-btn');
const sourceBox=document.getElementById('source-box');
const sourceOverlay=document.getElementById('source-overlay');
const sourceClose=document.getElementById('source-close');
function setSourceOpen(open){
  sourceBox.style.display=open?'block':'none';
  sourceOverlay.style.display=open?'block':'none';
  sourceButton.setAttribute('aria-expanded',String(open));
  document.body.classList.toggle('modal-open',open);
  if(open)setTimeout(()=>sourceBox.focus(),0);
  else if(sourceBox.contains(document.activeElement))sourceButton.focus();
}
sourceButton.addEventListener('click',()=>setSourceOpen(sourceBox.style.display!=='block'));
sourceOverlay.addEventListener('click',()=>setSourceOpen(false));
sourceClose.addEventListener('click',()=>setSourceOpen(false));
document.addEventListener('keydown',event=>{if(event.key==='Escape')setSourceOpen(false);});
document.querySelectorAll('.tab').forEach(button=>button.addEventListener('click',()=>showTab(button.dataset.tab)));
document.querySelectorAll('[data-nav-tab]').forEach(button=>button.addEventListener('click',()=>{showTab(button.dataset.navTab);document.getElementById('dashboard-tabs').scrollIntoView({behavior:'smooth',block:'start'});}));
window.addEventListener('resize',()=>vehicleCharts.concat(storageCharts).forEach(chart=>chart.resize()));

renderSourceStatus();
renderVehicle();
let storageRendered=false;
