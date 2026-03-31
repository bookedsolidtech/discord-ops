import { type GuildMember, type PermissionResolvable, PermissionsBitField } from "discord.js";

export function checkPermissions(
  member: GuildMember,
  required: PermissionResolvable[],
): { allowed: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const perm of required) {
    if (!member.permissions.has(perm)) {
      const resolved = new PermissionsBitField(perm);
      missing.push(...resolved.toArray());
    }
  }

  return {
    allowed: missing.length === 0,
    missing: [...new Set(missing)],
  };
}
