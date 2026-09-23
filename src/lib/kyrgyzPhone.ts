import { z } from "zod";

/** Must match backend `KYRGYZ_PHONE_REGEX`. */
export const KYRGYZ_PHONE_REGEX = /^\+996\d{9}$/;

export const KYRGYZ_PHONE_HINT =
  "Формат: +996 и 9 цифр (например +996555123456)";

export const KYRGYZ_PHONE_REQUIRED_MSG = "Укажите телефон";

/**
 * Normalizes free-form input to `+996` + up to 9 national digits.
 * Returns "" when there are no digits (field cleared).
 */
export function sanitizeKyrgyzPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return "";

  // Пока набирается сам код страны («9», «99», «996»), показываем его как есть.
  // Раньше код дописывался после первой же цифры: набранный следом вручную код
  // попадал в номер дважды (+996996…, и такой номер проходил проверку), а
  // Backspace на «+996» давал «+99699» — поле невозможно было стереть.
  if ("996".startsWith(digits)) return `+${digits}`;

  let national: string;
  if (digits.startsWith("996")) {
    national = digits.slice(3, 12);
  } else {
    national = digits.replace(/^0+/, "").slice(0, 9);
  }
  return `+996${national}`;
}

/** Optional profile phone: empty or full +996 + 9 digits. */
export const kyrgyzPhoneOptionalSchema = z.string().superRefine((val, ctx) => {
  const trimmed = val.trim();
  if (trimmed === "") return;
  if (!KYRGYZ_PHONE_REGEX.test(trimmed)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: KYRGYZ_PHONE_HINT,
    });
  }
});

/** Required: +996 + 9 digits (profile, registration, org application, etc.). */
export const kyrgyzPhoneRequiredSchema = z
  .string()
  .trim()
  .min(1, KYRGYZ_PHONE_REQUIRED_MSG)
  .regex(KYRGYZ_PHONE_REGEX, KYRGYZ_PHONE_HINT);
