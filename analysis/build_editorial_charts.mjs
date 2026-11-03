import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const input = path.join(project, "data", "processed", "upi_monthly_enriched.csv");
const output = path.join(project, "outputs");
const lines = fs.readFileSync(input, "utf8").trim().split(/\r?\n/);
const headers = lines.shift().split(",");
const data = lines.map(line => Object.fromEntries(line.split(",").map((v, i) => [headers[i], i === 0 ? v : Number(v)])));
fs.mkdirSync(output, { recursive: true });

const W=1600,H=1000, plot={x:130,y:270,w:1310,h:500};
const C={paper:"#F7F5EF",ink:"#171717",muted:"#68655F",line:"#D8D5CD",blue:"#4056D6",navy:"#25358F",orange:"#D66A3A",green:"#477A62",white:"#FFFFFF"};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]));
const x=i=>plot.x+i*plot.w/(data.length-1);
const yScale=(v,min,max)=>plot.y+plot.h-(v-min)/(max-min)*plot.h;
const linePath=(key,min,max)=>data.map((d,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${yScale(d[key],min,max).toFixed(1)}`).join(" ");
const point=(row,key,min,max)=>({x:x(data.indexOf(row)),y:yScale(row[key],min,max)});
const fmt=(v,d=1)=>v.toLocaleString("en-IN",{minimumFractionDigits:d,maximumFractionDigits:d});
const yearTicks=()=>data.map((d,i)=>({d,i})).filter(({d})=>d.month.endsWith("-01") || d.month===data[0].month || d.month===data.at(-1).month);

function base(title,subtitle,yLabel,yTicks,min,max,body,notes){
  const grids=yTicks.map(v=>{const yy=yScale(v,min,max);return `<line x1="${plot.x}" y1="${yy}" x2="${plot.x+plot.w}" y2="${yy}" class="grid"/><text x="${plot.x-24}" y="${yy+7}" text-anchor="end" class="axis">${esc(typeof v==='object'?v.label:v)}</text>`}).join("");
  const xt=yearTicks().map(({d,i})=>`<line x1="${x(i)}" y1="${plot.y+plot.h}" x2="${x(i)}" y2="${plot.y+plot.h+8}" class="tick"/><text x="${x(i)}" y="${plot.y+plot.h+38}" text-anchor="middle" class="axis">${d.month.slice(0,4)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${C.paper}"/>
  <style>@font-face{font-family:Inter;src:local('Inter')}text{font-family:Inter,Arial,sans-serif;fill:${C.ink}}.title{font-size:58px;font-weight:650;letter-spacing:-1.8px}.sub{font-size:24px;fill:${C.muted}}.eyebrow{font-size:16px;font-weight:700;letter-spacing:2.5px;fill:${C.blue}}.axis{font-size:17px;fill:${C.muted}}.ylabel{font-size:17px;font-weight:650;fill:${C.muted}}.grid{stroke:${C.line};stroke-width:1}.tick{stroke:${C.muted};stroke-width:1}.note{font-size:18px;fill:${C.muted}}.noteStrong{font-size:20px;font-weight:700}.source{font-size:15px;fill:${C.muted}}.series{fill:none;stroke-linecap:round;stroke-linejoin:round}.halo{paint-order:stroke;stroke:${C.paper};stroke-width:9px;stroke-linejoin:round}</style>
  <text x="${plot.x}" y="86" class="eyebrow">UPI MONTHLY SERIES · NPCI</text>
  <text x="${plot.x}" y="154" class="title">${esc(title)}</text>
  <text x="${plot.x}" y="204" class="sub">${esc(subtitle)}</text>
  <text x="${plot.x}" y="246" class="ylabel">${esc(yLabel)}</text>
  ${grids}${xt}${body}
  <line x1="${plot.x}" y1="865" x2="${plot.x+plot.w}" y2="865" class="grid"/>
  <text x="${plot.x}" y="902" class="source">Source: National Payments Corporation of India (NPCI), UPI Product Statistics · Covered period: Apr 2020–Oct 2026</text>
  <text x="${plot.x}" y="936" class="source">${esc(notes)}</text>
  </svg>`;
}

const first=data[0],last=data.at(-1),oct25=data.find(d=>d.month==="2025-10"),low=data.reduce((a,b)=>b.avg_transaction_value_inr<a.avg_transaction_value_inr?b:a);

// 1. Average payment value: the main finding
{
  const min=1100,max=2100,ticks=[1200,1400,1600,1800,2000];
  const p0=point(first,"avg_transaction_value_inr",min,max),pl=point(low,"avg_transaction_value_inr",min,max),p1=point(last,"avg_transaction_value_inr",min,max);
  const difference=last.avg_transaction_value_inr-first.avg_transaction_value_inr,pctChange=(last.avg_transaction_value_inr/first.avg_transaction_value_inr-1)*100;
  const body=`<path d="${linePath("avg_transaction_value_inr",min,max)}" class="series" stroke="${C.green}" stroke-width="6"/>
  <circle cx="${p0.x}" cy="${p0.y}" r="7" fill="${C.paper}" stroke="${C.green}" stroke-width="5"/><circle cx="${pl.x}" cy="${pl.y}" r="8" fill="${C.green}"/><circle cx="${p1.x}" cy="${p1.y}" r="8" fill="${C.green}"/>
  <text x="${p0.x+18}" y="${p0.y-20}" class="noteStrong halo">₹${fmt(first.avg_transaction_value_inr,0)}</text><text x="${p0.x+18}" y="${p0.y+10}" class="note halo">Apr 2020</text>
  <text x="${pl.x-22}" y="${pl.y-30}" text-anchor="end" class="note halo">Series low · ₹${fmt(low.avg_transaction_value_inr,0)} · ${low.month}</text>
  <text x="${p1.x-18}" y="${p1.y+42}" text-anchor="end" class="noteStrong halo">₹${fmt(last.avg_transaction_value_inr,0)}</text><text x="${p1.x-18}" y="${p1.y+71}" text-anchor="end" class="note halo">Oct 2026 · ₹${fmt(Math.abs(difference),0)} lower (${fmt(Math.abs(pctChange),1)}%)</text>`;
  fs.writeFileSync(path.join(output,"01_upi_average_payment_value.svg"),base("Average UPI payment value fell 18% from 2020","The nominal monthly average declined from ₹1,512 in April 2020 to ₹1,238 in October 2026.","Average payment value (INR)",ticks,min,max,body,"Definition: average payment value = value in INR crore × 10 / volume in millions. Monthly mean, not median; nominal INR."));
}

// 2. Indexed volume and value, one shared axis
{
  const min=0,max=2800,ticks=[0,500,1000,1500,2000,2500];
  const pv=point(last,"volume_index_100",min,max),px=point(last,"value_index_100",min,max);
  const body=`<path d="${linePath("volume_index_100",min,max)}" class="series" stroke="${C.blue}" stroke-width="6"/>
  <path d="${linePath("value_index_100",min,max)}" class="series" stroke="${C.orange}" stroke-width="6"/>
  <circle cx="${pv.x}" cy="${pv.y}" r="8" fill="${C.blue}"/><circle cx="${px.x}" cy="${px.y}" r="8" fill="${C.orange}"/>
  <text x="${pv.x-32}" y="${pv.y-23}" text-anchor="end" class="noteStrong halo" fill="${C.blue}">Volume · ${fmt(last.volume_index_100,1)}</text>
  <text x="${px.x-32}" y="${px.y+34}" text-anchor="end" class="noteStrong halo" fill="${C.orange}">Value · ${fmt(last.value_index_100,1)}</text>
  <text x="${plot.x+16}" y="${yScale(100,min,max)-18}" class="note halo">Both series = 100 in Apr 2020</text>`;
  fs.writeFileSync(path.join(output,"02_upi_volume_value_index.svg"),base("Count grew faster than value, lowering the average","Both series use April 2020 = 100 and the same vertical scale.","Index (Apr 2020 = 100)",ticks,min,max,body,"Definitions: volume and nominal INR value are each divided by their Apr 2020 level and multiplied by 100. Shared axis; no inflation adjustment."));
}

// 3. Same-month comparison to pressure-test seasonality
{
  const oct=data.filter(d=>d.month.endsWith("-10")),min=1100,max=2000,ticks=[1200,1400,1600,1800,2000];
  const pathOct=oct.map((d,i)=>`${i?'L':'M'}${x(data.indexOf(d)).toFixed(1)},${yScale(d.avg_transaction_value_inr,min,max).toFixed(1)}`).join(" ");
  const dots=oct.map(d=>{const xx=x(data.indexOf(d)),yy=yScale(d.avg_transaction_value_inr,min,max);return `<circle cx="${xx}" cy="${yy}" r="8" fill="${C.blue}"/><text x="${xx}" y="${yy-20}" text-anchor="middle" class="noteStrong halo">₹${fmt(d.avg_transaction_value_inr,0)}</text>`}).join("");
  const body=`<path d="${pathOct}" class="series" stroke="${C.blue}" stroke-width="6"/>${dots}`;
  fs.writeFileSync(path.join(output,"03_upi_october_average_payment.svg"),base("Every October since 2020 has been lower than the last","Same-calendar-month comparisons support a sustained decline, though festival timing can still move.","Average payment value (INR)",ticks,min,max,body,"Definition: October average = value in INR crore × 10 / volume in millions. Same-month comparison does not fully remove festival effects."));
}

console.log(JSON.stringify({charts:3,rows:data.length,period:[first.month,last.month],annotations:{latest_volume_billion:last.volume_billion,volume_index:last.volume_index_100,value_index:last.value_index_100,latest_average_inr:last.avg_transaction_value_inr,lowest_average_month:low.month,lowest_average_inr:low.avg_transaction_value_inr}},null,2));
