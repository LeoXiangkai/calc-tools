// 中国个人所得税计算（截至 2026 年现行规定）
// 综合所得起征点 60000/年（5000/月）
// 综合所得税率：3%-45% 七级超额累进
// 经营所得税率：5%-35% 五级超额累进
// 累计预扣预缴法：2019 年起执行
// 7 项专项附加扣除（含 2023-08 调整后金额）

const round2 = (n: number) => Math.round(n * 100) / 100;
const nonNeg = (n: number) => Math.max(0, n);

// ============== 税率表（年度综合 / 累计预扣同表） ==============

export interface BracketRow {
  upTo: number; // 上限（含），Infinity 表示无上限
  rate: number; // 小数税率
  quickDeduct: number; // 速算扣除数
}

// 综合所得年度税率表（用于年度汇算与累计预扣）
export const COMPREHENSIVE_BRACKETS: BracketRow[] = [
  { upTo: 36_000, rate: 0.03, quickDeduct: 0 },
  { upTo: 144_000, rate: 0.1, quickDeduct: 2520 },
  { upTo: 300_000, rate: 0.2, quickDeduct: 16_920 },
  { upTo: 420_000, rate: 0.25, quickDeduct: 31_920 },
  { upTo: 660_000, rate: 0.3, quickDeduct: 52_920 },
  { upTo: 960_000, rate: 0.35, quickDeduct: 85_920 },
  { upTo: Infinity, rate: 0.45, quickDeduct: 181_920 },
];

// 全年一次性奖金月度税率表（奖金/12 找档）
export const ANNUAL_BONUS_BRACKETS: BracketRow[] = [
  { upTo: 3000, rate: 0.03, quickDeduct: 0 },
  { upTo: 12_000, rate: 0.1, quickDeduct: 210 },
  { upTo: 25_000, rate: 0.2, quickDeduct: 1410 },
  { upTo: 35_000, rate: 0.25, quickDeduct: 2660 },
  { upTo: 55_000, rate: 0.3, quickDeduct: 4410 },
  { upTo: 80_000, rate: 0.35, quickDeduct: 7160 },
  { upTo: Infinity, rate: 0.45, quickDeduct: 15_160 },
];

// 经营所得年度税率表
export const BUSINESS_BRACKETS: BracketRow[] = [
  { upTo: 30_000, rate: 0.05, quickDeduct: 0 },
  { upTo: 90_000, rate: 0.1, quickDeduct: 1500 },
  { upTo: 300_000, rate: 0.2, quickDeduct: 10_500 },
  { upTo: 500_000, rate: 0.3, quickDeduct: 40_500 },
  { upTo: Infinity, rate: 0.35, quickDeduct: 65_500 },
];

// 劳务报酬预扣率表（按预扣应纳税所得额）
export const LABOR_PREWITH_BRACKETS: BracketRow[] = [
  { upTo: 20_000, rate: 0.2, quickDeduct: 0 },
  { upTo: 50_000, rate: 0.3, quickDeduct: 2000 },
  { upTo: Infinity, rate: 0.4, quickDeduct: 7000 },
];

export function applyBracket(
  taxable: number,
  brackets: BracketRow[],
): { tax: number; rate: number; quickDeduct: number } {
  if (taxable <= 0) return { tax: 0, rate: 0, quickDeduct: 0 };
  for (const b of brackets) {
    if (taxable <= b.upTo) {
      return {
        tax: round2(taxable * b.rate - b.quickDeduct),
        rate: b.rate,
        quickDeduct: b.quickDeduct,
      };
    }
  }
  // theoretically unreachable
  const last = brackets[brackets.length - 1];
  return {
    tax: round2(taxable * last.rate - last.quickDeduct),
    rate: last.rate,
    quickDeduct: last.quickDeduct,
  };
}

// ============== 专项附加扣除聚合 ==============

export interface SpecialDeductionsMonthly {
  childrenEducation?: number; // 子女数 × 2000
  infantCare?: number; // 3 岁以下孩子数 × 2000
  continuingEducation?: number; // 学历 400/月；技能 0（年初取得证书当年一次性 3600，可换算 300/月）
  housingLoanInterest?: number; // 1000（首套房贷期间）
  housingRent?: number; // 1500/1100/800（按城市分档）
  elderlyCare?: number; // 独生 3000；非独 ≤1500
  seriousIllness?: number; // 大病医疗：年度据实，月度可输入 0；汇算时填全年
}

export function totalSpecialMonthly(d?: SpecialDeductionsMonthly): number {
  if (!d) return 0;
  return (
    nonNeg(d.childrenEducation ?? 0) +
    nonNeg(d.infantCare ?? 0) +
    nonNeg(d.continuingEducation ?? 0) +
    nonNeg(d.housingLoanInterest ?? 0) +
    nonNeg(d.housingRent ?? 0) +
    nonNeg(d.elderlyCare ?? 0) +
    nonNeg(d.seriousIllness ?? 0)
  );
}

// ============== 工资月度预扣（累计预扣预缴法） ==============

export interface MonthlySalaryInput {
  monthlyGross: number; // 当月税前工资（元）
  monthlySocial: number; // 当月个人社保公积金（元）
  monthlySpecial: SpecialDeductionsMonthly; // 当月专项附加扣除合计
  monthlyOther?: number; // 其他扣除（年金、商业养老险等）
  prevCumulativeIncome?: number; // 前 N-1 月累计工资（首月填 0）
  prevCumulativeDeduction?: number; // 前 N-1 月累计减除费用合计（首月 0）
  prevCumulativeWithheld?: number; // 前 N-1 月累计已预扣税额（首月 0）
  monthIndex: number; // 当前是第几个月（1-12）
}

export interface MonthlyWithholdResult {
  cumulativeIncome: number; // 截至本月累计收入
  cumulativeDeduction: number; // 截至本月累计减除（5000×月数 + 累计专项 + 累计专项附加 + 累计其他）
  cumulativeTaxable: number; // 累计应纳税所得额
  cumulativeTax: number; // 累计应纳税额
  thisMonthWithhold: number; // 本月预扣（=累计应纳 - 已预扣，最低 0）
  netSalary: number; // 当月税后实发
  rate: number;
  quickDeduct: number;
}

export function calcMonthlyWithhold(
  input: MonthlySalaryInput,
): MonthlyWithholdResult {
  const {
    monthlyGross,
    monthlySocial,
    monthlySpecial,
    monthlyOther = 0,
    prevCumulativeIncome = 0,
    prevCumulativeDeduction = 0,
    prevCumulativeWithheld = 0,
    monthIndex,
  } = input;

  const m = Math.max(1, Math.min(12, Math.floor(monthIndex)));
  const cumIncome = prevCumulativeIncome + monthlyGross;
  const thisDeduction =
    5000 + monthlySocial + totalSpecialMonthly(monthlySpecial) + monthlyOther;
  const cumDeduction = prevCumulativeDeduction + thisDeduction;
  // 当首月时，累计减除费用就是当月的 5000 + ... 而不是 5000*monthIndex
  // 调用方传 prevCumulativeDeduction 累加，符合实际预扣预缴流程

  const cumTaxable = nonNeg(cumIncome - cumDeduction);
  const { tax, rate, quickDeduct } = applyBracket(
    cumTaxable,
    COMPREHENSIVE_BRACKETS,
  );
  const cumTax = tax;
  const thisWithhold = round2(nonNeg(cumTax - prevCumulativeWithheld));
  const netSalary = round2(monthlyGross - monthlySocial - thisWithhold);

  return {
    cumulativeIncome: round2(cumIncome),
    cumulativeDeduction: round2(cumDeduction),
    cumulativeTaxable: round2(cumTaxable),
    cumulativeTax: round2(cumTax),
    thisMonthWithhold: thisWithhold,
    netSalary,
    rate,
    quickDeduct,
  };
}

// 简化场景：12 个月每月数字相同，一次返回完整 12 行 + 全年汇总
export interface UniformYearInput {
  monthlyGross: number;
  monthlySocial: number;
  monthlySpecial: SpecialDeductionsMonthly;
  monthlyOther?: number;
}

export interface YearWithholdRow {
  month: number;
  cumulativeIncome: number;
  cumulativeTaxable: number;
  cumulativeTax: number;
  thisMonthWithhold: number;
  netSalary: number;
  rate: number;
}

export function calcUniformYear(input: UniformYearInput): {
  schedule: YearWithholdRow[];
  totalTax: number;
  totalNet: number;
  totalGross: number;
} {
  const schedule: YearWithholdRow[] = [];
  let cumIncome = 0;
  let cumDeduction = 0;
  let cumWithheld = 0;
  for (let m = 1; m <= 12; m++) {
    const r = calcMonthlyWithhold({
      ...input,
      prevCumulativeIncome: cumIncome,
      prevCumulativeDeduction: cumDeduction,
      prevCumulativeWithheld: cumWithheld,
      monthIndex: m,
    });
    schedule.push({
      month: m,
      cumulativeIncome: r.cumulativeIncome,
      cumulativeTaxable: r.cumulativeTaxable,
      cumulativeTax: r.cumulativeTax,
      thisMonthWithhold: r.thisMonthWithhold,
      netSalary: r.netSalary,
      rate: r.rate,
    });
    cumIncome = r.cumulativeIncome;
    cumDeduction = r.cumulativeDeduction;
    cumWithheld = r.cumulativeTax;
  }
  return {
    schedule,
    totalTax: round2(cumWithheld),
    totalNet: round2(input.monthlyGross * 12 - input.monthlySocial * 12 - cumWithheld),
    totalGross: round2(input.monthlyGross * 12),
  };
}

// ============== 年度汇算（综合所得） ==============

export interface AnnualSettlementInput {
  // 综合所得年度收入分项
  salaryAnnual: number; // 工资薪金年度合计
  laborAnnual?: number; // 劳务报酬年度合计（税前）
  authorAnnual?: number; // 稿酬年度合计（税前）
  royaltyAnnual?: number; // 特许权使用费年度合计（税前）
  // 扣除项
  socialAnnual: number; // 全年社保公积金（个人）
  specialAnnual: number; // 全年专项附加扣除合计
  otherAnnual?: number; // 全年其他扣除（年金等）
  charityAnnual?: number; // 公益慈善捐赠扣除
  // 已预缴
  withheldTotal?: number; // 全年已预扣预缴合计
}

export interface AnnualSettlementResult {
  totalIncome: number; // 年综合所得收入额（含 80% / 56% 折算）
  totalDeduction: number; // 总扣除（含 60000 起征点）
  taxable: number; // 应纳税所得额
  taxDue: number; // 全年应纳税额
  rate: number;
  quickDeduct: number;
  refundOrPay: number; // 应退（负数）/应补（正数）
}

export function calcAnnualSettlement(
  input: AnnualSettlementInput,
): AnnualSettlementResult {
  const {
    salaryAnnual,
    laborAnnual = 0,
    authorAnnual = 0,
    royaltyAnnual = 0,
    socialAnnual,
    specialAnnual,
    otherAnnual = 0,
    charityAnnual = 0,
    withheldTotal = 0,
  } = input;

  // 综合所得收入额：工资全额 + 劳务×80% + 稿酬×80%×70% + 特许权×80%
  const incomeAmount =
    nonNeg(salaryAnnual) +
    nonNeg(laborAnnual) * 0.8 +
    nonNeg(authorAnnual) * 0.8 * 0.7 +
    nonNeg(royaltyAnnual) * 0.8;

  const totalDeduction =
    60_000 +
    nonNeg(socialAnnual) +
    nonNeg(specialAnnual) +
    nonNeg(otherAnnual) +
    nonNeg(charityAnnual);

  const taxable = nonNeg(incomeAmount - totalDeduction);
  const { tax, rate, quickDeduct } = applyBracket(
    taxable,
    COMPREHENSIVE_BRACKETS,
  );
  return {
    totalIncome: round2(incomeAmount),
    totalDeduction: round2(totalDeduction),
    taxable: round2(taxable),
    taxDue: round2(tax),
    rate,
    quickDeduct,
    refundOrPay: round2(tax - withheldTotal),
  };
}

// ============== 年终奖（全年一次性奖金） ==============

export type AnnualBonusStrategy = "separate" | "combined";

export interface AnnualBonusInput {
  bonus: number; // 年终奖
  // 用于"并入综合所得"对比时的当年综合应纳税所得额（不含本奖金）
  baseTaxableNoBonus: number;
}

export interface AnnualBonusResult {
  separate: { tax: number; rate: number; quickDeduct: number };
  combined: { tax: number; taxIncrement: number; rate: number; quickDeduct: number };
  // 推荐策略：哪个税额更低
  recommend: AnnualBonusStrategy;
  saving: number; // 节省金额（推荐 vs 另一种）
}

export function calcAnnualBonus(input: AnnualBonusInput): AnnualBonusResult {
  const bonus = nonNeg(input.bonus);
  const baseTaxable = nonNeg(input.baseTaxableNoBonus);

  // 单独计税：奖金/12 找档
  const monthly = bonus / 12;
  let sepBracket: BracketRow = ANNUAL_BONUS_BRACKETS[0];
  for (const b of ANNUAL_BONUS_BRACKETS) {
    if (monthly <= b.upTo) {
      sepBracket = b;
      break;
    }
  }
  const separateTax = round2(bonus * sepBracket.rate - sepBracket.quickDeduct);

  // 并入综合所得：与已有应纳税所得额相加后用综合所得年度税率
  const baseAlone = applyBracket(baseTaxable, COMPREHENSIVE_BRACKETS).tax;
  const baseWithBonus = applyBracket(
    baseTaxable + bonus,
    COMPREHENSIVE_BRACKETS,
  );
  const combinedTax = round2(baseWithBonus.tax);
  const combinedIncrement = round2(combinedTax - baseAlone);

  const recommend: AnnualBonusStrategy =
    separateTax <= combinedIncrement ? "separate" : "combined";
  const saving = round2(Math.abs(separateTax - combinedIncrement));

  return {
    separate: {
      tax: separateTax,
      rate: sepBracket.rate,
      quickDeduct: sepBracket.quickDeduct,
    },
    combined: {
      tax: combinedTax,
      taxIncrement: combinedIncrement,
      rate: baseWithBonus.rate,
      quickDeduct: baseWithBonus.quickDeduct,
    },
    recommend,
    saving,
  };
}

// ============== 劳务报酬 / 稿酬 / 特许权使用费 ==============

export type IncidentalIncomeType = "labor" | "author" | "royalty";

export interface IncidentalIncomeInput {
  amount: number; // 单次税前收入
  type: IncidentalIncomeType;
}

// 单次预扣（劳务报酬专属：减 800/20% 后查 3 档预扣率；稿酬/特许权按 20%）
export interface IncidentalPrewithResult {
  taxableForWithhold: number; // 预扣应纳税所得额
  withholdTax: number; // 单次预扣税额
  rate: number;
  quickDeduct: number;
  // 年度并入时的"收入额"换算
  annualizedIncomeAmount: number;
}

export function calcIncidentalPrewith(
  input: IncidentalIncomeInput,
): IncidentalPrewithResult {
  const amount = nonNeg(input.amount);
  // 单次扣除：≤4000 减 800；>4000 减 20%
  const expenseDeduction = amount <= 4000 ? 800 : amount * 0.2;
  const taxableNet = nonNeg(amount - expenseDeduction);

  if (input.type === "labor") {
    const { tax, rate, quickDeduct } = applyBracket(
      taxableNet,
      LABOR_PREWITH_BRACKETS,
    );
    return {
      taxableForWithhold: round2(taxableNet),
      withholdTax: tax,
      rate,
      quickDeduct,
      annualizedIncomeAmount: round2(amount * 0.8), // 年度按 80% 计入
    };
  }
  if (input.type === "author") {
    // 稿酬：先按 20% 比例预扣（在 taxableNet 基础上再 ×70%）
    const adjusted = taxableNet * 0.7;
    return {
      taxableForWithhold: round2(adjusted),
      withholdTax: round2(adjusted * 0.2),
      rate: 0.2,
      quickDeduct: 0,
      annualizedIncomeAmount: round2(amount * 0.8 * 0.7), // 年度按 56% 计入
    };
  }
  // royalty 特许权使用费
  return {
    taxableForWithhold: round2(taxableNet),
    withholdTax: round2(taxableNet * 0.2),
    rate: 0.2,
    quickDeduct: 0,
    annualizedIncomeAmount: round2(amount * 0.8),
  };
}

// ============== 经营所得 ==============

export interface BusinessIncomeInput {
  annualRevenue: number; // 年收入
  annualCosts: number; // 年成本费用
  annualOtherDeductions?: number; // 其他可扣除（公益等）
  monthsActive?: number; // 本年实际经营月数（用于"按经营月数折算" 5000/月起征）
}

export interface BusinessIncomeResult {
  taxable: number;
  tax: number;
  rate: number;
  quickDeduct: number;
}

export function calcBusinessIncome(
  input: BusinessIncomeInput,
): BusinessIncomeResult {
  const {
    annualRevenue,
    annualCosts,
    annualOtherDeductions = 0,
    monthsActive = 12,
  } = input;
  // 经营所得起征点：5000/月（与综合所得起征点一致）
  // 实务：业主按月报税，全年减除 5000×月数
  const m = Math.max(1, Math.min(12, Math.floor(monthsActive)));
  const subsistence = 5000 * m;
  const taxable = nonNeg(
    annualRevenue - annualCosts - annualOtherDeductions - subsistence,
  );
  const { tax, rate, quickDeduct } = applyBracket(taxable, BUSINESS_BRACKETS);
  return { taxable: round2(taxable), tax, rate, quickDeduct };
}

// ============== 公共格式化 ==============

export const fmtCny2 = (n: number): string =>
  n.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const fmtPct = (r: number): string => `${(r * 100).toFixed(0)}%`;
