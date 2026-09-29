// Fetches a fresh sign-in code for an e2e+ address from the staging-only
// test-inbox function (P14-E2E-00). Sets output.code.
const res = http.post(`${FUNCTIONS_URL}/test-inbox`, {
  headers: { 'content-type': 'application/json', 'x-e2e-secret': E2E_SECRET },
  body: JSON.stringify({ email: EMAIL }),
});
if (res.status !== 200) throw new Error(`test-inbox ${res.status}: ${res.body}`);
output.code = json(res.body).code;
