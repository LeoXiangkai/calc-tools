// 二手房 / 一手房交易税费纯计算
// 数据口径：契税按 2025 年 12 月起执行的国家统一标准；
// 增值税与个税按各地通行做法（北上广深等限购城市），具体仍以当地税务局为准。
// 本计算结果仅供参考。

export type HouseOrder = "first" | "second"; // 家庭名下首套 / 二套
export type TransactionType = "new" | "used"; // 一手 / 二手
export type SellerHoldYears = "lt2" | "btw2_5" | "gte5"; // 持有年限分档（二手房）
export type SellerOnlyHouse = "yes" | "no"; // 是否家庭唯一住房

export interface TaxInput {
  totalPrice: number; // 网签总价（元）
  area: number; // 建筑面积（㎡）
  order: HouseOrder; // 买方家庭住房序数
  type: TransactionType;
  // 二手房专属
  originalPrice?: number; // 原值（用于个税差额计算）
  sellerHoldYears?: SellerHoldYears;
  sellerOnlyHouse?: SellerOnlyHouse;
}

export interface TaxResult {
  contractTax: number; // 契税
  valueAddedTax: number; // 增值税及附加（仅二手 / 商办 / 持有不满 2 年）
  incomeTax: number; // 个税（仅二手）
  total: number;
  breakdown: { name: string; rate: string; amount: number; note?: string }[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// 契税档位（2024-12-01 起执行，全国统一新政）
// 首套：≤140 ㎡ 1%，>140 ㎡ 1.5%
// 二套：≤140 ㎡ 1%，>140 ㎡ 2%（北上广深历史上有 3% 上限，新政统一为 2%）
function contractTaxRate(order: HouseOrder, area: number): number {
  if (order === "first") return area <= 140 ? 0.01 : 0.015;
  return area <= 140 ? 0.01 : 0.02;
}

export function calcTransactionTax(input: TaxInput): TaxResult {
  const {
    totalPrice,
    area,
    order,
    type,
    originalPrice = 0,
    sellerHoldYears = "lt2",
    sellerOnlyHouse = "no",
  } = input;

  const breakdown: TaxResult["breakdown"] = [];

  if (!Number.isFinite(totalPrice) || totalPrice <= 0 || area <= 0) {
    return {
      contractTax: 0,
      valueAddedTax: 0,
      incomeTax: 0,
      total: 0,
      breakdown: [],
    };
  }

  // 契税（不含税价 = 总价 / 1.05 在严格意义下，但实务多用网签价直接乘）
  const contractRate = contractTaxRate(order, area);
  const contractTax = round2(totalPrice * contractRate);
  breakdown.push({
    name: "契税（买方）",
    rate: `${(contractRate * 100).toFixed(1)}%`,
    amount: contractTax,
    note: order === "first" ? "首套" : "二套",
  });

  // 增值税及附加（一手房由开发商缴；这里仅二手 / 持有不满 2 年时计算）
  let vat = 0;
  if (type === "used") {
    if (sellerHoldYears === "lt2") {
      // 满 2 年以下：5.3%（5% + 0.3% 附加）按全额征
      vat = round2((totalPrice / 1.05) * 0.053);
      breakdown.push({
        name: "增值税及附加（卖方）",
        rate: "5.3%",
        amount: vat,
        note: "持有不满 2 年，全额征",
      });
    } else {
      breakdown.push({
        name: "增值税及附加（卖方）",
        rate: "免征",
        amount: 0,
        note: "持有满 2 年（非北上广深；北上广深 90㎡ 以上需差额征 5.3%，此处按多数城市口径=免征）",
      });
    }
  }

  // 个税（仅二手房）
  let incomeTax = 0;
  if (type === "used") {
    if (sellerHoldYears === "gte5" && sellerOnlyHouse === "yes") {
      breakdown.push({
        name: "个人所得税（卖方）",
        rate: "免征",
        amount: 0,
        note: "满五唯一",
      });
    } else if (originalPrice > 0 && originalPrice < totalPrice) {
      // 差额 20%
      incomeTax = round2((totalPrice - originalPrice) * 0.2);
      breakdown.push({
        name: "个人所得税（卖方）",
        rate: "差额 20%",
        amount: incomeTax,
        note: `按差额 ¥${(totalPrice - originalPrice).toLocaleString("zh-CN")}`,
      });
    } else {
      // 核定征收 1%（多数城市做法）
      incomeTax = round2(totalPrice * 0.01);
      breakdown.push({
        name: "个人所得税（卖方）",
        rate: "1%（核定）",
        amount: incomeTax,
        note: "未提供原值或原值不低于现价时按总价 1% 核定",
      });
    }
  }

  // 印花税：住宅交易免征（自 2008-11 至今），不再计入

  const total = round2(contractTax + vat + incomeTax);

  return { contractTax, valueAddedTax: vat, incomeTax, total, breakdown };
}
