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
  const months = Math.round(Math.min(yearsToHold, loanYears) * 12);

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

  // 持有成本：逐年累加（避免首末算术平均的偏差）
  let totalHoldingCost = 0;
  {
    let homeValue = totalPrice;
    const yearsInt = Math.floor(yearsToHold);
    const fracYear = yearsToHold - yearsInt;
    for (let y = 1; y <= yearsInt; y++) {
      homeValue *= 1 + homeAppreciationPct / 100;
      totalHoldingCost += (propertyTaxYearlyPct + maintenanceYearlyPct) / 100 * homeValue;
    }
    if (fracYear > 0) {
      homeValue *= 1 + (homeAppreciationPct / 100) * fracYear;
      totalHoldingCost += (propertyTaxYearlyPct + maintenanceYearlyPct) / 100 * homeValue * fracYear;
    }
  }

  // 期末房价 + 净值
  const homeValueAtEnd = totalPrice * Math.pow(1 + homeAppreciationPct / 100, yearsToHold);
  const buyEquityAtEnd = homeValueAtEnd - remainingLoanAtEnd;
  const buyTotalCash = downPayment + totalMortgageCost + totalHoldingCost;
  const buyNetCost = buyTotalCash - buyEquityAtEnd;

  // 租房 + 投资：逐月模拟
  // 起点：首付投入金融市场；每月按月利率复利，再加 (月供 - 当月租金) 差额
  // 月供仅在贷款期内计入，超出贷款期后置 0
  const monthlyReturn = investmentReturnPct / 100 / 12;
  const monthsTotal = Math.round(yearsToHold * 12);
  const loanMonths = loanYears * 12;
  let investedBalance = downPayment;
  let totalRent = 0;
  let currentRent = monthlyRent;
  for (let mi = 1; mi <= monthsTotal; mi++) {
    // 月初投资先按月利率增长
    investedBalance *= 1 + monthlyReturn;
    // 计入月供（贷款期内恒定为 firstMonthPayment；等额本息）
    const monthlyPayment = mi <= loanMonths ? m.firstMonthPayment : 0;
    // 月度差额计入投资账户：月供 - 当月租金
    investedBalance += monthlyPayment - currentRent;
    totalRent += currentRent;
    // 每满 12 个月租金按年涨幅上调
    if (mi % 12 === 0) {
      currentRent *= 1 + rentGrowthPct / 100;
    }
  }
  // 允许 investedBalance 为负（首付被高租金耗尽，账户欠债，含义清晰）
  const investedFinalValue = investedBalance;
  // 租房净成本 = 累计租金 - (投资账户增值 - 起初首付)
  // 当 investedFinalValue < downPayment 时，差额为负，rentNetCost 反而比 totalRent 还大（合理）
  const rentNetCost = totalRent - (investedFinalValue - downPayment);

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
