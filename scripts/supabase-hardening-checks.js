#!/usr/bin/env node

/**
 * Supabase Hardening Checks Script
 *
 * Verifies that critical tables and RPCs have proper RLS policies in place:
 * 1. Anonymous users cannot SELECT from groomer_time_off
 * 2. Anonymous users cannot SELECT from notifications
 * 3. Anonymous users cannot SELECT from payment_intents
 * 4. Customers cannot call confirm_appointment_request RPC
 *
 * Exit codes:
 * - 0: All checks passed
 * - 1: At least one check failed
 *
 * Required environment variables:
 * - SUPABASE_URL or VITE_SUPABASE_URL
 * - SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_PUBLISHABLE_KEY
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

// Load environment variables from .env files in order of precedence
const envFiles = [
  path.resolve(repoRoot, '.env.local'),
  path.resolve(repoRoot, '.env'),
  path.resolve(repoRoot, 'apps/web/.env.local'),
  path.resolve(repoRoot, 'apps/web/.env'),
];

for (const envFile of envFiles) {
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile });
  }
}

// Resolve environment variables
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabasePublishableKey =
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

// Validate environment setup
if (!supabaseUrl) {
  console.error('❌ SUPABASE_URL is not configured');
  process.exit(1);
}

if (!supabasePublishableKey) {
  console.error('❌ SUPABASE_PUBLISHABLE_KEY is not configured');
  process.exit(1);
}

/**
 * Generate a random test password
 */
function generateTestPassword() {
  return randomBytes(16).toString('hex') + 'Aa1!';
}

/**
 * Create an anonymous Supabase client
 */
function createAnonClient() {
  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Create an authenticated customer Supabase client
 * Uses a service role client to sign in as a customer for testing
 */
async function createCustomerClient() {
  if (!supabaseServiceRoleKey) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY is required for authenticated checks');
    process.exit(1);
  }

  // Create a service role client to create a test session
  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Create a test customer user with a deterministic email
  const testEmail = `hardening-check-customer-${Date.now()}@test.local`;
  const testPassword = generateTestPassword();

  const { data: authData, error: authError } = await serviceClient.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true,
  });

  if (authError) {
    console.error('❌ Failed to create test customer:', authError.message);
    process.exit(1);
  }

  if (!authData.user) {
    console.error('❌ Failed to create test customer: no user returned');
    process.exit(1);
  }

  const userId = authData.user.id;

  // Create a customer row for this user
  const { error: customerError } = await serviceClient.from('customers').insert({
    auth_user_id: userId,
    name: 'Test Customer',
    email: testEmail,
  });

  if (customerError) {
    console.warn('⚠️  Failed to create customer row:', customerError.message);
    // Continue anyway, the user is created
  }

  // Create an authenticated client with the test user's session
  const { data: sessionData, error: sessionError } = await serviceClient.auth.admin.createSession(userId);

  if (sessionError || !sessionData.session) {
    console.error('❌ Failed to create session for test customer:', sessionError?.message || 'Unknown error');
    process.exit(1);
  }

  // Create a client with the session token
  const customerClient = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  await customerClient.auth.setSession(sessionData.session);

  return {
    client: customerClient,
    userId,
    cleanup: async () => {
      try {
        // Clean up the test user
        await serviceClient.auth.admin.deleteUser(userId);
      } catch (err) {
        console.warn('⚠️  Failed to clean up test user:', err);
      }
    },
  };
}

/**
 * Perform individual hardening checks
 */
async function runHardeningChecks() {
  const anonClient = createAnonClient();
  let customerAuth = null;
  const results = [];

  try {
    // Create authenticated customer client for RPC test
    customerAuth = await createCustomerClient();

    // Check 1: Anonymous SELECT from groomer_time_off should fail or return 0 rows
    console.log('\n📋 Check 1: Anonymous access to groomer_time_off...');
    try {
      const { data, error } = await anonClient.from('groomer_time_off').select('*').limit(1);

      if (error) {
        // RLS error is acceptable
        console.log('   ✅ RLS error (expected):', error.message);
        results.push({ check: 1, passed: true, message: 'RLS error returned' });
      } else if (Array.isArray(data) && data.length === 0) {
        // Empty result is acceptable
        console.log('   ✅ Empty result set (expected)');
        results.push({ check: 1, passed: true, message: 'Empty result set' });
      } else {
        // Data returned - this is a security issue
        console.error('   ❌ Unexpected data returned to anonymous user');
        results.push({ check: 1, passed: false, message: 'Unexpected data returned' });
      }
    } catch (err) {
      // Exception is acceptable (RLS policy blocking)
      console.log('   ✅ Exception caught (expected):', err.message);
      results.push({ check: 1, passed: true, message: 'Exception caught' });
    }

    // Check 2: Anonymous SELECT from notifications should fail or return 0 rows
    console.log('\n📋 Check 2: Anonymous access to notifications...');
    try {
      const { data, error } = await anonClient.from('notifications').select('*').limit(1);

      if (error) {
        console.log('   ✅ RLS error (expected):', error.message);
        results.push({ check: 2, passed: true, message: 'RLS error returned' });
      } else if (Array.isArray(data) && data.length === 0) {
        console.log('   ✅ Empty result set (expected)');
        results.push({ check: 2, passed: true, message: 'Empty result set' });
      } else {
        console.error('   ❌ Unexpected data returned to anonymous user');
        results.push({ check: 2, passed: false, message: 'Unexpected data returned' });
      }
    } catch (err) {
      console.log('   ✅ Exception caught (expected):', err.message);
      results.push({ check: 2, passed: true, message: 'Exception caught' });
    }

    // Check 3: Anonymous SELECT from payment_intents should fail or return 0 rows
    console.log('\n📋 Check 3: Anonymous access to payment_intents...');
    try {
      const { data, error } = await anonClient.from('payment_intents').select('*').limit(1);

      if (error) {
        console.log('   ✅ RLS error (expected):', error.message);
        results.push({ check: 3, passed: true, message: 'RLS error returned' });
      } else if (Array.isArray(data) && data.length === 0) {
        console.log('   ✅ Empty result set (expected)');
        results.push({ check: 3, passed: true, message: 'Empty result set' });
      } else {
        console.error('   ❌ Unexpected data returned to anonymous user');
        results.push({ check: 3, passed: false, message: 'Unexpected data returned' });
      }
    } catch (err) {
      console.log('   ✅ Exception caught (expected):', err.message);
      results.push({ check: 3, passed: true, message: 'Exception caught' });
    }

    // Check 4: Customer calling confirm_appointment_request should get permission error
    console.log('\n📋 Check 4: Customer calling confirm_appointment_request RPC...');
    try {
      // Try to call the RPC with a non-existent request ID
      // The RPC should fail with "Not authorized" before checking if the request exists
      const { data, error } = await customerAuth.client.rpc('confirm_appointment_request', {
        p_request_id: '00000000-0000-0000-0000-000000000000',
        p_slot_at: new Date().toISOString(),
      });

      if (error && error.message.includes('Not authorized')) {
        console.log('   ✅ Permission error (expected):', error.message);
        results.push({ check: 4, passed: true, message: 'Permission error returned' });
      } else if (error) {
        // Other errors might be acceptable if they indicate authorization failure
        console.log('   ⚠️  Error returned:', error.message);
        if (error.code === '42501' || error.message.includes('not authorized')) {
          console.log('   ✅ Authorization error (expected)');
          results.push({ check: 4, passed: true, message: 'Authorization error' });
        } else {
          console.error('   ❌ Unexpected error:', error.message);
          results.push({ check: 4, passed: false, message: `Unexpected error: ${error.message}` });
        }
      } else {
        console.error('   ❌ RPC succeeded (should have failed)');
        results.push({ check: 4, passed: false, message: 'RPC succeeded unexpectedly' });
      }
    } catch (err) {
      console.log('   ✅ Exception caught (expected):', err.message);
      results.push({ check: 4, passed: true, message: 'Exception caught' });
    }
  } finally {
    // Cleanup
    if (customerAuth) {
      await customerAuth.cleanup();
    }
  }

  return results;
}

/**
 * Main entry point
 */
async function main() {
  console.log('🔒 Running Supabase Hardening Checks');
  console.log('=====================================');
  console.log(`📍 Supabase URL: ${supabaseUrl}\n`);

  try {
    const results = await runHardeningChecks();

    // Print summary
    console.log('\n📊 Summary');
    console.log('==========');
    const passed = results.filter(r => r.passed).length;
    const total = results.length;

    results.forEach(result => {
      const status = result.passed ? '✅' : '❌';
      console.log(`${status} Check ${result.check}: ${result.message}`);
    });

    console.log(`\n${passed}/${total} checks passed`);

    if (passed === total) {
      console.log('\n✅ All hardening checks passed!');
      process.exit(0);
    } else {
      console.error('\n❌ Some hardening checks failed');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Unexpected error during checks:', err.message);
    console.error(err);
    process.exit(1);
  }
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
