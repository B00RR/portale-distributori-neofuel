# 📚 API & Architecture Documentation

## Overview
This document describes the Neofuel Portal architecture, including the server-side RPC functions and client-side modules.

---

## 🔒 Server-Side RPC Functions

All admin operations are executed server-side via PostgreSQL RPC functions for security.

### `admin_delete_closure`
Cascade deletes a shift closure and all related records.

```typescript
await supabase.rpc('admin_delete_closure', { 
  closure_id: number 
});
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `closure_id` | `BIGINT` | ✅ | ID of the shift to delete |

**Authorization**: Requires `admin` or `super_admin` role.

**Side Effects**:
- Deletes from `shift_pistols` where `shift_id = closure_id`
- Deletes from `tank_pump_usages` where `shift_id = closure_id`
- Deletes from `shifts` where `id = closure_id`

---

### `admin_update_price`
Inserts a new price record for a station.

```typescript
await supabase.rpc('admin_update_price', {
  p_station_id: number,
  p_benzina: number,
  p_gasolio: number,
  p_data_validita?: string // ISO timestamp, defaults to NOW()
});
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `p_station_id` | `BIGINT` | ✅ | Station ID |
| `p_benzina` | `DECIMAL` | ✅ | Benzina price (must be >= 0) |
| `p_gasolio` | `DECIMAL` | ✅ | Gasolio price (must be >= 0) |
| `p_data_validita` | `TIMESTAMPTZ` | ❌ | Validity date (default: NOW()) |

**Authorization**: Requires `admin` or `super_admin` role.

---

### `admin_assign_station`
Assigns an operator to a station (or removes assignment).

```typescript
await supabase.rpc('admin_assign_station', {
  p_user_id: string, // UUID
  p_station_id: number | null
});
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `p_user_id` | `UUID` | ✅ | User ID to assign |
| `p_station_id` | `BIGINT` | ❌ | Station ID (null = remove assignment) |

**Authorization**: Requires `admin` or `super_admin` role.

---

### `admin_delete_user`
Cascade deletes an operator and their station assignments.

```typescript
await supabase.rpc('admin_delete_user', {
  p_user_id: string // UUID
});
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `p_user_id` | `UUID` | ✅ | User ID to delete |

**Authorization**: Requires `admin` or `super_admin` role.

**Side Effects**:
- Deletes from `user_stations` where `user_id = p_user_id`
- Deletes from `users` where `user_id = p_user_id`

---

## 📁 Module Structure

```
js/
├── core/           # Core infrastructure
│   ├── api.ts      # Supabase client
│   ├── auth.ts     # Authentication
│   ├── config.ts   # Environment config
│   ├── logger.ts   # Secure logging
│   ├── schemas.ts  # Zod validation schemas
│   └── offline-db.ts # IndexedDB for offline
├── admin/          # Admin panel modules
│   ├── shifts.ts   # Closure management
│   ├── operators.ts # User management
│   ├── prices.ts   # Price management
│   └── ...
├── operator/       # Operator panel modules
│   ├── opening.ts  # Shift opening
│   ├── router.ts   # Navigation
│   └── layout.ts   # UI layout
├── ui/             # UI components
│   ├── components/ # Lit components
│   │   ├── ShiftOpener.ts
│   │   ├── ClosureWizard.ts
│   │   └── VoucherManager.ts
│   ├── toast.ts    # Notifications
│   └── ui.ts       # Modal helpers
└── shared/         # Shared utilities
    ├── state.ts    # Global store
    └── error-handler.ts
```

---

## 🧪 Testing

```bash
npm test          # Run unit tests (Vitest)
npm run test:e2e  # Run E2E tests (Playwright)
```

**Current Coverage**: 39 tests across 5 files
