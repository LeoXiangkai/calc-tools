// 房贷相关纯函数：基础月供、组合贷、提前还款、利率重定价、购房力反推
// 公式参考人民银行公布的标准还款方式 + 各银行通用做法

export type RepaymentMethod = "equal-installment" | "equal-principal";

export interface MortgageInput {
  principal: number; // 贷款本金（元）
  years: number; // 贷款年限（年）
  annualRatePct: number; // 年利率（%）
  method: RepaymentMethod;
}

export interface MonthlyRow {
  month: number;
  payment: number;
  principal: number;
  interest: number;
  remaining: number;
}

export interface MortgageResult {
  firstMonthPayment: number;
  lastMonthPayment: number;
  totalInterest: number;
  totalPayment: number;
  schedule: MonthlyRow[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const isPositive = (n: number) => Number.isFinite(n) && n > 0;

const EMPTY_RESULT: MortgageResult = {
  firstMonthPayment: 0,
  lastMonthPayment: 0,
  totalInterest: 0,
  totalPayment: 0,
  schedule: [],
};

// ----- 基础：等额本息 / 等额本金 -----

export function calcMortgage(input: MortgageInput): MortgageResult {
  const { principal: P, years, annualRatePct, method } = input;
  const n = Math.round(years * 12);
  const r = annualRatePct / 100 / 12;

  if (!isPositive(P) || !isPositive(n) || r < 0 || !Number.isFinite(r)) {
    return { ...EMPTY_RESULT };
  }

  const schedule: MonthlyRow[] = [];

  if (method === "equal-installment") {
    const monthly =
      r === 0 ? P / n : (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    let remaining = P;
    for (let m = 1; m <= n; m++) {
      const interest = remaining * r;
      const principalPart = monthly - interest;
      remaining = Math.max(0, remaining - principalPart);
      schedule.push({
        month: m,
        payment: round2(monthly),
        principal: round2(principalPart),
        interest: round2(interest),
        remaining: round2(remaining),
      });
    }
    const totalPayment = round2(monthly * n);
    return {
      firstMonthPayment: round2(monthly),
      lastMonthPayment: round2(monthly),
      totalInterest: round2(totalPayment - P),
      totalPayment,
      schedule,
    };
  }

  // 等额本金
  const principalPerMonth = P / n;
  let remaining = P;
  let totalPayment = 0;
  for (let m = 1; m <= n; m++) {
    const interest = remaining * r;
    const payment = principalPerMonth + interest;
    remaining = Math.max(0, remaining - principalPerMonth);
    totalPayment += payment;
    schedule.push({
      month: m,
      payment: round2(payment),
      principal: round2(principalPerMonth),
      interest: round2(interest),
      remaining: round2(remaining),
    });
  }
  return {
    firstMonthPayment: schedule[0].payment,
    lastMonthPayment: schedule[schedule.length - 1].payment,
    totalInterest: round2(totalPayment - P),
    totalPayment: round2(totalPayment),
    schedule,
  };
}

// ----- 组合贷：商贷 + 公积金 -----

export interface CombinedInput {
  commercial: { principal: number; years: number; annualRatePct: number };
  housingFund: { principal: number; years: number; annualRatePct: number };
  method: RepaymentMethod;
}

export interface CombinedResult {
  commercial: MortgageResult;
  housingFund: MortgageResult;
  // 合并视角（按月相加）
  firstMonthPayment: number;
  totalInterest: number;
  totalPayment: number;
}

export function calcCombined(input: CombinedInput): CombinedResult {
  const c = calcMortgage({ ...input.commercial, method: input.method });
  const h = calcMortgage({ ...input.housingFund, method: input.method });
  return {
    commercial: c,
    housingFund: h,
    firstMonthPayment: round2(c.firstMonthPayment + h.firstMonthPayment),
    totalInterest: round2(c.totalInterest + h.totalInterest),
    totalPayment: round2(c.totalPayment + h.totalPayment),
  };
}

// ----- 提前还款 -----

export type PrepayStrategy =
  | "shorten-term" // 缩短年限，月供不变
  | "reduce-payment"; // 减少月供，年限不变

export interface PrepayInput {
  // 原始贷款
  principal: number;
  years: number;
  annualRatePct: number;
  method: RepaymentMethod;
  // 提前还款动作
  prepayAtMonth: number; // 在第几次月供后提前还款（1 表示首次还款后）
  prepayAmount: number; // 提前还款金额（元）
  strategy: PrepayStrategy;
}

export interface PrepayResult {
  baseTotalInterest: number; // 不提前还款的总利息
  newTotalInterest: number; // 提前还款后的总利息
  interestSaved: number;
  // 缩短年限专属
  monthsSaved?: number;
  newRemainingMonths?: number;
  // 减少月供专属
  newMonthlyPayment?: number;
  oldMonthlyPayment?: number;
}

export function calcPrepay(input: PrepayInput): PrepayResult | null {
  const base = calcMortgage({
    principal: input.principal,
    years: input.years,
    annualRatePct: input.annualRatePct,
    method: input.method,
  });
  if (base.schedule.length === 0) return null;

  const k = Math.max(1, Math.floor(input.prepayAtMonth));
  if (k > base.schedule.length) return null;

  // 累计已付利息（前 k 期）
  let paidInterest = 0;
  for (let i = 0; i < k; i++) paidInterest += base.schedule[i].interest;

  const remainingPrincipal = base.schedule[k - 1].remaining;
  const prepay = Math.min(input.prepayAmount, remainingPrincipal);
  const newPrincipal = remainingPrincipal - prepay;
  const r = input.annualRatePct / 100 / 12;

  if (newPrincipal <= 0) {
    // 一次性还清
    return {
      baseTotalInterest: base.totalInterest,
      newTotalInterest: round2(paidInterest),
      interestSaved: round2(base.totalInterest - paidInterest),
      monthsSaved: base.schedule.length - k,
      newRemainingMonths: 0,
    };
  }

  if (input.strategy === "shorten-term") {
    // 缩短年限：等额本息保持原月供，等额本金保持原本金部分
    if (input.method === "equal-installment") {
      const monthly = base.schedule[0].payment;
      // 求解 n 使 newPrincipal = monthly * (1-(1+r)^-n)/r
      // 直接迭代摊销直到余额清零
      let remaining = newPrincipal;
      let m = 0;
      let interestPart = 0;
      while (remaining > 0.01 && m < 360 * 2) {
        m++;
        const i = remaining * r;
        const p = Math.min(monthly - i, remaining);
        remaining -= p;
        interestPart += i;
      }
      return {
        baseTotalInterest: base.totalInterest,
        newTotalInterest: round2(paidInterest + interestPart),
        interestSaved: round2(base.totalInterest - paidInterest - interestPart),
        monthsSaved: base.schedule.length - k - m,
        newRemainingMonths: m,
      };
    }
    // 等额本金缩短年限：每月本金部分不变，重新计算剩余月数
    const principalPerMonth = base.schedule[0].principal;
    const remainingMonths = Math.ceil(newPrincipal / principalPerMonth);
    let remaining = newPrincipal;
    let interestPart = 0;
    for (let m = 0; m < remainingMonths; m++) {
      const i = remaining * r;
      interestPart += i;
      remaining -= Math.min(principalPerMonth, remaining);
    }
    return {
      baseTotalInterest: base.totalInterest,
      newTotalInterest: round2(paidInterest + interestPart),
      interestSaved: round2(base.totalInterest - paidInterest - interestPart),
      monthsSaved: base.schedule.length - k - remainingMonths,
      newRemainingMonths: remainingMonths,
    };
  }

  // reduce-payment：年限不变，月供减少
  const remainingMonths = base.schedule.length - k;
  if (input.method === "equal-installment") {
    const newMonthly =
      r === 0
        ? newPrincipal / remainingMonths
        : (newPrincipal * r * Math.pow(1 + r, remainingMonths)) /
          (Math.pow(1 + r, remainingMonths) - 1);
    const interestPart = newMonthly * remainingMonths - newPrincipal;
    return {
      baseTotalInterest: base.totalInterest,
      newTotalInterest: round2(paidInterest + interestPart),
      interestSaved: round2(base.totalInterest - paidInterest - interestPart),
      newMonthlyPayment: round2(newMonthly),
      oldMonthlyPayment: base.schedule[0].payment,
    };
  }
  // 等额本金减少月供：剩余本金按剩余月数重分
  const newPrincipalPerMonth = newPrincipal / remainingMonths;
  let remaining = newPrincipal;
  let interestPart = 0;
  for (let m = 0; m < remainingMonths; m++) {
    interestPart += remaining * r;
    remaining -= newPrincipalPerMonth;
  }
  return {
    baseTotalInterest: base.totalInterest,
    newTotalInterest: round2(paidInterest + interestPart),
    interestSaved: round2(base.totalInterest - paidInterest - interestPart),
    newMonthlyPayment: round2(newPrincipalPerMonth + newPrincipal * r),
    oldMonthlyPayment: base.schedule[0].payment,
  };
}

// ----- 利率重定价（LPR 调整后） -----

export interface RepricingInput {
  principal: number;
  years: number;
  oldAnnualRatePct: number;
  newAnnualRatePct: number;
  repriceAtMonth: number; // 在第几月重定价
  method: RepaymentMethod;
}

export interface RepricingResult {
  oldMonthlyPayment: number;
  newMonthlyPayment: number;
  monthlyDelta: number; // 新 - 旧（负数=减少）
  totalInterestDelta: number;
}

export function calcRepricing(input: RepricingInput): RepricingResult | null {
  const base = calcMortgage({
    principal: input.principal,
    years: input.years,
    annualRatePct: input.oldAnnualRatePct,
    method: input.method,
  });
  if (base.schedule.length === 0) return null;

  const k = Math.max(1, Math.floor(input.repriceAtMonth));
  if (k > base.schedule.length) return null;

  const remainingPrincipal = base.schedule[k - 1].remaining;
  const remainingMonths = base.schedule.length - k;
  if (remainingPrincipal <= 0 || remainingMonths <= 0) return null;

  // 用新利率重新计算剩余部分
  const after = calcMortgage({
    principal: remainingPrincipal,
    years: remainingMonths / 12,
    annualRatePct: input.newAnnualRatePct,
    method: input.method,
  });

  // 旧路径剩余总利息
  let oldRemainingInterest = 0;
  for (let i = k; i < base.schedule.length; i++) {
    oldRemainingInterest += base.schedule[i].interest;
  }

  return {
    oldMonthlyPayment: base.schedule[0].payment,
    newMonthlyPayment: after.firstMonthPayment,
    monthlyDelta: round2(after.firstMonthPayment - base.schedule[0].payment),
    totalInterestDelta: round2(after.totalInterest - oldRemainingInterest),
  };
}

// ----- 购房力反推：按月供承受能力反推可贷额与可买总价 -----

export interface AffordabilityInput {
  monthlyIncome: number; // 家庭税后月收入（元）
  paymentRatioPct: number; // 月供占收入上限（%，常见 30-50）
  years: number;
  annualRatePct: number;
  downPaymentRatioPct: number; // 首付比例（%，常见 30、40、70 二套）
}

export interface AffordabilityResult {
  maxMonthlyPayment: number;
  maxLoanPrincipal: number;
  maxTotalPrice: number;
  maxDownPayment: number;
}

// 等额本息反推本金：P = M * ((1+r)^n - 1) / (r * (1+r)^n)
export function calcAffordability(
  input: AffordabilityInput,
): AffordabilityResult {
  const {
    monthlyIncome,
    paymentRatioPct,
    years,
    annualRatePct,
    downPaymentRatioPct,
  } = input;

  if (
    !isPositive(monthlyIncome) ||
    !isPositive(paymentRatioPct) ||
    !isPositive(years) ||
    annualRatePct < 0 ||
    !isPositive(100 - downPaymentRatioPct)
  ) {
    return {
      maxMonthlyPayment: 0,
      maxLoanPrincipal: 0,
      maxTotalPrice: 0,
      maxDownPayment: 0,
    };
  }

  const M = monthlyIncome * (paymentRatioPct / 100);
  const n = Math.round(years * 12);
  const r = annualRatePct / 100 / 12;

  const maxLoan =
    r === 0 ? M * n : (M * (Math.pow(1 + r, n) - 1)) / (r * Math.pow(1 + r, n));

  const loanRatio = (100 - downPaymentRatioPct) / 100;
  const maxTotalPrice = loanRatio > 0 ? maxLoan / loanRatio : 0;
  const maxDownPayment = maxTotalPrice * (downPaymentRatioPct / 100);

  return {
    maxMonthlyPayment: round2(M),
    maxLoanPrincipal: round2(maxLoan),
    maxTotalPrice: round2(maxTotalPrice),
    maxDownPayment: round2(maxDownPayment),
  };
}

// ----- 工具 -----

export const fmtCny = (n: number): string =>
  n.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const fmtWan = (n: number): string => {
  if (!Number.isFinite(n)) return "—";
  return (n / 10000).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};
