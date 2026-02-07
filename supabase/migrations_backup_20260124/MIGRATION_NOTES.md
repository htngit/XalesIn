# Migration Notes - Fixed Version

## Overview
These migrations contain the complete, corrected database schema for the WhatsApp Automation project.

## What Was Fixed

### 1. **Table Name Mappings** ✅
Fixed critical table mapping issues in sync logic:
- `groups` table (was incorrectly mapped to `contact_groups`)
- `user_quotas` table (was incorrectly mapped to `quotas`)

### 2. **Missing Tables Added** ✅
Added two new tables for offline functionality:
- `quota_reservations` - For offline quota management and reservation system
- `user_sessions` - For offline authentication session tracking

### 3. **Field Name Corrections** ✅
Fixed field naming to match actual schema:
- `reset_date` (not `subscription_start_date` or `subscription_end_date`)
- Removed computed field `remaining` from insert operations (calculated on query)

### 4. **RPC Functions Enhanced** ✅
- `check_quota_usage()` - Returns all required fields including timestamps
- `reserve_quota()` - Proper optimistic locking and reservation creation
- `commit_quota_usage()` - Commits reservations and updates usage
- `release_quota_reservation()` - Cancels pending reservations
- `get_user_activity_stats()` - Statistics for dashboard

### 5. **Trigger Strategy** ✅
**IMPORTANT**: Removed automatic profile/quota creation trigger on `auth.users`
- Reason: Application code (AuthService) handles this manually
- Benefit: Full control, no duplicate records, proper role assignment
- AuthService creates profile with `role='owner'` for new registrations

### 6. **Template Variants Support** ✅
- Added `variants` TEXT[] column for multiple template variations
- Made `content` nullable (variants is the primary field)
- Migration handles existing data conversion safely

## Migration Files

### 1. `20251115131041_initial_schema.sql`
**Purpose**: Complete database schema with all tables, indexes, RLS policies, and functions

**Tables Created**:
- `profiles` - User profiles extending auth.users
- `user_quotas` - Message quota management (NOTE: table name!)
- `payments` - Payment transaction records
- `groups` - Contact groups (NOTE: not contact_groups!)
- `contacts` - Contact records
- `templates` - Message templates with variants
- `assets` - File uploads (images, videos, documents)
- `history` - Activity/campaign logs
- `quota_reservations` - NEW: Quota reservation tracking
- `user_sessions` - NEW: User session management

**Key Features**:
- Comprehensive indexes for performance
- Row Level Security (RLS) enabled on all tables
- Multi-tenant data isolation via `master_user_id`
- Automatic timestamp updates via triggers
- Contact count auto-update in groups
- Template usage tracking

### 2. `20251115131041_fix_quota_rpc.sql`
**Purpose**: Enhanced quota management RPC functions

**Functions**:
- `check_quota_usage(UUID)` - Returns complete quota info

### 3. `20251115131041_update_templates_variants.sql`
**Purpose**: Safe migration for templates variants support

**Features**:
- Idempotent operations (safe to run multiple times)
- Migrates existing `content` to `variants` array
- Backward compatible

## Table Name Reference (For Sync)

**CRITICAL**: Use these mappings in SyncManager

| Local DB Name (IndexedDB) | Supabase Table Name | Notes |
|---------------------------|---------------------|-------|
| `contacts` | `contacts` | ✅ Match |
| `groups` | `groups` | ⚠️ NOT `contact_groups` |
| `templates` | `templates` | ✅ Match |
| `activityLogs` | `history` | ⚠️ Different name |
| `assets` | `assets` | ✅ Match |
| `quotas` | `user_quotas` | ⚠️ NOT `quotas` |
| `profiles` | `profiles` | ✅ Match |
| `payments` | `payments` | ✅ Match |
| `quotaReservations` | `quota_reservations` | ✅ New table |
| `userSessions` | `user_sessions` | ✅ New table |

## Migration Order

Run migrations in this order:

1. `20251115131041_initial_schema.sql` - Base schema
2. `20251115131041_fix_quota_rpc.sql` - RPC functions
3. `20251115131041_update_templates_variants.sql` - Template updates

## Post-Migration Checklist

After running migrations:

### Database
- [ ] Verify all tables created: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';`
- [ ] Check RLS enabled: `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';`
- [ ] Test RPC functions: `SELECT * FROM check_quota_usage('user-uuid-here');`

### Application Code
- [ ] Update `SyncManager.mapTableName()` with correct mappings
- [ ] Update `db.getSyncableTables()` to include all tables
- [ ] Fix `AuthService.createDefaultQuota()` field names
- [ ] Test registration flow (profile + quota creation)
- [ ] Test quota reservation/commit flow

### Testing
- [ ] Register new user - verify profile and quota created
- [ ] Login existing user - verify quota retrieved
- [ ] Create contacts/groups - verify sync works
- [ ] Test offline mode - verify local operations
- [ ] Test online sync - verify push/pull works

## Known Issues & Solutions

### Issue 1: Duplicate Profile Creation
**Status**: ✅ FIXED
**Solution**: Removed auto-trigger, app handles manually

### Issue 2: Wrong Table Names in Sync
**Status**: ✅ FIXED  
**Solution**: Updated schema notes with correct mappings

### Issue 3: Missing quota_reservations Table
**Status**: ✅ FIXED
**Solution**: Added table in initial schema

### Issue 4: AuthService Field Mismatch
**Status**: ⚠️ NEEDS CODE FIX
**Solution**: Update `createDefaultQuota()` method:
```typescript
// BEFORE (WRONG):
.insert({
  user_id: userId,
  plan_type: 'basic',
  messages_limit: 100,
  messages_used: 0,
  remaining: 100,  // ❌ Remove
  subscription_start_date: ...,  // ❌ Remove
  subscription_end_date: ...  // ❌ Remove
})

// AFTER (CORRECT):
.insert({
  user_id: userId,
  master_user_id: userId,  // ✅ Add
  plan_type: 'basic',
  messages_limit: 100,
  messages_used: 0,
  reset_date: new Date(Date.now() + 30*24*60*60*1000).toISOString(),  // ✅ Correct field
  is_active: true
})
```

## Rollback Plan

If issues occur, rollback in reverse order:

1. Drop new tables:
```sql
DROP TABLE IF EXISTS public.user_sessions CASCADE;
DROP TABLE IF EXISTS public.quota_reservations CASCADE;
```

2. Restore from `.OLD` files if needed

3. Re-run old migrations

## Support

For questions or issues:
1. Check `Analisis_SupabaseVSActualCode.md` for detailed analysis
2. Review old migrations in `.OLD` files
3. Test locally before deploying to production

## Version History

- **v1.0** (Initial) - Original migrations with issues
- **v2.0** (Current) - Fixed version with corrections

---

**Last Updated**: 2024
**Status**: ✅ Ready for migration
