// Test-only public config so modules that validate env at import time load.
process.env.EXPO_PUBLIC_APP_ENV = 'local';
process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'sb_publishable_test_only_not_a_real_key';
process.env.EXPO_PUBLIC_MEDIA_URL = 'http://127.0.0.1:8787';
process.env.EXPO_PUBLIC_SITE_URL = 'https://onlyswap.pages.dev';
