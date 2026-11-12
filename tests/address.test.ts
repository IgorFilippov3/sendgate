import { describe, expect, it } from "vitest";
import {
  editDistance,
  isNoReply,
  isPlaceholder,
  isReservedDomain,
  isRoleAccount,
  suggestDomain,
} from "@/lib/engine/checks/address";

describe("suggestDomain", () => {
  it.each([
    ["gnail.com", "gmail.com"],
    ["gmial.com", "gmail.com"],
    ["gmaill.com", "gmail.com"],
    ["gmail.con", "gmail.com"],
    ["gmail.co", "gmail.com"],
    ["hotmial.com", "hotmail.com"],
    ["hotmal.com", "hotmail.com"],
    ["outlok.com", "outlook.com"],
    ["yaho.com", "yahoo.com"],
    ["iclod.com", "icloud.com"],
    ["yandex.ry", null],
    ["ukr.nte", null],
  ])("%s -> %s", (domain, expected) => {
    expect(suggestDomain(domain)).toBe(expected);
  });

  it.each([
    "gmail.com",
    "ymail.com",
    "mail.com",
    "email.com",
    "cloud.com",
    "live.com",
    "life.com",
    "mail.rs",
    "web.dk",
    "company.com",
    "gmx.at",
  ])("does not flag real domain %s", (domain) => {
    expect(suggestDomain(domain)).toBeNull();
  });
});

describe("editDistance", () => {
  it("counts adjacent transpositions as one edit", () => {
    expect(editDistance("gmial", "gmail")).toBe(1);
    expect(editDistance("abc", "abc")).toBe(0);
    expect(editDistance("kitten", "sitting")).toBe(3);
  });
});

describe("address heuristics", () => {
  it("detects role accounts with separators and tags", () => {
    expect(isRoleAccount("info")).toBe(true);
    expect(isRoleAccount("Support+eu")).toBe(true);
    expect(isRoleAccount("customer.service")).toBe(true);
    expect(isRoleAccount("john")).toBe(false);
  });

  it("detects no-reply variants", () => {
    for (const l of ["noreply", "no-reply", "no_reply", "do-not-reply", "DoNotReply"]) {
      expect(isNoReply(l)).toBe(true);
    }
    expect(isNoReply("reply")).toBe(false);
  });

  it("detects placeholders by local part or domain", () => {
    expect(isPlaceholder("test", "company.org")).toBe(true);
    expect(isPlaceholder("john", "yourdomain.com")).toBe(true);
    expect(isPlaceholder("john", "company.org")).toBe(false);
  });

  it("detects reserved domains", () => {
    for (const d of ["example.com", "example.org", "foo.test", "bar.invalid", "host.localhost", "x.local", "example.co.uk"]) {
      expect(isReservedDomain(d)).toBe(true);
    }
    for (const d of ["gmail.com", "examples.com", "test.com"]) {
      expect(isReservedDomain(d)).toBe(false);
    }
  });
});
