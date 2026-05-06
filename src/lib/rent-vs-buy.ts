// 租房 vs 买房长期对比
// 把"买房总成本"和"租房总成本 + 机会成本"放在同一时间轴对比

import { calcMortgage } from "./mortgage.ts";

export interface RentVsBuyInput {
  // 房产
  totalPrice: number; // 总价（元）
  downPaymentPct: number; // 首付比例（%）
  loanYears: number; // 贷款年限
  loanRatePct: number; // 贷款利率（%）

  // 租房
  monthlyRent: number; // 当前月租金
  rentGrowthPct: number; // 年化租金涨幅（%）

  // 持有成本与增值
  homeAppreciationPct: number; // 年化房价涨幅（%）
  propertyTaxYearlyPct: number; // 房产税（每年总价的 %）
  maintenanceYearlyPct: number; // 维护费（每年总价的 %）

  // 投资回报
  investmentReturnPct: number; // 不买房时把首付投资的年化（%）

  // 时间窗口
  yearsToHold: number; // 持有 / 对比年数
}

export interface RentVsBuyResult {
  // 买房
  downPayment: number;
  totalMortgageCost: number; // 持有期内已付月供合计
  totalHoldingCost: number; // 房产税 + 维护
  homeValueAtEnd: number; // 期末房价
  remainingLoanAtEnd: number; // 期末剩余贷款
  buyNetCost: number; // 买房净成本 = 已付钱 - 期末房产权益
  buyEquityAtEnd: number; // 期末房产净值

  // 租房
  totalRent: number; // 累计租金
  investedFinalValue: number; // 首付 + 月供差额投资到期末
  rentNetCost: number; // 租房净成本 = 累计租金 - 投资终值

  // 比较
  buyAdvantage: number; // 买房省了多少（>0 买房划算）
  recommendation: "buy" | "rent" | "tied";
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function calcRentVsBuy(input: RentVsBuyInput): RentVsBuyResult {
  const {
    totalPrice,
    downPaymentPct,
    loanYears,
    loanRatePct,
    monthlyRent,
    rentGrowthPct,
    homeAppreciationPct,
    propertyTaxYearlyPct,
    maintenanceYearlyPct,
    investmentReturnPct,
    yearsToHold,
  } = input;

  if (totalPrice <= 0 || yearsToHold <= 0) {
    return {
      downPayment: 0,
      totalMortgageCost: 0,
      totalHoldingCost: 0,
      homeValueAtEnd: 0,
      remainingLoanAtEnd: 0,
      buyNetCost: 0,
      buyEquityAtEnd: 0,
      totalRent: 0,
      investedFinalValue: 0,
      rentNetCost: 0,
      buyAdvantage: 0,
      recommendation: "tied",
    };
  }

  const downPayment = totalPrice * downPaymentPct / 100;
  const principal = totalPrice - downPayment;
  const months = Math.min(yearsToHold, loanYears) * 12;

  // 买房：月供 + 持有成本
  const m = calcMortgage({
    principal,
    years: loanYears,
    annualRatePct: loanRatePct,
    method: "equal-installment",
  });
  const totalMortgageCost = m.firstMonthPayment * months;

  // 期末剩余贷款 = schedule[months-1].remaining（若持有期短于贷款年限）
  const remainingLoanAtEnd =
    yearsToHold >= loanYears ? 0 : (m.schedule[months - 1]?.remaining ?? 0);

  // 持有成本（按平均房价估算）
  const avgHomeValue = totalPrice * (1 + Math.pow(1 + homeAppreciationPct / 100, yearsToHold)) / 2;
  const totalHoldingCost =
    (propertyTaxYearlyPct + maintenanceYearlyPct) / 100 * avgHomeValue * yearsToHold;

  // 期末房价 + 净值
  const homeValueAtEnd = totalPrice * Math.pow(1 + homeAppreciationPct / 100, yearsToHold);
  const buyEquityAtEnd = homeValueAtEnd - remainingLoanAtEnd;
  const buyTotalCash = downPayment + totalMortgageCost + totalHoldingCost;
  const buyNetCost = buyTotalCash - buyEquityAtEnd;

  // 租房：累计租金（年金递增）
  let totalRent = 0;
  let currentRent = monthlyRent;
  for (let y = 0; y < yearsToHold; y++) {
    totalRent += currentRent * 12;
    currentRent *= 1 + rentGrowthPct / 100;
  }

  // 不买房时，把首付 + (月供 - 租金) 差额投资
  // 简化：首付一次性投入，月度复利
  const r = investmentReturnPct / 100 / 12;
  const n = yearsToHold * 12;
  const factor = r === 0 ? 1 : Math.pow(1 + r, n);
  // 首付未来值
  const downInvested = downPayment * factor;
  // 月度差额（月供 - 月租金）的累计未来值（简化：按起始月租平均，有正/负）
  const avgMonthlyRent = (monthlyRent + currentRent) / 2;
  const monthlySurplus = m.firstMonthPayment - avgMonthlyRent;
  const surplusInvested =
    r === 0 ? monthlySurplus * n : monthlySurplus * (factor - 1) / r;
  const investedFinalValue = Math.max(0, downInvested + surplusInvested);
  const rentNetCost = totalRent - (investedFinalValue - downPayment); // 租房成本扣掉投资收益
  // 注：rentNetCost 可能为负（投资收益超过累计租金，即不买房纯赚）

  const buyAdvantage = rentNetCost - buyNetCost;
  let recommendation: RentVsBuyResult["recommendation"];
  if (Math.abs(buyAdvantage) < totalPrice * 0.02) recommendation = "tied";
  else if (buyAdvantage > 0) recommendation = "buy";
  else recommendation = "rent";

  return {
    downPayment: round2(downPayment),
    totalMortgageCost: round2(totalMortgageCost),
    totalHoldingCost: round2(totalHoldingCost),
    homeValueAtEnd: round2(homeValueAtEnd),
    remainingLoanAtEnd: round2(remainingLoanAtEnd),
    buyNetCost: round2(buyNetCost),
    buyEquityAtEnd: round2(buyEquityAtEnd),
    totalRent: round2(totalRent),
    investedFinalValue: round2(investedFinalValue),
    rentNetCost: round2(rentNetCost),
    buyAdvantage: round2(buyAdvantage),
    recommendation,
  };
}
