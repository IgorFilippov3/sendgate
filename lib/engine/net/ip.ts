import { BlockList, isIP } from "node:net";

/**
 * Address ranges that must never be contacted by the SMTP prober: private
 * networks, loopback, link-local, CGNAT, documentation and other special-use
 * ranges. Without this check the public demo could be used to probe hosts on
 * the server's internal network by registering a domain whose MX points there.
 */
const NON_PUBLIC = new BlockList();

for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  NON_PUBLIC.addSubnet(net, prefix, "ipv4");
}

for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  NON_PUBLIC.addSubnet(net, prefix, "ipv6");
}

export function isPublicIp(ip: string): boolean {
  const family = isIP(ip);
  // IPv4-mapped IPv6 (::ffff:a.b.c.d): judge by the embedded IPv4 address.
  // (A ::ffff:0:0/96 rule in the IPv6 list would also match plain IPv4.)
  if (family === 6 && /^::ffff:/i.test(ip)) {
    const v4 = ip.slice(7);
    return isIP(v4) === 4 ? isPublicIp(v4) : false;
  }
  if (family === 4) return !NON_PUBLIC.check(ip, "ipv4");
  if (family === 6) return !NON_PUBLIC.check(ip, "ipv6");
  return false;
}
