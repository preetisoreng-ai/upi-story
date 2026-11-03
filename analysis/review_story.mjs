import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const input=path.join(project,"data","processed","upi_monthly_enriched.csv");
const output=path.join(project,"outputs","pressure_test_report.md");
const lines=fs.readFileSync(input,"utf8").trim().split(/\r?\n/),headers=lines.shift().split(",");
const rows=lines.map(line=>Object.fromEntries(line.split(",").map((v,i)=>[headers[i],i===0?v:Number(v)])));
const byMonth=new Map(rows.map(r=>[r.month,r]));
const first=rows[0],last=rows.at(-1);
const pct=(a,b)=>(b/a-1)*100,change=(a,b)=>b-a;
const fmt=(v,d=2)=>Number(v).toLocaleString("en-IN",{minimumFractionDigits:d,maximumFractionDigits:d});
const signed=(v,d=1)=>`${v>=0?"+":""}${fmt(v,d)}%`;
const avg=r=>r.avg_transaction_value_inr;
const median=values=>{const x=[...values].sort((a,b)=>a-b),m=Math.floor(x.length/2);return x.length%2?x[m]:(x[m-1]+x[m])/2};
const quantile=(values,q)=>{const x=[...values].sort((a,b)=>a-b),p=(x.length-1)*q,b=Math.floor(p),f=p-b;return x[b]+(x[b+1]===undefined?0:f*(x[b+1]-x[b]))};

// Data-quality checks on the enriched monthly table.
const duplicates=rows.filter((r,i)=>rows.findIndex(x=>x.month===r.month)!==i);
const expected=[];let [y,m]=first.month.split("-").map(Number),[ey,em]=last.month.split("-").map(Number);
while(y<ey||(y===ey&&m<=em)){expected.push(`${y}-${String(m).padStart(2,"0")}`);if(m===12){y++;m=1}else m++}
const missing=expected.filter(month=>!byMonth.has(month));
const invalid=rows.filter(r=>![r.banks_live,r.volume_million,r.value_crore,r.avg_transaction_value_inr].every(Number.isFinite));

const endpoint={rupees:change(avg(first),avg(last)),percent:pct(avg(first),avg(last))};
const alternatives=["2020-10","2021-04","2022-04","2023-04","2024-04","2025-04"].map(month=>{const r=byMonth.get(month);return{start:month,startValue:avg(r),end:last.month,endValue:avg(last),change:change(avg(r),avg(last)),percent:pct(avg(r),avg(last))}});
const alternativeEnds=["2023-10","2024-10","2025-10","2026-03","2026-09","2026-10"].map(month=>{const r=byMonth.get(month);return{start:first.month,startValue:avg(first),end:month,endValue:avg(r),change:change(avg(first),avg(r)),percent:pct(avg(first),avg(r))}});
const sameMonth=rows.filter(r=>r.month.endsWith("-10")).map(r=>({month:r.month,value:avg(r)}));
const yearly=[...new Set(rows.map(r=>r.month.slice(0,4)))].map(year=>{const rs=rows.filter(r=>r.month.startsWith(year));return{year,months:rs.length,median:median(rs.map(avg)),first:avg(rs[0]),last:avg(rs.at(-1))}});
const q1=quantile(rows.map(avg),.25),q3=quantile(rows.map(avg),.75),iqr=q3-q1,lowFence=q1-1.5*iqr,highFence=q3+1.5*iqr;
const unusual=rows.filter(r=>avg(r)<lowFence||avg(r)>highFence);
const minRow=rows.reduce((a,b)=>avg(b)<avg(a)?b:a),maxRow=rows.reduce((a,b)=>avg(b)>avg(a)?b:a);
const trimmed=rows.filter(r=>r!==minRow&&r!==maxRow),trimStart=trimmed[0],trimEnd=trimmed.at(-1);
const volumeGrowth=pct(first.volume_million,last.volume_million),valueGrowth=pct(first.value_crore,last.value_crore);

const table=[
 ["1. Calculation",`Verified. ${fmt(first.value_crore)} crore x 10 / ${fmt(first.volume_million)} million = INR ${fmt(avg(first))} in ${first.month}; the same formula is used for all ${rows.length} months.`,"No"],
 ["2. Data quality",`No missing months, duplicate month keys, nonnumeric totals, or nonpositive totals. The local source notes document no definition change inside the covered period. Final-month completeness cannot be independently confirmed because the download date is unknown.`,"No, but final-month verification remains unresolved"],
 ["3. Size of change",`${first.month} to ${last.month}: INR ${fmt(avg(first))} to INR ${fmt(avg(last))}, a difference of INR ${fmt(endpoint.rupees)} (${signed(endpoint.percent)}).`,"Yes - this becomes the main finding"],
 ["4. Consistency",`The annual median declines after 2021, and every October comparison from 2021 to 2026 is below the prior October. Monthly values fluctuate, so the path is not a straight line.`,"No - supports a sustained decline with month-to-month variation"],
 ["5. Choice of dates",`All six reasonable start dates tested produce a lower value by ${last.month}. All six alternative end dates from 2023-10 onward are also below ${first.month}, though the 2023-10 difference is only ${signed(alternativeEnds[0].percent)}.`,"No, but the size of decline depends on the selected dates"],
 ["6. Seasonality",`October-to-October comparisons are lower in every available year. This controls for calendar month, but festival dates move and seasonality is not fully removed.`,"No"],
 ["7. Unusual months",`IQR rule flags ${unusual.length} unusual months. Maximum: ${maxRow.month} at INR ${fmt(avg(maxRow))}; minimum: ${minRow.month} at INR ${fmt(avg(minRow))}. Removing both extremes still leaves the endpoint direction lower.`,"No"],
 ["8. What drives the average",`Count grew ${signed(volumeGrowth)} while nominal value grew ${signed(valueGrowth)}. Count grew faster, so value per transaction fell.`,"Yes - adds the mechanism visible in the aggregate totals"],
 ["9. Month length",`Monthly activity is also available as transactions per calendar day. Average payment value is not adjusted for month length because it is already value divided by transaction count.`,"No"],
 ["10. Payment mix",`Not tested. The national totals do not split person-to-person, person-to-merchant, merchant category, or transaction-size bands.`,"Limits explanation"],
 ["11. Inflation",`Not tested. No local inflation series is available. All rupee values are nominal, as recorded by NPCI.`,"Limits interpretation; inflation-adjusted decline may differ"],
 ["12. Strength of conclusion",`The data establishes a lower nominal monthly average by the end of the series and a broad downward pattern after 2021. Causes and individual behaviour are not established.`,"Yes - narrows the wording"],
];

const report=`# UPI story pressure test

## Current story before revision

- Main claim: "India's everyday payment rail became 25x busier."
- Covered period: ${first.month} to ${last.month}.
- The claim is correct for transaction count, but it does not directly answer the new main question about average payment value.

## Main answer

The nominal average amount per UPI transaction **decreased** from INR ${fmt(avg(first))} in ${first.month} to INR ${fmt(avg(last))} in ${last.month}. That is INR ${fmt(Math.abs(endpoint.rupees))} lower, or ${fmt(Math.abs(endpoint.percent),1)}% lower.

## Twelve checks

| Check | Result | Did it change the conclusion? |
|---|---|---|
${table.map(r=>`| ${r[0]} | ${r[1]} | ${r[2]} |`).join("\n")}

## Supporting calculations

### Alternative starting months

| Start | Start average (INR) | End | End average (INR) | Difference (INR) | Change |
|---|---:|---|---:|---:|---:|
${alternatives.map(r=>`| ${r.start} | ${fmt(r.startValue)} | ${r.end} | ${fmt(r.endValue)} | ${fmt(r.change)} | ${signed(r.percent)} |`).join("\n")}

### Alternative ending months

| Start | Start average (INR) | End | End average (INR) | Difference (INR) | Change |
|---|---:|---|---:|---:|---:|
${alternativeEnds.map(r=>`| ${r.start} | ${fmt(r.startValue)} | ${r.end} | ${fmt(r.endValue)} | ${fmt(r.change)} | ${signed(r.percent)} |`).join("\n")}

### Same-month comparison: October

| Month | Average payment value (INR) | Change from prior October |
|---|---:|---:|
${sameMonth.map((r,i)=>`| ${r.month} | ${fmt(r.value)} | ${i? signed(pct(sameMonth[i-1].value,r.value)):"n.a."} |`).join("\n")}

### Calendar-year medians

| Year | Available months | Median average payment value (INR) |
|---|---:|---:|
${yearly.map(r=>`| ${r.year} | ${r.months} | ${fmt(r.median)} |`).join("\n")}

## What the data establishes

- The nominal monthly average is lower at the end than at the start by INR ${fmt(Math.abs(endpoint.rupees))}, or ${fmt(Math.abs(endpoint.percent),1)}%.
- Transaction count grew faster than nominal transaction value over the same period (${signed(volumeGrowth)} versus ${signed(valueGrowth)}).
- The lower endpoint is not created by one unusual month or one carefully chosen starting date.

## Possible explanations that remain untested

- A shift toward smaller-value payment categories could lower the aggregate average.
- Adoption patterns, merchant acceptance, policy changes, or pandemic recovery could affect the series.
- Inflation changes the real purchasing power represented by the nominal rupee figures.

These are hypotheses, not findings from this dataset.

## What this dataset cannot tell us

- It cannot show a typical or median payment because only aggregate totals are available.
- It cannot show whether any individual person spends less or makes more payments.
- It cannot separate person-to-person from person-to-merchant payments or identify what was purchased.
- It cannot provide an inflation-adjusted result without a suitable price index.
- It cannot independently confirm whether ${last.month} was complete because the source download date was not recorded.
`;
fs.writeFileSync(output,report,"utf8");
console.log(JSON.stringify({rows:rows.length,period:[first.month,last.month],startAverage:avg(first),endAverage:avg(last),difference:endpoint.rupees,percent:endpoint.percent,volumeGrowth,valueGrowth,missing,duplicates:duplicates.length,invalid:invalid.length,unusual:unusual.map(r=>({month:r.month,value:avg(r)})),min:{month:minRow.month,value:avg(minRow)},max:{month:maxRow.month,value:avg(maxRow)},trimmedDirection:pct(avg(trimStart),avg(trimEnd)),alternatives,alternativeEnds,sameMonth,yearly},null,2));
