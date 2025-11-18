# Quick Start - Database Migration Guide

## TL;DR - Run These Commands

### In Supabase Dashboard SQL Editor:

**Step 1: Run Initial Schema**
```sql
-- Copy and paste content from: 20251115131041_initial_schema.sql
```

**Step 2: Run Quota RPC Functions**
```sql
-- Copy and paste content from: 20251115131041_fix_quota_rpc.sql
```

**Step 3: Run Template Variants Update**
```sql
-- Copy and paste content from: 20251115131041_update_templates_variants.sql
```

**Step 4: Verify Installation**
```sql
-- Check all tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Expected tables:
-- assets, contacts, groups, history, payments, profiles, 
-- quota_reservations, templates, user_quotas, user_sessions

-- Test quota RPC function
SELECT * FROM check_quota_usage('00000000-0000-0000-0000-000000000000'::uuid);
-- Should return: empty result or quota data (no error)
```

---

## What This Fixes

### 🔴 CRITICAL FIXES
1. ✅ Table name `groups` (was `contact_groups`)
2. ✅ Table name `user_quotas` (was `quotas`)
3. ✅ Added missing `quota_reservations` table
4. ✅ Added missing `user_sessions` table

### 🟡 IMPORTANT FIXES
5. ✅ Removed duplicate profile creation trigger
6. ✅ Fixed RPC function return fields
7. ✅ Added template variants support

---

## After Migration - Code Changes Required

### 1. Fix SyncManager Table Mapping

**File**: `src/lib/sync/SyncManager.ts`

**Line ~1206-1217**, change:
```typescript
// ❌ BEFORE (WRONG)
private mapTableName(tableName: string): string {
  const mapping: Record<string, string> = {
    contacts: 'contacts',
    groups: 'contact_groups',  // ❌ WRONG
    templates: 'templates',
    activityLogs: 'history',
    assets: 'assets',
    quotas: 'quotas'  // ❌ WRONG
  };
  return mapping[tableName] || tableName;
}

// ✅ AFTER (CORRECT)
private mapTableName(tableName: string): string {
  const mapping: Record<string, string> = {
    contacts: 'contacts',
    groups: 'groups',              // ✅ FIXED
    templates: 'templates',
    activityLogs: 'history',
    assets: 'assets',
    quotas: 'user_quotas',        // ✅ FIXED
    profiles: 'profiles',
    payments: 'payments',
    quotaReservations: 'quota_reservations',
    userSessions: 'user_sessions'
  };
  return mapping[tableName] || tableName;
}
```

### 2. Fix AuthService createDefaultQuota

**File**: `src/lib/services/AuthService.ts`

**Line ~548-560**, change:
```typescript
// ❌ BEFORE (WRONG)
const { data, error } = await supabase
  .from('user_quotas')
  .insert({
    user_id: userId,
    plan_type: 'basic',
    messages_limit: 100,
    messages_used: 0,
    remaining: 100,  // ❌ Field doesn't exist
    subscription_start_date: new Date().toISOString(),  // ❌ Field doesn't exist
    subscription_end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()  // ❌ Field doesn't exist
  })

// ✅ AFTER (CORRECT)
const { data, error } = await supabase
  .from('user_quotas')
  .insert({
    user_id: userId,
    master_user_id: userId,  // ✅ Required field
    plan_type: 'basic',
    messages_limit: 100,
    messages_used: 0,
    reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),  // ✅ Correct field name
    is_active: true
  })
```

### 3. Update getSyncableTables in db.ts

**File**: `src/lib/db.ts`

**Line ~333-335**, update to:
```typescript
getSyncableTables() {
  // Include all tables that should sync
  return [
    'contacts', 
    'groups', 
    'templates', 
    'activityLogs', 
    'assets', 
    'quotas',
    'profiles', 
    'payments',
    'quotaReservations',  // ✅ Now exists in schema
    'userSessions'        // ✅ Now exists in schema
  ];
}
```

---

## Testing Checklist

### 1. Test User Registration
```typescript
// Should create both profile AND quota
const result = await authService.register('test@example.com', 'password123', 'Test User');
// Verify: profile created with role='owner'
// Verify: quota created with messages_limit=100
```

### 2. Test Quota Check
```typescript
// Should return quota with all fields
const quota = await quotaService.getQuota(userId);
// Verify: quota.id exists
// Verify: quota.master_user_id exists
// Verify: quota.remaining calculated correctly
```

### 3. Test Sync
```typescript
// Create a contact
await contactService.createContact({ name: 'Test', phone: '1234567890', ... });
// Trigger sync
await syncManager.triggerSync();
// Verify: Contact synced to Supabase in 'contacts' table
// Verify: No errors about table not found
```

### 4. Test Group Operations
```typescript
// Create a group
await groupService.createGroup({ name: 'Test Group', ... });
// Trigger sync
await syncManager.triggerSync();
// Verify: Group synced to 'groups' table (not 'contact_groups')
```

---

## Common Errors & Solutions

### Error: "relation 'contact_groups' does not exist"
**Cause**: SyncManager still using old table name  
**Fix**: Update `mapTableName()` method (see above)

### Error: "column 'remaining' does not exist"
**Cause**: Trying to insert computed field  
**Fix**: Update `createDefaultQuota()` method (see above)

### Error: "null value in column 'master_user_id' violates not-null constraint"
**Cause**: Missing required field in insert  
**Fix**: Always include `master_user_id` in quota/profile operations

### Error: "relation 'quota_reservations' does not exist"
**Cause**: Migration not run  
**Fix**: Run `20251115131041_initial_schema.sql` in Supabase

---

## Emergency Rollback

If something breaks:

1. **Stop the app immediately**
2. **Check Supabase logs** in Dashboard > Database > Logs
3. **Restore old migrations**:
   - Rename `.OLD` files back to `.sql`
   - Drop new tables: `DROP TABLE quota_reservations, user_sessions CASCADE;`
4. **Revert code changes** in git
5. **Contact team** before retrying

---

## Success Indicators

✅ All migrations run without errors  
✅ All tables visible in Supabase Dashboard  
✅ RLS policies show as enabled  
✅ User registration creates profile + quota  
✅ Sync works without "table not found" errors  
✅ Quota check returns correct data  
✅ No console errors in browser  

---

## Next Steps After Migration

1. ✅ Test in development environment first
2. ✅ Run all unit tests
3. ✅ Test registration/login flow
4. ✅ Test offline mode
5. ✅ Monitor Supabase logs for 24 hours
6. ✅ Deploy to staging
7. ✅ Final testing in staging
8. ✅ Deploy to production

---

**Need Help?**
- Check `MIGRATION_NOTES.md` for detailed info
- Review `Analisis_SupabaseVSActualCode.md` for analysis
- Compare with `.OLD` files for reference

**Good luck! 🚀**
