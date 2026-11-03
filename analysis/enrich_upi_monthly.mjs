import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputPath = path.join(project, "data", "processed", "upi_monthly.csv");
const outputPath = path.join(project, "data", "processed", "upi_monthly_enriched.csv");
const reportPath = path.join(project, "outputs", "upi_findings.md");

const lines = fs.readFileSync(inputPath, "utf8").trim().split(/\r?\n/);
const inputHeader = lines.shift().split(",");
const expected = ["month", "banks_live", "volume_million", "value_crore"];
if (inputHeader.join(",") !== expected.join(",")) {
  throw new Error(`Unexpected input columns: ${inputHeader.join(",")}`);
}

const source = lines.map((line) => {
  const [month, banksLive, volumeMillion, valueCrore] = line.split(",");
  return {
    month,
    banks_live: Number(banksLive),
    volume_million: Number(volumeMillion),
    value_crore: Number(valueCrore),
  };
});

const byMonth = new Map(source.map((row) => [row.month, row]));
const base = source.find((row) => Number.isFinite(row.volume_million) && Number.isFinite(row.value_crore));
if (!base) throw new Error("No common base month for volume and value.");

const priorYearMonth = (month) => `${Number(month.slice(0, 4)) - 1}${month.slice(4)}`;
const daysInMonth = (month) => {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number, 0)).getUTCDate();
};
const pct = (current, previous) => ((current / previous) - 1) * 100;
const round = (value, places) => Number(value.toFixed(places));

const enriched = source.map((row) => {
  const prior = byMonth.get(priorYearMonth(row.month));
  const days = daysInMonth(row.month);
  return {
    ...row,
    volume_billion: round(row.volume_million / 1000, 6),
    value_inr_trillion: round(row.value_crore / 100000, 6),
    avg_transaction_value_inr: round(row.value_crore * 10 / row.volume_million, 2),
    calendar_days: days,
    avg_daily_volume_million: round(row.volume_million / days, 6),
    volume_yoy_pct: prior ? round(pct(row.volume_million, prior.volume_million), 4) : "",
    value_yoy_pct: prior ? round(pct(row.value_crore, prior.value_crore), 4) : "",
    volume_index_100: round(row.volume_million / base.volume_million * 100, 4),
    value_index_100: round(row.value_crore / base.value_crore * 100, 4),
  };
});

const outputHeader = [
  "month", "banks_live", "volume_million", "value_crore",
  "volume_billion", "value_inr_trillion", "avg_transaction_value_inr",
  "calendar_days", "avg_daily_volume_million", "volume_yoy_pct",
  "value_yoy_pct", "volume_index_100", "value_index_100",
];
const csv = [outputHeader.join(","), ...enriched.map((row) => outputHeader.map((key) => row[key]).join(","))].join("\n") + "\n";
fs.writeFileSync(outputPath, csv, "utf8");

const withYoy = enriched.filter((row) => row.volume_yoy_pct !== "" && row.value_yoy_pct !== "");
const first = enriched[0];
const latest = enriched.at(-1);
const latestPrior = enriched.find((row) => row.month === priorYearMonth(latest.month));
const peakVolumeYoy = withYoy.reduce((best, row) => row.volume_yoy_pct > best.volume_yoy_pct ? row : best);
const peakValueYoy = withYoy.reduce((best, row) => row.value_yoy_pct > best.value_yoy_pct ? row : best);
const lowestTicket = enriched.reduce((best, row) => row.avg_transaction_value_inr < best.avg_transaction_value_inr ? row : best);

const n = (value, places = 2) => Number(value).toLocaleString("en-IN", { minimumFractionDigits: places, maximumFractionDigits: places });
const signed = (value) => `${value >= 0 ? "+" : ""}${n(value, 2)}%`;
const priorFor = (row) => enriched.find((candidate) => candidate.month === priorYearMonth(row.month));

const report = `# UPI monthly findings

## Scope and calculation rules

- Source: cleaned NPCI national monthly UPI totals, ${first.month} to ${latest.month} (${enriched.length} observations).
- Year-on-year growth compares each month only with the same calendar month one year earlier. The first 12 observations remain blank because no comparison month exists.
- Volume and value indexes both equal 100 in ${first.month}, the first month where both measures are available.
- No financial-year aggregate is calculated, so the partial 2026-27 period is never compared with a complete financial year.

## Observations

### 1. Monthly UPI volume grew faster than transaction value over the full period

- Dates and values: ${first.month} volume was ${n(first.volume_billion, 3)} billion and value was INR ${n(first.value_inr_trillion, 3)} trillion. By ${latest.month}, volume was ${n(latest.volume_billion, 3)} billion and value was INR ${n(latest.value_inr_trillion, 3)} trillion.
- Calculation: volume index = (${n(latest.volume_million)} / ${n(first.volume_million)}) x 100 = ${n(latest.volume_index_100, 1)}. Value index = (${n(latest.value_crore)} / ${n(first.value_crore)}) x 100 = ${n(latest.value_index_100, 1)}.
- Related measure: average transaction value changed from INR ${n(first.avg_transaction_value_inr)} to INR ${n(latest.avg_transaction_value_inr)}.
- Limitation: index growth describes nominal transaction totals. It does not adjust transaction value for inflation and does not identify changes in user mix or payment purpose.

### 2. In the latest comparable month, transaction count rose faster than value

- Dates and values: ${latestPrior.month} to ${latest.month}. Volume rose from ${n(latestPrior.volume_billion, 3)} billion to ${n(latest.volume_billion, 3)} billion. Value rose from INR ${n(latestPrior.value_inr_trillion, 3)} trillion to INR ${n(latest.value_inr_trillion, 3)} trillion.
- Calculation: volume YoY = ((${n(latest.volume_million)} / ${n(latestPrior.volume_million)}) - 1) x 100 = ${signed(latest.volume_yoy_pct)}. Value YoY = ((${n(latest.value_crore)} / ${n(latestPrior.value_crore)}) - 1) x 100 = ${signed(latest.value_yoy_pct)}.
- Related measure: average transaction value fell from INR ${n(latestPrior.avg_transaction_value_inr)} to INR ${n(latest.avg_transaction_value_inr)}, a change of ${signed(pct(latest.avg_transaction_value_inr, latestPrior.avg_transaction_value_inr))}.
- Limitation: this is a two-month year-on-year comparison. It does not establish a sustained trend by itself.

### 3. The highest observed year-on-year growth occurred early in the series

- Volume: ${peakVolumeYoy.month} versus ${priorFor(peakVolumeYoy).month}, from ${n(priorFor(peakVolumeYoy).volume_billion, 3)} billion to ${n(peakVolumeYoy.volume_billion, 3)} billion. Calculation: ((${n(peakVolumeYoy.volume_million)} / ${n(priorFor(peakVolumeYoy).volume_million)}) - 1) x 100 = ${signed(peakVolumeYoy.volume_yoy_pct)}.
- Value: ${peakValueYoy.month} versus ${priorFor(peakValueYoy).month}, from INR ${n(priorFor(peakValueYoy).value_inr_trillion, 3)} trillion to INR ${n(peakValueYoy.value_inr_trillion, 3)} trillion. Calculation: ((${n(peakValueYoy.value_crore)} / ${n(priorFor(peakValueYoy).value_crore)}) - 1) x 100 = ${signed(peakValueYoy.value_yoy_pct)}.
- Limitation: the comparison base includes months affected by the early COVID-19 period. A high percentage change can reflect an unusually low base as well as later expansion.

### 4. The lowest average transaction value appears in ${lowestTicket.month}

- Date and values: ${lowestTicket.month} recorded ${n(lowestTicket.volume_billion, 3)} billion transactions worth INR ${n(lowestTicket.value_inr_trillion, 3)} trillion.
- Calculation: average transaction value = (${n(lowestTicket.value_crore)} crore x 10) / ${n(lowestTicket.volume_million)} million = INR ${n(lowestTicket.avg_transaction_value_inr)}.
- Daily context: ${n(lowestTicket.volume_million)} million / ${lowestTicket.calendar_days} calendar days = ${n(lowestTicket.avg_daily_volume_million)} million transactions per day.
- Limitation: this is a monthly mean, not a median. It can be influenced by the transaction-size distribution and gives each transaction equal weight.

## Possible explanations to test separately

- Faster volume growth than value may be consistent with broader use of UPI for smaller everyday payments. The national totals do not contain merchant category, person-to-person versus merchant splits, or transaction-size bands, so this explanation cannot be confirmed here.
- Strong early year-on-year growth may reflect both adoption and recovery from a low pandemic-period comparison base. Causal assessment would require mobility, restrictions, cash usage, and merchant acceptance data.
- Month-to-month daily averages can reflect calendar length and festivals. The current dataset does not identify holidays or seasonality effects, so those factors remain hypotheses.
`;

fs.writeFileSync(reportPath, report, "utf8");
console.log(JSON.stringify({
  input_rows: source.length,
  output_rows: enriched.length,
  base_month: base.month,
  yoy_rows: withYoy.length,
  blank_yoy_rows: enriched.length - withYoy.length,
  latest_month: latest.month,
  peak_volume_yoy: { month: peakVolumeYoy.month, pct: peakVolumeYoy.volume_yoy_pct },
  peak_value_yoy: { month: peakValueYoy.month, pct: peakValueYoy.value_yoy_pct },
  lowest_average_transaction_value: { month: lowestTicket.month, inr: lowestTicket.avg_transaction_value_inr },
}, null, 2));
