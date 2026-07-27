import { z } from "zod";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
  "DC",
];

const nameRegex = /^[A-Za-z][A-Za-z' -]*$/;

// Strip non-digits, then validate 10-digit US number not starting with 0 or 1
const phoneSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .pipe(
    z
      .string()
      .length(10, "must be exactly 10 digits")
      .regex(/^[2-9]/, "must not start with 0 or 1")
  );

// Accept MM/DD/YYYY or YYYY-MM-DD; normalise to YYYY-MM-DD; reject future & pre-1900
const dobSchema = z
  .string()
  .transform((v) => {
    const slashMatch = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
      const [, mm, dd, yyyy] = slashMatch;
      return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    }
    return v;
  })
  .pipe(
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be MM/DD/YYYY or YYYY-MM-DD")
  )
  .refine(
    (v) => {
      // Parse as UTC to avoid timezone-shift issues with toISOString
      const d = new Date(v + "T00:00:00Z");
      return !isNaN(d.getTime()) && d.toISOString().startsWith(v);
    },
    { message: "invalid calendar date" }
  )
  .refine((v) => new Date(v + "T00:00:00Z") <= new Date(), {
    message: "must not be in the future",
  })
  .refine((v) => parseInt(v.slice(0, 4), 10) >= 1900, {
    message: "year must be 1900 or later",
  });

export const patientCreate = z
  .object({
    first_name: z
      .string()
      .min(1, "required")
      .max(50, "max 50 characters")
      .regex(nameRegex, "letters, spaces, hyphens, and apostrophes only"),
    last_name: z
      .string()
      .min(1, "required")
      .max(50, "max 50 characters")
      .regex(nameRegex, "letters, spaces, hyphens, and apostrophes only"),
    date_of_birth: dobSchema,
    sex: z.enum(["Male", "Female", "Other", "Decline to Answer"]),
    phone_number: phoneSchema,
    email: z.string().email().nullish().or(z.literal("")),
    address_line_1: z.string().min(1, "required"),
    address_line_2: z.string().nullish().or(z.literal("")),
    city: z
      .string()
      .min(1, "required")
      .max(100, "max 100 characters"),
    state: z
      .string()
      .transform((v) => v.toUpperCase())
      .pipe(z.enum(US_STATES, { message: "must be a valid US state abbreviation" })),
    zip_code: z
      .string()
      .regex(/^\d{5}(-\d{4})?$/, "must be 5 digits or 5+4 format"),
    insurance_provider: z.string().nullish().or(z.literal("")),
    insurance_member_id: z.string().nullish().or(z.literal("")),
    preferred_language: z.string().default("English"),
    emergency_contact_name: z.string().nullish().or(z.literal("")),
    emergency_contact_phone: phoneSchema.nullish(),
  })
  .strict();

export const patientUpdate = patientCreate.partial().strict();
