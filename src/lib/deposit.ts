// 存款收益计算：整存整取、大额存单、储蓄国债

export interface DepositInput {
  principal: number; // 本金（元）
  annualRatePct: number; // 年化利率（%）
  years: number; // 期限（年）
  compounding?: "simple" | "annual"; // 储蓄国债复利按年计；定存到期一次性结算可视作 simple
}

export interface DepositResult {
  futureValue: number;
  totalInterest: number;
  effectiveAnnualPct: number; // 实际年化（用于跨产品比较）
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function calcDeposit(input: DepositInput): DepositResult {
  const { principal, annualRatePct, years, compounding = "simple" } = input;
  if (principal <= 0 || annualRatePct < 0 || years <= 0) {
    return { futureValue: 0, totalInterest: 0, effectiveAnnualPct: 0 };
  }
  const r = annualRatePct / 100;
  const fv =
    compounding === "annual"
      ? principal * Math.pow(1 + r, years)
      : principal * (1 + r * years);
  const interest = fv - principal;
  const eff = (Math.pow(fv / principal, 1 / years) - 1) * 100;
  return {
    futureValue: round2(fv),
    totalInterest: round2(interest),
    effectiveAnnualPct: round2(eff),
  };
}

// 多产品对比
export interface DepositCompareItem {
  name: string;
  annualRatePct: number;
  years: number;
  compounding?: "simple" | "annual";
  threshold?: number; // 起存金额
}

export function compareDeposits(
  principal: number,
  items: DepositCompareItem[],
): Array<DepositResult & { name: string; eligible: boolean; threshold?: number }> {
  return items.map((item) => {
    const eligible = !item.threshold || principal >= item.threshold;
    const r = eligible
      ? calcDeposit({
          principal,
          annualRatePct: item.annualRatePct,
          years: item.years,
          compounding: item.compounding,
        })
      : { futureValue: 0, totalInterest: 0, effectiveAnnualPct: 0 };
    return { ...r, name: item.name, eligible, threshold: item.threshold };
  });
}
