import { app } from '@azure/functions';

// Public pages required by the Google OAuth consent screen (home page + privacy policy).
const CONTACT = 'abhinavktr@gmail.com';
const UPDATED = '26 November 2026';

const page = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
 body{font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;color:#111827;background:#F6F7F9}
 main{max-width:720px;margin:0 auto;padding:40px 20px}
 h1{color:#0F766E;margin:0 0 4px} h2{margin-top:28px;font-size:19px} .tag{color:#0F766E;font-weight:600;margin:0 0 24px}
 a{color:#0F766E} footer{margin-top:40px;color:#6B7280;font-size:14px}
</style></head><body><main>${body}
<footer><a href="/api/home">Home</a> · <a href="/api/privacy">Privacy policy</a> · Contact: <a href="mailto:${CONTACT}">${CONTACT}</a></footer>
</main></body></html>`;

const html = (body: string) => ({ status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body });

app.http('site-home', {
  methods: ['GET'],
  route: 'home',
  authLevel: 'anonymous',
  handler: async () => html(page('Splitzy — split evenly, always free', `
<h1>Splitzy</h1><p class="tag">Split evenly. Always free.</p>
<p>Splitzy is a free app for sharing expenses with friends, flatmates and travel groups. Add an expense, choose how to split it
(equally, by exact amounts, by percentages or by shares) and Splitzy keeps a running balance of who owes whom.</p>
<ul><li>Groups with per-member balances and simplified settle-up suggestions</li>
<li>Friend balances across all shared expenses, in multiple currencies</li>
<li>No ads, no premium tier, no limits on expenses</li></ul>
<p>Splitzy is currently in testing on Android.</p>`)),
});

app.http('site-privacy', {
  methods: ['GET'],
  route: 'privacy',
  authLevel: 'anonymous',
  handler: async () => html(page('Splitzy — Privacy policy', `
<h1>Privacy policy</h1><p class="tag">Last updated ${UPDATED}</p>
<h2>What we collect</h2>
<p>When you sign in (with email and password or with Google) we receive your <b>name</b> and <b>email address</b>.
We store the expenses, groups, payments and friend connections you or the people you share with create in Splitzy.
If someone adds you by email before you join, your email address and the name they entered are stored so you can see shared expenses when you sign up.</p>
<h2>How we use it</h2>
<p>Only to run Splitzy: to show you your groups, expenses and balances, and to let the people you share expenses with see your name and email.
We do not sell your data, show ads, or use your data for marketing or profiling.</p>
<h2>Google sign-in</h2>
<p>If you sign in with Google we request only your basic profile (name) and email address, which are used solely to create and identify your Splitzy account.
Splitzy's use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.</p>
<h2>Where it is stored</h2>
<p>Sign-in is handled by Microsoft Entra External ID. App data is stored in Microsoft Azure (Cosmos DB) and transmitted over HTTPS.</p>
<h2>Sharing</h2>
<p>Your name, email and the expenses you take part in are visible to the other members of your groups and the friends you share expenses with.
We use Microsoft Azure as our hosting provider; we share data with no other third parties except where required by law.</p>
<h2>Retention and deletion</h2>
<p>Data is kept while your account is active. To delete your account and data, email <a href="mailto:${CONTACT}">${CONTACT}</a>; we will delete it within 30 days.
Expenses you shared with others are anonymised rather than removed, so their balances stay correct.</p>
<h2>Contact</h2><p>Questions about this policy: <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>`)),
});
