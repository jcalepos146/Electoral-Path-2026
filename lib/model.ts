import history from "@/data/historical-generic.json";

export const ELECTION_DATE_2026 = "2026-11-03";

export type HistoricalGroupKey =
  | "presidential"
  | "midterm"
  | "overall"
  | "low_turnout_midterm"
  | "high_turnout_midterm";

export type Analog = {
  year: number;
  cycleType: "presidential" | "midterm";
  turnoutClass?: "low" | "high" | null;
  turnoutCVAP?: number | null;
  pollCount: number;
  snapshotMargin: number;
  snapshotDem: number;
  snapshotRep: number;
  finalMargin: number;
  correction: number;
  demChange: number;
  repChange: number;
};

export type CurvePoint = {
  daysToElection: number;
  cycles: number;
  meanCorrection: number;
  medianCorrection: number;
  stdevCorrection: number | null;
  minCorrection: number;
  maxCorrection: number;
  meanDemChange: number;
  meanRepChange: number;
  analogs: Analog[];
};

export type HistoricalGroup = {
  key: HistoricalGroupKey;
  label: string;
  description: string;
  years: number[];
  meanFinalMajorPartyTotal: number;
  meanFinalOtherShare: number;
  curve: CurvePoint[];
};

const groups = history.groups as Record<HistoricalGroupKey, HistoricalGroup>;

export const HISTORICAL_GROUP_ORDER: HistoricalGroupKey[] = [
  "presidential",
  "midterm",
  "overall",
  "low_turnout_midterm",
  "high_turnout_midterm",
];

export const historicalGroups = groups;
export const modelMeta = history.meta;

export function daysUntilElection(dateString: string): number {
  const snapshot = new Date(`${dateString}T12:00:00Z`);
  const election = new Date(`${ELECTION_DATE_2026}T12:00:00Z`);
  return Math.max(0, Math.round((election.getTime() - snapshot.getTime()) / 86_400_000));
}

export function nearestCurvePoint(daysToElection: number, group: HistoricalGroupKey = "midterm"): CurvePoint {
  const curve = groups[group].curve;
  return curve.reduce((best, point) =>
    Math.abs(point.daysToElection - daysToElection) <
    Math.abs(best.daysToElection - daysToElection)
      ? point
      : best,
  );
}

export function forecast(
  dem: number,
  rep: number,
  snapshotDate: string,
  useMedian = false,
  group: HistoricalGroupKey = "midterm",
) {
  const days = daysUntilElection(snapshotDate);
  const point = nearestCurvePoint(days, group);
  const currentMargin = dem - rep;
  const correction = useMedian ? point.medianCorrection : point.meanCorrection;
  const projectedMargin = currentMargin + correction;

  const majorPartyTotal = Number(groups[group].meanFinalMajorPartyTotal);
  const projectedDem = (majorPartyTotal + projectedMargin) / 2;
  const projectedRep = (majorPartyTotal - projectedMargin) / 2;
  const projectedOther = 100 - majorPartyTotal;

  return {
    group,
    groupMeta: groups[group],
    days,
    point,
    currentMargin,
    correction,
    projectedMargin,
    projectedDem,
    projectedRep,
    projectedOther,
    rangeLow: currentMargin + point.minCorrection,
    rangeHigh: currentMargin + point.maxCorrection,
  };
}

export function allGroupForecasts(
  dem: number,
  rep: number,
  snapshotDate: string,
  useMedian = false,
) {
  return HISTORICAL_GROUP_ORDER.map((group) => forecast(dem, rep, snapshotDate, useMedian, group));
}

export function formatMargin(margin: number, digits = 1): string {
  if (Math.abs(margin) < 0.05) return "TIE";
  return `${margin > 0 ? "D" : "R"}+${Math.abs(margin).toFixed(digits)}`;
}
