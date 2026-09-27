import assert from "node:assert/strict";
import test from "node:test";
import {
  adminRole,
  editorRole,
  journalistRole,
  ownerRole,
  publisherRole,
  viewerRole,
} from "../lib/server/permissions";

test("owners and admins can manage destinations and inspect audit events", () => {
  for (const role of [ownerRole, adminRole]) {
    assert.equal(role.authorize({ destination: ["delete"] }).success, true);
    assert.equal(role.authorize({ audit: ["read"] }).success, true);
  }
});

test("editors can approve stories but cannot change destinations or read audit events", () => {
  assert.equal(editorRole.authorize({ story: ["approve"] }).success, true);
  assert.equal(editorRole.authorize({ destination: ["update"] }).success, false);
  assert.equal(editorRole.authorize({ audit: ["read"] }).success, false);
});

test("journalists can write but cannot approve or publish", () => {
  assert.equal(journalistRole.authorize({ story: ["create", "update"] }).success, true);
  assert.equal(journalistRole.authorize({ story: ["approve"] }).success, false);
  assert.equal(journalistRole.authorize({ publication: ["create"] }).success, false);
});

test("publishers can operate publication flow without editorial write access", () => {
  assert.equal(publisherRole.authorize({ publication: ["create", "retry"] }).success, true);
  assert.equal(publisherRole.authorize({ story: ["update"] }).success, false);
});

test("viewers have read-only access", () => {
  assert.equal(viewerRole.authorize({ source: ["read"], story: ["read"], publication: ["read"] }).success, true);
  assert.equal(viewerRole.authorize({ source: ["run"] }).success, false);
  assert.equal(viewerRole.authorize({ destination: ["update"] }).success, false);
});
