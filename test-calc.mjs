// 算法 sanity check：用 node 直接跑 TS（v22+ 支持 strip-types）
// 运行：node --experimental-strip-types test-calc.mjs
import {
  calcMortgage,
  calcCombined,
  calcPrepay,
  calcRepricing,
  calcAffordability,
} from "./src/lib/mortgage.ts";
import { calcTransactionTax } from "./src/lib/tax.ts";
import {
  calcMonthlyWithhold,
  calcUniformYear,
  calcAnnualSettlement,
  calcAnnualBonus,
  calcIncidentalPrewith,
  calcBusinessIncome,
  applyBracket,
  COMPREHENSIVE_BRACKETS,
} from "./src/lib/income-tax.ts";
import {
  calcLumpSum,
  calcDca,
  calcGoal,
  calcInflation,
  calcOpportunity,
  rule72,
} from "./src/lib/compound.ts";
import { calcPension, calcPersonalPension, PAYOUT_MONTHS } from "./src/lib/pension.ts";
import { calcDeposit, compareDeposits } from "./src/lib/deposit.ts";
import { calcInstallmentIrr, calcEarlyPayoff } from "./src/lib/credit-card-irr.ts";
import { calcFireTarget, calcFireYears, calcFireFromSavingsRate } from "./src/lib/fire.ts";
import { calcRentVsBuy } from "./src/lib/rent-vs-buy.ts";

let passed = 0;
let failed = 0;

function approx(label, actual, expected, tol = 1) {
  const ok = Math.abs(actual - expected) <= tol;
  if (ok) passed++;
  else failed++;
  console.log(
    `${ok ? "✅" : "❌"} ${label}: actual=${actual.toFixed(2)} expected≈${expected} (tol=${tol})`,
  );
}

function eq(label, actual, expected) {
  const ok = actual === expected;
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "✅" : "❌"} ${label}: actual=${actual} expected=${expected}`);
}

// ===== calcMortgage =====
console.log("\n=== calcMortgage ===");
const r1 = calcMortgage({
  principal: 1_000_000,
  years: 30,
  annualRatePct: 3.95,
  method: "equal-installment",
});
approx("等额本息 100万/30年/3.95% 月供", r1.firstMonthPayment, 4745.37, 1);
approx("等额本息 总利息", r1.totalInterest, 708334, 200);

const r2 = calcMortgage({
  principal: 1_000_000,
  years: 30,
  annualRatePct: 3.95,
  method: "equal-principal",
});
approx("等额本金 首月", r2.firstMonthPayment, 6069.44, 1);
approx("等额本金 末月", r2.lastMonthPayment, 2786.92, 1);

const r3 = calcMortgage({
  principal: 360_000,
  years: 30,
  annualRatePct: 0,
  method: "equal-installment",
});
approx("0% 利率 等额本息", r3.firstMonthPayment, 1000, 0.01);

eq("非法本金", calcMortgage({
  principal: -1, years: 30, annualRatePct: 3.95, method: "equal-installment",
}).totalPayment, 0);

// ===== calcCombined =====
console.log("\n=== calcCombined ===");
const cmb = calcCombined({
  commercial: { principal: 700_000, years: 30, annualRatePct: 3.95 },
  housingFund: { principal: 600_000, years: 30, annualRatePct: 2.85 },
  method: "equal-installment",
});
// 商贷 70万/30/3.95% ≈ 3321.76；公积金 60万/30/2.85% ≈ 2480.63
approx("组合 商贷月供", cmb.commercial.firstMonthPayment, 3321.76, 1);
approx("组合 公积金月供", cmb.housingFund.firstMonthPayment, 2480.63, 1);
approx("组合 首月合计", cmb.firstMonthPayment, 3321.76 + 2480.63, 1);

// ===== calcPrepay =====
console.log("\n=== calcPrepay ===");
// 100万/30年/3.95%, 第60月（5年末）一次性还 30万, 缩短年限
const pp1 = calcPrepay({
  principal: 1_000_000,
  years: 30,
  annualRatePct: 3.95,
  method: "equal-installment",
  prepayAtMonth: 60,
  prepayAmount: 300_000,
  strategy: "shorten-term",
});
console.log(`缩短年限：剩余月数=${pp1.newRemainingMonths}, 节省利息=${pp1.interestSaved.toFixed(2)}`);
approx("缩短年限 节省利息 > 0", pp1.interestSaved > 0 ? 1 : 0, 1, 0);
approx("缩短年限 月数减少 > 0", pp1.monthsSaved > 0 ? 1 : 0, 1, 0);

// 同样条件，减少月供
const pp2 = calcPrepay({
  principal: 1_000_000,
  years: 30,
  annualRatePct: 3.95,
  method: "equal-installment",
  prepayAtMonth: 60,
  prepayAmount: 300_000,
  strategy: "reduce-payment",
});
console.log(
  `减少月供：旧月供=${pp2.oldMonthlyPayment}, 新月供=${pp2.newMonthlyPayment.toFixed(2)}, 节省利息=${pp2.interestSaved.toFixed(2)}`,
);
approx("减少月供 新月供 < 旧月供", pp2.newMonthlyPayment < pp2.oldMonthlyPayment ? 1 : 0, 1, 0);
// 缩短年限节省利息一般大于减少月供
approx("缩短年限 节省 > 减少月供 节省", pp1.interestSaved > pp2.interestSaved ? 1 : 0, 1, 0);

// ===== calcRepricing =====
console.log("\n=== calcRepricing ===");
// 100万/30年/4.5%，第13月利率降到 3.95%
const rp = calcRepricing({
  principal: 1_000_000,
  years: 30,
  oldAnnualRatePct: 4.5,
  newAnnualRatePct: 3.95,
  repriceAtMonth: 12,
  method: "equal-installment",
});
console.log(
  `重定价：旧月供=${rp.oldMonthlyPayment}, 新月供=${rp.newMonthlyPayment.toFixed(2)}, 月供变化=${rp.monthlyDelta.toFixed(2)}`,
);
approx("利率降 → 月供降", rp.monthlyDelta < 0 ? 1 : 0, 1, 0);

// ===== calcAffordability =====
console.log("\n=== calcAffordability ===");
// 月入 2万，月供占比 50%（=1万），30 年 3.95%，首付 30%
const af = calcAffordability({
  monthlyIncome: 20_000,
  paymentRatioPct: 50,
  years: 30,
  annualRatePct: 3.95,
  downPaymentRatioPct: 30,
});
console.log(
  `购房力：最大月供=${af.maxMonthlyPayment}, 可贷=${af.maxLoanPrincipal.toFixed(0)}, 可买总价=${af.maxTotalPrice.toFixed(0)}, 首付=${af.maxDownPayment.toFixed(0)}`,
);
approx("最大月供 = 1万", af.maxMonthlyPayment, 10000, 0.01);
// 1万月供 / 30年 / 3.95% 反推本金 ≈ 210.7万；总价 = 210.7万/0.7 ≈ 301万
approx("可贷本金 ≈ 210.7 万", af.maxLoanPrincipal / 10000, 210.7, 1);
approx("总价 ≈ 301 万", af.maxTotalPrice / 10000, 301, 2);

// ===== calcTransactionTax =====
console.log("\n=== calcTransactionTax ===");
// 一手房，首套，100㎡，500 万
const t1 = calcTransactionTax({
  totalPrice: 5_000_000,
  area: 100,
  order: "first",
  type: "new",
});
console.log(`一手首套 100㎡ 500万 契税=${t1.contractTax}, 总=${t1.total}`);
approx("一手首套 100㎡ 契税 = 1%", t1.contractTax, 50_000, 1);
approx("一手 无增值税与个税", t1.valueAddedTax + t1.incomeTax, 0, 0);

// 一手二套 160㎡ 500万 → 2%
const t2 = calcTransactionTax({
  totalPrice: 5_000_000,
  area: 160,
  order: "second",
  type: "new",
});
approx("一手二套 160㎡ 契税 = 2%", t2.contractTax, 100_000, 1);

// 二手满五唯一 100㎡ 首套 500万
const t3 = calcTransactionTax({
  totalPrice: 5_000_000,
  area: 100,
  order: "first",
  type: "used",
  sellerHoldYears: "gte5",
  sellerOnlyHouse: "yes",
});
console.log(`二手满五唯一 总=${t3.total}`);
approx("满五唯一 个税=0", t3.incomeTax, 0, 0);
approx("满二 增值税=0", t3.valueAddedTax, 0, 0);
approx("总=契税 50000", t3.total, 50_000, 1);

// 二手不满 2 年 100㎡ 首套 500万 → 增值税 5.3% + 个税 1%
const t4 = calcTransactionTax({
  totalPrice: 5_000_000,
  area: 100,
  order: "first",
  type: "used",
  sellerHoldYears: "lt2",
  sellerOnlyHouse: "no",
});
console.log(`二手 <2 年 增值税=${t4.valueAddedTax.toFixed(2)}, 个税=${t4.incomeTax}`);
approx("增值税 ≈ 500万/1.05*5.3%", t4.valueAddedTax, (5_000_000 / 1.05) * 0.053, 100);
approx("个税 1% = 5万", t4.incomeTax, 50_000, 1);

// ===== 个税：综合所得税率应用 =====
console.log("\n=== applyBracket 综合所得 ===");
approx("21600 → 3% = 648", applyBracket(21600, COMPREHENSIVE_BRACKETS).tax, 648, 0.01);
approx("100000 → 10% - 2520 = 7480", applyBracket(100000, COMPREHENSIVE_BRACKETS).tax, 7480, 0.01);
approx("250000 → 20% - 16920 = 33080", applyBracket(250000, COMPREHENSIVE_BRACKETS).tax, 33080, 0.01);
approx("1000000 → 45% - 181920 = 268080", applyBracket(1000000, COMPREHENSIVE_BRACKETS).tax, 268080, 0.01);
approx("0 → 0", applyBracket(0, COMPREHENSIVE_BRACKETS).tax, 0, 0);

// ===== 个税：累计预扣预缴 =====
console.log("\n=== calcUniformYear 月薪 1万 + 社保2200 + 专项附加1000 ===");
const y1 = calcUniformYear({
  monthlyGross: 10000,
  monthlySocial: 2200,
  monthlySpecial: { housingLoanInterest: 1000 },
});
// 月度减除 5000+2200+1000=8200，年总减除 98400，年应纳所得 21600，年税 648
approx("年应纳所得 21600", y1.schedule[11].cumulativeTaxable, 21600, 0.01);
approx("全年税 648", y1.totalTax, 648, 0.01);
approx("12月所有月预扣相加 = 全年税", y1.schedule.reduce((s, r) => s + r.thisMonthWithhold, 0), 648, 0.5);
approx("全年净到手", y1.totalNet, 10000 * 12 - 2200 * 12 - 648, 1);

// 累计预扣跨档：月薪 3万、社保 4000、专项附加 0
console.log("\n=== calcUniformYear 月薪 3万 + 社保4000 + 无专项 ===");
const y2 = calcUniformYear({
  monthlyGross: 30000,
  monthlySocial: 4000,
  monthlySpecial: {},
});
// 月度减除 9000；累计 1月 21000、2月 42000、12月 252000
// 12月累计税：252000>144000 → 20%档，252000×20%-16920=33480
approx("12月累计应纳所得 252000", y2.schedule[11].cumulativeTaxable, 252000, 0.01);
approx("全年税 33480", y2.totalTax, 33480, 0.01);
// 验证累计预扣：1月税=21000×3%=630
approx("1月应纳", y2.schedule[0].thisMonthWithhold, 630, 0.01);
// 2月累计 4200-2520=1680，本月 1680-630=1050
approx("2月本月预扣", y2.schedule[1].thisMonthWithhold, 1050, 0.01);

// ===== 个税：年度汇算 =====
console.log("\n=== calcAnnualSettlement ===");
const a1 = calcAnnualSettlement({
  salaryAnnual: 120000,
  socialAnnual: 26400,
  specialAnnual: 12000,
  withheldTotal: 648,
});
approx("综合应纳所得 21600", a1.taxable, 21600, 0.01);
approx("年度税 648", a1.taxDue, 648, 0.01);
approx("应退应补 0", a1.refundOrPay, 0, 0.01);

// 含劳务报酬+稿酬的汇算
const a2 = calcAnnualSettlement({
  salaryAnnual: 200000,
  laborAnnual: 50000, // 计入 80% = 40000
  authorAnnual: 20000, // 计入 80% × 70% = 56% = 11200
  socialAnnual: 30000,
  specialAnnual: 24000,
  withheldTotal: 0,
});
// 综合所得收入额 = 200000+40000+11200 = 251200
// 总扣除 60000+30000+24000 = 114000
// 应纳所得 137200
// 137200 > 36000，10% - 2520 = 11200
approx("综合收入额 251200", a2.totalIncome, 251200, 1);
approx("应纳所得 137200", a2.taxable, 137200, 0.01);
approx("年度税 11200", a2.taxDue, 11200, 0.01);

// ===== 个税：年终奖 =====
console.log("\n=== calcAnnualBonus ===");
// 月薪 2万、年综合应纳所得（不含奖金）= 138000，年终奖 5万
// 单独：50000/12=4166.67 → 10%档，qd 210；50000×10%-210=4790
// 并入：(138000+50000)=188000 → 20%档；188000×20%-16920=20680
// 不含奖金时：138000×10%-2520=11280
// 增量 = 20680-11280 = 9400
// 应推荐 separate (4790<9400)
const ab1 = calcAnnualBonus({ bonus: 50000, baseTaxableNoBonus: 138000 });
approx("单独计税 4790", ab1.separate.tax, 4790, 0.01);
approx("并入增量 9400", ab1.combined.taxIncrement, 9400, 0.01);
eq("推荐 separate", ab1.recommend, "separate");
approx("节省 4610", ab1.saving, 4610, 0.01);

// 年终奖陷阱：36001 比 36000 多 1 元，税增加 2310
const ab36000 = calcAnnualBonus({ bonus: 36000, baseTaxableNoBonus: 0 });
const ab36001 = calcAnnualBonus({ bonus: 36001, baseTaxableNoBonus: 0 });
approx("年终奖 36000 单独税 1080", ab36000.separate.tax, 1080, 0.01);
approx("年终奖 36001 单独税 ≈3390", ab36001.separate.tax, 3390.1, 0.5);

// 年终奖小、综合应纳低时，并入更划算
const abLow = calcAnnualBonus({ bonus: 10000, baseTaxableNoBonus: 0 });
// 单独：10000/12=833.33 → 3% qd 0；10000×3%=300
// 并入：10000×3%-0=300, 增量 300
// 二者相等
approx("低收入低奖金 单独=并入", abLow.separate.tax - abLow.combined.taxIncrement, 0, 0.01);

// ===== 个税：劳务/稿酬/特许权 =====
console.log("\n=== calcIncidentalPrewith ===");
// 劳务 1万：减 20% = 8000；20% 档；8000×20% = 1600
const lab = calcIncidentalPrewith({ amount: 10000, type: "labor" });
approx("劳务1万 预扣 1600", lab.withholdTax, 1600, 0.01);
approx("劳务1万 年度并入 8000", lab.annualizedIncomeAmount, 8000, 0.01);

// 劳务 5 万：减 20% = 40000；30% 档 - 2000；40000×30%-2000 = 10000
const lab5 = calcIncidentalPrewith({ amount: 50000, type: "labor" });
approx("劳务5万 预扣 10000", lab5.withholdTax, 10000, 0.01);

// 劳务 800 以下：减 800 = 0
const lab500 = calcIncidentalPrewith({ amount: 500, type: "labor" });
approx("劳务500 预扣 0", lab500.withholdTax, 0, 0.01);

// 稿酬 1 万：减 20% = 8000；×70% = 5600；×20% = 1120
const aut = calcIncidentalPrewith({ amount: 10000, type: "author" });
approx("稿酬1万 预扣 1120", aut.withholdTax, 1120, 0.01);
approx("稿酬1万 年度计入 5600", aut.annualizedIncomeAmount, 5600, 0.01);

// 特许权 1万：减 20% = 8000；×20% = 1600
const roy = calcIncidentalPrewith({ amount: 10000, type: "royalty" });
approx("特许权1万 预扣 1600", roy.withholdTax, 1600, 0.01);

// ===== 个税：经营所得 =====
console.log("\n=== calcBusinessIncome ===");
const biz = calcBusinessIncome({
  annualRevenue: 500000,
  annualCosts: 200000,
  monthsActive: 12,
});
// 应纳所得 500000-200000-60000=240000；20% 档 - 10500；240000×20%-10500=37500
approx("经营所得 应纳 240000", biz.taxable, 240000, 0.01);
approx("经营税 37500", biz.tax, 37500, 0.01);

// 仅经营 6 个月：减除 30000
const biz6 = calcBusinessIncome({
  annualRevenue: 100000,
  annualCosts: 30000,
  monthsActive: 6,
});
// 应纳 100000-30000-30000=40000；10% 档 - 1500；40000×10%-1500=2500
approx("经营 6个月 应纳 40000", biz6.taxable, 40000, 0.01);
approx("经营 6个月 税 2500", biz6.tax, 2500, 0.01);

// ===== 复利：单笔 =====
console.log("\n=== calcLumpSum ===");
// 10万 × 8% × 30年（月度复利）：FV = 100000 × (1+0.08/12)^360 ≈ 1,093,573
const lump = calcLumpSum({ principal: 100000, annualRatePct: 8, years: 30, compounding: "monthly" });
approx("10万8%30年月复利 FV ≈ 109.36万", lump.futureValue, 1093573, 1);
approx("总利息 ≈ 99.36万", lump.totalInterest, 993573, 1);
approx("翻倍倍数 ≈ 10.94", lump.multiple, 10.94, 0.01);
approx("yearly 长度 = 30", lump.yearly.length, 30, 0);

// 0% 利率退化为本金不变
const lump0 = calcLumpSum({ principal: 100000, annualRatePct: 0, years: 10 });
approx("0% 利率 FV = 本金", lump0.futureValue, 100000, 0.01);
approx("0% 利率 总利息 = 0", lump0.totalInterest, 0, 0.01);

// 非法输入
const lumpBad = calcLumpSum({ principal: -100, annualRatePct: 5, years: 10 });
approx("负本金 → 全 0", lumpBad.futureValue, 0, 0);

// ===== 复利：定投 =====
console.log("\n=== calcDca ===");
// 月投 3000、年化 8%、30年（月末投入起息）：FV ≈ 4,471,078
const dca = calcDca({ monthlyContribution: 3000, annualRatePct: 8, years: 30 });
approx("月投3000 8% 30年 FV ≈ 447万", dca.futureValue, 4471078, 1);
approx("累计本金 = 3000×360 = 108万", dca.totalContribution, 1080000, 1);
approx("总收益 ≈ 447-108 ≈ 339万", dca.totalInterest, 3391078, 1);

// 含初始本金 5万 + 月投 3000 + 30 年 8%：FV ≈ 5,017,864
const dcaInit = calcDca({ monthlyContribution: 3000, annualRatePct: 8, years: 30, initialPrincipal: 50000 });
approx("初始5万+月投3000 30年 FV ≈ 501.8万", dcaInit.futureValue, 5017864, 5);
approx("累计本金 = 50000+108万 = 113万", dcaInit.totalContribution, 1130000, 1);

// ===== 复利：目标反推 =====
console.log("\n=== calcGoal ===");
// 目标 100万、年化 8%、20年（月复利）
// M = 1000000 × 0.00667 / ((1.00667)^240 - 1) ≈ 1697.73
const goal = calcGoal({ goalAmount: 1_000_000, annualRatePct: 8, years: 20 });
approx("目标100万 8% 20年 月需投 ≈ 1698", goal.monthlyRequired, 1697.73, 1);
approx("累计投入 = 1697.73×240 ≈ 40.74万", goal.totalContribution, 407455, 200);

// 已有 30万 + 8% + 20年，剩余靠定投
// 30万×(1.00667)^240 ≈ 1481038（已超过 100万）→ 月需投 0
const goalRich = calcGoal({ goalAmount: 1_000_000, annualRatePct: 8, years: 20, initialPrincipal: 300000 });
approx("已有30万足够 → 月需 0", goalRich.monthlyRequired, 0, 0);

// ===== 复利：通胀调整 =====
console.log("\n=== calcInflation ===");
// 100万、3%通胀、20年 → 实际 100万 / 1.03^20 ≈ 553676
const inf = calcInflation({ nominalValue: 1_000_000, inflationRatePct: 3, years: 20 });
approx("100万 3%通胀 20年 实际 ≈ 55.4万", inf.realValue, 553676, 100);
approx("被侵蚀 ≈ 44.6万", inf.erodedAmount, 446324, 100);
approx("侵蚀比例 ≈ 44.6%", inf.erodedPct, 44.63, 0.1);

// 0% 通胀 → 不变
const inf0 = calcInflation({ nominalValue: 1_000_000, inflationRatePct: 0, years: 20 });
approx("0% 通胀 实际 = 名义", inf0.realValue, 1_000_000, 0.01);

// ===== 复利：机会对比 =====
console.log("\n=== calcOpportunity ===");
// 10万、投资 8%、通胀 3%、10年
// invested = 100000 × (1+0.08/12)^120 ≈ 221964
// investedReal = 221964 / 1.03^10 ≈ 165152
// uninvested = 100000；uninvestedReal = 100000 / 1.03^10 ≈ 74409
// 机会成本 = investedReal - uninvestedReal ≈ 90743
const opp = calcOpportunity({ amount: 100000, investRatePct: 8, inflationRatePct: 3, years: 10 });
approx("投资名义 ≈ 22.2万", opp.invested, 221964, 100);
approx("投资实际 ≈ 16.5万", opp.investedReal, 165162, 100);
approx("不投实际 ≈ 7.4万", opp.uninvestedReal, 74409, 50);
approx("机会成本 ≈ 9.07万", opp.opportunityCost, 90753, 100);

// ===== 72 法则 =====
console.log("\n=== rule72 ===");
approx("8% → 72/8 = 9 年", rule72(8), 9, 0);
approx("12% → 6 年", rule72(12), 6, 0);
approx("6% → 12 年", rule72(6), 12, 0);

// ===== 退休金 =====
console.log("\n=== calcPension ===");
const pen = calcPension({
  currentAvgWage: 8000,
  wageGrowthPct: 5,
  yearsToRetire: 20,
  contributionYears: 30,
  contributionIndex: 1,
  personalAccountBalance: 50000,
  monthlyContributionToAccount: 800,
  accountInterestPct: 5,
  retireAge: 60,
});
approx("退休时社平 ≈ 21227", pen.retirementAvgWage, 21227, 5);
approx("基础养老金 ≈ 6368", pen.basicPension, 6368, 5);
approx("月退休金 ≈ 9709", pen.monthlyPension, 9709, 5);
approx("替代率 ≈ 45.74%", pen.replacementPct, 45.74, 0.1);

// 60 岁计发月数 139
eq("60 岁计发月数 = 139", PAYOUT_MONTHS[60], 139);

// 缴费年限越短退休金越少（30 → 15 年砍半）
const penShort = calcPension({ ...{ currentAvgWage: 8000, wageGrowthPct: 5, yearsToRetire: 20, contributionIndex: 1, personalAccountBalance: 50000, monthlyContributionToAccount: 800, accountInterestPct: 5, retireAge: 60 }, contributionYears: 15 });
approx("缴 15 年比 30 年的基础养老金少一半左右", penShort.basicPension * 2 - pen.basicPension, 0, 100);

// 个人养老金账户：12000/年 × 20年 × 边际20% × 5%回报，3% 退休税
console.log("\n=== calcPersonalPension ===");
const pp = calcPersonalPension({
  yearlyContribution: 12000,
  marginalTaxRatePct: 20,
  yearsToRetire: 20,
  expectedAnnualReturnPct: 5,
});
approx("累计本金 240000", pp.totalContribution, 240000, 1);
approx("累计抵税 48000", pp.taxSaved, 48000, 1);
approx("退休时账户 ≈ 396791", pp.finalBalance, 396791, 5);
approx("领取时税 ≈ 11904", pp.withdrawTax, 11903.74, 1);

// 边际税率 3% 时，节税近乎为零（缴存 3% 抵 - 退休 3% 缴 = 0）
const ppLow = calcPersonalPension({ yearlyContribution: 12000, marginalTaxRatePct: 3, yearsToRetire: 20, expectedAnnualReturnPct: 5 });
const lowEffective = ppLow.taxSaved - ppLow.withdrawTax;
approx("3% 边际税率几乎不节税（应小于 0）", lowEffective < 0 ? 1 : 0, 1, 0);

// ===== 存款 =====
console.log("\n=== calcDeposit ===");
const d1 = calcDeposit({ principal: 200000, annualRatePct: 1.5, years: 1 });
approx("20万 1.5% 1年 → 利息 3000", d1.totalInterest, 3000, 0.5);
approx("simple 1 年 实际年化 = 名义", d1.effectiveAnnualPct, 1.5, 0.01);

const d3y = calcDeposit({ principal: 200000, annualRatePct: 2.5, years: 3, compounding: "annual" });
approx("20万 2.5% 3年按年复利 → FV ≈ 215378", d3y.futureValue, 215378.13, 1);
approx("按年复利 3 年实际年化 = 2.5%", d3y.effectiveAnnualPct, 2.5, 0.01);

const cmp = compareDeposits(100000, [
  { name: "1y 定存", annualRatePct: 1.5, years: 1 },
  { name: "1y 大额", annualRatePct: 1.9, years: 1, threshold: 200000 },
]);
eq("不达起存 大额存单标记 eligible=false", cmp[1].eligible, false);
approx("达起存 1y 定存 利息 1500", cmp[0].totalInterest, 1500, 0.5);

// ===== 信用卡分期 IRR =====
console.log("\n=== calcInstallmentIrr ===");
// 12 期月费率 0.6%：名义 7.2%，IRR 约 13.2%
const ir = calcInstallmentIrr({ principal: 10000, monthlyFeePct: 0.6, months: 12 });
approx("12期 0.6% 月供 = 10000/12 + 60 = 893.33", ir.monthlyPayment, 893.33, 0.5);
approx("名义年化 = 7.2%", ir.nominalAprPct, 7.2, 0.01);
approx("IRR 约 13.2-13.9%", ir.irrAnnualPct, 13.5, 0.5);
approx("IRR 是名义的 1.85x 左右", ir.irrMultiple, 1.9, 0.1);

// 24 期 0.45% 月费率 → 真实 IRR 约 10%
const ir24 = calcInstallmentIrr({ principal: 10000, monthlyFeePct: 0.45, months: 24 });
approx("24期 0.45% 名义 5.4%", ir24.nominalAprPct, 5.4, 0.01);
approx("24期 0.45% 真实 IRR 约 10.4%", ir24.irrAnnualPct, 10.4, 0.6);

// 提前结清：剩余手续费 vs 违约金
console.log("\n=== calcEarlyPayoff ===");
const ep = calcEarlyPayoff({ principal: 10000, monthlyFeePct: 0.6, totalMonths: 12, paidMonths: 6, earlyPayoffPenaltyPct: 1 });
approx("剩余本金 5000", ep.remainingPrincipal, 5000, 0.5);
approx("剩余手续费 6×60 = 360", ep.remainingFee, 360, 0.5);
approx("违约金 1% × 5000 = 50", ep.payoffPenalty, 50, 0.5);
approx("净节省 360-50 = 310", ep.netSaving, 310, 0.5);
eq("推荐提前结清", ep.recommendation, "early-payoff");

// 违约金高过剩余手续费时反向
const epHigh = calcEarlyPayoff({ principal: 10000, monthlyFeePct: 0.3, totalMonths: 12, paidMonths: 11, earlyPayoffPenaltyPct: 5 });
eq("最后一期违约金高 → 不建议提前", epHigh.recommendation, "continue");

// ===== FIRE =====
console.log("\n=== calcFireTarget ===");
const ft = calcFireTarget({ annualExpense: 120000 });
approx("年支出 12万 4% 法则 → 300 万", ft.fireNumber, 3_000_000, 1);
approx("倍数 = 25", ft.multiple, 25, 0);

const ft3 = calcFireTarget({ annualExpense: 120000, withdrawalRatePct: 3 });
approx("3% 提取率 → 倍数 33.33", ft3.multiple, 33.33, 0.01);
approx("3% 提取率目标 = 400 万", ft3.fireNumber, 4_000_000, 1);

console.log("\n=== calcFireYears ===");
// 起点 50万 + 年储 30万 + 7% 回报 → 几年达 300 万
const fy = calcFireYears({ currentAssets: 500_000, annualSavings: 300_000, expectedReturnPct: 7, fireNumber: 3_000_000 });
approx("达 FIRE 年数 ≈ 7", fy.yearsToFire, 7, 0);
approx("终值 ≈ 339万", fy.finalAssets, 3_399_097, 1000);

// 已超目标 → 0 年
const fyDone = calcFireYears({ currentAssets: 5_000_000, annualSavings: 0, expectedReturnPct: 7, fireNumber: 3_000_000 });
eq("已达目标 → 0 年", fyDone.yearsToFire, 0);

console.log("\n=== calcFireFromSavingsRate ===");
// 50% 储蓄率 → ~17 年（MMM 经典数）
const sf50 = calcFireFromSavingsRate({ savingsRatePct: 50 });
approx("50% 储蓄率 ≈ 17 年", sf50.yearsToFire, 17, 1);

// 75% 储蓄率 → ~7 年
const sf75 = calcFireFromSavingsRate({ savingsRatePct: 75 });
approx("75% 储蓄率 ≈ 7 年", sf75.yearsToFire, 7, 1);

// ===== 租 vs 买 =====
console.log("\n=== calcRentVsBuy ===");
const rb = calcRentVsBuy({
  totalPrice: 5_000_000,
  downPaymentPct: 30,
  loanYears: 30,
  loanRatePct: 3.95,
  monthlyRent: 8000,
  rentGrowthPct: 3,
  homeAppreciationPct: 2,
  propertyTaxYearlyPct: 0.5,
  maintenanceYearlyPct: 0.5,
  investmentReturnPct: 5,
  yearsToHold: 10,
});
approx("首付 150 万", rb.downPayment, 1_500_000, 1);
approx("10 年累计月供 ≈ 199.3 万", rb.totalMortgageCost, 1993056, 1000);
approx("期末房价 ≈ 609.5 万", rb.homeValueAtEnd, 6_094_972, 1000);
// 默认参数下房价涨 2% < 投资回报 5%，应推荐 rent
eq("房价涨幅低于投资回报 → 推荐 rent", rb.recommendation, "rent");
approx("租房比买房省（buyAdvantage < 0）", rb.buyAdvantage < 0 ? 1 : 0, 1, 0);

// 房价涨 6%（大于投资 5%）→ 转向 buy
const rbBoom = calcRentVsBuy({
  totalPrice: 5_000_000,
  downPaymentPct: 30,
  loanYears: 30,
  loanRatePct: 3.95,
  monthlyRent: 8000,
  rentGrowthPct: 3,
  homeAppreciationPct: 6,
  propertyTaxYearlyPct: 0.5,
  maintenanceYearlyPct: 0.5,
  investmentReturnPct: 5,
  yearsToHold: 10,
});
eq("房价涨 6% → 推荐 buy", rbBoom.recommendation, "buy");

// ===== 汇总 =====
console.log(`\n${passed}/${passed + failed} passed${failed ? ", " + failed + " FAILED" : ""}`);
process.exit(failed ? 1 : 0);
