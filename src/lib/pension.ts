// 中国职工养老金估算（公开公式）
// 月退休金 = 基础养老金 + 个人账户养老金
// 基础养老金 = (退休时社平工资 + 退休时社平工资 × 平均缴费指数) / 2 × 缴费年限 × 1%
//            = 退休时社平工资 × (1 + 平均缴费指数) / 2 × 缴费年限 × 1%
// 个人账户养老金 = 个人账户累计余额 / 计发月数

// 计发月数表（人社部公布，简化版常见档位）
export const PAYOUT_MONTHS: Record<number, number> = {
  50: 195,
  55: 170,
  60: 139,
  65: 101,
};

export interface PensionInput {
  currentAvgWage: number; // 当前社平工资（元/月）
  wageGrowthPct: number; // 年化社平工资增长率（%）
  yearsToRetire: number; // 距退休年数
  contributionYears: number; // 总缴费年限（含到退休时）
  contributionIndex: number; // 平均缴费指数（0.6-3.0），1 = 按社平基数缴
  personalAccountBalance: number; // 当前个人账户余额（元）
  monthlyContributionToAccount: number; // 每月划入个人账户金额（≈缴费基数 × 8%）
  accountInterestPct: number; // 个人账户记账利率（%/年，近年约 4-7%）
  retireAge: 50 | 55 | 60 | 65; // 退休年龄
}

export interface PensionResult {
  retirementAvgWage: number; // 退休时社平工资估值
  basicPension: number; // 基础养老金（月）
  accountAtRetirement: number; // 退休时个人账户余额估值
  accountPension: number; // 个人账户养老金（月）
  monthlyPension: number; // 月退休金合计
  replacementPct: number; // 替代率（相对退休时社平工资）
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function calcPension(input: PensionInput): PensionResult {
  const {
    currentAvgWage,
    wageGrowthPct,
    yearsToRetire,
    contributionYears,
    contributionIndex,
    personalAccountBalance,
    monthlyContributionToAccount,
    accountInterestPct,
    retireAge,
  } = input;

  if (currentAvgWage <= 0 || yearsToRetire < 0 || contributionYears <= 0) {
    return {
      retirementAvgWage: 0,
      basicPension: 0,
      accountAtRetirement: 0,
      accountPension: 0,
      monthlyPension: 0,
      replacementPct: 0,
    };
  }

  // 退休时社平工资
  const retirementAvgWage =
    currentAvgWage * Math.pow(1 + wageGrowthPct / 100, yearsToRetire);

  // 基础养老金
  const basicPension =
    (retirementAvgWage * (1 + contributionIndex) / 2) *
    contributionYears * 0.01;

  // 个人账户在退休时累积值（月度复利 + 月供）
  // FV = PV × (1+r)^n + M × ((1+r)^n - 1) / r
  const r = accountInterestPct / 100 / 12;
  const n = yearsToRetire * 12;
  const factor = r === 0 ? 1 : Math.pow(1 + r, n);
  const accountAtRetirement =
    personalAccountBalance * factor +
    (r === 0
      ? monthlyContributionToAccount * n
      : monthlyContributionToAccount * (factor - 1) / r);

  // 个人账户养老金
  const months = PAYOUT_MONTHS[retireAge] ?? 139;
  const accountPension = accountAtRetirement / months;

  const monthlyPension = basicPension + accountPension;
  const replacementPct = (monthlyPension / retirementAvgWage) * 100;

  return {
    retirementAvgWage: round2(retirementAvgWage),
    basicPension: round2(basicPension),
    accountAtRetirement: round2(accountAtRetirement),
    accountPension: round2(accountPension),
    monthlyPension: round2(monthlyPension),
    replacementPct: round2(replacementPct),
  };
}

// 个人养老金账户（2022 起政策）：每年最多缴 12000 元，可税前扣除
// 退休领取时按 3% 综合税率（2024-12 起从 3% 单独计税；之前是 7.5%）
export interface PersonalPensionInput {
  yearlyContribution: number; // 每年缴存（≤12000）
  marginalTaxRatePct: number; // 当前个税最高边际税率（%）
  yearsToRetire: number;
  expectedAnnualReturnPct: number; // 账户内投资年化（%）
  withdrawTaxRatePct?: number; // 领取时税率，默认 3%
}

export interface PersonalPensionResult {
  totalContribution: number;
  taxSaved: number; // 累计抵税
  finalBalance: number; // 退休时账户余额
  withdrawTax: number; // 领取时缴税
  netGain: number; // 净收益（账户余额 - 累计本金 + 抵税 - 领取税）
  effectiveTaxSavedPct: number; // 实际节税率
}

export function calcPersonalPension(input: PersonalPensionInput): PersonalPensionResult {
  const {
    yearlyContribution,
    marginalTaxRatePct,
    yearsToRetire,
    expectedAnnualReturnPct,
    withdrawTaxRatePct = 3,
  } = input;

  if (yearlyContribution <= 0 || yearsToRetire <= 0) {
    return {
      totalContribution: 0,
      taxSaved: 0,
      finalBalance: 0,
      withdrawTax: 0,
      netGain: 0,
      effectiveTaxSavedPct: 0,
    };
  }

  const cap = Math.min(yearlyContribution, 12000);
  const totalContribution = cap * yearsToRetire;
  const taxSaved = totalContribution * marginalTaxRatePct / 100;

  // 年金终值（年末投入）
  const r = expectedAnnualReturnPct / 100;
  const n = yearsToRetire;
  const finalBalance =
    r === 0 ? cap * n : cap * (Math.pow(1 + r, n) - 1) / r;

  const withdrawTax = finalBalance * withdrawTaxRatePct / 100;
  const netGain = finalBalance - totalContribution + taxSaved - withdrawTax;

  return {
    totalContribution: round2(totalContribution),
    taxSaved: round2(taxSaved),
    finalBalance: round2(finalBalance),
    withdrawTax: round2(withdrawTax),
    netGain: round2(netGain),
    effectiveTaxSavedPct: round2((taxSaved - withdrawTax) / totalContribution * 100),
  };
}
