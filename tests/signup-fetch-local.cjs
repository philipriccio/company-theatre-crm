const originalFetch=globalThis.fetch;
globalThis.fetch=(input,init)=>originalFetch(String(input)==='https://crm.companytheatre.ca/api/website-signups'?`http://127.0.0.1:${process.env.CRM_PROOF_PORT}/api/website-signups`:input,init);
