import {
  formatPkPhoneDisplay,
  formatPkPhoneInput,
  isValidPkMobile,
  toLocalPkMobileDigits,
  toPkWhatsAppDigits,
} from "@/lib/phoneFormat";

describe("phoneFormat", () => {
  it("normalizes common PK mobile shapes to 03XXXXXXXXX", () => {
    expect(toLocalPkMobileDigits("03001234567")).toBe("03001234567");
    expect(toLocalPkMobileDigits("0300-1234567")).toBe("03001234567");
    expect(toLocalPkMobileDigits("0300 1234567")).toBe("03001234567");
    expect(toLocalPkMobileDigits("923001234567")).toBe("03001234567");
    expect(toLocalPkMobileDigits("92 300 1234567")).toBe("03001234567");
    expect(toLocalPkMobileDigits("3001234567")).toBe("03001234567");
  });

  it("formats display as 0300-1234567", () => {
    expect(formatPkPhoneDisplay("923001234567")).toBe("0300-1234567");
    expect(formatPkPhoneInput("03001234567")).toBe("0300-1234567");
  });

  it("validates and converts to WhatsApp digits", () => {
    expect(isValidPkMobile("0300-1234567")).toBe(true);
    expect(isValidPkMobile("030012345")).toBe(false);
    expect(toPkWhatsAppDigits("0300-1234567")).toBe("923001234567");
  });
});
