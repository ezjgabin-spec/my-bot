// Planning and guarded launch configuration. No Stripe products are changed here.
// The Free allowance is activated only after owner approval AND configuring
// a real sustainable provider-cost budget. Existing customers keep old billing
// terms until the owner explicitly enables a migration.
export const GEN2_PRICES_CENTS={free:0,study:499,plus:999} as const;
export const GEN2_FREE_TESTS={signup:3,monthly:2} as const;
export const gen2TrialEnabled=()=>process.env.GEN2_FREE_TRIAL_ENABLED==="1";
export function gen2FreeBudgetMicros(){
 const value=Number(process.env.GEN2_FREE_MONTHLY_BUDGET_MICROS);
 if(!Number.isSafeInteger(value)||value<100_000||value>10_000_000)
  throw new Error("Configure GEN2_FREE_MONTHLY_BUDGET_MICROS before enabling the Gen 2 Free trial. Measure real AI costs first.");
 return value;
}
export function nextUtcMonth(now:Date){
 return new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1)).toISOString();
}
