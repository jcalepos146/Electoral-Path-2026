import history from "@/data/historical-generic.json";

export const ELECTION_DATE_2026 = "2026-11-03";

export type Analog = {
  year: number;
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

const curve = history.curve as CurvePoint[];

export function daysUntilElection(dateString: string): number {
  const snapshot = new Date(`${dateString}T12:00:00Z`);
  const election = new Date(`${ELECTION_DATE_2026}T12:00:00Z`);
  return Math.max(0, Math.round((election.getTime() - snapshot.getTime()) / 86_400_000));
}

export function nearestCurvePoint(daysToElection: number): CurvePoint {
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
) {
  const days = daysUntilElection(snapshotDate);
  const point = nearestCurvePoint(days);
  const currentMargin = dem - rep;
  const correction = useMedian ? point.medianCorrection : point.meanCorrection;
  const projectedMargin = currentMargin + correction;

  // RCP-style polls can leave a large undecided/other bucket. Directly adding
  // historical D and R share changes can push the two major parties over 100%.
  // Instead, use the historical mean final major-party vote total and split it
  // according to the projected margin.
  const majorPartyTotal = Number(modelMeta.meanFinalMajorPartyTotal);
  const projectedDem = (majorPartyTotal + projectedMargin) / 2;
  const projectedRep = (majorPartyTotal - projectedMargin) / 2;
  const projectedOther = 100 - majorPartyTotal;

  return {
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

export function formatMargin(margin: number, digits = 1): string {
  if (Math.abs(margin) < 0.05) return "TIE";
  return `${margin > 0 ? "D" : "R"}+${Math.abs(margin).toFixed(digits)}`;
}

export const historicalCurve = curve;
export const modelMeta = history.meta;
