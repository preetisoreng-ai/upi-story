# UPI story pressure test

## Current story before revision

- Main claim: "India's everyday payment rail became 25x busier."
- Covered period: 2020-04 to 2026-10.
- The claim is correct for transaction count, but it does not directly answer the new main question about average payment value.

## Main answer

The nominal average amount per UPI transaction **decreased** from INR 1,512.06 in 2020-04 to INR 1,238.06 in 2026-10. That is INR 274.00 lower, or 18.1% lower.

## Twelve checks

| Check | Result | Did it change the conclusion? |
|---|---|---|
| 1. Calculation | Verified. 1,51,140.66 crore x 10 / 999.57 million = INR 1,512.06 in 2020-04; the same formula is used for all 79 months. | No |
| 2. Data quality | No missing months, duplicate month keys, nonnumeric totals, or nonpositive totals. The local source notes document no definition change inside the covered period. Final-month completeness cannot be independently confirmed because the download date is unknown. | No, but final-month verification remains unresolved |
| 3. Size of change | 2020-04 to 2026-10: INR 1,512.06 to INR 1,238.06, a difference of INR -274.00 (-18.1%). | Yes - this becomes the main finding |
| 4. Consistency | The annual median declines after 2021, and every October comparison from 2021 to 2026 is below the prior October. Monthly values fluctuate, so the path is not a straight line. | No - supports a sustained decline with month-to-month variation |
| 5. Choice of dates | All six reasonable start dates tested produce a lower value by 2026-10. All six alternative end dates from 2023-10 onward are also below 2020-04, though the 2023-10 difference is only -0.5%. | No, but the size of decline depends on the selected dates |
| 6. Seasonality | October-to-October comparisons are lower in every available year. This controls for calendar month, but festival dates move and seasonality is not fully removed. | No |
| 7. Unusual months | IQR rule flags 0 unusual months. Maximum: 2020-06 at INR 1,958.48; minimum: 2026-08 at INR 1,216.84. Removing both extremes still leaves the endpoint direction lower. | No |
| 8. What drives the average | Count grew +2,447.8% while nominal value grew +1,986.1%. Count grew faster, so value per transaction fell. | Yes - adds the mechanism visible in the aggregate totals |
| 9. Month length | Monthly activity is also available as transactions per calendar day. Average payment value is not adjusted for month length because it is already value divided by transaction count. | No |
| 10. Payment mix | Not tested. The national totals do not split person-to-person, person-to-merchant, merchant category, or transaction-size bands. | Limits explanation |
| 11. Inflation | Not tested. No local inflation series is available. All rupee values are nominal, as recorded by NPCI. | Limits interpretation; inflation-adjusted decline may differ |
| 12. Strength of conclusion | The data establishes a lower nominal monthly average by the end of the series and a broad downward pattern after 2021. Causes and individual behaviour are not established. | Yes - narrows the wording |

## Supporting calculations

### Alternative starting months

| Start | Start average (INR) | End | End average (INR) | Difference (INR) | Change |
|---|---:|---|---:|---:|---:|
| 2020-10 | 1,863.79 | 2026-10 | 1,238.06 | -625.73 | -33.6% |
| 2021-04 | 1,869.19 | 2026-10 | 1,238.06 | -631.13 | -33.8% |
| 2022-04 | 1,761.23 | 2026-10 | 1,238.06 | -523.17 | -29.7% |
| 2023-04 | 1,597.05 | 2026-10 | 1,238.06 | -358.99 | -22.5% |
| 2024-04 | 1,476.60 | 2026-10 | 1,238.06 | -238.54 | -16.2% |
| 2025-04 | 1,338.44 | 2026-10 | 1,238.06 | -100.38 | -7.5% |

### Alternative ending months

| Start | Start average (INR) | End | End average (INR) | Difference (INR) | Change |
|---|---:|---|---:|---:|---:|
| 2020-04 | 1,512.06 | 2023-10 | 1,503.90 | -8.16 | -0.5% |
| 2020-04 | 1,512.06 | 2024-10 | 1,416.84 | -95.22 | -6.3% |
| 2020-04 | 1,512.06 | 2025-10 | 1,317.71 | -194.35 | -12.9% |
| 2020-04 | 1,512.06 | 2026-03 | 1,304.06 | -208.00 | -13.8% |
| 2020-04 | 1,512.06 | 2026-09 | 1,220.44 | -291.62 | -19.3% |
| 2020-04 | 1,512.06 | 2026-10 | 1,238.06 | -274.00 | -18.1% |

### Same-month comparison: October

| Month | Average payment value (INR) | Change from prior October |
|---|---:|---:|
| 2020-10 | 1,863.79 | n.a. |
| 2021-10 | 1,828.65 | -1.9% |
| 2022-10 | 1,658.47 | -9.3% |
| 2023-10 | 1,503.90 | -9.3% |
| 2024-10 | 1,416.84 | -5.8% |
| 2025-10 | 1,317.71 | -7.0% |
| 2026-10 | 1,238.06 | -6.0% |

### Calendar-year medians

| Year | Available months | Median average payment value (INR) |
|---|---:|---:|
| 2020 | 9 | 1,842.74 |
| 2021 | 12 | 1,851.04 |
| 2022 | 12 | 1,710.31 |
| 2023 | 12 | 1,564.51 |
| 2024 | 12 | 1,437.75 |
| 2025 | 12 | 1,312.28 |
| 2026 | 10 | 1,281.02 |

## What the data establishes

- The nominal monthly average is lower at the end than at the start by INR 274.00, or 18.1%.
- Transaction count grew faster than nominal transaction value over the same period (+2,447.8% versus +1,986.1%).
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
- It cannot independently confirm whether 2026-10 was complete because the source download date was not recorded.
