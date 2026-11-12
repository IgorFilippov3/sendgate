import { describe, expect, it } from "vitest";
import { checkSyntax, dedupKey } from "@/lib/engine/checks/syntax";

describe("checkSyntax", () => {
  it.each([
    "user@example.org",
    "first.last@sub.domain.co.uk",
    "user+tag@gmail.com",
    "o'brien@company.ie",
    "USER@EXAMPLE.ORG",
    "user@domain.com.",
    "ivan@почта.рф",
    "иван@mail.ru",
    "x@a-b.io",
  ])("accepts %s", (address) => {
    expect(checkSyntax(address).valid).toBe(true);
  });

  it.each([
    ["", "Empty"],
    ["plainaddress", "Missing"],
    ["@domain.com", "Missing"],
    ["user@", "Missing domain"],
    ["user@localhost", "dot"],
    [".user@domain.com", "starts or ends"],
    ["user.@domain.com", "starts or ends"],
    ["us..er@domain.com", "consecutive"],
    ["user@domain..com", "empty label"],
    ["user@-domain.com", "invalid characters"],
    ["user@domain-.com", "invalid characters"],
    ["user@domain.c", "top-level"],
    ["user@domain.123", "Domain"],
    ["us er@domain.com", "whitespace"],
    ['"quoted"@domain.com', "Quoted"],
    ["user@[192.168.0.1]", "literal"],
    ["a@b@domain.com", "More than one"],
    ["user(comment)@domain.com", "invalid characters"],
    [`${"a".repeat(65)}@domain.com`, "64"],
    [`user@${"a".repeat(64)}.com`, "63"],
  ])("rejects %j", (address, error) => {
    const result = checkSyntax(address);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain(error);
  });

  it("returns a lowercase punycode domain", () => {
    const result = checkSyntax("Ivan@Почта.РФ");
    expect(result).toEqual({ valid: true, local: "Ivan", domain: "xn--80a1acny.xn--p1ai" });
  });

  it("trims surrounding whitespace", () => {
    expect(checkSyntax("  user@example.org \n")).toMatchObject({ valid: true, local: "user" });
  });
});

describe("dedupKey", () => {
  it("collapses Gmail dots, plus tags and googlemail.com", () => {
    expect(dedupKey("John.Doe+news", "googlemail.com")).toBe("johndoe@gmail.com");
    expect(dedupKey("johndoe", "gmail.com")).toBe("johndoe@gmail.com");
  });

  it("strips plus tags only for providers that support them", () => {
    expect(dedupKey("user+x", "outlook.com")).toBe("user@outlook.com");
    expect(dedupKey("user+x", "company.com")).toBe("user+x@company.com");
  });

  it("keeps dots for non-Gmail domains", () => {
    expect(dedupKey("first.last", "company.com")).toBe("first.last@company.com");
  });
});
