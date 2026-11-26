import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PERMISSIONS,
  ROLES,
  canActOnMember,
  canAssignRole,
  hasPermission,
  permissionsFor,
} from '@/lib/auth/permissions';

// Phase 2F-D — role and separation-of-duties invariants. This complements the
// full per-role matrix in phase2a-validation.test.mjs by pinning the security
// properties later phases rely on.

test('viewer holds read-only grants only', () => {
  const grants = permissionsFor('viewer');
  assert.ok(grants.length > 0);
  for (const permission of grants) {
    assert.ok(
      permission.endsWith('.view'),
      `viewer should not hold mutating permission ${permission}`,
    );
  }
  for (const permission of [
    PERMISSIONS.leadsView,
    PERMISSIONS.projectsView,
    PERMISSIONS.clientsView,
    PERMISSIONS.invoicesView,
    PERMISSIONS.knowledgeView,
    PERMISSIONS.memoriesView,
  ]) {
    assert.equal(hasPermission('viewer', permission), true);
  }
});

test('finance approvals and payment recording stay with owner, admin and manager', () => {
  const restricted = [
    PERMISSIONS.invoicesApprove,
    PERMISSIONS.invoicesIssue,
    PERMISSIONS.invoicesCancel,
    PERMISSIONS.paymentsRecord,
    PERMISSIONS.expensesApprove,
  ];
  for (const role of ['owner', 'admin', 'manager']) {
    for (const permission of restricted) {
      assert.equal(hasPermission(role, permission), true, `${role} should hold ${permission}`);
    }
  }
  for (const role of ['member', 'specialist', 'viewer']) {
    for (const permission of restricted) {
      assert.equal(
        hasPermission(role, permission),
        false,
        `${role} must not hold ${permission}`,
      );
    }
  }
});

test('knowledge and memory editing is separated from archiving', () => {
  for (const role of ['member', 'specialist']) {
    assert.equal(hasPermission(role, PERMISSIONS.knowledgeUpdate), true);
    assert.equal(hasPermission(role, PERMISSIONS.memoriesUpdate), true);
    assert.equal(hasPermission(role, PERMISSIONS.knowledgeArchive), false);
    assert.equal(hasPermission(role, PERMISSIONS.memoriesArchive), false);
  }
  for (const role of ['owner', 'admin', 'manager']) {
    assert.equal(hasPermission(role, PERMISSIONS.knowledgeArchive), true);
    assert.equal(hasPermission(role, PERMISSIONS.memoriesArchive), true);
  }
  assert.equal(hasPermission('viewer', PERMISSIONS.knowledgeCreate), false);
  assert.equal(hasPermission('viewer', PERMISSIONS.memoriesCreate), false);
});

test('specialists cannot create clients or invoices, members cannot invite', () => {
  assert.equal(hasPermission('specialist', PERMISSIONS.clientsCreate), false);
  assert.equal(hasPermission('specialist', PERMISSIONS.invoicesCreate), false);
  assert.equal(hasPermission('specialist', PERMISSIONS.clientsView), true);
  assert.equal(hasPermission('member', PERMISSIONS.clientsCreate), true);
  assert.equal(hasPermission('member', PERMISSIONS.membersInvite), false);
  assert.equal(hasPermission('manager', PERMISSIONS.membersInvite), false);
});

test('only owner and admin manage membership and workspace settings', () => {
  for (const permission of [
    PERMISSIONS.workspaceEdit,
    PERMISSIONS.membersInvite,
    PERMISSIONS.membersManage,
    PERMISSIONS.auditView,
  ]) {
    assert.equal(hasPermission('owner', permission), true);
    assert.equal(hasPermission('admin', permission), true);
    for (const role of ['manager', 'member', 'specialist', 'viewer']) {
      assert.equal(hasPermission(role, permission), false, `${role} must not hold ${permission}`);
    }
  }
});

test('owner protections cannot be bypassed by admins or managers', () => {
  assert.equal(canAssignRole('owner', 'owner'), true);
  assert.equal(canAssignRole('admin', 'owner'), false);
  assert.equal(canAssignRole('manager', 'owner'), false);
  assert.equal(canAssignRole('member', 'member'), false);

  assert.equal(canActOnMember('owner', 'owner'), true);
  assert.equal(canActOnMember('admin', 'owner'), false);
  assert.equal(canActOnMember('admin', 'manager'), true);
  assert.equal(canActOnMember('manager', 'member'), false);
  assert.equal(canActOnMember('member', 'member'), false);
});

test('every declared role resolves to a defined grant set', () => {
  for (const role of ROLES) {
    const grants = permissionsFor(role);
    assert.ok(Array.isArray(grants));
  }
});
