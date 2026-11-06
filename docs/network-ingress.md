# Finance published-port boundary (proposed, not deployed)

Sovereign Finance runs on a different host from the public reverse proxy. The reverse proxy connects to Finance over IPv4.

## Why change the Compose binding?

The former short port mapping (`5155:5055`) published the application on all host IPv4 **and** IPv6 addresses. Core Auth protects application endpoints, but it is not a replacement for restricting the hosts that can reach the port.

The new mapping requires `FINANCE_BIND_IPV4` in the runtime host's untracked `.env` file and publishes the specific IPv4 address on port 5155 to the container's port 5055. The address must be the host's assigned IPv4 address that the reverse proxy can reach. **Do not use `127.0.0.1`**, which would break remote reverse-proxy requests. **Do not use `0.0.0.0`**, which would retain IPv4 wildcard exposure. Do not commit private environment values.

**Important:** Binding to the correct host IPv4 address does **not** block other LAN machines from connecting to that address. A separate **source-restricting host firewall policy** for the reverse-proxy host is required. That policy belongs to Beelink host infrastructure, not to Finance or the read-only Sovereign Sentinel agent. This PR does not complete the ingress-isolation requirement.

## Deployment preflight (approval required)

1. Confirm the live Compose file corresponds to the reviewed Git branch. Account for any production-only differences before copying files.
2. Establish an independent administrative recovery path. Prepare a timed, automatic rollback **before** changing production bindings or firewall rules.
3. Back up the live Compose configuration and untracked deployment settings outside Git. Add `FINANCE_BIND_IPV4` to the live untracked `.env`, using the **verified** assigned IPv4 of the host interface reachable from the reverse proxy.
4. Confirm the value is an actual IPv4 interface address and is neither loopback nor wildcard. Run `docker compose config --quiet`, without printing secrets or a rendered Compose configuration to logs.
5. In a separately approved deployment window, apply the reviewed Compose configuration using the documented Finance deployment flow. A changed port mapping **can recreate the container**; confirm rollback readiness before proceeding.

## Verification after deployment

- `docker port sovereign-finance 5055/tcp` shows only **one specific IPv4 host address**, not `0.0.0.0` or `::`. Check listening sockets as well.
- From the reverse-proxy host, the upstream Finance `/api/health` returns HTTP 200; public HTTPS routing and the normal browser login still work.
- Without credentials, `/api/whoami` and `/api/finance` return HTTP 401.
- From an unauthorized LAN device, direct IPv4 and IPv6 access is denied **only when the separate host-firewall policy has also been deployed and tested**.
- Other Beelink Docker services and the Nextcloud/OnlyOffice integration remain healthy.
- Recheck the rules after controlled container recreation, Docker restart and host restart.

## Rollback

If authorized reverse-proxy traffic or authentication fails, restore the previous live Compose file and deployment configuration from the pre-change snapshot, then use the documented deployment procedure to re-create the known-good service. If a host-firewall change was bundled in the same approved window, its own **independent timed rollback** must restore the prior chain state. Verify container health, public routing, session behavior and effective firewall rules.

Never flush unrelated Docker or UFW chains, delete runtime data or assume a Git checkout alone rolls back the running service.

## Evidence and limits

A temporary Docker `DOCKER-USER` IPv4 restriction was successfully tested from an unauthorized LAN client while permitting the reverse proxy, followed by independently verified automatic rollback. Separately, Beelink's interface had private IPv6 ULA addresses and wildcard IPv6 listeners; direct IPv6 connections from one Wi-Fi client timed out. That timeout does **not** prove an IPv6 firewall policy is effective. No permanent restriction was installed by these tests.

This PR changes only the desired configuration in Git. It is **not deployed, not CI-verified, and not production-verified**.
