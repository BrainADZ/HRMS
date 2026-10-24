// HR supplies approved component amounts; eligibility and taxes remain explicit.
export function calculateSettlement(components) {
  const result = {};
  for (const key of [
    'earnedSalary',
    'leaveEncashment',
    'gratuity',
    'otherEarnings',
    'recoveries',
  ]) {
    const value = Number(components?.[key] ?? 0);
    if (!Number.isFinite(value) || value < 0 || value > 100000000)
      throw new Error(`Invalid ${key} amount`);
    result[key] = Math.round(value * 100) / 100;
  }
  const amount =
    Math.round(
      (result.earnedSalary +
        result.leaveEncashment +
        result.gratuity +
        result.otherEarnings -
        result.recoveries) *
        100,
    ) / 100;
  if (amount < 0 || amount > 100000000)
    throw new Error('Net settlement must be between zero and 100000000');
  return { components: result, amount };
}
