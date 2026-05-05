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

// ===== 汇总 =====
console.log(`\n${passed}/${passed + failed} passed${failed ? ", " + failed + " FAILED" : ""}`);
process.exit(failed ? 1 : 0);
