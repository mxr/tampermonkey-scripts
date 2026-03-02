# tampermonkey-scripts

Personal Tampermonkey scripts for daily browser automation.

## Scripts

- `scripts/etrade-login-security-code.user.js`: Automatically enables "Use security code" on the E*TRADE login experience.

## Usage

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open a script in this repo.
3. Create a new Tampermonkey script and paste the file content.
4. Save and visit the matching page.

## Install In Firefox

1. In Firefox, install the Tampermonkey add-on: <https://addons.mozilla.org/firefox/addon/tampermonkey/>.
2. Open the Tampermonkey dashboard (`Extensions` -> `Tampermonkey` -> `Dashboard`).
3. Click `+` to create a new script.
4. Replace the template with the contents of [`scripts/etrade-login-security-code.user.js`](./scripts/etrade-login-security-code.user.js).
5. Press `Ctrl+S` (or `File` -> `Save`).
6. Confirm the script is enabled in the dashboard.
7. Visit:
   - `https://us.etrade.com/home/welcome-back`
   - `https://us.etrade.com/etx/pxy/login`
8. Open Tampermonkey `Dashboard` -> script `Last error`/`Logs` if you want to verify it ran.
