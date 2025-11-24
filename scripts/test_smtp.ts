import { createClient } from '@supabase/supabase-js';

// Hardcoded keys for testing script
const SUPABASE_URL = 'https://xasuqqebngantzaenmwq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhc3VxcWVibmdhbnR6YWVubXdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1MzIzOTcsImV4cCI6MjA3ODEwODM5N30.muZXEGe5m6apaaVu6xK8tL-PpM8c0SHuZL3XzoxQf3Q';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testSmtp() {
    console.log('Testing SMTP by sending password reset to htn.git@gmail.com...');
    console.log('Note: If SMTP Port is incorrect (e.g. 586 instead of 587), this might fail or timeout silently on the client side, but show error in Supabase logs.');

    const { data, error } = await supabase.auth.resetPasswordForEmail('htn.git@gmail.com', {
        redirectTo: 'http://localhost:3000/update-password',
    });

    if (error) {
        console.error('❌ Error sending email request:', error.message);
        console.error('Details:', error);
    } else {
        console.log('✅ Email request sent to Supabase API successfully.');
        console.log('👉 Please check your inbox (and spam folder) for "htn.git@gmail.com".');
        console.log('👉 If not received, I will check the Supabase internal logs for SMTP errors.');
    }
}

testSmtp();
