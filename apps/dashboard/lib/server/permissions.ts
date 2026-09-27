import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements, memberAc, ownerAc } from "better-auth/plugins/organization/access";

const statement = {
  ...defaultStatements,
  source: ["read", "create", "update", "delete", "run"],
  story: ["read", "create", "update", "approve", "archive"],
  publication: ["read", "create", "cancel", "retry"],
  destination: ["read", "create", "update", "delete"],
  audit: ["read"],
} as const;

export const mediaAccess = createAccessControl(statement);

export const ownerRole = mediaAccess.newRole({
  ...ownerAc.statements,
  source: ["read", "create", "update", "delete", "run"],
  story: ["read", "create", "update", "approve", "archive"],
  publication: ["read", "create", "cancel", "retry"],
  destination: ["read", "create", "update", "delete"],
  audit: ["read"],
});

export const adminRole = mediaAccess.newRole({
  ...adminAc.statements,
  source: ["read", "create", "update", "delete", "run"],
  story: ["read", "create", "update", "approve", "archive"],
  publication: ["read", "create", "cancel", "retry"],
  destination: ["read", "create", "update", "delete"],
  audit: ["read"],
});

export const editorRole = mediaAccess.newRole({
  ...memberAc.statements,
  source: ["read", "run"],
  story: ["read", "create", "update", "approve", "archive"],
  publication: ["read", "create", "cancel", "retry"],
  destination: ["read"],
  audit: [],
});

export const journalistRole = mediaAccess.newRole({
  ...memberAc.statements,
  source: ["read"],
  story: ["read", "create", "update"],
  publication: ["read"],
  destination: ["read"],
  audit: [],
});

export const publisherRole = mediaAccess.newRole({
  ...memberAc.statements,
  source: ["read"],
  story: ["read"],
  publication: ["read", "create", "cancel", "retry"],
  destination: ["read", "create", "update"],
  audit: [],
});

export const viewerRole = mediaAccess.newRole({
  ...memberAc.statements,
  source: ["read"],
  story: ["read"],
  publication: ["read"],
  destination: ["read"],
  audit: [],
});

export const mediaRoles = {
  owner: ownerRole,
  admin: adminRole,
  editor: editorRole,
  journalist: journalistRole,
  publisher: publisherRole,
  viewer: viewerRole,
};

export type MediaRole = keyof typeof mediaRoles;
