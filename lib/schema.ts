import { z } from "zod";

const party = z.object({
  acquirer: z.array(z.string()).describe("Firms advising the acquirer/buyer"),
  target: z.array(z.string()).describe("Firms advising the target/seller"),
});

export const DealSchema = z.object({
  summary: z.string().describe("2-3 sentence plain-English summary of the deal"),

  // Core deal terms
  acquirer: z.string().nullable(),
  target: z.string().nullable(),
  seller: z
    .string()
    .nullable()
    .describe("Who is selling the target, if different from the target's public shareholders"),
  deal_value: z
    .number()
    .nullable()
    .describe("Headline deal value as a plain number in the stated currency (e.g. 2500000000)"),
  currency: z.string().nullable().describe("ISO currency code, e.g. USD, EUR"),
  announcement_date: z.string().nullable().describe("YYYY-MM-DD"),
  expected_closing: z
    .string()
    .nullable()
    .describe("Expected closing date or period as stated, e.g. 'Q2 2027' or '2027-03-31'"),
  status: z
    .enum(["rumored", "announced", "pending", "completed", "terminated", "unknown"])
    .describe("Current deal status"),

  // Advisors & approvals
  financial_advisors: party,
  legal_advisors: party,
  regulatory_approvals: z
    .array(z.string())
    .describe("Regulatory/antitrust approvals required, e.g. 'EU Commission', 'CFIUS'"),
  shareholder_approval: z
    .string()
    .nullable()
    .describe("Whose shareholder vote is required, or whether it's already obtained"),
  key_risks: z.array(z.string()).describe("Main risks to the deal closing"),
});

export type Deal = z.infer<typeof DealSchema>;
