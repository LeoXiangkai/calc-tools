// 复利计算 - 纯函数，无副作用
// 公式参考标准时间价值（TVM）：
// - 单笔复利：FV = P × (1 + r)^n
// - 年金终值（定投）：FV = M × [(1 + r)^n − 1] / r
// - 年金现值（反推月供）：M = FV × r / [(1 + r)^n − 1]
// 所有函数 r 为期收益率，n 为期数；月度计算时 r = 年化/12，n = 年限×12

const round2 = (n: number): number => Math.round(n * 100) / 100;

export type Compounding = "monthly" | "annually";

// ---------- 1. 单笔复利 ----------
export interface LumpSumInput {
  principal: number; // 本金
  annualRatePct: number; // 年化收益率（%）
  years: number; // 年限
  compounding?: Compounding; // 默认 monthly
}

export interface YearlyRow {
  year: number;
  cumulativePrincipal: number;
  cumulativeInterest: number;
  endingBalance: number;
}

export interface LumpSumResult {
  futureValue: number;
  totalInterest: number;
  multiple: number; // 翻倍倍数 = FV / P
  yearly: YearlyRow[]; // 按年明细
}

export function calcLumpSum(input: LumpSumInput): LumpSumResult {
  const { principal: P, annualRatePct, years, compounding = "monthly" } = input;
  if (!Number.isFinite(P) || P <= 0 || !Number.isFinite(years) || years <= 0) {
    return { futureValue: 0, totalInterest: 0, multiple: 0, yearly: [] };
  }
  const periodsPerYear = compounding === "monthly" ? 12 : 1;
  const r = annualRatePct / 100 / periodsPerYear;
  const yearly: YearlyRow[] = [];
  for (let y = 1; y <= Math.floor(years); y++) {
    const n = y * periodsPerYear;
    const fv = P * Math.pow(1 + r, n);
    yearly.push({
      year: y,
      cumulativePrincipal: round2(P),
      cumulativeInterest: round2(fv - P),
      endingBalance: round2(fv),
    });
  }
  const totalPeriods = years * periodsPerYear;
  const futureValue = P * Math.pow(1 + r, totalPeriods);
  return {
    futureValue: round2(futureValue),
    totalInterest: round2(futureValue - P),
    multiple: round2(futureValue / P),
    yearly,
  };
}

// ---------- 2. 定投终值 ----------
export interface DcaInput {
  monthlyContribution: number; // 每月投入
  annualRatePct: number; // 年化收益率
  years: number; // 年限
  initialPrincipal?: number; // 初始本金（一次性）
}

export interface DcaResult {
  futureValue: number;
  totalContribution: number; // 累计本金（含初始）
  totalInterest: number;
  yearly: YearlyRow[];
}

export function calcDca(input: DcaInput): DcaResult {
  const { monthlyContribution: M, annualRatePct, years, initialPrincipal = 0 } = input;
  if (!Number.isFinite(M) || M < 0 || !Number.isFinite(years) || years <= 0) {
    return { futureValue: 0, totalContribution: 0, totalInterest: 0, yearly: [] };
  }
  const r = annualRatePct / 100 / 12;
  const totalMonths = Math.round(years * 12);
  const yearly: YearlyRow[] = [];
  let balance = initialPrincipal;
  let cumulativeP = initialPrincipal;
  for (let m = 1; m <= totalMonths; m++) {
    balance = balance * (1 + r) + M;
    cumulativeP += M;
    if (m % 12 === 0) {
      yearly.push({
        year: m / 12,
        cumulativePrincipal: round2(cumulativeP),
        cumulativeInterest: round2(balance - cumulativeP),
        endingBalance: round2(balance),
      });
    }
  }
  return {
    futureValue: round2(balance),
    totalContribution: round2(cumulativeP),
    totalInterest: round2(balance - cumulativeP),
    yearly,
  };
}

// ---------- 3. 目标反推：达到目标金额需要每月投入多少 ----------
export interface GoalInput {
  goalAmount: number; // 目标金额
  annualRatePct: number; // 年化
  years: number; // 年限
  initialPrincipal?: number; // 已有本金
}

export interface GoalResult {
  monthlyRequired: number;
  totalContribution: number;
  totalInterest: number;
}

export function calcGoal(input: GoalInput): GoalResult {
  const { goalAmount: FV, annualRatePct, years, initialPrincipal = 0 } = input;
  if (!Number.isFinite(FV) || FV <= 0 || !Number.isFinite(years) || years <= 0) {
    return { monthlyRequired: 0, totalContribution: 0, totalInterest: 0 };
  }
  const r = annualRatePct / 100 / 12;
  const n = Math.round(years * 12);
  // 已有本金的未来终值（按月复利增长到目标年）
  const principalGrown = initialPrincipal * Math.pow(1 + r, n);
  const remainingFV = FV - principalGrown;
  if (remainingFV <= 0) {
    return {
      monthlyRequired: 0,
      totalContribution: round2(initialPrincipal),
      totalInterest: round2(FV - initialPrincipal),
    };
  }
  // M = FV × r / [(1+r)^n - 1]   r=0 退化为均摊
  const monthlyRequired =
    r === 0 ? remainingFV / n : (remainingFV * r) / (Math.pow(1 + r, n) - 1);
  const totalContribution = initialPrincipal + monthlyRequired * n;
  return {
    monthlyRequired: round2(monthlyRequired),
    totalContribution: round2(totalContribution),
    totalInterest: round2(FV - totalContribution),
  };
}

// ---------- 4. 通胀调整：把名义终值换算为今天的实际购买力 ----------
export interface InflationInput {
  nominalValue: number; // 未来某期的名义金额
  inflationRatePct: number; // 年通胀率
  years: number; // 经过的年数
}

export interface InflationResult {
  realValue: number; // 折现到今天的实际购买力
  erodedAmount: number; // 被通胀侵蚀的金额
  erodedPct: number; // 侵蚀比例
}

export function calcInflation(input: InflationInput): InflationResult {
  const { nominalValue: FV, inflationRatePct, years } = input;
  if (!Number.isFinite(FV) || FV <= 0 || !Number.isFinite(years) || years < 0) {
    return { realValue: 0, erodedAmount: 0, erodedPct: 0 };
  }
  const i = inflationRatePct / 100;
  const realValue = FV / Math.pow(1 + i, years);
  return {
    realValue: round2(realValue),
    erodedAmount: round2(FV - realValue),
    erodedPct: round2(((FV - realValue) / FV) * 100),
  };
}

// ---------- 5. 机会对比：投资 vs 不投资（以现金贬值估算） ----------
export interface OpportunityInput {
  amount: number; // 一次性资金
  investRatePct: number; // 投资年化收益
  inflationRatePct: number; // 通胀率
  years: number;
}

export interface OpportunityResult {
  invested: number; // 投资到期名义价值
  investedReal: number; // 投资实际购买力（扣通胀）
  uninvested: number; // 不投资保留的现金（名义不变）
  uninvestedReal: number; // 不投资实际购买力（被通胀侵蚀）
  opportunityCost: number; // 机会成本（不投资 vs 投资 实际差额）
}

export function calcOpportunity(input: OpportunityInput): OpportunityResult {
  const { amount, investRatePct, inflationRatePct, years } = input;
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(years) || years <= 0) {
    return {
      invested: 0,
      investedReal: 0,
      uninvested: 0,
      uninvestedReal: 0,
      opportunityCost: 0,
    };
  }
  const r = investRatePct / 100 / 12;
  const i = inflationRatePct / 100;
  const months = Math.round(years * 12);
  const invested = amount * Math.pow(1 + r, months);
  const investedReal = invested / Math.pow(1 + i, years);
  const uninvested = amount;
  const uninvestedReal = amount / Math.pow(1 + i, years);
  return {
    invested: round2(invested),
    investedReal: round2(investedReal),
    uninvested: round2(uninvested),
    uninvestedReal: round2(uninvestedReal),
    opportunityCost: round2(investedReal - uninvestedReal),
  };
}

// ---------- 工具：72 法则估算翻倍年数 ----------
export const rule72 = (annualRatePct: number): number => {
  if (!Number.isFinite(annualRatePct) || annualRatePct <= 0) return 0;
  return round2(72 / annualRatePct);
};
