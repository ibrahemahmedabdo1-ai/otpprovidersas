# support-web
Staff console (English only in this version). Staff sign-in always requires two-step verification (authenticator app + recovery codes).

`pnpm -C apps/support-web dev` then open the port in package.json. Env: `API_BASE_URL` (default http://localhost:3001). Create the first staff user with `pnpm create-staff` (type the password in the terminal, never in chat).

Honest status: verified by CI typecheck and build only; not yet exercised in a browser.
