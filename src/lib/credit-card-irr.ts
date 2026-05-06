// 信用卡分期 / 消费贷真实年化（IRR）计算
// 银行用"月费率"标识分期，掩盖了真实利率
// 例：12 期月费率 0.6% → 表面年化 7.2%，实际 IRR 约 13.2%

export interface InstallmentInput {
  principal: number; // 分期本金（元）
  monthlyFeePct: number; // 月费率（%，例如 0.6）
  months: number; // 分期数
}

export interface InstallmentResult {
  monthlyPayment: number; // 每期还款（本金 + 手续费）
  totalFee: number; // 总手续费
  nominalAprPct: number; // 名义年化（月费率 × 12）
  irrAnnualPct: number; // 真实 IRR 年化
  irrMultiple: number; // 真实利率是名义的倍数
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// 用二分法求 IRR：n 期等额还款 M，本金 P，使
// P = M × [1 - (1+r)^(-n)] / r 成立时的月利率 r
function solveMonthlyIrr(principal: number, monthlyPayment: number, n: number): number {
  let lo = 0.0;
  let hi = 1.0; // 月利率上限 100%
  // 单调函数：r 越大，PV 越小
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (mid < 1e-12) return 0;
    const pv = (monthlyPayment * (1 - Math.pow(1 + mid, -n))) / mid;
    if (pv > principal) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-9) break;
  }
  return (lo + hi) / 2;
}

export function calcInstallmentIrr(input: InstallmentInput): InstallmentResult {
  const { principal, monthlyFeePct, months } = input;
  if (principal <= 0 || monthlyFeePct < 0 || months <= 0) {
    return {
      monthlyPayment: 0,
      totalFee: 0,
      nominalAprPct: 0,
      irrAnnualPct: 0,
      irrMultiple: 0,
    };
  }
  const monthlyFee = principal * monthlyFeePct / 100;
  const monthlyPrincipal = principal / months;
  const monthlyPayment = monthlyPrincipal + monthlyFee;
  const totalFee = monthlyFee * months;
  const nominalAprPct = monthlyFeePct * 12;
  const monthlyIrr = solveMonthlyIrr(principal, monthlyPayment, months);
  const irrAnnualPct = (Math.pow(1 + monthlyIrr, 12) - 1) * 100;
  const irrMultiple = nominalAprPct > 0 ? irrAnnualPct / nominalAprPct : 0;
  return {
    monthlyPayment: round2(monthlyPayment),
    totalFee: round2(totalFee),
    nominalAprPct: round2(nominalAprPct),
    irrAnnualPct: round2(irrAnnualPct),
    irrMultiple: round2(irrMultiple),
  };
}

// 提前还款是否划算：剩余本金 + 提前结清违约金 vs 继续还的剩余手续费
export interface EarlyPayoffInput {
  principal: number;
  monthlyFeePct: number;
  totalMonths: number;
  paidMonths: number; // 已还期数
  earlyPayoffPenaltyPct?: number; // 提前结清违约金（剩余本金的 %）
}

export interface EarlyPayoffResult {
  remainingPrincipal: number;
  remainingFee: number; // 不提前还的话剩余手续费
  payoffPenalty: number;
  netSaving: number; // 提前结清节省（>0 划算）
  recommendation: "early-payoff" | "continue";
}

export function calcEarlyPayoff(input: EarlyPayoffInput): EarlyPayoffResult {
  const { principal, monthlyFeePct, totalMonths, paidMonths, earlyPayoffPenaltyPct = 0 } = input;
  if (paidMonths >= totalMonths) {
    return { remainingPrincipal: 0, remainingFee: 0, payoffPenalty: 0, netSaving: 0, recommendation: "continue" };
  }
  const remainMonths = totalMonths - paidMonths;
  const remainingPrincipal = principal * remainMonths / totalMonths;
  const monthlyFee = principal * monthlyFeePct / 100;
  const remainingFee = monthlyFee * remainMonths;
  const payoffPenalty = remainingPrincipal * earlyPayoffPenaltyPct / 100;
  const netSaving = remainingFee - payoffPenalty;
  return {
    remainingPrincipal: round2(remainingPrincipal),
    remainingFee: round2(remainingFee),
    payoffPenalty: round2(payoffPenalty),
    netSaving: round2(netSaving),
    recommendation: netSaving > 0 ? "early-payoff" : "continue",
  };
}
