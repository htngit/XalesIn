# Settings Page - Detailed Implementation Plan

> **Project**: Xender-In WhatsApp Automation  
> **Feature**: Complete Settings Page with Payment & Subscription  
> **Version**: 1.0  
> **Last Updated**: 2025-11-21

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Pricing & Policies](#pricing--policies)
3. [Phase 1: Database Schema](#phase-1-database-schema)
4. [Phase 2: Edge Functions](#phase-2-edge-functions)
5. [Phase 3: Types & Services](#phase-3-types--services)
6. [Phase 4: UI Components - Payment Tab](#phase-4-ui-components---payment-tab)
7. [Phase 5: UI Components - Other Tabs](#phase-5-ui-components---other-tabs)
8. [Phase 6: Integration](#phase-6-integration)
9. [Phase 7: Testing](#phase-7-testing)
10. [Implementation Rules](#implementation-rules)

---

## Overview

### Goal
Build comprehensive Settings Page with 8 tabs:
1. 🔐 WhatsApp Session (placeholder for backend)
2. 💳 Payment & Subscription (DUITKU integration)
3. 👤 Account & Profile
4. 🔔 Notifications
5. 💬 Message Settings
6. 🔄 Database & Sync
7. 🔒 Security & Privacy
8. 👥 Team Management (LOCKED - future CRM)

### Tech Stack
- **Frontend**: React + TypeScript + Vite
- **UI**: shadcn/ui + Tailwind CSS
- **Forms**: react-hook-form + Zod
- **Backend**: Supabase (Auth, Database, Edge Functions, Storage)
- **Payment**: DUITKU Sandbox API
- **PDF**: jsPDF or Puppeteer for invoice generation

### Timeline
**Total: 14-18 days** (3-4 weeks)

---

## Pricing & Policies

### Pricing Structure (LOCKED)

| Plan | Monthly | Yearly | Quota | Notes |
|------|---------|--------|-------|-------|
| **Free** | Rp 0 | - | 5 msg/month | Default for new users |
| **Basic** | Rp 50,000 | Rp 480,000 | 500 msg/month | Save Rp 120K/year (20% off) |
| **Pro** | Rp 75,000 | Rp 720,000 | Unlimited | Save Rp 180K/year (20% off) |

### Key Policies

✅ **Quota Reset**: Every 1st of month at 00:00 WIB (GMT+7)  
✅ **No Prorated Charges**: Upgrade = immediate full charge, full quota  
✅ **Downgrade**: Effective next billing cycle  
✅ **Monthly → Yearly Switch**: Immediate charge, previous payment hangus  
✅ **Grace Period**: 3 days for failed payments  
✅ **Refund**: 14 days for service complaints, transfer to bank  
✅ **Rate Limit**: Warning only for >300 msg/hour (Pro plan)  
✅ **New User**: Auto Free plan with 5 messages  

### Company Info (for Invoices)

```
Xalesin
Jakarta Selatan, Pasar Minggu
Jakarta, Indonesia
Email: xalesincare@xalesin.id
Phone: - (empty but field exists)
NPWP: - (empty but field exists)
Tax: 0% (placeholder for future)
```

---

## Phase 1: Database Schema

**Duration**: 1 day  
**File**: `supabase/migrations/20251121_settings_schema.sql`

### Tasks Checklist

#### 1.1 Create Migration File
- [ ] Create `supabase/migrations/` directory if not exists
- [ ] Create `20251121_settings_schema.sql`
- [ ] Add migration header comment

#### 1.2 User Settings Table
```sql
CREATE TABLE user_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  
  -- Preferences
  language TEXT DEFAULT 'id' CHECK (language IN ('id', 'en')),
  timezone TEXT DEFAULT 'Asia/Jakarta',
  theme TEXT DEFAULT 'dark' CHECK (theme IN ('light', 'dark')),
  
  -- Notifications
  enable_push_notifications BOOLEAN DEFAULT true,
  enable_email_notifications BOOLEAN DEFAULT false,
  notify_on_message_sent BOOLEAN DEFAULT true,
  notify_on_message_failed BOOLEAN DEFAULT true,
  notify_on_session_disconnect BOOLEAN DEFAULT true,
  
  -- Message Settings
  default_message_delay INTEGER DEFAULT 3000, -- milliseconds
  max_messages_per_batch INTEGER DEFAULT 50,
  retry_failed_messages BOOLEAN DEFAULT true,
  max_retry_attempts INTEGER DEFAULT 3,
  
  -- Media Settings
  max_file_size INTEGER DEFAULT 10485760, -- 10MB
  auto_compress_images BOOLEAN DEFAULT true,
  
  -- Sync Settings
  enable_offline_mode BOOLEAN DEFAULT true,
  auto_sync_interval INTEGER DEFAULT 300000, -- 5 minutes
  
  -- Security
  two_factor_enabled BOOLEAN DEFAULT false,
  data_retention_days INTEGER DEFAULT 30,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own settings" ON user_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own settings" ON user_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own settings" ON user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
```

#### 1.3 Pricing Plans Table
```sql
CREATE TABLE pricing_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_type TEXT NOT NULL CHECK (plan_type IN ('free', 'basic', 'pro')),
  plan_name TEXT UNIQUE NOT NULL,
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
  price DECIMAL(10,2) NOT NULL,
  quota INTEGER NOT NULL, -- -1 for unlimited
  features JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  discount_percentage INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert pricing data
INSERT INTO pricing_plans (plan_type, plan_name, billing_cycle, price, quota, features) VALUES
('free', 'Free Plan', 'monthly', 0, 5, '["5 messages per month", "Basic support"]'),
('basic', 'Basic - Monthly', 'monthly', 50000, 500, '["500 messages/month", "Email support", "Templates"]'),
('basic', 'Basic - Yearly', 'yearly', 480000, 500, '["500 messages/month", "Email support", "Templates", "Save 20%"]'),
('pro', 'Pro - Monthly', 'monthly', 75000, -1, '["Unlimited messages", "Priority support", "Analytics", "API access"]'),
('pro', 'Pro - Yearly', 'yearly', 720000, -1, '["Unlimited messages", "Priority support", "Analytics", "API access", "Save 20%"]');

-- RLS
ALTER TABLE pricing_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active plans" ON pricing_plans FOR SELECT USING (is_active = true);
```

#### 1.4 Update Subscriptions Table
```sql
ALTER TABLE subscriptions 
  ADD COLUMN billing_cycle TEXT DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
  ADD COLUMN next_billing_date TIMESTAMPTZ,
  ADD COLUMN scheduled_downgrade_to TEXT,
  ADD COLUMN scheduled_downgrade_date TIMESTAMPTZ,
  ADD COLUMN grace_period_ends_at TIMESTAMPTZ,
  ADD COLUMN quota_reset_date TIMESTAMPTZ DEFAULT DATE_TRUNC('month', NOW() + INTERVAL '1 month');
```

#### 1.5 Payment Transactions Table
```sql
CREATE TABLE payment_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Transaction Info
  transaction_id TEXT UNIQUE NOT NULL, -- DUITKU reference
  merchant_order_id TEXT UNIQUE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'IDR',
  
  -- Payment Details
  payment_method TEXT NOT NULL,
  payment_provider TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed', 'expired')),
  
  -- Plan Info
  plan_purchased TEXT NOT NULL,
  quota_added INTEGER NOT NULL,
  
  -- DUITKU Fields
  duitku_reference TEXT,
  duitku_payment_url TEXT,
  duitku_qr_string TEXT,
  duitku_va_number TEXT,
  
  -- Invoice
  invoice_number TEXT UNIQUE,
  invoice_pdf_url TEXT,
  tax_percentage DECIMAL(5,2) DEFAULT 0,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  total_amount DECIMAL(10,2),
  
  -- Timestamps
  paid_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own transactions" ON payment_transactions FOR SELECT USING (auth.uid() = user_id);

-- Index
CREATE INDEX idx_payment_transactions_user ON payment_transactions(user_id, created_at DESC);
```

#### 1.6 Billing Information Table
```sql
CREATE TABLE billing_information (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  
  full_name TEXT NOT NULL,
  company_name TEXT,
  tax_id TEXT, -- NPWP
  email TEXT NOT NULL,
  phone TEXT,
  
  -- Address
  street_address TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'Indonesia',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE billing_information ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own billing info" ON billing_information FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own billing info" ON billing_information FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own billing info" ON billing_information FOR INSERT WITH CHECK (auth.uid() = user_id);
```

#### 1.7 Refund Requests Table
```sql
CREATE TABLE refund_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES payment_transactions(id),
  
  refund_number TEXT UNIQUE NOT NULL, -- REF-YYYY-MM-XXXXX
  reason TEXT NOT NULL,
  details TEXT NOT NULL,
  
  -- Bank Info
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_holder TEXT NOT NULL,
  
  -- Status
  status TEXT DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'approved', 'rejected', 'transferred')),
  admin_notes TEXT,
  refund_amount DECIMAL(10,2),
  
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE refund_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own refund requests" ON refund_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own refund requests" ON refund_requests FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Index
CREATE INDEX idx_refund_requests_user ON refund_requests(user_id, created_at DESC);
```

#### 1.8 Execute Migration
- [ ] Save SQL file
- [ ] Use MCP Supabase tool: `apply_migration`
- [ ] Verify tables in Supabase dashboard
- [ ] Test RLS policies with sample queries
- [ ] Verify pricing plans data inserted

### Verification Checklist
- [ ] All 5 new tables created
- [ ] `subscriptions` table updated with new columns
- [ ] RLS enabled on all tables
- [ ] Pricing plans data populated (5 rows)
- [ ] Indexes created
- [ ] Can query with user JWT (not service role)

---

## Phase 2: Edge Functions

**Duration**: 2-3 days  
**Directory**: `supabase/functions/`

### 2.1 Create Payment Function

**File**: `supabase/functions/create-payment/index.ts`

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    // 1. Get user from JWT
    const authHeader = req.headers.get('Authorization')!
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')
    
    // 2. Parse request
    const { plan_id, payment_method } = await req.json()
    
    // 3. Get plan details
    const { data: plan } = await supabase
      .from('pricing_plans')
      .select('*')
      .eq('id', plan_id)
      .single()
    
    if (!plan) throw new Error('Plan not found')
    
    // 4. Generate merchant order ID
    const merchantOrderId = `ORD-${Date.now()}-${user.id.substring(0, 8)}`
    
    // 5. Call DUITKU API
    const duitkuResponse = await fetch('https://sandbox.duitku.com/webapi/api/merchant/v2/inquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchantCode: Deno.env.get('DUITKU_MERCHANT_CODE'),
        paymentAmount: plan.price,
        paymentMethod: payment_method,
        merchantOrderId: merchantOrderId,
        productDetails: `${plan.plan_name} Subscription`,
        email: user.email,
        customerVaName: user.email?.split('@')[0],
        callbackUrl: Deno.env.get('DUITKU_CALLBACK_URL'),
        returnUrl: Deno.env.get('DUITKU_RETURN_URL'),
        signature: generateSignature(merchantOrderId, plan.price)
      })
    })
    
    const duitkuData = await duitkuResponse.json()
    
    // 6. Save transaction
    const { data: transaction } = await supabase
      .from('payment_transactions')
      .insert({
        user_id: user.id,
        transaction_id: duitkuData.reference,
        merchant_order_id: merchantOrderId,
        amount: plan.price,
        payment_method: payment_method,
        status: 'pending',
        plan_purchased: plan.plan_name,
        quota_added: plan.quota,
        duitku_reference: duitkuData.reference,
        duitku_payment_url: duitkuData.paymentUrl,
        duitku_qr_string: duitkuData.qrString,
        duitku_va_number: duitkuData.vaNumber,
        total_amount: plan.price,
        expired_at: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      })
      .select()
      .single()
    
    return new Response(JSON.stringify(transaction), {
      headers: { 'Content-Type': 'application/json' }
    })
    
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})

function generateSignature(orderId: string, amount: number): string {
  // DUITKU signature logic
  const apiKey = Deno.env.get('DUITKU_API_KEY')
  const merchantCode = Deno.env.get('DUITKU_MERCHANT_CODE')
  const str = `${merchantCode}${orderId}${amount}${apiKey}`
  // Use crypto to generate MD5 hash
  return str // Simplified - implement proper MD5
}
```

**Tasks**:
- [ ] Create function directory
- [ ] Implement user authentication
- [ ] Implement plan validation
- [ ] Implement DUITKU API call
- [ ] Implement signature generation
- [ ] Save transaction to database
- [ ] Handle errors
- [ ] Test with Postman

### 2.2 Payment Webhook Function

**File**: `supabase/functions/payment-webhook/index.ts`

```typescript
serve(async (req) => {
  try {
    // 1. Parse DUITKU webhook
    const payload = await req.json()
    
    // 2. Verify signature
    if (!verifyDuitkuSignature(payload)) {
      throw new Error('Invalid signature')
    }
    
    // 3. Get transaction
    const supabase = createClient(...)
    const { data: transaction } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('merchant_order_id', payload.merchantOrderId)
      .single()
    
    if (!transaction) throw new Error('Transaction not found')
    
    // 4. Update transaction status
    await supabase
      .from('payment_transactions')
      .update({
        status: payload.resultCode === '00' ? 'success' : 'failed',
        paid_at: new Date(),
        duitku_reference: payload.reference
      })
      .eq('id', transaction.id)
    
    // 5. Update subscription if success
    if (payload.resultCode === '00') {
      await supabase
        .from('subscriptions')
        .update({
          plan_type: transaction.plan_purchased.includes('basic') ? 'basic' : 'pro',
          quota_limit: transaction.quota_added,
          quota_used: 0,
          valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          status: 'active'
        })
        .eq('master_user_id', transaction.user_id)
      
      // 6. Generate invoice
      await supabase.functions.invoke('generate-invoice', {
        body: { transaction_id: transaction.id }
      })
    }
    
    return new Response('OK', { status: 200 })
    
  } catch (error) {
    return new Response(error.message, { status: 400 })
  }
})
```

**Tasks**:
- [ ] Implement webhook parsing
- [ ] Implement signature verification
- [ ] Update transaction status
- [ ] Update subscription on success
- [ ] Trigger invoice generation
- [ ] Test with DUITKU simulator

### 2.3 Other Edge Functions

**Files to create**:
- `verify-payment/index.ts` - Manual payment verification
- `generate-invoice/index.ts` - PDF invoice generation
- `cancel-subscription/index.ts` - Subscription cancellation

**Tasks**:
- [ ] Implement verify-payment function
- [ ] Implement generate-invoice function (jsPDF)
- [ ] Implement cancel-subscription function
- [ ] Deploy all functions
- [ ] Test each function

---

## Phase 3: Types & Services

**Duration**: 1 day

### 3.1 TypeScript Types

**File**: `src/types/subscription.ts`

```typescript
export interface Subscription {
  id: string;
  master_user_id: string;
  plan_type: 'free' | 'basic' | 'pro';
  status: 'active' | 'expired' | 'cancelled' | 'pending';
  quota_limit: number;
  quota_used: number;
  billing_cycle: 'monthly' | 'yearly';
  valid_from: string;
  valid_until: string;
  next_billing_date?: string;
  auto_renew: boolean;
  price: number;
  scheduled_downgrade_to?: string;
  scheduled_downgrade_date?: string;
  grace_period_ends_at?: string;
}

export interface PricingPlan {
  id: string;
  plan_type: 'free' | 'basic' | 'pro';
  plan_name: string;
  billing_cycle: 'monthly' | 'yearly';
  price: number;
  quota: number; // -1 for unlimited
  features: string[];
  discount_percentage: number;
}
```

**File**: `src/types/payment.ts`

```typescript
export interface PaymentTransaction {
  id: string;
  user_id: string;
  transaction_id: string;
  merchant_order_id: string;
  amount: number;
  currency: string;
  payment_method: string;
  payment_provider?: string;
  status: 'pending' | 'success' | 'failed' | 'expired';
  plan_purchased: string;
  invoice_number?: string;
  invoice_pdf_url?: string;
  paid_at?: string;
  created_at: string;
}

export interface RefundRequest {
  id: string;
  transaction_id: string;
  refund_number: string;
  reason: string;
  details: string;
  bank_name: string;
  account_number: string;
  account_holder: string;
  status: 'submitted' | 'under_review' | 'approved' | 'rejected' | 'transferred';
  created_at: string;
}
```

**Tasks**:
- [ ] Create all type files
- [ ] Export from index
- [ ] Verify no TypeScript errors

### 3.2 Services

**File**: `src/lib/services/SubscriptionService.ts`

```typescript
export class SubscriptionService {
  async getCurrentSubscription(): Promise<Subscription> {
    const { data } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('master_user_id', userId)
      .single()
    return data
  }
  
  async upgradePlan(planId: string, billingCycle: string) {
    const { data } = await supabase.functions.invoke('create-payment', {
      body: { plan_id: planId, payment_method: 'bank_transfer' }
    })
    return data
  }
  
  // ... other methods
}
```

**Tasks**:
- [ ] Implement SubscriptionService
- [ ] Implement PaymentService
- [ ] Implement SettingsService
- [ ] Add error handling
- [ ] Write unit tests

### 3.3 React Hooks

**File**: `src/lib/hooks/useSubscription.ts`

```typescript
export function useSubscription() {
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    // Fetch subscription
    // Subscribe to realtime updates
  }, [])
  
  return { subscription, loading, refetch }
}
```

**Tasks**:
- [ ] Create useSubscription hook
- [ ] Create usePayment hook
- [ ] Create useSettings hook
- [ ] Add Realtime subscriptions
- [ ] Test hooks

---

**Continue to Part 2 for UI Components...**

See detailed UI component implementation in separate sections below.
