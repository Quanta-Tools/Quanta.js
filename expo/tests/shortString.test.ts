import { shortString } from "../src/useScreenTracking";

describe("shortString", () => {
  it("should use scientific notation for large numbers", () => {
    expect(shortString(10000)).toBe("1.00e+4");
    expect(shortString(12345)).toBe("1.23e+4");
    expect(shortString(9999999)).toBe("1.00e+7");
  });

  it('should return "0" for very small values', () => {
    expect(shortString(0)).toBe("0");
    expect(shortString(0.0001)).toBe("0");
    expect(shortString(0.0009)).toBe("0");
    expect(shortString(-0.0001)).toBe("0");
  });

  it("should format numbers with appropriate decimal places", () => {
    // Integer part has 4 or more digits: no decimal places
    expect(shortString(1234)).toBe("1234");
    expect(shortString(9999)).toBe("9999");

    // Integer part has 3 digits: 1 decimal place
    expect(shortString(123.456)).toBe("123.5");
    expect(shortString(999.999)).toBe("1000.0"); // Rounds up to 1000.0

    // Integer part has 2 digits: 2 decimal places
    expect(shortString(12.3456)).toBe("12.35");
    expect(shortString(99.999)).toBe("100.00"); // Rounds up to 100.00

    // Integer part has 1 digit: 2 decimal places
    expect(shortString(1.2345)).toBe("1.23");
    expect(shortString(9.999)).toBe("10.00"); // Rounds up to 10.00
  });

  it("should handle negative numbers", () => {
    expect(shortString(-123.456)).toBe("-123.5");
    expect(shortString(-12.34)).toBe("-12.34");
    expect(shortString(-9999)).toBe("-9999");
    expect(shortString(-10000)).toBe("-1.00e+4");
  });
});
