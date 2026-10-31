import test from 'node:test'
import assert from 'node:assert/strict'
import { authPool } from '../src/lib/auth/store'

test('runtime DML grants inherited from theatre migrations, no owner privileges', {skip: process.env.CRM_AUTH_ISOLATED_PROOF !== '1'}, async () => {
  assert.ok(process.env.DATABASE_URL?.includes('/crm_auth_test?host=/tmp/company-crm-auth.'))
  try {
    const role = (await authPool.query('SELECT current_user, rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname=current_user')).rows[0]
    assert.equal(role.current_user, 'crm_review_app')
    assert.equal(role.rolsuper, false); assert.equal(role.rolcreatedb, false); assert.equal(role.rolcreaterole, false)
    for (const table of ['CrmUser','CrmSession','CrmAuthThrottle','CrmAuthEvent','CrmMachineIdentity']) {
      const row = (await authPool.query(`SELECT pg_get_userbyid(relowner) AS owner,
        has_table_privilege(current_user,oid,'SELECT,INSERT,UPDATE,DELETE') AS dml
        FROM pg_class WHERE relname=$1`,[table])).rows[0]
      assert.equal(row.owner,'theatre'); assert.equal(row.dml,true)
      for (const privilege of ['SELECT','INSERT','UPDATE','DELETE']) {
        assert.equal((await authPool.query('SELECT has_table_privilege(current_user,$1,$2) AS allowed',[`"${table}"`,privilege])).rows[0].allowed,true)
      }
    }
    const rows = (await authPool.query(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`)).rows.map(r=>r.migration_name)
    for (const name of ['20261031150000_personal_accounts','20261031170000_machine_accounts']) assert.ok(rows.includes(name))
    assert.equal((await authPool.query("SELECT has_schema_privilege(current_user,'public','CREATE') AS allowed")).rows[0].allowed,false)
    await assert.rejects(authPool.query('CREATE TABLE public.forbidden_owner_probe (id integer)'), /permission denied/)
    await assert.rejects(authPool.query('ALTER TABLE "CrmUser" ADD COLUMN forbidden_owner_probe integer'), /must be owner/)
  } finally { await authPool.end() }
})
