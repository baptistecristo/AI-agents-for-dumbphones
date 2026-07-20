import { describe, expect, it } from "vitest";
import { isValidPinFormat, PIN_LENGTH } from "./text-pin";

describe("isValidPinFormat", () => {
  it(`n'accepte qu'exactement ${PIN_LENGTH} chiffres`, () => {
    expect(isValidPinFormat("123")).toBe(true);
    expect(isValidPinFormat("12")).toBe(false);
    expect(isValidPinFormat("1234")).toBe(false);
    expect(isValidPinFormat("12a")).toBe(false);
    expect(isValidPinFormat(" 123")).toBe(false);
    expect(isValidPinFormat("")).toBe(false);
  });
});
