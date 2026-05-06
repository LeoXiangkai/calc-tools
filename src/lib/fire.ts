// FIRE (Financial Independence, Retire Early) 财务自由倒推
// 4% 法则：年支出 × 25 = FIRE 目标（基于历史美股回报，安全提取率 4%）
// 国内可保守按 3-3.5% 倒推（25-33 倍）

export interface FireTargetInput {
  annualExpense: number; // 年支出（元）
  withdrawalRatePct?: number; // 安全提取率（默认 4%）
}

export interface FireTargetResult {
  fireNumber: number; // 达到 FIRE 所需总资产
  multiple: number; // 倍数
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function calcFireTarget(input: FireTargetInput): FireTargetResult {
  const { annualExpense, withdrawalRatePct = 4 } = input;
  if (annualExpense <= 0 || withdrawalRatePct <= 0) {
    return { fireNumber: 0, multiple: 0 };
  }
  const fireNumber = annualExpense * (100 / withdrawalRatePct);
  return {
    fireNumber: round2(fireNumber),
    multiple: round2(100 / withdrawalRatePct),
  };
}

// 给定当前资产 + 年储蓄 + 投资回报，多少年达到 FIRE
export interface FireYearsInput {
  currentAssets: number;
  annualSavings: number; // 每年净储蓄（收入-支出）
  expectedReturnPct: number; // 投资年化（%）
  fireNumber: number; // 目标
}

export interface FireYearsResult {
  yearsToFire: number;
  finalAssets: number;
  totalContribution: number; // 累计储蓄
  totalReturn: number; // 累计投资回报
}

export function calcFireYears(input: FireYearsInput): FireYearsResult {
  const { currentAssets, annualSavings, expectedReturnPct, fireNumber } = input;
  if (fireNumber <= 0 || currentAssets >= fireNumber) {
    return {
      yearsToFire: 0,
      finalAssets: round2(currentAssets),
      totalContribution: 0,
      totalReturn: 0,
    };
  }
  const r = expectedReturnPct / 100;
  let assets = currentAssets;
  let totalContribution = 0;
  let years = 0;
  // 上限 100 年，避免极端无解
  while (assets < fireNumber && years < 100) {
    assets = assets * (1 + r) + annualSavings;
    totalContribution += annualSavings;
    years++;
  }
  return {
    yearsToFire: years >= 100 ? -1 : years,
    finalAssets: round2(assets),
    totalContribution: round2(totalContribution),
    totalReturn: round2(assets - currentAssets - totalContribution),
  };
}

// 储蓄率 → FIRE 年数（简化：基于固定回报率与提取率）
// 经典图表：50% 储蓄率 → 17 年；75% 储蓄率 → 7 年
export interface FireSavingsRateInput {
  savingsRatePct: number; // 储蓄率（%）
  expectedReturnPct?: number; // 默认 5%
  withdrawalRatePct?: number; // 默认 4%
}

export interface FireSavingsRateResult {
  yearsToFire: number;
  description: string;
}

export function calcFireFromSavingsRate(input: FireSavingsRateInput): FireSavingsRateResult {
  const { savingsRatePct, expectedReturnPct = 5, withdrawalRatePct = 4 } = input;
  if (savingsRatePct <= 0 || savingsRatePct >= 100) {
    return { yearsToFire: -1, description: "储蓄率需在 0-100% 之间" };
  }
  // 用迭代：假设年支出为 1 单位，年储蓄 = s/(1-s) 倍年支出
  const s = savingsRatePct / 100;
  const annualSpend = 1;
  const annualSave = s / (1 - s);
  const target = annualSpend * (100 / withdrawalRatePct);
  const r = expectedReturnPct / 100;
  let assets = 0;
  let years = 0;
  while (assets < target && years < 100) {
    assets = assets * (1 + r) + annualSave;
    years++;
  }
  return {
    yearsToFire: years >= 100 ? -1 : years,
    description: years <= 10 ? "极快" : years <= 20 ? "较快" : years <= 30 ? "正常" : "偏慢",
  };
}
