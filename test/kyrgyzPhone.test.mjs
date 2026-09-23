// Запуск: npm run test:unit (Node 22, --experimental-strip-types).
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeKyrgyzPhoneInput as sanitize, KYRGYZ_PHONE_REGEX } from "../src/lib/kyrgyzPhone.ts";

/** Набор посимвольно, как с клавиатуры: каждое нажатие проходит через sanitize. */
const typeChars = (chars, start = "") =>
  [...chars].reduce((value, ch) => sanitize(value + ch), start);

/** Backspace посимвольно: отрезаем последний символ и снова через sanitize. */
const backspace = (value, times) => {
  let v = value;
  for (let i = 0; i < times; i += 1) v = sanitize(v.slice(0, -1));
  return v;
};

test("вставка в разных форматах даёт один номер", () => {
  for (const input of ["+996 555 123 456", "996555123456", "0555123456", "555123456", "+996-555-12-34-56"]) {
    assert.equal(sanitize(input), "+996555123456", input);
  }
});

test("пустой ввод очищает поле", () => {
  assert.equal(sanitize(""), "");
  assert.equal(sanitize("   "), "");
});

test("набор национального номера посимвольно", () => {
  assert.equal(typeChars("555123456"), "+996555123456");
});

test("код страны, набранный вручную, не удваивается", () => {
  // Раньше: +996996555123 — проходил проверку формата, сохранялся чужой номер.
  const typed = typeChars("996555123456");
  assert.equal(typed, "+996555123456");
  assert.match(typed, KYRGYZ_PHONE_REGEX);
  assert.equal(typeChars("+996555123456"), "+996555123456");
});

test("номер, начинающийся на 9, набирается целиком", () => {
  assert.equal(typeChars("999123456"), "+996999123456");
});

test("Backspace стирает поле до конца, без петли «+99699»", () => {
  const full = "+996555123456";
  assert.equal(backspace(full, 9), "+996");
  assert.equal(backspace(full, 10), "+99");
  assert.equal(backspace(full, 13), "");
});

test("длинный ввод обрезается до 9 цифр номера", () => {
  assert.equal(sanitize("+996 555 123 456 789"), "+996555123456");
});
